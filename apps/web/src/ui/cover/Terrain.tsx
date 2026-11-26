import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { demoGraph } from '../../app/demo';

/**
 * 封面：一节课的推导地形图。
 * 画的是 §2.1「正交投影与最小二乘法」：主路线按证明的先后连接五步（编号是真实的顺序），
 * 推广与应用用细虚线挂在旁边；区域名像地图上的地名一样落在地形上。
 * 卡片是一条推导的记录：结论用公式大字写出，由、得、依据、条件、为什么分格给出。
 * 等高线由程序生成（不是图片），每个概念是一座峰。
 */

interface Pin {
  id: string;
  label: string;
  step?: number;
  kind: 'concept' | 'theorem' | 'method' | 'example';
  x: number;
  y: number;
  band: 'u' | 'l';
}

/**
 * 坐标：x 是封面宽度的比例；y 是「带」里的比例（0 = 地图顶部，1 = 带底）。
 * 主路线与推广放在上带（底边是卡片的上沿），两个应用放在下带（卡片左边，可以用到底）。
 * 这样无论屏幕比例如何，图钉都不会落到卡片下面。
 */
const PINS: Pin[] = [
  { id: 'n.colspace', label: '列空间 C(A)', step: 1, kind: 'concept', x: 0.5, y: 0.3, band: 'u' },
  { id: 'n.least-squares', label: '最小二乘问题', step: 2, kind: 'method', x: 0.6, y: 0.68, band: 'u' },
  { id: 'n.orthogonality', label: '正交性条件', step: 3, kind: 'theorem', x: 0.69, y: 0.26, band: 'u' },
  { id: 'n.normal-eq', label: '法方程', step: 4, kind: 'method', x: 0.79, y: 0.7, band: 'u' },
  { id: 'n.full-column-rank', label: '列满秩条件', step: 5, kind: 'theorem', x: 0.88, y: 0.24, band: 'u' },
  { id: 'n.first-order-cond', label: '一阶最优性条件', kind: 'theorem', x: 0.93, y: 0.98, band: 'u' },
  { id: 'n.point-plane', label: '点到平面的距离', kind: 'example', x: 0.47, y: 0.62, band: 'l' },
  { id: 'n.skew-lines', label: '异面直线的公垂线', kind: 'example', x: 0.55, y: 0.86, band: 'l' },
];
const at = (id: string) => PINS.find((p) => p.id === id)!;

/** 卡片上的条目：按主路线的顺序，然后是推广与应用。结论用规范的数学写法。 */
const ENTRIES: { rel: string; head: string; display: string }[] = [
  { rel: 'r.prereq-colspace', head: '第 1 步  提出问题', display: 'min ‖b − Ax‖' },
  { rel: 'r.defined-by-orth', head: '第 2 步  刻画最近点', display: 'Aᵀ(b − Ax̂) = 0' },
  { rel: 'r.derive-normaleq', head: '第 3 步  得到方程', display: 'AᵀAx̂ = Aᵀb' },
  { rel: 'r.rank-iff-invertible', head: '第 4 步  解的唯一性', display: 'AᵀA 可逆 ⇔ 列满秩' },
  { rel: 'r.c1-firstorder', head: '推广', display: '∇f(x̂) = 0' },
  { rel: 'r.shared-pointplane', head: '应用', display: '点到平面的距离' },
  { rel: 'r.shared-skew', head: '应用', display: '异面直线的距离' },
];

const TYPE: Record<string, string> = {
  prerequisite: '先修',
  'defined-by': '由它刻画',
  'derives-from': '推出',
  'equivalent-under': '等价',
  'shared-mechanism': '同一机制',
};
const EPI: Record<string, string> = {
  'source-backed': '有出处',
  'logically-derived': '可推出',
  'pedagogical-inference': '教学归纳',
  analogy: '类比',
};

const REGIONS: { text: string; x: number; y: number; r: number; band: 'u' | 'l' }[] = [
  { text: '几何：最近点', x: 0.56, y: -0.1, r: -6, band: 'u' },
  { text: '代数：法方程', x: 0.79, y: -0.12, r: 4, band: 'u' },
  { text: '推广', x: 0.965, y: 0.72, r: 8, band: 'u' },
  { text: '应用', x: 0.42, y: 0.78, r: -10, band: 'l' },
];

/** §2.1 的范围：沿主路线外扩的一圈（上带坐标） */
const OUTLINE = [
  [0.455, 0.12],
  [0.66, 0.02],
  [0.93, 0.0],
  [0.955, 0.48],
  [0.86, 0.96],
  [0.62, 0.96],
  [0.465, 0.6],
];

export interface Band {
  top: number;
  upper: number;
  lower: number;
}

/** 没有测到卡片时（如图谱卡片的小地形）用的默认带 */
const defaultBand = (h: number): Band => ({ top: 0.12 * h, upper: 0.55 * h, lower: h - 70 });
const bandY = (b: Band, band: 'u' | 'l', f: number) => b.top + f * ((band === 'u' ? b.upper : b.lower) - b.top);

/** 主路线：按证明顺序连接 1–4，再到 5。 */
const ROUTE = ['n.colspace', 'n.least-squares', 'n.orthogonality', 'n.normal-eq', 'n.full-column-rank'];
const BRANCHES: [string, string][] = [
  ['n.normal-eq', 'n.first-order-cond'],
  ['n.point-plane', 'n.least-squares'],
  ['n.skew-lines', 'n.least-squares'],
];

function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoise(seed: number) {
  const rnd = mulberry(seed);
  const N = 64;
  const g = Array.from({ length: N * N }, () => rnd());
  const v = (i: number, j: number) => g[(((j % N) + N) % N) * N + (((i % N) + N) % N)]!;
  const s = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const i = Math.floor(x);
    const j = Math.floor(y);
    const fx = s(x - i);
    const fy = s(y - j);
    const a = v(i, j) + (v(i + 1, j) - v(i, j)) * fx;
    const b = v(i, j + 1) + (v(i + 1, j + 1) - v(i, j + 1)) * fx;
    return a + (b - a) * fy;
  };
}

/** 等高线：值噪声加「每个概念一座峰」，marching squares 描线；每第五条加粗。 */
export function drawTerrain(canvas: HTMLCanvasElement, band?: Band) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  const css = getComputedStyle(canvas);
  const line = css.getPropertyValue('--contour').trim() || '#c3cad5';
  const strong = css.getPropertyValue('--contour-strong').trim() || '#97a2b3';
  const noise = makeNoise(7);
  const b = band ?? defaultBand(h);
  const peaks = PINS.map((p) => ({ x: p.x, y: bandY(b, p.band, p.y) / h, hgt: p.step ? 0.5 : 0.32 }));
  const field = (px: number, py: number) => {
    const x = px / w;
    const y = py / h;
    let val = noise(x * 3.2, y * 2.6) * 0.95 + noise(x * 7 + 9, y * 6 + 3) * 0.35 + noise(x * 15 + 4, y * 13 + 7) * 0.08;
    for (const p of peaks) val += p.hgt * Math.exp(-(((x - p.x) * 1.6) ** 2 + (y - p.y) ** 2) / 0.016);
    return val;
  };
  const cell = 7;
  const cols = Math.ceil(w / cell) + 1;
  const rows = Math.ceil(h / cell) + 1;
  const f = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) f[j * cols + i] = field(i * cell, j * cell);
  ctx.lineCap = 'round';
  for (let k = 1; k < 30; k++) {
    const lv = k * 0.062;
    const heavy = k % 5 === 0;
    ctx.strokeStyle = heavy ? strong : line;
    ctx.lineWidth = heavy ? 1.1 : 0.7;
    ctx.beginPath();
    for (let j = 0; j < rows - 1; j++) {
      for (let i = 0; i < cols - 1; i++) {
        const a = f[j * cols + i]!;
        const b = f[j * cols + i + 1]!;
        const c = f[(j + 1) * cols + i + 1]!;
        const d = f[(j + 1) * cols + i]!;
        const x = i * cell;
        const y = j * cell;
        const pts: [number, number][] = [];
        const edge = (v1: number, v2: number, x1: number, y1: number, x2: number, y2: number) => {
          if (v1 < lv !== v2 < lv) {
            const t = (lv - v1) / (v2 - v1);
            pts.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t]);
          }
        };
        edge(a, b, x, y, x + cell, y);
        edge(b, c, x + cell, y, x + cell, y + cell);
        edge(c, d, x + cell, y + cell, x, y + cell);
        edge(d, a, x, y + cell, x, y);
        for (let m = 0; m + 1 < pts.length; m += 2) {
          ctx.moveTo(pts[m]![0], pts[m]![1]);
          ctx.lineTo(pts[m + 1]![0], pts[m + 1]![1]);
        }
      }
    }
    ctx.stroke();
  }
}

/** 小尺寸的同一张地形图（图谱选择页的工作区卡片用），随主题重画。 */
export function MiniTerrain() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const draw = () => drawTerrain(c);
    draw();
    const mo = new MutationObserver(draw);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);
  return <canvas ref={ref} className="mini-terrain" aria-hidden="true" />;
}

const LOUPE = 132;
const ZOOM = 1.8;

export function Terrain() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<string | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [index, setIndex] = useState(2);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const cardRef = useRef<HTMLElement>(null);
  const bandRef = useRef<Band | null>(null);
  const redrawRef = useRef<() => void>(() => {});
  const [card, setCard] = useState<{ l: number; t: number; r: number; b: number } | null>(null);
  const entry = ENTRIES[index]!;
  const rel = demoGraph.relations.find((r) => r.id === entry.rel);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    let raf = 0;
    const redraw = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        drawTerrain(canvas, bandRef.current ?? undefined);
        setSize({ w: canvas.clientWidth, h: canvas.clientHeight });
        setImg(canvas.toDataURL('image/png'));
      });
    };
    redrawRef.current = redraw;
    redraw();
    const ro = new ResizeObserver(redraw);
    ro.observe(wrap);
    const mo = new MutationObserver(redraw);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      ro.disconnect();
      mo.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  // 卡片的实际位置：图钉落进卡片范围（含边距）时，挪到卡片左侧
  useEffect(() => {
    const el = cardRef.current;
    const wrap = wrapRef.current;
    if (!el || !wrap) return;
    const measure = () => {
      const a = el.getBoundingClientRect();
      const b = wrap.getBoundingClientRect();
      setCard({ l: a.left - b.left, t: a.top - b.top, r: a.right - b.left, b: a.bottom - b.top });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [size.w, size.h]);

  const band: Band = size.h
    ? { top: 0.12 * size.h, upper: card ? Math.max(card.t - 44, 0.3 * size.h) : 0.55 * size.h, lower: size.h - 70 }
    : defaultBand(1);
  // 带变了（卡片高度或窗口变化），等高线的峰跟着重画
  useEffect(() => {
    const prev = bandRef.current;
    if (prev && prev.top === band.top && prev.upper === band.upper && prev.lower === band.lower) return;
    bandRef.current = band;
    if (size.h) redrawRef.current();
  });
  // 左侧文字栏的右边界（与 cover.css 的 .cover-front 一致）：下带的应用图钉不进入文字栏
  const frontRight = Math.min(120, Math.max(24, 0.07 * size.w)) + Math.min(size.w - 48, 520) + 48;
  const P = (id: string) => {
    const p = at(id);
    const x = p.band === 'l' ? Math.max(p.x * size.w, frontRight + (p.x - 0.47) * size.w) : p.x * size.w;
    return { x, y: bandY(band, p.band, p.y) };
  };
  /** 窄屏上，下带的应用图钉若右边的标签会碰到卡片，就不显示（卡片仍可翻到这一条） */
  const hidden = (id: string) => {
    if (at(id).band !== 'l' || !card) return false;
    const p = P(id);
    return p.x + 210 > card.l && p.y > card.t - 30;
  };
  /** 标签放到图钉左边：靠右边缘，或右边会碰到卡片时 */
  const flip = (id: string) => {
    const p = P(id);
    if (at(id).band === 'l') return false;
    if (p.x > size.w * 0.86) return true;
    return Boolean(card && p.y > card.t - 40 && p.x + 200 > card.l);
  };
  const route = size.w ? ROUTE.map((id, i) => `${i ? 'L' : 'M'}${P(id).x.toFixed(1)} ${P(id).y.toFixed(1)}`).join(' ') : '';
  const outline = size.w ? `M${OUTLINE.map(([x, y]) => `${(x! * size.w).toFixed(1)} ${bandY(band, 'u', y!).toFixed(1)}`).join(' L')} Z` : '';

  const rest = rel ? P(rel.to) : { x: 0, y: 0 };
  const lens = pointer ?? rest;
  /** 放大镜只在右侧地图区域跟随指针；在左侧文字区或卡片上时，回到当前这一步的结论 */
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') return;
    const b = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - b.left;
    const y = e.clientY - b.top;
    const onCard = card && x > card.l && x < card.r && y > card.t && y < card.b;
    setPointer(x > size.w * 0.46 && !onCard ? { x, y } : null);
  };
  const litIds = rel ? [rel.from, rel.to] : [];
  const step = (d: number) => setIndex((i) => (i + d + ENTRIES.length) % ENTRIES.length);
  const openPin = (id: string) => {
    const i = ENTRIES.findIndex((e) => demoGraph.relations.find((r) => r.id === e.rel)?.to === id);
    const j = i >= 0 ? i : ENTRIES.findIndex((e) => demoGraph.relations.find((r) => r.id === e.rel)?.from === id);
    if (j >= 0) setIndex(j);
  };

  return (
    <div className="terrain" ref={wrapRef} onPointerMove={onMove} onPointerLeave={() => setPointer(null)}>
      <canvas ref={canvasRef} className="terrain-canvas" aria-hidden="true" />
      {size.w > 0 && (
        <svg className="terrain-svg" width={size.w} height={size.h} aria-hidden="true">
          <path className="t-outline" d={outline} />
          <text className="t-outline-label" x={0.63 * size.w} y={bandY(band, 'u', 0.96) + 22}>
            §2.1 正交投影与最小二乘法
          </text>
          {REGIONS.map((r) => (
            <text
              key={r.text}
              className="t-region"
              transform={`translate(${r.band === 'l' ? Math.max(r.x * size.w, frontRight - 30) : r.x * size.w} ${bandY(band, r.band, r.y)}) rotate(${r.r})`}
            >
              {r.text}
            </text>
          ))}
          {BRANCHES.filter(([a]) => !hidden(a)).map(([a, b]) => {
            const p = P(a);
            const q = P(b);
            return <line key={a + b} className="t-branch" x1={p.x} y1={p.y} x2={q.x} y2={q.y} />;
          })}
          <path className="t-route" d={route} pathLength={1} />
          {rel && <line className="t-active" x1={P(rel.from).x} y1={P(rel.from).y} x2={P(rel.to).x} y2={P(rel.to).y} />}
        </svg>
      )}

      {img && size.w > 0 && (
        <div
          className="loupe"
          aria-hidden="true"
          style={{
            transform: `translate(${lens.x - LOUPE / 2}px, ${lens.y - LOUPE / 2}px)`,
            transitionDuration: pointer ? '90ms' : '480ms',
            backgroundImage: `url(${img})`,
            backgroundSize: `${size.w * ZOOM}px ${size.h * ZOOM}px`,
            backgroundPosition: `${-(lens.x * ZOOM - LOUPE / 2)}px ${-(lens.y * ZOOM - LOUPE / 2)}px`,
          }}
        />
      )}

      <ul className="pins" aria-label="§2.1 的推导：概念与结论">
        {PINS.filter((p) => !hidden(p.id)).map((p, i) => (
          <li key={p.id} style={{ left: P(p.id).x, top: P(p.id).y, ['--i' as string]: i }}>
            <button
              type="button"
              className={`pin ${p.kind}${litIds.includes(p.id) ? ' lit' : ''}${flip(p.id) ? ' flip' : ''}`}
              onClick={() => openPin(p.id)}
              onPointerEnter={() => openPin(p.id)}
            >
              <span className="pin-mark" aria-hidden="true" />
              <span className="pin-tag">
                {p.step && <b>{p.step}</b>}
                {p.label}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {rel && (
        <figure className="record" aria-live="polite" ref={cardRef}>
          <header className="record-head">
            <span>
              <i className="record-dot" aria-hidden="true" />
              {entry.head}
            </span>
            <span className="record-sec">§2.1</span>
          </header>
          {/*
            所有条目叠在同一个网格格子里，只显示当前一条：卡片高度恒等于最高的那条。
            否则卡片随条目变高变矮，等高带（取卡片上沿）跟着变，整张地形重画、图钉与放大镜里的图一起跳。
          */}
          <div className="record-stack">
            {ENTRIES.map((e, i) => {
              const r = demoGraph.relations.find((x) => x.id === e.rel);
              if (!r) return null;
              return (
                <div key={e.rel} className="record-body" aria-hidden={i !== index} data-on={i === index || undefined}>
                  <p className="record-display">{e.display}</p>
                  <dl className="record-grid">
                    <div>
                      <dt>由</dt>
                      <dd>{at(r.from).label}</dd>
                    </div>
                    <div>
                      <dt>得</dt>
                      <dd>{at(r.to).label}</dd>
                    </div>
                    <div>
                      <dt>依据</dt>
                      <dd>{TYPE[r.type] ?? r.type}</dd>
                    </div>
                    <div>
                      <dt>条件</dt>
                      <dd>{r.assumptions.join('；')}</dd>
                    </div>
                    <div className="wide">
                      <dt>为什么</dt>
                      <dd>{r.explanation}</dd>
                    </div>
                  </dl>
                </div>
              );
            })}
          </div>
          <div className="record-keys">
            <button type="button" onClick={() => step(-1)} aria-label="上一条">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </button>
            <span className={`record-chip ${rel.epistemic}`}>{EPI[rel.epistemic] ?? rel.epistemic}</span>
            <button type="button" onClick={() => step(1)} aria-label="下一条">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          </div>
        </figure>
      )}
    </div>
  );
}
