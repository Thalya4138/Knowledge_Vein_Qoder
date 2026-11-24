import { demoGraph } from '../../app/demo';
import { writeBrowserFile } from '../../store/browser';
import { readJson, writeText } from '../../store/open';
import type { Workspace, WorkspaceStore } from '../../store/types';
import {
  EMPTY_KNOWLEDGE,
  graphKnowledge,
  MIND_DOC_KEY,
  normalizeDoc,
  seedDoc,
  type GraphLike,
  type KnowledgeContext,
  type MDoc,
} from './mindDoc';

/**
 * 导图与记忆练习落在工作区文件夹里（用户 2026-11-20 裁决：存进文件夹）：
 *   maps/mind.json    思维导图（MDoc）
 *   maps/memory.json  个人记忆图谱的练习状态（收起 / 遮盖 / 挖空 / 作答 / 拖动）
 * 本地文件夹工作区里，用资源管理器、Obsidian、git 打开都能看到这两个文件。
 */

export const MIND_PATH = 'maps/mind.json';
export const MEMORY_PATH = 'maps/memory.json';
/** 旧版记忆练习的 localStorage 键，只用于一次性迁移到示例工作区 */
export const LEGACY_MEMORY_KEY = 'vein.memory.linear-algebra';

export interface MemoryState {
  collapsed: string[];
  covered: string[];
  blanks: string[];
  answers: Record<string, string>;
  offsets: Record<string, { dx: number; dy: number }>;
  autoAlign: boolean;
}

export const EMPTY_MEMORY: MemoryState = { collapsed: [], covered: [], blanks: [], answers: {}, offsets: {}, autoAlign: true };

export function normalizeMemory(o: unknown): MemoryState {
  return o && typeof o === 'object' ? { ...EMPTY_MEMORY, ...(o as Partial<MemoryState>) } : { ...EMPTY_MEMORY };
}

export interface WorkspaceMaps {
  /** null = 这个工作区还没有导图（要生成或从空白开始） */
  mind: MDoc | null;
  /** 导图还没存过（示例第一次打开）：画布按「全部展开」显示 */
  fresh: boolean;
  memory: MemoryState;
  graph: GraphLike | null;
  knowledge: KnowledgeContext;
}

type Legacy = Pick<Storage, 'getItem' | 'removeItem'> | undefined;

/** 示例工作区：把旧版存在 localStorage 的导图 / 练习搬进 maps/，搬成功后删旧键。 */
async function migrate(store: WorkspaceStore, key: string, path: string, legacy: Legacy): Promise<unknown> {
  const raw = legacy?.getItem(key);
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  await writeText(store, path, JSON.stringify(value, null, 2) + '\n', 'application/json');
  legacy?.removeItem(key);
  return value;
}

export async function loadMaps(store: WorkspaceStore, workspace: Workspace, legacy: Legacy = globalThis.localStorage): Promise<WorkspaceMaps> {
  const demo = workspace.origin === 'demo';

  const storedMind = await readJson<unknown>(store, MIND_PATH);
  let mind = storedMind === null ? null : normalizeDoc(storedMind);
  if (storedMind !== null && !mind) throw new Error(`${MIND_PATH} 不是知脉的导图格式，没有覆盖它；请先移走这个文件。`);
  let fresh = false;
  if (!mind && demo) {
    mind = normalizeDoc(await migrate(store, MIND_DOC_KEY, MIND_PATH, legacy));
    if (!mind) {
      mind = seedDoc();
      fresh = true;
    }
  }

  let memory = await readJson<unknown>(store, MEMORY_PATH);
  if (memory === null && demo) memory = await migrate(store, LEGACY_MEMORY_KEY, MEMORY_PATH, legacy);

  // 示例工作区也先读 graph.json：关联探索里接受的关系写在本机覆盖层，读不到才用随站发布的原件
  let graph: GraphLike | null = null;
  try {
    graph = await readJson<GraphLike>(store, 'graph.json');
  } catch {
    graph = null;
  }
  if (graph && (!Array.isArray(graph.nodes) || !Array.isArray(graph.relations))) graph = null;
  if (!graph && demo) graph = demoGraph as GraphLike;

  return { mind, fresh, memory: normalizeMemory(memory), graph, knowledge: graph ? graphKnowledge(graph) : EMPTY_KNOWLEDGE };
}

/**
 * 写一个 maps/ 文件。浏览器工作区第一次写时顺便登记进文件栏，工作台里就能看到它。
 * `onWorkspace` 收到更新后的工作区（用于刷新全站的工作区列表）。
 */
export function mapWriter(store: WorkspaceStore, workspace: Workspace, path: string, onWorkspace?: (w: Workspace) => void) {
  let current = workspace;
  return async (json: string) => {
    const data = new Blob([json], { type: 'application/json' });
    const listed = current.folders.some((f) => f.files.some((x) => x.path === path));
    if (current.origin === 'browser' && !listed) {
      current = await writeBrowserFile(current, path, data);
      onWorkspace?.(current);
    } else {
      await store.write(path, data);
    }
  };
}

/** 状态栏里「已保存」说到哪里 */
export function savedLabel(workspace: Workspace, path: string): string {
  if (workspace.origin === 'folder') return `已保存到文件夹 ${path}`;
  if (workspace.origin === 'demo') return '已保存在本机（示例原件不变）';
  return `已保存到工作区 ${path}`;
}
