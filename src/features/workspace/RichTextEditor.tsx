import { useEffect, useRef } from 'react';
import { Bold, Highlighter, Italic, Type } from 'lucide-react';
import './rich-text-editor.css';

type Props = { value: string; onChange: (value: string) => void; disabled?: boolean; placeholder?: string; minHeight?: number };

const allowedTags = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'UL', 'OL', 'LI', 'SPAN', 'MARK', 'DIV']);
const highlightColors: Record<string, string> = { '#fff2a8': '#fff2a8', 'rgb(255, 242, 168)': '#fff2a8', '#c8f7d2': '#c8f7d2', 'rgb(200, 247, 210)': '#c8f7d2', '#ffd6e7': '#ffd6e7', 'rgb(255, 214, 231)': '#ffd6e7', '#cfe8ff': '#cfe8ff', 'rgb(207, 232, 255)': '#cfe8ff', '#e7d7ff': '#e7d7ff', 'rgb(231, 215, 255)': '#e7d7ff' };

export function sanitizeRichHtml(input: string): string {
  if (typeof document === 'undefined') return input.replace(/<script[\s\S]*?<\/script>/gi, '');
  const parsed = new DOMParser().parseFromString(input, 'text/html');
  const clean = (node: Node): void => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const element = child as HTMLElement;
        if (!allowedTags.has(element.tagName)) {
          if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'SVG', 'VIDEO', 'AUDIO'].includes(element.tagName)) { element.remove(); return; }
          const fragment = document.createDocumentFragment();
          while (element.firstChild) fragment.appendChild(element.firstChild);
          clean(fragment);
          element.replaceWith(fragment);
          return;
        }
        [...element.attributes].forEach((attribute) => {
          if (element.tagName === 'SPAN' && attribute.name === 'style') {
            const color = element.style.backgroundColor.toLowerCase();
            const size = element.getAttribute('data-size');
            element.removeAttribute('style');
            if (color && highlightColors[color]) element.style.backgroundColor = highlightColors[color];
            if (size && ['small', 'medium', 'large'].includes(size)) element.dataset.size = size;
            return;
          }
          if (element.tagName === 'SPAN' && attribute.name === 'data-size' && ['small', 'medium', 'large'].includes(attribute.value)) return;
          element.removeAttribute(attribute.name);
        });
        clean(element);
      } else if (child.nodeType !== Node.TEXT_NODE) child.parentNode?.removeChild(child);
    });
  };
  clean(parsed.body);
  return parsed.body.innerHTML;
}

export function RichTextContent({ html, className }: { html: string; className?: string }) {
  return <div className={className ?? 'rich-text-content'} dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(html) }} />;
}

export default function RichTextEditor({ value, onChange, disabled = false, placeholder = 'Escreva aqui…', minHeight = 180 }: Props) {
  const editor = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (editor.current && editor.current.innerHTML !== value) editor.current.innerHTML = sanitizeRichHtml(value);
  }, [value]);
  function command(name: string, argument?: string) {
    if (disabled || !editor.current) return;
    editor.current.focus();
    document.execCommand(name, false, argument);
    onChange(sanitizeRichHtml(editor.current.innerHTML));
  }
  function fontSize(size: 'small' | 'medium' | 'large') {
    if (!editor.current || disabled) return;
    editor.current.focus();
    document.execCommand('fontSize', false, size === 'small' ? '2' : size === 'large' ? '5' : '3');
    const fonts = editor.current.querySelectorAll('font[size]');
    fonts.forEach((font) => {
      const level = font.getAttribute('size') ?? '3';
      const mappedSize = ['1', '2'].includes(level) ? 'small' : ['5', '6', '7'].includes(level) ? 'large' : 'medium';
      const span = document.createElement('span');
      span.dataset.size = mappedSize;
      span.innerHTML = font.innerHTML;
      font.replaceWith(span);
    });
    onChange(sanitizeRichHtml(editor.current.innerHTML));
  }
  function highlight(color: string) { command('hiliteColor', color); }
  return <div className={`rich-editor${disabled ? ' is-disabled' : ''}`}>
    {!disabled && <div className="rich-editor-toolbar" role="toolbar" aria-label="Formatação do texto">
      <div className="rich-editor-size"><Type size={14} /><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => fontSize('small')}>Pequena</button><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => fontSize('medium')}>Média</button><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => fontSize('large')}>Grande</button></div>
      <button type="button" title="Negrito" aria-label="Negrito" onMouseDown={(event) => event.preventDefault()} onClick={() => command('bold')}><Bold size={15} /></button>
      <button type="button" title="Itálico" aria-label="Itálico" onMouseDown={(event) => event.preventDefault()} onClick={() => command('italic')}><Italic size={15} /></button>
      <span className="rich-editor-highlights"><Highlighter size={15} />{[['#fff2a8','Amarelo'],['#c8f7d2','Verde'],['#ffd6e7','Rosa'],['#cfe8ff','Azul'],['#e7d7ff','Lilás']].map(([color,label]) => <button key={color} type="button" title={`Marca-texto ${label}`} aria-label={`Marca-texto ${label}`} style={{ backgroundColor: color }} onMouseDown={(event) => event.preventDefault()} onClick={() => highlight(color)} />)}</span>
    </div>}
    <div ref={editor} className="rich-editor-surface" contentEditable={!disabled} suppressContentEditableWarning role="textbox" aria-multiline="true" data-placeholder={placeholder} style={{ minHeight }} onInput={() => onChange(sanitizeRichHtml(editor.current?.innerHTML ?? ''))} onBlur={() => onChange(sanitizeRichHtml(editor.current?.innerHTML ?? ''))} />
  </div>;
}
