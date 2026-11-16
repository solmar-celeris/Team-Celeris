import { useEffect, useMemo, useState } from 'react';
import { Activity, CalendarDays, Clock3, Megaphone, BookOpen, Newspaper, LogIn, ArrowLeft, LoaderCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

type PublicTab = 'feed' | 'activities' | 'calendar' | 'availability' | 'announcements' | 'norms';
type Row = Record<string, any>;

const tabs: { id: PublicTab; label: string; icon: typeof Newspaper }[] = [
  { id: 'feed', label: 'Feed', icon: Newspaper },
  { id: 'activities', label: 'Atividades', icon: Activity },
  { id: 'calendar', label: 'Calendário', icon: CalendarDays },
  { id: 'availability', label: 'Disponibilidades', icon: Clock3 },
  { id: 'announcements', label: 'Comunicados', icon: Megaphone },
  { id: 'norms', label: 'Normas', icon: BookOpen },
];

const weekdays = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const dateLabel = (value?: string | null) => value
  ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR')
  : 'Data não informada';
const timeLabel = (value?: string | null) => value ? value.slice(0, 5) : '';
const statusLabel = (value?: string | null) => ({
  completed: 'Concluído', in_progress: 'Em andamento', pending: 'Pendente',
  not_applicable: 'Não se aplica', not_started: 'Não iniciado',
  backlog: 'Backlog', ready: 'A fazer', blocked: 'Bloqueada', done: 'Concluído',
} as Record<string, string>)[value ?? ''] ?? value ?? 'Sem registro';

export default function PublicWorkspace() {
  const [tab, setTab] = useState<PublicTab>('feed');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<Record<PublicTab | 'weekly', Row[]>>({
    feed: [], activities: [], calendar: [], availability: [], announcements: [], norms: [], weekly: [],
  });

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
      if (failed) {
        setError('Não foi possível carregar todas as informações públicas. Atualize a página para tentar novamente.');
      } else {
        setData(Object.fromEntries(results.map(({ key, rows }) => [key, rows])) as typeof data);
      }
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

  const login = () => { window.location.href = window.location.pathname; };

  return (
    <div className="public-portal">
      <header className="public-portal-header">
        <a className="public-portal-brand" href="/?public=1">
          <img src="/assets/solmar-celeris-site-logo.png" alt="SolMar Celeris" />
          <span><strong>Team Celeris</strong><small>Portal público · consulta</small></span>
        </a>
        <button className="public-login-button" onClick={login} type="button"><LogIn size={17} /> Entrar na equipe</button>
      </header>

      <main className="public-portal-main">
        <section className="public-portal-intro">
          <span className="public-portal-eyebrow">SOLMAR CELERIS · UFCI/RJ</span>
          <h1>Conheça o trabalho da equipe.</h1>
          <p>Consulte as atividades, os registros, o calendário, as disponibilidades, os comunicados e as normas do projeto.</p>
          <span className="public-readonly-note">Acesso público somente para leitura</span>
        </section>

        <nav className="public-portal-tabs" aria-label="Áreas públicas">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} className={tab === id ? 'is-active' : ''} onClick={() => setTab(id)} type="button">
              <Icon size={17} strokeWidth={2} /><span>{label}</span>
            </button>
          ))}
        </nav>

        <section className="public-portal-content" aria-live="polite">
          {loading ? (
            <div className="public-loading"><LoaderCircle size={22} className="public-spinner" /> Carregando informações públicas…</div>
          ) : error ? (
            <div className="public-empty" role="alert">{error}</div>
          ) : (
            <>
              {tab === 'feed' && (
                <div className="public-card-list">
                  {data.feed.length ? data.feed.map((item) => (
                    <article className="public-data-card" key={item.id}>
                      <div className="public-card-meta"><span>{item.item_type}</span><time>{dateLabel(item.created_at)}</time></div>
                      <h2>{item.title}</h2>
                      {item.status && <span className="public-status">{statusLabel(item.status)}</span>}
                      {item.body && <p className="public-preserve-lines">{item.body}</p>}
                      {item.related_name && <small>Responsável: {item.related_name}</small>}
                    </article>
                  )) : <Empty text="Ainda não há registros no feed." />}
                </div>
              )}

              {tab === 'activities' && (
                <div className="public-card-list">
                  {data.activities.length ? data.activities.map((item) => (
                    <article className="public-data-card" key={item.id}>
                      <div className="public-card-meta"><span>{item.code || item.area_name || 'Atividade'}</span><span>{item.area_name}</span></div>
                      <h2>{item.name}</h2>
                      {item.description && <p>{item.description}</p>}
                      <div className="public-card-facts">
                        <span><b>Responsável</b>{item.responsible_name || 'A definir'}</span>
                        <span><b>Etapa</b>{statusLabel(item.flow_status)}</span>
                        <span><b>Prazo</b>{dateLabel(item.due_date)}</span>
                      </div>
                      {item.expected_deliverable && <p><b>Entrega esperada:</b> {item.expected_deliverable}</p>}
                      {(weeklyByActivity.get(item.id) ?? []).length > 0 && (
                        <div className="public-updates">
                          <h3>Registros de andamento</h3>
                          {(weeklyByActivity.get(item.id) ?? []).map((update) => (
                            <div className="public-update" key={update.id}>
                              <div className="public-card-meta"><b>{dateLabel(update.week_start)}</b><span>{statusLabel(update.status)}</span></div>
                              {update.completed_work && <p><b>Realizado:</b> {update.completed_work}</p>}
                              {update.justification && <p><b>Registro:</b> {update.justification}</p>}
                              {update.pending_work && <p><b>Pendente:</b> {update.pending_work}</p>}
                              {update.difficulties && <p><b>Dificuldades:</b> {update.difficulties}</p>}
                              {update.dependency_notes && <p><b>Dependências:</b> {update.dependency_notes}</p>}
                              {update.next_action && <p><b>Próxima ação:</b> {update.next_action}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </article>
                  )) : <Empty text="Ainda não há atividades cadastradas." />}
                </div>
              )}

              {tab === 'calendar' && (
                <div className="public-card-list">
                  {data.calendar.length ? data.calendar.map((item) => (
                    <article className="public-data-card public-calendar-card" key={item.id}>
                      <div className="public-calendar-date"><strong>{new Date(`${item.event_date}T12:00:00`).getDate()}</strong><span>{new Date(`${item.event_date}T12:00:00`).toLocaleDateString('pt-BR', { month: 'short' })}</span></div>
                      <div><div className="public-card-meta"><span>{item.event_kind || 'Evento'}</span><span>{item.event_scope === 'external' ? 'Externo' : 'Interno'}</span></div><h2>{item.title}</h2>
                        <p>{dateLabel(item.event_date)} {item.start_time ? `· ${timeLabel(item.start_time)}${item.end_time ? `–${timeLabel(item.end_time)}` : ''}` : ''}</p>
                        {item.location && <p>Local: {item.location}</p>}{item.description && <p>{item.description}</p>}
                      </div>
                    </article>
                  )) : <Empty text="Ainda não há eventos registrados no calendário." />}
                </div>
              )}

              {tab === 'availability' && (
                <div className="public-card-list">
                  {data.availability.length ? weekdays.map((day, index) => {
                    const slots = data.availability.filter((slot) => Number(slot.weekday) === index);
                    return slots.length ? <article className="public-data-card" key={day}>
                      <h2>{day}</h2><div className="public-availability-list">
                        {slots.map((slot, i) => <div key={`${slot.user_id}-${slot.hour_start}-${i}`}><strong>{slot.full_name}</strong><span>{timeLabel(slot.hour_start)}</span><small>{slot.area_name || 'Equipe'}</small></div>)}
                      </div>
                    </article> : null;
                  }) : <Empty text="Ainda não há disponibilidades registradas." />}
                </div>
              )}

              {tab === 'announcements' && (
                <div className="public-card-list">
                  {data.announcements.length ? data.announcements.map((item) => (
                    <article className="public-data-card" key={item.id}>
                      <div className="public-card-meta"><span>{item.pinned_at ? 'Comunicado fixado' : 'Comunicado'}</span><time>{dateLabel(item.created_at)}</time></div>
                      <h2>{item.title}</h2><p className="public-preserve-lines">{item.message}</p>
                    </article>
                  )) : <Empty text="Ainda não há comunicados publicados." />}
                </div>
              )}

              {tab === 'norms' && (
                <div className="public-card-list">
                  {data.norms.length ? data.norms.map((item) => (
                    <article className="public-data-card public-norm-card" key={item.id}>
                      <div className="public-card-meta"><span>{item.manual_kind === 'conduct' ? 'Normas de conduta' : 'Manual de funções'}</span><span>{item.channel_name}</span></div>
                      <h2>{item.title}</h2>
                      {item.content ? <div className="public-preserve-lines public-norm-content">{item.content}</div> : <p>Este documento ainda não possui conteúdo publicado.</p>}
                    </article>
                  )) : <Empty text="As normas ainda não foram publicadas." />}
                </div>
              )}
            </>
          )}
        </section>
      </main>

      <footer className="public-portal-footer">
        <span>TEAM CELERIS · SOLMAR CELERIS</span>
        <button onClick={login} type="button"><ArrowLeft size={15} /> Acesso da equipe</button>
      </footer>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="public-empty">{text}</div>;
}
