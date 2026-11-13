-- Substitui os dois cartões-resumo por cartões individuais para cada etapa.
-- Utiliza somente as áreas existentes no organograma: Mecânica Naval e Elétrica.
begin;

-- Remove os cartões-resumo criados pela migration anterior, sem tocar em outros registros.
delete from public.activities
where archived_at is null
  and name in (
    'Desenvolvimento do Sistema de Propulsão Elétrica — Frente Mecânica',
    'Desenvolvimento do Sistema de Propulsão Elétrica — Frente Elétrica'
  );

-- Garante que os marcos possam ser cadastrados sem datas ou responsáveis definidos.
alter table public.activities
  drop constraint if exists activities_type_dates;

alter table public.activities
  add constraint activities_type_dates check (
    (activity_type <> 'pontual' or due_date is not null)
    and (start_date is null or due_date is null or due_date >= start_date)
  );

with stages(area_slug, name, description, deliverable) as (
  values
    ('mecanica-naval',
     'Levantar requisitos do motor de propulsão',
     'Levantar e documentar os requisitos técnicos e operacionais do motor de propulsão, considerando as necessidades da embarcação SolMar Celeris.',
     'Documento de requisitos do motor'),
    ('mecanica-naval',
     'Definir transmissão e acoplamento',
     'Estudar e definir a solução de transmissão e acoplamento entre o motor e o sistema propulsor, verificando compatibilidade mecânica.',
     'Especificação da transmissão e do acoplamento'),
    ('mecanica-naval',
     'Projetar suportes e sistemas de fixação',
     'Projetar os suportes, bases e sistemas de fixação do motor e dos componentes mecânicos associados.',
     'Desenhos e especificações dos suportes e fixações'),
    ('mecanica-naval',
     'Verificar compatibilidade mecânica com o casco',
     'Verificar dimensões, interfaces, espaços disponíveis, cargas e pontos de instalação para garantir a compatibilidade do conjunto propulsor com o casco.',
     'Registro de compatibilidade com o casco'),
    ('mecanica-naval',
     'Fabricar ou adaptar componentes mecânicos',
     'Fabricar ou adaptar suportes, bases, acoplamentos e demais componentes necessários à instalação do sistema de propulsão.',
     'Componentes mecânicos fabricados ou adaptados'),
    ('mecanica-naval',
     'Instalar motor e componentes mecânicos',
     'Executar a instalação física do motor, transmissão, acoplamento, suportes e elementos de fixação na embarcação.',
     'Motor e componentes mecânicos instalados'),
    ('mecanica-naval',
     'Inspecionar e testar conjunto mecânico',
     'Inspecionar a montagem e realizar os testes mecânicos previstos, registrando ocorrências e resultados.',
     'Relatório de inspeção e testes mecânicos'),

    ('eletrica',
     'Levantar requisitos dos motores CC AGNI e CA',
     'Levantar e documentar os requisitos técnicos e operacionais das alternativas de motores de corrente contínua (AGNI) e corrente alternada.',
     'Documento de requisitos dos motores CC e CA'),
    ('eletrica',
     'Dimensionar o sistema de propulsão elétrica',
     'Realizar o dimensionamento elétrico considerando potência, tensão, corrente, regime de operação e demanda energética do sistema de propulsão.',
     'Memória de cálculo e critérios de dimensionamento'),
    ('eletrica',
     'Verificar compatibilidade com baterias e geração fotovoltaica',
     'Avaliar a integração elétrica do sistema de propulsão com o banco de baterias e a geração fotovoltaica existentes ou planejados.',
     'Análise de compatibilidade energética'),
    ('eletrica',
     'Elaborar diagramas elétricos CC e CA',
     'Desenvolver os diagramas dos circuitos de corrente contínua e corrente alternada relacionados ao sistema de propulsão.',
     'Diagramas elétricos CC e CA'),
    ('eletrica',
     'Avaliar controladores, inversores e conversores',
     'Identificar e avaliar controladores, inversores, conversores e demais dispositivos necessários ao acionamento e à alimentação dos motores.',
     'Especificações e seleção preliminar dos dispositivos'),
    ('eletrica',
     'Elaborar matriz comparativa dos motores',
     'Comparar as alternativas de motores CC AGNI e CA considerando desempenho, eficiência, compatibilidade, complexidade, custos e requisitos de instalação.',
     'Matriz comparativa e justificativa técnica'),
    ('eletrica',
     'Definir arquitetura elétrica do sistema de propulsão',
     'Consolidar a arquitetura elétrica da solução escolhida, incluindo alimentação, acionamento, distribuição, controle e proteções.',
     'Arquitetura elétrica definida e documentada'),
    ('eletrica',
     'Especificar materiais e preparar instalação elétrica',
     'Levantar os materiais e componentes necessários para aquisição e preparar a infraestrutura elétrica para instalação do sistema.',
     'Lista de materiais e infraestrutura elétrica preparada'),
    ('eletrica',
     'Instalar controladores, proteções e componentes elétricos',
     'Executar a instalação dos controladores, proteções, cabeamento e demais componentes elétricos previstos na arquitetura definida.',
     'Componentes elétricos instalados'),
    ('eletrica',
     'Realizar testes elétricos do sistema de propulsão',
     'Realizar os testes elétricos previstos nos motores, acionamentos, circuitos e dispositivos de proteção, registrando os resultados.',
     'Relatório de testes elétricos')
)
insert into public.activities (
  area_id, name, description, activity_type, frequency, execution_condition,
  responsible_name, expected_deliverable, notes, priority, flow_status,
  start_date, due_date
)
select
  a.id,
  s.name,
  s.description,
  'marco'::public.activity_type,
  '',
  '',
  'A definir',
  s.deliverable,
  '',
  'high',
  'backlog',
  null,
  null
from stages s
join public.areas a on a.slug = s.area_slug and a.is_active
where not exists (
  select 1
  from public.activities existing
  where existing.area_id = a.id
    and existing.name = s.name
    and existing.archived_at is null
);

commit;
