import type { FileKind, Workspace, WsFile, WsFolder } from './types';

/**
 * 工作区文件栏的共用规则：什么文件能打开、按哪一级目录分组。
 * 本地文件夹扫描、导入文件夹、新建笔记、写导图都用这一份，避免各写一套。
 */

const KIND: [RegExp, FileKind, WsFile['lang']?][] = [
  [/\.(md|markdown|txt)$/i, 'source', 'markdown'],
  [/\.json$/i, 'source', 'json'],
  [/\.pdf$/i, 'pdf'],
  [/\.(png|jpe?g|gif|svg|webp)$/i, 'image'],
  [/\.html?$/i, 'html'],
];

/** 跳过的目录：隐藏目录、依赖与构建产物 */
export const SKIP_DIR = /^(\.|node_modules$|dist$|__pycache__$)/;

export function classify(name: string): { kind: FileKind; lang?: WsFile['lang'] } | null {
  const hit = KIND.find(([re]) => re.test(name));
  return hit ? { kind: hit[1], lang: hit[2] } : null;
}

const ROOT = '根目录';
/** 浏览器工作区里几个约定目录的中文名 */
const LABEL: Record<string, string> = { notes: '讲义', maps: '导图' };

export function fileId(wsId: string, path: string): string {
  return `${wsId}/${path}`;
}

/** 文件在文件栏里显示的名字：第一级目录之下的路径 */
export function displayName(path: string): string {
  const parts = path.split('/');
  return parts.length > 2 ? `${parts.slice(1, -1).join(' / ')} / ${parts.at(-1)}` : parts.at(-1)!;
}

export function groupOf(path: string): string {
  const parts = path.split('/');
  return parts.length > 1 ? parts[0]! : ROOT;
}

export function sortFolders(folders: WsFolder[]): WsFolder[] {
  return [...folders].sort((a, b) => (a.name === ROOT ? -1 : b.name === ROOT ? 1 : a.name.localeCompare(b.name, 'zh')));
}

/** 浏览器工作区：把一个文件放进它所属的分组（已存在则替换），返回新的工作区。 */
export function placeBrowserFile(workspace: Workspace, path: string): { workspace: Workspace; file: WsFile } {
  const c = classify(path);
  if (!c) throw new Error(`暂不支持这种文件：${path}`);
  const id = fileId(workspace.id, path);
  const file: WsFile = { id, name: displayName(path), kind: c.kind, url: '', lang: c.lang, browser: true, path };
  const group = groupOf(path);
  const folder = workspace.folders.find((f) => f.id === group);
  const files = [...(folder?.files ?? []).filter((f) => f.id !== id), file].sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  const folders = folder
    ? workspace.folders.map((f) => (f.id === group ? { ...f, files } : f))
    : sortFolders([...workspace.folders, { id: group, name: LABEL[group] ?? group, files }]);
  return { workspace: { ...workspace, folders }, file };
}
