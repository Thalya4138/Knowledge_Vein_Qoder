import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { demoGraph, demoKb } from '../../app/demo';
import { exploreHref, exploreQuestion, lectureHref, type AnchoredNode } from '../../app/links';
import { useWorkspace } from '../../app/WorkspaceProvider';
import { openStore } from '../../store/open';
import type { Workspace, WorkspaceStore } from '../../store/types';
import { AskBar } from '../../ui/AskBar';
import { usePrefs, useT } from '../../ui/prefs';
import { MiniTerrain } from '../../ui/cover/Terrain';
import { Icon } from '../../ui/Icon';
import { loadMaps, mapWriter, MEMORY_PATH, MIND_PATH, savedLabel, type MemoryState, type WorkspaceMaps } from './maps';
import { MapGenerate } from './MapGenerate';
import { MindAssist } from './MindAssist';
import type { MindCanvas } from './mindCanvas';
import { MemoryMap } from './MemoryMap';
import { MindEditor } from './MindEditor';
import { indexDoc, normalizeDoc, seedDoc, type MDoc } from './mindDoc';
import { labHref, toolById } from '../lab/tools';
import '../../styles/atlas.css';

/**
 * 认知记忆图谱：选工作区 → 选图谱 → 画布。选择写进地址（?ws= &map=），可以直接分享到画布。
 * 每个工作区的导图与练习存在它自己的 maps/ 里（R2-L L3）；还没有导图的工作区先生成或从空白开始。
 */

const MAPS: { id: string; name: string; line: string; en: [string, string]; demoOnly?: boolean }[] = [
  { id: 'mind', name: '思维导图', line: '像 WPS 一样用 Tab、Enter 编辑，公式用 LaTeX，改完自动保存。', en: ['Mind map', 'Edit with Tab and Enter like an office mind-map tool; formulas in LaTeX; saved as you go.'] },
  { id: 'memory', name: '个人记忆图谱', line: '从思维导图出发：收起、遮盖、挖空，考考自己。', en: ['Memory map', 'Start from the mind map: fold, cover and blank out topics to test yourself.'] },
  { id: 'mechanics', name: '力学思维导图', line: '整张预置的力学概念网络：逐层展开，可缩放、可检索。', en: ['Mechanics map', 'A complete prebuilt concept network for mechanics: expand level by level, zoom and search.'], demoOnly: true },
];
const mapName = (m: (typeof MAPS)[number], en: boolean) => (en ? m.en[0] : m.name);
const mapLine = (m: (typeof MAPS)[number], en: boolean) => (en ? m.en[1] : m.line);

/** 力学导图是随站发布的静态页，不属于任何工作区的 maps/；只有示例工作区展示它。 */
const MECHANICS_SRC = '/visualizations/mechanics-mindmap.html';

/** 选图谱卡片上的小图：一棵横向分层的树；记忆图谱的几个叶子是挖空的框。 */
function MapSketch({ blank }: { blank: boolean }) {
  const leaves = [22, 50, 78, 106, 134];
  return (
    <svg className="map-sketch" viewBox="0 0 300 156" aria-hidden="true">
      <rect className="ms-root" x="10" y="66" width="62" height="24" rx="12" />
      {[40, 116].map((y, i) => (
        <g key={y}>
          <path className="ms-edge" d={`M72 78 C96 78 96 ${y} 120 ${y}`} />
          <rect className="ms-mid" x="120" y={y - 11} width="56" height="22" rx="6" />
          {leaves.slice(i * 2 + (i ? 1 : 0), i * 2 + (i ? 3 : 2) + (i ? 0 : 1)).map((ly, j) => (
            <g key={ly}>
              <path className="ms-edge" d={`M176 ${y} C198 ${y} 198 ${ly} 220 ${ly}`} />
              <rect className={blank && (i + j) % 2 === 0 ? 'ms-leaf blank' : 'ms-leaf'} x="220" y={ly - 8} width={64 - j * 8} height="16" rx="4" />
            </g>
          ))}
        </g>
      ))}
    </svg>
  );
}

export function AtlasPage() {
  const [params] = useSearchParams();
  const { spaces, ready, error, workspace, replace } = useWorkspace();
  const t = useT();

  if (!ready) return <div className="atlas-pick" role="status">{t('正在读取工作区…', 'Loading workspaces…')}</div>;

  if (!workspace) {
    return (
      <div className="atlas-pick">
        <h1 className="display">{t('选一个工作区', 'Choose a workspace')}</h1>
        {error && <p role="alert">{t('工作区存储异常：', 'Workspace storage error: ')}{error}</p>}
        <ul className="pick-grid">
          {spaces.map((w) => (
            <li key={w.id}>
              <Link className={w.origin === 'demo' ? 'pick-card art' : 'pick-card'} to={`?ws=${encodeURIComponent(w.id)}`} viewTransition>
                {w.origin === 'demo' && <MiniTerrain />}
                <span className="pick-glyph" aria-hidden="true">
                  {w.glyph}
                </span>
                <span className="pick-name">{w.origin === 'demo' ? demoKb.title : w.name}</span>
                <span className="pick-meta">
                  {w.origin === 'demo'
                    ? t(`${demoGraph.nodes.length} 个知识点，${demoGraph.relations.length} 条带理由的关系`, `${demoGraph.nodes.length} concepts, ${demoGraph.relations.length} relations with reasons`)
                    : `${w.folders.reduce((n, f) => n + f.files.length, 0)} ${t('个文件', 'files')} · ${w.origin === 'folder' ? t('本地文件夹', 'local folder') : t('浏览器工作区', 'browser workspace')}`}
                </span>
              </Link>
            </li>
          ))}
          <li>
            <Link className="pick-card disabled" to="/workspace" viewTransition>
              <span className="pick-glyph" aria-hidden="true">
                <Icon name="plus" />
              </span>
              <span className="pick-name">{t('新建或打开工作区', 'New or open a workspace')}</span>
              <span className="pick-meta">{t('去工作台新建空白工作区，或连接本地文件夹', 'Create a blank workspace in Study Desk, or connect a local folder')}</span>
            </Link>
          </li>
        </ul>
      </div>
    );
  }

  return <WorkspaceAtlas key={workspace.id} workspace={workspace} mapId={params.get('map')} onWorkspace={replace} />;
}

function Crumbs({ workspace, map }: { workspace: Workspace; map?: string }) {
  const t = useT();
  return (
    <p className="crumb-back">
      <Link to="/atlas" viewTransition>
        {t('工作区', 'Workspaces')}
      </Link>
      <Icon name="chevron" className="icon crumb-sep" />
      {map ? (
        <>
          <Link to={`?ws=${encodeURIComponent(workspace.id)}`} viewTransition>
            {workspace.name}
          </Link>
          <Icon name="chevron" className="icon crumb-sep" />
          <strong>{map}</strong>
        </>
      ) : (
        workspace.name
      )}
    </p>
  );
}

type Load =
  | { kind: 'loading' }
  | { kind: 'auth' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; store: WorkspaceStore; maps: WorkspaceMaps };

/** 一个工作区的图谱：读它的 maps/，思维导图与记忆图谱共用同一份导图。 */
function WorkspaceAtlas({ workspace, mapId, onWorkspace }: { workspace: Workspace; mapId: string | null; onWorkspace: (w: Workspace) => void }) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [notice, setNotice] = useState<string | null>(null);
  const t = useT();
  const en = usePrefs().lang === 'en';
  const mapCards = MAPS.filter((m) => !m.demoOnly || workspace.origin === 'demo');
  const map = mapCards.find((m) => m.id === mapId);
  const wsQuery = `?ws=${encodeURIComponent(workspace.id)}`;
  const [params] = useSearchParams();
  const focus = params.get('focus');
  // 画布就地修改导图；切到记忆图谱时要拿最新的那一份，所以记下「最近写出的」
  const mindRef = useRef<MDoc | null>(null);
  const memRef = useRef<MemoryState | null>(null);
  // 浏览器工作区写 maps/ 后文件栏会变，始终用最新的工作区对象
  const wsRef = useRef(workspace);
  wsRef.current = workspace;
  const canvasRef = useRef<MindCanvas | null>(null);
  const [syncTick, setSyncTick] = useState(0);
  // 全屏阅读 / 编辑：优先用浏览器全屏；浏览器不给时退回铺满窗口
  const frameRef = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  useEffect(() => {
    const on = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  useEffect(() => {
    // 画板尺寸变了，重新放进窗口
    const t = window.setTimeout(() => canvasRef.current?.fit(), 120);
    return () => window.clearTimeout(t);
  }, [full]);
  useEffect(() => {
    if (!full || document.fullscreenElement) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFull(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [full]);
  const toggleFull = () => {
    if (document.fullscreenElement) return void document.exitFullscreen();
    if (full) return setFull(false);
    const el = frameRef.current;
    if (el?.requestFullscreen) el.requestFullscreen().catch(() => setFull(true));
    else setFull(true);
  };

  const start = useCallback(async (request: boolean) => {
    try {
      const opened = await openStore(wsRef.current, request);
      if (opened.status === 'auth') return setLoad({ kind: 'auth' });
      if (opened.status === 'missing') return setLoad({ kind: 'error', message: opened.message });
      const maps = await loadMaps(opened.store, wsRef.current);
      mindRef.current = maps.mind;
      memRef.current = maps.memory;
      setLoad({ kind: 'ready', store: opened.store, maps });
    } catch (e) {
      setLoad({ kind: 'error', message: (e as Error).message });
    }
  }, []);

  useEffect(() => {
    void start(false);
  }, [start]);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 3600);
    return () => window.clearTimeout(t);
  }, [notice]);

  const store = load.kind === 'ready' ? load.store : null;
  const writers = useMemo(() => {
    if (!store) return null;
    const track = (w: Workspace) => {
      wsRef.current = w;
      onWorkspace(w);
    };
    const mind = mapWriter(store, wsRef.current, MIND_PATH, track);
    const memory = mapWriter(store, wsRef.current, MEMORY_PATH, track);
    return {
      mind: async (json: string) => {
        mindRef.current = normalizeDoc(JSON.parse(json)) ?? mindRef.current;
        await mind(json);
      },
      memory: async (json: string) => {
        memRef.current = JSON.parse(json) as MemoryState;
        await memory(json);
      },
    };
  }, [store, onWorkspace]);
  const onError = useCallback((msg: string) => setNotice(msg), []);

  if (load.kind === 'loading') return <div className="atlas-pick" role="status">{t(`正在读取「${workspace.name}」的图谱…`, `Loading maps for “${workspace.name}”…`)}</div>;

  if (load.kind === 'auth' || load.kind === 'error') {
    return (
      <div className="atlas-pick">
        <Crumbs workspace={workspace} />
        {/* 这两句里有标题字体子集之外的字，用正文字体，免得一半标题体一半回落 */}
        <h1 className="gen-title">{load.kind === 'auth' ? t('需要重新授权这个文件夹', 'This folder needs permission again') : t('没有读到这个工作区', 'Could not read this workspace')}</h1>
        <p>
          {load.kind === 'auth'
            ? t(`导图存在你的文件夹里（${MIND_PATH}）。浏览器每次新开都要你点一次允许，才能读写这个文件夹。`, `Maps live in your folder (${MIND_PATH}). Each new browser session needs one click to allow reading and writing it.`)
            : load.message}
        </p>
        <p>
          {load.kind === 'auth' ? (
            <button type="button" className="btn primary" onClick={() => void start(true)}>
              {t(`允许读写「${workspace.name}」`, `Allow access to “${workspace.name}”`)}
            </button>
          ) : (
            <Link className="btn primary" to={`/workspace${wsQuery}`} viewTransition>
              {t('回工作台', 'Back to Study Desk')}
            </Link>
          )}
        </p>
      </div>
    );
  }

  const { maps } = load;
  const mind = mindRef.current;
  const mechanics = map?.id === 'mechanics';

  if (!mechanics && (!mind || !writers)) {
    return (
      <div className="atlas-pick">
        <Crumbs workspace={workspace} />
        {/* 标题只用标题字体子集里有的字；工作区名是用户内容，放在面包屑里 */}
        <h1 className="display">{t('这个工作区没有导图', 'This workspace has no map yet')}</h1>
        <MapGenerate
          name={workspace.name}
          store={load.store}
          graph={maps.graph}
          writeLabel={workspace.origin === 'folder' ? `文件夹的 ${MIND_PATH}` : MIND_PATH}
          onAccept={async (doc) => {
            await writers!.mind(JSON.stringify(doc));
            setLoad({ kind: 'ready', store: load.store, maps: { ...maps, mind: doc, fresh: false } });
            setNotice(`已写入 ${MIND_PATH}`);
          }}
        />
      </div>
    );
  }

  const count = mind ? indexDoc(mind).byId.size : 0;

  if (!map) {
    return (
      <div className="atlas-pick">
        <Crumbs workspace={workspace} />
        <h1 className="display">{t('选一张图', 'Choose a map')}</h1>
        <ul className="pick-grid">
          {mapCards.map((m) => (
            <li key={m.id}>
              <Link className="pick-card art" to={`${wsQuery}&map=${m.id}`} viewTransition>
                <MapSketch blank={m.id === 'memory'} />
                <span className="pick-name">{mapName(m, en)}</span>
                <span className="pick-meta">{mapLine(m, en)}</span>
                <span className="pick-meta">
                  {m.id === 'mechanics'
                    ? t('预置示例 · 整图可交互', 'Prebuilt sample · fully interactive')
                    : t(`${count} 个主题 · 存在 ${m.id === 'mind' ? MIND_PATH : MEMORY_PATH}`, `${count} topics · saved in ${m.id === 'mind' ? MIND_PATH : MEMORY_PATH}`)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {notice && <p role="status">{notice}</p>}
      </div>
    );
  }

  return (
    <div className={full ? 'atlas-canvas full' : 'atlas-canvas'} ref={frameRef}>
      <header className="atlas-head">
        <Crumbs workspace={workspace} map={mapName(map, en)} />
        <div className="atlas-tools">
          {map.id === 'mind' && (
            <button
              type="button"
              className="btn quiet"
              onClick={() => setSyncTick((n) => n + 1)}
              title={t('工作区里的笔记改过之后，让 AI 对照最新的笔记更新这张图；先给你看改了什么，确认后才应用', 'After your notes change, let AI update this map against them — you see the diff first and apply only what you accept')}
            >
              <Icon name="refresh" />
              {t('按资料更新', 'Update from notes')}
            </button>
          )}
          <button type="button" className="btn quiet" onClick={toggleFull} aria-pressed={full} title={full ? t('退出全屏（Esc）', 'Exit full screen (Esc)') : t('全屏阅读与编辑', 'Read and edit full screen')}>
            <Icon name={full ? 'shrink' : 'expand'} />
            {full ? t('退出全屏', 'Exit full screen') : t('全屏', 'Full screen')}
          </button>
          <div className="segmented" role="group" aria-label={t('切换图谱', 'Switch map')}>
            {mapCards.map((m) => (
              <Link key={m.id} to={`${wsQuery}&map=${m.id}`} aria-current={m.id === map.id ? 'page' : undefined} replace>
                {mapName(m, en)}
              </Link>
            ))}
          </div>
        </div>
      </header>
      {mechanics ? (
        <div className="atlas-embed">
          <iframe className="atlas-embed-frame" src={MECHANICS_SRC} title="力学思维导图（示例）" />
          <p className="atlas-embed-note">
            这是随站发布的整张力学导图示例，不是从当前工作区生成的。
            <a href={MECHANICS_SRC} target="_blank" rel="noreferrer">
              在新窗口打开
            </a>
          </p>
        </div>
      ) : map.id === 'mind' ? (
        <MindEditor
          key={workspace.id}
          doc={mind!}
          knowledge={maps.knowledge}
          persist={writers!.mind}
          fresh={maps.fresh}
          savedLabel={savedLabel(workspace, MIND_PATH)}
          seed={workspace.origin === 'demo' ? seedDoc : undefined}
          vizOf={(id, nodeId) => {
            const exp = toolById(id);
            return exp ? { name: exp.name, href: labHref({ ws: workspace.id, viz: id, node: nodeId }) } : null;
          }}
          goOf={(topic) => {
            const node = topic.ref ? (maps.graph?.nodes as AnchoredNode[] | undefined)?.find((x) => x.id === topic.ref) : undefined;
            const lecture = lectureHref(workspace, node?.noteAnchor);
            const out = [];
            if (lecture) out.push({ label: t('打开讲义对应处', 'Open in the notes'), href: lecture, hint: t('在学习工作台打开讲义，定位到讲这个知识点的那一段', 'Open the lecture in Study Desk at the passage about this concept') });
            out.push({
              label: t('拿去关联探索', 'Explore connections'),
              href: exploreHref(workspace.id, exploreQuestion(topic.text || node?.title || '中心主题', topic.neighbors)),
              hint: t('带着这个主题和图谱里与它相连的知识去关联探索；问题只预填，发不发由你决定', 'Take this topic and its linked concepts to the Connection Explorer; the question is prefilled, sending is up to you'),
            });
            return out;
          }}
          focus={focus}
          onCanvas={(c) => (canvasRef.current = c)}
        />
      ) : (
        <MemoryMap
          key={workspace.id}
          doc={mind!}
          knowledge={maps.knowledge}
          memory={memRef.current ?? maps.memory}
          persist={writers!.memory}
          onError={onError}
        />
      )}
      {notice && (
        <p className="atlas-notice" role="status">
          {notice}
        </p>
      )}
      {mechanics ? null : map.id === 'mind' ? (
        <MindAssist canvas={() => canvasRef.current} store={load.store} graph={maps.graph} name={workspace.name} syncTick={syncTick} />
      ) : (
        <AskBar placeholder={t('让它帮你出题，或照你的想法新建一张图', 'Ask it to quiz you, or to draft a new map your way')} />
      )}
    </div>
  );
}
