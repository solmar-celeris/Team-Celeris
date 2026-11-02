import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
};
const RECENT_EVENT_MS = 10 * 60 * 1000;

type Profile = {
  user_id: string;
  full_name: string;
  role: 'admin' | 'area_lead' | 'member' | 'reader';
  status: 'active' | 'pending' | 'suspended';
  area_id: string | null;
};
type ActivityRow = {
  id: string;
  code: string;
  name: string;
  area_id: string;
  responsible_user_id: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};
type WeeklyRow = {
  id: string;
  activity_id: string;
  status: string;
  updated_by: string | null;
  updated_at: string;
};
type SourceTable = 'activities' | 'weekly_updates';

function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function validUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function eventIsRecent(updatedAt: string): boolean {
  const stamp = Date.parse(updatedAt);
  return Number.isFinite(stamp) && Math.abs(Date.now() - stamp) <= RECENT_EVENT_MS;
}

function canChangeActivity(profile: Profile, activity: ActivityRow): boolean {
  return profile.status === 'active' && (
    profile.role === 'admin' || (profile.role === 'area_lead' && profile.area_id === activity.area_id)
  );
}

function canChangeWeekly(profile: Profile, activity: ActivityRow, userId: string): boolean {
  return profile.status === 'active' && (
    profile.role === 'admin' ||
    (profile.role === 'area_lead' && profile.area_id === activity.area_id) ||
    (profile.role === 'member' && activity.responsible_user_id === userId)
  );
}

async function getProfile(admin: SupabaseClient, userId: string): Promise<Profile | null> {
  const { data, error } = await admin
    .from('profiles')
    .select('user_id,full_name,role,status,area_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error('profile_lookup_failed');
  return (data as Profile | null) ?? null;
}

async function getActivity(admin: SupabaseClient, id: string): Promise<ActivityRow | null> {
  const { data, error } = await admin
    .from('activities')
    .select('id,code,name,area_id,responsible_user_id,updated_by,created_at,updated_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error('activity_lookup_failed');
  return (data as ActivityRow | null) ?? null;
}

async function claimEvent(
  admin: SupabaseClient,
  sourceTable: SourceTable,
  sourceId: string,
  updatedAt: string,
  actorId: string,
): Promise<'claimed' | 'duplicate'> {
  const { error } = await admin.from('activity_email_delivery_log').insert({
    source_table: sourceTable,
    source_id: sourceId,
    source_updated_at: updatedAt,
    actor_id: actorId,
    status: 'processing',
    attempt_count: 1,
  });
  if (!error) return 'claimed';
  if (error.code === '23505') return 'duplicate';
  throw new Error('notification_log_failed');
}

async function sendEmail(apiKey: string, from: string, to: string, subject: string, text: string): Promise<void> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, text }),
  });
  if (!response.ok) throw new Error(`resend_http_${response.status}`);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return reply(405, { status: 'method_not_allowed' });

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return reply(401, { status: 'unauthorized' });

  const projectUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const sender = Deno.env.get('RESEND_FROM_EMAIL');
  if (!projectUrl || !anonKey || !serviceRoleKey) return reply(503, { status: 'server_not_configured' });
  if (!resendApiKey || !sender) return reply(200, { status: 'disabled', recipient_count: 0 });

  let body: { source_table?: unknown; source_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return reply(400, { status: 'invalid_json' });
  }
  if (!['activities', 'weekly_updates'].includes(String(body.source_table)) || !validUuid(body.source_id)) {
    return reply(400, { status: 'invalid_event' });
  }
  const sourceTable = body.source_table as SourceTable;
  const sourceId = body.source_id;

  const userClient = createClient(projectUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return reply(401, { status: 'unauthorized' });

  const admin = createClient(projectUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const actor = await getProfile(admin, user.id);
    if (!actor || actor.status !== 'active') return reply(403, { status: 'inactive_profile' });

    let activity: ActivityRow;
    let eventUpdatedAt: string;
    let messageSubject: string;
    let messageText: string;

    if (sourceTable === 'activities') {
      const row = await getActivity(admin, sourceId);
      if (!row) return reply(404, { status: 'event_not_found' });
      if (row.updated_by !== user.id || !canChangeActivity(actor, row) || !eventIsRecent(row.updated_at)) {
        return reply(403, { status: 'event_not_authorized' });
      }
      activity = row;
      eventUpdatedAt = row.updated_at;
      const wasCreated = Math.abs(Date.parse(row.created_at) - Date.parse(row.updated_at)) < 1000;
      messageSubject = wasCreated ? `Nova atividade: ${row.code}` : `Atividade atualizada: ${row.code}`;
      messageText = wasCreated
        ? `A atividade ${row.code} — ${row.name} foi cadastrada no espaço SolMar Celeris.`
        : `A atividade ${row.code} — ${row.name} foi atualizada no espaço SolMar Celeris.`;
    } else {
      const { data, error } = await admin
        .from('weekly_updates')
        .select('id,activity_id,status,updated_by,updated_at')
        .eq('id', sourceId)
        .maybeSingle();
      if (error) throw new Error('weekly_update_lookup_failed');
      const row = data as WeeklyRow | null;
      if (!row) return reply(404, { status: 'event_not_found' });
      const linkedActivity = await getActivity(admin, row.activity_id);
      if (!linkedActivity) return reply(404, { status: 'activity_not_found' });
      if (row.updated_by !== user.id || !canChangeWeekly(actor, linkedActivity, user.id) || !eventIsRecent(row.updated_at)) {
        return reply(403, { status: 'event_not_authorized' });
      }
      activity = linkedActivity;
      eventUpdatedAt = row.updated_at;
      const labels: Record<string, string> = {
        completed: 'Concluído', in_progress: 'Em andamento', pending: 'Pendente',
        not_applicable: 'Não se aplica', not_started: 'Não iniciado',
      };
      messageSubject = `Status semanal: ${activity.code}`;
      messageText = `O status semanal da atividade ${activity.code} — ${activity.name} foi atualizado para “${labels[row.status] ?? 'Atualizado'}”.`;
    }

    const claim = await claimEvent(admin, sourceTable, sourceId, eventUpdatedAt, user.id);
    if (claim === 'duplicate') return reply(200, { status: 'duplicate', recipient_count: 0 });

    const { data: administrators, error: administratorError } = await admin
      .from('profiles')
      .select('user_id')
      .eq('status', 'active')
      .eq('role', 'admin');
    if (administratorError) throw new Error('recipient_lookup_failed');

    const recipientIds = new Set<string>((administrators ?? []).map((entry: { user_id: string }) => entry.user_id));
    if (activity.responsible_user_id) {
      const responsible = await getProfile(admin, activity.responsible_user_id);
      if (responsible?.status === 'active') recipientIds.add(responsible.user_id);
    }
    recipientIds.delete(user.id);

    const addresses: string[] = [];
    for (const recipientId of recipientIds) {
      const { data, error } = await admin.auth.admin.getUserById(recipientId);
      if (!error && data.user?.email) addresses.push(data.user.email);
    }

    if (addresses.length === 0) {
      await admin.from('activity_email_delivery_log').update({ status: 'no_recipients', recipient_count: 0 }).eq('source_table', sourceTable).eq('source_id', sourceId).eq('source_updated_at', eventUpdatedAt);
      return reply(200, { status: 'skipped', recipient_count: 0 });
    }

    let delivered = 0;
    let failures = 0;
    for (const address of addresses) {
      try {
        await sendEmail(resendApiKey, sender, address, messageSubject, messageText);
        delivered += 1;
      } catch {
        failures += 1;
      }
    }

    await admin.from('activity_email_delivery_log').update({
      status: failures ? 'failed' : 'sent',
      recipient_count: delivered,
    }).eq('source_table', sourceTable).eq('source_id', sourceId).eq('source_updated_at', eventUpdatedAt);

    if (failures) return reply(502, { status: 'delivery_failed', recipient_count: delivered });
    return reply(200, { status: 'sent', recipient_count: delivered });
  } catch {
    return reply(500, { status: 'notification_failed' });
  }
});
