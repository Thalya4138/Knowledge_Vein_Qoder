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
  /** 跳过了什么、为什么——页面上要原样告诉用户，不许静默丢弃 */
  skippedNote: string;
  permission: PermissionState;
}

const handles = new Map<string, FileHandle>();

// 上限只防误选整个磁盘；正常的 Obsidian 库远到不了
const MAX_FILES = 3000;
const MAX_DEPTH = 20;

export function localFolderSupported(): boolean {
  return 'showDirectoryPicker' in window;
}

function clearHandles(wsId: string) {
  for (const id of handles.keys()) if (id.startsWith(`${wsId}/`)) handles.delete(id);
}

/** `name` 传入时沿用用户改过的名字，不被文件夹原名覆盖。 */
async function scan(root: DirHandle, name = root.name): Promise<{ ws: Workspace; skipped: number; skippedNote: string }> {
  const wsId = `local:${root.name}`;
  clearHandles(wsId);
  const groups = new Map<string, WsFile[]>();
  let count = 0;
  let skipped = 0;
  let unsupported = 0;
  let overLimit = 0;
  const tooDeep: string[] = [];

  const walk = async (dir: DirHandle, path: string[], depth: number) => {
    for await (const entry of dir.values()) {
      if (SKIP_DIR.test(entry.name)) continue;
      if (entry.kind === 'directory') {
        if (depth < MAX_DEPTH) await walk(entry, [...path, entry.name], depth + 1);
        else tooDeep.push([...path, entry.name].join('/'));
        continue;
      }
      const hit = classify(entry.name);
      if (!hit) {
        unsupported += 1;
        skipped += 1;
        continue;
      }
      if (count >= MAX_FILES) {
        overLimit += 1;
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

  const notes: string[] = [];
  if (unsupported) notes.push(`${unsupported} 个文件不是 Markdown / PDF / 图片 / HTML / JSON，没有列出`);
  if (overLimit) notes.push(`文件超过 ${MAX_FILES} 个，后面的 ${overLimit} 个没有列出`);
  if (tooDeep.length) notes.push(`${tooDeep.length} 个文件夹超过 ${MAX_DEPTH} 层没有展开（如 ${tooDeep[0]}）`);
  return {
    ws: { id: wsId, name, glyph: [...name][0] ?? '文', origin: 'folder', folders },
    skipped,
    skippedNote: notes.join('；'),
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
  if (h.permission !== 'granted') return { ws: workspace, skipped: 0, skippedNote: '', permission: h.permission };
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
