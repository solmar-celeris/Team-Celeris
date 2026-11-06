-- Team Celeris: anexos privados, links do Drive e enquetes em Comunicados.
-- Migration incremental; não modifica o schema inicial nem executa operações remotas.
begin;

create table if not exists public.announcement_attachments (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  uploaded_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null check (length(trim(file_name)) between 1 and 240),
  content_type text not null check (content_type in (
    'image/jpeg','image/png','image/gif','image/webp','image/heic','image/heif',
    'application/pdf','text/plain','text/csv',
    'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation'
  )),
  file_size bigint not null check (file_size between 1 and 15728640),
  created_at timestamptz not null default now(),
  constraint announcement_attachment_storage_path_matches_actor check (
    storage_path ~ ('^' || uploaded_by::text || '/[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}[.](jpg|jpeg|png|gif|webp|heic|heif|pdf|txt|csv|doc|docx|xls|xlsx|ppt|pptx)$')
  )
);
create index if not exists announcement_attachments_parent on public.announcement_attachments(announcement_id, created_at);
alter table public.announcement_attachments enable row level security;
revoke all on public.announcement_attachments from public, anon, authenticated;
grant select on public.announcement_attachments to authenticated;
grant insert (announcement_id, storage_path, file_name, content_type, file_size) on public.announcement_attachments to authenticated;
grant delete on public.announcement_attachments to authenticated;
create policy announcement_attachments_read_active on public.announcement_attachments
  for select to authenticated using (
    public.is_active_member() and exists (
      select 1 from public.announcements a where a.id = announcement_id and a.removed_at is null
    )
  );
create policy announcement_attachments_add_author_admin on public.announcement_attachments
  for insert to authenticated with check (
    public.is_active_member() and uploaded_by = auth.uid() and exists (
      select 1 from public.announcements a where a.id = announcement_id and a.removed_at is null
        and (a.author_id = auth.uid() or public.is_team_admin())
    )
  );
create policy announcement_attachments_remove_author_admin on public.announcement_attachments
  for delete to authenticated using (
    public.is_active_member() and exists (
      select 1 from public.announcements a where a.id = announcement_id and a.removed_at is null
        and (a.author_id = auth.uid() or public.is_team_admin())
    )
  );

create table if not exists public.announcement_drive_links (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  added_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 180),
  url text not null check (url ~ '^https://(drive|docs)[.]google[.]com/'),
  created_at timestamptz not null default now()
);
create index if not exists announcement_drive_links_parent on public.announcement_drive_links(announcement_id, created_at);
alter table public.announcement_drive_links enable row level security;
revoke all on public.announcement_drive_links from public, anon, authenticated;
grant select on public.announcement_drive_links to authenticated;
grant insert (announcement_id, name, url) on public.announcement_drive_links to authenticated;
grant delete on public.announcement_drive_links to authenticated;
create policy announcement_drive_links_read_active on public.announcement_drive_links
  for select to authenticated using (
    public.is_active_member() and exists (
      select 1 from public.announcements a where a.id = announcement_id and a.removed_at is null
    )
  );
create policy announcement_drive_links_add_author_admin on public.announcement_drive_links
  for insert to authenticated with check (
    public.is_active_member() and added_by = auth.uid() and exists (
      select 1 from public.announcements a where a.id = announcement_id and a.removed_at is null
        and (a.author_id = auth.uid() or public.is_team_admin())
    )
  );
create policy announcement_drive_links_remove_author_admin on public.announcement_drive_links
  for delete to authenticated using (
    public.is_active_member() and exists (
      select 1 from public.announcements a where a.id = announcement_id and a.removed_at is null
        and (a.author_id = auth.uid() or public.is_team_admin())
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('announcement-attachments','announcement-attachments',false,15728640,array[
  'image/jpeg','image/png','image/gif','image/webp','image/heic','image/heif',
  'application/pdf','text/plain','text/csv',
  'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation'
]::text[])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists announcement_attachments_storage_upload on storage.objects;
create policy announcement_attachments_storage_upload on storage.objects for insert to authenticated with check (
  bucket_id='announcement-attachments' and public.is_active_member()
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and name ~ '^[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}[.](jpg|jpeg|png|gif|webp|heic|heif|pdf|txt|csv|doc|docx|xls|xlsx|ppt|pptx)$'
  and exists (
    select 1 from public.announcements a
    where a.id = split_part(name,'/',2)::uuid and a.removed_at is null
      and (a.author_id=auth.uid() or public.is_team_admin())
  )
);
drop policy if exists announcement_attachments_storage_read_visible on storage.objects;
create policy announcement_attachments_storage_read_visible on storage.objects for select to authenticated using (
  bucket_id='announcement-attachments' and public.is_active_member() and exists (
    select 1 from public.announcement_attachments f join public.announcements a on a.id=f.announcement_id
    where f.storage_path=storage.objects.name and a.removed_at is null
  )
);
drop policy if exists announcement_attachments_storage_delete_author_admin on storage.objects;
create policy announcement_attachments_storage_delete_author_admin on storage.objects for delete to authenticated using (
  bucket_id='announcement-attachments' and public.is_active_member() and exists (
    select 1 from public.announcement_attachments f join public.announcements a on a.id=f.announcement_id
    where f.storage_path=storage.objects.name and a.removed_at is null
      and (a.author_id=auth.uid() or public.is_team_admin())
  )
);

create table if not exists public.announcement_polls (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null unique references public.announcements(id) on delete cascade,
  question text not null check (length(trim(question)) between 1 and 500),
  allow_multiple boolean not null default false,
  closed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint announcement_poll_close_consistent check ((closed_at is null) = (closed_by is null))
);
create table if not exists public.announcement_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.announcement_polls(id) on delete cascade,
  label text not null check (length(trim(label)) between 1 and 240),
  position smallint not null check (position between 1 and 8),
  unique (poll_id, position), unique (poll_id, id)
);
create table if not exists public.announcement_poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.announcement_polls(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (poll_id, user_id)
);
create table if not exists public.announcement_poll_selections (
  poll_id uuid not null,
  user_id uuid not null,
  option_id uuid not null,
  primary key (poll_id, user_id, option_id),
  foreign key (poll_id, user_id) references public.announcement_poll_votes(poll_id,user_id) on delete cascade,
  foreign key (poll_id, option_id) references public.announcement_poll_options(poll_id,id) on delete cascade
);
create index if not exists announcement_poll_options_order on public.announcement_poll_options(poll_id,position);
create index if not exists announcement_poll_selections_option on public.announcement_poll_selections(poll_id,option_id);

alter table public.announcement_polls enable row level security;
alter table public.announcement_poll_options enable row level security;
alter table public.announcement_poll_votes enable row level security;
alter table public.announcement_poll_selections enable row level security;
revoke all on public.announcement_polls,public.announcement_poll_options,public.announcement_poll_votes,public.announcement_poll_selections from public,anon,authenticated;
grant select on public.announcement_polls,public.announcement_poll_options to authenticated;
create policy announcement_polls_read_active on public.announcement_polls for select to authenticated using (
  public.is_active_member() and exists (select 1 from public.announcements a where a.id=announcement_id and a.removed_at is null)
);
create policy announcement_poll_options_read_active on public.announcement_poll_options for select to authenticated using (
  public.is_active_member() and exists (
    select 1 from public.announcement_polls p join public.announcements a on a.id=p.announcement_id
    where p.id=poll_id and a.removed_at is null
  )
);
-- Nenhuma política de leitura é concedida às tabelas de votos/escolhas: identidades nunca são consultáveis.

create or replace function public.publish_announcement_with_poll(
  p_title text, p_message text, p_audience_area_id uuid,
  p_question text, p_options text[], p_allow_multiple boolean default false
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_announcement_id uuid; v_poll_id uuid; v_option text; v_position integer := 0;
begin
  if auth.uid() is null or not public.is_active_member() then raise exception 'Perfil ativo necessário.' using errcode='42501'; end if;
  if pg_catalog.length(pg_catalog.btrim(p_title)) not between 1 and 180 or pg_catalog.length(pg_catalog.btrim(p_message)) not between 1 and 8000 then raise exception 'Título ou mensagem inválidos.' using errcode='22023'; end if;
  if pg_catalog.length(pg_catalog.btrim(p_question)) not between 1 and 500 or p_options is null or pg_catalog.cardinality(p_options) not between 2 and 8 then raise exception 'Enquete inválida: informe pergunta e de 2 a 8 opções.' using errcode='22023'; end if;
  if exists(select 1 from pg_catalog.unnest(p_options) x where pg_catalog.length(pg_catalog.btrim(x)) not between 1 and 240) or (select pg_catalog.count(distinct pg_catalog.lower(pg_catalog.btrim(x))) from pg_catalog.unnest(p_options) x) <> pg_catalog.cardinality(p_options) then raise exception 'Opções inválidas ou repetidas.' using errcode='22023'; end if;
  insert into public.announcements(title,message,audience_area_id,author_id) values(pg_catalog.btrim(p_title),pg_catalog.btrim(p_message),p_audience_area_id,auth.uid()) returning id into v_announcement_id;
  insert into public.announcement_polls(announcement_id,question,allow_multiple) values(v_announcement_id,pg_catalog.btrim(p_question),coalesce(p_allow_multiple,false)) returning id into v_poll_id;
  foreach v_option in array p_options loop
    v_position := v_position + 1;
    insert into public.announcement_poll_options(poll_id,label,position) values(v_poll_id,pg_catalog.btrim(v_option),v_position);
  end loop;
  return v_announcement_id;
end;
$$;
revoke all on function public.publish_announcement_with_poll(text,text,uuid,text,text[],boolean) from public,anon,authenticated;
grant execute on function public.publish_announcement_with_poll(text,text,uuid,text,text[],boolean) to authenticated;

create or replace function public.get_announcement_poll_results(p_announcement_id uuid)
returns jsonb language plpgsql security definer stable set search_path = '' as $$
declare v_poll public.announcement_polls%rowtype; v_result jsonb;
begin
  if auth.uid() is null or not public.is_active_member() then raise exception 'Perfil ativo necessário.' using errcode='42501'; end if;
  select p.* into v_poll from public.announcement_polls p join public.announcements a on a.id=p.announcement_id
    where p.announcement_id=p_announcement_id and a.removed_at is null
      and (public.is_team_admin() or public.is_active_member());
  if not found then return null; end if;
  select pg_catalog.jsonb_build_object(
    'id',v_poll.id,'announcement_id',v_poll.announcement_id,'question',v_poll.question,
    'allow_multiple',v_poll.allow_multiple,'closed_at',v_poll.closed_at,
    'options',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',o.id,'label',o.label,'votes',coalesce(c.vote_count,0)) order by o.position)
      from public.announcement_poll_options o left join (
        select s.option_id,pg_catalog.count(*)::integer vote_count from public.announcement_poll_selections s
        where s.poll_id=v_poll.id group by s.option_id
      ) c on c.option_id=o.id where o.poll_id=v_poll.id),'[]'::jsonb),
    'my_option_ids',coalesce((select pg_catalog.jsonb_agg(s.option_id) from public.announcement_poll_selections s
      where s.poll_id=v_poll.id and s.user_id=auth.uid()),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.get_announcement_poll_results(uuid) from public,anon,authenticated;
grant execute on function public.get_announcement_poll_results(uuid) to authenticated;

create or replace function public.vote_announcement_poll(p_poll_id uuid,p_option_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare v_poll public.announcement_polls%rowtype; v_count integer;
begin
  if auth.uid() is null or not public.is_active_member() then raise exception 'Perfil ativo necessário.' using errcode='42501'; end if;
  select p.* into v_poll from public.announcement_polls p join public.announcements a on a.id=p.announcement_id
    where p.id=p_poll_id and a.removed_at is null and public.is_active_member() for update of p;
  if not found then raise exception 'Enquete indisponível.' using errcode='P0002'; end if;
  if v_poll.closed_at is not null then raise exception 'Esta enquete foi encerrada.' using errcode='55000'; end if;
  if p_option_ids is null or pg_catalog.cardinality(p_option_ids)<1 or pg_catalog.cardinality(p_option_ids)>8 then raise exception 'Selecione de 1 a 8 opções.' using errcode='22023'; end if;
  select pg_catalog.count(distinct x)::integer into v_count from pg_catalog.unnest(p_option_ids) x;
  if v_count <> pg_catalog.cardinality(p_option_ids) then raise exception 'Opção repetida.' using errcode='22023'; end if;
  if not v_poll.allow_multiple and v_count<>1 then raise exception 'Esta enquete permite apenas uma opção.' using errcode='22023'; end if;
  if (select pg_catalog.count(*) from public.announcement_poll_options o where o.poll_id=p_poll_id and o.id=any(p_option_ids)) <> v_count then raise exception 'Uma ou mais opções não pertencem a esta enquete.' using errcode='22023'; end if;
  insert into public.announcement_poll_votes(poll_id,user_id) values(p_poll_id,auth.uid()) on conflict(poll_id,user_id) do nothing;
  delete from public.announcement_poll_selections where poll_id=p_poll_id and user_id=auth.uid();
  insert into public.announcement_poll_selections(poll_id,user_id,option_id) select p_poll_id,auth.uid(),x from pg_catalog.unnest(p_option_ids) x;
end;
$$;
revoke all on function public.vote_announcement_poll(uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.vote_announcement_poll(uuid,uuid[]) to authenticated;

create or replace function public.close_announcement_poll(p_poll_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_author uuid;
begin
  if auth.uid() is null or not public.is_active_member() then raise exception 'Perfil ativo necessário.' using errcode='42501'; end if;
  select a.author_id into v_author from public.announcement_polls p join public.announcements a on a.id=p.announcement_id
    where p.id=p_poll_id and a.removed_at is null for update of p;
  if not found then raise exception 'Enquete indisponível.' using errcode='P0002'; end if;
  if v_author is distinct from auth.uid() and not public.is_team_admin() then raise exception 'Somente a pessoa autora ou um Administrador ativo pode encerrar a enquete.' using errcode='42501'; end if;
  update public.announcement_polls set closed_at=pg_catalog.now(),closed_by=auth.uid() where id=p_poll_id and closed_at is null;
end;
$$;
revoke all on function public.close_announcement_poll(uuid) from public,anon,authenticated;
grant execute on function public.close_announcement_poll(uuid) to authenticated;

create or replace function public.remove_announcement_attachment(p_attachment_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_author uuid;
begin
  if auth.uid() is null or not public.is_active_member() then raise exception 'Perfil ativo necessário.' using errcode='42501'; end if;
  select a.author_id into v_author from public.announcement_attachments f join public.announcements a on a.id=f.announcement_id
    where f.id=p_attachment_id and a.removed_at is null;
  if not found then raise exception 'Anexo indisponível.' using errcode='P0002'; end if;
  if v_author is distinct from auth.uid() and not public.is_team_admin() then raise exception 'Somente a pessoa autora ou um Administrador ativo pode remover anexos.' using errcode='42501'; end if;
  delete from public.announcement_attachments where id=p_attachment_id;
end;
$$;
revoke all on function public.remove_announcement_attachment(uuid) from public,anon,authenticated;
grant execute on function public.remove_announcement_attachment(uuid) to authenticated;

commit;
