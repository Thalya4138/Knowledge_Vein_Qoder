import { slugify } from '../content';
import type { Workspace } from '../store/types';

/**
 * 板块之间的去处（TASK_R2_LINKAGE §2.2 联动矩阵）。
 * 每条去处都是一个普通地址：可刷新、可分享、可在新标签打开；拼法只在这里写一次。
 *
 * - 讲义对应处：graph.json 节点的 `noteAnchor`（`notes/x.md#标题`）→ 工作台 `?file=` + `#slug`
 * - 拿去探索：主题与它在图谱里的邻居 → 关联探索「碎片串联」的预填问题（只预填，不自动发送）
 * - 在导图里看：知识点 id → 图谱 `?map=mind&focus=`
 */

export interface AnchoredNode {
  id: string;
  title: string;
  noteAnchor?: string | null;
}

const q = (o: Record<string, string>) => new URLSearchParams(o).toString();

/** `notes/x.md#最近点满足的条件` → `{ path, heading }`；没有 `#` 时 heading 为空。 */
export function splitAnchor(anchor: string): { path: string; heading: string } {
  const i = anchor.indexOf('#');
  return i < 0 ? { path: anchor, heading: '' } : { path: anchor.slice(0, i), heading: anchor.slice(i + 1) };
}

/** 工作区里路径为 `path` 的文件 id。示例工作区的文件没有 path，用原文地址的结尾比对。 */
export function fileIdByPath(ws: Workspace, path: string): string | null {
  const want = path.replace(/^\.?\//, '');
  for (const folder of ws.folders) {
    for (const f of folder.files) {
      if (f.path === want) return f.id;
      const src = f.sourceUrl ?? f.url;
      let decoded = src;
      try {
        decoded = decodeURI(src);
      } catch {
        /* 非法编码就按原文比 */
      }
      if (decoded.endsWith('/' + want)) return f.id;
    }
  }
  return null;
}

/** 节点在讲义里的位置；讲义不在这个工作区里时返回 null（不给一个打不开的链接）。 */
export function lectureHref(ws: Workspace, anchor: string | null | undefined): string | null {
  if (!anchor) return null;
  const { path, heading } = splitAnchor(anchor);
  const id = fileIdByPath(ws, path);
  if (!id) return null;
  const hash = heading ? '#' + encodeURIComponent(slugify(heading)) : '';
  return `/workspace?${q({ ws: ws.id, file: id })}${hash}`;
}

/** 关联探索的预填问题：主题本身 + 图谱里已经连着的知识（最多 4 个，多了问题就散了）。 */
export function exploreQuestion(title: string, neighbors: string[]): string {
  const near = [...new Set(neighbors.filter((t) => t && t !== title))].slice(0, 4);
  if (!near.length) return `「${title}」和这门课里的哪些知识有本质联系？这些联系各自是怎么来的？`;
  return `「${title}」，以及图谱里和它相连的${near.map((t) => `「${t}」`).join('、')}：它们是怎样连成一个结构的？`;
}

export function exploreHref(wsId: string, question: string): string {
  return `/connection?${q({ ws: wsId, mode: 'fragments', q: question })}`;
}

export function atlasFocusHref(wsId: string, nodeId: string): string {
  return `/atlas?${q({ ws: wsId, map: 'mind', focus: nodeId })}`;
}

/** 讲义里某个标题对应的知识点（反查 `noteAnchor`）：标题 slug → 节点列表。 */
export function nodesByHeading(nodes: AnchoredNode[], notePath: string): Map<string, AnchoredNode[]> {
  const out = new Map<string, AnchoredNode[]>();
  for (const n of nodes) {
    if (!n.noteAnchor) continue;
    const { path, heading } = splitAnchor(n.noteAnchor);
    if (!heading || path.replace(/^\.?\//, '') !== notePath.replace(/^\.?\//, '')) continue;
    const slug = slugify(heading);
    out.set(slug, [...(out.get(slug) ?? []), n]);
  }
  return out;
}
