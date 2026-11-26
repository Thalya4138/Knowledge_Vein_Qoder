import { chat, extractJson, ModelError, type ChatMessage } from '../../ai/chat';
import { promptFor } from '../../ai/prompts';
import { openStore } from '../../store/open';
import type { Workspace } from '../../store/types';
import type { ModelConfig } from '../../ui/prefs';
import type { ChangeSet } from './changes';

/**
 * 步骤 4 · 改写选中段落（workspace.rewrite）。
 * 模型只改写读者选中的那一段（NOTE_GENERATION §5 修订只输出补丁）；
 * 程序把改写结果做成差异预览，确认后写入，沿用阅读视图的一步撤销。
 * 改写是纯生成能力，没有确定性替身：无 key 时如实提示需接入模型，不伪造一段「改写」。
 */

export interface RewriteResult {
  status: 'ok' | 'decline';
  after: string;
  reason: string;
  risk: string;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

export function parseRewrite(raw: unknown): RewriteResult {
  const o = (raw ?? {}) as Record<string, unknown>;
  const after = str(o.after);
  const status = o.status === 'decline' || !after ? 'decline' : 'ok';
  return { status, after, reason: str(o.reason), risk: str(o.risk) || (status === 'ok' ? '中' : '高') };
}

/** 把全文里选中的那一段换成改写结果（只换第一处精确匹配）。找不到返回 null，不瞎改。 */
export function replaceSelection(note: string, selection: string, after: string): string | null {
  const src = note.replace(/\r\n/g, '\n');
  const sel = selection.replace(/\r\n/g, '\n');
  let i = src.indexOf(sel);
  let target = sel;
  if (i < 0) {
    target = sel.trim();
    i = target ? src.indexOf(target) : -1;
  }
  if (i < 0 || !target) return null;
  return src.slice(0, i) + after.replace(/\r\n/g, '\n') + src.slice(i + target.length);
}

export async function deskRewrite(
  m: ModelConfig | null,
  ws: Workspace,
  selection: string,
  contextBefore: string,
  contextAfter: string,
  instruction: string,
  signal?: AbortSignal,
): Promise<RewriteResult> {
  if (!m) return { status: 'decline', after: '', reason: '改写需要接入你自己的模型。请在设置里接入 API key 后再试；定位、补入与撤销不需要 key。', risk: '高' };
  if (!selection.trim()) return { status: 'decline', after: '', reason: '没有选中要改写的文字。', risk: '高' };
  const opened = await openStore(ws);
  if (opened.status === 'auth') throw new ModelError('要先在左栏重新授权这个本地文件夹。');
  if (opened.status === 'missing') throw new ModelError(opened.message);
  const prompt = await promptFor('workspace.rewrite', opened.store);
  const messages: ChatMessage[] = [
    { role: 'system', content: prompt.text },
    {
      role: 'user',
      content: `## 选中的原文\n${selection}\n\n## 前一段（上下文，不要改）\n${contextBefore || '（无）'}\n\n## 后一段（上下文，不要改）\n${contextAfter || '（无）'}\n\n## 读者的改写要求\n${instruction.trim() || '讲得更清楚，保持原意与术语'}\n\n## 这一次要输出的\n只输出改写 JSON（status / after / reason / risk）。after 只含改写后的这一段。`,
    },
  ];
  return parseRewrite(extractJson(await chat(m, messages, signal, 4096)));
}

export function rewriteChanges(path: string, nextNote: string, reason: string): ChangeSet {
  return { title: '改写选中段落', changes: [{ op: 'update', path, content: nextNote, reason: reason || '按你的要求改写选中段落' }] };
}