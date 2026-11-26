import { readJson, writeJson } from '../../store/open';
import type { WorkspaceStore } from '../../store/types';

/**
 * 会话历史存在工作区里（`.vein/lab/threads.json`），跟着工作区走：
 * 本地文件夹工作区里就是硬盘上的一个文件，换浏览器也在。
 * 记的是用户自己问过什么、打开过哪张实验、挂在哪个导图主题上——与地址参数互为镜像。
 */

export const LAB_HISTORY_PATH = '.vein/lab/threads.json';
const KEEP = 60;

export interface LabTurn {
  id: string;
  /** 用户问的原话；从导图深链打开时记主题名 */
  q: string;
  /** 注册表 id；站内正交投影实验记 'lab.projection'；没结果的提问记 null */
  viz: string | null;
  node?: string;
  at: number;
  /** preset = 随站发布的预置实验；ask = 用户自己问的（无 key 时只给示例提示） */
  origin: 'preset' | 'ask';
}

export const turnKey = (t: Pick<LabTurn, 'q' | 'viz' | 'node'>) => `${t.viz ?? 'ask'}|${t.node ?? ''}|${t.q}`;

export async function loadLabHistory(store: WorkspaceStore): Promise<LabTurn[]> {
  try {
    const t = await readJson<LabTurn[]>(store, LAB_HISTORY_PATH);
    if (!Array.isArray(t)) return [];
    return t.filter((x) => x && typeof x.q === 'string' && typeof x.at === 'number');
  } catch {
    return [];
  }
}

export async function saveLabHistory(store: WorkspaceStore, turns: LabTurn[]): Promise<void> {
  const sorted = [...turns].sort((a, b) => b.at - a.at).slice(0, KEEP);
  await writeJson(store, LAB_HISTORY_PATH, sorted);
}

/** 同一问 + 同一实验 + 同一主题只留一条：再打开时提到最前并更新时间 */
export function upsertTurn(all: LabTurn[], turn: LabTurn): LabTurn[] {
  const key = turnKey(turn);
  const rest = all.filter((x) => turnKey(x) !== key);
  return [turn, ...rest];
}

export const labUid = () => `lab${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;