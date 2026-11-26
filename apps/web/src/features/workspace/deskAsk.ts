import { chat, ModelError, type ChatMessage } from '../../ai/chat';
import { promptFor } from '../../ai/prompts';
import { openStore } from '../../store/open';
import type { Workspace, WsFile } from '../../store/types';
import type { ModelConfig } from '../../ui/prefs';
import type { NoteSpan } from '../atlas/mindGen';
import { gatherContext } from '../connection/exploreAi';

/**
 * 工作台问答（workspace.ask，SMART_SEARCH.md「先定位，后回答」）：
 * 程序先在当前工作区里检索段落并编号，模型只负责讲解、用 [n] 标出处；
 * 「在你的笔记里」的位置列表由程序按编号生成，模型给不出不存在的位置。
 */

export interface DeskSource {
  n: number;
  anchor: string;
  /** 能在工作台里打开的文件；PDF 页等打不开的为 undefined，只显示不跳转 */
  fileId?: string;
  heading: string;
  label: string;
}

export interface DeskAnswer {
  text: string;
  sources: DeskSource[];
}

export interface PriorQA {
  q: string;
  a: string;
}

/** 片段锚点 `path#标题` → 工作台里的文件与标题 */
export function sourceOf(span: NoteSpan, n: number, files: WsFile[]): DeskSource {
  const cut = span.anchor.indexOf('#');
  const path = cut < 0 ? span.anchor : span.anchor.slice(0, cut);
  const heading = cut < 0 ? '' : span.anchor.slice(cut + 1);
  const file = files.find((f) => f.path === path || (f.sourceUrl && decodeURI(f.sourceUrl).endsWith('/' + path)));
  const name = file?.name ?? path.split('/').pop() ?? path;
  // 讲义的一级标题常与文件名是同一句话（只差全角 / 半角空格），这时不重复写两遍
  const same = (x: string) => x.replace(/[\s　]+/g, '');
  const label = heading && same(heading) !== same(name) ? `${name} / ${heading}` : name;
  return { n, anchor: span.anchor, fileId: file?.id, heading, label };
}

/** 回答里实际引用到的编号；一个都没引用时返回空（不把没用上的检索结果冒充出处） */
export function citedNumbers(text: string): Set<number> {
  const out = new Set<number>();
  for (const m of text.matchAll(/\[(\d{1,2})\]/g)) out.add(Number(m[1]));
  return out;
}

export function buildAsk(q: string, spans: NoteSpan[], prior: PriorQA[]): string {
  const parts: string[] = [];
  if (prior.length) {
    parts.push('## 此前的对话（供理解追问，不必重复）');
    for (const p of prior.slice(-3)) parts.push(`读者：${p.q}\n\n你：${p.a.length > 1500 ? p.a.slice(0, 1500) + '…' : p.a}`);
  }
  parts.push('## 从读者工作区检索到的段落');
  parts.push(spans.length ? spans.map((s, i) => `[${i + 1}] 位置：${s.anchor}\n${s.text}`).join('\n\n') : '（没有找到相关段落）');
  parts.push(`## 读者的问题\n\n${q}`);
  return parts.join('\n\n');
}

export async function deskAsk(m: ModelConfig, ws: Workspace, files: WsFile[], q: string, prior: PriorQA[], signal?: AbortSignal): Promise<DeskAnswer> {
  const opened = await openStore(ws);
  if (opened.status === 'auth') throw new ModelError('要先在左栏重新授权这个本地文件夹，才能读你的讲义。');
  if (opened.status === 'missing') throw new ModelError(opened.message);
  // 追问常省略主语（「那它为什么唯一？」）：检索时带上上一问
  const query = prior.length ? `${prior[prior.length - 1]!.q} ${q}` : q;
  const [ctx, prompt] = await Promise.all([gatherContext(opened.store, null, query), promptFor('workspace.ask', opened.store)]);
  const messages: ChatMessage[] = [
    { role: 'system', content: prompt.text },
    { role: 'user', content: buildAsk(q, ctx.spans, prior) },
  ];
  const text = await chat(m, messages, signal, 4096);
  const cited = citedNumbers(text);
  const sources = ctx.spans.map((s, i) => sourceOf(s, i + 1, files)).filter((s) => cited.has(s.n));
  return { text, sources };
}
