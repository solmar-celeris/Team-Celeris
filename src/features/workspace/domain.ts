export type ActivityType = 'marco' | 'pontual' | 'rotina' | 'condicional';
export type ActivityFlowStatus = 'backlog' | 'ready' | 'in_progress' | 'blocked' | 'done';
export type ActivityPriority = 'low' | 'medium' | 'high' | 'urgent';
export type WeeklyStatus = 'completed' | 'in_progress' | 'pending' | 'not_applicable' | 'not_started';
export type GeneralStatus = WeeklyStatus | 'overdue';

export type Activity = {
  id: string;
  code: string;
  area_id: string;
  name: string;
  description: string;
  activity_type: ActivityType;
  frequency: string;
  execution_condition: string;
  responsible_name: string;
  responsible_user_id: string | null;
  start_date: string | null;
  due_date: string | null;
  expected_deliverable: string;
  notes: string;
  flow_status: ActivityFlowStatus;
  priority: ActivityPriority;
  effort_points: number | null;
  blocked_reason: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type ActivityAttachment = {
  id: string;
  activity_id: string;
  kind: 'file' | 'drive_link';
  storage_path: string | null;
  content_type: string | null;
  file_name: string;
  file_size: number | null;
  drive_url: string | null;
  created_at: string;
};

export type ActivityWipLimit = { area_id: string; flow_status: ActivityFlowStatus; limit_count: number | null };

export type Area = {
  id: string;
  name: string;
  code_prefix: string;
  nucleus_id: string;
  is_active: boolean;
};

export type Nucleus = { id: string; name: string };

export type MemberProfile = {
  user_id: string;
  full_name: string;
  avatar_path?: string | null;
  area_id: string | null;
  role: 'admin' | 'area_lead' | 'member' | 'reader';
  status: 'pending' | 'active' | 'suspended';
};

export type WeeklyUpdate = {
  id: string;
  activity_id: string;
  week_start: string;
  status: WeeklyStatus;
  justification: string;
  completed_work: string;
  pending_work: string;
  difficulties: string;
  dependency_notes: string;
  next_action: string;
  updated_by: string | null;
  updated_at: string;
};

export type WeeklyUpdateHistory = {
  id: number;
  weekly_update_id: string;
  activity_id: string;
  week_start: string;
  event_type: 'baseline' | 'insert' | 'update' | 'delete';
  previous_status: WeeklyStatus | null;
  status: WeeklyStatus;
  justification: string;
  completed_work: string;
  pending_work: string;
  difficulties: string;
  dependency_notes: string;
  next_action: string;
  actor_id: string | null;
  actor_name: string;
  occurred_at: string;
};

export type CycleWeek = { start: string; end: string; number: number; periodStart?: string };

export const weeklyStatusLabels: Record<WeeklyStatus, string> = {
  completed: 'Concluído',
  in_progress: 'Em andamento',
  pending: 'Pendente',
  not_applicable: 'Não se aplica',
  not_started: 'Não iniciado',
};

export const generalStatusLabels: Record<GeneralStatus, string> = {
  ...weeklyStatusLabels,
  overdue: 'Atrasado',
};

export const activityTypeLabels: Record<ActivityType, string> = {
  marco: 'Marco',
  pontual: 'Pontual',
  rotina: 'Rotina',
  condicional: 'Condicional',
};

export const activityFlowStages: ActivityFlowStatus[] = ['backlog', 'ready', 'in_progress', 'blocked', 'done'];
export const activityFlowLabels: Record<ActivityFlowStatus, string> = {
  backlog: 'Backlog', ready: 'A fazer', in_progress: 'Fazendo', blocked: 'Bloqueada', done: 'Feito',
};
export const activityPriorityLabels: Record<ActivityPriority, string> = {
  low: 'Baixa', medium: 'Média', high: 'Alta', urgent: 'Urgente',
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function parseIsoDate(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

export function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function addDays(value: string, days: number): string {
  return toIsoDate(new Date(parseIsoDate(value).getTime() + days * DAY_MS));
}

export function mondayOfDate(value: Date): string {
  const day = value.getUTCDay();
  const offset = (day + 6) % 7;
  return toIsoDate(new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate() - offset)));
}

export function currentMonday(): string {
  const now = new Date();
  return mondayOfDate(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

export function formatShortDate(value: string): string {
  return parseIsoDate(value).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  }).replace('.', '');
}

export function formatFullDate(value: string): string {
  return parseIsoDate(value).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatWeekRange(week: CycleWeek): string {
  const first = parseIsoDate(week.periodStart ?? week.start);
  const last = parseIsoDate(week.end);
  const monthYear = last.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  const firstDay = first.toLocaleDateString('pt-BR', { day: '2-digit', timeZone: 'UTC' });
  const lastDay = last.toLocaleDateString('pt-BR', { day: '2-digit', timeZone: 'UTC' });
  return `${firstDay}–${lastDay} ${monthYear}`;
}

export function buildCycleWeeks(start: string, count: number): CycleWeek[] {
  return Array.from({ length: count }, (_, index) => {
    const weekStart = addDays(start, index * 7);
    return { start: weekStart, end: addDays(weekStart, 6), number: index + 1 };
  });
}

export function buildCycleWeeksInRange(start: string, end: string): CycleWeek[] {
  if (!start || !end || end < start) return [];
  const firstWeekStart = mondayOfDate(parseIsoDate(start));
  const totalDays = Math.floor((parseIsoDate(end).getTime() - parseIsoDate(firstWeekStart).getTime()) / DAY_MS) + 1;
  const count = Math.ceil(totalDays / 7);

  return Array.from({ length: count }, (_, index) => {
    const weekStart = addDays(firstWeekStart, index * 7);
    const weekEnd = addDays(weekStart, 6);
    return {
      start: weekStart,
      end: weekEnd > end ? end : weekEnd,
      number: index + 1,
      periodStart: weekStart < start ? start : weekStart,
    };
  });
}

export function isActivityExpected(
  activity: Activity,
  week: CycleWeek,
  cycleStart: string,
  cycleEnd: string,
  history: WeeklyUpdate[],
): boolean {
  const activityStart = activity.start_date ?? cycleStart;
  const activityEnd = activity.due_date ?? cycleEnd;
  if (week.end < activityStart || week.start > activityEnd) return false;

  if (activity.activity_type === 'marco' || activity.activity_type === 'pontual') {
    return !history.some((update) => update.status === 'completed' && update.week_start < week.start);
  }

  if (activity.activity_type === 'condicional') return true;
  if (activity.frequency === 'Semanal') return true;

  if (activity.frequency === 'Quinzenal') {
    return (week.number - 1) % 2 === 0;
  }

  if (activity.frequency === 'Mensal') {
    const weekStartDate = parseIsoDate(week.start);
    const months = [
      [weekStartDate.getUTCFullYear(), weekStartDate.getUTCMonth()],
      weekStartDate.getUTCMonth() === 11
        ? [weekStartDate.getUTCFullYear() + 1, 0]
        : [weekStartDate.getUTCFullYear(), weekStartDate.getUTCMonth() + 1],
    ];
    return months.some(([year, month]) => {
      const firstOfMonth = new Date(Date.UTC(year, month, 1));
      const mondayOffset = (firstOfMonth.getUTCDay() + 6) % 7;
      const firstWeekMonday = toIsoDate(new Date(firstOfMonth.getTime() - mondayOffset * DAY_MS));
      return firstWeekMonday === week.start;
    });
  }

  return false;
}

export function getGeneralStatus(
  activity: Activity,
  history: WeeklyUpdate[],
  todayMonday = currentMonday(),
): GeneralStatus {
  const ordered = [...history].sort((a, b) => a.week_start.localeCompare(b.week_start));
  const completed = ordered.some((update) => update.status === 'completed');
  if ((activity.activity_type === 'marco' || activity.activity_type === 'pontual') && completed) {
    return 'completed';
  }

  if (
    (activity.activity_type === 'marco' || activity.activity_type === 'pontual') &&
    activity.due_date &&
    activity.due_date < toIsoDate(new Date())
  ) {
    return 'overdue';
  }

  if (
    (activity.activity_type === 'rotina' || activity.activity_type === 'condicional') &&
    ordered.some((update) => update.status === 'pending' && update.week_start < todayMonday)
  ) {
    return 'overdue';
  }

  const lastReported = ordered.filter((update) => update.status !== 'not_applicable').at(-1);
  return lastReported?.status ?? 'not_started';
}

export function canManageActivity(profile: MemberProfile, areaId: string): boolean {
  return profile.status === 'active' && (
    profile.role === 'admin' || (profile.role === 'area_lead' && profile.area_id === areaId)
  );
}

export function canUpdateActivityWeek(
  profile: MemberProfile,
  userId: string,
  activity: Activity,
): boolean {
  return profile.status === 'active' && (
    profile.role === 'admin' ||
    (profile.role === 'area_lead' && profile.area_id === activity.area_id) ||
    (profile.role === 'member' && activity.responsible_user_id === userId)
  );
}
