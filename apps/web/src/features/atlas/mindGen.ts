import { chat, extractJson, ModelError } from '../../ai/chat';
import { promptFor } from '../../ai/prompts';
import { readJson, readText } from '../../store/open';
import type { WorkspaceStore } from '../../store/types';
import type { ModelConfig } from '../../ui/prefs';
import { DEFAULT_VIEW, type GraphLike, type MDoc, type MNode } from './mindDoc';

/**
 * 用用户自己的模型，从工作区资料生成第一张思维导图（prompts/MINDMAP.md，位置 atlas.mindmap）。
 *
 * 分工（SYNC_AND_API.md §5 同一思路）：
 * - 收集材料、切出带出处的片段、核对输出 —— 确定性代码，不交给模型；
 * - 组织层级、写角标与入口现象 —— 交给模型；
 * - 模型的输出逐项核对：公式必须能在笔记原文里找到，出处必须是真实片段，ref 必须是图谱里的节点。
 *   核对不过的字段删掉并告诉用户，而不是照单全收（AGENTS.md §1 第 2 条「保真优先于好看」）。
 * 生成结果只是预览，用户确认后才写进 maps/mind.json（AGENTS.md §1 第 4 条）。
 */

export interface NoteSpan {
  /** `路径#标题`，没有标题的开头段落就是路径本身 */
  anchor: string;
  text: string;
}

export interface MindInput {
  kb: { title?: string; subtitle?: string } | null;
  nodes: { id: string; title: string; kind: string; aliases: string[] }[];
  relations: { id: string; from: string; to: string; type: string; explanation: string; assumptions: string[]; epistemic: string }[];
  notes: NoteSpan[];
  /** 更新时传入用户当前的导图；生成时为 null */
  existingMap: MDoc | null;
  userRequest: string;
}

export interface Collected {
  input: MindInput;
  /** 读了几份笔记、送出多少字、因为太长没送的片段数、被截断的片段数 */
  stats: { files: number; chars: number; dropped: number; truncated: number };
}

/** 单次请求里笔记原文的总字数上限：常见模型 64k 上下文里留出提示词、图谱与输出的空间 */
export const NOTE_BUDGET = 32_000;
/** 更新已有导图时笔记原文的上限：旧图本身已带着全部主题，笔记只补相关出处 */
export const UPDATE_BUDGET = 12_000;
/** 单段上限：一段太长时只取前一部分，别让一段吃掉整个预算 */
export const SPAN_CAP = 2_400;

const NOTE_FILE = /\.(md|markdown|txt)$/i;
const SKIP = /^(maps|\.vein)\//;

/** 按标题切成片段，每段记下出处锚点。 */
export function splitNote(path: string, text: string): NoteSpan[] {
  const out: NoteSpan[] = [];
  let anchor = path;
  let buf: string[] = [];
  const push = () => {
    const body = buf.join('\n').trim();
    if (body) out.push({ anchor, text: body });
    buf = [];
  };
  let fence = false;
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    const h = fence ? null : /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (h) {
      push();
      anchor = `${path}#${h[1]}`;
    }
    buf.push(line);
  }
  push();
  return out;
}

/** 与 connection/exploreAi.terms 同样的二元组切词；exploreAi 已从本文件引 splitNote，反向引会成循环，故本地写一份 */
function queryTerms(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of text.toLowerCase().match(/[a-z][a-z0-9]{2,}/g) ?? []) out.add(w);
  for (const run of text.match(/[一-鿿]+/g) ?? []) for (let i = 0; i + 1 < run.length; i += 1) out.add(run.slice(i, i + 2));
  return out;
}

export interface CollectOpts {
  /** 额外的检索词（如用户这次的改图要求） */
  query?: string;
  /** 笔记原文预算，默认 NOTE_BUDGET */
  budget?: number;
  /** false 时按文件原序收取（「按资料更新」要覆盖新材料，不能只挑与旧图相关的） */
  ranked?: boolean;
}

export async function collectInput(store: WorkspaceStore, title: string, graph: GraphLike | null, opts: CollectOpts = {}): Promise<Collected> {
  const entries = (await store.list('')).filter((e) => NOTE_FILE.test(e.path) && !SKIP.test(e.path));
  entries.sort((a, b) => a.path.localeCompare(b.path, 'zh'));
  let kb: MindInput['kb'] = null;
  try {
    kb = await readJson<{ title?: string; subtitle?: string }>(store, 'kb.json');
  } catch {
    kb = null;
  }
  const all: NoteSpan[] = [];
  for (const e of entries) {
    const text = await readText(store, e.path);
    if (text) all.push(...splitNote(e.path, text));
  }
  // 相关度＝命中的检索词数 / 段长惩罚：图谱节点标题、kb 标题与本次请求里的词优先，
  // 同分时保持文件原序；一个词都没命中时退回原序，不丢材料
  const q = [...queryTerms([opts.query ?? '', kb?.title ?? title, kb?.subtitle ?? '', ...(graph?.nodes ?? []).flatMap((n) => [n.title, ...(n.aliases ?? [])])].join(' '))].slice(0, 160);
  const scored = all.map((s, i) => {
    const low = s.text.toLowerCase();
    const hit = q.filter((t) => low.includes(t)).length;
    return { s, i, score: hit / Math.sqrt(Math.max(200, s.text.length) / 200) };
  });
  if (opts.ranked !== false && scored.some((x) => x.score > 0)) scored.sort((a, b) => b.score - a.score || a.i - b.i);
  const budget = opts.budget ?? NOTE_BUDGET;
  const picked: { span: NoteSpan; i: number }[] = [];
  let chars = 0;
  let dropped = 0;
  let truncated = 0;
  for (const x of scored) {
    const text = x.s.text.length > SPAN_CAP ? x.s.text.slice(0, SPAN_CAP) + '…' : x.s.text;
    if (x.s.text.length > SPAN_CAP) truncated += 1;
    if (chars + text.length > budget) {
      dropped += 1;
      continue;
    }
    chars += text.length;
    picked.push({ span: { anchor: x.s.anchor, text }, i: x.i });
  }
  picked.sort((a, b) => a.i - b.i);
  return {
    input: {
      kb: kb ? { title: kb.title, subtitle: kb.subtitle } : { title },
      nodes: (graph?.nodes ?? []).map((n) => ({ id: n.id, title: n.title, kind: n.kind, aliases: n.aliases ?? [] })),
      relations: (graph?.relations ?? [])
        .filter((r) => r.status === 'accepted')
        .map(({ id, from, to, type, explanation, assumptions, epistemic }) => ({ id, from, to, type, explanation, assumptions, epistemic })),
      notes: picked.map((x) => x.span),
      existingMap: null,
      userRequest: '生成一张思维导图',
    },
    stats: { files: entries.length, chars, dropped, truncated },
  };
}

const CONTRACT = `## 本次输出格式（覆盖上文「输出」一节中与此冲突的部分）

只输出一个 JSON 对象，不要任何解释或前后缀。结构：

{ "title": "导图标题", "root": MNode }

MNode = { "id": string, "text": string, "kids": MNode[], "ref"?: string, "f"?: string[], "src"?: string,
          "tag"?: string, "tagNote"?: string, "phen"?: string, "contrast"?: string, "notes"?: string, "band"?: 0 | 1 | 2 }

- id：短英文，全图唯一；中心主题的 id 写 "root"。
- ref：只能填输入 nodes 里已有的 id；对应不上就不填。
- f：公式只能逐字抄输入 notes 里出现过的 LaTeX，去掉两边的 $ 或 $$，一行一条；原文没有的公式不要写。
- src：只能填输入 notes 里某一段的 anchor 原样。
- band：只给第一层主题，0 / 1 / 2 表示问题 / 方法 / 推广（或原文自己的三个大分区）。
- 不要输出 links：跨分支的知识关系由界面从图谱自动显示；「我的连线」只能由用户自己画。
- 补充的 tag / tagNote / phen / contrast 若原文没有出处，在该字段末尾写「（未标出处）」。`;

export async function buildMessages(store: WorkspaceStore, input: MindInput) {
  const prompt = await promptFor('atlas.mindmap', store);
  return {
    overridden: prompt.overridden,
    messages: [
      { role: 'system' as const, content: prompt.text },
      { role: 'user' as const, content: `${CONTRACT}\n\n## 输入\n\n\`\`\`json\n${JSON.stringify(input, null, 1)}\n\`\`\`` },
    ],
  };
}

/* ---------- 核对模型输出 ---------- */

export interface Checked {
  doc: MDoc;
  /** 核对时删掉或改动的地方，原样给用户看 */
  fixes: string[];
  /** 不违规但不达标的地方（MINDMAP.md §6 自检） */
  warnings: string[];
  count: number;
}

/** 出处在导图上的写法：`notes/第一章 应力.md#主应力` → `第一章 应力 § 主应力`（与示例的「讲义 §2.1」同一种读法） */
export function srcLabel(anchor: string): string {
  const [path, heading] = anchor.split('#');
  const file = (path ?? '').split('/').at(-1)!.replace(/\.(md|markdown|txt)$/i, '');
  return heading ? `${file} § ${heading}` : file;
}

/** 公式比对用：去掉空白与 $ 定界符 */
const squash = (s: string) => s.replace(/\$/g, '').replace(/\s+/g, '');

const str = (v: unknown, max = 4000) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);

/** 一份导图里已有的公式 / 出处 / ref / 第一层分区：更新时这些是用户已经认可的，不算模型编造 */
function existing(doc: MDoc | null) {
  const f = new Set<string>();
  const src = new Set<string>();
  const ref = new Set<string>();
  const band = new Map<string, number>();
  const walk = (n: MNode) => {
    (n.f ?? []).forEach((k) => f.add(squash(k)));
    if (n.src) src.add(n.src);
    if (n.ref) ref.add(n.ref);
    if (n.band !== undefined) band.set(n.id, n.band);
    n.kids.forEach(walk);
  };
  if (doc) walk(doc.root);
  return { f, src, ref, band };
}

export function checkOutput(raw: unknown, input: MindInput): Checked {
  const o = raw as { title?: unknown; root?: unknown } | null;
  if (!o || typeof o !== 'object' || !o.root || typeof o.root !== 'object') throw new ModelError('模型的回答里没有导图（缺少 root）。');

  const prev = input.existingMap;
  const kept = existing(prev);
  const nodeIds = new Set([...input.nodes.map((n) => n.id), ...kept.ref]);
  const anchors = new Set(input.notes.map((n) => n.anchor));
  const corpus = squash(input.notes.map((n) => n.text).join('\n'));
  const seen = new Set<string>();
  let badRef = 0;
  let badF = 0;
  let badSrc = 0;
  let dupId = 0;
  let count = 0;
  let wide = 0;
  let seq = 0;

  const conv = (r: unknown, depth: number, index: number): MNode | null => {
    const x = r as Record<string, unknown> | null;
    if (!x || typeof x !== 'object') return null;
    const text = str(x.text, 200);
    if (!text) return null;
    let id = depth === 0 ? 'root' : str(x.id, 60)?.replace(/[^\w.-]/g, '') || `g${++seq}`;
    if (seen.has(id)) {
      dupId += 1;
      id = `${id}-${++seq}`;
    }
    seen.add(id);
    count += 1;
    const n: MNode = { id, text, kids: [] };
    const ref = str(x.ref, 120);
    if (ref) {
      if (nodeIds.has(ref)) n.ref = ref;
      else badRef += 1;
    }
    if (Array.isArray(x.f)) {
      const f = x.f.map((k) => str(k, 400)).filter((k): k is string => Boolean(k));
      const ok = f.filter((k) => corpus.includes(squash(k)) || kept.f.has(squash(k)));
      badF += f.length - ok.length;
      if (ok.length) n.f = ok;
    }
    const src = str(x.src, 300);
    if (src) {
      if (anchors.has(src)) n.src = srcLabel(src);
      else if (kept.src.has(src)) n.src = src;
      else badSrc += 1;
    }
    for (const k of ['tag', 'tagNote', 'phen', 'contrast', 'notes'] as const) {
      const v = str(x[k]);
      if (v) n[k] = v;
    }
    if (depth === 1) {
      n.band = x.band === 0 || x.band === 1 || x.band === 2 ? x.band : kept.band.get(id) ?? index % 3;
      n.side = 1;
    }
    const kids = Array.isArray(x.kids) ? x.kids : [];
    if (kids.length > 7) wide += 1;
    n.kids = kids.map((k, i) => conv(k, depth + 1, i)).filter((k): k is MNode => k !== null);
    return n;
  };

  const root = conv(o.root, 0, 0);
  if (!root) throw new ModelError('模型返回的中心主题是空的。');

  const fixes: string[] = [];
  if (badF) fixes.push(`${badF} 条公式在笔记原文里找不到，已删去（公式只抄原文）`);
  if (badSrc) fixes.push(`${badSrc} 处出处不是笔记里的真实片段，已删去`);
  if (badRef) fixes.push(`${badRef} 处指向了图谱里不存在的知识点，已断开`);
  if (dupId) fixes.push(`${dupId} 个重复的主题 id 已改名`);
  const warnings: string[] = [];
  if (root.kids.length > 7) warnings.push(`第一层有 ${root.kids.length} 项，超过 7 项，分类可能还没做完`);
  if (wide) warnings.push(`${wide} 个主题下面超过 7 项`);
  if (count < 6) warnings.push(`只有 ${count} 个主题，叶子可能还不到「能逐个核对」的粒度`);

  const title = str(o.title, 80) ?? root.text;
  // 「我的连线」只属于用户：更新时原样保留，端点被删掉的那几条才去掉
  const links = (prev?.links ?? []).filter((l) => seen.has(l.from) && seen.has(l.to));
  const lost = (prev?.links.length ?? 0) - links.length;
  if (lost) fixes.push(`${lost} 条「我的连线」的端点被删掉了，这几条连线会随之去掉`);
  return {
    doc: { version: 2, title, root, links, view: prev ? { ...prev.view } : { ...DEFAULT_VIEW, layout: 'right' }, seq: Math.max(prev?.seq ?? 0, seq + count) },
    fixes,
    warnings,
    count,
  };
}

export async function generateMind(model: ModelConfig, store: WorkspaceStore, input: MindInput, signal?: AbortSignal): Promise<Checked> {
  const { messages } = await buildMessages(store, input);
  const answer = await chat(model, messages, signal);
  return checkOutput(extractJson(answer), input);
}

/* ---------- 更新已有导图：AI 对话与「按资料更新」 ---------- */

const UPDATE_CONTRACT = `## 本次任务：修改用户已有的导图（覆盖上文「输出」一节中与此冲突的部分）

输入里的 existingMap 是用户当前的导图，userRequest 是这次的要求。只输出一个 JSON 对象，不要任何前后缀：

{ "reply": "用一两句人话说明你做了什么、为什么；只是回答问题时就写回答", "doc"?: { "title": "...", "root": MNode } }

- 用户只是提问、不需要改图时，不要给 doc。
- 给 doc 时给出**修改后的整张导图**：保留的主题必须沿用原来的 id（挖空练习记录靠 id 对应），新主题用新的短英文 id。
- 只改这次要求涉及的地方；用户写的文字、角标、笔记，没有被要求就原样保留。
- 不要输出 links：「我的连线」由界面原样保留。
- MNode 的字段与规则同上文：f 只抄 notes 原文或保留原有的；src 只填 notes 的 anchor 或保留原有的；ref 只填 nodes 里的 id 或保留原有的。`;

/** 「按资料更新」就是一句固定的要求 */
export const SYNC_REQUEST =
  '工作区里的笔记更新了。对照 notes 的最新内容更新这张导图：补上笔记里新出现、导图里还没有的内容；笔记里已经删掉的内容，删掉对应主题；其余保持不变。在 reply 里列出改了哪几处。';

export interface Updated {
  reply: string;
  /** 模型给了修改后的导图（已核对）；只回答问题时为 undefined */
  checked?: Checked;
}

export async function updateMind(model: ModelConfig, store: WorkspaceStore, input: MindInput, signal?: AbortSignal): Promise<Updated> {
  const prompt = await promptFor('atlas.mindmap', store);
  const body = ['```json', JSON.stringify(input, null, 1), '```'].join('\n');
  const messages = [
    { role: 'system' as const, content: prompt.text },
    { role: 'user' as const, content: `${UPDATE_CONTRACT}\n\n## 输入\n\n${body}` },
  ];
  const raw = extractJson(await chat(model, messages, signal)) as { reply?: unknown; doc?: unknown };
  const reply = typeof raw.reply === 'string' && raw.reply.trim() ? raw.reply.trim() : '';
  if (!raw.doc) {
    if (!reply) throw new ModelError('模型既没有回答，也没有给出修改。');
    return { reply };
  }
  return { reply: reply || '已按要求修改。', checked: checkOutput(raw.doc, input) };
}

/* ---------- 两张导图的差异（应用前给用户看） ---------- */

export interface MindDiff {
  added: { node: MNode; parent: string }[];
  removed: { node: MNode; parent: string }[];
  changed: { before: MNode; after: MNode; fields: string[] }[];
  moved: { node: MNode; from: string; to: string }[];
}

const FIELD_LABEL: Record<string, string> = {
  text: '文字',
  f: '公式',
  src: '出处',
  ref: '知识点',
  tag: '角标',
  tagNote: '角标说明',
  phen: '入口现象',
  contrast: '容易混淆',
  notes: '笔记',
};

export function diffDocs(prev: MDoc, next: MDoc): MindDiff {
  const index = (doc: MDoc) => {
    const byId = new Map<string, { node: MNode; parent: MNode | null }>();
    const walk = (n: MNode, p: MNode | null) => {
      byId.set(n.id, { node: n, parent: p });
      n.kids.forEach((k) => walk(k, n));
    };
    walk(doc.root, null);
    return byId;
  };
  const a = index(prev);
  const b = index(next);
  const name = (p: MNode | null) => (p ? p.text : '');
  const diff: MindDiff = { added: [], removed: [], changed: [], moved: [] };
  for (const [id, x] of b) {
    const old = a.get(id);
    if (!old) {
      // 只报新分支的根，不把它下面的每个主题都列一遍
      if (!x.parent || a.has(x.parent.id)) diff.added.push({ node: x.node, parent: name(x.parent) });
      continue;
    }
    const fields = Object.keys(FIELD_LABEL).filter(
      (k) => JSON.stringify(old.node[k as keyof MNode] ?? null) !== JSON.stringify(x.node[k as keyof MNode] ?? null),
    );
    if (fields.length) diff.changed.push({ before: old.node, after: x.node, fields: fields.map((k) => FIELD_LABEL[k]!) });
    if ((old.parent?.id ?? null) !== (x.parent?.id ?? null)) diff.moved.push({ node: x.node, from: name(old.parent), to: name(x.parent) });
  }
  for (const [id, x] of a) {
    if (!b.has(id) && (!x.parent || b.has(x.parent.id))) diff.removed.push({ node: x.node, parent: name(x.parent) });
  }
  return diff;
}

export function diffSize(d: MindDiff): number {
  return d.added.length + d.removed.length + d.changed.length + d.moved.length;
}
