import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import { useWorkspace } from '../../app/WorkspaceProvider';
import { openStore } from '../../store/open';
import type { Workspace, WorkspaceStore } from '../../store/types';
import { Icon } from '../../ui/Icon';
import { modelReady, usePrefs, useT } from '../../ui/prefs';
import { ModelError } from '../../ai/chat';
import type { GraphLike } from '../atlas/mindDoc';
import { DEMO_WORKSPACE } from '../workspace/workspaceData';
import { ArgGraph, Legend, type Sel } from './ArgGraph';
import { acceptIntoGraph, addToMind, readGraph, undoMind, unacceptInGraph, type MindChange } from './bridge';
import { MODES, spanningTree, type ExploreResult, type ModeId, type XEdge, type XNode } from './explore';
import { explore, readAttachment, readUrl, type Attachment, type Progress } from './exploreAi';
import { ExportDialog } from './ExportDialog';
import type { Content } from './exporting';
import { Inspector, type Verdicts } from './Inspector';
import { PRESETS, presetResult } from './presets';
import { loadThreads, saveThreads, uid, type Thread, type Turn } from './threads';
import { TurnView } from './TurnView';
import '../../styles/connection.css';

/**
 * 知识关联探索（VISION 第三部分 ③）：三种模式共用一个界面，区别只在给模型的约束
 * （prompts/CONNECTION_EXPLORER.md + EXPLORE_*.md）。
 *
 * 一轮回答 = 一篇讲义体短文（用工作台的讲义阅读器显示）+ 一张关联图（右侧，可拖动、可编辑）。
 * 每条线由用户决定：收进图谱（写进工作区 graph.json）/ 先放着 / 改一改 / 不认同。
 * 讲解与关联图可以复制、导出（Markdown / Word / PPT / PDF / 图片）、存进工作区、接到讲义末尾、加入思维导图。
 * 对话历史存在工作区 .vein/explore/。没有 key 时，示例工作区可以看三个示例（标「示例」）。
 */

type Load = { kind: 'loading' } | { kind: 'auth' } | { kind: 'error'; message: string } | { kind: 'ready'; store: WorkspaceStore };

type Phase =
  | { kind: 'idle' }
  | { kind: 'running'; ask: string; files: Attachment[]; progress?: Progress }
  | { kind: 'error'; message: string; ask: string }
  | { kind: 'nokey'; ask: string };

interface Toast {
  text: string;
  link?: { to: string; label: string };
  undo?: () => void;
}

export function ConnectionPage() {
  const { ready, workspace, replace } = useWorkspace();
  const tr = useT();
  if (!ready) return <div className="cx"><p className="cx-empty" role="status">{tr('正在读取工作区…', 'Loading workspaces…')}</p></div>;
  const current = workspace ?? DEMO_WORKSPACE;
  return <Explorer key={current.id} workspace={current} onWorkspace={replace} />;
}

function Explorer({ workspace, onWorkspace }: { workspace: Workspace; onWorkspace: (w: Workspace) => void }) {
  const [params, setParams] = useSearchParams();
  const { model, openSettings, lang } = usePrefs();
  const tr = useT();
  const en = lang === 'en';
  const modeName = (m: (typeof MODES)[number]) => (en ? m.en[0] : m.label);
  const demo = workspace.origin === 'demo';
  const mode: ModeId = (MODES.find((m) => m.id === params.get('mode'))?.id ?? 'fragments') as ModeId;
  const modeInfo = MODES.find((m) => m.id === mode)!;
  const wsRef = useRef(workspace);
  wsRef.current = workspace;

  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [graph, setGraph] = useState<GraphLike | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const dirty = useRef(false);
  const threadId = params.get('t');
  const thread = threads.find((t) => t.id === threadId) ?? null;

  const [draft, setDraft] = useState(() => params.get('q') ?? '');
  const [files, setFiles] = useState<Attachment[]>([]);
  const [urlOpen, setUrlOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const abort = useRef<AbortController | null>(null);

  const [focusId, setFocusId] = useState<string | null>(null);
  const [sel, setSel] = useState<Sel>(null);
  const [showRejected, setShowRejected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [full, setFull] = useState(false);
  const [history, setHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [confirmMind, setConfirmMind] = useState<Turn | null>(null);
  const [exporting, setExporting] = useState<Turn | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fullRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const shotRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!full) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    const rootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    fullRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setFull(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      document.documentElement.style.overflow = rootOverflow;
      if (previous?.isConnected && previous !== document.body) previous.focus();
      else document.querySelector<HTMLButtonElement>('.cx-graph-tools button[aria-label="全屏"]')?.focus();
    };
  }, [full]);

  /* ---------- 读工作区 ---------- */

  const start = useCallback(async (request: boolean) => {
    try {
      const opened = await openStore(wsRef.current, request);
      if (opened.status === 'auth') return setLoad({ kind: 'auth' });
      if (opened.status === 'missing') return setLoad({ kind: 'error', message: opened.message });
      const [g, t] = await Promise.all([readGraph(opened.store, wsRef.current), loadThreads(opened.store)]);
      setGraph(g as unknown as GraphLike | null);
      // 历史里的示例若已改版，换成新版本（保留裁决与拖动）；换过就存一次
      if (t.upgraded) dirty.current = true;
      setThreads(t.threads);
      setLoad({ kind: 'ready', store: opened.store });
    } catch (e) {
      setLoad({ kind: 'error', message: (e as Error).message });
    }
  }, []);
  useEffect(() => {
    void start(false);
    return () => abort.current?.abort();
  }, [start]);

  const store = load.kind === 'ready' ? load.store : null;

  // 历史有改动就存（拖动节点等频繁操作合并成一次写）
  useEffect(() => {
    if (!store || !dirty.current) return;
    const t = window.setTimeout(() => {
      dirty.current = false;
      saveThreads(store, threads).catch((e) => setToast({ text: `对话历史没存上：${(e as Error).message}` }));
    }, 500);
    return () => window.clearTimeout(t);
  }, [threads, store]);

  useEffect(() => {
    if (!toast || toast.undo) return;
    const t = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const mutate = (fn: (all: Thread[]) => Thread[]) => {
    dirty.current = true;
    setThreads(fn);
  };

  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    next.delete('q');
    setParams(next, { replace: true });
  };

  const setMode = (id: ModeId) => {
    setParam({ mode: id === 'fragments' ? null : id, t: null });
    setSel(null);
    setPhase({ kind: 'idle' });
  };
  const openThread = (t: Thread | null) => {
    setParam({ t: t?.id ?? null, mode: t ? (t.mode === 'fragments' ? null : t.mode) : params.get('mode') });
    setFocusId(null);
    setSel(null);
    setHistory(false);
    setPhase({ kind: 'idle' });
  };

  const turns = thread?.turns ?? [];
  const focused = turns.find((t) => t.id === focusId) ?? turns[turns.length - 1] ?? null;

  // 新的一轮出现时滚到它的开头（长文从头读）；正在思考时滚到底部看进度
  const lastId = turns[turns.length - 1]?.id;
  useEffect(() => {
    // 不能 return 表达式：新版 Chrome 的 scrollIntoView 返回 Promise，React 会把它当清理函数去调用
    if (phase.kind === 'running') {
      endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      return;
    }
    if (lastId) document.querySelector(`[data-turn="${lastId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [lastId, phase.kind]);

  /* ---------- 改一轮的结果（关联图、裁决） ---------- */

  const updateResult = (turnId: string, fn: (r: ExploreResult) => ExploreResult) => {
    if (!thread) return;
    mutate((all) =>
      all.map((t) => (t.id !== thread.id ? t : { ...t, turns: t.turns.map((u) => (u.id === turnId ? { ...u, result: fn(u.result) } : u)) })),
    );
  };
  const setGraphOf = (g: ExploreResult['graph']) => focused && updateResult(focused.id, (r) => ({ ...r, graph: g }));
  const patchEdge = (id: string, patch: Partial<XEdge>) =>
    focused && updateResult(focused.id, (r) => ({ ...r, graph: { ...r.graph, edges: r.graph.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) } }));

  const verdicts: Verdicts = {
    accept: async (e) => {
      if (!store || !focused) return;
      setBusy(true);
      try {
        const { refs, relIds } = await acceptIntoGraph(store, wsRef.current, focused.result, [e], (w) => {
          wsRef.current = w;
          onWorkspace(w);
        });
        updateResult(focused.id, (r) => ({
          ...r,
          graph: {
            nodes: r.graph.nodes.map((n) => (refs[n.id] ? { ...n, ref: refs[n.id] } : n)),
            edges: r.graph.edges.map((x) => (x.id === e.id ? { ...x, status: 'accepted', relId: relIds[e.id] } : x)),
          },
        }));
        setGraph((await readGraph(store, wsRef.current)) as unknown as GraphLike | null);
        setToast({ text: '已写进这个工作区的图谱（graph.json）。', link: { to: `/atlas?ws=${encodeURIComponent(wsRef.current.id)}&map=mind`, label: '去图谱看' } });
      } catch (err) {
        setToast({ text: `没写进去：${(err as Error).message}` });
      } finally {
        setBusy(false);
      }
    },
    unaccept: async (e) => {
      if (!store) return;
      setBusy(true);
      try {
        if (e.relId) await unacceptInGraph(store, wsRef.current, e.relId);
        patchEdge(e.id, { status: 'proposed' });
        setGraph((await readGraph(store, wsRef.current)) as unknown as GraphLike | null);
      } finally {
        setBusy(false);
      }
    },
    setStatus: (e, status, reason) => patchEdge(e.id, { status, reason }),
    update: (e) => patchEdge(e.id, e),
    updateNode: (n) => focused && updateResult(focused.id, (r) => ({ ...r, graph: { ...r.graph, nodes: r.graph.nodes.map((x) => (x.id === n.id ? n : x)) } })),
    removeNode: (n) => {
      if (!focused) return;
      updateResult(focused.id, (r) => ({ ...r, graph: { nodes: r.graph.nodes.filter((x) => x.id !== n.id), edges: r.graph.edges.filter((x) => x.from !== n.id && x.to !== n.id) } }));
      setSel(null);
    },
    removeEdge: (e) => {
      if (!focused) return;
      updateResult(focused.id, (r) => ({ ...r, graph: { ...r.graph, edges: r.graph.edges.filter((x) => x.id !== e.id) } }));
      setSel(null);
    },
    askAbout: (n) => {
      setDraft(`围绕「${n.label}」继续：`);
      inputRef.current?.focus();
    },
  };

  const addNode = () => {
    if (!focused) return;
    const id = `n${Date.now().toString(36)}`;
    const node: XNode = { id, label: '新概念', kind: 'concept', layer: 1 };
    setGraphOf({ ...focused.result.graph, nodes: [...focused.result.graph.nodes, node] });
    setSel({ kind: 'node', id });
  };
  const relayout = () => focused && setGraphOf({ ...focused.result.graph, nodes: focused.result.graph.nodes.map(({ x: _x, y: _y, ...n }) => n) });

  /* ---------- 提问 ---------- */

  const pushTurn = (turn: Turn, m: ModeId) => {
    if (thread && thread.mode === m) {
      mutate((all) => all.map((t) => (t.id === thread.id ? { ...t, at: turn.at, turns: [...t.turns, turn] } : t)));
    } else {
      const t: Thread = { id: uid('t'), mode: m, title: turn.result.title, at: turn.at, turns: [turn] };
      mutate((all) => [t, ...all]);
      setParam({ t: t.id, mode: m === 'fragments' ? null : m });
    }
    setFocusId(turn.id);
    setSel(null);
  };

  const runPreset = (i: number) => {
    const p = PRESETS[i]!;
    // 同一示例已经打开过、还没续问：直接回到那条对话，不在历史里堆重复（导览每走一遍也会点它）
    const seen = threads.find((t) => t.turns.length === 1 && t.turns[0]!.presetId === p.id && t.turns[0]!.presetRev === p.rev);
    if (seen) {
      setParam({ t: seen.id, mode: p.mode === 'fragments' ? null : p.mode });
      setFocusId(seen.turns[0]!.id);
      setSel(null);
      setPhase({ kind: 'idle' });
      return;
    }
    const { result, issues } = presetResult(p);
    const turn: Turn = { id: uid('u'), ask: p.ask, files: [], result, issues, at: Date.now(), origin: 'preset', presetId: p.id, presetRev: p.rev };
    if (thread && thread.mode !== p.mode) setParam({ t: null });
    const t: Thread = { id: uid('t'), mode: p.mode, title: result.title, at: turn.at, turns: [turn] };
    mutate((all) => [t, ...all]);
    setParam({ t: t.id, mode: p.mode === 'fragments' ? null : p.mode });
    setFocusId(turn.id);
    setSel(null);
    setPhase({ kind: 'idle' });
  };

  const ask = async (text: string, att: Attachment[]) => {
    if (!store) return;
    const q = text.trim();
    // 示例问题原样再问一次：直接给示例结果，不调模型
    const presetIdx = demo && !thread ? PRESETS.findIndex((p) => p.mode === mode && p.ask === q) : -1;
    if (presetIdx >= 0 && !att.length) return runPreset(presetIdx);
    if (!modelReady(model)) return setPhase({ kind: 'nokey', ask: q });
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setPhase({ kind: 'running', ask: q, files: att });
    setDraft('');
    setFiles([]);
    try {
      const m = thread?.mode ?? mode;
      const prior = thread && thread.mode === m ? thread.turns.map((t) => ({ ask: t.ask, result: t.result })) : [];
      const out = await explore(model, store, graph, m, q, att, prior, ctrl.signal, (progress) => setPhase({ kind: 'running', ask: q, files: att, progress }));
      const turn: Turn = {
        id: uid('u'),
        ask: q || att.map((f) => f.name).join('、'),
        files: att.map((f) => ({ kind: f.kind, name: f.name })),
        result: out.result,
        issues: out.issues,
        at: Date.now(),
        origin: 'model',
        model: model.model,
      };
      pushTurn(turn, m);
      setPhase({ kind: 'idle' });
      if (!out.result.graph.edges.length) setToast({ text: '这次的关联图是空的：模型给出的关系都缺少依据。可以换个问法再问。' });
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        setPhase({ kind: 'idle' });
        setDraft(q);
        setFiles(att);
        return;
      }
      setPhase({ kind: 'error', message: e instanceof ModelError ? e.message : `出错了：${(e as Error).message}`, ask: q });
      setDraft(q);
      setFiles(att);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (phase.kind === 'running') return;
    if (draft.trim() || files.length) void ask(draft, files);
  };

  const addFiles = async (list: FileList | File[] | null) => {
    if (!list) return;
    const read = await Promise.all([...list].map(readAttachment));
    setFiles((f) => [...f, ...read]);
  };
  const addUrl = async () => {
    const u = url.trim();
    if (!/^https?:\/\//i.test(u)) return;
    setUrl('');
    setUrlOpen(false);
    setFiles((f) => [...f, { kind: 'url', name: u, text: null, note: '正在读取…' }]);
    const got = await readUrl(u);
    setFiles((f) => f.map((x) => (x.kind === 'url' && x.name === u ? got : x)));
  };
  const onPaste = (e: ClipboardEvent) => {
    const imgs = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/'));
    if (imgs.length) {
      e.preventDefault();
      void addFiles(imgs);
    }
  };
  const onDrop = (e: DragEvent) => {
    if (!e.dataTransfer.files.length) return;
    e.preventDefault();
    void addFiles(e.dataTransfer.files);
  };

  /* ---------- 导出 ---------- */

  const actions = {
    exportTurn: (turn: Turn) => {
      setFocusId(turn.id);
      setExporting(turn);
    },
    addToMind: (turn: Turn) => setConfirmMind(turn),
    editNote: (turn: Turn, note: string) => {
      const title = /^#\s+(.+)$/m.exec(note)?.[1]?.trim();
      updateResult(turn.id, (r) => ({ ...r, note, title: title || r.title }));
    },
  };

  /** 打印为 PDF：只留这一轮；content 决定留讲解、关联图还是两者 */
  const print = (turn: Turn, content: Content) => {
    setFocusId(turn.id);
    document.body.classList.add('cx-printing');
    document.body.dataset.cxPrint = content;
    const done = () => {
      document.body.classList.remove('cx-printing');
      delete document.body.dataset.cxPrint;
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    setTimeout(() => window.print(), 120);
  };

  const doAddMind = async (turn: Turn) => {
    setConfirmMind(null);
    if (!store) return;
    try {
      const change: MindChange = await addToMind(store, wsRef.current, turn.result, (w) => {
        wsRef.current = w;
        onWorkspace(w);
      });
      setToast({
        text: `「${change.title}」已加进思维导图。`,
        link: { to: `/atlas?ws=${encodeURIComponent(wsRef.current.id)}&map=mind`, label: '去图谱看' },
        undo: async () => {
          await undoMind(store, change);
          setToast({ text: '已撤回，思维导图回到加入之前。' });
        },
      });
    } catch (e) {
      setToast({ text: `没加进去：${(e as Error).message}` });
    }
  };

  /* ---------- 画面 ---------- */

  if (load.kind === 'loading') return <div className="cx"><p className="cx-empty" role="status">{tr('正在读取工作区…', 'Loading workspace…')}</p></div>;
  if (load.kind === 'auth' || load.kind === 'error') {
    return (
      <div className="cx">
        <div className="cx-empty">
          <h1 className="display">{load.kind === 'auth' ? tr('需要你点一下授权', 'One click to allow access') : tr('这个工作区打不开', 'This workspace cannot be opened')}</h1>
          <p className="cx-quiet">{load.kind === 'auth' ? tr(`浏览器要求每次重新允许读写「${workspace.name}」这个文件夹。`, `The browser asks again each session before reading and writing “${workspace.name}”.`) : load.message}</p>
          {load.kind === 'auth' && (
            <button type="button" className="key" onClick={() => void start(true)}>
              允许读写
            </button>
          )}
        </div>
      </div>
    );
  }

  const presets = demo ? PRESETS.map((p, i) => ({ p, i })).filter(({ p }) => p.mode === mode) : [];
  const active = Boolean(thread) || phase.kind !== 'idle';
  const g = focused?.result.graph;
  const rejectedCount = g ? g.edges.filter((e) => e.status === 'rejected').length : 0;
  const tree = focused ? spanningTree(focused.result) : null;

  const graphPanel = focused && g && (
    <>
      <div className="cx-graph-tools">
        <p className="cx-graph-head">关联图</p>
        <button type="button" className="key small" aria-pressed={connecting} onClick={() => setConnecting(!connecting)} title="依次点两个节点，画一条我的连线">
          连线
        </button>
        <button type="button" className="key small" onClick={addNode}>加节点</button>
        <button type="button" className="key small" onClick={relayout} title="回到按层自动排列（不改关系）">自动排列</button>
        {rejectedCount > 0 && (
          <button
            type="button"
            className="key small"
            aria-pressed={showRejected}
            onClick={() => setShowRejected(!showRejected)}
            title={showRejected ? '把这些线重新藏起来' : '你标了「不认同」的线默认不画。点这里把它们用虚线画回来，可以点开改主意。'}
          >
            {showRejected ? '收起不认同的' : `找回不认同的 ${rejectedCount} 条`}
          </button>
        )}
        <button type="button" className="key small square" onClick={() => setFull(!full)} aria-label={full ? '退出全屏' : '全屏'} title={full ? '退出全屏（Esc）' : '全屏'}>
          <Icon name={full ? 'shrink' : 'expand'} />
        </button>
      </div>
      {connecting && <p className="cx-hint">依次点两个节点，画一条「我的连线」。再点一次「连线」结束。</p>}
      <ArgGraph
        key={focused?.id}
        graph={g}
        onChange={setGraphOf}
        selected={sel}
        onSelect={setSel}
        showRejected={showRejected}
        connecting={connecting}
        onConnected={() => setConnecting(false)}
        fit={full ? 'fullscreen' : 'width'}
      />
      <Legend />
      <Inspector graph={g} sel={sel} busy={busy} v={verdicts} />
    </>
  );

  return (
    <div className={`cx${active ? ' busy' : ''}`} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <header className="cx-head">
        <div className="segmented big" role="group" aria-label={tr('探索模式', 'Exploration mode')}>
          {MODES.map((m) => (
            <button key={m.id} type="button" aria-pressed={m.id === (thread?.mode ?? mode)} onClick={() => setMode(m.id)}>
              {modeName(m)}
            </button>
          ))}
        </div>
        <div className="cx-head-end">
          {active && (
            <button type="button" className="key small" onClick={() => openThread(null)}>
              {tr('新对话', 'New conversation')}
            </button>
          )}
          <button type="button" className="key small" aria-expanded={history} onClick={() => setHistory(!history)}>
            {tr('历史', 'History')}{threads.length ? ` ${threads.length}` : ''}
          </button>
        </div>
      </header>

      {history && (
        <aside className="cx-history" aria-label={tr('对话历史', 'Conversation history')}>
          <p className="cx-history-head">{tr('对话历史', 'History')} <span>{tr('存在这个工作区的 .vein/explore/', 'saved in this workspace’s .vein/explore/')}</span></p>
          {threads.length === 0 && <p className="cx-quiet">{tr('还没有对话。', 'No conversations yet.')}</p>}
          <ul>
            {threads.map((t) => (
              <li key={t.id} className={t.id === thread?.id ? 'on' : ''}>
                <button type="button" onClick={() => openThread(t)}>
                  <strong>{t.title}</strong>
                  <span>
                    {modeName(MODES.find((m) => m.id === t.mode)!)}{tr('，', ', ')}{t.turns.length} {tr('轮', t.turns.length === 1 ? 'turn' : 'turns')}{tr('，', ', ')}{new Date(t.at).toLocaleDateString(en ? 'en' : 'zh-CN')}
                  </span>
                </button>
                <button
                  type="button"
                  className="cx-history-del"
                  aria-label={`删除「${t.title}」`}
                  onClick={() => {
                    mutate((all) => all.filter((x) => x.id !== t.id));
                    if (t.id === thread?.id) openThread(null);
                  }}
                >
                  <Icon name="close" />
                </button>
              </li>
            ))}
          </ul>
        </aside>
      )}

      <div className={focused ? 'cx-body split' : 'cx-body'}>
        <section className="cx-thread" aria-label="对话" aria-live="polite">
          {!active && (
            <div className="cx-empty">
              <h1 className="display">{modeName(modeInfo)}</h1>
              <p className="cx-quiet">{en ? modeInfo.en[1] : modeInfo.hint}</p>
              {presets.length > 0 && (
                <div className="cx-tries">
                  {presets.map(({ p, i }) => (
                    <button key={i} type="button" className="cx-try" onClick={() => runPreset(i)}>
                      {p.ask}
                      <span>{tr('示例', 'Sample')}</span>
                    </button>
                  ))}
                </div>
              )}
              {!demo && !modelReady(model) && (
                <p className="cx-quiet">
                  {tr('这个工作区的探索要用你自己的模型。', 'Exploring this workspace needs your own model. ')}
                  <button type="button" className="linkish" onClick={() => openSettings('model')}>
                    {tr('接入模型', 'Connect a model')}
                  </button>
                  {tr('，或先去', ', or see the three samples in the ')}
                  <Link to={`/connection?ws=${encodeURIComponent(DEMO_WORKSPACE.id)}`}>{tr('示例工作区', 'sample workspace')}</Link>
                  {tr('看三个示例。', '.')}
                </p>
              )}
              {!demo && graph && <p className="cx-quiet">{tr(`会参考「${workspace.name}」里的笔记与 ${graph.nodes.length} 个知识点。`, `Answers draw on the notes in “${workspace.name}” and its ${graph.nodes.length} concepts.`)}</p>}
            </div>
          )}

          {turns.map((t) => (
            <TurnView key={t.id} turn={t} mode={thread!.mode} workspace={workspace} focused={t.id === focused?.id} onFocus={() => (setFocusId(t.id), setSel(null))} act={actions} />
          ))}

          {phase.kind === 'running' && (
            <div className="turn">
              <div className="turn-ask">
                <span className="turn-q" aria-hidden="true">{tr('问', 'Q')}</span>
                <p>{phase.ask || phase.files.map((f) => f.name).join('、')}</p>
              </div>
              <div className="answer pending" role="status">
                <div>
                  <p>{phase.progress?.label ?? tr('准备中', 'Preparing')}{phase.progress && phase.progress.total > 1 ? `（${phase.progress.step}/${phase.progress.total}）` : ''}</p>
                  {phase.progress && phase.progress.total > 1 && (
                    <progress max={phase.progress.total} value={phase.progress.step} aria-label={tr('写作进度', 'Writing progress')} />
                  )}
                  <p className="cx-quiet small">{(thread?.mode ?? mode) === 'fragments' || thread ? tr('一般要半分钟到一分钟。', 'Usually 30–60 seconds.') : tr('先拟目录，再一节一节写，整篇要几分钟。', 'An outline first, then one section at a time — a few minutes in all.')}</p>
                </div>
                <button type="button" className="btn quiet" onClick={() => abort.current?.abort()}>
                  {tr('停止', 'Stop')}
                </button>
              </div>
            </div>
          )}
          {phase.kind === 'nokey' && (
            <div className="answer notice" role="status">
              <p>
                {demo ? tr('示例只能回答上面准备好的三个问题。', 'Without a model, the sample answers only the three prepared questions above. ') : ''}{tr('接入你自己的模型后，文字、网页、PDF、截图都可以一起放进来。API key 默认只存在当前标签页。', 'Connect your own model to mix text, web pages, PDFs and screenshots. By default the API key stays in this tab only.')}
              </p>
              <button type="button" className="key small" onClick={() => openSettings('model')}>
                {tr('接入模型', 'Connect a model')}
              </button>
            </div>
          )}
          {phase.kind === 'error' && (
            <div className="answer notice error" role="alert">
              <p>{phase.message}</p>
              <button type="button" className="key small" onClick={() => void ask(draft, files)}>
                {tr('再试一次', 'Try again')}
              </button>
            </div>
          )}
          <div ref={endRef} />
        </section>

        {focused && !full && (
          <aside className="cx-graph" aria-label="关联图与关系详情">
            {graphPanel}
            {tree && turns.length > 1 && <p className="cx-quiet small">显示的是第 {turns.indexOf(focused) + 1} 轮的图；点左边别的回答切换。</p>}
          </aside>
        )}
      </div>

      {full && focused && createPortal(
        <div className="cx-full" ref={fullRef} role="dialog" aria-modal="true" aria-label="关联图全屏" tabIndex={-1}>
          <div className="cx-full-main">{graphPanel}</div>
        </div>,
        document.body,
      )}

      <form className="cx-composer" onSubmit={submit}>
        {files.length > 0 && (
          <ul className="cx-files">
            {files.map((f, i) => (
              <li key={i} title={'note' in f ? f.note : undefined} className={f.kind === 'binary' || (f.kind === 'url' && !f.text) ? 'weak' : ''}>
                {f.kind === 'image' && <img src={f.url} alt="" />}
                <span>{f.kind === 'image' ? '截图' : f.kind === 'url' ? '网页' : f.kind === 'pdf' ? `PDF ${f.total} 页` : '文件'}</span>
                {f.name}
                {f.kind === 'url' && !f.text && <em>{f.note === '正在读取…' ? '读取中' : '只有地址'}</em>}
                {f.kind === 'binary' && <em>读不了正文</em>}
                <button type="button" aria-label={`移除 ${f.name}`} onClick={() => setFiles((all) => all.filter((_, j) => j !== i))}>
                  <Icon name="close" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {urlOpen && (
          <div className="cx-url">
            <input
              autoFocus
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void addUrl();
                }
                if (e.key === 'Escape') setUrlOpen(false);
              }}
              placeholder={tr('粘贴网页地址，回车添加', 'Paste a URL, press Enter')}
              aria-label={tr('网页地址', 'Web address')}
            />
          </div>
        )}
        <label htmlFor="cx-input" className="sr-only">
          {tr('输入', 'Input')}
        </label>
        <textarea
          id="cx-input"
          ref={inputRef}
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onPaste={onPaste}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              (e.currentTarget.form as HTMLFormElement).requestSubmit();
            }
          }}
          placeholder={thread ? tr('接着追问，或换个角度', 'Follow up, or try another angle') : mode === 'fragments' ? tr('把零散的知识、题目、方法放进来；截图可以直接粘贴，PDF 可以拖进来', 'Drop in scattered concepts, problems, methods; paste screenshots, drag in PDFs') : mode === 'meta' ? tr('说一门课或一个专题，例如「线性代数」「理论力学」', 'Name a course or topic, e.g. “linear algebra”, “analytical mechanics”') : tr('说两个领域，例如「线性代数 × 机器人运动学」', 'Name two fields, e.g. “linear algebra × robot kinematics”')}
        />
        <div className="cx-tools">
          <button type="button" className="btn quiet" onClick={() => fileRef.current?.click()} title={tr('文本、Markdown、PDF', 'Text, Markdown, PDF')}>
            {tr('文件', 'File')}
          </button>
          <button type="button" className="btn quiet" onClick={() => setUrlOpen(!urlOpen)}>
            {tr('网页', 'Web page')}
          </button>
          <button type="button" className="btn quiet" onClick={() => shotRef.current?.click()}>
            {tr('截图', 'Screenshot')}
          </button>
          <input ref={fileRef} type="file" multiple hidden onChange={(e) => void addFiles(e.target.files)} />
          <input ref={shotRef} type="file" accept="image/*" multiple hidden onChange={(e) => void addFiles(e.target.files)} />
          {thread && <span className="cx-follow">{tr(`追问「${thread.title}」`, `Following up on “${thread.title}”`)}</span>}
          <button type="submit" className="cx-send" aria-label={tr('发送', 'Send')} disabled={phase.kind === 'running' || (!draft.trim() && !files.length)}>
            <Icon name="send" />
          </button>
        </div>
      </form>

      {confirmMind && (
        <div className="cx-modal" role="dialog" aria-modal="true" aria-labelledby="cx-mind-title">
          <div className="cx-modal-card">
            <h2 id="cx-mind-title">加入思维导图</h2>
            <MindPreview turn={confirmMind} workspace={workspace} />
            <div className="xi-actions">
              <button type="button" className="key on" onClick={() => void doAddMind(confirmMind)}>
                加入
              </button>
              <button type="button" className="btn quiet" onClick={() => setConfirmMind(null)}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {exporting && store && (
        <ExportDialog
          turn={exporting}
          workspace={wsRef.current}
          store={store}
          onWorkspace={(w) => {
            wsRef.current = w;
            onWorkspace(w);
          }}
          onPrint={(content) => print(exporting, content)}
          onDone={(text, link) => setToast({ text, link })}
          onClose={() => setExporting(null)}
        />
      )}

      {toast && (
        <div className="cx-toast" role="status">
          <span>{toast.text}</span>
          {toast.link && <Link to={toast.link.to}>{toast.link.label}</Link>}
          {toast.undo && (
            <button type="button" className="linkish" onClick={() => void toast.undo!()}>
              撤回
            </button>
          )}
          <button type="button" className="cx-toast-x" aria-label="关闭" onClick={() => setToast(null)}>
            <Icon name="close" />
          </button>
        </div>
      )}
    </div>
  );
}

function MindPreview({ turn, workspace }: { turn: Turn; workspace: Workspace }) {
  const r = turn.result;
  const kept = r.graph.edges.filter((e) => e.status !== 'rejected');
  const { kids } = spanningTree(r);
  const treeEdges = [...kids.values()].flat().filter((k) => k.via).length;
  const links = kept.length - treeEdges;
  return (
    <div className="cx-mind-preview">
      <p>
        在「{workspace.name}」的思维导图中心主题下，新增一个分支「{r.title}」：{r.graph.nodes.length} 个主题；
        {treeEdges} 条关系写进主题的笔记与角标，另外 {Math.max(0, links)} 条放不进树的画成带理由的连线。
      </p>
      {r.graph.edges.some((e) => e.status === 'rejected') && <p className="cx-quiet">被你拒绝的关系不带进去。</p>}
      <p className="cx-quiet">加入之后可以一步撤回。只想挂到某个主题下面？用「复制为导图大纲」，在导图里选中那个主题再粘贴。</p>
    </div>
  );
}
