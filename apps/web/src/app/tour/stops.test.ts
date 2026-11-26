import { describe, expect, it } from 'vitest';
import { TOUR } from './stops';
import { atStop } from './Tour';

describe('导览站点表', () => {
  it('id 唯一，中英文标题与说明都不空', () => {
    expect(new Set(TOUR.map((s) => s.id)).size).toBe(TOUR.length);
    for (const s of TOUR) {
      for (const l of [s.zh, s.en]) {
        expect(l.title.trim(), s.id).not.toBe('');
        expect(l.body.trim(), s.id).not.toBe('');
      }
      expect(s.sel.length, s.id).toBeGreaterThan(0);
    }
  });

  it('按用户定的路线走：封面 → 工作台 → 实验室 → 关联探索 → 图谱，三种探索模式与两种图谱都到', () => {
    const order = TOUR.map((s) => new URL(s.path, 'http://x.test').pathname);
    const firstAt = (p: string) => order.indexOf(p);
    expect(order[0]).toBe('/');
    expect(firstAt('/workspace')).toBeLessThan(firstAt('/lab'));
    expect(firstAt('/lab')).toBeLessThan(firstAt('/connection'));
    expect(firstAt('/connection')).toBeLessThan(firstAt('/atlas'));
    const params = TOUR.map((s) => new URL(s.path, 'http://x.test').searchParams);
    expect(new Set(params.map((p) => p.get('mode')).filter(Boolean))).toEqual(new Set(['fragments', 'meta', 'cross']));
    expect(new Set(params.map((p) => p.get('map')).filter(Boolean))).toEqual(new Set(['mind', 'memory']));
  });
});

describe('atStop', () => {
  it('路径相同、站点要求的参数都对上才算到站；多出来的参数不管', () => {
    expect(atStop('/lab', '?ws=linear-algebra', '/lab?ws=linear-algebra')).toBe(true);
    expect(atStop('/lab', '?ws=linear-algebra&q=x', '/lab?ws=linear-algebra')).toBe(true);
    expect(atStop('/lab', '', '/lab?ws=linear-algebra')).toBe(false);
    expect(atStop('/connection', '?ws=linear-algebra&mode=meta', '/connection?ws=linear-algebra&mode=cross')).toBe(false);
    expect(atStop('/', '?ws=a', '/')).toBe(true);
  });
});
