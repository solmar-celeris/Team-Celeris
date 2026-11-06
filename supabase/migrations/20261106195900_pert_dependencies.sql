-- PERT/CPM incremental: estimativas por marco e dependências dirigidas.
begin;

alter table public.activities
  add column pert_optimistic_days integer,
  add column pert_most_likely_days integer,
  add column pert_pessimistic_days integer,
  add constraint activities_pert_optimistic_positive
    check (pert_optimistic_days is null or pert_optimistic_days > 0),
  add constraint activities_pert_most_likely_positive
    check (pert_most_likely_days is null or pert_most_likely_days > 0),
  add constraint activities_pert_pessimistic_positive
    check (pert_pessimistic_days is null or pert_pessimistic_days > 0),
  add constraint activities_pert_ordered
    check (
      pert_optimistic_days is null or pert_most_likely_days is null or pert_pessimistic_days is null
      or (pert_optimistic_days <= pert_most_likely_days
          and pert_most_likely_days <= pert_pessimistic_days)
    );

create table public.activity_dependencies (
  predecessor_activity_id uuid not null references public.activities(id) on delete cascade,
  successor_activity_id uuid not null references public.activities(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint activity_dependencies_pk primary key (predecessor_activity_id, successor_activity_id),
  constraint activity_dependencies_no_self check (predecessor_activity_id <> successor_activity_id)
);

create index activity_dependencies_successor_idx
  on public.activity_dependencies (successor_activity_id, predecessor_activity_id);

alter table public.activity_dependencies enable row level security;
revoke all on public.activity_dependencies from public, anon, authenticated;
grant select, insert, delete on public.activity_dependencies to authenticated;

-- A dependency is editable only when the actor may manage BOTH endpoint activities.
create policy activity_dependencies_read_active on public.activity_dependencies
  for select to authenticated
  using (public.is_active_member());

create policy activity_dependencies_insert_managed on public.activity_dependencies
  for insert to authenticated
  with check (
    public.is_active_member()
    and exists (
      select 1
      from public.activities predecessor
      cross join public.activities successor
      where predecessor.id = predecessor_activity_id
        and successor.id = successor_activity_id
        and predecessor.activity_type = 'marco'::public.activity_type
        and successor.activity_type = 'marco'::public.activity_type
        and predecessor.archived_at is null
        and successor.archived_at is null
        and (
          public.is_team_admin()
          or (public.is_area_lead_for(predecessor.area_id) and public.is_area_lead_for(successor.area_id))
        )
    )
  );

create policy activity_dependencies_delete_managed on public.activity_dependencies
  for delete to authenticated
  using (
    public.is_active_member()
    and exists (
      select 1
      from public.activities predecessor
      cross join public.activities successor
      where predecessor.id = predecessor_activity_id
        and successor.id = successor_activity_id
        and predecessor.activity_type = 'marco'::public.activity_type
        and successor.activity_type = 'marco'::public.activity_type
        and predecessor.archived_at is null
        and successor.archived_at is null
        and (
          public.is_team_admin()
          or (public.is_area_lead_for(predecessor.area_id) and public.is_area_lead_for(successor.area_id))
        )
    )
  );

-- The trigger runs with a locked-down search path and validates the complete DAG
-- independently of client-side checks. A transaction-scoped lock serializes
-- dependency edits before cycle traversal.
create or replace function public.validate_activity_dependency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_predecessor uuid;
  v_old_successor uuid;
  v_exclude_old boolean := false;
begin
  perform pg_catalog.pg_advisory_xact_lock(7319402611184057);

  if new.predecessor_activity_id = new.successor_activity_id then
    raise exception 'A milestone cannot depend on itself.' using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.activities a
    where a.id = new.predecessor_activity_id
      and a.activity_type = 'marco'::public.activity_type
      and a.archived_at is null
  ) or not exists (
    select 1 from public.activities a
    where a.id = new.successor_activity_id
      and a.activity_type = 'marco'::public.activity_type
      and a.archived_at is null
  ) then
    raise exception 'Both dependency endpoints must be active, unarchived milestones.' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    v_exclude_old := true;
    v_old_predecessor := old.predecessor_activity_id;
    v_old_successor := old.successor_activity_id;
  end if;

  if exists (
    with recursive reachable(activity_id) as (
      select d.successor_activity_id
      from public.activity_dependencies d
      where d.predecessor_activity_id = new.successor_activity_id
        and (not v_exclude_old or (d.predecessor_activity_id, d.successor_activity_id)
          is distinct from (v_old_predecessor, v_old_successor))
      union
      select d.successor_activity_id
      from public.activity_dependencies d
      join reachable r on r.activity_id = d.predecessor_activity_id
      where (not v_exclude_old or (d.predecessor_activity_id, d.successor_activity_id)
        is distinct from (v_old_predecessor, v_old_successor))
    )
    select 1 from reachable r where r.activity_id = new.predecessor_activity_id
  ) then
    raise exception 'Dependency rejected because it would create a cycle.' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_activity_dependency() from public, anon, authenticated;
create trigger activity_dependencies_validate_dag
  before insert or update on public.activity_dependencies
  for each row execute function public.validate_activity_dependency();

-- Preserve the active-milestone invariant if an endpoint is later archived or
-- converted to another activity type: remove its edges first (with both-side
-- management permission) or retain it as an active milestone.
create or replace function public.protect_activity_dependency_endpoint()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.activity_type is distinct from old.activity_type or new.archived_at is distinct from old.archived_at)
     and (new.activity_type <> 'marco'::public.activity_type or new.archived_at is not null)
     and exists (
       select 1 from public.activity_dependencies d
       where d.predecessor_activity_id = new.id or d.successor_activity_id = new.id
     ) then
    raise exception 'Remove all dependencies before archiving or changing the type of this milestone.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_activity_dependency_endpoint() from public, anon, authenticated;
create trigger activities_protect_pert_endpoint
  before update of activity_type, archived_at on public.activities
  for each row execute function public.protect_activity_dependency_endpoint();

commit;
