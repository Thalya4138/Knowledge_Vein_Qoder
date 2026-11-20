import { demoKb, demoNoteUrl, demoResources } from '../../app/demo';
import type { FileKind, Workspace, WsFile, WsFolder } from '../../store/types';

export type { FileKind, Workspace, WsFile, WsFolder };

export const DEMO_BASE = '/demo/linear-algebra';
const BASE = DEMO_BASE;
/** 示例工作区里随网站发布的讲义原件（相对 DEMO_BASE） */
export const DEMO_NOTE_PATHS = ['notes/2.1-列空间中的最近点.md'];

const RESOURCE_KIND: Record<string, string> = {
  video: '视频',
  'video-course': '视频课程',
  pdf: 'PDF',
  web: '网页',
};

const links: WsFile[] = demoResources
  .filter((r) => r.uri && r.kind !== 'pdf')
  .map((r) => ({
    id: r.id,
    name: r.title,
    kind: 'link' as const,
    url: r.uri as string,
    meta: { author: r.author, license: r.license, kind: RESOURCE_KIND[r.kind] ?? r.kind, note: r.note },
  }));

export const DEMO_WORKSPACE: Workspace = {
  id: 'linear-algebra',
  name: '线性代数',
  glyph: '线',
  origin: 'demo',
  folders: [
    {
      id: 'notes',
      name: '讲义',
      files: [
        {
          id: 'note-2-1',
          name: demoKb.outline.find((e) => e.status === 'written')?.title.replace(/^第2章\s*/, '') ?? '第1节',
          kind: 'lecture',
          url: demoNoteUrl,
          sourceUrl: encodeURI(`${BASE}/notes/2.1-列空间中的最近点.md`),
          lang: 'markdown',
        },
      ],
    },
    {
      id: 'materials',
      name: '课程资料',
      files: [
        {
          id: 'mit-ses22-pdf',
          name: 'MIT 18.06SC 讲义摘要：子空间上的投影',
          kind: 'pdf',
          url: `${BASE}/resources/files/MIT18_06SCF11_Ses2.2sum.pdf`,
        },
        ...links,
      ],
    },
    {
      id: 'atlas',
      name: '知识结构',
      files: [
        { id: 'kb', name: '课程大纲', kind: 'source', url: `${BASE}/kb.json`, lang: 'json' },
        { id: 'graph', name: '知识关系', kind: 'source', url: `${BASE}/graph.json`, lang: 'json' },
      ],
    },
    {
      id: 'figures',
      name: '插图',
      files: [
        { id: 'fig-2-0', name: '三个数据点与两条候选直线', kind: 'image', url: encodeURI(`${BASE}/notes/figures/2-0-问题探讨.svg`) },
        { id: 'fig-2-1', name: '图 2-1 b 在列空间上的最近点', kind: 'image', url: `${BASE}/notes/figures/2-1.svg` },
        { id: 'fig-2-2', name: '图 2-2 最佳直线与残差', kind: 'image', url: `${BASE}/notes/figures/2-2.svg` },
      ],
    },
  ],
};

export const WORKSPACES: Workspace[] = [DEMO_WORKSPACE];

export function findFile(ws: Workspace, id: string | null): WsFile | undefined {
  for (const f of ws.folders) {
    const hit = f.files.find((x) => x.id === id);
    if (hit) return hit;
  }
  return undefined;
}

export function folderOf(ws: Workspace, id: string): WsFolder | undefined {
  return ws.folders.find((f) => f.files.some((x) => x.id === id));
}
