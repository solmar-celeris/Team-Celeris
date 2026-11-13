import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' });
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return reply(401, { error: 'unauthorized' });
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !anonKey) return reply(503, { error: 'server_not_configured' });

  let pageId: unknown;
  try { pageId = (await request.json()).page_id; } catch { return reply(400, { error: 'invalid_json' }); }
  if (typeof pageId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pageId)) {
    return reply(400, { error: 'invalid_page_id' });
  }

  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) return reply(401, { error: 'unauthorized' });
  const { data, error } = await client.rpc('developer_publish_page', { p_page_id: pageId });
  if (error) {
    const denied = error.code === '42501' || error.message.toLowerCase().includes('somente desenvolvedores');
    return reply(denied ? 403 : 400, { error: denied ? 'developer_required' : 'publish_failed' });
  }
  return reply(200, { status: 'published', version: data });
});
