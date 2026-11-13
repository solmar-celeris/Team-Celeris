-- Team Celeris: exclusão permanente de conteúdo do Chat para todos e revogação de vínculo.
-- Depende de 20261110100000_member_removed_enum.sql e das migrations de Chat anteriores.
-- A interface chama a Edge Function delete-chat-content; RPCs de deleção ficam acessíveis
-- somente ao role service_role e revalidam o ator no banco. RLS continua habilitado.
begin;

-- A remoção do grupo é global: suas mensagens/recibos e participantes também são removidos.
do $fk$
declare
  v_constraint record;
begin
  for v_constraint in
    select conname
      from pg_catalog.pg_constraint
     where conrelid = 'public.team_chat_messages'::regclass
       and confrelid = 'public.team_chat_groups'::regclass
       and contype = 'f'
  loop
    execute pg_catalog.format('alter table public.team_chat_messages drop constraint %I', v_constraint.conname);
  end loop;
end
$fk$;
alter table public.team_chat_messages
  add constraint team_chat_messages_group_id_fkey
  foreign key (group_id) references public.team_chat_groups(id) on delete cascade;

create table if not exists public.team_chat_storage_cleanup_queue (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  request_id uuid not null,
  requested_by uuid not null,
  bucket_id text not null check (bucket_id in ('team-chat-audio', 'team-chat-attachments', 'team-chat-group-photos')),
  object_path text not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint team_chat_storage_cleanup_path_shape check (
    (bucket_id = 'team-chat-audio' and object_path ~ '^[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}[.](mp3|webm|mp4|ogg|m4a|aac|wav)$')
    or (bucket_id = 'team-chat-attachments' and object_path ~ '^[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}[.](jpg|jpeg|png|gif|webp|heic|heif|pdf|txt|csv|doc|docx|xls|xlsx|ppt|pptx|mp3|m4a|mp4|wav|aac|ogg|webm)$')
    or (bucket_id = 'team-chat-group-photos' and object_path ~ '^[0-9a-fA-F-]{36}/[A-Za-z0-9-]+[.](jpg|png|webp)$')
  ),
  constraint team_chat_storage_cleanup_request_path_unique unique (request_id, bucket_id, object_path)
);
create index if not exists team_chat_storage_cleanup_actor_created_idx
  on public.team_chat_storage_cleanup_queue (requested_by, created_at);
alter table public.team_chat_storage_cleanup_queue enable row level security;
revoke all on public.team_chat_storage_cleanup_queue from public, anon, authenticated;
grant select, delete on public.team_chat_storage_cleanup_queue to service_role;

create or replace function public.chat_delete_message_for_all(p_actor_id uuid, p_message_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_id uuid := pg_catalog.gen_random_uuid();
  v_active boolean;
  v_group_id uuid;
  v_direct_id uuid;
  v_audio_path text;
  v_attachment_path text;
begin
  if p_actor_id is null or p_message_id is null then
    raise exception 'Dados de exclusão inválidos.' using errcode = '22023';
  end if;
  select p.status = 'active' into v_active
    from public.profiles p where p.user_id = p_actor_id;
  if not coalesce(v_active, false) then
    raise exception 'Somente integrantes ativos podem apagar conteúdo do Chat.' using errcode = '42501';
  end if;
  select m.group_id, m.dm_conversation_id, m.audio_path, m.attachment_path
    into v_group_id, v_direct_id, v_audio_path, v_attachment_path
    from public.team_chat_messages m
   where m.id = p_message_id
   for update;
  if not found then
    raise exception 'Mensagem não encontrada.' using errcode = 'P0002';
  end if;
  if v_group_id is not null and not exists (
    select 1 from public.team_chat_group_members gm
     where gm.group_id = v_group_id and gm.user_id = p_actor_id
  ) then
    raise exception 'Somente participantes do grupo podem apagar esta mensagem.' using errcode = '42501';
  end if;
  if v_direct_id is not null and not exists (
    select 1 from public.team_chat_direct_conversations c
     where c.id = v_direct_id and p_actor_id in (c.user_a_id, c.user_b_id)
  ) then
    raise exception 'Somente participantes da conversa privada podem apagar esta mensagem.' using errcode = '42501';
  end if;

  insert into public.team_chat_storage_cleanup_queue (request_id, requested_by, bucket_id, object_path)
  select v_request_id, p_actor_id, f.bucket_id, f.object_path
    from (values
      ('team-chat-audio'::text, v_audio_path),
      ('team-chat-attachments'::text, v_attachment_path)
    ) as f(bucket_id, object_path)
   where f.object_path is not null
     and not exists (
       select 1 from public.team_chat_messages other_message
        where other_message.id <> p_message_id
          and ((f.bucket_id = 'team-chat-audio' and other_message.audio_path = f.object_path)
            or (f.bucket_id = 'team-chat-attachments' and other_message.attachment_path = f.object_path))
     )
  on conflict (request_id, bucket_id, object_path) do nothing;

  insert into public.audit_log(entity, entity_id, action, actor_id, changed_fields)
  values ('team_chat_messages', p_message_id, 'remove', p_actor_id,
    pg_catalog.jsonb_build_object('scope', 'all_participants', 'storage_cleanup_request', v_request_id));

  delete from public.team_chat_messages where id = p_message_id;
  return v_request_id;
end;
$$;
revoke all on function public.chat_delete_message_for_all(uuid, uuid) from public, anon, authenticated;
grant execute on function public.chat_delete_message_for_all(uuid, uuid) to service_role;
-- Desativa o soft-delete antigo de Administrador; a Edge Function autenticada é o único caminho de remoção.
revoke all on function public.admin_remove_team_chat_message(uuid) from public, anon, authenticated;

create or replace function public.chat_delete_conversation_for_all(p_actor_id uuid, p_kind text, p_conversation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_id uuid := pg_catalog.gen_random_uuid();
  v_active boolean;
  v_avatar_path text;
begin
  if p_actor_id is null or p_conversation_id is null or p_kind is null or p_kind not in ('group', 'direct') then
    raise exception 'Dados de exclusão de conversa inválidos.' using errcode = '22023';
  end if;
  select p.status = 'active' into v_active
    from public.profiles p where p.user_id = p_actor_id;
  if not coalesce(v_active, false) then
    raise exception 'Somente integrantes ativos podem apagar conversas.' using errcode = '42501';
  end if;

  if p_kind = 'group' then
    select g.avatar_path into v_avatar_path
      from public.team_chat_groups g where g.id = p_conversation_id for update;
    if not found then
      raise exception 'Grupo não encontrado.' using errcode = 'P0002';
    end if;
    if not exists (
      select 1 from public.team_chat_group_members gm
       where gm.group_id = p_conversation_id and gm.user_id = p_actor_id
    ) then
      raise exception 'Somente participantes do grupo podem apagá-lo.' using errcode = '42501';
    end if;
    insert into public.team_chat_storage_cleanup_queue (request_id, requested_by, bucket_id, object_path)
    select v_request_id, p_actor_id, f.bucket_id, f.object_path
      from (
        select 'team-chat-audio'::text as bucket_id, m.audio_path as object_path
          from public.team_chat_messages m where m.group_id = p_conversation_id and m.audio_path is not null
            and not exists (select 1 from public.team_chat_messages other_message where other_message.audio_path = m.audio_path and other_message.group_id is distinct from p_conversation_id)
        union all
        select 'team-chat-attachments'::text, m.attachment_path
          from public.team_chat_messages m where m.group_id = p_conversation_id and m.attachment_path is not null
            and not exists (select 1 from public.team_chat_messages other_message where other_message.attachment_path = m.attachment_path and other_message.group_id is distinct from p_conversation_id)
        union all
        select 'team-chat-group-photos'::text, v_avatar_path where v_avatar_path is not null
      ) as f
    on conflict (request_id, bucket_id, object_path) do nothing;
    insert into public.audit_log(entity, entity_id, action, actor_id, changed_fields)
    values ('team_chat_groups', p_conversation_id, 'remove', p_actor_id,
      pg_catalog.jsonb_build_object('scope', 'all_participants', 'storage_cleanup_request', v_request_id));
    delete from public.team_chat_groups where id = p_conversation_id;
  else
    perform 1 from public.team_chat_direct_conversations c
     where c.id = p_conversation_id
       and p_actor_id in (c.user_a_id, c.user_b_id)
     for update;
    if not found then
      if exists (select 1 from public.team_chat_direct_conversations c where c.id = p_conversation_id) then
        raise exception 'Somente participantes podem apagar esta conversa privada.' using errcode = '42501';
      end if;
      raise exception 'Conversa privada não encontrada.' using errcode = 'P0002';
    end if;
    insert into public.team_chat_storage_cleanup_queue (request_id, requested_by, bucket_id, object_path)
    select v_request_id, p_actor_id, f.bucket_id, f.object_path
      from (
        select 'team-chat-audio'::text as bucket_id, m.audio_path as object_path
          from public.team_chat_messages m where m.dm_conversation_id = p_conversation_id and m.audio_path is not null
            and not exists (select 1 from public.team_chat_messages other_message where other_message.audio_path = m.audio_path and other_message.dm_conversation_id is distinct from p_conversation_id)
        union all
        select 'team-chat-attachments'::text, m.attachment_path
          from public.team_chat_messages m where m.dm_conversation_id = p_conversation_id and m.attachment_path is not null
            and not exists (select 1 from public.team_chat_messages other_message where other_message.attachment_path = m.attachment_path and other_message.dm_conversation_id is distinct from p_conversation_id)
      ) as f
    on conflict (request_id, bucket_id, object_path) do nothing;
    insert into public.audit_log(entity, entity_id, action, actor_id, changed_fields)
    values ('team_chat_direct_conversations', p_conversation_id, 'remove', p_actor_id,
      pg_catalog.jsonb_build_object('scope', 'all_participants', 'storage_cleanup_request', v_request_id));
    delete from public.team_chat_direct_conversations where id = p_conversation_id;
  end if;
  return v_request_id;
end;
$$;
revoke all on function public.chat_delete_conversation_for_all(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.chat_delete_conversation_for_all(uuid, text, uuid) to service_role;

-- Vínculo removido é terminal. A conta Auth e o histórico permanecem preservados.
drop policy if exists profiles_read_directory on public.profiles;
create policy profiles_read_directory on public.profiles for select to authenticated
  using (user_id = (select auth.uid()) or (public.is_active_member() and status <> 'removed'));

create or replace function public.admin_suspend_team_member(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_status public.member_status;
  v_role public.app_role;
  v_admin_count integer;
begin
  if v_actor is null or p_user_id is null or p_user_id = v_actor then
    raise exception 'Não é possível suspender o próprio perfil.' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(7319041001::bigint);
  if not public.is_active_member() or not public.is_team_admin() then
    raise exception 'Somente administradores ativos podem gerenciar membros.' using errcode = '42501';
  end if;
  select p.role, p.status into v_role, v_status from public.profiles p where p.user_id = p_user_id for update;
  if not found then raise exception 'Perfil não encontrado.' using errcode = 'P0002'; end if;
  if v_status = 'removed' then
    raise exception 'O vínculo removido é terminal e não pode ser alterado.' using errcode = '22023';
  end if;
  if v_status = 'suspended' then return; end if;
  if v_role = 'admin' and v_status = 'active' then
    select pg_catalog.count(*)::integer into v_admin_count from public.profiles p where p.role = 'admin' and p.status = 'active';
    if v_admin_count <= 1 then raise exception 'A equipe precisa manter pelo menos um administrador ativo.' using errcode = '23514'; end if;
  end if;
  update public.profiles set status = 'suspended' where user_id = p_user_id;
  insert into public.audit_log(entity, entity_id, action, actor_id, changed_fields)
  values ('profiles', p_user_id, 'remove', v_actor,
    pg_catalog.jsonb_build_object('status', pg_catalog.jsonb_build_object('before', v_status::text, 'after', 'suspended')));
end;
$$;
-- A interface e o cliente deixam de oferecer suspensão; mantenha a função histórica sem execução por authenticated.
revoke all on function public.admin_suspend_team_member(uuid) from public, anon, authenticated;

create or replace function public.admin_remove_team_member(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_status public.member_status;
  v_role public.app_role;
  v_admin_count integer;
begin
  if v_actor is null or p_user_id is null or p_user_id = v_actor then
    raise exception 'Não é possível remover o próprio perfil.' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(7319041001::bigint);
  if not public.is_active_member() or not public.is_team_admin() then
    raise exception 'Somente administradores ativos podem gerenciar membros.' using errcode = '42501';
  end if;
  select p.role, p.status into v_role, v_status from public.profiles p where p.user_id = p_user_id for update;
  if not found then raise exception 'Perfil não encontrado.' using errcode = 'P0002'; end if;
  if v_status = 'removed' then return; end if;
  if v_role = 'admin' and v_status = 'active' then
    select pg_catalog.count(*)::integer into v_admin_count from public.profiles p where p.role = 'admin' and p.status = 'active';
    if v_admin_count <= 1 then raise exception 'A equipe precisa manter pelo menos um administrador ativo.' using errcode = '23514'; end if;
  end if;
  update public.profiles set status = 'removed' where user_id = p_user_id;
  insert into public.audit_log(entity, entity_id, action, actor_id, changed_fields)
  values ('profiles', p_user_id, 'remove', v_actor,
    pg_catalog.jsonb_build_object('status', pg_catalog.jsonb_build_object('before', v_status::text, 'after', 'removed')));
end;
$$;
revoke all on function public.admin_remove_team_member(uuid) from public, anon, authenticated;
grant execute on function public.admin_remove_team_member(uuid) to authenticated;

commit;
