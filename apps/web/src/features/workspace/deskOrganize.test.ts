import { describe, expect, it } from 'vitest';
import { organizeChanges, parsePlan, samplePlan } from './deskOrganize';

describe('deskOrganize · 方案规整与提案', () => {
  it('parsePlan 丢掉非法改名与缺文件名的讲义，限制数量', () => {
    const plan = parsePlan({
      status: 'ok',
      summary: ' 整理课件 ',
      folders: ['notes', ''],
      moves: [
        { from: 'a.pdf', to: '资料/a.pdf', why: '归类' },
        { from: '', to: 'x.pdf' },
        { from: 'same.pdf', to: 'same.pdf' },
      ],
      lessons: [
        { file: 'notes/正交投影.md', title: '正交投影', sections: ['一', '二'] },
        { title: '只有标题' },
        { file: 'notes/坏.txt', title: '不是 markdown' },
      ],
      stillMissing: ['缺定义'],
    });
    expect(plan.summary).toBe('整理课件');
    expect(plan.moves).toEqual([{ from: 'a.pdf', to: '资料/a.pdf', why: '归类' }]);
    expect(plan.lessons.map((l) => l.file)).toEqual(['notes/正交投影.md', 'notes/只有标题.md']);
    expect(plan.folders).toEqual(['notes']);
  });

  it('parsePlan 容忍模型返回的非对象，不抛错', () => {
    expect(parsePlan(null).status).toBe('ok');
    expect(parsePlan('x').lessons).toEqual([]);
    expect(parsePlan({ status: 'insufficient' }).status).toBe('insufficient');
  });

  it('organizeChanges：改名只动真实存在且目标未占用的文件', () => {
    const plan = parsePlan({
      moves: [
        { from: 'a.pdf', to: '资料/a.pdf', why: '归类' },
        { from: '不存在.pdf', to: '资料/b.pdf', why: 'x' },
        { from: 'c.pdf', to: '已占用.pdf', why: 'x' },
      ],
      lessons: [{ file: 'notes/新课.md', title: '新课', sections: ['正交投影'] }],
    });
    const existing = new Set(['a.pdf', 'c.pdf', '已占用.pdf']);
    const { changes } = organizeChanges(plan, existing);
    expect(changes).toHaveLength(2);
    expect(changes[0]).toMatchObject({ op: 'rename', from: 'a.pdf', to: '资料/a.pdf' });
    expect(changes[1]).toMatchObject({ op: 'create', path: 'notes/新课.md' });
  });

  it('organizeChanges：讲义骨架不覆盖已存在的文件', () => {
    const plan = parsePlan({ lessons: [{ file: 'notes/已有.md', title: '已有', sections: ['一'] }] });
    const { changes } = organizeChanges(plan, new Set(['notes/已有.md']));
    expect(changes).toEqual([]);
  });

  it('讲义骨架带标题、小节与「无来源待核对」标注', () => {
    const plan = parsePlan({ lessons: [{ file: 'notes/新课.md', title: '新课', sections: ['正交投影', '法方程'] }] });
    const create = organizeChanges(plan, new Set()).changes[0]!;
    expect(create.op).toBe('create');
    if (create.op !== 'create') throw new Error('unreachable');
    expect(create.content).toContain('# 新课');
    expect(create.content).toContain('## 正交投影');
    expect(create.content).toContain('## 法方程');
    expect(create.content).toContain('待核对');
  });

  it('无 key 的示例方案明确标注，且能做成可撤销的新建提案', () => {
    const plan = samplePlan();
    expect(plan.summary).toContain('示例');
    expect(plan.stillMissing.join()).toContain('示例');
    const { changes } = organizeChanges(plan, new Set());
    expect(changes).toHaveLength(1);
    expect(changes[0]!.op).toBe('create');
  });
});