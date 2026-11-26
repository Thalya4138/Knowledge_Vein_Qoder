import { useEffect, useRef, useState, type FormEvent } from 'react';
import { demoGraph } from '../../app/demo';
import { openStore, readText } from '../../store/open';
import type { Workspace, WorkspaceStore, WsFile } from '../../store/types';
import { Icon } from '../../ui/Icon';
import { modelReady, usePrefs, useT } from '../../ui/prefs';
import { Md } from '../connection/md';
import { ChangePreview } from './ChangePreview';
import type { ChangeSet } from './changes';
import { DeskLesson } from './LessonPanel';
import { DeskOrganize } from './OrganizePanel';
import { deskAsk, type DeskAnswer, type DeskSource } from './deskAsk';
import { loadDeskHistory, saveDeskHistory, upsertTurn, deskUid, type DeskTurn } from './deskHistory';
import { buildPatchChanges } from './deskPatch';
import { filePath } from './workspaceData';
import type { OrganizeLesson } from './deskOrganize';

/**
 * 悬浮在工作台底部的 AI 对话框，三种模式：
 * - 问答：程序先在讲义里检索，模型据此讲解并用 [n] 标出处（deskAsk.ts）；回答可一键补进笔记（deskPatch.ts）。
 * - 整理：放资料 → 整理方案与讲义目录 → 预览落盘（DeskOrganize）。
 * - 生成：逐节资源卡 + 教材体讲义 → 预览落盘（DeskLesson）。
 * 没有 key：问答只答预置问题，整理 / 生成给标注「示例」的预置产出。
 * 对话历史存进工作区的 .vein/desk/threads.json，刷新、换浏览器都还在。
 */

export interface Hit {
  fileId: string;
  heading: string;
  label: string;
  /** 预置问题的出处在示例工作区里：当前不在示例工作区时要先切过去 */
  demo?: boolean;
}

interface Preset {
  q: string;
  relationIds: string[];
  hits: Hit[];
}

const PRESETS: Preset[] = [
  {
    q: '法方程是怎么推出来的？',
    relationIds: ['r.derive-normaleq'],
    hits: [
      { fileId: 'note-2-1', heading: '最近点满足的条件', label: '最近点满足的条件', demo: true },
      { fileId: 'note-2-1', heading: '法方程', label: '法方程', demo: true },
    ],
  },
  {
    q: '最近点唯一，为什么参数不一定唯一？',
    relationIds: ['r.contrast-pointwise', 'r.rank-iff-invertible'],
    hits: [{ fileId: 'note-2-1', heading: '点唯一，参数未必唯一', label: '点唯一，参数未必唯一', demo: true }],
  },
];

const presetText = (p: Preset): string =>
  p.relationIds.map((id) => demoGraph.relations.find((x) => x.id === id)?.explanation ?? '').filter(Boolean).join('\n\n');

interface Turn {
  q: string;
  preset: Preset | null;
  /** 真实模型的回答；pending 时为 undefined */
  live?: { pending: true } | { pending: false; answer: DeskAnswer } | { pending: false; error: string };
}

type Mode = 'ask' | 'organize' | 'lesson';

/** 从出处里挑一个能在当前工作区打开的目标，作为「补进笔记」的落点。 */
function resolveTarget(sources: { fileId?: string; heading: string; label: string }[], files: WsFile[]): { path: string; anchor: string; label: string } | null {
  for (const s of sources) {
    if (!s.fileId) continue;
    const f = files.find((x) => x.id === s.fileId);
    const path = f && filePath(f);
    if (path) return { path, anchor: `${path}#${s.heading}`, label: s.label };
  }
  return null;
}

export function AiDock({
  onLocate,
  noteName,
  ws,
  files,
  onWorkspace,
  onStatus,
}: {
  onLocate: (hit: Hit) => void;
  noteName: string;
  ws: Workspace;
  files: WsFile[];
  onWorkspace?: (w: Workspace) => void;
  onStatus?: (s: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('ask');
  const tr = useT();
  const { model, openSettings } = usePrefs();
  const live = modelReady(model);
  const gated = live ? model : null;
  const [showHistory, setShowHistory] = useState(false);
  const [draft, setDraft] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [lessons, setLessons] = useState<OrganizeLesson[]>([]);
  const [store, setStore] = useState<WorkspaceStore | null>(null);
  const [history, setHistory] = useState<DeskTurn[]>([]);
  const [patchPreview, setPatchPreview] = useState<ChangeSet | null>(null);
  const patchTarget = useRef<{ path: string; anchor: string; q: string } | null>(null);
  const current = turns[turns.length - 1];
  const busy = current?.live?.pending === true;
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  // 打开对话框时接上工作区存储，并读回对话历史。
  // openStore 只用 id/origin：写入后工作区刷新文件栏会换 ws 对象，但 store 不能跟着重建，
  // 否则 ChangePreview 检测到 store 变化会重置成待确认、清掉撤销记录（验收 #1）。
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setStore(null);
    openStore(ws)
      .then(async (res) => {
        if (!alive) return;
        if (res.status === 'ready') {
          setStore(res.store);
          const h = await loadDeskHistory(res.store);
          if (alive) setHistory(h);
        } else {
          onStatus?.(res.status === 'auth' ? tr('要先在左栏重新授权这个本地文件夹。', 'Re-allow this local folder first.') : res.message);
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [open, ws.id, ws.origin, tr, onStatus]);

  const record = (turn: DeskTurn) => {
    setHistory((all) => {
      const next = upsertTurn(all, turn);
      if (store) void saveDeskHistory(store, next).catch(() => undefined);
      return next;
    });
  };

  const ask = (raw: string) => {
    const q = raw.trim();
    if (!q || busy) return;
    const preset = PRESETS.find((p) => p.q === q) ?? null;
    setDraft('');
    setOpen(true);
    setShowHistory(false);
    setMode('ask');
    // 预置问题在示例工作区里有人工核对过的答案，直接给；其余问题有 key 才问模型
    if (preset || !live) {
      setTurns((t) => [...t, { q, preset }]);
      if (preset) record({ id: deskUid(), q, a: presetText(preset), at: Date.now(), origin: 'preset', sources: preset.hits.map((h, i) => ({ n: i + 1, anchor: '', fileId: h.fileId, heading: h.heading, label: h.label })) });
      return;
    }
    const prior = turns.flatMap((t) => (t.live && !t.live.pending && 'answer' in t.live ? [{ q: t.q, a: t.live.answer.text }] : []));
    setTurns((t) => [...t, { q, preset: null, live: { pending: true } }]);
    const ctrl = new AbortController();
    abort.current = ctrl;
    const settle = (result: Turn['live']) => {
      setTurns((all) => all.map((t) => (t.q === q && t.live?.pending ? { ...t, live: result } : t)));
      if (result && !result.pending && 'answer' in result) record({ id: deskUid(), q, a: result.answer.text, sources: result.answer.sources, at: Date.now(), origin: 'ask' });
    };
    deskAsk(model, ws, files, q, prior, ctrl.signal)
      .then((answer) => settle({ pending: false, answer }))
      .catch((e: Error) => {
        if (e.name === 'AbortError') return;
        settle({ pending: false, error: e.message });
      });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    ask(draft);
  };

  const stop = () => {
    abort.current?.abort();
    setTurns((all) => all.map((t) => (t.live?.pending ? { ...t, live: { pending: false, error: tr('已停止。', 'Stopped.') } } : t)));
  };

  const locate = (h: Hit) => {
    onLocate(h);
    setOpen(false);
  };

  const status = (s: string) => onStatus?.(s);

  // 一键补进笔记：把回答插进出处所在的讲义，预览差异、确认后写入、可撤销
  const startPatch = async (q: string, answer: string, sources: { fileId?: string; heading: string; label: string; n?: number }[]) => {
    if (!store) {
      status(tr('要先打开或授权这个工作区。', 'Open or allow this workspace first.'));
      return;
    }
    const target = resolveTarget(sources, files);
    if (!target) {
      status(tr('这条回答没有可定位的出处，无法补进笔记。', 'This answer has no locatable source to patch into.'));
      return;
    }
    const noteText = await readText(store, target.path);
    if (noteText === null) {
      status(tr(`读不到 ${target.path}。`, `Cannot read ${target.path}.`));
      return;
    }
    const deskSources: DeskSource[] = sources.map((s, i) => ({ n: s.n ?? i + 1, anchor: target.anchor, fileId: s.fileId, heading: s.heading, label: s.label }));
    patchTarget.current = { path: target.path, anchor: target.anchor, q };
    setPatchPreview(buildPatchChanges(target.path, target.anchor, noteText, q, answer, deskSources, new Date().toISOString().slice(0, 10)));
  };

  const onPatchApplied = () => {
    const t = patchTarget.current;
    if (!t) return;
    setHistory((all) => {
      const next = all.map((x) => (x.q === t.q ? { ...x, addedTo: { path: t.path, anchor: t.anchor, at: Date.now() } } : x));
      if (store) void saveDeskHistory(store, next).catch(() => undefined);
      return next;
    });
  };

  const restore = (h: DeskTurn) => {
    const preset = PRESETS.find((p) => p.q === h.q) ?? null;
    setTurns((all) => [...all, preset ? { q: h.q, preset } : { q: h.q, preset: null, live: { pending: false, answer: { text: h.a, sources: h.sources ?? [] } } }]);
    setShowHistory(false);
    setMode('ask');
  };

  const presetList = (
    <ul className="dock-presets">
      {PRESETS.map((p) => (
        <li key={p.q}>
          <button type="button" onClick={() => ask(p.q)}>
            {p.q}
          </button>
        </li>
      ))}
    </ul>
  );

  const patchButton = (q: string, answer: string, sources: { fileId?: string; heading: string; label: string; n?: number }[]) => (
    <button type="button" className="btn quiet" onClick={() => void startPatch(q, answer, sources)} disabled={!store}>
      <Icon name="save" />
      {tr('补进笔记', 'Add to note')}
    </button>
  );

  return (
    <div className={open ? 'dock open' : 'dock'}>
      {open && (
        <section className="dock-panel" aria-label="AI 对话">
          <header className="dock-head">
            <span>{showHistory ? tr('对话记录（存于工作区）', 'History (saved in workspace)') : mode === 'ask' ? (current ? current.q : tr('可以这样问', 'Try asking')) : mode === 'organize' ? tr('整理资料', 'Organize material') : tr('生成讲义', 'Generate lesson')}</span>
            <span className="dock-head-actions">
              {mode === 'ask' && (
                <button type="button" className="btn quiet" onClick={() => setShowHistory((v) => !v)} aria-pressed={showHistory} disabled={history.length === 0 || busy}>
                  <Icon name="history" />
                  {tr('记录', 'History')}
                </button>
              )}
              <button type="button" className="btn quiet" onClick={() => { setOpen(false); setMode('ask'); }} aria-label={tr('收起对话', 'Collapse')}>
                <Icon name="close" />
              </button>
            </span>
          </header>

          <div className="dock-tabs" role="tablist">
            {(['ask', 'organize', 'lesson'] as const).map((m) => (
              <button key={m} type="button" role="tab" aria-pressed={mode === m} onClick={() => { setMode(m); setShowHistory(false); }}>
                {m === 'ask' ? tr('问答', 'Ask') : m === 'organize' ? tr('整理', 'Organize') : tr('生成讲义', 'Lesson')}
              </button>
            ))}
          </div>

          {mode === 'organize' ? (
            <DeskOrganize model={gated} store={store} ws={ws} onWorkspace={onWorkspace} onStatus={status} onLessons={setLessons} />
          ) : mode === 'lesson' ? (
            <DeskLesson model={gated} store={store} ws={ws} lessons={lessons} onWorkspace={onWorkspace} onStatus={status} />
          ) : showHistory ? (
            <ol className="dock-history">
              {history.map((h) => (
                <li key={h.id}>
                  <button type="button" onClick={() => restore(h)}>
                    {h.q}
                    {h.addedTo && <span className="hit-sep"> · {tr('已补进笔记', 'added')}</span>}
                  </button>
                </li>
              ))}
            </ol>
          ) : !current ? (
            <>
              {presetList}
              {live && (
                <p className="answer-foot dock-mode">
                  {tr(`已接入 ${model.model}：可以问「${ws.name}」里的任何内容。`, `Connected to ${model.model}: ask anything in “${ws.name}”.`)}
                </p>
              )}
            </>
          ) : current.preset ? (
            <div className="dock-answer">
              <div className="answer-body">
                {current.preset.relationIds.map((id) => {
                  const r = demoGraph.relations.find((x) => x.id === id);
                  if (!r) return null;
                  return <p key={id}>{r.explanation}</p>;
                })}
              </div>
              <p className="answer-where">{tr('在你的笔记里', 'In your notes')}</p>
              <ul className="answer-hits">
                {current.preset.hits.map((h) => (
                  <li key={h.heading}>
                    <button type="button" onClick={() => locate(h)}>
                      <Icon name="locate" />
                      <span>
                        {noteName}
                        <span className="hit-sep">/</span>
                        {h.label}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <div>{patchButton(current.q, presetText(current.preset), current.preset.hits.map((h, i) => ({ n: i + 1, fileId: h.fileId, heading: h.heading, label: h.label })))}</div>
              <p className="answer-foot">{tr('示例结果：离线整理，人工核对过。', 'Sample result: prepared offline and checked by hand.')}</p>
            </div>
          ) : current.live?.pending ? (
            <div className="dock-answer">
              <p className="answer-foot" role="status">
                {tr('正在读你的讲义并请模型作答…', 'Reading your notes and asking the model…')}
              </p>
              <div>
                <button type="button" className="btn quiet" onClick={stop}>
                  {tr('停止', 'Stop')}
                </button>
              </div>
            </div>
          ) : current.live && 'error' in current.live ? (
            <div className="dock-answer">
              <p className="answer-body" role="alert">
                {current.live.error}
              </p>
              <div>
                <button type="button" className="btn quiet" onClick={() => openSettings('model')}>
                  {tr('打开模型设置', 'Open model settings')}
                </button>
              </div>
            </div>
          ) : current.live && 'answer' in current.live ? (
            <div className="dock-answer">
              <Md className="answer-body answer-md" text={current.live.answer.text} />
              {current.live.answer.sources.length > 0 && (
                <>
                  <p className="answer-where">{tr('在你的笔记里', 'In your notes')}</p>
                  <ul className="answer-hits">
                    {current.live.answer.sources.map((s) => (
                      <li key={s.n}>
                        <button type="button" disabled={!s.fileId} onClick={() => s.fileId && locate({ fileId: s.fileId, heading: s.heading, label: s.label })}>
                          <Icon name="locate" />
                          <span>
                            [{s.n}] {s.label}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <div>{patchButton(current.q, current.live.answer.text, current.live.answer.sources)}</div>
              <p className="answer-foot">
                {tr(`由 ${model.model} 根据你的讲义作答；没标编号的部分来自讲义之外，请自行核对。`, `Answered by ${model.model} from your notes; parts without a number come from outside your notes — check them.`)}
              </p>
            </div>
          ) : (
            <div className="dock-answer">
              <p className="answer-body">
                {tr('示例模式只能回答预置的问题。接入你自己的 API key 后，可以问这个工作区里的任何内容。', 'Sample mode answers only the prepared questions. With your own API key you can ask anything about this workspace.')}
              </p>
              <div>
                <button type="button" className="btn quiet" onClick={() => openSettings('model')}>
                  <Icon name="key" />
                  {tr('接入 API key', 'Add an API key')}
                </button>
              </div>
              {presetList}
            </div>
          )}
        </section>
      )}

      {mode === 'ask' && (
        <form className="dock-bar" onSubmit={submit}>
          <label className="sr-only" htmlFor="dock-input">
            {tr('问这个工作区', 'Ask this workspace')}
          </label>
          <input
            id="dock-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => setOpen(true)}
            placeholder={live ? tr('问这个工作区里的任何内容', 'Ask anything in this workspace') : tr('问这个工作区（接入 key 后可问任何内容）', 'Ask this workspace (add a key to ask anything)')}
            autoComplete="off"
          />
          <button type="submit" className="dock-send" aria-label={tr('发送', 'Send')} disabled={!draft.trim() || busy}>
            <Icon name="send" />
          </button>
        </form>
      )}

      <ChangePreview
        open={patchPreview !== null}
        title={patchPreview?.title ?? ''}
        changes={patchPreview?.changes ?? []}
        store={store}
        ws={ws}
        onWorkspace={onWorkspace}
        onStatus={status}
        onApplied={onPatchApplied}
        onClose={() => setPatchPreview(null)}
      />
    </div>
  );
}