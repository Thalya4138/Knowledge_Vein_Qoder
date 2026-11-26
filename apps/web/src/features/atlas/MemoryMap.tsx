import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
// 公式排版所需的样式与字体
import 'katex/dist/katex.min.css';
import { Icon } from '../../ui/Icon';
import { rich } from './mindCanvas';
import type { MemoryState } from './maps';
import { answerKey, toMapNode, type KnowledgeContext, type MDoc, type MNode } from './mindDoc';
import { layoutTree, ROW, type MapNode } from './mindmapData';

/**
 * 个人记忆图谱：以思维导图为本源（读取思维导图保存在本机的文档）。
 * 收起、遮盖、挖空自测，按 O 在原文与自己的填写之间切换（对的标「对」，错的用朱笔划掉）；
 * 关掉「自动对齐」后可自由拖动节点，连线与父子关系不变。
 * 不显示跨分支的联系：它们会泄露挖空的答案。视觉与思维导图同一语言（DESIGN.md §12）。
 */

type Tool = 'collapse' | 'cover' | 'blank';
const PAD = 48;
const GAP = 56;
const FS = [22, 17, 15, 15];

/** 还没量到真实宽度时的估算（中文约一字一字号宽）。 */
const estimate = (text: string, depth: number, kids: boolean) =>
  [...text.replace(/\$|\\[a-zA-Z]+|[{}]/g, '')].length * (FS[Math.min(depth, 3)] ?? 15) + (depth <= 2 ? 36 : 12) + (kids ? 24 : 0);

function leaves(n: MapNode): string[] {
  return n.children.length ? n.children.flatMap(leaves) : [n.id];
}

const same = (a: string, b: string) => answerKey(a) === answerKey(b);
/** 写对主题原文，或写对知识库里登记的别名（如「自由参数」之于「自由变量」），都算对。 */
const correct = (knowledge: KnowledgeContext, answer: string, n: MapNode) =>
  same(answer, n.text) || (n.ref ? (knowledge.info(n.ref)?.aliases ?? []).some((a) => same(answer, a)) : false);
/** 主题文字里的 $…$ 渲染成公式（与思维导图一致）。 */
const Rich = ({ text }: { text: string }) => <span dangerouslySetInnerHTML={{ __html: rich(text) }} />;

const TOOLS = [
  ['blank', '挖空'],
  ['cover', '遮盖'],
  ['collapse', '收起'],
] as const;

export interface MemoryMapProps {
  /** 以思维导图为本源（工作区的 maps/mind.json） */
  doc: MDoc;
  knowledge: KnowledgeContext;
  /** 练习状态（工作区的 maps/memory.json） */
  memory: MemoryState;
  persist: (json: string) => Promise<void>;
  onError: (msg: string) => void;
}

export function MemoryMap({ doc, knowledge, memory, persist, onError }: MemoryMapProps) {
  const tree = useMemo(() => toMapNode(doc.root), [doc]);
  /** 每个主题所属第一层分支的分区色，与思维导图一致 */
  const bandOf = useMemo(() => {
    const m = new Map<string, number>();
    doc.root.kids.forEach((top, i) => {
      const b = top.band ?? i % 3;
      const w = (n: MNode) => {
        m.set(n.id, b);
        n.kids.forEach(w);
      };
      w(top);
    });
    return m;
  }, [doc]);
  const [mem, setMem] = useState<MemoryState>(memory);
  const [tool, setTool] = useState<Tool>('blank');
  const [reveal, setReveal] = useState(false);
  const [widths, setWidths] = useState<Record<string, number>>({});
  const drag = useRef<{ id: string; x: number; y: number; dx: number; dy: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // 改动 400ms 后写进 maps/memory.json；串行写，免得旧版本后落盘
  const first = useRef(true);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef<string | null>(null);
  const flush = useRef(() => {});
  flush.current = () => {
    const json = pending.current;
    if (json === null) return;
    pending.current = null;
    chain.current = chain.current.then(() => persist(json)).catch((e: Error) => onError(`练习记录没有保存：${e.message}`));
  };
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    pending.current = JSON.stringify(mem, null, 2) + '\n';
    const t = window.setTimeout(() => flush.current(), 400);
    return () => window.clearTimeout(t);
  }, [mem]);
  // 离开页面前把还没写的那一次写掉
  useEffect(() => () => flush.current(), []);

  // O 键在原文与自己的填写之间切换
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA';
      if (!typing && (e.key === 'o' || e.key === 'O')) setReveal((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const collapsed = useMemo(() => new Set(mem.collapsed), [mem.collapsed]);
  const placed = useMemo(() => layoutTree(tree, collapsed), [tree, collapsed]);
  const byId = useMemo(() => new Map(placed.map((p) => [p.node.id, p])), [placed]);
  const w = (p: (typeof placed)[number]) => widths[p.node.id] ?? estimate(p.node.text, p.depth, p.node.children.length > 0);

  // 列宽按每一层最宽的牌决定，避免带公式的长主题压到下一层
  const colX = useMemo(() => {
    const maxW: number[] = [];
    for (const p of placed) maxW[p.depth] = Math.max(maxW[p.depth] ?? 0, w(p));
    const xs: number[] = [0];
    for (let d = 1; d < maxW.length; d++) xs[d] = xs[d - 1]! + (maxW[d - 1] ?? 0) + GAP;
    return xs;
  }, [placed, widths]);

  // 渲染后量出每张牌的真实宽度（公式、加粗都会改变宽度）
  useLayoutEffect(() => {
    const root = canvasRef.current;
    if (!root) return;
    const next: Record<string, number> = {};
    let changed = false;
    root.querySelectorAll<HTMLElement>('[data-mm]').forEach((el) => {
      const id = el.dataset.mm!;
      next[id] = el.offsetWidth;
      if (widths[id] !== el.offsetWidth) changed = true;
    });
    if (changed) setWidths(next);
  });

  const free = !mem.autoAlign;
  const off = (id: string) => mem.offsets[id] ?? { dx: 0, dy: 0 };
  const pos = (id: string) => {
    const p = byId.get(id)!;
    const o = off(id);
    return { x: (colX[p.depth] ?? p.x) + o.dx + PAD, y: p.y + o.dy + PAD };
  };
  const height = Math.max(...placed.map((p) => p.y)) + PAD * 2 + ROW;
  const widthAll = Math.max(...placed.map((p) => (colX[p.depth] ?? p.x) + w(p))) + PAD * 2 + 40;

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

  // 计分：挖了几处、填了几处、对了几处
  const blanks = mem.blanks.filter((id) => byId.has(id));
  const filled = blanks.filter((id) => (mem.answers[id] ?? '').trim());
  const right = filled.filter((id) => { const p = byId.get(id); return !!p && correct(knowledge, mem.answers[id]!, p.node); });

  const hints: [string, string][] = reveal
    ? [['O', '回到自己的填写'], ['蓝色「对」', '答对'], ['朱笔', '答错，划掉的是你写的']]
    : [
        ['点击主题', tool === 'blank' ? '挖空或取消' : tool === 'cover' ? '遮盖或取消' : '收起或展开'],
        ['O', '对照原文'],
        ...(free ? ([['拖动', '把主题摆到你记得的位置']] as [string, string][]) : []),
      ];

  return (
    <div className="mm">
      <div className="mm-bar">
        <span className="mm-label">点击主题时</span>
        <div className="segmented" role="group" aria-label="点击主题时">
          {TOOLS.map(([id, label]) => (
            <button key={id} type="button" aria-pressed={tool === id} onClick={() => setTool(id)}>
              {label}
            </button>
          ))}
        </div>
        <div className="mm-keys">
          <button type="button" className="key small" onClick={() => setMem((m) => ({ ...m, blanks: leaves(tree).filter((id) => id !== tree.id) }))}>
            叶子全部挖空
          </button>
          <button type="button" className="key small" onClick={() => setMem((m) => ({ ...m, covered: [], blanks: [], answers: {} }))}>
            清空
          </button>
          <button type="button" className="key small" aria-pressed={!mem.autoAlign} onClick={() => setMem((m) => ({ ...m, autoAlign: !m.autoAlign }))}>
            自由摆放
          </button>
          {free && (
            <button type="button" className="key small" onClick={() => setMem((m) => ({ ...m, offsets: {} }))}>
              归位
            </button>
          )}
        </div>
        <div className="mm-score" aria-live="polite">
          <span>
            <b>{filled.length}</b>/{blanks.length}
            <em>已填</em>
          </span>
          {reveal && (
            <span className="ok">
              <b>{right.length}</b>
              <em>对</em>
            </span>
          )}
        </div>
        <button type="button" className="key small mm-reveal" onClick={() => setReveal((v) => !v)} aria-pressed={reveal}>
          <kbd>O</kbd>
          {reveal ? '正在看原文' : '对照原文'}
        </button>
      </div>

      <div className="mm-board" onPointerMove={onMove} onPointerUp={() => (drag.current = null)}>
        <div className="mm-canvas" ref={canvasRef} style={{ width: widthAll, height }}>
          <svg className="mm-lines" width={widthAll} height={height} aria-hidden="true">
            {placed
              .filter((p) => p.parent)
              .map((p) => {
                const pa = byId.get(p.parent!)!;
                const a = pos(p.parent!);
                const b = pos(p.node.id);
                const ax = a.x + w(pa);
                const mx = (ax + b.x) / 2;
                const leaf = p.node.children.length === 0 && p.depth >= 2;
                const bw = leaf ? w(p) : 0;
                return (
                  <g key={p.node.id} className={`mm-branch d${Math.min(p.depth, 3)} b${bandOf.get(p.node.id) ?? 0}`}>
                    <path d={`M${ax} ${a.y} C${mx} ${a.y} ${mx} ${b.y} ${b.x} ${b.y}`} />
                    {leaf && <path d={`M${b.x} ${b.y + 13} H${b.x + bw}`} className="mm-underline" />}
                  </g>
                );
              })}
          </svg>

          {placed.map((p) => {
            const n = p.node;
            const at = pos(n.id);
            const isBlank = mem.blanks.includes(n.id);
            const isCovered = mem.covered.includes(n.id) && !reveal;
            const answer = mem.answers[n.id] ?? '';
            const leaf = n.children.length === 0 && p.depth > 0;
            const cls = [
              'mm-node',
              `d${Math.min(p.depth, 3)}`,
              `b${bandOf.get(n.id) ?? 0}`,
              leaf ? 'leaf' : '',
              isCovered ? 'covered' : '',
              isBlank ? 'blank' : '',
              isBlank && reveal && answer ? (correct(knowledge, answer, n) ? 'right' : 'wrong') : '',
              free ? 'free' : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <div
                key={n.id}
                data-mm={n.id}
                className={cls}
                style={{ left: at.x, top: at.y }}
                role="button"
                tabIndex={0}
                aria-label={isCovered ? '被遮盖的主题' : undefined}
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
                    aria-label={`填写被挖空的主题（第 ${p.depth} 层）`}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setMem((m) => ({ ...m, answers: { ...m.answers, [n.id]: e.target.value } }))}
                  />
                ) : isBlank && reveal ? (
                  <span className="mm-check">
                    <Rich text={n.text} />
                    {answer && (correct(knowledge, answer, n) ? <em className="ok">对</em> : <em className="no">{answer}</em>)}
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

      <footer className="mm-status">
        {hints.map(([k, t]) => (
          <span key={k + t}>
            {k.length === 1 ? <kbd>{k}</kbd> : <b>{k}</b>}
            {t}
          </span>
        ))}
      </footer>
    </div>
  );
}
