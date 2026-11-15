import { useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { demoGraph } from '../../app/demo';
import { Icon } from '../../ui/Icon';
import { LinkGraph, type GEdge, type GNode } from './LinkGraph';
import '../../styles/connection.css';

/**
 * 知识关联探索：对话界面。三种模式只改变给模型的约束（prompts/CONNECTION_EXPLORER.md、QUALITY_BAR.md §3），界面相同。
 * 示例模式：碎片串联有一个预置示例，回答取自示例知识库的关系原文；关联图可拖动、可双击编辑；回答可复制、可下载为 Markdown。
 */

const MODES = [
  { id: 'fragments', label: '碎片串联' },
  { id: 'meta', label: '学科元思考' },
  { id: 'cross', label: '跨学科并联' },
] as const;
type ModeId = (typeof MODES)[number]['id'];

const PRESET_Q = '最小二乘、点到平面的最短距离、异面直线的最短距离，是同一个问题吗？';
const RELS = ['r.shared-pointplane', 'r.shared-skew'];

const GRAPH_NODES: GNode[] = [
  { id: 'ls', label: '最小二乘', x: 90, y: 70 },
  { id: 'pp', label: '点到平面距离', x: 90, y: 180 },
  { id: 'sk', label: '异面直线距离', x: 90, y: 290 },
  { id: 'core', label: '在约束集合里找最近点', x: 330, y: 180, kind: 'core' },
];
const GRAPH_EDGES: GEdge[] = [
  { from: 'ls', to: 'core', label: '可行集：列空间' },
  { from: 'pp', to: 'core', label: '可行集：平面' },
  { from: 'sk', to: 'core', label: '两条直线的参数' },
];

interface Attachment {
  kind: '文件' | '网页' | '截图';
  name: string;
}

function answerMarkdown(): string {
  const rels = demoGraph.relations.filter((r) => RELS.includes(r.id));
  return [
    `## ${PRESET_Q}`,
    '',
    '是同一个问题：三者都是「在一个约束集合里，找离给定点欧氏距离最近的点」。差别只在约束集合的形状：列空间、平面、两条直线的参数化。',
    '',
    ...rels.flatMap((r) => [r.explanation, '', `成立条件：${r.assumptions.join('；')}`, '']),
    '> 示例结果：离线整理，人工核对过。',
  ].join('\n');
}

export function ConnectionPage() {
  const [params, setParams] = useSearchParams();
  const mode: ModeId = (MODES.find((m) => m.id === params.get('mode'))?.id ?? 'fragments') as ModeId;
  const [draft, setDraft] = useState('');
  const [files, setFiles] = useState<Attachment[]>([]);
  const [asked, setAsked] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const shotRef = useRef<HTMLInputElement>(null);

  const isPreset = asked === PRESET_Q && mode === 'fragments';
  const rels = demoGraph.relations.filter((r) => RELS.includes(r.id));

  const setMode = (id: ModeId) => {
    setParams(id === 'fragments' ? {} : { mode: id }, { replace: true });
    setAsked(null);
  };
  const ask = (q: string) => {
    setAsked(q.trim());
    setDraft('');
    setCopied(false);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (draft.trim() || files.length) ask(draft || files.map((f) => f.name).join('、'));
  };
  const addLink = () => {
    const url = window.prompt('粘贴网页地址');
    if (url) setFiles((f) => [...f, { kind: '网页', name: url }]);
  };
  const copy = async () => {
    await navigator.clipboard.writeText(answerMarkdown());
    setCopied(true);
  };
  const download = () => {
    const blob = new Blob([answerMarkdown()], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '碎片串联-最小二乘与最短距离.md';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="cx">
      <header className="cx-head">
        <div className="segmented big" role="group" aria-label="探索模式">
          {MODES.map((m) => (
            <button key={m.id} type="button" aria-pressed={m.id === mode} onClick={() => setMode(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
      </header>

      <div className={isPreset ? 'cx-body split' : 'cx-body'}>
        <section className="cx-thread" aria-label="对话">
          {!asked && (
            <div className="cx-empty">
              <svg className="cx-converge" viewBox="0 0 800 260" aria-hidden="true">
                {Array.from({ length: 13 }, (_, i) => {
                  const y = 10 + i * 20;
                  return <path key={i} pathLength={1} d={`M0 ${y} C300 ${y} 420 130 640 130`} style={{ ['--i' as string]: i }} />;
                })}
                <circle cx="640" cy="130" r="6" />
              </svg>
              <h1 className="display">{MODES.find((m) => m.id === mode)!.label}</h1>
              {mode === 'fragments' ? (
                <button type="button" className="cx-try" onClick={() => ask(PRESET_Q)}>
                  {PRESET_Q}
                </button>
              ) : (
                <p className="cx-quiet">示例模式下这个模式还没有准备示例；接入你自己的 API key 后可用。</p>
              )}
            </div>
          )}

          {asked && (
            <>
              <p className="msg user">{asked}</p>
              {isPreset ? (
                <article className="msg answer">
                  <p>
                    是同一个问题：三者都是「在一个约束集合里，找离给定点欧氏距离最近的点」。差别只在约束集合的形状：列空间、平面、两条直线的参数化。
                  </p>
                  {rels.map((r) => (
                    <div key={r.id} className="answer-rel">
                      <p>{r.explanation}</p>
                      <p className="answer-when">成立条件：{r.assumptions.join('；')}</p>
                    </div>
                  ))}
                  <footer className="answer-actions">
                    <button type="button" className="btn quiet" onClick={copy}>
                      {copied ? '已复制' : '复制为 Markdown'}
                    </button>
                    <button type="button" className="btn quiet" onClick={download}>
                      下载 .md
                    </button>
                    <button type="button" className="btn quiet" disabled title="图谱编辑器接入后可用">
                      加入记忆图谱
                    </button>
                    <span className="answer-sample">示例结果：离线整理，人工核对过</span>
                  </footer>
                </article>
              ) : (
                <p className="msg answer quiet">
                  示例模式只能回答预置的问题。接入你自己的 API key 后，文字、网页、文件、截图都可以一起丢进来。
                </p>
              )}
            </>
          )}
        </section>

        {isPreset && (
          <aside className="cx-graph" aria-label="关联图">
            <p className="cx-graph-head">关联图</p>
            <LinkGraph initial={GRAPH_NODES} edges={GRAPH_EDGES} />
            <p className="cx-graph-foot">拖动节点调整位置，双击修改文字。</p>
          </aside>
        )}
      </div>

      <form className="cx-composer" onSubmit={submit}>
        {files.length > 0 && (
          <ul className="cx-files">
            {files.map((f, i) => (
              <li key={i}>
                <span>{f.kind}</span>
                {f.name}
                <button type="button" aria-label={`移除 ${f.name}`} onClick={() => setFiles((all) => all.filter((_, j) => j !== i))}>
                  <Icon name="close" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <label htmlFor="cx-input" className="sr-only">
          输入
        </label>
        <textarea
          id="cx-input"
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              (e.currentTarget.form as HTMLFormElement).requestSubmit();
            }
          }}
          placeholder="把零散的知识、题目、方法丢进来"
        />
        <div className="cx-tools">
          <button type="button" className="btn quiet" onClick={() => fileRef.current?.click()}>
            文件
          </button>
          <button type="button" className="btn quiet" onClick={addLink}>
            网页
          </button>
          <button type="button" className="btn quiet" onClick={() => shotRef.current?.click()}>
            截图
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            onChange={(e) => setFiles((f) => [...f, ...[...(e.target.files ?? [])].map((x) => ({ kind: '文件' as const, name: x.name }))])}
          />
          <input
            ref={shotRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => setFiles((f) => [...f, ...[...(e.target.files ?? [])].map((x) => ({ kind: '截图' as const, name: x.name }))])}
          />
          <button type="submit" className="cx-send" aria-label="发送" disabled={!draft.trim() && !files.length}>
            <Icon name="send" />
          </button>
        </div>
      </form>
    </div>
  );
}
