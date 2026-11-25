/**
 * 块内容 → hast（HTML 语法树）。阅读器拿 hast 转 React 元素（T1-2）；测试拿它转 HTML 字符串。
 *
 * 管线顺序有讲究：
 *   remark-rehype（保留原生 HTML）→ rehype-raw（解析它）→ rehype-sanitize（白名单）→ rehype-katex
 * KaTeX 必须在 sanitize **之后**，否则它生成的大量 class/style 会被白名单剥掉；
 * 反过来，sanitize 必须在 raw 之后，否则 `<details>` 之外的任意 HTML（含 LLM 生成的）会原样进 DOM。
 */
import type { Element, ElementContent, Root as HastRoot } from 'hast';
import type { FootnoteDefinition, Nodes, Root, RootContent } from 'mdast';
import { unified } from 'unified';
import remarkRehype, { type Options as RemarkRehypeOptions } from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema, type Options as SanitizeSchema } from 'rehype-sanitize';
import rehypeKatex from 'rehype-katex';
import { VFile } from 'vfile';
import type { Diagnostic } from './types';
import type { WikiLink } from './wikiLink';
import type { EmbedNode, MarkNode, TagNode } from './obsidian';
import { rehypeLiteHighlight } from './highlight';
import { rehypeVeinGraph } from './veinGraph';

export interface RenderOptions {
  /** wiki link 目标 → 链接地址；返回 undefined 表示没落地，渲染成带 `unresolved` 的 span。 */
  wikiHref?: (target: string) => string | undefined;
  /** 图片相对路径（如 `figures/2-1.svg`）→ 实际可加载的地址。 */
  assetUrl?: (src: string) => string;
  /** `![[文件名]]` → 可加载的地址（Obsidian 按文件名在整个库里找）；找不到返回 undefined。 */
  embedUrl?: (target: string) => string | undefined;
  /** 全文的脚注定义：每块单独渲染，块里引用到的脚注要从这里补进来，否则脚注正文会丢。 */
  footnotes?: readonly FootnoteDefinition[];
  /** 单个换行显示为换行（栏目里的小题、选项一行一个；与 Obsidian 默认一致） */
  breaks?: boolean;
}

const IMAGE_RE = /\.(png|jpe?g|gif|svg|webp|bmp|avif)$/i;

type AttrDefs = NonNullable<NonNullable<SanitizeSchema['attributes']>[string]>;

/**
 * 给某个标签追加允许的 class。默认白名单里同一标签已有 `className` 规则时必须**合并**：
 * 两条 `className` 规则并存时只有一条生效（`a` 上默认那条只放行 `data-footnote-backref`）。
 */
function allowClasses(tag: string, ...classes: (string | RegExp)[]): AttrDefs {
  const defs = defaultSchema.attributes?.[tag] ?? [];
  const isClass = (d: AttrDefs[number]) => Array.isArray(d) && d[0] === 'className';
  const prev = defs.filter(isClass).flatMap((d) => (d as unknown[]).slice(1)) as (string | RegExp)[];
  return [...defs.filter((d) => !isClass(d)), ['className', ...prev, ...classes]];
}

/** 在 GitHub 默认白名单上，只放行本项目需要的几样东西。 */
const schema: SanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'mark'],
  protocols: {
    ...defaultSchema.protocols,
    src: [...(defaultSchema.protocols?.src ?? []), 'blob'],
  },
  attributes: {
    ...defaultSchema.attributes,
    code: allowClasses('code', 'math-inline', 'math-display'),
    a: [...allowClasses('a', 'wikilink'), 'dataTarget'],
    // 字色：Markdown 没有标准写法，通行的是 <span style="color:#…">（Obsidian 能显示）。只放行这一种样式，其余内联样式一律过滤
    span: [...allowClasses('span', 'wikilink', 'unresolved', 'ob-tag', 'ob-embed'), 'dataTarget', ['style', /^color:\s*#[0-9a-fA-F]{3,8};?$/]],
  },
};

const handlers = (opts: RenderOptions): RemarkRehypeOptions['handlers'] => ({
  obMark(_state, node: MarkNode): Element {
    return { type: 'element', tagName: 'mark', properties: {}, children: [{ type: 'text', value: node.data.text }] };
  },
  obTag(_state, node: TagNode): Element {
    return { type: 'element', tagName: 'span', properties: { className: ['ob-tag'] }, children: [{ type: 'text', value: `#${node.data.tag}` }] };
  },
  obEmbed(_state, node: EmbedNode): Element {
    const { target, alias } = node.data;
    const url = opts.embedUrl?.(target);
    if (url && IMAGE_RE.test(target)) {
      // Obsidian 的 `![[图.png|300]]`：竖线后是数字时表示宽度
      const width = alias && /^\d+$/.test(alias) ? alias : undefined;
      return { type: 'element', tagName: 'img', properties: { src: url, alt: target, ...(width ? { width } : {}) }, children: [] };
    }
    const text = [{ type: 'text' as const, value: `嵌入：${alias ?? target}` }];
    return url
      ? { type: 'element', tagName: 'a', properties: { href: url, className: ['wikilink'], dataTarget: target }, children: text }
      : { type: 'element', tagName: 'span', properties: { className: ['ob-embed', 'unresolved'], dataTarget: target }, children: text };
  },
  wikiLink(_state, node: WikiLink): Element {
    const { target, alias } = node.data;
    const href = opts.wikiHref?.(target);
    const text = [{ type: 'text' as const, value: alias ?? target }];
    return href
      ? { type: 'element', tagName: 'a', properties: { href, className: ['wikilink'], dataTarget: target }, children: text }
      : { type: 'element', tagName: 'span', properties: { className: ['wikilink', 'unresolved'], dataTarget: target }, children: text };
  },
});

/** 单个换行 → <br>：只处理普通文字，代码、公式源码不动 */
function rehypeSoftBreaks() {
  const walk = (n: Root | Element) => {
    const out: ElementContent[] = [];
    for (const c of n.children as ElementContent[]) {
      // 元素之间的空白换行（如 </p>\n<ol>）不是文字里的换行，不能变成 <br>
      if (c.type === 'text' && c.value.includes('\n') && c.value.trim()) {
        c.value.split('\n').forEach((part, i) => {
          if (i) out.push({ type: 'element', tagName: 'br', properties: {}, children: [] });
          if (part) out.push({ type: 'text', value: part });
        });
        continue;
      }
      if (c.type === 'element' && c.tagName !== 'code' && c.tagName !== 'pre') walk(c);
      out.push(c);
    }
    (n as Element).children = out;
  };
  return (tree: HastRoot) => walk(tree as unknown as Root);
}

/** remark-rehype 已经给脚注 id 加过 `user-content-` 前缀，sanitize 又加一次；去掉重复的那层，脚注跳转才对得上。 */
function rehypeFootnoteIds() {
  const fix = (n: Root | Element | ElementContent) => {
    if (n.type === 'element' && typeof n.properties?.id === 'string') n.properties.id = n.properties.id.replace(/^user-content-user-content-/, 'user-content-');
    if ('children' in n) n.children.forEach((c) => fix(c as Element));
  };
  return (tree: HastRoot) => fix(tree as unknown as Root);
}

function processorFor(opts: RenderOptions) {
  return unified()
    .use(remarkRehype, { allowDangerousHtml: true, handlers: handlers(opts), footnoteLabel: '脚注', footnoteBackLabel: '回到正文' })
    .use(rehypeRaw)
    .use(rehypeSanitize, schema)
    .use(rehypeFootnoteIds)
    // 关联图块（```vein-graph）换成图：在白名单之后，图由 veinGraph.ts 只用数字与文本生成
    .use(rehypeVeinGraph)
    .use(opts.breaks ? rehypeSoftBreaks : () => undefined)
    .use(rehypeKatex, { strict: 'ignore' })
    .use(rehypeLiteHighlight);
}

const defaultProcessor = processorFor({});
const cache = new WeakMap<RenderOptions, ReturnType<typeof processorFor>>();

export function renderNodes(
  nodes: readonly RootContent[],
  opts: RenderOptions = {},
): { hast: HastRoot; diagnostics: Diagnostic[] } {
  // 深拷贝：资源地址改写不能污染解析结果（同一份 NoteDocument 会被多次渲染）
  const root: Root = { type: 'root', children: structuredClone(nodes as RootContent[]) };
  // 块里引用了哪些脚注，就把那几条定义补进来；remark-rehype 会在块末尾生成脚注列表
  if (opts.footnotes?.length) {
    const used = new Set<string>();
    const scan = (n: Nodes) => {
      if (n.type === 'footnoteReference') used.add(n.identifier);
      if ('children' in n) n.children.forEach((c) => scan(c as Nodes));
    };
    root.children.forEach((c) => scan(c as Nodes));
    for (const d of opts.footnotes) if (used.has(d.identifier)) root.children.push(structuredClone(d));
  }
  if (opts.assetUrl) rewriteAssets(root, opts.assetUrl);

  let processor = defaultProcessor;
  if (opts.wikiHref || opts.embedUrl || opts.breaks) {
    processor = cache.get(opts) ?? processorFor(opts);
    cache.set(opts, processor);
  }
  const file = new VFile();
  const hast = processor.runSync(root, file) as HastRoot;
  const diagnostics: Diagnostic[] = file.messages.map((m) => ({
    severity: 'error',
    code: 'math-render',
    message: `${m.reason}${m.cause instanceof Error ? `：${m.cause.message}` : ''}`,
    ...(m.line ? { line: m.line } : {}),
  }));
  return { hast, diagnostics };
}

function rewriteAssets(n: Nodes, assetUrl: (src: string) => string): void {
  if (n.type === 'image' && !/^[a-z][a-z0-9+.-]*:/i.test(n.url)) n.url = assetUrl(n.url);
  if ('children' in n) for (const c of n.children) rewriteAssets(c as Nodes, assetUrl);
}
