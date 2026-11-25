import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useWorkspace } from '../../app/WorkspaceProvider';
import { openStore } from '../../store/open';
import type { Workspace, WorkspaceStore } from '../../store/types';
import { Icon } from '../../ui/Icon';
import { DEMO_WORKSPACE } from '../workspace/workspaceData';
import { loadMaps, mapWriter, MIND_PATH, type WorkspaceMaps } from '../atlas/maps';
import { attachViz, indexDoc, type MDoc } from '../atlas/mindDoc';
import { AttachViz } from './AttachViz';
import { LAB_HISTORY_PATH, labUid, loadLabHistory, saveLabHistory, turnKey, upsertTurn, type LabTurn } from './history';
import { ProjectionLab } from './ProjectionLab';
import { RUN_STATUS_LABEL, TOOLS, toolById, vizRun, type ToolRegistration, type VisualizationRun } from './tools';
import '../../styles/lab.css';

/**
 * 可视化实验室：对话气泡起手。指定工具就按工具返回，不指定就返回几种可视化。
 *
 * 与工作区打通（TASK_R2_LINKAGE L5）：
 * - 任意工作区都能进；两张预置实验随站发布，任何工作区都能打开；「正交投影」是示例工作区的题目；
 * - 可视化能「挂到主题上」（窗口脚注入口），写 `maps/mind.json` 前先预览，写完可撤销；
 * - 图谱主题经 `?viz=&node=` 回到这里，实验室按 VisualizationRun 如实标注结果来源。
 *
 * 结果是一整屏工作区：顶栏一条只留返回、来源标签、问句与右栏开关；昼夜跟页眉走；
 * 历史按钮像关联探索那样立在页面右边；会话历史存在工作区 `.vein/lab/`，与地址参数互为镜像。
 */

/**
 * 能实现这些可视化的主要工具，按学科分组。指定一个就按它返回；默认自动选择，可能返回几种。
 * 例：光合作用的全过程可由 Manim 或 Three.js 做动画；人体解剖与组装由 BioDigital Human、Z-Anatomy 一类三维模型实现。
 */
const TOOL_GROUPS: { field: string; tools: string[] }[] = [
  { field: '数学', tools: ['GeoGebra', 'Desmos', 'Manim', 'Mathematica'] },
  { field: '物理', tools: ['PhET', 'Matter.js', 'Falstad 电路', 'VPython'] },
  { field: '化学', tools: ['3Dmol.js', 'JSmol', 'ChemDoodle'] },
  { field: '生物与医学', tools: ['BioDigital Human', 'Z-Anatomy', 'Blender'] },
  { field: '计算与数据', tools: ['Matplotlib', 'Plotly', 'MATLAB', 'PyTorch', 'D3.js'] },
  { field: '三维与动画', tools: ['Three.js', 'WebGL'] },
];
const AUTO = '自动选择';

type Result = 'projection' | 'photosynthesis' | 'quadric-surfaces';

const PRESETS: { q: string; result: Result | null }[] = [
  { q: '为什么最近点就是正交投影？', result: 'projection' },
  { q: '光合作用的全过程', result: 'photosynthesis' },
  { q: '二次曲面的标准型与截线', result: 'quadric-surfaces' },
  { q: '单摆从小角度到大角度，周期怎么变', result: null },
];

/** 预置结果对应的注册表 id；正交投影是站内 React 实验，不在注册表里。 */
const VIZ_OF: Record<'photosynthesis' | 'quadric-surfaces', string> = {
  photosynthesis: 'viz.photosynthesis',
  'quadric-surfaces': 'viz.quadric-surfaces',
};
const PROJECTION_ID = 'lab.projection';

type WsLoad =
  | { kind: 'loading' }
  | { kind: 'auth' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; store: WorkspaceStore; maps: WorkspaceMaps };

function VizWindow({
  tool,
  contextNode,
  frameRef,
  onFrameLoad,
  onAttach,
  attachDisabled,
}: {
  tool: ToolRegistration;
  contextNode?: { text: string } | undefined;
  frameRef: (el: HTMLIFrameElement | null) => void;
  onFrameLoad: () => void;
  onAttach: () => void;
  attachDisabled: boolean;
}) {
  return (
    <section className="lab-results" aria-label="可视化结果">
      <article className="lab-window wide">
        <iframe
          className="lab-frame"
          src={`${tool.src}?embed=lab`}
          title={`${tool.name}（交互可视化）`}
          ref={frameRef}
          onLoad={onFrameLoad}
        />
        <footer className="lab-foot">
          <p className="lab-caption">
            {tool.summary}
            {contextNode && <> 这张图挂在导图主题「{contextNode.text || '中心主题'}」上。</>}
            <a className="lab-link lab-foot-open" href={tool.src} target="_blank" rel="noreferrer">
              在新窗口打开
            </a>
            <button type="button" className="lab-link lab-foot-attach" onClick={onAttach} disabled={attachDisabled} title={attachDisabled ? '工作区还没有读到导图' : '写入 maps/mind.json，可撤销'}>
              挂到主题上
            </button>
          </p>
          <span className="lab-caption">实验页随站发布、人工核对；接入模型后才会按你的问题实时生成。</span>
        </footer>
      </article>
    </section>
  );
}

export function LabPage() {
  const { ready: workspacesReady, error, workspace, replace } = useWorkspace();
  const current = workspace ?? DEMO_WORKSPACE;
  const [params, setParams] = useSearchParams();
  const [tool, setTool] = useState(AUTO);
  const [draft, setDraft] = useState('');
  const [ws, setWs] = useState<WsLoad>({ kind: 'loading' });
  const [attachFor, setAttachFor] = useState<ToolRegistration | null>(null);
  const [notice, setNotice] = useState<{ text: string; undo?: () => void } | null>(null);
  const [histStore, setHistStore] = useState<WorkspaceStore | null>(null);
  const [history, setHistory] = useState<LabTurn[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [rail, setRail] = useState({ supported: false, open: true });
  const historyRef = useRef<LabTurn[]>([]);
  const frameEl = useRef<HTMLIFrameElement | null>(null);
  const wsRef = useRef<Workspace>(current);
  wsRef.current = current;

  const load = useCallback(
    async (request: boolean) => {
      setWs({ kind: 'loading' });
      setHistStore(null);
      setHistory([]);
      historyRef.current = [];
      try {
        const opened = await openStore(wsRef.current, request);
        if (opened.status === 'auth') return setWs({ kind: 'auth' });
        if (opened.status === 'missing') return setWs({ kind: 'error', message: opened.message });
        // 会话历史不等讲义 / 导图读完，但必须等旧历史读回来再放行记录：
        // 否则记录 effect 拿着空列表先落盘，会把上一轮的会话覆盖掉
        const turns = await loadLabHistory(opened.store);
        historyRef.current = turns;
        setHistory(turns);
        setHistStore(opened.store);
        const maps = await loadMaps(opened.store, wsRef.current);
        setWs({ kind: 'ready', store: opened.store, maps });
      } catch (e) {
        setWs({ kind: 'error', message: (e as Error).message });
      }
    },
    [],
  );

  const wsId = current.id;
  useEffect(() => {
    void load(false);
    // 工作区变了才重读；写入后由本地状态更新，不重新拉取
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId]);

  // 地址参数就是会话状态：前进 / 后退 / 手改地址 / 历史条目，都从这里同步进页面
  const asked = params.get('q');
  const preset = PRESETS.find((p) => p.q === asked);
  const result = preset?.result ?? null;
  // 非示例工作区不套用线性代数的投影题；两张预置实验是通用页面，任何工作区都能看
  const presetList = current.origin === 'demo' ? PRESETS : PRESETS.filter((p) => p.result !== 'projection');
  const mind = ws.kind === 'ready' ? ws.maps.mind : null;
  const vizParam = toolById(params.get('viz'));
  const nodeParam = params.get('node');
  const contextNode = nodeParam && mind ? indexDoc(mind).byId.get(nodeParam) : undefined;
  const framedTool = vizParam ?? (result && result !== 'projection' ? TOOLS.find((t) => t.id === VIZ_OF[result]) : undefined);
  const run: VisualizationRun | null = framedTool
    ? vizRun(framedTool, contextNode ? { kind: 'node', id: contextNode.id, text: contextNode.text } : undefined)
    : null;
  const active = Boolean(asked || vizParam);
  const currentVizId = vizParam?.id ?? (result === 'projection' ? PROJECTION_ID : framedTool?.id ?? null);

  // 入口页与结果页是两屏：切换时回到页首，像打开一个新页面
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [active]);

  const persist = (next: LabTurn[]) => {
    historyRef.current = next;
    setHistory(next);
    if (!histStore) return;
    void saveLabHistory(histStore, next).catch((e) => setNotice({ text: `会话历史没存上：${(e as Error).message}` }));
  };

  // 问过什么、打开过哪张实验，都记进工作区的会话历史；同一条再打开只更新时间
  useEffect(() => {
    if (!histStore || !active) return;
    const q = asked ?? (contextNode ? `导图 · ${contextNode.text || '中心主题'}` : framedTool?.name ?? '');
    if (!q) return;
    const turn: LabTurn = {
      id: labUid(),
      q,
      viz: currentVizId,
      node: nodeParam ?? undefined,
      at: Date.now(),
      origin: asked && !result && !vizParam ? 'ask' : 'preset',
    };
    persist(upsertTurn(historyRef.current, turn));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asked, currentVizId, nodeParam, histStore]);

  // 实验页嵌入后顶栏由这里承担：右栏开关经 postMessage 遥控，状态由页内回报
  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      if (ev.source !== frameEl.current?.contentWindow) return;
      const m = ev.data as { source?: string; rail?: boolean | null };
      if (!m || m.source !== 'vein-viz') return;
      setRail({ supported: m.rail === true || m.rail === false, open: m.rail === true });
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);
  useEffect(() => {
    setRail({ supported: false, open: true });
  }, [framedTool?.id]);
  const pingFrame = () => frameEl.current?.contentWindow?.postMessage({ source: 'vein-lab', type: 'state' }, location.origin);
  const toggleRail = () => {
    setRail((r) => ({ ...r, open: !r.open }));
    frameEl.current?.contentWindow?.postMessage({ source: 'vein-lab', type: 'rail' }, location.origin);
  };

  const ask = (q: string) => {
    const text = q.trim();
    setDraft('');
    const next = new URLSearchParams(params);
    next.set('q', text);
    next.delete('viz');
    next.delete('node');
    setParams(next, { replace: true });
    setNotice(null);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (draft.trim()) ask(draft);
  };

  /** 结果是一整页：回到入口页时清掉地址参数，不留半截状态。 */
  const back = () => {
    const next = new URLSearchParams(params);
    next.delete('q');
    next.delete('viz');
    next.delete('node');
    setParams(next, { replace: true });
    setNotice(null);
  };

  const openTurn = (t: LabTurn) => {
    const next = new URLSearchParams(params);
    next.delete('q');
    next.delete('viz');
    next.delete('node');
    next.set('q', t.q);
    if (t.viz && t.viz !== PROJECTION_ID) next.set('viz', t.viz);
    if (t.node) next.set('node', t.node);
    setParams(next, { replace: true });
    setHistoryOpen(false);
    setNotice(null);
  };
  const removeTurn = (id: string) => {
    if (!histStore) return;
    persist(historyRef.current.filter((x) => x.id !== id));
  };

  /** 预览即这一屏：用户点名某个主题后，才写 maps/mind.json；保留 before 供撤销。 */
  const toggleAttach = async (nodeId: string, on: boolean) => {
    if (ws.kind !== 'ready' || !attachFor || !ws.maps.mind) return;
    const before = JSON.stringify(ws.maps.mind);
    const doc = JSON.parse(before) as MDoc;
    if (!attachViz(doc, nodeId, on ? attachFor.id : null)) {
      setAttachFor(null);
      return;
    }
    const label = indexDoc(doc).byId.get(nodeId)?.text || '中心主题';
    await mapWriter(ws.store, wsRef.current, MIND_PATH, replace)(JSON.stringify(doc));
    const snapshot = ws.maps;
    setWs({ ...ws, maps: { ...snapshot, mind: doc, fresh: false } });
    setAttachFor(null);
    setNotice({
      text: on ? `已把「${attachFor.name}」挂到「${label}」上` : `已取消「${label}」上的挂载`,
      undo: async () => {
        await mapWriter(ws.store, wsRef.current, MIND_PATH, replace)(before);
        setWs({ ...ws, maps: { ...snapshot, mind: JSON.parse(before) as MDoc, fresh: false } });
        setNotice(null);
      },
    });
  };

  if (!workspacesReady) return <div className="lab"><p role="status">正在读取工作区…</p></div>;

  const greeting =
    current.origin === 'demo' ? '你好。我们要 Visualize 些什么？' : `当前工作区 · ${current.name}。要 Visualize 些什么？`;
  const headText = vizParam
    ? contextNode
      ? `从导图主题「${contextNode.text || '中心主题'}」打开：${vizParam.name}`
      : `预置实验：${vizParam.name}`
    : asked;
  const barName = framedTool ? framedTool.name : result === 'projection' ? '正交投影' : '示例模式';
  const barTag = framedTool && run ? RUN_STATUS_LABEL[run.status] : result === 'projection' ? '可操作' : '示例';
  const pillText = contextNode ? headText : (framedTool?.question ?? asked ?? '');
  const currentKey = turnKey({ q: asked ?? (contextNode ? `导图 · ${contextNode.text || '中心主题'}` : framedTool?.name ?? ''), viz: currentVizId, node: nodeParam ?? undefined });

  const historyDrawer = historyOpen && (
    <aside className="lab-history" aria-label="会话历史">
      <p className="lab-history-head">
        会话历史 <span>存在这个工作区的 {LAB_HISTORY_PATH}</span>
      </p>
      {history.length === 0 && <p className="lab-caption">还没有会话：问一句，或从导图主题打开一张实验。</p>}
      <ul>
        {history.map((t) => (
          <li key={t.id} className={turnKey(t) === currentKey ? 'on' : ''}>
            <button type="button" onClick={() => openTurn(t)}>
              <strong>{t.q}</strong>
              <span>
                {t.viz === PROJECTION_ID ? '正交投影' : t.viz ? (toolById(t.viz)?.name ?? t.viz) : '无结果'}
                {t.node ? ' · 导图主题' : ''} · {new Date(t.at).toLocaleDateString('zh-CN')}
              </span>
            </button>
            <button type="button" className="lab-history-del" aria-label={`删除「${t.q}」`} onClick={() => removeTurn(t.id)}>
              <Icon name="close" />
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );

  return (
    <div className={active ? 'lab lab-full' : 'lab'}>
      {!active && (
        <>
      <button type="button" className="key small lab-history-btn" aria-expanded={historyOpen} onClick={() => setHistoryOpen((v) => !v)}>
        <Icon name="history" />
        历史{history.length ? ` ${history.length}` : ''}
      </button>
      <section className="lab-stage">
        <div className="lab-bubble">
          <span className="lab-mark" aria-hidden="true" />
          <p>{greeting}</p>
        </div>

        <form className="lab-composer" onSubmit={submit}>
          <label htmlFor="lab-input" className="sr-only">
            想看见什么
          </label>
          <input
            id="lab-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="例如：为什么最近点就是正交投影？"
            autoComplete="off"
          />
          <button type="submit" className="lab-send" aria-label="发送" disabled={!draft.trim()}>
            <Icon name="send" />
          </button>
        </form>

        <div className="lab-tools" role="group" aria-label="用什么工具实现">
          <button type="button" className="key small" aria-pressed={tool === AUTO} onClick={() => setTool(AUTO)}>
            {AUTO}
          </button>
          <dl>
            {TOOL_GROUPS.map((g) => (
              <div key={g.field}>
                <dt>{g.field}</dt>
                <dd>
                  {g.tools.map((t) => (
                    <button key={t} type="button" className="key small" aria-pressed={t === tool} onClick={() => setTool(t)}>
                      {t}
                    </button>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <ul className="lab-presets" aria-label="示例问题">
          {presetList.map((p) => (
            <li key={p.q}>
              <button type="button" className="lab-try" onClick={() => ask(p.q)}>
                {p.q}
                {p.result && <span>示例</span>}
              </button>
            </li>
          ))}
        </ul>
      </section>
        </>
      )}
      {ws.kind === 'auth' && (
        <p className="lab-note">
          这个本地文件夹需要一次读写授权。
          <button type="button" className="lab-link" onClick={() => void load(true)}>
            允许读写「{current.name}」
          </button>
        </p>
      )}
      {ws.kind === 'error' && <p className="lab-note" role="alert">工作区存储异常：{ws.message}</p>}
      {error && <p className="lab-note" role="alert">工作区存储异常：{error}</p>}

      {active && (
        <header className="lab-bar">
          <button type="button" className="key small lab-back" onClick={back}>
            <Icon name="chevron" className="icon lab-back-icon" />
            返回实验室
          </button>
          <h2 className="lab-bar-name">{barName}</h2>
          <span className="lab-tag" title={framedTool && run ? `结果来源：${RUN_STATUS_LABEL[run.status]}` : undefined}>
            {barTag}
          </span>
          {framedTool?.live && <span className="lab-tag muted">实时计算</span>}
          {framedTool?.modeTag && <span className="lab-tag muted mode">{framedTool.modeTag}</span>}
          <p className="lab-bar-ask" title={asked ?? headText ?? undefined}>
            {pillText}
          </p>
          <div className="lab-bar-end">
            {rail.supported && (
              <button
                type="button"
                className="key small lab-rail-btn"
                aria-expanded={rail.open}
                onClick={toggleRail}
                title="折叠后画布独占全宽，播放控制保留在画布内"
              >
                {rail.open ? '折叠右栏' : '展开右栏'}
              </button>
            )}
            <button type="button" className="key small lab-history-btn" aria-expanded={historyOpen} onClick={() => setHistoryOpen((v) => !v)}>
              <Icon name="history" />
              历史{history.length ? ` ${history.length}` : ''}
            </button>
          </div>
        </header>
      )}

      {framedTool && run && (
        <VizWindow
          tool={framedTool}
          contextNode={contextNode}
          frameRef={(el) => {
            frameEl.current = el;
          }}
          onFrameLoad={pingFrame}
          onAttach={() => setAttachFor(framedTool)}
          attachDisabled={ws.kind !== 'ready'}
        />
      )}

      {!vizParam && asked && result === 'projection' && (
        <section className="lab-results" aria-label="可视化结果">
          <article className="lab-window wide">
            <header>
              <h2>交互实验：拖动 b，再沿直线拖动 q</h2>
              <span className="lab-tag">可操作</span>
            </header>
            <ProjectionLab />
            <p className="lab-caption">
              q 走到哪里，|b − q| 都不小于 |b − p|；p 恰好是残差 r 与直线垂直（r · a = 0）的那一点。这就是「最近点 = 正交投影」。
            </p>
          </article>
          <article className="lab-window">
            <header>
              <h2>几何讲解（3B1B 式）</h2>
              <span className="lab-tag muted">计划中</span>
            </header>
            <ol className="lab-story">
              <li>一束平行光垂直照向直线，b 的影子落在 p</li>
              <li>把影子沿直线推开，b 到影子的距离只会变长</li>
              <li>距离最短的那一刻，连线恰好与直线垂直</li>
              <li>把直线换成平面、换成列空间，同一件事成立</li>
            </ol>
            <p className="lab-caption">接入后由 Manim 预渲染成动画，在这里播放。</p>
          </article>
          <article className="lab-window">
            <header>
              <h2>可调图像（GeoGebra）</h2>
              <span className="lab-tag muted">计划中</span>
            </header>
            <p className="lab-caption">
              三维里的列空间是一个平面：拖动 b、改 A 的两列，看投影与残差如何跟着变；A 的两列共线时，投影仍唯一，参数不再唯一。
            </p>
          </article>
        </section>
      )}

      {!vizParam && asked && !result && (
        <p className="lab-note">
          示例模式只准备了这几道题。
          <span className="lab-note-asks">
            {presetList.filter((p) => p.result).map((p) => (
              <button key={p.q} type="button" className="lab-link" onClick={() => ask(p.q)}>
                {p.q}
              </button>
            ))}
          </span>
          接入你自己的 API key 后，任何问题都会返回几种可视化。
        </p>
      )}

      {notice && (
        <p className="lab-notice" role="status">
          {notice.text}
          {notice.undo && (
            <button type="button" className="lab-link" onClick={() => void notice.undo?.()}>
              撤销
            </button>
          )}
          <button type="button" className="lab-link" onClick={() => setNotice(null)}>
            知道了
          </button>
        </p>
      )}

      {historyDrawer}

      {attachFor && ws.kind === 'ready' && (
        <AttachViz tool={attachFor} mind={ws.maps.mind} wsId={current.id} onToggle={toggleAttach} onClose={() => setAttachFor(null)} />
      )}
      {attachFor && ws.kind !== 'ready' && (
        <p className="lab-note" role="status">
          还没有读到这个工作区的导图，暂时不能挂载。
          <button type="button" className="lab-link" onClick={() => setAttachFor(null)}>
            知道了
          </button>
        </p>
      )}
    </div>
  );
}