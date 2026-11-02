-- SolMar Celeris · permissões incrementais para Arquivos e Comunicados
-- Execute após a migração inicial, uma única vez, no SQL Editor do projeto correto.
-- Não recria tabelas, não altera atividades e não contém chaves/segredos.

begin;

-- Defesa também no banco: a aplicação só armazena links HTTPS do Drive,
-- sem userinfo (credencial) e sem porta explícita na autoridade.
alter table public.drive_folders
  drop constraint if exists drive_folders_safe_url;
alter table public.drive_folders
  add constraint drive_folders_safe_url check (
    drive_url ~ '^https://drive[.]google[.]com/'
    and drive_url !~ '^https://[^/]*@'
    and drive_url !~ '^https://drive[.]google[.]com:[^/]+/'
  );

-- A autoria e o autor da remoção são sempre derivados da sessão Supabase,
-- nunca aceitos do cliente. As datas de criação também não podem ser falsificadas.
create or replace function public.set_shared_content_actor()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if tg_table_name = 'drive_folders' then
      new.added_by := auth.uid();
    elsif tg_table_name = 'announcements' then
      new.author_id := auth.uid();
    end if;
    new.created_at := now();
    new.removed_at := null;
    new.removed_by := null;
  else
    new.created_at := old.created_at;
    if tg_table_name = 'drive_folders' then
      new.added_by := old.added_by;
    elsif tg_table_name = 'announcements' then
      new.author_id := old.author_id;
    end if;
    if old.removed_at is null and new.removed_at is not null then
      new.removed_by := auth.uid();
    elsif new.removed_at is null then
      new.removed_by := null;
    else
      new.removed_by := old.removed_by;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.set_shared_content_actor() from public, anon, authenticated;

drop trigger if exists drive_folders_set_actor on public.drive_folders;
create trigger drive_folders_set_actor
  before insert or update on public.drive_folders
  for each row execute function public.set_shared_content_actor();

drop trigger if exists announcements_set_actor on public.announcements;
create trigger announcements_set_actor
  before insert or update on public.announcements
  for each row execute function public.set_shared_content_actor();

-- Qualquer membro ativo pode listar pastas, criar e editar dados/estado da pasta.
-- Não há privilégio SQL de DELETE: a remoção é lógica via função auditada abaixo.
drop policy if exists drive_folders_active_insert on public.drive_folders;
create policy drive_folders_active_insert on public.drive_folders
  for insert to authenticated
  with check (public.is_active_member());

-- Não há UPDATE direto na tabela de pastas. Definir principal/remover passa
-- pelos RPCs transacionais, que validam perfil ativo e escrevem auditoria.

revoke insert, update, delete on public.drive_folders from anon, authenticated;
grant select on public.drive_folders to authenticated;
grant insert (name, drive_url, area_id, is_primary) on public.drive_folders to authenticated;

-- Decisão do usuário: todo perfil ativo também vê comunicados de qualquer área.
drop policy if exists announcements_read_recipients on public.announcements;
create policy announcements_read_active on public.announcements
  for select to authenticated
  using (public.is_active_member() and removed_at is null);

drop policy if exists announcements_active_insert on public.announcements;
create policy announcements_active_insert on public.announcements
  for insert to authenticated
  with check (public.is_active_member());

drop policy if exists announcements_active_update on public.announcements;
create policy announcements_active_update on public.announcements
  for update to authenticated
  using (public.is_active_member() and removed_at is null)
  with check (public.is_active_member());

revoke insert, update, delete on public.announcements from anon, authenticated;
grant select on public.announcements to authenticated;
grant insert (title, message, audience_area_id) on public.announcements to authenticated;
grant update (pinned_at, removed_at) on public.announcements to authenticated;

-- Trocar a pasta principal é uma transação única e preserva o índice único parcial.
create or replace function public.set_primary_drive_folder(p_folder_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_active_member() then
    raise exception 'Perfil ativo necessário.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.drive_folders
    where id = p_folder_id and removed_at is null
  ) then
    raise exception 'A pasta não existe ou já foi removida.' using errcode = 'P0002';
  end if;
  update public.drive_folders
    set is_primary = false
    where is_primary and removed_at is null and id <> p_folder_id;
  update public.drive_folders
    set is_primary = true
    where id = p_folder_id and removed_at is null;
end;
$$;
revoke all on function public.set_primary_drive_folder(uuid) from public, anon;
grant execute on function public.set_primary_drive_folder(uuid) to authenticated;

-- Remover é uma transação lógica. Se a pasta removida era principal, a mais
-- antiga disponível é promovida automaticamente; o conteúdo externo não muda.
create or replace function public.remove_drive_folder(p_folder_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_was_primary boolean;
  v_next_id uuid;
begin
  if not public.is_active_member() then
    raise exception 'Perfil ativo necessário.' using errcode = '42501';
  end if;
  select is_primary into v_was_primary
    from public.drive_folders
    where id = p_folder_id and removed_at is null
    for update;
  if not found then
    raise exception 'A pasta não existe ou já foi removida.' using errcode = 'P0002';
  end if;
  update public.drive_folders
    set removed_at = now(), is_primary = false
    where id = p_folder_id and removed_at is null;
  if v_was_primary then
    select id into v_next_id
      from public.drive_folders
      where removed_at is null
      order by created_at asc
      limit 1;
    if v_next_id is not null then
      update public.drive_folders set is_primary = true where id = v_next_id;
    end if;
  end if;
end;
$$;
revoke all on function public.remove_drive_folder(uuid) from public, anon;
grant execute on function public.remove_drive_folder(uuid) to authenticated;

commit;
