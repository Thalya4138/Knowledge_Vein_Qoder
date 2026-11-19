import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toHtml } from 'hast-util-to-html';
import type { PhrasingContent, RootContent } from 'mdast';
import { parseNote } from '../content/parseNote';
import { renderNodes, type RenderOptions } from '../content/render';
import type { CalloutBlock, HeadingBlock } from '../content/types';
import { buildDrawerModel, type Manifest } from './resources';
import { ResourceDrawer } from './ResourceDrawer';
import 'katex/dist/katex.min.css';
import '../styles/reader.css';

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
}: {
  source: string;
  manifest?: Manifest;
  /** 资源本地副本的 URL 前缀（如 /demo/linear-algebra） */
  resourceBase?: string;
  assetUrl?: (src: string) => string;
}) {
  const doc = useMemo(() => parseNote(source), [source]);
  const [params, setParams] = useSearchParams();
  const [copied, setCopied] = useState<{ slug: string; ok: boolean } | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const copyTimer = useRef<number | undefined>(undefined);

  const renderOpts: RenderOptions = useMemo(() => (assetUrl ? { assetUrl } : {}), [assetUrl]);
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
    const title = b.titleText || b.title.length > 0;
    const cap = title ? <span dangerouslySetInnerHTML={{ __html: inlineOf(b.title) }} /> : null;

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
        <details key={b.id} id={b.id} className={`nr-co nr-${b.kind}`} open={b.fold !== 'closed'}>
          <summary>{cap ?? b.kind}</summary>
          {body}
        </details>
      );
    }
    return (
      <section key={b.id} id={b.id} className={`nr-co nr-${b.kind}`}>
        {title && <header className="nr-co-head">{cap}</header>}
        {body}
      </section>
    );
  };

  const block = (id: string) => {
    const b = doc.blockById.get(id);
    if (!b) return null;
    if (b.type === 'heading') return heading(b);
    if (b.type === 'callout') return callout(b);
    return <div key={b.id} id={b.id} className="nr-blk" dangerouslySetInnerHTML={{ __html: htmlOf(b.nodes) }} />;
  };

  return (
    <div className="nr-paper">
      <div className="nr-sheet">
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
