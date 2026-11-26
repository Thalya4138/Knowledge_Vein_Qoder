import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyGithub, compareGithub, gitBlobSha, GithubError, parseRepo, syncable } from './github';
import type { Workspace, WorkspaceStore } from './types';

/* ---------- 内存里的 GitHub：只实现同步用到的几个接口，语义照真实 API ---------- */

class FakeGithub {
  head: string | null = null;
  blobs = new Map<string, Uint8Array>();
  trees = new Map<string, Map<string, string>>();
  commits = new Map<string, { tree: string; parents: string[] }>();
  seq = 0;
  calls: string[] = [];
  id = () => `${(++this.seq).toString(16).padStart(40, '0')}`;

  async blob(bytes: Uint8Array) {
    const sha = await gitBlobSha(bytes);
    this.blobs.set(sha, bytes);
    return sha;
  }
  commitFiles(files: Map<string, string>) {
    const tree = this.id();
    this.trees.set(tree, files);
    const sha = this.id();
    this.commits.set(sha, { tree, parents: this.head ? [this.head] : [] });
    this.head = sha;
    return sha;
  }
  /** 别人在网页上改了一个文件并提交 */
  async otherEdit(path: string, text: string) {
    const files = new Map(this.trees.get(this.commits.get(this.head!)!.tree));
    files.set(path, await this.blob(new TextEncoder().encode(text)));
    this.commitFiles(files);
  }
  text(path: string) {
    const sha = this.trees.get(this.commits.get(this.head!)!.tree)!.get(path)!;
    return new TextDecoder().decode(this.blobs.get(sha));
  }

  fetch = async (url: string, init: RequestInit = {}): Promise<Response> => {
    const u = new URL(url);
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(String(init.body)) : null;
    const p = u.pathname.replace('/repos/o/r', '');
    this.calls.push(`${method} ${p}`);
    const json = (status: number, v: unknown) => new Response(JSON.stringify(v), { status });
    if (p === '' && method === 'GET') return json(200, {});
    if (p === '/git/ref/heads/main') return this.head ? json(200, { object: { sha: this.head } }) : json(409, { message: 'Git Repository is empty.' });
    let m = /^\/git\/commits\/(\w+)$/.exec(p);
    if (m) return json(200, { tree: { sha: this.commits.get(m[1]!)!.tree } });
    m = /^\/git\/trees\/(\w+)$/.exec(p);
    if (m && method === 'GET') return json(200, { truncated: false, tree: [...this.trees.get(m[1]!)!].map(([path, sha]) => ({ path, sha, type: 'blob' })) });
    m = /^\/git\/blobs\/(\w+)$/.exec(p);
    if (m) return json(200, { content: btoa(String.fromCharCode(...this.blobs.get(m[1]!)!)) });
    if (p === '/git/blobs' && method === 'POST') return json(201, { sha: await this.blob(Uint8Array.from(atob(body.content), (c) => c.charCodeAt(0))) });
    if (p === '/git/trees' && method === 'POST') {
      const files = new Map(this.trees.get(body.base_tree));
      for (const e of body.tree) files.set(e.path, e.sha);
      const sha = this.id();
      this.trees.set(sha, files);
      return json(201, { sha });
    }
    if (p === '/git/commits' && method === 'POST') {
      const sha = this.id();
      this.commits.set(sha, { tree: body.tree, parents: body.parents });
      return json(201, { sha });
    }
    if (p === '/git/refs/heads/main' && method === 'PATCH') {
      if (this.commits.get(body.sha)!.parents[0] !== this.head) return json(422, { message: 'Update is not a fast forward' });
      this.head = body.sha;
      return json(200, {});
    }
    m = /^\/contents\/(.+)$/.exec(p);
    if (m && method === 'PUT') {
      const path = decodeURIComponent(m[1]!);
      const sha = await this.blob(Uint8Array.from(atob(body.content), (c) => c.charCodeAt(0)));
      const commit = this.commitFiles(new Map([[path, sha]]));
      return json(201, { commit: { sha: commit, tree: { sha: this.commits.get(commit)!.tree } } });
    }
    return json(500, { message: `fake: ${method} ${p}` });
  };
}

function memStore(files: Record<string, string>): WorkspaceStore & { text: (p: string) => Promise<string> } {
  const m = new Map(Object.entries(files).map(([k, v]) => [k, new Blob([v])]));
  return {
    kind: 'browser',
    writable: true,
    list: async () => [...m].map(([path, b]) => ({ path, size: b.size, hash: '' })),
    read: async (p) => m.get(p)!,
    write: async (p, d) => void m.set(p, d),
    remove: async (p) => void m.delete(p),
    text: async (p) => m.get(p)!.text(),
  };
}

const WS: Workspace = { id: 'browser:t', name: 't', glyph: 't', origin: 'browser', folders: [] };
const noSave = async () => undefined;

let gh: FakeGithub;
beforeEach(() => {
  gh = new FakeGithub();
  vi.stubGlobal('fetch', gh.fetch);
});
afterEach(() => vi.unstubAllGlobals());

describe('指纹与规则', () => {
  it('blob 指纹与 git hash-object 一致（含中文）', async () => {
    expect(await gitBlobSha(new TextEncoder().encode('hello\n'))).toBe('ce013625030ba8dba906f756967f9e9ca394464a');
    expect(await gitBlobSha(new TextEncoder().encode('知脉\n'))).toBe('cb60ab6a57004fb6b37c16824231dd3746a48de3');
  });
  it('仓库地址的几种写法', () => {
    expect(parseRepo('o/r')).toBe('o/r');
    expect(parseRepo('https://github.com/o/r.git')).toBe('o/r');
    expect(parseRepo('not a repo')).toBeNull();
  });
  it('只同步工作区文件与 .vein/，跳过依赖与隐藏目录', () => {
    expect(syncable('notes/a.md')).toBe(true);
    expect(syncable('.vein/annotations/a.json')).toBe(true);
    expect(syncable('node_modules/x/readme.md')).toBe(false);
    expect(syncable('.git/config')).toBe(false);
  });
});

describe('同步流程（内存里的 GitHub）', () => {
  const link = { repo: 'o/r', branch: 'main', dir: 'vein', base: {} as Record<string, string> };

  it('空仓库：第一次推送建出提交，之后再比较两边一致', async () => {
    const store = memStore({ 'notes/a.md': '# 一', 'maps/mind.json': '{}' });
    const cmp = await compareGithub('t', store, link);
    expect(cmp.changes.map((c) => c.kind)).toEqual(['push', 'push']);
    const r = await applyGithub('t', WS, link, cmp, {}, '知脉：同步', store, noSave);
    expect(r.pushed).toBe(2);
    expect(gh.text('vein/notes/a.md')).toBe('# 一');
    expect(gh.text('vein/maps/mind.json')).toBe('{}');
    const again = await compareGithub('t', store, r.workspace.github!);
    expect(again.changes).toEqual([]);
  });

  it('只有仓库改了：拉下来；只有这里改了：推上去', async () => {
    const store = memStore({ 'notes/a.md': '# 一' });
    let ws = (await applyGithub('t', WS, link, await compareGithub('t', store, link), {}, 'm', store, noSave)).workspace;
    await gh.otherEdit('vein/notes/a.md', '# 一（网页上改的）');
    let cmp = await compareGithub('t', store, ws.github!);
    expect(cmp.changes).toEqual([{ path: 'notes/a.md', kind: 'pull' }]);
    ws = (await applyGithub('t', ws, ws.github!, cmp, {}, 'm', store, noSave)).workspace;
    expect(await store.text('notes/a.md')).toBe('# 一（网页上改的）');
    await store.write('notes/a.md', new Blob(['# 一（这里又改了）']));
    cmp = await compareGithub('t', store, ws.github!);
    expect(cmp.changes).toEqual([{ path: 'notes/a.md', kind: 'push' }]);
    await applyGithub('t', ws, ws.github!, cmp, {}, 'm', store, noSave);
    expect(gh.text('vein/notes/a.md')).toBe('# 一（这里又改了）');
  });

  it('两边都改了：不选就不动；选了「留这里的」才推', async () => {
    const store = memStore({ 'notes/a.md': '原文' });
    const ws = (await applyGithub('t', WS, link, await compareGithub('t', store, link), {}, 'm', store, noSave)).workspace;
    await gh.otherEdit('vein/notes/a.md', '仓库版');
    await store.write('notes/a.md', new Blob(['这里版']));
    const cmp = await compareGithub('t', store, ws.github!);
    expect(cmp.changes).toEqual([{ path: 'notes/a.md', kind: 'conflict' }]);
    const skip = await applyGithub('t', ws, ws.github!, cmp, {}, 'm', store, noSave);
    expect(skip.skipped).toBe(1);
    expect(gh.text('vein/notes/a.md')).toBe('仓库版');
    expect(await store.text('notes/a.md')).toBe('这里版');
    // 跳过的冲突不记进 base：下次比较仍然是冲突
    expect((await compareGithub('t', store, skip.workspace.github!)).changes[0]!.kind).toBe('conflict');
    await applyGithub('t', ws, ws.github!, cmp, { 'notes/a.md': 'here' }, 'm', store, noSave);
    expect(gh.text('vein/notes/a.md')).toBe('这里版');
  });

  it('比较之后有人推了新提交：拒绝推送，不盖掉别人的提交', async () => {
    const store = memStore({ 'notes/a.md': '一' });
    const ws = (await applyGithub('t', WS, link, await compareGithub('t', store, link), {}, 'm', store, noSave)).workspace;
    await store.write('notes/a.md', new Blob(['二']));
    const cmp = await compareGithub('t', store, ws.github!);
    await gh.otherEdit('vein/notes/b.md', '别人的新文件');
    await expect(applyGithub('t', ws, ws.github!, cmp, {}, 'm', store, noSave)).rejects.toThrow(GithubError);
    expect(gh.text('vein/notes/b.md')).toBe('别人的新文件');
    expect(gh.text('vein/notes/a.md')).toBe('一');
  });

  it('令牌不对：给人话', async () => {
    vi.stubGlobal('fetch', async () => new Response('{"message":"Bad credentials"}', { status: 401 }));
    await expect(compareGithub('t', memStore({}), link)).rejects.toThrow(/不认这个令牌/);
  });
});
