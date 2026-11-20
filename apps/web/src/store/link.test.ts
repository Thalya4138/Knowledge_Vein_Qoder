import { describe, expect, it } from 'vitest';
import { planAlign } from './link';

const m = (o: Record<string, string>) => new Map(Object.entries(o));

describe('对齐文件夹：三份指纹定方向', () => {
  it('第一次对齐：一致的不动，只在一边有的补到另一边', () => {
    const r = planAlign(m({ 'a.md': '1', 'b.md': '2' }), m({ 'a.md': '1', 'c.md': '3' }), {});
    expect(r.same).toEqual(['a.md']);
    expect(r.changes).toEqual([
      { path: 'b.md', kind: 'push' },
      { path: 'c.md', kind: 'pull' },
    ]);
  });

  it('只有一边改过时方向明确；两边都改过算冲突', () => {
    const base = { 'here.md': 'old', 'there.md': 'old', 'both.md': 'old' };
    const r = planAlign(m({ 'here.md': 'new', 'there.md': 'old', 'both.md': 'mine' }), m({ 'here.md': 'old', 'there.md': 'new', 'both.md': 'theirs' }), base);
    expect(r.changes).toEqual([
      { path: 'both.md', kind: 'conflict' },
      { path: 'here.md', kind: 'push' },
      { path: 'there.md', kind: 'pull' },
    ]);
  });

  it('没有对齐记录时两边不一样也算冲突，不替用户猜', () => {
    expect(planAlign(m({ 'a.md': '1' }), m({ 'a.md': '2' }), {}).changes).toEqual([{ path: 'a.md', kind: 'conflict' }]);
  });
});
