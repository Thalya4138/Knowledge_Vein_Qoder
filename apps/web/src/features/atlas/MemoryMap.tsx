import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { Icon } from '../../ui/Icon';
// 公式排版所需的样式与字体
import 'katex/dist/katex.min.css';
import { rich } from './mindCanvas';
import { answerKey, loadDoc, toMapNode } from './mindDoc';
import { layoutTree, ROW, type MapNode } from './mindmapData';

/**
 * 个人记忆图谱：以思维导图为本源（读取思维导图保存在本机的文档）。
 * 收起、遮盖、挖空自测，按 O 在原文与自己的填写之间切换；
 * 关掉「自动对齐」后可自由拖动节点，连线与父子关系不变。
 * 不显示跨分支的联系：它们会泄露挖空的答案。
 */

type Tool = 'collapse' | 'cover' | 'blank';
interface MemoryState {
  collapsed: string[];
  covered: string[];
  blanks: string[];
  answers: Record<string, string>;
  offsets: Record<string, { dx: number; dy: number }>;
  autoAlign: boolean;
}

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
const width = (text: string, depth: number) => [...text.replace(/\$|\\[a-zA-Z]+|[{}]/g, '')].length * (FS[Math.min(depth, 3)] ?? 13) + 26;

function leaves(n: MapNode): string[] {
  return n.children.length ? n.children.flatMap(leaves) : [n.id];
}

const same = (a: string, b: string) => answerKey(a) === answerKey(b);
/** 主题文字里的 $…$ 渲染成公式（与思维导图一致）。 */
const Rich = ({ text }: { text: string }) => <span dangerouslySetInnerHTML={{ __html: rich(text) }} />;

export function MemoryMap() {
  const tree = useMemo(() => toMapNode(loadDoc().root), []);
  const [mem, setMem] = useState<MemoryState>(() =>
    load(MEM_KEY, { collapsed: [], covered: [], blanks: [], answers: {}, offsets: {}, autoAlign: true }),
  );
  const [tool, setTool] = useState<Tool>('blank');
  const [reveal, setReveal] = useState(false);
  const drag = useRef<{ id: string; x: number; y: number; dx: number; dy: number } | null>(null);

  useEffect(() => {
    localStorage.setItem(MEM_KEY, JSON.stringify(mem));
  }, [mem]);

  // O 键在原文与自己的填写之间切换
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.tagName === 'INPUT';
      if (!typing && (e.key === 'o' || e.key === 'O')) setReveal((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const collapsed = useMemo(() => new Set(mem.collapsed), [mem.collapsed]);
  const placed = useMemo(() => layoutTree(tree, collapsed), [tree, collapsed]);
  const byId = useMemo(() => new Map(placed.map((p) => [p.node.id, p])), [placed]);
  const free = !mem.autoAlign;
  const off = (id: string) => mem.offsets[id] ?? { dx: 0, dy: 0 };
  const pos = (id: string) => {
    const p = byId.get(id)!;
    const o = off(id);
    return { x: p.x + o.dx + PAD, y: p.y + o.dy + PAD };
  };
  const height = Math.max(...placed.map((p) => p.y)) + PAD * 2 + ROW;
  const widthAll = Math.max(...placed.map((p) => p.x + width(p.node.text, p.depth))) + PAD * 2 + 40;

  const toggle = (key: 'collapsed' | 'covered' | 'blanks', id: string) =>
    setMem((m) => ({ ...m, [key]: m[key].includes(id) ? m[key].filter((x) => x !== id) : [...m[key], id] }));

  const onNodeClick = (n: MapNode) => {
    if (tool === 'collapse' && n.children.length) toggle('collapsed', n.id);
    if (tool === 'cover' && n.id !== tree.id) toggle('covered', n.id);
    if (tool === 'blank' && n.id !== tree.id) toggle('blanks', n.id);
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

  return (
    <div className="mm">
      <div className="mm-bar">
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
        <button type="button" className="btn quiet" onClick={() => setMem((m) => ({ ...m, blanks: leaves(tree).filter((id) => id !== tree.id) }))}>
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
      </div>

      <div className="mm-scroll" onPointerMove={onMove} onPointerUp={() => (drag.current = null)}>
        <div className="mm-canvas" style={{ width: widthAll, height }}>
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
          </svg>

          {placed.map((p) => {
            const n = p.node;
            const at = pos(n.id);
            const isBlank = mem.blanks.includes(n.id);
            const isCovered = mem.covered.includes(n.id) && !reveal;
            const answer = mem.answers[n.id] ?? '';
            const cls = [
              'mm-node',
              `d${Math.min(p.depth, 3)}`,
              n.children.length === 0 && p.depth > 0 ? 'leaf' : '',
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
                onClick={() => onNodeClick(n)}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && (e.target as HTMLElement) === e.currentTarget) {
                    e.preventDefault();
                    onNodeClick(n);
                  }
                }}
                onPointerDown={(e) => onDown(e, n.id)}
              >
                {isBlank && !reveal ? (
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
                    <Rich text={n.text} />
                    {answer && <em className={same(answer, n.text) ? 'ok' : 'no'}>{same(answer, n.text) ? '对' : `你写的：${answer}`}</em>}
                  </span>
                ) : (
                  <Rich text={n.text} />
                )}
                {n.children.length > 0 && (
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
