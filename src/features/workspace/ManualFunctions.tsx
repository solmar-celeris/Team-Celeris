import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import DocumentationPrompts from './DocumentationPrompts';

type ManualRole = {
  area: string;
  group: 'coordination' | 'direct' | 'transversal';
  summary: string;
  responsibilities: string[];
  tools: string[];
  training: string[];
  deliverables: string[];
  fronts?: { name: string; responsibilities: string[] }[];
};

type Competency = {
  skill: string;
  area: string;
  level: string;
  recommendation: string;
  sourceNote?: string;
};

// Fonte única de conteúdo organizacional para o organograma e os cards de função.
const roles: ManualRole[] = [
  {
    area: 'Coordenação Geral',
    group: 'coordination',
    summary: 'Direcionamento integrado, prioridades, planejamento e acompanhamento geral do projeto, com participação dos responsáveis de cada área.',
    responsibilities: [
      'Definir objetivos, prioridades, prazos gerais e critérios de acompanhamento.',
      'Promover a comunicação entre as áreas e resolver conflitos de prioridade ou dependências.',
      'Consolidar o cronograma integrado, acompanhar entregas e tratar desvios.',
      'Coordenar a identificação de riscos, decisões relevantes e ações corretivas.',
      'Garantir que responsabilidades, documentos e decisões estejam registrados.',
    ],
    tools: ['Cronograma integrado, registros de decisões e documentação do projeto.', 'Plataformas colaborativas e acompanhamento de entregas, riscos e dependências.'],
    training: ['Planejamento, priorização e acompanhamento de projetos.', 'Facilitação de reuniões, comunicação entre áreas e gestão de riscos.'],
    deliverables: ['Objetivos, prioridades e decisões gerais registrados.', 'Cronograma integrado e acompanhamento consolidado de entregas, riscos e desvios.'],
  },
  {
    area: 'Gestão de Pessoas — GP',
    group: 'direct',
    summary: 'Integração, desenvolvimento e continuidade dos membros, capacitação e relacionamento com patrocinadores e apoiadores.',
    responsibilities: [
      'Organizar a integração de novos membros e acompanhar sua adaptação.',
      'Mapear competências, necessidades de capacitação e oportunidades de desenvolvimento.',
      'Manter a matriz de competências, registros de treinamento e histórico de participação.',
      'Prospectar empresas, instituições e organizações com potencial de patrocínio; realizar contatos iniciais, apresentar oportunidades de apoio e acompanhar relacionamentos.',
      'Articular com Administrativo-Financeiro as condições, os valores e a formalização de recursos.',
      'Trabalhar com Marketing na preparação de propostas, apresentações e contrapartidas de comunicação.',
      'Apoiar a transferência de conhecimento entre gerações da equipe.',
    ],
    tools: ['Planilhas, ferramentas de documentação e plataformas colaborativas.', 'Gestão de pessoas, comunicação, negociação inicial, relacionamento institucional, mapeamento de competências e gestão do conhecimento.'],
    training: ['Gestão de equipes e comunicação interpessoal.', 'Prospecção de patrocinadores e elaboração de propostas de apoio.', 'Gestão do conhecimento e planejamento de capacitação.'],
    deliverables: ['Matriz de competências e plano de capacitação.', 'Registros de contatos, prospecções e acompanhamentos de patrocinadores.', 'Registros de integração, participação e treinamento.'],
  },
  {
    area: 'Administrativo-Financeiro',
    group: 'direct',
    summary: 'Organização administrativa e controle responsável dos recursos financeiros, materiais e patrimoniais.',
    responsibilities: [
      'Controlar receitas, despesas, orçamento e fluxo de caixa.',
      'Organizar documentos administrativos, financeiros e registros de prestação de contas.',
      'Realizar cotações, compras e negociações com fornecedores.',
      'Acompanhar recursos, materiais, patrimônio e movimentações de bens.',
      'Apoiar a formalização financeira de patrocínios e registrar recursos recebidos.',
      'Manter controles atualizados e disponibilizar informações à Coordenação Geral.',
    ],
    fronts: [
      { name: 'Gestão Financeira e Orçamentária', responsibilities: ['Planejar e atualizar o orçamento do projeto, acompanhando receitas, despesas e saldo disponível.', 'Manter fluxo de caixa, previsões de custos e controles financeiros atualizados.', 'Organizar comprovantes e registros para prestação de contas.'] },
      { name: 'Compras e Fornecedores', responsibilities: ['Levantar necessidades de materiais e serviços junto às áreas.', 'Realizar cotações, comparar propostas, negociar condições e registrar decisões de compra.', 'Acompanhar pedidos, pagamentos, prazos e recebimento dos itens.'] },
      { name: 'Patrimônio e Documentação', responsibilities: ['Manter inventário de equipamentos, ferramentas, materiais e bens do projeto.', 'Registrar entradas, saídas, responsáveis e movimentações patrimoniais.', 'Organizar documentos administrativos, contratos, notas fiscais e registros de patrocínios.'] },
    ],
    tools: ['Excel ou Google Sheets e armazenamento compartilhado.', 'Orçamento, controle de custos, compras, negociação, gestão documental, inventário, patrimônio e prestação de contas.'],
    training: ['Excel intermediário ou planilhas equivalentes.', 'Gestão financeira de projetos.', 'Compras, negociação, controle de custos e gestão patrimonial.'],
    deliverables: ['Orçamento atualizado e fluxo de caixa.', 'Controles de receitas e despesas.', 'Registros de compras, cotações, materiais e patrimônio.', 'Documentos de apoio à prestação de contas e formalização de patrocínios.'],
  },
  {
    area: 'Marketing',
    group: 'direct',
    summary: 'Identidade e comunicação do SolMar Celeris, desenvolvimento de produtos e presença nos canais de divulgação.',
    responsibilities: [
      'Desenvolver produtos, materiais institucionais e peças de divulgação.',
      'Gerenciar redes sociais, identidade visual e calendário de publicações.',
      'Planejar campanhas, ações promocionais, vendas e divulgação de produtos.',
      'Preparar apresentações, propostas visuais e materiais de contrapartida para patrocinadores em conjunto com Gestão de Pessoas.',
      'Divulgar resultados técnicos, eventos, atividades e conquistas do projeto.',
      'Manter coerência visual e textual nos materiais públicos.',
    ],
    tools: ['Canva e editores de imagem e vídeo.', 'Marketing digital, comunicação visual, desenvolvimento de produtos, vendas e produção de conteúdo.', 'Planejamento editorial, métricas de redes sociais e comunicação institucional.'],
    training: ['Marketing digital e gestão de redes sociais.', 'Design gráfico, vendas e comunicação comercial.', 'Produção audiovisual, planejamento de conteúdo e análise de engajamento.'],
    deliverables: ['Calendário de publicações.', 'Produtos e materiais de divulgação.', 'Apresentações e propostas visuais para apoiadores.', 'Relatórios de alcance, engajamento e vendas.'],
    fronts: [
      {
        name: 'Produtos',
        responsibilities: [
          'Planejar e desenvolver produtos relacionados à identidade e às necessidades do projeto.',
          'Levantar custos e possibilidades de produção e comercialização com apoio do Administrativo-Financeiro.',
          'Criar protótipos visuais, definir apresentação e acompanhar a qualidade.',
          'Manter registro dos produtos, estoque quando aplicável e resultados de vendas.',
        ],
      },
      {
        name: 'Redes Sociais',
        responsibilities: [
          'Planejar e publicar conteúdos nos canais oficiais.',
          'Produzir textos, imagens, vídeos e registros das atividades.',
          'Acompanhar mensagens, comentários, alcance e engajamento.',
          'Manter calendário editorial e arquivo organizado das publicações.',
        ],
      },
    ],
  },
  {
    area: 'Mecânica Naval',
    group: 'direct',
    summary: 'Projeto, desenvolvimento e validação do casco, da estrutura e dos componentes mecânicos do protótipo.',
    responsibilities: [
      'Desenvolver e revisar casco, estrutura e componentes mecânicos.',
      'Projetar propulsão, transmissão, direção e hélice.',
      'Elaborar modelos tridimensionais, montagens e desenhos técnicos.',
      'Planejar fabricação, montagem, inspeção, manutenção e testes.',
      'Documentar alterações, falhas, medições e melhorias.',
      'Trabalhar com Elétrica e Eletrônica para compatibilizar instalação, fixação, proteção e acesso aos componentes, incluindo sensores, módulos e dispositivos embarcados.',
    ],
    tools: ['SolidWorks ou CAD equivalente; desenho técnico e modelagem 3D.', 'Ansys para análise estrutural e, conforme o objetivo, CFD.', 'Materiais, resistência dos materiais, hidrodinâmica, propulsão, transmissão e metrologia.', 'Impressora 3D para prototipagem, gabaritos, suportes e componentes auxiliares.', 'Prensa quando aplicável e somente após treinamento específico.'],
    training: ['SolidWorks: peças, montagens e desenhos técnicos.', 'Ansys Mechanical: geometria, malha, materiais, cargas e interpretação de tensões e deformações.', 'Ansys Fluent: fundamentos de CFD e escoamento ao redor do casco.', 'Impressão 3D: arquivos, fatiamento, materiais, tolerâncias, parâmetros e inspeção.', 'Operação segura da prensa, conforme equipamento e procedimento.', 'Metrologia, fabricação e validação experimental.'],
    deliverables: ['Modelos CAD e desenhos técnicos atualizados.', 'Lista de materiais mecânicos.', 'Registros de fabricação, montagem e inspeção.', 'Relatórios de simulação e testes, com hipóteses e limitações.'],
  },
  {
    area: 'Elétrica',
    group: 'direct',
    summary: 'Projeto, integração e validação de geração, armazenamento, distribuição, alimentação, proteção e acionamento elétricos da embarcação.',
    responsibilities: [
      'Projetar e integrar os sistemas de geração solar.',
      'Dimensionar e organizar o armazenamento de energia.',
      'Integrar baterias, bancos de armazenamento, BMS, controladores de carga e MPPT, controladores de motor e sistemas de distribuição e alimentação elétrica.',
      'Definir cabeamento, conexões, dimensionamento de condutores, proteções e procedimentos de segurança elétrica.',
      'Realizar ensaios, inspeções, medições e testes de desempenho energético, incluindo diagnóstico de falhas elétricas.',
      'Avaliar consumo, autonomia e eficiência e documentar a manutenção.',
      'Alinhar com Mecânica Naval a instalação dos componentes e com Eletrônica os pontos de medição, sinais e requisitos de monitoramento. Elétrica responde pela infraestrutura de energia e suas proteções; Eletrônica, pela instrumentação, aquisição e transmissão dos dados.',
    ],
    tools: ['Planilhas de cálculo e documentação elétrica.', 'Instrumentos de medição e diagnóstico.', 'Circuitos elétricos, energia fotovoltaica, baterias LiFePO4, BMS, MPPT, acionamento de motores e proteção elétrica.', 'Ferramentas de desenho e simulação de circuitos, conforme a necessidade.'],
    training: ['Sistemas fotovoltaicos.', 'Baterias, BMS e MPPT.', 'Acionamento de motores, dimensionamento de condutores e proteção elétrica.', 'Segurança elétrica e procedimentos de medição.'],
    deliverables: ['Diagramas elétricos e memórias de cálculo.', 'Lista de componentes e especificações.', 'Registros de montagem, inspeção e testes energéticos.', 'Relatórios de autonomia, consumo e desempenho.'],
  },
  {
    area: 'Eletrônica - ELT',
    group: 'direct',
    summary: 'Circuitos, sensores, instrumentação, microcontroladores, sistemas embarcados, automação, controle e telemetria.',
    responsibilities: [
      'Desenvolver e integrar circuitos eletrônicos e sistemas de aquisição, processamento, transmissão, armazenamento e visualização de dados operacionais.',
      'Projetar, montar, testar e integrar circuitos, componentes, sensores, instrumentos, microcontroladores, sistemas embarcados, módulos de comunicação e interfaces de monitoramento usados no projeto.',
      'Implementar soluções de telemetria para aquisição e monitoramento de tensão, corrente, temperatura, velocidade e outras grandezas pertinentes, integrando sensores e dispositivos de comunicação.',
      'Programar e integrar dispositivos; desenvolver automações, acionamentos, comandos, rotinas de controle e respostas automáticas a condições monitoradas, quando aplicável.',
      'Realizar testes, calibração, inspeções e diagnóstico de falhas em sensores, instrumentos, circuitos, microcontroladores, sistemas embarcados, automação e telemetria, mantendo registros técnicos.',
      'Alinhar com Elétrica os sinais, pontos de medição, alimentação e limites de interface dos sistemas monitorados; com Mecânica Naval, compatibilizar instalação física, fixação, proteção e acesso aos sensores e dispositivos.',
    ],
    tools: ['ESP32, Arduino IDE ou PlatformIO, Visual Studio Code e Git; componentes, módulos, instrumentos e ferramentas para desenvolvimento e prototipagem eletrônica.', 'Eletrônica analógica e digital, desenvolvimento e montagem de circuitos, leitura de sensores, instrumentação, programação de microcontroladores, sistemas embarcados e comunicação entre dispositivos.', 'Protocolos de comunicação, Wi-Fi/Bluetooth quando aplicável, aquisição e tratamento de dados, armazenamento e visualização de informações, interfaces de monitoramento, automação e sistemas de controle.'],
    training: ['Programação de ESP32 e de outros microcontroladores e dispositivos utilizados no projeto.', 'Eletrônica aplicada, desenvolvimento, montagem e teste de circuitos, instrumentação, sistemas embarcados e integração de sensores.', 'Protocolos de comunicação, aquisição e processamento de dados, instrumentação, automação, lógica de controle e análise de dados.'],
    deliverables: ['Código-fonte, programação de dispositivos e lógicas de automação documentados.', 'Diagramas eletrônicos e de integração, listas de componentes, sensores, instrumentos e módulos e registros de configuração dos dispositivos.', 'Registros de montagem, calibração, inspeção, testes e diagnóstico de circuitos, sensores, sistemas embarcados e sistemas automatizados.', 'Sistemas de telemetria e monitoramento, interfaces e painéis de visualização, registros de dados e relatórios operacionais.'],
  },
  {
    area: 'Tecnologia da Informação (TI)',
    group: 'transversal',
    summary: 'Apoio transversal aos integrantes de todas as áreas com ferramentas, aplicativos, sistemas e automações conforme suas necessidades; não é nível hierárquico nem substitui atribuições técnicas.',
    responsibilities: [
      'Conversar com integrantes das áreas para compreender rotinas, dificuldades e necessidades; identificar oportunidades de melhoria atendíveis por tecnologia.',
      'Disponibilizar, adaptar, configurar ou desenvolver ferramentas, aplicativos, formulários, painéis e sistemas que apoiem as atividades das equipes.',
      'Criar automações para reduzir tarefas repetitivas, integrar informações e simplificar fluxos de trabalho.',
      'Apoiar a integração de ferramentas e informações entre áreas, respeitando processos e necessidades de cada equipe.',
      'Orientar usuários sobre uso das soluções, boas práticas, permissões, organização e segurança das informações.',
      'Prestar suporte, avaliar resultados e ajustar soluções conforme o retorno dos usuários.',
      'Priorizar demandas em conjunto com a Coordenação Geral, considerando impacto, urgência, esforço e recursos disponíveis.',
      'Apoiar a organização de arquivos CAD e resultados de simulação sem substituir a validação técnica da área responsável.',
      'Em Eletrônica, apoiar plataformas digitais, organização e integração de informações e ferramentas de software; circuitos, firmware, aquisição de sinais, instrumentação, comunicação embarcada e validação técnica permanecem sob responsabilidade de Eletrônica.',
    ],
    tools: ['Visual Studio Code, Git e GitHub.', 'HTML, CSS, JavaScript e Python, conforme a aplicação.', 'Bancos de dados, hospedagem, APIs e integração de sistemas.', 'Segurança digital, backup, gestão de acessos, documentação e automação.', 'Noções de formatos CAD e arquivos de resultados de simulação.'],
    training: ['Fundamentos de programação e desenvolvimento web.', 'Git e GitHub.', 'Banco de dados e integração de APIs.', 'Segurança da informação.', 'Python para automação e análise de dados.'],
    deliverables: ['Ferramentas, aplicativos, formulários, painéis e sistemas de apoio às áreas.', 'Automações e integrações que reduzam retrabalho e facilitem fluxos.', 'Orientações e suporte à adoção e ao uso das soluções.', 'Soluções de acompanhamento, organização e visualização de informações conforme demanda.', 'Registro das soluções desenvolvidas, instruções de uso e histórico de melhorias.'],
  },
];

export function getManualRoleHtml(areaFilter: string): string {
  const normalized = (value: string) => value.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const role = roles.find((item) => normalized(item.area).includes(normalized(areaFilter)));
  if (!role) return '';
  const list = (items: string[]) => `<ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul>`;
  const section = (title: string, items: string[]) => `<p><strong>${title}</strong></p>${list(items)}`;
  const fronts = role.fronts?.length
    ? `<p><strong>Frentes internas de ${role.area}</strong></p><div class="manual-role-front-grid">${role.fronts.map((front) => `<div><p><strong>${front.name}</strong></p>${list(front.responsibilities)}</div>`).join('')}</div>`
    : '';
  return `<p><strong>ÁREA DIRETA</strong></p><p><strong>${role.area}</strong></p><p>${role.summary}</p><hr>${section('Responsabilidades', role.responsibilities)}${fronts}<hr>${section('Ferramentas e conhecimentos', role.tools)}${section('Capacitação recomendada', role.training)}${section('Entregas esperadas', role.deliverables)}`;
}

const transversal = [
  {
    title: 'Ansys — simulação computacional',
    body: 'Aplicações possíveis incluem análise estrutural, investigação do escoamento ao redor do casco, comparação de geometrias e estudos de pressão e carregamentos. Simulações de ondas e interação fluido-estrutura dependem do modelo físico, dos recursos disponíveis e da configuração adotada.',
    items: [
      'Competências: preparação de geometria e malha, materiais, condições de contorno, seleção de modelos físicos, convergência e interpretação.',
      'Capacitação: Ansys Workbench, Mechanical, Fluent, elementos finitos e mecânica dos fluidos.',
      'Entregas: arquivos organizados, relatório de hipóteses, gráficos, comparação de alternativas e limitações.',
      'Boa prática: validar resultados com cálculos independentes e, sempre que possível, ensaios físicos.',
    ],
  },
  {
    title: 'Impressão 3D',
    body: 'Aplicações: protótipos, suportes, caixas, gabaritos e componentes auxiliares.',
    items: [
      'Competências: modelagem e exportação STL/3MF, fatiamento, seleção de material, orientação, preenchimento, suportes, tolerâncias e inspeção.',
      'Capacitação: operação do modelo disponível, preparação de arquivos, materiais, controle de qualidade e manutenção preventiva.',
      'Entregas: arquivos identificados, ficha de material e parâmetros, registro de peças e inspeção dimensional.',
      'A adequação depende de material, orientação, temperatura, cargas, exposição à água e condições reais de uso.',
    ],
  },
  {
    title: 'Prensa e processos de prensagem',
    body: 'A capacitação deve ser específica para o equipamento disponível: prensa manual, hidráulica, mecânica ou equipamento destinado a processo particular.',
    items: [
      'Aplicações: prensagem de materiais, montagem ou fabricação de peças.',
      'Competências: capacidade nominal, força, pressão, área de contato, posicionamento, acessórios, inspeção e riscos.',
      'Capacitação: procedimento operacional, operação segura, inspeção e manutenção preventiva.',
      'Entregas: registros de operação, parâmetros quando aplicável, inspeção e registro de desvios.',
      'Segurança: somente pessoas treinadas e autorizadas devem operar, com proteções instaladas e procedimentos respeitados.',
    ],
  },
];

const competencies: Competency[] = [
  { skill: 'Gestão de pessoas e integração', area: 'Gestão de Pessoas', level: 'Básico', recommendation: 'FM2S: Fundamentos em Gestão de Pessoas; Sebrae: Gestão de Pessoas; YouTube: conteúdos de gestão de equipes e comunicação.' },
  { skill: 'Prospecção de patrocinadores', area: 'Gestão de Pessoas', level: 'Básico', recommendation: 'Sebrae: atendimento, negociação e vendas; YouTube: prospecção comercial, elaboração de propostas e comunicação institucional.' },
  { skill: 'Controle financeiro e orçamento', area: 'Administrativo-Financeiro', level: 'Básico', recommendation: 'Sebrae: Gestão Financeira e Como controlar o fluxo de caixa; Fundação Bradesco: cursos de Administração/Finanças; YouTube: Excel para controles financeiros.' },
  { skill: 'Compras e gestão patrimonial', area: 'Administrativo-Financeiro', level: 'Básico', recommendation: 'FM2S: Fundamentos da Gestão Logística; Sebrae: gestão e controles; YouTube: compras, estoque e inventário.' },
  { skill: 'Marketing digital e redes sociais', area: 'Marketing', level: 'Básico', recommendation: 'Sebrae: Marketing Digital e Redes Sociais; Sebrae: Faça suas redes bombarem com o Canva; YouTube: Curso em Vídeo e tutoriais de Canva.' },
  { skill: 'Desenvolvimento de produtos', area: 'Marketing — Produtos', level: 'Básico', recommendation: 'Sebrae: precificação e vendas; YouTube: desenvolvimento de produto, prototipagem, Canva e pesquisa de público.' },
  { skill: 'CAD e SolidWorks', area: 'Mecânica Naval', level: 'Básico', recommendation: 'YouTube: tutoriais de SolidWorks em português, modelagem de peças, montagens e desenhos técnicos; consultar também materiais oficiais da SOLIDWORKS.' },
  { skill: 'Ansys Mechanical', area: 'Mecânica Naval', level: 'Básico', recommendation: 'YouTube: aulas introdutórias de Ansys Workbench/Mechanical, malha, materiais e condições de contorno; materiais gratuitos da Ansys Learning.' },
  { skill: 'Ansys Fluent e CFD', area: 'Mecânica Naval', level: 'Básico', recommendation: 'O DOCX associa a esta linha a recomendação “Telemetria, eletrônica aplicada, automação, ESP32 e sensores”; mantida como consta na matriz, sem inferir outra recomendação.' },
  { skill: 'Eletrônica', area: 'Elétrica', level: 'Básico', recommendation: 'YouTube: Mundo da Elétrica e aulas de dimensionamento fotovoltaico; consultar materiais técnicos gratuitos de fabricantes.', sourceNote: 'Linha preservada como registrada no DOCX (“Eletrônica | Elétrica | Básico”). A recomendação associada menciona dimensionamento fotovoltaico; a célula pode estar desalinhada no documento e não é interpretada aqui como competência técnica adicional.' },
  { skill: 'Baterias, BMS e MPPT', area: 'Elétrica / TI — apoio transversal / Eletrônica', level: 'Básico', recommendation: 'YouTube: Mundo da Elétrica e canais de eletrônica/energia; buscar aulas sobre LiFePO4, BMS, MPPT e dimensionamento.' },
  { skill: 'Dimensionamento e segurança elétrica', area: 'Elétrica', level: 'Conforme atividade', recommendation: 'YouTube: Mundo da Elétrica; cursos e materiais gratuitos de segurança elétrica. Atividades práticas exigem capacitação e autorização adequadas.' },
  { skill: 'Telemetria, eletrônica aplicada, automação, ESP32 e sensores', area: 'Eletrônica - ELT', level: 'Básico', recommendation: 'YouTube: aulas de ESP32/Arduino, eletrônica básica e automação; documentação e exemplos oficiais do Arduino e Espressif. Buscar conteúdos introdutórios de circuitos, sensores, acionamentos e lógica de controle.' },
  { skill: 'Programação e desenvolvimento web', area: 'TI — apoio transversal', level: 'Básico', recommendation: 'Curso em Vídeo: Python, HTML, CSS e JavaScript; Fundação Bradesco: cursos de tecnologia; YouTube: aulas práticas de desenvolvimento.' },
  { skill: 'Git e organização de código', area: 'TI — apoio transversal / Eletrônica', level: 'Básico', recommendation: 'Curso em Vídeo: curso de Git e GitHub; YouTube: versionamento, branches e colaboração com GitHub.' },
  { skill: 'Impressão 3D', area: 'Mecânica Naval / apoio de TI quando aplicável', level: 'Básico', recommendation: 'YouTube: aulas de modelagem 3D, fatiamento e calibração; tutoriais gratuitos do fabricante da impressora e do fatiador utilizado.' },
  { skill: 'Operação de prensa', area: 'Integrantes autorizados', level: 'Treinamento específico obrigatório', recommendation: 'Priorizar manual do fabricante, treinamento presencial e procedimento interno. Vídeos são apenas material complementar, nunca substituem autorização e treinamento prático.' },
  { skill: 'Documentação técnica', area: 'Todas as áreas', level: 'Básico', recommendation: 'FM2S: Introdução ao Lean e gestão da qualidade; YouTube: desenho técnico, elaboração de relatórios e organização de documentação.' },
];

const indicators = [
  'Percentual de integrantes com capacitações essenciais concluídas.',
  'Quantidade de procedimentos técnicos documentados.',
  'Percentual de entregas concluídas no prazo.',
  'Quantidade de testes executados e registrados.',
  'Número de integrantes capacitados e autorizados por atividade técnica.',
  'Quantidade de falhas recorrentes e melhorias implementadas.',
  'Percentual de arquivos, códigos e projetos com documentação atualizada.',
];

const interfaces = [
  { area: 'Gestão de Pessoas', detail: 'Integração, capacitação e desenvolvimento dos membros; articulação de patrocínios com Administrativo-Financeiro e Marketing.' },
  { area: 'Administrativo-Financeiro', detail: 'Apoio às áreas com orçamento, compras, cotações, patrimônio, documentos e formalização de recursos.' },
  { area: 'Marketing', detail: 'Divulgação de atividades e resultados; produtos e materiais; contrapartidas em conjunto com Gestão de Pessoas.' },
  { area: 'Mecânica Naval', detail: 'Integração da estrutura, componentes, fabricação e testes com Elétrica e Eletrônica.' },
  { area: 'Elétrica', detail: 'Integração de geração, armazenamento, distribuição, alimentação e acionamento com Mecânica Naval e Eletrônica; alinhamento dos pontos de medição e requisitos de energia.' },
  { area: 'Eletrônica - ELT', detail: 'Integração de circuitos, sensores, instrumentação, sistemas embarcados, automação e telemetria com Elétrica e Mecânica Naval; apoio de TI em ferramentas digitais e integração de informações quando necessário.' },
  { area: 'TI — apoio transversal', detail: 'Apoio aos integrantes das áreas com ferramentas, aplicativos, sistemas e automações adequados às necessidades e demandas de cada equipe.' },
];

const guidelines = [
  'As responsabilidades orientam a atuação das áreas, sem impedir colaboração entre integrantes.',
  'Demandas que envolvam mais de uma área devem ter responsáveis, prazos e entregas acordados.',
  'A Coordenação Geral mantém a visão integrada e conduz o alinhamento de prioridades.',
  'A TI apoia transversalmente as pessoas das áreas com ferramentas, aplicativos e automações, sem substituir suas responsabilidades técnicas.',
  'Treinamentos, procedimentos e autorizações de segurança devem ser respeitados antes de operar máquinas, ferramentas ou sistemas energizados.',
  'Este manual deve ser revisado sempre que houver alteração relevante no organograma, nas atividades ou nos recursos do projeto.',
];

const platforms = [
  { name: 'FM2S', url: 'https://www.fm2s.com.br/cursos/gratuitos' },
  { name: 'Sebrae', url: 'https://loja.sebrae.com.br/cursos/cursos-online' },
  { name: 'Fundação Bradesco', url: 'https://www.ev.org.br/' },
  { name: 'Curso em Vídeo', url: 'https://www.youtube.com/@CursoemVideo' },
];

export default function ManualFunctions({ areaFilter }: { areaFilter?: string } = {}) {
  const [query, setQuery] = useState('');
  const [manualFilter, setManualFilter] = useState<'Todas' | 'Coordenação' | 'Áreas diretas' | 'TI transversal'>('Todas');

  const filteredRoles = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('pt-BR');
    return roles.filter((role) => {
      const areaMatches = !areaFilter || role.area.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(areaFilter.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
      if (!areaMatches) return false;
      const matchesGroup = manualFilter === 'Todas'
        || (manualFilter === 'Coordenação' && role.group === 'coordination')
        || (manualFilter === 'Áreas diretas' && role.group === 'direct')
        || (manualFilter === 'TI transversal' && role.group === 'transversal');
      const searchable = [
        role.area, role.summary, ...role.responsibilities, ...role.tools, ...role.training, ...role.deliverables,
        ...(role.fronts ?? []).flatMap((front) => [front.name, ...front.responsibilities]),
      ].join(' ').toLocaleLowerCase('pt-BR');
      return matchesGroup && (!term || searchable.includes(term));
    });
  }, [areaFilter, manualFilter, query]);

  const directRoles = roles.filter((role) => role.group === 'direct' && (!areaFilter || role.area.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(areaFilter.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, ''))));

  return (
    <section className="workspace-manual" aria-label="Manual de funções e capacitação">
      {!areaFilter && <section className="manual-org-intro" aria-labelledby="manual-org-title">
        <p className="workspace-kicker">ESTRUTURA ORGANIZACIONAL · MANUAL REVISADO</p>
        <h2 id="manual-org-title">Coordenação Geral e seis áreas diretas, com TI transversal.</h2>
        <p>A Coordenação Geral integra as áreas, define prioridades e acompanha o projeto, sem exclusividade docente ou atribuição automática de execução. As seis áreas diretas são Gestão de Pessoas, Administrativo-Financeiro, Marketing, Mecânica Naval, Elétrica e Eletrônica - ELT. Produtos e Redes Sociais são frentes internas de Marketing.</p>
        <div className="manual-org-area-list">
          <span>{roles.find((role) => role.group === 'coordination')?.area}</span>
          {directRoles.map((role) => (
            <span key={role.area}>{role.area}{role.fronts && <small>{role.fronts.map((front) => front.name).join(' · ')}</small>}</span>
          ))}
        </div>
        <p className="manual-org-footnote"><strong>TI — apoio transversal:</strong> atende às necessidades dos integrantes das áreas com ferramentas, aplicativos, sistemas e automações, sem constituir nível hierárquico nem assumir responsabilidades técnicas. As informações do organograma e dos cards partem da mesma definição de áreas.</p>
      </section>}

      {!areaFilter && <div className="manual-controls">
        <label className="manual-search">
          <Search aria-hidden="true" />
          <span className="sr-only">Buscar no manual</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar área, responsabilidade ou competência…" />
        </label>
        <div className="manual-nucleus-filter" aria-label="Filtrar funções">
          {(['Todas', 'Coordenação', 'Áreas diretas', 'TI transversal'] as const).map((item) => (
            <button key={item} type="button" className={manualFilter === item ? 'is-selected' : ''} onClick={() => setManualFilter(item)} aria-pressed={manualFilter === item}>{item}</button>
          ))}
        </div>
      </div>}

      {filteredRoles.length === 0 ? (
        <div className="workspace-empty manual-empty"><span aria-hidden="true">⌕</span><strong>Nenhuma função encontrada.</strong><p>Tente outro termo ou selecione outra categoria.</p></div>
      ) : (
        <div className="manual-role-grid">
          {filteredRoles.map((role) => (
            <article className="manual-role-card" key={role.area}>
              <header className="manual-role-head">
                <span className={`manual-nucleus-tag ${role.group === 'coordination' ? 'is-management' : role.group === 'transversal' ? 'is-transversal' : 'is-engineering'}`}>
                  {role.group === 'coordination' ? 'COORDENAÇÃO GERAL' : role.group === 'transversal' ? 'APOIO TRANSVERSAL' : 'ÁREA DIRETA'}
                </span>
                <h3>{role.area}</h3>
                <p>{role.summary}</p>
              </header>
              <div className="manual-responsibilities">
                <h4>Responsabilidades</h4>
                <ul>{role.responsibilities.map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
              {role.fronts && <div className="manual-responsibilities manual-marketing-fronts">
                <h4>Frentes internas de Marketing</h4>
                <div>{role.fronts.map((front) => <section key={front.name}><strong>{front.name}</strong><ul>{front.responsibilities.map((item) => <li key={item}>{item}</li>)}</ul></section>)}</div>
              </div>}
              <div className="manual-details">
                <details>
                  <summary>Ferramentas e conhecimentos <span>{role.tools.length}</span></summary>
                  <ul>{role.tools.map((item) => <li key={item}>{item}</li>)}</ul>
                </details>
                <details>
                  <summary>Capacitações recomendadas <span>{role.training.length}</span></summary>
                  <ul>{role.training.map((item) => <li key={item}>{item}</li>)}</ul>
                </details>
                <details>
                  <summary>Entregas esperadas <span>{role.deliverables.length}</span></summary>
                  <ul>{role.deliverables.map((item) => <li key={item}>{item}</li>)}</ul>
                </details>
              </div>
            </article>
          ))}
        </div>
      )}

      {!areaFilter && <>
      <section className="manual-extra-section" aria-labelledby="manual-transversal-title">
        <div className="manual-section-heading">
          <div><p className="workspace-kicker">COMPETÊNCIAS COMPARTILHADAS</p><h3 id="manual-transversal-title">Simulação e fabricação</h3></div>
          <p>Capacitações, procedimentos e condições de segurança devem corresponder aos equipamentos disponíveis e às atividades realizadas.</p>
        </div>
        <div className="manual-transversal-grid">
          {transversal.map((item) => (
            <article className="manual-transversal-card" key={item.title}>
              <h4>{item.title}</h4><p>{item.body}</p>
              <ul>{item.items.map((entry) => <li key={entry}>{entry}</li>)}</ul>
            </article>
          ))}
        </div>
      </section>

      <section className="manual-extra-section" aria-labelledby="manual-competencies-title">
        <div className="manual-section-heading">
          <div><p className="workspace-kicker">PLANEJAMENTO DE DESENVOLVIMENTO</p><h3 id="manual-competencies-title">Matriz de capacitação</h3></div>
          <p>Os níveis são referências iniciais de planejamento e não concedem autorização para operar equipamentos ou executar atividades críticas.</p>
        </div>
        <div className="manual-table-wrap">
          <table className="manual-table">
            <thead><tr><th>Competência</th><th>Área prioritária</th><th>Nível de referência</th><th>Recomendações de cursos e materiais gratuitos</th></tr></thead>
            <tbody>{competencies.map((item) => <tr key={`${item.skill}-${item.area}`}>
              <td>{item.skill}{item.sourceNote && <small className="manual-matrix-note">{item.sourceNote}</small>}</td>
              <td>{item.area}</td><td>{item.level}</td><td>{item.recommendation}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <p className="manual-matrix-disclaimer">Os níveis são referências iniciais; atividades de risco exigem treinamento, procedimento e autorização compatíveis com o equipamento e as normas aplicáveis. Recomendações de cursos e canais são pontos de partida: disponibilidade, gratuidade, conteúdo e condições de certificado podem mudar. Confirme as condições diretamente nas plataformas.</p>
        <p className="manual-platforms">Plataformas sugeridas: {platforms.map((platform, index) => <span key={platform.name}>{index > 0 && ' · '}<a href={platform.url} target="_blank" rel="noreferrer">{platform.name}</a></span>)}</p>
      </section>

      <section className="manual-extra-section" aria-labelledby="manual-planning-title">
        <div className="manual-section-heading">
          <div><p className="workspace-kicker">ACOMPANHAMENTO DO PROJETO</p><h3 id="manual-planning-title">Planejamento e indicadores</h3></div>
          <p>A Coordenação Geral integra o planejamento com participação dos responsáveis de área; cada área detalha tarefas, dependências, prazos e critérios de conclusão e informa avanços, riscos e necessidades de apoio.</p>
        </div>
        <div className="manual-transversal-grid">
          {indicators.map((item, index) => <article className="manual-transversal-card" key={item}><h4>Indicador {index + 1}</h4><p>{item}</p></article>)}
        </div>
        <p>Cada área mantém registros de capacitações, responsáveis, ferramentas utilizadas e evidências de aplicação prática. A Coordenação Geral consolida o acompanhamento do cronograma, das entregas e dos riscos entre as áreas.</p>
      </section>

      <section className="manual-extra-section" aria-labelledby="manual-interfaces-title">
        <div className="manual-section-heading">
          <div><p className="workspace-kicker">TRABALHO INTEGRADO</p><h3 id="manual-interfaces-title">Interfaces entre áreas</h3></div>
          <p>Alinhe responsabilidades, dependências e entregas quando uma demanda envolver mais de uma área.</p>
        </div>
        <div className="manual-transversal-grid">
          {interfaces.map((item) => <article className="manual-transversal-card" key={item.area}><h4>{item.area}</h4><p>{item.detail}</p></article>)}
        </div>
        <p>Arquivos CAD, simulações, códigos, registros de fabricação e relatórios de teste devem ter identificação, versão, responsável e local de armazenamento definidos. Decisões técnicas devem ser registradas para preservar o conhecimento entre gerações da equipe.</p>
      </section>

      <aside className="manual-note">
        <strong>Diretrizes gerais</strong>
        <ul>{guidelines.map((item) => <li key={item}>{item}</li>)}</ul>
      </aside>
      <DocumentationPrompts />
      </>}
    </section>
  );
}
