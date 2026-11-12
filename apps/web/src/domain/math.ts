/**
 * 最小二乘的两个判据。QUALITY_GATES A8 要它们，T5 的投影实验也建在这上面。
 * 只做小矩阵；大矩阵的秩留给 T5。
 */
export type Matrix = number[][];

const cell = (m: Matrix, r: number, c: number) => m[r]?.[c] ?? 0;

export function transpose(a: Matrix): Matrix {
  return a[0]!.map((_, col) => a.map((row) => row[col]!));
}

export function multiply(a: Matrix, b: Matrix): Matrix {
  return a.map((row) => b[0]!.map((_, col) => row.reduce((sum, v, k) => sum + v * cell(b, k, col), 0)));
}

/** 方阵行列式（按第一行余子式展开）。 */
export function determinant(a: Matrix): number {
  const n = a.length;
  if (a.some((row) => row.length !== n)) throw new Error('determinant 只接受方阵');
  if (n === 0) return 1;
  if (n === 1) return cell(a, 0, 0);
  if (n === 2) return cell(a, 0, 0) * cell(a, 1, 1) - cell(a, 0, 1) * cell(a, 1, 0);
  let sum = 0;
  for (let col = 0; col < n; col += 1) {
    const minor = a.slice(1).map((row) => row.filter((_, c) => c !== col));
    sum += (-1) ** col * cell(a, 0, col) * determinant(minor);
  }
  return sum;
}

/** A 是否列满秩：高斯消元数主元个数。 */
export function hasFullColumnRank(a: Matrix, eps = 1e-9): boolean {
  const rows = a.length;
  const cols = a[0]?.length ?? 0;
  const m: number[][] = a.map((row) => [...row]);
  let rank = 0;
  for (let col = 0; col < cols && rank < rows; col += 1) {
    let pivot = rank;
    for (let r = rank + 1; r < rows; r += 1) {
      if (Math.abs(cell(m, r, col)) > Math.abs(cell(m, pivot, col))) pivot = r;
    }
    if (Math.abs(cell(m, pivot, col)) <= eps) continue;
    const tmp = m[rank]!;
    m[rank] = m[pivot]!;
    m[pivot] = tmp;
    for (let r = 0; r < rows; r += 1) {
      if (r === rank) continue;
      const factor = cell(m, r, col) / cell(m, rank, col);
      const target = m[r]!;
      for (let c = col; c < cols; c += 1) target[c] = (target[c] ?? 0) - factor * cell(m, rank, c);
    }
    rank += 1;
  }
  return rank === cols;
}
