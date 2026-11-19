/**
 * 块内容 → hast（HTML 语法树）。阅读器拿 hast 转 React 元素（T1-2）；测试拿它转 HTML 字符串。
 *
 * 管线顺序有讲究：
 *   remark-rehype（保留原生 HTML）→ rehype-raw（解析它）→ rehype-sanitize（白名单）→ rehype-katex
 * KaTeX 必须在 sanitize **之后**，否则它生成的大量 class/style 会被白名单剥掉；
 * 反过来，sanitize 必须在 raw 之后，否则 `<details>` 之外的任意 HTML（含 LLM 生成的）会原样进 DOM。
 */
import type { Element, Root as HastRoot } from 'hast';
import type { Nodes, Root, RootContent } from 'mdast';
import { unified } from 'unified';
import remarkRehype, { type Options as RemarkRehypeOptions } from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema, type Options as SanitizeSchema } from 'rehype-sanitize';
import rehypeKatex from 'rehype-katex';
import { VFile } from 'vfile';
import type { Diagnostic } from './types';
import type { WikiLink } from './wikiLink';

export interface RenderOptions {
  /** wiki link 目标 → 链接地址；返回 undefined 表示没落地，渲染成带 `unresolved` 的 span。 */
  wikiHref?: (target: string) => string | undefined;
  /** 图片相对路径（如 `figures/2-1.svg`）→ 实际可加载的地址。 */
  assetUrl?: (src: string) => string;
}

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
  protocols: {
    ...defaultSchema.protocols,
    src: [...(defaultSchema.protocols?.src ?? []), 'blob'],
  },
  attributes: {
    ...defaultSchema.attributes,
    code: allowClasses('code', 'math-inline', 'math-display'),
    a: [...allowClasses('a', 'wikilink'), 'dataTarget'],
    span: [...allowClasses('span', 'wikilink', 'unresolved'), 'dataTarget'],
  },
};

const handlers = (opts: RenderOptions): RemarkRehypeOptions['handlers'] => ({
  wikiLink(_state, node: WikiLink): Element {
    const { target, alias } = node.data;
    const href = opts.wikiHref?.(target);
    const text = [{ type: 'text' as const, value: alias ?? target }];
    return href
      ? { type: 'element', tagName: 'a', properties: { href, className: ['wikilink'], dataTarget: target }, children: text }
      : { type: 'element', tagName: 'span', properties: { className: ['wikilink', 'unresolved'], dataTarget: target }, children: text };
  },
});

function processorFor(opts: RenderOptions) {
  return unified()
    .use(remarkRehype, { allowDangerousHtml: true, handlers: handlers(opts) })
    .use(rehypeRaw)
    .use(rehypeSanitize, schema)
    .use(rehypeKatex, { strict: 'ignore' });
}

const defaultProcessor = processorFor({});

export function renderNodes(
  nodes: readonly RootContent[],
  opts: RenderOptions = {},
): { hast: HastRoot; diagnostics: Diagnostic[] } {
  // 深拷贝：资源地址改写不能污染解析结果（同一份 NoteDocument 会被多次渲染）
  const root: Root = { type: 'root', children: structuredClone(nodes as RootContent[]) };
  if (opts.assetUrl) rewriteAssets(root, opts.assetUrl);

  const processor = opts.wikiHref ? processorFor(opts) : defaultProcessor;
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
