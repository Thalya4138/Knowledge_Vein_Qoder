import { useRef, useState, type PointerEvent as RPointerEvent } from 'react';

/** 可拖动、可编辑的关联图：拖动节点，双击改文字。连线跟着节点走。 */

export interface GNode {
  id: string;
  label: string;
  x: number;
  y: number;
  kind?: 'core';
}

export interface GEdge {
  from: string;
  to: string;
  label?: string;
}

const W = 460;
const H = 360;

export function LinkGraph({ initial, edges }: { initial: GNode[]; edges: GEdge[] }) {
  const [nodes, setNodes] = useState(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const at = (id: string) => nodes.find((n) => n.id === id)!;

  const local = (e: RPointerEvent) => {
    const r = boxRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };

  const onDown = (e: RPointerEvent<HTMLDivElement>, n: GNode) => {
    if (editing) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = local(e);
    drag.current = { id: n.id, dx: p.x - n.x, dy: p.y - n.y };
  };

  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const p = local(e);
    setNodes((all) =>
      all.map((n) =>
        n.id === d.id
          ? { ...n, x: Math.max(40, Math.min(W - 40, p.x - d.dx)), y: Math.max(20, Math.min(H - 20, p.y - d.dy)) }
          : n,
      ),
    );
  };

  return (
    <div className="lgraph" ref={boxRef} onPointerMove={onMove} onPointerUp={() => (drag.current = null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="lgraph-lines" aria-hidden="true">
        {edges.map((e) => {
          const a = at(e.from);
          const b = at(e.to);
          const mx = (a.x + b.x) / 2;
          return (
            <g key={`${e.from}-${e.to}`}>
              <path d={`M${a.x} ${a.y} C${mx} ${a.y} ${mx} ${b.y} ${b.x} ${b.y}`} />
              {e.label && (
                <text x={mx} y={(a.y + b.y) / 2 - 6} textAnchor="middle">
                  {e.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {nodes.map((n) => (
        <div
          key={n.id}
          className={n.kind === 'core' ? 'lnode core' : 'lnode'}
          style={{ left: `${(n.x / W) * 100}%`, top: `${(n.y / H) * 100}%` }}
          onPointerDown={(e) => onDown(e, n)}
          onDoubleClick={() => setEditing(n.id)}
          title="拖动移动，双击修改"
        >
          {editing === n.id ? (
            <input
              autoFocus
              defaultValue={n.label}
              aria-label="修改节点文字"
              onBlur={(e) => {
                const v = e.target.value.trim();
                setNodes((all) => all.map((x) => (x.id === n.id && v ? { ...x, label: v } : x)));
                setEditing(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
              }}
            />
          ) : (
            n.label
          )}
        </div>
      ))}
    </div>
  );
}
