import type { Element, ElementContent, Root } from 'hast';

/**
 * 关联图块（```vein-graph```）：关联探索的关联图，以及粘贴进讲义后的同一张图。
 *
 * 讲义是 Markdown，关联图放在一个 `vein-graph` 代码块里（内容是 JSON），这样：
 * - 在知脉的阅读器里，它渲染成一幅图（本文件的 graphHast，接在 render.ts 的管线里）；
 * - 在 Obsidian / GitHub 里，它至少是一段可读的 JSON，不会丢；
 * - 复制、导出 Word / PPT / 图片时，用同一个布局与同一套线型，看起来和页面上一样。
 *
 * 横向是层级（layer 越大越抽象、越靠右），纵向是逻辑顺序。
 */

export interface VNode {
  id: string;
  label: string;
  kind?: string;
  layer: number;
  ref?: string;
  note?: string;
  x?: number;
  y?: number;
}

export interface VEdge {
  id: string;
  from: string;
  to: string;
  type: string;
  label?: string;
  epistemic?: string;
  status?: string;
  mine?: boolean;
  explanation?: string;
}

export interface VGraph {
  title?: string;
  nodes: VNode[];
  edges: VEdge[];
}

export const COL_W = 220;
export const ROW_H = 74;
export const PAD = 70;

/* ---------- LaTeX → 纯文本（图上的字、PPT 文字用；页面上的字仍交给 KaTeX） ---------- */

const SUP: Record<string, string> = { T: 'ᵀ', '2': '²', '3': '³', '-1': '⁻¹', '+': '⁺', n: 'ⁿ', '*': '*', '⊥': '⊥', '0': '⁰', '1': '¹', k: 'ᵏ', i: 'ⁱ' };
const SUB: Record<string, string> = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', i: 'ᵢ', j: 'ⱼ', n: 'ₙ', k: 'ₖ', r: 'ᵣ', m: 'ₘ' };
const SYM: Record<string, string> = {
  lambda: 'λ', sigma: 'σ', Sigma: 'Σ', alpha: 'α', beta: 'β', gamma: 'γ', theta: 'θ', tau: 'τ', mu: 'μ', omega: 'ω', Omega: 'Ω', Lambda: 'Λ', pi: 'π', delta: 'δ', Delta: 'Δ', epsilon: 'ε', varepsilon: 'ε', phi: 'φ', psi: 'ψ', rho: 'ρ', xi: 'ξ', eta: 'η', kappa: 'κ', nu: 'ν', chi: 'χ',
  le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠', perp: '⊥', parallel: '∥', nparallel: '∦', in: '∈', notin: '∉', subseteq: '⊆', subset: '⊂', cap: '∩', cup: '∪', times: '×', cdot: '·', cdots: '⋯', ldots: '…', dots: '…', to: '→', mapsto: '↦',
  rightarrow: '→', Rightarrow: '⇒', Leftrightarrow: '⇔', iff: '⇔', implies: '⇒', infty: '∞', approx: '≈', sim: '∼', equiv: '≡', oplus: '⊕', otimes: '⊗', partial: '∂', nabla: '∇', sum: 'Σ', prod: 'Π', int: '∫', min: 'min', max: 'max', det: 'det', dim: 'dim', ker: 'ker', rank: 'rank', diag: 'diag', exp: 'exp', sin: 'sin', cos: 'cos', mid: '|',
  quad: ' ', qquad: '  ', ',': ' ', ';': ' ', ':': ' ', '!': '', ' ': ' ', '|': '‖', '{': '{', '}': '}', lVert: '‖', rVert: '‖', Vert: '‖', lvert: '|', rvert: '|', langle: '⟨', rangle: '⟩', top: 'ᵀ', dagger: '†', pm: '±', star: '*', circ: '∘',
  left: '', right: '', big: '', Big: '', bigl: '', bigr: '', Bigl: '', Bigr: '', displaystyle: '', textstyle: '', nolimits: '', limits: '',
};
/** 只包一层内容的命令：取出内容（个别加上重音符） */
const WRAP = 'mathbf|boldsymbol|mathrm|mathsf|mathit|mathcal|mathbb|operatorname|text|textbf|textit|hat|widehat|bar|overline|tilde|vec|dot|overrightarrow|underbrace|overbrace|sqrt';
const WRAP_ONE = new RegExp(`\\\\(${WRAP})\\{([^{}]*)\\}`, 'g');

export function texToText(s: string): string {
  let t = s.replace(/\$\$?/g, '');
  // 矩阵：行用 `\\` 分、列用 `&` 分，写成 [a b; c d]
  t = t.replace(/\\begin\{([pbvBV]?matrix|smallmatrix)\}([\s\S]*?)\\end\{\1\}/g, (_, env: string, body: string) => {
    const rows = body.split(/\\\\/).map((r) => r.split('&').map((c) => c.trim()).join(' ')).filter(Boolean);
    return env.startsWith('p') ? `(${rows.join('; ')})` : `[${rows.join('; ')}]`;
  });
  // `\mathsf T` 与 `\mathsf{T}` 是同一个意思：先统一成带括号的写法
  t = t.replace(new RegExp(`\\\\(${WRAP})\\s+([A-Za-z0-9])`, 'g'), '\\$1{$2}');
  // 先把非包裹类的命令换成符号：这时命令之间还有反斜杠分隔，`\lVert\mathbf c` 不会粘成一个词
  const keep = new Set([...WRAP.split('|'), 'frac', 'dfrac', 'tfrac', 'begin', 'end']);
  t = t.replace(/\\([A-Za-z]+)/g, (m, x: string) => (keep.has(x) ? m : SYM[x] ?? x));
  // 由内向外逐层替换：`\hat{\mathbf x}`、`\frac{\lVert a\rVert}{b}` 这样的嵌套
  for (let i = 0, prev = ''; i < 6 && prev !== t; i += 1) {
    prev = t;
    t = t.replace(WRAP_ONE, (_, cmd: string, x: string) =>
      cmd === 'mathbb' ? ({ R: 'ℝ', C: 'ℂ', N: 'ℕ', Z: 'ℤ', Q: 'ℚ' } as Record<string, string>)[x] ?? x
      : cmd === 'hat' || cmd === 'widehat' ? `${x}̂`
      : cmd === 'dot' ? `${x}̇`
      : cmd === 'bar' || cmd === 'overline' ? `${x}̄`
      : cmd === 'vec' || cmd === 'overrightarrow' ? `${x}→`
      : cmd === 'sqrt' ? `√(${x})`
      : x,
    );
    t = t.replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, (_, a: string, b: string) => `${a.length > 1 ? `(${a})` : a}/${b.length > 1 ? `(${b})` : b}`);
  }
  t = t.replace(/\^\{?\\(?:mathsf|mathrm)\{?T\}?\}?/g, 'ᵀ');
  // 其余命令：逐个按名字换成符号；名字之后紧跟字母时也能断开（`\lVert\mathbf c` → ‖c）
  t = t.replace(/\\([A-Za-z]+|[,;:! |{}])/g, (_, x: string) => SYM[x] ?? x);
  t = t.replace(/\^\{([^{}]+)\}/g, (_, x: string) => SUP[x] ?? `^(${x})`).replace(/\^([A-Za-z0-9+*⊥])/g, (_, x: string) => SUP[x] ?? `^${x}`);
  t = t.replace(/_\{([^{}]+)\}/g, (_, x: string) => [...x].every((c) => SUB[c]) ? [...x].map((c) => SUB[c]).join('') : `_${x}`).replace(/_([A-Za-z0-9])/g, (_, x: string) => SUB[x] ?? `_${x}`);
  return t.replace(/[{}]/g, '').replace(/\s{2,}/g, ' ').trim();
}

/* ---------- 布局与几何 ---------- */

export const nodeW = (label: string) => Math.max(60, Math.min(250, [...texToText(label)].reduce((w, c) => w + (c.charCodeAt(0) > 255 ? 14.5 : 8.2), 0) + 32));

/**
 * 没被拖过的节点按层排：x 由 layer 决定（列宽按该列最宽的节点算，不会被裁掉），
 * 同层的上下顺序用重心法排（每个节点放到它邻居的平均高度附近，来回扫几遍），线的交叉因此少得多。
 */
export function layoutGraph<N extends VNode>(nodes: N[], edges: { from: string; to: string }[] = []): { nodes: N[]; width: number; height: number } {
  const layers = [...new Set(nodes.map((n) => n.layer))].sort((a, b) => a - b);
  const cols = layers.map((l) => nodes.filter((n) => n.layer === l));
  const tallest = Math.max(1, ...cols.map((c) => c.length));
  const height = Math.max(320, PAD * 2 + (tallest - 1) * ROW_H);

  // 重心法排序：位置用「相对本列中心的行号」，跨列比较才公平
  const nbr = new Map<string, string[]>();
  for (const e of edges) {
    if (e.from === e.to) continue;
    nbr.set(e.from, [...(nbr.get(e.from) ?? []), e.to]);
    nbr.set(e.to, [...(nbr.get(e.to) ?? []), e.from]);
  }
  const rowOf = new Map<string, number>();
  const assign = () => cols.forEach((c) => c.forEach((n, i) => rowOf.set(n.id, i - (c.length - 1) / 2)));
  assign();
  if (edges.length) {
    for (let sweep = 0; sweep < 6; sweep += 1) {
      const order = sweep % 2 === 0 ? cols.keys() : [...cols.keys()].reverse().values();
      for (const ci of order) {
        const col = cols[ci]!;
        const bary = new Map(
          col.map((n, i) => {
            const ys = (nbr.get(n.id) ?? []).filter((m) => rowOf.has(m) && nodes.find((x) => x.id === m)?.layer !== n.layer).map((m) => rowOf.get(m)!);
            return [n.id, ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : i - (col.length - 1) / 2];
          }),
        );
        col.sort((a, b) => bary.get(a.id)! - bary.get(b.id)!);
        assign();
      }
    }
  }

  // 列的横坐标：上一列最宽节点的一半 + 间距 + 本列最宽节点的一半
  const GAP_X = 118;
  const widest = cols.map((c) => Math.max(...c.map((n) => nodeW(n.label))));
  const xs: number[] = [];
  widest.forEach((w, i) => xs.push(i === 0 ? 24 + w / 2 : xs[i - 1]! + widest[i - 1]! / 2 + GAP_X + w / 2));
  const colX = new Map(layers.map((l, i) => [l, xs[i]!]));

  const placed = new Map<string, N>();
  cols.forEach((col) =>
    col.forEach((n, i) => {
      if (n.x !== undefined && n.y !== undefined) return placed.set(n.id, n);
      const span = (col.length - 1) * ROW_H;
      placed.set(n.id, { ...n, x: colX.get(n.layer)!, y: height / 2 - span / 2 + i * ROW_H });
    }),
  );
  const out = nodes.map((n) => placed.get(n.id)!);
  // 右侧多留一段：同一列的线从右边绕出去，线上的字也在那里
  const width = Math.max(460, (xs.at(-1) ?? 0) + (widest.at(-1) ?? 0) / 2 + 150, ...out.map((n) => (n.x ?? 0) + nodeW(n.label) / 2 + 40));
  const maxY = Math.max(height, ...out.map((n) => (n.y ?? 0) + PAD / 2));
  return { nodes: out, width, height: maxY };
}

export function geometry(a: VNode, b: VNode) {
  const aw = nodeW(a.label) / 2;
  const bw = nodeW(b.label) / 2;
  const [ax, ay, bx, by] = [a.x!, a.y!, b.x!, b.y!];
  let p0: [number, number];
  let p3: [number, number];
  let c1: [number, number];
  let c2: [number, number];
  if (Math.abs(ax - bx) < 40) {
    const out = Math.max(aw, bw) + 46;
    p0 = [ax + aw, ay];
    p3 = [bx + bw, by];
    c1 = [ax + out, ay];
    c2 = [bx + out, by];
  } else {
    const fwd = ax < bx;
    p0 = [ax + (fwd ? aw : -aw), ay];
    p3 = [bx + (fwd ? -bw : bw), by];
    const m = (p0[0] + p3[0]) / 2;
    c1 = [m, ay];
    c2 = [m, by];
  }
  const at = (t: number): [number, number] => {
    const mt = 1 - t;
    return [
      mt ** 3 * p0[0] + 3 * mt ** 2 * t * c1[0] + 3 * mt * t ** 2 * c2[0] + t ** 3 * p3[0],
      mt ** 3 * p0[1] + 3 * mt ** 2 * t * c1[1] + 3 * mt * t ** 2 * c2[1] + t ** 3 * p3[1],
    ];
  };
  return { d: `M${p0[0]} ${p0[1]} C${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${p3[0]} ${p3[1]}`, at, p0, p3 };
}

type Box = { x0: number; y0: number; x1: number; y1: number };
const hit = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
export const labelW = (s: string) => [...texToText(s)].reduce((w, c) => w + (c.charCodeAt(0) > 255 ? 13 : 7), 0) + 8;

/** 线上的字不压节点、不互相压：沿曲线试几个位置，放不下的先不写（选中时 must = true 一定写）。 */
export function placeLabels(items: { id: string; text: string; at: (t: number) => [number, number]; must: boolean }[], nodes: VNode[]) {
  const taken: Box[] = nodes.map((n) => {
    const w = nodeW(n.label) / 2;
    return { x0: n.x! - w, y0: n.y! - 20, x1: n.x! + w, y1: n.y! + 20 };
  });
  const out = new Map<string, [number, number]>();
  for (const it of [...items].sort((a, b) => Number(b.must) - Number(a.must))) {
    const w = labelW(it.text) / 2;
    for (const t of [0.5, 0.38, 0.62, 0.28, 0.72]) {
      const [x, y] = it.at(t);
      const box = { x0: x - w, y0: y - 21, x1: x + w, y1: y - 3 };
      if (!it.must && taken.some((b) => hit(b, box))) continue;
      taken.push(box);
      out.set(it.id, [x, y]);
      break;
    }
  }
  return out;
}

/* ---------- 线型：颜色 + 线型 + 文字（AGENTS.md §4） ---------- */

export const INK = { ink: '#1b2430', ink2: '#3f4a57', paper: '#fbfcf8', board: '#f3f5ef', line: '#3f5e86', analogy: '#9a5634', mine: '#b53c0b', accepted: '#4d7a62', structure: '#dbe5ee', domain: '#3f5e86' };

export const SYMMETRIC = new Set(['equivalent-under', 'shared-mechanism', 'contrasts-with', 'analogy-to']);

export function edgeStyle(e: VEdge): { stroke: string; width: number; dash?: string } {
  if (e.mine) return { stroke: INK.mine, width: 2 };
  if (e.epistemic === 'analogy' || e.epistemic === 'hypothesis') return { stroke: INK.analogy, width: 2.4, dash: '1 5' };
  if (e.epistemic === 'pedagogical-inference') return { stroke: INK.line, width: 1.8, dash: '7 5' };
  if (e.epistemic === 'source-backed') return { stroke: INK.line, width: 3 };
  return { stroke: INK.line, width: 1.8 };
}

export function nodeStyle(kind?: string): { fill: string; stroke: string; text: string; weight: number; dash?: string } {
  switch (kind) {
    case 'core':
      return { fill: INK.ink, stroke: INK.ink, text: INK.paper, weight: 700 };
    case 'structure':
      return { fill: INK.structure, stroke: INK.ink, text: INK.ink, weight: 600 };
    case 'domain':
      return { fill: INK.domain, stroke: INK.ink, text: INK.paper, weight: 600 };
    case 'idea':
      return { fill: INK.paper, stroke: INK.analogy, text: INK.analogy, weight: 400, dash: '5 4' };
    case 'item':
      return { fill: INK.paper, stroke: '#c5ccc6', text: INK.ink, weight: 400 };
    default:
      return { fill: INK.paper, stroke: INK.ink, text: INK.ink, weight: 400 };
  }
}

/* ---------- 静态 SVG（讲义、Word、PPT 图片、剪贴板共用） ---------- */

const el = (tagName: string, properties: Record<string, string | number | undefined>, children: ElementContent[] = []): Element => ({
  type: 'element',
  tagName,
  properties: Object.fromEntries(Object.entries(properties).filter(([, v]) => v !== undefined)) as Element['properties'],
  children,
});
const txt = (value: string): ElementContent => ({ type: 'text', value });

const FONT = "'PingFang SC','Microsoft YaHei','Noto Sans SC',sans-serif";

/** 一张关联图 → SVG 的 hast。只用数字属性与文本节点，不拼接任何来自数据的标记，所以不会注入。 */
export function graphHast(g: VGraph, opts: { showRejected?: boolean } = {}): Element {
  const { nodes, width: W, height: H } = layoutGraph(g.nodes.filter((n) => n && typeof n.id === 'string' && typeof n.label === 'string').map((n) => ({ ...n, layer: Number(n.layer) || 0 })), (g.edges ?? []).filter((e) => opts.showRejected || e.status !== 'rejected'));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges = (g.edges ?? []).filter((e) => byId.has(e.from) && byId.has(e.to) && (opts.showRejected || e.status !== 'rejected'));
  const drawn = edges.map((e) => ({ e, g: geometry(byId.get(e.from)!, byId.get(e.to)!), text: texToText(e.label || (e.mine ? '我的' : '')) }));
  const labels = placeLabels(drawn.filter((d) => d.text).map((d) => ({ id: d.e.id, text: d.text, at: d.g.at, must: false })), nodes);

  const kids: ElementContent[] = [
    el('defs', {}, [
      el('marker', { id: 'vg-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, [el('path', { d: 'M0 1 L9 5 L0 9 z', fill: INK.line })]),
    ]),
    el('rect', { x: 0, y: 0, width: W, height: H, fill: INK.board, rx: 14 }),
  ];
  for (const { e, g: geo } of drawn) {
    const s = edgeStyle(e);
    const title = el('title', {}, [txt(`${byId.get(e.from)!.label} → ${byId.get(e.to)!.label}${e.explanation ? `：${e.explanation}` : ''}`)]);
    if (e.mine) kids.push(el('path', { d: geo.d, fill: 'none', stroke: INK.mine, strokeWidth: 5 }));
    kids.push(
      el('path', {
        d: geo.d,
        fill: 'none',
        stroke: e.mine ? INK.board : s.stroke,
        strokeWidth: e.mine ? 1.6 : s.width,
        strokeDasharray: s.dash,
        strokeLinecap: 'round',
        markerEnd: SYMMETRIC.has(e.type) || e.mine ? undefined : 'url(#vg-arrow)',
      }, [title]),
    );
  }
  for (const { e, text } of drawn) {
    const p = labels.get(e.id);
    if (!p) continue;
    const s = edgeStyle(e);
    kids.push(
      el('text', { x: p[0], y: p[1] - 7, textAnchor: 'middle', fontFamily: FONT, fontSize: 12.5, fill: e.status === 'accepted' ? INK.accepted : s.stroke, stroke: INK.board, strokeWidth: 5, paintOrder: 'stroke', strokeLinejoin: 'round' }, [txt(text)]),
    );
  }
  for (const n of nodes) {
    const w = nodeW(n.label);
    const s = nodeStyle(n.kind);
    kids.push(
      el('g', {}, [
        el('rect', { x: n.x! - w / 2, y: n.y! - 18, width: w, height: 36, rx: 10, fill: s.fill, stroke: s.stroke, strokeWidth: n.kind === 'item' ? 1.5 : 2, strokeDasharray: s.dash }),
        el('text', { x: n.x!, y: n.y! + 5, textAnchor: 'middle', fontFamily: FONT, fontSize: 14.5, fontWeight: s.weight, fill: s.text }, [txt(texToText(n.label))]),
      ]),
    );
  }
  return el('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', ariaLabel: g.title ?? '关联图', className: 'vein-graph' }, kids);
}

export function parseGraphBlock(src: string): VGraph | null {
  try {
    const o = JSON.parse(src) as VGraph;
    if (!o || !Array.isArray(o.nodes) || !Array.isArray(o.edges)) return null;
    return o;
  } catch {
    return null;
  }
}

/** rehype 插件：把 <pre><code class="language-vein-graph"> 换成图。放在 sanitize 之后（SVG 由本文件生成，不经白名单）。 */
export function rehypeVeinGraph() {
  const textOf = (n: ElementContent): string => (n.type === 'text' ? n.value : 'children' in n ? n.children.map(textOf).join('') : '');
  return (tree: Root) => {
    const visit = (parent: { children: ElementContent[] }) => {
      parent.children = parent.children.map((c) => {
        if (c.type !== 'element') return c;
        if (c.tagName === 'pre') {
          const code = c.children.find((x): x is Element => x.type === 'element' && x.tagName === 'code');
          const cls = ([] as unknown[]).concat(code?.properties?.className ?? []).map(String);
          if (code && cls.includes('language-vein-graph')) {
            const g = parseGraphBlock(code.children.map(textOf).join(''));
            if (g) return el('div', { className: 'vein-graph-fig' }, [graphHast(g)]);
          }
          return c;
        }
        visit(c);
        return c;
      });
    };
    visit(tree as unknown as { children: ElementContent[] });
  };
}
