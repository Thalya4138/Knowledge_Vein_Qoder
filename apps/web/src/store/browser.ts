import { idbDelete, idbGet, idbGetAll, idbPut } from './idb';
import { namedWorkspace, registerWorkspace } from './registry';
import { classify, fileId, placeBrowserFile, SKIP_DIR } from './tree';
import type { FileEntry, Workspace, WorkspaceStore, WsFile } from './types';

interface BrowserFileRecord {
  id: string;
  wsId: string;
  path: string;
  data: Blob;
}

export async function digest(data: Blob): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', await data.arrayBuffer()));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function browserStore(wsId: string): WorkspaceStore {
  return {
    kind: 'browser',
    writable: true,
    async list(prefix = '') {
      const records = await idbGetAll<BrowserFileRecord>('files');
      return Promise.all(
        records
          .filter((r) => r.wsId === wsId && r.path.startsWith(prefix))
          .map(async (r): Promise<FileEntry> => ({ path: r.path, size: r.data.size, hash: await digest(r.data) })),
      );
    },
    async read(path) {
      const record = await idbGet<BrowserFileRecord>('files', fileId(wsId, path));
      if (!record) throw new Error(`文件不存在：${path}`);
      return record.data;
    },
    async write(path, data) {
      await idbPut('files', { id: fileId(wsId, path), wsId, path, data } satisfies BrowserFileRecord);
    },
    async remove(path) {
      await idbDelete('files', fileId(wsId, path));
    },
  };
}

export function makeBrowserWorkspace(name: string, id = `browser:${crypto.randomUUID()}`): Workspace {
  return namedWorkspace({ id, name, glyph: '文', origin: 'browser', folders: [] }, name);
}

/**
 * 请求浏览器把本站存储标为「持久」：默认是尽力保存，磁盘紧张时浏览器可能自行清掉 IndexedDB。
 * 浏览器可以拒绝（Chrome 按站点使用情况自动决定），拒绝也不影响使用；返回是否已持久。
 */
export async function keepStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    return (await navigator.storage.persisted()) || (await navigator.storage.persist());
  } catch {
    return false;
  }
}

export async function createBrowserWorkspace(name: string): Promise<Workspace> {
  const workspace = makeBrowserWorkspace(name);
  await registerWorkspace(workspace);
  void keepStorage();
  return workspace;
}

export function browserNoteDraft(workspace: Workspace, name: string) {
  const title = name.trim().replace(/\.md$/i, '').replace(/[\/]/g, '-').trim();
  if (!title) throw new Error('笔记名称不能为空');
  const path = `notes/${title}.md`;
  const placed = placeBrowserFile(workspace, path);
  return {
    ...placed,
    record: { id: placed.file.id, wsId: workspace.id, path, data: new Blob([`# ${title}\n\n`], { type: 'text/markdown' }) } as BrowserFileRecord,
  };
}

export async function createBrowserNote(workspace: Workspace, name: string): Promise<{ workspace: Workspace; file: WsFile }> {
  const draft = browserNoteDraft(workspace, name);
  await idbPut('files', draft.record);
  await registerWorkspace(draft.workspace);
  return { workspace: draft.workspace, file: draft.file };
}

/**
 * 往浏览器工作区写一个文件，并让它出现在文件栏里（导图写进 maps/ 后，工作台也能看到 maps/mind.json）。
 * 示例工作区的覆盖层也是浏览器存储，但示例的文件栏是固定的，不登记。
 */
export async function writeBrowserFile(workspace: Workspace, path: string, data: Blob): Promise<Workspace> {
  await browserStore(workspace.id).write(path, data);
  if (workspace.origin !== 'browser') return workspace;
  const placed = placeBrowserFile(workspace, path);
  await registerWorkspace(placed.workspace);
  return placed.workspace;
}

export interface ImportedFile {
  /** 相对所选文件夹的路径，如 `notes/第一讲.md` */
  path: string;
  data: Blob;
}

/**
 * 导入文件夹（任何浏览器都能用，走 `<input webkitdirectory>`）：把文件复制进一个新的浏览器工作区。
 * 与「打开本地文件夹」的区别：这里是副本，改动不会写回你的硬盘。
 */
export function planImport(name: string, files: readonly ImportedFile[], id?: string) {
  let workspace = makeBrowserWorkspace(name, id);
  const records: BrowserFileRecord[] = [];
  let skipped = 0;
  for (const f of files) {
    const parts = f.path.split('/');
    if (parts.slice(0, -1).some((p) => SKIP_DIR.test(p)) || parts.at(-1)!.startsWith('.') || !classify(f.path)) {
      skipped += 1;
      continue;
    }
    const placed = placeBrowserFile(workspace, f.path);
    workspace = placed.workspace;
    records.push({ id: placed.file.id, wsId: workspace.id, path: f.path, data: f.data });
  }
  return { workspace, records, skipped };
}

export async function importBrowserFolder(name: string, files: readonly ImportedFile[]) {
  const plan = planImport(name, files);
  for (const r of plan.records) await idbPut('files', r);
  await registerWorkspace(plan.workspace);
  void keepStorage();
  return { workspace: plan.workspace, count: plan.records.length, skipped: plan.skipped };
}

export async function browserFileUrl(id: string): Promise<string> {
  const record = await idbGet<BrowserFileRecord>('files', id);
  if (!record) throw new Error('这个浏览器文件已不存在，请重新打开工作区。');
  return URL.createObjectURL(record.data);
}

export async function saveBrowserText(id: string, text: string): Promise<void> {
  const record = await idbGet<BrowserFileRecord>('files', id);
  if (!record) throw new Error('这个浏览器文件已不存在，无法保存。');
  await idbPut('files', { ...record, data: new Blob([text], { type: record.data.type || 'text/plain' }) });
}
