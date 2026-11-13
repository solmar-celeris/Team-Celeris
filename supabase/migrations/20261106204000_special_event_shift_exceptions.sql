-- Escalas de ocasiões especiais podem incluir horários fora da disponibilidade
-- recorrente informada pelo integrante. A aplicação mostra um aviso de exceção.
-- Mantém a validação de perfil ativo e os limites de dia/horário da tabela.
begin;

drop trigger if exists team_shifts_check_availability on public.team_shifts;
drop function if exists public.check_team_shift_availability();

create or replace function public.validate_team_shift_assignee_active()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.assigned_user_id is not null and not exists (
    select 1
    from public.profiles p
    where p.user_id = new.assigned_user_id
      and p.status = 'active'
  ) then
    raise exception 'A pessoa atribuída precisa ter perfil ativo.' using errcode = '23514';
  end if;

  return new;
end;
$$;
revoke all on function public.validate_team_shift_assignee_active() from public, anon, authenticated;

drop trigger if exists team_shifts_validate_assignee_active on public.team_shifts;
create trigger team_shifts_validate_assignee_active
  before insert or update of assigned_user_id, shift_date, start_time, end_time on public.team_shifts
  for each row execute function public.validate_team_shift_assignee_active();

commit;
