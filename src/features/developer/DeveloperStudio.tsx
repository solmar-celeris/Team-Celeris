import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ArrowDown, ArrowLeft, ArrowUp, Camera, Check, ChevronDown, Code2, Eye, FileText,
  GripVertical, Image as ImageIcon, Layers3, LoaderCircle, Monitor, MousePointer2,
  Paperclip, Plus, RotateCcw, Save, Smartphone, Tablet, Trash2, Type, UploadCloud, Copy,
  WandSparkles, X,
} from 'lucide-react';
import './developer-studio.css';

type BlockType = 'heading' | 'text' | 'button' | 'image' | 'attachment' | 'camera' | 'form';
type BlockAction = 'none' | 'link' | 'attachment' | 'camera';
type EditorBlock = {
  id: string;
  type: BlockType;
  content: string;
  settings: {
    fontSize?: number;
    color?: string;
    background?: string;
    align?: 'left' | 'center' | 'right';
    action?: BlockAction;
    href?: string;
    buttonLabel?: string;
    assetPath?: string;
    assetName?: string;
  };
};
type DeveloperPage = {
  id: string;
  title: string;
  slug: string;
  description: string;
  status: 'draft' | 'published' | 'archived';
  draft_content: EditorBlock[];
  published_content: EditorBlock[];
  version: number;
  updated_at: string;
  published_at: string | null;
};
type VersionRow = { id: string; version: number; title: string; created_at: string; content: EditorBlock[] };
type Props = { client: SupabaseClient; userId: string; onLogout: () => void };
type Device = 'desktop' | 'tablet' | 'mobile';

const componentOptions: { type: BlockType; label: string; icon: typeof Type; description: string }[] = [
  { type: 'heading', label: 'Título', icon: Type, description: 'Títulos e chamadas' },
  { type: 'text', label: 'Texto', icon: FileText, description: 'Parágrafos e descrições' },
  { type: 'button', label: 'Botão', icon: MousePointer2, description: 'Ações e links' },
  { type: 'image', label: 'Imagem', icon: ImageIcon, description: 'Imagens por URL' },
  { type: 'attachment', label: 'Anexos', icon: Paperclip, description: 'Upload e download de arquivos' },
  { type: 'camera', label: 'Câmera', icon: Camera, description: 'Captura de fotos pelo navegador' },
  { type: 'form', label: 'Formulário', icon: WandSparkles, description: 'Campos para pré-visualização' },
];

function createBlock(type: BlockType): EditorBlock {
  const defaults: Record<BlockType, { content: string; fontSize: number; action?: BlockAction }> = {
    heading: { content: 'Novo título', fontSize: 32 },
    text: { content: 'Escreva aqui o conteúdo deste bloco.', fontSize: 16 },
    button: { content: 'Clique aqui', fontSize: 14, action: 'link' },
    image: { content: 'https://placehold.co/1200x600?text=Sua+imagem', fontSize: 16 },
    attachment: { content: 'Adicionar anexo', fontSize: 14, action: 'attachment' },
    camera: { content: 'Capturar foto', fontSize: 14, action: 'camera' },
    form: { content: 'Formulário de contato', fontSize: 16 },
  };
  const item = defaults[type];
  return {
    id: crypto.randomUUID(), type, content: item.content,
    settings: { fontSize: item.fontSize, color: '#243448', background: type === 'button' ? '#1268a8' : 'transparent', align: 'left', action: item.action, href: type === 'button' ? 'https://example.com' : '' },
  };
}

function safeSlug(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70);
}

function isSafeWebUrl(value: string) {
  try { const url = new URL(value); return url.protocol === 'https:' || url.protocol === 'http:'; } catch { return false; }
}

function CameraBlock({ onCapture, busy }: { onCapture: (blob: Blob) => void; busy: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState('');
  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setActive(false);
  }, []);
  useEffect(() => {
    if (active && videoRef.current && streamRef.current) videoRef.current.srcObject = streamRef.current;
  }, [active]);
  useEffect(() => () => stop(), [stop]);
  async function start() {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) { setError('A câmera não está disponível neste navegador ou contexto.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      streamRef.current = stream;
      setActive(true);
    } catch { setError('Não foi possível acessar a câmera. Confira a permissão do navegador.'); }
  }
  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.drawImage(video, 0, 0);
    canvas.toBlob((blob) => { if (blob) { onCapture(blob); stop(); } }, 'image/jpeg', 0.9);
  }
  return <div className="vs-camera-block">
    {active ? <><video ref={videoRef} autoPlay playsInline muted /><div className="vs-camera-actions"><button type="button" onClick={capture} disabled={busy}><Camera size={15}/> Capturar foto</button><button type="button" className="is-muted" onClick={stop}>Cancelar</button></div></> : <button type="button" onClick={() => void start()} disabled={busy}><Camera size={17}/> Abrir câmera</button>}
    {error && <small role="alert">{error}</small>}
  </div>;
}

export default function DeveloperStudio({ client, userId, onLogout }: Props) {
  const [pages, setPages] = useState<DeveloperPage[]>([]);
  const [page, setPage] = useState<DeveloperPage | null>(null);
  const [blocks, setBlocks] = useState<EditorBlock[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [device, setDevice] = useState<Device>('desktop');
  const [leftTab, setLeftTab] = useState<'elements' | 'layers' | 'history'>('elements');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragType, setDragType] = useState<BlockType | null>(null);
  const selected = useMemo(() => blocks.find((block) => block.id === selectedId) ?? null, [blocks, selectedId]);

  const loadVersions = useCallback(async (pageId: string) => {
    const { data, error: versionsError } = await client.from('developer_page_versions').select('id,version,title,created_at,content').eq('page_id', pageId).order('version', { ascending: false }).limit(30);
    if (!versionsError) setVersions((data ?? []) as VersionRow[]);
  }, [client]);

  const loadPages = useCallback(async (preferredId?: string) => {
    setLoading(true); setError('');
    const { data, error: loadError } = await client.from('developer_pages').select('*').neq('status', 'archived').order('updated_at', { ascending: false });
    if (loadError) {
      setError('Não foi possível carregar o Visual Studio. Aplique a migration 20261113090000_visual_studio_developer_role.sql e confirme sua função Desenvolvedor.');
      setLoading(false); return;
    }
    const rows = (data ?? []) as DeveloperPage[];
    setPages(rows);
    const current = rows.find((row) => row.id === preferredId) ?? rows[0] ?? null;
    setPage(current);
    setBlocks(current?.draft_content ?? []);
    setSelectedId(current?.draft_content?.[0]?.id ?? null);
    if (current) await loadVersions(current.id); else setVersions([]);
    setDirty(false); setLoading(false);
  }, [client, loadVersions]);

  useEffect(() => { void loadPages(); }, [loadPages]);

  function selectPage(next: DeveloperPage) {
    if (dirty && !window.confirm('Existem alterações não salvas. Descartar e abrir outra página?')) return;
    setPage(next); setBlocks(next.draft_content ?? []); setSelectedId(next.draft_content?.[0]?.id ?? null); setDirty(false); setNotice(''); setError('');
    void loadVersions(next.id);
  }

  async function createPage() {
    if (dirty && !window.confirm('Existem alterações não salvas. Descartar e criar outra página?')) return;
    setSaving(true); setError('');
    const title = 'Nova página';
    const slug = `nova-pagina-${crypto.randomUUID().slice(0, 6)}`;
    const initial = [createBlock('heading'), createBlock('text')];
    const { data, error: createError } = await client.from('developer_pages').insert({ title, slug, description: '', status: 'draft', draft_content: initial, published_content: [], created_by: userId, updated_by: userId }).select('*').single();
    if (createError) setError(createError.message.includes('developer_pages') ? 'A estrutura do Visual Studio ainda não existe no Supabase. Aplique a migration indicada.' : 'Não foi possível criar a página. Confira as permissões de Desenvolvedor.');
    else { await loadPages(data.id); setNotice('Página criada. Você já pode personalizar os componentes.'); }
    setSaving(false);
  }

  function updatePageField(field: 'title' | 'slug' | 'description', value: string) {
    setPage((current) => current ? { ...current, [field]: value } : current);
    setDirty(true);
  }

  function updateBlock(id: string, patch: Partial<EditorBlock> & { settings?: Partial<EditorBlock['settings']> }) {
    setBlocks((current) => current.map((block) => block.id === id ? { ...block, ...patch, settings: { ...block.settings, ...patch.settings } } : block));
    setDirty(true);
  }

  function addBlock(type: BlockType) {
    const block = createBlock(type);
    setBlocks((current) => [...current, block]); setSelectedId(block.id); setDirty(true); setLeftTab('layers');
  }

  function removeBlock(id: string) {
    setBlocks((current) => current.filter((block) => block.id !== id));
    setSelectedId((current) => current === id ? null : current); setDirty(true);
  }

  function moveBlock(id: string, direction: -1 | 1) {
    setBlocks((current) => {
      const index = current.findIndex((item) => item.id === id); const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const copy = [...current]; [copy[index], copy[nextIndex]] = [copy[nextIndex], copy[index]]; return copy;
    }); setDirty(true);
  }

  function handleDrop(event: DragEvent<HTMLElement>, targetId: string) {
    event.preventDefault();
    if (dragType) {
      const block = createBlock(dragType);
      setBlocks((current) => { const copy = [...current]; const targetIndex = copy.findIndex((item) => item.id === targetId); copy.splice(targetIndex < 0 ? copy.length : targetIndex, 0, block); return copy; });
      setSelectedId(block.id); setDragType(null); setDirty(true); return;
    }
    const sourceId = dragId ?? event.dataTransfer.getData('text/plain');
    if (!sourceId || sourceId === targetId) return;
    setBlocks((current) => {
      const copy = [...current]; const from = copy.findIndex((item) => item.id === sourceId); const to = copy.findIndex((item) => item.id === targetId);
      if (from < 0 || to < 0) return current;
      const [moved] = copy.splice(from, 1); copy.splice(to, 0, moved); return copy;
    }); setDragId(null); setDirty(true);
  }

  function handleCanvasDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    if (dragType) {
      const block = createBlock(dragType);
      setBlocks((current) => [...current, block]); setSelectedId(block.id); setLeftTab('layers'); setDragType(null); setDirty(true);
      return;
    }
    if (dragId) {
      setBlocks((current) => { const copy = [...current]; const index = copy.findIndex((item) => item.id === dragId); if (index < 0) return current; const [moved] = copy.splice(index, 1); copy.push(moved); return copy; });
      setDragId(null); setDirty(true);
    }
  }

  async function saveDraft(): Promise<boolean> {
    if (!page || saving) return false;
    const title = page.title.trim(); const slug = safeSlug(page.slug);
    if (title.length < 1 || !slug) { setError('Informe um título e um endereço válido para a página.'); return false; }
    setSaving(true); setError(''); setNotice('');
    const { data, error: saveError } = await client.from('developer_pages').update({ title, slug, description: page.description.slice(0, 500), draft_content: blocks, updated_by: userId, updated_at: new Date().toISOString() }).eq('id', page.id).select('*').single();
    if (saveError) { setError(saveError.code === '23505' ? 'Já existe uma página com esse endereço. Escolha outro slug.' : 'Não foi possível salvar o rascunho. Verifique a conexão e as permissões.'); setSaving(false); return false; }
    setPage(data as DeveloperPage); setPages((current) => current.map((item) => item.id === page.id ? data as DeveloperPage : item)); setDirty(false); setNotice('Rascunho salvo no Supabase. Nenhum deploy foi necessário.');
    setSaving(false);
    return true;
  }

  async function publish() {
    if (!page) return;
    if (dirty) { const saved = await saveDraft(); if (!saved) return; }
    setPublishing(true); setError(''); setNotice('');
    const { data, error: publishError } = await client.functions.invoke('developer-publish', { body: { page_id: page.id } });
    if (publishError || data?.status !== 'published') setError('Não foi possível publicar. Confira se a Edge Function developer-publish foi implantada e se você continua com a função Desenvolvedor.');
    else { setNotice(`Página publicada na versão ${data.version}. A publicação de conteúdo não exige deploy.`); await loadPages(page.id); }
    setPublishing(false);
  }

  async function restoreVersion(version: VersionRow) {
    if (!page || !window.confirm(`Restaurar a versão ${version.version} como rascunho? A versão publicada não será alterada até você publicar novamente.`)) return;
    setError(''); setNotice('');
    const { error: restoreError } = await client.functions.invoke('developer-restore-version', { body: { page_id: page.id, version_id: version.id } });
    if (restoreError) setError('Não foi possível restaurar esta versão. Confira a Edge Function developer-restore-version.');
    else { await loadPages(page.id); setNotice(`Versão ${version.version} restaurada como rascunho.`); }
  }

  async function uploadAsset(file: File, blockId: string) {
    if (!page) return;
    const allowed = /^(image\/(jpeg|png|webp|gif)|application\/pdf|text\/(plain|csv)|application\/(msword|vnd\.ms-excel|vnd\.ms-powerpoint|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation))|video\/(mp4|webm)|audio\/(mpeg|webm))$/;
    if (!allowed.test(file.type) || file.size > 20 * 1024 * 1024) { setError('Formato não permitido ou arquivo acima de 20 MB.'); return; }
    setUploading(true); setError('');
    const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
    const path = `${userId}/${page.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await client.storage.from('developer-assets').upload(path, file, { contentType: file.type, upsert: false, cacheControl: '3600' });
    if (uploadError) setError('Não foi possível enviar o arquivo. Confira a migration e as permissões do bucket developer-assets.');
    else {
      const { data: signed } = await client.storage.from('developer-assets').createSignedUrl(path, 60 * 60 * 24 * 7);
      updateBlock(blockId, { settings: { assetPath: path, assetName: file.name }, content: signed?.signedUrl ?? file.name });
      setNotice('Arquivo enviado ao armazenamento privado do Team Celeris.');
    }
    setUploading(false);
  }

  async function copyPublishedLink() {
    if (!page) return;
    const url = new URL(window.location.href);
    url.search = ''; url.hash = ''; url.searchParams.set('page', page.slug);
    try { await navigator.clipboard.writeText(url.toString()); setNotice('Link da página copiado.'); }
    catch { setNotice(`Link da página: ${url.toString()}`); }
  }

  async function capturePhoto(blob: Blob, blockId: string) {
    const file = new File([blob], `captura-${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`, { type: 'image/jpeg' });
    await uploadAsset(file, blockId);
  }

  function blockStyle(block: EditorBlock): CSSProperties {
    return { color: block.settings.color || undefined, background: block.settings.background && block.settings.background !== 'transparent' ? block.settings.background : undefined, textAlign: block.settings.align ?? 'left', fontSize: `${block.settings.fontSize ?? 16}px` };
  }

  function renderBlock(block: EditorBlock, isSelected = false) {
    const common = { className: `vs-render-block vs-block-${block.type}${isSelected ? ' is-selected' : ''}`, style: blockStyle(block), onClick: () => !preview && setSelectedId(block.id), onDragOver: (event: DragEvent<HTMLElement>) => event.preventDefault(), onDrop: (event: DragEvent<HTMLElement>) => handleDrop(event, block.id), draggable: !preview, onDragStart: (event: DragEvent<HTMLElement>) => { setDragId(block.id); setDragType(null); event.dataTransfer.setData('text/plain', block.id); } };
    if (block.type === 'heading') return <div key={block.id} {...common}><h2 style={{ margin: 0, fontSize: 'inherit', fontWeight: 760 }}>{block.content}</h2></div>;
    if (block.type === 'text') return <div key={block.id} {...common}><p style={{ margin: 0, lineHeight: 1.7 }}>{block.content}</p></div>;
    if (block.type === 'button') return <div key={block.id} {...common}><a className="vs-preview-button" href={block.settings.action === 'link' && isSafeWebUrl(block.settings.href ?? '') ? block.settings.href : undefined} onClick={(event) => { if (!preview || block.settings.action !== 'link' || !isSafeWebUrl(block.settings.href ?? '')) event.preventDefault(); }} style={{ background: block.settings.background || '#1268a8', color: '#fff' }}>{block.content}</a></div>;
    if (block.type === 'image') return <div key={block.id} {...common}>{isSafeWebUrl(block.content) ? <img src={block.content} alt="Imagem da página" loading="lazy" /> : <div className="vs-empty-media"><ImageIcon/> Informe uma URL de imagem no painel de propriedades.</div>}</div>;
    if (block.type === 'attachment') return <div key={block.id} {...common}><div className="vs-attachment-preview"><Paperclip/><div><strong>{block.settings.assetName || block.content}</strong><small>{block.settings.assetPath ? 'Arquivo armazenado no Supabase' : 'Nenhum arquivo anexado'}</small></div>{block.content.startsWith('https://') && <a href={block.content} target="_blank" rel="noreferrer">Abrir</a>}{!preview && <label className="vs-inline-upload">{uploading ? 'Enviando…' : 'Selecionar arquivo'}<input type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAsset(file, block.id); event.currentTarget.value = ''; }} /></label>}</div></div>;
    if (block.type === 'camera') return <div key={block.id} {...common}><CameraBlock onCapture={(blob) => void capturePhoto(blob, block.id)} busy={uploading}/>{block.settings.assetName && <small className="vs-uploaded-name">Última captura: {block.settings.assetName}</small>}</div>;
    return <div key={block.id} {...common}><form className="vs-form-preview" onSubmit={(event) => { event.preventDefault(); window.alert('Prévia: o envio do formulário precisa ser conectado a um destino de dados antes da publicação.'); }}><strong>{block.content}</strong><input placeholder="Nome" aria-label="Nome"/><input type="email" placeholder="E-mail" aria-label="E-mail"/><textarea placeholder="Mensagem" aria-label="Mensagem" rows={3}/><button type="submit">Enviar formulário (prévia)</button></form></div>;
  }

  const deviceClass = device === 'desktop' ? 'is-desktop' : device === 'tablet' ? 'is-tablet' : 'is-mobile';

  return <main className="visual-studio-shell">
    <header className="vs-topbar">
      <div className="vs-brand"><button type="button" className="vs-back" onClick={onLogout} title="Sair do Visual Studio"><ArrowLeft size={17}/></button><span className="vs-brand-mark"><Code2 size={19}/></span><div><strong>Team Celeris</strong><small>VISUAL STUDIO</small></div></div>
      <div className="vs-page-name"><span>{page?.title ?? 'Carregando páginas'}</span>{dirty && <i title="Alterações não salvas"/>}</div>
      <div className="vs-top-actions"><button type="button" className={`vs-tool-button${preview ? ' is-active' : ''}`} onClick={() => setPreview((value) => !value)}><Eye size={16}/>{preview ? 'Editar' : 'Prévia'}</button><button type="button" className="vs-save-button" onClick={() => void saveDraft()} disabled={!page || saving || !dirty}><Save size={15}/>{saving ? 'Salvando…' : 'Salvar'}</button><button type="button" className="vs-publish-button" onClick={() => void publish()} disabled={!page || publishing || saving}>{publishing ? <LoaderCircle size={15} className="vs-spin"/> : <Check size={15}/>}Publicar</button>{page?.status === 'published' && <button type="button" className="vs-tool-button" onClick={() => void copyPublishedLink()} title="Copiar link da página"><Copy size={15}/></button>}<button type="button" className="vs-logout" onClick={onLogout}>Sair</button></div>
    </header>

    <div className="vs-workspace">
      <aside className="vs-left-panel">
        <div className="vs-panel-tabs"><button type="button" className={leftTab === 'elements' ? 'active' : ''} onClick={() => setLeftTab('elements')}><Plus size={15}/> Elementos</button><button type="button" className={leftTab === 'layers' ? 'active' : ''} onClick={() => setLeftTab('layers')}><Layers3 size={15}/> Camadas</button><button type="button" className={leftTab === 'history' ? 'active' : ''} onClick={() => setLeftTab('history')}><RotateCcw size={15}/> Histórico</button></div>
        {leftTab === 'elements' && <div className="vs-panel-content"><div className="vs-panel-heading"><div><small>CONSTRUTOR</small><h2>Elementos</h2></div><span>{componentOptions.length}</span></div><div className="vs-component-grid">{componentOptions.map((item) => { const Icon = item.icon; return <button type="button" key={item.type} draggable onDragStart={(event) => { setDragType(item.type); setDragId(null); event.dataTransfer.setData('text/plain', item.type); }} onClick={() => addBlock(item.type)}><Icon size={19}/><strong>{item.label}</strong><small>{item.description}</small></button>; })}</div><div className="vs-panel-note"><WandSparkles size={15}/><span>Arraste componentes para a página ou clique para adicionar. Arraste as camadas para reorganizar.</span></div></div>}
        {leftTab === 'layers' && <div className="vs-panel-content"><div className="vs-panel-heading"><div><small>ESTRUTURA</small><h2>Camadas</h2></div><span>{blocks.length}</span></div>{blocks.length === 0 ? <p className="vs-empty-state">Adicione elementos para começar.</p> : <div className="vs-layer-list">{blocks.map((block, index) => { const option = componentOptions.find((item) => item.type === block.type)!; const Icon = option.icon; return <div className={`vs-layer-row${selectedId === block.id ? ' is-active' : ''}`} key={block.id}><button type="button" onClick={() => setSelectedId(block.id)}><GripVertical size={13}/><Icon size={15}/><span>{option.label} · {block.content.slice(0, 22)}</span></button><div><button type="button" title="Mover para cima" onClick={() => moveBlock(block.id, -1)} disabled={index === 0}><ArrowUp size={13}/></button><button type="button" title="Mover para baixo" onClick={() => moveBlock(block.id, 1)} disabled={index === blocks.length - 1}><ArrowDown size={13}/></button></div></div>; })}</div>}</div>}
        {leftTab === 'history' && <div className="vs-panel-content"><div className="vs-panel-heading"><div><small>VERSÕES PUBLICADAS</small><h2>Histórico</h2></div><button type="button" onClick={() => page && void loadVersions(page.id)} title="Atualizar histórico"><RotateCcw size={14}/></button></div>{versions.length === 0 ? <p className="vs-empty-state">As versões aparecerão aqui depois da primeira publicação.</p> : <div className="vs-version-list">{versions.map((version) => <article key={version.id}><div><strong>Versão {version.version}</strong><small>{new Date(version.created_at).toLocaleString('pt-BR')}</small></div><button type="button" onClick={() => void restoreVersion(version)}>Restaurar</button></article>)}</div>}</div>}
        <div className="vs-pages-area"><div className="vs-pages-heading"><strong>Páginas</strong><button type="button" onClick={() => void createPage()} disabled={saving} title="Criar página"><Plus size={15}/></button></div>{pages.map((item) => <button type="button" key={item.id} className={`vs-page-row${page?.id === item.id ? ' is-active' : ''}`} onClick={() => selectPage(item)}><FileText size={14}/><span>{item.title}</span><i className={item.status === 'published' ? 'is-published' : ''}/></button>)}</div>
      </aside>

      <section className="vs-canvas-area">
        <div className="vs-canvas-toolbar"><div className="vs-breadcrumb">Páginas <ChevronDown size={13}/> <strong>{page?.title ?? '—'}</strong></div><div className="vs-device-switch"><button type="button" className={device === 'desktop' ? 'active' : ''} onClick={() => setDevice('desktop')} title="Desktop"><Monitor size={16}/></button><button type="button" className={device === 'tablet' ? 'active' : ''} onClick={() => setDevice('tablet')} title="Tablet"><Tablet size={16}/></button><button type="button" className={device === 'mobile' ? 'active' : ''} onClick={() => setDevice('mobile')} title="Celular"><Smartphone size={16}/></button></div><span className="vs-preview-label">{preview ? 'MODO PRÉVIA' : 'EDIÇÃO AO VIVO'}</span></div>
        <div className="vs-canvas-scroll"><div className={`vs-page-canvas ${deviceClass}${preview ? ' is-preview' : ''}`} onDragOver={(event) => event.preventDefault()} onDrop={handleCanvasDrop}>
          {loading ? <div className="vs-loading"><LoaderCircle className="vs-spin"/> Carregando Visual Studio…</div> : !page ? <div className="vs-empty-canvas"><Layers3 size={34}/><h2>Comece uma nova página</h2><p>Crie uma página e adicione seus primeiros componentes.</p><button type="button" onClick={() => void createPage()}><Plus size={15}/> Criar página</button></div> : blocks.length === 0 ? <div className="vs-empty-canvas"><Plus size={30}/><h2>Sua página está vazia</h2><p>Escolha um elemento na biblioteca para começar a construir.</p></div> : blocks.map((block) => renderBlock(block, !preview && selectedId === block.id))}
          {!preview && page && <button type="button" className="vs-canvas-add" onClick={() => { setLeftTab('elements'); }}><Plus size={16}/> Adicionar elemento</button>}
        </div></div>
        <div className="vs-canvas-footer"><span><span className="vs-status-dot"/> {dirty ? 'Alterações pendentes' : 'Tudo salvo'}</span><span>{blocks.length} elemento(s) · {device === 'desktop' ? 'Largura total' : device === 'tablet' ? '768 px' : '390 px'}</span></div>
      </section>

      <aside className="vs-right-panel"><div className="vs-properties-header"><div><small>CONFIGURAÇÕES</small><h2>{selected ? componentOptions.find((item) => item.type === selected.type)?.label : 'Página'}</h2></div>{selected && <button type="button" onClick={() => removeBlock(selected.id)} title="Excluir elemento"><Trash2 size={16}/></button>}</div>
        {!selected ? page ? <div className="vs-properties-content"><label>Título da página<input value={page.title} maxLength={120} onChange={(event) => updatePageField('title', event.target.value)}/></label><label>Endereço (slug)<input value={page.slug} maxLength={70} onChange={(event) => updatePageField('slug', safeSlug(event.target.value))}/></label><label>Descrição<textarea value={page.description} maxLength={500} rows={3} onChange={(event) => updatePageField('description', event.target.value)}/></label><div className="vs-page-meta"><span>Status</span><strong>{page.status === 'published' ? (JSON.stringify(blocks) !== JSON.stringify(page.published_content) ? `Publicada · v${page.version} (rascunho alterado)` : `Publicada · v${page.version}`) : 'Rascunho'}</strong><span>Última publicação</span><strong>{page.published_at ? new Date(page.published_at).toLocaleString('pt-BR') : 'Ainda não publicada'}</strong></div></div> : <p className="vs-empty-state">Crie ou selecione uma página.</p> : <div className="vs-properties-content"><label>Conteúdo<textarea rows={selected.type === 'text' ? 6 : 3} value={selected.content} onChange={(event) => updateBlock(selected.id, { content: event.target.value })}/></label>{selected.type === 'button' && <><label>Ação do botão<select value={selected.settings.action ?? 'link'} onChange={(event) => updateBlock(selected.id, { settings: { action: event.target.value as BlockAction } })}><option value="link">Abrir link</option><option value="none">Sem ação</option></select></label>{selected.settings.action === 'link' && <label>URL de destino<input type="url" placeholder="https://..." value={selected.settings.href ?? ''} onChange={(event) => updateBlock(selected.id, { settings: { href: event.target.value } })}/></label>}</>}{selected.type === 'image' && <><label>URL da imagem<input type="url" value={selected.content} onChange={(event) => updateBlock(selected.id, { content: event.target.value, settings: { assetPath: '' } })} placeholder="https://..."/></label><label>Enviar imagem<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAsset(file, selected.id); event.currentTarget.value = ''; }}/></label></>}
          <div className="vs-property-grid"><label>Tamanho (px)<input type="number" min={10} max={96} value={selected.settings.fontSize ?? 16} onChange={(event) => updateBlock(selected.id, { settings: { fontSize: Math.min(96, Math.max(10, Number(event.target.value) || 16)) } })}/></label><label>Alinhamento<select value={selected.settings.align ?? 'left'} onChange={(event) => updateBlock(selected.id, { settings: { align: event.target.value as 'left' | 'center' | 'right' } })}><option value="left">Esquerda</option><option value="center">Centro</option><option value="right">Direita</option></select></label></div>
          <div className="vs-property-grid"><label>Cor do texto<input type="color" value={/^#[0-9a-f]{6}$/i.test(selected.settings.color ?? '') ? selected.settings.color : '#243448'} onChange={(event) => updateBlock(selected.id, { settings: { color: event.target.value } })}/></label><label>Cor de fundo<input type="color" value={/^#[0-9a-f]{6}$/i.test(selected.settings.background ?? '') ? selected.settings.background : '#ffffff'} onChange={(event) => updateBlock(selected.id, { settings: { background: event.target.value } })}/></label></div>
          {selected.type === 'attachment' && <div className="vs-property-help"><UploadCloud size={16}/> O bloco permite enviar arquivos de até 20 MB para o bucket privado developer-assets.</div>}{selected.type === 'camera' && <div className="vs-property-help"><Camera size={16}/> A câmera exige HTTPS e autorização explícita do navegador.</div>}{selected.type === 'form' && <div className="vs-property-help">Este formulário é apenas uma prévia visual. Para receber respostas, será necessário configurar um destino e uma política de dados.</div>}
          <div className="vs-order-actions"><button type="button" onClick={() => moveBlock(selected.id, -1)}><ArrowUp size={14}/> Subir</button><button type="button" onClick={() => moveBlock(selected.id, 1)}><ArrowDown size={14}/> Descer</button></div>
        </div>}
      </aside>
    </div>
    {(notice || error) && <div className={`vs-toast ${error ? 'is-error' : 'is-success'}`} role={error ? 'alert' : 'status'}>{error || notice}<button type="button" onClick={() => { setError(''); setNotice(''); }} aria-label="Fechar aviso"><X size={15}/></button></div>}
  </main>;
}
