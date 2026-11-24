import { useEffect, useMemo, useState } from 'react';
import type { Workspace, WorkspaceStore } from '../../store/types';
import { copyToClipboard, download, fileName, FORMATS, insertIntoLecture, lectureFiles, makeFile, saveToWorkspace, workspaceFolders, type Content, type Format } from './exporting';
import type { Turn } from './threads';

/**
 * 导出与复制：内容（讲解 / 关联图 / 两者）× 去处（复制 / 下载 / 存进工作区 / 接到讲义末尾）× 格式。
 */

type Dest = 'copy' | 'download' | 'workspace' | 'lecture';

const CONTENTS: { id: Content; label: string }[] = [
  { id: 'both', label: '讲解与关联图' },
  { id: 'note', label: '只要讲解' },
  { id: 'graph', label: '只要关联图' },
];

const DESTS: { id: Dest; label: string }[] = [
  { id: 'copy', label: '复制' },
  { id: 'download', label: '下载到本地' },
  { id: 'workspace', label: '存进工作区' },
  { id: 'lecture', label: '接到讲义末尾' },
];

export function ExportDialog({
  turn,
  workspace,
  store,
  onWorkspace,
  onPrint,
  onDone,
  onClose,
}: {
  turn: Turn;
  workspace: Workspace;
  store: WorkspaceStore;
  onWorkspace: (w: Workspace) => void;
  onPrint: (content: Content) => void;
  onDone: (msg: string, link?: { to: string; label: string }) => void;
  onClose: () => void;
}) {
  const r = turn.result;
  const [content, setContent] = useState<Content>('both');
  const [dest, setDest] = useState<Dest>('copy');
  const [fmt, setFmt] = useState<Format>('md');
  const [folders, setFolders] = useState<string[]>(['探索']);
  const [folder, setFolder] = useState('探索');
  const [name, setName] = useState('');
  const lectures = useMemo(() => lectureFiles(workspace), [workspace]);
  const [lecture, setLecture] = useState(lectures[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void workspaceFolders(store).then(setFolders).catch(() => undefined);
  }, [store]);

  const formats = FORMATS.filter((f) => (content === 'graph' ? true : !f.graphOnly) && (dest === 'download' || f.id !== 'pdf'));
  useEffect(() => {
    if (!formats.some((f) => f.id === fmt)) setFmt(formats[0]!.id);
  }, [content, dest]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setName(fileName(r, content, fmt)), [r, content, fmt]);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      if (dest === 'copy') {
        await copyToClipboard(r, content);
        onDone(content === 'graph' ? '关联图已复制。粘进知脉讲义的编辑框会显示成图；粘进 Word 是一张图片。' : '已复制。粘进知脉讲义或 Obsidian 保持栏目与关联图；粘进 Word、飞书保持排版。');
      } else if (dest === 'lecture') {
        const file = lectures.find((f) => f.id === lecture);
        if (!file) throw new Error('这个工作区里还没有讲义。');
        await insertIntoLecture(store, workspace, file, r, content);
        onDone(`已接到「${file.name}」的末尾。`, { to: `/workspace?ws=${encodeURIComponent(workspace.id)}&file=${encodeURIComponent(file.id)}`, label: '去看讲义' });
      } else if (fmt === 'pdf') {
        onPrint(content);
        onClose();
        return;
      } else {
        const blob = await makeFile(r, content, fmt, turn.ask);
        if (dest === 'download') {
          download(name, blob);
          onDone(`已下载 ${name}。`);
        } else {
          const path = `${folder.replace(/\/+$/, '')}/${name.replace(/[\\/]/g, ' ')}`;
          const w = await saveToWorkspace(store, workspace, path, blob);
          if (w !== workspace) onWorkspace(w);
          onDone(workspace.origin === 'folder' ? `已存到你的文件夹：${path}` : `已存到工作区：${path}`, workspace.origin === 'demo' ? undefined : { to: `/workspace?ws=${encodeURIComponent(workspace.id)}`, label: '去工作台' });
        }
      }
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const action = dest === 'copy' ? '复制' : dest === 'lecture' ? '接到讲义末尾' : fmt === 'pdf' ? '打印为 PDF' : dest === 'download' ? '下载' : '存进工作区';

  return (
    <div className="cx-modal" role="dialog" aria-modal="true" aria-labelledby="cx-export-title" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="cx-modal-card cx-export">
        <h2 id="cx-export-title">导出与复制</h2>

        <fieldset>
          <legend>内容</legend>
          <div className="segmented" role="radiogroup">
            {CONTENTS.map((c) => (
              <button key={c.id} type="button" role="radio" aria-checked={content === c.id} aria-pressed={content === c.id} onClick={() => setContent(c.id)} disabled={c.id !== 'note' && !r.graph.nodes.length}>
                {c.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>去处</legend>
          <div className="segmented" role="radiogroup">
            {DESTS.map((d) => (
              <button key={d.id} type="button" role="radio" aria-checked={dest === d.id} aria-pressed={dest === d.id} onClick={() => setDest(d.id)}>
                {d.label}
              </button>
            ))}
          </div>
        </fieldset>

        {dest === 'copy' && <p className="cx-quiet">同时复制两种格式：粘进知脉讲义或 Obsidian，栏目与关联图原样保留（关联图显示为图）；粘进 Word、飞书、邮件，保留排版，关联图是一张图片。</p>}

        {dest === 'lecture' &&
          (lectures.length ? (
            <label className="cx-field">
              接到哪篇讲义
              <select value={lecture} onChange={(e) => setLecture(e.target.value)}>
                {lectures.map((f) => (
                  <option key={f.id} value={f.id}>{f.path ?? f.name}</option>
                ))}
              </select>
              <span className="cx-quiet">写在讲义末尾，标题降一级；关联图在讲义里显示为一幅编号的图，可以在工作台里继续编辑、挪动位置。</span>
            </label>
          ) : (
            <p className="cx-quiet">这个工作区里还没有讲义（.md 文件）。可以先「存进工作区」。</p>
          ))}

        {(dest === 'download' || dest === 'workspace') && (
          <fieldset>
            <legend>格式</legend>
            <div className="cx-formats">
              {formats.map((f) => (
                <label key={f.id} className={fmt === f.id ? 'on' : ''}>
                  <input type="radio" name="cx-fmt" checked={fmt === f.id} onChange={() => setFmt(f.id)} />
                  <span>{f.label}</span>
                  {f.note && <em>{f.note}</em>}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {dest === 'workspace' && (
          <div className="xi-row">
            <label className="cx-field">
              文件夹
              <input list="cx-folders" value={folder} onChange={(e) => setFolder(e.target.value)} />
              <datalist id="cx-folders">
                {folders.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            </label>
            <label className="cx-field">
              文件名
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
          </div>
        )}
        {dest === 'download' && fmt !== 'pdf' && (
          <label className="cx-field">
            文件名
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        )}

        {error && <p className="xi-problem" role="alert">{error}</p>}
        <div className="xi-actions">
          <button type="button" className="key on" disabled={busy || (dest === 'lecture' && !lectures.length)} onClick={() => void run()}>
            {busy ? '正在处理…' : action}
          </button>
          <button type="button" className="btn quiet" onClick={onClose}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
