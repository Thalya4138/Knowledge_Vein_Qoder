/**
 * 讲义解析的输出契约（T1-1）。阅读器（T1-2）、检索（T2）、锚点跳转（T1-3）都只依赖这里。
 *
 * 分层：
 *   parseNote(md)   → NoteDocument   结构：块、栏目、锚点、旁栏对齐、wiki link、行号
 *   renderNodes(..) → hast           内容：把某个块里的 Markdown 片段渲染成 HTML 树（KaTeX、白名单过滤）
 *
 * 结构由解析器决定，阅读器不再自己扫正则；内容渲染只管"这一块长什么样"。
 */
import type { PhrasingContent, RootContent } from 'mdast';
import type { CalloutKind } from './callouts';

/** 源码行号区间（1 起，含首尾）。检索命中、证据回指、"这一句来自哪一行"都用它。 */
export interface LineRange {
  start: number;
  end: number;
}

interface BlockBase {
  /** 文档内稳定 id：有 `^锚` 时就是锚名，否则为 `blk-<序号>`。 */
  id: string;
  lines: LineRange;
  /** 源文件里写明的 `^锚`（没有就是 undefined）。 */
  anchor?: string;
  /** 主栏还是旁栏。窄屏时旁栏块按 alignTo 退化为内联卡片。 */
  placement: 'main' | 'side';
}

/**
 * 正文段落、列表、公式块、图片等普通 Markdown 块。
 * 通常只有一个节点；原生 `<details>…</details>` 跨多个 mdast 节点，会被收进同一块，
 * 否则分开渲染会得到不闭合的标签。
 */
export interface ProseBlock extends BlockBase {
  type: 'prose';
  placement: 'main';
  nodes: RootContent[];
}

export interface HeadingBlock extends BlockBase {
  type: 'heading';
  placement: 'main';
  depth: 1 | 2 | 3 | 4 | 5 | 6;
  /** 标题锚点（URL hash 用）。检索索引与阅读器共用这一份规则：`slugify()`。 */
  slug: string;
  text: string;
  children: PhrasingContent[];
}

/** Obsidian callout：`> [!kind][+-]? 标题 @锚`。教材栏目全部走这里。 */
export interface CalloutBlock extends BlockBase {
  type: 'callout';
  kind: CalloutKind | string;
  /** 白名单外的类型仍会产出块（不丢内容），但同时记一条诊断。 */
  known: boolean;
  /** `-` 默认折叠，`+` 可折叠但默认展开，不写则不可折叠。 */
  fold: 'none' | 'open' | 'closed';
  title: PhrasingContent[];
  titleText: string;
  /** 源码里显式写的 `@锚`。 */
  explicitAlign?: string;
  /** 旁栏块实际对齐到的主栏块 id（显式 `@` 优先，否则按就近规则推断）。主栏块为 undefined。 */
  alignTo?: string;
  /** 仅 `[!res]`：span id，标题/位置/引文/理由全部从 manifest 读。 */
  spanId?: string;
  body: RootContent[];
}

export type NoteBlock = ProseBlock | HeadingBlock | CalloutBlock;

/** 版式行：一段主栏内容 + 与它对齐的旁栏块。对应样张里的 `<div class="row">`。 */
export interface LayoutRow {
  main: string[];
  side: string[];
}

export interface HeadingRef {
  slug: string;
  depth: number;
  text: string;
  line: number;
}

export interface WikiLinkRef {
  target: string;
  alias?: string;
  line: number;
  /** 所在块 id（callout 内部的链接记在 callout 上）。 */
  blockId: string;
}

export interface Diagnostic {
  severity: 'error' | 'warning';
  code:
    | 'unknown-callout'
    | 'dangling-align'
    | 'duplicate-anchor'
    | 'res-missing-span'
    | 'side-unaligned'
    | 'frontmatter-unsupported'
    | 'math-render';
  message: string;
  line?: number;
}

export interface NoteDocument {
  frontmatter: Record<string, string>;
  /** 第一个一级标题的纯文本。 */
  title?: string;
  /** 源码顺序。 */
  blocks: NoteBlock[];
  blockById: Map<string, NoteBlock>;
  /** `^锚` → 块 id（目前二者相同，单独列出是为了让查询方不必知道这个约定）。 */
  anchors: Map<string, string>;
  headings: HeadingRef[];
  wikiLinks: WikiLinkRef[];
  rows: LayoutRow[];
  diagnostics: Diagnostic[];
}
