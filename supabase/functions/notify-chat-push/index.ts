import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
};
const MAX_MESSAGE_AGE_MS = 10 * 60 * 1000;
const ONESIGNAL_MAX_ALIASES = 20_000;
const APP_URL = 'https://teamceleris.netlify.app/';

type Profile = { user_id: string; full_name: string; status: 'active' | 'pending' | 'suspended' };
type ChatMessage = {
  id: string;
  sender_id: string | null;
  group_id: string | null;
  created_at: string;
  removed_at: string | null;
};
type DeliveryLog = { status: 'processing' | 'sent' | 'skipped' | 'failed'; attempt_count: number };
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
  return Number.isFinite(stamp) && age >= -60_000 && age <= MAX_MESSAGE_AGE_MS;
}

async function claimMessage(admin: SupabaseClient, messageId: string, actorId: string): Promise<boolean> {
  const { error } = await admin.from('chat_push_delivery_log').insert({
    message_id: messageId,
    actor_id: actorId,
    status: 'processing',
    attempt_count: 1,
  });
  if (!error) return true;
  if (error.code !== '23505') throw new Error('push_log_claim_failed');

  const { data: prior, error: priorError } = await admin
    .from('chat_push_delivery_log')
    .select('status,attempt_count')
    .eq('message_id', messageId)
    .maybeSingle();
  if (priorError) throw new Error('push_log_read_failed');
  const log = prior as DeliveryLog | null;
  if (log?.status !== 'failed') return false;

  const { data: retried, error: retryError } = await admin
    .from('chat_push_delivery_log')
    .update({ status: 'processing', attempt_count: log.attempt_count + 1, updated_at: new Date().toISOString() })
    .eq('message_id', messageId)
    .eq('status', 'failed')
    .select('message_id')
    .maybeSingle();
  if (retryError) throw new Error('push_log_retry_failed');
  return Boolean(retried);
}

async function updateDelivery(
  admin: SupabaseClient,
  messageId: string,
  status: 'sent' | 'skipped' | 'failed',
  recipientCount: number,
): Promise<void> {
  const { error } = await admin.from('chat_push_delivery_log').update({
    status,
    recipient_count: recipientCount,
    updated_at: new Date().toISOString(),
  }).eq('message_id', messageId);
  if (error) throw new Error('push_log_update_failed');
}

async function loadRecipients(
  admin: SupabaseClient,
  message: ChatMessage,
  actorId: string,
): Promise<{ recipientIds: string[]; groupName: string | null }> {
  if (!message.group_id) {
    const { data, error } = await admin.from('profiles').select('user_id').eq('status', 'active');
    if (error) throw new Error('recipient_lookup_failed');
    const activeRows = (data ?? []) as Array<{ user_id: string }>;
    return {
      recipientIds: [...new Set(activeRows.map((entry) => entry.user_id))].filter((id) => id !== actorId),
      groupName: null,
    };
  }

  const { data: group, error: groupError } = await admin
    .from('team_chat_groups')
    .select('id,name')
    .eq('id', message.group_id)
    .maybeSingle();
  if (groupError) throw new Error('group_lookup_failed');
  if (!group) throw new Error('group_not_found');

  const { data: ownMembership, error: ownMembershipError } = await admin
    .from('team_chat_group_members')
    .select('user_id')
    .eq('group_id', message.group_id)
    .eq('user_id', actorId)
    .maybeSingle();
  if (ownMembershipError) throw new Error('group_membership_lookup_failed');
  if (!ownMembership) throw new Error('actor_not_group_member');

  const { data: memberships, error: memberError } = await admin
    .from('team_chat_group_members')
    .select('user_id')
    .eq('group_id', message.group_id);
  if (memberError) throw new Error('group_recipients_lookup_failed');
  const memberRows = (memberships ?? []) as Array<{ user_id: string }>;
  const memberIds = [...new Set(memberRows.map((entry) => entry.user_id))]
    .filter((id) => id !== actorId);
  if (memberIds.length === 0) return { recipientIds: [], groupName: String(group.name ?? 'grupo') };

  const { data: activeProfiles, error: profileError } = await admin
    .from('profiles')
    .select('user_id')
    .eq('status', 'active')
    .in('user_id', memberIds);
  if (profileError) throw new Error('active_group_recipients_lookup_failed');
  const activeRows = (activeProfiles ?? []) as Array<{ user_id: string }>;
  return {
    recipientIds: [...new Set(activeRows.map((entry) => entry.user_id))],
    groupName: String(group.name ?? 'grupo').slice(0, 80),
  };
}

async function sendOneSignalPush(
  appId: string,
  restApiKey: string,
  recipientIds: string[],
  senderName: string,
  groupName: string | null,
): Promise<boolean> {
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
      headings: { pt: `Nova mensagem de ${senderName}` },
      contents: { pt: groupName ? `No grupo “${groupName}”` : 'No Chat da equipe' },
      data: { targetUrl: APP_URL },
    }),
  });
  if (!response.ok) throw new Error(`onesignal_http_${response.status}`);
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

  let body: { message_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return reply(400, { status: 'invalid_json' });
  }
  if (!validUuid(body.message_id)) return reply(400, { status: 'invalid_message' });

  const admin = createClient(projectUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  let claimed = false;

  try {
    const { data: profileData, error: profileError } = await admin
      .from('profiles')
      .select('user_id,full_name,status')
      .eq('user_id', user.id)
      .maybeSingle();
    if (profileError) throw new Error('profile_lookup_failed');
    const profile = profileData as Profile | null;
    if (!profile || profile.status !== 'active') return reply(403, { status: 'inactive_profile' });

    const { data: messageData, error: messageError } = await admin
      .from('team_chat_messages')
      .select('id,sender_id,group_id,created_at,removed_at')
      .eq('id', body.message_id)
      .maybeSingle();
    if (messageError) throw new Error('message_lookup_failed');
    const message = messageData as ChatMessage | null;
    if (!message) return reply(404, { status: 'message_not_found' });
    if (message.sender_id !== user.id || message.removed_at || !isRecent(message.created_at)) {
      return reply(403, { status: 'event_not_authorized' });
    }

    const appId = Deno.env.get('ONESIGNAL_APP_ID');
    const restApiKey = Deno.env.get('ONESIGNAL_REST_API_KEY');
    if (!appId || !restApiKey) return reply(200, { status: 'disabled', recipient_count: 0 });

    const { recipientIds, groupName } = await loadRecipients(admin, message, user.id);
    if (recipientIds.length > ONESIGNAL_MAX_ALIASES) return reply(413, { status: 'too_many_recipients' });

    claimed = await claimMessage(admin, message.id, user.id);
    if (!claimed) return reply(200, { status: 'duplicate', recipient_count: 0 });
    if (recipientIds.length === 0) {
      await updateDelivery(admin, message.id, 'skipped', 0);
      return reply(200, { status: 'skipped', recipient_count: 0 });
    }

    const senderName = profile.full_name.trim().slice(0, 80) || 'Integrante da equipe';
    const accepted = await sendOneSignalPush(appId, restApiKey, recipientIds, senderName, groupName);
    if (!accepted) {
      await updateDelivery(admin, message.id, 'skipped', 0);
      return reply(200, { status: 'skipped', recipient_count: 0 });
    }

    await updateDelivery(admin, message.id, 'sent', recipientIds.length);
    return reply(200, { status: 'sent', recipient_count: recipientIds.length });
  } catch {
    if (claimed) {
      try { await updateDelivery(admin, body.message_id, 'failed', 0); } catch { /* keep provider/database detail private */ }
    }
    return reply(500, { status: 'push_delivery_failed' });
  }
});
