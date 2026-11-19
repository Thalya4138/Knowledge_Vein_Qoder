import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icon, type IconName } from '../../ui/Icon';
import { AiDock, type Hit } from './AiDock';
import { canEdit, FileViewer, type LocateRequest } from './FileViewer';
import { localFolderSupported, openLocalFolder } from './localFolder';
import { DEMO_WORKSPACE, findFile, folderOf, type FileKind, type Workspace } from './workspaceData';
import '../../styles/workspace.css';

const KIND_ICON: Record<FileKind, IconName> = {
  lecture: 'doc',
  pdf: 'pdf',
  source: 'code',
  image: 'image',
  link: 'link',
  html: 'doc',
};

const DEFAULT_FILE = 'note-2-1';

/**
 * 学习工作台：工作区栏 | 文件栏 | 文件内容，AI 对话框悬浮在底部。
 * 工作区可以是内置示例，也可以是你电脑上的文件夹（读写直接发生在文件夹里）。
 * 打开的文件与视图写进地址（?file= &view=），刷新与分享都能回到原处。
 */
export function WorkspacePage() {
  const [params, setParams] = useSearchParams();
  const [spaces, setSpaces] = useState<Workspace[]>([DEMO_WORKSPACE]);
  const [wsId, setWsId] = useState(DEMO_WORKSPACE.id);
  const ws = spaces.find((w) => w.id === wsId) ?? DEMO_WORKSPACE;
  const fallback = ws.id === DEMO_WORKSPACE.id ? findFile(ws, DEFAULT_FILE) : ws.folders[0]?.files[0];
  const file = findFile(ws, params.get('file')) ?? fallback;
  const view = params.get('view') === 'source' ? 'source' : 'read';
  const folder = file ? folderOf(ws, file.id) : undefined;

  const [railOpen, setRailOpen] = useState(true);
  const [treeOpen, setTreeOpen] = useState(() => window.matchMedia('(min-width: 1100px)').matches);
  const [locate, setLocate] = useState<LocateRequest | null>(null);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => setEditing(false), [file?.id, view]);
  useEffect(() => {
    if (!status) return;
    const t = window.setTimeout(() => setStatus(null), 3200);
    return () => window.clearTimeout(t);
  }, [status]);

  const open = useCallback(
    (id: string, nextView: 'read' | 'source' = 'read') => {
      const next = new URLSearchParams();
      next.set('file', id);
      if (nextView === 'source') next.set('view', 'source');
      setParams(next, { replace: false });
      setLocate(null);
      if (!window.matchMedia('(min-width: 1100px)').matches) setTreeOpen(false);
    },
    [setParams],
  );

  const onLocate = (hit: Hit) => {
    if (ws.id !== DEMO_WORKSPACE.id) setWsId(DEMO_WORKSPACE.id);
    if (file?.id !== hit.fileId || view !== 'read') open(hit.fileId, 'read');
    setLocate({ heading: hit.heading, nonce: Date.now() });
  };

  const openFolder = async () => {
    const res = await openLocalFolder();
    if (!res) return;
    setSpaces((all) => [...all.filter((w) => w.id !== res.ws.id), res.ws]);
    setWsId(res.ws.id);
    setParams({}, { replace: true });
    setTreeOpen(true);
    const n = res.ws.folders.reduce((s, f) => s + f.files.length, 0);
    setStatus(`已打开「${res.ws.name}」：${n} 个文件${res.skipped ? `，另有 ${res.skipped} 个暂不支持的文件未列出` : ''}`);
  };

  return (
    <div className={`ws${railOpen ? '' : ' rail-closed'}${treeOpen ? '' : ' tree-closed'}`}>
      {railOpen ? (
        <nav className="ws-rail" aria-label="工作区">
          <ul>
            {spaces.map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  className={w.id === ws.id ? 'rail-item active' : 'rail-item'}
                  aria-current={w.id === ws.id}
                  onClick={() => {
                    setWsId(w.id);
                    setParams({}, { replace: true });
                  }}
                  title={w.local ? `本地文件夹：${w.name}` : w.name}
                >
                  <span className={w.local ? 'rail-glyph local' : 'rail-glyph'} aria-hidden="true">
                    {w.glyph}
                  </span>
                  <span className="rail-name">{w.name}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="rail-foot">
            <button
              type="button"
              className="rail-item new"
              onClick={openFolder}
              disabled={!localFolderSupported()}
              title={localFolderSupported() ? '把电脑上的一个文件夹作为工作区打开' : '需要 Chrome 或 Edge'}
            >
              <span className="rail-glyph" aria-hidden="true">
                <Icon name="plus" />
              </span>
              <span className="rail-name">打开本地文件夹</span>
            </button>
            <button type="button" className="collapse-btn" onClick={() => setRailOpen(false)} title="收起工作区栏">
              <Icon name="sidebar" />
              <span className="sr-only">收起工作区栏</span>
            </button>
          </div>
        </nav>
      ) : (
        <button type="button" className="ws-strip" onClick={() => setRailOpen(true)} title="展开工作区栏">
          <span className="rail-glyph small" aria-hidden="true">
            {ws.glyph}
          </span>
          <span className="sr-only">展开工作区栏</span>
        </button>
      )}

      {treeOpen ? (
        <nav className="ws-tree" aria-label={`${ws.name}的文件`}>
          <div className="tree-head">
            <p className="tree-title">{ws.name}</p>
            <button type="button" className="collapse-btn" onClick={() => setTreeOpen(false)} title="收起文件栏">
              <Icon name="sidebar" />
              <span className="sr-only">收起文件栏</span>
            </button>
          </div>
          {ws.folders.length === 0 && <p className="tree-empty">这个文件夹里没有可以打开的文件（Markdown、PDF、图片、HTML、JSON）。</p>}
          {ws.folders.map((f) => (
            <section key={f.id} className="tree-folder">
              <h2>{f.name}</h2>
              <ul>
                {f.files.map((x) => (
                  <li key={x.id}>
                    <button
                      type="button"
                      className={x.id === file?.id ? 'tree-file active' : 'tree-file'}
                      aria-current={x.id === file?.id ? 'page' : undefined}
                      onClick={() => open(x.id)}
                      title={x.path ?? x.name}
                    >
                      <Icon name={KIND_ICON[x.kind]} />
                      <span>{x.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>
      ) : (
        <button type="button" className="ws-strip" onClick={() => setTreeOpen(true)} title="展开文件栏">
          <Icon name="folder" />
          <span className="sr-only">展开文件栏</span>
        </button>
      )}

      <section className="ws-main" aria-label="文件内容">
        {file ? (
          <>
            <header className="ws-toolbar">
              <p className="crumbs">
                <span>{ws.name}</span>
                <Icon name="chevron" className="icon crumb-sep" />
                <span>{folder?.name}</span>
                <Icon name="chevron" className="icon crumb-sep" />
                <strong>{file.name}</strong>
              </p>
              {(file.kind === 'lecture' || (file.kind === 'source' && file.lang === 'markdown')) && (
                <div className="segmented" role="group" aria-label="讲义视图">
                  <button type="button" aria-pressed={view === 'read'} onClick={() => open(file.id, 'read')}>
                    阅读
                  </button>
                  <button type="button" aria-pressed={view === 'source'} onClick={() => open(file.id, 'source')}>
                    源文件
                  </button>
                </div>
              )}
              {canEdit(file) && (
                <button type="button" className={editing ? 'btn quiet on' : 'btn quiet'} aria-pressed={editing} onClick={() => setEditing((v) => !v)}>
                  <Icon name="edit" />
                  {editing ? '完成' : '编辑'}
                </button>
              )}
              {file.kind !== 'link' && !file.local && (
                <a className="btn quiet" href={view === 'source' && file.sourceUrl ? file.sourceUrl : file.url} target="_blank" rel="noreferrer">
                  新标签页打开
                </a>
              )}
            </header>
            <div className="ws-content">
              <FileViewer file={file} view={view} locate={locate} editing={editing} onStatus={setStatus} />
            </div>
          </>
        ) : (
          <p className="viewer-state">从左边选一个文件。</p>
        )}
        {status && (
          <p className="ws-status" role="status">
            {status}
          </p>
        )}
        <AiDock onLocate={onLocate} noteName={findFile(DEMO_WORKSPACE, DEFAULT_FILE)?.name ?? '讲义'} />
      </section>
    </div>
  );
}
