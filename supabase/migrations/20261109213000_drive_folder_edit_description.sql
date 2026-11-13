-- Descrição e edição segura de pastas compartilhadas.
-- Compatível com as permissões existentes: não habilita UPDATE direto.

begin;

alter table public.drive_folders
  add column if not exists description text not null default '';

-- Normalize linhas antigas/instalações parcialmente atualizadas antes de fixar
-- default, NOT NULL e limite; dados atuais permanecem preservados.
update public.drive_folders
set description = ''
where description is null;

alter table public.drive_folders
  alter column description set default '',
  alter column description set not null;

alter table public.drive_folders
  drop constraint if exists drive_folders_description_length;
alter table public.drive_folders
  add constraint drive_folders_description_length
  check (char_length(description) <= 500);

-- A auditoria registra before/after dos metadados editáveis. URLs são sempre
-- substituídas por marcadores, pois parâmetros ou caminhos podem conter tokens.
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_changed jsonb := '{}'::jsonb;
  v_fields text[];
  v_field text;
  v_field_before jsonb;
  v_field_after jsonb;
  v_action text;
  v_entity_id uuid;
  v_actor uuid := auth.uid();
begin
  if tg_op = 'DELETE' then
    v_before := to_jsonb(old);
    v_after := '{}'::jsonb;
    v_entity_id := (v_before ->> 'id')::uuid;
    v_action := 'delete';
  else
    v_before := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
    v_after := to_jsonb(new);
    v_entity_id := (v_after ->> 'id')::uuid;
    v_action := case when tg_op = 'INSERT' then 'insert' else 'update' end;
    if (tg_table_name = 'activities' and v_before -> 'archived_at' = 'null'::jsonb and v_after -> 'archived_at' <> 'null'::jsonb)
       or (tg_table_name in ('drive_folders', 'announcements') and v_before -> 'removed_at' = 'null'::jsonb and v_after -> 'removed_at' <> 'null'::jsonb) then
      v_action := 'remove';
    end if;
  end if;

  v_fields := case tg_table_name
    when 'activities' then array['code','name','start_date','due_date','responsible_name','responsible_user_id','archived_at']
    when 'weekly_updates' then array['week_start','status']
    when 'drive_folders' then array['name','drive_url','description','area_id','is_primary','removed_at']
    when 'announcements' then array['title','audience_area_id','pinned_at','removed_at']
    else array[]::text[]
  end;

  foreach v_field in array v_fields loop
    if (v_before -> v_field) is distinct from (v_after -> v_field) then
      if tg_table_name = 'drive_folders' and v_field = 'drive_url' then
        v_field_before := case when v_before ? v_field then to_jsonb('[redacted]'::text) else 'null'::jsonb end;
        v_field_after := case when v_after ? v_field then to_jsonb('[redacted]'::text) else 'null'::jsonb end;
      else
        v_field_before := v_before -> v_field;
        v_field_after := v_after -> v_field;
      end if;
      v_changed := v_changed || jsonb_build_object(v_field,
        jsonb_build_object('before', v_field_before, 'after', v_field_after));
    end if;
  end loop;

  insert into public.audit_log(entity, entity_id, action, actor_id, changed_fields)
  values (tg_table_name, v_entity_id, v_action, v_actor, v_changed);

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.audit_row_change() from public, anon, authenticated;

-- Edição transacional: só integrante ativo; sem UPDATE geral concedido ao cliente.
create or replace function public.update_drive_folder(
  p_folder_id uuid,
  p_name text,
  p_drive_url text,
  p_area_id uuid,
  p_description text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_active_member() then
    raise exception 'Perfil ativo necessário.' using errcode = '42501';
  end if;

  if p_name is null or char_length(btrim(p_name)) = 0 then
    raise exception 'Informe o nome da pasta.' using errcode = '22023';
  end if;
  if p_description is not null and char_length(p_description) > 500 then
    raise exception 'A descrição deve ter no máximo 500 caracteres.' using errcode = '22023';
  end if;
  if p_drive_url is null
     or p_drive_url !~ '^https://drive[.]google[.]com/'
     or p_drive_url ~ '^https://[^/]*@'
     or p_drive_url ~ '^https://drive[.]google[.]com:[^/]+/'
     or p_drive_url ~ '[[:space:][:cntrl:]]' then
    raise exception 'Use uma URL HTTPS válida de drive.google.com, sem usuário, senha ou porta personalizada.' using errcode = '22023';
  end if;

  perform 1
  from public.drive_folders
  where id = p_folder_id and removed_at is null
  for update;
  if not found then
    raise exception 'A pasta não existe ou já foi removida.' using errcode = 'P0002';
  end if;

  update public.drive_folders
  set name = btrim(p_name),
      drive_url = p_drive_url,
      area_id = p_area_id,
      description = coalesce(p_description, '')
  where id = p_folder_id and removed_at is null;
end;
$$;
revoke all on function public.update_drive_folder(uuid, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.update_drive_folder(uuid, text, text, uuid, text) to authenticated;

-- Defense in depth: leave direct UPDATE unavailable to client roles.
revoke update on table public.drive_folders from anon, authenticated;

commit;
