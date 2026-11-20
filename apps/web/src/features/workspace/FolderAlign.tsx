import { useEffect, useRef, useState } from 'react';
import type { DirHandle } from '../../store/folder';
import { applyAlign, chooseFolder, compareFolder, linkedHandle, linkSupported, unlinkFolder, type Change } from '../../store/link';
import type { Workspace } from '../../store/types';
import { Icon } from '../../ui/Icon';

/**
 * 「对齐文件夹」面板：浏览器工作区 ⇄ 电脑上的一个文件夹。
 * 先列出两边各改了什么，用户看清楚再点「对齐」；两边都改过的文件逐个选留哪一份。
 */

type State =
  | { kind: 'unlinked' }
  | { kind: 'auth' }
  | { kind: 'loading' }
  | { kind: 'ready'; handle: DirHandle; changes: Change[]; same: number }
  | { kind: 'error'; message: string };

const LABEL: Record<Change['kind'], string> = {
  push: '这里改过，写进文件夹',
  pull: '文件夹里改过，读到这里',
  conflict: '两边都改过，选一份留下',
};

export function FolderAlign({
  workspace,
  open,
  onClose,
  onWorkspace,
  onStatus,
}: {
  workspace: Workspace;
  open: boolean;
  onClose: () => void;
  onWorkspace: (w: Workspace) => void;
  onStatus: (s: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [pick, setPick] = useState<Record<string, 'here' | 'there' | undefined>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const load = async (request: boolean) => {
    if (!workspace.link) return setState({ kind: 'unlinked' });
    setState({ kind: 'loading' });
    try {
      const h = await linkedHandle(workspace, request);
      if (!h) return setState({ kind: 'unlinked' });
      if (h.permission !== 'granted') return setState({ kind: 'auth' });
      const r = await compareFolder(workspace, h.handle);
      setPick({});
      setState({ kind: 'ready', handle: h.handle, changes: r.changes, same: r.same.length });
    } catch (e) {
      setState({ kind: 'error', message: (e as Error).message });
    }
  };

  useEffect(() => {
    if (open) void load(false);
    // 打开面板或换了工作区时重新比较
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspace.id, workspace.link?.folder]);

  const choose = async () => {
    const linked = await chooseFolder(workspace);
    if (!linked) return;
    onWorkspace(linked);
  };

  const align = async () => {
    if (state.kind !== 'ready') return;
    setBusy(true);
    try {
      const r = await applyAlign(workspace, state.handle, state.changes, pick);
      onWorkspace(r.workspace);
      const parts = [r.pushed && `${r.pushed} 个写进文件夹`, r.pulled && `${r.pulled} 个读到这里`, r.skipped && `${r.skipped} 个冲突没选，保持原样`].filter(Boolean);
      onStatus(parts.length ? `已对齐「${state.handle.name}」：${parts.join('，')}` : `「${state.handle.name}」本来就是一致的`);
      onClose();
    } catch (e) {
      setState({ kind: 'error', message: `对齐没有完成：${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  };

  const groups = state.kind === 'ready' ? (['conflict', 'push', 'pull'] as const).map((k) => [k, state.changes.filter((c) => c.kind === k)] as const) : [];

  return (
    <dialog ref={ref} className="align" onClose={onClose} aria-label="对齐文件夹">
      <header className="align-head">
        <h2>对齐文件夹</h2>
        <button type="button" className="settings-close" onClick={onClose} aria-label="关闭">
          <Icon name="close" />
        </button>
      </header>

      {!linkSupported() ? (
        <p>对齐文件夹需要 Chrome 或 Edge（要用到浏览器读写本地文件夹的能力）。其他浏览器可以继续用「导入文件夹」，但改动不会回到原文件夹。</p>
      ) : state.kind === 'unlinked' ? (
        <>
          <p>
            「{workspace.name}」现在只存在这台电脑的浏览器里。选一个文件夹后，可以随时把这里的改动写进文件夹，或把文件夹里的新改动读进来。
            导入时用的那个文件夹，选它就行。
          </p>
          <div className="align-actions">
            <button type="button" className="btn primary" onClick={() => void choose()}>
              选择文件夹
            </button>
          </div>
        </>
      ) : state.kind === 'auth' ? (
        <>
          <p>浏览器每次新开都要你点一次允许，才能读写「{workspace.link?.folder}」。</p>
          <div className="align-actions">
            <button type="button" className="btn primary" onClick={() => void load(true)}>
              允许读写
            </button>
          </div>
        </>
      ) : state.kind === 'loading' ? (
        <p role="status">正在比较两边的文件…</p>
      ) : state.kind === 'error' ? (
        <p role="alert">{state.message}</p>
      ) : (
        <>
          <p className="align-quiet">
            与「{state.handle.name}」相比：{state.same} 个文件一致
            {state.changes.length ? `，${state.changes.length} 个不同。` : '，没有要对齐的。'}
            {workspace.link?.at ? ` 上次对齐：${new Date(workspace.link.at).toLocaleString()}。` : ' 这是第一次对齐。'}
          </p>
          {groups.map(([kind, list]) =>
            list.length ? (
              <section key={kind} className={`align-group ${kind}`}>
                <h3>
                  {LABEL[kind]} <span>{list.length}</span>
                </h3>
                <ul>
                  {list.map((c) => (
                    <li key={c.path}>
                      <code>{c.path}</code>
                      {kind === 'conflict' && (
                        <span className="segmented" role="group" aria-label={`${c.path} 留哪一份`}>
                          <button type="button" aria-pressed={pick[c.path] === 'here'} onClick={() => setPick((p) => ({ ...p, [c.path]: 'here' }))}>
                            留这里的
                          </button>
                          <button type="button" aria-pressed={pick[c.path] === 'there'} onClick={() => setPick((p) => ({ ...p, [c.path]: 'there' }))}>
                            留文件夹的
                          </button>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null,
          )}
          <p className="align-quiet">不会删除任何一边的文件：一边缺的只会被补上。</p>
          <div className="align-actions">
            <button type="button" className="btn primary" disabled={busy || !state.changes.length} onClick={() => void align()}>
              {busy ? '正在对齐…' : '对齐'}
            </button>
            <button type="button" className="btn quiet" disabled={busy} onClick={() => void load(false)}>
              重新比较
            </button>
            <button
              type="button"
              className="btn quiet"
              disabled={busy}
              onClick={async () => {
                onWorkspace(await unlinkFolder(workspace));
                onStatus('已断开文件夹；文件夹里的文件不受影响');
                onClose();
              }}
            >
              断开这个文件夹
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
