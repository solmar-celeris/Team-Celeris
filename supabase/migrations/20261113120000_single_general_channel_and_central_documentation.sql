-- Team Celeris: volta ao canal único Geral e centraliza a documentação.
-- Os metadados e arquivos associados aos canais antigos são preservados no canal Geral
-- ou em arquivo histórico; nenhum arquivo do Storage é removido por esta migration.
begin;

create table if not exists public.workspace_manual_archive (
  id uuid primary key default gen_random_uuid(),
  source_channel_name text not null,
  manual_kind text not null check (manual_kind in ('conduct', 'function')),
  title text not null,
  content text not null default '',
  original_file_path text,
  original_file_name text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  archived_at timestamptz not null default now()
);
alter table public.workspace_manual_archive enable row level security;
revoke all on public.workspace_manual_archive from public, anon, authenticated;
grant select on public.workspace_manual_archive to authenticated;
drop policy if exists workspace_manual_archive_read on public.workspace_manual_archive;
create policy workspace_manual_archive_read on public.workspace_manual_archive
  for select to authenticated using (public.is_active_member());

do $$
declare
  v_general_id uuid;
begin
  select id into v_general_id
  from public.workspace_channels
  where slug = 'geral'
  limit 1;

  if v_general_id is null then
    insert into public.workspace_channels (slug, name, icon, is_open, area_id)
    values ('geral', 'Geral', 'globe', true, null)
    returning id into v_general_id;
  end if;

  -- Arquiva os manuais dos canais antigos antes de consolidá-los.
  insert into public.workspace_manual_archive (
    source_channel_name, manual_kind, title, content, original_file_path,
    original_file_name, updated_by, updated_at
  )
  select c.name, m.manual_kind, m.title, m.content, m.original_file_path,
         m.original_file_name, m.updated_by, m.updated_at
  from public.workspace_manuals m
  join public.workspace_channels c on c.id = m.channel_id
  where m.channel_id <> v_general_id
    and not exists (
      select 1 from public.workspace_manual_archive a
      where a.source_channel_name = c.name
        and a.manual_kind = m.manual_kind
        and a.title = m.title
        and a.updated_at = m.updated_at
    );

  -- Consolida o texto de todos os manuais antigos em um registro por tipo no canal Geral.
  insert into public.workspace_manuals (
    channel_id, manual_kind, title, content, original_file_path,
    original_file_name, updated_by, updated_at
  )
  select
    v_general_id,
    m.manual_kind,
    case when m.manual_kind = 'conduct' then 'Normas de Conduta' else 'Manuais de Funções' end,
    string_agg(
      case when nullif(trim(m.content), '') is not null
        then E'## ' || coalesce(nullif(trim(m.title), ''), 'Documento') || E'\n\n' || m.content
        else E'## ' || coalesce(nullif(trim(m.title), ''), 'Documento')
      end,
      E'\n\n---\n\n' order by m.updated_at
    ),
    (array_agg(m.original_file_path order by m.updated_at desc) filter (where m.original_file_path is not null))[1],
    (array_agg(m.original_file_name order by m.updated_at desc) filter (where m.original_file_name is not null))[1],
    (array_agg(m.updated_by order by m.updated_at desc) filter (where m.updated_by is not null))[1],
    now()
  from public.workspace_manuals m
  where m.channel_id <> v_general_id
  group by m.manual_kind
  on conflict (channel_id, manual_kind) do update
    set content = case
          when nullif(trim(public.workspace_manuals.content), '') is null then excluded.content
          when nullif(trim(excluded.content), '') is null then public.workspace_manuals.content
          else public.workspace_manuals.content || E'\n\n---\n\n' || excluded.content
        end,
        original_file_path = coalesce(public.workspace_manuals.original_file_path, excluded.original_file_path),
        original_file_name = coalesce(public.workspace_manuals.original_file_name, excluded.original_file_name),
        title = excluded.title,
        updated_at = now();

  -- Pastas e comunicados de todas as antigas áreas passam a compor o espaço único.
  -- Mantém somente uma pasta principal global para respeitar o índice de unicidade.
  update public.drive_folders
     set is_primary = false
   where is_primary
     and removed_at is null
     and id <> (
       select id from public.drive_folders
       where is_primary and removed_at is null
       order by created_at asc, id asc
       limit 1
     );
  update public.drive_folders set area_id = null where area_id is not null;
  update public.announcements set audience_area_id = null where audience_area_id is not null;

  -- Preserva todos os arquivos/atalhos no canal único. Os caminhos existentes no Storage
  -- permanecem válidos porque a política de leitura consulta o registro do arquivo.
  update public.workspace_channel_files
     set channel_id = v_general_id
   where channel_id <> v_general_id;

  -- Não há mais associação de membros por canal: todos os membros ativos usam o Geral.
  delete from public.workspace_channel_members where channel_id <> v_general_id;

  -- Remove os canais secundários após migrar seus conteúdos.
  delete from public.workspace_channels where id <> v_general_id;

  update public.workspace_channels
     set name = 'Geral', icon = 'globe', is_open = true, area_id = null
   where id = v_general_id;
end;
$$;

-- Bloqueia a criação futura de novos canais mesmo por chamadas diretas à API.
create or replace function public.guard_fixed_workspace_channels()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.slug <> 'geral' then
    raise exception 'O Team Celeris utiliza somente o canal Geral.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    if old.slug = 'geral' then
      new.slug := 'geral';
      new.name := 'Geral';
      new.icon := 'globe';
      new.is_open := true;
      new.area_id := null;
    else
      raise exception 'Canais adicionais não são permitidos no Team Celeris.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_fixed_workspace_channels() from public, anon, authenticated;

drop policy if exists workspace_channels_admin_insert on public.workspace_channels;
drop policy if exists workspace_channels_admin_update on public.workspace_channels;
drop policy if exists workspace_channels_admin_delete on public.workspace_channels;
revoke insert, update, delete on public.workspace_channels from authenticated;
grant select on public.workspace_channels to authenticated;

-- Desativa o gerenciamento de vínculos por canal.
drop policy if exists workspace_channel_members_read on public.workspace_channel_members;
drop policy if exists workspace_channel_members_admin_manage on public.workspace_channel_members;
revoke all on public.workspace_channel_members from public, anon, authenticated;

-- Arquivos originais de manuais arquivados continuam baixáveis pelos membros ativos.
drop policy if exists workspace_manuals_storage_read on storage.objects;
create policy workspace_manuals_storage_read on storage.objects
for select to authenticated
using (
  bucket_id = 'workspace-manuals'
  and (
    exists (
      select 1 from public.workspace_manuals m
      where m.original_file_path = storage.objects.name
        and public.can_access_workspace_channel(m.channel_id)
    )
    or exists (
      select 1 from public.workspace_manual_archive a
      where a.original_file_path = storage.objects.name
        and public.is_active_member()
    )
  )
);

commit;
