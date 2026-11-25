import { useState, type ChangeEvent, type FormEvent, type SyntheticEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Activity } from './domain';
import './activity-deliveries.css';

type ActivityDeliveriesPanelProps = {
  client: SupabaseClient;
  activity: Activity;
  userId: string;
  canUpdate: boolean;
};

type Delivery = {
  id: string;
  activity_id: string;
  description: string;
  actor_name: string;
  created_at: string;
  google_doc_url: string | null;
  google_drive_status: 'pending' | 'synced' | 'error';
  google_drive_error: string | null;
};

type DeliveryAttachment = {
  id: string;
  delivery_id: string;
  kind: 'file' | 'drive_link';
  storage_path: string | null;
  content_type: string | null;
  file_name: string;
  file_size: number | null;
  drive_url: string | null;
  created_at: string;
};

const FILE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
};
const FILE_ACCEPT = Object.keys(FILE_TYPES).join(',');
const MAX_FILE_SIZE = 15 * 1024 * 1024;

export default function ActivityDeliveriesPanel({ client, activity, userId, canUpdate }: ActivityDeliveriesPanelProps) {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [attachments, setAttachments] = useState<Record<string, DeliveryAttachment[]>>({});
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncingDeliveryId, setSyncingDeliveryId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  function handleToggle(event: SyntheticEvent<HTMLDetailsElement>) {
    if (event.currentTarget.open && !loaded && !loading) {
      setLoaded(true);
      void loadDeliveries();
    }
  }

  async function loadDeliveries() {
    setLoading(true);
    setError('');
    const { data, error: deliveryError } = await client
      .from('activity_deliveries')
      .select('id,activity_id,description,actor_name,created_at,google_doc_url,google_drive_status,google_drive_error')
      .eq('activity_id', activity.id)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });

    if (deliveryError) {
      setError('Não foi possível carregar as entregas. Confira se a atualização do banco foi aplicada.');
      setLoaded(false);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as Delivery[];
    setDeliveries(rows);
    if (rows.length === 0) {
      setAttachments({});
      setAttachmentUrls({});
      setLoading(false);
      return;
    }

    const { data: attachmentRows, error: attachmentError } = await client
      .from('activity_attachments')
      .select('id,delivery_id,kind,storage_path,content_type,file_name,file_size,drive_url,created_at')
      .eq('activity_id', activity.id)
      .in('delivery_id', rows.map((row) => row.id))
      .order('created_at', { ascending: true });

    if (attachmentError) {
      setError('As entregas foram carregadas, mas não foi possível consultar seus anexos.');
      setLoaded(false);
      setLoading(false);
      return;
    }

    const nextAttachments: Record<string, DeliveryAttachment[]> = {};
    const nextUrls: Record<string, string> = {};
    const loadedAttachments = (attachmentRows ?? []) as DeliveryAttachment[];
    for (const attachment of loadedAttachments) {
      if (!attachment.delivery_id) continue;
      (nextAttachments[attachment.delivery_id] ??= []).push(attachment);
    }

    const signed = await Promise.all(loadedAttachments
      .filter((attachment) => attachment.kind === 'file' && attachment.storage_path)
      .map(async (attachment) => {
        const { data: signedData } = await client.storage
          .from('activity-attachments')
          .createSignedUrl(attachment.storage_path as string, 60 * 60);
        return signedData?.signedUrl ? [attachment.id, signedData.signedUrl] as const : null;
      }));
    for (const entry of signed) {
      if (entry) nextUrls[entry[0]] = entry[1];
    }

    setAttachments(nextAttachments);
    setAttachmentUrls(nextUrls);
    setLoading(false);
  }

  async function syncDelivery(deliveryId: string) {
    setSyncingDeliveryId(deliveryId);
    setError('');
    setNotice('');
    const { error: syncError } = await client.functions.invoke('sync-activity-delivery-drive', {
      body: { delivery_id: deliveryId },
    });
    if (syncError) {
      setNotice('Entrega salva no histórico. A sincronização com o Google Drive falhou; tente novamente.');
    } else {
      setNotice('Entrega e arquivos sincronizados com a pasta do setor no Google Drive.');
    }
    await loadDeliveries();
    setSyncingDeliveryId(null);
  }

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    setFiles(selected);
    setNotice('');
    setError('');
  }

  async function submitDelivery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanDescription = description.trim() || (files.length > 0 ? 'Arquivos anexados à atividade.' : '');
    if (!cleanDescription) {
      setError('Descreva a entrega ou selecione ao menos um arquivo.');
      return;
    }
    const invalid = files.find((file) => !FILE_TYPES[file.type.toLowerCase()] || file.size <= 0 || file.size > MAX_FILE_SIZE);
    if (invalid) {
      setError(`O arquivo “${invalid.name}” não é permitido ou ultrapassa 15 MiB.`);
      return;
    }

    setSaving(true);
    setError('');
    setNotice('');
    let deliveryId = '';
    try {
      const { data: delivery, error: insertError } = await client
        .from('activity_deliveries')
        .insert({ activity_id: activity.id, description: cleanDescription })
        .select('id')
        .single();
      if (insertError) throw insertError;
      deliveryId = delivery.id as string;

      for (const file of files) {
        const extension = FILE_TYPES[file.type.toLowerCase()];
        const storagePath = `${userId}/${activity.id}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await client.storage
          .from('activity-attachments')
          .upload(storagePath, file, { contentType: file.type.toLowerCase(), upsert: false });
        if (uploadError) throw uploadError;

        const { error: metadataError } = await client.from('activity_attachments').insert({
          activity_id: activity.id,
          delivery_id: deliveryId,
          kind: 'file',
          storage_path: storagePath,
          content_type: file.type.toLowerCase(),
          file_name: file.name.trim().slice(0, 240),
          file_size: file.size,
          created_by: userId,
        });
        if (metadataError) {
          await client.storage.from('activity-attachments').remove([storagePath]);
          throw metadataError;
        }
      }

      setDescription('');
      setFiles([]);
      await syncDelivery(deliveryId);
      await loadDeliveries();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Erro inesperado.';
      if (deliveryId) {
        setNotice('A entrega foi registrada, mas houve uma falha ao enviar um dos arquivos.');
        await loadDeliveries();
      } else {
        setError(`Não foi possível registrar a entrega: ${message}`);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className="activity-deliveries" onToggle={handleToggle}>
      <summary>Entregas e histórico <span>{deliveries.length}</span></summary>
      <div className="activity-deliveries-content">
        {loading ? <p className="activity-deliveries-muted" role="status">Carregando entregas…</p> : deliveries.length === 0 ? (
          <p className="activity-deliveries-muted">Nenhuma entrega registrada nesta atividade.</p>
        ) : (
          <ol className="activity-deliveries-list">
            {deliveries.map((delivery) => (
              <li className="activity-delivery-entry" key={delivery.id}>
                <div className="activity-delivery-heading">
                  <strong>Entrega registrada</strong>
                  <time dateTime={delivery.created_at}>{formatDeliveryDate(delivery.created_at)}</time>
                </div>
                <p className="activity-delivery-author">{delivery.actor_name}</p>
                <p className="activity-delivery-description">{delivery.description}</p>
                {(attachments[delivery.id]?.length ?? 0) > 0 && (
                  <ul className="activity-delivery-files">
                    {attachments[delivery.id].map((attachment) => {
                      const href = attachment.kind === 'drive_link' ? attachment.drive_url : attachmentUrls[attachment.id];
                      return <li key={attachment.id}>
                        {href ? <a href={href} target="_blank" rel="noopener noreferrer">{attachment.file_name}</a> : <span>{attachment.file_name}</span>}
                        <small>{attachment.content_type ?? 'Link'}</small>
                      </li>;
                    })}
                  </ul>
                )}
                {delivery.google_doc_url && <a className="activity-delivery-doc" href={delivery.google_doc_url} target="_blank" rel="noopener noreferrer">Abrir relatório no Google Docs</a>}
                {!delivery.google_doc_url && canUpdate && (
                  <button type="button" className="activity-delivery-retry" onClick={() => void syncDelivery(delivery.id)} disabled={syncingDeliveryId === delivery.id}>
                    {syncingDeliveryId === delivery.id ? 'Sincronizando…' : 'Enviar para Google Drive'}
                  </button>
                )}
                {delivery.google_drive_status === 'error' && <p className="activity-deliveries-error">Não sincronizado com o Drive. Você pode tentar novamente.</p>}
              </li>
            ))}
          </ol>
        )}

        {canUpdate ? (
          <form className="activity-delivery-form" onSubmit={(event) => void submitDelivery(event)}>
            <label>
              <span>Registrar nova entrega</span>
              <textarea maxLength={10000} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Descreva o que foi realizado, os resultados e o que está sendo entregue." disabled={saving} />
            </label>
            <label className="activity-delivery-file-input">
              <span>Anexar evidências (até 15 MiB por arquivo)</span>
              <input type="file" multiple accept={FILE_ACCEPT} onChange={handleFiles} disabled={saving} />
            </label>
            {files.length > 0 && <p className="activity-deliveries-muted">{files.length} arquivo(s) selecionado(s).</p>}
            {error && <p className="activity-deliveries-error" role="alert">{error}</p>}
            {notice && <p className="activity-deliveries-notice" role="status">{notice}</p>}
            <button type="submit" disabled={saving || (!description.trim() && files.length === 0)}>{saving ? 'Registrando…' : 'Registrar entrega'}</button>
          </form>
        ) : (
          <>
            {error && <p className="activity-deliveries-error" role="alert">{error}</p>}
            <p className="activity-deliveries-muted">Somente leitura.</p>
          </>
        )}
      </div>
    </details>
  );
}

function formatDeliveryDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}
