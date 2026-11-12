import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type DragEvent, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ArrowLeftRight, BookOpen, CalendarDays, Check, ClipboardList, Clock3, Filter, Folder, GripVertical, House, Megaphone, MessageCircle, Newspaper, Trash2, X, Paperclip, ExternalLink, Video, type LucideProps } from 'lucide-react';
import {
  activityTypeLabels,
  activityFlowLabels,
  activityFlowStages,
  activityPriorityLabels,
  addDays,
  buildCycleWeeksInRange,
  canManageActivity,
  canUpdateActivityWeek,
  formatFullDate,
  formatShortDate,
  formatWeekRange,
  generalStatusLabels,
  getGeneralStatus,
  isActivityExpected,
  mondayOfDate,
  type Activity,
  type ActivityAttachment,
  type ActivityFlowStatus,
  type ActivityPriority,
  type ActivityWipLimit,
  type ActivityType,
  type Area,
  type GeneralStatus,
  type MemberProfile,
  type WeeklyStatus,
  type WeeklyUpdate,
  weeklyStatusLabels,
} from './domain';
import ProfileMenu from '../profile/ProfileMenu';
import ChannelSwitcher, { type WorkspaceChannel } from './ChannelSwitcher';
import SharedContentWorkspace from './SharedContentWorkspace';
import TeamChat from './TeamChat';
import TeamCalendar from './TeamCalendar';
import ManualFunctions from './ManualFunctions';
import AvailabilityWorkspace from './AvailabilityWorkspace';
import MeetingsWorkspace from './MeetingsWorkspace';
import WeeklyActivityCard, { type WeeklyReportDraft } from './WeeklyActivityCard';
import { flushPendingWorkspacePushEvents, notifyActivityChange, notifyWorkspacePush } from '../../lib/notifications';
import './workspace.css';

type TeamWorkspaceProps = {
  client: SupabaseClient;
  userId: string;
  profile: MemberProfile;
  theme: 'light' | 'dark';
  onThemeChange: (theme: 'light' | 'dark') => void;
  onRefreshProfile: () => void | Promise<void>;
  onLogout: () => void;
};

type TeamSettings = { cycle_start: string; cycle_end: string | null };
type ActivityMember = Pick<MemberProfile, 'user_id' | 'full_name' | 'avatar_path' | 'area_id' | 'role' | 'status'>;
type ActivityMutation = {
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
  priority: ActivityPriority;
  effort_points: number | null;
};
type FilterState = {
  search: string;
  responsible: string;
  area: string;
  type: string;
  status: string;
  from: string;
  to: string;
};
type ActivityFormState = {
  area_id: string;
  name: string;
  description: string;
  activity_type: ActivityType;
  frequency: string;
  execution_condition: string;
  responsible_name: string;
  responsible_user_id: string;
  start_date: string;
  due_date: string;
  expected_deliverable: string;
  notes: string;
  priority: ActivityPriority;
  effort_points: string;
};
type AttachmentSubmission = { files: File[]; driveName: string; driveUrl: string };
type WeeklyDraft = WeeklyReportDraft;
type WorkspaceTab = 'home' | 'activities' | 'agenda' | 'conversations' | 'membersChat' | 'files' | 'manual';
type AgendaSubtab = 'calendar' | 'availability' | 'meetings';
type ConversationsSubtab = 'announcements';
type WorkspaceTabIcon = ComponentType<LucideProps>;
type PushDeepLink =
  | { type: 'chat'; messageId: string; conversationId: string | null; conversationType: 'team' | 'group' | 'direct' }
  | { type: 'announcement' | 'activity'; itemId: string }
  | { type: 'calendar'; itemId: string; date: string | null };
type WeekCalendarEvent = {
  id: string;
  title: string;
  event_kind: string;
  event_scope: 'internal' | 'external';
  event_date: string;
  start_time: string | null;
  location: string;
};
const workspaceTabs: { id: WorkspaceTab; label: string; icon: WorkspaceTabIcon }[] = [
  { id: 'home', label: 'Início', icon: House },
  { id: 'activities', label: 'Atividades', icon: ClipboardList },
  { id: 'agenda', label: 'Agenda', icon: CalendarDays },
  { id: 'conversations', label: 'Conversas', icon: MessageCircle },
  { id: 'files', label: 'Arquivos', icon: Folder },
  { id: 'manual', label: 'Manual de funções', icon: BookOpen },
];

const defaultFilters: FilterState = {
  search: '', responsible: '', area: '', type: '', status: '', from: '', to: '',
};

function parsePushDeepLink(): PushDeepLink | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const isUuid = (value: string | null): value is string => Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
  const type = params.get('push');
  if (type === 'chat') {
    const messageId = params.get('message_id');
    const rawConversationId = params.get('conversation_id');
    const conversationType = params.get('conversation_type');
    if (!isUuid(messageId) || (rawConversationId && !isUuid(rawConversationId))) return null;
    if (conversationType !== 'team' && conversationType !== 'group' && conversationType !== 'direct') return null;
    if (conversationType !== 'team' && !rawConversationId) return null;
    return { type, messageId, conversationId: rawConversationId, conversationType };
  }
  if (type === 'announcement' || type === 'activity') {
    const itemId = params.get('item_id');
    return isUuid(itemId) ? { type, itemId } : null;
  }
  if (type === 'calendar') {
    const itemId = params.get('item_id');
    const date = params.get('date');
    if (!isUuid(itemId) || (date && !/^\d{4}-\d{2}-\d{2}$/.test(date))) return null;
    return { type, itemId, date };
  }
  return null;
}

function tabForPush(target: PushDeepLink | null): WorkspaceTab {
  if (!target) return 'home';
  if (target.type === 'chat') return 'home';
  if (target.type === 'announcement') return 'conversations';
  if (target.type === 'activity') return 'activities';
  return 'agenda';
}

function ClockWithArrowsIcon({ size = 20, className }: LucideProps) {
  const dimension = typeof size === 'number' ? size : 20;
  return (
    <span className={`workspace-clock-arrows${className ? ` ${className}` : ''}`} style={{ width: size, height: size }} aria-hidden="true">
      <Clock3 className="workspace-clock-arrows-face" size={dimension} aria-hidden="true" />
      <ArrowLeftRight className="workspace-clock-arrows-directions" size={Math.max(10, Math.round(dimension * 0.62))} aria-hidden="true" />
    </span>
  );
}

const defaultCycleStart = '2026-11-09';
const defaultCycleEnd = '2027-12-22';
const defaultCycleWeeks = 60;

const kanbanColumnDefinitions: { key: string; label: string; statuses: ActivityFlowStatus[] }[] = [
  { key: 'backlog', label: 'Backlog', statuses: ['backlog'] },
  { key: 'ready', label: 'A fazer', statuses: ['ready'] },
  { key: 'in_progress', label: 'Fazendo', statuses: ['in_progress', 'blocked'] },
  { key: 'done', label: 'Feito', statuses: ['done'] },
];

const activityFlowTransitions: Record<ActivityFlowStatus, ActivityFlowStatus[]> = {
  backlog: ['ready', 'in_progress', 'blocked', 'done'],
  ready: ['backlog', 'in_progress', 'blocked', 'done'],
  in_progress: ['backlog', 'ready', 'blocked', 'done'],
  blocked: ['backlog', 'ready', 'in_progress', 'done'],
  done: ['backlog', 'ready', 'in_progress', 'blocked'],
};

function kanbanColumnForStatus(status: ActivityFlowStatus): string {
  return kanbanColumnDefinitions.find((column) => column.statuses.includes(status))?.key ?? 'backlog';
}

function errorText(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'Ocorreu um erro inesperado. Confira sua conexão e tente novamente.';
}

type CycleUpdateResult = { updates: WeeklyUpdate[]; detailsMigrationAvailable: boolean };

async function fetchPagedWeeklyRows(client: SupabaseClient, start: string, end: string, columns: string): Promise<Record<string, unknown>[]> {
  const allUpdates: Record<string, unknown>[] = [];
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const { data, error } = await client
      .from('weekly_updates')
      .select(columns)
      .gte('week_start', start)
      .lte('week_start', end)
      .order('week_start', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as unknown as Record<string, unknown>[];
    allUpdates.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }

  return allUpdates;
}

function isMissingWeeklyDetailsColumn(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; message?: unknown };
  const code = typeof candidate.code === 'string' ? candidate.code : '';
  const message = typeof candidate.message === 'string' ? candidate.message : '';
  return ['42703', 'PGRST204'].includes(code) || /column .* does not exist|could not find .*column|schema cache/i.test(message);
}

async function fetchCycleUpdates(client: SupabaseClient, start: string, end: string): Promise<CycleUpdateResult> {
  const currentColumns = 'id,activity_id,week_start,status,justification,completed_work,pending_work,difficulties,dependency_notes,next_action,updated_by,updated_at';
  try {
    const rows = await fetchPagedWeeklyRows(client, start, end, currentColumns);
    return { updates: rows as unknown as WeeklyUpdate[], detailsMigrationAvailable: true };
  } catch (error) {
    if (!isMissingWeeklyDetailsColumn(error)) throw error;
    const legacyRows = await fetchPagedWeeklyRows(client, start, end, 'id,activity_id,week_start,status,justification,updated_by,updated_at');
    const updates = legacyRows.map((row) => ({
      ...row,
      completed_work: '',
      pending_work: '',
      difficulties: '',
      dependency_notes: '',
      next_action: '',
    })) as unknown as WeeklyUpdate[];
    return { updates, detailsMigrationAvailable: false };
  }
}

function makeFormState(activity: Activity | null, firstAreaId: string): ActivityFormState {
  if (!activity) {
    return {
      area_id: firstAreaId,
      name: '',
      description: '',
      activity_type: 'rotina',
      frequency: 'Semanal',
      execution_condition: '',
      responsible_name: 'A definir',
      responsible_user_id: '',
      start_date: '',
      due_date: '',
      expected_deliverable: '',
      notes: '',
      priority: 'medium',
      effort_points: '',
    };
  }

  return {
    area_id: activity.area_id,
    name: activity.name,
    description: activity.description,
    activity_type: activity.activity_type,
    frequency: activity.frequency,
    execution_condition: activity.execution_condition,
    responsible_name: activity.responsible_name,
    responsible_user_id: activity.responsible_user_id ?? '',
    start_date: activity.start_date ?? '',
    due_date: activity.due_date ?? '',
    expected_deliverable: activity.expected_deliverable,
    notes: activity.notes,
    priority: activity.priority,
    effort_points: activity.effort_points === null ? '' : String(activity.effort_points),
  };
}

function buildMutation(form: ActivityFormState, members: ActivityMember[]): ActivityMutation {
  const linkedMember = members.find((member) => member.user_id === form.responsible_user_id);
  return {
    area_id: form.area_id,
    name: form.name.trim(),
    description: form.description.trim(),
    activity_type: form.activity_type,
    frequency: form.frequency.trim(),
    execution_condition: form.execution_condition.trim(),
    responsible_name: linkedMember?.full_name || form.responsible_name.trim() || 'A definir',
    responsible_user_id: form.responsible_user_id || null,
    start_date: form.start_date || null,
    due_date: form.due_date || null,
    expected_deliverable: form.expected_deliverable.trim(),
    notes: form.notes.trim(),
    priority: form.priority,
    effort_points: form.effort_points === '' ? null : Number(form.effort_points),
  };
}

function validateActivity(form: ActivityFormState): string | null {
  if (!form.area_id) return 'Selecione uma área.';
  if (!form.name.trim()) return 'Informe o nome da atividade.';
  if (form.activity_type === 'marco' && (!form.start_date || !form.due_date)) {
    return 'Para um Marco, preencha a data inicial e o prazo.';
  }
  if (form.activity_type === 'pontual' && !form.due_date) {
    return 'Para uma atividade Pontual, preencha o prazo.';
  }
  if (form.activity_type === 'rotina' && !['Semanal', 'Quinzenal', 'Mensal'].includes(form.frequency)) {
    return 'Escolha uma frequência válida para a Rotina.';
  }
  if (form.activity_type === 'condicional' && !form.execution_condition.trim()) {
    return 'Informe a condição para executar esta atividade.';
  }
  if (form.start_date && form.due_date && form.start_date > form.due_date) {
    return 'A data inicial não pode ser posterior ao prazo.';
  }
  return null;
}

const ACTIVITY_FILE_TYPES: Record<string, { mime: string; extension: string }> = {
  'image/jpeg': { mime: 'image/jpeg', extension: 'jpg' }, 'image/png': { mime: 'image/png', extension: 'png' },
  'image/gif': { mime: 'image/gif', extension: 'gif' }, 'image/webp': { mime: 'image/webp', extension: 'webp' },
  'image/heic': { mime: 'image/heic', extension: 'heic' }, 'image/heif': { mime: 'image/heif', extension: 'heif' },
  'application/pdf': { mime: 'application/pdf', extension: 'pdf' }, 'text/plain': { mime: 'text/plain', extension: 'txt' },
  'text/csv': { mime: 'text/csv', extension: 'csv' }, 'application/msword': { mime: 'application/msword', extension: 'doc' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', extension: 'docx' },
  'application/vnd.ms-excel': { mime: 'application/vnd.ms-excel', extension: 'xls' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: 'xlsx' },
  'application/vnd.ms-powerpoint': { mime: 'application/vnd.ms-powerpoint', extension: 'ppt' },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', extension: 'pptx' },
};
function safeDriveUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password || !['drive.google.com', 'docs.google.com'].includes(url.hostname.toLowerCase())) return null;
    return url.href;
  } catch { return null; }
}

export default function TeamWorkspace({ client, userId, profile, theme, onThemeChange, onLogout }: TeamWorkspaceProps) {
  const [pushTarget] = useState<PushDeepLink | null>(() => parsePushDeepLink());
  const [tab, setTab] = useState<WorkspaceTab>(() => tabForPush(pushTarget));
  const [chatOpen, setChatOpen] = useState(() => pushTarget?.type === 'chat');
  const [activeChannel, setActiveChannel] = useState<WorkspaceChannel | null>(null);
  const initialChannelSelection = useRef(true);
  const [chatTargetUserId, setChatTargetUserId] = useState<string | null>(null);
  const [chatReturnTab] = useState<WorkspaceTab>('home');
  const [chatCreateGroupRequest, setChatCreateGroupRequest] = useState(false);
  const [agendaSubtab, setAgendaSubtab] = useState<AgendaSubtab>('calendar');
  const [conversationsSubtab, setConversationsSubtab] = useState<ConversationsSubtab>('announcements');
  const [homeFiltersOpen, setHomeFiltersOpen] = useState(false);
  const [jitsiRoomActive, setJitsiRoomActive] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activityAttachments, setActivityAttachments] = useState<ActivityAttachment[]>([]);
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});
  const [wipLimits, setWipLimits] = useState<ActivityWipLimit[]>([]);
  const [savingFlowId, setSavingFlowId] = useState<string | null>(null);
  const [draggedActivityId, setDraggedActivityId] = useState<string | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);
  const [flowTargetById, setFlowTargetById] = useState<Record<string, ActivityFlowStatus | ''>>({});
  const [blockedReasonById, setBlockedReasonById] = useState<Record<string, string>>({});
  const [wipAreaEditor, setWipAreaEditor] = useState('');
  const [wipDrafts, setWipDrafts] = useState<Record<string, string>>({});
  const [savingWipKey, setSavingWipKey] = useState<string | null>(null);
  const [driveDraftById, setDriveDraftById] = useState<Record<string, { name: string; url: string }>>({});
  const [weekCalendarEvents, setWeekCalendarEvents] = useState<WeekCalendarEvent[]>([]);
  const [weekEventsLoading, setWeekEventsLoading] = useState(false);
  const [weekEventsError, setWeekEventsError] = useState(false);
  const [calendarFocusDate, setCalendarFocusDate] = useState<string | undefined>(() => pushTarget?.type === 'calendar' ? pushTarget.date ?? undefined : undefined);
  const [areas, setAreas] = useState<Area[]>([]);
  const [members, setMembers] = useState<ActivityMember[]>([]);
  const [displayName, setDisplayName] = useState(profile.full_name || 'Integrante');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [updates, setUpdates] = useState<WeeklyUpdate[]>([]);
  const [cycleStart, setCycleStart] = useState(defaultCycleStart);
  const [cycleEndDate, setCycleEndDate] = useState(defaultCycleEnd);
  const [periodMigrationAvailable, setPeriodMigrationAvailable] = useState(true);
  const [weeklyDetailsMigrationAvailable, setWeeklyDetailsMigrationAvailable] = useState(true);
  const [selectedWeekStart, setSelectedWeekStart] = useState(mondayOfDate(new Date(`${defaultCycleStart}T00:00:00.000Z`)));
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingActivity, setSavingActivity] = useState(false);
  const [removingActivityId, setRemovingActivityId] = useState<string | null>(null);
  const [confirmRemoveActivityId, setConfirmRemoveActivityId] = useState<string | null>(null);
  const [savingWeeklyId, setSavingWeeklyId] = useState<string | null>(null);
  const [dialogActivity, setDialogActivity] = useState<Activity | null | false>(false);
  const [periodDialogOpen, setPeriodDialogOpen] = useState(false);
  const [savingPeriod, setSavingPeriod] = useState(false);
  const [periodError, setPeriodError] = useState('');
  const [drafts, setDrafts] = useState<Record<string, WeeklyDraft>>({});
  const [draftWeekStart, setDraftWeekStart] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [feedback, setFeedback] = useState('');
  const [dialogError, setDialogError] = useState('');

  const handleChannelChange = useCallback((channel: WorkspaceChannel) => {
    const initialChannelLoad = initialChannelSelection.current;
    initialChannelSelection.current = false;
    setActiveChannel(channel);
    setTab(initialChannelLoad && pushTarget?.type === 'announcement' ? 'conversations' : channel.slug === 'geral' ? 'home' : 'activities');
    if (initialChannelLoad && pushTarget?.type === 'chat') setChatOpen(true);
    setConversationsSubtab('announcements');
    setFilters(defaultFilters);
  }, [pushTarget]);
  const handleInitialDirectHandled = useCallback(() => setChatTargetUserId(null), []);
  const handleCreateGroupHandled = useCallback(() => setChatCreateGroupRequest(false), []);
  const manualAreaName = activeChannel?.slug === 'mecanica-naval' ? 'Mecânica Naval'
    : activeChannel?.slug === 'eletrica' ? 'Elétrica'
      : activeChannel?.slug === 'eletronica' ? 'Eletrônica'
        : activeChannel?.slug === 'gestao-de-pessoas' ? 'Gestão de Pessoas'
          : activeChannel?.slug === 'marketing' ? 'Marketing'
            : activeChannel?.slug === 'administrativo-financeiro' ? 'Administrativo-Financeiro'
              : activeChannel?.slug === 'ti' ? 'Tecnologia da Informação' : '';

  async function saveProjectPeriod(start: string, end: string) {
    if (profile.role !== 'admin') return;
    if (start > end) {
      setPeriodError('A data final não pode ser anterior à data inicial.');
      return;
    }
    if (!periodMigrationAvailable) {
      setPeriodError('A migration 20261104120000_workspace_project_period.sql ainda não foi aplicada no Supabase.');
      return;
    }

    setSavingPeriod(true);
    setPeriodError('');
    try {
      const { error } = await client.from('team_settings').update({
        cycle_start: start,
        cycle_end: end,
        updated_by: userId,
      }).eq('id', 1);
      if (error) throw error;
      setPeriodDialogOpen(false);
      setFeedback('Período do projeto atualizado.');
      await loadData(true);
    } catch (error) {
      setPeriodError(`Não foi possível salvar o período. Confira a migration e sua permissão: ${errorText(error)}`);
    } finally {
      setSavingPeriod(false);
    }
  }

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!pushTarget) return;
    const url = new URL(window.location.href);
    for (const key of ['push', 'item_id', 'message_id', 'conversation_id', 'conversation_type', 'date']) url.searchParams.delete(key);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, [pushTarget]);

  const loadData = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setErrorMessage('');

    try {
      const { data: settingsData, error: settingsError } = await client
        .from('team_settings')
        .select('cycle_start,cycle_end')
        .eq('id', 1)
        .maybeSingle();
      let nextCycleStart = defaultCycleStart;
      let nextCycleEnd = defaultCycleEnd;
      if (settingsError) {
        const missingPeriodColumn = settingsError.code === '42703'
          || settingsError.code === 'PGRST204'
          || settingsError.message.toLocaleLowerCase('pt-BR').includes('cycle_end');
        if (!missingPeriodColumn) throw settingsError;
        setPeriodMigrationAvailable(false);
        const { data: legacyData, error: legacyError } = await client
          .from('team_settings')
          .select('cycle_start,cycle_weeks')
          .eq('id', 1)
          .maybeSingle();
        if (legacyError) throw legacyError;
        const legacy = legacyData as { cycle_start: string; cycle_weeks: number } | null;
        nextCycleStart = legacy?.cycle_start ?? defaultCycleStart;
        nextCycleEnd = nextCycleStart === defaultCycleStart
          ? defaultCycleEnd
          : addDays(nextCycleStart, Math.max(1, Math.min(60, legacy?.cycle_weeks ?? defaultCycleWeeks)) * 7 - 1);
      } else {
        setPeriodMigrationAvailable(true);
        const settings = settingsData as TeamSettings | null;
        nextCycleStart = settings?.cycle_start ?? defaultCycleStart;
        nextCycleEnd = settings?.cycle_end ?? (nextCycleStart === defaultCycleStart
          ? defaultCycleEnd
          : addDays(nextCycleStart, defaultCycleWeeks * 7 - 1));
      }
      const nextWeeks = buildCycleWeeksInRange(nextCycleStart, nextCycleEnd);
      if (nextWeeks.length === 0) throw new Error('O período do projeto no Supabase tem uma data final anterior à inicial.');

      const [activityResult, areaResult, profileResult, attachmentResult, wipResult] = await Promise.all([
        client.from('activities')
          .select('id,code,area_id,name,description,activity_type,frequency,execution_condition,responsible_name,responsible_user_id,start_date,due_date,expected_deliverable,notes,flow_status,priority,effort_points,blocked_reason,created_at,updated_at,archived_at')
          .is('archived_at', null)
          .order('code', { ascending: true }),
        client.from('areas')
          .select('id,name,code_prefix,nucleus_id,is_active')
          .order('name', { ascending: true }),
        client.from('profiles')
          .select('user_id,full_name,avatar_path,area_id,role,status')
          .eq('status', 'active')
          .order('full_name', { ascending: true }),
        client.from('activity_attachments').select('id,activity_id,kind,storage_path,content_type,file_name,file_size,drive_url,created_at').order('created_at', { ascending: true }),
        client.from('activity_flow_wip_limits').select('area_id,flow_status,limit_count'),
      ]);
      const failure = activityResult.error ?? areaResult.error ?? profileResult.error ?? attachmentResult.error ?? wipResult.error;
      if (failure) throw failure;

      const activitiesFromDatabase = (activityResult.data ?? []) as unknown as Activity[];
      const nextAreas = (areaResult.data ?? []) as unknown as Area[];
      const nextMembers = (profileResult.data ?? []) as unknown as ActivityMember[];
      const namesByUserId = new Map(nextMembers.map((member) => [member.user_id, member.full_name]));
      const nextActivities = activitiesFromDatabase.map((activity) => {
        const currentResponsibleName = activity.responsible_user_id
          ? namesByUserId.get(activity.responsible_user_id)
          : undefined;
        return currentResponsibleName
          ? { ...activity, responsible_name: currentResponsibleName }
          : activity;
      });
      const updateResult = await fetchCycleUpdates(client, mondayOfDate(new Date(`${nextCycleStart}T00:00:00.000Z`)), nextCycleEnd);

      setCycleStart(nextCycleStart);
      setCycleEndDate(nextCycleEnd);
      setSelectedWeekStart((current) => {
        const validStarts = new Set(nextWeeks.map((week) => week.start));
        return validStarts.has(current) ? current : (nextWeeks[0]?.start ?? nextCycleStart);
      });
      setActivities(nextActivities);
      setActivityAttachments((attachmentResult.data ?? []) as ActivityAttachment[]);
      setWipLimits((wipResult.data ?? []) as ActivityWipLimit[]);
      setAreas(nextAreas);
      setWipAreaEditor((current) => (current && nextAreas.some((area) => area.id === current && area.is_active)) ? current : (nextAreas.find((area) => area.is_active)?.id || ''));
      setMembers(nextMembers);
      setUpdates(updateResult.updates);
      setWeeklyDetailsMigrationAvailable(updateResult.detailsMigrationAvailable);
    } catch (error) {
      setErrorMessage(`Não foi possível carregar os dados do Supabase. ${errorText(error)}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [client]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!wipAreaEditor) return;
    setWipDrafts(Object.fromEntries(activityFlowStages.map((stage) => {
      const limit = wipLimits.find((item) => item.area_id === wipAreaEditor && item.flow_status === stage)?.limit_count;
      return [stage, limit == null ? '' : String(limit)];
    })));
  }, [wipAreaEditor, wipLimits]);

  useEffect(() => {
    const local = activityAttachments.filter((attachment) => attachment.kind === 'file' && attachment.storage_path);
    if (!local.length) { setAttachmentUrls({}); return; }
    let active = true;
    void Promise.all(local.map(async (attachment) => {
      const { data } = await client.storage.from('activity-attachments').createSignedUrl(attachment.storage_path!, 3600);
      return [attachment.id, data?.signedUrl ?? ''] as const;
    })).then((entries) => { if (active) setAttachmentUrls(Object.fromEntries(entries.filter(([, url]) => url))); });
    return () => { active = false; };
  }, [activityAttachments, client]);

  useEffect(() => {
    if (profile.status === 'active') void flushPendingWorkspacePushEvents(client);
  }, [client, profile.status, userId]);

  const handleProfileUpdated = useCallback(({ fullName, photoUrl: nextPhotoUrl }: { fullName: string; photoUrl: string | null }) => {
    setDisplayName(fullName);
    setAvatarUrl(nextPhotoUrl);
    setMembers((current) => current.map((member) => (
      member.user_id === userId ? { ...member, full_name: fullName } : member
    )));
    setActivities((current) => current.map((activity) => (
      activity.responsible_user_id === userId
        ? { ...activity, responsible_name: fullName }
        : activity
    )));
  }, [userId]);

  const weeks = useMemo(() => buildCycleWeeksInRange(cycleStart, cycleEndDate), [cycleEndDate, cycleStart]);
  const cycleWeeksCount = weeks.length;
  const selectedWeek = weeks.find((week) => week.start === selectedWeekStart) ?? weeks[0];
  const cycleEnd = cycleEndDate;

  useEffect(() => {
    if (!selectedWeek) {
      setWeekCalendarEvents([]);
      setWeekEventsLoading(false);
      return;
    }
    let active = true;
    const loadWeekEvents = () => {
      void client.from('calendar_events')
        .select('id,title,event_kind,event_scope,event_date,start_time,location')
        .gte('event_date', selectedWeek.start)
        .lte('event_date', addDays(selectedWeek.start, 6))
        .order('event_date', { ascending: true })
        .order('start_time', { ascending: true })
        .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setWeekCalendarEvents([]);
          setWeekEventsError(true);
        } else {
          setWeekCalendarEvents((data ?? []) as WeekCalendarEvent[]);
        }
        setWeekEventsLoading(false);
      });
    };
    setWeekEventsLoading(true);
    setWeekEventsError(false);
    loadWeekEvents();
    const channel = client.channel(`workspace-week-calendar-${selectedWeek.start}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' }, loadWeekEvents)
      .subscribe();
    return () => { active = false; void client.removeChannel(channel); };
  }, [client, selectedWeek?.start]);

  const areasById = useMemo(() => new Map(areas.map((area) => [area.id, area])), [areas]);
  const activeAreas = useMemo(() => areas.filter((area) => area.is_active), [areas]);
  const isAreaActive = (areaId: string) => areasById.get(areaId)?.is_active === true;
  const scopedActivities = useMemo(() => {
    if (!activeChannel || activeChannel.slug === 'geral') return activities;
    if (!activeChannel.area_id) return [];
    return activities.filter((activity) => activity.area_id === activeChannel.area_id);
  }, [activeChannel, activities]);
  const mayUpdateActivity = (activity: Activity) => isAreaActive(activity.area_id) && canUpdateActivityWeek(profile, userId, activity);
  const updatesByActivity = useMemo(() => {
    const map = new Map<string, WeeklyUpdate[]>();
    for (const update of updates) {
      const history = map.get(update.activity_id) ?? [];
      history.push(update);
      map.set(update.activity_id, history);
    }
    return map;
  }, [updates]);
  const updatesForWeek = useMemo(() => {
    const map = new Map<string, WeeklyUpdate>();
    for (const update of updates) {
      if (update.week_start === selectedWeek?.start) map.set(update.activity_id, update);
    }
    return map;
  }, [selectedWeek?.start, updates]);

  useEffect(() => {
    if (draftWeekStart === selectedWeek?.start) {
      setDrafts((current) => Object.fromEntries(activities.map((activity) => {
        const update = updatesForWeek.get(activity.id);
        return [activity.id, current[activity.id] ?? {
          status: update?.status ?? 'not_started',
          justification: update?.justification ?? '',
          completed_work: update?.completed_work ?? '',
          pending_work: update?.pending_work ?? '',
          difficulties: update?.difficulties ?? '',
          dependency_notes: update?.dependency_notes ?? '',
          next_action: update?.next_action ?? '',
        }];
      })));
      return;
    }
    const nextDrafts: Record<string, WeeklyDraft> = {};
    for (const activity of activities) {
      const update = updatesForWeek.get(activity.id);
      nextDrafts[activity.id] = {
        status: update?.status ?? 'not_started',
        justification: update?.justification ?? '',
        completed_work: update?.completed_work ?? '',
        pending_work: update?.pending_work ?? '',
        difficulties: update?.difficulties ?? '',
        dependency_notes: update?.dependency_notes ?? '',
        next_action: update?.next_action ?? '',
      };
    }
    setDrafts(nextDrafts);
    setDraftWeekStart(selectedWeek?.start ?? '');
  }, [activities, draftWeekStart, selectedWeek?.start, updatesForWeek]);

  const generalStatusById = useMemo(() => {
    const result = new Map<string, GeneralStatus>();
    for (const activity of scopedActivities) {
      result.set(activity.id, getGeneralStatus(activity, updatesByActivity.get(activity.id) ?? []));
    }
    return result;
  }, [scopedActivities, updatesByActivity]);

  const expectedActivities = useMemo(() => {
    if (!selectedWeek) return [];
    return scopedActivities.filter((activity) => isActivityExpected(
      activity,
      selectedWeek,
      cycleStart,
      cycleEnd,
      updatesByActivity.get(activity.id) ?? [],
    ));
  }, [scopedActivities, cycleEnd, cycleStart, selectedWeek, updatesByActivity]);

  const responsibleNames = useMemo(() => [...new Set(scopedActivities.map((activity) => activity.responsible_name.trim() || 'A definir'))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [scopedActivities]);

  const visibleActivities = useMemo(() => {
    const source = tab === 'home' ? expectedActivities : scopedActivities;
    const search = filters.search.trim().toLocaleLowerCase('pt-BR');
    return source.filter((activity) => {
      const status = tab === 'home'
        ? (updatesForWeek.get(activity.id)?.status ?? 'not_started')
        : generalStatusById.get(activity.id) ?? 'not_started';
      const haystack = [activity.code, activity.name, activity.description, activity.responsible_name, activity.expected_deliverable]
        .join(' ').toLocaleLowerCase('pt-BR');
      if (search && !haystack.includes(search)) return false;
      if (filters.responsible && activity.responsible_name !== filters.responsible) return false;
      if (filters.area && activity.area_id !== filters.area) return false;
      if (filters.type && activity.activity_type !== filters.type) return false;
      const selectedStatus = tab === 'home' && filters.status === 'overdue' ? '' : filters.status;
      if (selectedStatus && status !== selectedStatus) return false;
      const activityStart = activity.start_date ?? '0001-01-01';
      const activityEnd = activity.due_date ?? '9999-12-31';
      if (filters.from && activityEnd < filters.from) return false;
      if (filters.to && activityStart > filters.to) return false;
      return true;
    });
  }, [expectedActivities, filters, generalStatusById, scopedActivities, tab, updatesForWeek]);

  const weeklyIndicators = useMemo(() => ({
    planned: visibleActivities.length,
    completed: visibleActivities.filter((activity) => updatesForWeek.get(activity.id)?.status === 'completed').length,
    inProgress: visibleActivities.filter((activity) => updatesForWeek.get(activity.id)?.status === 'in_progress').length,
    overdue: visibleActivities.filter((activity) => generalStatusById.get(activity.id) === 'overdue').length,
    blocked: visibleActivities.filter((activity) => activity.flow_status === 'blocked').length,
  }), [generalStatusById, updatesForWeek, visibleActivities]);

  useEffect(() => {
    if (tab !== 'activities' || loading || pushTarget?.type !== 'activity') return;
    const card = document.getElementById(`activity-card-${pushTarget.itemId}`);
    card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [loading, pushTarget, tab, visibleActivities]);

  const boardColumns = kanbanColumnDefinitions.map((column) => {
    const boardActivities = activities.filter((activity) => isAreaActive(activity.area_id) && (!filters.area || activity.area_id === filters.area));
    const inColumn = (activity: Activity) => column.statuses.includes(activity.flow_status);
    const cards = visibleActivities.filter((activity) => isAreaActive(activity.area_id) && inColumn(activity));
    const areaIds = [...new Set(boardActivities.map((activity) => activity.area_id))];
    const wipCount = boardActivities.filter(inColumn).length;
    const exceededAreas = areaIds.flatMap((areaId) => column.statuses.flatMap((stage) => {
      const count = boardActivities.filter((activity) => activity.area_id === areaId && activity.flow_status === stage).length;
      const setting = wipLimits.find((item) => item.area_id === areaId && item.flow_status === stage);
      return setting?.limit_count !== null && setting?.limit_count !== undefined && count > setting.limit_count
        ? [{ areaId, count, limit: setting.limit_count, stage }] : [];
    }));
    const configured = areaIds.flatMap((areaId) => column.statuses.map((stage) => wipLimits.find((item) => item.area_id === areaId && item.flow_status === stage)?.limit_count)).filter((value): value is number => value !== null && value !== undefined);
    return { ...column, cards, wipCount, exceededAreas, configuredLimit: configured.length ? configured.reduce((sum, value) => sum + value, 0) : null };
  });

  function renderFlowCard(activity: Activity) {
    const area = areasById.get(activity.area_id);
    const canFlow = mayUpdateActivity(activity);
    const canEdit = isAreaActive(activity.area_id) && canManageActivity(profile, activity.area_id);
    const related = activityAttachments.filter((attachment) => attachment.activity_id === activity.id);
    const selectedTarget = flowTargetById[activity.id] ?? '';
    const isDragging = draggedActivityId === activity.id;
    return (
      <article
        id={`activity-card-${activity.id}`}
        className={`activity-board-card postit-priority-${activity.priority}${canFlow ? ' is-draggable' : ''}${isDragging ? ' is-dragging' : ''}${pushTarget?.type === 'activity' && pushTarget.itemId === activity.id ? ' is-push-target' : ''}`}
        key={activity.id}
        draggable={canFlow && savingFlowId !== activity.id}
        title={canFlow ? 'Arraste este cartão para mudar de etapa' : undefined}
        onDragStart={(event) => handleActivityDragStart(event, activity)}
        onDragEnd={() => { setDraggedActivityId(null); setDragOverColumnId(null); }}
      >
        <div className="activity-board-card-top"><span className="workspace-code">{activity.code}</span><div className="activity-board-card-badges">{canFlow && <span className="activity-card-drag-indicator" aria-hidden="true" title="Arraste o cartão"><GripVertical size={14} /></span>}{activity.flow_status === 'blocked' && <span className="activity-board-blocked-badge">Bloqueada</span>}<span className={`activity-priority priority-${activity.priority}`}>{activityPriorityLabels[activity.priority]}</span></div></div>
        <h3>{activity.name}</h3>
        <p className="activity-board-card-area">{area?.name ?? 'Área'}{activity.due_date ? ` · Prazo ${formatShortDate(activity.due_date)}` : ''}</p>
        {activity.description && <p className="activity-board-card-description">{activity.description}</p>}
        <div className="activity-board-card-facts"><span>Responsável: {activity.responsible_name || 'A definir'}</span><span>Esforço: {activity.effort_points === null ? 'não estimado' : `${activity.effort_points} ponto(s)`}</span></div>
        {activity.flow_status === 'blocked' && <p className="activity-blocked-reason"><strong>Bloqueio:</strong> {activity.blocked_reason}</p>}
        {related.length > 0 && <ul className="activity-attachments" aria-label="Anexos da atividade">{related.map((attachment) => <li key={attachment.id}>
          {attachment.kind === 'drive_link' && attachment.drive_url
            ? <a href={attachment.drive_url} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} aria-hidden="true" />{attachment.file_name}<span className="sr-only"> (abre em nova aba; acesso depende das permissões do Google)</span></a>
            : attachmentUrls[attachment.id] ? <a href={attachmentUrls[attachment.id]} target="_blank" rel="noopener noreferrer"><Paperclip size={13} aria-hidden="true" />{attachment.file_name}</a> : <span><Paperclip size={13} aria-hidden="true" />{attachment.file_name} (link temporariamente indisponível)</span>}
        </li>)}</ul>}
        <div className="activity-flow-control">
          {canFlow ? <>
            <label><span>Mover cartão</span><select aria-label={`Mover ${activity.code} para outra etapa`} value={selectedTarget} disabled={savingFlowId === activity.id} onChange={(event) => {
              const target = event.target.value as ActivityFlowStatus | '';
              setFlowTargetById((current) => ({ ...current, [activity.id]: target }));
              if (target && target !== 'blocked') void moveActivityFlow(activity, target);
            }}>
              <option value="">Escolha uma etapa…</option>{activityFlowTransitions[activity.flow_status].map((target) => <option key={target} value={target}>{activityFlowLabels[target]}</option>)}
            </select></label>
            {selectedTarget === 'blocked' && <div className="activity-block-form"><label><span>Motivo do bloqueio <b>obrigatório</b></span><textarea value={blockedReasonById[activity.id] ?? ''} rows={2} onChange={(event) => setBlockedReasonById((current) => ({ ...current, [activity.id]: event.target.value }))} /></label><button type="button" disabled={savingFlowId === activity.id || !(blockedReasonById[activity.id] ?? '').trim()} onClick={() => void moveActivityFlow(activity, 'blocked', blockedReasonById[activity.id] ?? '')}>{savingFlowId === activity.id ? 'Salvando…' : 'Registrar bloqueio'}</button></div>}
          </> : <span className="workspace-read-only">Fluxo somente leitura</span>}
          {canFlow && <div className="activity-card-attachment-controls"><label><span>Anexar arquivo</span><input type="file" multiple accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,application/pdf,text/plain,text/csv,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation" disabled={savingFlowId === activity.id} onChange={(event) => { const selected = Array.from(event.target.files ?? []); if (selected.length) void uploadActivityFiles(activity, selected); event.target.value = ''; }} /></label><label><span>Nome do link Google</span><input maxLength={240} value={driveDraftById[activity.id]?.name ?? ''} onChange={(event) => setDriveDraftById((current) => ({ ...current, [activity.id]: { ...(current[activity.id] ?? { name: '', url: '' }), name: event.target.value } }))} /></label><label><span>URL do Drive/Docs</span><input type="url" value={driveDraftById[activity.id]?.url ?? ''} onChange={(event) => setDriveDraftById((current) => ({ ...current, [activity.id]: { ...(current[activity.id] ?? { name: '', url: '' }), url: event.target.value } }))} /></label><button type="button" onClick={() => void addActivityDriveLink(activity)} disabled={savingFlowId === activity.id}>Adicionar link</button></div>}
          {canEdit && <div className="activity-card-actions">
            <button type="button" className="activity-card-edit" onClick={() => { setDialogError(''); setDialogActivity(activity); }}>Editar</button>
            {confirmRemoveActivityId === activity.id ? (
              <div className="activity-card-remove-confirm" role="group" aria-label={`Confirmar remoção de ${activity.code}`}>
                <span>Remover?</span>
                <button type="button" className="activity-card-remove-confirm-button" onClick={() => void removeActivity(activity)} disabled={removingActivityId === activity.id}><Check size={13} aria-hidden="true" />{removingActivityId === activity.id ? 'Removendo…' : 'Confirmar'}</button>
                <button type="button" className="activity-card-cancel-remove" onClick={() => setConfirmRemoveActivityId(null)} disabled={removingActivityId === activity.id} aria-label={`Cancelar remoção de ${activity.code}`}><X size={13} aria-hidden="true" />Cancelar</button>
              </div>
            ) : <button type="button" className="activity-card-remove" onClick={() => setConfirmRemoveActivityId(activity.id)}><Trash2 size={13} aria-hidden="true" />Remover</button>}
          </div>}
        </div>
      </article>
    );
  }

  const activityEditorAreas = useMemo(() => {
    if (activeChannel && activeChannel.slug !== 'geral') {
      if (!activeChannel.area_id) return [];
      const channelAreas = activeAreas.filter((area) => area.id === activeChannel.area_id);
      return profile.role === 'area_lead' ? channelAreas.filter((area) => area.id === profile.area_id) : channelAreas;
    }
    return profile.role === 'area_lead' ? activeAreas.filter((area) => area.id === profile.area_id) : activeAreas;
  }, [activeAreas, activeChannel, profile.area_id, profile.role]);

  const permissionSummary = profile.role === 'admin'
    ? 'Você pode editar atividades e registrar status em toda a equipe.'
    : profile.role === 'area_lead'
      ? `Você lidera ${areasById.get(profile.area_id ?? '')?.name ?? 'sua área'}; as permissões de gravação também são conferidas pelo banco.`
      : profile.role === 'member'
        ? 'Você pode atualizar status das atividades vinculadas à sua conta; a edição também é conferida pelo banco.'
        : 'Seu perfil é somente leitura.';

  async function saveActivity(form: ActivityFormState, submission: AttachmentSubmission) {
    const validation = validateActivity(form);
    if (validation) { setDialogError(validation); return; }
    if (form.effort_points !== '' && (!Number.isInteger(Number(form.effort_points)) || Number(form.effort_points) < 0 || Number(form.effort_points) > 100)) {
      setDialogError('Informe um esforço inteiro entre 0 e 100, ou deixe em branco.'); return;
    }
    if (!dialogActivity && !(profile.role === 'admin' || (profile.role === 'area_lead' && profile.area_id === form.area_id))) {
      setDialogError('Somente Administrador ou Líder da área selecionada pode criar atividade.'); return;
    }
    const driveUrl = submission.driveUrl.trim() ? safeDriveUrl(submission.driveUrl) : null;
    if (submission.driveUrl.trim() && !driveUrl) { setDialogError('Use um link HTTPS do host exato drive.google.com ou docs.google.com, sem credenciais.'); return; }
    for (const file of submission.files) {
      const mime = file.type.toLowerCase();
      if (!ACTIVITY_FILE_TYPES[mime] || file.size <= 0 || file.size > 15 * 1024 * 1024) {
        setDialogError(`Arquivo “${file.name}” inválido. Aceite apenas imagem, PDF, TXT/CSV ou DOC/XLS/PPT até 15 MiB.`); return;
      }
    }
    if (driveUrl && !submission.driveName.trim()) { setDialogError('Informe um nome para o link do Google Drive/Docs.'); return; }

    setSavingActivity(true);
    setDialogError('');
    const payload = buildMutation(form, members);
    const oldResponsibleUserId = dialogActivity ? dialogActivity.responsible_user_id : null;
    const shouldNotifyAssignee = Boolean(payload.responsible_user_id) && payload.responsible_user_id !== oldResponsibleUserId;
    let savedActivityId = '';
    let parentSaved = false;
    try {
      if (dialogActivity) {
        const { data, error } = await client.from('activities').update(payload).eq('id', dialogActivity.id).select('id').single();
        if (error) throw error;
        savedActivityId = data.id;
        parentSaved = true;
      } else {
        const { data, error } = await client.from('activities').insert({ ...payload, flow_status: 'backlog', blocked_reason: '' }).select('id').single();
        if (error) throw error;
        savedActivityId = data.id;
        parentSaved = true;
      }
      for (const file of submission.files) {
        const kind = ACTIVITY_FILE_TYPES[file.type.toLowerCase()];
        const objectPath = `${userId}/${savedActivityId}/${crypto.randomUUID()}.${kind.extension}`;
        const { error: uploadError } = await client.storage.from('activity-attachments').upload(objectPath, file, { contentType: kind.mime, upsert: false });
        if (uploadError) throw uploadError;
        const { error: metadataError } = await client.from('activity_attachments').insert({
          activity_id: savedActivityId, kind: 'file', storage_path: objectPath, content_type: kind.mime,
          file_name: file.name.trim().slice(0, 240), file_size: file.size, created_by: userId,
        });
        if (metadataError) {
          await client.storage.from('activity-attachments').remove([objectPath]);
          throw metadataError;
        }
      }
      if (driveUrl) {
        const { error } = await client.from('activity_attachments').insert({
          activity_id: savedActivityId, kind: 'drive_link', file_name: submission.driveName.trim().slice(0, 240), drive_url: driveUrl, created_by: userId,
        });
        if (error) throw error;
      }
      setDialogActivity(false);
      setFeedback(dialogActivity ? 'Atividade atualizada.' : 'Atividade cadastrada no Backlog. O código foi gerado pelo banco.');
      if (shouldNotifyAssignee) {
        void notifyWorkspacePush(client, 'activity_assigned', savedActivityId).then((result) => {
          if (result === 'failed') setFeedback('Atividade salva, mas o push da nova atribuição não foi enviado. A atividade continua salva.');
        });
      }
      await loadData(true);
      void notifyActivityChange(client, 'activities', savedActivityId).then((result) => {
        if (result.status === 'failed') setFeedback('Atividade salva, mas o aviso por e-mail não pôde ser enviado. A atividade continua salva.');
      });
    } catch (error) {
      if (parentSaved && !dialogActivity) {
        setDialogActivity(false);
        await loadData(true);
        setFeedback(`Atividade criada; não foi possível completar todos os anexos. Você pode tentar novamente ao editar o cartão. ${errorText(error)}`);
      } else setDialogError(`Não foi possível salvar a atividade ou seus anexos. Os arquivos enviados sem metadados foram removidos. ${errorText(error)}`);
    } finally { setSavingActivity(false); }
  }

  async function uploadActivityFiles(activity: Activity, files: File[]) {
    if (!mayUpdateActivity(activity)) return;
    const unsupported = files.find((file) => !ACTIVITY_FILE_TYPES[file.type.toLowerCase()] || file.size <= 0 || file.size > 15 * 1024 * 1024);
    if (unsupported) { setFeedback(`Arquivo “${unsupported.name}” não permitido. Use os tipos seguros aceitos até 15 MiB.`); return; }
    setSavingFlowId(activity.id); setFeedback('');
    try {
      for (const file of files) {
        const kind = ACTIVITY_FILE_TYPES[file.type.toLowerCase()];
        const objectPath = `${userId}/${activity.id}/${crypto.randomUUID()}.${kind.extension}`;
        const { error: uploadError } = await client.storage.from('activity-attachments').upload(objectPath, file, { contentType: kind.mime, upsert: false });
        if (uploadError) throw uploadError;
        const { error: metadataError } = await client.from('activity_attachments').insert({ activity_id: activity.id, kind: 'file', storage_path: objectPath, content_type: kind.mime, file_name: file.name.trim().slice(0, 240), file_size: file.size, created_by: userId });
        if (metadataError) { await client.storage.from('activity-attachments').remove([objectPath]); throw metadataError; }
      }
      await loadData(true); setFeedback('Anexo(s) adicionado(s) à atividade.');
    } catch (error) {
      setFeedback(`Não foi possível concluir o envio. Arquivos sem metadados foram removidos; anexos já salvos permanecem disponíveis. ${errorText(error)}`);
    } finally { setSavingFlowId(null); }
  }

  async function addActivityDriveLink(activity: Activity) {
    if (!mayUpdateActivity(activity)) return;
    const draft = driveDraftById[activity.id] ?? { name: '', url: '' };
    const url = safeDriveUrl(draft.url);
    if (!draft.name.trim() || !url) { setFeedback('Informe um nome e um link HTTPS válido de drive.google.com ou docs.google.com.'); return; }
    setSavingFlowId(activity.id);
    try {
      const { error } = await client.from('activity_attachments').insert({ activity_id: activity.id, kind: 'drive_link', file_name: draft.name.trim().slice(0, 240), drive_url: url, created_by: userId });
      if (error) throw error;
      setDriveDraftById((current) => ({ ...current, [activity.id]: { name: '', url: '' } }));
      await loadData(true); setFeedback('Link nomeado adicionado. A abertura depende das permissões do Google.');
    } catch (error) { setFeedback(`Não foi possível salvar o link: ${errorText(error)}`); }
    finally { setSavingFlowId(null); }
  }

  async function moveActivityFlow(activity: Activity, target: ActivityFlowStatus, blockedReason = '') {
    if (!mayUpdateActivity(activity)) { setFeedback('Você não tem permissão para alterar o fluxo desta atividade.'); return; }
    if (target === 'blocked' && !blockedReason.trim()) { setFeedback('Informe o motivo obrigatório do bloqueio.'); return; }
    setSavingFlowId(activity.id);
    setFeedback('');
    try {
      const { data, error } = await client.rpc('move_activity_flow', {
        p_activity_id: activity.id, p_flow_status: target, p_blocked_reason: blockedReason.trim(),
      });
      if (error) throw error;
      const updated = data as Activity;
      setActivities((current) => current.map((item) => item.id === activity.id ? { ...item, flow_status: updated.flow_status, blocked_reason: updated.blocked_reason } : item));
      setFlowTargetById((current) => ({ ...current, [activity.id]: '' }));
      setBlockedReasonById((current) => ({ ...current, [activity.id]: '' }));
      setFeedback(`Cartão ${activity.code} movido para ${activityFlowLabels[target]}.`);
    } catch (error) {
      const message = errorText(error);
      setFeedback(message.includes('Transição não permitida')
        ? 'O Supabase ainda usa a regra antiga de etapas. Aplique a migration 20261106211000_kanban_drag_drop.sql para habilitar o arraste entre as quatro colunas.'
        : `Não foi possível mover o cartão: ${message}`);
    }
    finally { setSavingFlowId(null); }
  }

  function handleActivityDragStart(event: DragEvent<HTMLElement>, activity: Activity) {
    if (!mayUpdateActivity(activity) || savingFlowId === activity.id) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', activity.id);
    setDraggedActivityId(activity.id);
  }

  async function handleActivityDrop(event: DragEvent<HTMLElement>, targetColumnKey: string) {
    event.preventDefault();
    setDragOverColumnId(null);
    const activityId = event.dataTransfer.getData('text/plain') || draggedActivityId;
    setDraggedActivityId(null);
    const activity = activities.find((item) => item.id === activityId);
    const targetColumn = kanbanColumnDefinitions.find((column) => column.key === targetColumnKey);
    if (!activity || !targetColumn || !mayUpdateActivity(activity)) return;
    const sameVisualColumn = kanbanColumnForStatus(activity.flow_status) === targetColumn.key;
    if (sameVisualColumn && !(activity.flow_status === 'blocked' && targetColumn.key === 'in_progress')) return;

    const target = targetColumn.key === 'in_progress' ? 'in_progress' : targetColumn.statuses[0];
    if (!activityFlowTransitions[activity.flow_status].includes(target)) {
      setFeedback(`Não é possível mover de ${activityFlowLabels[activity.flow_status]} para ${targetColumn.label} sem concluir a etapa atual.`);
      return;
    }
    await moveActivityFlow(activity, target);
  }

  async function saveWipSettings() {
    if (profile.role !== 'admin' || !wipAreaEditor) return;
    setSavingWipKey(wipAreaEditor); setFeedback('');
    try {
      for (const stage of activityFlowStages) {
        const raw = wipDrafts[stage] ?? '';
        if (raw !== '' && (!/^\d+$/.test(raw) || Number(raw) > 10000)) throw new Error(`O limite de ${activityFlowLabels[stage]} deve ser um inteiro não negativo ou ficar vazio.`);
      }
      for (const stage of activityFlowStages) {
        const raw = wipDrafts[stage] ?? '';
        const { error } = await client.from('activity_flow_wip_limits').upsert({
          area_id: wipAreaEditor, flow_status: stage, limit_count: raw === '' ? null : Number(raw), updated_by: userId,
        }, { onConflict: 'area_id,flow_status' });
        if (error) throw error;
      }
      const { data, error } = await client.from('activity_flow_wip_limits').select('area_id,flow_status,limit_count');
      if (error) throw error;
      setWipLimits((data ?? []) as ActivityWipLimit[]);
      setFeedback('Limites WIP atualizados. Campo vazio significa sem limite configurado.');
    } catch (error) { setFeedback(`Não foi possível salvar os limites WIP: ${errorText(error)}`); }
    finally { setSavingWipKey(null); }
  }

  async function removeActivity(activity: Activity) {
    setRemovingActivityId(activity.id);
    setErrorMessage('');
    setFeedback('');
    try {
      const { error } = await client.rpc('remove_activity', { p_activity_id: activity.id });
      if (error) throw error;
      setConfirmRemoveActivityId(null);
      setFeedback(`Atividade ${activity.code} removida da lista. O histórico semanal foi preservado.`);
      await loadData(true);
    } catch (error) {
      setErrorMessage(`Não foi possível remover a atividade: ${errorText(error)}`);
    } finally {
      setRemovingActivityId(null);
    }
  }

  async function saveWeekly(activity: Activity) {
    const draft = drafts[activity.id] ?? {
      status: 'not_started' as WeeklyStatus,
      justification: '',
      completed_work: '', pending_work: '', difficulties: '', dependency_notes: '', next_action: '',
    };
    if (draft.status === 'pending' && !draft.justification.trim()) {
      setFeedback('Para registrar Pendente, escreva uma justificativa.');
      return;
    }
    if (!selectedWeek) return;
    setSavingWeeklyId(activity.id);
    setFeedback('');
    try {
      const basePayload = {
        activity_id: activity.id,
        week_start: selectedWeek.start,
        status: draft.status,
        justification: draft.justification.trim(),
      };
      const payload = weeklyDetailsMigrationAvailable ? {
        ...basePayload,
        completed_work: draft.completed_work.trim(),
        pending_work: draft.pending_work.trim(),
        difficulties: draft.difficulties.trim(),
        dependency_notes: draft.dependency_notes.trim(),
        next_action: draft.next_action.trim(),
      } : basePayload;
      const { data, error } = await client.from('weekly_updates').upsert(payload, { onConflict: 'activity_id,week_start' }).select('id').single();
      if (error) throw error;
      setFeedback(`Atualização de ${activity.code} salva para a semana ${selectedWeek.number}.`);
      await loadData(true);
      void notifyActivityChange(client, 'weekly_updates', data.id).then((result) => {
        if (result.status === 'failed') {
          setFeedback('Status salvo, mas o aviso por e-mail não pôde ser enviado. O registro continua salvo.');
        }
      });
    } catch (error) {
      setFeedback(`Não foi possível salvar o status. O banco também verifica sua permissão: ${errorText(error)}`);
    } finally {
      setSavingWeeklyId(null);
    }
  }

  function updateFilter<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function navigateToTab(nextTab: WorkspaceTab) {
    const leavingLiveMeeting = tab === 'agenda' && agendaSubtab === 'meetings' && nextTab !== 'agenda';
    if (jitsiRoomActive && (nextTab !== tab || leavingLiveMeeting) && !window.confirm('Você está em uma reunião. Sair desta tela desconectará sua chamada. Deseja continuar?')) return;
    if (jitsiRoomActive && (nextTab !== tab || leavingLiveMeeting)) setJitsiRoomActive(false);
    if (nextTab === 'conversations' && activeChannel?.slug !== 'geral') setConversationsSubtab('announcements');
    setTab(nextTab);
  }

  function navigateToAgendaSubtab(nextSubtab: AgendaSubtab) {
    if (jitsiRoomActive && nextSubtab !== 'meetings' && !window.confirm('Você está em uma reunião. Sair desta tela desconectará sua chamada. Deseja continuar?')) return;
    if (jitsiRoomActive && nextSubtab !== 'meetings') setJitsiRoomActive(false);
    setAgendaSubtab(nextSubtab);
    setTab('agenda');
  }

  function handleProfileLogout() {
    if (jitsiRoomActive && !window.confirm('Você está em uma reunião. Sair do Team Celeris desconectará sua chamada. Deseja continuar?')) return;
    onLogout();
  }

  const pageHeading = tab === 'home'
    ? { kicker: 'FEED DA EQUIPE', title: 'Início', subtitle: selectedWeek ? `Acompanhe as atividades da semana ${selectedWeek.number} e os próximos compromissos da equipe.` : 'Acompanhe as atividades e os próximos compromissos da equipe.' }
    : tab === 'agenda'
      ? { kicker: 'AGENDA DA EQUIPE', title: 'Agenda', subtitle: 'Organize reuniões, treinamentos, eventos e compromissos da equipe.' }
      : tab === 'activities'
      ? { kicker: 'CADASTRO DA EQUIPE', title: 'Atividades da equipe.', subtitle: 'Consulte, filtre e mantenha as atividades do ciclo atualizadas.' }
      : tab === 'files'
        ? { kicker: 'LINKS COMPARTILHADOS', title: 'Arquivos da equipe.', subtitle: 'Consulte documentos enviados, pastas e atalhos de internet compartilhados.' }
        : tab === 'conversations'
          ? { kicker: 'MURAL DA EQUIPE', title: 'Comunicados', subtitle: 'Avisos compartilhados com todos os integrantes deste canal.' }
          : tab === 'membersChat'
            ? { kicker: 'MENSAGENS PRIVADAS', title: 'Chat', subtitle: 'Conversas abertas pelo diretório de membros.' }
            : { kicker: 'CARGOS E CAPACITAÇÃO', title: 'Manual de funções.', subtitle: 'Consulte as responsabilidades de cada área e as competências a desenvolver.' };

  const contextualPageHeading = activeChannel && activeChannel.slug !== 'geral'
    ? tab === 'activities'
      ? { ...pageHeading, kicker: `ATIVIDADES · ${activeChannel.name.toLocaleUpperCase('pt-BR')}`, title: `Atividades · ${activeChannel.name}`, subtitle: `Acompanhe as entregas, responsáveis e prazos do canal ${activeChannel.name}.` }
      : tab === 'conversations'
          ? { ...pageHeading, kicker: `COMUNICADOS · ${activeChannel.name.toLocaleUpperCase('pt-BR')}`, title: `Comunicados · ${activeChannel.name}`, subtitle: `Avisos compartilhados com todos os integrantes deste canal.` }
        : tab === 'membersChat'
        ? pageHeading
        : tab === 'files'
          ? { ...pageHeading, kicker: `ARQUIVOS · ${activeChannel.name.toLocaleUpperCase('pt-BR')}`, title: `Arquivos · ${activeChannel.name}`, subtitle: `Documentos e pastas compartilhados do canal ${activeChannel.name}.` }
          : { ...pageHeading, kicker: `MANUAL DE FUNÇÃO · ${activeChannel.name.toLocaleUpperCase('pt-BR')}`, title: `Manual de Função · ${activeChannel.name}`, subtitle: `Responsabilidades e referências funcionais da área ${activeChannel.name}.` }
    : activeChannel?.slug === 'geral' && tab === 'home'
      ? { ...pageHeading, kicker: 'FEED GERAL', title: 'Feed', subtitle: 'Atualizações cronológicas das atividades e entregas de todos os canais.' }
      : activeChannel?.slug === 'geral' && tab === 'activities'
        ? { ...pageHeading, kicker: 'ATIVIDADES CONSOLIDADAS', title: 'Atividades', subtitle: 'Visão consolidada das atividades de todos os canais.' }
        : activeChannel?.slug === 'geral' && tab === 'conversations'
          ? { ...pageHeading, kicker: 'COMUNICADOS GLOBAIS', title: 'Comunicados', subtitle: 'Mural de avisos para todos os membros ativos do workspace.' }
          : activeChannel?.slug === 'geral' && tab === 'manual'
            ? { ...pageHeading, kicker: 'NORMAS DO WORKSPACE', title: 'Manual de Conduta', subtitle: 'Documento institucional e regras de convivência do workspace.' }
              : pageHeading;

  return (
    <section className="workspace-screen" aria-label="Espaço de trabalho Team Celeris">
      <header className="workspace-topbar">
        <a className="workspace-brand" href="#workspace" aria-label="Team Celeris">
          <img src="/assets/solmar-celeris-site-logo.png" alt="" />
        </a>
        <nav className={`workspace-nav${activeChannel && activeChannel.slug !== 'geral' ? ' is-area-channel' : ''}`} aria-label="Navegação principal">
          {(activeChannel && activeChannel.slug !== 'geral'
            ? workspaceTabs.filter(({ id }) => ['activities', 'conversations', 'files', 'manual'].includes(id))
            : workspaceTabs).map(({ id, label: baseLabel, icon: Icon }) => {
            const label = activeChannel?.slug === 'geral'
              ? (id === 'home' ? 'Feed' : id === 'conversations' ? 'Comunicados' : id === 'manual' ? 'Manual de Conduta' : baseLabel)
              : id === 'conversations' ? 'Comunicados' : id === 'manual' ? 'Manual de Função' : baseLabel;
            const NavIcon = id === 'home' && activeChannel?.slug === 'geral' ? Newspaper
              : id === 'conversations' ? Megaphone : Icon;
            return (
            <button key={id} type="button" title={label} aria-label={label} className={tab === id ? 'is-active' : ''} onClick={() => navigateToTab(id)} aria-current={tab === id ? 'page' : undefined}>
              <span className="workspace-nav-icon"><NavIcon aria-hidden="true" /></span>
              <span className="workspace-nav-label">{label}</span>
            </button>
          );})}
        </nav>
        <div className="workspace-top-actions">
          <ChannelSwitcher client={client} userId={userId} isAdmin={profile.role === 'admin'} areas={activeAreas} members={members} onChange={handleChannelChange} />
          <ProfileMenu
            client={client}
            userId={userId}
            fallbackName={displayName}
            photoUrl={avatarUrl}
            theme={theme}
            onThemeChange={onThemeChange}
            onUpdated={handleProfileUpdated}
            onLogout={handleProfileLogout}
          />
          <button className="workspace-chat-launcher workspace-chat-launcher-mobile" type="button" aria-label="Abrir Chat" title="Chat" onClick={() => setChatOpen(true)}><MessageCircle aria-hidden="true" /></button>
        </div>
      </header>

      <div className="workspace-frame">
        <main className={`workspace-main${tab === 'membersChat' ? ' is-chat-page' : ''}${tab === 'home' ? ' is-home-page' : ''}`} id="workspace">
          <div className="workspace-page-heading">
            <div>
              {activeChannel && <p className="workspace-channel-context">{activeChannel.name}{activeChannel.is_open ? ' · CANAL ABERTO' : ' · CANAL PRIVADO'}</p>}
              <p className="workspace-kicker">{contextualPageHeading.kicker}</p>
              <h1>{contextualPageHeading.title}</h1>
              <p className="workspace-subtitle">{contextualPageHeading.subtitle}</p>
            </div>
            <div className="workspace-heading-actions">
              {tab === 'membersChat' && <button className="workspace-refresh" type="button" onClick={() => setTab(chatReturnTab)}><ArrowLeftRight size={14} /> Voltar ao workspace</button>}
              {(tab === 'activities' || tab === 'home') && <span className="workspace-cycle-chip">PERÍODO · {formatFullDate(cycleStart)} – {formatFullDate(cycleEnd)} · {cycleWeeksCount} SEMANAS</span>}
              {(tab === 'activities' || tab === 'home') && profile.role === 'admin' && <button className="workspace-refresh workspace-period-button" type="button" onClick={() => { setPeriodError(''); setPeriodDialogOpen(true); }}>Editar período</button>}
              {(tab === 'activities' || tab === 'home') && <button className="workspace-refresh" type="button" onClick={() => void loadData(true)} disabled={loading || refreshing}>
                {refreshing ? 'Atualizando…' : '↻ Atualizar'}
              </button>}
              {tab === 'home' && <button className="workspace-refresh workspace-feed-filter-toggle" type="button" aria-expanded={homeFiltersOpen} aria-controls="workspace-filter-panel" onClick={() => setHomeFiltersOpen((current) => !current)}><Filter size={14} aria-hidden="true" /> {homeFiltersOpen ? 'Ocultar filtros' : 'Filtrar'}</button>}
              {tab === 'activities' && (profile.role === 'admin' || profile.role === 'area_lead') && (
                <button className="workspace-add-button" type="button" onClick={() => { setDialogError(''); setDialogActivity(null); }}>
                  <span aria-hidden="true">+</span> Nova atividade
                </button>
              )}
            </div>
          </div>

          {tab === 'agenda' && <div className="workspace-module-tabs is-agenda" role="tablist" aria-label="Guias da Agenda">
            <button type="button" role="tab" aria-selected={agendaSubtab === 'calendar'} className={agendaSubtab === 'calendar' ? 'is-active' : ''} onClick={() => navigateToAgendaSubtab('calendar')}><CalendarDays aria-hidden="true" /><span>Calendário</span></button>
            <button type="button" role="tab" aria-selected={agendaSubtab === 'availability'} className={agendaSubtab === 'availability' ? 'is-active' : ''} onClick={() => navigateToAgendaSubtab('availability')}><ClockWithArrowsIcon size={20} /><span>Disponibilidades</span></button>
            <button type="button" role="tab" aria-selected={agendaSubtab === 'meetings'} className={agendaSubtab === 'meetings' ? 'is-active' : ''} onClick={() => navigateToAgendaSubtab('meetings')}><Video aria-hidden="true" /><span>Reunião</span></button>
          </div>}

          {(tab === 'activities' || tab === 'home') && <p className="workspace-permission-note">{permissionSummary}</p>}

          {errorMessage && (
            <div className="workspace-alert workspace-alert-error" role="alert">
              <strong>Não foi possível carregar as informações.</strong>
              <p>{errorMessage}</p>
              <span>Confira se o banco recebeu a migração e se este usuário tem perfil ativo. Não altere as políticas RLS para contornar o erro.</span>
            </div>
          )}
          {feedback && <p className="workspace-feedback" role="status">{feedback}</p>}

          {((tab === 'home' && homeFiltersOpen) || tab === 'activities') && <div className="workspace-filter-panel" id={tab === 'home' ? 'workspace-filter-panel' : undefined}>
            <label className="workspace-search">
              <span>Buscar</span>
              <input value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} placeholder="Código, nome, descrição…" />
            </label>
            <label>
              <span>Responsável</span>
              <select value={filters.responsible} onChange={(event) => updateFilter('responsible', event.target.value)}>
                <option value="">Todos</option>
                {responsibleNames.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            <label>
              <span>Área</span>
              <select value={filters.area} onChange={(event) => updateFilter('area', event.target.value)}>
                <option value="">Todas</option>
                {(activeChannel && activeChannel.slug !== 'geral' ? activityEditorAreas : areas).map((area) => <option key={area.id} value={area.id}>{area.is_active ? area.name : `${area.name} · inativa`}</option>)}
              </select>
            </label>
            <label>
              <span>Tipo</span>
              <select value={filters.type} onChange={(event) => updateFilter('type', event.target.value)}>
                <option value="">Todos</option>
                {(Object.keys(activityTypeLabels) as ActivityType[]).map((type) => <option key={type} value={type}>{activityTypeLabels[type]}</option>)}
              </select>
            </label>
            <label>
              <span>{tab === 'home' ? 'Status da semana' : 'Situação geral'}</span>
              <select value={tab === 'home' && filters.status === 'overdue' ? '' : filters.status} onChange={(event) => updateFilter('status', event.target.value)}>
                <option value="">Todos</option>
                {(tab === 'home' ? Object.entries(weeklyStatusLabels) : Object.entries(generalStatusLabels)).map(([status, label]) => <option key={status} value={status}>{label}</option>)}
              </select>
            </label>
            <label>
              <span>De</span>
              <input type="date" value={filters.from} onChange={(event) => updateFilter('from', event.target.value)} />
            </label>
            <label>
              <span>Até</span>
              <input type="date" value={filters.to} onChange={(event) => updateFilter('to', event.target.value)} />
            </label>
            <button className="workspace-clear-filters" type="button" onClick={() => setFilters(defaultFilters)}>Limpar filtros</button>
          </div>}

          {tab === 'home' && (
            <div className="workspace-feed-layout">
            <section className="workspace-week-section workspace-feed-main" aria-labelledby="selected-week-title">
              <div className="workspace-week-heading">
                <div>
                  <p className="workspace-kicker">REGISTRO DA SEMANA</p>
                  <h2 id="selected-week-title">{selectedWeek ? formatWeekRange(selectedWeek) : 'Ciclo sem semanas'}</h2>
                  <p>{selectedWeek ? `Semana ${selectedWeek.number} de ${cycleWeeksCount} · ${expectedActivities.length} atividade(s) · ${weekCalendarEvents.length} evento(s)` : 'Configure o ciclo do time no Supabase.'}</p>
                </div>
                <label className="workspace-week-picker">
                  <span>Selecionar semana</span>
                  <select value={selectedWeekStart} onChange={(event) => setSelectedWeekStart(event.target.value)}>
                    {weeks.map((week) => <option key={week.start} value={week.start}>Semana {String(week.number).padStart(2, '0')} · {formatWeekRange(week)}</option>)}
                  </select>
                </label>
              </div>

              {!weeklyDetailsMigrationAvailable && <div className="workspace-alert" role="status">
                <strong>Relato detalhado e histórico ainda não estão habilitados.</strong>
                <p>Aplique <code>supabase/migrations/20261108122000_weekly_update_details_history.sql</code> no Supabase para liberar os novos campos. O acompanhamento existente continua disponível.</p>
              </div>}

              {loading ? <WorkspaceLoading /> : (
                <>
                  {visibleActivities.length === 0 && weekCalendarEvents.length === 0 && !weekEventsLoading && (
                    <EmptyState title={activities.length === 0 ? 'Nenhuma atividade foi encontrada.' : 'Nada previsto com estes filtros.'}>
                      {activities.length === 0
                        ? 'Confirme no SQL Editor se a migração foi aplicada no Supabase que este site está usando.'
                        : 'Tente outra semana ou limpe os filtros. Atividades aparecem aqui de acordo com sua frequência e janela de datas.'}
                    </EmptyState>
                  )}
                  {visibleActivities.length > 0 && <div className="workspace-week-list">
                  {visibleActivities.map((activity) => {
                    const saved = updatesForWeek.get(activity.id);
                    const draft = drafts[activity.id] ?? {
                      status: 'not_started' as WeeklyStatus,
                      justification: '',
                      completed_work: '', pending_work: '', difficulties: '', dependency_notes: '', next_action: '',
                    };
                    const area = areasById.get(activity.area_id);
                    const mayUpdate = mayUpdateActivity(activity);
                    return (
                      <WeeklyActivityCard
                        key={`${activity.id}:${selectedWeek?.start ?? ''}:${saved?.updated_at ?? 'novo'}`}
                        client={client}
                        activity={activity}
                        areaName={area?.name ?? 'Área removida'}
                        weekStart={selectedWeek?.start ?? ''}
                        draft={draft}
                        saved={saved}
                        canUpdate={mayUpdate}
                        saving={savingWeeklyId === activity.id}
                        busy={savingWeeklyId === activity.id || savingFlowId === activity.id}
                        attachmentBusy={savingFlowId === activity.id}
                        detailsMigrationAvailable={weeklyDetailsMigrationAvailable}
                        attachments={activityAttachments.filter((attachment) => attachment.activity_id === activity.id)}
                        attachmentUrls={attachmentUrls}
                        driveDraft={driveDraftById[activity.id] ?? { name: '', url: '' }}
                        onDraftChange={(patch) => setDrafts((current) => ({ ...current, [activity.id]: { ...(current[activity.id] ?? draft), ...patch } }))}
                        onSave={() => void saveWeekly(activity)}
                        onUploadFiles={(files) => void uploadActivityFiles(activity, files)}
                        onDriveDraftChange={(patch) => setDriveDraftById((current) => ({
                          ...current,
                          [activity.id]: { ...(current[activity.id] ?? { name: '', url: '' }), ...patch },
                        }))}
                        onAddDriveLink={() => void addActivityDriveLink(activity)}
                      />
                    );
                  })}
                  </div>}
                  {weekEventsError && <p className="workspace-week-events-note">Os eventos do calendário não puderam ser carregados. Confira se as migrations do Calendário estão aplicadas no Supabase.</p>}
                  {weekEventsLoading && <p className="workspace-week-events-note">Carregando eventos da semana…</p>}
                  {weekCalendarEvents.length > 0 && (
                    <section className="workspace-week-events" aria-labelledby="week-events-title">
                      <div className="workspace-week-events-heading">
                        <div><p className="workspace-kicker">AGENDA</p><h3 id="week-events-title">Eventos desta semana</h3></div>
                        <span>{weekCalendarEvents.length} evento(s)</span>
                      </div>
                      <div className="workspace-week-events-list">
                        {weekCalendarEvents.map((event) => (
                          <article className={`workspace-week-event is-${event.event_scope}`} key={event.id}>
                            <div className="workspace-week-event-date"><CalendarDays aria-hidden="true" /><strong>{formatShortDate(event.event_date)}</strong>{event.start_time && <span>{event.start_time.slice(0, 5)}</span>}</div>
                            <div className="workspace-week-event-details"><span>{event.event_scope === 'internal' ? 'EVENTO INTERNO' : 'EVENTO EXTERNO'}</span><h4>{event.title}</h4>{event.location && <p>{event.location}</p>}</div>
                            <button type="button" onClick={() => { setCalendarFocusDate(event.event_date); navigateToAgendaSubtab('calendar'); }}>Ver na Agenda</button>
                          </article>
                        ))}
                      </div>
                    </section>
                  )}
                </>
              )}
            </section>
            <aside className="workspace-feed-sidebar" aria-label="Resumo da semana e atalhos">
              <section className="workspace-feed-card">
                <p className="workspace-kicker">RESUMO DA SEMANA</p>
                <h2>{selectedWeek ? formatWeekRange(selectedWeek) : 'Ciclo sem semanas'}</h2>
                <p className="workspace-feed-total"><strong>{weeklyIndicators.planned}</strong> atividade(s) previstas</p>
                <div className="workspace-week-indicators" aria-label="Indicadores da semana">
                  <article><span>Concluídas</span><strong>{weeklyIndicators.completed}</strong></article>
                  <article><span>Em andamento</span><strong>{weeklyIndicators.inProgress}</strong></article>
                  <article><span>Atrasadas</span><strong>{weeklyIndicators.overdue}</strong></article>
                  <article><span>Bloqueadas</span><strong>{weeklyIndicators.blocked}</strong></article>
                </div>
                <p className="workspace-week-indicator-note">Atrasadas usa a situação geral; bloqueadas, o fluxo Kanban. Os filtros ajustam os totais.</p>
              </section>
              <section className="workspace-feed-card workspace-feed-shortcuts">
                <p className="workspace-kicker">ATALHOS DA EQUIPE</p>
                <button type="button" onClick={() => navigateToAgendaSubtab('calendar')}><CalendarDays aria-hidden="true" /> Abrir Agenda</button>
                <button type="button" onClick={() => navigateToTab('activities')}><ClipboardList aria-hidden="true" /> Ver atividades</button>
                <button type="button" onClick={() => navigateToAgendaSubtab('meetings')}><Video aria-hidden="true" /> Reuniões ao vivo</button>
                {weekCalendarEvents.length > 0 && <p className="workspace-feed-events-count">{weekCalendarEvents.length} evento(s) na semana selecionada</p>}
              </section>
            </aside>
            </div>
          )}

          {tab === 'activities' && (
            <section className="workspace-activities-section" aria-labelledby="activity-view-title">
              <div className="workspace-list-heading">
                <div><p className="workspace-kicker">FLUXO CONTÍNUO · SEM SPRINTS OBRIGATÓRIAS</p><h2 id="activity-view-title">Quadro Kanban de atividades</h2></div>
                <div className="activity-view-tools"><span className="workspace-count">{visibleActivities.length} de {activities.length}</span></div>
              </div>
              {profile.role === 'admin' && (
                <section className="activity-wip-editor" aria-label="Configuração de limites WIP">
                  <div><strong>Limites WIP por área</strong><p>Opcional e configurável pela Administração; vazio significa sem limite. Ajuste após observar o fluxo da equipe.</p></div>
                  <label><span>Área do quadro</span><select value={wipAreaEditor} onChange={(event) => {
                    const areaId = event.target.value; setWipAreaEditor(areaId);
                    const next: Record<string, string> = {}; for (const stage of activityFlowStages) { const setting = wipLimits.find((item) => item.area_id === areaId && item.flow_status === stage); next[stage] = setting?.limit_count == null ? '' : String(setting.limit_count); }
                    setWipDrafts(next);
                  }}><option value="">Selecione uma área</option>{activityEditorAreas.map((area) => <option value={area.id} key={area.id}>{area.name}</option>)}</select></label>
                  {wipAreaEditor && <div className="activity-wip-fields">{activityFlowStages.map((stage) => <label key={stage}><span>{activityFlowLabels[stage]}</span><input aria-label={`Limite WIP para ${activityFlowLabels[stage]}`} type="number" min="0" step="1" placeholder="Sem limite" value={wipDrafts[stage] ?? ''} onChange={(event) => setWipDrafts((current) => ({ ...current, [stage]: event.target.value }))} /></label>)}<button type="button" onClick={() => void saveWipSettings()} disabled={savingWipKey === wipAreaEditor}>{savingWipKey ? 'Salvando…' : 'Salvar limites'}</button></div>}
                </section>
              )}
              {loading ? <WorkspaceLoading /> : (
                <>
                  {visibleActivities.length === 0 && <EmptyState title={activities.length === 0 ? 'Ainda não há atividades no banco.' : 'Nenhuma atividade corresponde aos filtros.'}>{activities.length === 0 ? 'Confirme que a migration exclusiva de fluxo e anexos foi aplicada no Supabase conectado.' : 'Limpe os filtros ou tente outra busca.'}</EmptyState>}
                  <div className="activity-board" aria-label="Quadro Kanban de atividades">
                  {boardColumns.map(({ key, label, cards, wipCount, exceededAreas, configuredLimit }) => (
                    <section
                      className={`activity-board-column${exceededAreas.length ? ' is-over-wip' : ''}${dragOverColumnId === key ? ' is-drop-target' : ''}`}
                      key={key}
                      aria-labelledby={`activity-stage-${key}`}
                      onDragOver={(event) => {
                        if (!draggedActivityId) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = 'move';
                        setDragOverColumnId((current) => current === key ? current : key);
                      }}
                      onDragLeave={(event) => {
                        const next = event.relatedTarget;
                        if (!(next instanceof Node) || !event.currentTarget.contains(next)) {
                          setDragOverColumnId((current) => current === key ? null : current);
                        }
                      }}
                      onDrop={(event) => void handleActivityDrop(event, key)}
                    >
                      <header><div><h3 id={`activity-stage-${key}`}>{label}</h3><span className="activity-board-count">{cards.length} cartão(ões)</span></div><span className={`activity-wip-badge${exceededAreas.length ? ' is-over' : ''}`}>{configuredLimit === null ? `${wipCount} · sem limite` : `WIP ${wipCount} · limite somado ${configuredLimit}`}</span></header>
                      {exceededAreas.length > 0 && <p className="activity-wip-warning" role="status">Limite excedido: {exceededAreas.map((item) => `${areasById.get(item.areaId)?.name ?? 'Área'} — ${activityFlowLabels[item.stage]} (${item.count}/${item.limit})`).join(', ')}</p>}
                      <div className="activity-board-cards">{cards.length ? cards.map(renderFlowCard) : <p className="activity-board-empty">Nenhum cartão nesta etapa.</p>}</div>
                    </section>
                  ))}
                  </div>
                </>
              )}
            </section>
          )}

          {tab === 'files' && (
            <SharedContentWorkspace client={client} mode="files" userId={userId} isAdmin={profile.role === 'admin'} areas={activeAreas} members={members} areaId={activeChannel?.slug === 'geral' ? null : activeChannel?.area_id ?? null} isGeneralChannel={activeChannel?.slug === 'geral'} channelId={activeChannel?.id ?? ''} />
          )}
          {tab === 'conversations' && conversationsSubtab === 'announcements' && (
            <SharedContentWorkspace client={client} mode="announcements" userId={userId} isAdmin={profile.role === 'admin'} areas={activeAreas} members={members} areaId={activeChannel?.slug === 'geral' ? null : activeChannel?.area_id ?? null} isGeneralChannel={activeChannel?.slug === 'geral'} channelId={activeChannel?.id ?? ''} targetAnnouncementId={pushTarget?.type === 'announcement' ? pushTarget.itemId : undefined} />
          )}
          {tab === 'agenda' && agendaSubtab === 'meetings' && <MeetingsWorkspace displayName={displayName} onRoomActiveChange={setJitsiRoomActive} />}
          {tab === 'agenda' && agendaSubtab === 'availability' && <AvailabilityWorkspace client={client} userId={userId} profile={profile} />}
          {tab === 'agenda' && agendaSubtab === 'calendar' && <TeamCalendar client={client} userId={userId} isAdmin={profile.role === 'admin'} initialDate={calendarFocusDate} initialEventId={pushTarget?.type === 'calendar' ? pushTarget.itemId : undefined} />}
          {tab === 'manual' && activeChannel?.slug === 'geral' && (
            <section className="workspace-manual" aria-label="Manual de Conduta">
              <p>EM BREVE</p>
            </section>
          )}
          {tab === 'manual' && activeChannel && activeChannel.slug !== 'geral' && (
            <ManualFunctions areaFilter={manualAreaName} />
          )}

          <footer className="workspace-footer" aria-label="Identidade do projeto">
            <img src="/assets/teamceleris-app-mark.png" alt="Símbolo do app Team Celeris" />
            <strong>TEAM CELERIS</strong>
            <i />
            <span>UFCI/RJ</span>
            <small>· DADOS DO SUPABASE</small>
          </footer>
        </main>
      </div>

      <button className="workspace-chat-launcher workspace-chat-launcher-desktop" type="button" aria-label="Abrir Chat" title="Chat" onClick={() => setChatOpen(true)}>
        <MessageCircle aria-hidden="true" />
      </button>

      {chatOpen && (
        <section className="workspace-chat-overlay" role="dialog" aria-modal="true" aria-label="Chat SolMar Celeris">
          <header className="workspace-chat-overlay-header">
            <div className="workspace-chat-overlay-title"><MessageCircle aria-hidden="true" /><strong>Chat</strong></div>
            <div className="workspace-chat-overlay-actions">
              <button type="button" className="workspace-chat-close" aria-label="Fechar Chat" title="Fechar Chat" onClick={() => setChatOpen(false)}><X aria-hidden="true" /></button>
            </div>
          </header>
          <div className="workspace-chat-overlay-body">
            <TeamChat client={client} userId={userId} isAdmin={profile.role === 'admin'} members={members} onMembersChanged={() => void loadData(true)} onClose={() => setChatOpen(false)} initialMessageId={pushTarget?.type === 'chat' ? pushTarget.messageId : undefined} initialConversationId={pushTarget?.type === 'chat' ? pushTarget.conversationId : undefined} initialConversationType={pushTarget?.type === 'chat' ? pushTarget.conversationType : undefined} initialDirectUserId={chatTargetUserId} onInitialDirectHandled={handleInitialDirectHandled} openCreateGroup={chatCreateGroupRequest} onCreateGroupHandled={handleCreateGroupHandled} />
          </div>
        </section>
      )}

      {dialogActivity !== false && (
        <ActivityDialog
          activity={dialogActivity}
          areas={activityEditorAreas}
          members={members}
          busy={savingActivity}
          error={dialogError}
          onClose={() => { if (!savingActivity) { setDialogActivity(false); setDialogError(''); } }}
          onSave={(form, submission) => void saveActivity(form, submission)}
        />
      )}
      {periodDialogOpen && (
        <ProjectPeriodDialog
          startDate={cycleStart}
          endDate={cycleEndDate}
          busy={savingPeriod}
          error={periodError}
          migrationAvailable={periodMigrationAvailable}
          onClose={() => { if (!savingPeriod) setPeriodDialogOpen(false); }}
          onSave={(start, end) => void saveProjectPeriod(start, end)}
        />
      )}
    </section>
  );
}

function WorkspaceLoading() {
  return <div className="workspace-loading" role="status"><span />Carregando informações do Supabase…</div>;
}

function EmptyState({ title, children }: { title: string; children: string }) {
  return <div className="workspace-empty"><span aria-hidden="true">○</span><strong>{title}</strong><p>{children}</p></div>;
}

function ProjectPeriodDialog({
  startDate,
  endDate,
  busy,
  error,
  migrationAvailable,
  onClose,
  onSave,
}: {
  startDate: string;
  endDate: string;
  busy: boolean;
  error: string;
  migrationAvailable: boolean;
  onClose: () => void;
  onSave: (start: string, end: string) => void;
}) {
  const [start, setStart] = useState(startDate);
  const [end, setEnd] = useState(endDate);

  useEffect(() => {
    setStart(startDate);
    setEnd(endDate);
  }, [startDate, endDate]);

  return (
    <div className="workspace-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="workspace-dialog" role="dialog" aria-modal="true" aria-labelledby="period-dialog-title">
        <div className="workspace-dialog-heading">
          <div>
            <p className="workspace-kicker">CONFIGURAÇÃO DO PROJETO</p>
            <h2 id="period-dialog-title">Ajustar período</h2>
          </div>
          <button type="button" className="workspace-dialog-close" aria-label="Fechar" onClick={onClose} disabled={busy}>×</button>
        </div>
        <p className="workspace-dialog-note">O período define as semanas disponíveis para acompanhamento de toda a equipe. O término é inclusivo; a última semana pode ser parcial. Alterá-lo não apaga atividades ou atualizações; registros fora do intervalo deixam de aparecer no acompanhamento até que o período seja ampliado novamente.</p>
        {!migrationAvailable && <p className="workspace-dialog-error" role="alert">Para salvar, aplique `20261104120000_workspace_project_period.sql` no Supabase e atualize esta página.</p>}
        <form className="workspace-activity-form workspace-period-form" onSubmit={(event) => { event.preventDefault(); onSave(start, end); }}>
          <label><span>Início do projeto <b>obrigatório</b></span>
            <input type="date" required value={start} onChange={(event) => setStart(event.target.value)} />
          </label>
          <label><span>Fim do projeto <b>obrigatório</b></span>
            <input type="date" required min={start} value={end} onChange={(event) => setEnd(event.target.value)} />
          </label>
          <p className="workspace-period-help form-span-2">O início pode ser qualquer data. A semana que contém esse dia começa na segunda-feira correspondente; o acompanhamento inicia na data escolhida. Padrão do projeto: 09/11/2026 a 22/12/2027.</p>
          {error && <p className="workspace-dialog-error form-span-2" role="alert">{error}</p>}
          <div className="workspace-dialog-actions form-span-2">
            <button type="button" className="workspace-cancel-button" onClick={onClose} disabled={busy}>Cancelar</button>
            <button type="submit" className="workspace-save-button" disabled={busy || !migrationAvailable}>{busy ? 'Salvando…' : 'Salvar período'}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ActivityDialog({
  activity,
  areas,
  members,
  busy,
  error,
  onClose,
  onSave,
}: {
  activity: Activity | null;
  areas: Area[];
  members: ActivityMember[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onSave: (form: ActivityFormState, submission: AttachmentSubmission) => void;
}) {
  const [form, setForm] = useState<ActivityFormState>(() => makeFormState(activity, areas[0]?.id ?? ''));
  const [files, setFiles] = useState<File[]>([]);
  const [driveName, setDriveName] = useState('');
  const [driveUrl, setDriveUrl] = useState('');

  useEffect(() => {
    setForm(makeFormState(activity, areas[0]?.id ?? ''));
    setFiles([]); setDriveName(''); setDriveUrl('');
  }, [activity, areas]);

  function change<K extends keyof ActivityFormState>(key: K, value: ActivityFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave(form, { files, driveName, driveUrl });
  }

  const orderedMembers = [...members].sort((a, b) => a.full_name.localeCompare(b.full_name, 'pt-BR'));

  return (
    <div className="workspace-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="workspace-dialog" role="dialog" aria-modal="true" aria-labelledby="activity-dialog-title">
        <div className="workspace-dialog-heading">
          <div>
            <p className="workspace-kicker">{activity ? `EDITAR · ${activity.code}` : 'NOVA ATIVIDADE'}</p>
            <h2 id="activity-dialog-title">{activity ? 'Atualizar atividade' : 'Cadastrar atividade'}</h2>
          </div>
          <button type="button" className="workspace-dialog-close" aria-label="Fechar" onClick={onClose} disabled={busy}>×</button>
        </div>
        <p className="workspace-dialog-note">O banco gera o código automaticamente e registra quem alterou as informações.</p>
        <form className="workspace-activity-form" onSubmit={handleSubmit}>
          <label className="form-span-2"><span>Área <b>obrigatória</b></span>
            <select required value={form.area_id} onChange={(event) => change('area_id', event.target.value)}>
              <option value="">Selecione uma área</option>
              {areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
            </select>
          </label>
          <label className="form-span-2"><span>Nome da atividade <b>obrigatório</b></span>
            <input required maxLength={200} value={form.name} onChange={(event) => change('name', event.target.value)} placeholder="Ex.: Conferir o sistema de propulsão" />
          </label>
          <label className="form-span-2"><span>Descrição</span>
            <textarea rows={2} value={form.description} onChange={(event) => change('description', event.target.value)} />
          </label>
          <label><span>Tipo <b>obrigatório</b></span>
            <select value={form.activity_type} onChange={(event) => {
              const type = event.target.value as ActivityType;
              change('activity_type', type);
              if (type === 'rotina') change('frequency', 'Semanal');
              else if (type === 'condicional') change('frequency', 'Sob demanda');
              else change('frequency', 'Única');
            }}>
              {(Object.keys(activityTypeLabels) as ActivityType[]).map((type) => <option key={type} value={type}>{activityTypeLabels[type]}</option>)}
            </select>
          </label>
          {form.activity_type === 'rotina' ? (
            <label><span>Frequência <b>obrigatória</b></span>
              <select value={form.frequency} onChange={(event) => change('frequency', event.target.value)}>
                <option value="Semanal">Semanal</option><option value="Quinzenal">Quinzenal</option><option value="Mensal">Mensal</option>
              </select>
            </label>
          ) : (
            <label><span>Frequência / recorrência</span>
              <input value={form.frequency} onChange={(event) => change('frequency', event.target.value)} placeholder={form.activity_type === 'condicional' ? 'Sob demanda' : 'Única'} />
            </label>
          )}
          {form.activity_type === 'condicional' && (
            <label className="form-span-2"><span>Condição de execução <b>obrigatória</b></span>
              <textarea required rows={2} value={form.execution_condition} onChange={(event) => change('execution_condition', event.target.value)} placeholder="Quando esta atividade deve ser realizada?" />
            </label>
          )}
          <label><span>Data inicial{form.activity_type === 'marco' && <b> obrigatória</b>}</span>
            <input type="date" required={form.activity_type === 'marco'} value={form.start_date} onChange={(event) => change('start_date', event.target.value)} />
          </label>
          <label><span>Prazo{(form.activity_type === 'marco' || form.activity_type === 'pontual') && <b> obrigatório</b>}</span>
            <input type="date" required={form.activity_type === 'marco' || form.activity_type === 'pontual'} value={form.due_date} onChange={(event) => change('due_date', event.target.value)} />
          </label>
          <label><span>Responsável</span>
            <input maxLength={120} value={form.responsible_name} onChange={(event) => change('responsible_name', event.target.value)} placeholder="Nome ou A definir" />
          </label>
          <label><span>Vincular à conta da equipe</span>
            <select value={form.responsible_user_id} onChange={(event) => {
              const userId = event.target.value;
              change('responsible_user_id', userId);
              if (userId) {
                const member = orderedMembers.find((candidate) => candidate.user_id === userId);
                if (member?.full_name) change('responsible_name', member.full_name);
              }
            }}>
              <option value="">Sem vínculo de conta</option>
              {orderedMembers.map((member) => <option key={member.user_id} value={member.user_id}>{member.full_name || 'Integrante sem nome'}</option>)}
            </select>
          </label>
          <label className="form-span-2"><span>Entregável esperado</span>
            <textarea rows={2} value={form.expected_deliverable} onChange={(event) => change('expected_deliverable', event.target.value)} />
          </label>
          <label className="form-span-2"><span>Observações</span>
            <textarea rows={2} value={form.notes} onChange={(event) => change('notes', event.target.value)} />
          </label>
          <label><span>Prioridade</span><select value={form.priority} onChange={(event) => change('priority', event.target.value as ActivityPriority)}>{(Object.keys(activityPriorityLabels) as ActivityPriority[]).map((priority) => <option key={priority} value={priority}>{activityPriorityLabels[priority]}</option>)}</select></label>
          <label><span>Esforço (pontos simples)</span><input type="number" min="0" max="100" step="1" inputMode="numeric" value={form.effort_points} onChange={(event) => change('effort_points', event.target.value)} placeholder="Não estimado" /></label>
          <label className="form-span-2"><span>Anexar arquivos (máx. 15 MiB por arquivo)</span><input type="file" multiple accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,application/pdf,text/plain,text/csv,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation" onChange={(event) => setFiles(Array.from(event.target.files ?? []))} />{files.length > 0 && <small>{files.map((file) => file.name).join(', ')}</small>}</label>
          <label><span>Nome para link Drive/Docs</span><input maxLength={240} value={driveName} onChange={(event) => setDriveName(event.target.value)} placeholder="Ex.: Documento de planejamento" /></label>
          <label><span>Link Google Drive/Docs</span><input type="url" value={driveUrl} onChange={(event) => setDriveUrl(event.target.value)} placeholder="https://drive.google.com/…" /></label>
          <p className="workspace-period-help form-span-2">Links externos aceitam somente HTTPS nos hosts exatos drive.google.com ou docs.google.com. Abrirão em nova aba; o acesso depende das permissões configuradas no Google.</p>
          {error && <p className="workspace-dialog-error form-span-2" role="alert">{error}</p>}
          <div className="workspace-dialog-actions form-span-2">
            <button type="button" className="workspace-cancel-button" onClick={onClose} disabled={busy}>Cancelar</button>
            <button type="submit" className="workspace-save-button" disabled={busy || areas.length === 0}>
              {busy ? 'Salvando…' : activity ? 'Salvar alterações' : 'Criar atividade'}
            </button>
          </div>
          {areas.length === 0 && <p className="workspace-dialog-error form-span-2">Não há áreas ativas disponíveis no Supabase; não é possível salvar uma atividade.</p>}
        </form>
      </section>
    </div>
  );
}
