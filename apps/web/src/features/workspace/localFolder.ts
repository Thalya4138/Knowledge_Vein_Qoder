import { idbPut } from '../../store/idb';
import { folderHandle, type DirHandle, type FileHandle, type HandleRecord } from '../../store/folder';
import { registerWorkspace } from '../../store/registry';
import { classify, displayName, groupOf, SKIP_DIR, sortFolders } from '../../store/tree';
import type { Workspace, WsFile } from './workspaceData';

/**
 * 「打开本地文件夹」：扫描出文件栏，并保留每个文件的句柄供阅读器读写。
 * 目录句柄存进 IndexedDB（刷新后还在）；文件句柄只在本页内存，重新授权时重扫。
 */

export interface LocalFolderResult {
  ws: Workspace;
  skipped: number;
  permission: PermissionState;
}

const handles = new Map<string, FileHandle>();

const MAX_FILES = 400;
const MAX_DEPTH = 3;

export function localFolderSupported(): boolean {
  return 'showDirectoryPicker' in window;
}

function clearHandles(wsId: string) {
  for (const id of handles.keys()) if (id.startsWith(`${wsId}/`)) handles.delete(id);
}

/** `name` 传入时沿用用户改过的名字，不被文件夹原名覆盖。 */
async function scan(root: DirHandle, name = root.name): Promise<{ ws: Workspace; skipped: number }> {
  const wsId = `local:${root.name}`;
  clearHandles(wsId);
  const groups = new Map<string, WsFile[]>();
  let count = 0;
  let skipped = 0;

  const walk = async (dir: DirHandle, path: string[], depth: number) => {
    for await (const entry of dir.values()) {
      if (SKIP_DIR.test(entry.name)) continue;
      if (entry.kind === 'directory') {
        if (depth < MAX_DEPTH) await walk(entry, [...path, entry.name], depth + 1);
        continue;
      }
      const hit = classify(entry.name);
      if (!hit || count >= MAX_FILES) {
        skipped += 1;
        continue;
      }
      count += 1;
      const rel = [...path, entry.name].join('/');
      const id = `${wsId}/${rel}`;
      handles.set(id, entry);
      const file: WsFile = { id, name: displayName(rel), kind: hit.kind, url: '', lang: hit.lang, local: true, path: rel };
      const group = groupOf(rel);
      groups.set(group, [...(groups.get(group) ?? []), file]);
    }
  };
  await walk(root, [], 0);

  const folders = sortFolders(
    [...groups.entries()].map(([group, files]) => ({
      id: `${root.name}:${group}`,
      name: group,
      files: files.sort((x, y) => x.name.localeCompare(y.name, 'zh')),
    })),
  );

  return {
    ws: { id: wsId, name, glyph: [...name][0] ?? '文', origin: 'folder', folders },
    skipped,
  };
}

export async function openLocalFolder(): Promise<LocalFolderResult | null> {
  const picker = (window as unknown as { showDirectoryPicker: (o: object) => Promise<DirHandle> }).showDirectoryPicker;
  let root: DirHandle;
  try {
    root = await picker({ mode: 'readwrite' });
  } catch {
    return null;
  }
  const scanned = await scan(root);
  await registerWorkspace(scanned.ws);
  await idbPut('handles', { id: scanned.ws.id, handle: root } satisfies HandleRecord);
  return { ...scanned, permission: 'granted' };
}

export async function restoreLocalFolder(workspace: Workspace, request: boolean): Promise<LocalFolderResult | null> {
  const h = await folderHandle(workspace.id, request);
  if (!h) return null;
  if (h.permission !== 'granted') return { ws: workspace, skipped: 0, permission: h.permission };
  const scanned = await scan(h.handle, workspace.name);
  await registerWorkspace(scanned.ws);
  return { ...scanned, permission: h.permission };
}

export function forgetLocalFolder(wsId: string): void {
  clearHandles(wsId);
}

export async function localFileUrl(id: string): Promise<string> {
  const h = handles.get(id);
  if (!h) throw new Error('需要重新授权这个本地文件夹，才能读取文件。');
  return URL.createObjectURL(await h.getFile());
}

export async function saveLocalText(id: string, text: string): Promise<void> {
  const h = handles.get(id);
  if (!h) throw new Error('需要重新授权这个本地文件夹，才能保存文件。');
  const w = await h.createWritable();
  await w.write(text);
  await w.close();
}
