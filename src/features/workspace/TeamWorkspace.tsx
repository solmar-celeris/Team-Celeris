import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CalendarDays, Check, ClipboardList, Folder, Megaphone, MessageCircle, Trash2, X, type LucideIcon } from 'lucide-react';
import {
  activityTypeLabels,
  addDays,
  buildCycleWeeks,
  canManageActivity,
  canUpdateActivityWeek,
  formatShortDate,
  formatWeekRange,
  generalStatusLabels,
  getGeneralStatus,
  isActivityExpected,
  type Activity,
  type ActivityType,
  type Area,
  type GeneralStatus,
  type MemberProfile,
  type Nucleus,
  type WeeklyStatus,
  type WeeklyUpdate,
  weeklyStatusLabels,
} from './domain';
import ProfileMenu from '../profile/ProfileMenu';
import SharedContentWorkspace from './SharedContentWorkspace';
import TeamChat from './TeamChat';
import WebPushControl from './WebPushControl';
import { flushPendingWorkspacePushEvents, notifyActivityChange, notifyWorkspacePush } from '../../lib/notifications';
import './workspace.css';

type TeamWorkspaceProps = {
  client: SupabaseClient;
  userId: string;
  profile: MemberProfile;
  onLogout: () => void;
};

type TeamSettings = { cycle_start: string; cycle_weeks: number };
type ActivityMember = Pick<MemberProfile, 'user_id' | 'full_name' | 'area_id' | 'role' | 'status'>;
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
};
type FilterState = {
  search: string;
  responsible: string;
  nucleus: string;
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
};
type WeeklyDraft = { status: WeeklyStatus; justification: string };
type WorkspaceTab = 'week' | 'activities' | 'files' | 'announcements' | 'chat';
const workspaceTabs: { id: WorkspaceTab; label: string; icon: LucideIcon }[] = [
  { id: 'chat', label: 'Chat', icon: MessageCircle },
  { id: 'announcements', label: 'Comunicados', icon: Megaphone },
  { id: 'week', label: 'Semana', icon: CalendarDays },
  { id: 'activities', label: 'Atividades', icon: ClipboardList },
  { id: 'files', label: 'Arquivos', icon: Folder },
];

const defaultFilters: FilterState = {
  search: '', responsible: '', nucleus: '', area: '', type: '', status: '', from: '', to: '',
};

const roleLabels: Record<MemberProfile['role'], string> = {
  admin: 'Administrador',
  area_lead: 'Líder de área',
  member: 'Membro',
  reader: 'Leitor',
};

const defaultCycleStart = '2026-11-09';
const defaultCycleWeeks = 60;

function errorText(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'Ocorreu um erro inesperado. Confira sua conexão e tente novamente.';
}

async function fetchCycleUpdates(client: SupabaseClient, start: string, end: string): Promise<WeeklyUpdate[]> {
  const allUpdates: WeeklyUpdate[] = [];
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const { data, error } = await client
      .from('weekly_updates')
      .select('id,activity_id,week_start,status,justification,updated_by,updated_at')
      .gte('week_start', start)
      .lte('week_start', end)
      .order('week_start', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as unknown as WeeklyUpdate[];
    allUpdates.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }

  return allUpdates;
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

function statusClass(status: GeneralStatus | WeeklyStatus): string {
  return `status-${status}`;
}

export default function TeamWorkspace({ client, userId, profile, onLogout }: TeamWorkspaceProps) {
  const [tab, setTab] = useState<WorkspaceTab>('week');
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
  );
  const [activities, setActivities] = useState<Activity[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [nuclei, setNuclei] = useState<Nucleus[]>([]);
  const [members, setMembers] = useState<ActivityMember[]>([]);
  const [displayName, setDisplayName] = useState(profile.full_name || 'Integrante');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [updates, setUpdates] = useState<WeeklyUpdate[]>([]);
  const [cycleStart, setCycleStart] = useState(defaultCycleStart);
  const [cycleWeeksCount, setCycleWeeksCount] = useState(defaultCycleWeeks);
  const [selectedWeekStart, setSelectedWeekStart] = useState(defaultCycleStart);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingActivity, setSavingActivity] = useState(false);
  const [removingActivityId, setRemovingActivityId] = useState<string | null>(null);
  const [confirmRemoveActivityId, setConfirmRemoveActivityId] = useState<string | null>(null);
  const [savingWeeklyId, setSavingWeeklyId] = useState<string | null>(null);
  const [dialogActivity, setDialogActivity] = useState<Activity | null | false>(false);
  const [drafts, setDrafts] = useState<Record<string, WeeklyDraft>>({});
  const [errorMessage, setErrorMessage] = useState('');
  const [feedback, setFeedback] = useState('');
  const [dialogError, setDialogError] = useState('');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const loadData = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setErrorMessage('');

    try {
      const { data: settingsData, error: settingsError } = await client
        .from('team_settings')
        .select('cycle_start,cycle_weeks')
        .eq('id', 1)
        .maybeSingle();
      if (settingsError) throw settingsError;
      const settings = settingsData as TeamSettings | null;
      const nextCycleStart = settings?.cycle_start ?? defaultCycleStart;
      const nextCount = Math.max(1, Math.min(60, settings?.cycle_weeks ?? defaultCycleWeeks));
      const cycleEnd = addDays(nextCycleStart, nextCount * 7 - 1);

      const [activityResult, areaResult, nucleusResult, profileResult] = await Promise.all([
        client.from('activities')
          .select('id,code,area_id,name,description,activity_type,frequency,execution_condition,responsible_name,responsible_user_id,start_date,due_date,expected_deliverable,notes,created_at,updated_at,archived_at')
          .is('archived_at', null)
          .order('code', { ascending: true }),
        client.from('areas')
          .select('id,name,code_prefix,nucleus_id,is_active')
          .eq('is_active', true)
          .order('name', { ascending: true }),
        client.from('nuclei')
          .select('id,name')
          .order('name', { ascending: true }),
        client.from('profiles')
          .select('user_id,full_name,area_id,role,status')
          .eq('status', 'active')
          .order('full_name', { ascending: true }),
      ]);
      const failure = activityResult.error ?? areaResult.error ?? nucleusResult.error ?? profileResult.error;
      if (failure) throw failure;

      const activitiesFromDatabase = (activityResult.data ?? []) as unknown as Activity[];
      const nextAreas = (areaResult.data ?? []) as unknown as Area[];
      const nextNuclei = (nucleusResult.data ?? []) as unknown as Nucleus[];
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
      const nextUpdates = await fetchCycleUpdates(client, nextCycleStart, cycleEnd);

      setCycleStart(nextCycleStart);
      setCycleWeeksCount(nextCount);
      setSelectedWeekStart((current) => {
        const validStarts = new Set(buildCycleWeeks(nextCycleStart, nextCount).map((week) => week.start));
        return validStarts.has(current) ? current : nextCycleStart;
      });
      setActivities(nextActivities);
      setAreas(nextAreas);
      setNuclei(nextNuclei);
      setMembers(nextMembers);
      setUpdates(nextUpdates);
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

  const weeks = useMemo(() => buildCycleWeeks(cycleStart, cycleWeeksCount), [cycleStart, cycleWeeksCount]);
  const selectedWeek = weeks.find((week) => week.start === selectedWeekStart) ?? weeks[0];
  const cycleEnd = weeks.at(-1)?.end ?? addDays(cycleStart, cycleWeeksCount * 7 - 1);

  const areasById = useMemo(() => new Map(areas.map((area) => [area.id, area])), [areas]);
  const nucleiById = useMemo(() => new Map(nuclei.map((nucleus) => [nucleus.id, nucleus])), [nuclei]);
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
    const nextDrafts: Record<string, WeeklyDraft> = {};
    for (const activity of activities) {
      const update = updatesForWeek.get(activity.id);
      nextDrafts[activity.id] = {
        status: update?.status ?? 'not_started',
        justification: update?.justification ?? '',
      };
    }
    setDrafts(nextDrafts);
  }, [activities, updatesForWeek]);

  const generalStatusById = useMemo(() => {
    const result = new Map<string, GeneralStatus>();
    for (const activity of activities) {
      result.set(activity.id, getGeneralStatus(activity, updatesByActivity.get(activity.id) ?? []));
    }
    return result;
  }, [activities, updatesByActivity]);

  const expectedActivities = useMemo(() => {
    if (!selectedWeek) return [];
    return activities.filter((activity) => isActivityExpected(
      activity,
      selectedWeek,
      cycleStart,
      cycleEnd,
      updatesByActivity.get(activity.id) ?? [],
    ));
  }, [activities, cycleEnd, cycleStart, selectedWeek, updatesByActivity]);

  const responsibleNames = useMemo(() => [...new Set(activities.map((activity) => activity.responsible_name.trim() || 'A definir'))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [activities]);

  const visibleActivities = useMemo(() => {
    const source = tab === 'week' ? expectedActivities : activities;
    const search = filters.search.trim().toLocaleLowerCase('pt-BR');
    return source.filter((activity) => {
      const area = areasById.get(activity.area_id);
      const nucleus = area ? nucleiById.get(area.nucleus_id) : undefined;
      const status = tab === 'week'
        ? (updatesForWeek.get(activity.id)?.status ?? 'not_started')
        : generalStatusById.get(activity.id) ?? 'not_started';
      const haystack = [activity.code, activity.name, activity.description, activity.responsible_name, activity.expected_deliverable]
        .join(' ').toLocaleLowerCase('pt-BR');
      if (search && !haystack.includes(search)) return false;
      if (filters.responsible && activity.responsible_name !== filters.responsible) return false;
      if (filters.nucleus && nucleus?.id !== filters.nucleus) return false;
      if (filters.area && activity.area_id !== filters.area) return false;
      if (filters.type && activity.activity_type !== filters.type) return false;
      if (filters.status && status !== filters.status) return false;
      const activityStart = activity.start_date ?? '0001-01-01';
      const activityEnd = activity.due_date ?? '9999-12-31';
      if (filters.from && activityEnd < filters.from) return false;
      if (filters.to && activityStart > filters.to) return false;
      return true;
    });
  }, [activities, areasById, expectedActivities, filters, generalStatusById, nucleiById, tab, updatesForWeek]);

  const permissionSummary = profile.role === 'admin'
    ? 'Você pode editar atividades e registrar status em toda a equipe.'
    : profile.role === 'area_lead'
      ? `Você lidera ${areasById.get(profile.area_id ?? '')?.name ?? 'sua área'}; as permissões de gravação também são conferidas pelo banco.`
      : profile.role === 'member'
        ? 'Você pode atualizar status das atividades vinculadas à sua conta; a edição também é conferida pelo banco.'
        : 'Seu perfil é somente leitura.';

  async function saveActivity(form: ActivityFormState) {
    const validation = validateActivity(form);
    if (validation) {
      setDialogError(validation);
      return;
    }
    setSavingActivity(true);
    setDialogError('');
    const payload = buildMutation(form, members);
    const oldResponsibleUserId = dialogActivity ? dialogActivity.responsible_user_id : null;
    const shouldNotifyAssignee = Boolean(payload.responsible_user_id)
      && payload.responsible_user_id !== oldResponsibleUserId;
    let savedActivityId = '';
    try {
      if (dialogActivity) {
        const { data, error } = await client.from('activities')
          .update(payload)
          .eq('id', dialogActivity.id)
          .select('id')
          .single();
        if (error) throw error;
        savedActivityId = data.id;
        setFeedback('Atividade atualizada.');
      } else {
        const { data, error } = await client.from('activities').insert(payload).select('id').single();
        if (error) throw error;
        savedActivityId = data.id;
        setFeedback('Atividade cadastrada. O código foi gerado pelo banco.');
      }
      setDialogActivity(false);
      if (shouldNotifyAssignee) {
        void notifyWorkspacePush(client, 'activity_assigned', savedActivityId).then((result) => {
          if (result === 'failed') {
            setFeedback('Atividade salva, mas o push da nova atribuição não foi enviado. A atividade continua salva.');
          }
        });
      }
      await loadData(true);
      void notifyActivityChange(client, 'activities', savedActivityId).then((result) => {
        if (result.status === 'failed') {
          setFeedback('Atividade salva, mas o aviso por e-mail não pôde ser enviado. A atividade continua salva.');
        }
      });
    } catch (error) {
      setDialogError(`Não foi possível salvar. Confira sua permissão e os dados: ${errorText(error)}`);
    } finally {
      setSavingActivity(false);
    }
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
    const draft = drafts[activity.id] ?? { status: 'not_started' as WeeklyStatus, justification: '' };
    if (draft.status === 'pending' && !draft.justification.trim()) {
      setFeedback('Para registrar Pendente, escreva uma justificativa.');
      return;
    }
    if (!selectedWeek) return;
    setSavingWeeklyId(activity.id);
    setFeedback('');
    try {
      const { data, error } = await client.from('weekly_updates').upsert({
        activity_id: activity.id,
        week_start: selectedWeek.start,
        status: draft.status,
        justification: draft.status === 'pending' ? draft.justification.trim() : '',
      }, { onConflict: 'activity_id,week_start' }).select('id').single();
      if (error) throw error;
      setFeedback(`Status de ${activity.code} salvo para a semana ${selectedWeek.number}.`);
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

  return (
    <section className="workspace-screen" aria-label="Espaço de trabalho SolMar Celeris">
      <header className="workspace-topbar">
        <a className="workspace-brand" href="#workspace" aria-label="SolMar Celeris">
          <img src="/assets/celeris-logo.png" alt="" />
          <span><strong>SolMar Celeris</strong><small>UFCI/RJ · ESPAÇO DA EQUIPE</small></span>
        </a>
        <div className="workspace-top-actions">
          <span className="workspace-role"><i aria-hidden="true" />{roleLabels[profile.role]}</span>
          <button
            className="workspace-icon-button"
            type="button"
            onClick={() => setTheme((current) => current === 'light' ? 'dark' : 'light')}
            aria-label={theme === 'light' ? 'Ativar modo escuro' : 'Ativar modo claro'}
            title={theme === 'light' ? 'Modo escuro' : 'Modo claro'}
          >{theme === 'light' ? '☾' : '☼'}</button>
          <ProfileMenu
            client={client}
            userId={userId}
            fallbackName={displayName}
            photoUrl={avatarUrl}
            onUpdated={handleProfileUpdated}
          />
          <button className="workspace-logout" type="button" onClick={onLogout}>Sair</button>
        </div>
      </header>

      <div className="workspace-push-banner"><WebPushControl /></div>

      <div className="workspace-frame">
        <aside className="workspace-sidebar" aria-label="Navegação do espaço da equipe">
          <p className="workspace-sidebar-label">ROTINA DA EQUIPE</p>
          <nav className="workspace-nav">
            {workspaceTabs.map(({ id, label, icon: Icon }) => (
              <button key={id} type="button" className={tab === id ? 'is-active' : ''} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}>
                <span className="workspace-nav-icon"><Icon aria-hidden="true" /></span>
                <span className="workspace-nav-label">{label}</span>
              </button>
            ))}
          </nav>
          <div className="workspace-side-card">
            <span className="workspace-side-mark" aria-hidden="true">↗</span>
            <p>Uma equipe,<br /><strong>uma rota.</strong></p>
            <small>{displayName}</small>
          </div>
        </aside>

        <main className="workspace-main" id="workspace">
          <div className="workspace-page-heading">
            <div>
              <p className="workspace-kicker">{tab === 'week' ? 'ACOMPANHAMENTO SEMANAL' : tab === 'activities' ? 'CADASTRO DA EQUIPE' : tab === 'files' ? 'LINKS COMPARTILHADOS' : tab === 'announcements' ? 'MURAL DA EQUIPE' : 'CONVERSA EM TEMPO REAL'}</p>
              <h1>{tab === 'week' ? 'Semana em movimento.' : tab === 'activities' ? 'Atividades da equipe.' : tab === 'files' ? 'Arquivos da equipe.' : tab === 'announcements' ? 'Comunicados da equipe.' : 'Chat da equipe.'}</h1>
              <p className="workspace-subtitle">{tab === 'week'
                ? 'Registre o que avançou e sinalize o que precisa de atenção.'
                : tab === 'activities'
                  ? 'Consulte, filtre e mantenha as atividades do ciclo atualizadas.'
                  : tab === 'files'
                    ? 'Acesse atalhos visuais para as pastas compartilhadas.'
                    : tab === 'announcements'
                      ? 'Compartilhe avisos com toda a equipe ou com uma área.'
                      : 'Converse com todos os integrantes ativos em uma sala compartilhada.'}</p>
            </div>
            <div className="workspace-heading-actions">
              {(tab === 'week' || tab === 'activities') && <span className="workspace-cycle-chip">CICLO · {cycleWeeksCount} SEMANAS</span>}
              {(tab === 'week' || tab === 'activities') && <button className="workspace-refresh" type="button" onClick={() => void loadData(true)} disabled={loading || refreshing}>
                {refreshing ? 'Atualizando…' : '↻ Atualizar'}
              </button>}
              {tab === 'activities' && (profile.role === 'admin' || profile.role === 'area_lead') && (
                <button className="workspace-add-button" type="button" onClick={() => { setDialogError(''); setDialogActivity(null); }}>
                  <span aria-hidden="true">+</span> Nova atividade
                </button>
              )}
            </div>
          </div>

          {(tab === 'week' || tab === 'activities') && <p className="workspace-permission-note">{permissionSummary}</p>}

          {errorMessage && (
            <div className="workspace-alert workspace-alert-error" role="alert">
              <strong>Não foi possível carregar as informações.</strong>
              <p>{errorMessage}</p>
              <span>Confira se o banco recebeu a migração e se este usuário tem perfil ativo. Não altere as políticas RLS para contornar o erro.</span>
            </div>
          )}
          {feedback && <p className="workspace-feedback" role="status">{feedback}</p>}

          {(tab === 'week' || tab === 'activities') && <div className="workspace-filter-panel">
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
              <span>Núcleo</span>
              <select value={filters.nucleus} onChange={(event) => { updateFilter('nucleus', event.target.value); updateFilter('area', ''); }}>
                <option value="">Todos</option>
                {nuclei.map((nucleus) => <option key={nucleus.id} value={nucleus.id}>{nucleus.name}</option>)}
              </select>
            </label>
            <label>
              <span>Área</span>
              <select value={filters.area} onChange={(event) => updateFilter('area', event.target.value)}>
                <option value="">Todas</option>
                {areas.filter((area) => !filters.nucleus || area.nucleus_id === filters.nucleus).map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}
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
              <span>{tab === 'week' ? 'Status da semana' : 'Situação geral'}</span>
              <select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}>
                <option value="">Todos</option>
                {(Object.keys(generalStatusLabels) as GeneralStatus[]).map((status) => <option key={status} value={status}>{generalStatusLabels[status]}</option>)}
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

          {tab === 'week' && (
            <section className="workspace-week-section" aria-labelledby="selected-week-title">
              <div className="workspace-week-heading">
                <div>
                  <p className="workspace-kicker">REGISTRO DA SEMANA</p>
                  <h2 id="selected-week-title">{selectedWeek ? formatWeekRange(selectedWeek) : 'Ciclo sem semanas'}</h2>
                  <p>{selectedWeek ? `Semana ${selectedWeek.number} de ${cycleWeeksCount} · ${expectedActivities.length} atividade(s) esperada(s)` : 'Configure o ciclo do time no Supabase.'}</p>
                </div>
                <label className="workspace-week-picker">
                  <span>Selecionar semana</span>
                  <select value={selectedWeekStart} onChange={(event) => setSelectedWeekStart(event.target.value)}>
                    {weeks.map((week) => <option key={week.start} value={week.start}>Semana {String(week.number).padStart(2, '0')} · {formatWeekRange(week)}</option>)}
                  </select>
                </label>
              </div>

              {loading ? <WorkspaceLoading /> : visibleActivities.length === 0 ? (
                <EmptyState title={activities.length === 0 ? 'Nenhuma atividade foi encontrada.' : 'Nada previsto com estes filtros.'}>
                  {activities.length === 0
                    ? 'Confirme no SQL Editor se a migração foi aplicada no Supabase que este site está usando.'
                    : 'Tente outra semana ou limpe os filtros. Atividades aparecem aqui de acordo com sua frequência e janela de datas.'}
                </EmptyState>
              ) : (
                <div className="workspace-week-list">
                  {visibleActivities.map((activity) => {
                    const saved = updatesForWeek.get(activity.id);
                    const draft = drafts[activity.id] ?? { status: 'not_started' as WeeklyStatus, justification: '' };
                    const area = areasById.get(activity.area_id);
                    const nucleus = area ? nucleiById.get(area.nucleus_id) : undefined;
                    const mayUpdate = canUpdateActivityWeek(profile, userId, activity);
                    return (
                      <article className="workspace-week-card" key={activity.id}>
                        <div className="workspace-week-card-main">
                          <div className="workspace-activity-meta">
                            <span className="workspace-code">{activity.code}</span>
                            <span>{nucleus?.name ?? 'Núcleo'}</span><i />
                            <span>{area?.name ?? 'Área'}</span>
                            {!saved && <span className="workspace-no-update">Sem atualização</span>}
                          </div>
                          <h3>{activity.name}</h3>
                          <p>{activity.description || activity.expected_deliverable || 'Sem descrição.'}</p>
                          <div className="workspace-detail-line">
                            <span>Responsável: <strong>{activity.responsible_name || 'A definir'}</strong></span>
                            {activity.due_date && <span>Prazo: <strong>{formatShortDate(activity.due_date)}</strong></span>}
                          </div>
                        </div>
                        <div className="workspace-week-editor">
                          <label>
                            <span>Status</span>
                            <select
                              value={draft.status}
                              disabled={!mayUpdate || savingWeeklyId === activity.id}
                              onChange={(event) => setDrafts((current) => ({
                                ...current,
                                [activity.id]: { ...draft, status: event.target.value as WeeklyStatus },
                              }))}
                            >
                              {(Object.keys(weeklyStatusLabels) as WeeklyStatus[]).map((status) => <option key={status} value={status}>{weeklyStatusLabels[status]}</option>)}
                            </select>
                          </label>
                          {draft.status === 'pending' && (
                            <label className="workspace-justification">
                              <span>Justificativa <b>obrigatória</b></span>
                              <textarea
                                value={draft.justification}
                                disabled={!mayUpdate || savingWeeklyId === activity.id}
                                rows={2}
                                onChange={(event) => setDrafts((current) => ({
                                  ...current,
                                  [activity.id]: { ...draft, justification: event.target.value },
                                }))}
                                placeholder="Explique o que impediu o avanço."
                              />
                            </label>
                          )}
                          <div className="workspace-week-actions">
                            {!mayUpdate && <span className="workspace-read-only">Somente leitura</span>}
                            {mayUpdate && (
                              <button type="button" onClick={() => void saveWeekly(activity)} disabled={savingWeeklyId === activity.id}>
                                {savingWeeklyId === activity.id ? 'Salvando…' : 'Salvar status'}
                              </button>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {tab === 'activities' && (
            <section className="workspace-activities-section" aria-labelledby="activity-list-title">
              <div className="workspace-list-heading">
                <div>
                  <p className="workspace-kicker">LISTA OPERACIONAL</p>
                  <h2 id="activity-list-title">Atividades cadastradas</h2>
                </div>
                <span className="workspace-count">{visibleActivities.length} de {activities.length}</span>
              </div>
              {loading ? <WorkspaceLoading /> : visibleActivities.length === 0 ? (
                <EmptyState title={activities.length === 0 ? 'Ainda não há atividades no banco.' : 'Nenhuma atividade corresponde aos filtros.'}>
                  {activities.length === 0
                    ? 'Se esperava encontrar as 58 atividades iniciais, confirme que a migração foi executada no Supabase conectado a este site.'
                    : 'Limpe os filtros ou tente outra busca.'}
                </EmptyState>
              ) : (
                <div className="workspace-activity-list">
                  {visibleActivities.map((activity) => {
                    const area = areasById.get(activity.area_id);
                    const nucleus = area ? nucleiById.get(area.nucleus_id) : undefined;
                    const status = generalStatusById.get(activity.id) ?? 'not_started';
                    const canEdit = canManageActivity(profile, activity.area_id);
                    return (
                      <article className="workspace-activity-card" key={activity.id}>
                        <div className="workspace-activity-card-head">
                          <span className="workspace-code">{activity.code}</span>
                          <span className={`workspace-status ${statusClass(status)}`}>{generalStatusLabels[status]}</span>
                        </div>
                        <h3>{activity.name}</h3>
                        <p className="workspace-activity-description">{activity.description || 'Sem descrição.'}</p>
                        <div className="workspace-activity-facts">
                          <span><small>Núcleo</small><strong>{nucleus?.name ?? '—'}</strong></span>
                          <span><small>Área</small><strong>{area?.name ?? '—'}</strong></span>
                          <span><small>Tipo</small><strong>{activityTypeLabels[activity.activity_type]}</strong></span>
                          <span><small>Responsável</small><strong>{activity.responsible_name || 'A definir'}</strong></span>
                          <span><small>Início</small><strong>{activity.start_date ? formatShortDate(activity.start_date) : '—'}</strong></span>
                          <span><small>Prazo</small><strong>{activity.due_date ? formatShortDate(activity.due_date) : '—'}</strong></span>
                        </div>
                        {(activity.frequency || activity.execution_condition) && (
                          <p className="workspace-activity-extra"><strong>{activity.activity_type === 'rotina' ? activity.frequency : activity.execution_condition || activity.frequency}</strong></p>
                        )}
                        {activity.expected_deliverable && <p className="workspace-activity-deliverable"><small>Entregável esperado</small>{activity.expected_deliverable}</p>}
                        {activity.notes && <p className="workspace-activity-notes"><small>Observações</small>{activity.notes}</p>}
                        <div className="workspace-activity-card-foot">
                          <span>{canEdit ? 'Edição autorizada para seu perfil e área' : profile.role === 'reader' ? 'Perfil somente leitura' : 'Visualização; edição depende do perfil e da área'}</span>
                          {canEdit && (
                            <div className="workspace-activity-actions">
                              <button type="button" onClick={() => { setDialogError(''); setDialogActivity(activity); }}>Editar atividade</button>
                              {confirmRemoveActivityId === activity.id ? (
                                <div className="workspace-activity-remove-confirm" role="group" aria-label={`Confirmar remoção de ${activity.code}`}>
                                  <span>Remover?</span>
                                  <button type="button" className="workspace-activity-confirm-remove" onClick={() => void removeActivity(activity)} disabled={removingActivityId === activity.id}>
                                    <Check size={13} aria-hidden="true" />{removingActivityId === activity.id ? 'Removendo…' : 'Confirmar'}
                                  </button>
                                  <button type="button" className="workspace-activity-cancel-remove" onClick={() => setConfirmRemoveActivityId(null)} disabled={removingActivityId === activity.id}>
                                    <X size={13} aria-hidden="true" />Cancelar
                                  </button>
                                </div>
                              ) : (
                                <button type="button" className="workspace-activity-remove" onClick={() => setConfirmRemoveActivityId(activity.id)}>
                                  <Trash2 size={13} aria-hidden="true" />Remover
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {(tab === 'files' || tab === 'announcements') && (
            <SharedContentWorkspace client={client} mode={tab} areas={areas} members={members} />
          )}
          {tab === 'chat' && (
            <TeamChat client={client} userId={userId} isAdmin={profile.role === 'admin'} members={members} />
          )}

          <footer className="workspace-footer"><span>UFCI/RJ</span><i />SolMar Celeris <small>· DADOS DO SUPABASE</small></footer>
        </main>
      </div>

      {dialogActivity !== false && (
        <ActivityDialog
          activity={dialogActivity}
          areas={areas}
          members={members}
          busy={savingActivity}
          error={dialogError}
          onClose={() => { if (!savingActivity) { setDialogActivity(false); setDialogError(''); } }}
          onSave={(form) => void saveActivity(form)}
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
  onSave: (form: ActivityFormState) => void;
}) {
  const [form, setForm] = useState<ActivityFormState>(() => makeFormState(activity, areas[0]?.id ?? ''));

  useEffect(() => {
    setForm(makeFormState(activity, areas[0]?.id ?? ''));
  }, [activity, areas]);

  function change<K extends keyof ActivityFormState>(key: K, value: ActivityFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave(form);
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
