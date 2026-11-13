begin;

-- O quadro Kanban permite mover cartões diretamente entre Backlog, A fazer,
-- Fazendo e Feito. Permissões, limite WIP e justificativa de bloqueio continuam
-- validados aqui no banco.
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

  -- As políticas da equipe podem colocar o cartão em qualquer etapa válida;
  -- o pull entre colunas não é bloqueado por uma sequência rígida.
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
