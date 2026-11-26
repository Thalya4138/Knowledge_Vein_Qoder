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
const PORT = 4184;
const CDP_PORT = 9346;
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
const profile = mkdtempSync(join(tmpdir(), 'vein-tour-'));
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
  // ---------- 聚光灯导览验收（app/tour）：22 站逐站走完 ----------
  const { TOUR } = await import(pathToFileURL(resolve('apps/web/src/app/tour/stops.ts')).href);
  const cardState = `(() => {
    const c = document.querySelector('.tour-card');
    if (!c) return null;
    const h = document.querySelector('.tour-hole');
    const r = c.getBoundingClientRect();
    return {
      title: c.querySelector('.tour-title')?.textContent,
      count: c.querySelector('.tour-count')?.textContent.replace(/\\s+/g, ''),
      searching: !!document.querySelector('.tour[data-searching]'),
      hole: h ? h.getBoundingClientRect().toJSON() : null,
      card: r.toJSON(),
      vw: innerWidth, vh: innerHeight,
      path: location.pathname + location.search,
    };
  })()`;
  const waitStop = async (title) => {
    for (let i = 0; i < 100; i++) {
      const s = await evaluate(cardState);
      if (s && s.title === title && !s.searching) {
        // 慢页面上说明卡会先居中、元素出现后才补高亮：再给它 6 秒
        for (let k = 0; k < 60 && !(await evaluate(`!!document.querySelector('.tour-hole')`)); k++) await sleep(100);
        await sleep(450); // 等平滑滚动与 300ms 跟随
        return evaluate(cardState);
      }
      await sleep(100);
    }
    return evaluate(cardState);
  };
  const inView = (s) => s.card.left >= 0 && s.card.top >= 0 && s.card.right <= s.vw + 0.5 && s.card.bottom <= s.vh + 0.5;
  const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

  await viewport(1440, 900, false);
  await navigate('/');
  await evaluate(`sessionStorage.clear(); localStorage.removeItem('vein.lang'); true`);
  await navigate('/');
  await waitFor(`document.querySelector('.cover-tour')`);
  await evaluate(`document.querySelector('.cover-tour').click(), true`);
  const SHOTS = { 'cover-entries': 'tour-cover-1440.png', 'ws-golink': 'tour-golink-1440.png', 'lab-result': 'tour-lab-1440.png', 'cx-graph': 'tour-cxgraph-1440.png', 'atlas-insp': 'tour-atlas-1440.png', 'atlas-memory': 'tour-memory-1440.png' };
  const missing = [];
  const offscreen = [];
  const covered = [];
  for (let i = 0; i < TOUR.length; i++) {
    const stop = TOUR[i];
    const s = await waitStop(stop.zh.title);
    if (!s || s.title !== stop.zh.title) { check(`第 ${i + 1} 站到站：${stop.id}`, false, JSON.stringify(s)); break; }
    if (!s.hole) missing.push(stop.id);
    if (!inView(s)) offscreen.push(stop.id);
    // 卡片压住亮洞超过亮洞面积的 35%，就算挡住了要看的东西（全屏级目标除外：亮洞占视口 60% 以上时只能压在里面）
    if (s.hole) {
      const holeArea = s.hole.width * s.hole.height;
      if (holeArea < s.vw * s.vh * 0.6 && overlap(s.hole, s.card) > holeArea * 0.35) covered.push(stop.id);
    }
    if (SHOTS[stop.id]) await screenshot(SHOTS[stop.id]);
    if (i === 6) {
      // 刷新后接着走
      await send('Page.reload');
      await sleep(400);
      const r = await waitStop(stop.zh.title);
      check('刷新后停在同一站', r?.title === stop.zh.title && r?.count === `${i + 1}/${TOUR.length}`, JSON.stringify(r?.count));
    }
    await evaluate(`document.querySelector('.tour-actions .btn.primary').click(), true`);
  }
  check('每一站都找到并高亮了目标', missing.length === 0, missing.join(', '));
  check('说明卡始终完整在视口内（1440）', offscreen.length === 0, offscreen.join(', '));
  check('说明卡不挡住要看的目标', covered.length === 0, covered.join(', '));
  check('最后一站「完成」后导览关闭', !(await evaluate(`!!document.querySelector('.tour')`)) && !(await evaluate(`sessionStorage.getItem('vein.tour.step')`)));
  // 导览恢复时会自己跳走，所以这里不等地址落定
  const goto = async (p) => { await send('Page.navigate', { url: `http://127.0.0.1:${PORT}${p}` }); await sleep(800); };
  // 回到 cx-graph 那一站再走一遍：示例对话不应重复入历史
  const cxAt = TOUR.findIndex((x) => x.id === 'cx-graph');
  await goto('/');
  await evaluate(`sessionStorage.setItem('vein.tour.step', '${cxAt}'), true`);
  await send('Page.reload');
  await waitStop(TOUR[cxAt].zh.title);
  await evaluate(`document.querySelector('.cx-head-end button[aria-expanded]')?.click(), true`);
  await sleep(400);
  const hist = await evaluate(`[...document.querySelectorAll('.cx-history li')].map((li) => li.textContent.trim())`);
  const dupTitles = hist.length - new Set(hist).size;
  check('示例对话重复点开不在历史里堆重复', dupTitles === 0, `历史 ${hist.length} 条，重复 ${dupTitles}`);
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); true`);
  await sleep(200);
  check('Esc 结束导览', !(await evaluate(`!!document.querySelector('.tour')`)));

  // 英文
  await goto('/');
  await evaluate(`localStorage.setItem('vein.lang', 'en'); sessionStorage.setItem('vein.tour.step', '0'); true`);
  await send('Page.reload');
  const en0 = await waitStop(TOUR[0].en.title);
  check('英文界面导览用英文', en0?.title === TOUR[0].en.title, en0?.title);
  await screenshot('tour-en-cover-1440.png');
  await evaluate(`localStorage.removeItem('vein.lang'); sessionStorage.clear(); true`);

  // 窄屏：卡片钉在底部、不出屏
  await viewport(414, 800, true);
  const narrowBad = [];
  for (const i of [0, 4, 8, 12, 17, 20]) {
    await evaluate(`sessionStorage.setItem('vein.tour.step', '${i}'), true`);
    await send('Page.reload');
    const s = await waitStop(TOUR[i].zh.title);
    if (!s || s.title !== TOUR[i].zh.title || !inView(s) || s.card.bottom < s.vh - 20) narrowBad.push(`${TOUR[i].id}:${JSON.stringify(s?.card)}`);
    if (i === 4) {
      await screenshot('tour-reader-414.png');
      const pw = await evaluate(`Math.min(...[...document.querySelectorAll('.nr-problem .nr-co-body > p')].filter((p) => !p.querySelector('img')).map((p) => p.getBoundingClientRect().width))`);
      check('窄屏「问题探讨」正文不被图片列挤窄', pw >= 250, `最窄段落 ${Math.round(pw)}px`);
    }
    if (i === 17) await screenshot('tour-atlas-414.png');
  }
  check('窄屏说明卡贴底且完整可见', narrowBad.length === 0, narrowBad.join(' | '));
  const ox = await evaluate(`document.documentElement.scrollWidth - innerWidth`);
  check('窄屏无横向溢出', ox <= 0, `overflowX=${ox}`);

  // ---------- 入门文档 ----------
  await viewport(1440, 900, false);
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); sessionStorage.clear(); true`);
  await sleep(200);
  await goto('/guide');
  await waitFor(`document.querySelector('.guide-tour button')`);
  await screenshot('guide-zh-1440.png');
  const zhSections = await evaluate(`document.querySelectorAll('.guide-body section').length`);
  check('入门文档九节齐全', zhSections === 9, `${zhSections} 节`);
  await evaluate(`document.querySelector('.guide-tour button').click(), true`);
  const g0 = await waitStop(TOUR[0].zh.title);
  check('入门文档里的按钮能启动导览', g0?.title === TOUR[0].zh.title && g0.path === '/', JSON.stringify(g0?.path));
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })), true`);
  await sleep(200);
  await evaluate(`localStorage.setItem('vein.lang', 'en'), true`);
  await goto('/guide');
  await waitFor(`document.querySelector('.guide-tour button')`);
  const cjk = await evaluate(`(() => { const t = document.querySelector('.guide-body').innerText; return (t.match(/[\u4e00-\u9fff]/g) || []).length; })()`);
  // 英文版只允许出现界面里仍是中文的按钮名（如「收进图谱」）和中文切换键
  check('英文入门文档基本无中文', cjk <= 12, `${cjk} 个汉字`);
  await screenshot('guide-en-1440.png');
  await viewport(414, 800, true);
  await sleep(300);
  const gox = await evaluate(`document.documentElement.scrollWidth - innerWidth`);
  check('窄屏入门文档无横向溢出', gox <= 0, `overflowX=${gox}`);
  await evaluate(`document.getElementById('model').scrollIntoView(), true`);
  await sleep(200);
  await screenshot('guide-en-414.png');
  await evaluate(`localStorage.removeItem('vein.lang'), true`);

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
