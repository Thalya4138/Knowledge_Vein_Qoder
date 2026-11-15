import { useState, type FormEvent } from 'react';
import { demoGraph } from '../../app/demo';
import { Icon } from '../../ui/Icon';

/**
 * 悬浮在工作台底部的 AI 对话框。
 * 示例模式（没有 API key）只回答预置问题：答案取自示例知识库里真实的关系说明，
 * 并给出它在笔记里的位置；点位置即打开讲义、定位、短暂高亮。
 */

export interface Hit {
  fileId: string;
  heading: string;
  label: string;
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
      { fileId: 'note-2-1', heading: '最近点满足的条件', label: '最近点满足的条件' },
      { fileId: 'note-2-1', heading: '法方程', label: '法方程' },
    ],
  },
  {
    q: '最近点唯一，为什么参数不一定唯一？',
    relationIds: ['r.contrast-pointwise', 'r.rank-iff-invertible'],
    hits: [{ fileId: 'note-2-1', heading: '点唯一，参数未必唯一', label: '点唯一，参数未必唯一' }],
  },
];

interface Turn {
  q: string;
  preset: Preset | null;
}

export function AiDock({ onLocate, noteName }: { onLocate: (hit: Hit) => void; noteName: string }) {
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [draft, setDraft] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const current = turns[turns.length - 1];

  const ask = (q: string) => {
    const preset = PRESETS.find((p) => p.q === q.trim()) ?? null;
    setTurns((t) => [...t, { q: q.trim(), preset }]);
    setDraft('');
    setOpen(true);
    setShowHistory(false);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (draft.trim()) ask(draft);
  };

  return (
    <div className={open ? 'dock open' : 'dock'}>
      {open && (
        <section className="dock-panel" aria-label="AI 对话">
          <header className="dock-head">
            <span>{showHistory ? '这次的对话记录' : current ? current.q : '可以这样问'}</span>
            <span className="dock-head-actions">
              <button
                type="button"
                className="btn quiet"
                onClick={() => setShowHistory((v) => !v)}
                aria-pressed={showHistory}
                disabled={turns.length === 0}
              >
                <Icon name="history" />
                记录
              </button>
              <button type="button" className="btn quiet" onClick={() => setOpen(false)} aria-label="收起对话">
                <Icon name="close" />
              </button>
            </span>
          </header>

          {showHistory ? (
            <ol className="dock-history">
              {turns.map((t, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => {
                      setTurns((all) => [...all.filter((_, j) => j !== i), t]);
                      setShowHistory(false);
                    }}
                  >
                    {t.q}
                  </button>
                </li>
              ))}
            </ol>
          ) : !current ? (
            <ul className="dock-presets">
              {PRESETS.map((p) => (
                <li key={p.q}>
                  <button type="button" onClick={() => ask(p.q)}>
                    {p.q}
                  </button>
                </li>
              ))}
            </ul>
          ) : current.preset ? (
            <div className="dock-answer">
              <div className="answer-body">
                {current.preset.relationIds.map((id) => {
                  const r = demoGraph.relations.find((x) => x.id === id);
                  if (!r) return null;
                  return (
                    <p key={id}>{r.explanation}</p>
                  );
                })}
              </div>
              <p className="answer-where">在你的笔记里</p>
              <ul className="answer-hits">
                {current.preset.hits.map((h) => (
                  <li key={h.heading}>
                    <button
                      type="button"
                      onClick={() => {
                        onLocate(h);
                        setOpen(false);
                      }}
                    >
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
              <p className="answer-foot">示例结果：离线整理，人工核对过。</p>
            </div>
          ) : (
            <div className="dock-answer">
              <p className="answer-body">
                示例模式只能回答预置的问题。接入你自己的 API key 后，可以问这个工作区里的任何内容，也可以让它整理资料、补写笔记。
              </p>
              <ul className="dock-presets">
                {PRESETS.map((p) => (
                  <li key={p.q}>
                    <button type="button" onClick={() => ask(p.q)}>
                      {p.q}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <form className="dock-bar" onSubmit={submit}>
        <label className="sr-only" htmlFor="dock-input">
          问这个工作区
        </label>
        <input
          id="dock-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="问这个工作区，或让它整理、补写笔记"
          autoComplete="off"
        />
        <button type="submit" className="dock-send" aria-label="发送" disabled={!draft.trim()}>
          <Icon name="send" />
        </button>
      </form>
    </div>
  );
}
