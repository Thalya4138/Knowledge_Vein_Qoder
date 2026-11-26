import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toHtml } from 'hast-util-to-html';
import type { PhrasingContent, RootContent } from 'mdast';
import { parseNote, plainText } from '../content/parseNote';
import { renderNodes, type RenderOptions } from '../content/render';
import type { CalloutBlock, HeadingBlock, NoteBlock } from '../content/types';
import { BlockEditor } from './BlockEditor';
import { AnnotationLayer } from './AnnotationLayer';
import { paintMarks, type Annotation } from './annotations';
import { OB_CALLOUT } from '../content/obsidian';
import { buildDrawerModel, type Manifest } from './resources';
import { ResourceDrawer } from './ResourceDrawer';
import 'katex/dist/katex.min.css';
import '../styles/reader.css';

const NL = String.fromCharCode(10);

/** 教材栏目的圆形标志（样张 .icon） */
const ICON: Record<string, string> = { problem: '?', training: '✎', discuss: '?', practice: '⚗', method: '◆', critical: '!' };

/** 「思维训练 · 辨析一种推导」→ ['思维训练', '辨析一种推导'] */
function splitTitle(t: string): [string, string] {
  const m = /^(.+?)\s*[·・　]\s*(.+)$/.exec(t.trim());
  return m ? [m[1]!, m[2]!] : [t.trim(), ''];
}

/** 资源卡色标：卡片标题写「视频」「PDF」「网页」「课程」「书」 */
const KIND_CLASS: Record<string, string> = { 视频: 'video', 课程: 'video-course', PDF: 'pdf', pdf: 'pdf', 网页: 'web', 书: 'pdf', 论文: 'pdf' };

/** 卡片正文里的第一个链接 */
function findLink(nodes: readonly RootContent[]): { url: string; text: string } | null {
  for (const n of nodes) {
    if (n.type === 'link') return { url: n.url, text: plainText(n.children as RootContent[]) };
    if ('children' in n) {
      const hit = findLink(n.children as RootContent[]);
      if (hit) return hit;
    }
  }
  return null;
}

/** 图注、表名开头的编号加上样张的三角与蓝色：「▲ 图 2-1」「▼ 表 2-1」 */
function numbered(html: string, mark: '▲' | '▼'): string {
  return html.replace(/^((?:\s*<[^>]+>)*\s*)((?:图|表)\s*[0-9]+(?:[-–][0-9]+)?)/, `$1<span class="nr-fig-no">${mark} $2</span>`);
}

/**
 * 阅读器（T1-2 / T1-3）：T1-1 解析器 → 主栏+旁栏二维版式。
 * 结构（行、锚点、对齐）全部来自 parseNote；块内容经 renderNodes → hast → HTML 字符串
 * （已 sanitize，KaTeX 在 sanitize 之后生成）。hast→DOM 用 hast-util-to-html（已有依赖），
 * 不引入 rehype-react。
 *
 * - 资源卡 → 左侧抽屉（两层，ADR-0007）；?open=<spanId> 直接打开某条资源
 * - 标题悬停出现 §，点击复制带锚点的链接；带 #hash 打开时跳到对应位置并短暂高亮
 * - 窄屏旁栏退化为主栏后的内联卡片（reader.css）
 */
export function NoteReader({
  source,
  manifest,
  resourceBase,
  assetUrl,
  embedUrl,
  wikiHref,
  runningHead,
  editable = false,
  onSourceChange,
  annotations,
  onAnnotationsChange,
  headingLinks,
}: {
  source: string;
  manifest?: Manifest;
  /** 资源本地副本的 URL 前缀（如 /demo/linear-algebra） */
  resourceBase?: string;
  assetUrl?: (src: string) => string;
  /** Obsidian 的 `![[文件名]]` → 地址 */
  embedUrl?: (target: string) => string | undefined;
  /** `[[讲义]]` → 地址；不传时双链显示为未落地 */
  wikiHref?: (target: string) => string | undefined;
  /** 书眉（样张 .running-head）；不传时读 frontmatter 的 running 字段 */
  runningHead?: string;
  /** 编辑模式：点一段就地改这一段的 Markdown（块级编辑，PRODUCT_SPEC §3.7） */
  editable?: boolean;
  onSourceChange?: (next: string) => void;
  /** 叠加层；不传就不开批注 */
  annotations?: Annotation[];
  onAnnotationsChange?: (next: Annotation[]) => void;
  /** 标题 slug → 去别的板块（如「在导图里看」）；由外面按 graph.json 的 noteAnchor 算好 */
  headingLinks?: Map<string, { label: string; href: string; hint: string }>;
}) {
  const doc = useMemo(() => parseNote(source), [source]);
  const [params, setParams] = useSearchParams();
  const [copied, setCopied] = useState<{ slug: string; ok: boolean } | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const copyTimer = useRef<number | undefined>(undefined);

  const renderOpts: RenderOptions = useMemo(
    () => ({ ...(assetUrl ? { assetUrl } : {}), ...(embedUrl ? { embedUrl } : {}), ...(wikiHref ? { wikiHref } : {}), footnotes: doc.footnotes }),
    [assetUrl, embedUrl, wikiHref, doc],
  );
  const paperRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  /** 正在编辑的块（按起始行号认，重新解析后块 id 会变，行号不会） */
  const [editAt, setEditAt] = useState<number | null>(null);
  /** 在某一行之后插入新段落 */
  const [insertAfter, setInsertAfter] = useState<number | null>(null);
  const [lost, setLost] = useState<string[]>([]);

  useEffect(() => {
    if (!editable) {
      setEditAt(null);
      setInsertAfter(null);
    }
  }, [editable]);

  // 叠加层：每次讲义或批注变化后重画（先清掉旧的再画，渲染器产出的 DOM 不变）
  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet || !annotations) return;
    const miss = paintMarks(sheet, annotations);
    setLost((prev) => (prev.join() === miss.join() ? prev : miss));
  }, [doc, annotations, editAt, insertAfter, editable]);

  const lines = useMemo(() => source.split(NL), [source]);
  const replaceLines = (start: number, end: number, text: string) => {
    const next = [...lines];
    const body = text.replace(/\s+$/, '');
    if (body.trim()) next.splice(start - 1, end - start + 1, ...body.split(NL));
    else {
      // 空着保存 = 删掉这一段，连同后面多出来的一个空行
      next.splice(start - 1, end - start + 1);
      if (next[start - 1] === '' && (start === 1 || next[start - 2] === '')) next.splice(start - 1, 1);
    }
    onSourceChange?.(next.join(NL));
  };
  const insertLines = (after: number, text: string) => {
    const body = text.replace(/\s+$/, '');
    if (!body.trim()) return;
    const next = [...lines];
    next.splice(after, 0, '', ...body.split(NL));
    onSourceChange?.(next.join(NL));
  };
  const htmlOf = useCallback(
    (nodes: readonly RootContent[]) => toHtml(renderNodes(nodes, renderOpts).hast),
    [renderOpts],
  );
  // 栏目里单个换行就是换行：(1)(2)(3) 小题、A–D 选项一行一个，与样张、Obsidian 一致
  const calloutOpts = useMemo(() => ({ ...renderOpts, breaks: true }), [renderOpts]);
  const calloutHtml = useCallback((nodes: readonly RootContent[]) => toHtml(renderNodes(nodes, calloutOpts).hast), [calloutOpts]);
  const inlineOf = useCallback(
    (nodes: readonly PhrasingContent[]) => htmlOf([{ type: 'paragraph', children: [...nodes] }]),
    [htmlOf],
  );

  const models = useMemo(() => {
    if (!manifest) return new Map<string, ReturnType<typeof buildDrawerModel>>();
    return new Map(manifest.spans.map((s) => [s.id, buildDrawerModel(s.id, manifest, resourceBase)]));
  }, [manifest, resourceBase]);

  const openId = params.get('open');
  const openModel = openId ? models.get(openId) : undefined;

  const closeDrawer = useCallback(() => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('open');
        return next;
      },
      { replace: true },
    );
    triggerRef.current?.focus();
  }, [setParams]);

  const openSpan = (spanId: string, el: HTMLElement) => {
    triggerRef.current = el;
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('open', spanId);
        return next;
      },
      { replace: true },
    );
  };

  // T1-3：带锚点打开 / hash 变化时定位并短暂高亮
  useEffect(() => {
    const jump = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      const el = document.getElementById(id);
      if (!el) return;
      const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' });
      el.classList.add('nr-flash');
      window.setTimeout(() => el.classList.remove('nr-flash'), 2400);
    };
    const t = window.setTimeout(jump, 60);
    window.addEventListener('hashchange', jump);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('hashchange', jump);
    };
  }, [source]);

  const copyAnchor = async (slug: string) => {
    const url = new URL(window.location.href);
    url.hash = slug;
    const text = url.toString();
    let ok = false;
    if (navigator.clipboard?.writeText) {
      let timeout = 0;
      try {
        await Promise.race([
          navigator.clipboard.writeText(text),
          new Promise<never>((_, reject) => {
            timeout = window.setTimeout(() => reject(new Error('clipboard timeout')), 800);
          }),
        ]);
        ok = true;
      } catch {
        // 继续走 textarea 降级；部分嵌入式浏览器会让 Clipboard Promise 一直等待。
      } finally {
        window.clearTimeout(timeout);
      }
    }
    if (!ok) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      } finally {
        ta.remove();
      }
    }
    window.clearTimeout(copyTimer.current);
    setCopied({ slug, ok });
    copyTimer.current = window.setTimeout(() => setCopied(null), 1600);
  };

  const heading = (b: HeadingBlock) => {
    const Tag = `h${b.depth}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
    // 节标题照教材排两行：「第 1 节」一行，节名一行
    const sec = b.depth === 1 ? /^(第\s*[0-9一二三四五六七八九十]+\s*节)[\s　]+(.+)$/.exec(b.text) : null;
    return (
      <Tag key={b.id} id={b.slug} className={`nr-h nr-h${b.depth}`}>
        {sec ? (
          <span>
            <span className="nr-secno">{sec[1]!.replace(/第\s*(\S+?)\s*节/, '第 $1 节')}</span>
            {sec[2]}
          </span>
        ) : (
          <span dangerouslySetInnerHTML={{ __html: inlineOf(b.children) }} />
        )}
        <button
          type="button"
          className="nr-anchor"
          title={
            copied?.slug === b.slug
              ? copied.ok
                ? '已复制'
                : '复制失败，请手动复制地址栏链接'
              : '复制本节的锚点链接'
          }
          aria-label={`复制「${b.text}」的锚点链接`}
          onClick={() => void copyAnchor(b.slug)}
        >
          {copied?.slug === b.slug ? (copied.ok ? '已复制' : '复制失败') : '§'}
        </button>
        {headingLinks?.get(b.slug) && (
          <Link className="nr-golink" to={headingLinks.get(b.slug)!.href} title={headingLinks.get(b.slug)!.hint} viewTransition>
            {headingLinks.get(b.slug)!.label}
          </Link>
        )}
      </Tag>
    );
  };

  const resourceCard = (b: CalloutBlock) => {
    const model = b.spanId ? models.get(b.spanId) : undefined;
    if (!model) {
      // 清单里没有：卡片正文里写了链接，就按样张的资源卡画出来（模型生成的讲义、示例都用这种写法）
      const link = findLink(b.body);
      if (link) {
        const kind = b.titleText.trim() || '资源';
        const loc = plainText(b.body).replace(link.text, '').trim();
        return (
          <a key={b.id} id={b.id} className="nr-res" href={link.url} target="_blank" rel="noreferrer">
            <span className={`nr-res-kind kind-${KIND_CLASS[kind] ?? 'web'}`}>{kind}</span>
            <span className="nr-res-title">{link.text}</span>
            {loc && <span className="nr-res-loc">{loc}</span>}
          </a>
        );
      }
      return (
        <div key={b.id} id={b.id} className="nr-res missing">
          <span className="nr-res-title">资源片段 {b.spanId ?? '（缺 span id）'}</span>
          <span className="nr-res-loc">资源清单里没有这条记录，待核对</span>
        </div>
      );
    }
    return (
      <button
        key={b.id}
        id={b.id}
        type="button"
        className="nr-res"
        aria-haspopup="dialog"
        onClick={(e) => openSpan(model.spanId, e.currentTarget)}
      >
        <span className={`nr-res-kind kind-${model.kind}`}>{model.kindLabel}</span>
        <span className="nr-res-title">{model.title}</span>
        <span className="nr-res-loc">{model.loc}</span>
      </button>
    );
  };

  const callout = (b: CalloutBlock) => {
    if (b.kind === 'res') return resourceCard(b);
    let bodyHtml = calloutHtml(b.body);
    // 练习与应用：「二、拓展应用」从第二栏开始（教材两栏排）
    if (b.kind === 'exercise' && b.fold === 'none') bodyHtml = bodyHtml.replace(/<p><strong>(二、)/, '<p class="nr-col-break"><strong>$1');
    const body = <div className="nr-co-body" dangerouslySetInnerHTML={{ __html: bodyHtml }} />;
    // Obsidian 自带类型：按家族着色；没写标题时用类型的中文名（Obsidian 也会显示类型名）
    const ob = !b.known ? OB_CALLOUT[b.kind] : undefined;
    const cls = ob ? `nr-co nr-ob ob-${ob.family}` : `nr-co nr-${b.kind}`;
    const title = b.titleText || b.title.length > 0 || ob;
    const capHtml = b.titleText || b.title.length > 0 ? inlineOf(b.title) : '';
    const cap = capHtml ? <span dangerouslySetInnerHTML={{ __html: capHtml }} /> : ob ? <span>{ob.label}</span> : null;

    if (b.kind === 'figure') {
      return (
        <figure key={b.id} id={b.id} className="nr-fig">
          {body}
          {title && <figcaption className="nr-fig-cap" dangerouslySetInnerHTML={{ __html: numbered(capHtml, '▲') }} />}
        </figure>
      );
    }
    if (b.fold !== 'none' || b.kind === 'link') {
      return (
        <details key={b.id} id={b.id} className={cls} open={b.fold !== 'closed'}>
          <summary>{cap ?? b.kind}</summary>
          {body}
        </details>
      );
    }
    if (b.kind === 'table') {
      return (
        <section key={b.id} id={b.id} className={cls}>
          {title && <header className="nr-co-head" dangerouslySetInnerHTML={{ __html: numbered(capHtml, '▼') }} />}
          {body}
        </section>
      );
    }
    if (b.kind === 'exercise') {
      return (
        <section key={b.id} id={b.id} className={cls}>
          <header className="nr-practice-head">
            <span>{b.titleText || '练习与应用'}</span>
          </header>
          {body}
        </section>
      );
    }
    // 教材栏目：标志 + 栏目名；「思维训练 · 辨析一种推导」后半句是居中的小标题
    const icon = ICON[b.kind];
    if (icon) {
      const [label, sub] = splitTitle(b.titleText);
      return (
        <section key={b.id} id={b.id} className={cls}>
          <header className="nr-co-head">
            <span className="nr-icon" aria-hidden="true">{icon}</span>
            {label}
          </header>
          {sub && <p className="nr-co-sub">{sub}</p>}
          {body}
        </section>
      );
    }
    return (
      <section key={b.id} id={b.id} className={cls}>
        {title && <header className="nr-co-head">{cap}</header>}
        {body}
      </section>
    );
  };

  const view = (b: NoteBlock) => {
    if (b.type === 'heading') return heading(b);
    if (b.type === 'callout') return callout(b);
    // 推理中途单独成段的问句，照教材用楷体（样张 p.ask）
    const only = b.nodes.length === 1 && b.nodes[0]!.type === 'paragraph' ? plainText(b.nodes).trim() : '';
    const ask = only && only.length <= 90 && /[？?]$/.test(only) && !only.includes('$$');
    return <div key={b.id} id={b.id} className={ask ? 'nr-blk nr-ask' : 'nr-blk'} dangerouslySetInnerHTML={{ __html: htmlOf(b.nodes) }} />;
  };

  const newPara = (after: number) =>
    insertAfter === after ? (
      <BlockEditor
        key={`ins-${after}`}
        initial=""
        onCommit={(t) => {
          setInsertAfter(null);
          insertLines(after, t);
        }}
        onCancel={() => setInsertAfter(null)}
      />
    ) : null;

  const block = (id: string) => {
    const b = doc.blockById.get(id);
    if (!b) return null;
    if (!editable) return view(b);
    const { start, end } = b.lines;
    if (editAt === start) {
      return (
        <BlockEditor
          key={`ed-${start}`}
          initial={lines.slice(start - 1, end).join(NL)}
          onCommit={(t) => {
            setEditAt(null);
            if (t !== lines.slice(start - 1, end).join(NL)) replaceLines(start, end, t);
          }}
          onCancel={() => setEditAt(null)}
        />
      );
    }
    return (
      <div key={b.id} className="nr-editable">
        <div
          className="nr-edit-hit"
          role="button"
          tabIndex={0}
          title="点击修改这一段"
          onClickCapture={(e) => {
            // 编辑模式下点链接、按钮也是「改这一段」，不跳走
            e.preventDefault();
            e.stopPropagation();
            setInsertAfter(null);
            setEditAt(start);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              setEditAt(start);
            }
          }}
        >
          {view(b)}
        </div>
        <button type="button" className="nr-insert" title="在下面加一段" onClick={() => { setEditAt(null); setInsertAfter(end); }}>
          +
        </button>
        {newPara(end)}
      </div>
    );
  };

  return (
    <div className={editable ? 'nr-paper editing' : 'nr-paper'} ref={paperRef}>
      {annotations && onAnnotationsChange && !editable && (
        <AnnotationLayer sheetRef={sheetRef} paperRef={paperRef} items={annotations} lost={lost} onChange={onAnnotationsChange} />
      )}
      <div className="nr-sheet" ref={sheetRef}>
        {(runningHead ?? doc.frontmatter.running) && <p className="nr-running">{runningHead ?? doc.frontmatter.running}</p>}
        {editable && doc.blocks.length === 0 && (
          <button type="button" className="nr-insert-first" onClick={() => setInsertAfter(lines.length)}>
            从这里开始写
          </button>
        )}
        {editable && doc.blocks.length === 0 && newPara(lines.length)}
        {doc.rows.map((row, i) => (
          <div className={row.side.length ? 'nr-row has-side' : 'nr-row'} key={i}>
            {row.side.length > 0 && <aside className="nr-side">{row.side.map(block)}</aside>}
            <div className="nr-main">{row.main.map(block)}</div>
          </div>
        ))}
      </div>
      {openModel && <ResourceDrawer model={openModel} onClose={closeDrawer} />}
    </div>
  );
}
