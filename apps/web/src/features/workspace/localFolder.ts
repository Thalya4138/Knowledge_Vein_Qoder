import type { FileKind, Workspace, WsFile, WsFolder } from './workspaceData';

/**
 * 本地文件夹工作区（File System Access API，Chrome / Edge）。
 * 读：按文件夹分组，文件名就是你起的名字；写：文本文件改完直接存回原文件。
 * 句柄只保存在本页内存里；刷新后需要重新选一次文件夹（浏览器的安全规定）。
 */

interface DirHandle {
  name: string;
  values(): AsyncIterable<DirHandle | FileHandle>;
  kind: 'directory';
}
interface FileHandle {
  name: string;
  kind: 'file';
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string | Blob): Promise<void>; close(): Promise<void> }>;
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

export async function openLocalFolder(): Promise<{ ws: Workspace; skipped: number } | null> {
  const picker = (window as unknown as { showDirectoryPicker: (o: object) => Promise<DirHandle> }).showDirectoryPicker;
  let root: DirHandle;
  try {
    root = await picker({ mode: 'readwrite' });
  } catch {
    return null; // 用户取消
  }
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
      const id = `local:${root.name}/${rel}`;
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
    .map(([name, files]) => ({ id: `${root.name}:${name}`, name, files: files.sort((x, y) => x.name.localeCompare(y.name, 'zh')) }));

  return {
    ws: { id: `local:${root.name}`, name: root.name, glyph: [...root.name][0] ?? '文', folders, local: true },
    skipped,
  };
}

export async function localFileUrl(id: string): Promise<string> {
  const h = handles.get(id);
  if (!h) throw new Error('这个文件的访问权限已失效，请重新打开文件夹。');
  return URL.createObjectURL(await h.getFile());
}

export async function saveLocalText(id: string, text: string): Promise<void> {
  const h = handles.get(id);
  if (!h) throw new Error('这个文件的访问权限已失效，请重新打开文件夹。');
  const w = await h.createWritable();
  await w.write(text);
  await w.close();
}
