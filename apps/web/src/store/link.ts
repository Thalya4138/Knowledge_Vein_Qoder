import { browserStore, digest } from './browser';
import { idbGet, idbPut } from './idb';
import { folderStore, type DirHandle, type HandleRecord } from './folder';
import { registerWorkspace } from './registry';
import { classify, placeBrowserFile, SKIP_DIR } from './tree';
import type { Workspace } from './types';

/**
 * 「对齐文件夹」：浏览器工作区（含导入的文件夹）与电脑上的一个文件夹双向对齐。
 *
 * 每个文件三份指纹：这里（浏览器）、文件夹、上次对齐时（base）。
 *   这里 = 文件夹               → 一致
 *   只有这里变了（文件夹 = base）  → 写进文件夹
 *   只有文件夹变了（这里 = base）  → 读到这里
 *   两边都变了                   → 冲突，由用户逐个选留哪一份
 * 不删除任何一边的文件：一边没有的文件只会被补上，不会把另一边的删掉（删磁盘文件属于不可逆操作）。
 */

export type ChangeKind = 'push' | 'pull' | 'conflict';

export interface Change {
  path: string;
  kind: ChangeKind;
}

/** 纯函数：比较三份指纹，得出每个文件该怎么办。 */
export function planAlign(here: Map<string, string>, there: Map<string, string>, base: Record<string, string>): { changes: Change[]; same: string[] } {
  const changes: Change[] = [];
  const same: string[] = [];
  const paths = [...new Set([...here.keys(), ...there.keys()])].sort((a, b) => a.localeCompare(b, 'zh'));
  for (const path of paths) {
    const h = here.get(path);
    const t = there.get(path);
    const b = base[path];
    if (h !== undefined && h === t) same.push(path);
    else if (t === undefined) changes.push({ path, kind: 'push' });
    else if (h === undefined) changes.push({ path, kind: 'pull' });
    else if (t === b) changes.push({ path, kind: 'push' });
    else if (h === b) changes.push({ path, kind: 'pull' });
    else changes.push({ path, kind: 'conflict' });
  }
  return { changes, same };
}

const MAX_FILES = 400;

/** 文件夹这一侧：只看工作台能打开的文件，跳过隐藏目录、依赖与构建产物（与「打开本地文件夹」同一套规则）。 */
async function folderHashes(root: DirHandle): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const walk = async (dir: DirHandle, base: string) => {
    for await (const entry of dir.values()) {
      if (out.size >= MAX_FILES) return;
      if (SKIP_DIR.test(entry.name) && entry.name !== '.vein') continue;
      const rel = base ? `${base}/${entry.name}` : entry.name;
      if (entry.kind === 'directory') await walk(entry, rel);
      else if (classify(entry.name)) out.set(rel, await digest(await entry.getFile()));
    }
  };
  await walk(root, '');
  return out;
}

async function hereHashes(wsId: string): Promise<Map<string, string>> {
  return new Map((await browserStore(wsId).list('')).map((e) => [e.path, e.hash]));
}

const linkId = (wsId: string) => `link:${wsId}`;

export function linkSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/** 选一个文件夹与这个工作区对齐（必须由点击触发）。 */
export async function chooseFolder(workspace: Workspace): Promise<Workspace | null> {
  const picker = (window as unknown as { showDirectoryPicker: (o: object) => Promise<DirHandle> }).showDirectoryPicker;
  let handle: DirHandle;
  try {
    handle = await picker({ mode: 'readwrite', id: 'vein-align' });
  } catch {
    return null;
  }
  await idbPut('handles', { id: linkId(workspace.id), handle } satisfies HandleRecord);
  const linked: Workspace = { ...workspace, link: { folder: handle.name, base: {}, at: 0 } };
  await registerWorkspace(linked);
  return linked;
}

export async function unlinkFolder(workspace: Workspace): Promise<Workspace> {
  const { link: _drop, ...rest } = workspace;
  await registerWorkspace(rest);
  return rest;
}

/** 取对齐用的目录句柄；`request` 为真时请求授权（必须由点击触发）。 */
export async function linkedHandle(workspace: Workspace, request: boolean): Promise<{ handle: DirHandle; permission: PermissionState } | null> {
  const record = await idbGet<HandleRecord>('handles', linkId(workspace.id));
  if (!record) return null;
  let permission = await record.handle.queryPermission({ mode: 'readwrite' });
  if (permission !== 'granted' && request) permission = await record.handle.requestPermission({ mode: 'readwrite' });
  return { handle: record.handle, permission };
}

export async function compareFolder(workspace: Workspace, handle: DirHandle) {
  const [here, there] = await Promise.all([hereHashes(workspace.id), folderHashes(handle)]);
  return { ...planAlign(here, there, workspace.link?.base ?? {}), here, there };
}

/**
 * 执行对齐。`pick` 给冲突文件选边：'here' 用这里的覆盖文件夹，'there' 用文件夹的覆盖这里；没选的冲突跳过。
 * 返回更新后的工作区（文件栏补上读进来的文件、base 记下这次对齐后的指纹）。
 */
export async function applyAlign(
  workspace: Workspace,
  handle: DirHandle,
  changes: readonly Change[],
  pick: Record<string, 'here' | 'there' | undefined>,
): Promise<{ workspace: Workspace; pushed: number; pulled: number; skipped: number }> {
  const here = browserStore(workspace.id);
  const there = folderStore(handle);
  let ws = workspace;
  let pushed = 0;
  let pulled = 0;
  let skipped = 0;
  for (const c of changes) {
    const dir = c.kind === 'conflict' ? pick[c.path] : c.kind === 'push' ? 'here' : 'there';
    if (!dir) {
      skipped += 1;
      continue;
    }
    if (dir === 'here') {
      await there.write(c.path, await here.read(c.path));
      pushed += 1;
    } else {
      await here.write(c.path, await there.read(c.path));
      ws = placeBrowserFile(ws, c.path).workspace;
      pulled += 1;
    }
  }
  // 重新取一次两边指纹：只有两边一致的文件才记进 base，跳过的冲突保持「两边都改过」
  const [h, t] = await Promise.all([hereHashes(workspace.id), folderHashes(handle)]);
  const base: Record<string, string> = { ...(workspace.link?.base ?? {}) };
  for (const [path, hash] of h) if (t.get(path) === hash) base[path] = hash;
  ws = { ...ws, link: { folder: handle.name, base, at: Date.now() } };
  await registerWorkspace(ws);
  return { workspace: ws, pushed, pulled, skipped };
}
