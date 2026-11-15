-- Salas nativas de reunião do Team Celeris (LiveKit SFU).
-- O serviço de mídia não substitui autenticação/autorização do Supabase.

begin;

create table public.meeting_rooms (
  id uuid primary key default gen_random_uuid(),
  room_name text not null unique check (room_name ~ '^celeris-[a-f0-9]{32}$'),
  title text not null check (length(trim(title)) between 1 and 120),
  created_by uuid not null references auth.users(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'ended')),
  participant_limit smallint not null default 30 check (participant_limit = 30),
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  constraint meeting_rooms_ended_at_consistency check (
    (status = 'active' and ended_at is null)
    or (status = 'ended' and ended_at is not null)
  )
);

create index meeting_rooms_active_created_idx
  on public.meeting_rooms (created_at desc)
  where status = 'active';

alter table public.meeting_rooms enable row level security;

create policy meeting_rooms_active_member_read
  on public.meeting_rooms
  for select to authenticated
  using (public.is_active_member());

create policy meeting_rooms_member_create
  on public.meeting_rooms
  for insert to authenticated
  with check (
    public.is_active_member()
    and created_by = (select auth.uid())
    and status = 'active'
    and ended_at is null
    and participant_limit = 30
  );

create policy meeting_rooms_owner_or_admin_update
  on public.meeting_rooms
  for update to authenticated
  using (
    public.is_active_member()
    and (created_by = (select auth.uid()) or public.is_team_admin())
  )
  with check (
    public.is_active_member()
    and (created_by = (select auth.uid()) or public.is_team_admin())
  );

revoke all on public.meeting_rooms from anon, authenticated;
grant select on public.meeting_rooms to authenticated;
grant insert (room_name, title, created_by) on public.meeting_rooms to authenticated;
grant update (status, ended_at) on public.meeting_rooms to authenticated;

-- Impede que o cliente altere autoria, limite ou timestamps.
create or replace function public.protect_meeting_room_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
    new.participant_limit := 30;
    new.status := 'active';
    new.ended_at := null;
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.room_name := old.room_name;
    new.participant_limit := 30;
    if old.status = 'ended' then
      new.status := 'ended';
      new.ended_at := old.ended_at;
    elsif new.status = 'ended' then
      new.ended_at := now();
    else
      new.status := 'active';
      new.ended_at := null;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.protect_meeting_room_fields() from public, anon, authenticated;

create trigger meeting_rooms_protect_fields
  before insert or update on public.meeting_rooms
  for each row execute function public.protect_meeting_room_fields();

commit;
