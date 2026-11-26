import { describe, expect, it } from 'vitest';
import { planImport } from './browser';
import { splitPath } from './folder';
import { classify, displayName, groupOf, placeBrowserFile } from './tree';
import { makeBrowserWorkspace } from './browser';

describe('工作区文件栏的共用规则', () => {
  it('按扩展名判断能打开的文件', () => {
    expect(classify('a.md')).toEqual({ kind: 'source', lang: 'markdown' });
    expect(classify('graph.json')).toEqual({ kind: 'source', lang: 'json' });
    expect(classify('x.PDF')?.kind).toBe('pdf');
    expect(classify('a.exe')).toBeNull();
  });

  it('按第一级目录分组，名字显示第一级之下的路径', () => {
    expect(groupOf('notes/a.md')).toBe('notes');
    expect(groupOf('a.md')).toBe('根目录');
    expect(displayName('notes/ch1/a.md')).toBe('ch1 / a.md');
    expect(displayName('notes/a.md')).toBe('a.md');
  });

  it('写进 maps/ 的文件出现在「导图」分组，重复写不重复登记', () => {
    const ws = makeBrowserWorkspace('课', 'browser:t');
    const once = placeBrowserFile(ws, 'maps/mind.json');
    const twice = placeBrowserFile(once.workspace, 'maps/mind.json');
    expect(twice.workspace.folders).toEqual([{ id: 'maps', name: '导图', files: [once.file] }]);
    expect(once.file).toMatchObject({ id: 'browser:t/maps/mind.json', kind: 'source', lang: 'json', browser: true });
  });
});

describe('导入文件夹', () => {
  const blob = new Blob(['x']);
  it('跳过隐藏文件、依赖目录与不支持的文件，路径保持相对', () => {
    const plan = planImport(
      '力学',
      [
        { path: 'notes/第一章.md', data: blob },
        { path: 'figures/f1.png', data: blob },
        { path: '.obsidian/app.json', data: blob },
        { path: 'node_modules/x/readme.md', data: blob },
        { path: '.DS_Store', data: blob },
        { path: 'setup.exe', data: blob },
      ],
      'browser:imp',
    );
    expect(plan.records.map((r) => r.path)).toEqual(['notes/第一章.md', 'figures/f1.png']);
    expect(plan.skipped).toBe(4);
    expect(plan.workspace.folders.map((f) => f.name)).toEqual(['讲义', 'figures']);
    expect(plan.records.every((r) => r.wsId === 'browser:imp')).toBe(true);
  });
});

describe('本地文件夹路径', () => {
  it('拒绝跳出授权目录的路径', () => {
    expect(splitPath('maps/mind.json')).toEqual(['maps', 'mind.json']);
    expect(() => splitPath('../secret.txt')).toThrow();
    expect(() => splitPath('')).toThrow();
  });
});
