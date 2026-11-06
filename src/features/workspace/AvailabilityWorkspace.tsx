import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CalendarDays, Clock3, Pencil, Plus, RefreshCw, Save, Trash2, Users, X } from 'lucide-react';
import type { MemberProfile } from './domain';
import './availability-workspace.css';

type AvailabilityWorkspaceProps = { client: SupabaseClient; userId: string; profile: MemberProfile };
type Member = Pick<MemberProfile, 'user_id' | 'full_name'>;
type AvailabilitySlot = { user_id: string; weekday: number; hour_start: string };
type TeamShift = {
  id: string;
  title: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  assigned_user_id: string | null;
  notes: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};
type ShiftDraft = {
  id: string | null;
  title: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  assigned_user_id: string;
  notes: string;
};

const weekdays = [
  { id: 1, label: 'Segunda', short: 'Seg.' },
  { id: 2, label: 'Terça', short: 'Ter.' },
  { id: 3, label: 'Quarta', short: 'Qua.' },
  { id: 4, label: 'Quinta', short: 'Qui.' },
  { id: 5, label: 'Sexta', short: 'Sex.' },
] as const;
const hours = Array.from({ length: 14 }, (_, index) => index + 7);
const startTimes = hours.map((hour) => `${String(hour).padStart(2, '0')}:00`);
const endTimes = Array.from({ length: 14 }, (_, index) => `${String(index + 8).padStart(2, '0')}:00`);

function emptyDraft(): ShiftDraft {
  return {
    id: null,
    title: '',
    shift_date: nextWeekdayInBrasilia(),
    start_time: '09:00',
    end_time: '10:00',
    assigned_user_id: '',
    notes: '',
  };
}

function nextWeekdayInBrasilia(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  const current = `${part('year')}-${part('month')}-${part('day')}`;
  const date = new Date(`${current}T00:00:00.000Z`);
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function isWeekday(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return day >= 1 && day <= 5;
}

function normalizedTime(value: string): string {
  return value.slice(0, 5);
}

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

function durationHours(start: string, end: string): number {
  return (Number(end.slice(0, 2)) * 60 + Number(end.slice(3, 5)) - Number(start.slice(0, 2)) * 60 - Number(start.slice(3, 5))) / 60;
}

function unavailableHoursForShift(
  shift: Pick<TeamShift, 'assigned_user_id' | 'shift_date' | 'start_time' | 'end_time'>,
  slots: AvailabilitySlot[],
): number[] {
  if (!shift.assigned_user_id) return [];
  const weekday = new Date(`${shift.shift_date}T00:00:00.000Z`).getUTCDay();
  const available = new Set(slots
    .filter((slot) => slot.user_id === shift.assigned_user_id && slot.weekday === weekday)
    .map((slot) => normalizedTime(slot.hour_start)));
  const startHour = Number(normalizedTime(shift.start_time).slice(0, 2));
  const endHour = Number(normalizedTime(shift.end_time).slice(0, 2));
  return Array.from({ length: Math.max(0, endHour - startHour) }, (_, index) => startHour + index)
    .filter((hour) => !available.has(hourLabel(hour)));
}

function prettyDate(value: string): string {
  return new Date(`${value}T00:00:00.000Z`).toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

function errorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') return 'Ocorreu um erro inesperado. Confira sua conexão e tente novamente.';
  const value = error as { message?: string; code?: string };
  if (value.code === '42501' || /row-level security|permission denied/i.test(value.message ?? '')) {
    return 'O banco recusou a operação. Confirme que a migration 20261106193000_availability.sql foi aplicada e mantenha o RLS ativo.';
  }
  if (value.code === '23514' && /não possui disponibilidade|disponibilidade para todos/i.test(value.message ?? '')) {
    return 'Aplique a migration 20261106204000_special_event_shift_exceptions.sql para permitir escalas especiais fora da disponibilidade semanal.';
  }
  if (value.code === '23514' || /availability|disponibilidade|slot/i.test(value.message ?? '')) {
    return 'Confira se a data é um dia útil, os horários são cheios entre 07:00 e 21:00 e a pessoa atribuída tem perfil ativo.';
  }
  if (value.code === '23505') return 'Esse horário já existe. Atualize a página para conferir a versão mais recente.';
  return value.message || 'Ocorreu um erro inesperado. Confira sua conexão e tente novamente.';
}

function slotKey(weekday: number, hour: number): string {
  return `${weekday}-${hourLabel(hour)}`;
}

export default function AvailabilityWorkspace({ client, userId, profile }: AvailabilityWorkspaceProps) {
  const isActive = profile.status === 'active' && profile.user_id === userId;
  const canManage = isActive && (profile.role === 'admin' || profile.role === 'area_lead');
  const [members, setMembers] = useState<Member[]>([]);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [shifts, setShifts] = useState<TeamShift[]>([]);
  const [ownKeys, setOwnKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingAvailability, setSavingAvailability] = useState(false);
  const [savingShift, setSavingShift] = useState(false);
  const [deletingShiftId, setDeletingShiftId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<ShiftDraft>(emptyDraft);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  const loadData = useCallback(async (initial = false) => {
    if (!isActive) {
      setLoading(false);
      return;
    }
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError('');
    try {
      const [memberResult, slotResult, shiftResult] = await Promise.all([
        client.from('profiles').select('user_id,full_name').eq('status', 'active').order('full_name', { ascending: true }),
        client.from('member_availability_slots').select('user_id,weekday,hour_start'),
        client.from('team_shifts').select('id,title,shift_date,start_time,end_time,assigned_user_id,notes,created_by,created_at,updated_at')
          .order('shift_date', { ascending: true }).order('start_time', { ascending: true }),
      ]);
      if (memberResult.error) throw memberResult.error;
      if (slotResult.error) throw slotResult.error;
      if (shiftResult.error) throw shiftResult.error;
      const activeMembers = (memberResult.data ?? []) as Member[];
      const activeIds = new Set(activeMembers.map(({ user_id: id }) => id));
      const visibleSlots = ((slotResult.data ?? []) as AvailabilitySlot[]).filter(({ user_id: id }) => activeIds.has(id));
      setMembers(activeMembers);
      setSlots(visibleSlots);
      setShifts((shiftResult.data ?? []) as TeamShift[]);
      setOwnKeys(new Set(visibleSlots.filter(({ user_id: id }) => id === userId).map(({ weekday, hour_start }) => `${weekday}-${normalizedTime(hour_start)}`)));
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [client, isActive, userId]);

  useEffect(() => { void loadData(true); }, [loadData]);

  const memberNames = useMemo(() => new Map(members.map(({ user_id, full_name }) => [user_id, full_name || 'Integrante sem nome'])), [members]);
  const ownSlotCount = useMemo(() => slots.filter(({ user_id }) => user_id === userId).length, [slots, userId]);
  const assignedHours = useMemo(() => shifts.reduce((total, shift) => total + durationHours(shift.start_time, shift.end_time), 0), [shifts]);
  const sortedShifts = useMemo(() => [...shifts].sort((a, b) => a.shift_date.localeCompare(b.shift_date) || a.start_time.localeCompare(b.start_time)), [shifts]);

  const toggleSlot = (weekday: number, hour: number) => {
    setOwnKeys((current) => {
      const next = new Set(current);
      const key = slotKey(weekday, hour);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setFeedback('');
  };

  const saveAvailability = async () => {
    if (!isActive || savingAvailability) return;
    setSavingAvailability(true);
    setError('');
    setFeedback('');
    const savedKeys = new Set(slots.filter(({ user_id }) => user_id === userId).map(({ weekday, hour_start }) => `${weekday}-${normalizedTime(hour_start)}`));
    const added = [...ownKeys].filter((key) => !savedKeys.has(key)).map((key) => {
      const [weekday, hour_start] = key.split('-');
      return { user_id: userId, weekday: Number(weekday), hour_start };
    });
    const removed = [...savedKeys].filter((key) => !ownKeys.has(key)).map((key) => {
      const [weekday, hour_start] = key.split('-');
      return { weekday: Number(weekday), hour_start };
    });
    try {
      if (added.length) {
        const { error: insertError } = await client.from('member_availability_slots').insert(added);
        if (insertError) throw insertError;
      }
      for (const slot of removed) {
        const { error: deleteError } = await client.from('member_availability_slots').delete()
          .eq('user_id', userId).eq('weekday', slot.weekday).eq('hour_start', slot.hour_start);
        if (deleteError) throw deleteError;
      }
      setFeedback('Sua disponibilidade semanal foi salva.');
      await loadData(false);
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSavingAvailability(false);
    }
  };

  const beginEditShift = (shift: TeamShift) => {
    setDraft({
      id: shift.id,
      title: shift.title,
      shift_date: shift.shift_date,
      start_time: normalizedTime(shift.start_time),
      end_time: normalizedTime(shift.end_time),
      assigned_user_id: shift.assigned_user_id ?? '',
      notes: shift.notes,
    });
    setFormOpen(true);
    setError('');
    setFeedback('');
  };

  const saveShift = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManage || savingShift) return;
    const startHour = Number(draft.start_time.slice(0, 2));
    const endHour = Number(draft.end_time.slice(0, 2));
    if (!draft.title.trim()) { setError('Informe o nome da escala.'); return; }
    if (!isWeekday(draft.shift_date)) { setError('Escolha uma data de segunda a sexta-feira.'); return; }
    if (startHour < 7 || endHour > 21 || endHour <= startHour || durationHours(draft.start_time, draft.end_time) % 1 !== 0) {
      setError('Use horas cheias entre 07:00 e 21:00, com término posterior ao início.'); return;
    }
    setSavingShift(true);
    setError('');
    setFeedback('');
    let conflictWarning = '';
    try {
      if (draft.assigned_user_id) {
        const { data, error: availabilityError } = await client.from('member_availability_slots')
          .select('weekday,hour_start').eq('user_id', draft.assigned_user_id);
        if (availabilityError) throw availabilityError;
        const available = new Set(((data ?? []) as Pick<AvailabilitySlot, 'weekday' | 'hour_start'>[])
          .map(({ weekday, hour_start }) => `${weekday}-${normalizedTime(hour_start)}`));
        const weekday = new Date(`${draft.shift_date}T00:00:00.000Z`).getUTCDay();
        const missing = Array.from({ length: endHour - startHour }, (_, index) => startHour + index)
          .filter((hour) => !available.has(slotKey(weekday, hour)));
        if (missing.length) {
          const personName = memberNames.get(draft.assigned_user_id) ?? 'A pessoa selecionada';
          conflictWarning = `Escala salva como ocasião especial. Atenção: ${personName} não informou disponibilidade habitual em ${missing.map(hourLabel).join(', ')}.`;
        }
      }
      const values = {
        title: draft.title.trim(),
        shift_date: draft.shift_date,
        start_time: `${draft.start_time}:00`,
        end_time: `${draft.end_time}:00`,
        assigned_user_id: draft.assigned_user_id || null,
        notes: draft.notes.trim(),
      };
      const result = draft.id
        ? await client.from('team_shifts').update(values).eq('id', draft.id)
        : await client.from('team_shifts').insert(values);
      if (result.error) throw result.error;
      setFormOpen(false);
      setDraft(emptyDraft());
      setFeedback(conflictWarning || (draft.id ? 'Escala atualizada.' : 'Escala montada.'));
      await loadData(false);
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSavingShift(false);
    }
  };

  const deleteShift = async (shift: TeamShift) => {
    if (!canManage || deletingShiftId) return;
    if (!window.confirm(`Excluir a escala “${shift.title}”?`)) return;
    setDeletingShiftId(shift.id);
    setError('');
    setFeedback('');
    try {
      const { error: deleteError } = await client.from('team_shifts').delete().eq('id', shift.id);
      if (deleteError) throw deleteError;
      setFeedback('Escala excluída.');
      await loadData(false);
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    } finally {
      setDeletingShiftId(null);
    }
  };

  if (!isActive) {
    return <section className="availability-workspace"><div className="availability-access-note">Este espaço está disponível somente para perfis ativos da equipe.</div></section>;
  }

  return (
    <section className="availability-workspace" aria-labelledby="availability-title">
      <header className="availability-heading">
        <div>
          <p className="workspace-kicker">PLANEJAMENTO DO TIME</p>
          <h1 id="availability-title">Disponibilidades</h1>
          <p className="workspace-subtitle">Horários recorrentes em horário de Brasília, de segunda a sexta, entre 07:00 e 21:00.</p>
        </div>
        <div className="availability-heading-actions">
          <button className="availability-refresh" type="button" onClick={() => void loadData(false)} disabled={loading || refreshing}>
            <RefreshCw size={15} aria-hidden="true" /> {refreshing ? 'Atualizando…' : 'Atualizar'}
          </button>
          {canManage && <button className="availability-primary" type="button" onClick={() => { setDraft(emptyDraft()); setFormOpen(true); setError(''); setFeedback(''); }}>
            <Plus size={16} aria-hidden="true" /> Montar escalas
          </button>}
        </div>
      </header>

      {error && <div className="availability-message availability-error" role="alert">{error}</div>}
      {feedback && <div className="availability-message availability-success" role="status">{feedback}</div>}

      <div className="availability-summary" aria-label="Resumo semanal">
        <article className="availability-stat"><span className="availability-stat-icon"><Clock3 size={17} /></span><span><small>Horas disponíveis por semana</small><strong>{loading ? '…' : `${slots.length} h`}</strong></span><span className="availability-stat-context">time ativo</span></article>
        <article className="availability-stat availability-stat-scheduled"><span className="availability-stat-icon"><CalendarDays size={17} /></span><span><small>Horas escaladas</small><strong>{loading ? '…' : `${assignedHours} h`}</strong></span><span className="availability-stat-context">soma das escalas</span></article>
        <article className="availability-stat"><span className="availability-stat-icon"><Users size={17} /></span><span><small>Sua disponibilidade</small><strong>{loading ? '…' : `${ownSlotCount} h`}</strong></span><span className="availability-stat-context">por semana</span></article>
      </div>

      <section className="availability-section" aria-labelledby="availability-own-heading">
        <div className="availability-section-heading">
          <div><p className="workspace-kicker">MINHA AGENDA RECORRENTE</p><h2 id="availability-own-heading">Marque os horários em que você está disponível</h2></div>
          <button className="availability-save" type="button" onClick={() => void saveAvailability()} disabled={loading || savingAvailability}>
            <Save size={15} aria-hidden="true" /> {savingAvailability ? 'Salvando…' : 'Salvar meus horários'}
          </button>
        </div>
        <p className="availability-helper">Cada opção corresponde a um bloco de uma hora. Somente sua disponibilidade pode ser alterada por você.</p>
        {loading ? <p className="availability-loading">Carregando horários do time…</p> : (
          <div className="availability-editor-scroll">
            <div className="availability-editor" role="group" aria-label="Grade de disponibilidade semanal">
              <div className="availability-editor-corner">Hora</div>
              {weekdays.map((day) => <div className="availability-day-header" key={day.id}><span>{day.label}</span><small>{day.short}</small></div>)}
              {hours.map((hour) => <div className="availability-hour-row" key={hour}>
                <strong>{hourLabel(hour)}</strong>
                {weekdays.map((day) => {
                  const selected = ownKeys.has(slotKey(day.id, hour));
                  return <button
                    className={`availability-slot${selected ? ' is-selected' : ''}`}
                    key={day.id}
                    type="button"
                    aria-pressed={selected}
                    aria-label={`${day.label}, ${hourLabel(hour)}–${hourLabel(hour + 1)}: ${selected ? 'disponível' : 'indisponível'}`}
                    onClick={() => toggleSlot(day.id, hour)}
                  >{selected ? 'Disponível' : '—'}</button>;
                })}
              </div>)}
            </div>
          </div>
        )}
      </section>

      <section className="availability-section availability-team-section" aria-labelledby="availability-team-heading">
        <div className="availability-section-heading"><div><p className="workspace-kicker">VISÃO INTERNA DA EQUIPE</p><h2 id="availability-team-heading">Disponibilidade por pessoa</h2></div><span className="availability-member-count">{members.length} pessoas ativas</span></div>
        <p className="availability-helper">Este quadro e as escalas abaixo são visíveis somente a perfis ativos autenticados da equipe.</p>
        {loading ? <p className="availability-loading">Carregando quadro…</p> : members.length === 0 ? <p className="availability-empty">Nenhum perfil ativo encontrado.</p> : (
          <div className="availability-team-list">
            {members.map((member) => {
              const personSlots = slots.filter(({ user_id }) => user_id === member.user_id);
              const total = personSlots.length;
              return <article className="availability-person-card" key={member.user_id}>
                <div className="availability-person-heading"><strong>{member.full_name || 'Integrante sem nome'}</strong><span>{total} h/semana</span></div>
                <div className="availability-person-days">
                  {weekdays.map((day) => {
                    const dayHours = personSlots.filter((slot) => slot.weekday === day.id).map((slot) => Number(normalizedTime(slot.hour_start).slice(0, 2))).sort((a, b) => a - b);
                    return <div className="availability-person-day" key={day.id}><small>{day.short}</small>
                      {dayHours.length ? <div className="availability-hour-chips">{dayHours.map((hour) => <span key={hour}>{hourLabel(hour)}</span>)}</div> : <span className="availability-no-hours">—</span>}
                    </div>;
                  })}
                </div>
              </article>;
            })}
          </div>
        )}
      </section>

      <section className="availability-section availability-shifts-section" aria-labelledby="availability-shifts-heading">
        <div className="availability-section-heading"><div><p className="workspace-kicker">ESCALAS MANUAIS</p><h2 id="availability-shifts-heading">Escalas do time</h2></div><span className="availability-member-count">{shifts.length} escalas · {assignedHours} h</span></div>
        {loading ? <p className="availability-loading">Carregando escalas…</p> : sortedShifts.length === 0 ? <p className="availability-empty">Nenhuma escala cadastrada.{canManage ? ' Use “Montar escalas” para adicionar a primeira.' : ''}</p> : (
          <div className="availability-shift-list">
            {sortedShifts.map((shift) => {
              const unavailableHours = unavailableHoursForShift(shift, slots);
              return <article className="availability-shift-card" key={shift.id}>
                <div className="availability-shift-date"><CalendarDays size={16} aria-hidden="true" /><span>{prettyDate(shift.shift_date)}</span></div>
                <div className="availability-shift-main"><h3>{shift.title}</h3><p><Clock3 size={14} aria-hidden="true" /> {normalizedTime(shift.start_time)}–{normalizedTime(shift.end_time)} <b>{durationHours(shift.start_time, shift.end_time)} h</b></p>
                  {shift.assigned_user_id && <span className="availability-assignee">{memberNames.get(shift.assigned_user_id) ?? 'Pessoa indisponível'}</span>}
                  {shift.notes && <p className="availability-shift-notes">{shift.notes}</p>}
                  {unavailableHours.length > 0 && <p className="availability-shift-conflict"><strong>Atenção:</strong> fora da disponibilidade habitual em {unavailableHours.map(hourLabel).join(', ')}. A escala foi mantida como exceção.</p>}
                </div>
                {canManage && <div className="availability-shift-actions"><button type="button" onClick={() => beginEditShift(shift)} aria-label={`Editar escala ${shift.title}`}><Pencil size={15} /> Editar</button><button className="is-danger" type="button" onClick={() => void deleteShift(shift)} disabled={deletingShiftId === shift.id} aria-label={`Excluir escala ${shift.title}`}><Trash2 size={15} /> Excluir</button></div>}
              </article>;
            })}
          </div>
        )}
      </section>

      {formOpen && canManage && <div className="availability-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !savingShift) setFormOpen(false); }}>
        <section className="availability-dialog" role="dialog" aria-modal="true" aria-labelledby="availability-form-title">
          <div className="availability-dialog-heading"><div><p className="workspace-kicker">{draft.id ? 'ATUALIZAÇÃO' : 'NOVA ESCALA'}</p><h2 id="availability-form-title">{draft.id ? 'Editar escala' : 'Montar escalas'}</h2></div><button type="button" onClick={() => setFormOpen(false)} aria-label="Fechar" disabled={savingShift}><X size={19} /></button></div>
          <p className="availability-helper">A disponibilidade é uma referência semanal. Escalas para ocasiões especiais, como a SEPEX, podem incluir horários diferentes; o sistema avisa sobre a diferença, mas não bloqueia a escala.</p>
          <form className="availability-shift-form" onSubmit={(event) => void saveShift(event)}>
            <label><span>Nome da escala</span><input required maxLength={160} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Ex.: Plantão de atendimento" /></label>
            <label><span>Data útil</span><input required type="date" value={draft.shift_date} onChange={(event) => setDraft({ ...draft, shift_date: event.target.value })} /></label>
            <div className="availability-time-fields"><label><span>Hora inicial</span><select value={draft.start_time} onChange={(event) => setDraft({ ...draft, start_time: event.target.value })}>{startTimes.map((time) => <option key={time} value={time}>{time}</option>)}</select></label><label><span>Hora final</span><select value={draft.end_time} onChange={(event) => setDraft({ ...draft, end_time: event.target.value })}>{endTimes.map((time) => <option key={time} value={time}>{time}</option>)}</select></label></div>
            <label><span>Pessoa atribuída <small>(opcional)</small></span><select value={draft.assigned_user_id} onChange={(event) => setDraft({ ...draft, assigned_user_id: event.target.value })}><option value="">Sem atribuição</option>{members.map((member) => <option key={member.user_id} value={member.user_id}>{member.full_name || 'Integrante sem nome'}</option>)}</select></label>
            <label><span>Observações</span><textarea rows={3} maxLength={4000} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Informações adicionais sobre a escala" /></label>
            <div className="availability-dialog-actions"><button className="availability-cancel" type="button" onClick={() => setFormOpen(false)} disabled={savingShift}>Cancelar</button><button className="availability-primary" type="submit" disabled={savingShift}><Save size={15} /> {savingShift ? 'Salvando…' : draft.id ? 'Salvar alterações' : 'Criar escala'}</button></div>
          </form>
        </section>
      </div>}
    </section>
  );
}
