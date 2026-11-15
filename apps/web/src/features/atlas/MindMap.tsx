import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { Icon } from '../../ui/Icon';
import { buildDemoMap, crossLinks, layoutTree, ROW, type MapNode } from './mindmapData';

/**
 * 思维导图与个人记忆图谱共用的画布。
 * 思维导图：选中节点后加粗、高亮、改字色、改文字、加子节点、删除；改动自动保存在本机浏览器。
 * 个人记忆图谱：以思维导图为本源；收起、遮盖、挖空自测，按 O 在原文与自己的填写之间切换；
 * 关掉「自动对齐」后可自由拖动节点，连线与父子关系不变。
 */

type Mode = 'mind' | 'memory';
type Tool = 'collapse' | 'cover' | 'blank';
interface Style {
  bold?: boolean;
  mark?: boolean;
  color?: 0 | 1 | 2;
}
interface MindState {
  tree: MapNode;
  style: Record<string, Style>;
}
interface MemoryState {
  collapsed: string[];
  covered: string[];
  blanks: string[];
  answers: Record<string, string>;
  offsets: Record<string, { dx: number; dy: number }>;
  autoAlign: boolean;
}

const MIND_KEY = 'vein.map.linear-algebra';
const MEM_KEY = 'vein.memory.linear-algebra';
const PAD = 40;
const FS = [20, 16, 14, 13];

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...(JSON.parse(raw) as T) } : fallback;
  } catch {
    return fallback;
  }
}

/** 估算节点宽度（中文约一字一字号宽），用于连线的起点。 */
const width = (text: string, depth: number) => [...text].length * (FS[Math.min(depth, 3)] ?? 13) + 26;

function mapTree(n: MapNode, f: (n: MapNode) => MapNode | null): MapNode | null {
  const self = f(n);
  if (!self) return null;
  return { ...self, children: self.children.map((c) => mapTree(c, f)).filter(Boolean) as MapNode[] };
}

function leaves(n: MapNode): string[] {
  return n.children.length ? n.children.flatMap(leaves) : [n.id];
}

const same = (a: string, b: string) => a.replace(/\s/g, '') === b.replace(/\s/g, '');

export function MindMap({ mode }: { mode: Mode }) {
  const [mind, setMind] = useState<MindState>(() => load(MIND_KEY, { tree: buildDemoMap(), style: {} }));
  const [mem, setMem] = useState<MemoryState>(() =>
    load(MEM_KEY, { collapsed: [], covered: [], blanks: [], answers: {}, offsets: {}, autoAlign: true }),
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('blank');
  const [reveal, setReveal] = useState(false);
  const [saved, setSaved] = useState(true);
  const drag = useRef<{ id: string; x: number; y: number; dx: number; dy: number } | null>(null);

  useEffect(() => {
    localStorage.setItem(MIND_KEY, JSON.stringify(mind));
    setSaved(true);
  }, [mind]);
  useEffect(() => {
    localStorage.setItem(MEM_KEY, JSON.stringify(mem));
  }, [mem]);

  // 记忆图谱：O 键在原文与自己的填写之间切换
  useEffect(() => {
    if (mode !== 'memory') return;
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.tagName === 'INPUT';
      if (!typing && (e.key === 'o' || e.key === 'O')) setReveal((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode]);

  const collapsed = useMemo(() => new Set(mem.collapsed), [mem.collapsed]);
  const placed = useMemo(() => layoutTree(mind.tree, collapsed), [mind.tree, collapsed]);
  const byId = useMemo(() => new Map(placed.map((p) => [p.node.id, p])), [placed]);
  const links = useMemo(() => crossLinks(mind.tree), [mind.tree]);
  const free = mode === 'memory' && !mem.autoAlign;
  const off = (id: string) => (mode === 'memory' ? mem.offsets[id] ?? { dx: 0, dy: 0 } : { dx: 0, dy: 0 });
  const pos = (id: string) => {
    const p = byId.get(id)!;
    const o = off(id);
    return { x: p.x + o.dx + PAD, y: p.y + o.dy + PAD };
  };
  const height = Math.max(...placed.map((p) => p.y)) + PAD * 2 + ROW;
  const widthAll = Math.max(...placed.map((p) => p.x + width(p.node.text, p.depth))) + PAD * 2 + 40;

  const toggle = (key: 'collapsed' | 'covered' | 'blanks', id: string) =>
    setMem((m) => ({ ...m, [key]: m[key].includes(id) ? m[key].filter((x) => x !== id) : [...m[key], id] }));

  const editTree = (f: (n: MapNode) => MapNode | null) => {
    setSaved(false);
    setMind((s) => ({ ...s, tree: mapTree(s.tree, f) ?? s.tree }));
  };
  const setStyle = (id: string, patch: Style) => {
    setSaved(false);
    setMind((s) => ({ ...s, style: { ...s.style, [id]: { ...s.style[id], ...patch } } }));
  };

  const onNodeClick = (n: MapNode) => {
    if (mode === 'mind') return setSelected(n.id);
    if (tool === 'collapse' && n.children.length) toggle('collapsed', n.id);
    if (tool === 'cover' && n.id !== 'root') toggle('covered', n.id);
    if (tool === 'blank' && n.id !== 'root') toggle('blanks', n.id);
  };

  const onDown = (e: RPointerEvent<HTMLDivElement>, id: string) => {
    if (!free || (e.target as HTMLElement).tagName === 'INPUT') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const o = off(id);
    drag.current = { id, x: e.clientX, y: e.clientY, dx: o.dx, dy: o.dy };
  };
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    setMem((m) => ({ ...m, offsets: { ...m.offsets, [d.id]: { dx: d.dx + e.clientX - d.x, dy: d.dy + e.clientY - d.y } } }));
  };

  const sel = selected ? byId.get(selected) : undefined;
  const selStyle = selected ? mind.style[selected] ?? {} : {};

  return (
    <div className="mm">
      <div className="mm-bar">
        {mode === 'mind' ? (
          <>
            <div className="mm-tools" role="group" aria-label="编辑选中的节点">
              <button type="button" disabled={!sel} aria-pressed={!!selStyle.bold} onClick={() => selected && setStyle(selected, { bold: !selStyle.bold })}>
                加粗
              </button>
              <button type="button" disabled={!sel} aria-pressed={!!selStyle.mark} onClick={() => selected && setStyle(selected, { mark: !selStyle.mark })}>
                高亮
              </button>
              <button
                type="button"
                disabled={!sel}
                onClick={() => selected && setStyle(selected, { color: (((selStyle.color ?? 0) + 1) % 3) as 0 | 1 | 2 })}
              >
                字色
              </button>
              <button type="button" disabled={!sel} onClick={() => selected && setEditing(selected)}>
                改文字
              </button>
              <button
                type="button"
                disabled={!sel}
                onClick={() => {
                  if (!selected) return;
                  const id = `u${Date.now().toString(36)}`;
                  editTree((n) => (n.id === selected ? { ...n, children: [...n.children, { id, text: '新节点', children: [] }] } : n));
                  setMem((m) => ({ ...m, collapsed: m.collapsed.filter((x) => x !== selected) }));
                  setSelected(id);
                  setEditing(id);
                }}
              >
                加子节点
              </button>
              <button
                type="button"
                disabled={!sel || selected === 'root'}
                onClick={() => {
                  if (!selected || selected === 'root') return;
                  editTree((n) => (n.id === selected ? null : n));
                  setSelected(null);
                }}
              >
                删除
              </button>
            </div>
            <span className="mm-status">{saved ? '已保存在本机' : '保存中…'}</span>
            <button
              type="button"
              className="btn quiet"
              onClick={() => {
                if (window.confirm('恢复成示例导图？你的修改会丢失。')) {
                  setMind({ tree: buildDemoMap(), style: {} });
                  setSelected(null);
                }
              }}
            >
              恢复示例
            </button>
          </>
        ) : (
          <>
            <div className="segmented" role="group" aria-label="点击节点时">
              {(
                [
                  ['collapse', '收起'],
                  ['cover', '遮盖'],
                  ['blank', '挖空'],
                ] as const
              ).map(([id, label]) => (
                <button key={id} type="button" aria-pressed={tool === id} onClick={() => setTool(id)}>
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn quiet"
              onClick={() => setMem((m) => ({ ...m, blanks: leaves(mind.tree).filter((id) => id !== 'root') }))}
            >
              叶子全部挖空
            </button>
            <button type="button" className="btn quiet" onClick={() => setMem((m) => ({ ...m, covered: [], blanks: [], answers: {} }))}>
              清空
            </button>
            <label className="mm-switch">
              <input type="checkbox" checked={mem.autoAlign} onChange={(e) => setMem((m) => ({ ...m, autoAlign: e.target.checked }))} />
              自动对齐
            </label>
            {!mem.autoAlign && (
              <button type="button" className="btn quiet" onClick={() => setMem((m) => ({ ...m, offsets: {} }))}>
                归位
              </button>
            )}
            <button type="button" className={reveal ? 'mm-reveal on' : 'mm-reveal'} onClick={() => setReveal((v) => !v)} aria-pressed={reveal}>
              <kbd>O</kbd>
              {reveal ? '正在看原文' : '对照原文'}
            </button>
          </>
        )}
      </div>

      <div className="mm-scroll" onPointerMove={onMove} onPointerUp={() => (drag.current = null)}>
        <div className="mm-canvas" style={{ width: widthAll, height }} onClick={(e) => e.target === e.currentTarget && setSelected(null)}>
          <svg className="mm-lines" width={widthAll} height={height} aria-hidden="true">
            {placed
              .filter((p) => p.parent)
              .map((p) => {
                const a = pos(p.parent!);
                const pa = byId.get(p.parent!)!;
                const b = pos(p.node.id);
                const ax = a.x + width(pa.node.text, pa.depth);
                const mx = (ax + b.x) / 2;
                return <path key={p.node.id} className={`mm-branch d${Math.min(p.depth, 3)}`} d={`M${ax} ${a.y} C${mx} ${a.y} ${mx} ${b.y} ${b.x} ${b.y}`} />;
              })}
            {/* 跨分支联系只在选中节点时显示（局部视图），记忆图谱里不显示：它们会泄露挖空的答案 */}
            {mode === 'mind' &&
              (() => {
                const shown = links.filter((l) => byId.has(l.from) && byId.has(l.to) && (l.from === selected || l.to === selected));
                const perEnd = new Map<string, number>();
                return shown.map((l) => {
                  const fa = byId.get(l.from)!;
                  const fb = byId.get(l.to)!;
                  // 标签放在「另一端」节点旁边，同一端多条线依次错开
                  const other = l.from === selected ? l.to : l.from;
                  const k = perEnd.get(other) ?? 0;
                  perEnd.set(other, k + 1);
                  const a = pos(l.from);
                  const b = pos(l.to);
                  const ax = a.x + width(fa.node.text, fa.depth);
                  const bx = b.x + width(fb.node.text, fb.depth);
                  const cx = Math.max(ax, bx) + 60 + Math.abs(a.y - b.y) * 0.25;
                  const o = other === l.to ? { x: bx, y: b.y } : { x: ax, y: a.y };
                  return (
                    <g key={l.id} className="mm-cross">
                      <path d={`M${ax} ${a.y} C${cx} ${a.y} ${cx} ${b.y} ${bx} ${b.y}`} />
                      {l.label && (
                        <text x={o.x + 10} y={o.y - 8 - k * 14}>
                          {l.label}
                        </text>
                      )}
                    </g>
                  );
                });
              })()}
          </svg>

          {placed.map((p) => {
            const n = p.node;
            const s = mind.style[n.id] ?? {};
            const at = pos(n.id);
            const isBlank = mode === 'memory' && mem.blanks.includes(n.id);
            const isCovered = mode === 'memory' && mem.covered.includes(n.id) && !reveal;
            const answer = mem.answers[n.id] ?? '';
            const cls = [
              'mm-node',
              `d${Math.min(p.depth, 3)}`,
              n.children.length === 0 && p.depth > 0 ? 'leaf' : '',
              selected === n.id && mode === 'mind' ? 'sel' : '',
              s.bold ? 'bold' : '',
              s.mark ? 'mark' : '',
              s.color ? `c${s.color}` : '',
              isCovered ? 'covered' : '',
              isBlank ? 'blank' : '',
              free ? 'free' : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <div
                key={n.id}
                className={cls}
                style={{ left: at.x, top: at.y }}
                role="button"
                tabIndex={0}
                aria-pressed={mode === 'mind' ? selected === n.id : undefined}
                onClick={() => onNodeClick(n)}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && (e.target as HTMLElement) === e.currentTarget) {
                    e.preventDefault();
                    onNodeClick(n);
                  }
                  if (e.key === 'F2' && mode === 'mind') setEditing(n.id);
                }}
                onDoubleClick={() => mode === 'mind' && setEditing(n.id)}
                onPointerDown={(e) => onDown(e, n.id)}
              >
                {editing === n.id ? (
                  <input
                    autoFocus
                    defaultValue={n.text}
                    aria-label="节点文字"
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v) editTree((x) => (x.id === n.id ? { ...x, text: v } : x));
                      setEditing(null);
                    }}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === 'Escape') && (e.target as HTMLInputElement).blur()}
                  />
                ) : isBlank && !reveal ? (
                  <input
                    className="mm-answer"
                    value={answer}
                    placeholder="填空"
                    aria-label={`填写被挖空的节点（第 ${p.depth} 层）`}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setMem((m) => ({ ...m, answers: { ...m.answers, [n.id]: e.target.value } }))}
                  />
                ) : isBlank && reveal ? (
                  <span className="mm-check">
                    {n.text}
                    {answer && <em className={same(answer, n.text) ? 'ok' : 'no'}>{same(answer, n.text) ? '对' : `你写的：${answer}`}</em>}
                  </span>
                ) : (
                  <span>{n.text}</span>
                )}
                {mode === 'memory' && n.children.length > 0 && (
                  <button
                    type="button"
                    className="mm-caret"
                    aria-label={collapsed.has(n.id) ? '展开' : '收起'}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle('collapsed', n.id);
                    }}
                  >
                    <Icon name="chevron" className={collapsed.has(n.id) ? 'icon' : 'icon open'} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
