import demoLesson from '../../../../../content/demo/linear-algebra/notes/2.1-列空间中的最近点.md?raw';
import { chat, extractJson, ModelError, type ChatMessage } from '../../ai/chat';
import { promptFor } from '../../ai/prompts';
import { openStore, readJson } from '../../store/open';
import type { Workspace, WorkspaceStore } from '../../store/types';
import type { ModelConfig } from '../../ui/prefs';
import type { ChangeSet, FileChange } from './changes';
import type { OrganizeLesson } from './deskOrganize';

/**
 * 步骤 2 · 逐节资源发现 + 教材体讲义生成（workspace.resources / note.generate）。
 * 资源发现是**建议**不是采集（RESOURCE_DISCOVERY.md）：模型提候选，status 永远是 candidate，
 * 采纳是读者的动作；候选登记进 resources/manifest.json，讲义只引用、不复制。
 * 浏览器直连搜索引擎受 CORS 限制（SYNC_AND_API.md §6），这里走「模型提案候选」路线，不实时抓取，不伪造搜索结果。
 * 无 key 时：候选与讲义都降级为预置样例并标注「示例」。
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
  signal?: AbortSignal,
): Promise<Discovery> {
  if (!m) return sampleCandidates();
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
  return { ...parsed, sample: false };
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

export async function generateLesson(
  m: ModelConfig | null,
  ws: Workspace,
  lesson: OrganizeLesson,
  adopted: ResourceCandidate[],
  existingNote: string | null,
  signal?: AbortSignal,
): Promise<LessonDraft> {
  if (!m) return { status: 'ok', markdown: sampleLesson(), unresolved: ['示例讲义：取自示例知识库，不是针对你的资料生成。'], sample: true };
  const opened = await openStore(ws);
  if (opened.status === 'auth') throw new ModelError('要先在左栏重新授权这个本地文件夹。');
  if (opened.status === 'missing') throw new ModelError(opened.message);
  const prompt = await promptFor('note.generate', opened.store);
  const request = {
    task: existingNote ? 'revise' : 'create',
    course: { title: ws.name, level: '本科' },
    chapter: { title: lesson.title, goal: lesson.sections.join('；') },
    sources: adopted.map((c) => ({ id: c.id, origin: 'discovered', kind: c.kind, title: c.title, license: c.license, uri: c.uri, permission: 'paraphrase-only' })),
    user_context: { existing_note: existingNote, protect_anchors: [] },
    depth: 'standard',
    locale: 'zh-CN',
  };
  const messages: ChatMessage[] = [
    { role: 'system', content: prompt.text },
    { role: 'user', content: `## NoteRequest\n${JSON.stringify(request, null, 2)}\n\n## 这一次要输出的\n按输出契约返回 NoteDraft JSON（status / markdown / unresolved）。markdown 是完整教材体讲义（栏目、旁栏资源卡用 > [!res] span id、证据标注）；资源只引用不复制；没有来源的断言标 original-explanation 或 > [!unsourced]，不伪造出处。` },
  ];
  const draft = parseDraft(extractJson(await chat(m, messages, signal, 8192)));
  if (draft.status === 'ok' && !draft.markdown.trim()) throw new ModelError('模型返回了空讲义。请把这一节拆小一些再试。');
  return { ...draft, sample: false };
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