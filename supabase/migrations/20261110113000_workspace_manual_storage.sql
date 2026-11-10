-- Storage privado para os documentos originais dos manuais por canal.
-- O texto extraído permanece em public.workspace_manuals, protegido por RLS.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'workspace-manuals',
  'workspace-manuals',
  false,
  20971520,
  array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy workspace_manuals_storage_read on storage.objects
for select to authenticated
using (
  bucket_id = 'workspace-manuals'
  and case
    when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.can_access_workspace_channel(split_part(name, '/', 1)::uuid)
    else false
  end
);

create policy workspace_manuals_storage_insert_admin on storage.objects
for insert to authenticated
with check (
  bucket_id = 'workspace-manuals'
  and public.is_team_admin()
  and case
    when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.can_access_workspace_channel(split_part(name, '/', 1)::uuid)
    else false
  end
);

create policy workspace_manuals_storage_update_admin on storage.objects
for update to authenticated
using (
  bucket_id = 'workspace-manuals'
  and public.is_team_admin()
  and case
    when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.can_access_workspace_channel(split_part(name, '/', 1)::uuid)
    else false
  end
)
with check (
  bucket_id = 'workspace-manuals'
  and public.is_team_admin()
  and case
    when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.can_access_workspace_channel(split_part(name, '/', 1)::uuid)
    else false
  end
);

create policy workspace_manuals_storage_delete_admin on storage.objects
for delete to authenticated
using (
  bucket_id = 'workspace-manuals'
  and public.is_team_admin()
  and case
    when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.can_access_workspace_channel(split_part(name, '/', 1)::uuid)
    else false
  end
);

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='workspace_manuals') then
    alter publication supabase_realtime add table public.workspace_manuals;
  end if;
end $$;

commit;
