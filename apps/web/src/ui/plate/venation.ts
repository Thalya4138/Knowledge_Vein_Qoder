import { mulberry, type Pt } from './rub';

/**
 * 叶脉生长：「空间殖民」算法（Runions et al. 2005，植物学里模拟叶脉的标准做法）。
 * 叶片里撒一批生长素点，每一轮每个叶脉节点朝「把它当作最近节点的」那些生长素点的平均方向长一步，
 * 叶脉够到生长素点，那个点就消失。长出来的分叉与粗细自然像真叶子。
 * 用网格做最近邻，几千个节点也只要几十毫秒；种子固定，每次长出来都一样。
 */

export interface Leaf {
  mid: (u: number) => Pt;
  normal: (u: number) => Pt;
  half: (u: number) => number;
}

export interface Vein extends Pt {
  parent: number;
  /** 下游的叶脉数，决定粗细 */
  load: number;
}

/** 二次曲线做主脉的叶子：B 叶柄、C 控制点、T 叶尖；width 是最宽处半宽占叶长的比例。 */
export function makeLeaf(B: Pt, C: Pt, T: Pt, width = 0.27): Leaf {
  const len = Math.hypot(T.x - B.x, T.y - B.y);
  return {
    mid: (u) => ({
      x: (1 - u) * (1 - u) * B.x + 2 * u * (1 - u) * C.x + u * u * T.x,
      y: (1 - u) * (1 - u) * B.y + 2 * u * (1 - u) * C.y + u * u * T.y,
    }),
    normal: (u) => {
      const dx = 2 * (1 - u) * (C.x - B.x) + 2 * u * (T.x - C.x);
      const dy = 2 * (1 - u) * (C.y - B.y) + 2 * u * (T.y - C.y);
      const d = Math.hypot(dx, dy) || 1;
      return { x: -dy / d, y: dx / d };
    },
    // 近叶柄处收窄，最宽在 40% 左右，叶尖收成一点
    half: (u) => len * width * Math.pow(Math.sin(Math.PI * Math.pow(Math.min(Math.max(u, 0), 1), 0.75)), 1.15),
  };
}

export function leafOutline(leaf: Leaf, n = 80): Pt[] {
  const us = Array.from({ length: n + 1 }, (_, i) => i / n);
  const side = (s: number) => us.map((u) => {
    const m = leaf.mid(u), nn = leaf.normal(u), h = leaf.half(u) * s;
    return { x: m.x + nn.x * h, y: m.y + nn.y * h };
  });
  return [...side(1), ...side(-1).reverse()];
}

export function growVeins(leaf: Leaf, { seed = 20261120, count = 700, step = 6, minGap = 11, radius = 70, kill = 9 } = {}): Vein[] {
  const rnd = mulberry(seed);
  const veins: Vein[] = [];
  const N = 140;
  for (let i = 0; i <= N; i++) {
    const p = leaf.mid(i / N);
    veins.push({ x: p.x, y: p.y, parent: i - 1, load: 0 });
  }
  const aux: Pt[] = [];
  for (let k = 0; k < count * 12 && aux.length < count; k++) {
    const u = 0.03 + rnd() * 0.96;
    const s = (rnd() * 2 - 1) * 0.97;
    const m = leaf.mid(u);
    const n = leaf.normal(u);
    const p = { x: m.x + n.x * leaf.half(u) * s, y: m.y + n.y * leaf.half(u) * s };
    if (aux.some((a) => Math.abs(a.x - p.x) < minGap && Math.abs(a.y - p.y) < minGap)) continue;
    aux.push(p);
  }

  const CELL = 40;
  const grid = new Map<string, number[]>();
  const add = (i: number) => {
    const k = `${Math.floor(veins[i]!.x / CELL)},${Math.floor(veins[i]!.y / CELL)}`;
    const list = grid.get(k);
    if (list) list.push(i);
    else grid.set(k, [i]);
  };
  veins.forEach((_, i) => add(i));
  const near = (p: Pt, r: number) => {
    const out: number[] = [];
    const cx = Math.floor(p.x / CELL), cy = Math.floor(p.y / CELL), span = Math.ceil(r / CELL);
    for (let i = cx - span; i <= cx + span; i++) for (let j = cy - span; j <= cy + span; j++) out.push(...(grid.get(`${i},${j}`) ?? []));
    return out;
  };

  let alive = aux.slice();
  for (let iter = 0; iter < 260 && alive.length; iter++) {
    const pull = new Map<number, { x: number; y: number }>();
    for (const a of alive) {
      let best = -1;
      let bd = radius * radius;
      for (const i of near(a, radius)) {
        const d = (veins[i]!.x - a.x) ** 2 + (veins[i]!.y - a.y) ** 2;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      if (best < 0) continue;
      const v = veins[best]!;
      const d = Math.sqrt(bd) || 1;
      const acc = pull.get(best) ?? { x: 0, y: 0 };
      acc.x += (a.x - v.x) / d;
      acc.y += (a.y - v.y) / d;
      pull.set(best, acc);
    }
    if (!pull.size) break;
    for (const [i, acc] of pull) {
      const v = veins[i]!;
      const d = Math.hypot(acc.x, acc.y) || 1;
      veins.push({ x: v.x + (acc.x / d) * step, y: v.y + (acc.y / d) * step, parent: i, load: 0 });
      add(veins.length - 1);
    }
    alive = alive.filter((a) => !near(a, kill).some((i) => (veins[i]!.x - a.x) ** 2 + (veins[i]!.y - a.y) ** 2 < kill * kill));
  }
  for (let i = veins.length - 1; i > 0; i--) {
    const p = veins[i]!.parent;
    if (p >= 0) veins[p]!.load += veins[i]!.load + 1;
  }
  return veins;
}

/** 按粗细分档输出路径：每档一条 path，比几千条 line 轻得多。 */
export function veinPaths(veins: Vein[], tiers: number[]): string[] {
  const out = tiers.map(() => '');
  veins.forEach((v) => {
    if (v.parent < 0) return;
    const p = veins[v.parent]!;
    let t = tiers.findIndex((min) => v.load >= min);
    if (t < 0) t = tiers.length - 1;
    out[t] += `M${p.x.toFixed(1)} ${p.y.toFixed(1)}L${v.x.toFixed(1)} ${v.y.toFixed(1)}`;
  });
  return out;
}
