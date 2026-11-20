import { demoGraph, demoKb } from '../../app/demo';
import { buildDemoMap, type MapNode } from './mindmapData';

/**
 * 可编辑思维导图的文档模型与纯函数操作（不碰 DOM，便于测试）。
 *
 * 两类连线严格分开（AGENTS.md §1 第 3 条）：
 * - 知识关系：来自工作区的 graph.json，带理由、成立条件与认知状态，导图里只读；
 * - 我的连线（MLink）：用户在导图上手画，理由选填，只表达「我怎么记」，界面上与知识关系一眼可分。
 */

export interface MNode {
  id: string;
  text: string;
  kids: MNode[];
  /** 对应的图谱节点 id（来自知识库） */
  ref?: string;
  /** 一行一条 LaTeX */
  f?: string[];
  /** 出处 */
  src?: string;
  /** 角标（如「补 本构关系」）与它的说明 */
  tag?: string;
  tagNote?: string;
  /** 把它逼出来的现象 */
  phen?: string;
  /** 容易混淆 */
  contrast?: string;
  /** 推导与动机：# 标题，## 小标题，$$独立公式$$，其余为段落 */
  notes?: string;
  bold?: boolean;
  mark?: boolean;
  color?: 'accent' | 'cinnabar';
  fold?: boolean;
  /** 只对第一层有意义：分区色与所在的一侧 */
  band?: number;
  side?: 1 | -1;
}

export interface MLink {
  id: string;
  from: string;
  to: string;
  label: string;
  reason: string;
  src: string;
}

export interface MView {
  links: 'sel' | 'all' | 'none';
  fx: boolean;
  chips: boolean;
  layout: 'both' | 'right';
  level: number | null;
}

export interface MDoc {
  version: 2;
  title: string;
  root: MNode;
  links: MLink[];
  view: MView;
  seq: number;
}

export const DEFAULT_VIEW: MView = { links: 'sel', fx: true, chips: true, layout: 'both', level: null };

/* ---------- 索引 ---------- */

export interface Index {
  byId: Map<string, MNode>;
  parent: Map<string, MNode | null>;
  depth: Map<string, number>;
  band: Map<string, number>;
  side: Map<string, 1 | -1>;
}

export function indexDoc(doc: MDoc): Index {
  const ix: Index = { byId: new Map(), parent: new Map(), depth: new Map(), band: new Map(), side: new Map() };
  const walk = (n: MNode, p: MNode | null, d: number, band: number, side: 1 | -1) => {
    if (d === 1) {
      band = n.band ?? 0;
      side = doc.view.layout === 'right' ? 1 : n.side ?? 1;
    }
    ix.byId.set(n.id, n);
    ix.parent.set(n.id, p);
    ix.depth.set(n.id, d);
    ix.band.set(n.id, band);
    ix.side.set(n.id, side);
    n.kids.forEach((k) => walk(k, n, d + 1, band, side));
  };
  walk(doc.root, null, 0, 0, 1);
  return ix;
}

export function ancestors(ix: Index, id: string): MNode[] {
  const out: MNode[] = [];
  let p = ix.parent.get(id) ?? null;
  while (p) {
    out.unshift(p);
    p = ix.parent.get(p.id) ?? null;
  }
  return out;
}

export function isDescendant(ix: Index, ancestorId: string, id: string): boolean {
  return ancestors(ix, id).some((a) => a.id === ancestorId);
}

export function countDescendants(n: MNode): number {
  return n.kids.reduce((s, k) => s + 1 + countDescendants(k), 0);
}

export function subtreeIds(n: MNode): Set<string> {
  const s = new Set<string>();
  const w = (x: MNode) => {
    s.add(x.id);
    x.kids.forEach(w);
  };
  w(n);
  return s;
}

export function newId(doc: MDoc): string {
  doc.seq += 1;
  return 'm' + doc.seq.toString(36) + Math.random().toString(36).slice(2, 5);
}

/* ---------- 结构操作：原地修改 doc，返回新选中的 id；不可操作时返回 null ---------- */

function balanceSide(doc: MDoc): 1 | -1 {
  const weight = (s: 1 | -1) =>
    doc.root.kids.filter((k) => (k.side ?? 1) === s).reduce((a, k) => a + 1 + countDescendants(k), 0);
  return weight(-1) < weight(1) ? -1 : 1;
}

function makeTop(doc: MDoc, n: MNode, like?: MNode) {
  n.band = like ? like.band ?? 0 : doc.root.kids.length % 3;
  n.side = like ? like.side ?? 1 : balanceSide(doc);
}

export function addChild(doc: MDoc, id: string): string | null {
  const ix = indexDoc(doc);
  const n = ix.byId.get(id);
  if (!n) return null;
  n.fold = false;
  const c: MNode = { id: newId(doc), text: n === doc.root ? '分支主题' : '子主题', kids: [] };
  if (n === doc.root) makeTop(doc, c);
  n.kids.push(c);
  return c.id;
}

export function addSibling(doc: MDoc, id: string, before = false): string | null {
  const ix = indexDoc(doc);
  const n = ix.byId.get(id);
  const p = ix.parent.get(id);
  if (!n) return null;
  if (!p) return addChild(doc, id);
  const c: MNode = { id: newId(doc), text: p === doc.root ? '分支主题' : '子主题', kids: [] };
  if (p === doc.root) makeTop(doc, c, n);
  const i = p.kids.indexOf(n);
  p.kids.splice(before ? i : i + 1, 0, c);
  return c.id;
}

export function insertParent(doc: MDoc, id: string): string | null {
  const ix = indexDoc(doc);
  const n = ix.byId.get(id);
  const p = ix.parent.get(id);
  if (!n || !p) return null;
  const c: MNode = { id: newId(doc), text: '主题', kids: [n] };
  if (p === doc.root) {
    c.band = n.band;
    c.side = n.side;
  }
  p.kids.splice(p.kids.indexOf(n), 1, c);
  return c.id;
}

/** 删除一个主题及其分支；连到被删主题的「我的连线」一并删除。返回删除后应选中的 id。 */
export function removeNode(doc: MDoc, id: string): string | null {
  const ix = indexDoc(doc);
  const n = ix.byId.get(id);
  const p = ix.parent.get(id);
  if (!n || !p) return null;
  const i = p.kids.indexOf(n);
  p.kids.splice(i, 1);
  const gone = subtreeIds(n);
  doc.links = doc.links.filter((l) => !gone.has(l.from) && !gone.has(l.to));
  return (p.kids[i] ?? p.kids[i - 1] ?? p).id;
}

export function moveSibling(doc: MDoc, id: string, dir: -1 | 1): boolean {
  const ix = indexDoc(doc);
  const n = ix.byId.get(id);
  const p = ix.parent.get(id);
  if (!n || !p) return false;
  const i = p.kids.indexOf(n);
  const j = i + dir;
  if (j < 0 || j >= p.kids.length) return false;
  p.kids.splice(i, 1);
  p.kids.splice(j, 0, n);
  return true;
}

/** 拖拽换位：in = 成为目标的最后一个子主题；before / after = 插到目标的前或后。 */
export function moveNode(doc: MDoc, id: string, targetId: string, mode: 'in' | 'before' | 'after'): boolean {
  const ix = indexDoc(doc);
  const n = ix.byId.get(id);
  const t = ix.byId.get(targetId);
  const oldP = ix.parent.get(id);
  if (!n || !t || !oldP || n === t || isDescendant(ix, id, targetId)) return false;
  const tParent = ix.parent.get(targetId) ?? null;
  if (mode !== 'in' && !tParent) return false;
  oldP.kids.splice(oldP.kids.indexOf(n), 1);
  let newP: MNode;
  if (mode === 'in') {
    t.fold = false;
    t.kids.push(n);
    newP = t;
  } else {
    newP = tParent!;
    newP.kids.splice(newP.kids.indexOf(t) + (mode === 'after' ? 1 : 0), 0, n);
  }
  if (newP === doc.root) makeTop(doc, n, mode === 'in' ? undefined : t);
  return true;
}

/** 收起到第 level 层：深度 ≥ level 的主题收起（level ≥ 99 即全部展开）。 */
export function foldToLevel(doc: MDoc, level: number) {
  const ix = indexDoc(doc);
  for (const [id, n] of ix.byId) {
    const d = ix.depth.get(id) ?? 0;
    if (n.kids.length && d > 0) n.fold = d >= level;
  }
  doc.view.level = level;
}

/* ---------- 复制粘贴 ---------- */

export function toOutline(n: MNode, depth = 0): string {
  return '\t'.repeat(depth) + n.text.replace(/\n/g, ' ') + '\n' + n.kids.map((k) => toOutline(k, depth + 1)).join('');
}

/** 复制出的分支换一套 id，去掉只属于第一层的属性。 */
export function cloneBranch(doc: MDoc, n: MNode): MNode {
  const c = JSON.parse(JSON.stringify(n)) as MNode;
  const w = (x: MNode) => {
    x.id = newId(doc);
    delete x.band;
    delete x.side;
    x.kids.forEach(w);
  };
  w(c);
  return c;
}

/** 缩进文本（Tab、两个空格、「- 」列表或 # 标题）→ 一组分支。 */
export function parseOutline(doc: MDoc, text: string): MNode[] {
  const top: MNode = { id: '', text: '', kids: [] };
  const stack: { lvl: number; n: MNode }[] = [{ lvl: -1, n: top }];
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    if (!raw.trim()) continue;
    const m = /^(\s*)(?:[-*+]\s+|\d+[.)]\s+|(#+)\s+)?(.*)$/.exec(raw);
    if (!m) continue;
    let lvl = (m[1] ?? '').replace(/ {2}/g, '\t').replace(/ /g, '').length;
    if (m[2]) lvl = m[2].length - 1;
    const n: MNode = { id: newId(doc), text: (m[3] ?? '').trim(), kids: [] };
    while (stack.length > 1 && stack[stack.length - 1]!.lvl >= lvl) stack.pop();
    stack[stack.length - 1]!.n.kids.push(n);
    stack.push({ lvl, n });
  }
  return top.kids;
}

export function pasteBranches(doc: MDoc, id: string, branches: MNode[]): string | null {
  const ix = indexDoc(doc);
  const n = ix.byId.get(id);
  if (!n || !branches.length) return null;
  n.fold = false;
  for (const b of branches) {
    if (n === doc.root) makeTop(doc, b);
    n.kids.push(b);
  }
  return branches[0]!.id;
}

/* ---------- 导出 ---------- */

const plainTex = (s: string) => s.replace(/\$\$?([^$]+)\$\$?/g, '$1');

/** 导出为 Markdown：前三层是标题，更深是列表；公式、角标、笔记与「我的连线」都带上。 */
export function toMarkdown(doc: MDoc): string {
  const out: string[] = ['# ' + doc.title, ''];
  const w = (n: MNode, d: number) => {
    const head = d <= 2 ? '#'.repeat(d + 2) + ' ' : '  '.repeat(d - 3) + '- ';
    const pre = d <= 2 ? '' : '  '.repeat(d - 2);
    out.push(head + n.text.replace(/\n/g, ' '));
    if (n.src) out.push(pre + '出处：' + n.src);
    (n.f ?? []).forEach((k) => out.push(pre + '$$' + k + '$$'));
    if (n.tag) out.push(pre + '> **' + n.tag + '**' + (n.tagNote ? '：' + n.tagNote : ''));
    if (n.phen) out.push(pre + '> **把它逼出来的现象**：' + n.phen);
    if (n.contrast) out.push(pre + '> **容易混淆**：' + n.contrast);
    if (n.notes) n.notes.split('\n').forEach((l) => out.push(pre + (/^#+\s/.test(l) ? '**' + l.replace(/^#+\s*/, '') + '**' : l)));
    if (d <= 2) out.push('');
    n.kids.forEach((k) => w(k, d + 1));
  };
  w(doc.root, 0);
  if (doc.links.length) {
    const ix = indexDoc(doc);
    out.push('', '## 我的连线', '');
    for (const l of doc.links) {
      const a = ix.byId.get(l.from);
      const b = ix.byId.get(l.to);
      if (!a || !b) continue;
      out.push('- ' + plainTex(a.text) + '，' + l.label + '，' + plainTex(b.text) + (l.reason ? '：' + l.reason : '') + (l.src ? '（' + l.src + '）' : ''));
    }
  }
  return out.join('\n') + '\n';
}

/** 个人记忆图谱以思维导图为本源：转成它使用的简单树。文字保留 $…$，由记忆图谱渲染公式。 */
export function toMapNode(n: MNode): MapNode {
  return { id: n.id, text: n.text, ref: n.ref, children: n.kids.map(toMapNode) };
}

/**
 * 挖空比对用的「答案指纹」：去掉 $、LaTeX 命令名、花括号、空白与全角标点差异。
 * 例如 `残差 $\mathbf e=\mathbf b-\mathbf p$` 与用户写的「残差 e=b-p」视为一致。
 */
export function answerKey(s: string): string {
  return s
    .replace(/\$/g, '')
    .replace(/\\(?:mathbf|mathrm|mathsf|boldsymbol|operatorname|hat|vec|bar|tilde|left|right|quad|qquad)\b/g, '')
    .replace(/\\[,;!]/g, '')
    .replace(/\\top\b/g, 'T')
    .replace(/[{}\s]/g, '')
    .replace(/＝/g, '=')
    .replace(/－|−/g, '-')
    .toLowerCase();
}

/* ---------- 存储与示例 ---------- */

/** 旧版的 localStorage 键，只用于迁移；现在导图存在工作区的 maps/mind.json */
export const MIND_DOC_KEY = 'vein.mind.linear-algebra.v2';

/** 讲义 §2.1 原文里的公式，挂到对应的叶子上（不新增知识）。 */
const NOTE_FORMULAS: Record<string, string[]> = {
  'n.colspace': ['\\operatorname{Col}(A)=\\{A\\mathbf x:\\ \\mathbf x\\in\\mathbb R^n\\}'],
  'n.orthogonality': ['\\mathbf a_i^{\\mathsf T}(\\mathbf b-A\\hat{\\mathbf x})=0'],
  'n.normal-eq': ['A^{\\mathsf T}A\\,\\hat{\\mathbf x}=A^{\\mathsf T}\\mathbf b'],
  'n.unique-solution': ['\\hat{\\mathbf x}=(A^{\\mathsf T}A)^{-1}A^{\\mathsf T}\\mathbf b'],
};
/** 主线四段的分区：问题（有没有解、无解怎么办）、方法（最近点）、推广（一阶最优条件）。 */
const BANDS = [0, 0, 1, 2];

export function seedDoc(): MDoc {
  const doc: MDoc = { version: 2, title: demoKb.title.split('：')[0] ?? demoKb.title, root: { id: 'root', text: '', kids: [] }, links: [], view: { ...DEFAULT_VIEW, layout: 'right' }, seq: 0 };
  const conv = (m: MapNode, d: number, i: number): MNode => {
    const n: MNode = { id: m.id, text: m.text, kids: m.children.map((c, j) => conv(c, d + 1, j)) };
    if (m.ref) {
      n.ref = m.ref;
      const f = NOTE_FORMULAS[m.ref];
      if (f) {
        n.f = f;
        n.src = '讲义 §2.1';
      }
    }
    if (d === 1) {
      n.band = BANDS[i] ?? i % 3;
      n.side = 1;
    }
    return n;
  };
  doc.root = conv(buildDemoMap(), 0, 0);
  doc.root.src = demoKb.subtitle;
  return doc;
}

/** 校验一份存下来的导图（maps/mind.json 或旧的 localStorage），不合格返回 null。 */
export function normalizeDoc(o: unknown): MDoc | null {
  const d = o as Partial<MDoc> | null;
  if (!d || typeof d !== 'object' || d.version !== 2 || !d.root || typeof d.root.id !== 'string' || !Array.isArray(d.root.kids)) return null;
  return { ...(d as MDoc), view: { ...DEFAULT_VIEW, ...d.view }, links: d.links ?? [], seq: d.seq ?? 1000 };
}

/**
 * 读旧版存在 localStorage 里的示例导图（2026-11-19 之前），只用于一次性迁移到示例工作区的 maps/mind.json。
 * 没有或损坏时回到示例。
 */
export function loadDoc(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): MDoc {
  try {
    const raw = storage?.getItem(MIND_DOC_KEY);
    const doc = raw ? normalizeDoc(JSON.parse(raw)) : null;
    if (doc) return doc;
  } catch {
    /* 存储损坏时回到示例 */
  }
  return seedDoc();
}

/** 空白导图：只有中心主题，由用户自己从这里长出来。 */
export function blankDoc(title: string): MDoc {
  return { version: 2, title, root: { id: 'root', text: title, kids: [] }, links: [], view: { ...DEFAULT_VIEW }, seq: 0 };
}

export function serialize(doc: MDoc): string {
  return JSON.stringify(doc);
}

/** 校验导入的 JSON 是否是本导图的文档。 */
export function parseImported(text: string): MDoc | null {
  try {
    const o = JSON.parse(text) as Partial<MDoc>;
    if (!o || typeof o !== 'object' || !o.root || typeof o.root.id !== 'string' || !Array.isArray(o.root.kids)) return null;
    return { version: 2, title: o.title ?? '思维导图', root: o.root, links: o.links ?? [], view: { ...DEFAULT_VIEW, ...o.view }, seq: o.seq ?? 1000 };
  } catch {
    return null;
  }
}

/* ---------- 来自知识库的只读信息 ---------- */

const KIND: Record<string, string> = { theorem: '定理', concept: '概念', method: '方法', example: '例子' };
export const REL_LABEL: Record<string, string> = {
  prerequisite: '先修',
  'derives-from': '推出',
  'equivalent-under': '等价',
  'shared-mechanism': '同一机制',
  'contrasts-with': '对照',
  'defined-by': '由它刻画',
  'analogy-to': '类比',
};
export const EPISTEMIC_LABEL: Record<string, string> = {
  'source-backed': '有出处',
  'logically-derived': '可推导',
  'pedagogical-inference': '教学归纳',
  analogy: '类比',
  hypothesis: '待验证',
  'user-personal': '我的',
};

export interface KRelation {
  id: string;
  from: string;
  to: string;
  type: string;
  label: string;
  explanation: string;
  assumptions: string[];
  epistemic: string;
}

export interface KnowledgeContext {
  info(ref: string): { kind: string; aliases: string[]; title: string } | null;
  relations: KRelation[];
}

/** 工作区 graph.json 里导图要用到的那部分（字段真源见 schemas/graph.schema.json） */
export interface GraphLike {
  nodes: { id: string; kind: string; title: string; aliases?: string[] }[];
  relations: { id: string; from: string; to: string; type: string; status?: string; explanation: string; assumptions: string[]; epistemic: string }[];
}

export const EMPTY_KNOWLEDGE: KnowledgeContext = { info: () => null, relations: [] };

export function demoKnowledge(): KnowledgeContext {
  return graphKnowledge(demoGraph);
}

/** 从任一工作区的 graph.json 得到导图的只读知识上下文；只取已接受的关系。 */
export function graphKnowledge(graph: GraphLike): KnowledgeContext {
  const nodes = new Map((graph.nodes ?? []).map((n) => [n.id, n]));
  return {
    info(ref) {
      const n = nodes.get(ref);
      return n ? { kind: KIND[n.kind] ?? n.kind, aliases: n.aliases ?? [], title: n.title } : null;
    },
    relations: (graph.relations ?? [])
      .filter((r) => r.status === 'accepted')
      .map((r) => ({
        id: r.id,
        from: r.from,
        to: r.to,
        type: r.type,
        label: REL_LABEL[r.type] ?? r.type,
        explanation: r.explanation,
        assumptions: r.assumptions,
        epistemic: r.epistemic,
      })),
  };
}

/** 一个主题涉及的成立条件：与它相连的知识关系的前提，去重。 */
export function assumptionsOf(ctx: KnowledgeContext, ref: string): { text: string; rel: KRelation }[] {
  const seen = new Set<string>();
  const out: { text: string; rel: KRelation }[] = [];
  for (const r of ctx.relations) {
    if (r.from !== ref && r.to !== ref) continue;
    for (const a of r.assumptions) {
      if (seen.has(a)) continue;
      seen.add(a);
      out.push({ text: a, rel: r });
    }
  }
  return out;
}
