import { idbGet, idbPut } from '../../store/idb';
import { registerWorkspace } from '../../store/registry';
import type { FileKind, Workspace, WsFile, WsFolder } from './workspaceData';

interface DirHandle {
  name: string;
  values(): AsyncIterable<DirHandle | FileHandle>;
  kind: 'directory';
  queryPermission(options: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission(options: { mode: 'readwrite' }): Promise<PermissionState>;
}
interface FileHandle {
  name: string;
  kind: 'file';
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string | Blob): Promise<void>; close(): Promise<void> }>;
}

interface HandleRecord {
  id: string;
  handle: DirHandle;
}

export interface LocalFolderResult {
  ws: Workspace;
  skipped: number;
  permission: PermissionState;
}

const handles = new Map<string, FileHandle>();

const KIND: [RegExp, FileKind, WsFile['lang']?][] = [
  [/\.(md|markdown|txt)$/i, 'source', 'markdown'],
  [/\.json$/i, 'source', 'json'],
  [/\.pdf$/i, 'pdf'],
  [/\.(png|jpe?g|gif|svg|webp)$/i, 'image'],
  [/\.html?$/i, 'html'],
];

const SKIP = /^(\.|node_modules$|dist$|__pycache__$)/;
const MAX_FILES = 400;
const MAX_DEPTH = 3;

export function localFolderSupported(): boolean {
  return 'showDirectoryPicker' in window;
}

function clearHandles(wsId: string) {
  for (const id of handles.keys()) if (id.startsWith(`${wsId}/`)) handles.delete(id);
}

async function scan(root: DirHandle): Promise<{ ws: Workspace; skipped: number }> {
  const wsId = `local:${root.name}`;
  clearHandles(wsId);
  const groups = new Map<string, WsFile[]>();
  let count = 0;
  let skipped = 0;

  const walk = async (dir: DirHandle, path: string[], depth: number) => {
    for await (const entry of dir.values()) {
      if (SKIP.test(entry.name)) continue;
      if (entry.kind === 'directory') {
        if (depth < MAX_DEPTH) await walk(entry, [...path, entry.name], depth + 1);
        continue;
      }
      const hit = KIND.find(([re]) => re.test(entry.name));
      if (!hit || count >= MAX_FILES) {
        skipped += 1;
        continue;
      }
      count += 1;
      const rel = [...path, entry.name].join('/');
      const id = `${wsId}/${rel}`;
      handles.set(id, entry);
      const group = path[0] ?? '根目录';
      const name = path.length > 1 ? `${path.slice(1).join(' / ')} / ${entry.name}` : entry.name;
      const file: WsFile = { id, name, kind: hit[1], url: '', lang: hit[2], local: true, path: rel };
      groups.set(group, [...(groups.get(group) ?? []), file]);
    }
  };
  await walk(root, [], 0);

  const folders: WsFolder[] = [...groups.entries()]
    .sort(([a], [b]) => (a === '根目录' ? -1 : b === '根目录' ? 1 : a.localeCompare(b, 'zh')))
    .map(([name, files]) => ({
      id: `${root.name}:${name}`,
      name,
      files: files.sort((x, y) => x.name.localeCompare(y.name, 'zh')),
    }));

  return {
    ws: { id: wsId, name: root.name, glyph: [...root.name][0] ?? '文', origin: 'folder', folders },
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
  const record = await idbGet<HandleRecord>('handles', workspace.id);
  if (!record) return null;
  let permission = await record.handle.queryPermission({ mode: 'readwrite' });
  if (permission !== 'granted' && request) permission = await record.handle.requestPermission({ mode: 'readwrite' });
  if (permission !== 'granted') return { ws: workspace, skipped: 0, permission };
  const scanned = await scan(record.handle);
  await registerWorkspace(scanned.ws);
  return { ...scanned, permission };
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
