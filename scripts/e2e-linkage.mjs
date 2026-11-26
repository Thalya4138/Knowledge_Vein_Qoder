import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p));
if (!CHROME) throw new Error('No Chromium browser found');
const PORT = 4177;
const CDP_PORT = 9342;
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
const profile = mkdtempSync(join(tmpdir(), 'vein-linkage-'));
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${CDP_PORT}`,
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--window-size=1440,900',
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

  // 不开 Runtime 就收不到控制台事件，「控制台无错误」会变成永远通过的空检查
  await send('Runtime.enable');
  await send('Log.enable');
  // ---------- 联动验收（TASK_R2_LINKAGE L4 / L5 / L6）：讲义 ⇄ 导图 ⇄ 关联探索 / 实验室 ----------
  const WS = 'linear-algebra';
  await viewport(1440, 900, false);

  // 1. 讲义标题旁的「在导图里看」：示例讲义五个标题有知识点锚定（一级标题 + 四个二级标题）
  await navigate(`/workspace?ws=${WS}&file=note-2-1`);
  await waitFor(`document.querySelectorAll('.nr-golink').length >= 5`);
  const golinks = await evaluate(`[...document.querySelectorAll('.nr-golink')].map((a) => a.closest('.nr-h').id)`);
  check('讲义：五个锚定标题都有「在导图里看」', golinks.length === 5, golinks.join(' / '));
  await evaluate(`document.getElementById('法方程').scrollIntoView({ block: 'center' }), true`);
  await sleep(300);
  await screenshot('linkage-reader-1440.png');

  // 2. 讲义 → 导图：选中挂着「法方程」的主题
  await evaluate(`document.getElementById('法方程').querySelector('.nr-golink').click(), true`);
  await waitFor(`location.pathname === '/atlas' && new URLSearchParams(location.search).get('focus') === 'n.normal-eq'`);
  await waitFor(`document.querySelector('.me-node.sel')`);
  const picked = await evaluate(`({ node: document.querySelector('.me-node.sel').textContent, insp: document.querySelector('.me-insp-body .me-title')?.textContent ?? '' })`);
  check('讲义 → 导图：选中对应主题并打开详情', /法方程/.test(picked.node) && /法方程/.test(picked.insp), JSON.stringify(picked));
  const go = await evaluate(`[...document.querySelectorAll('.me-go-link')].map((a) => ({ t: a.textContent, href: a.getAttribute('href') }))`);
  check('导图详情：有「打开讲义对应处」与「拿去关联探索」', go.length === 2 && /讲义/.test(go[0].t) && /探索/.test(go[1].t), go.map((g) => g.t).join(' / '));
  const topicId = await evaluate(`document.querySelector('.me-node.sel').dataset.id`);
  await screenshot('linkage-atlas-1440.png');

  // 3. 导图 → 讲义：站内跳转（不整页刷新）并定位到该节
  await evaluate(`window.__noReload = 1, true`);
  await evaluate(`document.querySelectorAll('.me-go-link')[0].click(), true`);
  await waitFor(`location.pathname === '/workspace' && decodeURIComponent(location.hash) === '#法方程'`);
  await waitFor(`document.getElementById('法方程')`);
  await sleep(1200);
  const landed = await evaluate(`({ top: Math.round(document.getElementById('法方程').getBoundingClientRect().top), spa: window.__noReload === 1 })`);
  check('导图 → 讲义：站内跳转并滚到「法方程」', landed.spa && landed.top >= 0 && landed.top < 320, JSON.stringify(landed));

  // 4. 导图 → 关联探索：碎片串联模式，问题预填（含邻居），不自动发送
  await navigate(`/atlas?ws=${WS}&map=mind&focus=n.normal-eq`);
  await waitFor(`document.querySelectorAll('.me-go-link').length === 2`);
  await evaluate(`document.querySelectorAll('.me-go-link')[1].click(), true`);
  await waitFor(`location.pathname === '/connection' && document.querySelector('.cx textarea')`);
  await sleep(300);
  const ask = await evaluate(`({ mode: new URLSearchParams(location.search).get('mode'), q: document.querySelector('.cx textarea').value })`);
  check('导图 → 关联探索：碎片串联、问题带上主题与邻居', ask.mode === 'fragments' && /「法方程/.test(ask.q) && /相连/.test(ask.q), ask.q);

  // 5. 实验室 → 导图：脚注里的主题名回到导图并选中它
  await navigate(`/lab?ws=${WS}&viz=viz.quadric-surfaces&node=${encodeURIComponent(topicId)}`);
  await waitFor(`document.querySelector('.lab-foot-topic')`);
  const back = await evaluate(`document.querySelector('.lab-foot-topic').getAttribute('href')`);
  check('实验室脚注：主题名是回到导图的链接', new URL(back, 'http://x.test').searchParams.get('focus') === topicId, back);
  await evaluate(`document.querySelector('.lab-foot-topic').click(), true`);
  await waitFor(`location.pathname === '/atlas' && document.querySelector('.me-node.sel')`);
  const backSel = await evaluate(`document.querySelector('.me-node.sel').dataset.id`);
  check('实验室 → 导图：选中同一个主题', backSel === topicId, backSel);

  // 6. 窄屏：讲义标题的链接不撑出横向滚动
  await viewport(414, 800, true);
  await navigate(`/workspace?ws=${WS}&file=note-2-1`);
  await waitFor(`document.querySelectorAll('.nr-golink').length >= 5`);
  await evaluate(`document.getElementById('点唯一参数未必唯一').scrollIntoView({ block: 'center' }), true`);
  await sleep(300);
  const ox = await evaluate(`document.documentElement.scrollWidth - innerWidth`);
  check('窄屏：讲义无横向溢出', ox <= 0, `overflowX=${ox}`);
  await screenshot('linkage-reader-414.png');

  check('控制台无错误', browserErrors.length === 0, browserErrors.slice(0, 3).join(' | '));
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
