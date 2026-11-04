-- Team Celeris: conversas diretas 1:1 e calendário de eventos da equipe.
-- Aplicar após migrations de chat/grupos/perfil já existentes. Não desativa RLS.
begin;

create table if not exists public.team_chat_direct_conversations (
  id uuid primary key default gen_random_uuid(),
  user_a_id uuid not null references auth.users(id) on delete cascade,
  user_b_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint team_chat_direct_pair_order check (user_a_id < user_b_id),
  constraint team_chat_direct_pair_unique unique (user_a_id, user_b_id)
);

alter table public.team_chat_messages
  add column if not exists dm_conversation_id uuid references public.team_chat_direct_conversations(id) on delete cascade;
do $migration$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'team_chat_message_single_destination'
      and conrelid = 'public.team_chat_messages'::regclass
  ) then
    alter table public.team_chat_messages
      add constraint team_chat_message_single_destination
      check (group_id is null or dm_conversation_id is null);
  end if;
end
$migration$;
create index if not exists team_chat_messages_dm_created_idx
  on public.team_chat_messages (dm_conversation_id, created_at desc, id desc)
  where dm_conversation_id is not null;

alter table public.team_chat_direct_conversations enable row level security;
revoke all on public.team_chat_direct_conversations from public, anon, authenticated;
grant select on public.team_chat_direct_conversations to authenticated;

drop policy if exists team_chat_direct_conversations_read_participants on public.team_chat_direct_conversations;
create policy team_chat_direct_conversations_read_participants
  on public.team_chat_direct_conversations for select to authenticated
  using (
    public.is_active_member()
    and (user_a_id = (select auth.uid()) or user_b_id = (select auth.uid()))
  );

create or replace function public.is_team_chat_direct_member(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_member() and exists (
    select 1
    from public.team_chat_direct_conversations c
    where c.id = p_conversation_id
      and ((c.user_a_id = (select auth.uid())) or (c.user_b_id = (select auth.uid())))
  )
$$;
revoke all on function public.is_team_chat_direct_member(uuid) from public, anon;
grant execute on function public.is_team_chat_direct_member(uuid) to authenticated;

create or replace function public.get_or_create_team_chat_direct_conversation(p_other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_a uuid;
  v_user_b uuid;
  v_conversation_id uuid;
begin
  if auth.uid() is null or not public.is_active_member() then
    raise exception 'Somente integrantes ativos podem iniciar conversas privadas.' using errcode = '42501';
  end if;
  if p_other_user_id is null or p_other_user_id = auth.uid() then
    raise exception 'Escolha outra pessoa para iniciar uma conversa privada.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.user_id = p_other_user_id and p.status = 'active'
  ) then
    raise exception 'A outra pessoa não possui um perfil ativo.' using errcode = '42501';
  end if;
  v_user_a := least(auth.uid(), p_other_user_id);
  v_user_b := greatest(auth.uid(), p_other_user_id);
  insert into public.team_chat_direct_conversations (user_a_id, user_b_id)
  values (v_user_a, v_user_b)
  on conflict (user_a_id, user_b_id) do nothing;
  select c.id into v_conversation_id
  from public.team_chat_direct_conversations c
  where c.user_a_id = v_user_a and c.user_b_id = v_user_b;
  if v_conversation_id is null then
    raise exception 'Não foi possível abrir a conversa privada.' using errcode = 'P0001';
  end if;
  return v_conversation_id;
end;
$$;
revoke all on function public.get_or_create_team_chat_direct_conversation(uuid) from public, anon;
grant execute on function public.get_or_create_team_chat_direct_conversation(uuid) to authenticated;

-- Mensagens na sala geral/grupos mantêm suas regras existentes. Diretas não
-- concedem exceção administrativa: somente os dois participantes ativos leem/escrevem.
revoke all on public.team_chat_messages from anon, authenticated;
grant select on public.team_chat_messages to authenticated;
grant insert (body, group_id, dm_conversation_id) on public.team_chat_messages to authenticated;
drop policy if exists team_chat_messages_read_active on public.team_chat_messages;
create policy team_chat_messages_read_active on public.team_chat_messages
  for select to authenticated
  using (
    public.is_active_member()
    and (
      (dm_conversation_id is not null and public.is_team_chat_direct_member(dm_conversation_id))
      or
      (dm_conversation_id is null and (group_id is null or public.is_team_admin() or public.is_team_chat_group_member(group_id)))
    )
  );
drop policy if exists team_chat_messages_insert_active on public.team_chat_messages;
create policy team_chat_messages_insert_active on public.team_chat_messages
  for insert to authenticated
  with check (
    public.is_active_member()
    and sender_id = (select auth.uid())
    and removed_at is null
    and removed_by is null
    and (
      (dm_conversation_id is not null and group_id is null and public.is_team_chat_direct_member(dm_conversation_id))
      or
      (dm_conversation_id is null and (group_id is null or public.is_team_chat_group_member(group_id)))
    )
  );

-- Eventos são visíveis para membros ativos. Cada membro pode gerenciar os
-- próprios eventos; administradores podem ajustar/remover qualquer evento.
create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(pg_catalog.btrim(title)) between 2 and 140),
  event_scope text not null check (event_scope in ('internal', 'external')),
  event_kind text not null check (event_kind in ('meeting', 'training', 'dsb', 'sepex', 'technical_visit', 'pac', 'other')),
  event_date date not null,
  start_time time,
  end_time time,
  location text not null default '' check (length(location) <= 180),
  description text not null default '' check (length(description) <= 3000),
  created_by uuid not null references auth.users(id) on delete cascade,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_events_time_order check (start_time is null or end_time is null or end_time > start_time)
);
create index if not exists calendar_events_date_idx on public.calendar_events (event_date, start_time, id);
alter table public.calendar_events enable row level security;
revoke all on public.calendar_events from public, anon, authenticated;
grant select on public.calendar_events to authenticated;
grant insert (title, event_scope, event_kind, event_date, start_time, end_time, location, description) on public.calendar_events to authenticated;
grant update (title, event_scope, event_kind, event_date, start_time, end_time, location, description) on public.calendar_events to authenticated;
grant delete on public.calendar_events to authenticated;

drop policy if exists calendar_events_read_active on public.calendar_events;
create policy calendar_events_read_active on public.calendar_events for select to authenticated
  using (public.is_active_member());
drop policy if exists calendar_events_insert_active on public.calendar_events;
create policy calendar_events_insert_active on public.calendar_events for insert to authenticated
  with check (public.is_active_member() and created_by = (select auth.uid()));
drop policy if exists calendar_events_update_owner_admin on public.calendar_events;
create policy calendar_events_update_owner_admin on public.calendar_events for update to authenticated
  using (public.is_active_member() and (created_by = (select auth.uid()) or public.is_team_admin()))
  with check (public.is_active_member() and (created_by = (select auth.uid()) or public.is_team_admin()));
drop policy if exists calendar_events_delete_owner_admin on public.calendar_events;
create policy calendar_events_delete_owner_admin on public.calendar_events for delete to authenticated
  using (public.is_active_member() and (created_by = (select auth.uid()) or public.is_team_admin()));

create or replace function public.set_calendar_event_actor()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_active_member() then
    raise exception 'Somente integrantes ativos podem salvar eventos.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := pg_catalog.now();
  else
    new.created_by := old.created_by;
  end if;
  new.updated_by := auth.uid();
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;
revoke all on function public.set_calendar_event_actor() from public, anon, authenticated;
drop trigger if exists calendar_events_set_actor on public.calendar_events;
create trigger calendar_events_set_actor before insert or update on public.calendar_events
  for each row execute function public.set_calendar_event_actor();

-- Publicar apenas as novas tabelas que o cliente acompanha em tempo real.
do $realtime$
begin
  if not exists (select 1 from pg_catalog.pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'team_chat_direct_conversations') then
    execute 'alter publication supabase_realtime add table public.team_chat_direct_conversations';
  end if;
  if not exists (select 1 from pg_catalog.pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'calendar_events') then
    execute 'alter publication supabase_realtime add table public.calendar_events';
  end if;
end
$realtime$;
commit;
