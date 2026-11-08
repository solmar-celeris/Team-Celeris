import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import DocumentationPrompts from './DocumentationPrompts';

type ManualRole = {
  area: string;
  summary: string;
  responsibilities: string[];
  tools: string[];
  training: string[];
  deliverables: string[];
};

const roles: ManualRole[] = [
  {
    area: 'Gestão de Pessoas - GP',
    summary: 'Integração, desenvolvimento de competências e relacionamento com patrocinadores e apoiadores.',
    responsibilities: [
      'Integrar novos membros e acompanhar sua adaptação à equipe.',
      'Mapear competências, necessidades de capacitação e oportunidades de desenvolvimento; manter a matriz de competências e os registros de treinamento.',
      'Prospectar empresas, instituições e organizações; fazer o contato inicial, apresentar oportunidades de apoio e acompanhar o relacionamento com patrocinadores.',
      'Articular condições e formalização com Administrativo Financeiro - AF e propostas, identidade visual e contrapartidas com Marketing - MKT.',
      'Apoiar a transferência de conhecimento e a continuidade entre gerações da equipe.',
    ],
    tools: ['Planilhas, documentação e plataformas colaborativas.', 'Gestão de pessoas, comunicação, negociação inicial, relacionamento institucional e gestão do conhecimento.'],
    training: ['Gestão de equipes e comunicação interpessoal.', 'Prospecção de patrocinadores e elaboração de propostas de apoio.', 'Gestão do conhecimento e planejamento de capacitação.'],
    deliverables: ['Matriz de competências e plano de capacitação.', 'Registro de contatos, prospecções e acompanhamentos de patrocinadores.', 'Registros de integração e treinamento.'],
  },
  {
    area: 'Administrativo Financeiro - AF',
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
    area: 'Coordenação Geral',
    summary: 'Coordenação exercida exclusivamente pelos professores, com foco em direcionamento e integração geral. Não há atividades operacionais pré-atribuídas aos professores.',
    responsibilities: [
      'Orientar objetivos, prioridades gerais e critérios de acompanhamento do projeto.',
      'Apoiar a integração entre os responsáveis das áreas, alinhando dependências e decisões que exigem coordenação docente.',
      'Acompanhar o andamento global, riscos e necessidades de apoio sem assumir a execução das tarefas das áreas.',
      'Facilitar a articulação entre equipe discente, instituição, parceiros e apoiadores quando necessário.',
      'Atividades de execução somente são atribuídas a professor quando houver designação explícita, nunca automaticamente.',
    ],
    tools: ['Quadro integrado de atividades e cronograma.', 'Reuniões de alinhamento, registros de decisão e indicadores.', 'Plataformas colaborativas e documentação institucional.'],
    training: ['Orientação e acompanhamento de equipes acadêmicas.', 'Planejamento, priorização, facilitação de reuniões e gestão de riscos.', 'Comunicação institucional e melhoria contínua.'],
    deliverables: ['Direcionamentos e decisões gerais registrados.', 'Alinhamento de prioridades e dependências entre áreas.', 'Acompanhamento consolidado do projeto, sem lista automática de tarefas atribuídas.'],
  },
  {
    area: 'Marketing - MKT',
    summary: 'Produtos, redes sociais, vendas, comunicação visual e divulgação dos resultados do projeto.',
    responsibilities: [
      'Desenvolver produtos e materiais de divulgação.',
      'Gerenciar redes sociais e identidade visual.',
      'Planejar campanhas, vendas e ações promocionais.',
      'Preparar apresentações, propostas visuais e materiais de contrapartida para patrocinadores em conjunto com Gestão de Pessoas - GP.',
      'Divulgar resultados técnicos e atividades do projeto.',
    ],
    tools: ['Canva e editores de imagem e vídeo.', 'Marketing digital, comunicação visual, desenvolvimento de produtos, vendas e produção de conteúdo.'],
    training: ['Marketing digital e gestão de redes sociais.', 'Design gráfico, vendas e comunicação comercial.'],
    deliverables: ['Calendário de publicações.', 'Materiais de divulgação e propostas visuais.', 'Relatórios de alcance, engajamento e vendas.'],
  },
  {
    area: 'Mecânica Naval - MEC',
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
    area: 'Elétrica - ELE',
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
    area: 'Telemetria - TEL',
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
    area: 'Tecnologia da Informação (TI)',
    summary: 'Apoio transversal às áreas em ferramentas, aplicativos, sistemas e automações, sem substituir a responsabilidade técnica de quem solicita o apoio.',
    responsibilities: [
      'Desenvolver e manter sites, aplicações e sistemas digitais da equipe.',
      'Organizar repositórios, arquivos técnicos e documentação digital.',
      'Criar ferramentas para gestão de tarefas, comunicação e indicadores.',
      'Integrar dados e ferramentas entre as áreas, atendendo às necessidades identificadas por seus integrantes.',
      'Gerenciar controle de versões, permissões de acesso, backups e recuperação de arquivos.',
      'Prestar suporte tecnológico e automatizar tarefas quando houver benefício prático, priorizando demandas com as áreas e a Coordenação Geral.',
      'Apoiar o processamento e a organização de arquivos CAD e resultados de simulação.',
    ],
    tools: ['Visual Studio Code, Git e GitHub.', 'HTML, CSS, JavaScript e Python conforme a aplicação.', 'Bancos de dados, hospedagem, APIs e integração de sistemas.', 'Segurança digital, backup, gestão de acessos, documentação, automação e noções de formatos CAD e arquivos de simulação.'],
    training: ['Fundamentos de programação e desenvolvimento web.', 'Git e GitHub.', 'Banco de dados e integração de APIs.', 'Segurança da informação.', 'Python para automação e análise de dados.'],
    deliverables: ['Aplicações e ferramentas digitais; repositórios documentados.', 'Procedimentos de backup e acesso.', 'Sistemas de acompanhamento e visualização de dados.', 'Documentação técnica e registros de manutenção.'],
  },
];

const competencies = [
  ['Gestão de projetos', 'Coordenação Geral (professores)', 'Básico'],
  ['Controle financeiro', 'Administrativo Financeiro - AF', 'Básico'],
  ['Prospecção de patrocinadores', 'Gestão de Pessoas - GP', 'Básico'],
  ['Marketing digital', 'Marketing - MKT', 'Básico'],
  ['CAD e SolidWorks', 'Mecânica Naval - MEC', 'Básico'],
  ['Ansys Mechanical', 'Mecânica Naval - MEC', 'Básico'],
  ['Ansys Fluent e CFD', 'Mecânica Naval - MEC', 'Básico'],
  ['Sistemas fotovoltaicos', 'Elétrica - ELE', 'Básico'],
  ['Baterias, BMS e MPPT', 'Elétrica - ELE', 'Básico'],
  ['KiCad', 'Elétrica - ELE', 'Básico'],
  ['ESP32 e sensores', 'Telemetria - TEL', 'Básico'],
  ['Programação e desenvolvimento web', 'TI', 'Básico'],
  ['Git e organização de código', 'TI / Telemetria', 'Básico'],
  ['Impressão 3D', 'Mecânica Naval / TI conforme aplicação', 'Básico'],
  ['Operação de prensa', 'Integrantes autorizados', 'Treinamento específico obrigatório'],
  ['Segurança elétrica', 'Elétrica / Telemetria', 'Treinamento adequado à atividade'],
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
  const [manualFilter, setManualFilter] = useState<'Todas' | 'Coordenação' | 'Áreas diretas' | 'Apoio transversal'>('Todas');
  const filteredRoles = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('pt-BR');
    return roles.filter((role) => {
      const isCoordination = role.area === 'Coordenação Geral';
      const isSupport = role.area.toLocaleLowerCase('pt-BR').includes('tecnologia da informação') || role.area === 'TI';
      const matchesGroup = manualFilter === 'Todas'
        || (manualFilter === 'Coordenação' && isCoordination)
        || (manualFilter === 'Áreas diretas' && role.area !== 'Coordenação Geral' && !isSupport)
        || (manualFilter === 'Apoio transversal' && isSupport);
      const haystack = [role.area, role.summary, ...role.responsibilities, ...role.tools, ...role.training, ...role.deliverables].join(' ').toLocaleLowerCase('pt-BR');
      return matchesGroup && (!term || haystack.includes(term));
    });
  }, [manualFilter, query]);

  return (
    <section className="workspace-manual" aria-label="Manual de funções e capacitação">
      <section className="manual-org-intro" aria-labelledby="manual-org-title">
        <p className="workspace-kicker">ESTRUTURA ORGANIZACIONAL · MANUAL V2.2</p>
        <h2 id="manual-org-title">Professores na Coordenação Geral; equipes organizadas por área.</h2>
        <p>A Coordenação Geral orienta e acompanha o projeto, mas não recebe tarefas operacionais pré-atribuídas. As atividades são organizadas nas seis áreas diretas. Produtos e Redes Sociais são frentes de Marketing; TI presta apoio transversal a pedido das equipes.</p>
        <div className="manual-org-area-list"><span>Gestão de Pessoas - GP</span><span>Administrativo Financeiro - AF</span><span>Marketing - MKT <small>Produtos · Redes Sociais</small></span><span>Mecânica Naval - MEC</span><span>Elétrica - ELE</span><span>Telemetria - TEL</span></div>
        <p className="manual-org-footnote"><strong>TI — apoio transversal:</strong> facilita tecnologia para as áreas, sem assumir sua responsabilidade técnica.</p>
      </section>
      <div className="manual-controls">
        <label className="manual-search">
          <Search aria-hidden="true" />
          <span className="sr-only">Buscar no manual</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar área, responsabilidade ou competência…" />
        </label>
        <div className="manual-nucleus-filter" aria-label="Filtrar funções">
          {(['Todas', 'Coordenação', 'Áreas diretas', 'Apoio transversal'] as const).map((item) => (
            <button key={item} type="button" className={manualFilter === item ? 'is-selected' : ''} onClick={() => setManualFilter(item)} aria-pressed={manualFilter === item}>{item}</button>
          ))}
        </div>
      </div>

      {filteredRoles.length === 0 ? (
        <div className="workspace-empty manual-empty"><span aria-hidden="true">⌕</span><strong>Nenhuma função encontrada.</strong><p>Tente outro termo ou selecione outra categoria.</p></div>
      ) : (
        <div className="manual-role-grid">
          {filteredRoles.map((role) => (
            <article className="manual-role-card" key={role.area}>
              <header className="manual-role-head">
                <span className={`manual-nucleus-tag ${role.area === 'Coordenação Geral' ? 'is-management' : role.area.toLocaleLowerCase('pt-BR').includes('tecnologia da informação') ? 'is-transversal' : 'is-engineering'}`}>{role.area === 'Coordenação Geral' ? 'COORDENAÇÃO · PROFESSORES' : role.area.toLocaleLowerCase('pt-BR').includes('tecnologia da informação') ? 'APOIO TRANSVERSAL' : 'ÁREA DIRETA'}</span>
                <h3>{role.area}</h3>
                <p>{role.summary}</p>
              </header>
              <div className="manual-responsibilities">
                <h4>Responsabilidades</h4>
                <ul>{role.responsibilities.map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
              {role.area.startsWith('Marketing') && <div className="manual-responsibilities manual-marketing-fronts">
                <h4>Frentes subordinadas</h4>
                <div><section><strong>Produtos</strong><ul><li>Planejar, desenvolver e apresentar produtos ligados à identidade e às necessidades do projeto.</li><li>Articular custos e comercialização com Administrativo Financeiro - AF.</li></ul></section><section><strong>Redes Sociais</strong><ul><li>Planejar calendário editorial e publicar conteúdos nos canais oficiais.</li><li>Produzir registros, acompanhar engajamento e organizar o arquivo de publicações.</li></ul></section></div>
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
        <p>A Coordenação Geral é exercida pelos professores e não recebe atividades operacionais pré-atribuídas. Os responsáveis das áreas planejam e executam suas entregas, articulando dependências com as demais equipes. Gestão de Pessoas - GP cuida da integração e capacitação; Administrativo Financeiro - AF, de recursos e controles; Marketing - MKT, de produtos e comunicação; Mecânica Naval - MEC, Elétrica - ELE e Telemetria - TEL, da integração técnica; TI apoia transversalmente as áreas. Registre arquivos, códigos, CAD, simulações e testes com identificação, versão, responsável e local de armazenamento para preservar o conhecimento.</p>
        <ul>{indicators.map((item) => <li key={item}>{item}</li>)}</ul>
      </aside>
      <DocumentationPrompts />
    </section>
  );
}
