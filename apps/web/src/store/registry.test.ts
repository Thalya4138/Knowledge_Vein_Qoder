import { describe, expect, it } from 'vitest';
import { DEMO_WORKSPACE } from '../features/workspace/workspaceData';
import { makeBrowserWorkspace } from './browser';
import { mergeWorkspaces, namedWorkspace } from './registry';

describe('WorkspaceRegistry 纯函数', () => {
  it('示例始终保留且只出现一次，其它工作区按名称排序', () => {
    const b = makeBrowserWorkspace('概率论', 'browser:b');
    const a = makeBrowserWorkspace('高等数学', 'browser:a');
    const all = mergeWorkspaces([b, DEMO_WORKSPACE, a]);
    expect(all[0]?.id).toBe('linear-algebra');
    expect(all.filter((w) => w.origin === 'demo')).toHaveLength(1);
    expect(all.slice(1).map((w) => w.id)).toEqual(['browser:b', 'browser:a']);
  });

  it('同一工作区更新时只保留最新记录', () => {
    const empty = makeBrowserWorkspace('本地资料', 'local:course');
    const restored = { ...empty, origin: 'folder' as const, folders: [{ id: 'notes', name: '讲义', files: [] }] };
    const all = mergeWorkspaces([empty, restored]);
    expect(all).toHaveLength(2);
    expect(all[1]).toBe(restored);
  });

  it('改名会去掉首尾空白并更新单字标识', () => {
    const ws = makeBrowserWorkspace('旧名字', 'browser:a');
    expect(namedWorkspace(ws, '  线性代数笔记  ')).toMatchObject({ name: '线性代数笔记', glyph: '线' });
    expect(() => namedWorkspace(ws, '   ')).toThrow('工作区名称不能为空');
  });
});
