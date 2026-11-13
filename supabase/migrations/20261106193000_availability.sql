-- Disponibilidade recorrente e escalas internas do time.
-- A leitura é restrita a perfis ativos autenticados; nenhuma policy é concedida a anon.

begin;

create table public.member_availability_slots (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 5),
  hour_start time without time zone not null,
  created_at timestamptz not null default now(),
  constraint member_availability_slots_hour_range check (
    hour_start >= time '07:00' and hour_start <= time '20:00'
    and date_part('minute', hour_start) = 0
    and date_part('second', hour_start) = 0
  ),
  primary key (user_id, weekday, hour_start)
);

create table public.team_shifts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 160),
  shift_date date not null check (extract(isodow from shift_date) between 1 and 5),
  start_time time without time zone not null,
  end_time time without time zone not null,
  assigned_user_id uuid references public.profiles(user_id) on delete set null,
  notes text not null default '' check (length(notes) <= 4000),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_shifts_time_range check (
    start_time >= time '07:00' and start_time < time '21:00'
    and end_time > time '07:00' and end_time <= time '21:00'
    and end_time > start_time
    and date_part('minute', start_time) = 0
    and date_part('second', start_time) = 0
    and date_part('minute', end_time) = 0
    and date_part('second', end_time) = 0
  )
);

create index team_shifts_date_start_idx on public.team_shifts (shift_date, start_time);
create index team_shifts_assigned_date_idx on public.team_shifts (assigned_user_id, shift_date) where assigned_user_id is not null;

alter table public.member_availability_slots enable row level security;
alter table public.team_shifts enable row level security;

create policy member_availability_slots_active_read on public.member_availability_slots
  for select to authenticated
  using (
    public.is_active_member()
    and exists (
      select 1 from public.profiles p
      where p.user_id = member_availability_slots.user_id and p.status = 'active'
    )
  );

create policy member_availability_slots_own_insert on public.member_availability_slots
  for insert to authenticated
  with check (
    public.is_active_member()
    and user_id = (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.user_id = member_availability_slots.user_id and p.status = 'active'
    )
  );

create policy member_availability_slots_own_delete on public.member_availability_slots
  for delete to authenticated
  using (public.is_active_member() and user_id = (select auth.uid()));

create policy team_shifts_active_read on public.team_shifts
  for select to authenticated
  using (public.is_active_member());

create policy team_shifts_manager_insert on public.team_shifts
  for insert to authenticated
  with check (
    public.is_active_member()
    and (public.is_team_admin() or public.current_profile_role() = 'area_lead')
    and created_by = (select auth.uid())
  );

create policy team_shifts_manager_update on public.team_shifts
  for update to authenticated
  using (
    public.is_active_member()
    and (public.is_team_admin() or public.current_profile_role() = 'area_lead')
  )
  with check (
    public.is_active_member()
    and (public.is_team_admin() or public.current_profile_role() = 'area_lead')
  );

create policy team_shifts_manager_delete on public.team_shifts
  for delete to authenticated
  using (
    public.is_active_member()
    and (public.is_team_admin() or public.current_profile_role() = 'area_lead')
  );

revoke all on public.member_availability_slots from anon, authenticated;
grant select on public.member_availability_slots to authenticated;
grant insert (user_id, weekday, hour_start) on public.member_availability_slots to authenticated;
grant delete on public.member_availability_slots to authenticated;

revoke all on public.team_shifts from anon, authenticated;
grant select on public.team_shifts to authenticated;
grant insert (title, shift_date, start_time, end_time, assigned_user_id, notes) on public.team_shifts to authenticated;
grant update (title, shift_date, start_time, end_time, assigned_user_id, notes) on public.team_shifts to authenticated;
grant delete on public.team_shifts to authenticated;

-- Autoria/timestamps não são fornecidos nem alteráveis pelo cliente.
create or replace function public.set_team_shift_actor()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.set_team_shift_actor() from public, anon, authenticated;

create trigger team_shifts_set_actor
  before insert or update on public.team_shifts
  for each row execute function public.set_team_shift_actor();

-- A atribuição somente é válida quando cada bloco recorrente da data está marcado.
-- Função invoker (não SECURITY DEFINER) e referências totalmente qualificadas.
create or replace function public.check_team_shift_availability()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_hour time without time zone;
  v_weekday integer;
begin
  if new.assigned_user_id is null then
    return new;
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.user_id = new.assigned_user_id and p.status = 'active'
  ) then
    raise exception 'A pessoa atribuída precisa ter perfil ativo.' using errcode = '23514';
  end if;

  v_weekday := extract(isodow from new.shift_date)::integer;
  v_hour := new.start_time;
  while v_hour < new.end_time loop
    if not exists (
      select 1 from public.member_availability_slots s
      where s.user_id = new.assigned_user_id
        and s.weekday = v_weekday
        and s.hour_start = v_hour
    ) then
      raise exception 'A pessoa atribuída não possui disponibilidade para todos os horários da escala.'
        using errcode = '23514';
    end if;
    v_hour := v_hour + interval '1 hour';
  end loop;

  return new;
end;
$$;
revoke all on function public.check_team_shift_availability() from public, anon, authenticated;

create trigger team_shifts_check_availability
  before insert or update of assigned_user_id, shift_date, start_time, end_time on public.team_shifts
  for each row execute function public.check_team_shift_availability();

commit;
