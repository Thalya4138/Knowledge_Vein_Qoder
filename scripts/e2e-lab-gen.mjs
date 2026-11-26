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
const PORT = 4185;
const CDP_PORT = 9347;
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
const profile = mkdtempSync(join(tmpdir(), 'vein-labgen-'));
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


  // 不开 Runtime 就收不到控制台事件，「控制台无错误」会变成永远通过的空检查
  await send('Runtime.enable');
  await send('Log.enable');
  // 沙箱 iframe 在独立进程里：挂上子框架的会话，才看得到它的控制台与异常
  let childSeq = 900000;
  onEvent('Target.attachedToTarget', (p) => {
    for (const method of ['Runtime.enable', 'Log.enable']) ws.send(JSON.stringify({ id: ++childSeq, method, sessionId: p.sessionId }));
  });
  await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
  // ---------- 现场生成验收：真实的库在沙箱里能不能跑起来（模型用假的，页面是手写的最小调用） ----------
  const { CAPS, PHET_SIMS } = await import(pathToFileURL(resolve('apps/web/src/features/lab/toolCaps.ts')).href);
  const lib = (name, i = 0) => CAPS.find((c) => c.name === name).libs[i];
  const doc = (head, body) => `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">${head}</head><body style="margin:0;font:14px sans-serif">${body}</body></html>`;
  const s = (src) => `<script src="${src}"></script>`;
  const PAGES = {
    GeoGebra: doc(s(lib('GeoGebra')), `<div id="g"></div><script>new GGBApplet({appName:'graphing',width:760,height:460,showToolBar:false,showAlgebraInput:false,appletOnLoad:function(api){api.evalCommand('a=Slider(-3,3)');api.evalCommand('f(x)=a*x^2');window.veinReady();}},true).inject('g');</script>`),
    JSXGraph: doc(s(lib('JSXGraph')) + `<link rel="stylesheet" href="${lib('JSXGraph', 1)}">`, `<div id="b" style="width:600px;height:400px"></div><script>var b=JXG.JSXGraph.initBoard('b',{boundingbox:[-5,5,5,-5],axis:true});var p=b.create('point',[1,2]);b.create('functiongraph',[function(x){return p.Y()*Math.sin(x)}]);window.veinReady();</script>`),
    Plotly: doc(s(lib('Plotly')), `<div id="p" style="width:700px;height:450px"></div><script>var z=[];for(var i=0;i<20;i++){z.push([]);for(var j=0;j<20;j++)z[i].push(Math.sin(i/3)*Math.cos(j/3))}Plotly.newPlot('p',[{type:'surface',z:z}]).then(function(){window.veinReady()});</script>`),
    'D3.js': doc(s(lib('D3.js')), `<svg id="s" width="600" height="400"></svg><script>d3.select('#s').selectAll('circle').data([1,2,3]).join('circle').attr('cx',function(d){return d*120}).attr('cy',200).attr('r',40).attr('fill','#1f4e79');window.veinReady();</script>`),
    'Matter.js': doc(s(lib('Matter.js')), `<script>var M=Matter,e=M.Engine.create(),r=M.Render.create({element:document.body,engine:e,options:{width:600,height:400,wireframes:false}});M.Composite.add(e.world,[M.Bodies.rectangle(300,380,600,40,{isStatic:true}),M.Bodies.circle(300,50,30)]);M.Render.run(r);M.Runner.run(M.Runner.create(),e);window.veinReady();</script>`),
    '3Dmol.js': doc(s(lib('3Dmol.js')), `<div id="m" style="width:600px;height:400px;position:relative"></div><script>var v=$3Dmol.createViewer(document.getElementById('m'),{backgroundColor:'white'});v.addModel('3\\nwater\\nO 0 0 0\\nH 0.96 0 0\\nH -0.24 0.93 0\\n','xyz');v.setStyle({},{stick:{},sphere:{scale:0.3}});v.zoomTo();v.render();window.veinReady();</script>`),
    'Three.js': doc(`<script type="importmap">{"imports":{"three":"${lib('Three.js')}","three/addons/":"${lib('Three.js', 1).replace('controls/OrbitControls.js', '')}"}}</script>`, `<script type="module">import * as THREE from 'three';import {OrbitControls} from 'three/addons/controls/OrbitControls.js';var r=new THREE.WebGLRenderer();r.setSize(600,400);document.body.appendChild(r.domElement);var sc=new THREE.Scene(),cam=new THREE.PerspectiveCamera(50,1.5,0.1,100);cam.position.z=4;new OrbitControls(cam,r.domElement);sc.add(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshNormalMaterial()));r.render(sc,cam);window.veinReady();</script>`),
    WebGL: doc('', `<canvas id="c" width="600" height="400"></canvas><script>var g=document.getElementById('c').getContext('webgl');if(!g)throw new Error('WebGL 不可用');g.clearColor(0.1,0.3,0.5,1);g.clear(g.COLOR_BUFFER_BIT);window.veinReady();</script>`),
    Matplotlib: doc(s(lib('Matplotlib')), `<p id="t">正在加载 Python……</p><img id="o" width="600"><script>(async function(){var py=await loadPyodide();await py.loadPackage(['numpy','matplotlib']);var b=py.runPython(['import io, base64, numpy as np, matplotlib','matplotlib.use("Agg")','import matplotlib.pyplot as plt','x = np.linspace(0, 6, 100)','plt.plot(x, np.sin(x))','buf = io.BytesIO()','plt.savefig(buf, format="png")','base64.b64encode(buf.getvalue()).decode()'].join('\\n'));document.getElementById('o').src='data:image/png;base64,'+b;document.getElementById('t').remove();window.veinReady();})();</script>`),
  };
  // 攻击页：在沙箱里尝试越权，任何一项得手就抛错（于是这一项会失败）
  const SECURITY = doc('', `<p>隔离测试</p><svg width="200" height="100"><rect width="200" height="100" fill="#ccc"/></svg><script>var leaks=[];try{leaks.push('读到父页面：'+parent.document.title)}catch(e){}try{leaks.push('读到顶层地址：'+top.location.href)}catch(e){}try{var real=Object.getOwnPropertyDescriptor(Window.prototype,'localStorage').get.call(window);real.setItem('vein-leak','1');leaks.push('真实 localStorage 可写')}catch(e){}try{indexedDB.open('vein-leak-test');leaks.push('indexedDB 可用')}catch(e){}try{var ck=Object.getOwnPropertyDescriptor(Document.prototype,'cookie');ck.set.call(document,'x=1');if(ck.get.call(document))leaks.push('真实 cookie 可写')}catch(e){}fetch('http://127.0.0.1:' + PORT_PLACEHOLDER + '/').then(function(){leaks.push('能向本站发请求')}).catch(function(){}).finally(function(){setTimeout(function(){if(leaks.length)throw new Error('LEAK '+leaks.join('；'));window.veinReady()},300)});</script>`.replace('PORT_PLACEHOLDER', String(PORT)));
  const BROKEN = doc(s(lib('D3.js')), `<svg id="s" width="600" height="400"></svg><script>d3.selectt('#s');</script>`);
  const PLAN = (tool, extra = {}) => JSON.stringify({ title: `${tool} 测试页`, tool, whyTool: '测试', see: '页面画出了内容', controls: [{ name: '参数', effect: '画面变化' }], steps: [], facts: [{ claim: '测试事实' }], caveat: '测试用页面', explain: ['这是验收用的手写页面。'], ...extra });
  const modelCalls = [];
  const repairErrors = [];
  const reply = (q, user) => {
    const forced = /这次只能用：([^（。\n]+)/.exec(user)?.[1]?.trim();
    if (user.includes('这一次要做的：计划')) {
      modelCalls.push('plan');
      if (q.includes('PHET')) return PLAN('PhET', { phet: 'pendulum-lab' });
      return PLAN(forced ?? 'D3.js');
    }
    if (user.includes('这一次要做的：修复')) {
      modelCalls.push('repair');
      if (process.env.DEBUG_FETCH) console.log('REPAIR-MSG', JSON.stringify(user.slice(0, 200)), '...', JSON.stringify(user.slice(user.indexOf('没有跑起来'), user.indexOf('没有跑起来') + 600)));
      repairErrors.push(user.slice(user.indexOf('## 上一版页面在沙箱里没有跑起来'), user.indexOf('## 上一版代码')).replace(/s+/g, ' '));
      return '原因：函数名写错了。\n```html\n' + PAGES['D3.js'] + '\n```';
    }
    if (user.includes('写代码（本地运行）')) {
      modelCalls.push('local');
      return '运行后会看到一条正弦曲线。\n```python\n# pip install manim\nfrom manim import *\nclass S(Scene):\n    def construct(self):\n        self.play(Create(Circle()))\n```';
    }
    modelCalls.push('code');
    if (process.env.DEBUG_FETCH) console.log('code for', JSON.stringify(forced), 'has?', !!PAGES[forced], JSON.stringify(user.slice(user.indexOf('## 工具'), user.indexOf('## 工具') + 60)));
    return '一张页面。\n```html\n' + (q.includes('SECURITY') ? SECURITY : q.includes('BROKEN') ? BROKEN : PAGES[forced] ?? PAGES['D3.js']) + '\n```';
  };
  const pendingQ = { value: '' };
  onEvent('Fetch.requestPaused', async (p) => {
    if (process.env.DEBUG_FETCH) console.log('paused', p.request.method, p.request.url, (p.request.postData ?? '').length);
    const cors = [{ name: 'Access-Control-Allow-Origin', value: '*' }, { name: 'Access-Control-Allow-Headers', value: '*' }, { name: 'Access-Control-Allow-Methods', value: 'POST, GET, OPTIONS' }];
    if (p.request.method === 'OPTIONS') return send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 204, responseHeaders: cors });
    const body = JSON.parse(p.request.postData ?? '{}');
    const user = body.messages.filter((m) => m.role === 'user').map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n');
    const content = reply(pendingQ.value, user);
    const json = JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] });
    return send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, responseHeaders: [...cors, { name: 'Content-Type', value: 'application/json' }], body: Buffer.from(json).toString('base64') });
  });
  await send('Fetch.enable', { patterns: [{ urlPattern: 'https://fake-model.test/*' }] });

  await viewport(1440, 900, false);
  await navigate('/lab?ws=linear-algebra');
  await waitFor(`document.querySelector('.lab-composer')`);
  // 在设置里接入假模型（key 只在内存里，所以之后都用站内跳转，不整页刷新）
  await evaluate(`document.querySelector('button[aria-label="设置"]').click(), true`);
  await waitFor(`document.querySelector('.settings-form input[type=password]')`);
  await evaluate(`(() => {
    const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    const ins = [...document.querySelectorAll('.settings-form input')].filter((i) => i.type !== 'radio' && i.type !== 'checkbox');
    set(ins[0], 'https://fake-model.test/v1'); set(ins[1], 'fake-1'); set(document.querySelector('.settings-form input[type=password]'), 'sk-test');
    return true; })()`);
  await sleep(200);
  await evaluate(`document.querySelector('.settings-form button[type=submit]').click(), true`);
  await sleep(300);
  await evaluate(`document.querySelector('.settings-close, [aria-label="关闭"]')?.click(), document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })), true`);
  await sleep(300);

  const spa = async (path) => {
    await evaluate(`history.pushState({}, '', ${JSON.stringify(path)}), dispatchEvent(new PopStateEvent('popstate')), true`);
    await sleep(300);
  };
  const outcome = async (limitMs) => {
    for (let t = 0; t < limitMs; t += 500) {
      const st = await evaluate(`(() => ({ tag: document.querySelector('.lab-bar .lab-tag')?.textContent ?? '', failed: [...document.querySelectorAll('.lab-gen-failed li')].map((l) => l.textContent), note: document.querySelector('.lab-results .lab-note')?.textContent ?? '', stage: document.querySelector('.lab-gen-stage')?.textContent ?? '', run: new URLSearchParams(location.search).get('run') }))()`);
      if (/已运行|没有跑起来|本地运行/.test(st.tag) || st.note) return st;
      await sleep(500);
    }
    return evaluate(`({ tag: (document.querySelector('.lab-bar .lab-tag')?.textContent ?? '') + ' (超时，停在：' + (document.querySelector('.lab-gen-stage')?.textContent ?? '无') + ')', failed: [], note: '', run: null })`);
  };

  const results = {};
  const ONLY = process.env.ONLY;
  for (const tool of ['GeoGebra', 'JSXGraph', 'Plotly', 'D3.js', 'Matter.js', '3Dmol.js', 'Three.js', 'WebGL', 'Matplotlib'].filter((x) => !ONLY || ONLY === x)) {
    const q = `验收：${tool} 能否在沙箱里运行`;
    pendingQ.value = q;
    await spa(`/lab?ws=linear-algebra&q=${encodeURIComponent(q)}&tool=${encodeURIComponent(tool)}`);
    modelCalls.length = 0;
    repairErrors.length = 0;
    const st = await outcome(tool === 'Matplotlib' ? 120_000 : 45_000);
    results[tool] = st;
    if (process.env.DEBUG_FETCH) console.log('CONSOLE', JSON.stringify(browserErrors.slice(0, 12)));
    if (process.env.DEBUG_FETCH) console.log('frame', tool, await evaluate(`(() => { const d = document.querySelector('.lab-gen iframe')?.srcdoc ?? ''; return [d.length, /GGBApplet/.test(d), /d3.select/.test(d), document.querySelectorAll('.lab-gen iframe').length]; })()`));
    check(`${tool}：真实的库在沙箱里跑起来（不经修复）`, /已运行/.test(st.tag) && !modelCalls.includes('repair'), repairErrors.join(' | ') || st.failed.join(' | ') || st.note || st.tag);
    if (['GeoGebra', 'Three.js', 'Matplotlib', '3Dmol.js'].includes(tool)) { await sleep(tool === 'GeoGebra' ? 8000 : 1500); await screenshot(`labgen-${tool.replace(/\W/g, '').toLowerCase()}-1440.png`); }
  }

  // 隔离：生成的页面越不了权
  {
    const q = '验收：SECURITY 隔离';
    pendingQ.value = q;
    modelCalls.length = 0;
    repairErrors.length = 0;
    await spa(`/lab?ws=linear-algebra&q=${encodeURIComponent(q)}&tool=D3.js`);
    const st = await outcome(45_000);
    check('隔离：读不到父页面与顶层地址、真实存储与 cookie 不可用、不能向本站发请求', /已运行/.test(st.tag) && !modelCalls.includes('repair'), repairErrors.join(' | ') || st.tag);
  }
  // 报错 → 自动修一次 → 跑起来
  if (!ONLY) {
    const q = '验收：BROKEN 页面要自动修复';
    pendingQ.value = q;
    modelCalls.length = 0;
    await spa(`/lab?ws=linear-algebra&q=${encodeURIComponent(q)}&tool=D3.js`);
    const st = await outcome(45_000);
    check('页面报错后自动修复一次并跑起来', /已运行/.test(st.tag) && modelCalls.includes('repair'), `${st.tag}；调用 ${modelCalls.join('→')}`);
  }
  // 本地工具：给代码，不假装在网页里跑
  {
    const q = '验收：Manim 本地代码';
    pendingQ.value = q;
    await spa(`/lab?ws=linear-algebra&q=${encodeURIComponent(q)}&tool=Manim`);
    const st = await outcome(30_000);
    const code = await evaluate(`document.querySelector('.lab-gen-pre code')?.textContent ?? ''`);
    check('Manim 给出可下载的本地代码与运行说明', /本地运行/.test(st.tag) && code.includes('from manim import') && (await evaluate(`!!document.querySelector('.lab-gen-local')`)), st.tag);
    await screenshot('labgen-manim-1440.png');
  }
  // 要授权的工具：换成浏览器工具并写明原因
  {
    const q = '验收：Desmos 替换';
    pendingQ.value = q;
    await spa(`/lab?ws=linear-algebra&q=${encodeURIComponent(q)}&tool=Desmos`);
    const st = await outcome(45_000);
    const sub = await evaluate(`document.querySelector('.lab-gen-sub')?.textContent ?? ''`);
    check('Desmos 换成 JSXGraph 并写明原因', /已运行/.test(st.tag) && /API key/.test(sub), sub || st.tag);
  }
  // PhET：从核实过的清单里嵌入官方模拟
  {
    const q = '验收：PHET 嵌入';
    pendingQ.value = q;
    await spa(`/lab?ws=linear-algebra&q=${encodeURIComponent(q)}`);
    const st = await outcome(30_000);
    const src = await evaluate(`document.querySelector('.lab-gen-embed iframe')?.src ?? ''`);
    check('PhET 嵌入核实过的官方模拟', src.includes('phet.colorado.edu/sims/html/pendulum-lab/') && PHET_SIMS.includes('pendulum-lab'), src || st.tag);
    await sleep(4000);
    await screenshot('labgen-phet-1440.png');
  }
  // 生成结果存进工作区：整页刷新（模型配置随之清空）后，凭地址里的 run 读回
  {
    const id = results.GeoGebra?.run;
    const q = '验收：GeoGebra 能否在沙箱里运行';
    await navigate(`/lab?ws=linear-algebra&q=${encodeURIComponent(q)}&tool=GeoGebra&run=${id}`);
    const st = await outcome(45_000);
    check('刷新后不接模型也能从工作区读回生成结果', /已运行/.test(st.tag) && !!id, `${st.tag} run=${id}`);
    await evaluate(`document.querySelector('.lab-bar .lab-history-btn')?.click(), true`);
    await sleep(400);
    const hist = await evaluate(`[...document.querySelectorAll('.lab-history li strong')].map((x) => x.textContent)`);
    check('每次生成在会话历史里只留一条', hist.filter((h) => h === q).length === 1, `${hist.length} 条`);
  }
  await send('Fetch.disable');
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
