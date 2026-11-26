import { useEffect, useState, type RefObject } from 'react';
import { ANN_LABEL, NEEDS_TEXT, linearize, newId, quoteAt, rangeOffsets, type AnnKind, type Annotation } from './annotations';

/**
 * 叠加层的交互：选中文字 → 选一种笔；点已有的标记 → 改字、换笔、删除；右上角「批注」列出全部（含失去锚点的）。
 * 只管交互；画到讲义上由 annotations.ts 的 paintMarks 负责。
 */

const KINDS: AnnKind[] = ['mark', 'pen', 'fade', 'fix', 'check', 'note'];

const PEN_HINT: Record<AnnKind, string> = {
  mark: '藤黄：要记住的',
  pen: '花青：关键句、结构',
  fade: '先略过，读的时候变淡',
  fix: '朱砂：删掉，写上应为什么',
  check: '石绿：核对过原文、掌握了',
  note: '写一句自己的话',
};

type Pop =
  | { kind: 'new'; x: number; y: number; start: number; end: number; pick?: AnnKind; text: string }
  | { kind: 'edit'; x: number; y: number; id: string; text: string };

export function AnnotationLayer({
  sheetRef,
  paperRef,
  items,
  lost,
  onChange,
}: {
  sheetRef: RefObject<HTMLElement | null>;
  paperRef: RefObject<HTMLElement | null>;
  items: Annotation[];
  lost: string[];
  onChange: (next: Annotation[]) => void;
}) {
  const [pop, setPop] = useState<Pop | null>(null);
  const [listOpen, setListOpen] = useState(false);

  // 选中文字 → 工具条；点标记 → 编辑卡
  useEffect(() => {
    const sheet = sheetRef.current;
    const paper = paperRef.current;
    if (!sheet || !paper) return;
    const at = (r: DOMRect) => {
      const p = paper.getBoundingClientRect();
      return { x: r.left - p.left + r.width / 2, y: r.top - p.top };
    };
    const onUp = (e: MouseEvent) => {
      if ((e.target as Element).closest('.ann-pop, .nr-editor')) return;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.rangeCount) {
        const range = sel.getRangeAt(0);
        if (!sheet.contains(range.commonAncestorContainer)) return;
        const off = rangeOffsets(sheet, range);
        if (!off) return;
        setPop({ kind: 'new', ...at(range.getBoundingClientRect()), ...off, text: '' });
        return;
      }
      const hit = (e.target as Element).closest('[data-ann]') as HTMLElement | null;
      if (hit && sheet.contains(hit)) {
        const a = items.find((x) => x.id === hit.dataset.ann);
        if (a) setPop({ kind: 'edit', ...at(hit.getBoundingClientRect()), id: a.id, text: a.text ?? '' });
        return;
      }
      setPop(null);
    };
    sheet.addEventListener('mouseup', onUp);
    return () => sheet.removeEventListener('mouseup', onUp);
  }, [sheetRef, paperRef, items]);

  const create = (kind: AnnKind, text = '') => {
    if (pop?.kind !== 'new' || !sheetRef.current) return;
    if (NEEDS_TEXT.has(kind) && !text.trim()) {
      setPop({ ...pop, pick: kind });
      return;
    }
    const full = linearize(sheetRef.current).text;
    const a: Annotation = { id: newId(), kind, quote: quoteAt(full, pop.start, pop.end), at: Date.now(), ...(text.trim() ? { text: text.trim() } : {}) };
    onChange([...items, a]);
    window.getSelection()?.removeAllRanges();
    setPop(null);
  };

  const update = (id: string, patch: Partial<Annotation>) => onChange(items.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const remove = (id: string) => {
    onChange(items.filter((a) => a.id !== id));
    setPop(null);
  };

  const jump = (id: string) => {
    const el = sheetRef.current?.querySelector(`[data-ann="${id}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el?.classList.add('ann-flash');
    window.setTimeout(() => el?.classList.remove('ann-flash'), 1600);
  };

  const editing = pop?.kind === 'edit' ? items.find((a) => a.id === pop.id) : undefined;

  return (
    <>
      <div className="ann-bar">
        <button type="button" className="ann-count" aria-expanded={listOpen} onClick={() => setListOpen((v) => !v)} title="这份讲义上的全部批注">
          批注 {items.length}
          {lost.length > 0 && <span className="ann-lost-dot" title={`${lost.length} 条失去锚点`} />}
        </button>
        {items.length === 0 && <span className="ann-tip">选中一段文字即可标注</span>}
      </div>

      {listOpen && (
        <aside className="ann-list" aria-label="批注列表">
          {items.length === 0 && <p className="ann-empty">还没有批注。选中讲义里的文字，就能荧光、划线、批改或写便签。</p>}
          {lost.length > 0 && (
            <p className="ann-lost-note">
              {lost.length} 条批注找不到原文（原文改动过）。它们保留在这里，可以删掉或照着重新标一次。
            </p>
          )}
          <ol>
            {items.map((a) => (
              <li key={a.id} className={lost.includes(a.id) ? 'lost' : undefined}>
                <span className={`ann-chip chip-${a.kind}`}>{ANN_LABEL[a.kind]}</span>
                <button type="button" className="ann-quote" onClick={() => jump(a.id)} disabled={lost.includes(a.id)}>
                  {a.quote.exact.length > 40 ? `${a.quote.exact.slice(0, 40)}…` : a.quote.exact}
                </button>
                {a.text && <p className="ann-text">{a.kind === 'fix' ? `应为 ${a.text}` : a.text}</p>}
                {lost.includes(a.id) && <span className="ann-lost">失去锚点</span>}
                <button type="button" className="ann-del" onClick={() => remove(a.id)} aria-label="删除这条批注">
                  删除
                </button>
              </li>
            ))}
          </ol>
        </aside>
      )}

      {pop && (
        <div className="ann-pop" style={{ left: pop.x, top: pop.y }} role="dialog" aria-label={pop.kind === 'new' ? '标注' : '编辑批注'}>
          {pop.kind === 'new' && !pop.pick && (
            <div className="ann-pens">
              {KINDS.map((k) => (
                <button key={k} type="button" className={`ann-pen pen-${k}`} title={PEN_HINT[k]} onMouseDown={(e) => e.preventDefault()} onClick={() => create(k)}>
                  {ANN_LABEL[k]}
                </button>
              ))}
            </div>
          )}
          {pop.kind === 'new' && pop.pick && (
            <form
              className="ann-form"
              onSubmit={(e) => {
                e.preventDefault();
                create(pop.pick!, pop.text);
              }}
            >
              <input
                autoFocus
                value={pop.text}
                placeholder={pop.pick === 'fix' ? '应为……' : '写一句自己的话'}
                onChange={(e) => setPop({ ...pop, text: e.target.value })}
              />
              <button type="submit" className="ann-pen" disabled={!pop.text.trim()}>
                {pop.pick === 'fix' ? '批改' : '贴上'}
              </button>
            </form>
          )}
          {pop.kind === 'edit' && editing && (
            <div className="ann-form-col">
              <div className="ann-pens">
                {KINDS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    className={`ann-pen pen-${k}`}
                    aria-pressed={editing.kind === k}
                    title={PEN_HINT[k]}
                    onClick={() => update(editing.id, { kind: k })}
                  >
                    {ANN_LABEL[k]}
                  </button>
                ))}
              </div>
              {NEEDS_TEXT.has(editing.kind) && (
                <input
                  value={pop.text}
                  placeholder={editing.kind === 'fix' ? '应为……' : '写一句自己的话'}
                  onChange={(e) => setPop({ ...pop, text: e.target.value })}
                  onBlur={() => update(editing.id, { text: pop.text.trim() || undefined })}
                  onKeyDown={(e) => e.key === 'Enter' && update(editing.id, { text: pop.text.trim() || undefined })}
                />
              )}
              <div className="ann-actions">
                <button type="button" className="ann-del" onClick={() => remove(editing.id)}>
                  删除批注
                </button>
                <button type="button" className="ann-pen" onClick={() => setPop(null)}>
                  完成
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
