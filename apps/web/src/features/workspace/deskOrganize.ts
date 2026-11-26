import { chat, extractJson, ModelError, type ChatMessage, type ContentPart } from '../../ai/chat';
import { promptFor } from '../../ai/prompts';
import { openStore } from '../../store/open';
import type { Workspace } from '../../store/types';
import type { ModelConfig } from '../../ui/prefs';
import { readUrl, type Attachment } from '../connection/exploreAi';
import type { ChangeSet, FileChange } from './changes';

/**
 * 步骤 1 · 整理资料与拟讲义目录（workspace.organize）。
 * 读附件（文本 / PDF 正文 / 网页 / 截图）与工作区文件清单是确定性的；
 * 「建哪些文件夹、改什么名、目录怎么排」交给模型，程序把方案做成 FileChange 提案，
 * 用户预览差异、确认后才落盘（changes.ts），可一步撤销。无 key 时给标注「示例」的确定性方案。
 */

export interface OrganizeMove {
  from: string;
  to: string;
  why: string;
}

export interface OrganizeLesson {
  file: string;
  title: string;
  sections: string[];
}

export interface OrganizePlan {
  status: 'ok' | 'insufficient';
  summary: string;
  folders: string[];
  moves: OrganizeMove[];
  lessons: OrganizeLesson[];
  stillMissing: string[];
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

/** 把模型返回的 JSON 规整成方案：丢掉非法项，限制数量，绝不因为格式瑕疵而抛错丢内容。 */
export function parsePlan(raw: unknown): OrganizePlan {
  const o = (raw ?? {}) as Record<string, unknown>;
  const moves: OrganizeMove[] = (Array.isArray(o.moves) ? o.moves : [])
    .map((m) => {
      const x = (m ?? {}) as Record<string, unknown>;
      return { from: str(x.from), to: str(x.to), why: str(x.why) };
    })
    .filter((m) => m.from && m.to && m.from !== m.to)
    .slice(0, 60);
  const lessons: OrganizeLesson[] = (Array.isArray(o.lessons) ? o.lessons : [])
    .map((l) => {
      const x = (l ?? {}) as Record<string, unknown>;
      const title = str(x.title);
      const file = str(x.file) || (title ? `notes/${title}.md` : '');
      return { file, title: title || file.replace(/^notes\//, '').replace(/\.md$/, ''), sections: strList(x.sections).slice(0, 12) };
    })
    .filter((l) => l.file && /\.md$/i.test(l.file))
    .slice(0, 20);
  return {
    status: o.status === 'insufficient' ? 'insufficient' : 'ok',
    summary: str(o.summary),
    folders: strList(o.folders).slice(0, 30),
    moves,
    lessons,
    stillMissing: strList(o.stillMissing).slice(0, 20),
  };
}

/** 附件的可读正文拼成给模型的一段话；截图作为图片随附。 */
export function organizeContent(listing: string[], attachments: Attachment[], instruction: string): ContentPart[] {
  const parts: string[] = ['## 当前工作区的文件清单', listing.length ? listing.map((p) => `- ${p}`).join('\n') : '（空工作区）'];
  const att: string[] = [];
  for (const f of attachments) {
    if (f.kind === 'text') att.push(`### 文件：${f.name}${f.cut ? '（太长，只附前一部分）' : ''}\n\`\`\`\n${f.text}\n\`\`\``);
    if (f.kind === 'pdf') att.push(`### PDF：${f.name}（共 ${f.total} 页）\n${f.pages.slice(0, 8).map((t, i) => `[第 ${i + 1} 页]\n${t}`).join('\n\n')}`);
    if (f.kind === 'url') att.push(f.text ? `### 网页：${f.name}\n${f.text}` : `### 网页：${f.name}\n（没有读到正文，只有地址）`);
    if (f.kind === 'image') att.push(`### 截图：${f.name}（见随附图片）`);
    if (f.kind === 'binary') att.push(`### 文件：${f.name}（读不了正文：${f.note}）`);
  }
  if (att.length) parts.push(`## 读者放入的资料\n${att.join('\n\n')}`);
  parts.push(`## 读者的整理要求\n${instruction.trim() || '（没有写要求，按资料内容自行判断）'}`);
  parts.push('## 这一次要输出的\n只输出整理方案 JSON（status / summary / folders / moves / lessons / stillMissing），不要别的话。');
  const content: ContentPart[] = [{ type: 'text', text: parts.join('\n\n') }];
  for (const f of attachments) if (f.kind === 'image') content.push({ type: 'image', mediaType: f.mediaType, data: f.data });
  return content;
}

/** 无 key 的示例方案：明确标注，给评委一个可预览、可撤销的具体提案，不冒充针对资料生成。 */
export function samplePlan(): OrganizePlan {
  return {
    status: 'ok',
    summary: '示例方案：接入你自己的模型后，会按你放入的资料给出整理方案与讲义目录。下面这份目录是预置示例，不是针对你的资料生成。',
    folders: ['notes'],
    moves: [],
    lessons: [{ file: 'notes/正交投影与最小二乘法.md', title: '正交投影与最小二乘法', sections: ['正交投影', '法方程与解的唯一性'] }],
    stillMissing: ['这是示例目录。接入模型后，缺哪些先修、哪些断言没有来源，会按你的资料如实列出。'],
  };
}

export async function deskOrganize(
  m: ModelConfig | null,
  ws: Workspace,
  attachments: Attachment[],
  instruction: string,
  signal?: AbortSignal,
): Promise<{ plan: OrganizePlan; sample: boolean }> {
  if (!m) return { plan: samplePlan(), sample: true };
  const opened = await openStore(ws);
  if (opened.status === 'auth') throw new ModelError('要先在左栏重新授权这个本地文件夹，才能读你的文件清单。');
  if (opened.status === 'missing') throw new ModelError(opened.message);
  const listing = (await opened.store.list('')).map((e) => e.path).filter((p) => !p.split('/').some((s) => s.startsWith('.')));
  const prompt = await promptFor('workspace.organize', opened.store);
  const messages: ChatMessage[] = [
    { role: 'system', content: prompt.text },
    { role: 'user', content: organizeContent(listing, attachments, instruction) },
  ];
  const plan = parsePlan(extractJson(await chat(m, messages, signal, 4096)));
  return { plan, sample: false };
}

/** 网页地址先尽力读正文（跨站读不到时如实标注），再交给整理。 */
export async function urlsToAttachments(urls: string[], signal?: AbortSignal): Promise<Attachment[]> {
  return Promise.all(urls.map((u) => readUrl(u, signal)));
}

const skeleton = (l: OrganizeLesson): string =>
  [
    `# ${l.title}`,
    '',
    '> [!unsourced] 本讲义由工作台按目录生成骨架，正文待逐节填写；尚无外部来源，待核对。',
    '',
    ...l.sections.flatMap((s) => [`## ${s}`, '', '（待生成：接入模型后按资料逐节写成教材体讲义。）', '']),
  ].join('\n');

/**
 * 方案 → 提案。改名只动清单里真实存在、且目标未被占用的文件；
 * 讲义骨架只新建不存在的文件，绝不覆盖读者已写的内容。
 */
export function organizeChanges(plan: OrganizePlan, existing: Set<string>): ChangeSet {
  const changes: FileChange[] = [];
  const taken = new Set(existing);
  for (const mv of plan.moves) {
    if (!existing.has(mv.from) || taken.has(mv.to)) continue;
    changes.push({ op: 'rename', from: mv.from, to: mv.to, reason: mv.why || '按整理方案改名' });
    taken.delete(mv.from);
    taken.add(mv.to);
  }
  for (const l of plan.lessons) {
    if (taken.has(l.file)) continue;
    changes.push({ op: 'create', path: l.file, content: skeleton(l), reason: `按目录新建讲义骨架：${l.title}` });
    taken.add(l.file);
  }
  return { title: '整理资料与讲义目录', changes };
}