import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../ui/Icon';
import type { DrawerModel } from './resources';

/**
 * 资源抽屉：左侧滑出，两层交互——抽屉内看引文与 PDF 预览，按钮深链到详情。
 * 视频不内嵌播放器（ADR-0007）。×、点遮罩、Esc 关闭；关闭后焦点回到触发卡片。
 */
export function ResourceDrawer({ model, onClose }: { model: DrawerModel; onClose: () => void }) {
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = drawerRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])',
      );
      if (!items?.length) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 挂到 body：.main 的 z-index:1 堆叠上下文会把抽屉压到页眉（z300）之下，顶部被盖住
  return createPortal(
    <>
      <div className="nr-scrim" onClick={onClose} aria-hidden="true" />
      <aside ref={drawerRef} className="nr-drawer" role="dialog" aria-modal="true" aria-label={`资源：${model.title}`}>
        <button ref={closeRef} type="button" className="nr-drawer-close" onClick={onClose} aria-label="关闭资源抽屉">
          <Icon name="close" />
        </button>
        <span className={`nr-res-kind kind-${model.kind}`}>{model.kindLabel}</span>
        <p className="nr-d-title">{model.title}</p>
        {model.meta && <p className="nr-d-meta">{model.meta}</p>}

        <section className="nr-d-sec">
          <h3>定位</h3>
          <p className={model.unavailable ? 'nr-d-loc pending' : 'nr-d-loc'}>{model.loc}</p>
        </section>

        <section className="nr-d-sec">
          <h3>原文片段</h3>
          <blockquote className="nr-d-quote">
            {model.quote.map((p, i) => (
              <p key={i}>
                {p.ts && <span className="nr-d-ts">{p.ts}</span>}
                {p.mark ? <mark>{p.text}</mark> : p.text}
              </p>
            ))}
          </blockquote>
        </section>

        {model.why && (
          <section className="nr-d-sec">
            <h3>为什么链到这里</h3>
            <p className="nr-d-why">{model.why}</p>
          </section>
        )}

        {model.actions.length > 0 && (
          <section className="nr-d-sec nr-d-actions">
            {model.actions.map((a) => (
              <a key={a.href} className={a.primary ? 'nr-d-act primary' : 'nr-d-act'} href={a.href} target="_blank" rel="noreferrer">
                {a.label}
              </a>
            ))}
          </section>
        )}

        {model.pdfPreview && (
          <section className="nr-d-sec">
            <h3>原文预览</h3>
            <iframe className="nr-d-frame" src={model.pdfPreview} title={`${model.title} ${model.loc}预览`} />
          </section>
        )}
      </aside>
    </>,
    document.body,
  );
}
