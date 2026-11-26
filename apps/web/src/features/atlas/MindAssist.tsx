import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { WorkspaceStore } from '../../store/types';
import { Icon } from '../../ui/Icon';
import { modelReady, usePrefs } from '../../ui/prefs';
import { rich, type MindCanvas } from './mindCanvas';
import type { GraphLike, MNode } from './mindDoc';
import { collectInput, diffDocs, diffSize, SYNC_REQUEST, UPDATE_BUDGET, updateMind, type MindDiff, type Updated } from './mindGen';

/**
 * 导图页的 AI 对话框：提问，或让它代你改图；「按资料更新」是同一条路，只是要求固定。
 * 模型给出的修改先列成差异（新增 / 删去 / 改动 / 移动）给你看，点「应用」才落到图上，
 * 并且作为一步记进历史：Ctrl+Z 或提示里的「撤回」一下就整体回到改之前（AGENTS.md §1 第 4 条）。
 */

type Phase =
  | { kind: 'idle' }
  | { kind: 'running'; label: string }
  | { kind: 'result'; ask: string; result: Updated; diff: MindDiff | null }
  | { kind: 'applied'; reply: string }
  | { kind: 'error'; message: string }
  | { kind: 'nokey' };

const Rich = ({ text }: { text: string }) => <span dangerouslySetInnerHTML={{ __html: rich(text) }} />;
const LIMIT = 6;

function DiffList({ title, items }: { title: string; items: { key: string; node: MNode; note?: string }[] }) {
  if (!items.length) return null;
  return (
    <div className="assist-diff">
      <h4>
        {title} <span>{items.length}</span>
      </h4>
      <ul>
        {items.slice(0, LIMIT).map((x) => (
          <li key={x.key}>
            <Rich text={x.node.text} />
            {x.note && (
              <em>
                <Rich text={x.note} />
              </em>
            )}
          </li>
        ))}
        {items.length > LIMIT && <li className="more">另有 {items.length - LIMIT} 处</li>}
      </ul>
    </div>
  );
}

export function MindAssist({
  canvas,
  store,
  graph,
  name,
  syncTick,
}: {
  canvas: () => MindCanvas | null;
  store: WorkspaceStore;
  graph: GraphLike | null;
  name: string;
  /** 页头「按资料更新」每点一次加一 */
  syncTick: number;
}) {
  const { model, openSettings } = usePrefs();
  const [draft, setDraft] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const run = async (ask: string, label: string) => {
    const c = canvas();
    if (!c) return;
    if (!modelReady(model)) return setPhase({ kind: 'nokey' });
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setPhase({ kind: 'running', label });
    try {
      const prev = c.docCopy();
      // 改图只带与这次要求相关的笔记（旧图本身已含全部主题）；「按资料更新」要发现新材料，按原序收满预算
      const { input } = await collectInput(store, name, graph, ask === SYNC_REQUEST ? { ranked: false } : { query: ask, budget: UPDATE_BUDGET });
      const result = await updateMind(model, store, { ...input, existingMap: prev, userRequest: ask }, ctrl.signal);
      if (ctrl.signal.aborted) return;
      setPhase({ kind: 'result', ask, result, diff: result.checked ? diffDocs(prev, result.checked.doc) : null });
    } catch (e) {
      if ((e as Error).name === 'AbortError') return setPhase({ kind: 'idle' });
      setPhase({ kind: 'error', message: (e as Error).message });
    }
  };

  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (syncTick > 0) void run(SYNC_REQUEST, '正在对照工作区里的笔记，看导图哪里需要更新…');
    // 只响应按钮点击
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncTick]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const ask = draft.trim();
    if (!ask) return;
    setDraft('');
    void run(ask, '正在读这张图和你的笔记…');
  };

  const apply = () => {
    if (phase.kind !== 'result' || !phase.result.checked) return;
    canvas()?.applyDoc(phase.result.checked.doc, '已应用 AI 的修改，Ctrl+Z 可以撤回');
    setPhase({ kind: 'applied', reply: phase.result.reply });
  };

  const close = () => setPhase({ kind: 'idle' });

  return (
    <div className="askbar assist">
      {phase.kind === 'nokey' && (
        <div className="askbar-note">
          <p>让 AI 改图需要接入你自己的模型。知脉不提供 key，key 默认只存在当前标签页。</p>
          <button type="button" className="btn primary small" onClick={() => openSettings('model')}>
            接入我的模型
          </button>
          <button type="button" onClick={close} aria-label="关闭">
            <Icon name="close" />
          </button>
        </div>
      )}
      {phase.kind === 'running' && (
        <div className="askbar-note" role="status">
          <p>{phase.label}</p>
          <button type="button" className="btn quiet small" onClick={() => abort.current?.abort()}>
            取消
          </button>
        </div>
      )}
      {phase.kind === 'error' && (
        <div className="askbar-note" role="alert">
          <p>{phase.message}</p>
          <button type="button" onClick={close} aria-label="关闭">
            <Icon name="close" />
          </button>
        </div>
      )}
      {phase.kind === 'applied' && (
        <div className="askbar-note" role="status">
          <p>已应用。{phase.reply}</p>
          <button
            type="button"
            className="btn quiet small"
            onClick={() => {
              canvas()?.undo();
              close();
            }}
          >
            撤回这次修改
          </button>
          <button type="button" onClick={close} aria-label="关闭">
            <Icon name="close" />
          </button>
        </div>
      )}
      {phase.kind === 'result' && (
        <section className="assist-panel" aria-label="AI 的回答与修改">
          <p className="assist-ask">{phase.ask === SYNC_REQUEST ? '按资料更新' : phase.ask}</p>
          <p className="assist-reply">{phase.result.reply}</p>
          {phase.diff && diffSize(phase.diff) > 0 && (
            <>
              <DiffList title="新增" items={phase.diff.added.map((x) => ({ key: x.node.id, node: x.node, note: x.parent ? `挂在「${x.parent}」下` : undefined }))} />
              <DiffList title="删去" items={phase.diff.removed.map((x) => ({ key: x.node.id, node: x.node }))} />
              <DiffList title="改动" items={phase.diff.changed.map((x) => ({ key: x.after.id, node: x.after, note: x.fields.join('、') }))} />
              <DiffList title="移动" items={phase.diff.moved.map((x) => ({ key: x.node.id, node: x.node, note: `从「${x.from}」到「${x.to}」` }))} />
            </>
          )}
          {phase.result.checked && phase.result.checked.fixes.length > 0 && (
            <p className="assist-fix">核对时改掉：{phase.result.checked.fixes.join('；')}</p>
          )}
          <div className="assist-actions">
            {phase.diff && diffSize(phase.diff) > 0 ? (
              <>
                <button type="button" className="btn primary small" onClick={apply}>
                  应用这些修改
                </button>
                <button type="button" className="btn quiet small" onClick={close}>
                  不要
                </button>
              </>
            ) : (
              <button type="button" className="btn quiet small" onClick={close}>
                {phase.diff ? '没有需要改的，关闭' : '关闭'}
              </button>
            )}
          </div>
        </section>
      )}
      <form className="askbar-bar" onSubmit={submit}>
        <label className="sr-only" htmlFor="assist-input">
          问这张图，或让它帮你改
        </label>
        <input
          id="assist-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="问这张图，或让它帮你改：比如「把同一类问题合并成一支」"
          autoComplete="off"
          disabled={phase.kind === 'running'}
        />
        <button type="submit" aria-label="发送" disabled={!draft.trim() || phase.kind === 'running'}>
          <Icon name="send" />
        </button>
      </form>
    </div>
  );
}
