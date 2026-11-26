import { layoutGraph as layoutVGraph, texToText } from '../../content/veinGraph';

/**
 * 知识关联探索的数据模型与纯函数（不碰 DOM、不调模型，便于测试）。
 *
 * 一轮回答 = 一篇讲义体的短文（`note`，与工作台讲义同一种 Markdown 方言：栏目、旁栏、编号图表）
 *          + 一张关联图（`graph`，每条边都是带理由的候选关系）。
 * 模型直接写 Markdown，关联图放在文末的 ```vein-graph 代码块里（parseOutput 拆开）。
 * 复制进讲义、导出 Word / PPT、加入思维导图，都从这两样东西出发。
 *
 * 核对（checkResult）在幕后：写不出理由与条件的边不画；类比冒充事实的降级；编造的出处与节点去掉；
 * KaTeX 不认的写法自动改写；教材禁用的说法记下来。读者看到的是讲义，不是核对日志。
 */

export const MODES = [
  { id: 'fragments', label: '碎片串联', slot: 'connection.fragments', hint: '把零散的知识、题目、方法、截图放进来，看它们怎样连成一个结构', en: ['Link fragments', 'Drop in scattered concepts, problems, methods or screenshots, and see how they form one structure'] },
  { id: 'meta', label: '学科元思考', slot: 'connection.meta', hint: '说一门课或一个专题，从整体结构重新认识它', en: ['Subject meta-thinking', 'Name a course or a topic and re-see it through its overall structure'] },
  { id: 'cross', label: '跨学科并联', slot: 'connection.cross', hint: '说两个领域，看它们怎样相互改变理解，并提出新的问题与方法', en: ['Across disciplines', 'Name two fields and see how each changes your understanding of the other — and what new questions follow'] },
] as const;

export type ModeId = (typeof MODES)[number]['id'];

export const REL_TYPES = [
  'prerequisite',
  'derives-from',
  'defined-by',
  'equivalent-under',
  'generalizes',
  'applies-to',
  'shared-mechanism',
  'contrasts-with',
  'analogy-to',
  'counterexample-to',
  'contains',
] as const;
export type RelType = (typeof REL_TYPES)[number];

export const REL_NAME: Record<RelType, string> = {
  prerequisite: '前提',
  'derives-from': '由它推出',
  'defined-by': '用它定义',
  'equivalent-under': '条件等价',
  generalizes: '推广',
  'applies-to': '应用于',
  'shared-mechanism': '同一机制',
  'contrasts-with': '对照',
  'analogy-to': '类比',
  'counterexample-to': '反例',
  contains: '组成',
};

export const EPISTEMICS = ['source-backed', 'logically-derived', 'pedagogical-inference', 'analogy', 'hypothesis', 'user-personal'] as const;
export type Epistemic = (typeof EPISTEMICS)[number];

export const EPI_NAME: Record<Epistemic, string> = {
  'source-backed': '有出处',
  'logically-derived': '可推导',
  'pedagogical-inference': '教学归纳',
  analogy: '类比',
  hypothesis: '待验证',
  'user-personal': '我的',
};

/** 用户对一条线的态度（VISION 第四节）：收进图谱 / 先放着 / 不认同（可写理由）；proposed = 还没表态 */
export type EdgeStatus = 'proposed' | 'accepted' | 'pending' | 'rejected';

export const STATUS_NAME: Record<EdgeStatus, string> = { proposed: '', accepted: '已收进图谱', pending: '先放着', rejected: '不认同' };

export const NODE_KINDS = ['item', 'core', 'concept', 'structure', 'domain', 'idea'] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

export interface XNode {
  id: string;
  label: string;
  kind: NodeKind;
  layer: number;
  ref?: string;
  note?: string;
  x?: number;
  y?: number;
}

export interface XEdge {
  id: string;
  from: string;
  to: string;
  type: RelType;
  label: string;
  explanation: string;
  assumptions: string[];
  epistemic: Epistemic;
  boundary?: string;
  track?: 'C1' | 'C2';
  sources?: string[];
  status: EdgeStatus;
  reason?: string;
  edited?: boolean;
  mine?: boolean;
  relId?: string;
}

export interface ExploreResult {
  title: string;
  /** 讲义体正文（Markdown，含栏目块），不含关联图块 */
  note: string;
  graph: { nodes: XNode[]; edges: XEdge[] };
}

export interface Issue {
  level: 'removed' | 'changed' | 'warn';
  text: string;
}

export interface CheckContext {
  mode: ModeId;
  nodeIds: ReadonlySet<string>;
  anchors: ReadonlySet<string>;
}

/* ---------- 拆模型输出：Markdown + ```vein-graph ---------- */

const GRAPH_BLOCK = /```vein-graph\s*\n([\s\S]*?)\n```/g;

export function parseOutput(text: string): { note: string; graph: unknown; title: string } {
  let t = text.replace(/\r\n/g, '\n').trim();
  // 整篇被包在 ```markdown 里
  const wrapped = /^```(?:markdown|md)?\s*\n([\s\S]*)\n```\s*$/.exec(t);
  if (wrapped && !wrapped[1]!.includes('```vein-graph')) t = wrapped[1]!.trim();
  const blocks = [...t.matchAll(GRAPH_BLOCK)];
  let graph: unknown = null;
  const merged = { nodes: [] as unknown[], edges: [] as unknown[] };
  for (const b of blocks) {
    try {
      const g = JSON.parse(b[1]!) as { nodes?: unknown[]; edges?: unknown[] };
      merged.nodes.push(...(g.nodes ?? []));
      merged.edges.push(...(g.edges ?? []));
      graph = merged;
    } catch {
      /* 坏的图块跳过，核对时会说图是空的 */
    }
  }
  let note = t.replace(GRAPH_BLOCK, '').trim();
  // 标题之前的寒暄（「好的，以下是……」）去掉
  const h1 = note.search(/^#\s+/m);
  if (h1 > 0) note = note.slice(h1);
  const title = /^#\s+(.+)$/m.exec(note)?.[1]?.trim() ?? '';
  return { note: note.replace(/\n{3,}/g, '\n\n') + '\n', graph, title };
}

/* ---------- KaTeX 不认的写法：确定性改写 ---------- */

const REPAIRS: [RegExp, string][] = [
  [/\\begin\{psmallmatrix\}/g, '\\left(\\begin{smallmatrix}'],
  [/\\end\{psmallmatrix\}/g, '\\end{smallmatrix}\\right)'],
  [/\\begin\{bsmallmatrix\}/g, '\\left[\\begin{smallmatrix}'],
  [/\\end\{bsmallmatrix\}/g, '\\end{smallmatrix}\\right]'],
  [/\\coloneqq/g, ':='],
  [/\\(?:Set|set)\{/g, '\\{'],
];

export function repairTex(s: string): { text: string; fixed: number } {
  let fixed = 0;
  let text = s;
  for (const [re, to] of REPAIRS) {
    text = text.replace(re, () => {
      fixed += 1;
      return to;
    });
  }
  return { text, fixed };
}

/* ---------- 文风：教材禁用的说法（NOTE_GENERATION.md §6、§6.5 L6；QUALITY_BAR.md §2） ---------- */

const BANNED: { re: RegExp; why: string }[] = [
  { re: /(这是一个|这个问题)?(很|非常)好的问题/, why: '套话' },
  { re: /希望(这|以上)?(对你|能)有(所)?帮助/, why: '套话' },
  { re: /综上所述|总而言之|总的来说/, why: '元话语' },
  { re: /值得注意的是|需要指出的是|值得一提的是|不难发现|众所周知/, why: '元话语' },
  { re: /本(节|文)(将|主要)?(介绍|讨论)了?|下面我们(来)?|接下来(我们)?(将|会)|让我们(一起)?|下文(将|会)?(逐一|详细)?/, why: '说明文腔' },
  { re: /人们往往|读者往往|教材通常|很多人(以为|认为)/, why: '对读者的泛泛议论' },
  { re: /走向[^。，]{1,12}的一步/, why: '自评' },
  { re: /非常重要|十分重要|至关重要|核心难点|很隐蔽|其实不是|其实就是/, why: '自评重要性' },
  { re: /深刻地?(揭示|体现|反映)了?|(统一|数学|对称)之美/, why: '空洞的赞叹' },
  { re: /(范式|维度)层面|底层逻辑|赋能|抓手|闭环/, why: '黑话' },
];

export function lintProse(text: string): string[] {
  const plain = text.replace(/\$\$[\s\S]*?\$\$|\$[^$\n]*\$|```[\s\S]*?```/g, '');
  const out: string[] = [];
  for (const b of BANNED) {
    const m = b.re.exec(plain);
    if (m) out.push(`「${m[0]}」（${b.why}）`);
  }
  return out;
}

/* ---------- 核对 ---------- */

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
const isRel = (v: string): v is RelType => (REL_TYPES as readonly string[]).includes(v);
const isEpi = (v: string): v is Epistemic => (EPISTEMICS as readonly string[]).includes(v);
const isKind = (v: string): v is NodeKind => (NODE_KINDS as readonly string[]).includes(v);

const BOOKISH = /《|》|第\s*[0-9一二三四五六七八九十]+\s*[章节]|\(\d{4}\)|（\d{4}）|\bch(apter)?\.?\s*\d|https?:\/\//i;
const PATHISH = /\.(md|markdown|txt|pdf)(#|$)|^[^\s《:]+\/[^\s]+#/i;

export function sourceOk(s: string, anchors: ReadonlySet<string>): boolean {
  if (anchors.has(s)) return true;
  if (/^https?:\/\//i.test(s)) return true;
  if (PATHISH.test(s)) return false;
  return BOOKISH.test(s);
}

export function checkGraph(raw: unknown, ctx: CheckContext, issues: Issue[]): ExploreResult['graph'] {
  const g = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const nodes: XNode[] = [];
  const seen = new Set<string>();
  for (const n of Array.isArray(g.nodes) ? g.nodes : []) {
    const nn = (n ?? {}) as Record<string, unknown>;
    const id = str(nn.id);
    const label = str(nn.label);
    if (!id || !label || seen.has(id)) continue;
    seen.add(id);
    const kind = str(nn.kind);
    const layer = Number.isFinite(Number(nn.layer)) ? Math.max(0, Math.min(5, Math.round(Number(nn.layer)))) : 0;
    let ref = str(nn.ref) || undefined;
    if (ref && !ctx.nodeIds.has(ref)) {
      issues.push({ level: 'changed', text: `节点「${label}」指向的 ${ref} 不在工作区里，去掉了这个对应。` });
      ref = undefined;
    }
    nodes.push({ id, label: repairTex(label).text, kind: isKind(kind) ? kind : 'concept', layer, ref, note: str(nn.note) || undefined });
  }

  const edges: XEdge[] = [];
  const ids = new Set(nodes.map((n) => n.id));
  const nameOf = (id: string) => nodes.find((n) => n.id === id)?.label ?? id;
  let k = 0;
  for (const e of Array.isArray(g.edges) ? g.edges : []) {
    const ee = (e ?? {}) as Record<string, unknown>;
    const from = str(ee.from);
    const to = str(ee.to);
    const name = `「${nameOf(from)} → ${nameOf(to)}」`;
    if (!ids.has(from) || !ids.has(to) || from === to) {
      issues.push({ level: 'removed', text: `${name}连到了不存在的节点，没有画。` });
      continue;
    }
    const type = str(ee.type);
    if (!isRel(type)) {
      issues.push({ level: 'removed', text: `${name}的关系写成「${type || '空'}」，不是一种明确的关系，没有画。` });
      continue;
    }
    const explanation = str(ee.explanation);
    if (explanation.length < 12) {
      issues.push({ level: 'removed', text: `${name}没有说清为什么成立，没有画。` });
      continue;
    }
    const assumptions = strs(ee.assumptions);
    if (!assumptions.length) {
      issues.push({ level: 'removed', text: `${name}没有写成立的前提，没有画。` });
      continue;
    }
    let epistemic = str(ee.epistemic);
    if (!isEpi(epistemic) || epistemic === 'user-personal') epistemic = 'pedagogical-inference';
    const boundary = str(ee.boundary) || undefined;
    const sources = strs(ee.sources).filter((s) => {
      if (sourceOk(s, ctx.anchors)) return true;
      issues.push({ level: 'changed', text: `${name}引用的「${s}」不是这次给出的笔记片段，也不像文献，去掉了。` });
      return false;
    });
    let track: XEdge['track'];
    if (ctx.mode === 'cross') {
      const tr = str(ee.track).toUpperCase();
      track = tr === 'C1' ? 'C1' : 'C2';
      if (track === 'C2' && epistemic !== 'analogy' && epistemic !== 'hypothesis') {
        if (tr === 'C2') issues.push({ level: 'changed', text: `${name}是借来的视角，按类比标注。` });
        epistemic = 'analogy';
      }
      if (track === 'C1' && (epistemic === 'analogy' || epistemic === 'hypothesis' || type === 'analogy-to')) {
        issues.push({ level: 'changed', text: `${name}实际是类比，归到视角启发。` });
        track = 'C2';
        if (epistemic !== 'hypothesis') epistemic = 'analogy';
      }
    }
    if (type === 'analogy-to' && epistemic !== 'hypothesis') epistemic = 'analogy';
    if (epistemic === 'source-backed' && !sources.length) {
      issues.push({ level: 'changed', text: `${name}标了「有出处」但没有出处，改为「可推导」。` });
      epistemic = 'logically-derived';
    }
    if ((epistemic === 'analogy' || epistemic === 'hypothesis') && !boundary) {
      issues.push({ level: 'removed', text: `${name}是类比，但没有写在哪里不成立，没有画。` });
      continue;
    }
    let label = repairTex(str(ee.label)).text;
    if (texToText(label).length > 14) label = texToText(label).slice(0, 14);
    edges.push({
      id: str(ee.id) || `e${++k}`,
      from,
      to,
      type,
      label,
      explanation: repairTex(explanation).text,
      assumptions: assumptions.map((a) => repairTex(a).text),
      epistemic: epistemic as Epistemic,
      boundary: boundary && repairTex(boundary).text,
      track,
      sources: sources.length ? sources : undefined,
      status: 'proposed',
    });
  }
  const eids = new Set<string>();
  for (const e of edges) {
    while (eids.has(e.id)) e.id = `${e.id}-${++k}`;
    eids.add(e.id);
  }
  // 没有任何线的节点：图上不留孤点
  const linked = nodes.filter((n) => edges.some((e) => e.from === n.id || e.to === n.id));
  if (edges.length && linked.length < nodes.length) {
    const lonely = nodes.filter((n) => !linked.includes(n));
    issues.push({ level: 'removed', text: `${lonely.map((n) => `「${n.label}」`).join('')}没有站得住的连线，没有放进图。` });
  }
  return { nodes: edges.length ? linked : nodes, edges };
}

export function checkResult(out: { note: string; graph: unknown; title?: string }, ctx: CheckContext): { result: ExploreResult; issues: Issue[] } {
  const issues: Issue[] = [];
  const { text: note, fixed } = repairTex(out.note ?? '');
  if (fixed) issues.push({ level: 'changed', text: `有 ${fixed} 处公式用了网页显示不了的写法，已改成等价写法。` });
  if (!note.trim()) issues.push({ level: 'warn', text: '模型没有写正文。' });
  const lint = lintProse(note);
  if (lint.length) issues.push({ level: 'warn', text: `正文里有教材不用的说法：${lint.join('、')}。` });
  const graph = checkGraph(out.graph, ctx, issues);
  if (!graph.edges.length) issues.push({ level: 'warn', text: '关联图是空的。' });
  const title = out.title || /^#\s+(.+)$/m.exec(note)?.[1]?.trim() || '未命名的探索';
  return { result: { title, note, graph }, issues };
}

/* ---------- 布局 ---------- */

export const layoutGraph = layoutVGraph;

/* ---------- 导出：讲义 Markdown 与纯文本 ---------- */

/** 关联图块：节点位置与裁决一起带走（被拒绝的线不带） */
export function graphBlock(r: ExploreResult): string {
  const g = {
    title: r.title,
    nodes: r.graph.nodes.map(({ id, label, kind, layer, ref, x, y }) => ({ id, label, kind, layer, ...(ref ? { ref } : {}), ...(x !== undefined ? { x: Math.round(x), y: Math.round(y!) } : {}) })),
    edges: r.graph.edges
      .filter((e) => e.status !== 'rejected')
      .map(({ id, from, to, type, label, epistemic, explanation, assumptions, boundary, status, mine }) => ({
        id, from, to, type, label, epistemic, explanation, assumptions, ...(boundary ? { boundary } : {}), ...(status !== 'proposed' ? { status } : {}), ...(mine ? { mine } : {}),
      })),
  };
  return '```vein-graph\n' + JSON.stringify(g) + '\n```';
}

/** 把关联图包成讲义里的一幅编号图 */
export function graphFigure(r: ExploreResult, no = '图 1'): string {
  return `> [!figure] ${no}　${r.title.replace(/^#+\s*/, '')}的关联图\n> ${graphBlock(r).split('\n').join('\n> ')}`;
}

/**
 * 讲义 Markdown（复制进讲义、存成 .md、插入讲义都用它）。
 * level：插入到别的讲义里时把标题降一级，免得出现两个一级标题。
 */
export function lectureMarkdown(r: ExploreResult, opts: { note?: boolean; graph?: boolean; demote?: boolean } = {}): string {
  const { note = true, graph = true, demote = false } = opts;
  let body = note ? r.note.trim() : `# ${r.title}`;
  if (demote) body = body.replace(/^(#{1,5})\s/gm, '#$1 ');
  if (!graph || !r.graph.nodes.length) return body + '\n';
  // 图放在第一段正文之后（标题、问题探讨之后），像教材的插图
  const fig = graphFigure(r);
  if (!note) return `${body}\n\n${fig}\n`;
  const lines = body.split('\n');
  const firstH2 = lines.findIndex((l, i) => i > 0 && /^#{2,6}\s/.test(l));
  if (firstH2 < 0) return `${body}\n\n${fig}\n`;
  return [...lines.slice(0, firstH2), fig, '', ...lines.slice(firstH2)].join('\n') + '\n';
}

/** 讲义方言 → 通用 Markdown：栏目块变成带粗体标题的引用，去掉锚点与对齐标记（Word / PPT / 剪贴板用） */
export function plainMarkdown(md: string): string {
  return md
    // 资源卡只在知脉里有意义（从资源清单读标题与位置），导出到别处时去掉
    .replace(/^>\s*\[!res\][^\n]*\n?/gm, '')
    .replace(/^(>\s*)\[!(\w+)\][+-]?\s*([^\n@]*?)\s*(@[\w-]+)?\s*$/gm, (_, q: string, kind: string, title: string) => `${q}**${title.trim() || CALLOUT_TITLE[kind] || ''}**`)
    .replace(/\s\^[A-Za-z0-9-]+\s*$/gm, '')
    .replace(/```vein-graph[\s\S]*?```/g, '');
}

const CALLOUT_TITLE: Record<string, string> = {
  problem: '问题探讨', focus: '本节聚焦', side: '相关信息', ask: '思考', xref: '知识链接', res: '资源', figure: '图', table: '表',
  practice: '探究·实践', discuss: '思考·讨论', critical: '批判性思维', training: '思维训练', exercise: '练习与应用', summary: '小结', method: '方法',
};

/* ---------- 关联图 → 导图 ---------- */

export function spanningTree(r: ExploreResult): { root: string | null; kids: Map<string, { id: string; via?: XEdge }[]> } {
  const nodes = r.graph.nodes;
  const edges = r.graph.edges.filter((e) => e.status !== 'rejected');
  const kids = new Map<string, { id: string; via?: XEdge }[]>();
  if (!nodes.length) return { root: null, kids };
  const maxLayer = Math.max(...nodes.map((n) => n.layer));
  const top = nodes.filter((n) => n.layer === maxLayer);
  const placed = new Set<string>();
  const queue: string[] = [];
  for (const t of top) {
    placed.add(t.id);
    queue.push(t.id);
  }
  while (queue.length) {
    const id = queue.shift()!;
    for (const e of edges) {
      const other = e.from === id ? e.to : e.to === id ? e.from : null;
      if (!other || placed.has(other)) continue;
      placed.add(other);
      queue.push(other);
      kids.set(id, [...(kids.get(id) ?? []), { id: other, via: e }]);
    }
  }
  for (const n of nodes) if (!placed.has(n.id)) kids.set(top[0]!.id, [...(kids.get(top[0]!.id) ?? []), { id: n.id }]);
  return { root: top.length === 1 ? top[0]!.id : null, kids };
}

export function toOutline(r: ExploreResult): string {
  const { root, kids } = spanningTree(r);
  const label = (id: string) => r.graph.nodes.find((n) => n.id === id)?.label ?? id;
  const lines: string[] = [];
  const walk = (id: string, d: number) => {
    lines.push(`${'  '.repeat(d)}${label(id)}`);
    for (const k of kids.get(id) ?? []) walk(k.id, d + 1);
  };
  if (root) walk(root, 0);
  else {
    lines.push(r.title);
    const maxLayer = Math.max(...r.graph.nodes.map((n) => n.layer));
    for (const t of r.graph.nodes.filter((n) => n.layer === maxLayer)) walk(t.id, 1);
  }
  return lines.join('\n');
}

/** 正文第一段（导图分支的笔记、历史列表的摘要用） */
export function leadParagraph(note: string): string {
  for (const block of note.split(/\n\s*\n/)) {
    const b = block.trim();
    if (!b || b.startsWith('#') || b.startsWith('>') || b.startsWith('```') || b.startsWith('|') || b.startsWith('$$')) continue;
    return b.replace(/\s\^[A-Za-z0-9-]+$/, '');
  }
  return '';
}
