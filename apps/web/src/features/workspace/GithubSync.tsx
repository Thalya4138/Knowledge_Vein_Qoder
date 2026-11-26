import { useEffect, useRef, useState } from 'react';
import { browserStore } from '../../store/browser';
import { applyGithub, compareGithub, GithubError, memoryToken, parseRepo, unlinkGithub, type Comparison } from '../../store/github';
import type { Workspace } from '../../store/types';
import { Icon } from '../../ui/Icon';
import { useT } from '../../ui/prefs';

/**
 * 「同步 GitHub」面板：浏览器工作区 ⇄ 一个 GitHub 仓库（store/github.ts）。
 * 先比较、列清楚两边各改了什么，再点同步；两边都改过的文件逐个选。令牌只存在本页内存。
 */

type State =
  | { kind: 'form' }
  | { kind: 'loading' }
  | { kind: 'ready'; cmp: Comparison }
  | { kind: 'error'; message: string };

export function GithubSync({
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
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const link = workspace.github;
  const [repo, setRepo] = useState(link?.repo ?? '');
  const [branch, setBranch] = useState(link?.branch ?? 'main');
  const [dir, setDir] = useState(link?.dir ?? '');
  const [token, setToken] = useState(memoryToken.value);
  const [state, setState] = useState<State>({ kind: 'form' });
  const [pick, setPick] = useState<Record<string, 'here' | 'there' | undefined>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setRepo(link?.repo ?? '');
    setBranch(link?.branch ?? 'main');
    setDir(link?.dir ?? '');
    setToken(memoryToken.value);
    // 已经连过、本页也有令牌：直接比较
    if (link && memoryToken.value) void compare();
    else setState({ kind: 'form' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspace.id]);

  const target = () => {
    const r = parseRepo(repo);
    if (!r) throw new GithubError(t('仓库写成「用户名/仓库名」，或贴 GitHub 上的仓库地址。', 'Write the repository as “owner/name”, or paste its GitHub URL.'));
    return { repo: r, branch: branch.trim() || 'main', dir: dir.trim().replace(/^\/+|\/+$/g, ''), base: link && link.repo === r && link.dir === dir ? link.base : {} };
  };

  const compare = async () => {
    setState({ kind: 'loading' });
    try {
      memoryToken.value = token.trim();
      const cmp = await compareGithub(memoryToken.value, browserStore(workspace.id), target());
      setPick({});
      setState({ kind: 'ready', cmp });
    } catch (e) {
      setState({ kind: 'error', message: (e as Error).message });
    }
  };

  const sync = async () => {
    if (state.kind !== 'ready') return;
    setBusy(true);
    try {
      const msg = `知脉：从网页同步工作区「${workspace.name}」`;
      const r = await applyGithub(memoryToken.value, workspace, target(), state.cmp, pick, msg);
      onWorkspace(r.workspace);
      const parts = [r.pushed && t(`推上去 ${r.pushed} 个`, `${r.pushed} pushed`), r.pulled && t(`拉下来 ${r.pulled} 个`, `${r.pulled} pulled`), r.skipped && t(`${r.skipped} 个冲突没选，保持原样`, `${r.skipped} conflicts left as they were`)].filter(Boolean);
      onStatus(parts.length ? t(`已与 ${r.workspace.github!.repo} 同步：${parts.join('，')}`, `Synced with ${r.workspace.github!.repo}: ${parts.join(', ')}`) : t('两边本来就一致', 'Already in sync'));
      onClose();
    } catch (e) {
      setState({ kind: 'error', message: t(`同步没有完成：${(e as Error).message}`, `Sync did not finish: ${(e as Error).message}`) });
    } finally {
      setBusy(false);
    }
  };

  const LABEL = {
    push: t('这里改过，推到仓库', 'Changed here — push to the repository'),
    pull: t('仓库里改过，拉到这里', 'Changed in the repository — pull here'),
    conflict: t('两边都改过，选一份留下', 'Changed on both sides — choose one'),
  };
  const groups = state.kind === 'ready' ? (['conflict', 'push', 'pull'] as const).map((k) => [k, state.cmp.changes.filter((c) => c.kind === k)] as const) : [];
  const repoUrl = parseRepo(repo) ? `https://github.com/${parseRepo(repo)}` : null;

  return (
    <dialog ref={ref} className="align" onClose={onClose} aria-label={t('同步 GitHub', 'Sync with GitHub')}>
      <header className="align-head">
        <h2>{t('同步 GitHub', 'Sync with GitHub')}</h2>
        <button type="button" className="settings-close" onClick={onClose} aria-label={t('关闭', 'Close')}>
          <Icon name="close" />
        </button>
      </header>

      <form
        className="gh-form"
        onSubmit={(e) => {
          e.preventDefault();
          void compare();
        }}
      >
        <label>
          <span>{t('仓库', 'Repository')}</span>
          <input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/notes" autoComplete="off" spellCheck={false} />
        </label>
        <label>
          <span>{t('分支', 'Branch')}</span>
          <input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main" autoComplete="off" spellCheck={false} />
        </label>
        <label>
          <span>{t('子目录（可空）', 'Folder (optional)')}</span>
          <input value={dir} onChange={(e) => setDir(e.target.value)} placeholder={t('例如 线性代数', 'e.g. linear-algebra')} autoComplete="off" spellCheck={false} />
        </label>
        <label>
          <span>{t('令牌', 'Token')}</span>
          <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="github_pat_…" autoComplete="off" />
        </label>
        <p className="align-quiet">
          {t(
            '令牌用 GitHub 的 fine-grained token，只授权这一个仓库、Contents 读写。它只存在本页内存里，刷新即清除，不写进工作区、浏览器存储或地址。',
            'Use a fine-grained GitHub token scoped to this one repository with Contents read & write. It lives only in this page’s memory and is cleared on reload.',
          )}
        </p>
        <div className="align-actions">
          <button type="submit" className="btn primary" disabled={!repo.trim() || !token.trim() || state.kind === 'loading'}>
            {state.kind === 'ready' ? t('重新比较', 'Compare again') : t('比较两边', 'Compare')}
          </button>
        </div>
      </form>

      {state.kind === 'loading' && <p role="status">{t('正在读取仓库并比较两边的文件…', 'Reading the repository and comparing…')}</p>}
      {state.kind === 'error' && <p role="alert">{state.message}</p>}
      {state.kind === 'ready' && (
        <>
          <p className="align-quiet">
            {t(`与 ${parseRepo(repo)}（${branch}${dir ? ` / ${dir}` : ''}）相比：${state.cmp.same.length} 个文件一致`, `Compared with ${parseRepo(repo)} (${branch}${dir ? ` / ${dir}` : ''}): ${state.cmp.same.length} identical`)}
            {state.cmp.changes.length ? t(`，${state.cmp.changes.length} 个不同。`, `, ${state.cmp.changes.length} different.`) : t('，没有要同步的。', ', nothing to sync.')}
            {state.cmp.remote.head === null ? t(' 仓库还是空的，第一次同步会建出第一个提交。', ' The repository is empty; the first sync creates its first commit.') : ''}
            {link?.at ? t(` 上次同步：${new Date(link.at).toLocaleString()}。`, ` Last sync: ${new Date(link.at).toLocaleString()}.`) : ''}
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
                        <span className="segmented" role="group" aria-label={t(`${c.path} 留哪一份`, `Which version of ${c.path}`)}>
                          <button type="button" aria-pressed={pick[c.path] === 'here'} onClick={() => setPick((p) => ({ ...p, [c.path]: 'here' }))}>
                            {t('留这里的', 'Keep this one')}
                          </button>
                          <button type="button" aria-pressed={pick[c.path] === 'there'} onClick={() => setPick((p) => ({ ...p, [c.path]: 'there' }))}>
                            {t('留仓库的', 'Keep the repository’s')}
                          </button>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null,
          )}
          <p className="align-quiet">
            {t('推送是一次提交；比较之后仓库里若又有新提交，会停下来让你重新比较。不会删除任何一边的文件。', 'Pushing makes one commit; if the repository gets a new commit after you compare, sync stops and asks you to compare again. No file is deleted on either side.')}
          </p>
          <div className="align-actions">
            <button type="button" className="btn primary" disabled={busy || !state.cmp.changes.length} onClick={() => void sync()}>
              {busy ? t('正在同步…', 'Syncing…') : t('同步', 'Sync')}
            </button>
            {repoUrl && (
              <a className="btn quiet" href={repoUrl} target="_blank" rel="noreferrer">
                {t('在 GitHub 上打开', 'Open on GitHub')}
              </a>
            )}
            {link && (
              <button
                type="button"
                className="btn quiet"
                disabled={busy}
                onClick={async () => {
                  onWorkspace(await unlinkGithub(workspace));
                  onStatus(t('已断开 GitHub；仓库里的文件不受影响', 'Disconnected from GitHub; the repository is untouched'));
                  onClose();
                }}
              >
                {t('断开这个仓库', 'Disconnect')}
              </button>
            )}
          </div>
        </>
      )}
    </dialog>
  );
}
