-- Canais por área: migração incremental, preservando os IDs e o histórico existentes.
begin;

create table if not exists public.workspace_channels (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  icon text not null default 'hash',
  is_open boolean not null default true,
  area_id uuid references public.areas(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists workspace_channels_area_unique
  on public.workspace_channels(area_id) where area_id is not null and slug <> 'geral';

create table if not exists public.workspace_channel_members (
  channel_id uuid not null references public.workspace_channels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(channel_id, user_id)
);

insert into public.workspace_channels(slug,name,icon,is_open,area_id)
values ('geral','Geral','globe',true,null)
on conflict(slug) do update set name=excluded.name, icon=excluded.icon, is_open=true;

insert into public.workspace_channels(slug,name,icon,is_open,area_id)
select seed.slug, seed.name, seed.icon, true, a.id
from (values
  ('mecanica-naval','Mecânica Naval','ship','mecanica-naval'),
  ('eletrica','Elétrica','zap','eletrica'),
  ('eletronica','Eletrônica','cpu','eletronica'),
  ('gestao-de-pessoas','Gestão de Pessoas','users','gestao-de-pessoas'),
  ('marketing','Marketing','megaphone','marketing'),
  ('administrativo-financeiro','Administrativo Financeiro','wallet','administrativo-financeiro')
) as seed(slug,name,icon,area_slug)
join public.areas a on a.slug=seed.area_slug
on conflict(slug) do update set name=excluded.name, icon=excluded.icon, area_id=excluded.area_id;

create or replace function public.can_access_workspace_channel(p_channel_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspace_channels c
    join public.profiles p on p.user_id = auth.uid() and p.status = 'active'
    where c.id = p_channel_id
      and (c.is_open or p.role = 'admin' or exists (
        select 1 from public.workspace_channel_members cm
        where cm.channel_id=c.id and cm.user_id=auth.uid()
      ))
  );
$$;
revoke all on function public.can_access_workspace_channel(uuid) from public, anon;
grant execute on function public.can_access_workspace_channel(uuid) to authenticated;

create or replace function public.can_access_workspace_area(p_area_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_active_member() and (
    not exists(select 1 from public.workspace_channels c where c.area_id=p_area_id)
    or exists(select 1 from public.workspace_channels c where c.area_id=p_area_id and public.can_access_workspace_channel(c.id))
  );
$$;
revoke all on function public.can_access_workspace_area(uuid) from public, anon;
grant execute on function public.can_access_workspace_area(uuid) to authenticated;

alter table public.workspace_channels enable row level security;
alter table public.workspace_channel_members enable row level security;
revoke all on public.workspace_channels, public.workspace_channel_members from public, anon, authenticated;
grant select on public.workspace_channels to authenticated;
grant insert, update, delete on public.workspace_channels to authenticated;
grant select on public.workspace_channel_members to authenticated;
grant insert, delete on public.workspace_channel_members to authenticated;

create policy workspace_channels_read on public.workspace_channels for select to authenticated
  using (public.can_access_workspace_channel(id) or public.is_team_admin());
create policy workspace_channels_admin_insert on public.workspace_channels for insert to authenticated
  with check (public.is_team_admin() and created_by=auth.uid());
create policy workspace_channels_admin_update on public.workspace_channels for update to authenticated
  using(public.is_team_admin()) with check(public.is_team_admin());
create policy workspace_channels_admin_delete on public.workspace_channels for delete to authenticated
  using(public.is_team_admin() and slug not in ('geral','mecanica-naval','eletrica','eletronica','gestao-de-pessoas','marketing','administrativo-financeiro'));
create policy workspace_channel_members_read on public.workspace_channel_members for select to authenticated
  using (public.can_access_workspace_channel(channel_id) or public.is_team_admin());
create policy workspace_channel_members_admin_manage on public.workspace_channel_members for all to authenticated
  using(public.is_team_admin()) with check(public.is_team_admin());

-- O diretório e os dados antigos continuam intactos; somente a leitura passa a
-- respeitar o canal associado à área. Áreas legadas sem canal seguem no Geral.
drop policy if exists activities_read_active on public.activities;
create policy activities_read_active on public.activities for select to authenticated
  using (public.is_active_member() and archived_at is null and public.can_access_workspace_area(area_id));
drop policy if exists activities_lead_insert on public.activities;
create policy activities_lead_insert on public.activities for insert to authenticated
  with check ((public.is_team_admin() or public.is_area_lead_for(area_id)) and public.can_access_workspace_area(area_id));
drop policy if exists activities_lead_update on public.activities;
create policy activities_lead_update on public.activities for update to authenticated
  using ((public.is_team_admin() or public.is_area_lead_for(area_id)) and public.can_access_workspace_area(area_id))
  with check ((public.is_team_admin() or public.is_area_lead_for(area_id)) and public.can_access_workspace_area(area_id));

drop policy if exists drive_folders_read_active on public.drive_folders;
create policy drive_folders_read_active on public.drive_folders for select to authenticated
  using (public.is_active_member() and removed_at is null and (area_id is null or public.can_access_workspace_area(area_id)));

drop policy if exists announcements_read_active on public.announcements;
create policy announcements_read_active on public.announcements for select to authenticated
  using (public.is_active_member() and removed_at is null and (audience_area_id is null or public.can_access_workspace_area(audience_area_id)));

create table if not exists public.workspace_manuals (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.workspace_channels(id) on delete cascade,
  manual_kind text not null check(manual_kind in ('conduct','function')),
  title text not null,
  content text not null default '',
  original_file_path text,
  original_file_name text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique(channel_id,manual_kind)
);
alter table public.workspace_manuals enable row level security;
revoke all on public.workspace_manuals from public, anon, authenticated;
grant select, insert, update on public.workspace_manuals to authenticated;
create policy workspace_manuals_read on public.workspace_manuals for select to authenticated
  using(public.can_access_workspace_channel(channel_id));
create policy workspace_manuals_admin_insert on public.workspace_manuals for insert to authenticated
  with check(public.is_team_admin() and updated_by=auth.uid());
create policy workspace_manuals_admin_update on public.workspace_manuals for update to authenticated
  using(public.is_team_admin()) with check(public.is_team_admin() and updated_by=auth.uid());



create or replace function public.get_team_member_directory()
returns table(user_id uuid, full_name text, email text, role text, status text, area_id uuid)
language sql stable security definer set search_path = '' as $$
  select p.user_id, p.full_name, u.email::text, p.role::text, p.status::text, p.area_id
  from public.profiles p join auth.users u on u.id=p.user_id
  where public.is_active_member() and p.status='active'
  order by p.full_name;
$$;
revoke all on function public.get_team_member_directory() from public,anon;
grant execute on function public.get_team_member_directory() to authenticated;

create or replace function public.admin_demote_team_member(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_role public.app_role;
  v_status public.member_status;
  v_admin_count integer;
begin
  if v_actor is null or p_user_id is null or p_user_id = v_actor or not public.is_active_member() or not public.is_team_admin() then
    raise exception 'Somente administradores ativos podem alterar outros membros.' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(7319041001::bigint);
  select role,status into v_role,v_status from public.profiles where user_id=p_user_id for update;
  if not found then raise exception 'Perfil não encontrado.' using errcode = 'P0002'; end if;
  if v_status <> 'active' then raise exception 'Somente membros ativos podem ser alterados.' using errcode = '22023'; end if;
  if v_role <> 'admin' then return; end if;
  select count(*)::integer into v_admin_count from public.profiles where role='admin' and status='active';
  if v_admin_count <= 1 then raise exception 'A equipe precisa manter pelo menos um administrador ativo.' using errcode = '23514'; end if;
  update public.profiles set role='member' where user_id=p_user_id;
  insert into public.audit_log(entity,entity_id,action,actor_id,changed_fields)
  values('profiles',p_user_id,'update',v_actor,pg_catalog.jsonb_build_object('role',pg_catalog.jsonb_build_object('before','admin','after','member')));
end;
$$;
revoke all on function public.admin_demote_team_member(uuid) from public,anon,authenticated;
grant execute on function public.admin_demote_team_member(uuid) to authenticated;

-- Publicação Realtime para o seletor e gestão de membros de canais.
do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='workspace_channels') then
    alter publication supabase_realtime add table public.workspace_channels;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='workspace_channel_members') then
    alter publication supabase_realtime add table public.workspace_channel_members;
  end if;
end $$;

commit;
