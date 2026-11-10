-- Team Celeris: preferências individuais para ocultar conversas da lista.
-- Não apaga grupos, mensagens, recibos, anexos ou acesso dos demais participantes.
begin;

create table if not exists public.team_chat_user_hidden_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid references public.team_chat_groups(id) on delete cascade,
  dm_conversation_id uuid references public.team_chat_direct_conversations(id) on delete cascade,
  hidden_at timestamptz not null default now(),
  constraint team_chat_user_hidden_exactly_one_target check (
    (group_id is not null)::integer + (dm_conversation_id is not null)::integer = 1
  )
);

create unique index if not exists team_chat_user_hidden_group_unique
  on public.team_chat_user_hidden_conversations (user_id, group_id)
  where group_id is not null;
create unique index if not exists team_chat_user_hidden_direct_unique
  on public.team_chat_user_hidden_conversations (user_id, dm_conversation_id)
  where dm_conversation_id is not null;
create index if not exists team_chat_user_hidden_user_idx
  on public.team_chat_user_hidden_conversations (user_id, hidden_at desc);

alter table public.team_chat_user_hidden_conversations enable row level security;
revoke all on public.team_chat_user_hidden_conversations from public, anon, authenticated;
grant select, delete on public.team_chat_user_hidden_conversations to authenticated;
grant insert (user_id, group_id, dm_conversation_id) on public.team_chat_user_hidden_conversations to authenticated;

drop policy if exists team_chat_user_hidden_select_own on public.team_chat_user_hidden_conversations;
create policy team_chat_user_hidden_select_own
  on public.team_chat_user_hidden_conversations for select to authenticated
  using (public.is_active_member() and user_id = (select auth.uid()));

drop policy if exists team_chat_user_hidden_insert_own_visible on public.team_chat_user_hidden_conversations;
create policy team_chat_user_hidden_insert_own_visible
  on public.team_chat_user_hidden_conversations for insert to authenticated
  with check (
    public.is_active_member()
    and user_id = (select auth.uid())
    and (
      (group_id is not null and dm_conversation_id is null
        and (public.is_team_admin() or public.is_team_chat_group_member(group_id)))
      or
      (dm_conversation_id is not null and group_id is null
        and public.is_team_chat_direct_member(dm_conversation_id))
    )
  );

drop policy if exists team_chat_user_hidden_delete_own on public.team_chat_user_hidden_conversations;
create policy team_chat_user_hidden_delete_own
  on public.team_chat_user_hidden_conversations for delete to authenticated
  using (public.is_active_member() and user_id = (select auth.uid()));

commit;
