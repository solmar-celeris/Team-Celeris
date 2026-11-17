import { useEffect, useMemo, useState } from 'react';
import {
  Activity, CalendarDays, Clock3, Megaphone, BookOpen, Newspaper, Search, Filter,
  Plus, Pencil, MessageCircle, Video, Heart, ChevronLeft, ChevronRight, LogIn, RefreshCw,
  type LucideIcon,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

type PublicTab = 'feed' | 'activities' | 'calendar' | 'availability' | 'announcements' | 'norms';
type Row = Record<string, any>;

export const publicPortalTabs: { id: PublicTab; label: string; icon: LucideIcon }[] = [
  { id: 'feed', label: 'Feed', icon: Newspaper },
  { id: 'activities', label: 'Atividades', icon: Activity },
  { id: 'calendar', label: 'Calendário', icon: CalendarDays },
  { id: 'availability', label: 'Disponibilidades', icon: Clock3 },
  { id: 'announcements', label: 'Comunicados', icon: Megaphone },
  { id: 'norms', label: 'Normas', icon: BookOpen },
];

const weekdays = [
  { id: 1, label: 'Segunda-feira', short: 'Seg.' },
  { id: 2, label: 'Terça-feira', short: 'Ter.' },
  { id: 3, label: 'Quarta-feira', short: 'Qua.' },
  { id: 4, label: 'Quinta-feira', short: 'Qui.' },
  { id: 5, label: 'Sexta-feira', short: 'Sex.' },
];
const statusLabels: Record<string, string> = {
  completed: 'Concluído', in_progress: 'Em andamento', pending: 'Pendente',
  not_applicable: 'Não se aplica', not_started: 'Não iniciado',
  backlog: 'Backlog', ready: 'A fazer', blocked: 'Bloqueada', done: 'Concluído',
};
const dateLabel = (value?: string | null) => value
  ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR')
  : 'Data não informada';
const timeLabel = (value?: string | null) => value ? value.slice(0, 5) : '';
const statusLabel = (value?: string | null) => statusLabels[value ?? ''] ?? value ?? 'Sem registro';
const loginHref = (tab: PublicTab) => `/?tab=${encodeURIComponent(tab)}`;

export default function PublicWorkspace() {
  const [tab, setTab] = useState<PublicTab>(() => {
    const requested = new URLSearchParams(window.location.search).get('tab');
    return publicPortalTabs.some((item) => item.id === requested) ? requested as PublicTab : 'feed';
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [month, setMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  });
  const [data, setData] = useState<Record<PublicTab | 'weekly', Row[]>>({
    feed: [], activities: [], calendar: [], availability: [], announcements: [], norms: [], weekly: [],
  });

  const requireLogin = () => { window.location.assign(loginHref(tab)); };
  useEffect(() => {
    let active = true;
    if (!supabase) {
      setLoading(false);
      setError('A conexão com o portal ainda não está configurada.');
      return;
    }
    void (async () => {
      setLoading(true);
      setError('');
      const sources: [keyof typeof data, string, string][] = [
        ['feed', 'public_public_feed', 'created_at'],
        ['activities', 'public_public_activities', 'name'],
        ['calendar', 'public_public_calendar_events', 'event_date'],
        ['availability', 'public_public_availability', 'weekday'],
        ['announcements', 'public_public_announcements', 'created_at'],
        ['norms', 'public_public_norms', 'title'],
        ['weekly', 'public_public_weekly_updates', 'week_start'],
      ];
      const results = await Promise.all(sources.map(async ([key, view, order]) => {
        const { data: rows, error: queryError } = await supabase!
          .from(view).select('*').order(order, { ascending: key === 'activities' || key === 'norms' || key === 'availability' });
        return { key, rows: (rows ?? []) as Row[], error: queryError };
      }));
      if (!active) return;
      const failed = results.find((result) => result.error);
      if (failed) setError('Não foi possível carregar todas as informações públicas. Atualize a página para tentar novamente.');
      else setData(Object.fromEntries(results.map(({ key, rows }) => [key, rows])) as typeof data);
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  const weeklyByActivity = useMemo(() => {
    const grouped = new Map<string, Row[]>();
    for (const update of data.weekly) {
      const current = grouped.get(update.activity_id) ?? [];
      current.push(update);
      grouped.set(update.activity_id, current);
    }
    return grouped;
  }, [data.weekly]);

  const areas = useMemo(() => [...new Set(data.activities.map((item) => item.area_name).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR')), [data.activities]);
  const filteredActivities = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('pt-BR');
    return data.activities.filter((item) => {
      const text = [item.code, item.name, item.description, item.responsible_name, item.area_name, item.expected_deliverable].join(' ').toLocaleLowerCase('pt-BR');
      if (term && !text.includes(term)) return false;
      if (areaFilter && item.area_name !== areaFilter) return false;
      if (statusFilter && item.flow_status !== statusFilter) return false;
      return true;
    });
  }, [areaFilter, data.activities, query, statusFilter]);

  const monthDays = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const cells = Math.ceil((offset + count) / 7) * 7;
    return Array.from({ length: cells }, (_, index) => {
      const day = index - offset + 1;
      const date = new Date(month.getFullYear(), month.getMonth(), day);
      return { day: date.getDate(), date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`, inMonth: day > 0 && day <= count };
    });
  }, [month]);
  const eventsByDate = useMemo(() => {
    const grouped = new Map<string, Row[]>();
    for (const event of data.calendar) grouped.set(event.event_date, [...(grouped.get(event.event_date) ?? []), event]);
    return grouped;
  }, [data.calendar]);
  const selectedEvents = eventsByDate.get(selectedDate) ?? [];

  function selectTab(nextTab: PublicTab) {
    setTab(nextTab);
    const url = new URL(window.location.href);
    url.searchParams.set('public', '1');
    url.searchParams.set('tab', nextTab);
    window.history.replaceState({}, '', url);
    setQuery('');
    setAreaFilter('');
    setStatusFilter('');
  }
  function moveMonth(delta: number) {
    const next = new Date(month.getFullYear(), month.getMonth() + delta, 1);
    setMonth(next);
    setSelectedDate(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`);
  }

  const currentLabel = publicPortalTabs.find((item) => item.id === tab)?.label ?? 'Feed';
  return (
    <section className="workspace-screen" aria-label="Espaço público Team Celeris">
      <header className="workspace-topbar">
        <a className="workspace-brand" href="/?public=1" aria-label="Team Celeris"><img src="/assets/solmar-celeris-site-logo.png" alt="SolMar Celeris" /></a>
        <div className="workspace-top-actions">
          <span className="workspace-cycle-chip">VISITANTE · SOMENTE LEITURA</span>
          <a className="workspace-refresh" href={loginHref(tab)}><LogIn size={15} aria-hidden="true" /> Entrar na equipe</a>
        </div>
        <nav className="workspace-nav workspace-desktop-nav" aria-label="Navegação principal">
          {publicPortalTabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" title={label} aria-label={label} className={tab === id ? 'is-active' : ''} onClick={() => selectTab(id)} aria-current={tab === id ? 'page' : undefined}><span className="workspace-nav-icon"><Icon aria-hidden="true" /></span><span className="workspace-nav-label">{label}</span></button>)}
        </nav>
      </header>
      <nav className="workspace-nav workspace-bottom-nav" aria-label="Navegação principal">
        {publicPortalTabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" title={label} aria-label={label} className={tab === id ? 'is-active' : ''} onClick={() => selectTab(id)} aria-current={tab === id ? 'page' : undefined}><span className="workspace-nav-icon"><Icon aria-hidden="true" /></span><span className="workspace-nav-label">{label}</span></button>)}
      </nav>
      <div className="workspace-public-floaters" aria-label="Acesso à equipe">
        <a className="workspace-public-floater is-meetings" href="/?tab=meetings" aria-label="Entrar para acessar Reuniões" title="Reuniões"><Video aria-hidden="true" /></a>
        <a className="workspace-public-floater is-chat" href="/?tab=chat" aria-label="Entrar para acessar o Chat" title="Chat"><MessageCircle aria-hidden="true" /></a>
      </div>
      <div className="workspace-frame">
        <main className="workspace-main is-home-page" id="workspace">
          <div className="workspace-page-heading">
            <div><p className="workspace-kicker">SOLMAR CELERIS · UFCI/RJ · ACESSO PÚBLICO</p><h1>{currentLabel}</h1><p className="workspace-subtitle">Visualização pública do workspace original. Para criar, editar, responder ou interagir, entre na equipe.</p></div>
            <div className="workspace-heading-actions"><span className="workspace-cycle-chip">SOMENTE LEITURA</span><button className="workspace-refresh" type="button" onClick={() => window.location.reload()} disabled={loading}><RefreshCw size={15} aria-hidden="true" /> Atualizar</button></div>
          </div>

          {tab === 'activities' && <div className="workspace-toolbar workspace-public-toolbar">
            <label className="workspace-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar atividade, responsável ou área…" /></label>
            <label className="workspace-filter"><Filter size={15} /><select value={areaFilter} onChange={(event) => setAreaFilter(event.target.value)}><option value="">Todas as áreas</option>{areas.map((area) => <option key={area} value={area}>{area}</option>)}</select></label>
            <label className="workspace-filter"><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">Todas as etapas</option><option value="backlog">Backlog</option><option value="ready">A fazer</option><option value="in_progress">Fazendo</option><option value="blocked">Bloqueada</option><option value="done">Feito</option></select></label>
            <button className="workspace-primary-button" type="button" onClick={requireLogin}><Plus size={15} /> Criar atividade <span>Entrar</span></button>
          </div>}

          <section className="workspace-public-content" aria-live="polite">
            {loading ? <div className="workspace-loading" role="status"><span />Carregando informações públicas…</div> :
              error ? <div className="workspace-alert workspace-alert-error" role="alert"><strong>Não foi possível carregar as informações públicas.</strong><p>{error}</p></div> : <>
                {tab === 'feed' && <div className="workspace-feed-list">
                  {data.activities.length ? [...data.activities]
                    .sort((a, b) => String(b.updated_at || b.created_at || b.due_date || '').localeCompare(String(a.updated_at || a.created_at || a.due_date || '')))
                    .map((item) => <article className="workspace-feed-card" key={item.id}>
                    <div className="workspace-feed-card-header"><span className="workspace-feed-type">ATIVIDADE</span><time>{item.updated_at || item.created_at ? dateLabel(item.updated_at || item.created_at) : item.due_date ? `Prazo: ${dateLabel(item.due_date)}` : 'Em andamento'}</time></div>
                    <h2>{item.name}</h2>
                    <span className={`activity-status-badge status-${item.flow_status || 'pending'}`}>{statusLabel(item.flow_status)}</span>
                    {item.description && <p className="workspace-feed-body">{item.description}</p>}
                    <div className="workspace-feed-activity-meta">
                      <span><strong>Área</strong>{item.area_name || 'Não definida'}</span>
                      <span><strong>Responsável</strong>{item.responsible_name || 'A definir'}</span>
                    </div>
                    <div className="workspace-feed-actions"><button type="button" onClick={requireLogin}><Heart size={15} /> Reagir <span>Entrar</span></button><button type="button" onClick={requireLogin}><MessageCircle size={15} /> Comentar <span>Entrar</span></button></div>
                  </article>) : <div className="workspace-empty"><strong>Nenhuma atividade publicada</strong><p>As atividades cadastradas pela equipe aparecerão aqui.</p></div>}
                </div>}

                {tab === 'activities' && <div className="activity-board">
                  {['backlog', 'ready', 'in_progress', 'done'].map((stage) => {
                    const stageItems = filteredActivities.filter((item) => stage === 'in_progress' ? ['in_progress', 'blocked'].includes(item.flow_status) : stage === 'done' ? ['done', 'completed'].includes(item.flow_status) : item.flow_status === stage);
                    const labels: Record<string, string> = { backlog: 'Backlog', ready: 'A fazer', in_progress: 'Fazendo', done: 'Feito' };
                    return <section className="activity-board-column" key={stage}><header className="activity-board-column-header"><h2>{labels[stage]}</h2><span>{stageItems.length}</span></header>
                      {stageItems.length ? stageItems.map((item) => <article className={`activity-board-card postit-priority-${item.priority || 'medium'}`} key={item.id}>
                        <div className="activity-board-card-top"><span className="workspace-code">{item.code || 'ATIVIDADE'}</span><div className="activity-board-card-badges">{item.flow_status === 'blocked' && <span className="activity-board-blocked-badge">Bloqueada</span>}<span className={`activity-priority priority-${item.priority || 'medium'}`}>{({ low: 'Baixa', medium: 'Média', high: 'Alta', urgent: 'Urgente' } as Record<string, string>)[item.priority] || 'Média'}</span></div></div>
                        <h3>{item.name}</h3><p className="activity-board-card-area">{item.area_name || 'Área'}{item.due_date ? ` · Prazo ${dateLabel(item.due_date)}` : ''}</p>
                        {item.description && <p className="activity-board-card-description">{item.description}</p>}
                        <div className="activity-board-card-facts"><span>Responsável: {item.responsible_name || 'A definir'}</span><span>Esforço: {item.effort_points == null ? 'não estimado' : `${item.effort_points} ponto(s)`}</span></div>
                        {item.expected_deliverable && <p className="activity-board-card-description"><strong>Entrega:</strong> {item.expected_deliverable}</p>}
                        {(weeklyByActivity.get(item.id) ?? []).length > 0 && <div className="public-updates"><h4>Registros de andamento</h4>{(weeklyByActivity.get(item.id) ?? []).map((update) => <div className="public-update" key={update.id}><div className="public-card-meta"><b>{dateLabel(update.week_start)}</b><span>{statusLabel(update.status)}</span></div>{update.completed_work && <p><b>Realizado:</b> {update.completed_work}</p>}{update.pending_work && <p><b>Pendente:</b> {update.pending_work}</p>}{update.justification && <p>{update.justification}</p>}</div>)}</div>}
                        <div className="activity-flow-control"><span className="workspace-read-only">Fluxo somente leitura</span><button type="button" className="activity-card-edit" onClick={requireLogin}><Pencil size={13} /> Editar <span>Entrar</span></button></div>
                      </article>) : <p className="workspace-empty">Nenhuma atividade nesta etapa.</p>}
                    </section>;
                  })}
                </div>}

                {tab === 'calendar' && <section className="team-calendar" aria-label="Calendário de eventos da equipe">
                  <div className="team-calendar-toolbar"><button type="button" className="team-calendar-today" onClick={() => { const today = new Date(); setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setSelectedDate(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`); }}>Hoje</button><div className="team-calendar-month-nav"><button type="button" aria-label="Mês anterior" onClick={() => moveMonth(-1)}><ChevronLeft /></button><h2>{month.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</h2><button type="button" aria-label="Próximo mês" onClick={() => moveMonth(1)}><ChevronRight /></button></div><button type="button" className="team-calendar-add" onClick={requireLogin}><Plus /> Adicionar evento</button></div>
                  <div className="team-calendar-layout"><div className="team-calendar-board"><div className="team-calendar-weekdays">{['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((day) => <span key={day}>{day}</span>)}</div>
                    <div className="team-calendar-grid">{monthDays.map((cell) => { const items = eventsByDate.get(cell.date) ?? []; return <button type="button" key={cell.date} className={`team-calendar-day${cell.inMonth ? '' : ' is-outside'}${selectedDate === cell.date ? ' is-selected' : ''}`} onClick={() => setSelectedDate(cell.date)} aria-pressed={selectedDate === cell.date}><span className="team-calendar-day-number">{cell.day}</span><span className="team-calendar-dots">{items.slice(0, 3).map((item) => <i key={item.id} className={`is-${item.event_scope}`} />)}</span><span className="team-calendar-day-events">{items.slice(0, 2).map((item) => <span key={item.id} className={`is-${item.event_scope}`}>{item.title}</span>)}</span></button>; })}</div><div className="team-calendar-legend"><span><i className="is-internal" /> Interno</span><span><i className="is-external" /> Externo</span></div></div>
                    <aside className="team-calendar-agenda"><div className="team-calendar-agenda-heading"><div><p className="workspace-kicker">AGENDA DO DIA</p><h3>{dateLabel(selectedDate)}</h3></div><button type="button" aria-label="Adicionar evento nesta data" onClick={requireLogin}><Plus /></button></div>
                      {selectedEvents.length ? <div className="team-calendar-event-list">{selectedEvents.map((event) => <article className={`team-calendar-event is-${event.event_scope}`} key={event.id}><div className="team-calendar-event-label"><span>{event.event_scope === 'internal' ? 'INTERNO' : 'EXTERNO'}</span><small>{event.event_kind || 'Evento'}</small></div><h4>{event.title}</h4>{(event.start_time || event.end_time) && <p><Clock3 /> {timeLabel(event.start_time)}{event.end_time ? ` – ${timeLabel(event.end_time)}` : ''}</p>}{event.location && <p>{event.location}</p>}{event.description && <p className="team-calendar-event-description">{event.description}</p>}<div className="team-calendar-event-actions"><button type="button" onClick={requireLogin}><Pencil /> Editar</button></div></article>)}</div> : <p className="team-calendar-empty">Nenhum evento nesta data.</p>}
                    </aside></div>
                </section>}

                {tab === 'availability' && <section className="availability-workspace" aria-labelledby="availability-title">
                  <header className="availability-heading"><div><p className="workspace-kicker">PLANEJAMENTO DO TIME</p><h2 id="availability-title">Disponibilidades</h2><p className="workspace-subtitle">Horários recorrentes em horário de Brasília, de segunda a sexta, entre 07:00 e 21:00.</p></div><div className="availability-heading-actions"><button className="availability-refresh" type="button" onClick={requireLogin}><LogIn size={15} /> Entrar para atualizar</button></div></header>
                  <div className="availability-section"><div className="availability-section-heading"><div><p className="workspace-kicker">VISÃO DA EQUIPE</p><h3>Disponibilidade por pessoa</h3></div><span className="availability-member-count">{new Set(data.availability.map((slot) => slot.full_name)).size} pessoas</span></div>
                    <div className="availability-team-list">{[...new Set(data.availability.map((slot) => slot.full_name))].sort().map((name) => { const personSlots = data.availability.filter((slot) => slot.full_name === name); return <article className="availability-person-card" key={name}><div className="availability-person-heading"><strong>{name || 'Integrante'}</strong><span>{(personSlots.length / 2).toLocaleString('pt-BR')} h/semana</span></div><div className="availability-person-days">{weekdays.map((day) => { const times = personSlots.filter((slot) => Number(slot.weekday) === day.id).map((slot) => timeLabel(slot.hour_start)).sort(); return <div className="availability-person-day" key={day.id}><small>{day.short}</small>{times.length ? <div className="availability-hour-chips">{times.map((time) => <span key={time}>{time}</span>)}</div> : <span className="availability-no-hours">—</span>}</div>; })}</div></article>; })}</div>
                    <div className="availability-public-actions"><p className="availability-helper">A disponibilidade é apresentada somente para consulta. Para informar ou alterar seus horários, entre na equipe.</p><button className="availability-primary" type="button" onClick={requireLogin}><Pencil size={15} /> Editar minha disponibilidade</button></div>
                  </div>
                </section>}

                {tab === 'announcements' && <div className="workspace-announcements-list">
                  {data.announcements.length ? data.announcements.map((item) => <article className="workspace-announcement-card" key={item.id}><div className="workspace-announcement-meta"><span>{item.pinned_at ? 'COMUNICADO FIXADO' : 'COMUNICADO'}</span><time>{dateLabel(item.created_at)}</time></div><h2>{item.title}</h2><p>{item.message}</p><div className="workspace-announcement-actions"><button type="button" onClick={requireLogin}><Heart size={15} /> Reagir <span>Entrar</span></button><button type="button" onClick={requireLogin}><MessageCircle size={15} /> Responder <span>Entrar</span></button></div></article>) : <div className="workspace-empty"><strong>Nenhum comunicado publicado</strong><p>Os comunicados da equipe aparecerão aqui.</p></div>}
                  <button className="workspace-primary-button" type="button" onClick={requireLogin}><Plus size={15} /> Criar comunicado <span>Entrar</span></button>
                </div>}

                {tab === 'norms' && <div className="workspace-manual-list">
                  {data.norms.length ? data.norms.map((item) => <article className="workspace-manual-card" key={item.id}><div className="workspace-manual-meta"><span>{item.manual_kind === 'conduct' ? 'NORMAS DE CONDUTA' : 'MANUAL DE FUNÇÕES'}</span><span>{item.channel_name}</span></div><h2>{item.title}</h2>{item.content ? <div className="workspace-manual-content">{item.content}</div> : <p>Este documento ainda não possui conteúdo publicado.</p>}</article>) : <div className="workspace-empty"><strong>As normas ainda não foram publicadas</strong><p>Os documentos institucionais aparecerão aqui.</p></div>}
                </div>}
              </>}
          </section>
          <footer className="workspace-footer" aria-label="Identidade do projeto"><img src="/assets/teamceleris-app-mark.png" alt="Símbolo do app Team Celeris" /><strong>TEAM CELERIS</strong><i /><span>UFCI/RJ</span><small>· ACESSO PÚBLICO</small></footer>
        </main>
      </div>
    </section>
  );
}
