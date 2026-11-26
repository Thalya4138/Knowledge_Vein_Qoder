import { useEffect, useRef, useState } from 'react';
import { browserStore } from '../../store/browser';
import { applyGithub, compareGithub, forgetToken, GithubError, importGithub, memoryToken, parseRepo, rememberToken, tokenRemembered, unlinkGithub, type Comparison } from '../../store/github';
import type { Workspace } from '../../store/types';
import { Icon } from '../../ui/Icon';
import { useT } from '../../ui/prefs';

/**
 * 「同步 GitHub」面板：浏览器工作区 ⇄ 一个 GitHub 仓库（store/github.ts）。
 * 先比较、列清楚两边各改了什么，再点同步；两边都改过的文件逐个选。
 * 不传 workspace 时是「从 GitHub 导入」：把仓库复制成一个新的浏览器工作区，并记住这个仓库。
 * 公开仓库读取不需要令牌；推送和私有仓库需要。令牌的存法与模型 key 相同（默认当前标签页，可选记住）。
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
  /** 不传 = 导入模式 */
  workspace?: Workspace;
  open: boolean;
  onClose: () => void;
  onWorkspace: (w: Workspace) => void;
  onStatus: (s: string) => void;
}) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const importing = !workspace;
  const link = workspace?.github;
  const [repo, setRepo] = useState(link?.repo ?? '');
  const [branch, setBranch] = useState(link?.branch ?? 'main');
  const [dir, setDir] = useState(link?.dir ?? '');
  const [token, setToken] = useState(memoryToken.value);
  const [state, setState] = useState<State>({ kind: 'form' });
  const [pick, setPick] = useState<Record<string, 'here' | 'there' | undefined>>({});
  const [busy, setBusy] = useState(false);
  const [remember, setRemember] = useState(tokenRemembered());

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
    setRemember(tokenRemembered());
    // 已经连过：直接比较（公开仓库不需要令牌）
    if (link) void compare();
    else setState({ kind: 'form' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspace?.id]);

  const saveToken = () => {
    memoryToken.value = token.trim();
    rememberToken(remember && Boolean(token.trim()));
  };

  const target = () => {
    const r = parseRepo(repo);
    if (!r) throw new GithubError(t('仓库写成「用户名/仓库名」，或贴 GitHub 上的仓库地址。', 'Write the repository as “owner/name”, or paste its GitHub URL.'));
    return { repo: r, branch: branch.trim() || 'main', dir: dir.trim().replace(/^\/+|\/+$/g, ''), base: link && link.repo === r && link.dir === dir ? link.base : {} };
  };

  const doImport = async () => {
    setState({ kind: 'loading' });
    try {
      saveToken();
      const r = await importGithub(memoryToken.value, target());
      onWorkspace(r.workspace);
      onStatus(t(`已从 ${r.workspace.github!.repo} 导入 ${r.pulled} 个文件到「${r.workspace.name}」，保存在这台电脑的浏览器里`, `Imported ${r.pulled} files from ${r.workspace.github!.repo} into “${r.workspace.name}”, kept in this browser`));
      onClose();
    } catch (e) {
      setState({ kind: 'error', message: (e as Error).message });
    }
  };

  const compare = async () => {
    if (!workspace) return doImport();
    setState({ kind: 'loading' });
    try {
      saveToken();
      const cmp = await compareGithub(memoryToken.value, browserStore(workspace.id), target());
      setPick({});
      setState({ kind: 'ready', cmp });
    } catch (e) {
      setState({ kind: 'error', message: (e as Error).message });
    }
  };

  const sync = async () => {
    if (state.kind !== 'ready' || !workspace) return;
    if (!memoryToken.value && state.cmp.changes.some((c) => c.kind === 'push' || pick[c.path] === 'here')) {
      setState({ kind: 'error', message: t('推到仓库需要令牌（只授权这个仓库、Contents 读写）。只拉取更新可以不填。', 'Pushing needs a token (scoped to this repository, Contents read & write). Pulling alone does not.') });
      return;
    }
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
    <dialog ref={ref} className="align" onClose={onClose} aria-label={importing ? t('从 GitHub 导入', 'Import from GitHub') : t('同步 GitHub', 'Sync with GitHub')}>
      <header className="align-head">
        <h2>{importing ? t('从 GitHub 导入', 'Import from GitHub') : t('同步 GitHub', 'Sync with GitHub')}</h2>
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
          <span>{t('令牌（公开仓库只读可不填）', 'Token (optional for reading a public repository)')}</span>
          <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="github_pat_…" autoComplete="off" />
        </label>
        <label className="gh-remember">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span>{t('在这台电脑上记住令牌（公用电脑上不要勾）', 'Remember the token on this computer (not on a shared one)')}</span>
        </label>
        <p className="align-quiet">
          {t(
            '私有仓库和推送需要令牌：用 GitHub 的 fine-grained token，只授权这一个仓库、Contents 读写。令牌默认只存在当前标签页，不写进工作区或地址。',
            'Private repositories and pushing need a token: a fine-grained GitHub token scoped to this one repository with Contents read & write. By default it lives only in this tab and never goes into the workspace or the address.',
          )}
          {importing
            ? t(' 导入的文件长期保存在这台电脑的浏览器里；之后在文件栏点「同步 GitHub」拉取更新或推回去。', ' Imported files stay in this browser; later, use “Sync with GitHub” in the file column to pull updates or push back.')
            : ''}
        </p>
        <div className="align-actions">
          {memoryToken.value && (
            <button
              type="button"
              className="btn quiet gh-forget"
              onClick={() => {
                forgetToken();
                setToken('');
                setRemember(false);
              }}
            >
              {t('清除已保存的令牌', 'Clear saved token')}
            </button>
          )}
          <button type="submit" className="btn primary" disabled={!repo.trim() || state.kind === 'loading'}>
            {importing ? t('导入', 'Import') : state.kind === 'ready' ? t('重新比较', 'Compare again') : t('比较两边', 'Compare')}
          </button>
        </div>
      </form>

      {state.kind === 'loading' && <p role="status">{importing ? t('正在读取仓库并下载文件…', 'Reading the repository and downloading files…') : t('正在读取仓库并比较两边的文件…', 'Reading the repository and comparing…')}</p>}
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
                  if (!workspace) return;
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
