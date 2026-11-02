import type { SupabaseClient } from '@supabase/supabase-js';

export type NotificationSource = 'activities' | 'weekly_updates';
export type NotificationOutcome = {
  status: 'disabled' | 'sent' | 'skipped' | 'failed';
  recipientCount: number;
};

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
