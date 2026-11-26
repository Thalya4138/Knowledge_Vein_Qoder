/**
 * 讲义叠加层（PRODUCT_SPEC §3.7）：荧光、划线、淡化、批改、核对、便签。
 *
 * 不写进 Markdown：存在旁边的 json 里（`.vein/annotations/<讲义路径>.json`），导出到 Obsidian 的讲义保持干净。
 * 锚定用「引文 + 前后文」（W3C Web Annotation 的 TextQuote 思路），不用字符偏移：
 * 原文被编辑后按引文重新找；找不到的标为「失去锚点」，保留在批注列表里，不静默丢弃。
 *
 * 颜色就是 r4 方向样张定下的四种颜料，各管一件事：
 *   藤黄 荧光 —— 要记的；花青 划线 —— 结构、关键句；朱砂 批改 —— 老师的红笔，删掉并写上应为；
 *   石绿 核对 —— 核对过原文、掌握了；另有淡化（先略过）与便签（写一句自己的话）。
 */

export type AnnKind = 'mark' | 'pen' | 'fade' | 'fix' | 'check' | 'note';

export interface Quote {
  exact: string;
  prefix: string;
  suffix: string;
}

export interface Annotation {
  id: string;
  kind: AnnKind;
  quote: Quote;
  /** 批改的「应为」、便签的内容 */
  text?: string;
  at: number;
}

export const ANN_LABEL: Record<AnnKind, string> = {
  mark: '荧光',
  pen: '划线',
  fade: '淡化',
  fix: '批改',
  check: '核对',
  note: '便签',
};

/** 需要再写一句话的类型 */
export const NEEDS_TEXT = new Set<AnnKind>(['fix', 'note']);

const CONTEXT = 32;

/* ---------- 纯字符串：定位 ---------- */

/** 在全文里找引文：多处命中时按前后文吻合的字符数挑最像的那一处。找不到返回 null。 */
export function locate(text: string, q: Quote): { start: number; end: number } | null {
  if (!q.exact) return null;
  let best: { start: number; score: number } | null = null;
  for (let at = text.indexOf(q.exact); at >= 0; at = text.indexOf(q.exact, at + 1)) {
    const before = text.slice(Math.max(0, at - q.prefix.length), at);
    const after = text.slice(at + q.exact.length, at + q.exact.length + q.suffix.length);
    let score = 0;
    for (let i = 1; i <= Math.min(before.length, q.prefix.length) && before.at(-i) === q.prefix.at(-i); i++) score++;
    for (let i = 0; i < Math.min(after.length, q.suffix.length) && after[i] === q.suffix[i]; i++) score++;
    if (!best || score > best.score) best = { start: at, score };
  }
  return best ? { start: best.start, end: best.start + q.exact.length } : null;
}

export function quoteAt(text: string, start: number, end: number): Quote {
  return {
    exact: text.slice(start, end),
    prefix: text.slice(Math.max(0, start - CONTEXT), start),
    suffix: text.slice(end, end + CONTEXT),
  };
}

/* ---------- DOM：把讲义摊成一条文本，再把区间映射回文本节点 ---------- */

/** 不参与「全文」的节点：公式的 MathML 副本、标题旁的 § 按钮、叠加层自己插进去的东西、正在编辑的块 */
const SKIP = '.katex-mathml, .nr-anchor, .ann-extra, .nr-editor, script, style';

interface Seg {
  node: Text;
  start: number;
}

export function linearize(root: HTMLElement): { text: string; segs: Seg[] } {
  const segs: Seg[] = [];
  let text = '';
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => ((n.parentElement?.closest(SKIP) ?? null) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    segs.push({ node: n, start: text.length });
    text += n.data;
  }
  return { text, segs };
}

/** 选区 → 全文里的起止偏移；选区不在讲义里、或什么也没选，返回 null。 */
export function rangeOffsets(root: HTMLElement, range: Range): { start: number; end: number } | null {
  const { segs } = linearize(root);
  const pos = (node: Node, offset: number): number | null => {
    if (node.nodeType === Node.TEXT_NODE) {
      const s = segs.find((x) => x.node === node);
      return s ? s.start + offset : null;
    }
    // 落在元素上：取该位置之后的第一个文本节点
    const el = node as Element;
    const after = el.childNodes[offset];
    const FOLLOWING = Node.DOCUMENT_POSITION_FOLLOWING;
    const hit = segs.find((x) =>
      after
        ? after === x.node || after.contains(x.node) || Boolean(after.compareDocumentPosition(x.node) & FOLLOWING)
        : !el.contains(x.node) && Boolean(el.compareDocumentPosition(x.node) & FOLLOWING),
    );
    if (hit) return hit.start;
    const last = segs.at(-1);
    return last ? last.start + last.node.data.length : null;
  };
  const start = pos(range.startContainer, range.startOffset);
  const end = pos(range.endContainer, range.endOffset);
  if (start === null || end === null || end <= start) return null;
  return { start, end };
}

/** 清掉上一次画上去的叠加层，恢复成渲染器产出的原样。 */
export function clearMarks(root: HTMLElement): void {
  root.querySelectorAll('.ann-extra').forEach((n) => n.remove());
  root.querySelectorAll('.katex.ann').forEach((n) => {
    [...n.classList].filter((c) => c.startsWith('ann')).forEach((c) => n.classList.remove(c));
    n.removeAttribute('data-ann');
  });
  root.querySelectorAll('span.ann').forEach((m) => {
    const parent = m.parentNode!;
    while (m.firstChild) parent.insertBefore(m.firstChild, m);
    parent.removeChild(m);
    parent.normalize();
  });
}

/**
 * 把批注画到讲义上；返回找不到位置的批注 id（失去锚点）。
 * 文本节点切开后套一层 span；公式整体加 class（不拆 KaTeX 内部结构）。
 * 批改、核对、便签在最后一段后面补一个小标记（.ann-extra，不参与全文）。
 */
export function paintMarks(root: HTMLElement, anns: Annotation[]): string[] {
  clearMarks(root);
  const lost: string[] = [];
  // 先全部定位，再从后往前画：后面的切分不影响前面的偏移
  const { text } = linearize(root);
  const placed = anns
    .map((a) => ({ a, at: locate(text, a.quote) }))
    .filter((x) => {
      if (!x.at) lost.push(x.a.id);
      return x.at;
    })
    .sort((x, y) => y.at!.start - x.at!.start);

  for (const { a, at } of placed) {
    const { segs } = linearize(root);
    let lastWrap: Element | null = null;
    for (const s of segs) {
      const s0 = s.start;
      const s1 = s.start + s.node.data.length;
      if (s1 <= at!.start || s0 >= at!.end) continue;
      const math = s.node.parentElement?.closest('.katex');
      if (math) {
        math.classList.add('ann', `ann-${a.kind}`);
        math.setAttribute('data-ann', a.id);
        lastWrap = math;
        continue;
      }
      let node = s.node;
      const from = Math.max(at!.start, s0) - s0;
      const to = Math.min(at!.end, s1) - s0;
      if (to < node.data.length) node.splitText(to);
      if (from > 0) node = node.splitText(from);
      const span = document.createElement('span');
      span.className = `ann ann-${a.kind}`;
      span.dataset.ann = a.id;
      node.parentNode!.insertBefore(span, node);
      span.appendChild(node);
      lastWrap = span;
    }
    if (lastWrap && (a.kind === 'fix' || a.kind === 'check' || a.kind === 'note')) {
      const extra = document.createElement('span');
      extra.className = `ann-extra ann-extra-${a.kind}`;
      extra.dataset.ann = a.id;
      extra.textContent = a.kind === 'fix' ? `应为 ${a.text ?? ''}` : a.kind === 'check' ? '✓ 已核对' : '便';
      if (a.kind === 'note') extra.title = a.text ?? '';
      lastWrap.after(extra);
    }
  }
  return lost;
}

export const newId = () => `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
