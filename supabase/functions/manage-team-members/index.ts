import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
};

type RequestBody = { action?: unknown; email?: unknown; full_name?: unknown };

function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function normalizeLoginUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.username || url.password || url.port || url.search || url.hash || url.pathname !== '/') return null;
    if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) return null;
    return url.origin;
  } catch {
    return null;
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return reply(405, { status: 'method_not_allowed' });

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return reply(401, { status: 'unauthorized' });

  const projectUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const loginUrl = normalizeLoginUrl(Deno.env.get('APP_LOGIN_URL'));
  if (!projectUrl || !anonKey || !serviceRoleKey || !loginUrl) {
    return reply(503, { status: 'server_not_configured' });
  }

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return reply(400, { status: 'invalid_json' });
  }
  if (body.action !== 'invite') return reply(400, { status: 'unsupported_action' });
  if (typeof body.email !== 'string' || body.email.length > 254) return reply(400, { status: 'invalid_email' });
  const email = body.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply(400, { status: 'invalid_email' });
  const fullName = typeof body.full_name === 'string' ? body.full_name.trim().slice(0, 120) : '';

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
    const { data: actor, error: profileError } = await admin
      .from('profiles')
      .select('role,status')
      .eq('user_id', user.id)
      .maybeSingle();
    if (profileError) return reply(503, { status: 'profile_lookup_failed' });
    if (!actor || actor.status !== 'active' || actor.role !== 'admin') {
      return reply(403, { status: 'admin_required' });
    }

    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName || email.split('@')[0] },
      // Valor fixo e constante: nunca aceitar uma URL de retorno do request.
      redirectTo: `${loginUrl}/?flow=invite`,
    });
    if (inviteError) {
      const message = inviteError.message.toLowerCase();
      if (message.includes('already') || message.includes('registered') || message.includes('exists')) {
        return reply(409, { status: 'email_already_registered' });
      }
      if (message.includes('rate limit') || message.includes('too many')) {
        return reply(429, { status: 'email_rate_limited' });
      }
      console.error('team_invite_email_failed', inviteError.status ?? 'unknown');
      return reply(502, { status: 'invite_delivery_failed' });
    }
    return reply(202, { status: 'invitation_sent' });
  } catch {
    return reply(500, { status: 'invite_failed' });
  }
});
