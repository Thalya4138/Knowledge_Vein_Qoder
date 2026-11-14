/**
 * 锚点规则：标题 slug 与段落 `^锚`。
 *
 * ADR-0002 §2：检索索引与阅读器共用这一份实现，不许各写一套。
 */
import type { Paragraph, PhrasingContent } from 'mdast';

/** 与 `scripts/verify-content.mjs` 的段落锚正则同义：行尾 `空白^id`。 */
export const BLOCK_ANCHOR_RE = /(?:^|\s)\^([A-Za-z0-9-]+)\s*$/;
/** 旁栏标题行末尾的 `@锚`。 */
export const ALIGN_RE = /(?:^|\s)@([A-Za-z0-9-]+)\s*$/;

/**
 * 标题 → URL 片段。保留中日韩文字与字母数字，空白（含全角空格）变 `-`，其余标点去掉。
 * 例："第1节　列空间中的最近点" → "第1节-列空间中的最近点"。
 * 同名标题的去重由 `createSlugger()` 负责。
 */
export function slugify(text: string): string {
  return text
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/gu, '-')
    .replace(/[^\p{L}\p{N}\p{M}_-]/gu, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

/** 同一文档内第二个同名标题得到 `xxx-1`，第三个 `xxx-2`，与 GitHub 的习惯一致。 */
export function createSlugger(): (text: string) => string {
  const seen = new Map<string, number>();
  return (text) => {
    const base = slugify(text) || 'section';
    const n = seen.get(base);
    seen.set(base, (n ?? 0) + 1);
    return n === undefined ? base : `${base}-${n}`;
  };
}

/**
 * 从段落末尾摘下 `^锚`，返回锚名并就地删掉源码标记（渲染时不应看到 `^p-intro`）。
 * 段落只剩锚时（独占一行的 `^exercises`），返回 `{ anchor, empty: true }`，
 * 按 Obsidian 约定它标注的是**前一个块**。
 */
export function takeBlockAnchor(p: Paragraph): { anchor?: string; empty: boolean } {
  const last = p.children.at(-1);
  if (!last || last.type !== 'text') return { empty: false };
  const m = BLOCK_ANCHOR_RE.exec(last.value);
  if (!m) return { empty: false };
  last.value = last.value.slice(0, m.index).replace(/\s+$/, '');
  if (!last.value) p.children.pop();
  return { anchor: m[1], empty: isBlank(p.children) };
}

function isBlank(nodes: PhrasingContent[]): boolean {
  return nodes.every((n) => n.type === 'text' && !n.value.trim());
}
