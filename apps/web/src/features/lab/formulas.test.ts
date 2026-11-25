import { describe, expect, it } from 'vitest';
import type { FileEntry, WorkspaceStore } from '../../store/types';
import { seedDoc, type MDoc } from '../atlas/mindDoc';
import { collectWorkspaceFormulas, dedupeFormulas, formulasFromMarkdown, formulasFromMind } from './formulas';

describe('formulasFromMind', () => {
  it('收集导图主题上的 f，带主题文字与 nodeId', () => {
    const doc = seedDoc();
    const node = doc.root.kids[0]!.kids[0] ?? doc.root.kids[0]!;
    node.f = ['A^{\\mathsf T}A', '  '];
    const points = formulasFromMind(doc);
    expect(points.some((p) => p.latex === 'A^{\\mathsf T}A' && p.source === 'mind' && p.nodeId === node.id)).toBe(true);
    expect(points.some((p) => p.latex === '')).toBe(false);
  });

  it('空导图返回空数组', () => {
    expect(formulasFromMind(null)).toEqual([]);
  });
});

describe('formulasFromMarkdown', () => {
  it('只取独立公式，忽略行内 $…$ 与过长的公式', () => {
    const long = 'x'.repeat(300);
    const md = ['行内 $a+b$ 不算', '$$E = mc^2$$', '$$' + long + '$$'].join('\n');
    const points = formulasFromMarkdown('notes/力学.md', md);
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ latex: 'E = mc^2', source: 'note', label: '力学' });
  });
});

describe('dedupeFormulas', () => {
  it('忽略空白、花括号与 LaTeX 命令差异去重，并保留先出现的来源', () => {
    const points = dedupeFormulas([
      { latex: 'a = b', source: 'mind', label: '导图' },
      { latex: ' a   =  {b} ', source: 'note', label: '讲义' },
      { latex: '\\frac{a}{b}', source: 'note', label: '讲义' },
    ]);
    expect(points).toHaveLength(2);
    expect(points[0]!.source).toBe('mind');
  });

  it('限制条数', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ latex: `x_{${i}}`, source: 'note' as const, label: 'n' }));
    expect(dedupeFormulas(many, 5)).toHaveLength(5);
  });
});

describe('collectWorkspaceFormulas', () => {
  it('导图公式在前，讲义公式在后，并报告读了几份讲义', async () => {
    const doc = seedDoc();
    doc.root.kids[0]!.f = ['A^{\\mathsf T}A'];
    const files: Record<string, string> = {
      'notes/a.md': '$$A^{\\mathsf T}A$$\n$$b = Ax$$',
      'notes/b.md': '没有公式',
      'notes/c.txt': '$$c=1$$',
    };
    const store = {
      list: async () => Object.keys(files).map((path) => ({ path } as FileEntry)),
      read: async (path: string) => new Blob([files[path] ?? '']),
    } as unknown as WorkspaceStore;
    const { points, notesRead } = await collectWorkspaceFormulas(store, doc);
    expect(notesRead).toBe(2);
    expect(points[0]).toMatchObject({ latex: 'A^{\\mathsf T}A', source: 'mind' });
    expect(points.some((p) => p.latex === 'b = Ax')).toBe(true);
    expect(points.filter((p) => p.latex === 'A^{\\mathsf T}A')).toHaveLength(1);
    expect(points.some((p) => p.latex === 'c=1')).toBe(false);
  });

  it('没有导图也能用；读不到的讲义不计入', async () => {
    const store = {
      list: async () => [{ path: 'notes/a.md' } as FileEntry, { path: 'notes/gone.md' } as FileEntry],
      read: async (path: string) => {
        if (path.endsWith('gone.md')) throw new Error('没有这个文件');
        return new Blob(['$$F = ma$$']);
      },
    } as unknown as WorkspaceStore;
    const { points, notesRead } = await collectWorkspaceFormulas(store, null);
    expect(points.map((p) => p.latex)).toEqual(['F = ma']);
    expect(notesRead).toBe(1);
  });
});

describe('MDoc 不因收集公式而被改写', () => {
  it('formulasFromMind 只读', () => {
    const doc: MDoc = seedDoc();
    const before = JSON.stringify(doc);
    formulasFromMind(doc);
    expect(JSON.stringify(doc)).toBe(before);
  });
});