-- Fluxo Scrumban, limites WIP configuráveis e anexos de atividades.
-- Incremental/idempotente; não altera o status semanal existente.
begin;

do $backfill$
begin
  if not exists (
    select 1 from pg_catalog.pg_attribute
    where attrelid = 'public.activities'::regclass and attname = 'flow_status' and not attisdropped
  ) then
    -- O default constante preenche registros atuais sem UPDATE/triggers; ajuste logo após para novas tarefas.
    alter table public.activities add column flow_status text not null default 'ready';
  else
    alter table public.activities add column if not exists flow_status text not null default 'ready';
  end if;
  alter table public.activities alter column flow_status set default 'backlog';
end
$backfill$;

alter table public.activities
  add column if not exists priority text not null default 'medium',
  add column if not exists effort_points smallint,
  add column if not exists blocked_reason text not null default '';

do $constraints$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conname = 'activities_flow_status_check' and conrelid = 'public.activities'::regclass) then
    alter table public.activities add constraint activities_flow_status_check check (flow_status in ('backlog','ready','in_progress','blocked','done'));
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conname = 'activities_priority_check' and conrelid = 'public.activities'::regclass) then
    alter table public.activities add constraint activities_priority_check check (priority in ('low','medium','high','urgent'));
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conname = 'activities_effort_points_check' and conrelid = 'public.activities'::regclass) then
    alter table public.activities add constraint activities_effort_points_check check (effort_points is null or effort_points between 0 and 100);
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conname = 'activities_blocked_reason_check' and conrelid = 'public.activities'::regclass) then
    alter table public.activities add constraint activities_blocked_reason_check check (flow_status <> 'blocked' or length(trim(blocked_reason)) > 0);
  end if;
end
$constraints$;

create index if not exists activities_flow_area on public.activities(area_id, flow_status) where archived_at is null;

create table if not exists public.activity_flow_wip_limits (
  area_id uuid not null references public.areas(id) on delete cascade,
  flow_status text not null check (flow_status in ('backlog','ready','in_progress','blocked','done')),
  limit_count integer check (limit_count is null or limit_count >= 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (area_id, flow_status)
);

create table if not exists public.activity_attachments (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  kind text not null check (kind in ('file','drive_link')),
  storage_path text unique,
  content_type text,
  file_name text not null check (length(trim(file_name)) between 1 and 240),
  file_size bigint,
  drive_url text,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint activity_attachment_consistent check (
    (kind = 'file' and storage_path is not null and content_type is not null and content_type in (
      'image/jpeg','image/png','image/gif','image/webp','image/heic','image/heif',
      'application/pdf','text/plain','text/csv',
      'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ) and file_size is not null and file_size between 1 and 15728640 and drive_url is null)
    or
    (kind = 'drive_link' and storage_path is null and content_type is null and file_size is null
      and drive_url is not null and drive_url ~ '^https://(drive[.]google[.]com|docs[.]google[.]com)(/|$)'
      and length(drive_url) <= 2048)
  ),
  constraint activity_attachment_storage_path_safe check (
    storage_path is null or storage_path ~ '^[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}[.](jpg|jpeg|png|gif|webp|heic|heif|pdf|txt|csv|doc|docx|xls|xlsx|ppt|pptx)$'
  )
);
create index if not exists activity_attachments_activity on public.activity_attachments(activity_id, created_at);

alter table public.activity_flow_wip_limits enable row level security;
alter table public.activity_attachments enable row level security;

drop policy if exists activity_flow_wip_read_active on public.activity_flow_wip_limits;
create policy activity_flow_wip_read_active on public.activity_flow_wip_limits for select to authenticated
  using (public.is_active_member());
drop policy if exists activity_flow_wip_admin_insert on public.activity_flow_wip_limits;
create policy activity_flow_wip_admin_insert on public.activity_flow_wip_limits for insert to authenticated
  with check (public.is_active_member() and public.is_team_admin());
drop policy if exists activity_flow_wip_admin_update on public.activity_flow_wip_limits;
create policy activity_flow_wip_admin_update on public.activity_flow_wip_limits for update to authenticated
  using (public.is_active_member() and public.is_team_admin()) with check (public.is_active_member() and public.is_team_admin());

drop policy if exists activity_attachments_read_active on public.activity_attachments;
create policy activity_attachments_read_active on public.activity_attachments for select to authenticated
  using (public.is_active_member() and exists (
    select 1 from public.activities a where a.id = activity_id and a.archived_at is null
  ));
drop policy if exists activity_attachments_insert_editors on public.activity_attachments;
create policy activity_attachments_insert_editors on public.activity_attachments for insert to authenticated
  with check (public.is_active_member() and created_by = auth.uid() and public.can_edit_activity(activity_id));
drop policy if exists activity_attachments_delete_editors on public.activity_attachments;
create policy activity_attachments_delete_editors on public.activity_attachments for delete to authenticated
  using (public.is_active_member() and public.can_edit_activity(activity_id));

-- Nenhum status de fluxo pode ser alterado por UPDATE direto, inclusive por administradores.
-- A edição normal da atividade continua liberada nas demais colunas atuais.
revoke update on public.activities from authenticated;
grant update (
  area_id, name, description, activity_type, frequency, execution_condition,
  responsible_name, responsible_user_id, start_date, due_date,
  expected_deliverable, notes, priority, effort_points, archived_at
) on public.activities to authenticated;

grant select on public.activity_flow_wip_limits, public.activity_attachments to authenticated;
grant insert, update on public.activity_flow_wip_limits to authenticated;
grant insert, delete on public.activity_attachments to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'activity-attachments', 'activity-attachments', false, 15728640,
  array[
    'image/jpeg','image/png','image/gif','image/webp','image/heic','image/heif',
    'application/pdf','text/plain','text/csv',
    'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]::text[]
)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists activity_attachments_storage_insert_editors on storage.objects;
create policy activity_attachments_storage_insert_editors on storage.objects for insert to authenticated
  with check (
    bucket_id = 'activity-attachments' and public.is_active_member()
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ '^[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}[.](jpg|jpeg|png|gif|webp|heic|heif|pdf|txt|csv|doc|docx|xls|xlsx|ppt|pptx)$'
    and public.can_edit_activity(((storage.foldername(name))[2])::uuid)
  );
drop policy if exists activity_attachments_storage_read_visible on storage.objects;
create policy activity_attachments_storage_read_visible on storage.objects for select to authenticated
  using (
    bucket_id = 'activity-attachments' and public.is_active_member()
    and exists (select 1 from public.activity_attachments a join public.activities p on p.id = a.activity_id
      where a.storage_path = storage.objects.name and p.archived_at is null)
  );
drop policy if exists activity_attachments_storage_delete_editors on storage.objects;
create policy activity_attachments_storage_delete_editors on storage.objects for delete to authenticated
  using (
    bucket_id = 'activity-attachments' and public.is_active_member()
    and public.can_edit_activity(((storage.foldername(name))[2])::uuid)
  );

create or replace function public.move_activity_flow(p_activity_id uuid, p_flow_status text, p_blocked_reason text default '')
returns public.activities
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_activity public.activities%rowtype;
  v_limit integer;
  v_current_count integer;
begin
  if auth.uid() is null or not public.is_active_member() then
    raise exception 'Apenas integrantes ativos podem alterar o fluxo.' using errcode = '42501';
  end if;
  if p_flow_status is null or p_flow_status not in ('backlog','ready','in_progress','blocked','done') then
    raise exception 'Etapa de fluxo inválida.' using errcode = '22023';
  end if;
  select * into v_activity from public.activities where id = p_activity_id for update;
  if not found or v_activity.archived_at is not null then
    raise exception 'Atividade não encontrada ou arquivada.' using errcode = 'P0002';
  end if;
  if not public.can_edit_activity(p_activity_id) then
    raise exception 'Você não tem permissão para alterar o fluxo desta atividade.' using errcode = '42501';
  end if;
  if p_flow_status = 'blocked' and length(trim(coalesce(p_blocked_reason, ''))) = 0 then
    raise exception 'Informe o motivo do bloqueio.' using errcode = '22023';
  end if;
  if v_activity.flow_status = p_flow_status then
    if p_flow_status = 'blocked' then
      update public.activities set blocked_reason = trim(p_blocked_reason) where id = p_activity_id returning * into v_activity;
    end if;
    return v_activity;
  end if;
  if not (
    (v_activity.flow_status = 'backlog' and p_flow_status = 'ready') or
    (v_activity.flow_status = 'ready' and p_flow_status = 'in_progress') or
    (v_activity.flow_status = 'in_progress' and p_flow_status in ('blocked','done')) or
    (v_activity.flow_status = 'blocked' and p_flow_status in ('ready','in_progress')) or
    (v_activity.flow_status = 'done' and p_flow_status = 'in_progress')
  ) then
    raise exception 'Transição não permitida de % para %.', v_activity.flow_status, p_flow_status using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_activity.area_id::text || ':' || p_flow_status, 0));
  select limit_count into v_limit from public.activity_flow_wip_limits
    where area_id = v_activity.area_id and flow_status = p_flow_status;
  if v_limit is not null then
    select count(*)::integer into v_current_count from public.activities
      where area_id = v_activity.area_id and flow_status = p_flow_status and archived_at is null and id <> p_activity_id;
    if v_current_count >= v_limit then
      raise exception 'Limite WIP da etapa % atingido nesta área.', p_flow_status using errcode = '23514';
    end if;
  end if;
  update public.activities set
    flow_status = p_flow_status,
    blocked_reason = case when p_flow_status = 'blocked' then trim(p_blocked_reason) else '' end
  where id = p_activity_id returning * into v_activity;
  return v_activity;
end;
$$;
revoke all on function public.move_activity_flow(uuid, text, text) from public, anon;
grant execute on function public.move_activity_flow(uuid, text, text) to authenticated;

commit;
