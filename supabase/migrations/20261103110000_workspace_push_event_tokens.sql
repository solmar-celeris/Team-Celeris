-- SolMar Celeris · vínculo transacional entre atividade/comunicado e evento de push
-- Aplicar após 20261103103000_workspace_push_events.sql. Não altera conteúdo nem dispara pushes.

begin;

alter table public.announcements
  add column if not exists push_event_id uuid;

alter table public.activities
  add column if not exists push_event_id uuid;

-- Se uma conta ou área for removida, descartar o evento pendente em vez de ampliar o público.
alter table public.workspace_push_events
  drop constraint if exists workspace_push_events_target_user_id_fkey;
alter table public.workspace_push_events
  add constraint workspace_push_events_target_user_id_fkey
  foreign key (target_user_id) references auth.users(id) on delete cascade;

alter table public.workspace_push_events
  drop constraint if exists workspace_push_events_target_area_id_fkey;
alter table public.workspace_push_events
  add constraint workspace_push_events_target_area_id_fkey
  foreign key (target_area_id) references public.areas(id) on delete cascade;

comment on column public.announcements.push_event_id is
  'Token efêmero do evento de push de comunicado; não contém destinatários nem conteúdo.';
comment on column public.activities.push_event_id is
  'Token efêmero do evento de push da atribuição atual; muda somente quando o responsável muda.';

create or replace function public.stamp_workspace_push_event_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'announcements' then
    if tg_op = 'INSERT' then
      new.push_event_id := gen_random_uuid();
    else
      new.push_event_id := old.push_event_id;
    end if;
  elsif tg_table_name = 'activities' then
    if tg_op = 'INSERT' then
      if new.responsible_user_id is not null and new.archived_at is null then
        new.push_event_id := gen_random_uuid();
      else
        new.push_event_id := null;
      end if;
    elsif old.responsible_user_id is distinct from new.responsible_user_id then
      if new.responsible_user_id is not null and new.archived_at is null then
        new.push_event_id := gen_random_uuid();
      else
        new.push_event_id := null;
      end if;
    else
      new.push_event_id := old.push_event_id;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.stamp_workspace_push_event_id() from public, anon, authenticated;

drop trigger if exists announcements_stamp_workspace_push_event_id on public.announcements;
create trigger announcements_stamp_workspace_push_event_id
  before insert or update on public.announcements
  for each row execute function public.stamp_workspace_push_event_id();

drop trigger if exists activities_stamp_workspace_push_event_id on public.activities;
create trigger activities_stamp_workspace_push_event_id
  before insert or update on public.activities
  for each row execute function public.stamp_workspace_push_event_id();

create or replace function public.enqueue_workspace_push_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null or not public.is_active_member() then
    return new;
  end if;

  if tg_table_name = 'announcements' then
    if tg_op = 'INSERT' and new.removed_at is null and new.push_event_id is not null then
      insert into public.workspace_push_events (
        id, event_type, entity_id, actor_id, target_area_id
      ) values (
        new.push_event_id, 'announcement_created', new.id, v_actor_id, new.audience_area_id
      ) on conflict (id) do nothing;
    end if;
  elsif tg_table_name = 'activities' then
    if new.push_event_id is not null and new.responsible_user_id is not null
      and new.archived_at is null and (
        tg_op = 'INSERT' or
        (tg_op = 'UPDATE' and old.responsible_user_id is distinct from new.responsible_user_id)
      ) then
      insert into public.workspace_push_events (
        id, event_type, entity_id, actor_id, target_user_id
      ) values (
        new.push_event_id, 'activity_assigned', new.id, v_actor_id, new.responsible_user_id
      ) on conflict (id) do nothing;
    end if;
  end if;

  return new;
end;
$$;
revoke all on function public.enqueue_workspace_push_event() from public, anon, authenticated;

commit;
