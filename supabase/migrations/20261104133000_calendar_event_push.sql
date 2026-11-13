-- Fila mínima e idempotente de Web Push para eventos recém-criados no Calendário.
-- Aplicar após 20261104130000_private_chat_calendar.sql, uma única vez.
begin;

create table if not exists public.calendar_event_push_events (
  event_id uuid primary key references public.calendar_events(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'skipped', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  recipient_count integer not null default 0 check (recipient_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists calendar_event_push_pending_recent
  on public.calendar_event_push_events (actor_id, status, created_at desc);

alter table public.calendar_event_push_events enable row level security;
revoke all on public.calendar_event_push_events from public, anon, authenticated;
grant select on public.calendar_event_push_events to authenticated;
grant select, insert, update on public.calendar_event_push_events to service_role;
create policy calendar_event_push_read_own on public.calendar_event_push_events
  for select to authenticated
  using (actor_id = (select auth.uid()) and public.is_active_member());

create or replace function public.enqueue_calendar_event_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.created_by is not null and public.is_active_member() then
    insert into public.calendar_event_push_events (event_id, actor_id, status, created_at, updated_at)
    values (new.id, new.created_by, 'pending', pg_catalog.now(), pg_catalog.now())
    on conflict (event_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.enqueue_calendar_event_push() from public, anon, authenticated;
drop trigger if exists calendar_events_enqueue_push on public.calendar_events;
create trigger calendar_events_enqueue_push after insert on public.calendar_events
  for each row execute function public.enqueue_calendar_event_push();

commit;
