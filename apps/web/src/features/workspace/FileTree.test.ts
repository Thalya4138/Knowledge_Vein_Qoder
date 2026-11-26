import { describe, expect, test } from 'vitest';
import { buildTree, leafName } from './FileTree';
import type { Workspace, WsFile } from './workspaceData';

const f = (path: string): WsFile => ({ id: `local:库/${path}`, name: path, kind: 'source', lang: 'markdown', url: '', local: true, path });

describe('文件树：按真实目录层级', () => {
  const ws: Workspace = {
    id: 'local:库',
    name: '库',
    glyph: '库',
    origin: 'folder',
    folders: [
      { id: '库:根目录', name: '根目录', files: [f('首页.md')] },
      { id: '库:数学', name: '数学', files: [f('数学/线代/第10章.md'), f('数学/线代/第2章.md'), f('数学/线代/附录/证明/引理.md'), f('数学/微积分.md')] },
    ],
  };
  const tree = buildTree(ws);

  test('不再拍平：数学 → 线代 → 附录 → 证明 一层层保留', () => {
    expect(tree.files.map(leafName)).toEqual(['首页']);
    const math = tree.dirs.find((d) => d.label === '数学')!;
    expect(math.files.map(leafName)).toEqual(['微积分']);
    const la = math.dirs.find((d) => d.label === '线代')!;
    expect(la.dirs[0]!.label).toBe('附录');
    expect(la.dirs[0]!.dirs[0]!.files.map(leafName)).toEqual(['引理']);
  });

  test('数字按大小排：第2章在第10章前面', () => {
    const la = tree.dirs[0]!.dirs[0]!;
    expect(la.files.map(leafName)).toEqual(['第2章', '第10章']);
  });

  test('没有 path 的示例文件：分组名当一级目录', () => {
    const demo: Workspace = { ...ws, folders: [{ id: 'notes', name: '讲义', files: [{ id: 'n1', name: '第1节', kind: 'lecture', url: '' }] }] };
    const t = buildTree(demo);
    expect(t.dirs[0]!.label).toBe('讲义');
    expect(t.dirs[0]!.files.map(leafName)).toEqual(['第1节']);
  });
});
