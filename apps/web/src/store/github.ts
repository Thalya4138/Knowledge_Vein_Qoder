import { browserStore, createBrowserWorkspace, keepStorage } from './browser';
import { planAlign, type Change } from './link';
import { registerWorkspace } from './registry';
import { classify, placeBrowserFile, SKIP_DIR } from './tree';
import type { GithubLink, Workspace, WorkspaceStore } from './types';

export type { GithubLink };

/**
 * 工作区 ⇄ GitHub 仓库（SYNC_AND_API.md §3）。浏览器直接调 api.github.com（它允许跨域），不经过任何服务器。
 *
 * 与「对齐文件夹」同一套三份指纹（store/link.ts 的 planAlign）：这里、仓库、上次同步时。
 * 指纹用 git 自己的 blob SHA-1（"blob <字节数>\0" + 内容），不下载文件就能知道仓库里的那份变没变。
 *   只有这里变了 → 推上去；只有仓库变了 → 拉下来；两边都变了 → 由用户逐个选，不做自动合并。
 * 推送是一次提交（Git Data API：blob → tree → commit → 移动分支）。比较之后、提交之前再核对一次分支的提交号，
 * 中间有人推过就停下，要求重新比较——不会盖掉别人的提交。不删除任何一边的文件。
 *
 * 令牌与模型 key 同一种存法（AGENTS.md §1 第 7 条）：默认存在当前标签页，勾选「在这台电脑上记住」才写 localStorage；
 * 不写进工作区、不进地址。公开仓库不需要令牌：读文件走 raw.githubusercontent.com（允许跨域、不占 API 限额）。
 */

const TOKEN_KEY = 'vein.github-token';
let tokenInMemory = '';

/** 读写 GitHub 令牌；`value` 的写入只更新当前标签页（以及已勾选「记住」时的本机副本） */
export const memoryToken = {
  get value(): string {
    try {
      return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY) ?? tokenInMemory;
    } catch {
      return tokenInMemory;
    }
  },
  set value(v: string) {
    tokenInMemory = v;
    try {
      sessionStorage.setItem(TOKEN_KEY, v);
      if (localStorage.getItem(TOKEN_KEY) !== null) localStorage.setItem(TOKEN_KEY, v);
    } catch {
      /* 存储不可用：只在内存 */
    }
  },
};

export function tokenRemembered(): boolean {
  try {
    return localStorage.getItem(TOKEN_KEY) !== null;
  } catch {
    return false;
  }
}

/** 勾选 / 取消「在这台电脑上记住」 */
export function rememberToken(on: boolean): void {
  try {
    if (on && memoryToken.value) localStorage.setItem(TOKEN_KEY, memoryToken.value);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* 无存储 */
  }
}

export function forgetToken(): void {
  tokenInMemory = '';
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* 无存储 */
  }
}

const API = 'https://api.github.com';
/** 单个文件上限：Git Data API 的 blob 最大 100 MB，base64 之后还要再大三分之一；学习资料用不到这么大 */
export const MAX_BYTES = 25 * 1024 * 1024;

export class GithubError extends Error {}

export function parseRepo(input: string): string | null {
  const s = input.trim().replace(/\.git$/, '').replace(/\/+$/, '');
  const m = /^(?:https?:\/\/github\.com\/)?([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/.exec(s);
  return m ? `${m[1]}/${m[2]}` : null;
}

const cleanDir = (dir: string) => dir.trim().replace(/^\/+|\/+$/g, '');

async function gh<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers: {
        // 公开仓库可以不带令牌（每小时 60 次请求，比较一次只用 3 次）
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new GithubError('连不上 GitHub（api.github.com）。检查网络或代理后再试。');
  }
  if (res.ok) return (res.status === 204 ? null : await res.json()) as T;
  const text = await res.text().catch(() => '');
  const msg = (() => {
    try {
      return (JSON.parse(text) as { message?: string }).message ?? text;
    } catch {
      return text;
    }
  })();
  if (res.status === 401) throw new GithubError('GitHub 不认这个令牌（401）：令牌写错了、过期了，或已被撤销。');
  if (res.status === 403 && !token && /rate limit/i.test(msg)) throw new GithubError('不带令牌时 GitHub 每小时只允许 60 次请求，已经用完了。填一个令牌，或一小时后再试。');
  if (res.status === 403) throw new GithubError(`GitHub 拒绝了（403）：令牌没有这个仓库的 Contents 读写权限，或请求太频繁。${msg ? `（${msg}）` : ''}`);
  if (res.status === 404 && !token) throw new GithubError('找不到（404）：仓库名写错了，或者这是私有仓库——私有仓库要填令牌。');
  if (res.status === 404) throw new GithubError('找不到（404）：仓库名写错了，或者令牌没有授权这个仓库。');
  if (res.status === 409 && /empty/i.test(msg)) throw new EmptyRepo();
  if (res.status === 422) throw new GithubError(`GitHub 不接受这次请求（422）：${msg}`);
  throw new GithubError(`GitHub 出错（HTTP ${res.status}）：${msg.slice(0, 200)}`);
}

class EmptyRepo extends GithubError {
  constructor() {
    super('仓库还是空的');
  }
}

/** git 的 blob SHA-1：与 `git hash-object` 一致 */
export async function gitBlobSha(data: Blob | Uint8Array): Promise<string> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(await data.arrayBuffer());
  const head = new TextEncoder().encode(`blob ${bytes.length}\0`);
  const all = new Uint8Array(head.length + bytes.length);
  all.set(head);
  all.set(bytes, head.length);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', all));
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const b64 = (bytes: Uint8Array) => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/\s/g, '')), (c) => c.charCodeAt(0));

/** 这个路径要不要参与同步：与工作区文件栏同一套规则，外加 .vein/（批注、对话、实验记录） */
export function syncable(path: string): boolean {
  const parts = path.split('/');
  if (parts.slice(0, -1).some((p) => SKIP_DIR.test(p) && p !== '.vein')) return false;
  return parts[0] === '.vein' || Boolean(classify(parts.at(-1)!));
}

export interface RemoteState {
  head: string | null;
  tree: string | null;
  files: Map<string, string>;
}

/** 仓库这一侧：分支的提交、树，以及子目录下每个文件的 blob SHA */
export async function remoteState(token: string, link: Pick<GithubLink, 'repo' | 'branch' | 'dir'>): Promise<RemoteState> {
  const dir = cleanDir(link.dir);
  let head: string;
  try {
    head = (await gh<{ object: { sha: string } }>(token, 'GET', `/repos/${link.repo}/git/ref/heads/${encodeURIComponent(link.branch)}`)).object.sha;
  } catch (e) {
    if (e instanceof EmptyRepo) return { head: null, tree: null, files: new Map() };
    if (e instanceof GithubError && /404/.test(e.message)) {
      // 仓库在、分支不在，与仓库不在是两回事：分开说
      await gh(token, 'GET', `/repos/${link.repo}`);
      throw new GithubError(`仓库里没有「${link.branch}」分支。先在 GitHub 上建好，或改成已有的分支名。`);
    }
    throw e;
  }
  const commit = await gh<{ tree: { sha: string } }>(token, 'GET', `/repos/${link.repo}/git/commits/${head}`);
  const tree = await gh<{ tree: { path: string; type: string; sha: string; size?: number }[]; truncated: boolean }>(
    token,
    'GET',
    `/repos/${link.repo}/git/trees/${commit.tree.sha}?recursive=1`,
  );
  if (tree.truncated) throw new GithubError('仓库文件太多，GitHub 只返回了一部分；请把工作区放进一个子目录并在这里填写。');
  const files = new Map<string, string>();
  const prefix = dir ? `${dir}/` : '';
  for (const e of tree.tree) {
    if (e.type !== 'blob' || !e.path.startsWith(prefix)) continue;
    const rel = e.path.slice(prefix.length);
    if (syncable(rel)) files.set(rel, e.sha);
  }
  return { head, tree: commit.tree.sha, files };
}

/** 这里这一侧：每个文件的 git blob SHA（与仓库同一种指纹，才能直接比） */
export async function localState(store: WorkspaceStore): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const e of await store.list('')) {
    if (!syncable(e.path) || e.size > MAX_BYTES) continue;
    out.set(e.path, await gitBlobSha(await store.read(e.path)));
  }
  return out;
}

export interface Comparison {
  remote: RemoteState;
  changes: Change[];
  same: string[];
}

export async function compareGithub(token: string, store: WorkspaceStore, link: Pick<GithubLink, 'repo' | 'branch' | 'dir' | 'base'>): Promise<Comparison> {
  const [remote, here] = await Promise.all([remoteState(token, link), localState(store)]);
  return { remote, ...planAlign(here, remote.files, link.base) };
}

/**
 * 执行同步：拉下来的写进浏览器工作区，推上去的做成一次提交。
 * `pick` 给冲突文件选边：'here' 用这里的推上去，'there' 用仓库的拉下来；没选的跳过、保持原样。
 */
export async function applyGithub(
  token: string,
  workspace: Workspace,
  link: Omit<GithubLink, 'head' | 'at'> & { head?: string | null },
  cmp: Comparison,
  pick: Record<string, 'here' | 'there' | undefined>,
  message: string,
  store: WorkspaceStore = browserStore(workspace.id),
  persist: (w: Workspace) => Promise<void> = registerWorkspace,
): Promise<{ workspace: Workspace; pushed: number; pulled: number; skipped: number; commit: string | null }> {
  const dir = cleanDir(link.dir);
  const full = (p: string) => (dir ? `${dir}/${p}` : p);
  let ws = workspace;
  let pulled = 0;
  let skipped = 0;
  const toPush: string[] = [];
  for (const c of cmp.changes) {
    const side = c.kind === 'conflict' ? pick[c.path] : c.kind === 'push' ? 'here' : 'there';
    if (!side) {
      skipped += 1;
      continue;
    }
    if (side === 'here') toPush.push(c.path);
    else {
      await store.write(c.path, await pullFile(token, link.repo, cmp.remote.head, full(c.path), cmp.remote.files.get(c.path)!));
      ws = placeBrowserFile(ws, c.path).workspace;
      pulled += 1;
    }
  }

  let head = cmp.remote.head;
  let commit: string | null = null;
  const pushedSha: Record<string, string> = {};
  if (toPush.length) {
    // 比较之后有人推过：停下，不盖掉别人的提交
    const now = await remoteState(token, link);
    if (now.head !== cmp.remote.head) throw new GithubError('比较之后，仓库里又有了新的提交。请点「重新比较」，看清楚再同步。');
    let baseTree = cmp.remote.tree;
    const pending = [...toPush];
    if (head === null) {
      // 空仓库：Git Data API 建不了第一个提交，先用 Contents API 放进第一个文件
      const first = pending.shift()!;
      const bytes = new Uint8Array(await (await store.read(first)).arrayBuffer());
      const r = await gh<{ commit: { sha: string; tree: { sha: string } } }>(token, 'PUT', `/repos/${link.repo}/contents/${full(first).split('/').map(encodeURIComponent).join('/')}`, {
        message,
        content: b64(bytes),
        branch: link.branch,
      });
      head = r.commit.sha;
      baseTree = r.commit.tree.sha;
      commit = head;
      pushedSha[first] = await gitBlobSha(bytes);
    }
    if (pending.length) {
      const entries = [];
      for (const p of pending) {
        const bytes = new Uint8Array(await (await store.read(p)).arrayBuffer());
        const blob = await gh<{ sha: string }>(token, 'POST', `/repos/${link.repo}/git/blobs`, { content: b64(bytes), encoding: 'base64' });
        pushedSha[p] = blob.sha;
        entries.push({ path: full(p), mode: '100644', type: 'blob', sha: blob.sha });
      }
      const tree = await gh<{ sha: string }>(token, 'POST', `/repos/${link.repo}/git/trees`, { base_tree: baseTree, tree: entries });
      const made = await gh<{ sha: string }>(token, 'POST', `/repos/${link.repo}/git/commits`, { message, tree: tree.sha, parents: [head] });
      // force: false——分支在这期间被别人移动过，GitHub 会拒绝，不会覆盖
      await gh(token, 'PATCH', `/repos/${link.repo}/git/refs/heads/${encodeURIComponent(link.branch)}`, { sha: made.sha, force: false });
      head = made.sha;
      commit = made.sha;
    }
  }

  // 只有两边确定一致的文件记进 base；跳过的冲突保持「两边都改过」
  const here = await localState(store);
  const remoteAfter = new Map(cmp.remote.files);
  for (const [p, sha] of Object.entries(pushedSha)) remoteAfter.set(p, sha);
  for (const c of cmp.changes) if ((c.kind === 'pull' || pick[c.path] === 'there') && here.has(c.path)) remoteAfter.set(c.path, here.get(c.path)!);
  const base: Record<string, string> = { ...link.base };
  for (const [p, sha] of here) if (remoteAfter.get(p) === sha) base[p] = sha;
  ws = { ...ws, github: { repo: link.repo, branch: link.branch, dir, head, base, at: Date.now() } };
  await persist(ws);
  return { workspace: ws, pushed: toPush.length, pulled, skipped, commit };
}

/** 取仓库里的一个文件：有令牌走 API（私有仓库也行）；没有令牌走 raw 地址（公开仓库，不占 API 限额） */
async function pullFile(token: string, repo: string, head: string | null, path: string, sha: string): Promise<Blob> {
  if (token || !head) {
    const blob = await gh<{ content: string }>(token, 'GET', `/repos/${repo}/git/blobs/${sha}`);
    return new Blob([unb64(blob.content)]);
  }
  let res: Response;
  try {
    res = await fetch(`https://raw.githubusercontent.com/${repo}/${head}/${path.split('/').map(encodeURIComponent).join('/')}`);
  } catch {
    throw new GithubError('连不上 raw.githubusercontent.com。检查网络或代理后再试。');
  }
  if (!res.ok) throw new GithubError(`下载 ${path} 失败（HTTP ${res.status}）。`);
  return await res.blob();
}

/**
 * 从 GitHub 导入：把仓库（或其中一个子目录）复制成一个新的浏览器工作区，并记住这个仓库。
 * 先读仓库再建工作区——仓库名写错时不留下空工作区。导入后文件长期存在这台电脑的浏览器里，
 * 之后在文件栏点「同步 GitHub」随时拉取更新或推回去。
 */
export async function importGithub(
  token: string,
  target: Pick<GithubLink, 'repo' | 'branch' | 'dir'>,
): Promise<{ workspace: Workspace; pulled: number }> {
  const remote = await remoteState(token, target);
  if (!remote.files.size) throw new GithubError('这个仓库（或子目录）里没有能打开的文件（Markdown、PDF、图片、HTML、JSON）。');
  const dir = cleanDir(target.dir);
  const name = dir ? dir.split('/').pop()! : target.repo.split('/')[1]!;
  const ws = await createBrowserWorkspace(name);
  const cmp: Comparison = { remote, ...planAlign(new Map(), remote.files, {}) };
  try {
    const r = await applyGithub(token, ws, { ...target, dir, base: {} }, cmp, {}, '');
    await keepStorage();
    return { workspace: r.workspace, pulled: r.pulled };
  } catch (e) {
    // 中途失败：已经下载的保留在工作区里，下次「同步 GitHub」会补齐
    throw new GithubError(`导入到一半停了：${(e as Error).message} 已下载的文件留在工作区「${name}」里，可以在文件栏点「同步 GitHub」补齐。`);
  }
}

export async function unlinkGithub(workspace: Workspace): Promise<Workspace> {
  const { github: _drop, ...rest } = workspace;
  await registerWorkspace(rest);
  return rest;
}
