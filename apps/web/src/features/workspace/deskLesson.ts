import demoLesson from '../../../../../content/demo/linear-algebra/notes/2.1-列空间中的最近点.md?raw';
import { chat, extractJson, ModelError, type ChatMessage } from '../../ai/chat';
import { promptFor } from '../../ai/prompts';
import { searchBocha } from '../../ai/search';
import { openStore, readJson } from '../../store/open';
import type { Workspace, WorkspaceStore } from '../../store/types';
import type { ModelConfig } from '../../ui/prefs';
import type { ChangeSet, FileChange } from './changes';
import type { OrganizeLesson } from './deskOrganize';

/**
 * 步骤 2 · 逐节资源发现 + 教材体讲义生成（workspace.resources / note.generate）。
 * 资源发现是**建议**不是采集（RESOURCE_DISCOVERY.md）：候选 status 永远是 candidate，
 * 采纳是读者的动作；候选登记进 resources/manifest.json，讲义只引用、不复制。
 * 资源发现三条路（#83）：有搜索 key → 博查实时检索（2026-11-26 实测跨域可用，候选许可标「待核对」）；
 * 无搜索 key 有模型 key → 模型提案候选；都没有 → 预置样例并标注「示例」。搜索失败不伪造结果，如实说明后降级。
 */

export const MANIFEST_PATH = 'resources/manifest.json';

export interface ResourceCandidate {
  id: string;
  kind: string;
  title: string;
  author: string;
  license: string;
  uri: string;
  trustWhy: string;
  fillsGap: string[];
  limitations: string;
  mappingHint: string;
}

export interface Discovery {
  candidates: ResourceCandidate[];
  stillMissing: string[];
  recommendation: string;
  sample: boolean;
  /** true = 博查实时检索结果（许可待核对） */
  live?: boolean;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
const KINDS = new Set(['note', 'pdf', 'slide', 'transcript', 'web', 'video', 'video-course', 'paper', 'photo-of-notes', 'code']);

/** 规整候选：必须有题名与可核对的 uri，许可缺失时如实写「待核对」，status 一律 candidate。 */
export function parseCandidates(raw: unknown): { candidates: ResourceCandidate[]; stillMissing: string[]; recommendation: string } {
  const o = (raw ?? {}) as Record<string, unknown>;
  const candidates: ResourceCandidate[] = (Array.isArray(o.candidates) ? o.candidates : [])
    .map((c, i) => {
      const x = (c ?? {}) as Record<string, unknown>;
      const uri = str(x.uri);
      const title = str(x.title);
      if (!title || !uri) return null;
      const kind = str(x.kind);
      return {
        id: /^res\./.test(str(x.id)) ? str(x.id) : `res.discovered.${i + 1}`,
        kind: KINDS.has(kind) ? kind : 'web',
        title,
        author: str(x.author),
        license: str(x.license) || '待核对',
        uri,
        trustWhy: str(x.trustWhy),
        fillsGap: strList(x.fillsGap),
        limitations: str(x.limitations) || '未注明局限，采纳前请自行核对许可与可访问性。',
        mappingHint: str(x.mappingHint),
      };
    })
    .filter((c): c is ResourceCandidate => c !== null)
    .slice(0, 20);
  return { candidates, stillMissing: strList(o.stillMissing), recommendation: str(o.recommendation) };
}

/** 无 key 的预置候选：取自示例知识库已核对的公开来源，明确标注示例。 */
export function sampleCandidates(): Discovery {
  return {
    sample: true,
    stillMissing: ['这是示例候选。接入模型后，会按这一节的内容与缺口提出候选，并如实写出找不到什么。'],
    recommendation: '示例：先采纳一两条公开公开课作为对照，讲义仍以本项目原创论述为主干，不要因为补了来源就删掉自己的推导。',
    candidates: [
      {
        id: 'res.discovered.mit1806sc-l15',
        kind: 'video',
        title: 'MIT 18.06SC · Lecture 15: Projections onto Subspaces',
        author: 'Gilbert Strang / MIT OpenCourseWare',
        license: 'CC BY-NC-SA 4.0',
        uri: 'https://ocw.mit.edu/courses/18-06sc-linear-algebra-fall-2011/resources/lecture-15-projections-onto-subspaces/',
        trustWhy: '大学公开课，与投影主题直接对应；英文，需自己定位到具体讲次。',
        fillsGap: ['本节无外部来源'],
        limitations: '许可为 NC，不得用于商业用途；引用需注明出处。',
        mappingHint: '第 15 讲讨论投影与最小二乘',
      },
      {
        id: 'res.discovered.wiki-linear-least-squares',
        kind: 'web',
        title: 'Linear least squares — Wikipedia',
        author: 'Wikipedia contributors',
        license: 'CC BY-SA 4.0',
        uri: 'https://en.wikipedia.org/wiki/Linear_least_squares',
        trustWhy: '百科全书条目，可作英文原始表述对照；不宜作为唯一依据。',
        fillsGap: ['缺英文原始表述'],
        limitations: 'CC BY-SA 要求署名并以相同许可共享；条目质量随编辑变化。',
        mappingHint: '投影矩阵 P = A(AᵀA)⁻¹Aᵀ 的定义',
      },
    ],
  };
}

export interface ManifestResource {
  id: string;
  origin: 'discovered';
  kind: string;
  title: string;
  author: string;
  license: string;
  uri: string;
  status: 'candidate';
  note: string;
}

export function candidateToResource(c: ResourceCandidate): ManifestResource {
  return {
    id: c.id,
    origin: 'discovered',
    kind: c.kind,
    title: c.title,
    author: c.author,
    license: c.license,
    uri: c.uri,
    status: 'candidate',
    note: [c.trustWhy, c.mappingHint && `对应：${c.mappingHint}`, c.fillsGap.length && `填补：${c.fillsGap.join('、')}`, `局限：${c.limitations}`]
      .filter(Boolean)
      .join(' '),
  };
}

export interface Manifest {
  schemaVersion: string;
  kbId: string;
  resources: ManifestResource[];
  spans: unknown[];
  [k: string]: unknown;
}

/** 把采纳的候选并进清单：按 id 与 uri 去重，保留原有 spans / coverage，不覆盖读者已登记的内容。 */
export function mergeManifest(existing: Manifest | null, adopted: ResourceCandidate[], kbId: string): Manifest {
  const base: Manifest = existing ?? { schemaVersion: '1.1', kbId, resources: [], spans: [] };
  const resources = [...base.resources];
  const seenId = new Set(resources.map((r) => r.id));
  const seenUri = new Set(resources.map((r) => r.uri).filter(Boolean));
  for (const c of adopted) {
    if (seenId.has(c.id) || seenUri.has(c.uri)) continue;
    resources.push(candidateToResource(c));
    seenId.add(c.id);
    seenUri.add(c.uri);
  }
  return { ...base, kbId: base.kbId || kbId, resources };
}

export async function discoverResources(
  m: ModelConfig | null,
  ws: Workspace,
  lesson: OrganizeLesson,
  gaps: string[],
  searchKey?: string,
  signal?: AbortSignal,
): Promise<Discovery> {
  let searchNote = '';
  if (searchKey) {
    const query = [lesson.title, ...gaps].join(' ').slice(0, 120);
    try {
      const hits = await searchBocha(searchKey, query, signal);
      if (hits.length) {
        return {
          sample: false,
          live: true,
          candidates: hits.map((h, i) => ({
            id: `res.web.${i + 1}`,
            kind: 'web',
            title: h.title,
            author: h.siteName,
            license: '待核对',
            uri: h.url,
            trustWhy: `联网检索命中${h.siteName ? `（${h.siteName}）` : ''}${h.date ? `，${h.date.slice(0, 10)}` : ''}。`,
            fillsGap: gaps.length ? gaps : ['本节无外部来源'],
            limitations: '联网检索结果：内容与许可未核对，采纳前请自行核对；讲义只引用不复制。',
            mappingHint: h.snippet.slice(0, 80),
          })),
          stillMissing: [],
          recommendation: '以上为实时联网检索候选，许可待核对；采纳后讲义只引用不复制，不要因为补了来源就删掉自己的推导。',
        };
      }
      searchNote = '联网检索没有找到相关网页。';
    } catch (e) {
      if (signal?.aborted) throw e;
      searchNote = `联网检索不可用（${(e as Error).message}）`;
    }
  }
  if (!m) {
    const s = sampleCandidates();
    return searchNote ? { ...s, stillMissing: [`${searchNote}以下为预置样例候选。`, ...s.stillMissing] } : s;
  }
  const opened = await openStore(ws);
  if (opened.status === 'auth') throw new ModelError('要先在左栏重新授权这个本地文件夹。');
  if (opened.status === 'missing') throw new ModelError(opened.message);
  const prompt = await promptFor('workspace.resources', opened.store);
  const input = {
    intent: `为讲义「${lesson.title}」补齐公开、有许可的对照来源`,
    chapter: { title: lesson.title, goal: lesson.sections.join('；') },
    gaps: gaps.length ? gaps : ['本节无外部来源'],
    policy: { allowWeb: true, allowPaid: false, languages: ['zh', 'en'] },
  };
  const messages: ChatMessage[] = [
    { role: 'system', content: prompt.text },
    { role: 'user', content: `## 输入\n${JSON.stringify(input, null, 2)}\n\n## 这一次要输出的\n只输出资源发现 JSON（status / candidates / stillMissing / recommendation）。每条候选必须有 uri 与 license，status 一律 candidate；找不到就如实写 stillMissing。` },
  ];
  const parsed = parseCandidates(extractJson(await chat(m, messages, signal, 4096)));
  return { ...parsed, sample: false, recommendation: searchNote ? `${searchNote} ${parsed.recommendation}` : parsed.recommendation };
}

/* ---------- 讲义生成 ---------- */

export interface LessonDraft {
  status: 'ok' | 'insufficient' | 'needs-scope';
  markdown: string;
  unresolved: string[];
  sample: boolean;
}

export function parseDraft(raw: unknown): { status: LessonDraft['status']; markdown: string; unresolved: string[] } {
  const o = (raw ?? {}) as Record<string, unknown>;
  const status = o.status === 'insufficient' || o.status === 'needs-scope' ? o.status : 'ok';
  return { status, markdown: str(o.markdown), unresolved: strList(o.unresolved) };
}

/** 无 key 的示例讲义：示例知识库里人工核对过的教材体讲义，明确标注示例。 */
export function sampleLesson(): string {
  return demoLesson.replace(/\r\n/g, '\n');
}

const norm = (s: string): string => s.replace(/[\s　]+/g, '');

/** 把现有讲义按二级标题切节，保留首个二级标题前的引子（frontmatter / 章标题 / 导语）。 */
export function splitSections(md: string | null): { preamble: string; sections: { heading: string; body: string }[] } {
  if (!md) return { preamble: '', sections: [] };
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const preamble: string[] = [];
  const sections: { heading: string; body: string }[] = [];
  let cur: { heading: string; body: string[] } | null = null;
  for (const line of lines) {
    const m = /^##\s+(.*)$/.exec(line);
    if (m) {
      if (cur) sections.push({ heading: cur.heading, body: cur.body.join('\n').trim() });
      cur = { heading: m[1]!.trim(), body: [] };
    } else if (cur) cur.body.push(line);
    else preamble.push(line);
  }
  if (cur) sections.push({ heading: cur.heading, body: cur.body.join('\n').trim() });
  return { preamble: preamble.join('\n').trim(), sections };
}

/** 骨架兜底：确保一节以二级标题开头。模型漏写或写成一级标题时程序补齐/降级，正文一字不动。 */
export function ensureHeading(section: string, md: string): string {
  const t = md.trim();
  if (/^##\s/.test(t)) return t;
  const lines = t.split('\n');
  if (/^#\s/.test(lines[0]!)) {
    lines[0] = '#' + lines[0];
    return lines.join('\n');
  }
  return `## ${section}\n\n${t}`;
}

/** 取一节正文的第一句散文做摘要，供下一节承接——有界上下文，不重发前序全文。 */
export function firstSentence(md: string): string {
  const line = md
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !/^[#>|[-]/.test(l) && !l.startsWith('!') && !l.startsWith('^')) ?? '';
  return line.length > 120 ? line.slice(0, 120) + '…' : line;
}

/** 程序拼装：章引子（修订时保留旧 frontmatter/标题）＋逐节正文＋目录未覆盖的旧节全文（保真，不丢内容）。 */
export function assembleLesson(title: string, parts: string[], leftover: { heading: string; body: string }[], preamble = ''): string {
  const head = preamble.trim() ? preamble.trim() : `# ${title}`;
  const body = parts.filter((p) => p.trim()).join('\n\n');
  const tail = leftover.map((s) => `## ${s.heading}\n\n${s.body}`).join('\n\n');
  return [head, body, tail].filter((x) => x.trim()).join('\n\n') + '\n';
}

export type LessonProgress = (done: number, total: number, section: string) => void;

/**
 * 逐节生成：程序按目录搭轻骨架（节标题/栏目顺序由 §3.5 固定），模型在每节有界请求里自由写正文。
 * 每节只带「全目录目标＋本节资源＋前序各节一句话摘要」，避免单次从零写整篇撞输出上限熔断。
 * 修订按节定位：只把该节旧文作为 existing_note 传给模型，目录未覆盖的旧节由程序原样保留（保真优先）。
 * 单节失败不拖垮整篇：保留旧节全文或标注待补，其余节照常生成。
 */
export async function generateLesson(
  m: ModelConfig | null,
  ws: Workspace,
  lesson: OrganizeLesson,
  adopted: ResourceCandidate[],
  existingNote: string | null,
  signal?: AbortSignal,
  onProgress?: LessonProgress,
): Promise<LessonDraft> {
  if (!m) return { status: 'ok', markdown: sampleLesson(), unresolved: ['示例讲义：取自示例知识库，不是针对你的资料生成。'], sample: true };
  const opened = await openStore(ws);
  if (opened.status === 'auth') throw new ModelError('要先在左栏重新授权这个本地文件夹。');
  if (opened.status === 'missing') throw new ModelError(opened.message);
  const prompt = await promptFor('note.generate', opened.store);
  const sections = lesson.sections.length ? lesson.sections : [lesson.title];
  const existing = splitSections(existingNote);
  const sources = adopted.map((c) => ({ id: c.id, origin: 'discovered', kind: c.kind, title: c.title, license: c.license, uri: c.uri, permission: 'paraphrase-only' }));
  const used = new Set<string>();
  const parts: string[] = [];
  const unresolved: string[] = [];
  const prior: { title: string; takeaways: string[] }[] = [];
  let okCount = 0;

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]!;
    onProgress?.(i, sections.length, section);
    const prev = existing.sections.find((s) => norm(s.heading) === norm(section));
    if (prev) used.add(prev.heading);
    const request = {
      task: prev ? 'revise' : 'create',
      course: { title: ws.name, level: '本科' },
      chapter: { title: section, goal: section },
      prior_chapters: prior.slice(-3),
      sources,
      user_context: { existing_note: prev?.body ?? null, protect_anchors: [] },
      depth: 'standard',
      locale: 'zh-CN',
    };
    const messages: ChatMessage[] = [
      { role: 'system', content: prompt.text },
      {
        role: 'user',
        content: `## NoteRequest\n${JSON.stringify(request, null, 2)}\n\n## 这一次要输出的\n只写「${section}」这一节，返回 NoteDraft JSON（status / markdown / unresolved）。markdown 以「## ${section}」开头，含本节栏目（问题探讨 / 本节聚焦 / 正文 / 思维训练 / 练习与应用）、资源卡（> [!res] span id）与证据标注；不要 frontmatter、不要章标题、不要写其他节。这是整篇讲义「${lesson.title}」的第 ${i + 1}/${sections.length} 节，前序各节摘要见 prior_chapters，正文开头要承接上一节留下的问题。资源只引用不复制；没有来源的断言标 original-explanation 或 > [!unsourced]，不伪造出处。`,
      },
    ];
    let draft: ReturnType<typeof parseDraft>;
    try {
      draft = parseDraft(extractJson(await chat(m, messages, signal, 8192)));
    } catch (e) {
      if (signal?.aborted) throw e;
      unresolved.push(`「${section}」生成失败：${(e as Error).message}`);
      parts.push(prev ? `## ${prev.heading}\n\n${prev.body}` : `## ${section}\n\n> [!unsourced] 本节生成失败，待重试。`);
      continue;
    }
    if (draft.status === 'ok' && draft.markdown.trim()) {
      const md = ensureHeading(section, draft.markdown);
      parts.push(md);
      okCount++;
      const summary = firstSentence(md);
      prior.push({ title: section, takeaways: summary ? [summary] : [] });
      unresolved.push(...draft.unresolved);
    } else {
      unresolved.push(`「${section}」：${draft.unresolved.join('；') || '模型认为资料不足，没有写这一节。'}`);
      parts.push(prev ? `## ${prev.heading}\n\n${prev.body}` : `## ${section}\n\n> [!unsourced] 本节资料不足，待补。`);
    }
  }
  onProgress?.(sections.length, sections.length, '');
  const leftover = existing.sections.filter((s) => !used.has(s.heading));
  if (!okCount && !existing.sections.length) return { status: 'insufficient', markdown: '', unresolved, sample: false };
  return { status: 'ok', markdown: assembleLesson(lesson.title, parts, leftover, existing.preamble), unresolved, sample: false };
}

/** 讲义 + 采纳的资源清单 → 一组提案（讲义新建或更新，清单合并），共用一道预览与撤销。 */
export function lessonChanges(
  lessonFile: string,
  markdown: string,
  noteExists: boolean,
  manifest: Manifest | null,
  adopted: ResourceCandidate[],
  kbId: string,
): ChangeSet {
  const changes: FileChange[] = [
    { op: noteExists ? 'update' : 'create', path: lessonFile, content: markdown, reason: `生成教材体讲义：${lessonFile}` },
  ];
  if (adopted.length) {
    const merged = mergeManifest(manifest, adopted, kbId);
    changes.push({ op: manifest ? 'update' : 'create', path: MANIFEST_PATH, content: JSON.stringify(merged, null, 2) + '\n', reason: `登记 ${adopted.length} 条候选资源（status=candidate，采纳与否仍由你决定）` });
  }
  return { title: '生成讲义与资源卡', changes };
}

/** 读现有清单（不存在或损坏时返回 null，不抛错丢内容）。 */
export async function loadManifest(store: WorkspaceStore): Promise<Manifest | null> {
  try {
    return await readJson<Manifest>(store, MANIFEST_PATH);
  } catch {
    return null;
  }
}