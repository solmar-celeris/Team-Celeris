-- Team Celeris: canal de TI, privacidade editável e arquivos/atalhos por canal.
-- Migration incremental: não remove nem reescreve registros existentes.
begin;

-- O canal de TI utiliza a área que já existe no cadastro organizacional.
do $$ begin
  if not exists (select 1 from public.areas where slug = 'tecnologia-da-informacao') then
    raise exception 'A área Tecnologia da Informação não existe em public.areas.';
  end if;
end $$;

insert into public.workspace_channels (slug, name, icon, is_open, area_id)
select 'ti', 'Tecnologia da Informação (TI)', 'laptop', true, a.id
from public.areas a
where a.slug = 'tecnologia-da-informacao'
on conflict (slug) do update
set name = excluded.name,
    icon = excluded.icon,
    area_id = excluded.area_id;

-- Os canais fixos mantêm nome, slug e vínculo de área, mas podem ter sua
-- privacidade alterada por administradores. Geral permanece obrigatoriamente aberto.
create or replace function public.guard_fixed_workspace_channels()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and old.slug in (
      'geral', 'mecanica-naval', 'eletrica', 'eletronica',
      'gestao-de-pessoas', 'marketing', 'administrativo-financeiro', 'ti'
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

drop trigger if exists workspace_channels_fixed_guard on public.workspace_channels;
create trigger workspace_channels_fixed_guard
before insert or update on public.workspace_channels
for each row execute function public.guard_fixed_workspace_channels();

drop policy if exists workspace_channels_admin_delete on public.workspace_channels;
create policy workspace_channels_admin_delete
on public.workspace_channels for delete to authenticated
using (
  public.is_team_admin()
  and slug not in (
    'geral', 'mecanica-naval', 'eletrica', 'eletronica',
    'gestao-de-pessoas', 'marketing', 'administrativo-financeiro', 'ti'
  )
);

create table if not exists public.workspace_channel_files (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.workspace_channels(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 180),
  item_kind text not null check (item_kind in ('upload', 'link')),
  storage_path text,
  external_url text,
  content_type text,
  file_size bigint,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint workspace_channel_files_target_check check (
    (item_kind = 'upload' and storage_path is not null and external_url is null)
    or
    (item_kind = 'link' and external_url is not null and storage_path is null)
  )
);

create index if not exists workspace_channel_files_channel_created_idx
  on public.workspace_channel_files(channel_id, created_at desc);

alter table public.workspace_channel_files enable row level security;
revoke all on public.workspace_channel_files from public, anon, authenticated;
grant select, insert, delete on public.workspace_channel_files to authenticated;

drop policy if exists workspace_channel_files_read on public.workspace_channel_files;

create policy workspace_channel_files_read
on public.workspace_channel_files for select to authenticated
using (public.can_access_workspace_channel(channel_id));

drop policy if exists workspace_channel_files_insert on public.workspace_channel_files;

create policy workspace_channel_files_insert
on public.workspace_channel_files for insert to authenticated
with check (
  added_by = auth.uid()
  and public.is_active_member()
  and public.can_access_workspace_channel(channel_id)
  and (
    (item_kind = 'link' and external_url ~ '^https://')
    or
    (item_kind = 'upload' and storage_path like channel_id::text || '/%')
  )
);

drop policy if exists workspace_channel_files_delete_owner_admin on public.workspace_channel_files;

create policy workspace_channel_files_delete_owner_admin
on public.workspace_channel_files for delete to authenticated
using (
  public.can_access_workspace_channel(channel_id)
  and (added_by = auth.uid() or public.is_team_admin())
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'workspace-channel-files', 'workspace-channel-files', false, 52428800,
  array[
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv', 'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/zip', 'application/x-zip-compressed'
  ]::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists workspace_channel_files_storage_read on storage.objects;

create policy workspace_channel_files_storage_read
on storage.objects for select to authenticated
using (
  bucket_id = 'workspace-channel-files'
  and exists (
    select 1 from public.workspace_channel_files f
    where f.storage_path = storage.objects.name
      and public.can_access_workspace_channel(f.channel_id)
  )
);

drop policy if exists workspace_channel_files_storage_insert on storage.objects;

create policy workspace_channel_files_storage_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'workspace-channel-files'
  and public.is_active_member()
  and split_part(name, '/', 2) = auth.uid()::text
  and case
    when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.can_access_workspace_channel(split_part(name, '/', 1)::uuid)
    else false
  end
);

drop policy if exists workspace_channel_files_storage_delete_owner_admin on storage.objects;

create policy workspace_channel_files_storage_delete_owner_admin
on storage.objects for delete to authenticated
using (
  bucket_id = 'workspace-channel-files'
  and (split_part(name, '/', 2) = auth.uid()::text or public.is_team_admin())
  and case
    when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.can_access_workspace_channel(split_part(name, '/', 1)::uuid)
    else false
  end
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'workspace_channel_files'
  ) then
    alter publication supabase_realtime add table public.workspace_channel_files;
  end if;
end $$;

commit;
