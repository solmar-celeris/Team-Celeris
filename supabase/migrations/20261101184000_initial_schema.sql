-- SolMar Celeris · esquema inicial do banco compartilhado
-- Execute somente em um projeto Supabase criado para esta equipe.
-- Não contém senhas, tokens nem chaves privilegiadas.

begin;

create type public.app_role as enum ('admin', 'area_lead', 'member', 'reader');
create type public.member_status as enum ('pending', 'active', 'suspended');
create type public.activity_type as enum ('marco', 'pontual', 'rotina', 'condicional');
create type public.weekly_status as enum ('completed', 'in_progress', 'pending', 'not_applicable', 'not_started');

create table public.nuclei (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null unique,
  created_at timestamptz not null default now()
);

create table public.areas (
  id uuid primary key default gen_random_uuid(),
  nucleus_id uuid not null references public.nuclei(id) on delete restrict,
  slug text not null unique,
  name text not null unique,
  code_prefix text not null unique check (code_prefix ~ '^[A-Z]{2,3}$'),
  notes text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  area_id uuid references public.areas(id) on delete set null,
  role public.app_role not null default 'member',
  status public.member_status not null default 'pending',
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  area_id uuid not null references public.areas(id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  description text not null default '',
  activity_type public.activity_type not null,
  frequency text not null default '',
  execution_condition text not null default '',
  responsible_name text not null default 'A definir',
  responsible_user_id uuid references auth.users(id) on delete set null,
  start_date date,
  due_date date,
  expected_deliverable text not null default '',
  notes text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint activities_type_dates check (
    (activity_type <> 'marco' or (start_date is not null and due_date is not null)) and
    (activity_type <> 'pontual' or due_date is not null)
  ),
  constraint activities_type_frequency check (
    activity_type <> 'rotina' or frequency in ('Semanal', 'Quinzenal', 'Mensal')
  ),
  constraint activities_conditional_condition check (
    activity_type <> 'condicional' or length(trim(execution_condition)) > 0
  ),
  constraint activities_date_order check (start_date is null or due_date is null or due_date >= start_date)
);

create table public.activity_code_counters (
  area_id uuid primary key references public.areas(id) on delete cascade,
  next_number integer not null default 1 check (next_number > 0)
);

create table public.weekly_updates (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  status public.weekly_status not null,
  justification text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weekly_updates_one_per_week unique (activity_id, week_start),
  constraint pending_requires_justification check (
    status <> 'pending' or length(trim(justification)) > 0
  )
);

create table public.team_settings (
  id smallint primary key default 1 check (id = 1),
  cycle_start date not null default date '2026-11-09',
  cycle_weeks smallint not null default 60 check (cycle_weeks between 1 and 60),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.drive_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  drive_url text not null check (drive_url ~ '^https://drive[.]google[.]com/'),
  area_id uuid references public.areas(id) on delete restrict,
  is_primary boolean not null default false,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  removed_by uuid references auth.users(id) on delete set null,
  removed_at timestamptz
);
create unique index drive_folders_single_primary on public.drive_folders (is_primary)
  where is_primary and removed_at is null;

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  message text not null check (length(trim(message)) > 0),
  audience_area_id uuid references public.areas(id) on delete restrict,
  author_id uuid references auth.users(id) on delete set null,
  pinned_at timestamptz,
  created_at timestamptz not null default now(),
  removed_by uuid references auth.users(id) on delete set null,
  removed_at timestamptz
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  entity text not null,
  entity_id uuid not null,
  action text not null check (action in ('insert', 'update', 'remove', 'delete')),
  actor_id uuid references auth.users(id) on delete set null,
  changed_fields jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index activities_area_type on public.activities(area_id, activity_type) where archived_at is null;
create index activities_dates on public.activities(due_date) where archived_at is null;
create index activities_responsible on public.activities(responsible_user_id) where archived_at is null;
create index weekly_updates_week on public.weekly_updates(week_start, activity_id);
create index audit_log_entity on public.audit_log(entity, entity_id, occurred_at desc);
create index announcements_feed on public.announcements(created_at desc) where removed_at is null;

insert into public.nuclei (slug, name) values
  ('gestao', 'Núcleo de Gestão'),
  ('engenharia', 'Núcleo de Engenharia');

insert into public.areas (nucleus_id, slug, name, code_prefix, notes)
select n.id, seed.slug, seed.name, seed.code_prefix, seed.notes
from (values
  ('gestao', 'gestao-de-pessoas', 'Gestão de Pessoas', 'GP', ''),
  ('gestao', 'administrativo-financeiro', 'Administrativo-Financeiro', 'AF', ''),
  ('gestao', 'projetos', 'Projetos', 'PR', 'Consolida o acompanhamento geral.'),
  ('gestao', 'marketing', 'Marketing', 'MK', ''),
  ('engenharia', 'mecanica-naval', 'Mecânica Naval', 'MN', ''),
  ('engenharia', 'energia', 'Energia', 'EN', ''),
  ('engenharia', 'telemetria', 'Telemetria', 'TL', ''),
  ('engenharia', 'tecnologia-da-informacao', 'Tecnologia da Informação (TI)', 'TI', 'Também presta suporte ao Núcleo de Gestão.')
) as seed(nucleus_slug, slug, name, code_prefix, notes)
join public.nuclei n on n.slug = seed.nucleus_slug;

insert into public.team_settings (id, cycle_start, cycle_weeks)
values (1, date '2026-11-09', 60);

-- O gerador abaixo insere as 58 atividades sem reescrever seus textos/datas.
insert into public.activities (code, area_id, name, description, activity_type, frequency, execution_condition, responsible_name, start_date, due_date, expected_deliverable, notes)
select
  s.code,
  a.id,
  s.name,
  coalesce(s.description, ''),
  case s.activity_type
    when 'Marco' then 'marco'::public.activity_type
    when 'Pontual' then 'pontual'::public.activity_type
    when 'Rotina' then 'rotina'::public.activity_type
    when 'Condicional' then 'condicional'::public.activity_type
  end,
  coalesce(s.frequency, ''),
  coalesce(s.execution_condition, ''),
  coalesce(s.responsible_name, 'A definir'),
  nullif(s.start_date, '')::date,
  nullif(s.due_date, '')::date,
  coalesce(s.expected_deliverable, ''),
  coalesce(s.notes, '')
from jsonb_to_recordset($solmar_seed$[{"code":"AF-01","area":"Administrativo-Financeiro","name":"Registrar receitas","description":"Lançar as entradas de recursos (patrocínios, vendas, apoios).","activity_type":"Condicional","frequency":"Sob demanda","execution_condition":"Houve entrada de recursos","responsible_name":"A definir","start_date":"2026-11-02","due_date":"2027-12-26","expected_deliverable":"Receita lançada no controle financeiro","notes":"Sem movimentação ou demanda na semana: registrar 'Não se aplica'."},{"code":"AF-02","area":"Administrativo-Financeiro","name":"Registrar despesas","description":"Lançar saídas e pagamentos realizados.","activity_type":"Condicional","frequency":"Sob demanda","execution_condition":"Houve movimentação financeira (despesa)","responsible_name":"A definir","start_date":"2026-11-02","due_date":"2027-12-26","expected_deliverable":"Despesa lançada com comprovante","notes":"Sem movimentação ou demanda na semana: registrar 'Não se aplica'."},{"code":"AF-03","area":"Administrativo-Financeiro","name":"Atualizar fluxo de caixa","description":"Manter o fluxo de caixa atualizado após cada movimentação.","activity_type":"Condicional","frequency":"Sob demanda","execution_condition":"Houve movimentação financeira","responsible_name":"A definir","start_date":"2026-11-02","due_date":"2027-12-26","expected_deliverable":"Fluxo de caixa atualizado","notes":"Sem movimentação ou demanda na semana: registrar 'Não se aplica'."},{"code":"AF-04","area":"Administrativo-Financeiro","name":"Realizar compras","description":"Executar compras aprovadas pela equipe.","activity_type":"Condicional","frequency":"Sob demanda","execution_condition":"Existe compra aprovada","responsible_name":"A definir","start_date":"2026-11-02","due_date":"2027-12-26","expected_deliverable":"Compra realizada e comprovada","notes":"Sem movimentação ou demanda na semana: registrar 'Não se aplica'."},{"code":"AF-05","area":"Administrativo-Financeiro","name":"Elaborar orçamentos","description":"Elaborar orçamentos de itens, serviços e eventos.","activity_type":"Condicional","frequency":"Sob demanda","execution_condition":"Existe demanda de orçamento","responsible_name":"A definir","start_date":"2026-11-02","due_date":"2027-12-26","expected_deliverable":"Orçamento elaborado","notes":"Sem movimentação ou demanda na semana: registrar 'Não se aplica'."},{"code":"AF-06","area":"Administrativo-Financeiro","name":"Conferir saldo e situação financeira","description":"Conferir saldo, receitas e despesas do mês.","activity_type":"Rotina","frequency":"Mensal","execution_condition":"","responsible_name":"A definir","start_date":"2026-11-02","due_date":"2027-12-26","expected_deliverable":"Saldo conferido e registrado","notes":""},{"code":"AF-07","area":"Administrativo-Financeiro","name":"Elaborar prestação de contas","description":"Prestar contas de recursos recebidos e utilizados.","activity_type":"Condicional","frequency":"Conforme planejamento","execution_condition":"Necessidade ou período de prestação de contas definido","responsible_name":"A definir","start_date":"2026-11-02","due_date":"2027-12-26","expected_deliverable":"Prestação de contas entregue","notes":"Sem movimentação ou demanda na semana: registrar 'Não se aplica'."},{"code":"AF-08","area":"Administrativo-Financeiro","name":"Elaborar orçamento anual 2027","description":"Estimar receitas e despesas do ciclo.","activity_type":"Pontual","frequency":"Única","execution_condition":"","responsible_name":"A definir","start_date":"2026-11-09","due_date":"2026-12-18","expected_deliverable":"Orçamento anual aprovado","notes":"Exemplo: ajustar datas e responsável."},{"code":"EN-01","area":"Energia","name":"Atualizar diagramas elétricos","description":"Manter os diagramas elétricos alinhados ao sistema real.","activity_type":"Condicional","frequency":"Sob demanda","execution_condition":"Houve alteração no sistema elétrico","responsible_name":"A definir","start_date":"2026-11-02","due_date":"2027-12-26","expected_deliverable":"Diagramas elétricos atualizados","notes":""},{"code":"EN-02","area":"Energia","name":"Acompanhar sistema fotovoltaico","description":"Acompanhar o desempenho dos módulos e do controlador.","activity_type":"Condicional","frequency":"Durante testes","execution_condition":"Teste ou operação em andamento","responsible_name":"A definir","start_date":"2026-11-02","due_date":"2027-12-26","expected_deliverable":"Registro do desempenho fotovoltaico","notes":""},{"code":"EN-03","area":"Energia","name":"Monitorar baterias e BMS","description":"Monitorar tensão, corrente e temperatura das baterias.","activity_type":"Condicional","frequency":"Durante testes","execution_condition":"Teste ou operação em andamento","responsible_name":"A definir","start_date":"2026-11-02","due_date":"2027-12-26","expected_deliverable":"Registro de baterias e BMS","notes":""},{"code":"EN-04","area":"Energia","name":"Realizar testes de geração e consumo","description":"Medir geração solar e consumo do sistema.","activity_type":"Condicional","frequency":"Conforme planejamento","execution_condition":"Teste previsto no planejamento","responsible_name":"A definir","start_date":"2026-11-02","due_date":"2027-12-26","expected_deliverable":"Relatório de geração e consumo","notes":""},{"code":"EN-05","area":"Energia","name":"Atualizar cálculos de autonomia e eficiência","description":"Recalcular autonomia e eficiência com os dados mais recentes.","activity_type":"Condicional","frequency":"Sob demanda","execution_condition":"Novos testes ou alterações no sistema","responsible_name":"A definir","start_date":"2026-11-02","due_date":"2027-12-26","expected_deliverable":"Cálculos de autonomia e eficiência atualizados","notes":""},{"code":"EN-06","area":"Energia","name":"Revisar sistema elétrico (relés, cabeamento e conexões)","description":"Avaliar e corrigir relés, cabos e conexões do sistema elétrico.","activity_type":"Pontual","frequency":"Única","execution_condition":"","responsible_name":"A definir","start_date":"2026-11-09","due_date":"2026-12-11","expected_deliverable":"Sistema elétrico revisado e testado","notes":"Exemplo: ajustar datas e responsável."},{"code":"EN-07","area":"Energia","name":"Esquema elétrico e cálculo de autonomia validados","description":"Esquema elétrico e autonomia validados.","activity_type":"Marco","frequency":"Única","execution_condition":"","responsible_name":"A definir","start_date":"2027-02-01","due_date":"2027-04-02","expected_deliverable":"Esquema elétrico e memória de cálculo","notes":"Exemplo: ajustar datas e responsável."},{"code":"GP-01","area":"Gestão de Pessoas","name":"Acompanhar participação e comprometimento dos integrantes","description":"Verificar presença, entregas e engajamento dos integrantes nas atividades da equipe.","activity_type":"Rotina","frequency":"Semanal","execution_condition":"","responsible_name":"A definir","start_date":"2026-11-02","due_date":"2027-12-26","expected_deliverable":"Registro semanal de participação","notes":""},{"code":"GP-02","area":"Gestão de Pessoas","name":"Acompanhar integração da equipe","description":"Observar o clima e a integração entre integrantes e áreas.","activity_type":"Rotina","frequency":"Semanal","execution_condition":"","responsible_name":"A definir","start_date":"2026-11-02","due_date":"2027-12-26","expected_deliverable":"Registro de observações de integração","notes":""},{"code":"GP-03","area":"Gestão de Pessoas","name":"Realizar integração de novos membros","description":"Apresentar equipe, áreas, regras e ferramentas aos novos integrantes.","activity_type":"Condicional","frequency":"Sob demanda","execution_condition":"Entrada de novo(s) integrante(s) na equipe","responsible_name":"A definir","start_date":"2026-11-02","due_date":"2027-12-26","expected_deliverable":"Integrante integrado e cadastrado","notes":""},{"code":"GP-04","area":"Gestão de Pessoas","name":"Acompanhar capacitações","description":"Acompanhar treinamentos e capacitações previstos para os integrantes.","activity_type":"Condicional","frequency":"Conforme planejamento","execution_condition":"Capacitação prevista no planejamento","responsible_name":"A definir","start_date":"2026-11-02","due_date":"2027-12-26","expected_deliverable":"Lista de presença e registro das capacitações","notes":""},{"code":"GP-05","area":"Gestão de Pessoas","name":"Prospectar patrocinadores","description":"Identificar e abordar potenciais patrocinadores e apoiadores.","activity_type":"Rotina","frequency":"Semanal","execution_condition":"","responsible_name":"A definir","start_date":"2026-11-02","due_date":"2027-12-26","expected_deliverable":"Lista atualizada de patrocinadores prospectados","notes":""},{"code":"GP-06","area":"Gestão de Pessoas","name":"Acompanhar contatos e retornos de patrocinadores","description":"Registrar contatos realizados, retornos recebidos e próximos passos.","activity_type":"Rotina","frequency":"Semanal","execution_condition":"","responsible_name":"A definir","start_date":"2026-11-02","due_date":"2027-12-26","expected_deliverable":"Planilha de contatos atualizada","notes":""},{"code":"GP-07","area":"Gestão de Pessoas","name":"Elaborar plano de capacitação 2027","description":"Definir as capacitações necessárias por área.","activity_type":"Pontual","frequency":"Única","execution_condition":"","responsible_name":"A definir","start_date":"2026-11-16","due_date":"2026-12-18","expected_deliverable":"Plano de capacitação","notes":"Exemplo: ajustar datas e responsável."},{"code":"GP-08","area":"Gestão de Pessoas","name":"Inscrição da equipe e definição de integrantes e pilotos","description":"Inscrição realizada e lista de participantes definida.","activity_type":"Marco","frequency":"Única","execution_condition":"","responsible_name":"A definir","start_date":"2027-04-05","due_date":"2027-05-28","expected_deliverable":"Comprovante de inscrição e lista de participantes","notes":"Exemplo: ajustar datas e responsável."},{"code":"MK-01","area":"Marketing","name":"Planejar conteúdos","description":"Definir a pauta semanal de conteúdos.","activity_type":"Rotina","frequency":"Semanal","execution_condition":"","responsible_name":"A definir","start_date":"2026-11-02","due_date":"2027-12-26","expected_deliverable":"Pauta semanal de conteúdos","notes":""},{"code":"MK-02","area":"Marketing","name":"Publicar conteúdos","description":"Publicar os conteúdos aprovados nos canais da equipe.","activity_type":"Condicional","frequency":"Conforme planejamento","execution_condition":"Publicação prevista no calendário editorial","responsible_name":"A definir","start_date":"2026-11-02","due_date":"2027-12-26","expected_deliverable":"Conteúdo publicado","notes":""},{"code":"MK-03","area":"Marketing","name":"Atualizar redes sociais","description":"Atualizar perfis, destaques e informações das redes.","activity_type":"Condicional","frequency":"Conforme planejamento","execution_condition":"Atualização prevista no planejamento","responsible_name":"A definir","start_date":"2026-11-02","due_date":"2027-12-26","expected_deliverable":"Perfis atualizados","notes":""},{"code":"MK-04","area":"Marketing","name":"Desenvolver materiais de divulgação","description":"Criar artes, banners, apresentações e peças de divulgação.","activity_type":"Condicional","frequency":"Sob demanda","execution_condition":"Existe demanda de material","responsible_name":"A definir","start_date":"2026-11-02","due_date":"2027-12-26","expected_deliverable":"Material de divulgação finalizado","notes":""},{"code":"MK-05","area":"Marketing","name":"Acompanhar vendas de produtos","description":"Acompanhar vendas durante campanhas de produtos.","activity_type":"Condicional","frequency":"Semanal","execution_condition":"Campanha de vendas ativa","responsible_name":"A definir","start_date":"2026-11-02","due_date":"2027-12-26","expected_deliverable":"Registro de vendas da campanha","notes":""},{"code":"MK-06","area":"Marketing","name":"Elaborar relatório de alcance e engajamento","description":"Relatório mensal de alcance e engajamento das redes.","activity_type":"Rotina","frequency":"Mensal","execution_condition":"","responsible_name":"A definir","start_date":"2026-11-02","due_date":"2027-12-26","expected_deliverable":"Relatório de alcance e engajamento","notes":""},{"code":"MK-07","area":"Marketing","name":"Definir calendário editorial 2027","description":"Planejar datas e temas dos conteúdos do ciclo.","activity_type":"Pontual","frequency":"Única","execution_condition":"","responsible_name":"A definir","start_date":"2026-11-09","due_date":"2026-11-27","expected_deliverable":"Calendário editorial aprovado","notes":"Exemplo: ajustar datas e responsável."},{"code":"MN-01","area":"Mecânica Naval","name":"Revisar desenhos e modelos 3D","description":"Revisar desenhos técnicos e modelos 3D da embarcação.","activity_type":"Condicional","frequency":"Conforme planejamento","execution_condition":"Revisão prevista no planejamento","responsible_name":"A definir","start_date":"2026-11-02","due_date":"2027-12-26","expected_deliverable":"Desenhos e modelos revisados","notes":""},{"code":"MN-02","area":"Mecânica Naval","name":"Acompanhar fabricação e montagem","description":"Acompanhar o avanço das etapas de fabricação e montagem.","activity_type":"Condicional","frequency":"Conforme planejamento","execution_condition":"Etapa de fabricação ou montagem em andamento","responsible_name":"A definir","start_date":"2026-11-02","due_date":"2027-12-26","expected_deliverable":"Registro do avanço da fabricação","notes":""},{"code":"MN-03","area":"Mecânica Naval","name":"Inspecionar casco, leme e hélice","description":"Inspecionar casco, leme e hélice nas etapas de fabricação e testes.","activity_type":"Condicional","frequency":"Durante testes","execution_condition":"Etapa de fabricação ou testes em andamento","responsible_name":"A definir","start_date":"2026-11-02","due_date":"2027-12-26","expected_deliverable":"Checklist de inspeção","notes":""},{"code":"MN-04","area":"Mecânica Naval","name":"Realizar testes mecânicos","description":"Executar os testes mecânicos previstos.","activity_type":"Condicional","frequency":"Conforme planejamento","execution_condition":"Teste previsto no planejamento","responsible_name":"A definir","start_date":"2026-11-02","due_date":"2027-12-26","expected_deliverable":"Relatório de testes mecânicos","notes":""},{"code":"MN-05","area":"Mecânica Naval","name":"Registrar alterações e melhorias","description":"Registrar toda alteração ou melhoria feita na embarcação.","activity_type":"Condicional","frequency":"Sob demanda","execution_condition":"Ocorreu alteração ou melhoria","responsible_name":"A definir","start_date":"2026-11-02","due_date":"2027-12-26","expected_deliverable":"Registro de alterações e melhorias","notes":""},{"code":"MN-06","area":"Mecânica Naval","name":"Revisar sistema de direção da embarcação","description":"Avaliar e corrigir o conjunto de direção.","activity_type":"Pontual","frequency":"Única","execution_condition":"","responsible_name":"A definir","start_date":"2026-11-09","due_date":"2026-12-11","expected_deliverable":"Direção revisada e testada","notes":"Exemplo: ajustar datas e responsável."},{"code":"MN-07","area":"Mecânica Naval","name":"Projeto básico da embarcação concluído","description":"Projeto básico consolidado e validado.","activity_type":"Marco","frequency":"Única","execution_condition":"","responsible_name":"A definir","start_date":"2027-02-01","due_date":"2027-03-26","expected_deliverable":"Documento do projeto básico","notes":"Exemplo: ajustar datas e responsável."},{"code":"PR-01","area":"Projetos","name":"Atualizar cronograma geral","description":"Atualizar status, prazos e responsáveis do cronograma.","activity_type":"Rotina","frequency":"Semanal","execution_condition":"","responsible_name":"A definir","start_date":"2026-11-02","due_date":"2027-12-26","expected_deliverable":"Cronograma geral atualizado","notes":""},{"code":"PR-02","area":"Projetos","name":"Acompanhar pendências das áreas","description":"Levantar com cada área as pendências e justificativas.","activity_type":"Rotina","frequency":"Semanal","execution_condition":"","responsible_name":"A definir","start_date":"2026-11-02","due_date":"2027-12-26","expected_deliverable":"Lista de pendências por área","notes":""},{"code":"PR-03","area":"Projetos","name":"Monitorar prazos e entregáveis","description":"Monitorar prazos dos marcos e entregáveis das áreas.","activity_type":"Rotina","frequency":"Semanal","execution_condition":"","responsible_name":"A definir","start_date":"2026-11-02","due_date":"2027-12-26","expected_deliverable":"Prazos e entregáveis monitorados","notes":""},{"code":"PR-04","area":"Projetos","name":"Realizar reunião de acompanhamento","description":"Reunião quinzenal de alinhamento entre as áreas.","activity_type":"Rotina","frequency":"Quinzenal","execution_condition":"","responsible_name":"A definir","start_date":"2026-11-02","due_date":"2027-12-26","expected_deliverable":"Ata da reunião","notes":""},{"code":"PR-05","area":"Projetos","name":"Atualizar matriz de responsabilidades","description":"Atualizar quem responde por cada atividade e área.","activity_type":"Condicional","frequency":"Sob demanda","execution_condition":"Mudança de responsáveis ou de escopo","responsible_name":"A definir","start_date":"2026-11-02","due_date":"2027-12-26","expected_deliverable":"Matriz de responsabilidades atualizada","notes":""},{"code":"PR-06","area":"Projetos","name":"Consolidar relatório de desempenho","description":"Consolidar indicadores e resultados do mês.","activity_type":"Rotina","frequency":"Mensal","execution_condition":"","responsible_name":"A definir","start_date":"2026-11-02","due_date":"2027-12-26","expected_deliverable":"Relatório mensal de desempenho","notes":""},{"code":"PR-07","area":"Projetos","name":"Aprovação do plano de trabalho 2027","description":"Plano de trabalho do ciclo aprovado pela equipe.","activity_type":"Marco","frequency":"Única","execution_condition":"","responsible_name":"A definir","start_date":"2026-11-02","due_date":"2026-12-18","expected_deliverable":"Plano de trabalho aprovado","notes":"Exemplo: ajustar datas e responsável."},{"code":"PR-08","area":"Projetos","name":"Artigo científico submetido","description":"Artigo da equipe finalizado e submetido.","activity_type":"Marco","frequency":"Única","execution_condition":"","responsible_name":"A definir","start_date":"2027-03-01","due_date":"2027-05-14","expected_deliverable":"Artigo submetido","notes":"Exemplo: ajustar datas e responsável."},{"code":"PR-09","area":"Projetos","name":"Participação no Desafio Solar Brasil 2027","description":"Preparação e participação na competição.","activity_type":"Marco","frequency":"Única","execution_condition":"","responsible_name":"A definir","start_date":"2027-07-05","due_date":"2027-07-18","expected_deliverable":"Participação concluída e relatório da competição","notes":"Exemplo: ajustar datas e responsável."},{"code":"TI-01","area":"Tecnologia da Informação (TI)","name":"Organizar arquivos digitais","description":"Manter arquivos organizados na estrutura padrão da equipe.","activity_type":"Rotina","frequency":"Semanal","execution_condition":"","responsible_name":"A definir","start_date":"2026-11-02","due_date":"2027-12-26","expected_deliverable":"Arquivos organizados na estrutura padrão","notes":"Apoia também o Núcleo de Gestão."},{"code":"TI-02","area":"Tecnologia da Informação (TI)","name":"Realizar backup","description":"Realizar e confirmar o backup dos arquivos da equipe.","activity_type":"Rotina","frequency":"Semanal","execution_condition":"","responsible_name":"A definir","start_date":"2026-11-02","due_date":"2027-12-26","expected_deliverable":"Backup realizado e confirmado","notes":""},{"code":"TI-03","area":"Tecnologia da Informação (TI)","name":"Verificar acessos e permissões","description":"Revisar quem tem acesso às pastas e plataformas.","activity_type":"Rotina","frequency":"Mensal","execution_condition":"","responsible_name":"A definir","start_date":"2026-11-02","due_date":"2027-12-26","expected_deliverable":"Acessos e permissões revisados","notes":"Também executar quando necessário."},{"code":"TI-04","area":"Tecnologia da Informação (TI)","name":"Manter sistemas e plataformas","description":"Manter sistemas e plataformas da equipe funcionando.","activity_type":"Condicional","frequency":"Sob demanda","execution_condition":"Necessidade de manutenção ou atualização","responsible_name":"A definir","start_date":"2026-11-02","due_date":"2027-12-26","expected_deliverable":"Sistema ou plataforma em funcionamento","notes":""},{"code":"TI-05","area":"Tecnologia da Informação (TI)","name":"Prestar suporte técnico","description":"Atender solicitações de suporte das áreas de Engenharia e do Núcleo de Gestão.","activity_type":"Condicional","frequency":"Sob demanda","execution_condition":"Solicitação de suporte recebida","responsible_name":"A definir","start_date":"2026-11-02","due_date":"2027-12-26","expected_deliverable":"Solicitação atendida","notes":""},{"code":"TI-06","area":"Tecnologia da Informação (TI)","name":"Estruturar pastas e permissões do acervo digital","description":"Criar a estrutura padrão de pastas e definir permissões por área.","activity_type":"Pontual","frequency":"Única","execution_condition":"","responsible_name":"A definir","start_date":"2026-11-02","due_date":"2026-11-27","expected_deliverable":"Estrutura de pastas publicada","notes":"Exemplo: ajustar datas e responsável."},{"code":"TL-01","area":"Telemetria","name":"Verificar funcionamento dos sensores","description":"Checar sensores e leituras da telemetria.","activity_type":"Rotina","frequency":"Semanal","execution_condition":"","responsible_name":"A definir","start_date":"2026-11-02","due_date":"2027-12-26","expected_deliverable":"Checklist de sensores","notes":"Executar também durante os testes."},{"code":"TL-02","area":"Telemetria","name":"Realizar testes de comunicação","description":"Testar a comunicação entre barco e base.","activity_type":"Condicional","frequency":"Conforme planejamento","execution_condition":"Teste previsto no planejamento","responsible_name":"A definir","start_date":"2026-11-02","due_date":"2027-12-26","expected_deliverable":"Relatório de testes de comunicação","notes":""},{"code":"TL-03","area":"Telemetria","name":"Atualizar códigos e programas","description":"Implementar e versionar alterações de código.","activity_type":"Condicional","frequency":"Sob demanda","execution_condition":"Houve alteração a implementar","responsible_name":"A definir","start_date":"2026-11-02","due_date":"2027-12-26","expected_deliverable":"Código atualizado e versionado","notes":""},{"code":"TL-04","area":"Telemetria","name":"Registrar dados de telemetria","description":"Armazenar os dados coletados nos testes.","activity_type":"Condicional","frequency":"Durante testes","execution_condition":"Teste em andamento","responsible_name":"A definir","start_date":"2026-11-02","due_date":"2027-12-26","expected_deliverable":"Dados de telemetria armazenados","notes":""},{"code":"TL-05","area":"Telemetria","name":"Corrigir falhas identificadas","description":"Corrigir falhas encontradas na telemetria.","activity_type":"Condicional","frequency":"Sob demanda","execution_condition":"Falha identificada","responsible_name":"A definir","start_date":"2026-11-02","due_date":"2027-12-26","expected_deliverable":"Falha corrigida e registrada","notes":""},{"code":"TL-06","area":"Telemetria","name":"Instalar e calibrar sensores de telemetria","description":"Instalar e calibrar os sensores previstos.","activity_type":"Pontual","frequency":"Única","execution_condition":"","responsible_name":"A definir","start_date":"2026-11-16","due_date":"2027-01-29","expected_deliverable":"Sensores instalados e calibrados","notes":"Exemplo: ajustar datas e responsável."}]$solmar_seed$::jsonb) as s(
  code text, area text, name text, description text, activity_type text,
  frequency text, execution_condition text, responsible_name text,
  start_date text, due_date text, expected_deliverable text, notes text
)
join public.areas a on a.name = s.area
on conflict (code) do nothing;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.create_pending_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, full_name, role, status)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), ''),
    'member',
    'pending'
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.create_pending_profile();

create or replace function public.current_profile_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select p.role from public.profiles p
  where p.user_id = auth.uid() and p.status = 'active'
$$;

create or replace function public.current_profile_area()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.area_id from public.profiles p
  where p.user_id = auth.uid() and p.status = 'active'
$$;

create or replace function public.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles p
    where p.user_id = auth.uid() and p.status = 'active')
$$;

create or replace function public.is_team_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_profile_role() = 'admin', false)
$$;

create or replace function public.is_area_lead_for(p_area_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_profile_role() = 'area_lead'
    and public.current_profile_area() = p_area_id, false)
$$;

create or replace function public.can_edit_activity(p_activity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.activities a
    where a.id = p_activity_id
      and a.archived_at is null
      and (
        public.is_team_admin()
        or public.is_area_lead_for(a.area_id)
        or (public.current_profile_role() = 'member' and a.responsible_user_id = auth.uid())
      )
  )
$$;

revoke all on function public.create_pending_profile() from public, anon, authenticated;
revoke all on function public.current_profile_role() from public, anon;
revoke all on function public.current_profile_area() from public, anon;
revoke all on function public.is_active_member() from public, anon;
revoke all on function public.is_team_admin() from public, anon;
revoke all on function public.is_area_lead_for(uuid) from public, anon;
revoke all on function public.can_edit_activity(uuid) from public, anon;
grant execute on function public.current_profile_role() to authenticated;
grant execute on function public.current_profile_area() to authenticated;
grant execute on function public.is_active_member() to authenticated;
grant execute on function public.is_team_admin() to authenticated;
grant execute on function public.is_area_lead_for(uuid) to authenticated;
grant execute on function public.can_edit_activity(uuid) to authenticated;

create or replace function public.assign_activity_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number integer;
  v_prefix text;
begin
  insert into public.activity_code_counters as counter (area_id, next_number)
  values (new.area_id, 2)
  on conflict (area_id) do update
    set next_number = counter.next_number + 1
  returning next_number - 1 into v_number;

  select a.code_prefix into v_prefix from public.areas a where a.id = new.area_id;
  if v_prefix is null then
    raise exception 'Área inválida para gerar o código da atividade.';
  end if;
  new.code := v_prefix || '-' || lpad(v_number::text, greatest(2, length(v_number::text)), '0');
  new.created_by := coalesce(new.created_by, auth.uid());
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.assign_activity_code() from public, anon, authenticated;

create or replace function public.set_weekly_actor()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_changed jsonb := '{}'::jsonb;
  v_fields text[];
  v_field text;
  v_action text;
  v_entity_id uuid;
  v_actor uuid := auth.uid();
begin
  if tg_op = 'DELETE' then
    v_before := to_jsonb(old);
    v_after := '{}'::jsonb;
    v_entity_id := (v_before ->> 'id')::uuid;
    v_action := 'delete';
  else
    v_before := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
    v_after := to_jsonb(new);
    v_entity_id := (v_after ->> 'id')::uuid;
    v_action := case when tg_op = 'INSERT' then 'insert' else 'update' end;
    if (tg_table_name = 'activities' and v_before -> 'archived_at' = 'null'::jsonb and v_after -> 'archived_at' <> 'null'::jsonb)
       or (tg_table_name in ('drive_folders', 'announcements') and v_before -> 'removed_at' = 'null'::jsonb and v_after -> 'removed_at' <> 'null'::jsonb) then
      v_action := 'remove';
    end if;
  end if;

  v_fields := case tg_table_name
    when 'activities' then array['code','name','start_date','due_date','responsible_name','responsible_user_id','archived_at']
    when 'weekly_updates' then array['week_start','status']
    when 'drive_folders' then array['name','area_id','is_primary','removed_at']
    when 'announcements' then array['title','audience_area_id','pinned_at','removed_at']
    else array[]::text[]
  end;

  foreach v_field in array v_fields loop
    if (v_before -> v_field) is distinct from (v_after -> v_field) then
      v_changed := v_changed || jsonb_build_object(v_field,
        jsonb_build_object('before', v_before -> v_field, 'after', v_after -> v_field));
    end if;
  end loop;

  insert into public.audit_log(entity, entity_id, action, actor_id, changed_fields)
  values (tg_table_name, v_entity_id, v_action, v_actor, v_changed);

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.audit_row_change() from public, anon, authenticated;

create trigger activities_assign_code
  before insert on public.activities
  for each row execute function public.assign_activity_code();
create trigger activities_touch_updated_at
  before update on public.activities
  for each row execute function public.touch_updated_at();
create trigger weekly_updates_actor
  before insert or update on public.weekly_updates
  for each row execute function public.set_weekly_actor();
create trigger weekly_updates_touch_updated_at
  before update on public.weekly_updates
  for each row execute function public.touch_updated_at();
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger team_settings_touch_updated_at
  before update on public.team_settings
  for each row execute function public.touch_updated_at();
create trigger audit_activities after insert or update or delete on public.activities
  for each row execute function public.audit_row_change();
create trigger audit_weekly_updates after insert or update or delete on public.weekly_updates
  for each row execute function public.audit_row_change();
create trigger audit_drive_folders after insert or update or delete on public.drive_folders
  for each row execute function public.audit_row_change();
create trigger audit_announcements after insert or update or delete on public.announcements
  for each row execute function public.audit_row_change();

insert into public.activity_code_counters (area_id, next_number)
select a.id, max((split_part(ac.code, '-', 2))::integer) + 1
from public.activities ac
join public.areas a on a.id = ac.area_id
group by a.id
on conflict (area_id) do update
set next_number = greatest(public.activity_code_counters.next_number, excluded.next_number);

alter table public.nuclei enable row level security;
alter table public.areas enable row level security;
alter table public.profiles enable row level security;
alter table public.activities enable row level security;
alter table public.activity_code_counters enable row level security;
alter table public.weekly_updates enable row level security;
alter table public.team_settings enable row level security;
alter table public.drive_folders enable row level security;
alter table public.announcements enable row level security;
alter table public.audit_log enable row level security;

create policy nuclei_read_active on public.nuclei for select to authenticated
  using (public.is_active_member());
create policy nuclei_admin_manage on public.nuclei for all to authenticated
  using (public.is_team_admin()) with check (public.is_team_admin());

create policy areas_read_active on public.areas for select to authenticated
  using (public.is_active_member());
create policy areas_admin_manage on public.areas for all to authenticated
  using (public.is_team_admin()) with check (public.is_team_admin());

create policy profiles_read_directory on public.profiles for select to authenticated
  using (user_id = auth.uid() or public.is_active_member());

create policy activities_read_active on public.activities for select to authenticated
  using (public.is_active_member() and archived_at is null);
create policy activities_lead_insert on public.activities for insert to authenticated
  with check (public.is_team_admin() or public.is_area_lead_for(area_id));
create policy activities_lead_update on public.activities for update to authenticated
  using (public.is_team_admin() or public.is_area_lead_for(area_id))
  with check (public.is_team_admin() or public.is_area_lead_for(area_id));

create policy weekly_updates_read_active on public.weekly_updates for select to authenticated
  using (public.is_active_member());
create policy weekly_updates_insert_allowed on public.weekly_updates for insert to authenticated
  with check (public.can_edit_activity(activity_id));
create policy weekly_updates_update_allowed on public.weekly_updates for update to authenticated
  using (public.can_edit_activity(activity_id))
  with check (public.can_edit_activity(activity_id));

create policy team_settings_read_active on public.team_settings for select to authenticated
  using (public.is_active_member());
create policy team_settings_admin_update on public.team_settings for update to authenticated
  using (public.is_team_admin()) with check (public.is_team_admin());

create policy drive_folders_read_active on public.drive_folders for select to authenticated
  using (public.is_active_member() and removed_at is null);
create policy announcements_read_recipients on public.announcements for select to authenticated
  using (
    removed_at is null and (
      public.is_team_admin() or (
        public.is_active_member() and
        (audience_area_id is null or audience_area_id = public.current_profile_area())
      )
    )
  );
create policy audit_log_admin_read on public.audit_log for select to authenticated
  using (public.is_team_admin());

revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to authenticated;
grant select on public.nuclei, public.areas, public.profiles, public.activities,
  public.weekly_updates, public.team_settings, public.drive_folders,
  public.announcements, public.audit_log to authenticated;
grant insert, update on public.activities, public.weekly_updates,
  public.team_settings to authenticated;

commit;
