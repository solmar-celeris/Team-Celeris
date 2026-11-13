-- SolMar Celeris · grupos no Chat
-- Mensagens existentes permanecem na sala geral (group_id IS NULL).
-- Aplicar depois das migrations do esquema inicial e do Chat coletivo.

begin;

create table if not exists public.team_chat_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 80),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.team_chat_group_members (
  group_id uuid not null references public.team_chat_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table public.team_chat_messages
  add column if not exists group_id uuid references public.team_chat_groups(id) on delete restrict;

create index if not exists team_chat_group_members_user_idx
  on public.team_chat_group_members (user_id, group_id);
create index if not exists team_chat_messages_group_created_idx
  on public.team_chat_messages (group_id, created_at desc, id desc);

alter table public.team_chat_groups enable row level security;
alter table public.team_chat_group_members enable row level security;
alter table public.team_chat_messages enable row level security;

create or replace function public.is_team_chat_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_member() and exists (
    select 1
    from public.team_chat_group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = auth.uid()
  )
$$;
revoke all on function public.is_team_chat_group_member(uuid) from public, anon;
grant execute on function public.is_team_chat_group_member(uuid) to authenticated;

create or replace function public.set_team_chat_group_creator()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_active_member() then
    raise exception 'Somente integrantes ativos podem criar grupos.' using errcode = '42501';
  end if;
  new.created_by := auth.uid();
  new.created_at := pg_catalog.now();
  return new;
end;
$$;
revoke all on function public.set_team_chat_group_creator() from public, anon, authenticated;
drop trigger if exists team_chat_groups_set_creator on public.team_chat_groups;
create trigger team_chat_groups_set_creator
  before insert on public.team_chat_groups
  for each row execute function public.set_team_chat_group_creator();

create or replace function public.add_team_chat_group_creator()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.team_chat_group_members (group_id, user_id, added_by, created_at)
  values (new.id, auth.uid(), auth.uid(), pg_catalog.now())
  on conflict (group_id, user_id) do nothing;
  return new;
end;
$$;
revoke all on function public.add_team_chat_group_creator() from public, anon, authenticated;
drop trigger if exists team_chat_groups_add_creator on public.team_chat_groups;
create trigger team_chat_groups_add_creator
  after insert on public.team_chat_groups
  for each row execute function public.add_team_chat_group_creator();

create or replace function public.set_team_chat_group_member_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_active_member() then
    raise exception 'Somente integrantes ativos podem adicionar pessoas.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.user_id = new.user_id and p.status = 'active'
  ) then
    raise exception 'Somente uma conta ativa pode participar de um grupo.' using errcode = '42501';
  end if;
  if not (
    public.is_team_admin()
    or public.is_team_chat_group_member(new.group_id)
    or exists (
      select 1 from public.team_chat_groups g
      where g.id = new.group_id and g.created_by = auth.uid()
    )
  ) then
    raise exception 'Somente integrantes do grupo ou Administradores podem adicionar pessoas.' using errcode = '42501';
  end if;
  new.added_by := auth.uid();
  new.created_at := pg_catalog.now();
  return new;
end;
$$;
revoke all on function public.set_team_chat_group_member_actor() from public, anon, authenticated;
drop trigger if exists team_chat_group_members_set_actor on public.team_chat_group_members;
create trigger team_chat_group_members_set_actor
  before insert on public.team_chat_group_members
  for each row execute function public.set_team_chat_group_member_actor();

revoke all on public.team_chat_groups, public.team_chat_group_members from anon, authenticated;
grant select on public.team_chat_groups, public.team_chat_group_members to authenticated;
grant insert (name) on public.team_chat_groups to authenticated;
grant insert (group_id, user_id) on public.team_chat_group_members to authenticated;

-- Preserve the collective room and authorize group rows only for active group members/Admins.
drop policy if exists team_chat_groups_read on public.team_chat_groups;
create policy team_chat_groups_read on public.team_chat_groups
  for select to authenticated
  using (public.is_active_member() and (public.is_team_admin() or public.is_team_chat_group_member(id)));

drop policy if exists team_chat_groups_create on public.team_chat_groups;
create policy team_chat_groups_create on public.team_chat_groups
  for insert to authenticated
  with check (public.is_active_member() and created_by = auth.uid());

drop policy if exists team_chat_group_members_read on public.team_chat_group_members;
create policy team_chat_group_members_read on public.team_chat_group_members
  for select to authenticated
  using (
    public.is_active_member()
    and (user_id = auth.uid() or public.is_team_admin() or public.is_team_chat_group_member(group_id))
  );

drop policy if exists team_chat_group_members_add on public.team_chat_group_members;
create policy team_chat_group_members_add on public.team_chat_group_members
  for insert to authenticated
  with check (
    public.is_active_member()
    and added_by = auth.uid()
    and (public.is_team_admin() or public.is_team_chat_group_member(group_id))
  );

-- Upgrade the collective chat policies while retaining the existing admin-only scrub RPC.
revoke all on public.team_chat_messages from anon, authenticated;
grant select on public.team_chat_messages to authenticated;
grant insert (body, group_id) on public.team_chat_messages to authenticated;

drop policy if exists team_chat_messages_read_active on public.team_chat_messages;
create policy team_chat_messages_read_active on public.team_chat_messages
  for select to authenticated
  using (
    public.is_active_member()
    and (group_id is null or public.is_team_admin() or public.is_team_chat_group_member(group_id))
  );

drop policy if exists team_chat_messages_insert_active on public.team_chat_messages;
create policy team_chat_messages_insert_active on public.team_chat_messages
  for insert to authenticated
  with check (
    public.is_active_member()
    and sender_id = auth.uid()
    and removed_at is null
    and removed_by is null
    and (group_id is null or public.is_team_chat_group_member(group_id))
  );

-- Realtime publishes only to clients who pass the SELECT policies above.
do $realtime$
begin
  if not exists (
    select 1 from pg_catalog.pg_publication
    where pubname = 'supabase_realtime'
  ) then
    raise exception 'A publicação supabase_realtime não foi encontrada neste projeto Supabase.';
  end if;

  if not exists (select 1 from pg_catalog.pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'team_chat_groups') then
    execute 'alter publication supabase_realtime add table public.team_chat_groups';
  end if;
  if not exists (select 1 from pg_catalog.pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'team_chat_group_members') then
    execute 'alter publication supabase_realtime add table public.team_chat_group_members';
  end if;
  if not exists (select 1 from pg_catalog.pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'team_chat_messages') then
    execute 'alter publication supabase_realtime add table public.team_chat_messages';
  end if;
end
$realtime$;

commit;
