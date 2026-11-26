import { chat, type ContentPart } from '../../ai/chat';
import { promptFor, type PromptSlot } from '../../ai/prompts';
import { readText } from '../../store/open';
import type { WorkspaceStore } from '../../store/types';
import type { ModelConfig } from '../../ui/prefs';
import { splitNote, type NoteSpan } from '../atlas/mindGen';
import type { GraphLike } from '../atlas/mindDoc';
import { checkResult, MODES, parseOutput, REL_NAME, leadParagraph, type ExploreResult, type Issue, type ModeId } from './explore';
import { pdfText } from './pdf';

/**
 * 关联探索的模型调用。
 * - 读附件（文本、PDF 正文、截图、网页）、从工作区笔记与 PDF 里挑相关段落、拆分与核对输出 —— 确定性代码；
 * - 写讲义体短文与关联图 —— 交给模型，按模式用各自的提示词。
 * 碎片串联与追问一次写完；学科元思考与跨学科并联分三步：开头与目录 → 逐节 → 收尾，
 * 长文因此不受单次输出长度的限制。学科元思考的目录是一张网；跨学科并联的目录可以分叉、对照、回头细化，
 * 不要求一个中心公式或一个案例贯穿全篇。各步只规定这一步写到哪里为止，不规定栏目与固定文体。
 */

/* ---------- 附件 ---------- */

export type Attachment =
  | { kind: 'text'; name: string; text: string; cut: boolean }
  | { kind: 'pdf'; name: string; pages: string[]; total: number }
  | { kind: 'image'; name: string; mediaType: string; data: string; url: string }
  | { kind: 'url'; name: string; text: string | null; note?: string }
  | { kind: 'binary'; name: string; note: string };

const TEXT_EXT = /\.(md|markdown|txt|tex|csv|tsv|json|ya?ml|py|m|c|h|cpp|hpp|js|ts|java|rs|go|html?)$/i;
const FILE_BUDGET = 16_000;
const PDF_BUDGET = 24_000;
const IMAGE_MAX = 5 * 1024 * 1024;

function base64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function readAttachment(file: File): Promise<Attachment> {
  if (file.type.startsWith('image/')) {
    if (file.size > IMAGE_MAX) return { kind: 'binary', name: file.name, note: '图片超过 5 MB，没有发送。截一张小一点的图再试。' };
    return { kind: 'image', name: file.name, mediaType: file.type, data: base64(await file.arrayBuffer()), url: URL.createObjectURL(file) };
  }
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    try {
      const { pages, total } = await pdfText(file);
      if (!pages.some((p) => p.trim())) return { kind: 'binary', name: file.name, note: '这份 PDF 没有文字层（多半是扫描件），读不出正文。可以截图发送需要的页。' };
      return { kind: 'pdf', name: file.name, pages, total };
    } catch {
      return { kind: 'binary', name: file.name, note: '这份 PDF 打不开（可能加密或已损坏）。' };
    }
  }
  if (file.type.startsWith('text/') || TEXT_EXT.test(file.name)) {
    const text = await file.text();
    return { kind: 'text', name: file.name, text: text.slice(0, FILE_BUDGET), cut: text.length > FILE_BUDGET };
  }
  return { kind: 'binary', name: file.name, note: '这种文件读不了正文，模型只会看到文件名。Word 可以先另存为 PDF。' };
}

/** 尽力读网页正文。多数网站不允许别的网页跨站读取，读不到时如实告诉用户。 */
export async function readUrl(url: string, signal?: AbortSignal): Promise<Attachment> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    signal?.addEventListener('abort', () => ctrl.abort());
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(String(res.status));
    const raw = await res.text();
    const doc = new DOMParser().parseFromString(raw, 'text/html');
    doc.querySelectorAll('script,style,noscript,nav,footer,header').forEach((n) => n.remove());
    const text = (doc.body?.textContent ?? raw).replace(/\s+/g, ' ').trim().slice(0, FILE_BUDGET);
    return text ? { kind: 'url', name: url, text } : { kind: 'url', name: url, text: null, note: '网页没有可读的正文。' };
  } catch {
    return { kind: 'url', name: url, text: null, note: '这个网站不允许别的网页读取它的内容，模型只会看到地址。需要的话把正文复制进输入框。' };
  }
}

/** 附件 PDF 的每一页作为可引用的片段 */
export function pdfSpans(name: string, pages: string[]): NoteSpan[] {
  return pages.map((t, i) => ({ anchor: `${name}#page=${i + 1}`, text: t })).filter((s) => s.text.trim());
}

/* ---------- 从工作区挑相关段落（确定性检索） ---------- */

const NOTE_FILE = /\.(md|markdown|txt)$/i;
const PDF_FILE = /\.pdf$/i;
const SKIP = /^(maps|\.vein|探索)\//;
export const CONTEXT_BUDGET = 12_000;

export function terms(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of text.toLowerCase().match(/[a-z][a-z0-9]{2,}/g) ?? []) out.add(w);
  for (const run of text.match(/[一-鿿]+/g) ?? []) for (let i = 0; i + 1 < run.length; i += 1) out.add(run.slice(i, i + 2));
  return out;
}

const STOP = new Set(['什么', '怎么', '为什么', '是不', '不是', '一个', '这个', '那个', '他们', '它们', '之间', '关系', '联系', '问题', '可以', '如何', '还是', '是同', '同一', '到底', '研究', '层次']);

export function rankSpans(spans: NoteSpan[], query: string, budget = CONTEXT_BUDGET): NoteSpan[] {
  const q = [...terms(query)].filter((t) => !STOP.has(t));
  if (!q.length) return [];
  const scored = spans
    .map((s) => {
      const low = s.text.toLowerCase();
      const hit = q.filter((t) => low.includes(t)).length;
      return { s, score: hit / Math.sqrt(Math.max(200, s.text.length) / 200) };
    })
    .filter((x) => x.score >= 1.5)
    .sort((a, b) => b.score - a.score);
  const out: NoteSpan[] = [];
  let used = 0;
  for (const { s } of scored) {
    const text = s.text.length > 2400 ? s.text.slice(0, 2400) + '…' : s.text;
    if (used + text.length > budget) continue;
    used += text.length;
    out.push({ anchor: s.anchor, text });
    if (out.length >= 10) break;
  }
  return out;
}

export interface ExploreContext {
  nodes: { id: string; title: string }[];
  relations: { from: string; to: string; type: string; explanation: string }[];
  spans: NoteSpan[];
  files: number;
  pdfs: number;
}

export async function gatherContext(store: WorkspaceStore, graph: GraphLike | null, query: string, extra: NoteSpan[] = []): Promise<ExploreContext> {
  const entries = (await store.list('')).filter((e) => !SKIP.test(e.path));
  const spans: NoteSpan[] = [...extra];
  let pdfs = 0;
  for (const e of entries.filter((x) => NOTE_FILE.test(x.path)).slice(0, 200)) {
    const text = await readText(store, e.path);
    if (text) spans.push(...splitNote(e.path, text));
  }
  // 工作区里的 PDF（课程讲义、教材章节）：抽出正文按页参与检索；失败的跳过
  for (const e of entries.filter((x) => PDF_FILE.test(x.path)).slice(0, 12)) {
    try {
      const { pages } = await pdfText(await store.read(e.path), `${e.path}:${e.hash || e.size}`, 80);
      spans.push(...pdfSpans(e.path, pages));
      pdfs += 1;
    } catch {
      /* 读不了就不读 */
    }
  }
  const ranked = rankSpans(spans, query);
  // 附件 PDF 是用户点名给的：至少带上它的前几页，不依赖检索命中
  for (const s of extra.slice(0, 6)) if (!ranked.some((r) => r.anchor === s.anchor)) ranked.push({ anchor: s.anchor, text: s.text.slice(0, 2400) });
  const nodes = (graph?.nodes ?? []).slice(0, 300).map((n) => ({ id: n.id, title: n.title }));
  const qt = terms(query);
  const hit = new Set(nodes.filter((n) => [...terms(n.title)].some((t) => qt.has(t))).map((n) => n.id));
  const relations = (graph?.relations ?? [])
    .filter((r) => r.status === 'accepted' && (hit.has(r.from) || hit.has(r.to)))
    .slice(0, 12)
    .map(({ from, to, type, explanation }) => ({ from, to, type, explanation }));
  return { nodes, relations, spans: ranked, files: entries.length, pdfs };
}

/* ---------- 拼消息 ---------- */

export interface PriorTurn {
  ask: string;
  result: ExploreResult;
}

function priorText(prior: PriorTurn[]): string {
  return prior
    .slice(-3)
    .map((p, i) => {
      const name = (id: string) => p.result.graph.nodes.find((n) => n.id === id)?.label ?? id;
      const heads = [...p.result.note.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1]).join('；');
      const rels = p.result.graph.edges
        .filter((e) => e.status !== 'rejected')
        .slice(0, 20)
        .map((e) => `- ${name(e.from)} →（${REL_NAME[e.type]}）${name(e.to)}${e.status === 'accepted' ? '（读者已收进图谱）' : ''}`)
        .join('\n');
      const rejected = p.result.graph.edges.filter((e) => e.status === 'rejected');
      const rej = rejected.length ? `\n读者不认同：${rejected.map((e) => `${name(e.from)}→${name(e.to)}${e.reason ? `（理由：${e.reason}）` : ''}`).join('；')}` : '';
      return `### 第 ${i + 1} 轮\n问：${p.ask}\n标题：${p.result.title}\n小节：${heads}\n开头：${leadParagraph(p.result.note).slice(0, 400)}\n关系：\n${rels}${rej}`;
    })
    .join('\n\n');
}

export function buildUserContent(mode: ModeId, ask: string, files: Attachment[], ctx: ExploreContext, prior: PriorTurn[], stage: string): ContentPart[] {
  const parts: string[] = [`## 模式\n${MODES.find((m) => m.id === mode)!.label}`, `## 问题\n${ask || '（读者没有写文字，只给了附件）'}`];
  const att: string[] = [];
  for (const f of files) {
    if (f.kind === 'text') att.push(`### 文件：${f.name}${f.cut ? '（太长，只附前一部分）' : ''}\n\`\`\`\n${f.text}\n\`\`\``);
    if (f.kind === 'pdf') {
      let used = 0;
      const pages = f.pages
        .map((t, i) => ({ t, i }))
        .filter(({ t }) => {
          if (!t.trim() || used > PDF_BUDGET) return false;
          used += t.length;
          return true;
        })
        .map(({ t, i }) => `[anchor: ${f.name}#page=${i + 1}]\n${t}`);
      att.push(`### PDF：${f.name}（共 ${f.total} 页${pages.length < f.pages.length ? `，附前 ${pages.length} 页正文` : ''}）\n${pages.join('\n\n')}`);
    }
    if (f.kind === 'url') att.push(f.text ? `### 网页：${f.name}\n${f.text}` : `### 网页：${f.name}\n（没有读到正文，只有地址）`);
    if (f.kind === 'image') att.push(`### 截图：${f.name}（见随附图片）`);
    if (f.kind === 'binary') att.push(`### 文件：${f.name}（读不了正文）`);
  }
  if (att.length) parts.push(`## 附件\n${att.join('\n\n')}`);
  if (ctx.nodes.length) parts.push(`## 工作区节点\n${JSON.stringify(ctx.nodes)}`);
  if (ctx.relations.length) parts.push(`## 工作区里读者已收进图谱的关系\n${ctx.relations.map((r) => `- ${r.from} →（${r.type}）${r.to}：${r.explanation}`).join('\n')}`);
  if (ctx.spans.length) parts.push(`## 工作区片段\n${ctx.spans.map((s) => `[anchor: ${s.anchor}]\n${s.text}`).join('\n\n')}`);
  if (prior.length) parts.push(`## 此前对话\n${priorText(prior)}`);
  parts.push(stage);
  const content: ContentPart[] = [{ type: 'text', text: parts.join('\n\n') }];
  for (const f of files) if (f.kind === 'image') content.push({ type: 'image', mediaType: f.mediaType, data: f.data });
  return content;
}

/* ---------- 各步的格式说明 ---------- */

export const STAGE_SINGLE = `## 这一次要写的
一次写完，按「碎片串联」提示词推进，不套讲义的栏目骨架（不写问题探讨、本节聚焦、练习与应用），也不强制对应表。
一级标题：把关联本身说出来的一句短语。标题之后第一段直接给判断——这几样东西有没有关系、是什么关系、由什么决定；读者给了自己的猜想时，先说它对在哪里、差在哪里。后面怎么展开，由这次的内容决定。
小节标题用这一节的内容来起，不用「本质」「总结」「拓展」这类通用名。文末附一个 vein-graph 图块，只画正文讲透的关系。`;

export const STAGE_FOLLOW = `## 这一次要写的（追问）
写一篇接续上一篇的短文，只回答这次新问的部分：一个一级标题（把这次的回答说出来的短语），第一段直接回答，然后展开；不重复上一篇讲过的内容，可以用一句话指回上一篇。若新联系接上了工作区讲义、已接受关系或此前对话，明确写出接在哪里，并用知识链接/来源指回。文末附一个 vein-graph 图块，只画这次新增的结构，图块自成一体。`;

export const STAGE_OUTLINE = `## 这一次要写的：第一步，开头与目录
本次是跨学科并联。
只写这些，不写任何正文小节：
1. 一级标题：把这次相遇带来的发现说出来的短语，不强行造一个统领全篇的中心公式；
2. 1–2 段开头（带段落锚点）：分别交代两个领域自己原本的问题或视角，再直接指出它们在哪个对象、机制、方法、能力或差异上相遇，以及这次相遇为什么值得继续探索。不铺垫，不预告结构；
3. 一个 \`## 目录\` 小节，每行一项：\`- 节名｜这一节发现或改变什么；它从哪条联系、差异或前节问题长出（依赖 / 分叉 / 对照 / 回头细化）\`。3–8 项。目录是一张可生长的探索图：可以分叉、对照、回头，不必硬接上一节，也不要写成按关系类型或教材章节并列的分类。至少有一项追问联系改变了什么理解、做法或问题；有实践价值时才安排验证或实验。节名用这一节的内容来起，不编号。
文末附一个 vein-graph 图块：画出整篇计划讲到的关系；每条跨学科线标 C1/C2，不规定节点数量。`;

// 学科元思考的目录是一张网，不是一条链：节与节之间可以是依赖、并列的另一类对象、或回头细化。
// 第一行必须与 STAGE_OUTLINE 相同（进度与测试靠它识别这一步）。
export const STAGE_OUTLINE_META = `## 这一次要写的：第一步，开头与目录
只写这些，不写任何正文小节：
1. 一级标题：把全篇的主张说出来的短语；
2. 1–3 段开头（带段落锚点）：直接给出这门学科的生成结构——它研究哪几类对象，对每类对象反复做哪几件事。对象不止一类时照实写几类，不要并成一个。不铺垫，不预告结构；
3. 一个 \`## 目录\` 小节，每行一项：\`- 节名｜这一节立住什么；它与前面各节是哪一种联系（依赖 / 等价 / 推广 / 动机 / 另一类对象 / 回头细化）\`。4–8 项。第一项从这门学科最基础的概念讲起，不跳过它。各节合起来是一张网：不要硬排成“后一节由前一节引出”的单线，也不要写成几条主线并排各讲一段、或照搬教材章节。节名说出这一节的发现，不编号。
文末附一个 vein-graph 图块：整篇计划讲到的全部关系，16–30 个节点；动机类的线按模式文件 §2 的画法，不得画成 prerequisite 或 derives-from。`;

const SECTION_LEAD = {
  chain: '开头用一两句话接住上一节留下的问题，然后回答它：给最小的具体例子，推到结论，说清这个结论凭什么成立；一段只走一步；',
  web: '从最小的具体例子开始，算到数，推到结论，说清这个结论凭什么成立、要什么条件（方阵还是任意矩阵、哪个数域、有没有内积）；一段只走一步。用到前面某一节的结果时指明是哪一个，并说明这是依赖、等价、推广还是动机；不必硬接上一节；',
  cross: '从这一节要检验的具体问题、机制或差异开始，给最小例子或推导，说清联系怎样成立、证据强到哪里；再写它改变了什么理解、做法或问题。可以回接前节，也可以分叉，不必硬接上一节；一段只走一步；',
};

export const stageSection = (k: number, total: number, item: string, tableNo: number, lead: keyof typeof SECTION_LEAD = 'chain') => `## 这一次要写的：第二步，第 ${k}/${total} 节
上面「已经写好的部分」是这篇的开头、目录和已写的小节。现在只写目录中的这一项：
${sectionBrief(item)}
- 以二级标题开头，标题只写节名，不加编号，不抄「这一节要做的」；
- ${SECTION_LEAD[lead]}
- 栏目（表、资源卡、相关信息等）只在内容需要时用，不为凑齐而用；确有多个对象要逐项对比时才用表（编号从「表 ${tableNo}」接着排）；栏目里只写行内公式；
- 不重复已经讲过的内容，不写其他节，不写全文总结；
- 如果这一节讲到了关联图里没有的关系，在节末附一个 vein-graph 图块补充（新节点的 id 不要与「已有节点」表里的重复；要连到已有节点时，照抄表里的 id）。`;

/** 目录项「节名｜说明」拆开交给模型：标题只照抄节名，说明是这一节的任务 */
export function sectionBrief(item: string): string {
  const [name, ...rest] = item.split(/[｜|]/);
  const task = rest.join('｜').trim();
  return `节名：${name!.trim()}` + (task ? `\n这一节要做的：${task}` : '');
}

/** 已有节点表：附在「已经写好的部分」末尾。图块在解析时已从正文剥掉，不附上模型就看不到 id，只能猜 */
export function nodeTable(graphs: unknown[]): string {
  const rows = new Map<string, string>();
  for (const g of graphs) {
    for (const n of (g as { nodes?: { id?: unknown; label?: unknown }[] } | null)?.nodes ?? []) {
      if (typeof n?.id === 'string' && !rows.has(n.id)) rows.set(n.id, typeof n.label === 'string' ? n.label : '');
    }
  }
  if (!rows.size) return '';
  return ['### 已有节点（关联图里已经画出的，id → 名称）', ...[...rows].map(([id, label]) => `- ${id} → ${label}`)].join('\n');
}

export const STAGE_CLOSING = `## 这一次要写的：第三步，收尾
上面「已经写好的部分」是整篇正文。现在只写收尾，不复述、不总结全文。从下面挑这篇内容真正需要的一两样来写，以一个二级标题开头（节名用内容来起）：
- 拿正文没讲过的两三样东西来试这个框架：它们该放在哪里，为什么；
- 这个框架管不到的地方，或两边的联系在哪里失效；
- 一个留给读者自己推的问题：顺着正文再走一步就能得到答案，并给出线索，不给答案。`;

export const STAGE_CLOSING_CROSS = `## 这一次要写的：第三步，收尾（跨学科并联）
上面「已经写好的部分」是整篇正文。现在只写收尾，不复述、不总结全文。从下面挑这篇真正需要的一两样来写，以一个二级标题开头（节名用内容来起）：
- 找一个会让联系失效的条件或反例，说清理想模型、实验事实与推断分别到哪一步；
- 把联系变成最小验证：假设、模型、对照、观察指标与可能的失败结果；
- 开放一个正文尚未解决的新分支，或与工作区已有讲义、节点、已接受关系接上，并说明数学或事实依据。`;

/* ---------- 调用 ---------- */

export interface Explored {
  result: ExploreResult;
  issues: Issue[];
  overridden: boolean;
  context: { files: number; spans: number; pdfs: number };
  calls: number;
}

export interface Progress {
  step: number;
  total: number;
  label: string;
}

/** 从目录小节里取出各项；取不到返回空数组 */
export function parseToc(note: string): { opening: string; items: string[] } {
  const m = /^##\s*目录\s*$/m.exec(note);
  if (!m) return { opening: note, items: [] };
  const opening = note.slice(0, m.index).trim();
  const after = note.slice(m.index + m[0].length);
  const end = after.search(/^#{1,2}\s/m);
  const block = end >= 0 ? after.slice(0, end) : after;
  const items = block
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-*+]|\d+[.)、])\s*/, '').trim())
    .filter((l) => l && !/^>/.test(l));
  return { opening, items };
}

export async function explore(
  model: ModelConfig,
  store: WorkspaceStore,
  graph: GraphLike | null,
  mode: ModeId,
  ask: string,
  files: Attachment[],
  prior: PriorTurn[],
  signal?: AbortSignal,
  onProgress?: (p: Progress) => void,
): Promise<Explored> {
  const slot = MODES.find((m) => m.id === mode)!.slot as PromptSlot;
  const extra = files.flatMap((f) => (f.kind === 'pdf' ? pdfSpans(f.name, f.pages) : []));
  const query = [ask, ...files.map((f) => (f.kind === 'text' ? f.text.slice(0, 400) : f.kind === 'pdf' ? f.pages.slice(0, 2).join(' ').slice(0, 400) : f.name)), ...prior.map((p) => p.result.title)].join(' ');
  onProgress?.({ step: 0, total: 1, label: '读工作区里相关的笔记与资料' });
  const [prompt, ctx] = await Promise.all([promptFor(slot, store), gatherContext(store, graph, query, extra)]);
  const system = { role: 'system' as const, content: prompt.text };
  const call = (stage: string, written?: string) =>
    chat(model, [system, { role: 'user', content: buildUserContent(mode, ask, files, ctx, prior, written ? `## 已经写好的部分\n${written}\n\n${stage}` : stage) }], signal, 8192);
  const checkCtx = { mode, nodeIds: new Set(ctx.nodes.map((n) => n.id)), anchors: new Set(ctx.spans.map((s) => s.anchor)) };
  const done = (out: { note: string; graph: unknown; title: string }, calls: number): Explored => {
    const { result, issues } = checkResult(out, checkCtx);
    return { result, issues, overridden: prompt.overridden, context: { files: ctx.files, spans: ctx.spans.length, pdfs: ctx.pdfs }, calls };
  };

  // 碎片串联与追问：一次写完
  if (mode === 'fragments' || prior.length) {
    onProgress?.({ step: 1, total: 1, label: prior.length ? '写追问的回答' : '写讲解与关联图' });
    return done(parseOutput(await call(prior.length ? STAGE_FOLLOW : STAGE_SINGLE)), 1);
  }

  // 学科元思考、跨学科并联：开头与目录 → 逐节 → 收尾
  const meta = mode === 'meta';
  onProgress?.({ step: 1, total: 3, label: meta ? '找这门学科的对象与动作，拟出目录' : '找交汇点，拟出可分叉的探索路径' });
  const outline = parseOutput(await call(meta ? STAGE_OUTLINE_META : STAGE_OUTLINE));
  const { opening, items } = parseToc(outline.note);
  if (!items.length) return done(outline, 1);
  const total = items.length + 2;
  const graphs: unknown[] = [outline.graph];
  const sections: string[] = [];
  const toc = `## 目录\n${items.map((i) => `- ${i}`).join('\n')}`;
  for (let k = 0; k < items.length; k += 1) {
    onProgress?.({ step: k + 2, total, label: `写第 ${k + 1}/${items.length} 节：${items[k]!.split(/[｜|]/)[0]}` });
    const tableNo = 1 + (sections.join('\n').match(/\[!table\]/g)?.length ?? 0);
    const written = [opening, toc, ...sections, nodeTable(graphs)].filter(Boolean).join('\n\n');
    const out = parseOutput(await call(stageSection(k + 1, items.length, items[k]!, tableNo, meta ? 'web' : 'cross'), written));
    // 模型偶尔会重复一级标题：只要从二级标题开始的部分
    const body = out.note.replace(/^#\s+.+\n/, '').trim();
    sections.push(body);
    if (out.graph) graphs.push(out.graph);
  }
  onProgress?.({ step: total, total, label: '写收尾' });
  const closing = parseOutput(await call(meta ? STAGE_CLOSING : STAGE_CLOSING_CROSS, [opening, ...sections].join('\n\n')));
  if (closing.graph) graphs.push(closing.graph);
  const merged = { nodes: graphs.flatMap((g) => ((g as { nodes?: unknown[] })?.nodes ?? [])), edges: graphs.flatMap((g) => ((g as { edges?: unknown[] })?.edges ?? [])) };
  const note = [opening, ...sections, closing.note.replace(/^#\s+.+\n/, '').trim()].join('\n\n') + '\n';
  return done({ note, graph: merged, title: outline.title }, items.length + 2);
}
