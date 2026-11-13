-- Permite registrar marcos sem datas e cria as duas frentes do sistema de propulsão
-- usando exclusivamente os setores já existentes: Mecânica Naval e Energia.
begin;

alter table public.activities
  drop constraint if exists activities_type_dates;

alter table public.activities
  add constraint activities_type_dates check (
    (activity_type <> 'pontual' or due_date is not null)
    and (start_date is null or due_date is null or due_date >= start_date)
  );

insert into public.activities (
  area_id, name, description, activity_type, frequency, execution_condition,
  responsible_name, expected_deliverable, notes, priority, flow_status
)
select
  a.id,
  'Desenvolvimento do Sistema de Propulsão Elétrica — Frente Mecânica',
  'Desenvolver a frente mecânica do sistema de propulsão elétrica da embarcação SolMar Celeris. Abrange levantamento dos requisitos do motor; definição da transmissão e do acoplamento; projeto dos suportes e sistemas de fixação; verificação da compatibilidade com o casco; fabricação ou adaptação dos componentes; instalação do motor; inspeções e testes mecânicos.',
  'marco'::public.activity_type,
  '',
  '',
  'A definir',
  'Desenho ou modelo mecânico; especificação dos suportes e fixações; definição do acoplamento e da transmissão; componentes fabricados ou adaptados; motor instalado; registro das inspeções e dos testes mecânicos.',
  '',
  'high',
  'backlog'
from public.areas a
where a.slug = 'mecanica-naval'
  and not exists (
    select 1 from public.activities x
    where x.area_id = a.id
      and x.name = 'Desenvolvimento do Sistema de Propulsão Elétrica — Frente Mecânica'
      and x.archived_at is null
  );

insert into public.activities (
  area_id, name, description, activity_type, frequency, execution_condition,
  responsible_name, expected_deliverable, notes, priority, flow_status
)
select
  a.id,
  'Desenvolvimento do Sistema de Propulsão Elétrica — Frente Elétrica',
  'Desenvolver a frente elétrica do sistema de propulsão da embarcação SolMar Celeris. Abrange levantamento dos requisitos dos motores CC (AGNI) e CA; dimensionamento; compatibilidade com baterias e geração fotovoltaica; elaboração dos diagramas CC e CA; avaliação de controladores, inversores e conversores; elaboração de matriz comparativa; definição da arquitetura elétrica; especificação dos itens para aquisição e instalação; preparação da infraestrutura, proteções e controladores; testes elétricos.',
  'marco'::public.activity_type,
  '',
  '',
  'A definir',
  'Requisitos dos motores; memória de cálculo; diagramas elétricos CC e CA; matriz comparativa e justificativa técnica; lista de materiais; infraestrutura elétrica instalada; controladores e proteções especificados; registro dos testes elétricos.',
  '',
  'high',
  'backlog'
from public.areas a
where a.slug = 'energia'
  and not exists (
    select 1 from public.activities x
    where x.area_id = a.id
      and x.name = 'Desenvolvimento do Sistema de Propulsão Elétrica — Frente Elétrica'
      and x.archived_at is null
  );

commit;
