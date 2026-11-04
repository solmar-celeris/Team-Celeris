import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ChevronLeft, ChevronRight, Clock3, MapPin, Plus, Trash2, X } from 'lucide-react';
import { flushPendingCalendarEventPushes, notifyCalendarEventPush } from '../../lib/notifications';
import './team-calendar.css';

type EventScope = 'internal' | 'external';
type EventKind = 'meeting' | 'training' | 'dsb' | 'sepex' | 'technical_visit' | 'pac' | 'other';
type CalendarEvent = {
  id: string; title: string; event_scope: EventScope; event_kind: EventKind; event_date: string;
  start_time: string | null; end_time: string | null; location: string; description: string;
  created_by: string; created_at: string;
};
type EventDraft = {
  title: string; event_scope: EventScope; event_kind: EventKind; event_date: string;
  start_time: string; end_time: string; location: string; description: string;
};
type Props = { client: SupabaseClient; userId: string; isAdmin: boolean; initialDate?: string };
const weekdays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const kinds: { value: EventKind; label: string; scope: EventScope }[] = [
  { value: 'meeting', label: 'Reunião', scope: 'internal' },
  { value: 'training', label: 'Treinamento', scope: 'internal' },
  { value: 'dsb', label: 'DSB', scope: 'external' },
  { value: 'sepex', label: 'SEPEX', scope: 'external' },
  { value: 'technical_visit', label: 'Visita técnica', scope: 'external' },
  { value: 'pac', label: 'PAC', scope: 'external' },
  { value: 'other', label: 'Outro', scope: 'internal' },
];
const blankDraft = (date: string): EventDraft => ({ title: '', event_scope: 'internal', event_kind: 'meeting', event_date: date, start_time: '', end_time: '', location: '', description: '' });
function isoLocal(date: Date): string { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function dateLabel(value: string): string { return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(`${value}T12:00:00`)); }
function monthLabel(value: Date): string { return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(value); }
function kindLabel(value: EventKind): string { return kinds.find((kind) => kind.value === value)?.label ?? 'Evento'; }
function eventError(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && ['42P01', '42703', 'PGRST204', 'PGRST205'].includes(String(error.code))) return 'A migration de Calendário ainda não foi aplicada no Supabase.';
  if (error && typeof error === 'object' && 'code' in error && String(error.code) === '42501') return 'Você só pode editar ou remover eventos criados por você. Administradores podem gerenciar todos os eventos.';
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message;
  return 'Não foi possível salvar o evento. Tente novamente.';
}
export default function TeamCalendar({ client, userId, isAdmin, initialDate }: Props) {
  const now = new Date();
  const focusDate = initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate) ? new Date(`${initialDate}T12:00:00`) : now;
  const [month, setMonth] = useState(() => new Date(focusDate.getFullYear(), focusDate.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(() => isoLocal(focusDate));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pushFeedback, setPushFeedback] = useState('');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [draft, setDraft] = useState<EventDraft>(() => blankDraft(isoLocal(now)));
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const startDate = isoLocal(new Date(month.getFullYear(), month.getMonth(), 1));
  const endDate = isoLocal(new Date(month.getFullYear(), month.getMonth() + 1, 0));
  const loadEvents = useCallback(async () => {
    setLoading(true); setError('');
    const { data, error: loadError } = await client.from('calendar_events')
      .select('id,title,event_scope,event_kind,event_date,start_time,end_time,location,description,created_by,created_at')
      .gte('event_date', startDate).lte('event_date', endDate)
      .order('event_date', { ascending: true }).order('start_time', { ascending: true });
    if (loadError) setError(eventError(loadError));
    else setEvents((data ?? []) as unknown as CalendarEvent[]);
    setLoading(false);
  }, [client, endDate, startDate]);
  useEffect(() => { void loadEvents(); }, [loadEvents]);
  useEffect(() => { void flushPendingCalendarEventPushes(client); }, [client]);
  useEffect(() => {
    const channel = client.channel('team-calendar-events').on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' }, () => { void loadEvents(); }).subscribe();
    return () => { void client.removeChannel(channel); };
  }, [client, loadEvents]);
  const gridDays = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const mondayOffset = (first.getDay() + 6) % 7;
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const cells = Math.ceil((mondayOffset + count) / 7) * 7;
    return Array.from({ length: cells }, (_, index) => {
      const day = index - mondayOffset + 1;
      const date = new Date(month.getFullYear(), month.getMonth(), day);
      return { date: isoLocal(date), day: date.getDate(), inMonth: day > 0 && day <= count };
    });
  }, [month]);
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) map.set(event.event_date, [...(map.get(event.event_date) ?? []), event]);
    return map;
  }, [events]);
  const selectedEvents = eventsByDate.get(selectedDate) ?? [];
  function moveMonth(delta: number) {
    const next = new Date(month.getFullYear(), month.getMonth() + delta, 1);
    setMonth(next); setSelectedDate(isoLocal(new Date(next.getFullYear(), next.getMonth(), 1)));
  }
  function openCreate() { setEditing(null); setDraft(blankDraft(selectedDate)); setFormError(''); setModal(true); }
  function openEdit(event: CalendarEvent) {
    setEditing(event); setDraft({ title: event.title, event_scope: event.event_scope, event_kind: event.event_kind, event_date: event.event_date, start_time: event.start_time?.slice(0, 5) ?? '', end_time: event.end_time?.slice(0, 5) ?? '', location: event.location, description: event.description }); setFormError(''); setModal(true);
  }
  async function saveEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setFormError('');
    const title = draft.title.trim();
    if (title.length < 2) { setFormError('Informe um título com pelo menos 2 caracteres.'); return; }
    if (draft.start_time && draft.end_time && draft.end_time <= draft.start_time) { setFormError('O horário final deve ser posterior ao inicial.'); return; }
    setSaving(true);
    setPushFeedback('');
    const payload = { title, event_scope: draft.event_scope, event_kind: draft.event_kind, event_date: draft.event_date, start_time: draft.start_time || null, end_time: draft.end_time || null, location: draft.location.trim(), description: draft.description.trim() };
    let createdEventId: string | null = null;
    const result = editing
      ? await client.from('calendar_events').update(payload).eq('id', editing.id)
      : await client.from('calendar_events').insert(payload).select('id').single();
    if (result.error) setFormError(eventError(result.error));
    else {
      if (!editing) createdEventId = (result.data as { id: string } | null)?.id ?? null;
      setModal(false); setSelectedDate(draft.event_date); if (draft.event_date.slice(0, 7) !== startDate.slice(0, 7)) setMonth(new Date(`${draft.event_date}T12:00:00`)); void loadEvents();
      if (createdEventId) void notifyCalendarEventPush(client, createdEventId).then((outcome) => {
        if (outcome === 'sent') setPushFeedback('Evento salvo; o aviso foi enviado aos demais integrantes ativos.');
        else if (outcome === 'failed') setPushFeedback('Evento salvo, mas o aviso não foi confirmado. Confira se a migration e a função notify-calendar-event-push foram publicadas.');
      });
    }
    setSaving(false);
  }
  async function removeEvent(event: CalendarEvent) {
    if (!(event.created_by === userId || isAdmin) || removing) return;
    if (!window.confirm(`Remover o evento “${event.title}”?`)) return;
    setRemoving(event.id); setError('');
    const { error: deleteError } = await client.from('calendar_events').delete().eq('id', event.id);
    if (deleteError) setError(eventError(deleteError)); else void loadEvents();
    setRemoving(null);
  }
  return (
    <section className="team-calendar" aria-label="Calendário de eventos da equipe">
      <div className="team-calendar-toolbar"><button type="button" className="team-calendar-today" onClick={() => { const today = new Date(); setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setSelectedDate(isoLocal(today)); }}>Hoje</button><div className="team-calendar-month-nav"><button type="button" aria-label="Mês anterior" onClick={() => moveMonth(-1)}><ChevronLeft aria-hidden="true" /></button><h2>{monthLabel(month)}</h2><button type="button" aria-label="Próximo mês" onClick={() => moveMonth(1)}><ChevronRight aria-hidden="true" /></button></div><button type="button" className="team-calendar-add" onClick={openCreate}><Plus aria-hidden="true" /> Adicionar evento</button></div>
      {error && <p className="team-calendar-error" role="alert">{error}</p>}
      {pushFeedback && <p className="team-calendar-notice" role="status">{pushFeedback}</p>}
      <div className="team-calendar-layout">
        <div className="team-calendar-board">
          <div className="team-calendar-weekdays">{weekdays.map((day) => <span key={day}>{day}</span>)}</div>
          <div className="team-calendar-grid">{gridDays.map((cell) => {
            const dayEvents = eventsByDate.get(cell.date) ?? [];
            return <button type="button" key={cell.date} className={`team-calendar-day${cell.inMonth ? '' : ' is-outside'}${selectedDate === cell.date ? ' is-selected' : ''}${cell.date === isoLocal(now) ? ' is-today' : ''}`} onClick={() => setSelectedDate(cell.date)} aria-pressed={selectedDate === cell.date}>
              <span className="team-calendar-day-number">{cell.day}</span><span className="team-calendar-dots" aria-label={`${dayEvents.length} eventos`}>{dayEvents.slice(0, 3).map((item) => <i key={item.id} className={`is-${item.event_scope}`} />)}{dayEvents.length > 3 && <small>+{dayEvents.length - 3}</small>}</span>
              <span className="team-calendar-day-events">{dayEvents.slice(0, 2).map((item) => <span key={item.id} className={`is-${item.event_scope}`}>{item.title}</span>)}</span>
            </button>;
          })}</div>
          <div className="team-calendar-legend"><span><i className="is-internal" /> Interno</span><span><i className="is-external" /> Externo</span></div>
        </div>
        <aside className="team-calendar-agenda"><div className="team-calendar-agenda-heading"><div><p className="workspace-kicker">AGENDA DO DIA</p><h3>{dateLabel(selectedDate)}</h3></div><button type="button" aria-label="Adicionar evento nesta data" onClick={openCreate}><Plus aria-hidden="true" /></button></div>
          {loading ? <p className="team-calendar-empty">Carregando eventos…</p> : selectedEvents.length === 0 ? <p className="team-calendar-empty">Nenhum evento nesta data. Use “Adicionar evento” para incluir uma reunião, treinamento ou compromisso externo.</p> : <div className="team-calendar-event-list">{selectedEvents.map((event) => <article className={`team-calendar-event is-${event.event_scope}`} key={event.id}><div className="team-calendar-event-label"><span>{event.event_scope === 'internal' ? 'INTERNO' : 'EXTERNO'}</span><small>{kindLabel(event.event_kind)}</small></div><h4>{event.title}</h4>{(event.start_time || event.end_time) && <p><Clock3 aria-hidden="true" />{event.start_time?.slice(0, 5) ?? '—'}{event.end_time ? ` – ${event.end_time.slice(0, 5)}` : ''}</p>}{event.location && <p><MapPin aria-hidden="true" />{event.location}</p>}{event.description && <p className="team-calendar-event-description">{event.description}</p>}{(event.created_by === userId || isAdmin) && <div className="team-calendar-event-actions"><button type="button" onClick={() => openEdit(event)}>Editar</button><button type="button" onClick={() => void removeEvent(event)} disabled={removing === event.id}><Trash2 aria-hidden="true" />{removing === event.id ? 'Removendo…' : 'Remover'}</button></div>}</article>)}</div>}
        </aside>
      </div>
      {modal && <div className="team-calendar-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setModal(false); }}><section className="team-calendar-modal" role="dialog" aria-modal="true" aria-labelledby="calendar-form-title"><header><div><p className="workspace-kicker">AGENDA DA EQUIPE</p><h3 id="calendar-form-title">{editing ? 'Editar evento' : 'Novo evento'}</h3></div><button type="button" aria-label="Fechar" onClick={() => setModal(false)} disabled={saving}><X aria-hidden="true" /></button></header>
        <form onSubmit={(event) => void saveEvent(event)}><label>Título<input autoFocus required minLength={2} maxLength={140} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Ex.: Reunião de planejamento" /></label><div className="team-calendar-form-row"><label>Categoria<select value={draft.event_scope} onChange={(event) => { const scope = event.target.value as EventScope; setDraft({ ...draft, event_scope: scope, event_kind: kinds.find((kind) => kind.scope === scope)?.value ?? 'other' }); }}><option value="internal">Interno</option><option value="external">Externo</option></select></label><label>Tipo<select value={draft.event_kind} onChange={(event) => setDraft({ ...draft, event_kind: event.target.value as EventKind })}>{kinds.filter((kind) => kind.scope === draft.event_scope).map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}</select></label></div><label>Data<input required type="date" value={draft.event_date} onChange={(event) => setDraft({ ...draft, event_date: event.target.value })} /></label><div className="team-calendar-form-row"><label>Início<input type="time" value={draft.start_time} onChange={(event) => setDraft({ ...draft, start_time: event.target.value })} /></label><label>Término<input type="time" value={draft.end_time} onChange={(event) => setDraft({ ...draft, end_time: event.target.value })} /></label></div><label>Local<input maxLength={180} value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} placeholder="Local ou link da reunião" /></label><label>Descrição<textarea maxLength={3000} rows={3} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Detalhes adicionais" /></label>{formError && <p className="team-calendar-error" role="alert">{formError}</p>}<footer><button type="button" className="team-calendar-cancel" onClick={() => setModal(false)} disabled={saving}>Cancelar</button><button type="submit" className="team-calendar-save" disabled={saving}>{saving ? 'Salvando…' : editing ? 'Salvar alterações' : 'Salvar evento'}</button></footer></form>
      </section></div>}
    </section>
  );
}
