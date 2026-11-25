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

function folderIdFromUrl(url: string): string | null {
  return url.match(/\/folders\/([a-zA-Z0-9_-]+)/)?.[1] ?? null;
}

async function googleAccessToken() {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')?.trim();
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')?.trim();
  const refreshToken = Deno.env.get('GOOGLE_REFRESH_TOKEN')?.trim();
  if (!clientId || !clientSecret || !refreshToken) throw new Error('google_oauth_not_configured');

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const payload = await response.json();
  if (!response.ok || typeof payload.access_token !== 'string') {
    throw new Error('google_oauth_refresh_failed');
  }
  return payload.access_token as string;
}

async function googleRequest(token: string, url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`google_api_error_${response.status}: ${detail.slice(0, 400)}`);
  }
  return response;
}

async function uploadDriveFile(token: string, folderId: string, fileName: string, mimeType: string, bytes: Uint8Array) {
  const boundary = `celeris_${crypto.randomUUID().replaceAll('-', '')}`;
  const metadata = JSON.stringify({ name: fileName, parents: [folderId] });
  const prefix = new TextEncoder().encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType || 'application/octet-stream'}\r\n\r\n`,
  );
  const suffix = new TextEncoder().encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(prefix.length + bytes.length + suffix.length);
  body.set(prefix, 0);
  body.set(bytes, prefix.length);
  body.set(suffix, prefix.length + bytes.length);

  const response = await googleRequest(
    token,
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink',
    { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body },
  );
  return await response.json() as { id: string; webViewLink?: string };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' });

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return reply(401, { error: 'unauthorized' });

  const projectUrl = Deno.env.get('SUPABASE_URL')?.trim();
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')?.trim();
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  if (!projectUrl || !anonKey || !serviceRoleKey) return reply(503, { error: 'supabase_service_not_configured' });

  const userClient = createClient(projectUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const admin = createClient(projectUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: authData, error: authError } = await userClient.auth.getUser();
  const user = authData?.user;
  if (authError || !user) return reply(401, { error: 'unauthorized' });

  let body: { delivery_id?: unknown };
  try { body = await request.json(); } catch { return reply(400, { error: 'invalid_json' }); }
  if (typeof body.delivery_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.delivery_id)) {
    return reply(400, { error: 'invalid_delivery_id' });
  }

  const { data: delivery, error: deliveryError } = await admin
    .from('activity_deliveries')
    .select('id,activity_id,description,actor_name,created_at,google_doc_id,google_doc_url,google_drive_status')
    .eq('id', body.delivery_id)
    .maybeSingle();
  if (deliveryError || !delivery) return reply(404, { error: 'delivery_not_found' });

  const { data: permission, error: permissionError } = await userClient
    .rpc('can_edit_activity', { p_activity_id: delivery.activity_id });
  if (permissionError || permission !== true) return reply(403, { error: 'activity_edit_permission_required' });

  const { data: activity, error: activityError } = await admin
    .from('activities')
    .select('id,name,code,area_id')
    .eq('id', delivery.activity_id)
    .maybeSingle();
  if (activityError || !activity) return reply(404, { error: 'activity_not_found' });

  const { data: folder, error: folderError } = await admin
    .from('drive_folders')
    .select('name,drive_url')
    .eq('area_id', activity.area_id)
    .is('removed_at', null)
    .order('is_primary', { ascending: false })
    .limit(1)
    .maybeSingle();
  const folderId = folder?.drive_url ? folderIdFromUrl(folder.drive_url) : null;
  if (folderError || !folderId) return reply(409, { error: 'sector_drive_folder_not_configured' });

  try {
    const token = await googleAccessToken();
    const { data: attachments, error: attachmentError } = await admin
      .from('activity_attachments')
      .select('id,storage_path,content_type,file_name,drive_url')
      .eq('activity_id', delivery.activity_id)
      .eq('delivery_id', delivery.id)
      .eq('kind', 'file')
      .order('created_at', { ascending: true });
    if (attachmentError) throw new Error('delivery_attachments_lookup_failed');

    const driveFiles: { name: string; url: string }[] = [];
    for (const attachment of attachments ?? []) {
      if (attachment.drive_url) {
        driveFiles.push({ name: attachment.file_name, url: attachment.drive_url });
        continue;
      }
      if (!attachment.storage_path) continue;
      const { data: file, error: downloadError } = await admin.storage
        .from('activity-attachments')
        .download(attachment.storage_path);
      if (downloadError || !file) throw new Error('attachment_download_failed');
      const uploaded = await uploadDriveFile(
        token,
        folderId,
        attachment.file_name,
        attachment.content_type || file.type || 'application/octet-stream',
        new Uint8Array(await file.arrayBuffer()),
      );
      if (!uploaded.id) throw new Error('attachment_upload_missing_id');
      const fileUrl = uploaded.webViewLink || `https://drive.google.com/file/d/${uploaded.id}/view`;
      const { error: updateAttachmentError } = await admin
        .from('activity_attachments')
        .update({ drive_url: fileUrl })
        .eq('id', attachment.id);
      if (updateAttachmentError) throw new Error('attachment_drive_link_save_failed');
      driveFiles.push({ name: attachment.file_name, url: fileUrl });
    }

    const date = new Date(delivery.created_at);
    const dateLabel = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(date);
    const documentTitle = `Entrega - ${activity.name} - ${date.toISOString().slice(0, 10)}`;
    let documentId = delivery.google_doc_id as string | null;
    if (!documentId) {
      const response = await googleRequest(token, 'https://www.googleapis.com/drive/v3/files?fields=id,webViewLink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: documentTitle,
          mimeType: 'application/vnd.google-apps.document',
          parents: [folderId],
        }),
      });
      const created = await response.json() as { id?: string; webViewLink?: string };
      if (!created.id) throw new Error('google_doc_creation_missing_id');
      documentId = created.id;
      const documentUrl = created.webViewLink || `https://docs.google.com/document/d/${documentId}/edit`;
      const { error: saveDocError } = await admin
        .from('activity_deliveries')
        .update({ google_doc_id: documentId, google_doc_url: documentUrl })
        .eq('id', delivery.id);
      if (saveDocError) throw new Error('google_doc_link_save_failed');
    }

    const attachmentText = driveFiles.length
      ? driveFiles.map((file, index) => `${index + 1}. ${file.name}\n${file.url}`).join('\n')
      : 'Nenhum arquivo anexado.';
    const documentText = [
      'SOLMAR CELERIS',
      'REGISTRO DE ENTREGA DE ATIVIDADE',
      '',
      `Atividade: ${activity.name}`,
      `Código: ${activity.code || 'Não informado'}`,
      `Setor: ${folder.name}`,
      `Responsável pelo registro: ${delivery.actor_name}`,
      `Data: ${dateLabel}`,
      '',
      'DESCRIÇÃO DA ENTREGA',
      delivery.description,
      '',
      'ANEXOS E EVIDÊNCIAS NO GOOGLE DRIVE',
      attachmentText,
    ].join('\n');

    const documentResponse = await googleRequest(token, `https://docs.googleapis.com/v1/documents/${documentId}`);
    const existingDocument = await documentResponse.json() as { body?: { content?: { endIndex?: number }[] } };
    const endIndex = existingDocument.body?.content?.at(-1)?.endIndex ?? 1;
    const documentRequests: Record<string, unknown>[] = [];
    if (endIndex > 2) {
      documentRequests.push({ deleteContentRange: { range: { startIndex: 1, endIndex: endIndex - 1 } } });
    }
    documentRequests.push({ insertText: { location: { index: 1 }, text: documentText } });
    await googleRequest(token, `https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: documentRequests }),
    });

    const documentUrl = `https://docs.google.com/document/d/${documentId}/edit`;
    const { error: doneError } = await admin
      .from('activity_deliveries')
      .update({ google_doc_id: documentId, google_doc_url: documentUrl, google_drive_status: 'synced', google_drive_error: null })
      .eq('id', delivery.id);
    if (doneError) throw new Error('delivery_sync_status_save_failed');

    return reply(200, { synced: true, google_doc_url: documentUrl, files: driveFiles.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'drive_sync_failed';
    await admin.from('activity_deliveries')
      .update({ google_drive_status: 'error', google_drive_error: message.slice(0, 500) })
      .eq('id', delivery.id);
    return reply(502, { error: 'google_drive_sync_failed', detail: message.slice(0, 300) });
  }
});
