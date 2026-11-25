import { idbGet } from './idb';
import type { FileEntry, WorkspaceStore } from './types';

/**
 * 本地文件夹工作区的存储（File System Access API，仅 Chrome / Edge）。
 * 读写直接发生在用户授权的文件夹里：导图写进去，用资源管理器、Obsidian、git 都看得见。
 */

export interface FileHandle {
  name: string;
  kind: 'file';
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string | Blob): Promise<void>; close(): Promise<void> }>;
}

export interface DirHandle {
  name: string;
  kind: 'directory';
  values(): AsyncIterable<DirHandle | FileHandle>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandle>;
  removeEntry(name: string): Promise<void>;
  queryPermission(options: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission(options: { mode: 'readwrite' }): Promise<PermissionState>;
}

export interface HandleRecord {
  id: string;
  handle: DirHandle;
}

/** 拆路径并拒绝越界（`..`）与空段，避免写到授权目录之外。 */
export function splitPath(path: string): string[] {
  const parts = path.split('/').filter((p) => p && p !== '.');
  if (!parts.length || parts.some((p) => p === '..')) throw new Error(`不合法的路径：${path}`);
  return parts;
}

async function walkTo(root: DirHandle, dirs: string[], create: boolean): Promise<DirHandle> {
  let dir = root;
  for (const name of dirs) dir = await dir.getDirectoryHandle(name, { create });
  return dir;
}

export function folderStore(root: DirHandle): WorkspaceStore {
  return {
    kind: 'folder',
    writable: true,
    async list(prefix = '') {
      const out: FileEntry[] = [];
      const walk = async (dir: DirHandle, base: string) => {
        for await (const entry of dir.values()) {
          if (entry.name.startsWith('.') && entry.name !== '.vein') continue;
          const rel = base ? `${base}/${entry.name}` : entry.name;
          if (entry.kind === 'directory') {
            if (entry.name !== 'node_modules') await walk(entry, rel);
          } else if (rel.startsWith(prefix)) {
            const f = await entry.getFile();
            out.push({ path: rel, size: f.size, hash: `${f.size}:${f.lastModified}` });
          }
        }
      };
      await walk(root, '');
      return out;
    },
    async read(path) {
      const parts = splitPath(path);
      try {
        const dir = await walkTo(root, parts.slice(0, -1), false);
        return await (await dir.getFileHandle(parts.at(-1)!)).getFile();
      } catch {
        throw new Error(`文件不存在：${path}`);
      }
    },
    async write(path, data) {
      const parts = splitPath(path);
      const dir = await walkTo(root, parts.slice(0, -1), true);
      const w = await (await dir.getFileHandle(parts.at(-1)!, { create: true })).createWritable();
      await w.write(data);
      await w.close();
    },
    async remove(path) {
      const parts = splitPath(path);
      const dir = await walkTo(root, parts.slice(0, -1), false);
      await dir.removeEntry(parts.at(-1)!);
    },
  };
}

/** 取出已登记的目录句柄；`request` 为真时向用户请求授权（必须由点击触发）。 */
export async function folderHandle(wsId: string, request: boolean): Promise<{ handle: DirHandle; permission: PermissionState } | null> {
  const record = await idbGet<HandleRecord>('handles', wsId);
  if (!record) return null;
  let permission = await record.handle.queryPermission({ mode: 'readwrite' });
  if (permission !== 'granted' && request) permission = await record.handle.requestPermission({ mode: 'readwrite' });
  return { handle: record.handle, permission };
}
