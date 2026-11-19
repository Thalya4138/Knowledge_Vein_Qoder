import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createBrowserNote, createBrowserWorkspace } from '../../store/browser';
import { useWorkspace } from '../../app/WorkspaceProvider';
import { unregisterWorkspace } from '../../store/registry';
import type { Workspace } from '../../store/types';
import { Icon, type IconName } from '../../ui/Icon';
import { AiDock, type Hit } from './AiDock';
import { canEdit, FileViewer, type LocateRequest } from './FileViewer';
import { forgetLocalFolder, localFolderSupported, openLocalFolder, restoreLocalFolder } from './localFolder';
import { DEMO_WORKSPACE, findFile, folderOf, type FileKind } from './workspaceData';
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
  const { spaces, ready, error, reload, replace, workspace } = useWorkspace();
  const ws = workspace ?? DEMO_WORKSPACE;
  const fallback = ws.id === DEMO_WORKSPACE.id ? findFile(ws, DEFAULT_FILE) : ws.folders[0]?.files[0];
  const file = findFile(ws, params.get('file')) ?? fallback;
  const view = params.get('view') === 'source' ? 'source' : 'read';
  const folder = file ? folderOf(ws, file.id) : undefined;

  const [railOpen, setRailOpen] = useState(true);
  const [treeOpen, setTreeOpen] = useState(() => window.matchMedia('(min-width: 1100px)').matches);
  const [locate, setLocate] = useState<LocateRequest | null>(null);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [folderReady, setFolderReady] = useState(false);

  useEffect(() => setEditing(false), [file?.id, view]);
  useEffect(() => {
    if (!status) return;
    const t = window.setTimeout(() => setStatus(null), 3200);
    return () => window.clearTimeout(t);
  }, [status]);

  useEffect(() => {
    setNeedsAuth(false);
    setFolderReady(ws.origin !== 'folder');
    if (!ready || ws.origin !== 'folder') return;
    let alive = true;
    restoreLocalFolder(ws, false)
      .then((res) => {
        if (!alive) return;
        if (!res) {
          setNeedsAuth(true);
          setStatus('没有找到这个文件夹的句柄，请重新打开文件夹。');
          return;
        }
        if (res.permission === 'granted') {
          replace(res.ws);
          setFolderReady(true);
        } else {
          setNeedsAuth(true);
        }
      })
      .catch((e: Error) => {
        if (!alive) return;
        setNeedsAuth(true);
        setStatus(`无法恢复本地工作区：${e.message}`);
      });
    return () => {
      alive = false;
    };
  }, [ready, ws.id, ws.origin, replace]);

  const open = useCallback(
    (id: string, nextView: 'read' | 'source' = 'read') => {
      const next = new URLSearchParams(params);
      next.set('ws', ws.id);
      next.set('file', id);
      if (nextView === 'source') next.set('view', 'source');
      else next.delete('view');
      next.delete('open');
      setParams(next, { replace: false });
      setLocate(null);
      if (!window.matchMedia('(min-width: 1100px)').matches) setTreeOpen(false);
    },
    [params, setParams, ws.id],
  );

  const authorize = async (workspace: Workspace) => {
    try {
      const res = await restoreLocalFolder(workspace, true);
      if (!res) {
        setStatus('没有找到这个文件夹的句柄，请重新打开文件夹。');
        return;
      }
      replace(res.ws);
      const granted = res.permission === 'granted';
      setFolderReady(granted);
      setNeedsAuth(!granted);
      setStatus(granted ? `已重新连接「${res.ws.name}」` : '浏览器仍未授权；请在浏览器设置里允许访问这个文件夹。');
    } catch (e) {
      setStatus(`授权未完成：${(e as Error).message}`);
    }
  };

  const selectWorkspace = (workspace: Workspace) => {
    setParams({ ws: workspace.id }, { replace: true });
    setTreeOpen(true);
    setLocate(null);
  };

  const onLocate = (hit: Hit) => {
    if (ws.id !== DEMO_WORKSPACE.id) {
      const next = new URLSearchParams(params);
      next.set('ws', DEMO_WORKSPACE.id);
      next.set('file', hit.fileId);
      next.delete('view');
      next.delete('open');
      setParams(next);
    } else if (file?.id !== hit.fileId || view !== 'read') {
      open(hit.fileId, 'read');
    }
    setLocate({ heading: hit.heading, nonce: Date.now() });
  };

  const openFolder = async () => {
    try {
      const res = await openLocalFolder();
      if (!res) return;
      await reload();
      setParams({ ws: res.ws.id }, { replace: true });
      setNeedsAuth(false);
      setFolderReady(true);
      setTreeOpen(true);
      const n = res.ws.folders.reduce((s, f) => s + f.files.length, 0);
      setStatus(`已打开「${res.ws.name}」：${n} 个文件${res.skipped ? `，另有 ${res.skipped} 个暂不支持的文件未列出` : ''}`);
    } catch (e) {
      setStatus(`没有打开文件夹：${(e as Error).message}`);
    }
  };

  const newWorkspace = async () => {
    const name = window.prompt('新工作区叫什么名字？', '我的课程');
    if (name === null) return;
    try {
      const created = await createBrowserWorkspace(name);
      await reload();
      setParams({ ws: created.id }, { replace: true });
      setTreeOpen(true);
      setStatus(`已创建「${created.name}」，文件保存在这台电脑的浏览器里`);
    } catch (e) {
      setStatus(`没有创建：${(e as Error).message}`);
    }
  };

  const newNote = async () => {
    const name = window.prompt('笔记文件名', '未命名笔记.md');
    if (name === null) return;
    try {
      const created = await createBrowserNote(ws, name);
      await reload();
      setParams({ ws: ws.id, file: created.file.id }, { replace: true });
      setStatus(`已创建 ${created.file.path}`);
    } catch (e) {
      setStatus(`没有创建笔记：${(e as Error).message}`);
    }
  };

  const removeWorkspace = async (workspace: Workspace) => {
    const message = workspace.origin === 'folder'
      ? `从知脉移除「${workspace.name}」？\n\n只会断开本站引用，不会删除你磁盘上的任何文件。`
      : `移除浏览器工作区「${workspace.name}」？\n\n其中的浏览器副本也会从本站存储删除；此操作不影响你的其他文件。`;
    if (!window.confirm(message)) return;
    try {
      await unregisterWorkspace(workspace.id);
      if (workspace.origin === 'folder') forgetLocalFolder(workspace.id);
      if (ws.id === workspace.id) setParams({ ws: DEMO_WORKSPACE.id }, { replace: true });
      await reload();
      setNeedsAuth(false);
      setStatus(`已移除「${workspace.name}」${workspace.origin === 'folder' ? '，磁盘文件未改动' : ''}`);
    } catch (e) {
      setStatus(`没有移除：${(e as Error).message}`);
    }
  };

  return (
    <div className={`ws${railOpen ? '' : ' rail-closed'}${treeOpen ? '' : ' tree-closed'}`}>
      {railOpen ? (
        <nav className="ws-rail" aria-label="工作区">
          <ul>
            {spaces.map((w) => (
              <li className="rail-workspace" key={w.id}>
                <button
                  type="button"
                  className={w.id === ws.id ? 'rail-item active' : 'rail-item'}
                  aria-current={w.id === ws.id ? 'page' : undefined}
                  onClick={() => selectWorkspace(w)}
                  title={w.origin === 'folder' ? `本地文件夹：${w.name}` : w.origin === 'browser' ? `浏览器工作区：${w.name}` : w.name}
                >
                  <span className={w.origin === 'folder' ? 'rail-glyph local' : 'rail-glyph'} aria-hidden="true">
                    {w.glyph}
                  </span>
                  <span className="rail-name">{w.name}</span>
                </button>
                {w.origin !== 'demo' && (
                  <button
                    type="button"
                    className="rail-remove"
                    onClick={() => void removeWorkspace(w)}
                    aria-label={`移除工作区「${w.name}」`}
                    title={w.origin === 'folder' ? '只断开本站引用，不删磁盘文件' : '移除这个浏览器工作区'}
                  >
                    <Icon name="close" />
                  </button>
                )}
              </li>
            ))}
            <li>
              <button type="button" className="rail-item new" onClick={() => void newWorkspace()}>
                <span className="rail-glyph" aria-hidden="true">
                  <Icon name="doc" />
                </span>
                <span className="rail-name">新建空白工作区</span>
              </button>
            </li>
          </ul>
          <div className="rail-foot">
            <button
              type="button"
              className="rail-item new"
              onClick={() => void openFolder()}
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
          {needsAuth && ws.origin === 'folder' && (
            <button type="button" className="btn quiet tree-auth" onClick={() => void authorize(ws)}>
              重新授权本地文件夹
            </button>
          )}
          {ws.folders.length === 0 && (
            <p className="tree-empty">
              {ws.origin === 'browser' ? '这是空白工作区，可以从一份 Markdown 笔记开始。' : '这个文件夹里没有可以打开的文件（Markdown、PDF、图片、HTML、JSON）。'}
            </p>
          )}
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
        {ws.origin === 'folder' && !folderReady ? (
          <div className="viewer-state viewer-empty">
            <p>{needsAuth ? '需要重新授权这个本地文件夹，才能读取文件。' : '正在重新连接本地文件夹…'}</p>
            {needsAuth && (
              <button type="button" className="btn primary" onClick={() => void authorize(ws)}>
                重新授权本地文件夹
              </button>
            )}
          </div>
        ) : file ? (
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
              {file.kind !== 'link' && !file.local && !file.browser && (
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
          <div className="viewer-state viewer-empty">
            <p>{ws.origin === 'browser' ? '这个工作区还没有笔记。' : '从左边选一个文件。'}</p>
            {ws.origin === 'browser' && (
              <button type="button" className="btn primary" onClick={() => void newNote()}>
                新建 Markdown 笔记
              </button>
            )}
          </div>
        )}
        {status && (
          <p className="ws-status" role="status">
            {status}
          </p>
        )}
        {error && <p className="ws-status" role="alert">工作区存储异常：{error}</p>}
        <AiDock onLocate={onLocate} noteName={findFile(DEMO_WORKSPACE, DEFAULT_FILE)?.name ?? '讲义'} />
      </section>
    </div>
  );
}
