import { describe, expect, it } from 'vitest';
import { determinant, hasFullColumnRank, multiply, transpose } from './math';

/** QUALITY_GATES A8：AᵀA 可逆 ⇔ A 满列秩（实数域），并且反例真的存在。 */
describe('A8 · 法方程的可逆条件', () => {
  const cases: { name: string; a: number[][]; fullRank: boolean }[] = [
    { name: '三个方程两个未知数，方向不重复', a: [[1, 0], [0, 1], [1, 1]], fullRank: true },
    { name: '单行矩阵 [1 1]：一列都独立，两列必相关', a: [[1, 1]], fullRank: false },
    { name: '两列成比例', a: [[1, 2], [2, 4], [3, 6]], fullRank: false },
    { name: '含零列', a: [[0, 1], [0, 2]], fullRank: false },
    { name: '单列非零', a: [[1], [2]], fullRank: true },
    { name: '三列满秩', a: [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 1]], fullRank: true },
  ];

  for (const c of cases) {
    it(`${c.name} → 满列秩 = ${c.fullRank}`, () => {
      expect(hasFullColumnRank(c.a)).toBe(c.fullRank);
      const ata = multiply(transpose(c.a), c.a);
      const invertible = Math.abs(determinant(ata)) > 1e-9;
      // ⇔ 的两边必须一起成立，这是讲义里那条假设能被省掉的唯一条件
      expect(invertible).toBe(c.fullRank);
    });
  }

  it('[1 1] 的 AᵀA 行列式恰为 0，说明「有解唯一」需要额外条件', () => {
    const a = [[1, 1]];
    expect(determinant(multiply(transpose(a), a))).toBeCloseTo(0, 12);
  });
});
