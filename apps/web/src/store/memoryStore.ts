import type { FileEntry, WorkspaceStore } from './types';

/** 内存里的工作区：测 maps/ 的读写，不依赖浏览器的 IndexedDB 与文件系统 */
export function memoryStore(files: Record<string, string> = {}, kind: WorkspaceStore['kind'] = 'browser') {
  const data = new Map(Object.entries(files));
  const store: WorkspaceStore = {
    kind,
    writable: true,
    async list(prefix = '') {
      return [...data.keys()].filter((p) => p.startsWith(prefix)).map((path): FileEntry => ({ path, size: data.get(path)!.length, hash: '' }));
    },
    async read(path) {
      const t = data.get(path);
      if (t === undefined) throw new Error(`文件不存在：${path}`);
      return new Blob([t]);
    },
    async write(path, blob) {
      data.set(path, await blob.text());
    },
    async remove(path) {
      data.delete(path);
    },
  };
  return { store, data };
}
