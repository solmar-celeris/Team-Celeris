import './performance-panel.css';

export type PerformanceItem = {
  id: string;
  code?: string | null;
  name: string;
  area?: string | null;
  responsible?: string | null;
  dueDate?: string | null;
  status: 'completed' | 'in_progress' | 'pending' | 'overdue' | 'blocked' | 'not_applicable';
};

type Props = {
  items: PerformanceItem[];
  periodLabel?: string;
  readOnly?: boolean;
};

const statusText: Record<PerformanceItem['status'], string> = {
  completed: 'Concluída',
  in_progress: 'Em andamento',
  pending: 'Pendente',
  overdue: 'Atrasada',
  blocked: 'Bloqueada',
  not_applicable: 'Não se aplica',
};

export default function PerformancePanel({ items, periodLabel, readOnly = false }: Props) {
  const applicable = items.filter((item) => item.status !== 'not_applicable');
  const completed = applicable.filter((item) => item.status === 'completed').length;
  const inProgress = applicable.filter((item) => item.status === 'in_progress').length;
  const overdue = applicable.filter((item) => item.status === 'overdue').length;
  const blocked = applicable.filter((item) => item.status === 'blocked').length;
  const percent = applicable.length ? Math.round((completed / applicable.length) * 100) : 0;
  const areas = [...new Set(applicable.map((item) => item.area?.trim() || 'Sem área'))]
    .map((area) => {
      const group = applicable.filter((item) => (item.area?.trim() || 'Sem área') === area);
      const done = group.filter((item) => item.status === 'completed').length;
      return { name: area, total: group.length, done, percent: Math.round((done / group.length) * 100) };
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'pt-BR'))
    .slice(0, 5);
  const highlights = [...applicable]
    .filter((item) => item.status === 'overdue' || item.status === 'blocked' || item.status === 'in_progress')
    .slice(0, 5);

  return (
    <section className="performance-panel" aria-label="Painel de desempenho">
      <div className="performance-panel-heading">
        <div><p className="performance-kicker">ACOMPANHAMENTO DA EQUIPE</p><h2>Painel de desempenho</h2><p>{periodLabel || 'Indicadores consolidados das atividades cadastradas'}</p></div>
        <span className="performance-live-label"><i />{readOnly ? 'VISUALIZAÇÃO PÚBLICA' : 'DADOS DO WORKSPACE'}</span>
      </div>
      <div className="performance-metrics">
        <article className="performance-metric metric-total"><span>Atividades</span><strong>{applicable.length}</strong><small>no período selecionado</small></article>
        <article className="performance-metric metric-done"><span>Concluídas</span><strong>{completed}</strong><small>{percent}% do total</small></article>
        <article className="performance-metric metric-progress"><span>Em andamento</span><strong>{inProgress}</strong><small>em execução</small></article>
        <article className="performance-metric metric-alert"><span>Precisam de atenção</span><strong>{overdue + blocked}</strong><small>{overdue} atrasada(s) · {blocked} bloqueada(s)</small></article>
      </div>
      <div className="performance-insights">
        <article className="performance-card performance-execution">
          <div className="performance-card-heading"><div><span>RESULTADO GERAL</span><h3>Execução das atividades</h3></div><strong>{percent}%</strong></div>
          <div className="performance-progress-track"><span style={{ width: `${percent}%` }} /></div>
          <div className="performance-progress-legend"><span>{completed} concluída(s)</span><span>{applicable.length - completed} em aberto</span></div>
          <p>{applicable.length ? `${completed} de ${applicable.length} atividades aplicáveis foram concluídas.` : 'Ainda não há atividades para calcular o desempenho.'}</p>
        </article>
        <article className="performance-card">
          <div className="performance-card-heading"><div><span>DISTRIBUIÇÃO</span><h3>Desempenho por área</h3></div></div>
          {areas.length ? <div className="performance-area-list">{areas.map((area) => <div className="performance-area" key={area.name}><div><strong>{area.name}</strong><span>{area.done}/{area.total} · {area.percent}%</span></div><div className="performance-area-track"><i style={{ width: `${area.percent}%` }} /></div></div>)}</div> : <p className="performance-empty">Sem dados por área.</p>}
        </article>
      </div>
      <article className="performance-card performance-highlights">
        <div className="performance-card-heading"><div><span>ACOMPANHAMENTO</span><h3>Atividades em destaque</h3></div><small>{highlights.length} registro(s)</small></div>
        {highlights.length ? <div className="performance-highlight-list">{highlights.map((item) => <div className="performance-highlight" key={item.id}><div><strong>{item.name}</strong><span>{item.code ? `${item.code} · ` : ''}{item.area || 'Área não definida'}{item.responsible ? ` · ${item.responsible}` : ''}</span></div><span className={`performance-status status-${item.status}`}>{statusText[item.status]}</span></div>)}</div> : <p className="performance-empty">Nenhuma atividade atrasada, bloqueada ou em andamento.</p>}
      </article>
      {readOnly && <p className="performance-footnote">Painel público em modo de consulta. Os indicadores refletem os registros disponibilizados pela equipe.</p>}
    </section>
  );
}
