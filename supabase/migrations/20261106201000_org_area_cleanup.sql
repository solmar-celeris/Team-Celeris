-- Ajuste incremental do catálogo de áreas para o organograma vigente.
-- A antiga área Projetos fica fora do catálogo ativo, mas a linha não é apagada:
-- atividades, códigos, atualizações semanais e auditoria histórica continuam vinculados.
begin;

update public.areas
set name = 'Projetos (histórico)',
    slug = 'projetos-historico',
    is_active = false,
    notes = 'Área fora do organograma vigente. Mantida apenas para preservar atividades e registros históricos; novas atividades devem pertencer a uma área ativa.'
where slug = 'projetos';

update public.areas
set name = 'Elétrica - ELE',
    slug = 'eletrica',
    code_prefix = 'ELE',
    notes = 'Sistemas elétricos, geração, armazenamento, distribuição, acionamento e segurança elétrica.'
where slug = 'energia';

-- Áreas inativas permanecem consultáveis por perfis ativos para que atividades antigas
-- continuem com rótulo; a autorização de alteração exige área ativa.
create or replace function public.can_edit_activity(p_activity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.activities a
    join public.areas ar on ar.id = a.area_id
    where a.id = p_activity_id
      and a.archived_at is null
      and ar.is_active
      and (
        public.is_team_admin()
        or public.is_area_lead_for(a.area_id)
        or (public.current_profile_role() = 'member' and a.responsible_user_id = auth.uid())
      )
  )
$$;
revoke all on function public.can_edit_activity(uuid) from public, anon;
grant execute on function public.can_edit_activity(uuid) to authenticated;

drop policy if exists activities_lead_insert on public.activities;
create policy activities_lead_insert on public.activities for insert to authenticated
  with check (
    (public.is_team_admin() or public.is_area_lead_for(area_id))
    and exists (select 1 from public.areas ar where ar.id = area_id and ar.is_active)
  );
drop policy if exists activities_lead_update on public.activities;
create policy activities_lead_update on public.activities for update to authenticated
  using (
    (public.is_team_admin() or public.is_area_lead_for(area_id))
    and exists (select 1 from public.areas ar where ar.id = area_id and ar.is_active)
  )
  with check (
    (public.is_team_admin() or public.is_area_lead_for(area_id))
    and exists (select 1 from public.areas ar where ar.id = area_id and ar.is_active)
  );

commit;
