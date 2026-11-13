-- Reforça o isolamento de dados por canal nas tabelas de conteúdo compartilhado.
-- Os registros antigos permanecem no mesmo ID e são lidos pelo canal associado
-- ao area_id; registros sem área continuam no Canal Geral.
begin;

create or replace function public.can_access_announcement(p_announcement_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.announcements a
     where a.id = p_announcement_id
       and a.removed_at is null
       and public.is_active_member()
       and public.can_access_workspace_area(a.audience_area_id)
  );
$$;
revoke all on function public.can_access_announcement(uuid) from public, anon;
grant execute on function public.can_access_announcement(uuid) to authenticated;

-- O canal é a fronteira de leitura e escrita para arquivos e comunicados.
drop policy if exists drive_folders_active_insert on public.drive_folders;
create policy drive_folders_active_insert on public.drive_folders
  for insert to authenticated
  with check (public.is_active_member() and public.can_access_workspace_area(area_id));

drop policy if exists announcements_active_insert on public.announcements;
create policy announcements_active_insert on public.announcements
  for insert to authenticated
  with check (public.is_active_member() and public.can_access_workspace_area(audience_area_id));

drop policy if exists announcements_active_update on public.announcements;
create policy announcements_active_update on public.announcements
  for update to authenticated
  using (public.is_active_member() and removed_at is null and public.can_access_workspace_area(audience_area_id))
  with check (public.is_active_member() and public.can_access_workspace_area(audience_area_id));

-- Respostas, reações, anexos, links e enquetes herdam o acesso do comunicado pai.
drop policy if exists announcement_replies_read_active on public.announcement_replies;
create policy announcement_replies_read_active on public.announcement_replies
  for select to authenticated
  using (removed_at is null and public.can_access_announcement(announcement_id));
drop policy if exists announcement_replies_insert_active on public.announcement_replies;
create policy announcement_replies_insert_active on public.announcement_replies
  for insert to authenticated
  with check (public.can_access_announcement(announcement_id) and author_id = auth.uid() and removed_at is null and removed_by is null);

drop policy if exists announcement_reactions_read_active on public.announcement_reactions;
create policy announcement_reactions_read_active on public.announcement_reactions
  for select to authenticated
  using (public.can_access_announcement(announcement_id));
drop policy if exists announcement_reactions_insert_active on public.announcement_reactions;
create policy announcement_reactions_insert_active on public.announcement_reactions
  for insert to authenticated
  with check (public.can_access_announcement(announcement_id) and user_id = auth.uid());
drop policy if exists announcement_reactions_delete_own on public.announcement_reactions;
create policy announcement_reactions_delete_own on public.announcement_reactions
  for delete to authenticated
  using (public.can_access_announcement(announcement_id) and user_id = auth.uid());

drop policy if exists announcement_attachments_read_active on public.announcement_attachments;
create policy announcement_attachments_read_active on public.announcement_attachments
  for select to authenticated
  using (public.can_access_announcement(announcement_id));
drop policy if exists announcement_attachments_add_author_admin on public.announcement_attachments;
create policy announcement_attachments_add_author_admin on public.announcement_attachments
  for insert to authenticated
  with check (public.can_access_announcement(announcement_id) and uploaded_by = auth.uid() and exists (
    select 1 from public.announcements a where a.id = announcement_id and (a.author_id = auth.uid() or public.is_team_admin())
  ));
drop policy if exists announcement_attachments_remove_author_admin on public.announcement_attachments;
create policy announcement_attachments_remove_author_admin on public.announcement_attachments
  for delete to authenticated
  using (public.can_access_announcement(announcement_id) and exists (
    select 1 from public.announcements a where a.id = announcement_id and (a.author_id = auth.uid() or public.is_team_admin())
  ));

drop policy if exists announcement_drive_links_read_active on public.announcement_drive_links;
create policy announcement_drive_links_read_active on public.announcement_drive_links
  for select to authenticated
  using (public.can_access_announcement(announcement_id));
drop policy if exists announcement_drive_links_add_author_admin on public.announcement_drive_links;
create policy announcement_drive_links_add_author_admin on public.announcement_drive_links
  for insert to authenticated
  with check (public.can_access_announcement(announcement_id) and added_by = auth.uid() and exists (
    select 1 from public.announcements a where a.id = announcement_id and (a.author_id = auth.uid() or public.is_team_admin())
  ));
drop policy if exists announcement_drive_links_remove_author_admin on public.announcement_drive_links;
create policy announcement_drive_links_remove_author_admin on public.announcement_drive_links
  for delete to authenticated
  using (public.can_access_announcement(announcement_id) and exists (
    select 1 from public.announcements a where a.id = announcement_id and (a.author_id = auth.uid() or public.is_team_admin())
  ));

drop policy if exists announcement_polls_read_active on public.announcement_polls;
create policy announcement_polls_read_active on public.announcement_polls
  for select to authenticated
  using (public.can_access_announcement(announcement_id));
drop policy if exists announcement_poll_options_read_active on public.announcement_poll_options;
create policy announcement_poll_options_read_active on public.announcement_poll_options
  for select to authenticated
  using (exists (
    select 1 from public.announcement_polls p
     where p.id = poll_id and public.can_access_announcement(p.announcement_id)
  ));

-- Storage de anexos segue o mesmo limite de acesso do comunicado.
drop policy if exists announcement_attachments_storage_upload on storage.objects;
create policy announcement_attachments_storage_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'announcement-attachments'
    and public.is_active_member()
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ '^[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}[.](jpg|jpeg|png|gif|webp|heic|heif|pdf|txt|csv|doc|docx|xls|xlsx|ppt|pptx)$'
    and public.can_access_announcement(split_part(name, '/', 2)::uuid)
    and exists (select 1 from public.announcements a where a.id = split_part(name, '/', 2)::uuid and (a.author_id = auth.uid() or public.is_team_admin()))
  );
drop policy if exists announcement_attachments_storage_read_visible on storage.objects;
create policy announcement_attachments_storage_read_visible on storage.objects
  for select to authenticated
  using (
    bucket_id = 'announcement-attachments'
    and exists (
      select 1 from public.announcement_attachments f
       where f.storage_path = storage.objects.name and public.can_access_announcement(f.announcement_id)
    )
  );
drop policy if exists announcement_attachments_storage_delete_author_admin on storage.objects;
create policy announcement_attachments_storage_delete_author_admin on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'announcement-attachments'
    and exists (
      select 1 from public.announcement_attachments f
      join public.announcements a on a.id = f.announcement_id
       where f.storage_path = storage.objects.name
         and public.can_access_announcement(a.id)
         and (a.author_id = auth.uid() or public.is_team_admin())
    )
  );

-- RPCs SECURITY DEFINER revalidam o canal, pois não dependem das policies do cliente.
create or replace function public.publish_announcement_with_poll(
  p_title text, p_message text, p_audience_area_id uuid,
  p_question text, p_options text[], p_allow_multiple boolean default false
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_announcement_id uuid; v_poll_id uuid; v_option text; v_position integer := 0;
begin
  if auth.uid() is null or not public.is_active_member() then raise exception 'Perfil ativo necessário.' using errcode='42501'; end if;
  if not public.can_access_workspace_area(p_audience_area_id) then raise exception 'Você não participa do canal de destino.' using errcode='42501'; end if;
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
revoke all on function public.publish_announcement_with_poll(text,text,uuid,text,text[],boolean) from public, anon, authenticated;
grant execute on function public.publish_announcement_with_poll(text,text,uuid,text,text[],boolean) to authenticated;

create or replace function public.remove_announcement(p_announcement_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_active_member() then raise exception 'Perfil ativo necessário.' using errcode='42501'; end if;
  if not public.can_access_announcement(p_announcement_id) then raise exception 'Comunicado indisponível neste canal.' using errcode='42501'; end if;
  update public.announcements set removed_at = pg_catalog.now() where id = p_announcement_id and removed_at is null;
  if not found then raise exception 'O comunicado não existe ou já foi removido.' using errcode='P0002'; end if;
end;
$$;
revoke all on function public.remove_announcement(uuid) from public, anon, authenticated;
grant execute on function public.remove_announcement(uuid) to authenticated;

create or replace function public.remove_announcement_reply(p_reply_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_author_id uuid; v_announcement_id uuid;
begin
  if auth.uid() is null or not public.is_active_member() then raise exception 'Perfil ativo necessário.' using errcode='42501'; end if;
  select announcement_id, author_id into v_announcement_id, v_author_id from public.announcement_replies where id=p_reply_id and removed_at is null for update;
  if not found then raise exception 'A resposta não existe ou já foi removida.' using errcode='P0002'; end if;
  if not public.can_access_announcement(v_announcement_id) then raise exception 'Resposta indisponível neste canal.' using errcode='42501'; end if;
  if v_author_id is distinct from auth.uid() and not public.is_team_admin() then raise exception 'Somente a pessoa autora ou um Administrador ativo pode remover esta resposta.' using errcode='42501'; end if;
  update public.announcement_replies set body='[Resposta removida]', removed_at=pg_catalog.now(), removed_by=auth.uid() where id=p_reply_id and removed_at is null;
end;
$$;
revoke all on function public.remove_announcement_reply(uuid) from public, anon, authenticated;
grant execute on function public.remove_announcement_reply(uuid) to authenticated;

create or replace function public.remove_announcement_attachment(p_attachment_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_author uuid; v_announcement_id uuid;
begin
  if auth.uid() is null or not public.is_active_member() then raise exception 'Perfil ativo necessário.' using errcode='42501'; end if;
  select a.id, a.author_id into v_announcement_id, v_author from public.announcement_attachments f join public.announcements a on a.id=f.announcement_id where f.id=p_attachment_id and a.removed_at is null;
  if not found then raise exception 'Anexo indisponível.' using errcode='P0002'; end if;
  if not public.can_access_announcement(v_announcement_id) then raise exception 'Anexo indisponível neste canal.' using errcode='42501'; end if;
  if v_author is distinct from auth.uid() and not public.is_team_admin() then raise exception 'Somente a pessoa autora ou um Administrador ativo pode remover anexos.' using errcode='42501'; end if;
  delete from public.announcement_attachments where id=p_attachment_id;
end;
$$;
revoke all on function public.remove_announcement_attachment(uuid) from public, anon, authenticated;
grant execute on function public.remove_announcement_attachment(uuid) to authenticated;

create or replace function public.get_announcement_poll_results(p_announcement_id uuid)
returns jsonb language plpgsql security definer stable set search_path = '' as $$
declare v_poll public.announcement_polls%rowtype; v_result jsonb;
begin
  if auth.uid() is null or not public.is_active_member() then raise exception 'Perfil ativo necessário.' using errcode='42501'; end if;
  if not public.can_access_announcement(p_announcement_id) then raise exception 'Enquete indisponível neste canal.' using errcode='42501'; end if;
  select p.* into v_poll from public.announcement_polls p join public.announcements a on a.id=p.announcement_id where p.announcement_id=p_announcement_id and a.removed_at is null;
  if not found then return null; end if;
  select pg_catalog.jsonb_build_object(
    'id',v_poll.id,'announcement_id',v_poll.announcement_id,'question',v_poll.question,
    'allow_multiple',v_poll.allow_multiple,'closed_at',v_poll.closed_at,
    'options',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',o.id,'label',o.label,'votes',coalesce(c.vote_count,0)) order by o.position)
      from public.announcement_poll_options o left join (select s.option_id,pg_catalog.count(*)::integer vote_count from public.announcement_poll_selections s where s.poll_id=v_poll.id group by s.option_id) c on c.option_id=o.id where o.poll_id=v_poll.id),'[]'::jsonb),
    'my_option_ids',coalesce((select pg_catalog.jsonb_agg(s.option_id) from public.announcement_poll_selections s where s.poll_id=v_poll.id and s.user_id=auth.uid()),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.get_announcement_poll_results(uuid) from public, anon, authenticated;
grant execute on function public.get_announcement_poll_results(uuid) to authenticated;

create or replace function public.vote_announcement_poll(p_poll_id uuid,p_option_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare v_poll public.announcement_polls%rowtype; v_count integer;
begin
  if auth.uid() is null or not public.is_active_member() then raise exception 'Perfil ativo necessário.' using errcode='42501'; end if;
  select p.* into v_poll from public.announcement_polls p join public.announcements a on a.id=p.announcement_id where p.id=p_poll_id and a.removed_at is null and public.can_access_announcement(a.id) for update of p;
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
revoke all on function public.vote_announcement_poll(uuid,uuid[]) from public, anon, authenticated;
grant execute on function public.vote_announcement_poll(uuid,uuid[]) to authenticated;

create or replace function public.close_announcement_poll(p_poll_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_author uuid; v_announcement_id uuid;
begin
  if auth.uid() is null or not public.is_active_member() then raise exception 'Perfil ativo necessário.' using errcode='42501'; end if;
  select a.id, a.author_id into v_announcement_id, v_author from public.announcement_polls p join public.announcements a on a.id=p.announcement_id where p.id=p_poll_id and a.removed_at is null for update of p;
  if not found then raise exception 'Enquete indisponível.' using errcode='P0002'; end if;
  if not public.can_access_announcement(v_announcement_id) then raise exception 'Enquete indisponível neste canal.' using errcode='42501'; end if;
  if v_author is distinct from auth.uid() and not public.is_team_admin() then raise exception 'Somente a pessoa autora ou um Administrador ativo pode encerrar a enquete.' using errcode='42501'; end if;
  update public.announcement_polls set closed_at=pg_catalog.now(),closed_by=auth.uid() where id=p_poll_id and closed_at is null;
end;
$$;
revoke all on function public.close_announcement_poll(uuid) from public, anon, authenticated;
grant execute on function public.close_announcement_poll(uuid) to authenticated;

-- Pastas têm uma pasta principal por canal (incluindo a área Geral), não uma
-- pasta principal global que permita alterar registros de outra área.
drop index if exists public.drive_folders_single_primary;
create unique index drive_folders_single_primary
  on public.drive_folders ((coalesce(area_id, '00000000-0000-0000-0000-000000000000'::uuid)))
  where is_primary and removed_at is null;

create or replace function public.update_drive_folder(p_folder_id uuid,p_name text,p_drive_url text,p_area_id uuid,p_description text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old_area_id uuid;
begin
  if auth.uid() is null or not public.is_active_member() then raise exception 'Perfil ativo necessário.' using errcode='42501'; end if;
  if p_name is null or char_length(btrim(p_name))=0 then raise exception 'Informe o nome da pasta.' using errcode='22023'; end if;
  if p_description is not null and char_length(p_description)>500 then raise exception 'A descrição deve ter no máximo 500 caracteres.' using errcode='22023'; end if;
  if p_drive_url is null or p_drive_url !~ '^https://drive[.]google[.]com/' or p_drive_url ~ '^https://[^/]*@' or p_drive_url ~ '^https://drive[.]google[.]com:[^/]+/' or p_drive_url ~ '[[:space:][:cntrl:]]' then raise exception 'Use uma URL HTTPS válida de drive.google.com, sem usuário, senha ou porta personalizada.' using errcode='22023'; end if;
  select area_id into v_old_area_id from public.drive_folders where id=p_folder_id and removed_at is null for update;
  if not found then raise exception 'A pasta não existe ou já foi removida.' using errcode='P0002'; end if;
  if not public.can_access_workspace_area(v_old_area_id) or not public.can_access_workspace_area(p_area_id) then raise exception 'Você não participa do canal de origem ou destino.' using errcode='42501'; end if;
  update public.drive_folders set name=btrim(p_name),drive_url=p_drive_url,area_id=p_area_id,description=coalesce(p_description,'') where id=p_folder_id and removed_at is null;
end;
$$;
revoke all on function public.update_drive_folder(uuid,text,text,uuid,text) from public, anon, authenticated;
grant execute on function public.update_drive_folder(uuid,text,text,uuid,text) to authenticated;

create or replace function public.set_primary_drive_folder(p_folder_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_area_id uuid;
begin
  if auth.uid() is null or not public.is_active_member() then raise exception 'Perfil ativo necessário.' using errcode='42501'; end if;
  select area_id into v_area_id from public.drive_folders where id=p_folder_id and removed_at is null for update;
  if not found then raise exception 'A pasta não existe ou já foi removida.' using errcode='P0002'; end if;
  if not public.can_access_workspace_area(v_area_id) then raise exception 'Você não participa do canal desta pasta.' using errcode='42501'; end if;
  update public.drive_folders set is_primary=false where area_id is not distinct from v_area_id and is_primary and removed_at is null and id<>p_folder_id;
  update public.drive_folders set is_primary=true where id=p_folder_id and removed_at is null;
end;
$$;
revoke all on function public.set_primary_drive_folder(uuid) from public, anon, authenticated;
grant execute on function public.set_primary_drive_folder(uuid) to authenticated;

create or replace function public.remove_drive_folder(p_folder_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_was_primary boolean; v_area_id uuid; v_next_id uuid;
begin
  if auth.uid() is null or not public.is_active_member() then raise exception 'Perfil ativo necessário.' using errcode='42501'; end if;
  select is_primary,area_id into v_was_primary,v_area_id from public.drive_folders where id=p_folder_id and removed_at is null for update;
  if not found then raise exception 'A pasta não existe ou já foi removida.' using errcode='P0002'; end if;
  if not public.can_access_workspace_area(v_area_id) then raise exception 'Você não participa do canal desta pasta.' using errcode='42501'; end if;
  update public.drive_folders set removed_at=pg_catalog.now(),is_primary=false where id=p_folder_id and removed_at is null;
  if v_was_primary then
    select id into v_next_id from public.drive_folders where area_id is not distinct from v_area_id and removed_at is null order by created_at asc limit 1;
    if v_next_id is not null then update public.drive_folders set is_primary=true where id=v_next_id; end if;
  end if;
end;
$$;
revoke all on function public.remove_drive_folder(uuid) from public, anon, authenticated;
grant execute on function public.remove_drive_folder(uuid) to authenticated;


-- O conteúdo de atividades (atualizações, histórico, anexos, PERT e WIP)
-- também respeita o canal associado à área.
create or replace function public.can_edit_activity(p_activity_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.activities a join public.areas ar on ar.id=a.area_id
     where a.id=p_activity_id and a.archived_at is null and ar.is_active
       and public.is_active_member() and public.can_access_workspace_area(a.area_id)
       and (
         public.is_team_admin()
         or public.is_area_lead_for(a.area_id)
         or (public.current_profile_role() = 'member' and a.responsible_user_id = auth.uid())
       )
  );
$$;
revoke all on function public.can_edit_activity(uuid) from public, anon;
grant execute on function public.can_edit_activity(uuid) to authenticated;

drop policy if exists weekly_updates_read_active on public.weekly_updates;
create policy weekly_updates_read_active on public.weekly_updates
  for select to authenticated
  using (public.is_active_member() and exists (
    select 1 from public.activities a where a.id=activity_id and a.archived_at is null and public.can_access_workspace_area(a.area_id)
  ));
drop policy if exists weekly_updates_insert_allowed on public.weekly_updates;
create policy weekly_updates_insert_allowed on public.weekly_updates
  for insert to authenticated
  with check (public.can_edit_activity(activity_id));
drop policy if exists weekly_updates_update_allowed on public.weekly_updates;
create policy weekly_updates_update_allowed on public.weekly_updates
  for update to authenticated
  using (public.can_edit_activity(activity_id))
  with check (public.can_edit_activity(activity_id));

drop policy if exists weekly_update_history_read_active on public.weekly_update_history;
create policy weekly_update_history_read_active on public.weekly_update_history
  for select to authenticated
  using (public.is_active_member() and exists (
    select 1 from public.activities a where a.id=activity_id and public.can_access_workspace_area(a.area_id)
  ));

drop policy if exists activity_flow_wip_read_active on public.activity_flow_wip_limits;
create policy activity_flow_wip_read_active on public.activity_flow_wip_limits
  for select to authenticated
  using (public.is_active_member() and public.can_access_workspace_area(area_id));
drop policy if exists activity_flow_wip_admin_insert on public.activity_flow_wip_limits;
create policy activity_flow_wip_admin_insert on public.activity_flow_wip_limits
  for insert to authenticated
  with check (public.is_active_member() and public.is_team_admin() and public.can_access_workspace_area(area_id));
drop policy if exists activity_flow_wip_admin_update on public.activity_flow_wip_limits;
create policy activity_flow_wip_admin_update on public.activity_flow_wip_limits
  for update to authenticated
  using (public.is_active_member() and public.is_team_admin() and public.can_access_workspace_area(area_id))
  with check (public.is_active_member() and public.is_team_admin() and public.can_access_workspace_area(area_id));

drop policy if exists activity_attachments_read_active on public.activity_attachments;
create policy activity_attachments_read_active on public.activity_attachments
  for select to authenticated
  using (public.is_active_member() and exists (
    select 1 from public.activities a where a.id=activity_id and a.archived_at is null and public.can_access_workspace_area(a.area_id)
  ));
drop policy if exists activity_attachments_insert_editors on public.activity_attachments;
create policy activity_attachments_insert_editors on public.activity_attachments
  for insert to authenticated
  with check (public.is_active_member() and created_by=auth.uid() and public.can_edit_activity(activity_id));
drop policy if exists activity_attachments_delete_editors on public.activity_attachments;
create policy activity_attachments_delete_editors on public.activity_attachments
  for delete to authenticated
  using (public.is_active_member() and public.can_edit_activity(activity_id));

drop policy if exists activity_attachments_storage_insert_editors on storage.objects;
create policy activity_attachments_storage_insert_editors on storage.objects
  for insert to authenticated
  with check (
    bucket_id='activity-attachments' and public.is_active_member()
    and (storage.foldername(name))[1]=(select auth.uid())::text
    and name ~ '^[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}[.](jpg|jpeg|png|gif|webp|heic|heif|pdf|txt|csv|doc|docx|xls|xlsx|ppt|pptx)$'
    and public.can_edit_activity(((storage.foldername(name))[2])::uuid)
  );
drop policy if exists activity_attachments_storage_read_visible on storage.objects;
create policy activity_attachments_storage_read_visible on storage.objects
  for select to authenticated
  using (
    bucket_id='activity-attachments' and public.is_active_member()
    and exists (
      select 1 from public.activity_attachments f join public.activities a on a.id=f.activity_id
       where f.storage_path=storage.objects.name and a.archived_at is null and public.can_access_workspace_area(a.area_id)
    )
  );
drop policy if exists activity_attachments_storage_delete_editors on storage.objects;
create policy activity_attachments_storage_delete_editors on storage.objects
  for delete to authenticated
  using (
    bucket_id='activity-attachments' and public.is_active_member()
    and public.can_edit_activity(((storage.foldername(name))[2])::uuid)
  );

drop policy if exists activity_dependencies_read_active on public.activity_dependencies;
create policy activity_dependencies_read_active on public.activity_dependencies
  for select to authenticated
  using (
    public.is_active_member()
    and exists (select 1 from public.activities a where a.id=predecessor_activity_id and public.can_access_workspace_area(a.area_id))
    and exists (select 1 from public.activities a where a.id=successor_activity_id and public.can_access_workspace_area(a.area_id))
  );
drop policy if exists activity_dependencies_insert_managed on public.activity_dependencies;
create policy activity_dependencies_insert_managed on public.activity_dependencies
  for insert to authenticated
  with check (
    public.is_active_member()
    and exists (select 1 from public.activities a where a.id=predecessor_activity_id and a.activity_type='marco'::public.activity_type and a.archived_at is null and public.can_access_workspace_area(a.area_id))
    and exists (select 1 from public.activities a where a.id=successor_activity_id and a.activity_type='marco'::public.activity_type and a.archived_at is null and public.can_access_workspace_area(a.area_id))
    and exists (
      select 1 from public.activities predecessor cross join public.activities successor
       where predecessor.id=predecessor_activity_id and successor.id=successor_activity_id
         and (public.is_team_admin() or (public.is_area_lead_for(predecessor.area_id) and public.is_area_lead_for(successor.area_id)))
    )
  );
drop policy if exists activity_dependencies_delete_managed on public.activity_dependencies;
create policy activity_dependencies_delete_managed on public.activity_dependencies
  for delete to authenticated
  using (
    public.is_active_member()
    and exists (select 1 from public.activities a where a.id=predecessor_activity_id and public.can_access_workspace_area(a.area_id))
    and exists (select 1 from public.activities a where a.id=successor_activity_id and public.can_access_workspace_area(a.area_id))
    and exists (
      select 1 from public.activities predecessor cross join public.activities successor
       where predecessor.id=predecessor_activity_id and successor.id=successor_activity_id
         and (public.is_team_admin() or (public.is_area_lead_for(predecessor.area_id) and public.is_area_lead_for(successor.area_id)))
    )
  );


create or replace function public.remove_activity(p_activity_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_area_id uuid; v_archived_at timestamptz;
begin
  if auth.uid() is null or not public.is_active_member() then raise exception 'Perfil ativo necessário.' using errcode='42501'; end if;
  select area_id,archived_at into v_area_id,v_archived_at from public.activities where id=p_activity_id for update;
  if not found or v_archived_at is not null then raise exception 'A atividade não existe ou já foi removida.' using errcode='P0002'; end if;
  if not public.can_access_workspace_area(v_area_id) then raise exception 'Você não participa do canal desta atividade.' using errcode='42501'; end if;
  if not public.is_team_admin() and not public.is_area_lead_for(v_area_id) then raise exception 'Somente Administradores ou Líderes da área podem remover esta atividade.' using errcode='42501'; end if;
  update public.activities set archived_at=pg_catalog.now() where id=p_activity_id and archived_at is null;
  if not found then raise exception 'A atividade não existe ou já foi removida.' using errcode='P0002'; end if;
end;
$$;
revoke all on function public.remove_activity(uuid) from public, anon, authenticated;
grant execute on function public.remove_activity(uuid) to authenticated;

commit;
