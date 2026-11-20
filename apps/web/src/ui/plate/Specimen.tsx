import { useId, type CSSProperties } from 'react';
import { f1, poly, RubFilter, type Pt } from './rub';
import '../../styles/plate.css';

/**
 * 四件标本：一个板块一件，都画在 100×100 的格子里，拓印质感由 RubFilter 统一加（DESIGN.md §14）。
 *   学习工作台 —— 羽毛笔：写讲义
 *   可视化实验室 —— 鹦鹉螺剖面：对数螺线，本身就是被「看见」的数学
 *   知识关联探索 —— 蛛网：一根根丝把散点连起来
 *   认知记忆图谱 —— 叶脉：记忆长出骨架
 * 颜色：.pg 填颜料色、.pg-line 颜料描线、.paper-line 在颜料上「留白」的纸色线。颜料色由外层的 --pg 决定。
 */

export type SpecimenName = 'feather' | 'nautilus' | 'web' | 'leaf';

const quad = (a: Pt, c: Pt, b: Pt) => (t: number): Pt => ({
  x: (1 - t) * (1 - t) * a.x + 2 * t * (1 - t) * c.x + t * t * b.x,
  y: (1 - t) * (1 - t) * a.y + 2 * t * (1 - t) * c.y + t * t * b.y,
});
const quadNormal = (a: Pt, c: Pt, b: Pt) => (t: number): Pt => {
  const dx = 2 * (1 - t) * (c.x - a.x) + 2 * t * (b.x - c.x);
  const dy = 2 * (1 - t) * (c.y - a.y) + 2 * t * (b.y - c.y);
  const d = Math.hypot(dx, dy) || 1;
  return { x: -dy / d, y: dx / d };
};
const off = (p: Pt, n: Pt, k: number): Pt => ({ x: p.x + n.x * k, y: p.y + n.y * k });

export function FeatherArt() {
  const A = { x: 18, y: 96 }, C = { x: 30, y: 44 }, B = { x: 86, y: 6 };
  const P = quad(A, C, B), N = quadNormal(A, C, B);
  const t0 = 0.2;
  const wl = (t: number) => (t < t0 ? 0 : 17 * Math.pow(Math.sin((Math.PI * (t - t0)) / (1 - t0)), 0.55) * (1 - 0.25 * t));
  const wr = (t: number) => wl(t) * 0.62;
  const ts = Array.from({ length: 41 }, (_, i) => t0 + ((1 - t0) * i) / 40);
  const vane = poly([...ts.map((t) => off(P(t), N(t), wl(t))), ...ts.slice().reverse().map((t) => off(P(t), N(t), -wr(t)))], true);
  const barbs: string[] = [];
  for (let t = t0 + 0.03; t < 0.96; t += 0.028) {
    const u = Math.min(t + 0.08, 0.99);
    barbs.push(poly([P(t), off(P(u), N(u), wl(u) * 0.96)]));
    barbs.push(poly([P(t), off(P(u), N(u), -wr(u) * 0.96)]));
  }
  // 两处羽枝裂开的缺口：真羽毛几乎都有
  const gap = (t: number, side: 1 | -1) => {
    const u = t + 0.09;
    return poly([P(t), off(P(u), N(u), side * (side > 0 ? wl(u) : wr(u)) * 1.05)]);
  };
  return (
    <g>
      <path className="pg" d={vane} />
      <path className="paper-line" d={barbs.join(' ')} strokeWidth={0.7} opacity={0.75} />
      <path className="paper-line" d={`${gap(0.46, 1)} ${gap(0.68, -1)} ${gap(0.78, 1)}`} strokeWidth={2.2} />
      <path className="pg-line" d={poly(Array.from({ length: 30 }, (_, i) => P((i / 29) * 0.99)))} strokeWidth={2.4} />
      <path className="paper-line" d={poly(Array.from({ length: 24 }, (_, i) => P(t0 + ((0.97 - t0) * i) / 23)))} strokeWidth={0.8} />
    </g>
  );
}

export function NautilusArt() {
  const c = { x: 54, y: 52 };
  const k = 0.215; // 每转一圈半径约放大 3.9 倍
  const R = 46;
  const rot = 0.6;
  const at = (th: number, r = R * Math.exp(k * th)): Pt => ({ x: c.x + r * Math.cos(th + rot), y: c.y + r * Math.sin(th + rot) });
  const outer = Array.from({ length: 73 }, (_, i) => at(-2 * Math.PI + (2 * Math.PI * i) / 72));
  const spiral = Array.from({ length: 160 }, (_, i) => at(-6 * Math.PI + (6 * Math.PI * i) / 159));
  // 隔壁（septa）：从外一圈弯回内一圈，越往里越密
  const septa: string[] = [];
  for (let th = -0.5; th > -5.6 * Math.PI; th -= 0.36 + 0.0 * th) {
    const a = at(th), b = at(th - 2 * Math.PI);
    const m = at(th - 0.35, (R * Math.exp(k * th) + R * Math.exp(k * (th - 2 * Math.PI))) / 2);
    septa.push(`M${f1(a.x)} ${f1(a.y)} Q${f1(m.x)} ${f1(m.y)} ${f1(b.x)} ${f1(b.y)}`);
  }
  return (
    <g>
      <path className="pg" d={poly(outer, true)} />
      <path className="paper-line" d={septa.join(' ')} strokeWidth={1.1} />
      <path className="paper-line" d={poly(spiral)} strokeWidth={1.8} />
    </g>
  );
}

export function WebArt({ seed = 3 }: { seed?: number }) {
  const c = { x: 50, y: 50 };
  const n = 13;
  const angles = Array.from({ length: n }, (_, i) => (2 * Math.PI * i) / n + Math.sin(i * 2.3 + seed) * 0.12);
  const len = angles.map((_, i) => 44 + Math.sin(i * 1.7 + seed) * 4);
  const pt = (i: number, r: number): Pt => ({ x: c.x + Math.cos(angles[i % n]!) * r, y: c.y + Math.sin(angles[i % n]!) * r });
  const radials = angles.map((_, i) => poly([c, pt(i, len[i]!)])).join(' ');
  const rings: string[] = [];
  for (let r = 7; r < 42; r += 3.4) {
    let d = '';
    for (let i = 0; i < n; i++) {
      const a = pt(i, Math.min(r, len[i]!)), b = pt(i + 1, Math.min(r, len[(i + 1) % n]!));
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const q = { x: c.x + (mx - c.x) * 0.9, y: c.y + (my - c.y) * 0.9 }; // 丝线下垂，向中心凹
      d += `${i ? '' : `M${f1(a.x)} ${f1(a.y)}`} Q${f1(q.x)} ${f1(q.y)} ${f1(b.x)} ${f1(b.y)}`;
    }
    rings.push(d);
  }
  return (
    <g>
      <path className="pg-line" d={radials} strokeWidth={1.5} />
      <path className="pg-line" d={rings.join(' ')} strokeWidth={1.1} />
      <circle className="pg" cx={c.x} cy={c.y} r={3.2} />
    </g>
  );
}

export function LeafArt() {
  const A = { x: 50, y: 92 }, C = { x: 44, y: 50 }, B = { x: 54, y: 5 };
  const P = quad(A, C, B), N = quadNormal(A, C, B);
  const half = (u: number) => 30 * Math.pow(Math.sin(Math.PI * Math.pow(Math.min(Math.max(u, 0), 1), 0.8)), 1.1);
  const us = Array.from({ length: 41 }, (_, i) => i / 40);
  const blade = poly([...us.map((u) => off(P(u), N(u), half(u))), ...us.slice().reverse().map((u) => off(P(u), N(u), -half(u)))], true);
  const veins: string[] = [];
  for (let k = 1; k <= 8; k++) {
    const u = 0.06 + k * 0.1;
    for (const s of [1, -1]) {
      const v = Math.min(u + 0.12, 0.98);
      const e = off(P(v), N(v), s * half(v) * 0.9);
      const m = off(P(u + 0.05), N(u + 0.05), s * half(u) * 0.45);
      veins.push(`M${f1(P(u).x)} ${f1(P(u).y)} Q${f1(m.x)} ${f1(m.y)} ${f1(e.x)} ${f1(e.y)}`);
    }
  }
  return (
    <g>
      <path className="pg-line" d={poly([{ x: 51, y: 99 }, A])} strokeWidth={2.4} />
      <path className="pg" d={blade} />
      <path className="paper-line" d={veins.join(' ')} strokeWidth={1} />
      <path className="paper-line" d={poly(Array.from({ length: 20 }, (_, i) => P((i / 19) * 0.95)))} strokeWidth={1.8} />
    </g>
  );
}

export function SpecimenArt({ name }: { name: SpecimenName }) {
  if (name === 'feather') return <FeatherArt />;
  if (name === 'nautilus') return <NautilusArt />;
  if (name === 'web') return <WebArt />;
  return <LeafArt />;
}

/** 单独一件标本拓片：小尺寸，用在封面标本签、页面标题旁。纯装饰，对读屏隐藏。 */
export function Specimen({
  name,
  pigment,
  size = 64,
  tilt = 0,
  className,
  style,
}: {
  name: SpecimenName;
  /** 颜料：四个板块之一 */
  pigment: 'workspace' | 'lab' | 'connection' | 'atlas';
  size?: number;
  tilt?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const id = `rub-${useId().replace(/:/g, '')}`;
  return (
    <span
      className={`specimen pg-${pigment}${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size, ['--tilt' as string]: `${tilt}deg`, ...style }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 100 100" width={size} height={size}>
        <defs>
          <RubFilter id={id} grain={0.55} rough={1.6} ink={0.7} />
        </defs>
        <g filter={`url(#${id})`}>
          <SpecimenArt name={name} />
        </g>
      </svg>
    </span>
  );
}
