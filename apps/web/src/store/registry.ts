import { DEMO_WORKSPACE } from '../features/workspace/workspaceData';
import { browserStore } from './browser';
import { overlayEntries, withDemoOverlay } from './demo';
import { idbDeleteWorkspace, idbGet, idbGetAll, idbPut } from './idb';
import type { Workspace } from './types';

export function mergeWorkspaces(records: readonly Workspace[]): Workspace[] {
  const byId = new Map<string, Workspace>();
  for (const workspace of records) {
    if (workspace.id !== DEMO_WORKSPACE.id && workspace.origin !== 'demo') byId.set(workspace.id, workspace);
  }
  const others = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  // 写入后的示例工作区带着覆盖层文件栏进来时要用它，不能被静态常量顶回去（验收 #5）
  const demo = records.find((w) => w.origin === 'demo' && w.id === DEMO_WORKSPACE.id) ?? DEMO_WORKSPACE;
  return [demo, ...others];
}

export function namedWorkspace(workspace: Workspace, name: string): Workspace {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('工作区名称不能为空');
  return { ...workspace, name: trimmed, glyph: [...trimmed][0] ?? '文' };
}

export async function listWorkspaces(): Promise<Workspace[]> {
  const merged = mergeWorkspaces(await idbGetAll<Workspace>('workspaces'));
  // 示例不注册进 idb：刷新后覆盖层文件栏从浏览器存储读回合并
  const entries = overlayEntries(await browserStore(DEMO_WORKSPACE.id).list(''));
  return merged.map((w) => (w.origin === 'demo' ? withDemoOverlay(w, entries) : w));
}

export async function getWorkspace(id: string): Promise<Workspace | undefined> {
  return id === DEMO_WORKSPACE.id ? DEMO_WORKSPACE : idbGet<Workspace>('workspaces', id);
}

export async function registerWorkspace(workspace: Workspace): Promise<void> {
  if (workspace.origin === 'demo') throw new Error('示例工作区不需要注册');
  await idbPut('workspaces', workspace);
}

export async function unregisterWorkspace(id: string): Promise<void> {
  if (id === DEMO_WORKSPACE.id) throw new Error('示例工作区不能移除');
  await idbDeleteWorkspace(id);
}

/** 改名只改知脉里显示的名字；本地文件夹在硬盘上的名字不动。 */
export async function renameWorkspace(workspace: Workspace, name: string): Promise<Workspace> {
  if (workspace.origin === 'demo') throw new Error('示例工作区不能改名');
  const renamed = namedWorkspace(workspace, name);
  await registerWorkspace(renamed);
  return renamed;
}
