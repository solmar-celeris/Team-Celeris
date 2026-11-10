-- Administração segura da equipe e autorização de Presence privado.
-- Execute após as migrations existentes em um projeto Supabase correto.
-- Nenhuma chave privilegiada é armazenada no repositório.

begin;

-- Lock global para serializar mudanças administrativas e impedir que duas
-- operações concorrentes suspendam/rebaixem o último administrador ativo.
create or replace function public.admin_promote_team_member(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_status public.member_status;
  v_role public.app_role;
begin
  if v_actor is null then
    raise exception 'Somente administradores ativos podem gerenciar membros.' using errcode = '42501';
  end if;
  if p_user_id is null or p_user_id = v_actor then
    raise exception 'Não é possível alterar o próprio perfil por esta ação.' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(7319041001::bigint);
  if not public.is_active_member() or not public.is_team_admin() then
    raise exception 'Somente administradores ativos podem gerenciar membros.' using errcode = '42501';
  end if;
  select p.role, p.status into v_role, v_status
    from public.profiles p where p.user_id = p_user_id for update;
  if not found then
    raise exception 'Perfil não encontrado.' using errcode = 'P0002';
  end if;
  if v_status <> 'active' then
    raise exception 'Somente membros ativos podem ser promovidos.' using errcode = '22023';
  end if;
  if v_role = 'admin' then return; end if;

  update public.profiles set role = 'admin' where user_id = p_user_id;
  insert into public.audit_log(entity, entity_id, action, actor_id, changed_fields)
  values (
    'profiles', p_user_id, 'update', v_actor,
    pg_catalog.jsonb_build_object('role', pg_catalog.jsonb_build_object('before', v_role::text, 'after', 'admin'))
  );
end;
$$;
revoke all on function public.admin_promote_team_member(uuid) from public, anon, authenticated;
grant execute on function public.admin_promote_team_member(uuid) to authenticated;

create or replace function public.admin_suspend_team_member(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_status public.member_status;
  v_role public.app_role;
  v_admin_count integer;
begin
  if v_actor is null then
    raise exception 'Somente administradores ativos podem gerenciar membros.' using errcode = '42501';
  end if;
  if p_user_id is null or p_user_id = v_actor then
    raise exception 'Não é possível remover o próprio perfil.' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(7319041001::bigint);
  if not public.is_active_member() or not public.is_team_admin() then
    raise exception 'Somente administradores ativos podem gerenciar membros.' using errcode = '42501';
  end if;
  select p.role, p.status into v_role, v_status
    from public.profiles p where p.user_id = p_user_id for update;
  if not found then
    raise exception 'Perfil não encontrado.' using errcode = 'P0002';
  end if;
  if v_status = 'suspended' then return; end if;

  if v_role = 'admin' and v_status = 'active' then
    select pg_catalog.count(*)::integer into v_admin_count
      from public.profiles p where p.role = 'admin' and p.status = 'active';
    if v_admin_count <= 1 then
      raise exception 'A equipe precisa manter pelo menos um administrador ativo.' using errcode = '23514';
    end if;
  end if;

  update public.profiles set status = 'suspended' where user_id = p_user_id;
  insert into public.audit_log(entity, entity_id, action, actor_id, changed_fields)
  values (
    'profiles', p_user_id, 'remove', v_actor,
    pg_catalog.jsonb_build_object('status', pg_catalog.jsonb_build_object('before', v_status::text, 'after', 'suspended'))
  );
end;
$$;
revoke all on function public.admin_suspend_team_member(uuid) from public, anon, authenticated;
grant execute on function public.admin_suspend_team_member(uuid) to authenticated;

-- O diretório utiliza Presence não persistente em um canal privado. Apenas
-- perfis ativos podem ler e publicar Presence no tópico exato da equipe.
drop policy if exists team_presence_active_read on realtime.messages;
create policy team_presence_active_read on realtime.messages
  for select to authenticated
  using (
    (select realtime.topic()) = 'team-presence'
    and extension = 'presence'
    and (select public.is_active_member())
  );

drop policy if exists team_presence_active_write on realtime.messages;
create policy team_presence_active_write on realtime.messages
  for insert to authenticated
  with check (
    (select realtime.topic()) = 'team-presence'
    and extension = 'presence'
    and (select public.is_active_member())
  );

commit;
