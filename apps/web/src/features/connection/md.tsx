import { toHtml } from 'hast-util-to-html';
import { parseMarkdown } from '../../content/parseNote';
import { renderNodes } from '../../content/render';
import 'katex/dist/katex.min.css';

/**
 * 模型写的 Markdown → 安全的 HTML（与阅读器同一条管线：白名单过滤之后才渲染 KaTeX，
 * 模型输出里的任意 HTML 进不了页面）。同一段文字反复渲染时走缓存。
 */
const cache = new Map<string, string>();

export function renderMd(md: string): string {
  const hit = cache.get(md);
  if (hit !== undefined) return hit;
  let html: string;
  try {
    html = toHtml(renderNodes(parseMarkdown(md).children).hast);
  } catch {
    html = md.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
  }
  if (cache.size > 400) cache.clear();
  cache.set(md, html);
  return html;
}

/** 行内片段（表格格子、短句）：去掉外层 <p> */
export function renderInline(md: string): string {
  return renderMd(md).replace(/^<p>([\s\S]*)<\/p>\s*$/, '$1');
}

export function Md({ text, className, inline }: { text: string; className?: string; inline?: boolean }) {
  const html = inline ? renderInline(text) : renderMd(text);
  return inline ? <span className={className} dangerouslySetInnerHTML={{ __html: html }} /> : <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
