import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toHtml } from 'hast-util-to-html';
import type { PhrasingContent, RootContent } from 'mdast';
import { parseNote } from '../content/parseNote';
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
  editable = false,
  onSourceChange,
  annotations,
  onAnnotationsChange,
}: {
  source: string;
  manifest?: Manifest;
  /** 资源本地副本的 URL 前缀（如 /demo/linear-algebra） */
  resourceBase?: string;
  assetUrl?: (src: string) => string;
  /** Obsidian 的 `![[文件名]]` → 地址 */
  embedUrl?: (target: string) => string | undefined;
  /** 编辑模式：点一段就地改这一段的 Markdown（块级编辑，PRODUCT_SPEC §3.7） */
  editable?: boolean;
  onSourceChange?: (next: string) => void;
  /** 叠加层；不传就不开批注 */
  annotations?: Annotation[];
  onAnnotationsChange?: (next: Annotation[]) => void;
}) {
  const doc = useMemo(() => parseNote(source), [source]);
  const [params, setParams] = useSearchParams();
  const [copied, setCopied] = useState<{ slug: string; ok: boolean } | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const copyTimer = useRef<number | undefined>(undefined);

  const renderOpts: RenderOptions = useMemo(
    () => ({ ...(assetUrl ? { assetUrl } : {}), ...(embedUrl ? { embedUrl } : {}), footnotes: doc.footnotes }),
    [assetUrl, embedUrl, doc],
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
    return (
      <Tag key={b.id} id={b.slug} className={`nr-h nr-h${b.depth}`}>
        <span dangerouslySetInnerHTML={{ __html: inlineOf(b.children) }} />
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
      </Tag>
    );
  };

  const resourceCard = (b: CalloutBlock) => {
    const model = b.spanId ? models.get(b.spanId) : undefined;
    if (!model) {
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
    const body = <div className="nr-co-body" dangerouslySetInnerHTML={{ __html: htmlOf(b.body) }} />;
    // Obsidian 自带类型：按家族着色；没写标题时用类型的中文名（Obsidian 也会显示类型名）
    const ob = !b.known ? OB_CALLOUT[b.kind] : undefined;
    const cls = ob ? `nr-co nr-ob ob-${ob.family}` : `nr-co nr-${b.kind}`;
    const title = b.titleText || b.title.length > 0 || ob;
    const cap = b.titleText || b.title.length > 0 ? <span dangerouslySetInnerHTML={{ __html: inlineOf(b.title) }} /> : ob ? <span>{ob.label}</span> : null;

    if (b.kind === 'figure') {
      return (
        <figure key={b.id} id={b.id} className="nr-fig">
          {body}
          {title && <figcaption className="nr-fig-cap">{cap}</figcaption>}
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
    return <div key={b.id} id={b.id} className="nr-blk" dangerouslySetInnerHTML={{ __html: htmlOf(b.nodes) }} />;
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
