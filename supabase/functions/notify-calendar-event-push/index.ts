import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
};
const MAX_EVENT_AGE_MS = 15 * 60 * 1000;
const MAX_RECIPIENTS = 20_000;
const APP_URL = 'https://teamceleris.netlify.app/';

type Profile = { user_id: string; status: 'active' | 'pending' | 'suspended' };
type CalendarEvent = { id: string; title: string; event_date: string; created_by: string; created_at: string };
type Delivery = { event_id: string; status: 'pending' | 'processing' | 'sent' | 'skipped' | 'failed'; attempt_count: number; recipient_count: number };
type OneSignalResponse = { id?: string | null };

function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}
function validUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function isRecent(createdAt: string): boolean {
  const stamp = Date.parse(createdAt);
  const age = Date.now() - stamp;
  return Number.isFinite(stamp) && age >= -60_000 && age <= MAX_EVENT_AGE_MS;
}
function formatDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'data não informada';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}
async function claimEvent(admin: SupabaseClient, eventId: string, actorId: string): Promise<'claimed' | 'duplicate'> {
  const { data: current, error: readError } = await admin.from('calendar_event_push_events')
    .select('event_id,status,attempt_count,recipient_count').eq('event_id', eventId).eq('actor_id', actorId).maybeSingle();
  if (readError) throw new Error('calendar_push_log_read_failed');
  const event = current as Delivery | null;
  if (!event) throw new Error('calendar_push_log_not_found');
  if (event.status === 'sent' || event.status === 'skipped' || event.status === 'processing') return 'duplicate';
  const { data, error } = await admin.from('calendar_event_push_events').update({
    status: 'processing', attempt_count: event.attempt_count + 1, updated_at: new Date().toISOString(),
  }).eq('event_id', eventId).eq('actor_id', actorId).in('status', ['pending', 'failed']).select('event_id').maybeSingle();
  if (error) throw new Error('calendar_push_claim_failed');
  return data ? 'claimed' : 'duplicate';
}
async function updateEvent(admin: SupabaseClient, eventId: string, status: 'sent' | 'skipped' | 'failed', count: number): Promise<void> {
  const { error } = await admin.from('calendar_event_push_events').update({
    status, recipient_count: count, updated_at: new Date().toISOString(),
  }).eq('event_id', eventId);
  if (error) throw new Error('calendar_push_update_failed');
}
async function sendPush(appId: string, apiKey: string, recipients: string[], event: CalendarEvent): Promise<boolean> {
  const targetUrl = new URL(APP_URL);
  targetUrl.searchParams.set('push', 'calendar');
  targetUrl.searchParams.set('item_id', event.id);
  targetUrl.searchParams.set('date', event.event_date);
  const response = await fetch('https://api.onesignal.com/notifications', {
    method: 'POST',
    headers: { Authorization: `Key ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: appId,
      target_channel: 'push',
      include_aliases: { external_id: recipients },
      headings: { en: 'New calendar event', pt: 'Novo evento no calendário' },
      contents: { en: `${event.title.trim().slice(0, 140)} · ${formatDate(event.event_date)}`, pt: `${event.title.trim().slice(0, 140)} · ${formatDate(event.event_date)}` },
      url: targetUrl.toString(),
      data: { targetUrl: targetUrl.toString(), push_type: 'calendar', item_id: event.id, event_date: event.event_date },
    }),
  });
  if (!response.ok) {
    let detail = 'no_provider_details';
    try {
      const result = await response.json() as { errors?: unknown; error?: unknown; message?: unknown };
      const providerError = result.errors ?? result.error ?? result.message;
      if (typeof providerError === 'string') detail = providerError;
      else if (providerError !== undefined) detail = JSON.stringify(providerError);
    } catch { /* Não registrar resposta arbitrária do provedor. */ }
    detail = detail.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, '[id]')
      .replace(/os_v2_app_[A-Za-z0-9_-]+/g, '[redacted]')
      .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]').slice(0, 400);
    throw new Error(`onesignal_http_${response.status}:${detail}`);
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
  try { body = await request.json(); } catch { return reply(400, { status: 'invalid_json' }); }
  if (!validUuid(body.event_id)) return reply(400, { status: 'invalid_event' });
  const admin = createClient(projectUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  let claimed = false;
  try {
    const { data: profileData, error: profileError } = await admin.from('profiles').select('user_id,status').eq('user_id', user.id).maybeSingle();
    if (profileError) throw new Error('profile_lookup_failed');
    const profile = profileData as Profile | null;
    if (!profile || profile.status !== 'active') return reply(403, { status: 'inactive_profile' });
    const { data: eventData, error: eventError } = await admin.from('calendar_events')
      .select('id,title,event_date,created_by,created_at').eq('id', body.event_id).maybeSingle();
    if (eventError) throw new Error('calendar_event_lookup_failed');
    const event = eventData as CalendarEvent | null;
    if (!event) return reply(404, { status: 'event_not_found' });
    if (event.created_by !== user.id || !isRecent(event.created_at)) return reply(403, { status: 'event_not_authorized' });
    const appId = Deno.env.get('ONESIGNAL_APP_ID');
    const restApiKey = Deno.env.get('ONESIGNAL_REST_API_KEY');
    if (!appId || !restApiKey) return reply(200, { status: 'disabled', recipient_count: 0 });
    const claim = await claimEvent(admin, event.id, user.id);
    if (claim === 'duplicate') return reply(200, { status: 'duplicate', recipient_count: 0 });
    claimed = true;
    const { data: recipients, error: recipientError } = await admin.from('profiles').select('user_id').eq('status', 'active').neq('user_id', user.id);
    if (recipientError) throw new Error('calendar_recipients_lookup_failed');
    const recipientIds = [...new Set(((recipients ?? []) as Array<{ user_id: string }>).map((item) => item.user_id))];
    if (recipientIds.length > MAX_RECIPIENTS) {
      await updateEvent(admin, event.id, 'failed', 0);
      return reply(413, { status: 'too_many_recipients' });
    }
    if (recipientIds.length === 0) {
      await updateEvent(admin, event.id, 'skipped', 0);
      return reply(200, { status: 'skipped', recipient_count: 0 });
    }
    const accepted = await sendPush(appId, restApiKey, recipientIds, event);
    if (!accepted) {
      await updateEvent(admin, event.id, 'skipped', 0);
      return reply(200, { status: 'skipped', recipient_count: 0 });
    }
    await updateEvent(admin, event.id, 'sent', recipientIds.length);
    return reply(200, { status: 'sent', recipient_count: recipientIds.length });
  } catch (error) {
    const diagnostic = error instanceof Error ? error.message : 'unknown_error';
    console.error('[notify-calendar-event-push] delivery failed:', diagnostic);
    if (claimed) {
      try { await updateEvent(admin, body.event_id, 'failed', 0); } catch { /* erro detalhado permanece nos logs do servidor */ }
    }
    return reply(500, { status: 'push_delivery_failed' });
  }
});
