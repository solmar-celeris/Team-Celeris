import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Download, ExternalLink, File, FileSpreadsheet, FileText, FolderOpen, Globe2, Grid2X2, List, Presentation, Trash2, Upload } from 'lucide-react';
import './channel-files.css';

type Item = { id: string; channel_id: string; name: string; item_kind: 'upload' | 'link'; storage_path: string | null; external_url: string | null; content_type: string | null; file_size: number | null; added_by: string | null; created_at: string };
type Props = { client: SupabaseClient; channelId: string; userId: string; isAdmin: boolean; viewMode: 'grid' | 'list'; onViewModeChange: (mode: 'grid' | 'list') => void };
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const ACCEPTED = new Set(['pdf','doc','docx','xls','xlsx','ppt','pptx','txt','csv','jpg','jpeg','png','gif','webp','zip']);
function ext(name: string) { return name.split('.').pop()?.toLowerCase() ?? ''; }
function ItemIcon({ item }: { item: Item }) {
  const extension = ext(item.name);
  if (item.item_kind === 'link') return <GlobeMark />;
  if (['doc','docx'].includes(extension)) return <FileText className="channel-file-icon is-word" />;
  if (['xls','xlsx','csv'].includes(extension)) return <FileSpreadsheet className="channel-file-icon is-excel" />;
  if (['ppt','pptx'].includes(extension)) return <Presentation className="channel-file-icon is-powerpoint" />;
  if (extension === 'pdf') return <FileText className="channel-file-icon is-pdf" />;
  return <File className="channel-file-icon" />;
}
function GlobeMark() { return <span className="channel-file-link-icon"><Globe2 size={21}/></span>; }
function sizeLabel(size: number | null) { if (!size) return ''; return size < 1024*1024 ? `${Math.round(size/1024)} KB` : `${(size/(1024*1024)).toFixed(1)} MB`; }
function friendlyError(error: unknown) { return error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Não foi possível concluir a operação.'; }

export default function ChannelFilesPanel({ client, channelId, userId, isAdmin, viewMode, onViewModeChange }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [kind, setKind] = useState<'upload'|'link'>('upload');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File|null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    const { data, error: queryError } = await client.from('workspace_channel_files').select('id,channel_id,name,item_kind,storage_path,external_url,content_type,file_size,added_by,created_at').eq('channel_id', channelId).order('created_at', { ascending: false });
    if (queryError) setError('Não foi possível carregar os arquivos. Aplique a migration de arquivos por canal.');
    else { setItems((data ?? []) as Item[]); setError(''); }
    setLoading(false);
  }, [channelId, client]);
  useEffect(() => { setLoading(true); void load(); }, [load]);
  useEffect(() => {
    const channel = client.channel(`workspace-channel-files-${channelId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'workspace_channel_files', filter: `channel_id=eq.${channelId}` }, () => { void load(); }).subscribe();
    return () => { void client.removeChannel(channel); };
  }, [channelId, client, load]);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      let storagePath: string | null = null;
      let externalUrl: string | null = null;
      let contentType: string | null = null;
      let fileSize: number | null = null;
      let itemName = name.trim();
      if (kind === 'upload') {
        if (!file) throw new Error('Selecione um arquivo.');
        const extension = ext(file.name);
        if (!ACCEPTED.has(extension) || file.size < 1 || file.size > MAX_FILE_SIZE) throw new Error('Formato não permitido ou arquivo acima de 50 MB.');
        itemName ||= file.name;
        const safeName = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-100);
        storagePath = `${channelId}/${userId}/${crypto.randomUUID()}-${safeName}`;
        contentType = file.type || null; fileSize = file.size;
        const { error: uploadError } = await client.storage.from('workspace-channel-files').upload(storagePath, file, { contentType: file.type || undefined, upsert: false });
        if (uploadError) throw uploadError;
      } else {
        const parsed = new URL(url.trim());
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('Informe um link HTTPS válido.');
        externalUrl = parsed.toString();
        if (!itemName) throw new Error('Informe o nome do atalho.');
      }
      const { error: insertError } = await client.from('workspace_channel_files').insert({ channel_id: channelId, name: itemName, item_kind: kind, storage_path: storagePath, external_url: externalUrl, content_type: contentType, file_size: fileSize, added_by: userId });
      if (insertError) {
        if (storagePath) await client.storage.from('workspace-channel-files').remove([storagePath]);
        throw insertError;
      }
      setName(''); setUrl(''); setFile(null); setFormOpen(false); setNotice(kind === 'upload' ? 'Arquivo adicionado ao canal.' : 'Atalho adicionado ao canal.');
      await load();
    } catch (submitError) { setError(friendlyError(submitError)); }
    finally { setBusy(false); }
  }
  async function openItem(item: Item) {
    if (item.item_kind === 'link' && item.external_url) { window.open(item.external_url, '_blank', 'noopener,noreferrer'); return; }
    if (!item.storage_path) return;
    const tab = window.open('about:blank', '_blank');
    if (!tab) { setError('Permita a abertura de novas abas para visualizar o arquivo.'); return; }
    const { data, error: signedError } = await client.storage.from('workspace-channel-files').createSignedUrl(item.storage_path, 60*15);
    if (signedError) { tab.close(); setError(friendlyError(signedError)); return; }
    tab.opener = null; tab.location.href = data.signedUrl;
  }
  async function remove(item: Item) {
    if (!window.confirm(`Remover “${item.name}” deste canal?`)) return;
    setBusy(true); setError('');
    if (item.storage_path) { const { error: storageError } = await client.storage.from('workspace-channel-files').remove([item.storage_path]); if (storageError) { setError(friendlyError(storageError)); setBusy(false); return; } }
    const { error: deleteError } = await client.from('workspace_channel_files').delete().eq('id', item.id);
    if (deleteError) setError(friendlyError(deleteError));
    else { setNotice('Item removido.'); await load(); }
    setBusy(false);
  }
  return <section className="channel-files-panel" aria-label="Arquivos e atalhos do canal">
    <header className="channel-files-heading"><div><h3>Arquivos e atalhos</h3><p>Documentos enviados e links úteis deste canal.</p></div><div className="channel-files-actions"><div className="channel-files-view" role="group" aria-label="Modo de visualização"><button type="button" className={viewMode==='grid'?'is-active':''} aria-pressed={viewMode==='grid'} onClick={()=>onViewModeChange('grid')} title="Visualizar em blocos"><Grid2X2 size={15}/></button><button type="button" className={viewMode==='list'?'is-active':''} aria-pressed={viewMode==='list'} onClick={()=>onViewModeChange('list')} title="Visualizar em lista"><List size={16}/></button></div><button type="button" className="channel-files-add" onClick={()=>setFormOpen((value)=>!value)}><Upload size={14}/> Adicionar arquivo/link</button></div></header>
    {formOpen && <form className="channel-files-form" onSubmit={(event)=>void submit(event)}><div className="channel-files-kind"><button type="button" className={kind==='upload'?'is-active':''} onClick={()=>setKind('upload')}>Arquivo do dispositivo</button><button type="button" className={kind==='link'?'is-active':''} onClick={()=>setKind('link')}>Atalho de internet</button></div>{kind==='upload'?<label>Arquivo<input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.gif,.webp,.zip" onChange={(event)=>setFile(event.currentTarget.files?.[0]??null)}/><small>Até 50 MB. Word, Excel, PowerPoint, PDF, imagens e arquivos comuns.</small></label>:<><label>Nome do atalho<input value={name} onChange={(event)=>setName(event.target.value)} required maxLength={180} placeholder="Ex.: Planilha de orçamento"/></label><label>Endereço HTTPS<input type="url" value={url} onChange={(event)=>setUrl(event.target.value)} required placeholder="https://…"/></label></>}<div className="channel-files-form-actions"><button type="button" onClick={()=>setFormOpen(false)} disabled={busy}>Cancelar</button><button type="submit" disabled={busy}>{busy?'Salvando…':'Adicionar'}</button></div></form>}
    {error&&<p className="channel-files-error" role="alert">{error}</p>}{notice&&<p className="channel-files-notice" role="status">{notice}</p>}
    {loading?<p className="channel-files-empty">Carregando arquivos…</p>:items.length===0?<div className="channel-files-empty"><FolderOpen size={22}/><strong>Nenhum arquivo ou atalho neste canal.</strong></div>:<div className={`channel-files-items is-${viewMode}`}>{items.map((item)=><article className="channel-file-item" key={item.id}><span className="channel-file-type"><ItemIcon item={item}/></span><span className="channel-file-copy"><strong title={item.name}>{item.name}</strong><small>{item.item_kind==='link'?'Atalho de internet':`${ext(item.name).toUpperCase()}${item.file_size?` · ${sizeLabel(item.file_size)}`:''}`} · {new Date(item.created_at).toLocaleDateString('pt-BR')}</small></span><button type="button" className="channel-file-open" onClick={()=>void openItem(item)} title={item.item_kind==='link'?'Abrir atalho':'Abrir/baixar arquivo'}>{item.item_kind==='link'?<ExternalLink size={15}/>:<Download size={15}/>}</button>{(item.added_by===userId||isAdmin)&&<button type="button" className="channel-file-remove" onClick={()=>void remove(item)} disabled={busy} title="Remover"><Trash2 size={14}/></button>}</article>)}</div>}
  </section>;
}
