import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p));
if (!CHROME) throw new Error('No Chromium browser found');
const PORT = 4186;
const CDP_PORT = 9348;
const EVIDENCE = resolve('docs/evidence');
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));


/** 让调试端口上的浏览器自己退出（Browser.close）。按 pid 杀不干净：启动器先退出，真正的浏览器不在它的进程树下 */
const closeBrowserOn = async (port) => {
  try {
    const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    const sock = new WebSocket(webSocketDebuggerUrl);
    await new Promise((ok, no) => { sock.onopen = ok; sock.onerror = no; });
    sock.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
    await sleep(800);
    return true;
  } catch {
    return false; // 端口上没有浏览器
  }
};
// 上一次跑崩留下的浏览器会占着调试端口，新的一次会连到它、读到旧状态
if (await closeBrowserOn(CDP_PORT)) console.log('关掉了上一次留下的测试浏览器');

const server = await createServer({ server: { host: '127.0.0.1', port: PORT, strictPort: true } });
await server.listen();
const profile = mkdtempSync(join(tmpdir(), 'vein-github-'));
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${CDP_PORT}`,
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--window-size=1440,900',
  '--enable-unsafe-swiftshader', // 无头模式没有 GPU：WebGL（Three.js、3Dmol、Plotly 三维）走软件渲染
  'about:blank',
], { stdio: 'ignore' });

const failures = [];
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(name);
};

let ws;
try {
  let target;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(100);
    try {
      const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
      target = list.find((item) => item.type === 'page');
    } catch {}
  }
  if (!target) throw new Error('Chrome did not expose a CDP target');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((done, fail) => {
    ws.addEventListener('open', done, { once: true });
    ws.addEventListener('error', fail, { once: true });
  });
  let seq = 0;
  const pending = new Map();
  const browserErrors = [];
  const listeners = new Map();
  const onEvent = (method, fn) => listeners.set(method, fn);
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') browserErrors.push('[log] ' + message.params.entry.text + ' ' + (message.params.entry.url ?? ''));
    if (message.method && listeners.has(message.method)) void listeners.get(message.method)(message.params);
    if (message.method === 'Runtime.exceptionThrown') browserErrors.push(message.params.exceptionDetails.text + ' ' + (message.params.exceptionDetails.exception?.description ?? '').slice(0, 400));
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      browserErrors.push(message.params.args.map((arg) => arg.value ?? arg.description).join(' '));
    }
    if (!message.id || !pending.has(message.id)) return;
    const { resolve: done, reject: fail } = pending.get(message.id);
    pending.delete(message.id);
    message.error ? fail(new Error(JSON.stringify(message.error))) : done(message.result);
  });
  const send = (method, params = {}) => new Promise((done, fail) => {
    const id = ++seq;
    pending.set(id, { resolve: done, reject: fail });
    ws.send(JSON.stringify({ id, method, params }));
  });
  // 页面正在跳转或刷新时，执行上下文会短暂消失：稍等重试，不把时序当成失败
  const evaluate = async (expression) => {
    let result;
    for (let attempt = 0; ; attempt++) {
      try {
        result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        break;
      } catch (e) {
        if (attempt < 25 && /navigated or closed|Cannot find context|context was destroyed/.test(String(e.message))) {
          await sleep(200);
          continue;
        }
        throw e;
      }
    }
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  const waitFor = async (expression) => {
    for (let i = 0; i < 120; i++) {
      if (await evaluate(`Boolean(${expression})`)) return;
      await sleep(100);
    }
    throw new Error(`Timed out waiting for ${expression}`);
  };
  const navigate = async (path) => {
    const url = `http://127.0.0.1:${PORT}${path}`;
    await send('Page.navigate', { url });
    await waitFor(`location.pathname + location.search === ${JSON.stringify(path)} && document.readyState === 'complete'`);
  };
  const viewport = async (width, height, mobile) => {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
    await sleep(200);
  };
  const screenshot = async (name) => {
    const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(join(EVIDENCE, name), Buffer.from(result.data, 'base64'));
    return join(EVIDENCE, name);
  };


  await send('Runtime.enable');
  await send('Log.enable');

  // ---------- GitHub 同步验收 ----------
  // 设了 VEIN_GH_REPO / VEIN_GH_TOKEN（从注册表读，不打印）就对真实仓库测；否则拦截 api.github.com，用内存里的假 GitHub 测界面流程。
  const REAL = Boolean(process.env.VEIN_GH_REPO && process.env.VEIN_GH_TOKEN);
  const REPO = REAL ? process.env.VEIN_GH_REPO : 'o/r';
  const TOKEN = REAL ? process.env.VEIN_GH_TOKEN : 'fake-token';
  const DIR = `vein-e2e-${Date.now().toString(36)}`;
  console.log(REAL ? `真实仓库模式：${REPO}，子目录 ${DIR}` : '假 GitHub 模式（没有设 VEIN_GH_TOKEN）');
  await send('Page.enable');
  onEvent('Page.javascriptDialogOpening', (p) => send('Page.handleJavaScriptDialog', { accept: true, promptText: p.type === 'prompt' ? '同步测试' : undefined }));

  if (!REAL) {
    const { createHash } = await import('node:crypto');
    const sha1 = (b) => createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${b.length}\0`), b])).digest('hex');
    const fake = { head: null, blobs: new Map(), trees: new Map(), commits: new Map(), seq: 0 };
    const id = () => (++fake.seq).toString(16).padStart(40, '0');
    const commitFiles = (files) => { const tree = id(); fake.trees.set(tree, files); const sha = id(); fake.commits.set(sha, { tree, parents: fake.head ? [fake.head] : [] }); fake.head = sha; return sha; };
    globalThis.__fakeGh = { fake, commitFiles, sha1 };
    onEvent('Fetch.requestPaused', async (p) => {
      const cors = [{ name: 'Access-Control-Allow-Origin', value: '*' }, { name: 'Access-Control-Allow-Headers', value: '*' }, { name: 'Access-Control-Allow-Methods', value: 'GET, POST, PATCH, PUT, OPTIONS' }];
      const out = (status, v) => send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: status, responseHeaders: [...cors, { name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify(v)).toString('base64') });
      if (p.request.method === 'OPTIONS') return send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 204, responseHeaders: cors });
      const u = new URL(p.request.url);
      const path = u.pathname.replace('/repos/o/r', '');
      const body = p.request.postData ? JSON.parse(p.request.postData) : null;
      const m = p.request.method;
      let r;
      if (path === '') return out(200, {});
      if (path === '/git/ref/heads/main') return fake.head ? out(200, { object: { sha: fake.head } }) : out(409, { message: 'Git Repository is empty.' });
      if ((r = /^\/git\/commits\/(\w+)$/.exec(path))) return out(200, { tree: { sha: fake.commits.get(r[1]).tree } });
      if ((r = /^\/git\/trees\/(\w+)$/.exec(path)) && m === 'GET') return out(200, { truncated: false, tree: [...fake.trees.get(r[1])].map(([path, sha]) => ({ path, sha, type: 'blob' })) });
      if ((r = /^\/git\/blobs\/(\w+)$/.exec(path))) return out(200, { content: fake.blobs.get(r[1]).toString('base64') });
      if (path === '/git/blobs') { const b = Buffer.from(body.content, 'base64'); const sha = sha1(b); fake.blobs.set(sha, b); return out(201, { sha }); }
      if (path === '/git/trees' && m === 'POST') { const files = new Map(fake.trees.get(body.base_tree)); for (const e of body.tree) files.set(e.path, e.sha); const sha = id(); fake.trees.set(sha, files); return out(201, { sha }); }
      if (path === '/git/commits' && m === 'POST') { const sha = id(); fake.commits.set(sha, { tree: body.tree, parents: body.parents }); return out(201, { sha }); }
      if (path === '/git/refs/heads/main' && m === 'PATCH') { if (fake.commits.get(body.sha).parents[0] !== fake.head) return out(422, { message: 'Update is not a fast forward' }); fake.head = body.sha; return out(200, {}); }
      if ((r = /^\/contents\/(.+)$/.exec(path)) && m === 'PUT') {
        const b = Buffer.from(body.content, 'base64'); const sha = sha1(b); fake.blobs.set(sha, b);
        const prev = fake.head ? new Map(fake.trees.get(fake.commits.get(fake.head).tree)) : new Map();
        prev.set(decodeURIComponent(r[1]), sha);
        const c = commitFiles(prev);
        return out(201, { commit: { sha: c, tree: { sha: fake.commits.get(c).tree } } });
      }
      return out(500, { message: `fake: ${m} ${path}` });
    });
    await send('Fetch.enable', { patterns: [{ urlPattern: 'https://api.github.com/*' }] });
  }

  /** 读仓库里一个文件的内容（真实模式在浏览器里调 API，令牌不出现在输出里） */
  const remoteText = async (path) => {
    if (!REAL) {
      const { fake } = globalThis.__fakeGh;
      const sha = fake.trees.get(fake.commits.get(fake.head).tree).get(path);
      return sha ? fake.blobs.get(sha).toString('utf8') : null;
    }
    return evaluate(`fetch('https://api.github.com/repos/${REPO}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=main', { headers: { authorization: 'Bearer ' + ${JSON.stringify(TOKEN)}, accept: 'application/vnd.github.raw' } }).then((r) => (r.ok ? r.text() : null))`);
  };
  /** 模拟别人在 GitHub 网页上改了一个文件 */
  const remoteEdit = async (path, text) => {
    if (!REAL) {
      const { fake, commitFiles, sha1 } = globalThis.__fakeGh;
      const files = new Map(fake.trees.get(fake.commits.get(fake.head).tree));
      const b = Buffer.from(text); const sha = sha1(b); fake.blobs.set(sha, b); files.set(path, sha); commitFiles(files);
      return true;
    }
    return evaluate(`(async () => {
      const h = { authorization: 'Bearer ' + ${JSON.stringify(TOKEN)}, accept: 'application/vnd.github+json' };
      const url = 'https://api.github.com/repos/${REPO}/contents/${path}';
      const cur = await (await fetch(url + '?ref=main', { headers: h })).json();
      const bytes = new TextEncoder().encode(${JSON.stringify(text)});
      const r = await fetch(url, { method: 'PUT', headers: h, body: JSON.stringify({ message: '验收：模拟在网页上修改', content: btoa(String.fromCharCode(...bytes)), sha: cur.sha, branch: 'main' }) });
      return r.ok; })()`);
  };

  await viewport(1440, 900, false);
  await navigate('/workspace');
  await waitFor(`[...document.querySelectorAll('.rail-item.new')].some((b) => b.textContent.includes('新建空白工作区'))`);
  await evaluate(`[...document.querySelectorAll('.rail-item.new')].find((b) => b.textContent.includes('新建空白工作区')).click(), true`);
  await waitFor(`new URLSearchParams(location.search).get('ws')?.startsWith('browser:')`);
  const wsId = await evaluate(`new URLSearchParams(location.search).get('ws')`);
  // 往这个浏览器工作区写两份文件（直接调站内的存储模块）
  await evaluate(`(async () => { const m = await import('/src/store/browser.ts'); const s = m.browserStore(${JSON.stringify(wsId)});
    await s.write('notes/第一节.md', new Blob(['# 第一节\\n\\n正文。\\n'])); await s.write('maps/mind.json', new Blob(['{"title":"测试"}'])); return true; })()`);

  const openSync = async () => {
    await evaluate(`[...document.querySelectorAll('.tree-auth')].find((b) => /GitHub|同步 /.test(b.textContent)).click(), true`);
    await waitFor(`document.querySelector('dialog.align[open] .gh-form')`);
  };
  const fill = async () => evaluate(`(() => {
    const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    const ins = document.querySelectorAll('dialog.align[open] .gh-form input');
    set(ins[0], ${JSON.stringify(REPO)}); set(ins[1], 'main'); set(ins[2], ${JSON.stringify(DIR)}); set(ins[3], ${JSON.stringify(TOKEN)}); return true; })()`);
  const compareNow = async () => {
    await evaluate(`document.querySelector('dialog.align[open] .gh-form button[type=submit]').click(), true`);
    for (let i = 0; i < 120; i++) {
      const s = await evaluate(`(() => { const d = document.querySelector('dialog.align[open]'); if (!d) return null; const alert = d.querySelector('[role=alert]')?.textContent; if (alert) return { error: alert };
        if (d.querySelector('[role=status]')) return 'loading'; const groups = [...d.querySelectorAll('.align-group')].map((g) => [g.className.replace('align-group ', ''), [...g.querySelectorAll('code')].map((c) => c.textContent)]);
        return d.querySelector('.align-actions .btn.primary:not([type=submit])') ? { groups: Object.fromEntries(groups) } : 'loading'; })()`);
      if (s && s !== 'loading') return s;
      await sleep(250);
    }
    return { error: '比较超时' };
  };
  const syncNow = async () => {
    await evaluate(`[...document.querySelectorAll('dialog.align[open] .align-actions .btn.primary')].find((b) => b.type !== 'submit').click(), true`);
    for (let i = 0; i < 160 && (await evaluate(`!!document.querySelector('dialog.align[open]')`)); i++) await sleep(250);
    return evaluate(`(document.querySelector('dialog.align[open] [role=alert]')?.textContent) || (document.querySelector('.ws-status')?.textContent ?? '')`);
  };

  // 1. 第一次：两份文件都推上去
  await openSync();
  await fill();
  await screenshot('github-sync-form-1440.png');
  let st = await compareNow();
  check('比较：两份新文件都标为「推上去」', !st.error && (st.groups.push ?? []).length === 2, JSON.stringify(st));
  await screenshot('github-sync-compare-1440.png');
  let done = await syncNow();
  check('推送：仓库里出现这两份文件，内容一致', (await remoteText(`${DIR}/notes/第一节.md`)) === '# 第一节\n\n正文。\n' && (await remoteText(`${DIR}/maps/mind.json`)) === '{"title":"测试"}', done);

  // 2. 别人在 GitHub 上改了 → 拉下来
  check('（准备）在仓库那边改一个文件', await remoteEdit(`${DIR}/notes/第一节.md`, '# 第一节\n\n网页上改过的正文。\n'));
  await openSync();
  st = await compareNow();
  check('比较：仓库改过的文件标为「拉下来」', !st.error && (st.groups.pull ?? []).includes('notes/第一节.md') && !(st.groups.push ?? []).length, JSON.stringify(st));
  done = await syncNow();
  const local = await evaluate(`(async () => { const m = await import('/src/store/browser.ts'); return (await m.browserStore(${JSON.stringify(wsId)}).read('notes/第一节.md')).text(); })()`);
  check('拉取：这里的文件变成仓库的新版本', local === '# 第一节\n\n网页上改过的正文。\n', done);

  // 3. 两边都改 → 冲突，选「留这里的」
  await remoteEdit(`${DIR}/notes/第一节.md`, '# 第一节\n\n仓库版。\n');
  await evaluate(`(async () => { const m = await import('/src/store/browser.ts'); await m.browserStore(${JSON.stringify(wsId)}).write('notes/第一节.md', new Blob(['# 第一节\\n\\n这里版。\\n'])); return true; })()`);
  await openSync();
  st = await compareNow();
  check('比较：两边都改过的文件标为冲突', !st.error && (st.groups.conflict ?? []).includes('notes/第一节.md'), JSON.stringify(st));
  await screenshot('github-sync-conflict-1440.png');
  await evaluate(`[...document.querySelectorAll('dialog.align[open] .align-group.conflict .segmented button')].find((b) => b.textContent.includes('留这里')).click(), true`);
  done = await syncNow();
  check('冲突选「留这里的」：仓库变成这里的版本', (await remoteText(`${DIR}/notes/第一节.md`)) === '# 第一节\n\n这里版。\n', done);

  // 4. 令牌错误给人话（真实模式也安全：只是一次 401）
  await openSync();
  await evaluate(`(() => { const el = document.querySelectorAll('dialog.align[open] .gh-form input')[3]; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, 'github_pat_wrong'); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  if (!REAL) onEvent('Fetch.requestPaused', (p) => send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: p.request.method === 'OPTIONS' ? 204 : 401, responseHeaders: [{ name: 'Access-Control-Allow-Origin', value: '*' }, { name: 'Access-Control-Allow-Headers', value: '*' }], body: Buffer.from('{"message":"Bad credentials"}').toString('base64') }));
  st = await compareNow();
  check('令牌错误：提示看得懂', /不认这个令牌/.test(st.error ?? ''), st.error);
  const leaked = await evaluate(`JSON.stringify(localStorage) + JSON.stringify(sessionStorage) + location.href`);
  check('令牌不进浏览器存储与地址', !leaked.includes(TOKEN) && !leaked.includes('github_pat_wrong'));
  // 预期内的网络响应：favicon 404、空仓库探测分支的 409、故意填错令牌的 401。其余任何错误都算失败
  const unexpected = browserErrors.filter((e) => !/favicon\.ico|status of 409 .*git\/ref\/heads|status of 401/.test(e));
  check('控制台无意外错误', unexpected.length === 0, unexpected.slice(0, 3).join(' | '));
} finally {
  ws?.close();
  if (!(await closeBrowserOn(CDP_PORT))) chrome.kill();
  await server.close();
}
if (failures.length) {
  console.log(`\n${failures.length} 项未过：${failures.join('；')}`);
  process.exit(1);
}
console.log('\n全部通过');
