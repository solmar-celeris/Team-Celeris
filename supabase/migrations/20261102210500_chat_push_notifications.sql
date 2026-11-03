-- SolMar Celeris · log mínimo e deduplicação de push do Chat
-- Aplicar depois de 20261102135200_team_chat.sql e 20261102161000_team_chat_groups.sql.
-- Não armazena o corpo da mensagem nem segredos OneSignal.

begin;

create table if not exists public.chat_push_delivery_log (
  message_id uuid primary key references public.team_chat_messages(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  status text not null check (status in ('processing', 'sent', 'skipped', 'failed')),
  attempt_count integer not null default 1 check (attempt_count > 0),
  recipient_count integer not null default 0 check (recipient_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.chat_push_delivery_log enable row level security;
revoke all on public.chat_push_delivery_log from public, anon, authenticated;
grant select, insert, update on public.chat_push_delivery_log to service_role;

commit;
