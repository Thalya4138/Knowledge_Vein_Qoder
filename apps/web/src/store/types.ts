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
