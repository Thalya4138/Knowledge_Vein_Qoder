import { describe, expect, it } from 'vitest';
import demoGraph from '../../../../content/demo/linear-algebra/graph.json';
import { DEMO_WORKSPACE } from '../features/workspace/workspaceData';
import { atlasFocusHref, exploreHref, exploreQuestion, fileIdByPath, lectureHref, nodesByHeading, splitAnchor } from './links';

const NOTE = 'notes/2.1-列空间中的最近点.md';

describe('板块之间的去处', () => {
  it('锚点拆成路径与标题', () => {
    expect(splitAnchor(`${NOTE}#法方程`)).toEqual({ path: NOTE, heading: '法方程' });
    expect(splitAnchor(NOTE)).toEqual({ path: NOTE, heading: '' });
  });

  it('示例工作区的讲义没有 path，也能按原文地址找到', () => {
    expect(fileIdByPath(DEMO_WORKSPACE, NOTE)).toBe('note-2-1');
    expect(fileIdByPath(DEMO_WORKSPACE, 'notes/不存在.md')).toBeNull();
  });

  it('讲义对应处：带工作区、文件与标题 slug；讲义不在工作区里就不给链接', () => {
    const href = lectureHref(DEMO_WORKSPACE, `${NOTE}#点唯一，参数未必唯一`)!;
    const url = new URL(href, 'https://x.test');
    expect(url.pathname).toBe('/workspace');
    expect(url.searchParams.get('ws')).toBe(DEMO_WORKSPACE.id);
    expect(url.searchParams.get('file')).toBe('note-2-1');
    expect(decodeURIComponent(url.hash.slice(1))).toBe('点唯一参数未必唯一');
    expect(lectureHref(DEMO_WORKSPACE, null)).toBeNull();
    expect(lectureHref(DEMO_WORKSPACE, 'notes/别处.md#x')).toBeNull();
  });

  it('示例图谱里每个带锚点的节点都能落到讲义里真实存在的标题', async () => {
    const { parseNote } = await import('../content');
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.resolve(__dirname, '../../../../content/demo/linear-algebra', NOTE), 'utf8');
    const slugs = new Set(parseNote(src).headings.map((h) => h.slug));
    const anchored = demoGraph.nodes.filter((n) => n.noteAnchor);
    expect(anchored.length).toBeGreaterThan(0);
    for (const n of anchored) {
      const hash = new URL(lectureHref(DEMO_WORKSPACE, n.noteAnchor)!, 'https://x.test').hash;
      expect(slugs.has(decodeURIComponent(hash.slice(1))), n.id).toBe(true);
    }
  });

  it('拿去探索：带上邻居但不超过四个，不重复自己', () => {
    expect(exploreQuestion('法方程', [])).toContain('「法方程」');
    const qn = exploreQuestion('法方程', ['正交条件', '法方程', '满列秩', '正交条件', 'a', 'b', 'c']);
    expect(qn).toBe('「法方程」，以及图谱里和它相连的「正交条件」、「满列秩」、「a」、「b」：它们是怎样连成一个结构的？');
    const url = new URL(exploreHref('ws1', qn), 'https://x.test');
    expect(url.searchParams.get('mode')).toBe('fragments');
    expect(url.searchParams.get('q')).toBe(qn);
  });

  it('讲义标题反查知识点；别的文件的锚点不算', () => {
    const map = nodesByHeading(demoGraph.nodes, NOTE);
    expect(map.get('点唯一参数未必唯一')?.map((n) => n.id).sort()).toEqual(['n.full-column-rank', 'n.orth-proj', 'n.unique-solution']);
    expect(nodesByHeading(demoGraph.nodes, 'notes/别处.md').size).toBe(0);
    expect(new URL(atlasFocusHref('w', 'n.normal-eq'), 'https://x.test').searchParams.get('focus')).toBe('n.normal-eq');
  });
});
