import type { Activity } from './domain';
import type { PertDependency, PertSchedule } from './pert-cpm';

type TimelineActivity = Activity & { pert_optimistic_days?: number | null; pert_most_likely_days?: number | null; pert_pessimistic_days?: number | null };

type PertTimelineProps = {
  activities: TimelineActivity[];
  schedule: Map<string, PertSchedule>;
  dependencies: PertDependency[];
};

const LEFT = 300;
const ROW_HEIGHT = 48;
const TOP = 34;
const fmt = (value: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value);

export default function PertTimeline({ activities, schedule, dependencies }: PertTimelineProps) {
  const ready = activities.filter((activity) => schedule.get(activity.id)?.status === 'ready');
  const isPartial = ready.length < activities.length;
  const projectFinish = Math.max(0, ...ready.map((activity) => schedule.get(activity.id)?.earlyFinish ?? 0));
  const scale = Math.max(20, Math.min(52, 720 / Math.max(projectFinish, 1)));
  const timelineWidth = Math.max(560, projectFinish * scale);
  const svgWidth = LEFT + timelineWidth + 28;
  const svgHeight = TOP + activities.length * ROW_HEIGHT + 8;
  const tickStep = projectFinish <= 16 ? 1 : projectFinish <= 45 ? 5 : projectFinish <= 100 ? 10 : 20;
  const ticks: number[] = [];
  for (let tick = 0; tick <= Math.max(projectFinish, tickStep); tick += tickStep) ticks.push(tick);
  if (projectFinish > 0 && ticks[ticks.length - 1] < projectFinish) ticks.push(projectFinish);
  const rowById = new Map(activities.map((activity, index) => [activity.id, index]));
  const point = (activity: TimelineActivity) => {
    const result = schedule.get(activity.id);
    const row = rowById.get(activity.id) ?? 0;
    return { result, y: TOP + row * ROW_HEIGHT + 18, x1: LEFT + (result?.earlyStart ?? 0) * scale, x2: LEFT + (result?.earlyFinish ?? 0) * scale };
  };

  return (
    <section className="pert-visual-section" aria-labelledby="pert-visual-title">
      <div className="pert-visual-heading">
        <div><h2 id="pert-visual-title">Cronograma visual do projeto</h2><p>Tempo relativo em dias, começando no dia 0. Cada barra vai do início mais cedo (ES) ao término mais cedo (EF).</p></div>
        <div className="pert-visual-legend" aria-label="Legenda do gráfico"><span><i className="pert-legend-bar" />{isPartial ? 'Estimativa parcial' : 'Atividade'}</span>{!isPartial && <span><i className="pert-legend-bar is-critical" />Caminho crítico</span>}<span><i className="pert-legend-arrow" />Dependência</span></div>
      </div>
      <div className="pert-timeline-scroll" role="region" aria-label="Gráfico de Gantt PERT/CPM; role horizontal para ver o cronograma completo" tabIndex={0}>
        <svg className="pert-timeline" viewBox={`0 0 ${svgWidth} ${svgHeight}`} width={svgWidth} height={svgHeight} role="img" aria-labelledby="pert-timeline-title pert-timeline-description">
          <title id="pert-timeline-title">Cronograma PERT/CPM com dependências e caminho crítico</title>
          <desc id="pert-timeline-description">As barras mostram os dias de início e término mais cedo. Setas ligam predecessoras a sucessoras. {isPartial ? 'A rede está incompleta; não é possível afirmar o caminho crítico ou a duração final do projeto. ' : 'Barras vermelhas pertencem ao caminho crítico. '}Itens cinza aguardam estimativas válidas.</desc>
          <defs>
            <marker id="pert-arrow-normal" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker>
            <marker id="pert-arrow-critical" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker>
          </defs>
          <text className="pert-axis-title" x={LEFT} y="17">DIAS DO PROJETO</text>
          {ticks.map((tick) => {
            const x = LEFT + tick * scale;
            return <g key={tick}><line className="pert-grid-line" x1={x} y1="25" x2={x} y2={svgHeight - 3} /><text className="pert-axis-label" x={x} y="29" textAnchor="middle">{fmt(tick)}</text></g>;
          })}
          {activities.map((activity, index) => {
            const { y } = point(activity);
            return <g key={`row-${activity.id}`}><rect className={index % 2 ? 'pert-row-shade is-alt' : 'pert-row-shade'} x="0" y={y - 13} width={svgWidth} height={ROW_HEIGHT} /><text className="pert-row-code" x="12" y={y + 1}>{activity.code}</text><text className="pert-row-name" x="84" y={y + 1}>{activity.name.length > 31 ? `${activity.name.slice(0, 30)}…` : activity.name}</text></g>;
          })}
          {activities.map((activity) => {
            const { result, y, x1, x2 } = point(activity);
            if (result?.status !== 'ready') return <g key={`pending-${activity.id}`}><rect className="pert-pending-bar" x={LEFT + 5} y={y - 7} width="130" height="15" rx="7" /><text className="pert-pending-label" x={LEFT + 70} y={y + 3} textAnchor="middle">Pendente · informe O, M e P</text></g>;
            const width = Math.max(5, x2 - x1);
            const duration = result.expectedDays ?? 0;
            const critical = !isPartial && result.critical;
            return <g key={`bar-${activity.id}`}><rect className={critical ? 'pert-task-bar is-critical' : 'pert-task-bar'} x={x1} y={y - 8} width={width} height="16" rx="5"><title>{`${activity.code}: ES ${fmt(result.earlyStart ?? 0)}, EF ${fmt(result.earlyFinish ?? 0)}, duração PERT ${fmt(duration)} dias${critical ? ', caminho crítico' : ''}`}</title></rect>{width > 46 && <text className="pert-bar-label" x={x1 + width / 2} y={y + 3} textAnchor="middle">{fmt(duration)} d</text>}</g>;
          })}
          {dependencies.map((edge) => {
            const before = activities.find((activity) => activity.id === edge.predecessorId);
            const after = activities.find((activity) => activity.id === edge.successorId);
            if (!before || !after || schedule.get(before.id)?.status !== 'ready' || schedule.get(after.id)?.status !== 'ready') return null;
            const from = point(before);
            const to = point(after);
            const criticalEdge = !isPartial && Boolean(from.result?.critical && to.result?.critical);
            const x1 = Math.max(from.x2, LEFT + 2);
            const x2 = Math.max(to.x1 - 3, LEFT + 2);
            const gap = x2 - x1;
            const path = gap > 0
              ? `M ${x1} ${from.y} C ${x1 + Math.min(20, gap / 2)} ${from.y}, ${x2 - Math.min(20, gap / 2)} ${to.y}, ${x2} ${to.y}`
              : `M ${x1} ${from.y} C ${x1 + 14} ${from.y}, ${x2 + 14} ${to.y}, ${x2} ${to.y}`;
            return <path key={`${edge.predecessorId}-${edge.successorId}`} className={criticalEdge ? 'pert-dependency-line is-critical' : 'pert-dependency-line'} d={path} markerEnd={criticalEdge ? 'url(#pert-arrow-critical)' : 'url(#pert-arrow-normal)'} />;
          })}
        </svg>
      </div>
      <p className="pert-graph-note">Cinza = estimativas incompletas ou cadeia pendente. As setas conectam predecessoras e sucessoras; {isPartial ? `a rede está incompleta${projectFinish ? `; as barras azuis representam um subgrafo com ${fmt(projectFinish)} dias calculáveis` : ''}, portanto a duração final do projeto e o caminho crítico ainda não estão definidos.` : `a duração estimada do projeto é ${fmt(projectFinish)} dias; barras vermelhas indicam caminho crítico.`}</p>
    </section>
  );
}
