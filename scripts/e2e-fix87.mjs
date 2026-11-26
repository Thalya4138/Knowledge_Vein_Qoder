// 验收 #87（接龙 #87）：资源抽屉不再被页眉遮挡——portal 挂 body 后抽屉与遮罩盖住全 viewport。
// 跑法：node scripts/e2e-fix87.mjs。截图进 docs/evidence/。
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p));
if (!CHROME) throw new Error('No Chromium browser found');
const PORT = 4187;
const CDP_PORT = 9351;
const EVIDENCE = resolve('docs/evidence');
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const closeBrowserOn = async (port) => {
  try {
    const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    const sock = new WebSocket(webSocketDebuggerUrl);
    await new Promise((ok, no) => { sock.onopen = ok; sock.onerror = no; });
    sock.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
    await sleep(800);
    return true;
  } catch {
    return false;
  }
};
if (await closeBrowserOn(CDP_PORT)) console.log('关掉了上一次留下的测试浏览器');

const server = await createServer({ server: { host: '127.0.0.1', port: PORT, strictPort: true } });
await server.listen();

const profile = mkdtempSync(join(tmpdir(), 'vein-fix87-'));
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${CDP_PORT}`,
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--no-proxy-server',
  '--window-size=1366,800',
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
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') browserErrors.push(message.params.exceptionDetails.text);
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
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    const { writeFileSync } = await import('node:fs');
    writeFileSync(join(EVIDENCE, name), Buffer.from(data, 'base64'));
    console.log(`截图 ${name}`);
  };
  await send('Page.enable');
  await send('Runtime.enable');

  await navigate('/workspace');
  await waitFor(`document.querySelectorAll('.ws-tree button').length > 0`);
  // 逐个点文件栏，直到阅读器里出现资源卡（示例讲义带视频资源）
  const opened = await evaluate(`(async () => {
    const buttons = [...document.querySelectorAll('.ws-tree button')];
    for (const b of buttons) {
      b.click();
      await new Promise((r) => setTimeout(r, 350));
      if (document.querySelector('button.nr-res')) return b.textContent.trim();
    }
    return null;
  })()`);
  check('打开带资源卡的讲义', Boolean(opened), opened ?? '未找到');
  await evaluate(`document.querySelector('button.nr-res').click()`);
  await waitFor(`document.querySelector('.nr-drawer')`);
  await sleep(350); // 滑入动画结束

  const geo = await evaluate(`(() => {
    const d = document.querySelector('.nr-drawer');
    const close = document.querySelector('.nr-drawer-close');
    const title = document.querySelector('.nr-d-title');
    const scrim = document.querySelector('.nr-scrim');
    const r = d.getBoundingClientRect();
    const c = close.getBoundingClientRect();
    const t = title.getBoundingClientRect();
    const at = (x, y) => { const el = document.elementFromPoint(x, y); return el ? (el.className.baseVal ?? el.className) : ''; };
    const hit = (x, y, node) => { const el = document.elementFromPoint(x, y); return Boolean(el && (el === node || node.contains(el))); };
    return {
      top: r.top, left: r.left, bottom: r.bottom,
      closeTop: c.top,
      closeHit: hit(c.left + c.width / 2, c.top + c.height / 2, close),
      titleTop: t.top,
      titleHit: hit(t.left + 10, t.top + t.height / 2, title),
      headerRightScrim: at(innerWidth - 60, 10).includes('nr-scrim'),
      headerLeftDrawer: hit(200, 10, d),
      focusClose: document.activeElement === close,
      parentBody: d.parentElement === document.body && scrim.parentElement === document.body,
      vh: innerHeight,
    };
  })()`);
  check('抽屉贴viewport左上、通到底', geo.top === 0 && geo.left === 0 && Math.abs(geo.bottom - geo.vh) < 2, JSON.stringify({ top: geo.top, left: geo.left, bottom: geo.bottom, vh: geo.vh }));
  check('关闭按钮可见可点', geo.closeTop >= 0 && geo.closeHit, `top=${geo.closeTop}`);
  check('标题完整不被页眉盖', geo.titleTop > 0 && geo.titleHit, `top=${geo.titleTop}`);
  check('遮罩盖住页眉右段', geo.headerRightScrim);
  check('抽屉压在页眉左段之上', geo.headerLeftDrawer);
  check('打开后焦点在关闭按钮', geo.focusClose);
  check('抽屉与遮罩挂在body', geo.parentBody);
  await screenshot('fix87-drawer-1366.png');

  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await waitFor(`!document.querySelector('.nr-drawer')`);
  check('Esc 关闭抽屉', true);

  await evaluate(`document.querySelector('button.nr-res').click()`);
  await waitFor(`document.querySelector('.nr-drawer')`);
  await viewport(420, 800, true);
  await sleep(350);
  const narrow = await evaluate(`(() => {
    const r = document.querySelector('.nr-drawer').getBoundingClientRect();
    const c = document.querySelector('.nr-drawer-close').getBoundingClientRect();
    return { top: r.top, width: r.width, vw: innerWidth, closeTop: c.top, overflowX: document.documentElement.scrollWidth > innerWidth };
  })()`);
  check('窄屏抽屉全宽且顶部不被盖', narrow.top === 0 && Math.abs(narrow.width - narrow.vw) < 2 && narrow.closeTop >= 0 && !narrow.overflowX, JSON.stringify(narrow));
  await screenshot('fix87-drawer-420.png');

  const appErrors = browserErrors.filter((e) => !/favicon|React Devtools|Download the React/i.test(e));
  check('控制台无应用级错误', appErrors.length === 0, appErrors.join(' | ').slice(0, 300));
} catch (e) {
  failures.push(String(e.message ?? e));
  console.error(e);
} finally {
  try { ws?.close(); } catch {}
  chrome.kill();
  await server.close();
}
console.log(failures.length ? `FAILURES: ${failures.join(' / ')}` : 'ALL PASS');
process.exit(failures.length ? 1 : 0);