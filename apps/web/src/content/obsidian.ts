/**
 * Obsidian 兼容层：让用户自己的 Obsidian 库在阅读器里长得和在 Obsidian 里一样（不只认我们生成的教材式讲义）。
 *
 * 分两步，都不改行号（检索、证据回指、块级编辑都按行号对源码）：
 * 1. preprocessObsidian(source)：解析前的逐行改写——
 *    `%% 注释 %%` 抹掉（换行保留）；`\[ … \]` → `$$ … $$`，`\( … \)` → `$ … $`（ChatGPT 导出的笔记常用这种写法）。
 *    围栏代码块里一律不动。
 * 2. transformObsidianInline(tree)：语法树上的行内改写——
 *    `==荧光==` → mark；`![[嵌入]]` → embed；`#标签` → tag。代码、公式、链接里不动。
 */
import type { Data, Literal, Nodes, Parent, PhrasingContent, Text } from 'mdast';

export interface MarkNode extends Literal {
  type: 'obMark';
  data: Data & { text: string };
}
export interface EmbedNode extends Literal {
  type: 'obEmbed';
  data: Data & { target: string; alias?: string };
}
export interface TagNode extends Literal {
  type: 'obTag';
  data: Data & { tag: string };
}

declare module 'mdast' {
  interface PhrasingContentMap {
    obMark: MarkNode;
    obEmbed: EmbedNode;
    obTag: TagNode;
  }
  interface RootContentMap {
    obMark: MarkNode;
    obEmbed: EmbedNode;
    obTag: TagNode;
  }
}

const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/;

/** 逐行改写，行数不变。 */
export function preprocessObsidian(source: string): string {
  const lines = source.split('\n');
  let fence: string | null = null;
  let inComment = false;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]!;
    const f = FENCE_RE.exec(line);
    if (f && !inComment) {
      if (fence === null) fence = f[1]![0]!.repeat(3);
      else if (line.trim().startsWith(fence)) fence = null;
      continue;
    }
    if (fence !== null) continue;

    // %% 注释 %%：可以跨行
    let out = '';
    let rest = line;
    while (rest.length) {
      const at = rest.indexOf('%%');
      if (at < 0) {
        if (!inComment) out += rest;
        break;
      }
      if (!inComment) out += rest.slice(0, at);
      inComment = !inComment;
      rest = rest.slice(at + 2);
    }
    line = out;

    // \[ \] 与 \( \)：只在行内代码之外改
    line = line
      .split(/(`[^`]*`)/)
      // 前面是反斜杠的不算：`\\[4pt]` 是 LaTeX 的带间距换行
      .map((seg) =>
        seg.startsWith('`')
          ? seg
          : seg
              .replace(/(?<!\\)\\\[/g, '$$$$')
              .replace(/(?<!\\)\\\]/g, '$$$$')
              .replace(/(?<!\\)\\\(\s*/g, '$$')
              .replace(/\s*(?<!\\)\\\)/g, '$$'),
      )
      .join('');
    lines[i] = line;
  }
  return lines.join('\n');
}

/** 不进入这些节点：里面的 `==` `#` `![[` 不是 Obsidian 语法。 */
const OPAQUE = new Set(['link', 'linkReference', 'inlineCode', 'code', 'inlineMath', 'math', 'html', 'wikiLink']);

const INLINE_RE = /==([^=\n](?:[^\n]*?[^=\n])?)==|!\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]|(^|[\s(（，。；：、])#([\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gu;

export function transformObsidianInline(tree: Nodes): void {
  if (!('children' in tree) || OPAQUE.has(tree.type)) return;
  const parent = tree as Parent;
  const out: typeof parent.children = [];
  for (const child of parent.children) {
    if (child.type === 'text' && /==|!\[\[|#/.test(child.value)) out.push(...split(child));
    else {
      transformObsidianInline(child as Nodes);
      out.push(child);
    }
  }
  parent.children = out;
}

function split(node: Text): PhrasingContent[] {
  const parts: PhrasingContent[] = [];
  let last = 0;
  const pos = node.position ? { position: node.position } : {};
  for (const m of node.value.matchAll(INLINE_RE)) {
    let at = m.index;
    if (m[1] !== undefined) {
      if (at > last) parts.push({ type: 'text', value: node.value.slice(last, at) });
      parts.push({ type: 'obMark', value: m[0], data: { text: m[1] }, ...pos });
    } else if (m[2] !== undefined) {
      if (at > last) parts.push({ type: 'text', value: node.value.slice(last, at) });
      const target = m[2].trim();
      const alias = m[3]?.trim();
      parts.push({ type: 'obEmbed', value: m[0], data: alias ? { target, alias } : { target }, ...pos });
    } else {
      const lead = m[4] ?? '';
      at += lead.length;
      if (at > last) parts.push({ type: 'text', value: node.value.slice(last, at) });
      parts.push({ type: 'obTag', value: `#${m[5]}`, data: { tag: m[5]! }, ...pos });
    }
    last = m.index + m[0].length;
  }
  if (parts.length === 0) return [node];
  if (last < node.value.length) parts.push({ type: 'text', value: node.value.slice(last) });
  return parts;
}

/**
 * Obsidian 的提示框类型（含别名）→ 家族。阅读器按家族给图标与颜色。
 * 和教材栏目的白名单（callouts.ts）分开：教材栏目有版位规则，这些只管长相。
 */
export const OB_CALLOUT: Record<string, { family: string; label: string }> = {};
const FAMILIES: [string, string, string[]][] = [
  ['note', '笔记', ['note']],
  ['abstract', '摘要', ['abstract', 'tldr']],
  ['info', '信息', ['info']],
  ['todo', '待办', ['todo']],
  ['tip', '提示', ['tip', 'hint', 'important']],
  ['success', '完成', ['success', 'check', 'done']],
  ['question', '问题', ['question', 'help', 'faq']],
  ['warning', '注意', ['warning', 'caution', 'attention']],
  ['failure', '失败', ['failure', 'fail', 'missing']],
  ['danger', '危险', ['danger', 'error']],
  ['bug', '缺陷', ['bug']],
  ['example', '例子', ['example']],
  ['quote', '引用', ['quote', 'cite']],
];
for (const [family, label, names] of FAMILIES) for (const n of names) OB_CALLOUT[n] = { family, label };
