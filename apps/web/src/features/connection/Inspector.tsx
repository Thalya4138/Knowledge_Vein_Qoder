import { useEffect, useState } from 'react';
import { texToText } from '../../content/veinGraph';
import { EPI_NAME, EPISTEMICS, REL_NAME, REL_TYPES, STATUS_NAME, type Epistemic, type ExploreResult, type RelType, type XEdge, type XNode } from './explore';
import { Md } from './md';
import type { Sel } from './ArgGraph';

/**
 * 关联图下方的详情：点一条线，看它为什么成立、前提是什么、什么情形下不适用；
 * 然后决定：收进图谱（写进 graph.json，可撤销）/ 先放着 / 改一改 / 不认同（可写理由，追问时会告诉模型）。
 * 「我的连线」只表达我怎么记：理由选填，不进知识图谱，加入思维导图时变成「我的连线」。
 */

export interface Verdicts {
  accept: (e: XEdge) => void;
  unaccept: (e: XEdge) => void;
  setStatus: (e: XEdge, status: XEdge['status'], reason?: string) => void;
  update: (e: XEdge) => void;
  updateNode: (n: XNode) => void;
  removeNode: (n: XNode) => void;
  removeEdge: (e: XEdge) => void;
  askAbout: (n: XNode) => void;
}

const Src = ({ s }: { s: string }) => (/^https?:\/\//.test(s) ? <a href={s} target="_blank" rel="noreferrer">{s.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60)}</a> : <>{s}</>);

export function Inspector({ graph, sel, busy, v }: { graph: ExploreResult['graph']; sel: Sel; busy: boolean; v: Verdicts }) {
  const edge = sel?.kind === 'edge' ? graph.edges.find((e) => e.id === sel.id) : undefined;
  const node = sel?.kind === 'node' ? graph.nodes.find((n) => n.id === sel.id) : undefined;
  if (edge) return <EdgeCard key={edge.id} graph={graph} e={edge} busy={busy} v={v} />;
  if (node) return <NodeCard key={node.id} graph={graph} n={node} v={v} />;
  const all = graph.edges.filter((e) => !e.mine);
  const count = (s: XEdge['status']) => all.filter((e) => e.status === s).length;
  return (
    <div className="xinspect idle">
      <p>
        图上有 {all.length} 条关系{count('accepted') ? `，${count('accepted')} 条已收进图谱` : ''}
        {count('pending') ? `，${count('pending')} 条先放着` : ''}
        {count('rejected') ? `，${count('rejected')} 条你不认同` : ''}。
      </p>
      <p className="quiet">点一条线，看它为什么成立；认同的可以收进这个工作区的知识图谱。</p>
    </div>
  );
}

function EdgeCard({ graph, e, busy, v }: { graph: ExploreResult['graph']; e: XEdge; busy: boolean; v: Verdicts }) {
  const name = (id: string) => graph.nodes.find((n) => n.id === id)?.label ?? id;
  const [editing, setEditing] = useState(Boolean(e.mine && !e.label && !e.explanation));
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  useEffect(() => setRejecting(false), [e.id]);

  if (editing) return <EdgeForm e={e} name={name} onDone={(next) => (next && v.update(next), setEditing(false))} />;

  return (
    <div className="xinspect">
      <p className="xi-path">
        <Md inline text={name(e.from)} />
        <span aria-hidden="true">{e.mine ? '—' : '→'}</span>
        <Md inline text={name(e.to)} />
      </p>
      <p className="xi-kind">
        {e.mine ? (
          <span className="xi-tag mine">我的连线</span>
        ) : (
          <>
            <span className="xi-tag">{REL_NAME[e.type]}</span>
            {EPI_NAME[e.epistemic] !== REL_NAME[e.type] && <span className={`xi-tag epi-${e.epistemic}`}>{EPI_NAME[e.epistemic]}</span>}
            {e.track === 'C2' && <span className="xi-tag epi-analogy">借来的视角</span>}
            {e.status !== 'proposed' && <span className={`xi-tag st-${e.status}`}>{STATUS_NAME[e.status]}</span>}
          </>
        )}
      </p>
      {e.explanation ? <Md className="xi-why" text={e.explanation} /> : <p className="quiet">还没有写理由。</p>}
      {e.assumptions.length > 0 && (
        <div className="xi-block">
          <h4>前提</h4>
          <Md text={e.assumptions.join('；')} />
        </div>
      )}
      {e.boundary && (
        <div className="xi-block">
          <h4>不适用的情形</h4>
          <Md text={e.boundary} />
        </div>
      )}
      {e.sources?.length ? (
        <div className="xi-block">
          <h4>出处</h4>
          <ul>
            {e.sources.map((s) => (
              <li key={s}>
                <Src s={s} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {e.status === 'rejected' && e.reason && <p className="xi-reason">你的理由：{e.reason}</p>}

      {rejecting ? (
        <form
          className="xi-reject"
          onSubmit={(ev) => {
            ev.preventDefault();
            v.setStatus(e, 'rejected', reason.trim() || undefined);
            setRejecting(false);
          }}
        >
          <label htmlFor="xi-reason">哪里不对？（选填，追问时会告诉模型）</label>
          <input id="xi-reason" autoFocus value={reason} onChange={(x) => setReason(x.target.value)} placeholder="例如：这是类比，不是推广" />
          <div className="xi-actions">
            <button type="submit" className="key small">不认同</button>
            <button type="button" className="btn quiet" onClick={() => setRejecting(false)}>取消</button>
          </div>
        </form>
      ) : (
        <div className="xi-actions">
          {e.mine ? (
            <>
              <button type="button" className="key small" onClick={() => setEditing(true)}>写标签与理由</button>
              <button type="button" className="btn quiet" onClick={() => v.removeEdge(e)}>删除</button>
            </>
          ) : e.status === 'accepted' ? (
            <button type="button" className="key small" disabled={busy} onClick={() => v.unaccept(e)}>从图谱里撤回</button>
          ) : e.status === 'rejected' ? (
            <button type="button" className="key small" onClick={() => v.setStatus(e, 'proposed')}>改回认同</button>
          ) : (
            <>
              <button type="button" className="key small on" disabled={busy} onClick={() => v.accept(e)} title="写进这个工作区的知识图谱（graph.json），认知记忆图谱里会显示它">
                收进图谱
              </button>
              {e.status !== 'pending' && (
                <button type="button" className="key small" onClick={() => v.setStatus(e, 'pending')}>先放着</button>
              )}
              <button type="button" className="key small" onClick={() => setEditing(true)}>改一改</button>
              <button type="button" className="key small" onClick={() => setRejecting(true)}>不认同</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function EdgeForm({ e, name, onDone }: { e: XEdge; name: (id: string) => string; onDone: (e: XEdge | null) => void }) {
  const [label, setLabel] = useState(e.label);
  const [type, setType] = useState<RelType>(e.type);
  const [epi, setEpi] = useState<Epistemic>(e.epistemic);
  const [why, setWhy] = useState(e.explanation);
  const [when, setWhen] = useState(e.assumptions.join('\n'));
  const [bound, setBound] = useState(e.boundary ?? '');
  const assumptions = when.split('\n').map((s) => s.trim()).filter(Boolean);
  // 知识关系改完仍要说得清为什么、前提是什么；我的连线理由选填（ADR-0006）
  const problem = e.mine
    ? null
    : why.trim().length < 12
      ? '为什么成立，至少写一句完整的话（12 字以上）'
      : !assumptions.length
        ? '至少写一条前提'
        : (epi === 'analogy' || epi === 'hypothesis' || type === 'analogy-to') && !bound.trim()
          ? '类比要写清在哪里不适用'
          : null;
  return (
    <form
      className="xinspect xi-form"
      onSubmit={(ev) => {
        ev.preventDefault();
        if (problem) return;
        onDone({ ...e, label: label.trim().slice(0, 14), type, epistemic: e.mine ? 'user-personal' : epi, explanation: why.trim(), assumptions, boundary: bound.trim() || undefined, edited: !e.mine || e.edited });
      }}
    >
      <p className="xi-path">
        <span>{texToText(name(e.from))}</span>
        <span aria-hidden="true">{e.mine ? '—' : '→'}</span>
        <span>{texToText(name(e.to))}</span>
      </p>
      <label>
        线上的字（14 字以内，可用 $公式$）
        <input value={label} maxLength={40} onChange={(x) => setLabel(x.target.value)} />
      </label>
      {!e.mine && (
        <div className="xi-row">
          <label>
            关系
            <select value={type} onChange={(x) => setType(x.target.value as RelType)}>
              {REL_TYPES.map((t) => (
                <option key={t} value={t}>{REL_NAME[t]}</option>
              ))}
            </select>
          </label>
          <label>
            可信度
            <select value={epi} onChange={(x) => setEpi(x.target.value as Epistemic)}>
              {EPISTEMICS.filter((x) => x !== 'user-personal').map((t) => (
                <option key={t} value={t}>{EPI_NAME[t]}</option>
              ))}
            </select>
          </label>
        </div>
      )}
      <label>
        {e.mine ? '理由（选填）' : '为什么成立'}
        <textarea rows={3} value={why} onChange={(x) => setWhy(x.target.value)} />
      </label>
      {!e.mine && (
        <>
          <label>
            前提（一行一条）
            <textarea rows={2} value={when} onChange={(x) => setWhen(x.target.value)} />
          </label>
          <label>
            不适用的情形
            <textarea rows={2} value={bound} onChange={(x) => setBound(x.target.value)} />
          </label>
        </>
      )}
      {problem && <p className="xi-problem" role="status">{problem}</p>}
      <div className="xi-actions">
        <button type="submit" className="key small on" disabled={Boolean(problem)}>保存</button>
        <button type="button" className="btn quiet" onClick={() => onDone(null)}>取消</button>
      </div>
    </form>
  );
}

function NodeCard({ graph, n, v }: { graph: ExploreResult['graph']; n: XNode; v: Verdicts }) {
  const [label, setLabel] = useState(n.label);
  const links = graph.edges.filter((e) => e.from === n.id || e.to === n.id);
  return (
    <div className="xinspect">
      <form
        className="xi-node"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (label.trim()) v.updateNode({ ...n, label: label.trim() });
        }}
      >
        <label htmlFor="xi-label">节点文字（可用 $公式$）</label>
        <input id="xi-label" value={label} onChange={(x) => setLabel(x.target.value)} onBlur={() => label.trim() && label !== n.label && v.updateNode({ ...n, label: label.trim() })} />
      </form>
      <p className="quiet">{n.ref ? '它对应工作区知识图谱里已有的一个知识点。' : '工作区的知识图谱里还没有它；收进一条连到它的关系时会一并加进去。'}连着 {links.length} 条线。</p>
      <div className="xi-actions">
        <button type="button" className="key small" onClick={() => v.askAbout(n)}>围绕它追问</button>
        <button type="button" className="btn quiet" onClick={() => v.removeNode(n)}>删除节点</button>
      </div>
    </div>
  );
}
