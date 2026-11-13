import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
};
type RequestBody = {
  action?: unknown;
  message_id?: unknown;
  kind?: unknown;
  conversation_id?: unknown;
};
type CleanupRow = { id: string; bucket_id: string; object_path: string };
const BUCKETS = new Set(['team-chat-audio', 'team-chat-attachments', 'team-chat-group-photos']);

function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

async function drainPendingQueue(admin: ReturnType<typeof createClient>): Promise<{ pending: boolean }> {
  const { data: rows, error: queryError } = await admin
    .from('team_chat_storage_cleanup_queue')
    .select('id,bucket_id,object_path')
    .order('created_at', { ascending: true })
    .limit(500);
  if (queryError) {
    console.error('chat_storage_cleanup_queue_read_failed');
    return { pending: true };
  }
  const rawRows = (rows ?? []) as unknown[];
  const validRows = rawRows.filter((value): value is CleanupRow => {
    if (!value || typeof value !== 'object') return false;
    const row = value as Record<string, unknown>;
    return typeof row.id === 'string' && typeof row.bucket_id === 'string'
      && BUCKETS.has(row.bucket_id) && typeof row.object_path === 'string';
  });
  const byBucket = new Map<string, CleanupRow[]>();
  for (const row of validRows) {
    const group = byBucket.get(row.bucket_id) ?? [];
    group.push(row);
    byBucket.set(row.bucket_id, group);
  }
  for (const [bucket, bucketRows] of byBucket) {
    let allRemoved = true;
    for (let offset = 0; offset < bucketRows.length; offset += 100) {
      const batch = bucketRows.slice(offset, offset + 100);
      const { error: storageError } = await admin.storage.from(bucket).remove(batch.map((row) => row.object_path));
      if (storageError) {
        allRemoved = false;
        console.error(`chat_storage_cleanup_failed:${bucket}`);
        continue;
      }
      const { error: queueError } = await admin
        .from('team_chat_storage_cleanup_queue')
        .delete()
        .in('id', batch.map((row) => row.id));
      if (queueError) {
        allRemoved = false;
        console.error(`chat_storage_cleanup_ack_failed:${bucket}`);
      }
    }
    // An errored batch stays in the durable queue and is retried by a later call.
    void allRemoved;
  }
  const { count, error: pendingError } = await admin
    .from('team_chat_storage_cleanup_queue')
    .select('id', { count: 'exact', head: true });
  return { pending: Boolean(pendingError) || (count ?? 0) > 0 };
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

  let body: RequestBody;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return reply(400, { status: 'invalid_json' });
    body = parsed as RequestBody;
  } catch { return reply(400, { status: 'invalid_json' }); }
  const userClient = createClient(projectUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return reply(401, { status: 'unauthorized' });

  const admin = createClient(projectUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: actorProfile, error: profileError } = await admin.from('profiles').select('status').eq('user_id', user.id).maybeSingle();
  if (profileError || actorProfile?.status !== 'active') return reply(403, { status: 'active_member_required' });

  let requestId: string | null = null;
  if (body.action === 'cleanup_pending') {
    // Retentativa idempotente da outbox: não recebe nem revela caminhos de arquivo.
  } else if (body.action === 'delete_message') {
    if (typeof body.message_id !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(body.message_id)) {
      return reply(400, { status: 'invalid_message_id' });
    }
    const { data, error } = await admin.rpc('chat_delete_message_for_all', {
      p_actor_id: user.id,
      p_message_id: body.message_id,
    });
    if (error) {
      if (error.code === '42501') return reply(403, { status: 'not_a_participant_or_inactive' });
      if (error.code === 'P0002') return reply(404, { status: 'message_not_found' });
      console.error(`chat_message_delete_failed:${error.code ?? 'unknown'}`);
      return reply(500, { status: 'message_delete_failed' });
    }
    requestId = typeof data === 'string' ? data : null;
  } else if (body.action === 'delete_conversation') {
    if (!['group', 'direct'].includes(String(body.kind)) || typeof body.conversation_id !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(body.conversation_id)) {
      return reply(400, { status: 'invalid_conversation' });
    }
    const { data, error } = await admin.rpc('chat_delete_conversation_for_all', {
      p_actor_id: user.id,
      p_kind: body.kind,
      p_conversation_id: body.conversation_id,
    });
    if (error) {
      if (error.code === '42501') return reply(403, { status: 'not_a_participant_or_inactive' });
      if (error.code === 'P0002') return reply(404, { status: 'conversation_not_found' });
      console.error(`chat_conversation_delete_failed:${error.code ?? 'unknown'}`);
      return reply(500, { status: 'conversation_delete_failed' });
    }
    requestId = typeof data === 'string' ? data : null;
  } else {
    return reply(400, { status: 'unsupported_action' });
  }

  // Drena a outbox durável, inclusive itens que falharam em tentativa anterior.
  // Paths nunca são aceitos do corpo; todos vêm de registros verificados no banco.
  const cleanup = await drainPendingQueue(admin);
  return reply(200, {
    status: 'deleted',
    request_id: requestId,
    storage_cleanup_pending: cleanup.pending,
  });
});
