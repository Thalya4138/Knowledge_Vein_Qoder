import { useEffect, useState } from 'react';
import { demoGraph } from '../../app/demo';
import { atlasFocusHref, fileIdByPath, nodesByHeading, type AnchoredNode } from '../../app/links';
import { openStore, readJson } from '../../store/open';
import type { Workspace, WsFile } from '../../store/types';
import { usePrefs } from '../../ui/prefs';
import { DEMO_NOTE_PATHS } from './workspaceData';

export interface HeadingLink {
  label: string;
  href: string;
  hint: string;
}

/** 文件在工作区里的相对路径；示例讲义没有 path，按随站发布的讲义清单反查。 */
function notePathOf(ws: Workspace, file: WsFile): string | null {
  if (file.path) return file.path;
  return DEMO_NOTE_PATHS.find((p) => fileIdByPath(ws, p) === file.id) ?? null;
}

/**
 * 讲义标题 → 「在导图里看」（TASK_R2_LINKAGE L6 的讲义一侧）。
 * 依据是 graph.json 节点的 noteAnchor：哪些知识点锚在这个标题下，就给哪个标题一个去处。
 * 读不到图谱（没有 graph.json、本地文件夹未授权）就什么都不给，不影响阅读。
 */
export function useHeadingLinks(ws: Workspace, file: WsFile): Map<string, HeadingLink> {
  const [links, setLinks] = useState<Map<string, HeadingLink>>(new Map());
  const en = usePrefs().lang === 'en';
  useEffect(() => {
    let alive = true;
    setLinks(new Map());
    const path = notePathOf(ws, file);
    if (!path) return;
    (async () => {
      let nodes: AnchoredNode[] | null = null;
      try {
        const opened = await openStore(ws, false);
        if (opened.status === 'ready') {
          const g = await readJson<{ nodes?: AnchoredNode[] }>(opened.store, 'graph.json');
          if (g && Array.isArray(g.nodes)) nodes = g.nodes;
        }
      } catch {
        /* 读不到就退回下面的示例原件或不给链接 */
      }
      if (!nodes && ws.origin === 'demo') nodes = demoGraph.nodes as AnchoredNode[];
      if (!alive || !nodes) return;
      const out = new Map<string, HeadingLink>();
      for (const [slug, hits] of nodesByHeading(nodes, path)) {
        const first = hits[0]!;
        out.set(slug, {
          label: en ? 'See in map' : '在导图里看',
          href: atlasFocusHref(ws.id, first.id),
          hint: (en ? 'Concepts in this section: ' : '这一段讲的知识点：') + hits.map((h) => h.title).join('、'),
        });
      }
      setLinks(out);
    })();
    return () => {
      alive = false;
    };
  }, [ws.id, ws.origin, file.id, file.path, en]);
  return links;
}
