import { useState, type ChangeEvent, type SyntheticEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  activityTypeLabels,
  formatShortDate,
  weeklyStatusLabels,
  type Activity,
  type ActivityAttachment,
  type WeeklyStatus,
  type WeeklyUpdate,
  type WeeklyUpdateHistory,
} from './domain';
import './weekly-activity-card.css';

export type WeeklyReportDraft = {
  status: WeeklyStatus;
  justification: string;
  completed_work: string;
  pending_work: string;
  difficulties: string;
  dependency_notes: string;
  next_action: string;
};

type WeeklyActivityCardProps = {
  client: SupabaseClient;
  activity: Activity;
  areaName: string;
  weekStart: string;
  draft: WeeklyReportDraft;
  saved?: WeeklyUpdate;
  canUpdate: boolean;
  saving: boolean;
  busy: boolean;
  attachmentBusy: boolean;
  detailsMigrationAvailable: boolean;
  attachments: ActivityAttachment[];
  attachmentUrls: Record<string, string>;
  driveDraft: { name: string; url: string };
  onDraftChange: (patch: Partial<WeeklyReportDraft>) => void;
  onSave: () => void;
  onUploadFiles: (files: File[]) => void;
  onDriveDraftChange: (patch: Partial<{ name: string; url: string }>) => void;
  onAddDriveLink: () => void;
};

const HISTORY_MIGRATION = '20261108122000_weekly_update_details_history.sql';
const FILE_ACCEPT = 'image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,application/pdf,text/plain,text/csv,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation';

export default function WeeklyActivityCard({
  client,
  activity,
  areaName,
  weekStart,
  draft,
  saved,
  canUpdate,
  saving,
  busy,
  attachmentBusy,
  detailsMigrationAvailable,
  attachments,
  attachmentUrls,
  driveDraft,
  onDraftChange,
  onSave,
  onUploadFiles,
  onDriveDraftChange,
  onAddDriveLink,
}: WeeklyActivityCardProps) {
  const [historyState, setHistoryState] = useState<'idle' | 'loading' | 'ready' | 'missing' | 'error'>('idle');
  const [historyEntries, setHistoryEntries] = useState<WeeklyUpdateHistory[]>([]);
  const [historyError, setHistoryError] = useState('');

  async function loadHistory() {
    if (historyState !== 'idle') return;
    if (!detailsMigrationAvailable) {
      setHistoryState('missing');
      return;
    }
    setHistoryState('loading');
    const { data, error } = await client
      .from('weekly_update_history')
      .select('id,weekly_update_id,activity_id,week_start,event_type,previous_status,status,justification,completed_work,pending_work,difficulties,dependency_notes,next_action,actor_id,actor_name,occurred_at')
      .eq('activity_id', activity.id)
      .eq('week_start', weekStart)
      .order('occurred_at', { ascending: false })
      .order('id', { ascending: false });

    if (error) {
      const missing = ['42P01', 'PGRST204', 'PGRST205'].includes(error.code ?? '')
        || /weekly_update_history|schema cache|does not exist/i.test(error.message ?? '');
      setHistoryError(error.message ?? 'Erro ao consultar o histórico.');
      setHistoryState(missing ? 'missing' : 'error');
      return;
    }
    setHistoryEntries((data ?? []) as WeeklyUpdateHistory[]);
    setHistoryState('ready');
  }

  function handleHistoryToggle(event: SyntheticEvent<HTMLDetailsElement>) {
    if (event.currentTarget.open) void loadHistory();
  }

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    if (files.length > 0) onUploadFiles(files);
  }

  return (
    <article className="workspace-week-card">
      <div className="workspace-week-card-main">
        <div className="workspace-activity-meta">
          <span className="workspace-code">{activity.code}</span>
          <span>{areaName}</span>
          {!saved && <span className="workspace-no-update">Sem atualização</span>}
          <i aria-hidden="true" />
          <span>{activityTypeLabels[activity.activity_type]}</span>
          {activity.due_date && <><i aria-hidden="true" /><span>Prazo {formatShortDate(activity.due_date)}</span></>}
        </div>
        <h3>{activity.name}</h3>
        {activity.description && <p>{activity.description}</p>}
        <div className="workspace-detail-line">
          <span>Responsável: <strong>{activity.responsible_name || 'A definir'}</strong></span>
          {activity.expected_deliverable && <span>Entrega: <strong>{activity.expected_deliverable}</strong></span>}
        </div>

        <details className="weekly-report-details">
          <summary>Relato, evidências e histórico</summary>
          <div className="weekly-report-fields">
            {!detailsMigrationAvailable && (
              <p className="weekly-migration-note" role="status">
                Os campos detalhados e o histórico ficam disponíveis depois de aplicar a migration <code>{HISTORY_MIGRATION}</code>. O status e a justificativa existente continuam funcionando.
              </p>
            )}
            <label>
              <span>O que foi realizado nesta semana</span>
              <textarea maxLength={5000} value={draft.completed_work} disabled={!canUpdate || busy || !detailsMigrationAvailable} onChange={(event) => onDraftChange({ completed_work: event.target.value })} placeholder="Descreva entregas e avanços concluídos." />
            </label>
            <label>
              <span>O que ficou pendente</span>
              <textarea maxLength={5000} value={draft.pending_work} disabled={!canUpdate || busy || !detailsMigrationAvailable} onChange={(event) => onDraftChange({ pending_work: event.target.value })} placeholder="Registre itens não concluídos e o que falta." />
            </label>
            <label>
              <span>Dificuldades encontradas</span>
              <textarea maxLength={5000} value={draft.difficulties} disabled={!canUpdate || busy || !detailsMigrationAvailable} onChange={(event) => onDraftChange({ difficulties: event.target.value })} placeholder="Informe impedimentos, riscos ou dificuldades." />
            </label>
            <label>
              <span>Dependência de pessoa ou área</span>
              <textarea maxLength={5000} value={draft.dependency_notes} disabled={!canUpdate || busy || !detailsMigrationAvailable} onChange={(event) => onDraftChange({ dependency_notes: event.target.value })} placeholder="Indique de quem/de qual área depende e o apoio necessário." />
            </label>
            <label>
              <span>Próxima ação</span>
              <textarea maxLength={5000} value={draft.next_action} disabled={!canUpdate || busy || !detailsMigrationAvailable} onChange={(event) => onDraftChange({ next_action: event.target.value })} placeholder="Descreva o próximo passo e, se possível, o responsável." />
            </label>
            <label className="weekly-report-full-width">
              <span>Justificativa / observação {draft.status === 'pending' && <b>obrigatória para status Pendente</b>}</span>
              <textarea maxLength={5000} value={draft.justification} disabled={!canUpdate || busy} onChange={(event) => onDraftChange({ justification: event.target.value })} placeholder="Explique a situação da atualização semanal." />
            </label>
          </div>

          <section className="weekly-evidence" aria-labelledby={`evidence-${activity.id}`}>
            <div className="weekly-detail-heading">
              <h4 id={`evidence-${activity.id}`}>Evidências da atividade</h4>
              <span>Armazenamento privado · máximo 15 MB por arquivo</span>
            </div>
            {attachments.length > 0 ? (
              <ul className="weekly-attachment-list">
                {attachments.map((attachment) => {
                  const href = attachment.kind === 'drive_link' ? attachment.drive_url : attachmentUrls[attachment.id];
                  return (
                    <li key={attachment.id}>
                      {href ? <a href={href} target="_blank" rel="noreferrer">{attachment.file_name}</a> : <span>{attachment.file_name} (arquivo indisponível)</span>}
                      <small>{attachment.kind === 'drive_link' ? 'Link' : attachment.content_type ?? 'Arquivo'}</small>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="weekly-evidence-empty">Ainda não há arquivos ou links nesta atividade.</p>}
            {canUpdate && (
              <div className="weekly-evidence-actions">
                <label className="weekly-upload-label">
                  <span>Anexar arquivo</span>
                  <input type="file" multiple accept={FILE_ACCEPT} disabled={busy} onChange={handleFiles} />
                </label>
                <div className="weekly-drive-link-form">
                  <input type="text" maxLength={240} aria-label="Nome do link" placeholder="Nome do link" value={driveDraft.name} onChange={(event) => onDriveDraftChange({ name: event.target.value })} disabled={busy} />
                  <input type="url" maxLength={2048} aria-label="Link do Google Drive ou Docs" placeholder="https://drive.google.com/…" value={driveDraft.url} onChange={(event) => onDriveDraftChange({ url: event.target.value })} disabled={busy} />
                  <button type="button" onClick={onAddDriveLink} disabled={busy}>Adicionar link</button>
                </div>
                {attachmentBusy && <p className="weekly-evidence-empty" role="status">Enviando evidência…</p>}
              </div>
            )}
          </section>

          <details className="weekly-history" onToggle={handleHistoryToggle}>
            <summary>Histórico de atualizações desta semana</summary>
            {historyState === 'loading' && <p role="status">Carregando histórico…</p>}
            {historyState === 'missing' && <p className="weekly-migration-note" role="status">O histórico consultável exige a migration <code>{HISTORY_MIGRATION}</code>. {historyError && `Detalhe: ${historyError}`}</p>}
            {historyState === 'error' && <p className="weekly-migration-note" role="alert">Não foi possível carregar o histórico. {historyError}</p>}
            {historyState === 'ready' && historyEntries.length === 0 && <p>Esta atividade ainda não tem registros nesta semana.</p>}
            {historyState === 'ready' && historyEntries.length > 0 && (
              <ol className="weekly-history-list">
                {historyEntries.map((entry) => <HistoryEntry key={entry.id} entry={entry} />)}
              </ol>
            )}
          </details>
        </details>
      </div>

      <div className="workspace-week-editor">
        <label>
          <span>Situação da semana</span>
          <select value={draft.status} disabled={!canUpdate || busy} onChange={(event) => onDraftChange({ status: event.target.value as WeeklyStatus })}>
            {Object.entries(weeklyStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        {canUpdate ? (
          <div className="workspace-week-actions">
            <button type="button" disabled={busy} onClick={onSave}>{saving ? 'Salvando…' : attachmentBusy ? 'Enviando…' : 'Salvar atualização'}</button>
          </div>
        ) : <span className="workspace-read-only">Somente leitura</span>}
        {saved && <span className="weekly-last-update">Última atualização: {formatTimestamp(saved.updated_at)}</span>}
      </div>
    </article>
  );
}

function HistoryEntry({ entry }: { entry: WeeklyUpdateHistory }) {
  const eventTitle = entry.event_type === 'baseline'
    ? 'Registro atual preservado'
    : entry.event_type === 'insert'
      ? 'Primeiro registro da semana'
      : entry.event_type === 'delete'
        ? 'Registro removido'
        : entry.previous_status && entry.previous_status !== entry.status
          ? `Status: ${weeklyStatusLabels[entry.previous_status]} → ${weeklyStatusLabels[entry.status]}`
          : 'Atualização registrada';
  const reportItems = [
    ['Realizado', entry.completed_work],
    ['Pendente', entry.pending_work],
    ['Dificuldades', entry.difficulties],
    ['Dependência', entry.dependency_notes],
    ['Próxima ação', entry.next_action],
    ['Justificativa/observação', entry.justification],
  ].filter(([, value]) => Boolean(value));

  return (
    <li className="weekly-history-entry">
      <div className="weekly-history-entry-heading">
        <strong>{eventTitle}</strong>
        <time dateTime={entry.occurred_at}>{formatTimestamp(entry.occurred_at)}</time>
      </div>
      <p><span>Responsável pela atualização:</span> {entry.actor_name}</p>
      <p><span>Situação registrada:</span> {weeklyStatusLabels[entry.status]}</p>
      {reportItems.length > 0 && (
        <dl>
          {reportItems.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
      )}
    </li>
  );
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}
