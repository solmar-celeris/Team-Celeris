import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AlignLeft, Image, Layout, Minus, Plus, Save, Send, Trash2, Type, X } from 'lucide-react';
import './live-visual-editor.css';

type PageKey = string;
type WidgetType = 'heading' | 'text' | 'button' | 'image' | 'divider' | 'container';
type VisualItem = {
  id: string;
  kind: 'widget';
  page: PageKey;
  type: WidgetType;
  content: string;
  url?: string;
  color?: string;
  backgroundColor?: string;
  fontSize?: string;
};
type SelectorRule = { selector: string; text?: string; color?: string; backgroundColor?: string; fontSize?: string };
type StoredItem = VisualItem | SelectorRule;
const widgetLabels: Record<WidgetType,string> = { heading:'Título',text:'Texto',button:'Botão',image:'Imagem',divider:'Divisor',container:'Contêiner' };

function applyRules(items: StoredItem[]) {
  items.forEach(item => {
    if ('kind' in item) return;
    let el: HTMLElement | null = null;
    try { el = document.querySelector(item.selector); } catch { return; }
    if (!el) return;
    if (item.text !== undefined && el.children.length === 0) el.textContent = item.text;
    if (item.color) el.style.color = item.color;
    if (item.backgroundColor) el.style.backgroundColor = item.backgroundColor;
    if (item.fontSize && /^\d+(px|rem|em|%)$/.test(item.fontSize)) el.style.fontSize = item.fontSize;
  });
}
function selectorOf(el: HTMLElement) {
  if (el.id) return '#' + CSS.escape(el.id);
  const parts: string[] = []; let node: HTMLElement | null = el;
  while (node && node !== document.body && parts.length < 6) {
    const siblings = node.parentElement ? [...node.parentElement.children].filter(x => x.tagName === node!.tagName) : [];
    parts.unshift(node.tagName.toLowerCase() + (siblings.length > 1 ? ':nth-of-type(' + (siblings.indexOf(node) + 1) + ')' : ''));
    node = node.parentElement;
  }
  return parts.join(' > ');
}
function WidgetView({ item, selected, onSelect }: { item: VisualItem; selected: boolean; onSelect: () => void }) {
  const style = { color:item.color || undefined, backgroundColor:item.backgroundColor || undefined, fontSize:item.fontSize || undefined };
  const content = item.content || (item.type === 'heading' ? 'Novo título' : item.type === 'button' ? 'Clique aqui' : 'Adicione seu conteúdo');
  return <div className={'tc-builder-widget tc-builder-' + item.type + (selected ? ' is-selected' : '')} style={style} onClick={onSelect} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onSelect(); }}>
    {item.type === 'heading' ? <h2>{content}</h2> : item.type === 'text' ? <p>{content}</p> : item.type === 'button' ? <span>{content}</span> : item.type === 'image' ? (item.url ? <img src={item.url} alt={content} /> : <span className="tc-builder-image-placeholder"><Image size={20}/> Defina a URL da imagem</span>) : item.type === 'divider' ? <hr/> : <div className="tc-builder-container-inner"><Layout size={18}/><strong>{content}</strong><small>Contêiner · adicione um título ou texto separadamente</small></div>}
    {selected && <small className="tc-builder-selected-label">Selecionado · {widgetLabels[item.type]}</small>}
  </div>;
}
export default function LiveVisualEditor({ client,userId,isDeveloper,open,onClose,page }:{client:SupabaseClient;userId:string;isDeveloper:boolean;open:boolean;onClose:()=>void;page:PageKey}) {
  const [items,setItems] = useState<StoredItem[]>([]);
  const [published,setPublished] = useState<StoredItem[]>([]);
  const [selectedId,setSelectedId] = useState<string|null>(null);
  const [selectedRule,setSelectedRule] = useState<SelectorRule|null>(null);
  const [mount,setMount] = useState<HTMLElement|null>(null);
  const [message,setMessage] = useState('');
  const [busy,setBusy] = useState(false);
  const widgets = useMemo(() => items.filter((item): item is VisualItem => 'kind' in item && item.kind === 'widget' && item.page === page),[items,page]);
  const publishedWidgets = useMemo(() => published.filter((item): item is VisualItem => 'kind' in item && item.kind === 'widget' && item.page === page),[published,page]);
  const visibleWidgets = open && isDeveloper ? widgets : publishedWidgets;
  const selectedWidget = widgets.find(item => item.id === selectedId) ?? null;

  useEffect(() => {
    let active = true;
    void client.from('developer_ui_config').select('draft_rules,published_rules').eq('id',1).maybeSingle().then(({data}) => {
      if (!active || !data) return;
      const draft = (data.draft_rules || []) as StoredItem[];
      const live = (data.published_rules || []) as StoredItem[];
      setItems(draft); setPublished(live); applyRules(live);
    });
    return () => { active = false; };
  },[client]);

  useEffect(() => {
    
    const main = document.querySelector('.workspace-main');
    if (!main) return;
    const node = document.createElement('div');
    node.className = 'tc-builder-canvas';
    const heading = main.querySelector('.workspace-page-heading');
    if (heading?.nextSibling) main.insertBefore(node,heading.nextSibling); else main.appendChild(node);
    setMount(node);
    return () => { node.remove(); setMount(null); };
  },[page]);

  useEffect(() => {
    if (!open || !isDeveloper) return;
    const click = (event: MouseEvent) => {
      if (!(event.target instanceof HTMLElement)) return;
      const el = event.target;
      if (el.closest('.tc-visual-editor,.tc-builder-canvas,button,a,input,textarea,select')) return;
      if (!el.closest('.workspace-main')) return;
      event.preventDefault(); event.stopPropagation();
      setSelectedRule({ selector:selectorOf(el), ...(el.children.length === 0 ? {text:el.innerText.slice(0,400)} : {}), color:'#183047', backgroundColor:'#ffffff', fontSize:getComputedStyle(el).fontSize });
      setSelectedId(null);
    };
    document.addEventListener('click',click,true);
    document.body.classList.add('tc-visual-editing');
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown',escape);
    return () => { document.removeEventListener('click',click,true); window.removeEventListener('keydown',escape); document.body.classList.remove('tc-visual-editing'); };
  },[open,isDeveloper,onClose]);

  useEffect(() => { applyRules(open && isDeveloper ? items : published); },[items,published,open,isDeveloper,page]);

  function add(type:WidgetType) {
    const item:VisualItem = { id:crypto.randomUUID(),kind:'widget',page,type,content:type==='heading'?'Novo título':type==='button'?'Clique aqui':type==='container'?'Novo contêiner':type==='divider'?'': 'Escreva seu conteúdo' };
    setItems(old=>[...old,item]); setSelectedId(item.id); setSelectedRule(null); setMessage('');
  }
  function updateWidget(key:'content'|'url'|'color'|'backgroundColor'|'fontSize',value:string) {
    if (!selectedWidget) return;
    setItems(old=>old.map(item=>'kind' in item && item.id===selectedWidget.id ? {...item,[key]:value} : item));
  }
  function removeSelected() {
    if (selectedWidget) setItems(old=>old.filter(item=>!('kind' in item && item.id===selectedWidget.id)));
    else if (selectedRule) setItems(old=>old.filter(item=>'kind' in item || item.selector!==selectedRule.selector));
    setSelectedId(null); setSelectedRule(null);
  }
  async function save(publish:boolean) {
    if (!isDeveloper || busy) return;
    setBusy(true); setMessage('');
    const row={id:1,draft_rules:items,updated_by:userId,updated_at:new Date().toISOString(),...(publish?{published_rules:items,published_by:userId,published_at:new Date().toISOString()}:{})};
    const {error}=await client.from('developer_ui_config').upsert(row,{onConflict:'id'});
    if (error) setMessage('Não foi possível salvar. Verifique se a migration do editor visual foi aplicada no Supabase.');
    else { if (publish) { setPublished(items); setMessage('Página publicada para a equipe.'); } else setMessage('Rascunho salvo.'); }
    setBusy(false);
  }
  const portal = mount ? createPortal(<div className="tc-builder-widgets">{visibleWidgets.map(item=><WidgetView key={item.id} item={item} selected={Boolean(open && isDeveloper && selectedId===item.id)} onSelect={()=>{if(open && isDeveloper){setSelectedId(item.id);setSelectedRule(null);}}}/>)}</div>,mount) : null;
  if (!open || !isDeveloper) return portal;
  return <>{portal}<aside className="tc-visual-editor" aria-label="Editor visual da página atual">
    <header><div><strong>Editor visual</strong><small>Página: {page}</small></div><button type="button" onClick={onClose} aria-label="Sair do modo de edição"><X size={17}/></button></header>
    <p className="tc-editor-help">Adicione blocos como no Elementor, selecione para editar e remova o que não precisar. Os blocos ficam nesta página.</p>
    <section className="tc-editor-add"><strong><Plus size={15}/> Adicionar elemento</strong><div>
      <button type="button" onClick={()=>add('heading')}><Type size={15}/> Título</button><button type="button" onClick={()=>add('text')}><AlignLeft size={15}/> Texto</button>
      <button type="button" onClick={()=>add('button')}><Plus size={15}/> Botão</button><button type="button" onClick={()=>add('image')}><Image size={15}/> Imagem</button>
      <button type="button" onClick={()=>add('container')}><Layout size={15}/> Contêiner</button><button type="button" onClick={()=>add('divider')}><Minus size={15}/> Divisor</button>
    </div></section>
    {selectedWidget ? <section className="tc-editor-properties"><strong>Editar {widgetLabels[selectedWidget.type]}</strong>
      {selectedWidget.type!=='divider' && <label>Conteúdo<input value={selectedWidget.content} onChange={e=>updateWidget('content',e.target.value)}/></label>}
      {selectedWidget.type==='image' && <label>URL da imagem<input value={selectedWidget.url||''} onChange={e=>updateWidget('url',e.target.value)} placeholder="https://…"/></label>}
      <label>Cor do texto<input type="color" value={selectedWidget.color||'#183047'} onChange={e=>updateWidget('color',e.target.value)}/></label>
      <label>Cor de fundo<input type="color" value={selectedWidget.backgroundColor||'#ffffff'} onChange={e=>updateWidget('backgroundColor',e.target.value)}/></label>
      <label>Tamanho da fonte<input value={selectedWidget.fontSize||''} onChange={e=>updateWidget('fontSize',e.target.value)} placeholder="18px"/></label>
      <button className="tc-editor-danger" type="button" onClick={removeSelected}><Trash2 size={15}/> Remover elemento</button>
    </section> : selectedRule ? <section className="tc-editor-properties"><strong>Elemento da página selecionado</strong>{selectedRule.text!==undefined&&<label>Texto<input value={selectedRule.text} onChange={e=>{const next={...selectedRule,text:e.target.value};setSelectedRule(next);setItems(old=>[...old.filter(item=>'kind' in item||item.selector!==next.selector),next]);}}/></label>}<button className="tc-editor-danger" type="button" onClick={removeSelected}><Trash2 size={15}/> Remover estilo salvo</button></section> : <div className="tc-editor-empty">Selecione um bloco adicionado ou um elemento existente da página.</div>}
    <footer><button type="button" disabled={busy||!items.length} onClick={()=>void save(false)}><Save size={14}/> Salvar rascunho</button><button type="button" disabled={busy||!items.length} onClick={()=>void save(true)}><Send size={14}/> Publicar</button></footer>
    {message&&<p role="status" className="tc-editor-message">{message}</p>}
    <button type="button" className="tc-editor-exit" onClick={onClose}>Sair do modo de edição</button>
    <small className="tc-editor-version">Itens publicados: {published.length}</small>
  </aside></>;
}