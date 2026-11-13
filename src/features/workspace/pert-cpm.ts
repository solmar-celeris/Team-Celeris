export type PertEstimate = {
  optimisticDays: number | null;
  mostLikelyDays: number | null;
  pessimisticDays: number | null;
};

export type PertNode = PertEstimate & { id: string };
export type PertDependency = { predecessorId: string; successorId: string };

export type PertSchedule = {
  status: 'ready' | 'pending';
  reason?: string;
  expectedDays?: number;
  earlyStart?: number;
  earlyFinish?: number;
  lateStart?: number;
  lateFinish?: number;
  totalSlack?: number;
  critical?: boolean;
};

const isPositiveInteger = (value: number | null): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

/** Calculate expected PERT durations and CPM times for a DAG, starting at day zero. */
export function calculatePertSchedule(
  nodes: PertNode[],
  dependencies: PertDependency[],
): Map<string, PertSchedule> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const results = new Map<string, PertSchedule>();
  const duration = new Map<string, number>();
  const predecessors = new Map<string, Set<string>>();
  const successors = new Map<string, Set<string>>();

  for (const node of nodes) {
    predecessors.set(node.id, new Set());
    successors.set(node.id, new Set());
    if (!isPositiveInteger(node.optimisticDays)
      || !isPositiveInteger(node.mostLikelyDays)
      || !isPositiveInteger(node.pessimisticDays)) {
      results.set(node.id, { status: 'pending', reason: 'Informe três estimativas inteiras positivas.' });
      continue;
    }
    if (node.optimisticDays > node.mostLikelyDays || node.mostLikelyDays > node.pessimisticDays) {
      results.set(node.id, { status: 'pending', reason: 'As estimativas devem respeitar otimista ≤ provável ≤ pessimista.' });
      continue;
    }
    duration.set(node.id, (node.optimisticDays + 4 * node.mostLikelyDays + node.pessimisticDays) / 6);
  }

  for (const edge of dependencies) {
    const before = byId.get(edge.predecessorId);
    const after = byId.get(edge.successorId);
    if (!before || !after) {
      if (after && results.get(after.id)?.status !== 'pending') {
        results.set(after.id, { status: 'pending', reason: 'Há uma predecessora ausente da lista de atividades.' });
      }
      continue;
    }
    if (edge.predecessorId === edge.successorId) {
      results.set(after.id, { status: 'pending', reason: 'Dependência inválida: um marco não pode preceder a si mesmo.' });
      continue;
    }
    predecessors.get(after.id)?.add(before.id);
    successors.get(before.id)?.add(after.id);
  }

  // A missing estimate (or missing predecessor) propagates to every dependent node.
  let propagated = true;
  while (propagated) {
    propagated = false;
    for (const node of nodes) {
      if (results.get(node.id)?.status === 'pending') continue;
      const pendingPredecessor = [...(predecessors.get(node.id) ?? [])]
        .find((id) => results.get(id)?.status === 'pending');
      if (pendingPredecessor) {
        results.set(node.id, {
          status: 'pending',
          reason: `Predecessora pendente: ${byId.get(pendingPredecessor)?.id ?? pendingPredecessor}.`,
        });
        propagated = true;
      }
    }
  }

  const calculable = new Set(nodes.filter((node) => !results.has(node.id)).map((node) => node.id));
  const inDegree = new Map<string, number>();
  for (const id of calculable) {
    inDegree.set(id, [...(predecessors.get(id) ?? [])].filter((pred) => calculable.has(pred)).length);
  }
  const ready = [...calculable].filter((id) => inDegree.get(id) === 0);
  const topological: string[] = [];
  while (ready.length) {
    const id = ready.shift()!;
    topological.push(id);
    for (const next of successors.get(id) ?? []) {
      if (!calculable.has(next)) continue;
      const nextDegree = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, nextDegree);
      if (nextDegree === 0) ready.push(next);
    }
  }

  if (topological.length !== calculable.size) {
    for (const id of calculable) {
      if (!topological.includes(id)) results.set(id, { status: 'pending', reason: 'Rede cíclica: revise as dependências.' });
    }
    return results;
  }

  const earlyStart = new Map<string, number>();
  const earlyFinish = new Map<string, number>();
  for (const id of topological) {
    const es = Math.max(0, ...[...(predecessors.get(id) ?? [])]
      .filter((pred) => calculable.has(pred))
      .map((pred) => earlyFinish.get(pred) ?? 0));
    earlyStart.set(id, es);
    earlyFinish.set(id, es + (duration.get(id) ?? 0));
  }

  const projectFinish = Math.max(0, ...[...calculable]
    .filter((id) => [...(successors.get(id) ?? [])].every((next) => !calculable.has(next)))
    .map((id) => earlyFinish.get(id) ?? 0));
  const lateFinish = new Map<string, number>();
  const lateStart = new Map<string, number>();
  for (const id of [...topological].reverse()) {
    const nextIds = [...(successors.get(id) ?? [])].filter((next) => calculable.has(next));
    const lf = nextIds.length
      ? Math.min(...nextIds.map((next) => lateStart.get(next) ?? projectFinish))
      : projectFinish;
    lateFinish.set(id, lf);
    lateStart.set(id, lf - (duration.get(id) ?? 0));
  }

  for (const id of calculable) {
    const slack = Math.max(0, (lateStart.get(id) ?? 0) - (earlyStart.get(id) ?? 0));
    results.set(id, {
      status: 'ready',
      expectedDays: duration.get(id),
      earlyStart: earlyStart.get(id),
      earlyFinish: earlyFinish.get(id),
      lateStart: lateStart.get(id),
      lateFinish: lateFinish.get(id),
      totalSlack: slack,
      critical: slack < 1e-9,
    });
  }
  return results;
}

/** Small deterministic sample useful as a smoke test in a JS/TS runner. */
export function pertCpmExample(): { schedule: Map<string, PertSchedule>; passed: boolean } {
  const schedule = calculatePertSchedule([
    { id: 'A', optimisticDays: 2, mostLikelyDays: 4, pessimisticDays: 6 }, // duration 4
    { id: 'B', optimisticDays: 1, mostLikelyDays: 2, pessimisticDays: 3 }, // duration 2
    { id: 'C', optimisticDays: 3, mostLikelyDays: 3, pessimisticDays: 3 }, // duration 3
    { id: 'D', optimisticDays: 1, mostLikelyDays: 1, pessimisticDays: 1 }, // duration 1
  ], [
    { predecessorId: 'A', successorId: 'B' },
    { predecessorId: 'A', successorId: 'C' },
    { predecessorId: 'B', successorId: 'D' },
    { predecessorId: 'C', successorId: 'D' },
  ]);
  const a = schedule.get('A');
  const b = schedule.get('B');
  const c = schedule.get('C');
  const d = schedule.get('D');
  return {
    schedule,
    passed: a?.status === 'ready' && a.expectedDays === 4 && a.earlyStart === 0 && a.earlyFinish === 4
      && b?.status === 'ready' && b.totalSlack === 1 && b.critical === false
      && c?.status === 'ready' && c.totalSlack === 0 && c.critical === true
      && d?.status === 'ready' && d.earlyStart === 7 && d.earlyFinish === 8,
  };
}
