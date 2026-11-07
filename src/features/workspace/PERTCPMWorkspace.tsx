import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { canManageActivity, type Activity, type MemberProfile } from './domain';
import { calculatePertSchedule, type PertDependency, type PertEstimate } from './pert-cpm';
import PertTimeline from './PertTimeline';
import './pert-cpm.css';

type PERTCPMWorkspaceProps = {
  client: SupabaseClient;
  activities: Activity[];
  profile: MemberProfile;
};

type PertActivity = Activity & {
  pert_optimistic_days?: number | null;
  pert_most_likely_days?: number | null;
  pert_pessimistic_days?: number | null;
};
type DependencyRow = { predecessor_activity_id: string; successor_activity_id: string };
type DependencyDraft = { predecessorId: string; successorId: string };
type EstimateColumn = 'pert_optimistic_days' | 'pert_most_likely_days' | 'pert_pessimistic_days';
type EstimateKey = keyof PertEstimate;

const estimateFields: { key: EstimateKey; column: EstimateColumn; label: string }[] = [
  { key: 'optimisticDays', column: 'pert_optimistic_days', label: 'Otimista' },
  { key: 'mostLikelyDays', column: 'pert_most_likely_days', label: 'Mais provável' },
  { key: 'pessimisticDays', column: 'pert_pessimistic_days', label: 'Pessimista' },
];

function toEstimate(activity: PertActivity): PertEstimate {
  return {
    optimisticDays: activity.pert_optimistic_days ?? null,
    mostLikelyDays: activity.pert_most_likely_days ?? null,
    pessimisticDays: activity.pert_pessimistic_days ?? null,
  };
}

function describeError(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    const message = error.message;
    if (/cycle|circular|ciclo/i.test(message)) return 'Essa dependência criaria um ciclo. Escolha outro predecessor.';
    if (/activity_dependencies|pert_.*days|schema cache/i.test(message)) {
      return 'A migration PERT/CPM ainda não está disponível no banco. Aplique a migration antes de salvar.';
    }
    return message;
  }
  return 'Não foi possível concluir a operação. Verifique a conexão e tente novamente.';
}

function formatDays(value: number | undefined): string {
  if (value === undefined) return '—';
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value);
}

function formatDayIndex(value: number | undefined): string {
  return value === undefined ? '—' : formatDays(value);
}

export default function PERTCPMWorkspace({ client, activities, profile }: PERTCPMWorkspaceProps) {
  const marcoActivities = useMemo(
    () => (activities as PertActivity[]).filter((activity) => activity.activity_type === 'marco' && !activity.archived_at),
    [activities],
  );
  const activitiesById = useMemo(() => new Map(marcoActivities.map((activity) => [activity.id, activity])), [marcoActivities]);
  const [estimates, setEstimates] = useState<Record<string, PertEstimate>>(() =>
    Object.fromEntries(marcoActivities.map((activity) => [activity.id, toEstimate(activity)])),
  );
  const [dependencies, setDependencies] = useState<DependencyDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [savingEstimateId, setSavingEstimateId] = useState<string | null>(null);
  const [savingDependencyId, setSavingDependencyId] = useState<string | null>(null);
  const [selectedPredecessors, setSelectedPredecessors] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setEstimates(Object.fromEntries(marcoActivities.map((activity) => [activity.id, toEstimate(activity)])));
  }, [marcoActivities]);

  useEffect(() => {
    let active = true;
    async function loadDependencies() {
      setLoading(true);
      setLoadError('');
      const { data, error: queryError } = await client
        .from('activity_dependencies')
        .select('predecessor_activity_id,successor_activity_id');
      if (!active) return;
      if (queryError) {
        setLoadError(describeError(queryError));
        setDependencies([]);
      } else {
        setDependencies(((data ?? []) as DependencyRow[]).map((row) => ({
          predecessorId: row.predecessor_activity_id,
          successorId: row.successor_activity_id,
        })));
      }
      setLoading(false);
    }
    void loadDependencies();
    return () => { active = false; };
  }, [client]);

  const predecessorIds = useMemo(() => {
    const result: Record<string, string[]> = {};
    for (const edge of dependencies) (result[edge.successorId] ??= []).push(edge.predecessorId);
    return result;
  }, [dependencies]);
  const successorIds = useMemo(() => {
    const result: Record<string, string[]> = {};
    for (const edge of dependencies) (result[edge.predecessorId] ??= []).push(edge.successorId);
    return result;
  }, [dependencies]);
  const schedule = useMemo(() => calculatePertSchedule(
    marcoActivities.map((activity) => ({ id: activity.id, ...(estimates[activity.id] ?? toEstimate(activity)) })),
    dependencies.map((edge) => ({ predecessorId: edge.predecessorId, successorId: edge.successorId } as PertDependency)),
  ), [marcoActivities, estimates, dependencies]);
  const networkComplete = !loading && marcoActivities.length > 0
    && marcoActivities.every((activity) => schedule.get(activity.id)?.status === 'ready');

  function updateEstimate(activityId: string, key: EstimateKey, rawValue: string) {
    setEstimates((current) => ({
      ...current,
      [activityId]: {
        ...(current[activityId] ?? { optimisticDays: null, mostLikelyDays: null, pessimisticDays: null }),
        [key]: rawValue === '' ? null : Number(rawValue),
      },
    }));
    setFeedback('');
    setError('');
  }

  async function saveEstimates(activity: PertActivity) {
    const estimate = estimates[activity.id] ?? toEstimate(activity);
    if (!canManageActivity(profile, activity.area_id)) {
      setError('Somente administradores e líderes autorizados podem alterar estimativas.');
      return;
    }
    const values = [estimate.optimisticDays, estimate.mostLikelyDays, estimate.pessimisticDays];
    if (!values.every((value) => typeof value === 'number' && Number.isInteger(value) && value > 0)) {
      setError('Preencha as três estimativas com dias inteiros positivos.');
      return;
    }
    if (values[0]! > values[1]! || values[1]! > values[2]!) {
      setError('Use a ordem otimista ≤ mais provável ≤ pessimista.');
      return;
    }

    setSavingEstimateId(activity.id);
    setError('');
    setFeedback('');
    const { error: updateError } = await client.from('activities').update({
      pert_optimistic_days: values[0],
      pert_most_likely_days: values[1],
      pert_pessimistic_days: values[2],
    }).eq('id', activity.id);
    setSavingEstimateId(null);
    if (updateError) setError(describeError(updateError));
    else setFeedback(`Estimativas de ${activity.code} salvas.`);
  }

  async function addPredecessor(successor: PertActivity) {
    const predecessorId = selectedPredecessors[successor.id];
    const predecessor = activitiesById.get(predecessorId);
    if (!predecessor || predecessor.id === successor.id) return;
    if (!canManageActivity(profile, predecessor.area_id) || !canManageActivity(profile, successor.area_id)) {
      setError('Para alterar uma dependência, você precisa ter permissão de gestão nas duas atividades.');
      return;
    }
    if (dependencies.some((edge) => edge.predecessorId === predecessor.id && edge.successorId === successor.id)) return;

    setSavingDependencyId(successor.id);
    setError('');
    setFeedback('');
    const { error: insertError } = await client.from('activity_dependencies').insert({
      predecessor_activity_id: predecessor.id,
      successor_activity_id: successor.id,
    });
    if (insertError) {
      setError(describeError(insertError));
    } else {
      setDependencies((current) => [...current, { predecessorId: predecessor.id, successorId: successor.id }]);
      setSelectedPredecessors((current) => ({ ...current, [successor.id]: '' }));
      setFeedback(`Predecessora adicionada a ${successor.code}.`);
    }
    setSavingDependencyId(null);
  }

  async function removePredecessor(edge: DependencyDraft, activity: PertActivity) {
    const predecessor = activitiesById.get(edge.predecessorId);
    if (!predecessor || !canManageActivity(profile, predecessor.area_id) || !canManageActivity(profile, activity.area_id)) {
      setError('Para remover uma dependência, você precisa ter permissão de gestão nas duas atividades.');
      return;
    }
    setSavingDependencyId(activity.id);
    setError('');
    setFeedback('');
    const { error: deleteError } = await client.from('activity_dependencies')
      .delete()
      .eq('predecessor_activity_id', edge.predecessorId)
      .eq('successor_activity_id', edge.successorId);
    if (deleteError) {
      setError(describeError(deleteError));
    } else {
      setDependencies((current) => current.filter((item) =>
        item.predecessorId !== edge.predecessorId || item.successorId !== edge.successorId));
      setFeedback(`Predecessora removida de ${activity.code}.`);
    }
    setSavingDependencyId(null);
  }

  const editableCount = marcoActivities.filter((activity) => canManageActivity(profile, activity.area_id)).length;

  return (
    <section className="pert-workspace" aria-labelledby="pert-title">
      <header className="pert-heading">
        <div>
          <p className="pert-eyebrow">PLANEJAMENTO DE MARCOS</p>
          <h1 id="pert-title">PERT / CPM</h1>
          <p className="pert-intro">Estime durações e organize predecessoras para visualizar início e término cedo/tarde, folgas e caminho crítico.</p>
        </div>
        <div className="pert-summary" aria-label="Resumo">
          <strong>{marcoActivities.length}</strong><span>marcos</span>
          <i />
          <strong>{editableCount}</strong><span>editáveis</span>
        </div>
      </header>

      <p className="pert-method-note"><b>Duração PERT</b> = (O + 4 × M + P) ÷ 6 dias. ES/EF são os tempos mais cedo; LS/LF são os tempos mais tarde sem atrasar o fim do projeto. Folga é o atraso que a atividade ainda suporta; folga zero indica caminho crítico. O cronograma começa no dia 0 e não infere datas do calendário.</p>
      {loadError && <div className="pert-alert" role="alert">{loadError}</div>}
      {error && <div className="pert-alert" role="alert">{error}</div>}
      {feedback && <div className="pert-feedback" role="status">{feedback}</div>}
      {loading && <p className="pert-loading" role="status">Carregando dependências…</p>}

      {!loading && marcoActivities.length === 0 && <div className="pert-empty">Não há marcos ativos disponíveis.</div>}
      {marcoActivities.length > 0 && (
        <>
        {!loading && <PertTimeline activities={marcoActivities} schedule={schedule} dependencies={dependencies} />}
        <div className="pert-glossary" aria-label="Significado das siglas da tabela">
          <div><b>O</b><span>Otimista: duração se tudo correr bem.</span></div>
          <div><b>M</b><span>Mais provável: duração esperada no cenário realista.</span></div>
          <div><b>P</b><span>Pessimista: duração se houver dificuldades.</span></div>
          <div><b>ES / EF</b><span>Início / término mais cedo permitidos pelas dependências.</span></div>
          <div><b>LS / LF</b><span>Início / término mais tarde sem atrasar o projeto.</span></div>
          <div><b>Folga</b><span>Dias que a atividade pode atrasar; zero indica caminho crítico.</span></div>
        </div>
        <div className="pert-table-scroll" role="region" aria-label="Tabela PERT e CPM; role horizontal para ver todas as colunas" tabIndex={0}>
          <table className="pert-table">
            <thead>
              <tr>
                <th scope="col">Marco</th>
                <th scope="col" title="Estimativa otimista: duração se tudo correr bem.">Otimista O<br />(dias)</th>
                <th scope="col" title="Estimativa mais provável: duração realista.">Mais provável M<br />(dias)</th>
                <th scope="col" title="Estimativa pessimista: duração se houver dificuldades.">Pessimista P<br />(dias)</th>
                <th scope="col" title="Duração esperada calculada por (O + 4 × M + P) ÷ 6.">Duração PERT<br />(dias)</th>
                <th scope="col" title="Early Start: início mais cedo permitido pelas predecessoras.">Início mais cedo ES</th>
                <th scope="col" title="Early Finish: término mais cedo, igual a ES mais a duração PERT.">Término mais cedo EF</th>
                <th scope="col" title="Late Start: início mais tarde sem atrasar o prazo do projeto.">Início mais tarde LS</th>
                <th scope="col" title="Late Finish: término mais tarde sem atrasar o prazo do projeto.">Término mais tarde LF</th>
                <th scope="col" title="Tempo que a atividade pode atrasar sem alterar o prazo final.">Folga total<br />(dias)</th>
                <th scope="col">Predecessoras / sucessoras</th>
                <th scope="col">Ações</th>
              </tr>
            </thead>
            <tbody>
              {marcoActivities.map((activity) => {
                const estimate = estimates[activity.id] ?? toEstimate(activity);
                const result = schedule.get(activity.id);
                const showCriticalPath = networkComplete && result?.status === 'ready' && result.critical;
                const currentPreds = predecessorIds[activity.id] ?? [];
                const currentSuccs = successorIds[activity.id] ?? [];
                const editable = canManageActivity(profile, activity.area_id);
                const permittedCandidates = marcoActivities.filter((candidate) => candidate.id !== activity.id
                  && !currentPreds.includes(candidate.id)
                  && canManageActivity(profile, candidate.area_id)
                  && editable);
                return (
                  <tr key={activity.id} className={showCriticalPath ? 'pert-critical-row' : undefined}>
                    <th scope="row" className="pert-activity-cell">
                      <span className="pert-code">{activity.code}</span>
                      <strong title={activity.name}>{activity.name}</strong>
                      <small>{activity.area_id === profile.area_id ? 'Sua área' : `Área ${activity.area_id.slice(0, 8)}`}</small>
                      {result?.status === 'pending'
                        ? <span className="pert-status is-pending" title={result.reason}>Pendente</span>
                        : showCriticalPath
                          ? <span className="pert-status is-critical">Caminho crítico</span>
                          : !loading && !networkComplete && result?.status === 'ready'
                            ? <span className="pert-status is-pending" title="Há marcos sem estimativas válidas na rede; criticidade e folga ainda não são definitivas.">Rede parcial</span>
                            : null}
                    </th>
                    {estimateFields.map((field) => (
                      <td key={field.key}>
                        <label className="pert-number-wrap">
                          <span className="pert-visually-hidden">{field.label} — {activity.code} (dias)</span>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            inputMode="numeric"
                            value={estimate[field.key] ?? ''}
                            disabled={!editable || savingEstimateId === activity.id}
                            onChange={(event) => updateEstimate(activity.id, field.key, event.target.value)}
                          />
                        </label>
                      </td>
                    ))}
                    <td className="pert-calc-cell">{result?.status === 'ready' ? `${formatDays(result.expectedDays)} d` : 'Pendente'}</td>
                    <td>{result?.status === 'ready' ? formatDayIndex(result.earlyStart) : '—'}</td>
                    <td>{result?.status === 'ready' ? formatDayIndex(result.earlyFinish) : '—'}</td>
                    <td>{networkComplete && result?.status === 'ready' ? formatDayIndex(result.lateStart) : '—'}</td>
                    <td>{networkComplete && result?.status === 'ready' ? formatDayIndex(result.lateFinish) : '—'}</td>
                    <td className={showCriticalPath ? 'pert-zero-slack' : ''}>
                      {networkComplete && result?.status === 'ready' ? `${formatDayIndex(result.totalSlack)} d` : '—'}
                    </td>
                    <td className="pert-links-cell">
                      <div className="pert-link-group"><b>Precedem</b>
                        {currentPreds.length ? currentPreds.map((id) => {
                          const parent = activitiesById.get(id);
                          const link = dependencies.find((edge) => edge.successorId === activity.id && edge.predecessorId === id);
                          return <span className="pert-link-chip" key={id}>
                            {parent ? `${parent.code} · ${parent.name}` : `Marco indisponível (${id.slice(0, 8)})`}
                            {editable && parent && canManageActivity(profile, parent.area_id) && link && (
                              <button type="button" aria-label={`Remover ${parent.code} como predecessora de ${activity.code}`}
                                disabled={savingDependencyId === activity.id} onClick={() => void removePredecessor(link, activity)}>×</button>
                            )}
                          </span>;
                        }) : <span className="pert-no-links">Nenhuma</span>}
                      </div>
                      {editable && permittedCandidates.length > 0 && (
                        <div className="pert-add-link">
                          <label>
                            <span className="pert-visually-hidden">Selecionar predecessora de {activity.code}</span>
                            <select value={selectedPredecessors[activity.id] ?? ''}
                              onChange={(event) => setSelectedPredecessors((current) => ({ ...current, [activity.id]: event.target.value }))}
                              disabled={savingDependencyId === activity.id}>
                              <option value="">Adicionar predecessora…</option>
                              {permittedCandidates.map((candidate) => (
                                <option key={candidate.id} value={candidate.id}>{candidate.code} · {candidate.name}</option>
                              ))}
                            </select>
                          </label>
                          <button type="button" className="pert-add-link-button" disabled={!selectedPredecessors[activity.id] || savingDependencyId === activity.id}
                            onClick={() => void addPredecessor(activity)}>Adicionar</button>
                        </div>
                      )}
                      {!editable && <small className="pert-readonly">Somente leitura</small>}
                      <div className="pert-link-group pert-successors"><b>Sucedem</b>
                        {currentSuccs.length ? currentSuccs.map((id) => {
                          const child = activitiesById.get(id);
                          return <span className="pert-link-chip" key={id}>{child ? `${child.code} · ${child.name}` : `Marco indisponível (${id.slice(0, 8)}`}</span>;
                        }) : <span className="pert-no-links">Nenhuma</span>}
                      </div>
                    </td>
                    <td className="pert-save-cell">
                      {editable ? <button type="button" className="pert-save-button" disabled={savingEstimateId === activity.id}
                        onClick={() => void saveEstimates(activity)}>{savingEstimateId === activity.id ? 'Salvando…' : 'Salvar estimativas'}</button>
                        : <span className="pert-readonly">Somente leitura</span>}
                      {result?.status === 'pending' && <small className="pert-pending-reason">{result.reason}</small>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
      <footer className="pert-footer-note">ES/EF podem ser calculados quando o marco e suas predecessoras têm estimativas válidas. LS/LF, folgas e caminho crítico só são apresentados quando a rede completa de marcos tem estimativas válidas; caso contrário, os resultados são parciais.</footer>
    </section>
  );
}
