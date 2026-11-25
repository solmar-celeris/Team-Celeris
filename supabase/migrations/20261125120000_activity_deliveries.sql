-- Registros permanentes de entregas vinculados aos cartões do Kanban.
begin;

create table if not exists public.activity_deliveries (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  description text not null check (char_length(trim(description)) between 1 and 10000),
  actor_id uuid references auth.users(id) on delete set null default auth.uid(),
  actor_name text not null default 'Integrante',
  created_at timestamptz not null default now(),
  google_doc_id text,
  google_doc_url text,
  unique (id, activity_id),
  constraint activity_deliveries_google_doc_url_check
    check (google_doc_url is null or google_doc_url ~ '^https://docs[.]google[.]com/document/d/')
);

create index if not exists activity_deliveries_activity_time
  on public.activity_deliveries(activity_id, created_at desc, id desc);

alter table public.activity_attachments
  add column if not exists delivery_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'activity_attachments_delivery_activity_fkey'
      and conrelid = 'public.activity_attachments'::regclass
  ) then
    alter table public.activity_attachments
      add constraint activity_attachments_delivery_activity_fkey
      foreign key (delivery_id, activity_id)
      references public.activity_deliveries(id, activity_id)
      on delete cascade;
  end if;
end
$$;

create index if not exists activity_attachments_delivery
  on public.activity_attachments(delivery_id, created_at)
  where delivery_id is not null;

create or replace function public.set_activity_delivery_actor_name()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor_name text;
begin
  new.actor_id := coalesce(new.actor_id, auth.uid());
  if new.actor_id is distinct from auth.uid() then
    raise exception 'A entrega deve ser registrada pelo usuário autenticado.'
      using errcode = '42501';
  end if;

  select nullif(trim(p.full_name), '')
    into v_actor_name
    from public.profiles p
   where p.user_id = new.actor_id;

  new.actor_name := coalesce(v_actor_name, 'Integrante');
  return new;
end;
$$;

drop trigger if exists activity_deliveries_set_actor on public.activity_deliveries;
create trigger activity_deliveries_set_actor
before insert on public.activity_deliveries
for each row execute function public.set_activity_delivery_actor_name();

alter table public.activity_deliveries enable row level security;

drop policy if exists activity_deliveries_read_active on public.activity_deliveries;
create policy activity_deliveries_read_active
on public.activity_deliveries
for select to authenticated
using (
  public.is_active_member()
  and exists (
    select 1
      from public.activities a
     where a.id = activity_deliveries.activity_id
       and a.archived_at is null
       and public.can_access_workspace_area(a.area_id)
  )
);

drop policy if exists activity_deliveries_insert_editors on public.activity_deliveries;
create policy activity_deliveries_insert_editors
on public.activity_deliveries
for insert to authenticated
with check (
  public.is_active_member()
  and actor_id = auth.uid()
  and public.can_edit_activity(activity_id)
);

revoke all on public.activity_deliveries from public, anon, authenticated;
grant select, insert on public.activity_deliveries to authenticated;
grant select on public.activity_attachments to authenticated;
grant insert, delete on public.activity_attachments to authenticated;

comment on table public.activity_deliveries is
  'Histórico append-only de entregas realizadas em cada cartão de atividade. Cada registro preserva descrição, autor e data; os documentos Google são associados quando a integração OAuth estiver configurada.';

commit;
