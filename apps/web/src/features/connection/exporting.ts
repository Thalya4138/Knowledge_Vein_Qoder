import { toHtml } from 'hast-util-to-html';
import { graphHast, layoutGraph, geometry, edgeStyle, nodeStyle, nodeW, texToText, INK, SYMMETRIC } from '../../content/veinGraph';
import { readText } from '../../store/open';
import type { Workspace, WsFile, WorkspaceStore } from '../../store/types';
import { writeBrowserFile } from '../../store/browser';
import { graphBlock, lectureMarkdown, plainMarkdown, type ExploreResult } from './explore';
import { renderMd } from './md';

/**
 * 导出与复制（用户 2026-11-24：可以导出讲解或关联图、导出成独立文件或放进工作区、
 * 也可以复制后原格式放进讲义，「尤其注意导图的 UI 呈现」）。
 *
 * 所有格式都从同一份结果出发：
 * - 讲义 Markdown：栏目块原样保留，关联图是一个 ```vein-graph 块 —— 在知脉的讲义里渲染成同一张图；
 * - Word / 剪贴板网页格式：栏目块变成带标题的引用，关联图是一张 PNG；
 * - PPT：讲解按小节分页，关联图用 PPT 自己的形状画（可以在 PPT 里继续拖动、改字）；
 * - 图片：关联图的 PNG / SVG。
 */

export type Content = 'note' | 'graph' | 'both';
export type Format = 'md' | 'doc' | 'pptx' | 'png' | 'svg' | 'pdf';

export const FORMATS: { id: Format; label: string; note?: string; graphOnly?: boolean }[] = [
  { id: 'md', label: 'Markdown（.md）', note: '讲义原格式，放进知脉或 Obsidian 都能显示' },
  { id: 'doc', label: 'Word（.doc）', note: '公式保留为 LaTeX 源码' },
  { id: 'pptx', label: 'PPT（.pptx）', note: '每个小节一页起；关联图是可编辑的形状' },
  { id: 'pdf', label: 'PDF', note: '用浏览器的打印另存为 PDF，只能下载到本地' },
  { id: 'png', label: '图片（.png）', graphOnly: true },
  { id: 'svg', label: '矢量图（.svg）', graphOnly: true },
];

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || '关联探索';

export function fileName(r: ExploreResult, content: Content, fmt: Format): string {
  const tail = content === 'graph' ? '（关联图）' : content === 'note' && r.graph.nodes.length ? '（讲解）' : '';
  return `${safeName(r.title)}${tail}.${fmt}`;
}

/* ---------- 关联图 → SVG / PNG ---------- */

export function graphSvg(r: ExploreResult): string {
  return toHtml(graphHast(JSON.parse(graphBlock(r).replace(/^```vein-graph\n|\n```$/g, ''))), { space: 'svg' });
}

export async function svgToPng(svg: string, scale = 2): Promise<{ blob: Blob; dataUrl: string; width: number; height: number }> {
  const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  const width = Number(m?.[1] ?? 800);
  const height = Number(m?.[2] ?? 500);
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0, width, height);
  const dataUrl = canvas.toDataURL('image/png');
  const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), 'image/png'));
  return { blob, dataUrl, width, height };
}

/* ---------- Word 与剪贴板网页格式 ---------- */

/** 公式改为 LaTeX 源码（Word 不认 KaTeX 的排版）；栏目块改为带标题的引用 */
function htmlForOffice(md: string): string {
  const plain = plainMarkdown(md)
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, m: string) => `\n\n\`${m.trim().replace(/\n/g, ' ')}\`\n\n`)
    .replace(/\$([^$\n]+?)\$/g, (_, m: string) => `\`${m}\``)
    .replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_, t: string, a: string) => a || t);
  return renderMd(plain);
}

const OFFICE_CSS =
  'body{font-family:"Microsoft YaHei","PingFang SC",sans-serif;line-height:1.75;font-size:11pt;color:#1b2430}h1{font-size:18pt}h2{font-size:14pt;margin-top:18pt}table{border-collapse:collapse;margin:8pt 0}td,th{border:1px solid #999;padding:4px 8px}blockquote{border-left:3px solid #3f5e86;margin:8pt 0;padding:4pt 10pt;background:#f3f5ef}code{font-family:"Cambria Math",Consolas,monospace;color:#1f4e79}';

async function officeHtml(r: ExploreResult, content: Content): Promise<string> {
  const parts: string[] = [];
  if (content !== 'graph') parts.push(htmlForOffice(r.note));
  else parts.push(`<h1>${escapeHtml(r.title)}</h1>`);
  if (content !== 'note' && r.graph.nodes.length) {
    const png = await svgToPng(graphSvg(r));
    const w = Math.min(640, png.width);
    parts.push(`<p><b>关联图</b></p><p><img src="${png.dataUrl}" width="${w}" height="${Math.round((png.height * w) / png.width)}" alt="${escapeHtml(r.title)}的关联图"></p>`);
  }
  return parts.join('\n');
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export async function wordBlob(r: ExploreResult, content: Content): Promise<Blob> {
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${escapeHtml(r.title)}</title><style>${OFFICE_CSS}</style></head><body>${await officeHtml(r, content)}</body></html>`;
  return new Blob([String.fromCharCode(0xfeff), html], { type: 'application/msword' });
}

/**
 * 复制：同时放两种格式。粘进知脉讲义（或 Obsidian）的编辑框，拿到的是讲义 Markdown，关联图仍是图；
 * 粘进 Word、飞书、邮件，拿到的是排好版的网页格式，关联图是一张图片。
 */
export async function copyToClipboard(r: ExploreResult, content: Content): Promise<void> {
  const md = lectureMarkdown(r, { note: content !== 'graph', graph: content !== 'note' });
  const html = `<div>${await officeHtml(r, content)}</div>`;
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
    await navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([md], { type: 'text/plain' }), 'text/html': new Blob([html], { type: 'text/html' }) })]);
  } else {
    await navigator.clipboard.writeText(md);
  }
}

/* ---------- PPT ---------- */

type Run = { text: string; options?: Record<string, unknown> };

/** 一行 Markdown → PPT 文本段：粗体、链接保留，公式转成文字 */
function runsOf(line: string, base: Record<string, unknown> = {}): Run[] {
  const out: Run[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:[^)]+)\)|\$([^$]+)\$|\[\[([^\]|]+)\|?([^\]]*)\]\]/g;
  let last = 0;
  for (const m of line.matchAll(re)) {
    if (m.index! > last) out.push({ text: line.slice(last, m.index), options: base });
    if (m[1]) out.push({ text: texToText(m[1]), options: { ...base, bold: true } });
    else if (m[2]) out.push({ text: m[2], options: { ...base, hyperlink: { url: m[3] }, color: '1F4E79' } });
    else if (m[4]) out.push({ text: texToText(m[4]), options: { ...base, fontFace: 'Cambria Math' } });
    else if (m[5]) out.push({ text: m[6] || m[5], options: base });
    last = m.index! + m[0].length;
  }
  if (last < line.length) out.push({ text: line.slice(last), options: base });
  return out.map((r) => ({ ...r, text: r.text.replace(/\s\^[A-Za-z0-9-]+$/, '') }));
}

interface Block {
  kind: 'h1' | 'h2' | 'h3' | 'p' | 'math' | 'table' | 'callout';
  text: string;
  title?: string;
  folded?: boolean;
  rows?: string[][];
}

/** 讲义 Markdown → 块序列（只认讲义方言里会出现的几种结构） */
export function blocksOf(md: string): Block[] {
  const lines = md.replace(/```vein-graph[\s\S]*?```/g, '').split('\n');
  const out: Block[] = [];
  let i = 0;
  const tableRows = (ls: string[]) => ls.filter((l) => !/^[\s|:-]+$/.test(l)).map((l) => l.replace(/^\s*\||\|\s*$/g, '').split('|').map((c) => c.trim()));
  while (i < lines.length) {
    const l = lines[i]!;
    if (!l.trim()) {
      i += 1;
      continue;
    }
    const h = /^(#{1,3})\s+(.+)$/.exec(l);
    if (h) {
      out.push({ kind: (['h1', 'h2', 'h3'] as const)[h[1]!.length - 1]!, text: h[2]! });
      i += 1;
      continue;
    }
    if (l.startsWith('>')) {
      const body: string[] = [];
      while (i < lines.length && lines[i]!.startsWith('>')) body.push(lines[i++]!.replace(/^>\s?/, ''));
      const head = /^\[!(\w+)\]([+-]?)\s*([^@]*?)\s*(@[\w-]+)?\s*$/.exec(body[0] ?? '');
      const rest = head ? body.slice(1) : body;
      if (head?.[1] === 'table') {
        out.push({ kind: 'table', text: '', title: head[3], rows: tableRows(rest.filter((x) => x.includes('|'))) });
        continue;
      }
      if (head?.[1] === 'figure') continue;
      out.push({ kind: 'callout', title: head?.[3] || '', folded: head?.[2] === '-', text: rest.join('\n').trim() });
      continue;
    }
    if (l.startsWith('$$')) {
      const buf = [l];
      if (!(l.length > 2 && l.trim().endsWith('$$') && l.trim() !== '$$')) while (++i < lines.length && (buf.push(lines[i]!), !lines[i]!.includes('$$')));
      i += 1;
      out.push({ kind: 'math', text: buf.join(' ').replace(/\$\$/g, '').trim() });
      continue;
    }
    if (l.trim().startsWith('|')) {
      const rows: string[] = [];
      while (i < lines.length && lines[i]!.trim().startsWith('|')) rows.push(lines[i++]!);
      out.push({ kind: 'table', text: '', rows: tableRows(rows) });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^(#|>|\$\$|\|)/.test(lines[i]!)) para.push(lines[i++]!);
    out.push({ kind: 'p', text: para.join(' ') });
  }
  return out;
}

export async function pptxBlob(r: ExploreResult, content: Content, ask: string): Promise<Blob> {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE'; // 13.33 × 7.5 英寸
  pptx.title = r.title;
  const FONT = 'Microsoft YaHei';
  const INKC = INK.ink.slice(1);

  const cover = pptx.addSlide();
  cover.background = { color: 'F3F5EF' };
  cover.addText(texToText(r.title), { x: 0.8, y: 2.4, w: 11.7, h: 1.4, fontFace: FONT, fontSize: 34, bold: true, color: INKC });
  if (ask) cover.addText(ask, { x: 0.8, y: 3.9, w: 11.7, h: 0.8, fontFace: FONT, fontSize: 16, color: '5D6672' });

  if (content !== 'note' && r.graph.nodes.length) {
    const slide = pptx.addSlide();
    slide.addText('关联图', { x: 0.5, y: 0.25, w: 12, h: 0.6, fontFace: FONT, fontSize: 22, bold: true, color: INKC });
    const { nodes, width, height } = layoutGraph(r.graph.nodes, r.graph.edges.filter((e) => e.status !== 'rejected'));
    const s = Math.min(12.3 / width, 6.2 / height);
    const ox = 0.5 + (12.3 - width * s) / 2;
    const oy = 1.0 + (6.2 - height * s) / 2;
    const X = (v: number) => ox + v * s;
    const Y = (v: number) => oy + v * s;
    const byId = new Map(nodes.map((n) => [n.id, n]));
    for (const e of r.graph.edges.filter((x) => x.status !== 'rejected')) {
      const a = byId.get(e.from);
      const b = byId.get(e.to);
      if (!a || !b) continue;
      const { p0, p3, at } = geometry(a, b);
      const st = edgeStyle(e);
      const [x1, y1, x2, y2] = [X(p0[0]), Y(p0[1]), X(p3[0]), Y(p3[1])];
      slide.addShape(pptx.ShapeType.line, {
        x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.max(0.01, Math.abs(x2 - x1)), h: Math.max(0.01, Math.abs(y2 - y1)),
        flipH: x2 < x1, flipV: y2 < y1,
        line: { color: st.stroke.slice(1), width: st.width * 0.75, dashType: st.dash ? (st.dash.startsWith('1') ? 'sysDot' : 'dash') : 'solid', endArrowType: SYMMETRIC.has(e.type) || e.mine ? undefined : 'triangle' },
      });
      const text = texToText(e.label || '');
      if (text) {
        const [mx, my] = at(0.5);
        slide.addText(text, { x: X(mx) - 0.9, y: Y(my) - 0.3, w: 1.8, h: 0.26, fontFace: FONT, fontSize: 9, color: st.stroke.slice(1), align: 'center', fill: { color: 'F3F5EF' } });
      }
    }
    for (const n of nodes) {
      const ns = nodeStyle(n.kind);
      const w = nodeW(n.label) * s;
      slide.addText(texToText(n.label), {
        shape: pptx.ShapeType.roundRect, rectRadius: 0.08,
        x: X(n.x!) - w / 2, y: Y(n.y!) - 18 * s, w, h: 36 * s,
        fill: { color: ns.fill.slice(1) }, line: { color: ns.stroke.slice(1), width: 1.25, dashType: ns.dash ? 'dash' : 'solid' },
        fontFace: FONT, fontSize: Math.max(8, Math.min(16, Math.round(14.5 * s * 72))), bold: ns.weight >= 600, color: ns.text.slice(1), align: 'center', valign: 'middle',
      });
    }
  }

  if (content !== 'graph') {
    const blocks = blocksOf(r.note);
    let slide: ReturnType<typeof pptx.addSlide> | null = null;
    let title = '';
    let body: Run[] = [];
    let used = 0;
    const answers: Run[] = [];
    const flush = () => {
      if (!slide && !body.length) return;
      if (!slide) slide = pptx.addSlide();
      slide.addText(texToText(title), { x: 0.5, y: 0.25, w: 12.3, h: 0.7, fontFace: FONT, fontSize: 24, bold: true, color: INKC });
      if (body.length) slide.addText(body as never, { x: 0.6, y: 1.05, w: 12.1, h: 6.1, fontFace: FONT, fontSize: 15, color: INKC, valign: 'top', paraSpaceAfter: 6, lineSpacingMultiple: 1.15 });
      slide = null;
      body = [];
      used = 0;
    };
    const add = (runs: Run[], cost: number) => {
      if (used + cost > 520 && body.length) {
        flush();
        title = title.endsWith('（续）') ? title : `${title}（续）`;
      }
      if (runs.length) runs[runs.length - 1]!.options = { ...runs[runs.length - 1]!.options, breakLine: true };
      body.push(...runs);
      used += cost;
    };
    for (const b of blocks) {
      if (b.kind === 'h1') continue;
      if (b.kind === 'h2' || (b.kind === 'h3' && !title)) {
        flush();
        title = b.text;
        continue;
      }
      if (b.kind === 'h3') add(runsOf(b.text, { bold: true }), 40);
      if (b.kind === 'p') add(runsOf(b.text), b.text.length + 40);
      if (b.kind === 'math') add([{ text: texToText(b.text), options: { align: 'center', fontFace: 'Cambria Math' } }], 60);
      if (b.kind === 'callout') {
        const runs: Run[] = [{ text: `【${b.title || '栏目'}】`, options: { bold: true, color: '3F5E86', breakLine: true } }];
        for (const line of b.text.split('\n').filter((x) => x.trim() && !x.includes('vein-graph'))) runs.push(...runsOf(line.replace(/^[-*]\s+/, '• ')), { text: '', options: { breakLine: true } });
        if (b.folded) answers.push(...runs);
        else add(runs, b.text.length + 60);
      }
      if (b.kind === 'table' && b.rows?.length) {
        flush();
        const t = pptx.addSlide();
        t.addText(texToText(b.title || title), { x: 0.5, y: 0.25, w: 12.3, h: 0.7, fontFace: FONT, fontSize: 22, bold: true, color: INKC });
        t.addTable(
          b.rows.map((row, ri) => row.map((c) => ({ text: texToText(c.replace(/\*\*/g, '')), options: { bold: ri === 0, fill: { color: ri === 0 ? 'DBE5EE' : 'FFFFFF' } } }))) as never,
          { x: 0.5, y: 1.1, w: 12.3, fontFace: FONT, fontSize: 12, color: INKC, border: { type: 'solid', color: 'BBBBBB', pt: 0.75 }, autoPage: true },
        );
      }
    }
    flush();
    if (answers.length) {
      const a = pptx.addSlide();
      a.addText('参考答案', { x: 0.5, y: 0.25, w: 12.3, h: 0.7, fontFace: FONT, fontSize: 24, bold: true, color: INKC });
      a.addText(answers as never, { x: 0.6, y: 1.05, w: 12.1, h: 6.1, fontFace: FONT, fontSize: 14, color: INKC, valign: 'top' });
    }
  }
  return (await pptx.write({ outputType: 'blob' })) as Blob;
}

/* ---------- 生成文件 ---------- */

export async function makeFile(r: ExploreResult, content: Content, fmt: Format, ask: string): Promise<Blob> {
  switch (fmt) {
    case 'md':
      return new Blob([lectureMarkdown(r, { note: content !== 'graph', graph: content !== 'note' })], { type: 'text/markdown;charset=utf-8' });
    case 'doc':
      return wordBlob(r, content);
    case 'pptx':
      return pptxBlob(r, content, ask);
    case 'svg':
      return new Blob([graphSvg(r)], { type: 'image/svg+xml' });
    case 'png':
      return (await svgToPng(graphSvg(r))).blob;
    default:
      throw new Error('PDF 请用浏览器打印另存');
  }
}

export function download(name: string, data: Blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(data);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** 存进工作区的某个文件夹；浏览器工作区顺带登记进文件栏 */
export async function saveToWorkspace(store: WorkspaceStore, workspace: Workspace, path: string, data: Blob): Promise<Workspace> {
  if (workspace.origin === 'browser') return writeBrowserFile(workspace, path, data);
  await store.write(path, data);
  return workspace;
}

/** 工作区里已有的文件夹（去掉内部目录），供「存进工作区」选择 */
export async function workspaceFolders(store: WorkspaceStore): Promise<string[]> {
  const dirs = new Set<string>(['探索']);
  for (const e of await store.list('')) {
    const parts = e.path.split('/');
    for (let i = 1; i < parts.length; i += 1) {
      const d = parts.slice(0, i).join('/');
      if (!/^(\.vein|maps)(\/|$)/.test(d)) dirs.add(d);
    }
  }
  return [...dirs].sort((a, b) => a.localeCompare(b, 'zh'));
}

/* ---------- 插入讲义 ---------- */

export function lectureFiles(workspace: Workspace): WsFile[] {
  return workspace.folders.flatMap((f) => f.files).filter((f) => f.kind === 'lecture' || /\.(md|markdown)$/i.test(f.path ?? ''));
}

const draftKey = (id: string) => `vein.draft.${id}.md`;

/**
 * 把这次的讲解（与关联图）接到一篇讲义的末尾，标题降一级。
 * 写入路径与工作台保存时相同：示例讲义写本机草稿，浏览器工作区写 IndexedDB，本地文件夹写回硬盘。
 */
export async function insertIntoLecture(store: WorkspaceStore, workspace: Workspace, file: WsFile, r: ExploreResult, content: Content): Promise<void> {
  const piece = lectureMarkdown(r, { note: content !== 'graph', graph: content !== 'note', demote: true });
  if (workspace.origin === 'demo' || (!file.path && !file.local && !file.browser)) {
    const prev = localStorage.getItem(draftKey(file.id)) ?? (await (await fetch(file.sourceUrl ?? file.url)).text());
    localStorage.setItem(draftKey(file.id), `${prev.trimEnd()}\n\n${piece}`);
    return;
  }
  const path = file.path!;
  const prev = (await readText(store, path)) ?? '';
  await store.write(path, new Blob([`${prev.trimEnd()}\n\n${piece}`], { type: 'text/markdown' }));
}
