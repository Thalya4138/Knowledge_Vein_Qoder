import katex from 'katex';
import {
  addChild,
  addSibling,
  ancestors,
  assumptionsOf,
  cloneBranch,
  countDescendants,
  EPISTEMIC_LABEL,
  foldToLevel,
  indexDoc,
  insertParent,
  isDescendant,
  moveNode,
  moveSibling,
  parseImported,
  parseOutline,
  pasteBranches,
  removeNode,
  serialize,
  toMarkdown,
  toOutline,
  type Index,
  type KnowledgeContext,
  type KRelation,
  type MDoc,
  type MLink,
  type MNode,
} from './mindDoc';

/**
 * 思维导图画布：渲染、布局、编辑、快捷键、拖拽、连线、撤销与导入导出。
 * 用命令式 DOM 写，是因为一次编辑要先量出每个节点的真实尺寸（公式、换行）再排版，
 * 放进 React 的渲染周期会多出一轮重排。React 只负责外框（MindEditor.tsx）。
 */

/** 导图存到哪里由外面决定（工作区的 maps/mind.json）；画布只管什么时候存。 */
export interface CanvasIO {
  persist(json: string): Promise<void>;
  /** 这张图是第一次打开（工作区里还没有存过） */
  fresh: boolean;
  /** 已保存时状态栏显示的话，如「已保存到 maps/mind.json」 */
  savedLabel: string;
  /** 「恢复示例」用；没有示例的工作区不提供 */
  seed?: () => MDoc;
}

export interface CanvasEls {
  root: HTMLElement;
  board: HTMLElement;
  world: HTMLElement;
  svg: SVGSVGElement;
  tree: HTMLElement;
  insp: HTMLElement;
  inspHead: HTMLElement;
  hints: HTMLElement;
  meta: HTMLElement;
  searchIn: HTMLInputElement;
  searchCount: HTMLElement;
  fileIn: HTMLInputElement;
  zoomVal: HTMLElement;
}

interface Geo {
  x: number;
  y: number;
  w: number;
  h: number;
  pad: number;
  sh: number;
  ch: number;
}

type LinkSel = { kind: 'k' | 'p'; id: string } | null;
type Drag =
  | { kind: 'pan'; sx: number; sy: number; cx: number; cy: number; moved: boolean }
  | { kind: 'node'; id: string; sx: number; sy: number; moved: boolean; ghost?: HTMLElement; ox: number; oy: number; target?: { id: string; mode: 'in' | 'before' | 'after' } | null };

const GX = [0, 64, 52, 40, 30, 26];
const GY = [0, 30, 20, 12, 6, 6];
const WIDTH = [0, 3, 2.6, 2, 1.5, 1.3];
const CHIP = 12;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
const plain = (s: string) => (s || '').replace(/\$\$?([^$]+)\$\$?/g, '$1');
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const at = <T>(a: readonly T[], i: number, d: T): T => a[Math.min(i, a.length - 1)] ?? d;

const texCache = new Map<string, string>();
export function tex(src: string, display = false): string {
  const key = (display ? 'D' : 'I') + src;
  const hit = texCache.get(key);
  if (hit !== undefined) return hit;
  let html: string;
  try {
    html = katex.renderToString(src, { throwOnError: false, displayMode: display, output: 'html', strict: 'ignore' });
  } catch {
    html = '<code>' + esc(src) + '</code>';
  }
  texCache.set(key, html);
  return html;
}
/** 段内混排：$..$ 行内公式，$$..$$ 独立公式。 */
export function rich(s: string | undefined): string {
  if (!s) return '';
  let out = '';
  let last = 0;
  const re = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    out += esc(s.slice(last, m.index)).replace(/\n/g, '<br>');
    out += m[1] !== undefined ? tex(m[1], true) : tex(m[2] ?? '', false);
    last = re.lastIndex;
  }
  return out + esc(s.slice(last)).replace(/\n/g, '<br>');
}
function notesHTML(s: string): string {
  let h = '';
  for (const line of s.split('\n')) {
    const t = line.trim();
    if (/^#\s/.test(line)) h += '<h4>' + rich(line.slice(2)) + '</h4>';
    else if (/^##\s/.test(line)) h += '<h5>' + rich(line.slice(3)) + '</h5>';
    else if (/^>\s/.test(line)) h += '<p class="me-src">' + esc(line.slice(2)) + '</p>';
    else if (/^\$\$[\s\S]*\$\$$/.test(t)) h += '<div class="me-disp">' + tex(t.slice(2, -2), true) + '</div>';
    else if (t) h += '<p>' + rich(line) + '</p>';
  }
  return h;
}
const K = (k: string) =>
  k
    .split('+')
    .map((x) => '<kbd>' + esc(x) + '</kbd>')
    .join('');

/** 认知状态 → 线型（GLOSSARY.md：实线最深 / 实线 / 虚线 / 点线），文字标签在详情栏。 */
function relStroke(ep: string): { w: number; dash: string } {
  switch (ep) {
    case 'source-backed':
      return { w: 2.4, dash: '' };
    case 'logically-derived':
      return { w: 1.8, dash: '' };
    case 'pedagogical-inference':
      return { w: 1.8, dash: '7 5' };
    default:
      return { w: 1.8, dash: '1.5 5' };
  }
}

export const SHEET: [string, [string, string][]][] = [
  ['新建', [['Tab', '子主题'], ['Enter', '同级主题（在下方）'], ['Shift+Enter', '同级主题（在上方）'], ['Shift+Tab', '父主题'], ['Ctrl+V', '粘贴；缩进文本会变成分支']]],
  ['编辑', [['F2', '编辑文字'], ['空格', '编辑文字'], ['直接打字', '覆盖原文字'], ['$…$', '行内公式，$$…$$ 独立公式'], ['Ctrl+E', '在右栏编辑公式、角标、笔记'], ['Ctrl+B', '加粗'], ['Delete', '删除主题'], ['Ctrl+Z', '撤销'], ['Ctrl+Y', '重做']]],
  ['结构', [['Alt+↑', '上移'], ['Alt+↓', '下移'], ['拖到主题上', '成为它的子主题'], ['拖到上下沿', '插到它前面或后面'], ['Ctrl+C', '复制分支'], ['Ctrl+X', '剪切分支'], ['Ctrl+K', '画一条我的连线']]],
  ['查看', [['方向键', '在主题之间移动'], ['Home', '回到中心主题'], ['Ctrl+/', '收起或展开'], ['Alt+1', '只看到第 1–4 层，Alt+0 全部展开'], ['Ctrl+F', '搜索'], ['Ctrl+0', '适应窗口'], ['Ctrl+=', '放大'], ['Ctrl+-', '缩小'], ['Ctrl+S', '导出 JSON']]],
];

export class MindCanvas {
  private doc: MDoc;
  private ix!: Index;
  private sel: string | null;
  private selLink: LinkSel = null;
  private cam = { x: 0, y: 0, k: 1 };
  private hist: string[] = [];
  private fut: string[] = [];
  private editing: { id: string; before: string; fresh: boolean } | null = null;
  private editorEl: HTMLTextAreaElement | null = null;
  private linking: string | null = null;
  private inspEdit = false;
  private clip: MNode | null = null;
  private lastCopyText = '';
  private saved = true;
  private search = { q: '', hits: [] as string[], i: -1 };
  private els = new Map<string, HTMLDivElement & { _sig?: string; _chips?: boolean }>();
  private labels = new Map<string, HTMLButtonElement>();
  private geo = new Map<string, Geo>();
  private refNode = new Map<string, string>();
  private drag: Drag | null = null;
  private pendingSnap = false;
  private saveTimer = 0;
  private saveRev = 0;
  private saving: Promise<void> = Promise.resolve();
  private dead = false;
  private toastTimer = 0;
  private off: (() => void)[] = [];

  constructor(
    private e: CanvasEls,
    private ctx: KnowledgeContext,
    doc: MDoc,
    private onToast: (msg: string) => void,
    private onSheet: () => void,
    private io: CanvasIO,
  ) {
    this.doc = doc;
    this.sel = doc.root.id;
    this.bind();
    if (doc.view.level === null && io.fresh) foldToLevel(this.doc, 99);
    this.render();
    this.firstView();
    void document.fonts?.ready.then(() => {
      this.els.forEach((el) => (el._sig = ''));
      this.render();
      this.firstView();
    });
  }

  /**
   * 第一次打开：整图放得进且字够大就整图显示；否则保持 70% 的可读字号，
   * 把中心主题放在画板左侧（向右布局）或正中（两侧布局），其余拖动查看。
   */
  private firstView() {
    this.fit();
    const MIN = 0.7;
    if (this.cam.k >= MIN) return;
    const g = this.geo.get(this.doc.root.id);
    if (!g) return;
    const W = this.e.board.clientWidth;
    const H = this.e.board.clientHeight;
    const right = this.doc.view.layout === 'right' || this.doc.root.kids.every((k) => this.sideOf(k.id) > 0);
    this.cam.k = MIN;
    this.cam.x = right ? 48 - g.x * MIN : W / 2 - (g.x + g.w / 2) * MIN;
    this.cam.y = H / 2 - (g.y + g.h / 2) * MIN;
    this.applyCam();
  }

  destroy() {
    this.off.forEach((f) => f());
    window.clearTimeout(this.saveTimer);
    window.clearTimeout(this.toastTimer);
    if (!this.saved) this.flushSave();
    this.dead = true;
  }

  /* ---------- 历史与存储 ---------- */
  private snapshot() {
    this.hist.push(JSON.stringify({ root: this.doc.root, links: this.doc.links, title: this.doc.title }));
    if (this.hist.length > 200) this.hist.shift();
    this.fut = [];
  }
  private restore(s: string) {
    const o = JSON.parse(s) as Pick<MDoc, 'root' | 'links' | 'title'>;
    this.doc.root = o.root;
    this.doc.links = o.links;
    this.doc.title = o.title;
  }
  private current() {
    return JSON.stringify({ root: this.doc.root, links: this.doc.links, title: this.doc.title });
  }
  undo() {
    const s = this.hist.pop();
    if (!s) return this.toast('没有可撤销的操作');
    this.fut.push(this.current());
    this.restore(s);
    this.afterHistory('已撤销');
  }
  redo() {
    const s = this.fut.pop();
    if (!s) return this.toast('没有可重做的操作');
    this.hist.push(this.current());
    this.restore(s);
    this.afterHistory('已重做');
  }
  private afterHistory(msg: string) {
    this.ix = indexDoc(this.doc);
    if (!this.sel || !this.ix.byId.has(this.sel)) this.sel = this.doc.root.id;
    if (this.selLink?.kind === 'p' && !this.doc.links.some((l) => l.id === this.selLink?.id)) this.selLink = null;
    this.render();
    this.save();
    this.toast(msg);
  }
  private save() {
    this.saved = false;
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.flushSave(), 300);
  }
  private flushSave() {
    const rev = ++this.saveRev;
    const json = serialize(this.doc);
    // 串行写：本地文件夹的写入是异步的，后一次必须等前一次写完，免得旧版本后落盘
    this.saving = this.saving
      .then(() => this.io.persist(json))
      .then(
        () => {
          if (rev === this.saveRev) this.saved = true;
        },
        (e: Error) => this.toast('没有保存成功：' + e.message + '。请先导出 JSON 备份'),
      )
      .then(() => {
        if (!this.dead) this.renderStatus();
      });
  }
  /** 是否有一个可以「恢复示例」的种子 */
  hasSeed() {
    return Boolean(this.io.seed);
  }
  private toast(msg: string) {
    this.onToast(msg);
  }

  /* ---------- 查询 ---------- */
  private depth = (id: string) => this.ix.depth.get(id) ?? 0;
  private bandOf = (id: string) => this.ix.band.get(id) ?? 0;
  private sideOf = (id: string) => this.ix.side.get(id) ?? 1;
  private node = (id: string | null | undefined) => (id ? this.ix.byId.get(id) : undefined);
  private kidsOf = (n: MNode) => (n.fold ? [] : n.kids);
  private visible(): MNode[] {
    const out: MNode[] = [];
    const w = (n: MNode) => {
      out.push(n);
      this.kidsOf(n).forEach(w);
    };
    w(this.doc.root);
    return out;
  }
  private anchor(id: string): MNode | undefined {
    const n = this.node(id);
    if (!n) return undefined;
    for (const a of ancestors(this.ix, id)) if (a.fold) return a;
    return n;
  }
  private topOf(id: string): string {
    const a = ancestors(this.ix, id);
    return (a[1] ?? this.node(id))?.id ?? id;
  }
  /** 两端都在图上、且分属不同第一层分支的知识关系（同一分支内的关系已由树表达）。 */
  private crossRelations(): { rel: KRelation; from: string; to: string }[] {
    const out: { rel: KRelation; from: string; to: string }[] = [];
    for (const r of this.ctx.relations) {
      const a = this.refNode.get(r.from);
      const b = this.refNode.get(r.to);
      if (a && b && this.topOf(a) !== this.topOf(b)) out.push({ rel: r, from: a, to: b });
    }
    return out;
  }
  private relationsOf(n: MNode): KRelation[] {
    return n.ref ? this.ctx.relations.filter((r) => r.from === n.ref || r.to === n.ref) : [];
  }
  private personalOf(id: string): MLink[] {
    return this.doc.links.filter((l) => l.from === id || l.to === id);
  }

  /* ---------- 渲染 ---------- */
  render() {
    this.renderMap();
    this.renderOutline();
    this.renderInspector();
    this.renderStatus();
    this.renderTools();
    this.save();
  }

  private nodeClass(n: MNode): string {
    const d = Math.min(this.depth(n.id), 4);
    const c = ['me-node', 'd' + d, 'b' + this.bandOf(n.id)];
    if (n.id === this.sel && !this.selLink) c.push('sel');
    if (n.bold) c.push('bold');
    if (n.color) c.push('c-' + n.color);
    if (n.mark) c.push('mark');
    if (d === 3 && !(this.doc.view.fx && n.f?.length)) c.push('leafy');
    if (this.search.hits.includes(n.id)) c.push('hit');
    if (this.selLink) {
      const ends = this.linkEnds(this.selLink);
      if (ends && (this.anchor(ends[0])?.id === n.id || this.anchor(ends[1])?.id === n.id)) c.push('sel');
    }
    return c.join(' ');
  }
  private linkEnds(s: LinkSel): [string, string] | null {
    if (!s) return null;
    if (s.kind === 'p') {
      const l = this.doc.links.find((x) => x.id === s.id);
      return l ? [l.from, l.to] : null;
    }
    const r = this.ctx.relations.find((x) => x.id === s.id);
    const a = r && this.refNode.get(r.from);
    const b = r && this.refNode.get(r.to);
    return a && b ? [a, b] : null;
  }
  private chips(n: MNode): string[] {
    if (!this.doc.view.chips || this.depth(n.id) === 0) return [];
    const out: string[] = [];
    if (n.tag) out.push('<span class="me-chip tag">' + esc(n.tag) + '</span>');
    if (n.ref) {
      const pre = assumptionsOf(this.ctx, n.ref).length;
      if (pre) out.push('<span class="me-chip pre">前提 ' + pre + '</span>');
    }
    const lc = this.relationsOf(n).length + this.personalOf(n.id).length;
    if (lc) out.push('<span class="me-chip lk">关联 ' + lc + '</span>');
    return out;
  }
  private nodeHTML(n: MNode): { html: string; chips: boolean } {
    const chips = this.chips(n);
    const d = this.depth(n.id);
    let h = chips.length ? '<div class="me-chips">' + chips.join('') + '</div>' : '';
    h += '<div class="t">' + (rich(n.text) || '&nbsp;') + '</div>';
    if (n.src && d <= 3) h += '<div class="ref">' + esc(n.src) + '</div>';
    if (this.doc.view.fx && n.f?.length) h += '<div class="fx">' + n.f.map((k) => tex(k)).join('') + '</div>';
    if (n.kids.length && d > 0) {
      const side = this.sideOf(n.id);
      h +=
        '<button class="me-fold ' + (side > 0 ? 'r' : 'l') + (n.fold ? ' folded' : '') + '" data-fold="' + n.id + '" tabindex="-1" aria-label="' +
        (n.fold ? '展开' : '收起') + '">' + (n.fold ? countDescendants(n) : '−') + '</button>';
    }
    return { html: h, chips: chips.length > 0 };
  }

  private renderMap() {
    this.ix = indexDoc(this.doc);
    this.refNode = new Map();
    for (const [id, n] of this.ix.byId) if (n.ref && !this.refNode.has(n.ref)) this.refNode.set(n.ref, id);
    const vis = this.visible();
    const keep = new Set<string>();
    for (const n of vis) {
      keep.add(n.id);
      let el = this.els.get(n.id);
      if (!el) {
        el = document.createElement('div');
        el.dataset.id = n.id;
        this.e.world.appendChild(el);
        this.els.set(n.id, el);
      }
      const { html, chips } = this.nodeHTML(n);
      const sig = html + '|' + this.depth(n.id) + this.sideOf(n.id);
      if (el._sig !== sig) {
        el.innerHTML = html;
        el._sig = sig;
      }
      el._chips = chips;
      el.className = this.nodeClass(n);
    }
    for (const [id, el] of this.els) if (!keep.has(id)) {
      el.remove();
      this.els.delete(id);
    }
    this.geo.clear();
    for (const n of vis) {
      const el = this.els.get(n.id)!;
      const pad = el._chips ? CHIP : 0;
      this.geo.set(n.id, { w: el.offsetWidth, h: el.offsetHeight + pad, pad, x: 0, y: 0, sh: 0, ch: 0 });
    }
    this.layout();
    for (const n of vis) {
      const g = this.geo.get(n.id)!;
      this.els.get(n.id)!.style.transform = 'translate(' + Math.round(g.x) + 'px,' + Math.round(g.y + g.pad) + 'px)';
    }
    this.drawEdges(vis);
    this.applyCam();
  }

  private subH(n: MNode): number {
    const g = this.geo.get(n.id)!;
    const ks = this.kidsOf(n);
    if (!ks.length) {
      g.sh = g.h;
      g.ch = 0;
      return g.sh;
    }
    const gy = at(GY, this.depth(n.id) + 1, 6);
    let s = 0;
    ks.forEach((k, i) => (s += this.subH(k) + (i ? gy : 0)));
    g.ch = s;
    g.sh = Math.max(g.h, s);
    return g.sh;
  }
  private place(n: MNode, x: number, top: number, side: number) {
    const g = this.geo.get(n.id)!;
    g.x = side > 0 ? x : x - g.w;
    g.y = top + g.sh / 2 - g.h / 2;
    const ks = this.kidsOf(n);
    if (!ks.length) return;
    const d = this.depth(n.id) + 1;
    const gx = at(GX, d, 26);
    const gy = at(GY, d, 6);
    let ky = top + (g.sh - g.ch) / 2;
    const cx = side > 0 ? g.x + g.w + gx : g.x - gx;
    for (const k of ks) {
      this.place(k, cx, ky, side);
      ky += this.geo.get(k.id)!.sh + gy;
    }
  }
  private layout() {
    const r = this.doc.root;
    const g = this.geo.get(r.id)!;
    g.x = -g.w / 2;
    g.y = -g.h / 2;
    const ks = this.kidsOf(r);
    ks.forEach((k) => this.subH(k));
    for (const side of [1, -1]) {
      const grp = ks.filter((k) => this.sideOf(k.id) === side);
      if (!grp.length) continue;
      const total = grp.reduce((a, k, i) => a + this.geo.get(k.id)!.sh + (i ? GY[1]! : 0), 0);
      let top = -total / 2;
      const x = side > 0 ? g.x + g.w + GX[1]! : g.x - GX[1]!;
      for (const k of grp) {
        this.place(k, x, top, side);
        top += this.geo.get(k.id)!.sh + GY[1]!;
      }
    }
  }

  private anchorY(n: MNode): number {
    const g = this.geo.get(n.id)!;
    return this.depth(n.id) >= 4 ? g.y + g.h : g.y + g.pad + (g.h - g.pad) / 2;
  }
  private lineVar(n: MNode) {
    return this.depth(n.id) <= 1 ? 'var(--ink)' : 'var(--band-' + this.bandOf(n.id) + '-line)';
  }
  private drawEdges(vis: MNode[]) {
    let s =
      '<defs><marker id="me-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">' +
      '<path d="M0 1 L9 5 L0 9 z" fill="var(--accent)"/></marker>' +
      '<marker id="me-arr-p" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">' +
      '<path d="M0 1 L9 5 L0 9 z" fill="var(--cinnabar)"/></marker></defs>';
    for (const n of vis) {
      const d = this.depth(n.id);
      if (d === 0) continue;
      const p = this.ix.parent.get(n.id)!;
      const gp = this.geo.get(p.id)!;
      const gc = this.geo.get(n.id)!;
      const side = this.sideOf(n.id);
      const x1 = p === this.doc.root ? gp.x + gp.w / 2 + (side * gp.w) / 2 : side > 0 ? gp.x + gp.w : gp.x;
      const y1 = this.anchorY(p);
      const x2 = side > 0 ? gc.x : gc.x + gc.w;
      const y2 = this.anchorY(n);
      const dx = x2 - x1;
      const w = at(WIDTH, d, 1.3);
      const col = this.lineVar(n);
      s += `<path d="M${x1} ${y1} C${x1 + dx * 0.55} ${y1} ${x2 - dx * 0.45} ${y2} ${x2} ${y2}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>`;
      if (d >= 4) s += `<path d="M${gc.x} ${gc.y + gc.h} H${gc.x + gc.w}" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>`;
    }
    const keep = new Set<string>();
    const curve = (fromId: string, toId: string) => {
      const a = this.anchor(fromId);
      const b = this.anchor(toId);
      if (!a || !b || a.id === b.id) return null;
      const ga = this.geo.get(a.id)!;
      const gb = this.geo.get(b.id)!;
      const ca = { x: ga.x + ga.w / 2, y: this.anchorY(a) };
      const cb = { x: gb.x + gb.w / 2, y: this.anchorY(b) };
      const right = cb.x >= ca.x;
      const p1 = { x: right ? ga.x + ga.w : ga.x, y: ca.y };
      const p2 = { x: right ? gb.x : gb.x + gb.w, y: cb.y };
      let c1: { x: number; y: number };
      let c2: { x: number; y: number };
      if (Math.abs(cb.x - ca.x) < (ga.w + gb.w) / 2 + 40) {
        // 上下相邻：从同一侧绕出去
        const sx = this.sideOf(a.id);
        p1.x = sx > 0 ? ga.x + ga.w : ga.x;
        p2.x = sx > 0 ? gb.x + gb.w : gb.x;
        const bulge = sx * (90 + Math.abs(p2.y - p1.y) * 0.18);
        c1 = { x: p1.x + bulge, y: p1.y };
        c2 = { x: p2.x + bulge, y: p2.y };
      } else {
        const dd = (p2.x - p1.x) * 0.5;
        c1 = { x: p1.x + dd, y: p1.y - 40 };
        c2 = { x: p2.x - dd, y: p2.y - 40 };
      }
      const t = 0.5;
      const mx = (1 - t) ** 3 * p1.x + 3 * (1 - t) ** 2 * t * c1.x + 3 * (1 - t) * t * t * c2.x + t ** 3 * p2.x;
      const my = (1 - t) ** 3 * p1.y + 3 * (1 - t) ** 2 * t * c1.y + 3 * (1 - t) * t * t * c2.y + t ** 3 * p2.y;
      return { d: `M${p1.x} ${p1.y} C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p2.x} ${p2.y}`, mx, my };
    };
    const label = (key: string, text: string, cls: string, on: boolean, mx: number, my: number, title: string) => {
      keep.add(key);
      let lab = this.labels.get(key);
      if (!lab) {
        lab = document.createElement('button');
        lab.dataset.link = key;
        lab.tabIndex = -1;
        this.e.world.appendChild(lab);
        this.labels.set(key, lab);
      }
      lab.className = 'me-lk ' + cls + (on ? ' sel' : '');
      lab.textContent = text;
      lab.title = title;
      lab.style.left = mx + 'px';
      lab.style.top = my + 'px';
    };
    const v = this.doc.view.links;
    const selNode = this.node(this.sel);
    for (const { rel, from, to } of this.crossRelations()) {
      const on = this.selLink?.kind === 'k' && this.selLink.id === rel.id;
      const show = on || v === 'all' || (v === 'sel' && !!selNode?.ref && (rel.from === selNode.ref || rel.to === selNode.ref));
      if (!show) continue;
      const c = curve(from, to);
      if (!c) continue;
      const st = relStroke(rel.epistemic);
      s += `<path d="${c.d}" fill="none" stroke="var(--accent)" stroke-width="${on ? st.w + 0.8 : st.w}"${st.dash ? ` stroke-dasharray="${st.dash}"` : ''} stroke-linecap="round" marker-end="url(#me-arr)"/>`;
      const prefix = rel.epistemic === 'analogy' ? '类比：' : rel.epistemic === 'hypothesis' ? '待验证：' : '';
      label('k:' + rel.id, prefix + rel.label, 'k', on, c.mx, c.my, EPISTEMIC_LABEL[rel.epistemic] ?? rel.epistemic);
    }
    for (const l of this.doc.links) {
      const on = this.selLink?.kind === 'p' && this.selLink.id === l.id;
      const show = on || v === 'all' || (v === 'sel' && (l.from === this.sel || l.to === this.sel));
      if (!show) continue;
      const c = curve(l.from, l.to);
      if (!c) continue;
      // 双线：用户个人联想（GLOSSARY.md user-personal）
      s += `<path d="${c.d}" fill="none" stroke="var(--cinnabar)" stroke-width="${on ? 5 : 4.2}" stroke-linecap="round" marker-end="url(#me-arr-p)"/>`;
      s += `<path d="${c.d}" fill="none" stroke="var(--board)" stroke-width="1.6" stroke-linecap="round"/>`;
      label('p:' + l.id, '我的：' + (l.label || '连线'), 'p', on, c.mx, c.my, '我的连线');
    }
    for (const [key, lab] of this.labels) if (!keep.has(key)) {
      lab.remove();
      this.labels.delete(key);
    }
    this.e.svg.innerHTML = s;
  }

  /* ---------- 相机 ---------- */
  private applyCam() {
    this.e.world.style.transform = `translate(${this.cam.x}px,${this.cam.y}px) scale(${this.cam.k})`;
    this.e.zoomVal.textContent = Math.round(this.cam.k * 100) + '%';
    if (this.editing) this.positionEditor();
  }
  fit() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const g of this.geo.values()) {
      x0 = Math.min(x0, g.x);
      y0 = Math.min(y0, g.y);
      x1 = Math.max(x1, g.x + g.w);
      y1 = Math.max(y1, g.y + g.h);
    }
    const W = this.e.board.clientWidth;
    const H = this.e.board.clientHeight;
    if (!W || !H || x0 === Infinity) return;
    const k = clamp(Math.min((W - 80) / (x1 - x0 + 60), (H - 140) / (y1 - y0 + 40)), 0.2, 1.1);
    this.cam = { k, x: W / 2 - ((x0 + x1) / 2) * k, y: H / 2 - ((y0 + y1) / 2) * k };
    this.applyCam();
  }
  zoom(f: number, px?: number, py?: number) {
    const k = clamp(this.cam.k * f, 0.2, 3);
    const x = px ?? this.e.board.clientWidth / 2;
    const y = py ?? this.e.board.clientHeight / 2;
    this.cam.x = x - ((x - this.cam.x) * k) / this.cam.k;
    this.cam.y = y - ((y - this.cam.y) * k) / this.cam.k;
    this.cam.k = k;
    this.applyCam();
  }
  private reveal(id: string, force = false) {
    const g = this.geo.get(id);
    if (!g) return;
    const W = this.e.board.clientWidth;
    const H = this.e.board.clientHeight;
    const sx = g.x * this.cam.k + this.cam.x;
    const sy = g.y * this.cam.k + this.cam.y;
    const m = 60;
    if (force || sx < m || sy < m + 40 || sx + g.w * this.cam.k > W - m || sy + g.h * this.cam.k > H - m) {
      this.cam.x = W / 2 - (g.x + g.w / 2) * this.cam.k;
      this.cam.y = H / 2 - (g.y + g.h / 2) * this.cam.k;
      this.applyCam();
    }
  }

  /* ---------- 操作 ---------- */
  private select(id: string | null) {
    this.sel = id;
    this.selLink = null;
    this.inspEdit = false;
    this.render();
    if (id) this.reveal(id);
  }
  private mutate(f: () => string | null | boolean, edit = false) {
    this.snapshot();
    const r = f();
    if (r === null || r === false) {
      this.hist.pop();
      return;
    }
    if (typeof r === 'string') this.sel = r;
    this.selLink = null;
    this.render();
    if (this.sel) this.reveal(this.sel);
    if (edit && typeof r === 'string') this.startEdit(r, null, true);
  }
  private unfoldTo(id: string) {
    ancestors(this.ix, id).forEach((a) => (a.fold = false));
  }
  toggleFold(id: string) {
    const n = this.node(id);
    if (!n || !n.kids.length || n === this.doc.root) return;
    n.fold = !n.fold;
    this.doc.view.level = null;
    this.render();
  }
  expandTo(level: number, quiet = false) {
    foldToLevel(this.doc, level);
    this.render();
    this.fit();
    if (!quiet) this.toast(level >= 99 ? '已全部展开' : '已展开到第 ' + level + ' 层');
  }
  setView<K extends keyof MDoc['view']>(k: K, v: MDoc['view'][K]) {
    this.doc.view[k] = v;
    this.render();
    if (k === 'layout') this.fit();
  }
  toggleView(k: 'fx' | 'chips') {
    this.doc.view[k] = !this.doc.view[k];
    this.render();
  }
  view() {
    return this.doc.view;
  }
  canUndo() {
    return this.hist.length > 0;
  }
  canRedo() {
    return this.fut.length > 0;
  }
  title() {
    return this.doc.title;
  }
  setTitle(t: string) {
    this.snapshot();
    this.doc.title = t.trim() || '思维导图';
    this.save();
  }

  /* ---------- 连线 ---------- */
  startLinking() {
    if (!this.sel) return this.toast('先选中一个主题');
    this.linking = this.sel;
    this.e.board.classList.add('linking');
    this.renderStatus();
    this.toast('点另一个主题，画一条我的连线；Esc 取消');
  }
  private stopLinking() {
    this.linking = null;
    this.e.board.classList.remove('linking');
    this.renderStatus();
  }
  private finishLink(to: string) {
    const from = this.linking;
    this.stopLinking();
    if (!from || to === from) return;
    this.snapshot();
    const l: MLink = { id: 'p' + Date.now().toString(36), from, to, label: '', reason: '', src: '' };
    this.doc.links.push(l);
    this.selLink = { kind: 'p', id: l.id };
    this.inspEdit = true;
    this.render();
    const f = this.e.insp.querySelector<HTMLInputElement>('[data-lf="label"]');
    f?.focus();
  }

  /* ---------- 原地编辑 ---------- */
  private startEdit(id: string, initial: string | null = null, fresh = false) {
    const n = this.node(id);
    if (!n) return;
    this.stopEdit(false);
    this.editing = { id, before: n.text, fresh };
    const ta = document.createElement('textarea');
    ta.className = 'me-editor';
    ta.rows = 1;
    ta.spellcheck = false;
    ta.value = initial ?? n.text;
    ta.setAttribute('aria-label', '编辑主题文字，$…$ 为公式');
    this.e.board.appendChild(ta);
    this.editorEl = ta;
    this.positionEditor();
    ta.focus();
    if (initial === null) ta.select();
    else ta.setSelectionRange(ta.value.length, ta.value.length);
    ta.addEventListener('keydown', (ev) => this.onEditorKey(ev));
    ta.addEventListener('blur', () => this.stopEdit(true));
    this.renderStatus();
  }
  private positionEditor() {
    const ta = this.editorEl;
    const g = this.editing && this.geo.get(this.editing.id);
    if (!ta || !g) return;
    ta.style.left = Math.round(g.x * this.cam.k + this.cam.x) - 4 + 'px';
    ta.style.top = Math.round((g.y + g.pad) * this.cam.k + this.cam.y) - 4 + 'px';
    ta.style.minWidth = Math.max(120, g.w * this.cam.k + 8) + 'px';
  }
  private onEditorKey(ev: KeyboardEvent) {
    ev.stopPropagation();
    if (ev.isComposing || ev.keyCode === 229 || !this.editing) return;
    const id = this.editing.id;
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      this.stopEdit(true);
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      this.stopEdit(false);
    } else if (ev.key === 'Tab') {
      ev.preventDefault();
      this.stopEdit(true);
      if (ev.shiftKey) this.mutate(() => insertParent(this.doc, id), true);
      else this.mutate(() => addChild(this.doc, id), true);
    }
  }
  private stopEdit(commit: boolean) {
    if (!this.editing || !this.editorEl) return;
    const { id, before, fresh } = this.editing;
    const n = this.node(id);
    const val = this.editorEl.value.replace(/\s+$/, '');
    const ta = this.editorEl;
    this.editing = null;
    this.editorEl = null;
    ta.remove();
    if (n && commit && val && val !== before) {
      if (!fresh) this.snapshot();
      n.text = val;
    }
    this.render();
    this.e.board.focus({ preventScroll: true });
  }

  /* ---------- 导入导出 ---------- */
  private download(name: string, text: string, type: string) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  exportJSON() {
    this.download(this.doc.title + '.json', JSON.stringify(this.doc, null, 2), 'application/json');
    this.toast('已导出 JSON');
  }
  exportMD() {
    this.download(this.doc.title + '.md', toMarkdown(this.doc), 'text/markdown');
    this.toast('已导出 Markdown');
  }
  importFile(file: File) {
    void file.text().then((t) => {
      const d = parseImported(t);
      if (!d) return this.toast('导入失败：这不是本导图导出的 JSON');
      this.snapshot();
      this.doc = d;
      this.sel = d.root.id;
      this.selLink = null;
      this.render();
      this.fit();
      this.save();
      this.toast('已导入 ' + file.name + '，Ctrl+Z 可以撤回');
    });
  }
  /** 当前导图的一份深拷贝（交给 AI 读，不让它碰到画布正在用的对象） */
  docCopy(): MDoc {
    return JSON.parse(serialize(this.doc)) as MDoc;
  }
  /**
   * 应用一份整图修改（AI 修改、按资料更新）：作为**一步**记进历史，Ctrl+Z 一下整体撤回。
   * 只换树、连线与标题；视图设置是用户的，不跟着变。
   */
  applyDoc(next: MDoc, msg: string) {
    this.snapshot();
    this.doc.root = next.root;
    this.doc.links = next.links;
    this.doc.title = next.title;
    this.doc.seq = Math.max(this.doc.seq, next.seq);
    this.afterHistory(msg);
  }
  reset() {
    if (!this.io.seed) return;
    this.snapshot();
    this.doc = this.io.seed();
    this.sel = this.doc.root.id;
    this.selLink = null;
    this.render();
    this.fit();
    this.save();
    this.toast('已恢复示例，Ctrl+Z 可以撤回');
  }

  /* ---------- 大纲与搜索 ---------- */
  private renderOutline() {
    let h = '';
    const w = (n: MNode) => {
      const d = this.depth(n.id);
      const cls = ['d' + Math.min(d, 4)];
      if (n.id === this.sel) cls.push('sel');
      if (this.search.hits.includes(n.id)) cls.push('hit');
      h += `<li><button class="${cls.join(' ')}" data-go="${n.id}" style="padding-left:${8 + d * 12}px" tabindex="-1">${n.kids.length && n.fold ? '＋ ' : ''}${rich(n.text.replace(/\n/g, ' '))}</button></li>`;
      n.kids.forEach(w);
    };
    w(this.doc.root);
    this.e.tree.innerHTML = h;
    this.e.tree.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
    this.e.searchCount.textContent = this.search.q ? (this.search.hits.length ? this.search.i + 1 + '/' + this.search.hits.length : '无') : '';
  }
  runSearch(q: string) {
    this.search = { q: q.trim().toLowerCase(), hits: [], i: -1 };
    if (this.search.q) {
      for (const n of this.ix.byId.values()) {
        const hay = [n.text, ...(n.f ?? []), n.notes ?? '', n.src ?? '', n.tagNote ?? '', n.phen ?? '', n.contrast ?? ''].join(' ').toLowerCase();
        if (hay.includes(this.search.q)) this.search.hits.push(n.id);
      }
    }
    this.render();
  }
  nextHit(dir: 1 | -1) {
    const len = this.search.hits.length;
    if (!len) return;
    this.search.i = (this.search.i + dir + len) % len;
    const id = this.search.hits[this.search.i]!;
    this.unfoldTo(id);
    this.select(id);
    this.reveal(id, true);
  }

  /* ---------- 详情栏 ---------- */
  private renderInspector() {
    const box = this.e.insp;
    const head = this.e.inspHead;
    if (this.selLink) return this.selLink.kind === 'p' ? this.renderPersonal(box, head) : this.renderRelation(box, head);
    const n = this.node(this.sel);
    if (!n) {
      head.innerHTML = '<h2>详情</h2>';
      box.innerHTML =
        '<p class="me-empty">选中一个主题，这里显示它的公式、成立条件、推导与动机和关联。</p>' +
        '<div class="me-sec"><h3>怎么读</h3><div class="me-callout tag"><b>前提 n</b>与这个主题相连的知识关系，一共要求了几条成立条件。</div>' +
        '<div class="me-callout con">蓝线是知识关系：实线可推导或有出处，虚线是教学归纳，点线是类比。朱色双线是你自己画的连线。</div></div>';
      return;
    }
    head.innerHTML =
      '<h2>' + (this.inspEdit ? '编辑主题' : '详情') + '</h2><div class="me-keys">' +
      (this.inspEdit
        ? '<button class="key small" data-act="doneEdit">完成</button>'
        : '<button class="key small" data-act="edit" title="Ctrl+E">编辑</button><button class="key small" data-act="link" title="Ctrl+K">画连线</button>') +
      '</div>';
    if (this.inspEdit) return this.renderForm(box, n);
    const path = ancestors(this.ix, n.id).map((a) => rich(a.text)).join(' / ');
    const info = n.ref ? this.ctx.info(n.ref) : null;
    let h = path ? '<p class="me-path">' + path + '</p>' : '';
    h += '<div class="me-title">' + rich(n.text) + '</div>';
    const meta = [info?.kind, n.src].filter(Boolean).map((x) => esc(String(x)));
    if (meta.length) h += '<p class="me-ref">' + meta.join('，') + '</p>';
    if (info && info.title !== plain(n.text)) h += '<p class="me-ref">知识库里叫「' + esc(info.title) + '」' + (info.aliases.length ? '，又叫' + esc(info.aliases.join('、')) : '') + '</p>';
    if (n.f?.length) h += '<div class="me-sec"><h3>公式</h3><div class="me-fx">' + n.f.map((k) => tex(k, true)).join('') + '</div></div>';
    if (n.tag) h += '<div class="me-sec"><h3>角标</h3><div class="me-callout tag"><b>' + esc(n.tag) + '</b>' + rich(n.tagNote) + '</div></div>';
    if (n.ref) {
      const pre = assumptionsOf(this.ctx, n.ref);
      if (pre.length) {
        h += '<div class="me-sec"><h3>成立条件</h3><ul class="me-pre">' +
          pre.map((p) => '<li>' + esc(p.text) + '<span>' + esc(p.rel.label) + '，' + esc(this.otherTitle(p.rel, n.ref!)) + '</span></li>').join('') + '</ul></div>';
      }
    }
    if (n.phen) h += '<div class="me-sec"><h3>把它逼出来的现象</h3><div class="me-callout phen">' + rich(n.phen) + '</div></div>';
    if (n.contrast) h += '<div class="me-sec"><h3>容易混淆</h3><div class="me-callout con">' + rich(n.contrast) + '</div></div>';
    if (n.notes) h += '<div class="me-sec"><h3>推导与动机</h3><div class="me-notes">' + notesHTML(n.notes) + '</div></div>';
    const rels = this.relationsOf(n);
    if (rels.length) {
      h += '<div class="me-sec"><h3>知识关系</h3><div class="me-list">' +
        rels.map((r) =>
          '<button class="me-item" data-pick="k:' + r.id + '"><span class="h">' + esc(r.label) + '<em>' + esc(EPISTEMIC_LABEL[r.epistemic] ?? r.epistemic) + '</em></span>' +
          '<span class="r">' + esc(r.explanation) + '</span><span class="m">' + (r.from === n.ref ? '连到 ' : '来自 ') + esc(this.otherTitle(r, n.ref!)) + '</span></button>').join('') +
        '</div></div>';
    }
    const mine = this.personalOf(n.id);
    h += '<div class="me-sec"><h3>我的连线</h3>';
    if (mine.length) {
      h += '<div class="me-list">' + mine.map((l) => {
        const other = this.node(l.from === n.id ? l.to : l.from);
        return '<button class="me-item p" data-pick="p:' + l.id + '"><span class="h">' + esc(l.label || '连线') + '</span>' +
          (l.reason ? '<span class="r">' + rich(l.reason) + '</span>' : '') +
          '<span class="m">' + (l.from === n.id ? '连到 ' : '来自 ') + esc(plain(other?.text ?? '')) + (l.src ? '，' + esc(l.src) : '') + '</span></button>';
      }).join('') + '</div>';
    } else h += '<p class="me-empty">还没有。按 Ctrl+K，再点另一个主题，就能画一条。</p>';
    h += '</div>';
    box.innerHTML = h;
  }
  private otherTitle(r: KRelation, ref: string) {
    const other = r.from === ref ? r.to : r.from;
    const id = this.refNode.get(other);
    return id ? plain(this.node(id)?.text ?? other) : this.ctx.info(other)?.title ?? other;
  }
  private field(label: string, key: string, value: string | undefined, o: { area?: boolean; rows?: number; hint?: string } = {}) {
    const v = esc(value ?? '');
    return '<label>' + label + (o.hint ? ' <span class="hint">' + o.hint + '</span>' : '') +
      (o.area ? `<textarea data-f="${key}" rows="${o.rows ?? 3}">${v}</textarea>` : `<input data-f="${key}" value="${v}">`) + '</label>';
  }
  private renderForm(box: HTMLElement, n: MNode) {
    box.innerHTML =
      '<div class="me-form">' +
      this.field('主题', 'text', n.text, { area: true, rows: 2, hint: '$…$ 为行内公式' }) +
      this.field('出处', 'src', n.src) +
      this.field('公式', 'f', (n.f ?? []).join('\n'), { area: true, rows: 3, hint: '一行一条 LaTeX' }) +
      this.field('角标', 'tag', n.tag, { hint: '如：补 本构关系' }) +
      this.field('角标的说明', 'tagNote', n.tagNote, { area: true, rows: 2 }) +
      this.field('把它逼出来的现象', 'phen', n.phen, { area: true, rows: 2 }) +
      this.field('容易混淆', 'contrast', n.contrast, { area: true, rows: 2 }) +
      this.field('推导与动机', 'notes', n.notes, { area: true, rows: 8, hint: '# 标题　## 小标题　$$独立公式$$' }) +
      '<div class="me-style"><span>样式</span>' +
      `<button class="key small" data-style="bold" aria-pressed="${!!n.bold}">加粗</button>` +
      `<button class="key small" data-style="mark" aria-pressed="${!!n.mark}">荧光</button>` +
      `<span class="segmented"><button data-color="" aria-pressed="${!n.color}">墨</button><button data-color="accent" aria-pressed="${n.color === 'accent'}">蓝</button><button data-color="cinnabar" aria-pressed="${n.color === 'cinnabar'}">朱</button></span>` +
      '</div></div>';
  }
  private renderRelation(box: HTMLElement, head: HTMLElement) {
    const r = this.ctx.relations.find((x) => x.id === this.selLink?.id);
    if (!r) return;
    head.innerHTML = '<h2>知识关系</h2>';
    const a = this.refNode.get(r.from);
    const b = this.refNode.get(r.to);
    box.innerHTML =
      '<p class="me-path">' + esc(this.ctx.info(r.from)?.title ?? r.from) + ' 到 ' + esc(this.ctx.info(r.to)?.title ?? r.to) + '</p>' +
      '<div class="me-title">' + esc(r.label) + '</div><p class="me-ref">' + esc(EPISTEMIC_LABEL[r.epistemic] ?? r.epistemic) + '</p>' +
      '<div class="me-sec"><h3>凭什么</h3><div class="me-notes"><p>' + esc(r.explanation) + '</p></div></div>' +
      (r.assumptions.length ? '<div class="me-sec"><h3>成立条件</h3><ul class="me-pre">' + r.assumptions.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul></div>' : '') +
      '<div class="me-sec"><p class="me-empty">知识关系来自工作区的图谱，在这里只读；要改，请到讲义或关联探索里改。</p>' +
      '<div class="me-keys">' + (a ? `<button class="key small" data-go="${a}">看起点</button>` : '') + (b ? `<button class="key small" data-go="${b}">看终点</button>` : '') + '</div></div>';
  }
  private renderPersonal(box: HTMLElement, head: HTMLElement) {
    const l = this.doc.links.find((x) => x.id === this.selLink?.id);
    if (!l) return;
    head.innerHTML = '<h2>我的连线</h2><div class="me-keys"><button class="key small" data-act="flipLink">反转方向</button><button class="key small" data-act="delLink">删除</button></div>';
    const a = this.node(l.from);
    const b = this.node(l.to);
    box.innerHTML =
      '<p class="me-path">' + rich(a?.text) + ' 连到 ' + rich(b?.text) + '</p>' +
      '<div class="me-form">' +
      `<label>线上的一句话 <span class="hint">不超过 12 个字</span><input data-lf="label" maxlength="16" value="${esc(l.label)}"></label>` +
      `<label>我为什么这样连 <span class="hint">选填</span><textarea data-lf="reason" rows="4">${esc(l.reason)}</textarea></label>` +
      `<label>出处 <span class="hint">选填</span><input data-lf="src" value="${esc(l.src)}"></label>` +
      '</div><div class="me-sec"><p class="me-empty">这是你的记法，不进逻辑图谱和结构图谱，也不会被报告当作论据。</p>' +
      `<div class="me-keys"><button class="key small" data-go="${l.from}">看起点</button><button class="key small" data-go="${l.to}">看终点</button></div></div>`;
  }

  /* ---------- 底栏 ---------- */
  private renderStatus() {
    let list: [string, string][];
    if (this.editing) list = [['Enter', '确认'], ['Shift+Enter', '换行'], ['Tab', '确认并加子主题'], ['Esc', '取消'], ['$', '包住的文字按公式显示']];
    else if (this.linking) list = [['点击', '另一个主题完成连线'], ['Esc', '取消']];
    else if (this.selLink) list = this.selLink.kind === 'p' ? [['Delete', '删除这条连线'], ['Esc', '取消选择']] : [['Esc', '取消选择']];
    else if (this.sel) list = [['Tab', '子主题'], ['Enter', '同级主题'], ['Shift+Tab', '父主题'], ['F2', '编辑'], ['Delete', '删除'], ['Ctrl+/', '收起'], ['Alt+↑', '上移'], ['Ctrl+K', '画连线'], ['F1', '全部快捷键']];
    else list = [['拖动', '空白处平移'], ['滚轮', '缩放'], ['Ctrl+0', '适应窗口'], ['F1', '全部快捷键']];
    this.e.hints.innerHTML = list.map(([k, t]) => '<span>' + (/^[一-龥]/.test(k) ? '<b>' + k + '</b>' : K(k)) + t + '</span>').join('');
    this.e.meta.innerHTML = '<span>' + (this.ix?.byId.size ?? 0) + ' 个主题</span><span>' + (this.saved ? this.io.savedLabel : '正在保存') + '</span>';
    this.e.root.dispatchEvent(new CustomEvent('me-state'));
  }
  private renderTools() {
    this.e.root.querySelectorAll<HTMLElement>('[data-view]').forEach((b) => {
      const [k, v] = (b.dataset.view ?? '').split(':') as [keyof MDoc['view'], string | undefined];
      const cur = this.doc.view[k];
      b.setAttribute('aria-pressed', String(v === undefined ? !!cur : String(cur) === v));
    });
    this.e.root.querySelectorAll<HTMLElement>('[data-level]').forEach((b) => b.setAttribute('aria-pressed', String(this.doc.view.level === Number(b.dataset.level))));
  }

  /* ---------- 方向键 ---------- */
  private navigate(dir: 'left' | 'right' | 'up' | 'down') {
    const n = this.node(this.sel);
    if (!n) return this.select(this.doc.root.id);
    if (dir === 'left' || dir === 'right') {
      const want = dir === 'right' ? 1 : -1;
      if (n === this.doc.root) {
        const ks = this.kidsOf(n).filter((k) => this.sideOf(k.id) === want);
        const k = ks[Math.floor((ks.length - 1) / 2)];
        if (k) this.select(k.id);
        return;
      }
      if (this.sideOf(n.id) === want) {
        const ks = this.kidsOf(n);
        const k = ks[Math.floor((ks.length - 1) / 2)];
        if (k) this.select(k.id);
        else if (n.fold) this.toggleFold(n.id);
      } else {
        const p = this.ix.parent.get(n.id);
        if (p) this.select(p.id);
      }
      return;
    }
    const g = this.geo.get(n.id)!;
    const cy = g.y + g.h / 2;
    let best: MNode | null = null;
    let bd = Infinity;
    for (const m of this.visible()) {
      if (m === n || this.depth(m.id) !== this.depth(n.id) || this.sideOf(m.id) !== this.sideOf(n.id)) continue;
      const gm = this.geo.get(m.id)!;
      const dy = dir === 'up' ? cy - (gm.y + gm.h / 2) : gm.y + gm.h / 2 - cy;
      if (dy <= 0) continue;
      const score = dy + Math.abs(gm.x - g.x) * 0.3;
      if (score < bd) {
        bd = score;
        best = m;
      }
    }
    if (best) this.select(best.id);
  }

  /* ---------- 事件 ---------- */
  private on<K extends keyof DocumentEventMap>(t: Document | HTMLElement | Window, type: K | string, f: (ev: never) => void, opts?: AddEventListenerOptions) {
    t.addEventListener(type, f as EventListener, opts);
    this.off.push(() => t.removeEventListener(type, f as EventListener, opts));
  }
  /** 只在焦点位于导图之内（或页面没有焦点）时接管按键，避免抢走输入框与导航的按键。 */
  private ours(): boolean {
    const a = document.activeElement;
    return !a || a === document.body || this.e.root.contains(a);
  }

  private bind() {
    const { board, world } = this.e;
    const inField = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);

    this.on(document, 'keydown', (ev: KeyboardEvent) => {
      if (this.editing || !this.ours() || document.querySelector('.me-sheet-bg')) return;
      const ctrl = ev.ctrlKey || ev.metaKey;
      const k = ev.key;
      if (inField(ev.target)) {
        if (k === 'Escape') {
          (ev.target as HTMLElement).blur();
          board.focus({ preventScroll: true });
        }
        return;
      }
      if (k === 'F1') {
        ev.preventDefault();
        return this.onSheet();
      }
      if (ctrl) {
        const lk = k.toLowerCase();
        const act: Record<string, () => void> = {
          z: () => (ev.shiftKey ? this.redo() : this.undo()),
          y: () => this.redo(),
          s: () => this.exportJSON(),
          o: () => this.e.fileIn.click(),
          f: () => {
            this.showPanel('outline');
            this.e.searchIn.focus();
            this.e.searchIn.select();
          },
          '0': () => this.fit(),
          '=': () => this.zoom(1.2),
          '+': () => this.zoom(1.2),
          '-': () => this.zoom(1 / 1.2),
          '/': () => this.sel && this.toggleFold(this.sel),
          k: () => this.startLinking(),
          e: () => {
            if (!this.sel) return;
            this.showPanel('inspector');
            this.inspEdit = !this.inspEdit;
            this.renderInspector();
            if (this.inspEdit) this.e.insp.querySelector<HTMLElement>('[data-f="text"]')?.focus();
          },
          b: () => {
            const n = this.node(this.sel);
            if (!n) return;
            this.snapshot();
            n.bold = !n.bold;
            this.render();
          },
        };
        const f = act[lk];
        if (f) {
          ev.preventDefault();
          f();
        }
        return;
      }
      if (ev.altKey) {
        if (k === 'ArrowUp' || k === 'ArrowDown') {
          ev.preventDefault();
          const id = this.sel;
          if (id) this.mutate(() => moveSibling(this.doc, id, k === 'ArrowUp' ? -1 : 1) && id);
        } else if (/^[0-4]$/.test(k)) {
          ev.preventDefault();
          this.expandTo(k === '0' ? 99 : Number(k) + 1);
        }
        return;
      }
      if (k === 'Escape') {
        if (this.linking) this.stopLinking();
        else if (this.selLink) {
          this.selLink = null;
          this.render();
        } else this.select(null);
        return;
      }
      if (this.linking) return;
      if (this.selLink?.kind === 'p' && (k === 'Delete' || k === 'Backspace')) {
        ev.preventDefault();
        return this.delLink();
      }
      const id = this.sel;
      if (!id) {
        if (k.startsWith('Arrow') || k === 'Home') {
          ev.preventDefault();
          this.select(this.doc.root.id);
        }
        return;
      }
      switch (k) {
        case 'Tab':
          ev.preventDefault();
          return ev.shiftKey ? this.mutate(() => insertParent(this.doc, id), true) : this.mutate(() => addChild(this.doc, id), true);
        case 'Enter':
          ev.preventDefault();
          return this.mutate(() => addSibling(this.doc, id, ev.shiftKey), true);
        case 'Delete':
        case 'Backspace':
          ev.preventDefault();
          if (id === this.doc.root.id) return this.toast('中心主题不能删除');
          this.mutate(() => removeNode(this.doc, id));
          return this.toast('已删除，Ctrl+Z 撤销');
        case 'F2':
        case ' ':
          ev.preventDefault();
          return this.startEdit(id);
        case 'ArrowLeft':
          ev.preventDefault();
          return this.navigate('left');
        case 'ArrowRight':
          ev.preventDefault();
          return this.navigate('right');
        case 'ArrowUp':
          ev.preventDefault();
          return this.navigate('up');
        case 'ArrowDown':
          ev.preventDefault();
          return this.navigate('down');
        case 'Home':
          ev.preventDefault();
          this.select(this.doc.root.id);
          return this.reveal(this.doc.root.id, true);
      }
      // 直接打字：开始编辑并覆盖（中文输入法时 key 为 Process）
      if (k.length === 1 || k === 'Process') this.startEdit(id, '');
    });

    const clipOk = (ev: ClipboardEvent) => !inField(ev.target) && !this.editing && !!this.sel && this.ours();
    this.on(document, 'copy', (ev: ClipboardEvent) => {
      if (!clipOk(ev)) return;
      const n = this.node(this.sel)!;
      this.clip = JSON.parse(JSON.stringify(n)) as MNode;
      this.lastCopyText = toOutline(n);
      ev.clipboardData?.setData('text/plain', this.lastCopyText);
      ev.preventDefault();
      this.toast('已复制「' + plain(n.text) + '」分支');
    });
    this.on(document, 'cut', (ev: ClipboardEvent) => {
      if (!clipOk(ev) || this.sel === this.doc.root.id) return;
      const n = this.node(this.sel)!;
      this.clip = JSON.parse(JSON.stringify(n)) as MNode;
      this.lastCopyText = toOutline(n);
      ev.clipboardData?.setData('text/plain', this.lastCopyText);
      ev.preventDefault();
      const id = n.id;
      this.mutate(() => removeNode(this.doc, id));
    });
    this.on(document, 'paste', (ev: ClipboardEvent) => {
      if (!clipOk(ev)) return;
      const text = ev.clipboardData?.getData('text/plain') ?? '';
      ev.preventDefault();
      const id = this.sel!;
      const branches = this.clip && text === this.lastCopyText ? [cloneBranch(this.doc, this.clip)] : text.trim() ? parseOutline(this.doc, text) : [];
      if (!branches.length) return;
      this.mutate(() => pasteBranches(this.doc, id, branches));
      this.toast('已粘贴 ' + branches.length + ' 个主题');
    });

    this.on(board, 'pointerdown', (ev: PointerEvent) => {
      if (ev.button !== 0) return;
      const t = ev.target as HTMLElement;
      if (t.closest('.me-tools, .me-editor')) return;
      const fold = t.closest<HTMLElement>('[data-fold]');
      if (fold) {
        ev.preventDefault();
        return this.toggleFold(fold.dataset.fold!);
      }
      const lab = t.closest<HTMLElement>('[data-link]');
      if (lab) {
        const [kind, id] = (lab.dataset.link ?? '').split(':') as ['k' | 'p', string];
        this.selLink = { kind, id };
        this.inspEdit = kind === 'p';
        this.showPanel('inspector');
        return this.render();
      }
      const el = t.closest<HTMLElement>('.me-node');
      board.focus({ preventScroll: true });
      if (el) {
        const id = el.dataset.id!;
        if (this.linking) return this.finishLink(id);
        if (this.sel !== id || this.selLink) this.select(id);
        this.drag = { kind: 'node', id, sx: ev.clientX, sy: ev.clientY, moved: false, ox: 0, oy: 0 };
      } else {
        if (this.linking) return this.stopLinking();
        this.drag = { kind: 'pan', sx: ev.clientX, sy: ev.clientY, cx: this.cam.x, cy: this.cam.y, moved: false };
        board.classList.add('panning');
      }
      board.setPointerCapture(ev.pointerId);
    });
    this.on(board, 'pointermove', (ev: PointerEvent) => {
      const d = this.drag;
      if (!d) return;
      const dx = ev.clientX - d.sx;
      const dy = ev.clientY - d.sy;
      if (!d.moved && Math.hypot(dx, dy) < 5) return;
      d.moved = true;
      if (d.kind === 'pan') {
        this.cam.x = d.cx + dx;
        this.cam.y = d.cy + dy;
        return this.applyCam();
      }
      if (d.id === this.doc.root.id) return;
      const src = this.els.get(d.id);
      if (!src) return;
      if (!d.ghost) {
        d.ghost = src.cloneNode(true) as HTMLElement;
        d.ghost.classList.add('ghost');
        d.ghost.classList.remove('sel');
        world.appendChild(d.ghost);
        src.classList.add('dragging');
        const g = this.geo.get(d.id)!;
        d.ox = g.x;
        d.oy = g.y + g.pad;
      }
      d.ghost.style.transform = `translate(${d.ox + dx / this.cam.k}px,${d.oy + dy / this.cam.k}px)`;
      this.clearDrop();
      const hit = document.elementFromPoint(ev.clientX, ev.clientY);
      const tEl = hit?.closest<HTMLElement>('.me-node');
      if (tEl && tEl !== src && tEl !== d.ghost) {
        const tid = tEl.dataset.id!;
        if (!isDescendant(this.ix, d.id, tid)) {
          const r = tEl.getBoundingClientRect();
          const fy = (ev.clientY - r.top) / r.height;
          const isRoot = tid === this.doc.root.id;
          const mode = !isRoot && fy < 0.25 ? 'before' : !isRoot && fy > 0.75 ? 'after' : 'in';
          tEl.classList.add('drop-' + mode);
          d.target = { id: tid, mode };
        }
      }
    });
    this.on(board, 'pointerup', () => {
      const d = this.drag;
      this.drag = null;
      board.classList.remove('panning');
      if (!d) return;
      if (d.kind === 'pan' && !d.moved) return this.select(null);
      if (d.kind === 'node' && d.ghost) {
        d.ghost.remove();
        this.els.get(d.id)?.classList.remove('dragging');
        const target = d.target;
        this.clearDrop();
        if (target) this.mutate(() => moveNode(this.doc, d.id, target.id, target.mode) && d.id);
      }
    });
    this.on(board, 'dblclick', (ev: MouseEvent) => {
      const t = ev.target as HTMLElement;
      const el = t.closest<HTMLElement>('.me-node');
      if (el && !t.closest('[data-fold]')) this.startEdit(el.dataset.id!);
    });
    this.on(
      board,
      'wheel',
      (ev: WheelEvent) => {
        ev.preventDefault();
        const r = board.getBoundingClientRect();
        if (ev.shiftKey && !ev.ctrlKey) {
          this.cam.x -= ev.deltaY;
          return this.applyCam();
        }
        this.zoom(Math.exp(-ev.deltaY * (ev.ctrlKey ? 0.01 : 0.0015)), ev.clientX - r.left, ev.clientY - r.top);
      },
      { passive: false },
    );
    this.on(board, 'dragover', (ev: DragEvent) => {
      if (ev.dataTransfer?.types.includes('Files')) ev.preventDefault();
    });
    this.on(board, 'drop', (ev: DragEvent) => {
      const f = ev.dataTransfer?.files[0];
      if (f) {
        ev.preventDefault();
        this.importFile(f);
      }
    });

    this.on(this.e.root, 'click', (ev: MouseEvent) => {
      const t = (ev.target as HTMLElement).closest<HTMLElement>('[data-go], [data-pick], [data-style], [data-color], [data-act], [data-view], [data-level]');
      if (!t || !this.e.root.contains(t)) return;
      const ds = t.dataset;
      if (ds.go) {
        this.unfoldTo(ds.go);
        this.select(ds.go);
        return this.reveal(ds.go, true);
      }
      if (ds.pick) {
        const [kind, id] = ds.pick.split(':') as ['k' | 'p', string];
        this.selLink = { kind, id };
        this.inspEdit = kind === 'p';
        return this.render();
      }
      if (ds.level) return this.expandTo(Number(ds.level));
      if (ds.view) {
        const [k, v] = ds.view.split(':') as [keyof MDoc['view'], string | undefined];
        if (v === undefined) return this.toggleView(k as 'fx' | 'chips');
        return this.setView(k, v as never);
      }
      const n = this.node(this.sel);
      if (ds.style && n) {
        this.snapshot();
        const key = ds.style as 'bold' | 'mark';
        n[key] = !n[key];
        this.renderMap();
        this.renderForm(this.e.insp, n);
        return this.save();
      }
      if (ds.color !== undefined && t.closest('.me-form') && n) {
        this.snapshot();
        if (ds.color) n.color = ds.color as 'accent' | 'cinnabar';
        else delete n.color;
        this.renderMap();
        this.renderForm(this.e.insp, n);
        return this.save();
      }
      const acts: Record<string, () => void> = {
        edit: () => {
          this.inspEdit = true;
          this.renderInspector();
          this.e.insp.querySelector<HTMLElement>('[data-f="text"]')?.focus();
        },
        doneEdit: () => {
          this.inspEdit = false;
          this.render();
        },
        link: () => this.startLinking(),
        flipLink: () => {
          const l = this.doc.links.find((x) => x.id === this.selLink?.id);
          if (!l) return;
          this.snapshot();
          [l.from, l.to] = [l.to, l.from];
          this.render();
        },
        delLink: () => this.delLink(),
        prevHit: () => this.nextHit(-1),
        nextHit: () => this.nextHit(1),
      };
      acts[ds.act ?? '']?.();
    });

    this.on(this.e.insp, 'focusin', () => (this.pendingSnap = true));
    this.on(this.e.insp, 'input', (ev: Event) => {
      const t = ev.target as HTMLInputElement | HTMLTextAreaElement;
      const f = t.dataset.f;
      const lf = t.dataset.lf as keyof MLink | undefined;
      if (!f && !lf) return;
      if (this.pendingSnap) {
        this.snapshot();
        this.pendingSnap = false;
      }
      if (f) {
        const n = this.node(this.sel);
        if (!n) return;
        const v = t.value;
        const rec = n as unknown as Record<string, unknown>;
        if (f === 'f') n.f = v.split('\n').map((s) => s.trim()).filter(Boolean);
        else if (v.trim()) rec[f] = v;
        else if (f !== 'text') delete rec[f];
      } else if (lf) {
        const l = this.doc.links.find((x) => x.id === this.selLink?.id);
        if (l && (lf === 'label' || lf === 'reason' || lf === 'src')) l[lf] = t.value;
      }
      this.renderMap();
      this.renderStatus();
      this.save();
    });
    this.on(this.e.searchIn, 'input', () => this.runSearch(this.e.searchIn.value));
    this.on(this.e.searchIn, 'keydown', (ev: KeyboardEvent) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        this.nextHit(ev.shiftKey ? -1 : 1);
      }
    });
    this.on(this.e.fileIn, 'change', () => {
      const f = this.e.fileIn.files?.[0];
      if (f) this.importFile(f);
      this.e.fileIn.value = '';
    });
    const ro = new ResizeObserver(() => this.applyCam());
    ro.observe(board);
    this.off.push(() => ro.disconnect());
  }

  /** 大纲与详情栏的显隐由外框（React）管理，这里只发请求。 */
  private showPanel(which: 'outline' | 'inspector') {
    this.e.root.dispatchEvent(new CustomEvent('me-show', { detail: which }));
  }
  private clearDrop() {
    this.e.world.querySelectorAll('.drop-in, .drop-before, .drop-after').forEach((x) => x.classList.remove('drop-in', 'drop-before', 'drop-after'));
    if (this.drag?.kind === 'node') this.drag.target = null;
  }
  private delLink() {
    const id = this.selLink?.id;
    if (!id) return;
    this.snapshot();
    this.doc.links = this.doc.links.filter((x) => x.id !== id);
    this.selLink = null;
    this.render();
  }
}
