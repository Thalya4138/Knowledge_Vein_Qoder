import { idbDelete, idbGet, idbGetAll, idbPut } from './idb';
import { namedWorkspace, registerWorkspace } from './registry';
import type { FileEntry, Workspace, WorkspaceStore, WsFile } from './types';

interface BrowserFileRecord {
  id: string;
  wsId: string;
  path: string;
  data: Blob;
}

const fileId = (wsId: string, path: string) => `${wsId}/${path}`;

async function digest(data: Blob): Promise<string> {
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

export async function createBrowserWorkspace(name: string): Promise<Workspace> {
  const workspace = makeBrowserWorkspace(name);
  await registerWorkspace(workspace);
  return workspace;
}

export function browserNoteDraft(workspace: Workspace, name: string) {
  const title = name.trim().replace(/\.md$/i, '').replace(/[\\/]/g, '-').trim();
  if (!title) throw new Error('笔记名称不能为空');
  const path = `notes/${title}.md`;
  const id = fileId(workspace.id, path);
  const file: WsFile = {
    id,
    name: `${title}.md`,
    kind: 'source',
    url: '',
    lang: 'markdown',
    browser: true,
    path,
  };
  const notes = workspace.folders.find((f) => f.id === 'notes');
  const files = [...(notes?.files ?? []).filter((f) => f.id !== id), file].sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  const folders = notes
    ? workspace.folders.map((f) => (f.id === 'notes' ? { ...f, files } : f))
    : [{ id: 'notes', name: '讲义', files }];
  return {
    workspace: { ...workspace, folders },
    file,
    record: { id, wsId: workspace.id, path, data: new Blob([`# ${title}\n\n`], { type: 'text/markdown' }) } as BrowserFileRecord,
  };
}

export async function createBrowserNote(workspace: Workspace, name: string): Promise<{ workspace: Workspace; file: WsFile }> {
  const draft = browserNoteDraft(workspace, name);
  await idbPut('files', draft.record);
  await registerWorkspace(draft.workspace);
  return { workspace: draft.workspace, file: draft.file };
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
