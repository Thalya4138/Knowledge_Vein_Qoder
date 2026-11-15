import { describe, expect, it } from 'vitest';
import { TOOLS } from '../features/lab/tools';
import { demoGraph, demoKb } from './demo';
import { computeHomeStats, countAccepted, countRealTools, countWritten, homeStats } from './stats';

describe('countWritten', () => {
  it('只统计 status 为 written 的条目', () => {
    expect(countWritten([{ status: 'written' }, { status: 'planned' }, {}])).toBe(1);
  });
});

describe('countAccepted', () => {
  it('只统计 accepted，proposed 不算', () => {
    expect(countAccepted([{ status: 'accepted' }, { status: 'proposed' }])).toBe(1);
  });
});

describe('countRealTools', () => {
  it('只统计真实可用的工具，planned 不算', () => {
    expect(
      countRealTools([
        { id: 'a', name: 'a', status: 'real' },
        { id: 'b', name: 'b', status: 'planned' },
      ]),
    ).toBe(1);
  });
});

describe('computeHomeStats', () => {
  it('从输入数据算出四个统计', () => {
    const s = computeHomeStats({
      outline: [{ status: 'written' }, { status: 'written' }, { status: 'planned' }],
      nodes: [{}, {}, {}],
      relations: [{ status: 'accepted' }, { status: 'accepted' }],
      tools: [],
    });
    expect(s).toEqual({ noteSections: 2, nodes: 3, relations: 2, experiments: 0 });
  });
});

describe('homeStats', () => {
  it('与独立计数一致（防止把数字写死）', () => {
    const s = homeStats();
    expect(s.noteSections).toBe(countWritten(demoKb.outline));
    expect(s.nodes).toBe(demoGraph.nodes.length);
    expect(s.relations).toBe(countAccepted(demoGraph.relations));
    expect(s.experiments).toBe(countRealTools(TOOLS));
  });

  it('示例库至少有一节成稿讲义和一条已接受的关系', () => {
    const s = homeStats();
    expect(s.noteSections).toBeGreaterThanOrEqual(1);
    expect(s.relations).toBeGreaterThanOrEqual(1);
  });
});
