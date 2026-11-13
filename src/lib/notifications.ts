import type { SupabaseClient } from '@supabase/supabase-js';

export type NotificationSource = 'activities' | 'weekly_updates';
export type NotificationOutcome = {
  status: 'disabled' | 'sent' | 'skipped' | 'failed';
  recipientCount: number;
};
export type ChatPushOutcome = 'disabled' | 'sent' | 'skipped' | 'duplicate' | 'failed';
export type WorkspacePushSource = 'activities' | 'announcements';
export type WorkspacePushEventType = 'activity_assigned' | 'announcement_created';

const PENDING_PUSH_MAX_AGE_MS = 15 * 60 * 1000;
const PENDING_PUSH_BATCH_SIZE = 20;

export function activityEmailNotificationsEnabled(): boolean {
  return import.meta.env.VITE_ACTIVITY_EMAILS_ENABLED?.trim().toLowerCase() === 'true';
}

export async function notifyActivityChange(
  client: SupabaseClient,
  sourceTable: NotificationSource,
  sourceId: string,
): Promise<NotificationOutcome> {
  if (!activityEmailNotificationsEnabled()) return { status: 'disabled', recipientCount: 0 };

  try {
    const { data, error } = await client.functions.invoke('notify-activity', {
      body: { source_table: sourceTable, source_id: sourceId },
    });
    if (error) return { status: 'failed', recipientCount: 0 };
    const result = data as { status?: string; recipient_count?: number } | null;
    if (result?.status === 'sent') {
      return { status: 'sent', recipientCount: Number(result.recipient_count ?? 0) };
    }
    if (result?.status === 'disabled' || result?.status === 'duplicate') {
      return { status: 'skipped', recipientCount: 0 };
    }
    return { status: 'skipped', recipientCount: Number(result?.recipient_count ?? 0) };
  } catch {
    return { status: 'failed', recipientCount: 0 };
  }
}

/** Lê apenas o token criado na mesma gravação; sem a migration, o conteúdo ainda fica salvo. */
export async function readWorkspacePushEventId(
  client: SupabaseClient,
  sourceTable: WorkspacePushSource,
  sourceId: string,
): Promise<string | null> {
  try {
    const { data, error } = await client
      .from(sourceTable)
      .select('push_event_id')
      .eq('id', sourceId)
      .maybeSingle();
    if (error) return null;
    const eventId = (data as { push_event_id?: unknown } | null)?.push_event_id;
    return typeof eventId === 'string' ? eventId : null;
  } catch {
    return null;
  }
}

export async function notifyChatMessagePush(
  client: SupabaseClient,
  messageId: string,
): Promise<ChatPushOutcome> {
  try {
    const { data, error } = await client.functions.invoke('notify-chat-push', {
      body: { message_id: messageId },
    });
    if (error) return 'failed';
    const status = (data as { status?: unknown } | null)?.status;
    if (status === 'disabled' || status === 'sent' || status === 'skipped' || status === 'duplicate') return status;
    return 'failed';
  } catch {
    return 'failed';
  }
}

/** Envia apenas o token emitido pelo trigger do banco para o registro salvo. */
export async function notifyWorkspacePush(
  client: SupabaseClient,
  sourceOrEventType: string,
  sourceId?: string,
): Promise<ChatPushOutcome> {
  try {
    let eventId = sourceOrEventType;
    if (sourceId) {
      const sourceTable: WorkspacePushSource = sourceOrEventType === 'announcement_created'
        ? 'announcements'
        : sourceOrEventType === 'activity_assigned' || sourceOrEventType === 'activities'
          ? 'activities'
          : 'announcements';
      const eventToken = await readWorkspacePushEventId(client, sourceTable, sourceId);
      if (!eventToken) return 'skipped';
      eventId = eventToken;
    }
    const { data, error } = await client.functions.invoke('notify-workspace-push', {
      body: { event_id: eventId },
    });
    if (error) return 'failed';
    const status = (data as { status?: unknown } | null)?.status;
    if (status === 'disabled' || status === 'sent' || status === 'skipped' || status === 'duplicate') return status;
    return 'failed';
  } catch {
    return 'failed';
  }
}

/** Tenta recuperar somente eventos recentes ainda pendentes do ator autenticado (RLS). */
export async function flushPendingWorkspacePushEvents(client: SupabaseClient): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - PENDING_PUSH_MAX_AGE_MS).toISOString();
    const { data, error } = await client
      .from('workspace_push_events')
      .select('id')
      .eq('status', 'pending')
      .gte('created_at', cutoff)
      .order('created_at', { ascending: true })
      .limit(PENDING_PUSH_BATCH_SIZE);
    if (error || !data) return;

    for (const event of data as Array<{ id: string }>) {
      const outcome = await notifyWorkspacePush(client, event.id);
      if (outcome === 'failed') break;
    }
  } catch {
    // A recuperação nunca deve impedir a entrada ou o uso do workspace.
  }
}

/** Aciona o push genérico de um evento criado; o servidor valida autoria e destinatários. */
export async function notifyCalendarEventPush(client: SupabaseClient, eventId: string): Promise<ChatPushOutcome> {
  try {
    const { data, error } = await client.functions.invoke('notify-calendar-event-push', {
      body: { event_id: eventId },
    });
    if (error) return 'failed';
    const status = (data as { status?: unknown } | null)?.status;
    if (status === 'disabled' || status === 'sent' || status === 'skipped' || status === 'duplicate') return status;
    return 'failed';
  } catch {
    return 'failed';
  }
}

/** Recupera eventos recentes do próprio usuário que ficaram pendentes após a criação. */
export async function flushPendingCalendarEventPushes(client: SupabaseClient): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - PENDING_PUSH_MAX_AGE_MS).toISOString();
    const { data, error } = await client.from('calendar_event_push_events')
      .select('event_id').eq('status', 'pending').gte('created_at', cutoff)
      .order('created_at', { ascending: true }).limit(PENDING_PUSH_BATCH_SIZE);
    if (error || !data) return;
    for (const row of data as Array<{ event_id: string }>) {
      const outcome = await notifyCalendarEventPush(client, row.event_id);
      if (outcome === 'failed') break;
    }
  } catch {
    // A fila de push nunca deve impedir o uso do calendário.
  }
}
