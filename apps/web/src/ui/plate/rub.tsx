/**
 * 拓印滤镜（DESIGN.md §14）。
 *
 * 拓片的样子由两件事决定：纸面凹凸让墨只沾到一部分（细颗粒），手上的力道不匀让整片墨色有深有浅（大斑块）；
 * 再加上纸张受潮起皱，轮廓不会是干净的几何线（边缘毛糙）。
 * 三件事各对应一层噪声：细噪声 × 粗噪声决定哪里有墨，低频噪声把轮廓推歪几个单位。
 * 所有标本、印章、背景图版都用它，所以只画形状本身，「拓」的质感统一在这里。
 *
 * 频率是「每个 SVG 用户单位」的，图形放大缩小时颗粒跟着缩放：小图标用低频，整页背景用高频。
 */
export function RubFilter({
  id,
  grain = 0.8,
  rough = 3,
  ink = 0.62,
}: {
  id: string;
  /** 颗粒频率（每用户单位） */
  grain?: number;
  /** 轮廓毛糙程度（用户单位） */
  rough?: number;
  /** 着墨量：越大越实，0.4 很虚，0.8 几乎满墨 */
  ink?: number;
}) {
  const b = (ink - 0.5) * 3 - 0.6;
  return (
    <filter id={id} x="-6%" y="-6%" width="112%" height="112%" colorInterpolationFilters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency={grain} numOctaves={3} seed={11} result="fine" />
      <feColorMatrix in="fine" type="matrix" values={`0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  3.2 0 0 0 ${b.toFixed(2)}`} result="speck" />
      <feTurbulence type="fractalNoise" baseFrequency={grain / 14} numOctaves={2} seed={4} result="coarse" />
      <feColorMatrix in="coarse" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  2.2 0 0 0 -0.2" result="patch" />
      <feComposite in="speck" in2="patch" operator="arithmetic" k1="1" k2="0" k3="0" k4="0" result="inked" />
      <feDisplacementMap in="SourceGraphic" in2="coarse" scale={rough} xChannelSelector="R" yChannelSelector="G" result="rough" />
      <feComposite in="rough" in2="inked" operator="in" />
    </filter>
  );
}

/** 固定种子的伪随机：每次画出来都一样，截图可复现。 */
export function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Pt {
  x: number;
  y: number;
}

export const f1 = (n: number) => n.toFixed(1);

export function poly(pts: Pt[], close = false) {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${f1(p.x)} ${f1(p.y)}`).join(' ') + (close ? ' Z' : '');
}
