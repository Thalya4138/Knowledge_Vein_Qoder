import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useT } from '../../ui/prefs';
import { createBrowserNote, createBrowserWorkspace, importBrowserFolder } from '../../store/browser';
import { useWorkspace } from '../../app/WorkspaceProvider';
import { renameWorkspace, unregisterWorkspace } from '../../store/registry';
import type { Workspace } from '../../store/types';
import { Icon, type IconName } from '../../ui/Icon';
import { AiDock, type Hit } from './AiDock';
import { canEdit, FileViewer, type LocateRequest } from './FileViewer';
import { FolderAlign } from './FolderAlign';
import { GithubSync } from './GithubSync';
import { forgetLocalFolder, localFolderSupported, openLocalFolder, restoreLocalFolder } from './localFolder';
import { DEMO_WORKSPACE, findFile, folderOf, type FileKind } from './workspaceData';
import '../../styles/workspace.css';
import { FileTree } from './FileTree';

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
  const tr = useT();
  const ws = workspace ?? DEMO_WORKSPACE;
  // 默认打开第一份 Markdown 笔记；maps/ 下的导图数据是给图谱读的，不当作开门第一页
  const allFiles = useMemo(() => ws.folders.flatMap((f) => f.files), [ws]);
  const fallback = ws.id === DEMO_WORKSPACE.id
    ? findFile(ws, DEFAULT_FILE)
    : allFiles.find((x) => x.lang === 'markdown') ?? allFiles.find((x) => !x.path?.startsWith('maps/')) ?? allFiles[0];
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
  const importInput = useRef<HTMLInputElement>(null);
  const [alignOpen, setAlignOpen] = useState(false);
  const [ghOpen, setGhOpen] = useState(false);
  const [ghImportOpen, setGhImportOpen] = useState(false);

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
    if (hit.demo && ws.id !== DEMO_WORKSPACE.id) {
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
      setStatus(`已打开「${res.ws.name}」：${n} 个文件${res.skippedNote ? `。${res.skippedNote}` : ''}`);
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

  const rename = async (workspace: Workspace) => {
    const name = window.prompt(
      workspace.origin === 'folder' ? '新名字（只改知脉里显示的名字，硬盘上的文件夹名不变）' : '新名字',
      workspace.name,
    );
    if (name === null || name.trim() === workspace.name) return;
    try {
      const renamed = await renameWorkspace(workspace, name);
      replace(renamed);
      setStatus(`已改名为「${renamed.name}」`);
    } catch (e) {
      setStatus(`没有改名：${(e as Error).message}`);
    }
  };

  /** 导入文件夹：任何浏览器都能用，把文件复制成一个浏览器工作区（改动不写回硬盘）。 */
  const importFolder = async (e: ChangeEvent<HTMLInputElement>) => {
    const picked = [...(e.target.files ?? [])];
    e.target.value = '';
    if (!picked.length) return;
    const top = picked[0]!.webkitRelativePath.split('/')[0] || '导入的文件夹';
    const files = picked.map((f) => ({ path: f.webkitRelativePath.split('/').slice(1).join('/') || f.name, data: f as Blob }));
    try {
      const res = await importBrowserFolder(top, files);
      await reload();
      setParams({ ws: res.workspace.id }, { replace: true });
      setTreeOpen(true);
      setStatus(`已导入「${top}」：${res.count} 个文件复制到浏览器里${res.skipped ? `，${res.skipped} 个暂不支持的文件没有导入` : ''}；改动不会写回原文件夹`);
    } catch (err) {
      setStatus(`没有导入：${(err as Error).message}`);
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
        <nav className="ws-rail" aria-label={tr('工作区', 'Workspaces')}>
          <ul>
            {spaces.map((w) => (
              <li className="rail-workspace" key={w.id}>
                <button
                  type="button"
                  className={w.id === ws.id ? 'rail-item active' : 'rail-item'}
                  aria-current={w.id === ws.id ? 'page' : undefined}
                  onClick={() => selectWorkspace(w)}
                  title={w.origin === 'folder' ? tr(`本地文件夹：${w.name}`, `Local folder: ${w.name}`) : w.origin === 'browser' ? tr(`浏览器工作区：${w.name}`, `Browser workspace: ${w.name}`) : w.name}
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
                    onClick={() => void rename(w)}
                    aria-label={tr(`给工作区「${w.name}」改名`, `Rename workspace “${w.name}”`)}
                    title={tr('改名', 'Rename')}
                  >
                    <Icon name="edit" />
                  </button>
                )}
                {w.origin !== 'demo' && (
                  <button
                    type="button"
                    className="rail-remove"
                    onClick={() => void removeWorkspace(w)}
                    aria-label={tr(`移除工作区「${w.name}」`, `Remove workspace “${w.name}”`)}
                    title={w.origin === 'folder' ? tr('只断开本站引用，不删磁盘文件', 'Only disconnects it here; no files on disk are deleted') : tr('移除这个浏览器工作区', 'Remove this browser workspace')}
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
                <span className="rail-name">{tr('新建空白工作区', 'New blank workspace')}</span>
              </button>
            </li>
          </ul>
          <div className="rail-foot">
            <button
              type="button"
              className="rail-item new"
              onClick={() => void openFolder()}
              disabled={!localFolderSupported()}
              title={localFolderSupported() ? tr('把电脑上的一个文件夹作为工作区打开', 'Open a folder on this computer as a workspace') : tr('需要 Chrome 或 Edge', 'Needs Chrome or Edge')}
            >
              <span className="rail-glyph" aria-hidden="true">
                <Icon name="plus" />
              </span>
              <span className="rail-name">{tr('打开本地文件夹', 'Open local folder')}</span>
            </button>
            <button
              type="button"
              className="rail-item new"
              onClick={() => importInput.current?.click()}
              title={tr('把一个文件夹复制进浏览器（任何浏览器可用；改动不写回原文件夹）', 'Copy a folder into the browser (any browser; edits are not written back)')}
            >
              <span className="rail-glyph" aria-hidden="true">
                <Icon name="folder" />
              </span>
              <span className="rail-name">{tr('导入文件夹', 'Import folder')}</span>
            </button>
            <button
              type="button"
              className="rail-item new"
              onClick={() => setGhImportOpen(true)}
              title={tr('把一个 GitHub 仓库复制成工作区，长期保存在这台电脑的浏览器里，之后可随时同步', 'Copy a GitHub repository into a workspace kept in this browser; sync any time later')}
            >
              <span className="rail-glyph" aria-hidden="true">
                <Icon name="github" />
              </span>
              <span className="rail-name">{tr('从 GitHub 导入', 'Import from GitHub')}</span>
            </button>
            <input
              ref={importInput}
              type="file"
              hidden
              multiple
              onChange={(e) => void importFolder(e)}
              {...{ webkitdirectory: '' }}
            />
            <button type="button" className="collapse-btn" onClick={() => setRailOpen(false)} title={tr('收起工作区栏', 'Collapse workspaces')}>
              <Icon name="sidebar" />
              <span className="sr-only">{tr('收起工作区栏', 'Collapse workspaces')}</span>
            </button>
          </div>
        </nav>
      ) : (
        <button type="button" className="ws-strip" onClick={() => setRailOpen(true)} title={tr('展开工作区栏', 'Expand workspaces')}>
          <span className="rail-glyph small" aria-hidden="true">
            {ws.glyph}
          </span>
          <span className="sr-only">{tr('展开工作区栏', 'Expand workspaces')}</span>
        </button>
      )}

      {treeOpen ? (
        <nav className="ws-tree" aria-label={tr(`${ws.name}的文件`, `Files in ${ws.name}`)}>
          <div className="tree-head">
            <p className="tree-title">{ws.name}</p>
            <button type="button" className="collapse-btn" onClick={() => setTreeOpen(false)} title={tr('收起文件栏', 'Collapse files')}>
              <Icon name="sidebar" />
              <span className="sr-only">{tr('收起文件栏', 'Collapse files')}</span>
            </button>
          </div>
          {ws.origin === 'browser' && (
            <button
              type="button"
              className="btn quiet tree-auth"
              onClick={() => setAlignOpen(true)}
              title={ws.link ? tr(`与「${ws.link.folder}」对齐：写进改动、读入新改动`, `Sync with “${ws.link.folder}”: write changes out, read new ones in`) : tr('选一个电脑上的文件夹，让这里的改动和它保持一致', 'Pick a folder on this computer and keep it in step with this workspace')}
            >
              <Icon name="folder" />
              {ws.link ? tr(`对齐「${ws.link.folder}」`, `Sync “${ws.link.folder}”`) : tr('对齐文件夹', 'Sync with a folder')}
            </button>
          )}
          {ws.origin === 'browser' && (
            <button
              type="button"
              className="btn quiet tree-auth"
              onClick={() => setGhOpen(true)}
              title={tr('与一个 GitHub 仓库同步：推上去、拉下来，冲突逐个选', 'Sync with a GitHub repository: push, pull, resolve conflicts one by one')}
            >
              <Icon name="github" />
              {ws.github ? tr(`同步 ${ws.github.repo}`, `Sync ${ws.github.repo}`) : tr('同步 GitHub', 'Sync with GitHub')}
            </button>
          )}
          {needsAuth && ws.origin === 'folder' && (
            <button type="button" className="btn quiet tree-auth" onClick={() => void authorize(ws)}>
              {tr('重新授权本地文件夹', 'Re-allow local folder')}
            </button>
          )}
          {ws.folders.length === 0 && (
            <p className="tree-empty">
              {ws.origin === 'browser' ? tr('这是空白工作区，可以从一份 Markdown 笔记开始。', 'A blank workspace — start with a Markdown note.') : tr('这个文件夹里没有可以打开的文件（Markdown、PDF、图片、HTML、JSON）。', 'Nothing here can be opened (Markdown, PDF, images, HTML, JSON).')}
            </p>
          )}
          <FileTree ws={ws} activeId={file?.id} onOpen={open} icons={KIND_ICON} />
        </nav>
      ) : (
        <button type="button" className="ws-strip" onClick={() => setTreeOpen(true)} title={tr('展开文件栏', 'Expand files')}>
          <Icon name="folder" />
          <span className="sr-only">{tr('展开文件栏', 'Expand files')}</span>
        </button>
      )}

      <section className="ws-main" aria-label={tr('文件内容', 'File content')}>
        {ws.origin === 'folder' && !folderReady ? (
          <div className="viewer-state viewer-empty">
            <p>{needsAuth ? tr('需要重新授权这个本地文件夹，才能读取文件。', 'Allow this local folder again to read its files.') : tr('正在重新连接本地文件夹…', 'Reconnecting the local folder…')}</p>
            {needsAuth && (
              <button type="button" className="btn primary" onClick={() => void authorize(ws)}>
                {tr('重新授权本地文件夹', 'Re-allow local folder')}
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
                <div className="segmented" role="group" aria-label={tr('讲义视图', 'Note view')}>
                  <button type="button" aria-pressed={view === 'read'} onClick={() => open(file.id, 'read')}>
                    {tr('阅读', 'Read')}
                  </button>
                  <button type="button" aria-pressed={view === 'source'} onClick={() => open(file.id, 'source')}>
                    {tr('源文件', 'Source')}
                  </button>
                </div>
              )}
              {canEdit(file) && (
                <button type="button" className={editing ? 'btn quiet on' : 'btn quiet'} aria-pressed={editing} onClick={() => setEditing((v) => !v)}>
                  <Icon name="edit" />
                  {editing ? tr('完成', 'Done') : tr('编辑', 'Edit')}
                </button>
              )}
              {file.kind !== 'link' && !file.local && !file.browser && (
                <a className="btn quiet" href={view === 'source' && file.sourceUrl ? file.sourceUrl : file.url} target="_blank" rel="noreferrer">
                  {tr('新标签页打开', 'Open in new tab')}
                </a>
              )}
            </header>
            <div className="ws-content">
              <FileViewer file={file} view={view} locate={locate} editing={editing} files={allFiles} onStatus={setStatus} />
            </div>
          </>
        ) : (
          <div className="viewer-state viewer-empty">
            <p>{ws.origin === 'browser' ? tr('这个工作区还没有笔记。', 'No notes in this workspace yet.') : tr('从左边选一个文件。', 'Pick a file on the left.')}</p>
            {ws.origin === 'browser' && (
              <button type="button" className="btn primary" onClick={() => void newNote()}>
                {tr('新建 Markdown 笔记', 'New Markdown note')}
              </button>
            )}
          </div>
        )}
        {status && (
          <p className="ws-status" role="status">
            {status}
          </p>
        )}
        {error && <p className="ws-status" role="alert">{tr('工作区存储异常：', 'Workspace storage error: ')}{error}</p>}
        {ws.origin === 'browser' && (
          <FolderAlign
            workspace={ws}
            open={alignOpen}
            onClose={() => setAlignOpen(false)}
            onWorkspace={replace}
            onStatus={setStatus}
          />
        )}
        {ws.origin === 'browser' && (
          <GithubSync workspace={ws} open={ghOpen} onClose={() => setGhOpen(false)} onWorkspace={replace} onStatus={setStatus} />
        )}
        <GithubSync
          open={ghImportOpen}
          onClose={() => setGhImportOpen(false)}
          onWorkspace={(w) => {
            void reload().then(() => {
              setParams({ ws: w.id }, { replace: true });
              setTreeOpen(true);
            });
          }}
          onStatus={setStatus}
        />
        <AiDock onLocate={onLocate} noteName={findFile(DEMO_WORKSPACE, DEFAULT_FILE)?.name ?? '讲义'} ws={ws} files={allFiles} onWorkspace={replace} onStatus={setStatus} />
      </section>
    </div>
  );
}
