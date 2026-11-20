import { DEMO_BASE } from '../features/workspace/workspaceData';
import { browserStore } from './browser';
import { demoStore } from './demo';
import { folderHandle, folderStore } from './folder';
import type { Workspace, WorkspaceStore } from './types';

/**
 * 全站唯一的「按工作区拿存储」入口（TASK_R2_LINKAGE §2.1）。
 * 板块只认 WorkspaceStore，不关心文件在网站、浏览器还是你的硬盘上。
 */

export type OpenResult =
  | { status: 'ready'; store: WorkspaceStore }
  /** 本地文件夹需要用户点一下授权（浏览器规定，新会话都要重新允许一次） */
  | { status: 'auth' }
  | { status: 'missing'; message: string };

export async function openStore(workspace: Workspace, request = false): Promise<OpenResult> {
  switch (workspace.origin) {
    case 'demo':
      return { status: 'ready', store: demoStore(workspace.id, DEMO_BASE) };
    case 'browser':
      return { status: 'ready', store: browserStore(workspace.id) };
    case 'folder': {
      const h = await folderHandle(workspace.id, request);
      if (!h) return { status: 'missing', message: '没有找到这个文件夹的授权记录，请回工作台重新打开文件夹。' };
      if (h.permission !== 'granted') return { status: 'auth' };
      return { status: 'ready', store: folderStore(h.handle) };
    }
    default:
      return { status: 'missing', message: 'GitHub 工作区还没有接入。' };
  }
}

/* ---------- 文本与 JSON 读写（不存在时返回 null，而不是抛错） ---------- */

export async function readText(store: WorkspaceStore, path: string): Promise<string | null> {
  try {
    return await (await store.read(path)).text();
  } catch {
    return null;
  }
}

export async function readJson<T>(store: WorkspaceStore, path: string): Promise<T | null> {
  const text = await readText(store, path);
  if (text === null) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${path} 不是合法的 JSON，没有覆盖它；请先修好或删掉这个文件。`);
  }
}

export function writeText(store: WorkspaceStore, path: string, text: string, type = 'text/plain'): Promise<void> {
  return store.write(path, new Blob([text], { type }));
}

export function writeJson(store: WorkspaceStore, path: string, value: unknown): Promise<void> {
  return writeText(store, path, JSON.stringify(value, null, 2) + '\n', 'application/json');
}
