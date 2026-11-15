import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AccessToken, RoomServiceClient } from 'npm:livekit-server-sdk@2.15.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
};

function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' });

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return reply(401, { error: 'unauthorized' });

  const projectUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const livekitUrl = Deno.env.get('LIVEKIT_URL');
  const livekitApiKey = Deno.env.get('LIVEKIT_API_KEY');
  const livekitApiSecret = Deno.env.get('LIVEKIT_API_SECRET');
  if (!projectUrl || !anonKey || !livekitUrl || !livekitApiKey || !livekitApiSecret) {
    return reply(503, { error: 'meeting_service_not_configured' });
  }

  let body: { room_id?: unknown; display_name?: unknown };
  try {
    body = await request.json();
  } catch {
    return reply(400, { error: 'invalid_json' });
  }
  if (typeof body.room_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.room_id)) {
    return reply(400, { error: 'invalid_room' });
  }

  const displayName = typeof body.display_name === 'string'
    ? body.display_name.trim().slice(0, 80)
    : '';
  const userClient = createClient(projectUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return reply(401, { error: 'unauthorized' });

  const { data: profile, error: profileError } = await userClient
    .from('profiles')
    .select('full_name,status')
    .eq('user_id', user.id)
    .maybeSingle();
  if (profileError) return reply(503, { error: 'profile_lookup_failed' });
  if (!profile || profile.status !== 'active') return reply(403, { error: 'active_member_required' });

  const { data: room, error: roomError } = await userClient
    .from('meeting_rooms')
    .select('room_name,title,status,participant_limit')
    .eq('id', body.room_id)
    .maybeSingle();
  if (roomError) return reply(503, { error: 'room_lookup_failed' });
  if (!room || room.status !== 'active') return reply(404, { error: 'room_not_available' });

  try {
    const livekitHost = livekitUrl.replace(/\/$/, '');
    const roomService = new RoomServiceClient(livekitHost, livekitApiKey, livekitApiSecret);
    const participants = await roomService.listParticipants(room.room_name);
    const alreadyJoined = participants.some((participant) => participant.identity === user.id);
    if (!alreadyJoined && participants.length >= room.participant_limit) {
      return reply(409, { error: 'room_full', participant_limit: room.participant_limit });
    }

    const token = new AccessToken(livekitApiKey, livekitApiSecret, {
      identity: user.id,
      name: displayName || profile.full_name || 'Integrante Team Celeris',
      ttl: '15m',
    });
    token.addGrant({
      roomJoin: true,
      room: room.room_name,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    return reply(200, {
      token: await token.toJwt(),
      server_url: livekitUrl,
      room_name: room.room_name,
      room_title: room.title,
      participant_limit: room.participant_limit,
    });
  } catch (error) {
    console.error('meeting_token_issue_failed', error instanceof Error ? error.message : 'unknown');
    return reply(503, { error: 'meeting_media_service_unavailable' });
  }
});
