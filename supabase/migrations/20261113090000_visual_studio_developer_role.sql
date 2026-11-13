-- Team Celeris · função Desenvolvedor e Visual Studio runtime-driven
-- Aplicar depois das migrations existentes.

begin;

alter type public.app_role add value if not exists 'developer';
alter table public.profiles add column if not exists developer_previous_role public.app_role;

create or replace function public.is_active_developer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and p.status = 'active'
      and p.role::text = 'developer'
  );
$$;
revoke all on function public.is_active_developer() from public, anon;
grant execute on function public.is_active_developer() to authenticated;

create table if not exists public.developer_pages (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text not null default '' check (length(description) <= 500),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  draft_content jsonb not null default '[]'::jsonb check (jsonb_typeof(draft_content) = 'array'),
  published_content jsonb not null default '[]'::jsonb check (jsonb_typeof(published_content) = 'array'),
  version integer not null default 0 check (version >= 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists developer_pages_status_updated_idx
  on public.developer_pages(status, updated_at desc);

create table if not exists public.developer_page_versions (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.developer_pages(id) on delete cascade,
  version integer not null check (version > 0),
  title text not null,
  description text not null default '',
  content jsonb not null check (jsonb_typeof(content) = 'array'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(page_id, version)
);
create index if not exists developer_page_versions_page_created_idx
  on public.developer_page_versions(page_id, created_at desc);

create table if not exists public.developer_audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  page_id uuid references public.developer_pages(id) on delete set null,
  action text not null check (action in ('page_created', 'draft_saved', 'published', 'restored', 'page_archived', 'asset_uploaded')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists developer_audit_logs_created_idx
  on public.developer_audit_logs(created_at desc);

create or replace function public.log_developer_page_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.developer_audit_logs(actor_id, page_id, action, details)
    values (auth.uid(), new.id, 'page_created', jsonb_build_object('slug', new.slug));
  elsif new.draft_content is distinct from old.draft_content
     or new.title is distinct from old.title
     or new.description is distinct from old.description
     or new.slug is distinct from old.slug then
    insert into public.developer_audit_logs(actor_id, page_id, action, details)
    values (auth.uid(), new.id, 'draft_saved', jsonb_build_object('slug', new.slug));
  end if;
  return new;
end;
$$;
revoke all on function public.log_developer_page_change() from public, anon, authenticated;
drop trigger if exists developer_pages_audit_changes on public.developer_pages;
create trigger developer_pages_audit_changes
  after insert or update on public.developer_pages
  for each row execute function public.log_developer_page_change();

create table if not exists public.developer_form_submissions (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.developer_pages(id) on delete cascade,
  submitter_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now()
);
create index if not exists developer_form_submissions_page_created_idx
  on public.developer_form_submissions(page_id, created_at desc);

alter table public.developer_pages enable row level security;
alter table public.developer_page_versions enable row level security;
alter table public.developer_audit_logs enable row level security;
alter table public.developer_form_submissions enable row level security;

revoke all on public.developer_pages, public.developer_page_versions, public.developer_audit_logs from anon, authenticated;
grant select, insert, update, delete on public.developer_pages to authenticated;
grant select on public.developer_page_versions, public.developer_audit_logs, public.developer_form_submissions to authenticated;
grant insert on public.developer_form_submissions to authenticated;

 drop policy if exists developer_pages_read_active on public.developer_pages;
create policy developer_pages_read_active on public.developer_pages
  for select to authenticated
  using (
    exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.status = 'active')
    and (status = 'published' or public.is_active_developer())
  );

drop policy if exists developer_pages_insert_developer on public.developer_pages;
create policy developer_pages_insert_developer on public.developer_pages
  for insert to authenticated
  with check (public.is_active_developer() and created_by = auth.uid() and updated_by = auth.uid());

drop policy if exists developer_pages_update_developer on public.developer_pages;
create policy developer_pages_update_developer on public.developer_pages
  for update to authenticated
  using (public.is_active_developer())
  with check (public.is_active_developer() and updated_by = auth.uid());

drop policy if exists developer_pages_delete_developer on public.developer_pages;
create policy developer_pages_delete_developer on public.developer_pages
  for delete to authenticated
  using (public.is_active_developer());

drop policy if exists developer_versions_read_developer on public.developer_page_versions;
create policy developer_versions_read_developer on public.developer_page_versions
  for select to authenticated using (public.is_active_developer());

drop policy if exists developer_audit_read_developer on public.developer_audit_logs;
create policy developer_audit_read_developer on public.developer_audit_logs
  for select to authenticated using (public.is_active_developer());

drop policy if exists developer_form_submissions_read_developer on public.developer_form_submissions;
create policy developer_form_submissions_read_developer on public.developer_form_submissions
  for select to authenticated using (public.is_active_developer());
drop policy if exists developer_form_submissions_insert_active on public.developer_form_submissions;
create policy developer_form_submissions_insert_active on public.developer_form_submissions
  for insert to authenticated with check (
    submitter_id = auth.uid()
    and public.is_active_member()
    and exists (select 1 from public.developer_pages p where p.id = page_id and p.status = 'published')
  );

create or replace function public.developer_publish_page(p_page_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_page public.developer_pages%rowtype;
  v_next_version integer;
begin
  if v_actor is null or not public.is_active_developer() then
    raise exception 'Somente Desenvolvedores ativos podem publicar páginas.' using errcode = '42501';
  end if;
  select * into v_page from public.developer_pages where id = p_page_id for update;
  if not found then raise exception 'Página não encontrada.' using errcode = 'P0002'; end if;
  v_next_version := v_page.version + 1;
  insert into public.developer_page_versions(page_id, version, title, description, content, created_by)
  values (v_page.id, v_next_version, v_page.title, v_page.description, v_page.draft_content, v_actor);
  update public.developer_pages
    set published_content = draft_content,
        status = 'published',
        version = v_next_version,
        published_by = v_actor,
        published_at = now(),
        updated_by = v_actor,
        updated_at = now()
  where id = p_page_id;
  insert into public.developer_audit_logs(actor_id, page_id, action, details)
  values (v_actor, p_page_id, 'published', jsonb_build_object('version', v_next_version));
  return v_next_version;
end;
$$;
revoke all on function public.developer_publish_page(uuid) from public, anon;
grant execute on function public.developer_publish_page(uuid) to authenticated;

create or replace function public.developer_restore_page_version(p_page_id uuid, p_version_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_version public.developer_page_versions%rowtype;
begin
  if v_actor is null or not public.is_active_developer() then
    raise exception 'Somente Desenvolvedores ativos podem restaurar versões.' using errcode = '42501';
  end if;
  select * into v_version from public.developer_page_versions
   where id = p_version_id and page_id = p_page_id;
  if not found then raise exception 'Versão não encontrada para esta página.' using errcode = 'P0002'; end if;
  update public.developer_pages
     set title = v_version.title,
         description = v_version.description,
         draft_content = v_version.content,
         updated_by = v_actor,
         updated_at = now()
   where id = p_page_id;
  insert into public.developer_audit_logs(actor_id, page_id, action, details)
  values (v_actor, p_page_id, 'restored', jsonb_build_object('source_version', v_version.version));
  return v_version.version;
end;
$$;
revoke all on function public.developer_restore_page_version(uuid, uuid) from public, anon;
grant execute on function public.developer_restore_page_version(uuid, uuid) to authenticated;

-- Atribuição de Desenvolvedor: somente Administradores ativos podem conceder/revogar.
create or replace function public.admin_set_developer_role(p_user_id uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.app_role;
  v_status public.member_status;
  v_next_role public.app_role;
begin
  if v_actor is null or p_user_id is null or p_user_id = v_actor or not public.is_active_member() or not public.is_team_admin() then
    raise exception 'Somente Administradores ativos podem atribuir a função Desenvolvedor a outra pessoa.' using errcode = '42501';
  end if;
  select role, status into v_role, v_status from public.profiles where user_id = p_user_id for update;
  if not found then raise exception 'Perfil não encontrado.' using errcode = 'P0002'; end if;
  if v_status <> 'active' then raise exception 'Somente membros ativos podem receber esta função.' using errcode = '22023'; end if;
  if v_role = 'admin' then raise exception 'A função Administrador é independente e não pode ser substituída.' using errcode = '22023'; end if;
  if p_enabled then
    if v_role::text = 'developer' then return; end if;
    update public.profiles set developer_previous_role = v_role, role = 'developer', updated_at = now()
      where user_id = p_user_id;
    v_next_role := 'developer';
  else
    if v_role::text <> 'developer' then return; end if;
    select coalesce(developer_previous_role, 'member'::public.app_role)
      into v_next_role from public.profiles where user_id = p_user_id;
    if v_next_role::text = 'admin' or v_next_role::text = 'developer' then v_next_role := 'member'; end if;
    update public.profiles set role = v_next_role, developer_previous_role = null, updated_at = now()
      where user_id = p_user_id;
  end if;
  insert into public.audit_log(entity, entity_id, action, actor_id, changed_fields)
  values ('profiles', p_user_id, 'update', v_actor,
    jsonb_build_object('role', jsonb_build_object('before', v_role::text, 'after', v_next_role::text)));
end;
$$;
revoke all on function public.admin_set_developer_role(uuid, boolean) from public, anon;
grant execute on function public.admin_set_developer_role(uuid, boolean) to authenticated;

-- Bucket privado: apenas Desenvolvedores ativos podem enviar/gerenciar assets;
-- membros ativos podem ler assets publicados para renderização futura.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('developer-assets', 'Team Celeris Developer Assets', false, 20971520,
  array['image/jpeg','image/png','image/webp','image/gif','application/pdf','text/plain','text/csv',
        'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'video/mp4','audio/mpeg','audio/webm','video/webm'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists developer_assets_read_active on storage.objects;
create policy developer_assets_read_active on storage.objects for select to authenticated
  using (bucket_id = 'developer-assets' and public.is_active_member());
drop policy if exists developer_assets_insert_developer on storage.objects;
create policy developer_assets_insert_developer on storage.objects for insert to authenticated
  with check (bucket_id = 'developer-assets' and public.is_active_developer()
    and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists developer_assets_update_developer on storage.objects;
create policy developer_assets_update_developer on storage.objects for update to authenticated
  using (bucket_id = 'developer-assets' and public.is_active_developer()
    and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'developer-assets' and public.is_active_developer()
    and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists developer_assets_delete_developer on storage.objects;
create policy developer_assets_delete_developer on storage.objects for delete to authenticated
  using (bucket_id = 'developer-assets' and public.is_active_developer()
    and (storage.foldername(name))[1] = (select auth.uid())::text);

commit;
