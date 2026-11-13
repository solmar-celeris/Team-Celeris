-- SolMar Celeris · chat coletivo em tempo real
-- Execute após a migração inicial no Supabase correto. Não contém chaves ou segredos.
-- Se já há outras migrações incrementais pendentes, siga a ordem documentada.

begin;

create table if not exists public.team_chat_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references auth.users(id) on delete set null,
  body text not null check (length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid references auth.users(id) on delete set null,
  constraint team_chat_removed_body_scrubbed check (
    removed_at is null or body = '[Mensagem removida pelo administrador]'
  )
);

create index if not exists team_chat_messages_created_at_id
  on public.team_chat_messages (created_at desc, id desc);

alter table public.team_chat_messages enable row level security;

-- O cliente só lê e cria mensagens; UPDATE/DELETE ficam revogados.
revoke all on public.team_chat_messages from anon, authenticated;
grant select on public.team_chat_messages to authenticated;
grant insert (body) on public.team_chat_messages to authenticated;

drop policy if exists team_chat_messages_read_active on public.team_chat_messages;
create policy team_chat_messages_read_active on public.team_chat_messages
  for select to authenticated
  using (public.is_active_member());

drop policy if exists team_chat_messages_insert_active on public.team_chat_messages;
create policy team_chat_messages_insert_active on public.team_chat_messages
  for insert to authenticated
  with check (
    public.is_active_member()
    and sender_id = auth.uid()
    and removed_at is null
    and removed_by is null
  );

create or replace function public.set_team_chat_author()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.sender_id := auth.uid();
  new.created_at := pg_catalog.now();
  new.removed_at := null;
  new.removed_by := null;
  return new;
end;
$$;
revoke all on function public.set_team_chat_author() from public, anon, authenticated;
drop trigger if exists team_chat_set_author on public.team_chat_messages;
create trigger team_chat_set_author
  before insert on public.team_chat_messages
  for each row execute function public.set_team_chat_author();

-- Apenas Administrador ativo pode remover. O corpo é substituído na mesma
-- transação; o banco guarda somente o marcador e os metadados da remoção.
create or replace function public.admin_remove_team_chat_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_team_admin() then
    raise exception 'Somente Administrador ativo pode remover mensagens.'
      using errcode = '42501';
  end if;

  update public.team_chat_messages
     set body = '[Mensagem removida pelo administrador]',
         removed_at = pg_catalog.now(),
         removed_by = auth.uid()
   where id = p_message_id
     and removed_at is null;

  if not found then
    raise exception 'Mensagem não encontrada ou já removida.'
      using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.admin_remove_team_chat_message(uuid) from public, anon, authenticated;
grant execute on function public.admin_remove_team_chat_message(uuid) to authenticated;

-- Realtime só transmite INSERT/UPDATE desta tabela. A policy SELECT exige perfil ativo.
do $realtime$
begin
  if not exists (
    select 1 from pg_catalog.pg_publication
    where pubname = 'supabase_realtime'
  ) then
    raise exception 'A publicação supabase_realtime não foi encontrada neste projeto Supabase.';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'team_chat_messages'
  ) then
    execute 'alter publication supabase_realtime add table public.team_chat_messages';
  end if;
end
$realtime$;

commit;
