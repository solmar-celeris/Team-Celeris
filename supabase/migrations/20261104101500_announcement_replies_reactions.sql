-- SolMar Celeris · respostas e reações aos comunicados
-- Aplicar uma única vez no projeto Supabase conectado ao site, após as migrations base de comunicados.
-- Mantém o acesso limitado a perfis ativos e não altera remoção, publicação ou audiência dos comunicados.

begin;

create table if not exists public.announcement_replies (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  author_id uuid default auth.uid() references auth.users(id) on delete set null,
  body text not null check (length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid references auth.users(id) on delete set null,
  constraint announcement_replies_removed_body_scrubbed check (
    removed_at is null or body = '[Resposta removida]'
  )
);

create index if not exists announcement_replies_feed
  on public.announcement_replies (announcement_id, created_at, id)
  where removed_at is null;

alter table public.announcement_replies enable row level security;
revoke all on public.announcement_replies from public, anon, authenticated;
grant select on public.announcement_replies to authenticated;
grant insert (announcement_id, body) on public.announcement_replies to authenticated;

drop policy if exists announcement_replies_read_active on public.announcement_replies;
create policy announcement_replies_read_active on public.announcement_replies
  for select to authenticated
  using (
    public.is_active_member()
    and removed_at is null
    and exists (
      select 1 from public.announcements a
      where a.id = announcement_id and a.removed_at is null
    )
  );

drop policy if exists announcement_replies_insert_active on public.announcement_replies;
create policy announcement_replies_insert_active on public.announcement_replies
  for insert to authenticated
  with check (
    public.is_active_member()
    and author_id = auth.uid()
    and removed_at is null
    and removed_by is null
    and exists (
      select 1 from public.announcements a
      where a.id = announcement_id and a.removed_at is null
    )
  );

create or replace function public.set_announcement_reply_actor()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.author_id := auth.uid();
  new.created_at := pg_catalog.now();
  new.removed_at := null;
  new.removed_by := null;
  return new;
end;
$$;
revoke all on function public.set_announcement_reply_actor() from public, anon, authenticated;
drop trigger if exists announcement_replies_set_actor on public.announcement_replies;
create trigger announcement_replies_set_actor
  before insert on public.announcement_replies
  for each row execute function public.set_announcement_reply_actor();

-- A pessoa autora pode remover a própria resposta; Administrador ativo pode moderar qualquer resposta.
-- O corpo é substituído por um marcador para que o texto removido não continue disponível.
create or replace function public.remove_announcement_reply(p_reply_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author_id uuid;
begin
  if auth.uid() is null or not public.is_active_member() then
    raise exception 'Perfil ativo necessário.' using errcode = '42501';
  end if;

  select author_id into v_author_id
    from public.announcement_replies
    where id = p_reply_id and removed_at is null
    for update;

  if not found then
    raise exception 'A resposta não existe ou já foi removida.' using errcode = 'P0002';
  end if;

  if v_author_id is distinct from auth.uid() and not public.is_team_admin() then
    raise exception 'Somente a pessoa autora ou um Administrador ativo pode remover esta resposta.'
      using errcode = '42501';
  end if;

  update public.announcement_replies
    set body = '[Resposta removida]',
        removed_at = pg_catalog.now(),
        removed_by = auth.uid()
    where id = p_reply_id and removed_at is null;
end;
$$;
revoke all on function public.remove_announcement_reply(uuid) from public, anon, authenticated;
grant execute on function public.remove_announcement_reply(uuid) to authenticated;

create table if not exists public.announcement_reactions (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '😂', '👏', '🔥')),
  created_at timestamptz not null default now(),
  constraint announcement_reactions_one_per_user unique (announcement_id, user_id, emoji)
);

create index if not exists announcement_reactions_feed
  on public.announcement_reactions (announcement_id, emoji);

alter table public.announcement_reactions enable row level security;
revoke all on public.announcement_reactions from public, anon, authenticated;
grant select on public.announcement_reactions to authenticated;
grant insert (announcement_id, emoji) on public.announcement_reactions to authenticated;
grant delete on public.announcement_reactions to authenticated;

drop policy if exists announcement_reactions_read_active on public.announcement_reactions;
create policy announcement_reactions_read_active on public.announcement_reactions
  for select to authenticated
  using (
    public.is_active_member()
    and exists (
      select 1 from public.announcements a
      where a.id = announcement_id and a.removed_at is null
    )
  );

drop policy if exists announcement_reactions_insert_active on public.announcement_reactions;
create policy announcement_reactions_insert_active on public.announcement_reactions
  for insert to authenticated
  with check (
    public.is_active_member()
    and user_id = auth.uid()
    and exists (
      select 1 from public.announcements a
      where a.id = announcement_id and a.removed_at is null
    )
  );

drop policy if exists announcement_reactions_delete_own on public.announcement_reactions;
create policy announcement_reactions_delete_own on public.announcement_reactions
  for delete to authenticated
  using (
    public.is_active_member()
    and user_id = auth.uid()
    and exists (
      select 1 from public.announcements a
      where a.id = announcement_id and a.removed_at is null
    )
  );

-- Os novos comentários e reações chegam em tempo real; leitores ativos continuam sujeitos ao RLS.
do $realtime$
begin
  if not exists (
    select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime'
  ) then
    raise exception 'A publicação supabase_realtime não foi encontrada neste projeto Supabase.';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'announcement_replies'
  ) then
    execute 'alter publication supabase_realtime add table public.announcement_replies';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'announcement_reactions'
  ) then
    execute 'alter publication supabase_realtime add table public.announcement_reactions';
  end if;
end
$realtime$;

commit;
