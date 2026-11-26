import { describe, expect, it } from 'vitest';
import { anchorHeading, buildPatchChanges, insertAfterAnchor, patchInsertion } from './deskPatch';

const note = ['# 讲义', '', '## 法方程', '', '法方程是 AᵀAx=Aᵀb。', '', '## 唯一性', '', '满列秩时唯一。', ''].join('\n');

describe('deskPatch · 一键补进笔记（确定性）', () => {
  it('anchorHeading 取 # 后的标题', () => {
    expect(anchorHeading('notes/a.md#法方程')).toBe('法方程');
    expect(anchorHeading('法方程')).toBe('法方程');
  });

  it('插到指定标题那一节末尾，下一个同级标题之前，不动原文', () => {
    const out = insertAfterAnchor(note, 'notes/a.md#法方程', '新增的一段。');
    expect(out).toContain('法方程是 AᵀAx=Aᵀb。\n\n新增的一段。\n\n## 唯一性');
    expect(out).toContain('满列秩时唯一。');
    expect(out.indexOf('新增的一段。')).toBeLessThan(out.indexOf('## 唯一性'));
  });

  it('标题含全角空格也能匹配', () => {
    const src = '## 第1节　正交投影\n\n正文。\n\n## 下一节\n\nx';
    const out = insertAfterAnchor(src, '第1节 正交投影', '补一句。');
    expect(out).toContain('正文。\n\n补一句。\n\n## 下一节');
  });

  it('找不到标题就追加到末尾', () => {
    const out = insertAfterAnchor(note, '不存在的标题', '追加内容。');
    expect(out.trimEnd().endsWith('追加内容。')).toBe(true);
    expect(out).toContain('满列秩时唯一。');
  });

  it('空锚点追加到末尾', () => {
    const out = insertAfterAnchor(note, '', 'X');
    expect(out.trimEnd().endsWith('X')).toBe(true);
  });

  it('patchInsertion 带出处说明与位置清单，不改写回答', () => {
    const ins = patchInsertion('为什么唯一？', '因为满列秩。', [{ n: 1, anchor: 'a.md#唯一性', heading: '唯一性', label: '讲义 / 唯一性' }], '2026-11-26');
    expect(ins).toContain('补自工作台问答 · 2026-11-26');
    expect(ins).toContain('问：为什么唯一？');
    expect(ins).toContain('因为满列秩。');
    expect(ins).toContain('[1] 讲义 / 唯一性');
  });

  it('buildPatchChanges 产出一条 update 提案', () => {
    const cs = buildPatchChanges('notes/a.md', 'notes/a.md#法方程', note, 'q', '回答。', [], '2026-11-26');
    expect(cs.changes).toHaveLength(1);
    expect(cs.changes[0]).toMatchObject({ op: 'update', path: 'notes/a.md' });
    if (cs.changes[0]!.op !== 'update') throw new Error('unreachable');
    expect(cs.changes[0]!.content).toContain('回答。');
    expect(cs.changes[0]!.reason).toContain('法方程');
  });
});