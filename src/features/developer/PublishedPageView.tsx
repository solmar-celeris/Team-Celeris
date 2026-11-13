import { useEffect, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ArrowLeft, Camera, Download, LoaderCircle, Paperclip } from 'lucide-react';
import type { MemberProfile } from '../workspace/domain';
import './published-page.css';

type Block = {
  id: string; type: 'heading' | 'text' | 'button' | 'image' | 'attachment' | 'camera' | 'form'; content: string;
  settings: { fontSize?: number; color?: string; background?: string; align?: 'left' | 'center' | 'right'; action?: string; href?: string; assetPath?: string; assetName?: string };
};
type Props = { client: SupabaseClient; slug: string; profile: MemberProfile; onBack: () => void };

function safeUrl(value: string) {
  try { const url = new URL(value); return url.protocol === 'https:' || url.protocol === 'http:'; } catch { return false; }
}

function PublishedCamera() {
  const [active, setActive] = useState(false);
  const [photo, setPhoto] = useState('');
  const [error, setError] = useState('');
  const [stream, setStream] = useState<MediaStream | null>(null);
  useEffect(() => () => stream?.getTracks().forEach((track) => track.stop()), [stream]);
  async function openCamera() {
    setError('');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('unavailable');
      const next = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      setStream(next); setActive(true);
    } catch { setError('Não foi possível acessar a câmera. Verifique a permissão do navegador.'); }
  }
  function takePhoto() {
    const video = document.querySelector<HTMLVideoElement>('.published-camera-video');
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const context = canvas.getContext('2d'); if (!context) return;
    context.drawImage(video, 0, 0); setPhoto(canvas.toDataURL('image/jpeg', .9));
    stream?.getTracks().forEach((track) => track.stop()); setStream(null); setActive(false);
  }
  return <div className="published-camera">
    {active ? <><video className="published-camera-video" autoPlay playsInline muted ref={(node) => { if (node && stream && node.srcObject !== stream) node.srcObject = stream; }}/><button type="button" onClick={takePhoto}><Camera size={16}/> Capturar foto</button></> : <button type="button" onClick={() => void openCamera()}><Camera size={16}/> Abrir câmera</button>}
    {photo && <img src={photo} alt="Foto capturada"/>}{error && <small role="alert">{error}</small>}
  </div>;
}

export default function PublishedPageView({ client, slug, profile, onBack }: Props) {
  const [page, setPage] = useState<{ id: string; title: string; description: string; published_content: Block[] } | null>(null);
  const [assets, setAssets] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formValues, setFormValues] = useState<Record<string, { name: string; email: string; message: string }>>({});
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true); setError('');
      const { data, error: loadError } = await client.from('developer_pages').select('id,title,description,published_content').eq('slug', slug).eq('status', 'published').maybeSingle();
      if (!mounted) return;
      if (loadError || !data) { setError('Esta página não existe ou ainda não foi publicada.'); setLoading(false); return; }
      const content = (data.published_content ?? []) as Block[];
      setPage({ id: data.id, title: data.title, description: data.description, published_content: content });
      const paths = [...new Set(content.map((block) => block.settings?.assetPath).filter((path): path is string => Boolean(path)))];
      const pairs = await Promise.all(paths.map(async (path) => {
        const { data: signed } = await client.storage.from('developer-assets').createSignedUrl(path, 60 * 60);
        return [path, signed?.signedUrl ?? ''] as const;
      }));
      if (mounted) { setAssets(Object.fromEntries(pairs)); setLoading(false); }
    }
    void load(); return () => { mounted = false; };
  }, [client, slug]);

  async function submitForm(event: FormEvent<HTMLFormElement>, blockId: string) {
    event.preventDefault(); if (!page || submitting) return;
    setSubmitting(blockId); setError('');
    const payload = formValues[blockId] ?? { name: '', email: '', message: '' };
    const { error: submitError } = await client.from('developer_form_submissions').insert({
      page_id: page.id,
      submitter_id: profile.user_id,
      payload,
    });
    if (submitError) setError('Não foi possível enviar o formulário. Tente novamente.');
    else setSubmitted((current) => ({ ...current, [blockId]: true }));
    setSubmitting(null);
  }

  return <main className="published-page-shell"><header><button type="button" onClick={onBack}><ArrowLeft size={16}/> Team Celeris</button><span>TEAM CELERIS</span></header>
    {loading ? <div className="published-page-state"><LoaderCircle className="published-page-spin"/> Carregando página…</div> : error && !page ? <div className="published-page-state"><h1>Página indisponível</h1><p>{error}</p><button type="button" onClick={onBack}>Voltar</button></div> : page && <article className="published-page-content"><h1>{page.title}</h1>{page.description && <p className="published-page-description">{page.description}</p>}
      {page.published_content.map((block) => {
        const style = { color: block.settings?.color || undefined, background: block.settings?.background && block.settings.background !== 'transparent' ? block.settings.background : undefined, textAlign: block.settings?.align ?? 'left' as const, fontSize: `${block.settings?.fontSize ?? 16}px` };
        if (block.type === 'heading') return <h2 key={block.id} style={style}>{block.content}</h2>;
        if (block.type === 'text') return <p key={block.id} className="published-page-text" style={style}>{block.content}</p>;
        if (block.type === 'button') return <div key={block.id} style={style}><a className="published-page-button" href={block.settings?.action === 'link' && safeUrl(block.settings.href ?? '') ? block.settings.href : undefined} onClick={(event) => { if (block.settings?.action !== 'link' || !safeUrl(block.settings.href ?? '')) event.preventDefault(); }}>{block.content}</a></div>;
        if (block.type === 'image') { const imageUrl = block.settings?.assetPath ? assets[block.settings.assetPath] : block.content; return <div key={block.id} className="published-page-image">{imageUrl && safeUrl(imageUrl) && <img src={imageUrl} alt="" loading="lazy"/>}</div>; }
        if (block.type === 'attachment') { const href = block.settings?.assetPath ? assets[block.settings.assetPath] : block.content; return <div key={block.id} className="published-page-attachment"><Paperclip/><span>{block.settings?.assetName || block.content}</span>{href?.startsWith('https://') && <a href={href} target="_blank" rel="noreferrer"><Download size={15}/> Abrir arquivo</a>}</div>; }
        if (block.type === 'camera') return <div key={block.id} className="published-page-widget"><PublishedCamera/></div>;
        return <form key={block.id} className="published-page-form" onSubmit={(event) => void submitForm(event, block.id)}><h3>{block.content}</h3>{submitted[block.id] ? <p className="published-page-success">Resposta enviada com sucesso.</p> : <><input required maxLength={100} placeholder="Nome" value={formValues[block.id]?.name ?? ''} onChange={(event) => setFormValues((current) => ({ ...current, [block.id]: { name: event.target.value, email: current[block.id]?.email ?? '', message: current[block.id]?.message ?? '' } }))}/><input required type="email" maxLength={254} placeholder="E-mail" value={formValues[block.id]?.email ?? ''} onChange={(event) => setFormValues((current) => ({ ...current, [block.id]: { name: current[block.id]?.name ?? '', email: event.target.value, message: current[block.id]?.message ?? '' } }))}/><textarea required maxLength={5000} rows={4} placeholder="Mensagem" value={formValues[block.id]?.message ?? ''} onChange={(event) => setFormValues((current) => ({ ...current, [block.id]: { name: current[block.id]?.name ?? '', email: current[block.id]?.email ?? '', message: event.target.value } }))}/><button type="submit" disabled={submitting === block.id}>{submitting === block.id ? 'Enviando…' : 'Enviar'}</button></>}</form>;
      })}
      {error && page && <p className="published-page-error" role="alert">{error}</p>}
    </article>}
  </main>;
}
