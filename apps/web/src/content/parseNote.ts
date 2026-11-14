/**
 * 讲义 Markdown → NoteDocument（T1-1）。
 *
 * 只做确定性的结构解析：不渲染、不访问网络、不读 manifest。
 * 同一份源码永远得到同一份结构，检索索引与阅读器都从这里取锚点与行号。
 */
import type { Blockquote, Html, Nodes, Paragraph, PhrasingContent, Root, RootContent } from 'mdast';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { ALIGN_RE, createSlugger, takeBlockAnchor } from './anchors';
import { isCalloutKind, placementOf } from './callouts';
import { parseFrontmatter } from './frontmatter';
import { transformWikiLinks } from './wikiLink';
import type {
  CalloutBlock, Diagnostic, HeadingRef, LayoutRow, LineRange, NoteBlock, NoteDocument, WikiLinkRef,
} from './types';

const parser = unified().use(remarkParse).use(remarkFrontmatter, ['yaml']).use(remarkGfm).use(remarkMath);

/** 只解析语法，不跑任何转换插件——结构转换全部在下面显式完成，便于测试与审阅。 */
export function parseMarkdown(source: string): Root {
  return parser.parse(source);
}

export function parseNote(source: string): NoteDocument {
  const tree = parseMarkdown(source);
  promoteDisplayMath(tree, source);
  transformWikiLinks(tree);

  const diagnostics: Diagnostic[] = [];
  const blocks: NoteBlock[] = [];
  const anchors = new Map<string, string>();
  const headings: HeadingRef[] = [];
  const slug = createSlugger();
  let frontmatter: Record<string, string> = {};
  let title: string | undefined;
  let seq = 0;

  const claimAnchor = (anchor: string, block: NoteBlock, line: number) => {
    if (anchors.has(anchor)) {
      diagnostics.push({ severity: 'error', code: 'duplicate-anchor', message: `锚点 ^${anchor} 重复`, line });
      return;
    }
    anchors.set(anchor, anchor);
    block.anchor = anchor;
    block.id = anchor;
  };

  const children = tree.children;
  for (let i = 0; i < children.length; i++) {
    const node = children[i]!;
    const lines = rangeOf(node);

    if (node.type === 'yaml') {
      const fm = parseFrontmatter(node.value, lines.start);
      frontmatter = fm.data;
      diagnostics.push(...fm.diagnostics);
      continue;
    }
    // 引用式链接的定义不产出可见内容；见本目录 README"已知限制"
    if (node.type === 'definition') continue;

    if (node.type === 'heading') {
      const text = plainText(node.children);
      const s = slug(text);
      headings.push({ slug: s, depth: node.depth, text, line: lines.start });
      if (node.depth === 1 && title === undefined) title = text;
      blocks.push({
        type: 'heading', id: `blk-${seq++}`, placement: 'main', lines,
        depth: node.depth, slug: s, text, children: node.children,
      });
      continue;
    }

    if (node.type === 'blockquote') {
      const callout = toCallout(node, `blk-${seq}`, lines, diagnostics, source);
      if (callout) {
        seq++;
        blocks.push(callout);
        continue;
      }
    }

    if (node.type === 'paragraph') {
      const { anchor, empty } = takeBlockAnchor(node);
      if (empty && anchor) {
        // 独占一行的 `^锚`：标注前一个块（Obsidian 约定）
        const prev = blocks.at(-1);
        if (prev && !prev.anchor) claimAnchor(anchor, prev, lines.start);
        else diagnostics.push({
          severity: 'warning', code: 'dangling-align',
          message: `独占一行的 ^${anchor} 前面没有可标注的块`, line: lines.start,
        });
        continue;
      }
      const block: NoteBlock = { type: 'prose', id: `blk-${seq++}`, placement: 'main', lines, nodes: [node] };
      blocks.push(block);
      if (anchor) claimAnchor(anchor, block, lines.start);
      continue;
    }

    // 原生 <details>：一直收到 </details> 为止，作为一个块渲染
    if (node.type === 'html' && opensDetails(node)) {
      const group: RootContent[] = [node];
      let depth = detailsBalance(node.value);
      while (depth > 0 && i + 1 < children.length) {
        const next = children[++i]!;
        group.push(next);
        if (next.type === 'html') depth += detailsBalance(next.value);
      }
      blocks.push({
        type: 'prose', id: `blk-${seq++}`, placement: 'main',
        lines: { start: lines.start, end: rangeOf(group.at(-1)!).end }, nodes: group,
      });
      continue;
    }

    blocks.push({ type: 'prose', id: `blk-${seq++}`, placement: 'main', lines, nodes: [node] });
  }

  alignSideBlocks(blocks, anchors, diagnostics);
  const blockById = new Map(blocks.map((b) => [b.id, b]));

  return {
    frontmatter, title, blocks, blockById, anchors, headings,
    wikiLinks: collectWikiLinks(blocks),
    rows: buildRows(blocks),
    diagnostics,
  };
}

// ---------------------------------------------------------------- callout

const CALLOUT_HEAD_RE = /^\[!([A-Za-z_-]+)\]([+-]?)[ \t]*/;

function toCallout(
  node: Blockquote, id: string, lines: LineRange, diagnostics: Diagnostic[], source: string,
): CalloutBlock | undefined {
  const first = node.children[0];
  if (!first || first.type !== 'paragraph') return undefined;
  const lead = first.children[0];
  if (!lead || lead.type !== 'text') return undefined;
  const m = CALLOUT_HEAD_RE.exec(lead.value);
  if (!m) return undefined;

  const kind = m[1]!.toLowerCase();
  const fold = m[2] === '-' ? 'closed' : m[2] === '+' ? 'open' : 'none';
  lead.value = lead.value.slice(m[0].length);

  // 标题 = 第一行；第一行之后的行内内容并入正文
  const { head, rest } = splitFirstLine(first);
  const explicitAlign = takeAlign(head);
  trimEdges(head);
  const titleText = plainText(head);

  const body: RootContent[] = [];
  if (rest.length) {
    // 标题行下面紧跟（无空行）的内容与标题同属一段；独占的 `$$…$$` 要在拆开之后再判一次
    const p: Paragraph = { ...first, children: rest };
    body.push(asDisplayMath(p, source) ?? p);
  }
  body.push(...node.children.slice(1));

  const known = isCalloutKind(kind);
  if (!known) {
    diagnostics.push({
      severity: 'warning', code: 'unknown-callout',
      message: `未定义的块类型 [!${kind}]，按普通框渲染（白名单见 callouts.ts）`, line: lines.start,
    });
  }

  const block: CalloutBlock = {
    type: 'callout', id, lines, kind, known, fold,
    placement: placementOf(kind, explicitAlign),
    title: head, titleText, body,
    ...(explicitAlign ? { explicitAlign } : {}),
  };

  if (kind === 'res') {
    const span = /^(s\.[A-Za-z0-9.-]+)/.exec(titleText)?.[1];
    if (span) {
      block.spanId = span;
      block.title = [];
      block.titleText = '';
    } else {
      diagnostics.push({
        severity: 'error', code: 'res-missing-span',
        message: '资源卡 [!res] 后面必须紧跟 span id（如 s.l15-normal）', line: lines.start,
      });
    }
  }
  return block;
}

/** 按第一个换行（或硬换行）切开段落的行内内容。 */
function splitFirstLine(p: Paragraph): { head: PhrasingContent[]; rest: PhrasingContent[] } {
  const head: PhrasingContent[] = [];
  const kids = p.children;
  for (let i = 0; i < kids.length; i++) {
    const n = kids[i]!;
    if (n.type === 'break') return { head, rest: kids.slice(i + 1) };
    if (n.type === 'text') {
      const nl = n.value.indexOf('\n');
      if (nl >= 0) {
        const before = n.value.slice(0, nl);
        const after = n.value.slice(nl + 1);
        if (before) head.push({ ...n, value: before });
        const rest = kids.slice(i + 1);
        if (after) rest.unshift({ ...n, value: after });
        return { head, rest };
      }
    }
    head.push(n);
  }
  return { head, rest: [] };
}

function takeAlign(head: PhrasingContent[]): string | undefined {
  const last = head.at(-1);
  if (!last || last.type !== 'text') return undefined;
  const m = ALIGN_RE.exec(last.value);
  if (!m) return undefined;
  last.value = last.value.slice(0, m.index);
  if (!last.value.trim()) head.pop();
  return m[1];
}

function trimEdges(nodes: PhrasingContent[]): void {
  const first = nodes[0];
  if (first?.type === 'text') first.value = first.value.replace(/^\s+/, '');
  const last = nodes.at(-1);
  if (last?.type === 'text') last.value = last.value.replace(/\s+$/, '');
  while (nodes[0]?.type === 'text' && !nodes[0].value) nodes.shift();
  while (nodes.at(-1)?.type === 'text' && !(nodes.at(-1) as { value: string }).value) nodes.pop();
}

// ---------------------------------------------------------------- 对齐与版式

/**
 * 旁栏块对齐规则（NOTE_GENERATION §3.5，样张为准）：
 * 1. 写了 `@锚` → 对齐到该锚所在块；锚不存在记 error，再按下面的规则兜底；
 * 2. 没写 → 同一小节内**前一个正文块**；
 * 3. 前面没有（如节首的"本节聚焦"）→ 同一小节内**后一个正文块**（样张里它与 ^p-intro 同行）；
 * 4. 仍找不到 → 任一相邻主栏块；都没有则单独成行并记 warning。
 */
function alignSideBlocks(blocks: NoteBlock[], anchors: Map<string, string>, diagnostics: Diagnostic[]): void {
  blocks.forEach((b, i) => {
    if (b.type !== 'callout' || b.placement !== 'side') return;
    if (b.explicitAlign) {
      const target = anchors.get(b.explicitAlign);
      if (target) { b.alignTo = target; return; }
      diagnostics.push({
        severity: 'error', code: 'dangling-align',
        message: `旁栏块 [!${b.kind}] 对齐到不存在的锚点 @${b.explicitAlign}`, line: b.lines.start,
      });
    }
    const target = nearest(blocks, i, (x) => x.type === 'prose', true)
      ?? nearest(blocks, i, (x) => x.placement === 'main', false);
    if (target) b.alignTo = target.id;
    else diagnostics.push({
      severity: 'warning', code: 'side-unaligned',
      message: `旁栏块 [!${b.kind}] 找不到可对齐的主栏内容，将单独成行`, line: b.lines.start,
    });
  });
}

function nearest(
  blocks: NoteBlock[], i: number, ok: (b: NoteBlock) => boolean, sameSection: boolean,
): NoteBlock | undefined {
  for (const step of [-1, 1]) {
    for (let j = i + step; j >= 0 && j < blocks.length; j += step) {
      const b = blocks[j]!;
      if (sameSection && b.type === 'heading') break;
      if (b.placement === 'main' && ok(b)) return b;
    }
  }
  return undefined;
}

/**
 * 版式行：标题独占一行；有旁栏的主栏块开新行；没有旁栏的块并入上一行
 * （样张里"勒让德"段与其后一段同在一行，旁栏只贴着前者）。
 */
function buildRows(blocks: NoteBlock[]): LayoutRow[] {
  const sides = new Map<string, string[]>();
  const orphans: string[] = [];
  for (const b of blocks) {
    if (b.placement !== 'side') continue;
    const t = b.type === 'callout' ? b.alignTo : undefined;
    if (t) sides.set(t, [...(sides.get(t) ?? []), b.id]);
    else orphans.push(b.id);
  }
  const rows: LayoutRow[] = [];
  let cur: LayoutRow | undefined;
  let afterHeading = false;
  for (const b of blocks) {
    if (b.placement !== 'main') {
      if (orphans.includes(b.id)) { rows.push({ main: [], side: [b.id] }); cur = undefined; }
      continue;
    }
    const own = sides.get(b.id);
    if (!cur || b.type === 'heading' || afterHeading || own) {
      cur = { main: [], side: [] };
      rows.push(cur);
    }
    cur.main.push(b.id);
    if (own) cur.side.push(...own);
    afterHeading = b.type === 'heading';
  }
  return rows;
}

// ---------------------------------------------------------------- 工具

/**
 * Obsidian 方言修正：独占一段的单行 `$$…$$` 是**独立公式**。
 *
 * remark-math 只把 `$$` 单独成行的写法当作公式块；单行 `$$…$$` 会被解析成行内公式，
 * 结果是讲义里每个独立公式都挤进行内，带 `\tag` 的还会直接报错。
 * 判据看源码：段落里只有一个行内公式、且它在源码里以 `$$` 开头。
 */
function promoteDisplayMath(tree: Nodes, source: string): void {
  if (!('children' in tree)) return;
  const kids = tree.children as RootContent[];
  kids.forEach((n, i) => {
    if (n.type === 'paragraph') {
      kids[i] = asDisplayMath(n, source) ?? n;
      return;
    }
    promoteDisplayMath(n as Nodes, source);
  });
}

function asDisplayMath(p: Paragraph, source: string): RootContent | undefined {
  const real = p.children.filter((c) => !(c.type === 'text' && !c.value.trim()));
  const only = real.length === 1 ? real[0] : undefined;
  const at = only?.position?.start.offset;
  if (only?.type !== 'inlineMath' || at === undefined || !source.startsWith('$$', at)) return undefined;
  return displayMath(only.value, p.position);
}

/**
 * 与 mdast-util-math 为 `$$` 围栏公式生成的节点同形：渲染提示（hName / hChildren）必须一起带上，
 * 否则 remark-rehype 不认识 `math`，会把公式源码当普通文字输出。
 */
function displayMath(value: string, position: Paragraph['position']): RootContent {
  return {
    type: 'math',
    value,
    data: {
      hName: 'pre',
      hChildren: [{
        type: 'element', tagName: 'code',
        properties: { className: ['language-math', 'math-display'] },
        children: [{ type: 'text', value }],
      }],
    },
    ...(position ? { position } : {}),
  };
}

function collectWikiLinks(blocks: NoteBlock[]): WikiLinkRef[] {
  const out: WikiLinkRef[] = [];
  const walk = (n: Nodes, blockId: string) => {
    if (n.type === 'wikiLink') {
      out.push({
        target: n.data.target, line: n.position?.start.line ?? 0, blockId,
        ...(n.data.alias ? { alias: n.data.alias } : {}),
      });
      return;
    }
    if ('children' in n) for (const c of n.children) walk(c as Nodes, blockId);
  };
  for (const b of blocks) {
    const roots: Nodes[] = b.type === 'prose' ? b.nodes
      : b.type === 'heading' ? b.children
      : [...b.title, ...b.body];
    for (const r of roots) walk(r, b.id);
  }
  return out;
}

/** 行内节点的纯文本（公式保留 TeX 源码，wiki link 取显示文字）。 */
export function plainText(nodes: readonly Nodes[]): string {
  let s = '';
  for (const n of nodes) {
    if (n.type === 'wikiLink') s += n.data.alias ?? n.data.target;
    else if ('value' in n && typeof n.value === 'string' && n.type !== 'html') s += n.value;
    else if (n.type === 'break') s += '\n';
    else if ('children' in n) s += plainText(n.children as Nodes[]);
  }
  return s;
}

function rangeOf(n: RootContent): LineRange {
  return { start: n.position?.start.line ?? 0, end: n.position?.end.line ?? 0 };
}

const opensDetails = (n: Html) => /<details[\s>]/i.test(n.value);
const detailsBalance = (html: string) =>
  (html.match(/<details[\s>]/gi)?.length ?? 0) - (html.match(/<\/details>/gi)?.length ?? 0);
