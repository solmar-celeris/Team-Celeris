begin;

-- Campos aditivos: mantêm status, justificativa e chave única atuais.
alter table public.weekly_updates
  add column if not exists completed_work text not null default '',
  add column if not exists pending_work text not null default '',
  add column if not exists difficulties text not null default '',
  add column if not exists dependency_notes text not null default '',
  add column if not exists next_action text not null default '';

-- Copia somente justificativas de registros pendentes para o novo campo de
-- pendências; em outros status, preserva o texto como observação original.
update public.weekly_updates
set pending_work = justification
where pending_work = '' and status = 'pending' and length(trim(justification)) > 0;

do $constraints$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conname = 'weekly_updates_completed_work_length' and conrelid = 'public.weekly_updates'::regclass) then
    alter table public.weekly_updates add constraint weekly_updates_completed_work_length check (char_length(completed_work) <= 5000);
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conname = 'weekly_updates_pending_work_length' and conrelid = 'public.weekly_updates'::regclass) then
    alter table public.weekly_updates add constraint weekly_updates_pending_work_length check (char_length(pending_work) <= 5000);
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conname = 'weekly_updates_difficulties_length' and conrelid = 'public.weekly_updates'::regclass) then
    alter table public.weekly_updates add constraint weekly_updates_difficulties_length check (char_length(difficulties) <= 5000);
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conname = 'weekly_updates_dependency_notes_length' and conrelid = 'public.weekly_updates'::regclass) then
    alter table public.weekly_updates add constraint weekly_updates_dependency_notes_length check (char_length(dependency_notes) <= 5000);
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conname = 'weekly_updates_next_action_length' and conrelid = 'public.weekly_updates'::regclass) then
    alter table public.weekly_updates add constraint weekly_updates_next_action_length check (char_length(next_action) <= 5000);
  end if;
end
$constraints$;

-- Não usa FK para o registro corrente ou para activities: snapshots devem
-- sobreviver a atualizações/substituições e a exclusões físicas excepcionais.
create table if not exists public.weekly_update_history (
  id bigint generated always as identity primary key,
  weekly_update_id uuid not null,
  activity_id uuid not null,
  week_start date not null check (extract(isodow from week_start) = 1),
  event_type text not null check (event_type in ('baseline','insert','update','delete')),
  previous_status public.weekly_status,
  status public.weekly_status not null,
  justification text not null default '',
  completed_work text not null default '',
  pending_work text not null default '',
  difficulties text not null default '',
  dependency_notes text not null default '',
  next_action text not null default '',
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text not null default 'Integrante',
  occurred_at timestamptz not null default now()
);

create index if not exists weekly_update_history_activity_week_time
  on public.weekly_update_history(activity_id, week_start, occurred_at desc, id desc);
create index if not exists weekly_update_history_actor_time
  on public.weekly_update_history(actor_id, occurred_at desc) where actor_id is not null;

-- Migra o estado que já existe para uma entrada baseline. O banco antigo não
-- guarda versões anteriores da mesma semana, então a migration não as inventa.
insert into public.weekly_update_history (
  weekly_update_id, activity_id, week_start, event_type, previous_status, status,
  justification, completed_work, pending_work, difficulties, dependency_notes,
  next_action, actor_id, actor_name, occurred_at
)
select
  u.id, u.activity_id, u.week_start, 'baseline', null, u.status,
  u.justification, u.completed_work, u.pending_work, u.difficulties,
  u.dependency_notes, u.next_action, u.updated_by,
  coalesce(nullif(trim(p.full_name), ''), 'Integrante'),
  coalesce(u.updated_at, u.created_at, now())
from public.weekly_updates u
left join public.profiles p on p.user_id = u.updated_by
where not exists (
  select 1 from public.weekly_update_history h
  where h.weekly_update_id = u.id and h.event_type = 'baseline'
);

create or replace function public.capture_weekly_update_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_update_id uuid;
  v_activity_id uuid;
  v_week_start date;
  v_event_type text;
  v_previous_status public.weekly_status;
  v_status public.weekly_status;
  v_justification text;
  v_completed_work text;
  v_pending_work text;
  v_difficulties text;
  v_dependency_notes text;
  v_next_action text;
  v_actor_id uuid;
  v_actor_name text;
  v_occurred_at timestamptz;
begin
  if tg_op = 'DELETE' then
    v_update_id := old.id;
    v_activity_id := old.activity_id;
    v_week_start := old.week_start;
    v_event_type := 'delete';
    v_previous_status := old.status;
    v_status := old.status;
    v_justification := old.justification;
    v_completed_work := old.completed_work;
    v_pending_work := old.pending_work;
    v_difficulties := old.difficulties;
    v_dependency_notes := old.dependency_notes;
    v_next_action := old.next_action;
    v_actor_id := coalesce(auth.uid(), old.updated_by);
    v_occurred_at := now();
  else
    v_update_id := new.id;
    v_activity_id := new.activity_id;
    v_week_start := new.week_start;
    v_event_type := case when tg_op = 'INSERT' then 'insert' else 'update' end;
    v_previous_status := case when tg_op = 'UPDATE' then old.status else null end;
    v_status := new.status;
    v_justification := new.justification;
    v_completed_work := new.completed_work;
    v_pending_work := new.pending_work;
    v_difficulties := new.difficulties;
    v_dependency_notes := new.dependency_notes;
    v_next_action := new.next_action;
    v_actor_id := coalesce(auth.uid(), new.updated_by);
    v_occurred_at := coalesce(new.updated_at, now());
  end if;

  select nullif(trim(p.full_name), '') into v_actor_name
  from public.profiles p where p.user_id = v_actor_id;

  insert into public.weekly_update_history (
    weekly_update_id, activity_id, week_start, event_type, previous_status, status,
    justification, completed_work, pending_work, difficulties, dependency_notes,
    next_action, actor_id, actor_name, occurred_at
  ) values (
    v_update_id, v_activity_id, v_week_start, v_event_type, v_previous_status, v_status,
    coalesce(v_justification, ''), coalesce(v_completed_work, ''), coalesce(v_pending_work, ''),
    coalesce(v_difficulties, ''), coalesce(v_dependency_notes, ''), coalesce(v_next_action, ''),
    v_actor_id, coalesce(v_actor_name, 'Integrante'), v_occurred_at
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.capture_weekly_update_history() from public, anon, authenticated;

drop trigger if exists weekly_updates_history_capture on public.weekly_updates;
create trigger weekly_updates_history_capture
after insert or update or delete on public.weekly_updates
for each row execute function public.capture_weekly_update_history();

alter table public.weekly_update_history enable row level security;
drop policy if exists weekly_update_history_read_active on public.weekly_update_history;
create policy weekly_update_history_read_active on public.weekly_update_history
for select to authenticated using (public.is_active_member());
revoke all on public.weekly_update_history from public, anon, authenticated;
grant select on public.weekly_update_history to authenticated;

comment on table public.weekly_update_history is
  'Histórico append-only dos relatos semanais; snapshots escritos somente por trigger e legíveis por integrantes ativos.';

commit;
