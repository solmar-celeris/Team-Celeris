-- SolMar Celeris · eventos mínimos para push de Comunicados e atribuições
-- Aplicar após as migrations de Chat/grupos e push. Não armazena conteúdo ou tokens.

begin;

create table if not exists public.workspace_push_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('announcement_created', 'activity_assigned')),
  entity_id uuid not null,
  actor_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid references auth.users(id) on delete set null,
  target_area_id uuid references public.areas(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'skipped', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  recipient_count integer not null default 0 check (recipient_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_push_events_target_shape check (
    (event_type = 'announcement_created' and target_user_id is null) or
    (event_type = 'activity_assigned' and target_user_id is not null and target_area_id is null)
  )
);

create index if not exists workspace_push_events_actor_recent
  on public.workspace_push_events(actor_id, event_type, entity_id, created_at desc);

alter table public.workspace_push_events enable row level security;
revoke all on public.workspace_push_events from public, anon, authenticated;
grant select on public.workspace_push_events to authenticated;
grant select, insert, update on public.workspace_push_events to service_role;

create policy workspace_push_events_read_own on public.workspace_push_events
  for select to authenticated
  using (actor_id = auth.uid() and public.is_active_member());

create or replace function public.enqueue_workspace_push_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null or not public.is_active_member() then
    return new;
  end if;

  if tg_table_name = 'announcements' then
    if tg_op = 'INSERT' and new.removed_at is null then
      insert into public.workspace_push_events (
        event_type, entity_id, actor_id, target_area_id
      ) values (
        'announcement_created', new.id, v_actor_id, new.audience_area_id
      );
    end if;
  elsif tg_table_name = 'activities' then
    if new.responsible_user_id is not null and new.archived_at is null and (
      tg_op = 'INSERT' or
      (tg_op = 'UPDATE' and old.responsible_user_id is distinct from new.responsible_user_id)
    ) then
      insert into public.workspace_push_events (
        event_type, entity_id, actor_id, target_user_id
      ) values (
        'activity_assigned', new.id, v_actor_id, new.responsible_user_id
      );
    end if;
  end if;

  return new;
end;
$$;
revoke all on function public.enqueue_workspace_push_event() from public, anon, authenticated;

drop trigger if exists announcements_enqueue_workspace_push on public.announcements;
create trigger announcements_enqueue_workspace_push
  after insert on public.announcements
  for each row execute function public.enqueue_workspace_push_event();

drop trigger if exists activities_enqueue_assignment_push on public.activities;
create trigger activities_enqueue_assignment_push
  after insert or update of responsible_user_id on public.activities
  for each row execute function public.enqueue_workspace_push_event();

commit;
