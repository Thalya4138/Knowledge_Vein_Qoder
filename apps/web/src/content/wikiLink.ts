/**
 * `[[wiki link]]` → mdast 节点 `wikiLink`。
 *
 * 只改普通文本节点：代码、公式、已有链接里的 `[[…]]` 原样保留。
 * 目标解析规则与 `scripts/verify-content.mjs` 一致：`|` 之前是目标（节点 title / alias / 章节 title），之后是显示文字。
 */
import type { Data, Literal, Nodes, Parent, PhrasingContent, Text } from 'mdast';

export interface WikiLinkData extends Data {
  target: string;
  alias?: string;
}

export interface WikiLink extends Literal {
  type: 'wikiLink';
  /** 原始写法，如 `[[法方程|那组方程]]`；导出与回显用。 */
  value: string;
  data: WikiLinkData;
}

declare module 'mdast' {
  interface PhrasingContentMap {
    wikiLink: WikiLink;
  }
  interface RootContentMap {
    wikiLink: WikiLink;
  }
}

const WIKI_RE = /\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g;

/** 不进入这些节点的子树：里面的 `[[` 不是 wiki link。 */
const OPAQUE = new Set(['link', 'linkReference', 'inlineCode', 'code', 'inlineMath', 'math', 'html']);

export function transformWikiLinks(tree: Nodes): void {
  if (!('children' in tree) || OPAQUE.has(tree.type)) return;
  const parent = tree as Parent;
  const out: typeof parent.children = [];
  for (const child of parent.children) {
    if (child.type === 'text' && child.value.includes('[[')) {
      out.push(...splitText(child));
    } else {
      transformWikiLinks(child as Nodes);
      out.push(child);
    }
  }
  parent.children = out;
}

function splitText(node: Text): PhrasingContent[] {
  const parts: PhrasingContent[] = [];
  let last = 0;
  for (const m of node.value.matchAll(WIKI_RE)) {
    const at = m.index;
    if (at > last) parts.push({ type: 'text', value: node.value.slice(last, at) });
    const target = (m[1] ?? '').trim();
    const alias = m[2]?.trim();
    parts.push({
      type: 'wikiLink',
      value: m[0],
      data: alias ? { target, alias } : { target },
      // 行内偏移不精确跟踪；行号够检索和回指用，取所在文本节点的位置
      ...(node.position ? { position: node.position } : {}),
    });
    last = at + m[0].length;
  }
  if (parts.length === 0) return [node];
  if (last < node.value.length) parts.push({ type: 'text', value: node.value.slice(last) });
  return parts;
}
