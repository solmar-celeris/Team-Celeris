import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';

type ManualRole = {
  nucleus: 'Gestão' | 'Engenharia';
  area: string;
  summary: string;
  responsibilities: string[];
  tools: string[];
  training: string[];
  deliverables: string[];
};

const roles: ManualRole[] = [
  {
    nucleus: 'Gestão', area: 'Gestão de Pessoas',
    summary: 'Integração, desenvolvimento de competências e relacionamento com patrocinadores e apoiadores.',
    responsibilities: [
      'Integrar novos membros e acompanhar sua adaptação à equipe.',
      'Mapear competências, necessidades de capacitação e oportunidades de desenvolvimento; manter a matriz de competências e os registros de treinamento.',
      'Prospectar empresas, instituições e organizações; fazer o contato inicial, apresentar oportunidades de apoio e acompanhar o relacionamento com patrocinadores.',
      'Articular condições e formalização com Administrativo-Financeiro e propostas, identidade visual e contrapartidas com Marketing.',
      'Apoiar a transferência de conhecimento e a continuidade entre gerações da equipe.',
    ],
    tools: ['Planilhas, documentação e plataformas colaborativas.', 'Gestão de pessoas, comunicação, negociação inicial, relacionamento institucional e gestão do conhecimento.'],
    training: ['Gestão de equipes e comunicação interpessoal.', 'Prospecção de patrocinadores e elaboração de propostas de apoio.', 'Gestão do conhecimento e planejamento de capacitação.'],
    deliverables: ['Matriz de competências e plano de capacitação.', 'Registro de contatos, prospecções e acompanhamentos de patrocinadores.', 'Registros de integração e treinamento.'],
  },
  {
    nucleus: 'Gestão', area: 'Administrativo-Financeiro',
    summary: 'Administração, orçamento, controle financeiro, compras, cotações e formalização de recursos.',
    responsibilities: [
      'Controlar receitas, despesas, orçamento e fluxo de caixa.',
      'Organizar documentos administrativos e financeiros.',
      'Realizar cotações, compras e negociações financeiras.',
      'Acompanhar recursos e materiais e organizar a prestação de contas.',
      'Apoiar a formalização financeira de patrocínios e registrar os recursos recebidos.',
    ],
    tools: ['Excel ou Google Sheets e armazenamento compartilhado.', 'Orçamento, controle de custos, compras, negociação e gestão documental.'],
    training: ['Excel intermediário.', 'Gestão financeira de projetos.', 'Compras, negociação e controle de custos.'],
    deliverables: ['Orçamento atualizado.', 'Controle de receitas e despesas.', 'Registros de compras, materiais e recursos de patrocínio.'],
  },
  {
    nucleus: 'Gestão', area: 'Projetos',
    summary: 'Planejamento integrado, cronogramas, acompanhamento de entregas, riscos e melhoria de processos.',
    responsibilities: [
      'Elaborar e atualizar cronogramas, tarefas, dependências e entregáveis.',
      'Integrar atividades dos núcleos de Gestão e Engenharia.',
      'Identificar riscos, gargalos e desvios de prazo.',
      'Padronizar processos, documentos e registros técnicos.',
      'Monitorar indicadores e apoiar a melhoria contínua.',
    ],
    tools: ['Microsoft Project, ProjectLibre, Trello ou ferramentas equivalentes.', 'Planilhas, gestão de riscos, métodos ágeis e tradicionais e mapeamento de processos.'],
    training: ['Fundamentos de gestão de projetos.', 'Métodos ágeis, análise de riscos e indicadores.'],
    deliverables: ['Cronograma integrado.', 'Plano de entregas e registro de riscos.', 'Relatórios de acompanhamento e lições aprendidas.'],
  },
  {
    nucleus: 'Gestão', area: 'Marketing',
    summary: 'Produtos, redes sociais, vendas, comunicação visual e divulgação dos resultados do projeto.',
    responsibilities: [
      'Desenvolver produtos e materiais de divulgação.',
      'Gerenciar redes sociais e identidade visual.',
      'Planejar campanhas, vendas e ações promocionais.',
      'Preparar apresentações, propostas visuais e materiais de contrapartida para patrocinadores em conjunto com Gestão de Pessoas.',
      'Divulgar resultados técnicos e atividades do projeto.',
    ],
    tools: ['Canva e editores de imagem e vídeo.', 'Marketing digital, comunicação visual, desenvolvimento de produtos, vendas e produção de conteúdo.'],
    training: ['Marketing digital e gestão de redes sociais.', 'Design gráfico, vendas e comunicação comercial.'],
    deliverables: ['Calendário de publicações.', 'Materiais de divulgação e propostas visuais.', 'Relatórios de alcance, engajamento e vendas.'],
  },
  {
    nucleus: 'Engenharia', area: 'Mecânica Naval',
    summary: 'Casco, estrutura, propulsão, transmissão, direção, modelagem, fabricação e testes mecânicos.',
    responsibilities: [
      'Desenvolver e revisar casco, estrutura e componentes mecânicos.',
      'Projetar propulsão, transmissão, direção e hélice.',
      'Elaborar modelos tridimensionais, montagens e desenhos técnicos.',
      'Planejar fabricação, montagem, inspeção, manutenção e testes do protótipo.',
      'Documentar alterações, falhas, medições e melhorias.',
    ],
    tools: ['SolidWorks ou CAD equivalente; desenho técnico e modelagem 3D.', 'Ansys Mechanical para análise estrutural e Ansys Fluent/CFD conforme o objetivo.', 'Materiais, resistência dos materiais, hidrodinâmica, propulsão, transmissão e metrologia.', 'Impressora 3D para prototipagem, gabaritos, suportes e componentes auxiliares; prensa somente quando aplicável e após capacitação específica.'],
    training: ['SolidWorks: peças, montagens e desenhos técnicos.', 'Ansys Mechanical: geometria, malha, materiais, cargas e interpretação de tensões e deformações.', 'Ansys Fluent: fundamentos de CFD, escoamento ao redor do casco e avaliação de resistência hidrodinâmica.', 'Impressão 3D: preparação e fatiamento de arquivos, materiais, tolerâncias, parâmetros e inspeção.', 'Operação segura da prensa disponível, de acordo com o modelo, capacidade e procedimento do laboratório.', 'Metrologia, processos de fabricação e validação experimental.'],
    deliverables: ['Modelos CAD e desenhos técnicos; lista de materiais mecânicos.', 'Registros de fabricação, montagem e inspeção.', 'Relatórios de simulação e testes, com hipóteses e limitações documentadas.'],
  },
  {
    nucleus: 'Engenharia', area: 'Energia',
    summary: 'Geração solar, armazenamento, alimentação elétrica, BMS, MPPT, acionamento e controle.',
    responsibilities: [
      'Projetar e integrar os sistemas de geração solar.',
      'Dimensionar e organizar o armazenamento de energia.',
      'Integrar baterias, BMS, MPPT, controlador do motor e distribuição elétrica.',
      'Realizar medições e testes de desempenho energético.',
      'Avaliar consumo, autonomia e eficiência e documentar a manutenção.',
    ],
    tools: ['Planilhas de cálculo, documentação elétrica e instrumentos de medição e diagnóstico.', 'KiCad para projetos de circuitos e LTspice para simulação.', 'Circuitos elétricos, energia fotovoltaica, baterias LiFePO4, BMS, MPPT, acionamento de motores e proteção elétrica.'],
    training: ['Sistemas fotovoltaicos.', 'Baterias e BMS.', 'Eletrônica de potência, acionamento de motores e segurança elétrica.'],
    deliverables: ['Diagramas elétricos e memórias de cálculo.', 'Lista de componentes.', 'Registros de testes energéticos e relatórios de autonomia e consumo.'],
  },
  {
    nucleus: 'Engenharia', area: 'Telemetria',
    summary: 'Sensores, aquisição e transmissão de dados, monitoramento e análise operacional.',
    responsibilities: [
      'Desenvolver sistemas de coleta e transmissão de dados.',
      'Integrar sensores, microcontroladores e interfaces de visualização.',
      'Monitorar variáveis como tensão, corrente, temperatura e desempenho.',
      'Registrar e analisar dados de operação e apoiar testes de campo.',
      'Documentar configurações, calibração e diagnóstico de falhas.',
    ],
    tools: ['ESP32, Arduino IDE ou PlatformIO, Visual Studio Code e Git.', 'Programação de microcontroladores, sensores, instrumentação, comunicação serial, Wi-Fi/Bluetooth quando aplicável e visualização de dados.'],
    training: ['Programação de ESP32.', 'Sistemas embarcados e sensores.', 'Protocolos de comunicação e análise de dados.'],
    deliverables: ['Código-fonte documentado e diagramas de integração.', 'Registros de calibração e testes.', 'Painéis de monitoramento e relatórios.'],
  },
  {
    nucleus: 'Engenharia', area: 'Tecnologia da Informação (TI)',
    summary: 'Sistemas digitais, desenvolvimento de software, infraestrutura, automação e integração de dados.',
    responsibilities: [
      'Desenvolver e manter sites, aplicações e sistemas digitais da equipe.',
      'Organizar repositórios, arquivos técnicos e documentação digital.',
      'Criar ferramentas para gestão de tarefas, comunicação e indicadores.',
      'Integrar dados e ferramentas entre Gestão, Engenharia e Telemetria.',
      'Gerenciar controle de versões, permissões de acesso, backups e recuperação de arquivos.',
      'Prestar suporte tecnológico e automatizar tarefas quando houver benefício prático.',
      'Apoiar o processamento e a organização de arquivos CAD e resultados de simulação.',
    ],
    tools: ['Visual Studio Code, Git e GitHub.', 'HTML, CSS, JavaScript e Python conforme a aplicação.', 'Bancos de dados, hospedagem, APIs e integração de sistemas.', 'Segurança digital, backup, gestão de acessos, documentação, automação e noções de formatos CAD e arquivos de simulação.'],
    training: ['Fundamentos de programação e desenvolvimento web.', 'Git e GitHub.', 'Banco de dados e integração de APIs.', 'Segurança da informação.', 'Python para automação e análise de dados.'],
    deliverables: ['Aplicações e ferramentas digitais; repositórios documentados.', 'Procedimentos de backup e acesso.', 'Sistemas de acompanhamento e visualização de dados.', 'Documentação técnica e registros de manutenção.'],
  },
];

const competencies = [
  ['Gestão de projetos', 'Projetos', 'Básico'],
  ['Controle financeiro', 'Administrativo-Financeiro', 'Básico'],
  ['Prospecção de patrocinadores', 'Gestão de Pessoas', 'Básico'],
  ['Marketing digital', 'Marketing', 'Básico'],
  ['CAD e SolidWorks', 'Mecânica Naval', 'Básico'],
  ['Ansys Mechanical', 'Mecânica Naval', 'Básico'],
  ['Ansys Fluent e CFD', 'Mecânica Naval', 'Básico'],
  ['Sistemas fotovoltaicos', 'Energia', 'Básico'],
  ['Baterias, BMS e MPPT', 'Energia', 'Básico'],
  ['KiCad', 'Energia', 'Básico'],
  ['ESP32 e sensores', 'Telemetria', 'Básico'],
  ['Programação e desenvolvimento web', 'TI', 'Básico'],
  ['Git e organização de código', 'TI / Telemetria', 'Básico'],
  ['Impressão 3D', 'Mecânica Naval / TI conforme aplicação', 'Básico'],
  ['Operação de prensa', 'Integrantes autorizados', 'Treinamento específico obrigatório'],
  ['Segurança elétrica', 'Energia / Telemetria', 'Treinamento adequado à atividade'],
  ['Documentação técnica', 'Todas as áreas', 'Básico'],
];

const transversal = [
  {
    title: 'Ansys — simulação computacional',
    body: 'Pode apoiar análise estrutural, investigação do escoamento ao redor do casco, comparação de geometrias e estudos de pressão e carregamentos. Simulações de ondas e interação fluido-estrutura dependem do modelo físico, dos recursos e da configuração adotada.',
    items: ['Preparar geometria e malha; definir materiais, condições de contorno e modelos físicos.', 'Avaliar convergência e interpretar resultados; registrar hipóteses, condições, gráficos, comparações e limitações.', 'Verificar e validar resultados com cálculos independentes e, sempre que possível, ensaios físicos.'],
  },
  {
    title: 'Impressão 3D',
    body: 'Aplicações possíveis: protótipos, suportes, caixas, gabaritos e componentes auxiliares.',
    items: ['Preparar e exportar STL/3MF; usar o fatiador, selecionar material, orientação, preenchimento e suportes.', 'Considerar tolerâncias, inspeção dimensional, parâmetros e manutenção preventiva básica.', 'Registrar arquivos, material, parâmetros, peças e inspeção. A adequação depende do material, orientação, temperatura, cargas, exposição à água e uso real.'],
  },
  {
    title: 'Prensa e processos de prensagem',
    body: 'A capacitação deve ser específica para o equipamento disponível — manual, hidráulico, mecânico ou destinado a processo particular.',
    items: ['Conhecer capacidade nominal, força, pressão, área de contato, posicionamento, acessórios, inspeção e riscos.', 'Seguir procedimento operacional, inspeção e manutenção preventiva; registrar parâmetros, peças, desvios e manutenção quando aplicável.', 'Somente pessoas treinadas e autorizadas podem operar, com proteções instaladas e procedimentos de segurança respeitados.'],
  },
];

const indicators = [
  'Capacitações essenciais concluídas e integrantes capacitados/autorizados por atividade técnica.',
  'Procedimentos técnicos documentados e percentual de entregas concluídas no prazo.',
  'Testes executados e registrados; falhas recorrentes e melhorias implementadas.',
  'Arquivos, códigos e projetos com documentação atualizada.',
];

export default function ManualFunctions() {
  const [query, setQuery] = useState('');
  const [nucleus, setNucleus] = useState<'Todos' | 'Gestão' | 'Engenharia'>('Todos');
  const filteredRoles = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('pt-BR');
    return roles.filter((role) => {
      const matchesNucleus = nucleus === 'Todos' || role.nucleus === nucleus;
      const haystack = [role.nucleus, role.area, role.summary, ...role.responsibilities, ...role.tools, ...role.training, ...role.deliverables].join(' ').toLocaleLowerCase('pt-BR');
      return matchesNucleus && (!term || haystack.includes(term));
    });
  }, [nucleus, query]);

  return (
    <section className="workspace-manual" aria-label="Manual de funções e capacitação">
      <div className="manual-intro">
        <span className="manual-intro-icon" aria-hidden="true">M</span>
        <div>
          <p className="workspace-kicker">CARGOS · RESPONSABILIDADES · CAPACITAÇÃO</p>
          <h2>Como cada área contribui</h2>
          <p>Consulte as responsabilidades centrais, os conhecimentos e ferramentas de apoio, as capacitações recomendadas e as entregas esperadas para cada função do SolMar Celeris.</p>
        </div>
      </div>

      <div className="manual-controls">
        <label className="manual-search">
          <Search aria-hidden="true" />
          <span className="sr-only">Buscar no manual</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar área, responsabilidade ou competência…" />
        </label>
        <div className="manual-nucleus-filter" aria-label="Filtrar por núcleo">
          {(['Todos', 'Gestão', 'Engenharia'] as const).map((item) => (
            <button key={item} type="button" className={nucleus === item ? 'is-selected' : ''} onClick={() => setNucleus(item)} aria-pressed={nucleus === item}>{item}</button>
          ))}
        </div>
      </div>

      {filteredRoles.length === 0 ? (
        <div className="workspace-empty manual-empty"><span aria-hidden="true">⌕</span><strong>Nenhuma função encontrada.</strong><p>Tente outro termo ou selecione outro núcleo.</p></div>
      ) : (
        <div className="manual-role-grid">
          {filteredRoles.map((role) => (
            <article className="manual-role-card" key={role.area}>
              <header className="manual-role-head">
                <span className={`manual-nucleus-tag ${role.nucleus === 'Gestão' ? 'is-management' : 'is-engineering'}`}>NÚCLEO DE {role.nucleus.toLocaleUpperCase('pt-BR')}</span>
                <h3>{role.area}</h3>
                <p>{role.summary}</p>
              </header>
              <div className="manual-responsibilities">
                <h4>Responsabilidades</h4>
                <ul>{role.responsibilities.map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
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

      <section className="manual-extra-section" aria-labelledby="manual-transversal-title">
        <div className="manual-section-heading">
          <div><p className="workspace-kicker">COMPETÊNCIAS COMPARTILHADAS</p><h3 id="manual-transversal-title">Simulação e fabricação</h3></div>
          <p>Atividades técnicas devem seguir capacitação e procedimentos compatíveis com os equipamentos disponíveis.</p>
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
          <p>Os níveis são uma referência inicial e não autorizam, por si só, a operação de equipamentos ou atividades críticas.</p>
        </div>
        <div className="manual-table-wrap">
          <table className="manual-table"><thead><tr><th>Competência</th><th>Área prioritária</th><th>Nível de referência</th></tr></thead>
            <tbody>{competencies.map(([skill, area, level]) => <tr key={skill}><td>{skill}</td><td>{area}</td><td>{level}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <aside className="manual-note">
        <strong>Integração, segurança e continuidade</strong>
        <p>Gestão de Pessoas cuida da integração, capacitação e patrocinadores; Administrativo-Financeiro, de orçamento, compras e formalização; Projetos, de cronogramas, riscos e entregas; Marketing, de comunicação, produtos e contrapartidas. Mecânica Naval, Energia, Telemetria e TI mantêm a integração técnica entre estrutura, sistemas elétricos, dados e software. Registre arquivos, códigos, CAD, simulações e testes com identificação, versão, responsável e local de armazenamento definidos, para preservar o conhecimento entre gerações.</p>
        <ul>{indicators.map((item) => <li key={item}>{item}</li>)}</ul>
      </aside>
    </section>
  );
}
