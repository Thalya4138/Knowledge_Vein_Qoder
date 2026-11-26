import { readJson, writeJson } from '../../store/open';
import type { WorkspaceStore } from '../../store/types';
import type { DeskSource } from './deskAsk';

/**
 * 工作台问答的对话历史，存在工作区里（`.vein/desk/threads.json`），跟着工作区走：
 * 本地文件夹工作区里就是硬盘上的一个文件，换浏览器、刷新都还在（仿 features/lab/history.ts）。
 * 记的是用户问过什么、模型怎么答、引用了哪些位置、有没有一键补进笔记。
 */

export const DESK_HISTORY_PATH = '.vein/desk/threads.json';
const KEEP = 80;

export interface DeskTurn {
  id: string;
  q: string;
  a: string;
  sources?: DeskSource[];
  at: number;
  /** preset = 随站发布的示例问答；ask = 用户自己问的 */
  origin: 'preset' | 'ask';
  /** 一键补进笔记后记下补到了哪里 */
  addedTo?: { path: string; anchor: string; at: number };
}

export async function loadDeskHistory(store: WorkspaceStore): Promise<DeskTurn[]> {
  try {
    const t = await readJson<DeskTurn[]>(store, DESK_HISTORY_PATH);
    if (!Array.isArray(t)) return [];
    return t.filter((x) => x && typeof x.q === 'string' && typeof x.a === 'string' && typeof x.at === 'number');
  } catch {
    return [];
  }
}

export async function saveDeskHistory(store: WorkspaceStore, turns: DeskTurn[]): Promise<void> {
  const sorted = [...turns].sort((a, b) => b.at - a.at).slice(0, KEEP);
  await writeJson(store, DESK_HISTORY_PATH, sorted);
}

/** 同一问只留一条：再问时提到最前并更新时间与答案 */
export function upsertTurn(all: DeskTurn[], turn: DeskTurn): DeskTurn[] {
  const rest = all.filter((x) => x.q !== turn.q);
  return [turn, ...rest];
}

export const deskUid = () => `desk${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;