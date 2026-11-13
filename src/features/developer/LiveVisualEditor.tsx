import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AlignLeft, Image, Layout, Minus, Plus, Save, Send, Trash2, Type, X, Link2, Paperclip, FolderPlus, Monitor, Tablet, Smartphone } from 'lucide-react';
import './live-visual-editor.css';

type PageKey = string;
type TabItem = { id: string; label: string; content: string; filePath?: string; fileName?: string; fileUrl?: string };
type WidgetType = 'heading' | 'text' | 'button' | 'image' | 'divider' | 'container' | 'file' | 'tabs';
type VisualItem = {
  id: string; kind: 'widget'; page: PageKey; type: WidgetType; content: string;
  url?: string; href?: string; target?: '_self' | '_blank'; filePath?: string; fileName?: string; tabs?: TabItem[];
  color?: string; backgroundColor?: string; fontSize?: string;
};
type SelectorRule = { selector: string; text?: string; color?: string; backgroundColor?: string; fontSize?: string; href?: string; target?: '_self' | '_blank' };
type StoredItem = VisualItem | SelectorRule;
const labels: Record<WidgetType,string> = {heading:'Título',text:'Texto',button:'Botão',image:'Imagem',divider:'Divisor',container:'Contêiner',file:'Arquivo',tabs:'Guias / abas'};

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
    if (item.href && el instanceof HTMLAnchorElement) { el.href = item.href; el.target = item.target || '_self'; }
    if (item.href && el instanceof HTMLButtonElement) { el.dataset.destination = item.href; el.onclick = () => { if (item.target === '_blank') window.open(item.href, '_blank', 'noopener,noreferrer'); else window.location.assign(item.href!); }; }
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
function WidgetView({item,selected,onSelect}:{item:VisualItem;selected:boolean;onSelect:()=>void}) {
  const [activeTab,setActiveTab] = useState(0);
  const style = {color:item.color||undefined,backgroundColor:item.backgroundColor||undefined,fontSize:item.fontSize||undefined};
  const content = item.content || (item.type==='heading'?'Novo título':item.type==='button'?'Clique aqui':'Adicione seu conteúdo');
  const click = (event:React.MouseEvent) => { if (selected || document.body.classList.contains('tc-visual-editing')) event.preventDefault(); onSelect(); };
  return <div className={'tc-builder-widget tc-builder-'+item.type+(selected?' is-selected':'')} style={style} onClick={click}>
    {item.type==='heading'?<h2>{content}</h2>:item.type==='text'?<p>{content}</p>:item.type==='button'?<a className="tc-builder-action" href={item.href||'#'} target={item.target||'_self'} rel={item.target==='_blank'?'noopener noreferrer':undefined} onClick={e=>{if(document.body.classList.contains('tc-visual-editing'))e.preventDefault();}}>{content}</a>:item.type==='image'?(item.url?<img src={item.url} alt={content}/>:<span className="tc-builder-image-placeholder"><Image size={20}/> Defina a URL da imagem</span>):item.type==='divider'?<hr/>:item.type==='file'?(item.url?<a href={item.url} target="_blank" rel="noreferrer" onClick={e=>{if(document.body.classList.contains('tc-visual-editing'))e.preventDefault();}}><Paperclip size={16}/>{item.content||item.fileName||'Abrir arquivo'}</a>:<span><Paperclip size={18}/> Anexe um arquivo no painel</span>):item.type==='tabs'?<div className="tc-builder-tabs"><nav>{(item.tabs||[]).map((tab,i)=><button type="button" key={tab.id} className={activeTab===i?'active':''} onClick={e=>{e.stopPropagation();setActiveTab(i);}}>{tab.label}</button>)}</nav><div className="tc-builder-tab-content">{item.tabs?.[activeTab]?.content}{item.tabs?.[activeTab]?.fileUrl&&<a href={item.tabs[activeTab].fileUrl} target="_blank" rel="noreferrer"><Paperclip size={15}/>{item.tabs[activeTab].fileName||'Abrir anexo'}</a>}</div></div>:<div className="tc-builder-container-inner"><Layout size={18}/><strong>{content}</strong></div>}
    {selected&&<small className="tc-builder-selected-label">Selecionado · {labels[item.type]}</small>}
  </div>;
}
export default function LiveVisualEditor({client,userId,isDeveloper,open,onClose,page}:{client:SupabaseClient;userId:string;isDeveloper:boolean;open:boolean;onClose:()=>void;page:PageKey}) {
  const [items,setItems]=useState<StoredItem[]>([]);
  const [published,setPublished]=useState<StoredItem[]>([]);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [selectedRule,setSelectedRule]=useState<SelectorRule|null>(null);
  const [mount,setMount]=useState<HTMLElement|null>(null);
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [previewMode,setPreviewMode]=useState<'desktop'|'tablet'|'mobile'>('desktop');
  const [desktopAvailable,setDesktopAvailable]=useState(()=>typeof window==='undefined'||window.matchMedia('(min-width: 761px)').matches);
  const [uploadTabId,setUploadTabId]=useState<string|undefined>();
  const fileInputRef=useRef<HTMLInputElement>(null);
  const widgets=useMemo(()=>items.filter((x):x is VisualItem=>'kind'in x&&x.kind==='widget'&&x.page===page),[items,page]);
  const publishedWidgets=useMemo(()=>published.filter((x):x is VisualItem=>'kind'in x&&x.kind==='widget'&&x.page===page),[published,page]);
  const selectedWidget=widgets.find(x=>x.id===selectedId)||null;
  const visibleWidgets=open&&isDeveloper&&desktopAvailable?widgets:publishedWidgets;

  async function resolveAssets(source:StoredItem[]):Promise<StoredItem[]> {
    return Promise.all(source.map(async entry=>{
      if (!('kind' in entry)) return entry;
      let next={...entry};
      if (next.filePath) { const {data}=await client.storage.from('developer-assets').createSignedUrl(next.filePath,3600); if(data?.signedUrl) next.url=data.signedUrl; }
      if (next.tabs) next.tabs=await Promise.all(next.tabs.map(async tab=>{if(!tab.filePath)return tab;const {data}=await client.storage.from('developer-assets').createSignedUrl(tab.filePath,3600);return {...tab,fileUrl:data?.signedUrl};}));
      return next;
    }));
  }
  useEffect(()=>{const media=window.matchMedia('(min-width: 761px)');const update=()=>setDesktopAvailable(media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
  useEffect(()=>{let active=true;void client.from('developer_ui_config').select('draft_rules,published_rules').eq('id',1).maybeSingle().then(async({data})=>{if(!active||!data)return;const draft=await resolveAssets((data.draft_rules||[]) as StoredItem[]);const live=await resolveAssets((data.published_rules||[]) as StoredItem[]);if(active){setItems(draft);setPublished(live);applyRules(live);}});return()=>{active=false;};},[client]);
  useEffect(()=>{const main=document.querySelector('.workspace-main');if(!main)return;const node=document.createElement('div');node.className='tc-builder-canvas';const heading=main.querySelector('.workspace-page-heading');if(heading?.nextSibling)main.insertBefore(node,heading.nextSibling);else main.appendChild(node);setMount(node);return()=>{node.remove();setMount(null);};},[page]);
  useEffect(()=>{
    if(!open||!isDeveloper||!desktopAvailable)return;
    const click=(event:MouseEvent)=>{if(!(event.target instanceof HTMLElement))return;const el=event.target;if(el.closest('.tc-visual-editor,.tc-builder-canvas,input,textarea,select,[contenteditable="true"]'))return;if(!el.closest('.workspace-main'))return;const target=el.closest('a,button') as HTMLElement|null;const chosen=target||el;if(chosen.closest('button,[role="button"]')&&!chosen.matches('a,button'))return;event.preventDefault();event.stopPropagation();const rule:SelectorRule={selector:selectorOf(chosen),...(chosen.children.length===0?{text:chosen.innerText.slice(0,400)}:{}),color:getComputedStyle(chosen).color,backgroundColor:getComputedStyle(chosen).backgroundColor,fontSize:getComputedStyle(chosen).fontSize,...(chosen instanceof HTMLAnchorElement?{href:chosen.getAttribute('href')||'',target:(chosen.target==='_blank'?'_blank':'_self')}:{})};setSelectedRule(rule);setSelectedId(null);};
    document.addEventListener('click',click,true);document.body.classList.add('tc-visual-editing');const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};window.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('click',click,true);window.removeEventListener('keydown',escape);document.body.classList.remove('tc-visual-editing');};
  },[open,isDeveloper,desktopAvailable,onClose]);
  useEffect(()=>{void resolveAssets(open&&isDeveloper&&desktopAvailable?items:published).then(applyRules);},[items,published,open,isDeveloper,desktopAvailable,page]);
  useEffect(()=>{if(!open||!isDeveloper||!desktopAvailable)return;const main=document.querySelector<HTMLElement>('.workspace-main');if(!main)return;const previous={maxWidth:main.style.maxWidth,marginInline:main.style.marginInline,width:main.style.width};const widths={desktop:'100%',tablet:'768px',mobile:'390px'};main.style.width='100%';main.style.maxWidth=widths[previewMode];main.style.marginInline='auto';return()=>{main.style.maxWidth=previous.maxWidth;main.style.marginInline=previous.marginInline;main.style.width=previous.width;};},[open,isDeveloper,desktopAvailable,previewMode,page]);
  function add(type:WidgetType){const item:VisualItem={id:crypto.randomUUID(),kind:'widget',page,type,content:type==='heading'?'Novo título':type==='button'?'Clique aqui':type==='tabs'?'':type==='divider'?'':type==='file'?'Arquivo para download':type==='container'?'Novo contêiner':'Escreva seu conteúdo',...(type==='tabs'?{tabs:[{id:crypto.randomUUID(),label:'Guia 1',content:'Conteúdo da primeira guia'}]}:{})};setItems(old=>[...old,item]);setSelectedId(item.id);setSelectedRule(null);setMessage('');}
  function updateWidget(patch:Partial<VisualItem>){if(!selectedWidget)return;setItems(old=>old.map(x=>'kind'in x&&x.id===selectedWidget.id?{...x,...patch}:x));}
  async function upload(file:File,tabId?:string){if(!selectedWidget)return;if(file.size>20*1024*1024){setMessage('O arquivo excede o limite de 20 MB.');return;}const safe=file.name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g,'_').slice(-100);const path=userId+'/'+crypto.randomUUID()+'-'+safe;setBusy(true);const {error}=await client.storage.from('developer-assets').upload(path,file,{upsert:false,contentType:file.type||'application/octet-stream'});if(error){setMessage('Falha ao enviar arquivo: '+error.message);setBusy(false);return;}const {data}=await client.storage.from('developer-assets').createSignedUrl(path,3600);if(tabId){const tabs=(selectedWidget.tabs||[]).map(t=>t.id===tabId?{...t,filePath:path,fileName:file.name,fileUrl:data?.signedUrl}:t);updateWidget({tabs});}else updateWidget({filePath:path,fileName:file.name,url:data?.signedUrl,content:file.name});setMessage('Arquivo anexado. Salve o rascunho para guardar a alteração.');setBusy(false);}
  function chooseFile(tabId?:string){setUploadTabId(tabId);fileInputRef.current?.click();}
  function handleFileChange(event:React.ChangeEvent<HTMLInputElement>){const file=event.target.files?.[0];if(file)void upload(file,uploadTabId);event.target.value='';setUploadTabId(undefined);}
  function removeSelected(){if(selectedWidget)setItems(old=>old.filter(x=>!('kind'in x&&x.id===selectedWidget.id)));else if(selectedRule)setItems(old=>old.filter(x=>'kind'in x||x.selector!==selectedRule.selector));setSelectedId(null);setSelectedRule(null);}
  async function save(publish:boolean){if(!isDeveloper||busy)return;setBusy(true);setMessage('');const row={id:1,draft_rules:items,updated_by:userId,updated_at:new Date().toISOString(),...(publish?{published_rules:items,published_by:userId,published_at:new Date().toISOString()}:{})};const {error}=await client.from('developer_ui_config').upsert(row,{onConflict:'id'});if(error)setMessage('Não foi possível salvar: '+error.message);else{if(publish){setPublished(await resolveAssets(items));setMessage('Página publicada para a equipe.');}else setMessage('Rascunho salvo.');}setBusy(false);}
  const portal=mount?createPortal(<div className="tc-builder-widgets">{visibleWidgets.map(item=><WidgetView key={item.id} item={item} selected={Boolean(open&&isDeveloper&&selectedId===item.id)} onSelect={()=>{if(open&&isDeveloper){setSelectedId(item.id);setSelectedRule(null);}}}/>)}</div>,mount):null;
  if(!open||!isDeveloper||!desktopAvailable)return portal;
  return <>{portal}<aside className="tc-visual-editor" aria-label="Editor visual da página atual">
    <header><div><strong>Editor visual</strong><small>Página: {page}</small></div><button type="button" onClick={onClose} aria-label="Sair do modo de edição"><X size={17}/></button></header>
    <p className="tc-editor-help">Edite os elementos existentes ou adicione blocos. As alterações são específicas desta página.</p>
    <section className="tc-editor-preview" aria-label="Largura da prévia da página"><strong>Prévia responsiva</strong><div><button type="button" aria-pressed={previewMode==='desktop'} className={previewMode==='desktop'?'is-active':''} onClick={()=>setPreviewMode('desktop')}><Monitor size={14}/> Desktop</button><button type="button" aria-pressed={previewMode==='tablet'} className={previewMode==='tablet'?'is-active':''} onClick={()=>setPreviewMode('tablet')}><Tablet size={14}/> Tablet</button><button type="button" aria-pressed={previewMode==='mobile'} className={previewMode==='mobile'?'is-active':''} onClick={()=>setPreviewMode('mobile')}><Smartphone size={14}/> Celular</button></div><small>Ajusta a largura da área de conteúdo enquanto você edita pelo computador.</small></section>
    <input ref={fileInputRef} className="tc-editor-file-input" type="file" onChange={handleFileChange} />
    <section className="tc-editor-add"><strong><Plus size={15}/> Adicionar elemento</strong><div>
      <button type="button" onClick={()=>add('heading')}><Type size={15}/> Título</button><button type="button" onClick={()=>add('text')}><AlignLeft size={15}/> Texto</button><button type="button" onClick={()=>add('button')}><Link2 size={15}/> Botão</button><button type="button" onClick={()=>add('image')}><Image size={15}/> Imagem</button><button type="button" onClick={()=>add('container')}><Layout size={15}/> Contêiner</button><button type="button" onClick={()=>add('divider')}><Minus size={15}/> Divisor</button><button type="button" onClick={()=>add('file')}><Paperclip size={15}/> Anexo</button><button type="button" onClick={()=>add('tabs')}><FolderPlus size={15}/> Guias / abas</button>
    </div></section>
    {selectedWidget?<section className="tc-editor-properties"><strong>Editar {labels[selectedWidget.type]}</strong>
      {selectedWidget.type!=='divider'&&selectedWidget.type!=='tabs'&&<label>Texto / nome<input value={selectedWidget.content} onChange={e=>updateWidget({content:e.target.value})}/></label>}
      {selectedWidget.type==='button'&&<><label>Destino do botão<input value={selectedWidget.href||''} onChange={e=>updateWidget({href:e.target.value})} placeholder="/pagina ou https://site.com"/></label><label>Abrir em<select value={selectedWidget.target||'_self'} onChange={e=>updateWidget({target:e.target.value as '_self'|'_blank'})}><option value="_self">Mesma guia</option><option value="_blank">Nova guia</option></select></label></>}
      {selectedWidget.type==='image'&&<label>URL da imagem<input value={selectedWidget.url||''} onChange={e=>updateWidget({url:e.target.value})} placeholder="https://…"/></label>}
      {selectedWidget.type==='file'&&<div className="tc-editor-upload"><strong>Arquivo vinculado</strong><span>{selectedWidget.fileName||'Nenhum arquivo selecionado'}</span><button type="button" disabled={busy} onClick={()=>chooseFile()}><Paperclip size={14}/> {selectedWidget.fileName?'Substituir arquivo':'Anexar arquivo'}</button></div>}
      {selectedWidget.type==='tabs'&&<div className="tc-editor-tabs">{(selectedWidget.tabs||[]).map((tab,i)=><div key={tab.id}><label>Nome da guia<input value={tab.label} onChange={e=>updateWidget({tabs:(selectedWidget.tabs||[]).map(t=>t.id===tab.id?{...t,label:e.target.value}:t)})}/></label><label>Conteúdo<textarea value={tab.content} onChange={e=>updateWidget({tabs:(selectedWidget.tabs||[]).map(t=>t.id===tab.id?{...t,content:e.target.value}:t)})}/></label><div className="tc-editor-upload"><strong>Anexo da guia</strong><span>{tab.fileName||'Nenhum arquivo selecionado'}</span><button type="button" disabled={busy} onClick={()=>chooseFile(tab.id)}><Paperclip size={14}/> {tab.fileName?'Substituir arquivo':'Anexar arquivo'}</button></div><button type="button" className="tc-editor-danger" onClick={()=>updateWidget({tabs:(selectedWidget.tabs||[]).filter(t=>t.id!==tab.id)})}>Excluir guia {i+1}</button></div>)}<button type="button" onClick={()=>updateWidget({tabs:[...(selectedWidget.tabs||[]),{id:crypto.randomUUID(),label:'Nova guia',content:''}]})}><Plus size={14}/> Adicionar guia</button></div>}
      <label>Cor do texto<input type="color" value={selectedWidget.color||'#183047'} onChange={e=>updateWidget({color:e.target.value})}/></label><label>Cor de fundo<input type="color" value={selectedWidget.backgroundColor||'#ffffff'} onChange={e=>updateWidget({backgroundColor:e.target.value})}/></label><label>Tamanho da fonte<input value={selectedWidget.fontSize||''} onChange={e=>updateWidget({fontSize:e.target.value})} placeholder="18px"/></label>
      <button className="tc-editor-danger" type="button" onClick={removeSelected}><Trash2 size={15}/> Remover elemento</button>
    </section>:selectedRule?<section className="tc-editor-properties"><strong>Editar elemento existente</strong>{selectedRule.text!==undefined&&<label>Texto<input value={selectedRule.text} onChange={e=>{const next={...selectedRule,text:e.target.value};setSelectedRule(next);setItems(old=>[...old.filter(x=>'kind'in x||x.selector!==next.selector),next]);}}/></label>}{<><label>Destino do link<input value={selectedRule.href||''} onChange={e=>{const next={...selectedRule,href:e.target.value};setSelectedRule(next);setItems(old=>[...old.filter(x=>'kind'in x||x.selector!==next.selector),next]);}} placeholder="https://…"/></label><label>Abrir em<select value={selectedRule.target||'_self'} onChange={e=>{const next={...selectedRule,target:e.target.value as '_self'|'_blank'};setSelectedRule(next);setItems(old=>[...old.filter(x=>'kind'in x||x.selector!==next.selector),next]);}}><option value="_self">Mesma guia</option><option value="_blank">Nova guia</option></select></label></>}<button className="tc-editor-danger" type="button" onClick={removeSelected}><Trash2 size={15}/> Remover personalização</button></section>:<div className="tc-editor-empty">Clique em um botão, link ou outro elemento da página para editar. Ou selecione um bloco novo.</div>}
    <footer><button type="button" disabled={busy} onClick={()=>void save(false)}><Save size={14}/> Salvar rascunho</button><button type="button" disabled={busy} onClick={()=>void save(true)}><Send size={14}/> Publicar</button></footer>{message&&<p role="status" className="tc-editor-message">{message}</p>}<button type="button" className="tc-editor-exit" onClick={onClose}>Sair do modo de edição</button><small className="tc-editor-version">Itens publicados: {published.length}</small>
  </aside></>;
}
