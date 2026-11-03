-- SolMar Celeris · remoção lógica segura de atividades
-- Preserva atualizações semanais e auditoria; mantém o RLS habilitado.

begin;

create or replace function public.remove_activity(p_activity_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_area_id uuid;
  v_archived_at timestamptz;
begin
  if auth.uid() is null or not public.is_active_member() then
    raise exception 'Perfil ativo necessário.' using errcode = '42501';
  end if;

  select area_id, archived_at
    into v_area_id, v_archived_at
    from public.activities
    where id = p_activity_id
    for update;

  if not found or v_archived_at is not null then
    raise exception 'A atividade não existe ou já foi removida.' using errcode = 'P0002';
  end if;

  if not public.is_team_admin() and not public.is_area_lead_for(v_area_id) then
    raise exception 'Somente Administradores ou Líderes da área podem remover esta atividade.' using errcode = '42501';
  end if;

  update public.activities
    set archived_at = now()
    where id = p_activity_id
      and archived_at is null;

  if not found then
    raise exception 'A atividade não existe ou já foi removida.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.remove_activity(uuid) from public, anon, authenticated;
grant execute on function public.remove_activity(uuid) to authenticated;

commit;
