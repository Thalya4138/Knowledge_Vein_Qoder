import { useId, useMemo } from 'react';
import { RubFilter } from './rub';
import { FeatherArt, LeafArt, NautilusArt, WebArt } from './Specimen';
import { growVeins, leafOutline, makeLeaf, veinPaths } from './venation';
import { poly } from './rub';
import '../../styles/plate.css';

/**
 * 三个板块的背景图版（DESIGN.md §14）：博物图鉴的版式——双线图框、图版号，图上的东西都是拓片或铜版刻线。
 * 每张图版讲的是这个板块在做什么，不是装饰花纹：
 *   实验室 —— 鹦鹉螺剖面与它的对数螺线作图，左侧两幅示意正好是两道示例题（正交投影、单摆）
 *   关联探索 —— 标本台纸：三件标本挂着三个问题的标签，丝线汇到标题上方的一枚图钉
 *   记忆图谱 —— 一整片叶脉拓片：记忆长出骨架
 * 图版钉在视口里（position: fixed），滚动时不重绘滤镜。纯装饰，对读屏隐藏。
 */

const W = 1440;
const H = 836;

function Frame({ caption }: { caption: string }) {
  return (
    <g className="plate-frame">
      <rect x="26" y="22" width={W - 52} height={H - 44} />
      <rect x="32" y="28" width={W - 64} height={H - 56} strokeWidth="0.6" />
      <text className="plate-caption" x="48" y={H - 42}>
        {caption}
      </text>
    </g>
  );
}

function Plate({ pigment, children }: { pigment: string; children: (rub: string, hatch: string) => React.ReactNode }) {
  const id = useId().replace(/:/g, '');
  const rub = `rub-${id}`;
  const hatch = `hatch-${id}`;
  return (
    <svg className={`plate-backdrop pg-${pigment}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <RubFilter id={rub} grain={0.7} rough={4} ink={0.62} />
        <pattern id={hatch} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="5" className="hatch-line" />
        </pattern>
      </defs>
      {children(rub, hatch)}
    </svg>
  );
}

/* ---------- 可视化实验室 ---------- */

export function LabPlate() {
  const cx = 1250;
  const cy = 560;
  const s = 6;
  const rays = Array.from({ length: 12 }, (_, i) => {
    const a = (Math.PI * 2 * i) / 12 + 0.6;
    return `M${cx} ${cy} L${(cx + Math.cos(a) * 340).toFixed(1)} ${(cy + Math.sin(a) * 340).toFixed(1)}`;
  }).join(' ');
  // 单摆：三个位置，摆角 ±22°
  const pv = { x: 190, y: 430 };
  const L = 270;
  const bob = (deg: number) => ({ x: pv.x + L * Math.sin((deg * Math.PI) / 180), y: pv.y + L * Math.cos((deg * Math.PI) / 180) });
  const arc = Array.from({ length: 25 }, (_, i) => bob(-26 + (52 * i) / 24));
  return (
    <Plate pigment="lab">
      {(rub, hatch) => (
        <>
          <g filter={`url(#${rub})`} className="rub">
            <g transform={`translate(${cx - 54 * s} ${cy - 52 * s}) scale(${s})`}>
              <NautilusArt />
            </g>
          </g>
          <g className="engrave">
            <path d={rays} strokeDasharray="2 5" />
            <circle cx={cx} cy={cy} r="300" strokeDasharray="1 6" />
            <path d={`M${cx + 90} ${cy} A90 90 0 0 0 ${cx + 90 * Math.cos(-0.52)} ${cy + 90 * Math.sin(-0.52)}`} />
            <text className="plate-math" x={cx + 98} y={cy - 22}>θ</text>
            <text className="plate-math" x={cx - 190} y={cy - 360}>r = a·e^(bθ)</text>
          </g>

          {/* 最近点：b 在平面外，p 是它在 C(A) 上的正交投影 */}
          <g className="engrave">
            <path d="M80 300 L300 300 L390 210 L170 210 Z" fill={`url(#${hatch})`} />
            <path d="M80 300 L300 300 L390 210 L170 210 Z" />
            <path d="M190 268 L262 238" strokeWidth="1.4" />
            <path d="M190 268 L262 96" strokeWidth="1.4" />
            <path d="M262 96 L262 238" strokeDasharray="4 4" />
            <path d="M262 226 L250 231 L250 243" />
            <circle cx="190" cy="268" r="2.5" className="engrave-dot" />
            <circle cx="262" cy="238" r="3" className="engrave-dot" />
            <text className="plate-math" x="270" y="98">b</text>
            <text className="plate-math" x="270" y="252">p</text>
            <text className="plate-math" x="96" y="292">C(A)</text>
          </g>

          {/* 单摆 */}
          <g className="engrave">
            <path d={`M${pv.x - 60} ${pv.y} H${pv.x + 60} V${pv.y - 12} H${pv.x - 60} Z`} fill={`url(#${hatch})`} />
            <path d={`M${pv.x - 60} ${pv.y} H${pv.x + 60}`} strokeWidth="1.4" />
            <path d={poly(arc)} strokeDasharray="3 5" />
            {[-22, 0, 22].map((d) => {
              const b = bob(d);
              return (
                <g key={d} opacity={d === 0 ? 1 : 0.5}>
                  <path d={`M${pv.x} ${pv.y} L${b.x.toFixed(1)} ${b.y.toFixed(1)}`} />
                  <circle cx={b.x} cy={b.y} r="15" fill={`url(#${hatch})`} />
                  <circle cx={b.x} cy={b.y} r="15" />
                </g>
              );
            })}
            <text className="plate-math" x={pv.x + 14} y={pv.y + 60}>θ₀</text>
          </g>

          <Frame caption="图版 Ⅱ　可视化实验室　鹦鹉螺剖面；最近点与正交投影；单摆" />
        </>
      )}
    </Plate>
  );
}

/* ---------- 知识关联探索 ---------- */

/** 图钉在问题框正下方：丝线从下面汇过来，不穿过标题 */
const PIN = { x: 720, y: 384 };

const SHEET = [
  { art: <LeafArt />, x: 230, y: 250, s: 2.7, r: -24, no: 'No. 1', name: '最小二乘', lx: 120, ly: 420 },
  { art: <FeatherArt />, x: 1220, y: 230, s: 2.8, r: 18, no: 'No. 2', name: '点到平面的距离', lx: 1210, ly: 420 },
  { art: <NautilusArt />, x: 1170, y: 600, s: 2.2, r: -10, no: 'No. 3', name: '异面直线的距离', lx: 940, ly: 520 },
] as const;

export function HerbariumPlate() {
  return (
    <Plate pigment="connection">
      {(rub) => (
        <>
          <g filter={`url(#${rub})`} className="rub">
            {SHEET.map((p) => (
              <g key={p.no} transform={`translate(${p.x - 50 * p.s} ${p.y - 50 * p.s}) rotate(${p.r} ${50 * p.s} ${50 * p.s}) scale(${p.s})`}>
                {p.art}
              </g>
            ))}
            <g transform="translate(110 560) scale(2.6)" className="rub-faint">
              <WebArt seed={5} />
            </g>
          </g>

          {/* 丝线：每件标本一根，汇到图钉 */}
          <g className="thread">
            {SHEET.map((p) => {
              const mx = (p.x + PIN.x) / 2;
              const my = Math.max(p.y, PIN.y) + 40;
              return <path key={p.no} d={`M${p.x} ${p.y} Q${mx} ${my} ${PIN.x} ${PIN.y}`} />;
            })}
          </g>
          {/* 压条：台纸上固定标本的小纸条 */}
          <g className="strap">
            {SHEET.map((p) => (
              <rect key={p.no} x={p.x - 16} y={p.y + 12} width="32" height="9" transform={`rotate(${p.r + 30} ${p.x} ${p.y + 16})`} />
            ))}
          </g>
          <g className="plate-pin">
            <circle cx={PIN.x} cy={PIN.y} r="6.5" />
            <circle cx={PIN.x - 2} cy={PIN.y - 2} r="2" className="pin-glint" />
          </g>

          {SHEET.map((p) => (
            <g key={p.no} className="tag" transform={`translate(${p.lx} ${p.ly})`}>
              <rect width="150" height="44" />
              <line x1="8" y1="17" x2="142" y2="17" />
              <text x="10" y="13" className="tag-no">{p.no}</text>
              <text x="10" y="35" className="tag-name">{p.name}</text>
            </g>
          ))}

          <Frame caption="图版 Ⅲ　知识关联探索　三件标本，一个问题" />
        </>
      )}
    </Plate>
  );
}

/* ---------- 认知记忆图谱 ---------- */

export function VenationPlate() {
  const art = useMemo(() => {
    const leaf = makeLeaf({ x: 180, y: 900 }, { x: 640, y: 470 }, { x: 1400, y: 10 }, 0.25);
    const veins = growVeins(leaf, { count: 1500, minGap: 11, radius: 60, step: 6, kill: 8 });
    return { outline: poly(leafOutline(leaf), true), tiers: veinPaths(veins, [400, 80, 15, 0]) };
  }, []);
  const widths = [7, 3.4, 1.8, 1];
  return (
    <Plate pigment="atlas">
      {(rub) => (
        <>
          <g filter={`url(#${rub})`} className="rub">
            <path className="pg wash" d={art.outline} />
            {art.tiers.map((d, i) => (
              <path key={i} className="pg-line" d={d} strokeWidth={widths[i]} />
            ))}
          </g>
          <Frame caption="图版 Ⅳ　认知记忆图谱　叶脉：记忆长出骨架" />
        </>
      )}
    </Plate>
  );
}
