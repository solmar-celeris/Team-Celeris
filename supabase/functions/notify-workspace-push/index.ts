import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
};
const MAX_EVENT_AGE_MS = 15 * 60 * 1000;
const ONESIGNAL_MAX_ALIASES = 20_000;
const APP_URL = 'https://teamceleris.netlify.app/';

type PushEvent = {
  id: string;
  event_type: 'announcement_created' | 'activity_assigned';
  entity_id: string;
  actor_id: string;
  target_user_id: string | null;
  target_area_id: string | null;
  status: 'pending' | 'processing' | 'sent' | 'skipped' | 'failed';
  attempt_count: number;
  recipient_count: number;
  created_at: string;
};
type Announcement = { id: string; author_id: string | null; removed_at: string | null };
type Activity = { id: string; responsible_user_id: string | null; archived_at: string | null };
type ActiveProfile = { user_id: string };
type OneSignalResponse = { id?: string | null };

function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function validUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isRecent(createdAt: string): boolean {
  const timestamp = Date.parse(createdAt);
  const age = Date.now() - timestamp;
  return Number.isFinite(timestamp) && age >= -60_000 && age <= MAX_EVENT_AGE_MS;
}

async function loadRecipients(
  admin: SupabaseClient,
  event: PushEvent,
  actorId: string,
): Promise<string[]> {
  if (event.event_type === 'announcement_created') {
    const { data, error } = await admin
      .from('announcements')
      .select('id,author_id,removed_at')
      .eq('id', event.entity_id)
      .maybeSingle();
    if (error) throw new Error('announcement_lookup_failed');
    const announcement = data as Announcement | null;
    if (!announcement || announcement.removed_at || announcement.author_id !== actorId) {
      throw new Error('announcement_event_not_current');
    }

    let query = admin.from('profiles').select('user_id').eq('status', 'active');
    if (event.target_area_id) query = query.eq('area_id', event.target_area_id);
    const { data: profiles, error: profileError } = await query;
    if (profileError) throw new Error('announcement_recipients_lookup_failed');
    return [...new Set(((profiles ?? []) as ActiveProfile[]).map((profile) => profile.user_id))]
      .filter((id) => id !== actorId);
  }

  if (!event.target_user_id) throw new Error('activity_target_missing');
  const { data, error } = await admin
    .from('activities')
    .select('id,responsible_user_id,archived_at')
    .eq('id', event.entity_id)
    .maybeSingle();
  if (error) throw new Error('activity_lookup_failed');
  const activity = data as Activity | null;
  if (!activity || activity.archived_at || activity.responsible_user_id !== event.target_user_id) {
    return [];
  }
  if (event.target_user_id === actorId) return [];

  const { data: recipient, error: recipientError } = await admin
    .from('profiles')
    .select('user_id')
    .eq('user_id', event.target_user_id)
    .eq('status', 'active')
    .maybeSingle();
  if (recipientError) throw new Error('activity_recipient_lookup_failed');
  return recipient ? [event.target_user_id] : [];
}

async function claimEvent(admin: SupabaseClient, event: PushEvent, actorId: string): Promise<boolean> {
  const { data, error } = await admin
    .from('workspace_push_events')
    .update({ status: 'processing', attempt_count: event.attempt_count + 1, updated_at: new Date().toISOString() })
    .eq('id', event.id)
    .eq('actor_id', actorId)
    .in('status', ['pending', 'failed'])
    .select('id')
    .maybeSingle();
  if (error) throw new Error('push_event_claim_failed');
  return Boolean(data);
}

async function updateEvent(
  admin: SupabaseClient,
  eventId: string,
  status: 'sent' | 'skipped' | 'failed',
  recipientCount: number,
): Promise<void> {
  const { error } = await admin.from('workspace_push_events').update({
    status,
    recipient_count: recipientCount,
    updated_at: new Date().toISOString(),
  }).eq('id', eventId);
  if (error) throw new Error('push_event_update_failed');
}

async function sendOneSignalPush(
  appId: string,
  restApiKey: string,
  eventType: PushEvent['event_type'],
  recipientIds: string[],
): Promise<boolean> {
  const isAnnouncement = eventType === 'announcement_created';
  const response = await fetch('https://api.onesignal.com/notifications', {
    method: 'POST',
    headers: {
      Authorization: `Key ${restApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      app_id: appId,
      target_channel: 'push',
      include_aliases: { external_id: recipientIds },
      headings: {
        en: isAnnouncement ? 'New SolMar announcement' : 'A new activity was assigned to you',
        pt: isAnnouncement ? 'Novo comunicado no SolMar' : 'Nova atividade atribuída a você',
      },
      contents: {
        en: isAnnouncement ? 'Open the app to read the notice.' : 'Open SolMar to review the activity.',
        pt: isAnnouncement ? 'Abra o app para ler o aviso.' : 'Abra o SolMar para consultar a atividade.',
      },
      data: { targetUrl: APP_URL },
    }),
  });
  if (!response.ok) {
    const responseText = await response.text();
    let providerMessage = 'no_provider_details';
    try {
      const parsed = JSON.parse(responseText) as { errors?: unknown; error?: unknown; message?: unknown };
      const detail = parsed.errors ?? parsed.error ?? parsed.message;
      if (typeof detail === 'string') providerMessage = detail;
      else if (detail !== undefined) providerMessage = JSON.stringify(detail);
    } catch {
      // Do not log arbitrary provider response bodies.
    }
    providerMessage = providerMessage
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, '[id]')
      .replace(/os_v2_app_[A-Za-z0-9_-]+/g, '[redacted]')
      .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
      .slice(0, 400);
    throw new Error(`onesignal_http_${response.status}:${providerMessage}`);
  }
  const result = await response.json().catch(() => ({})) as OneSignalResponse;
  return Boolean(result.id);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return reply(405, { status: 'method_not_allowed' });

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return reply(401, { status: 'unauthorized' });

  const projectUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!projectUrl || !anonKey || !serviceRoleKey) return reply(503, { status: 'server_not_configured' });

  const userClient = createClient(projectUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return reply(401, { status: 'unauthorized' });

  let body: { event_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return reply(400, { status: 'invalid_json' });
  }
  if (!validUuid(body.event_id)) return reply(400, { status: 'invalid_event' });

  const admin = createClient(projectUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  let claimed = false;
  let eventId = body.event_id;

  try {
    const { data: profileData, error: profileError } = await admin
      .from('profiles')
      .select('user_id,status')
      .eq('user_id', user.id)
      .maybeSingle();
    if (profileError) throw new Error('profile_lookup_failed');
    const profile = profileData as { user_id: string; status: string } | null;
    if (!profile || profile.status !== 'active') return reply(403, { status: 'inactive_profile' });

    const { data: eventData, error: eventError } = await admin
      .from('workspace_push_events')
      .select('id,event_type,entity_id,actor_id,target_user_id,target_area_id,status,attempt_count,created_at')
      .eq('id', body.event_id)
      .maybeSingle();
    if (eventError) throw new Error('push_event_lookup_failed');
    const event = eventData as PushEvent | null;
    if (!event) return reply(404, { status: 'event_not_found' });
    eventId = event.id;
    if (event.actor_id !== user.id || !isRecent(event.created_at)) {
      return reply(403, { status: 'event_not_authorized' });
    }
    if (event.status === 'sent' || event.status === 'skipped' || event.status === 'processing') {
      return reply(200, { status: 'duplicate', recipient_count: event.recipient_count });
    }

    const appId = Deno.env.get('ONESIGNAL_APP_ID');
    const restApiKey = Deno.env.get('ONESIGNAL_REST_API_KEY');
    if (!appId || !restApiKey) return reply(200, { status: 'disabled', recipient_count: 0 });

    claimed = await claimEvent(admin, event, user.id);
    if (!claimed) return reply(200, { status: 'duplicate', recipient_count: 0 });

    const recipientIds = await loadRecipients(admin, event, user.id);
    if (recipientIds.length > ONESIGNAL_MAX_ALIASES) {
      await updateEvent(admin, event.id, 'failed', 0);
      return reply(413, { status: 'too_many_recipients' });
    }
    if (recipientIds.length === 0) {
      await updateEvent(admin, event.id, 'skipped', 0);
      return reply(200, { status: 'skipped', recipient_count: 0 });
    }

    const accepted = await sendOneSignalPush(appId, restApiKey, event.event_type, recipientIds);
    if (!accepted) {
      await updateEvent(admin, event.id, 'skipped', 0);
      return reply(200, { status: 'skipped', recipient_count: 0 });
    }

    await updateEvent(admin, event.id, 'sent', recipientIds.length);
    return reply(200, { status: 'sent', recipient_count: recipientIds.length });
  } catch (error) {
    const diagnostic = error instanceof Error ? error.message : 'unknown_error';
    console.error('[notify-workspace-push] delivery failed:', diagnostic);
    if (claimed) {
      try { await updateEvent(admin, eventId, 'failed', 0); } catch { /* details remain server-side */ }
    }
    return reply(500, { status: 'push_delivery_failed' });
  }
});
