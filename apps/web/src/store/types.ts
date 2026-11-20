export type WorkspaceOrigin = 'demo' | 'browser' | 'folder' | 'github';

export type FileKind = 'lecture' | 'pdf' | 'source' | 'image' | 'link' | 'html';

export interface WsFile {
  id: string;
  name: string;
  kind: FileKind;
  url: string;
  sourceUrl?: string;
  lang?: 'markdown' | 'json';
  meta?: { author?: string; license?: string; kind?: string; note?: string };
  local?: boolean;
  browser?: boolean;
  path?: string;
}

export interface WsFolder {
  id: string;
  name: string;
  files: WsFile[];
}

export interface Workspace {
  id: string;
  name: string;
  glyph: string;
  origin: WorkspaceOrigin;
  folders: WsFolder[];
  /**
   * 浏览器工作区与一个本地文件夹对齐的记录（只有浏览器工作区有）。
   * base = 上次对齐时每个文件的内容指纹：两边不一样时，靠它判断是哪一边改的。
   */
  link?: { folder: string; base: Record<string, string>; at: number };
}

export interface FileEntry {
  path: string;
  size: number;
  hash: string;
}

export interface WorkspaceStore {
  list(prefix?: string): Promise<FileEntry[]>;
  read(path: string): Promise<Blob>;
  write(path: string, data: Blob): Promise<void>;
  remove(path: string): Promise<void>;
  readonly kind: WorkspaceOrigin;
  readonly writable: boolean;
}
