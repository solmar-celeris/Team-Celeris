function decodePdfLiteral(value: string): string {
  return value
    .replace(/\\([nrtbf()\\])/g, (_match, token: string) => ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' })[token] ?? token)
    .replace(/\\([0-7]{1,3})/g, (_match, octal: string) => String.fromCharCode(parseInt(octal, 8)))
    .replace(/\\\r?\n/g, '');
}

async function inflate(bytes: Uint8Array, format: 'deflate' | 'deflate-raw'): Promise<Uint8Array> {
  const copied = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const stream = new Blob([copied]).stream().pipeThrough(new DecompressionStream(format as CompressionFormat));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > 32 * 1024 * 1024) { await reader.cancel(); throw new Error('O documento descompactado excede o limite seguro de extração (32 MB).'); }
    chunks.push(value);
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return output;
}

async function extractDocx(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65_557); offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) { end = offset; break; }
  }
  if (end < 0) throw new Error('O arquivo DOCX não parece ser um pacote Word válido.');
  const entries = view.getUint16(end + 10, true);
  let cursor = view.getUint32(end + 16, true);
  let documentBytes: Uint8Array | null = null;
  for (let index = 0; index < entries; index += 1) {
    if (view.getUint32(cursor, true) !== 0x02014b50) break;
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = new TextDecoder().decode(bytes.slice(cursor + 46, cursor + 46 + nameLength));
    if (name === 'word/document.xml') {
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = bytes.slice(dataStart, dataStart + compressedSize);
      documentBytes = method === 0 ? compressed : method === 8 ? await inflate(compressed, 'deflate-raw') : null;
      break;
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  if (!documentBytes) throw new Error('Não foi possível ler o conteúdo principal deste DOCX.');
  const xml = new DOMParser().parseFromString(new TextDecoder().decode(documentBytes), 'application/xml');
  if (xml.querySelector('parsererror')) throw new Error('O documento Word contém XML inválido.');
  return Array.from(xml.getElementsByTagName('w:p')).map((paragraph) =>
    Array.from(paragraph.getElementsByTagName('w:t')).map((node) => node.textContent ?? '').join(''),
  ).filter(Boolean).join('\n\n').trim();
}

async function extractPdf(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const source = new TextDecoder('windows-1252').decode(bytes);
  if (!source.startsWith('%PDF-')) throw new Error('O arquivo não parece ser um PDF válido.');
  const streams: string[] = [];
  const streamPattern = /<<(.*?)>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/g;
  for (const match of source.matchAll(streamPattern)) {
    const dictionary = match[1] ?? '';
    const raw = match[2] ?? '';
    if (!/FlateDecode/.test(dictionary)) { streams.push(raw); continue; }
    const start = source.indexOf(raw, match.index ?? 0);
    const compressed = bytes.slice(start, start + raw.length);
    try { streams.push(new TextDecoder('windows-1252').decode(await inflate(compressed, 'deflate'))); }
    catch { /* Ignora streams não textuais ou filtros não suportados. */ }
  }
  const content = streams.join('\n') || source;
  const output: string[] = [];
  const literalPattern = /\(((?:\\.|[^\\)])*)\)\s*Tj/g;
  for (const match of content.matchAll(literalPattern)) output.push(decodePdfLiteral(match[1] ?? ''));
  const arrayPattern = /\[((?:\\.|[^\]])*)\]\s*TJ/g;
  for (const match of content.matchAll(arrayPattern)) {
    const inner = match[1] ?? '';
    for (const part of inner.matchAll(/\(((?:\\.|[^\\)])*)\)/g)) output.push(decodePdfLiteral(part[1] ?? ''));
  }
  const text = output.join(' ').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/\s+/g, ' ').trim();
  if (text.length < 12) throw new Error('Este PDF não disponibiliza texto extraível no navegador. Se for digitalizado, faça OCR e cole o texto no editor do manual.');
  return text;
}

export async function extractManualText(file: File): Promise<string> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'docx') return extractDocx(file);
  if (extension === 'pdf') return extractPdf(file);
  throw new Error('Envie um documento PDF ou Word (.docx).');
}
