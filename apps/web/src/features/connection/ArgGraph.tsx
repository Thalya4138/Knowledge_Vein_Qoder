import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import { geometry, layoutGraph, nodeW, placeLabels, SYMMETRIC, texToText } from '../../content/veinGraph';
import { EPI_NAME, REL_NAME, type ExploreResult, type XEdge, type XNode } from './explore';
import { renderInline } from './md';

/**
 * 关联图画板：横向是层级（越抽象越靠右），纵向是逻辑顺序。布局、线型与讲义里的静态图（content/veinGraph.ts）同一套。
 * - 拖动节点只改位置；双击改字；节点与线上的字都支持 $公式$；
 * - 点一条线，右侧看它为什么成立，再决定收不收进图谱；
 * - 「连线」模式下依次点两个节点，画一条我的连线（朱色双线，理由选填，不进知识图谱）。
 */

export type Sel = { kind: 'node' | 'edge'; id: string } | null;

type Graph = ExploreResult['graph'];

export function edgeClass(e: XEdge): string {
  return ['xedge', e.mine ? 'mine' : `epi-${e.epistemic}`, `st-${e.status}`].join(' ');
}

const Tex = ({ s, className }: { s: string; className?: string }) => <span className={className} dangerouslySetInnerHTML={{ __html: renderInline(s) }} />;

export function ArgGraph({
  graph,
  onChange,
  selected,
  onSelect,
  showRejected,
  connecting,
  onConnected,
  fit = 'width',
}: {
  graph: Graph;
  onChange: (g: Graph) => void;
  selected: Sel;
  onSelect: (s: Sel) => void;
  showRejected: boolean;
  connecting: boolean;
  onConnected: () => void;
  fit?: 'width' | 'both';
}) {
  const laid = useMemo(() => layoutGraph(graph.nodes, graph.edges) /* 含不认同的线：表态后节点不跳 */, [graph.nodes, graph.edges]);
  const W = laid.width;
  const H = laid.height;
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const grab = useRef<{ id: string; dx: number; dy: number; sx: number; sy: number } | null>(null);
  const pan = useRef<{ id: number; x: number; y: number; left: number; top: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [panning, setPanning] = useState(false);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      // 侧栏里按宽度缩放，但不小于 0.72（字还要看得清），放不下就横向滚动；全屏时整张放进窗口
      const s = fit === 'both' ? Math.min(el.clientWidth / W, el.clientHeight / H) : Math.max(0.72, el.clientWidth / W);
      setScale(Math.max(0.3, Math.min(1.3, s)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [W, H, fit]);

  // 最右一列是全图的枢纽。侧栏里放不下时，先让它在视野里；具体的那几样向左滚动就能看到。
  // 只在挂载与进出全屏时定位一次，之后不抢读者的滚动位置。
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (el && fit === 'width' && el.scrollWidth > el.clientWidth + 1) el.scrollLeft = el.scrollWidth;
  }, [fit]);

  useEffect(() => {
    if (!connecting) setFrom(null);
  }, [connecting]);

  const nodes = laid.nodes.map((n) => (drag && drag.id === n.id ? { ...n, x: drag.x, y: drag.y } : n));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges = graph.edges.filter((e) => showRejected || e.status !== 'rejected');
  const name = (id: string) => texToText(byId.get(id)?.label ?? id);

  const drawn = edges.flatMap((e) => {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) return [];
    const g = geometry(a, b);
    const base = e.label || (e.mine ? '我的' : '');
    const text = base && `${e.status === 'accepted' ? '✓ ' : e.status === 'pending' ? '? ' : ''}${base}`;
    const must = (selected?.kind === 'edge' && selected.id === e.id) || (selected?.kind === 'node' && (e.from === selected.id || e.to === selected.id));
    return [{ e, d: g.d, at: g.at, text, must }];
  });
  const labels = placeLabels(
    drawn.filter((x) => x.text).map((x) => ({ id: x.e.id, text: x.text, at: x.at, must: x.must })),
    nodes,
  );

  const local = (e: RPointerEvent) => {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  };
  const commitNodes = (next: XNode[]) => onChange({ ...graph, nodes: next });

  const onPanDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as Element).closest('.xnode, button, input, textarea, select, a')) return;
    const el = e.currentTarget;
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    pan.current = { id: e.pointerId, x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
    setPanning(true);
  };
  const onPanMove = (e: RPointerEvent<HTMLDivElement>) => {
    const p = pan.current;
    if (!p || p.id !== e.pointerId) return;
    const el = e.currentTarget;
    el.scrollLeft = p.left - (e.clientX - p.x);
    el.scrollTop = p.top - (e.clientY - p.y);
  };
  const onPanUp = (e: RPointerEvent<HTMLDivElement>) => {
    if (pan.current?.id !== e.pointerId) return;
    pan.current = null;
    setPanning(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const onDown = (e: RPointerEvent<HTMLDivElement>, n: XNode) => {
    if (editing === n.id) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = local(e);
    grab.current = { id: n.id, dx: p.x - n.x!, dy: p.y - n.y!, sx: p.x, sy: p.y };
  };
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    const g = grab.current;
    if (!g) return;
    const p = local(e);
    if (!drag && Math.hypot(p.x - g.sx, p.y - g.sy) <= 4) return;
    setDrag({ id: g.id, x: Math.max(20, Math.min(W - 20, p.x - g.dx)), y: Math.max(20, Math.min(H - 20, p.y - g.dy)) });
  };
  const onUp = (n: XNode) => {
    const g = grab.current;
    grab.current = null;
    if (drag && g) {
      // 拖动只改位置：其余节点也把当前位置固定下来，避免重新自动排版时跳动
      commitNodes(laid.nodes.map((x) => (x.id === drag.id ? { ...x, x: drag.x, y: drag.y } : x)));
      setDrag(null);
      return;
    }
    if (connecting) {
      if (!from) return setFrom(n.id);
      if (from === n.id) return setFrom(null);
      const id = `mine-${Date.now().toString(36)}`;
      onChange({
        nodes: laid.nodes,
        edges: [...graph.edges, { id, from, to: n.id, type: 'shared-mechanism', label: '', explanation: '', assumptions: [], epistemic: 'user-personal', status: 'proposed', mine: true }],
      });
      setFrom(null);
      onConnected();
      onSelect({ kind: 'edge', id });
      return;
    }
    onSelect({ kind: 'node', id: n.id });
  };

  const rename = (id: string, label: string) => {
    const v = label.trim();
    setEditing(null);
    if (v) commitNodes(laid.nodes.map((x) => (x.id === id ? { ...x, label: v } : x)));
  };

  const onKey = (e: RKeyboardEvent) => {
    if (editing || (e.target as HTMLElement).tagName === 'INPUT') return;
    if (e.key === 'Escape') onSelect(null);
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
      if (selected.kind === 'node') {
        onChange({ nodes: laid.nodes.filter((n) => n.id !== selected.id), edges: graph.edges.filter((x) => x.from !== selected.id && x.to !== selected.id) });
        onSelect(null);
      } else if (graph.edges.find((x) => x.id === selected.id)?.mine) {
        onChange({ nodes: laid.nodes, edges: graph.edges.filter((x) => x.id !== selected.id) });
        onSelect(null);
      }
    }
  };

  return (
    <div
      className={`xgraph${connecting ? ' connecting' : ''}${fit === 'width' ? ' fit-width' : ''}${panning ? ' panning' : ''}`}
      ref={wrapRef}
      tabIndex={0}
      onKeyDown={onKey}
      onPointerDown={onPanDown}
      onPointerMove={onPanMove}
      onPointerUp={onPanUp}
      onPointerCancel={onPanUp}
      aria-label="关联图"
    >
      <div className="xsizer" style={{ width: W * scale, height: H * scale }}>
      <div className="xstage" ref={stageRef} style={{ width: W, height: H, transform: `scale(${scale})` }} onPointerMove={onMove}>
        <svg className="xlines" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
          <defs>
            <marker id="xarrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 1 L9 5 L0 9 z" />
            </marker>
          </defs>
          {drawn.map(({ e, d }) => {
            const on = selected?.kind === 'edge' && selected.id === e.id;
            const touch = selected?.kind === 'node' && (e.from === selected.id || e.to === selected.id);
            return (
              <g key={e.id} className={`${edgeClass(e)}${on ? ' on' : ''}${touch ? ' touch' : ''}`}>
                <title>{`${name(e.from)} → ${name(e.to)}：${e.mine ? '我的连线' : `${REL_NAME[e.type]}，${EPI_NAME[e.epistemic]}`}`}</title>
                {e.mine && <path d={d} className="xe-under" />}
                <path d={d} className="xe-line" markerEnd={SYMMETRIC.has(e.type) || e.mine ? undefined : 'url(#xarrow)'} />
                <path d={d} className="xe-hit" onClick={() => onSelect(on ? null : { kind: 'edge', id: e.id })} />
              </g>
            );
          })}
        </svg>
        {/* 线上的字：HTML 层，公式交给 KaTeX；画在线之上、节点之下 */}
        {drawn.map(({ e, text }) => {
          const p = labels.get(e.id);
          if (!p || !text) return null;
          const on = selected?.kind === 'edge' && selected.id === e.id;
          return (
            <button
              key={`l-${e.id}`}
              type="button"
              className={`${edgeClass(e)} xe-label${on ? ' on' : ''}`}
              style={{ left: p[0], top: p[1] - 12 }}
              onClick={() => onSelect({ kind: 'edge', id: e.id })}
              aria-label={`${name(e.from)} 到 ${name(e.to)}：${texToText(text)}`}
            >
              <Tex s={text} />
            </button>
          );
        })}
        {nodes.map((n) => {
          const on = selected?.kind === 'node' && selected.id === n.id;
          return (
            <div
              key={n.id}
              className={`xnode k-${n.kind}${on ? ' on' : ''}${from === n.id ? ' from' : ''}`}
              style={{ left: n.x, top: n.y, minWidth: nodeW(n.label) }}
              onPointerDown={(e) => onDown(e, n)}
              onPointerUp={() => onUp(n)}
              onDoubleClick={() => setEditing(n.id)}
              title={connecting ? '点它作为连线的一端' : '拖动移动，双击改文字'}
            >
              {n.ref && <span className="xn-ref" title={`对应图谱里的知识点 ${n.ref}`}>图谱</span>}
              {editing === n.id ? (
                <input
                  autoFocus
                  defaultValue={n.label}
                  aria-label="修改节点文字"
                  onPointerDown={(e) => e.stopPropagation()}
                  onBlur={(e) => rename(n.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') setEditing(null);
                  }}
                />
              ) : (
                <Tex s={n.label} />
              )}
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}

/** 图例：五种线 = 颜色 + 线型 + 文字 */
export function Legend() {
  const items: [string, string][] = [
    ['epi-source-backed', '有出处'],
    ['epi-logically-derived', '可推导'],
    ['epi-pedagogical-inference', '教学归纳'],
    ['epi-analogy', '类比'],
    ['mine', '我的连线'],
  ];
  return (
    <ul className="xlegend" aria-label="线型图例">
      {items.map(([cls, label]) => (
        <li key={cls}>
          <svg width="34" height="10" aria-hidden="true" className={`xedge ${cls}`}>
            {cls === 'mine' && <path d="M1 5 H33" className="xe-under" />}
            <path d="M1 5 H33" className="xe-line" />
          </svg>
          {label}
        </li>
      ))}
    </ul>
  );
}
