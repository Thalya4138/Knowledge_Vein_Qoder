// 验收 #83（接龙 #83）：#1 写入后撤销仍在 / #2 预览操作栏不出屏 / #3 实验室公式渲染 / #4 博查搜索 key 可选 / #5 示例文件栏见新文件。
// 跑法：node scripts/e2e-fix83.mjs。截图进 docs/evidence/。
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p));
if (!CHROME) throw new Error('No Chromium browser found');
const PORT = 4183;
const CDP_PORT = 9349;
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

// #3 的浏览器实测：用应用自己的壳组装一张含公式的页面，交给无头 Chrome 渲染
const shell = await server.ssrLoadModule('/src/features/lab/shell.ts');
const caps = await server.ssrLoadModule('/src/features/lab/toolCaps.ts');
const CORE = `const api = await new Promise((res) => new GGBApplet({ appName: 'graphing', appletOnLoad: res }, true).inject('v-stage'));
api.evalCommand('a = Slider(0.5, 4, 0.1)');
api.evalCommand('c = Curve(sqrt(2)*a*cos(t)/(1+sin(t)^2), sqrt(2)*a*cos(t)*sin(t)/(1+sin(t)^2), t, 0, 2*pi)');
vein.onDraw((p) => { api.evalCommand('SetValue(a,' + p.a + ')'); });`;
const mathPlan = {
  title: '双纽线：到两焦点距离之积为定值',
  tool: 'GeoGebra',
  whyTool: '几何轨迹可拖可量',
  see: '拖动 P 时 $|PF_1|\\cdot|PF_2|=a^2$ 始终成立',
  controls: [{ name: 'a（半焦距）', effect: '曲线随 a 缩放', key: 'a', min: 0.5, max: 4, step: 0.1, value: 2, unit: '' }],
  steps: [],
  facts: [{ claim: '双纽线是卡西尼卵形线的特例，$a^2$ 为定值', source: '无来源，待核对' }],
  caveat: '示意图，非真实比例',
  explain: ['你看到的是一条横放的“8”字。设 $b$ 为投影向量。', '$$P = A(A^T A)^{-1} A^T$$'],
};
const labHtml = shell.assemblePage(mathPlan, caps.capOf('GeoGebra'), CORE, 'zh');
// 独立静态服务器：vite 的 SPA fallback 会把未知路径接回 index.html
const LAB_PORT = 4185;
const labServer = createHttpServer((_req, res) => {
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(labHtml);
});
await new Promise((r) => labServer.listen(LAB_PORT, '127.0.0.1', r));

const profile = mkdtempSync(join(tmpdir(), 'vein-fix83-'));
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
    if (message.method === 'Page.javascriptDialogOpening') {
      void send('Page.handleJavaScriptDialog', { accept: true, promptText: '验收83' });
    }
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
    const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(join(EVIDENCE, name), Buffer.from(result.data, 'base64'));
    return join(EVIDENCE, name);
  };
  const clickText = (sel, text) =>
    evaluate(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => x.textContent.includes(${JSON.stringify(text)})); if (!b) return false; b.click(); return true; })()`);
  const setInput = (sel, value) =>
    evaluate(`(() => { const i = document.querySelector(${JSON.stringify(sel)}); if (!i) return false; const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; set.call(i, ${JSON.stringify(value)}); i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);

  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await viewport(1366, 800, false);

  // ---------- #2 + #5：示例工作区，预览操作栏可见、写入后文件栏见新文件、撤销仍在 ----------
  await navigate('/workspace?ws=linear-algebra');
  await waitFor(`document.getElementById('dock-input')`);
  await evaluate(`document.getElementById('dock-input').dispatchEvent(new FocusEvent('focusin', { bubbles: true })), true`);
  await waitFor(`[...document.querySelectorAll('.dock-tabs [role=tab]')].some((b) => b.textContent.includes('生成讲义'))`);
  await clickText('.dock-tabs [role=tab]', '生成讲义');
  await waitFor(`[...document.querySelectorAll('.desk-panel button')].some((b) => b.textContent.trim() === '生成讲义')`);
  await clickText('.desk-panel button', '生成讲义');
  await waitFor(`document.querySelector('.chg-dialog')`);
  const foot = await evaluate(`(() => { const r = document.querySelector('.chg-foot').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, vh: innerHeight }; })()`);
  check('#2 预览操作栏在 1366×800 可视区内', foot.bottom <= foot.vh && foot.top >= 0, JSON.stringify(foot));
  await screenshot('fix83-preview-1366.png');
  await viewport(420, 800, true);
  const footNarrow = await evaluate(`(() => { const r = document.querySelector('.chg-foot').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, vh: innerHeight }; })()`);
  check('#2 窄屏预览操作栏也在可视区内', footNarrow.bottom <= footNarrow.vh && footNarrow.top >= 0, JSON.stringify(footNarrow));
  await screenshot('fix83-preview-420.png');
  await viewport(1366, 800, false);

  await clickText('.chg-foot button', '确认写入');
  await waitFor(`[...document.querySelectorAll('.chg-foot button')].some((b) => b.textContent.includes('撤销'))`);
  await sleep(600);
  const undoStill = await evaluate(`[...document.querySelectorAll('.chg-foot button')].some((b) => b.textContent.includes('撤销'))`);
  check('#1 示例工作区写入后撤销按钮仍在', undoStill);
  await waitFor(`[...document.querySelectorAll('.ft-row.ft-file')].some((b) => b.textContent.includes('新建讲义'))`);
  check('#5 示例工作区写入后文件栏看到新文件', true);
  await screenshot('fix83-demo-after-write.png');
  await clickText('.chg-foot button', '撤销');
  await waitFor(`![...document.querySelectorAll('.ft-row.ft-file')].some((b) => b.textContent.includes('新建讲义'))`);
  check('#5 撤销后文件栏移除该文件', true);
  await clickText('.chg-foot button', '完成').catch(() => {});
  await evaluate(`document.querySelector('.chg-overlay .chg-head button')?.click(), true`);
  await sleep(300);

  // ---------- #1：新建浏览器工作区，确认写入后撤销不消失（用户原复现路径） ----------
  await clickText('button', '新建空白工作区');
  await waitFor(`new URLSearchParams(location.search).get('ws') && new URLSearchParams(location.search).get('ws') !== 'linear-algebra'`);
  // 坞保持打开且停在「生成讲义」页签（问答输入框只在该页签渲染），等存储接上、按钮可用
  await waitFor(`[...document.querySelectorAll('.desk-panel button')].some((b) => b.textContent.trim() === '生成讲义' && !b.disabled)`);
  await clickText('.desk-panel button', '生成讲义');
  await waitFor(`document.querySelector('.chg-dialog')`);
  await clickText('.chg-foot button', '确认写入');
  await waitFor(`[...document.querySelectorAll('.chg-foot button')].some((b) => b.textContent.includes('撤销'))`);
  await sleep(800);
  const undoBrowser = await evaluate(`(() => { const btns = [...document.querySelectorAll('.chg-foot button')].map((b) => b.textContent.trim()); return { undo: btns.some((t) => t.includes('撤销')), confirm: btns.some((t) => t.includes('确认写入')), btns }; })()`);
  check('#1 浏览器工作区写入后撤销仍在、未重置回待确认', undoBrowser.undo && !undoBrowser.confirm, JSON.stringify(undoBrowser.btns));
  await screenshot('fix83-browser-undo.png');

  // ---------- #4：设置里的搜索 key（隐私规则）＋ 无效 key 找资源如实降级 ----------
  await evaluate(`document.querySelector('.chg-overlay .chg-head button')?.click(), true`);
  await sleep(300);
  await clickText('button[aria-label="设置"]', '');
  await waitFor(`document.querySelector('dialog.settings')?.open`);
  await waitFor(`[...document.querySelectorAll('dialog.settings h2')].some((h) => h.textContent.includes('联网搜索'))`);
  check('#4 设置模型页有独立的联网搜索表单', true);
  await setInput('input[placeholder="sk-…"]', 'invalid-key-83');
  await evaluate(`(() => { const form = [...document.querySelectorAll('dialog.settings form')].find((f) => f.querySelector('h2')?.textContent.includes('联网搜索')); form.querySelector('button[type=submit]').click(); return true; })()`);
  await waitFor(`[...document.querySelectorAll('dialog.settings .settings-result')].some((p) => p.textContent.includes('已保存'))`);
  const privacy = await evaluate(`({ tab: sessionStorage.getItem('vein.search'), kept: localStorage.getItem('vein.search') })`);
  check('#4 搜索 key 默认只存当前标签页', privacy.tab === 'invalid-key-83' && privacy.kept === null, JSON.stringify(privacy));
  await screenshot('fix83-settings-search.png');
  await evaluate(`document.querySelector('dialog.settings .settings-close')?.click(), true`);
  await sleep(300);

  await clickText('.desk-panel button', '找资源');
  await waitFor(`[...document.querySelectorAll('.answer-foot')].some((p) => p.textContent.includes('联网检索不可用'))`);
  const degrade = await evaluate(`[...document.querySelectorAll('.answer-foot')].map((p) => p.textContent).filter((t) => t.includes('联网检索') || t.includes('示例候选')).join(' | ')`);
  check('#4 无效搜索 key：如实说明并降级样例，不伪造结果', degrade.includes('搜索 key 无效') && degrade.includes('示例候选'), degrade);
  await screenshot('fix83-search-degrade.png');

  await clickText('button[aria-label="设置"]', '');
  await waitFor(`document.querySelector('dialog.settings')?.open`);
  await clickText('dialog.settings button', '清除已保存的搜索 key');
  await waitFor(`[...document.querySelectorAll('dialog.settings .settings-result')].some((p) => p.textContent.includes('已清除'))`);
  const cleared = await evaluate(`({ tab: sessionStorage.getItem('vein.search'), kept: localStorage.getItem('vein.search') })`);
  check('#4 一键清除搜索 key', cleared.tab === null && cleared.kept === null, JSON.stringify(cleared));
  await evaluate(`document.querySelector('dialog.settings .settings-close')?.click(), true`);

  // ---------- #3：壳组装页在真实浏览器里渲染 KaTeX ----------
  await send('Page.navigate', { url: `http://127.0.0.1:${LAB_PORT}/` });
  await waitFor(`location.port === '${LAB_PORT}' && document.readyState === 'complete'`);
  await waitFor(`document.querySelector('.katex')`);
  const math = await evaluate(`(() => { const t = document.body.innerText; return { katex: document.querySelectorAll('.katex').length, display: document.querySelectorAll('.katex-display').length, rawB: t.includes('$b$'), rawP: t.includes('$$P') }; })()`);
  check('#3 讲解与事实里的公式渲染成 KaTeX，无裸 $…$', math.katex >= 3 && math.display >= 1 && !math.rawB && !math.rawP, JSON.stringify(math));
  // GeoGebra applet 体积大，等舞台真正出现再截图（最多 30s）
  let stage = false;
  for (let i = 0; i < 300; i++) {
    stage = await evaluate(`Boolean(document.querySelector('#v-stage iframe, #v-stage canvas'))`);
    if (stage) break;
    await sleep(100);
  }
  check('#3 GeoGebra 舞台加载', stage);
  await sleep(1200);
  await screenshot('fix83-lab-math-1366.png');
  await viewport(420, 800, true);
  await sleep(400);
  await screenshot('fix83-lab-math-420.png');

  const appErrors = browserErrors.filter((e) => !/Failed to load resource|net::|ERR_/.test(e));
  check('控制台无应用级错误', appErrors.length === 0, appErrors.slice(0, 3).join(' / '));
} catch (e) {
  failures.push(`脚本异常：${e.message}`);
  console.log('FAIL 脚本异常 —', e.message);
} finally {
  try {
    const ver = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json();
    const bs = new WebSocket(ver.webSocketDebuggerUrl);
    await new Promise((ok) => { bs.onopen = ok; });
    bs.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
    await sleep(800);
  } catch {}
  chrome.kill();
  await server.close();
  labServer.close();
}
console.log(failures.length ? `\n${failures.length} 项未过：${failures.join('；')}` : '\n全部通过');
process.exit(failures.length ? 1 : 0);