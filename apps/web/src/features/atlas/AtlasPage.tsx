import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { demoGraph, demoKb } from '../../app/demo';
import { useWorkspace } from '../../app/WorkspaceProvider';
import { openStore } from '../../store/open';
import type { Workspace, WorkspaceStore } from '../../store/types';
import { AskBar } from '../../ui/AskBar';
import { MiniTerrain } from '../../ui/cover/Terrain';
import { Icon } from '../../ui/Icon';
import { loadMaps, mapWriter, MEMORY_PATH, MIND_PATH, savedLabel, type MemoryState, type WorkspaceMaps } from './maps';
import { MapGenerate } from './MapGenerate';
import { MindAssist } from './MindAssist';
import type { MindCanvas } from './mindCanvas';
import { MemoryMap } from './MemoryMap';
import { MindEditor } from './MindEditor';
import { indexDoc, normalizeDoc, seedDoc, type MDoc } from './mindDoc';
import '../../styles/atlas.css';

/**
 * 认知记忆图谱：选工作区 → 选图谱 → 画布。选择写进地址（?ws= &map=），可以直接分享到画布。
 * 每个工作区的导图与练习存在它自己的 maps/ 里（R2-L L3）；还没有导图的工作区先生成或从空白开始。
 */

const MAPS = [
  { id: 'mind', name: '思维导图', line: '像 WPS 一样用 Tab、Enter 编辑，公式用 LaTeX，改完自动保存。' },
  { id: 'memory', name: '个人记忆图谱', line: '从思维导图出发：收起、遮盖、挖空，考考自己。' },
] as const;

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

  if (!ready) return <div className="atlas-pick" role="status">正在读取工作区…</div>;

  if (!workspace) {
    return (
      <div className="atlas-pick">
        <h1 className="display">选一个工作区</h1>
        {error && <p role="alert">工作区存储异常：{error}</p>}
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
                    ? `${demoGraph.nodes.length} 个知识点，${demoGraph.relations.length} 条带理由的关系`
                    : `${w.folders.reduce((n, f) => n + f.files.length, 0)} 个文件 · ${w.origin === 'folder' ? '本地文件夹' : '浏览器工作区'}`}
                </span>
              </Link>
            </li>
          ))}
          <li>
            <Link className="pick-card disabled" to="/workspace" viewTransition>
              <span className="pick-glyph" aria-hidden="true">
                <Icon name="plus" />
              </span>
              <span className="pick-name">新建或打开工作区</span>
              <span className="pick-meta">去工作台新建空白工作区，或连接本地文件夹</span>
            </Link>
          </li>
        </ul>
      </div>
    );
  }

  return <WorkspaceAtlas key={workspace.id} workspace={workspace} mapId={params.get('map')} onWorkspace={replace} />;
}

function Crumbs({ workspace, map }: { workspace: Workspace; map?: string }) {
  return (
    <p className="crumb-back">
      <Link to="/atlas" viewTransition>
        工作区
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
  const map = MAPS.find((m) => m.id === mapId);
  const wsQuery = `?ws=${encodeURIComponent(workspace.id)}`;
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

  if (load.kind === 'loading') return <div className="atlas-pick" role="status">正在读取「{workspace.name}」的图谱…</div>;

  if (load.kind === 'auth' || load.kind === 'error') {
    return (
      <div className="atlas-pick">
        <Crumbs workspace={workspace} />
        {/* 这两句里有标题字体子集之外的字，用正文字体，免得一半标题体一半回落 */}
        <h1 className="gen-title">{load.kind === 'auth' ? '需要重新授权这个文件夹' : '没有读到这个工作区'}</h1>
        <p>
          {load.kind === 'auth'
            ? `导图存在你的文件夹里（${MIND_PATH}）。浏览器每次新开都要你点一次允许，才能读写这个文件夹。`
            : load.message}
        </p>
        <p>
          {load.kind === 'auth' ? (
            <button type="button" className="btn primary" onClick={() => void start(true)}>
              允许读写「{workspace.name}」
            </button>
          ) : (
            <Link className="btn primary" to={`/workspace${wsQuery}`} viewTransition>
              回工作台
            </Link>
          )}
        </p>
      </div>
    );
  }

  const { maps } = load;
  const mind = mindRef.current;

  if (!mind || !writers) {
    return (
      <div className="atlas-pick">
        <Crumbs workspace={workspace} />
        {/* 标题只用标题字体子集里有的字；工作区名是用户内容，放在面包屑里 */}
        <h1 className="display">这个工作区没有导图</h1>
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

  const count = indexDoc(mind).byId.size;

  if (!map) {
    return (
      <div className="atlas-pick">
        <Crumbs workspace={workspace} />
        <h1 className="display">选一张图</h1>
        <ul className="pick-grid">
          {MAPS.map((m) => (
            <li key={m.id}>
              <Link className="pick-card art" to={`${wsQuery}&map=${m.id}`} viewTransition>
                <MapSketch blank={m.id === 'memory'} />
                <span className="pick-name">{m.name}</span>
                <span className="pick-meta">{m.line}</span>
                <span className="pick-meta">
                  {count} 个主题 · 存在 {m.id === 'mind' ? MIND_PATH : MEMORY_PATH}
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
        <Crumbs workspace={workspace} map={map.name} />
        <div className="atlas-tools">
          {map.id === 'mind' && (
            <button
              type="button"
              className="btn quiet"
              onClick={() => setSyncTick((n) => n + 1)}
              title="工作区里的笔记改过之后，让 AI 对照最新的笔记更新这张图；先给你看改了什么，确认后才应用"
            >
              <Icon name="refresh" />
              按资料更新
            </button>
          )}
          <button type="button" className="btn quiet" onClick={toggleFull} aria-pressed={full} title={full ? '退出全屏（Esc）' : '全屏阅读与编辑'}>
            <Icon name={full ? 'shrink' : 'expand'} />
            {full ? '退出全屏' : '全屏'}
          </button>
          <div className="segmented" role="group" aria-label="切换图谱">
            {MAPS.map((m) => (
              <Link key={m.id} to={`${wsQuery}&map=${m.id}`} aria-current={m.id === map.id ? 'page' : undefined} replace>
                {m.name}
              </Link>
            ))}
          </div>
        </div>
      </header>
      {map.id === 'mind' ? (
        <MindEditor
          key={workspace.id}
          doc={mind}
          knowledge={maps.knowledge}
          persist={writers.mind}
          fresh={maps.fresh}
          savedLabel={savedLabel(workspace, MIND_PATH)}
          seed={workspace.origin === 'demo' ? seedDoc : undefined}
          onCanvas={(c) => (canvasRef.current = c)}
        />
      ) : (
        <MemoryMap
          key={workspace.id}
          doc={mind}
          knowledge={maps.knowledge}
          memory={memRef.current ?? maps.memory}
          persist={writers.memory}
          onError={onError}
        />
      )}
      {notice && (
        <p className="atlas-notice" role="status">
          {notice}
        </p>
      )}
      {map.id === 'mind' ? (
        <MindAssist canvas={() => canvasRef.current} store={load.store} graph={maps.graph} name={workspace.name} syncTick={syncTick} />
      ) : (
        <AskBar placeholder="让它帮你出题，或照你的想法新建一张图" />
      )}
    </div>
  );
}
