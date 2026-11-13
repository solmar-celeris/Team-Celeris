-- Remove integralmente o setor de TI do workspace e os dados exclusivos associados.
begin;

do $$
declare
  v_area_id uuid;
  v_channel_id uuid;
begin
  select id into v_area_id
  from public.areas
  where slug = 'tecnologia-da-informacao'
  limit 1;

  select id into v_channel_id
  from public.workspace_channels
  where slug = 'ti'
  limit 1;

  -- Remove arquivos físicos vinculados exclusivamente ao canal de TI.
  if v_channel_id is not null then
    delete from storage.objects
    where bucket_id = 'workspace-channel-files'
      and name like v_channel_id::text || '/%';

    -- Remove canal, membros, manuais e metadados de arquivos em cascata.
    delete from public.workspace_channels where id = v_channel_id;
  end if;

  if v_area_id is not null then
    -- Remove atividades de TI e acompanhamentos/anexos dependentes em cascata.
    delete from public.activities where area_id = v_area_id;

    -- Remove pastas e comunicados restritos exclusivamente à antiga área.
    delete from public.drive_folders where area_id = v_area_id;
    delete from public.announcements where audience_area_id = v_area_id;

    -- Preserva contas de usuário, removendo somente o vínculo com o setor extinto.
    update public.profiles set area_id = null where area_id = v_area_id;

    -- Remove a área e seus contadores dependentes (ON DELETE CASCADE).
    delete from public.areas where id = v_area_id;
  end if;
end;
$$;

-- TI deixa de ser tratado como canal fixo protegido.
create or replace function public.guard_fixed_workspace_channels()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and old.slug in (
      'geral', 'mecanica-naval', 'eletrica', 'eletronica',
      'gestao-de-pessoas', 'marketing', 'administrativo-financeiro'
    ) then
    new.slug := old.slug;
    new.name := old.name;
    new.area_id := old.area_id;
  end if;

  if new.slug = 'geral' then
    new.is_open := true;
  end if;

  return new;
end;
$$;

drop policy if exists workspace_channels_admin_delete on public.workspace_channels;
create policy workspace_channels_admin_delete
on public.workspace_channels for delete to authenticated
using (
  public.is_team_admin()
  and slug not in (
    'geral', 'mecanica-naval', 'eletrica', 'eletronica',
    'gestao-de-pessoas', 'marketing', 'administrativo-financeiro'
  )
);

commit;
