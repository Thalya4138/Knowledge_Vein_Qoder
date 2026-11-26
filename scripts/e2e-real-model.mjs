import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
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
const PORT = 4187;
const CDP_PORT = 9349;
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
const profile = mkdtempSync(join(tmpdir(), 'vein-real-'));
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

  // ---------- 真实模型验收：模型、地址、key 全部从环境变量读，不打印、不写文件 ----------
  const BASE = process.env.VEIN_TEST_BASE;
  const MODEL = process.env.VEIN_TEST_MODEL;
  const KEY = process.env.VEIN_TEST_KEY;
  if (!BASE || !MODEL || !KEY) throw new Error('没有设置 VEIN_TEST_BASE / VEIN_TEST_MODEL / VEIN_TEST_KEY');
  const OUT = join(tmpdir(), 'vein-real');
  mkdirSync(OUT, { recursive: true });
  console.log(`真实模型：${MODEL} @ ${new URL(BASE).host}；产出写到 ${OUT}`);

  await viewport(1440, 900, false);
  await navigate('/lab?ws=linear-algebra');
  await waitFor(`document.querySelector('.lab-composer')`);
  await evaluate(`document.querySelector('button[aria-label="设置"]').click(), true`);
  await waitFor(`document.querySelector('.settings-form input[type=password]')`);
  await evaluate(`(() => {
    const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    const ins = [...document.querySelectorAll('.settings-form input')].filter((i) => i.type !== 'radio' && i.type !== 'checkbox');
    set(ins[0], ${JSON.stringify(BASE)}); set(ins[1], ${JSON.stringify(MODEL)}); set(document.querySelector('.settings-form input[type=password]'), ${JSON.stringify(KEY)});
    return true; })()`);
  await sleep(200);
  await evaluate(`document.querySelector('.settings-form button[type=submit]').click(), true`);
  await sleep(300);
  await evaluate(`document.querySelector('.settings-close')?.click(), true`);
  await sleep(300);
  const spa = async (path) => {
    await evaluate(`history.pushState({}, '', ${JSON.stringify(path)}), dispatchEvent(new PopStateEvent('popstate')), true`);
    await sleep(300);
  };

  // 实验室：三道题，覆盖指定浏览器工具、自动选择、本地工具
  const LAB = [
    { q: '为什么最小二乘的最近点就是正交投影？拖动数据点看残差', tool: 'GeoGebra' },
    { q: '单摆从小角度到大角度，周期怎么变', tool: null },
    { q: '傅里叶级数怎样一项一项逼近方波', tool: 'Manim' },
  ];
  for (const [i, c] of LAB.entries()) {
    const t0 = Date.now();
    await spa(`/lab?ws=linear-algebra&q=${encodeURIComponent(c.q)}${c.tool ? `&tool=${encodeURIComponent(c.tool)}` : ''}`);
    let st;
    for (let k = 0; k < 720; k++) {
      st = await evaluate(`({ tag: document.querySelector('.lab-bar .lab-tag')?.textContent ?? '', note: document.querySelector('.lab-results .lab-note')?.textContent ?? '', stage: document.querySelector('.lab-gen-stage')?.textContent ?? '' })`);
      if (/已运行|没有跑起来|本地运行/.test(st.tag) || st.note) break;
      await sleep(500);
    }
    const secs = Math.round((Date.now() - t0) / 1000);
    await sleep(6000);
    await screenshot(`real-lab-${i + 1}.png`);
    const dump = await evaluate(`(() => {
      const f = document.querySelector('.lab-gen iframe');
      const src = f?.getAttribute('src') ?? '';
      let html = '';
      if (src.startsWith('data:')) { const b = atob(src.split(',')[1]); html = new TextDecoder().decode(Uint8Array.from(b, (c) => c.charCodeAt(0))); }
      return { html, code: document.querySelector('.lab-gen-pre code')?.textContent ?? '', title: document.querySelector('.lab-bar-name')?.textContent ?? '',
        sub: document.querySelector('.lab-gen-sub')?.textContent ?? '', errors: [...document.querySelectorAll('.lab-gen-failed li')].map((l) => l.textContent),
        explain: document.querySelector('.lab-gen-explain')?.innerText ?? '', facts: document.querySelector('.lab-gen-facts')?.innerText ?? '' }; })()`);
    writeFileSync(join(OUT, `lab-${i + 1}.json`), JSON.stringify({ ...c, secs, status: st, ...dump }, null, 2));
    if (dump.html) writeFileSync(join(OUT, `lab-${i + 1}.html`), dump.html);
    console.log(`实验室 ${i + 1}「${c.q}」：${st.tag || st.note} · ${secs}s · ${dump.title}${dump.errors.length ? ' · 错误 ' + dump.errors.join(' | ') : ''}`);
  }

  // 关联探索：碎片串联，一道示例之外的题
  {
    const ask = '贪心算法里的交换论证，和最短路 Dijkstra 为什么要求边权非负，是不是同一回事？';
    await spa('/connection?ws=linear-algebra&mode=fragments');
    await waitFor(`document.querySelector('#cx-input')`);
    await evaluate(`(() => { const el = document.querySelector('#cx-input'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, ${JSON.stringify(ask)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    await sleep(200);
    const t0 = Date.now();
    await evaluate(`document.querySelector('.cx-send').click(), true`);
    await sleep(1500);
    for (let k = 0; k < 1200 && (await evaluate(`!!document.querySelector('.answer.pending')`)); k++) await sleep(500);
    const secs = Math.round((Date.now() - t0) / 1000);
    const res = await evaluate(`({ error: document.querySelector('.answer.notice.error')?.innerText ?? '', text: [...document.querySelectorAll('.turn .answer')].at(-1)?.innerText ?? '', edges: document.querySelectorAll('.cx-graph path, .cx-graph line').length })`);
    writeFileSync(join(OUT, 'explore-fragments.md'), `# ${ask}\n\n用时 ${secs}s\n\n${res.error || res.text}`);
    await screenshot('real-explore-1.png');
    console.log(`关联探索：${res.error ? '出错 ' + res.error.slice(0, 200) : `完成，${res.text.length} 字`} · ${secs}s`);
  }
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
