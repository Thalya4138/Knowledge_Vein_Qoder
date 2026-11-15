import { useRef, useState, type PointerEvent as RPointerEvent } from 'react';

/**
 * 交互实验：向量 b 在直线 span(a) 上的正交投影。
 * 拖动 b，看投影 p 与残差 r = b − p；沿直线拖动 q，比较 |b − q| 与 |b − p|：
 * 无论 q 在哪，都不会比 p 更近，而 p 正是残差与直线垂直的那一点。
 */

const W = 460;
const H = 340;
const O = { x: 150, y: 250 };
const UNIT = 46;
const A = { x: 2, y: 0.9 };

type V = { x: number; y: number };
const dot = (u: V, v: V) => u.x * v.x + u.y * v.y;
const sub = (u: V, v: V) => ({ x: u.x - v.x, y: u.y - v.y });
const len = (u: V) => Math.hypot(u.x, u.y);
const scale = (u: V, k: number) => ({ x: u.x * k, y: u.y * k });
const toScreen = (v: V) => ({ x: O.x + v.x * UNIT, y: O.y - v.y * UNIT });
const toWorld = (sx: number, sy: number) => ({ x: (sx - O.x) / UNIT, y: (O.y - sy) / UNIT });

export function ProjectionLab() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [b, setB] = useState<V>({ x: 1.6, y: 3.1 });
  const [t, setT] = useState(0.35);
  const [drag, setDrag] = useState<'b' | 'q' | null>(null);

  const p = scale(A, dot(b, A) / dot(A, A));
  const q = scale(A, t);
  const r = sub(b, p);
  const dBP = len(r);
  const dBQ = len(sub(b, q));
  const perp = Math.abs(dot(r, A)) < 1e-9 ? 0 : dot(r, A);

  const point = (e: RPointerEvent<SVGSVGElement>) => {
    const box = svgRef.current!.getBoundingClientRect();
    return toWorld(((e.clientX - box.left) / box.width) * W, ((e.clientY - box.top) / box.height) * H);
  };

  const onMove = (e: RPointerEvent<SVGSVGElement>) => {
    if (!drag) return;
    const w = point(e);
    if (drag === 'b') setB({ x: Math.max(-2.8, Math.min(6.4, w.x)), y: Math.max(-1.5, Math.min(5, w.y)) });
    else setT(Math.max(-0.9, Math.min(2.9, dot(w, A) / dot(A, A))));
  };

  const S = { o: O, b: toScreen(b), p: toScreen(p), q: toScreen(q) };
  const far1 = toScreen(scale(A, -1.2));
  const far2 = toScreen(scale(A, 3.1));
  // 直角标记：沿直线方向与残差方向各取一小段
  const ua = scale(A, 1 / len(A));
  const ur = dBP > 1e-6 ? scale(r, 1 / dBP) : { x: -ua.y, y: ua.x };
  const k = 0.26;
  const c1 = toScreen({ x: p.x + ua.x * k, y: p.y + ua.y * k });
  const c2 = toScreen({ x: p.x + ua.x * k + ur.x * k, y: p.y + ua.y * k + ur.y * k });
  const c3 = toScreen({ x: p.x + ur.x * k, y: p.y + ur.y * k });

  return (
    <div className="plab">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="plab-svg"
        onPointerMove={onMove}
        onPointerUp={() => setDrag(null)}
        onPointerLeave={() => setDrag(null)}
        role="img"
        aria-label="拖动向量 b 与直线上的点 q，比较距离"
      >
        <line className="plab-axis" x1="0" y1={O.y} x2={W} y2={O.y} />
        <line className="plab-axis" x1={O.x} y1="0" x2={O.x} y2={H} />
        <line className="plab-line" x1={far1.x} y1={far1.y} x2={far2.x} y2={far2.y} />
        <text className="plab-tag" x={far2.x - 70} y={far2.y + 24}>
          span(a)
        </text>
        <line className="plab-bq" x1={S.b.x} y1={S.b.y} x2={S.q.x} y2={S.q.y} />
        <line className="plab-r" x1={S.b.x} y1={S.b.y} x2={S.p.x} y2={S.p.y} />
        <path className="plab-right" d={`M${c1.x} ${c1.y} L${c2.x} ${c2.y} L${c3.x} ${c3.y}`} />
        <line className="plab-b" x1={S.o.x} y1={S.o.y} x2={S.b.x} y2={S.b.y} />
        <line className="plab-p" x1={S.o.x} y1={S.o.y} x2={S.p.x} y2={S.p.y} />
        <circle className="plab-dot p" cx={S.p.x} cy={S.p.y} r="5" />
        <text className="plab-label" x={S.p.x + 8} y={S.p.y + 20}>
          p
        </text>
        <g
          className="plab-handle q"
          onPointerDown={(e) => {
            (e.currentTarget.ownerSVGElement as SVGSVGElement).setPointerCapture(e.pointerId);
            setDrag('q');
          }}
        >
          <circle cx={S.q.x} cy={S.q.y} r="14" className="hit" />
          <circle cx={S.q.x} cy={S.q.y} r="6" />
          <text className="plab-label" x={S.q.x - 18} y={S.q.y + 22}>
            q
          </text>
        </g>
        <g
          className="plab-handle b"
          onPointerDown={(e) => {
            (e.currentTarget.ownerSVGElement as SVGSVGElement).setPointerCapture(e.pointerId);
            setDrag('b');
          }}
        >
          <circle cx={S.b.x} cy={S.b.y} r="16" className="hit" />
          <circle cx={S.b.x} cy={S.b.y} r="7" />
          <text className="plab-label" x={S.b.x + 10} y={S.b.y - 10}>
            b
          </text>
        </g>
      </svg>
      <dl className="plab-read">
        <div>
          <dt>|b − p|</dt>
          <dd>{dBP.toFixed(2)}</dd>
        </div>
        <div>
          <dt>|b − q|</dt>
          <dd className={dBQ - dBP < 0.005 ? 'eq' : undefined}>{dBQ.toFixed(2)}</dd>
        </div>
        <div>
          <dt>r · a</dt>
          <dd>{perp.toFixed(2)}</dd>
        </div>
      </dl>
    </div>
  );
}
