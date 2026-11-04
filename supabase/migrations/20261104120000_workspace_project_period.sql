begin;

-- A coluna é aditiva para preservar dados e integrações existentes.
-- O valor inicial atende ao período aprovado: 09/11/2026 a 22/12/2027.
alter table public.team_settings
  add column if not exists cycle_end date not null default date '2027-12-22';

-- Se o início já tiver sido ajustado no banco, evita uma janela inválida.
update public.team_settings
set cycle_end = cycle_start
where cycle_end < cycle_start;

alter table public.team_settings
  add constraint team_settings_cycle_end_not_before_start
  check (cycle_end >= cycle_start);

comment on column public.team_settings.cycle_end is
  'Data final inclusiva do período do projeto; somente Administradores ativos podem alterá-la pela aplicação.';

commit;
