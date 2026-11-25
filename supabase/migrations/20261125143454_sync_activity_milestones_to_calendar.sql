begin;

alter table public.calendar_events
  add column if not exists source_activity_id uuid
  references public.activities(id) on delete cascade;

create unique index if not exists calendar_events_source_activity_uidx
  on public.calendar_events (source_activity_id)
  where source_activity_id is not null;

comment on column public.calendar_events.source_activity_id is
  'Atividade Marco que originou automaticamente este evento; eventos vinculados não são editáveis manualmente.';

drop policy if exists calendar_events_update_owner_admin on public.calendar_events;
create policy calendar_events_update_owner_admin on public.calendar_events
  for update to authenticated
  using (
    source_activity_id is null
    and public.is_active_member()
    and (created_by = (select auth.uid()) or public.is_team_admin())
  )
  with check (
    source_activity_id is null
    and public.is_active_member()
    and (created_by = (select auth.uid()) or public.is_team_admin())
  );

drop policy if exists calendar_events_delete_owner_admin on public.calendar_events;
create policy calendar_events_delete_owner_admin on public.calendar_events
  for delete to authenticated
  using (
    source_activity_id is null
    and public.is_active_member()
    and (created_by = (select auth.uid()) or public.is_team_admin())
  );

create or replace function public.sync_activity_milestone_calendar_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.calendar_events where source_activity_id = old.id;
    return old;
  end if;

  if new.archived_at is not null
     or new.activity_type <> 'marco'
     or new.due_date is null then
    delete from public.calendar_events where source_activity_id = new.id;
    return new;
  end if;

  insert into public.calendar_events (
    title, event_scope, event_kind, event_date, start_time, end_time,
    location, description, created_by, source_activity_id
  )
  values (
    left(new.name, 140),
    'internal',
    'other',
    new.due_date,
    null,
    null,
    '',
    concat_ws(E'\n',
      nullif(new.code, ''),
      nullif(new.description, ''),
      case when nullif(new.expected_deliverable, '') is not null
        then 'Entrega esperada: ' || new.expected_deliverable end,
      case when nullif(new.responsible_name, '') is not null
        then 'Responsável: ' || new.responsible_name end
    ),
    coalesce(new.created_by, new.updated_by, auth.uid()),
    new.id
  )
  on conflict (source_activity_id) where source_activity_id is not null
  do update set
    title = excluded.title,
    event_date = excluded.event_date,
    description = excluded.description,
    updated_by = auth.uid(),
    updated_at = now();

  return new;
end;
$$;

revoke all on function public.sync_activity_milestone_calendar_event() from public, anon, authenticated;

drop trigger if exists activities_sync_milestone_calendar_event on public.activities;
create trigger activities_sync_milestone_calendar_event
  after insert or update or delete on public.activities
  for each row execute function public.sync_activity_milestone_calendar_event();

insert into public.calendar_events (
  title, event_scope, event_kind, event_date, location, description,
  created_by, source_activity_id
)
select
  left(a.name, 140),
  'internal',
  'other',
  a.due_date,
  '',
  concat_ws(E'\n',
    nullif(a.code, ''),
    nullif(a.description, ''),
    case when nullif(a.expected_deliverable, '') is not null
      then 'Entrega esperada: ' || a.expected_deliverable end,
    case when nullif(a.responsible_name, '') is not null
      then 'Responsável: ' || a.responsible_name end
  ),
  coalesce(a.created_by, a.updated_by, (select p.user_id from public.profiles p where p.status = 'active' and p.role = 'admin' order by p.created_at limit 1)),
  a.id
from public.activities a
where a.activity_type = 'marco'
  and a.archived_at is null
  and a.due_date is not null
  and coalesce(a.created_by, a.updated_by, (select p.user_id from public.profiles p where p.status = 'active' and p.role = 'admin' order by p.created_at limit 1)) is not null
on conflict (source_activity_id) where source_activity_id is not null
do update set
  title = excluded.title,
  event_date = excluded.event_date,
  description = excluded.description,
  updated_at = now();

commit;