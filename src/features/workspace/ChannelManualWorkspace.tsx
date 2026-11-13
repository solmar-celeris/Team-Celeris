import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Download, FileText, Pencil, Save, Upload } from 'lucide-react';
import { extractManualText } from './extractManualText';
import RichTextEditor, { RichTextContent } from './RichTextEditor';
import './channel-manual.css';

type ManualKind = 'conduct' | 'function';
type ManualRecord = { id: string; channel_id: string; manual_kind: ManualKind; title: string; content: string; original_file_path: string | null; original_file_name: string | null; updated_at: string; updated_by: string | null };
type Props = { client: SupabaseClient; userId: string; channelId: string; kind: ManualKind; title: string; isAdmin: boolean; fallback?: ReactNode };

export default function ChannelManualWorkspace({ client, userId, channelId, kind, title, isAdmin, fallback }: Props) {
  const [manual, setManual] = useState<ManualRecord | null>(null);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const { data, error: queryError } = await client.from('workspace_manuals')
      .select('id,channel_id,manual_kind,title,content,original_file_path,original_file_name,updated_at,updated_by')
      .eq('channel_id', channelId).eq('manual_kind', kind).maybeSingle();
    if (queryError) setError('Não foi possível carregar o manual. Confira se as migrations de documentação foram aplicadas.');
    const record = (data ?? null) as ManualRecord | null;
    setManual(record); setDraft(record?.content ?? ''); setLoading(false);
    if (record?.original_file_path) {
      const { data: signed } = await client.storage.from('workspace-manuals').createSignedUrl(record.original_file_path, 60 * 30);
      setDownloadUrl(signed?.signedUrl ?? '');
    } else setDownloadUrl('');
  }, [channelId, client, kind]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const channel = client.channel(`workspace-manual-${channelId}-${kind}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workspace_manuals', filter: `channel_id=eq.${channelId}` }, () => { void load(); })
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [channelId, client, kind, load]);

  async function saveContent(nextContent = draft, filePath?: string, fileName?: string) {
    setSaving(true); setError(''); setNotice('');
    const payload = { channel_id: channelId, manual_kind: kind, title, content: nextContent, updated_by: userId, updated_at: new Date().toISOString(),
      ...(filePath ? { original_file_path: filePath, original_file_name: fileName ?? null } : {}) };
    const { data, error: saveError } = await client.from('workspace_manuals').upsert(payload, { onConflict: 'channel_id,manual_kind' })
      .select('id,channel_id,manual_kind,title,content,original_file_path,original_file_name,updated_at,updated_by').single();
    if (saveError) { setError('Não foi possível salvar. Confirme a permissão de Administrador e a migration do manual.'); setSaving(false); return false; }
    const record = data as ManualRecord; setManual(record); setDraft(record.content); setEditing(false); setNotice('Manual atualizado.');
    if (record.original_file_path) {
      const { data: signed } = await client.storage.from('workspace-manuals').createSignedUrl(record.original_file_path, 60 * 30);
      setDownloadUrl(signed?.signedUrl ?? '');
    }
    setSaving(false); return true;
  }

  async function handleFile(file?: File) {
    if (!file || !isAdmin || uploading) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['pdf', 'docx'].includes(ext ?? '') || file.size <= 0 || file.size > 20 * 1024 * 1024) {
      setError('Escolha um PDF ou DOCX de até 20 MB.'); return;
    }
    setUploading(true); setError(''); setNotice('');
    let extracted = '';
    try { extracted = await extractManualText(file); if (!extracted.trim()) throw new Error('O documento não contém texto extraível.'); if (extracted.length > 1_000_000) throw new Error('O texto extraído excede 1 milhão de caracteres. Divida o documento em partes menores.'); }
    catch (extractError) { setError(extractError instanceof Error ? extractError.message : 'Não foi possível extrair o texto do documento.'); setUploading(false); return; }
    const append = Boolean(manual?.content.trim()) && window.confirm('Deseja ADICIONAR o texto ao final do manual atual? Se cancelar, o conteúdo será SUBSTITUÍDO.');
    const nextContent = append ? `${manual?.content.trim()}\n\n${extracted}` : extracted;
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-120);
    const path = `${channelId}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await client.storage.from('workspace-manuals').upload(path, file, { contentType: file.type || (ext === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'), upsert: false });
    if (uploadError) { setError('O texto foi extraído, mas o arquivo original não pôde ser armazenado. Confira a migration de Storage.'); setUploading(false); return; }
    const oldPath = manual?.original_file_path;
    const saved = await saveContent(nextContent, path, file.name);
    if (saved && oldPath && oldPath !== path) await client.storage.from('workspace-manuals').remove([oldPath]);
    if (!saved) await client.storage.from('workspace-manuals').remove([path]);
    setUploading(false);
  }

  if (loading) return <section className="channel-manual"><p>Carregando manual…</p></section>;
  return <section className="channel-manual" aria-labelledby="channel-manual-title">
    <header className="channel-manual-header"><div><p className="workspace-kicker">DOCUMENTAÇÃO INSTITUCIONAL</p><h2 id="channel-manual-title">{title}</h2><p>Documento institucional da equipe. Somente Administradores podem substituir documentos ou editar o texto. {kind === 'function' ? 'Envie somente o trecho da área, sem prompts ou instruções internas.' : 'O documento será disponibilizado aos integrantes do workspace.'}</p></div>
      {isAdmin && <label className="channel-manual-upload"><Upload size={15} /> {uploading ? 'Processando…' : 'Adicionar documento'}<input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={uploading} onChange={(event) => { void handleFile(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} /></label>}
    </header>
    {error && <p className="channel-manual-error" role="alert">{error}</p>}{notice && <p className="channel-manual-notice" role="status">{notice}</p>}
    {manual?.original_file_name && <div className="channel-manual-file"><FileText size={17} /><span>{manual.original_file_name}</span>{downloadUrl && <a href={downloadUrl} target="_blank" rel="noreferrer"><Download size={14} /> Baixar original</a>}</div>}
    {isAdmin && <div className="channel-manual-editor-actions">{editing ? <><button type="button" onClick={() => { setDraft(manual?.content ?? ''); setEditing(false); }}>Cancelar</button><button type="button" onClick={() => void saveContent()} disabled={saving}><Save size={14} /> {saving ? 'Salvando…' : 'Salvar alterações'}</button></> : <><button type="button" onClick={() => setEditing(true)}><Pencil size={14} /> Editar texto</button></>}</div>}
    {editing ? <RichTextEditor value={draft} onChange={setDraft} placeholder="Edite o conteúdo do manual…" minHeight={360} /> : manual?.content.trim() ? <RichTextContent html={manual.content} className="channel-manual-content rich-text-content" /> : fallback ?? <div className="channel-manual-empty"><FileText size={24} /><strong>Manual ainda não cadastrado</strong><span>{isAdmin ? 'Adicione um PDF ou DOCX para extrair o texto e armazenar o original.' : 'Um Administrador ainda não publicou o documento deste canal.'}</span></div>}
    {manual?.updated_at && <small className="channel-manual-updated">Atualizado em {new Date(manual.updated_at).toLocaleString('pt-BR')}</small>}
  </section>;
}
