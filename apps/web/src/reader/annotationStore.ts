import { openStore, readJson, writeJson } from '../store/open';
import type { Workspace, WsFile } from '../store/types';
import type { Annotation } from './annotations';

/**
 * 批注存在工作区里的隐藏目录：`.vein/annotations/<讲义路径>.json`。
 * 点开头的目录 Obsidian 不显示、文件栏扫描也跳过，讲义本身保持干净；对齐文件夹时会跟着讲义一起走。
 */

const pathOf = (file: WsFile) => `.vein/annotations/${(file.path ?? file.id).replace(/^\/+/, '')}.json`;

interface AnnFile {
  version: 1;
  note: string;
  items: Annotation[];
}

export async function loadAnnotations(ws: Workspace, file: WsFile): Promise<Annotation[]> {
  const opened = await openStore(ws);
  if (opened.status !== 'ready') return [];
  const data = await readJson<AnnFile>(opened.store, pathOf(file)).catch(() => null);
  return Array.isArray(data?.items) ? data.items : [];
}

export async function saveAnnotations(ws: Workspace, file: WsFile, items: Annotation[]): Promise<void> {
  const opened = await openStore(ws);
  if (opened.status !== 'ready') throw new Error('需要先授权这个工作区，批注才能保存。');
  await writeJson(opened.store, pathOf(file), { version: 1, note: file.path ?? file.name, items } satisfies AnnFile);
}
