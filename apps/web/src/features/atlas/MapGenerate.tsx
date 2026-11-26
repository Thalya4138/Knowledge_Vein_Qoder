import { useEffect, useRef, useState } from 'react';
import 'katex/dist/katex.min.css';
import type { WorkspaceStore } from '../../store/types';
import { modelReady, usePrefs } from '../../ui/prefs';
import { rich } from './mindCanvas';
import { blankDoc, type GraphLike, type MDoc, type MNode } from './mindDoc';
import { collectInput, generateMind, NOTE_BUDGET, SPAN_CAP, type Checked, type Collected } from './mindGen';

/**
 * 新工作区的第一张导图（用户 2026-11-20 裁决：按工作区资料、以示例的质量生成，存进文件夹）。
 * 生成走用户自己的模型 + 内置 prompts/MINDMAP.md；结果先预览、核对，确认后才写进 maps/mind.json。
 * 没有模型时不伪造「AI 生成」：说清楚要什么，并允许从空白导图开始。
 */

type Phase =
  | { kind: 'collecting' }
  | { kind: 'idle'; collected: Collected }
  | { kind: 'running'; collected: Collected }
  | { kind: 'preview'; collected: Collected; result: Checked }
  | { kind: 'error'; collected: Collected | null; message: string };

function Outline({ node, depth = 0 }: { node: MNode; depth?: number }) {
  return (
    <li className={`gen-node d${Math.min(depth, 3)}`}>
      <span className="gen-text" dangerouslySetInnerHTML={{ __html: rich(node.text) }} />
      {node.tag && <span className="gen-tag">{node.tag}</span>}
      {node.f && node.f.length > 0 && <span className="gen-meta">{node.f.length} 条公式</span>}
      {node.src && <span className="gen-meta">出处 {node.src}</span>}
      {node.kids.length > 0 && (
        <ul>
          {node.kids.map((k) => (
            <Outline key={k.id} node={k} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function MapGenerate({
  name,
  store,
  graph,
  writeLabel,
  onAccept,
}: {
  name: string;
  store: WorkspaceStore;
  graph: GraphLike | null;
  /** 确认按钮上写明写到哪里，如 maps/mind.json */
  writeLabel: string;
  onAccept: (doc: MDoc) => Promise<void>;
}) {
  const { model, openSettings } = usePrefs();
  const [phase, setPhase] = useState<Phase>({ kind: 'collecting' });
  const [saving, setSaving] = useState(false);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    let alive = true;
    collectInput(store, name, graph)
      .then((collected) => alive && setPhase({ kind: 'idle', collected }))
      .catch((e: Error) => alive && setPhase({ kind: 'error', collected: null, message: `读取工作区资料失败：${e.message}` }));
    return () => {
      alive = false;
      abort.current?.abort();
    };
  }, [store, name, graph]);

  const collected = phase.kind === 'collecting' ? null : phase.collected;
  const ready = modelReady(model);
  const empty = collected !== null && collected.input.notes.length === 0 && collected.input.nodes.length === 0;

  const run = async () => {
    if (!collected) return;
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setPhase({ kind: 'running', collected });
    try {
      const result = await generateMind(model, store, collected.input, ctrl.signal);
      if (!ctrl.signal.aborted) setPhase({ kind: 'preview', collected, result });
    } catch (e) {
      if ((e as Error).name === 'AbortError') return setPhase({ kind: 'idle', collected });
      setPhase({ kind: 'error', collected, message: (e as Error).message });
    }
  };

  const accept = async (doc: MDoc) => {
    setSaving(true);
    try {
      await onAccept(doc);
    } catch (e) {
      setPhase({ kind: 'error', collected, message: `没有写入：${(e as Error).message}` });
    } finally {
      setSaving(false);
    }
  };

  if (phase.kind === 'collecting') return <p role="status">正在读取这个工作区的笔记与图谱…</p>;

  if (phase.kind === 'preview') {
    const { result } = phase;
    return (
      <section className="gen" aria-label="生成结果预览">
        <h2 className="gen-title">预览：{result.doc.title}</h2>
        <p className="gen-quiet">
          {result.count} 个主题。这只是预览，还没有写进工作区；确认后你可以在导图里随意改。
        </p>
        {(result.fixes.length > 0 || result.warnings.length > 0) && (
          <div className="gen-check">
            {result.fixes.length > 0 && (
              <>
                <h3>核对时改掉的地方</h3>
                <ul>
                  {result.fixes.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </>
            )}
            {result.warnings.length > 0 && (
              <>
                <h3>还不够好的地方</h3>
                <ul>
                  {result.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
        <ul className="gen-outline">
          <Outline node={result.doc.root} />
        </ul>
        <div className="gen-actions">
          <button type="button" className="btn primary" disabled={saving} onClick={() => void accept(result.doc)}>
            {saving ? '正在写入…' : `确认，写入 ${writeLabel}`}
          </button>
          <button type="button" className="btn quiet" disabled={saving} onClick={() => void run()}>
            重新生成
          </button>
          <button type="button" className="btn quiet" disabled={saving} onClick={() => setPhase({ kind: 'idle', collected: phase.collected })}>
            放弃
          </button>
        </div>
      </section>
    );
  }

  const stats = collected?.stats;
  return (
    <section className="gen" aria-label="生成第一张导图">
      {collected && (
        <p className="gen-quiet">
          将交给模型的材料：{stats!.files} 份笔记切成 {collected.input.notes.length} 段（约 {stats!.chars.toLocaleString()} 字，与图谱越相关越优先）
          {collected.input.nodes.length > 0 ? `，图谱里 ${collected.input.nodes.length} 个知识点、${collected.input.relations.length} 条已接受的关系` : '，这个工作区没有 graph.json，导图里不会出现知识关系'}
          。
          {stats!.dropped > 0 && ` 另有 ${stats!.dropped} 段超出单次上限（${NOTE_BUDGET.toLocaleString()} 字）没有送出。`}
          {stats!.truncated > 0 && ` ${stats!.truncated} 段过长，只送出每段前 ${SPAN_CAP.toLocaleString()} 字。`}
        </p>
      )}
      {empty ? (
        <p>这个工作区里还没有笔记，没有可以生成的材料。先回工作台写一份 Markdown，或者从空白导图开始。</p>
      ) : ready ? (
        <p className="gen-quiet">
          用你在设置里接入的模型（{model.model}）按内置规则 <code>prompts/MINDMAP.md</code> 生成。笔记原文会直接从浏览器发给这家模型服务，不经过知脉的服务器。
        </p>
      ) : (
        <p className="gen-quiet">
          生成需要接入你自己的模型（DeepSeek、通义千问、OpenAI 等）。知脉不提供 key，也不会拿示例冒充你的导图。
        </p>
      )}
      {phase.kind === 'error' && (
        <p className="gen-error" role="alert">
          {phase.message}
        </p>
      )}
      <div className="gen-actions">
        {phase.kind === 'running' ? (
          <>
            <button type="button" className="btn primary" disabled>
              正在生成，通常要半分钟到两分钟…
            </button>
            <button type="button" className="btn quiet" onClick={() => abort.current?.abort()}>
              取消
            </button>
          </>
        ) : ready ? (
          <button type="button" className="btn primary" disabled={empty || !collected} onClick={() => void run()}>
            {phase.kind === 'error' && collected ? '再试一次' : '用我的模型生成导图'}
          </button>
        ) : (
          <button type="button" className="btn primary" onClick={() => openSettings('model')}>
            接入我的模型
          </button>
        )}
        <button type="button" className="btn quiet" disabled={phase.kind === 'running' || saving} onClick={() => void accept(blankDoc(name))}>
          从空白导图开始
        </button>
      </div>
    </section>
  );
}
