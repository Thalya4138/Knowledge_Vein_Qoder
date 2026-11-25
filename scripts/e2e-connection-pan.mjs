import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 4174;
const CDP_PORT = 9338;
const EVIDENCE = resolve('docs/evidence');
const CASES = [
  { id: 'fragments', mode: 'fragments', ask: '最小二乘、点到平面的最短距离、异面直线的最短距离，是同一个问题吗？', title: '三种最短距离，同一个垂直条件', figures: 1, figure: 'fragments-统一投影模型.svg' },
  { id: 'meta', mode: 'meta', ask: '从更高的层次看，线性代数这门课到底在研究什么？', title: '一种运算，四类对象，三个动作', figures: 3, figure: 'meta-向量组即映射.svg' },
  { id: 'cross', mode: 'cross', ask: '线性代数 × 机器人运动学：两边真正共享的是什么？', title: '机械臂的每一个瞬间是一个矩阵', figures: 1, figure: 'cross-雅可比与奇异位形.svg' },
  { id: 'cross-bio', mode: 'cross', ask: '生物神经网络 × 计算机科学/AI：两边真正共享的是什么？', title: '神经元不是一个会学习的加权求和', figures: 1, figure: 'cross-bio-动力系统与静态映射.svg' },
];
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const server = await createServer({ server: { host: '127.0.0.1', port: PORT, strictPort: true } });
await server.listen();
const profile = mkdtempSync(join(tmpdir(), 'vein-pan-'));
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${CDP_PORT}`,
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--window-size=1440,900',
  'about:blank',
], { stdio: 'ignore' });

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
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error' && !message.params.entry.url?.endsWith('/favicon.ico')) {
      browserErrors.push(`${message.params.entry.text} ${message.params.entry.url ?? ''}`);
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
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  const waitFor = async (expression) => {
    for (let i = 0; i < 100; i++) {
      if (await evaluate(`Boolean(${expression})`)) return;
      await sleep(100);
    }
    throw new Error(`Timed out waiting for ${expression}`);
  };
  const navigate = async (path) => {
    const url = `http://127.0.0.1:${PORT}${path}`;
    await send('Page.navigate', { url });
    await waitFor(`location.href === ${JSON.stringify(url)} && document.readyState === 'complete'`);
  };
  const viewport = async (width, height, mobile) => {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
    await sleep(120);
  };
  const screenshot = async (name) => {
    const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const path = join(EVIDENCE, name);
    writeFileSync(path, Buffer.from(result.data, 'base64'));
    return path;
  };
  const drag = async (from, dx, dy) => {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', buttons: 1, clickCount: 1, pointerType: 'mouse' });
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x + dx / 2, y: from.y + dy / 2, button: 'left', buttons: 1, pointerType: 'mouse' });
    await sleep(40);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x + dx, y: from.y + dy, button: 'left', buttons: 1, pointerType: 'mouse' });
    await sleep(40);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: from.x + dx, y: from.y + dy, button: 'left', buttons: 0, clickCount: 1, pointerType: 'mouse' });
    await sleep(120);
  };
  const click = async (point) => {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', buttons: 1, clickCount: 1, pointerType: 'mouse' });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', buttons: 0, clickCount: 1, pointerType: 'mouse' });
    await sleep(100);
  };
  const doubleClick = async (point) => {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', buttons: 1, clickCount: 1, pointerType: 'mouse' });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', buttons: 0, clickCount: 1, pointerType: 'mouse' });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', buttons: 1, clickCount: 2, pointerType: 'mouse' });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', buttons: 0, clickCount: 2, pointerType: 'mouse' });
    await sleep(100);
  };
  const escape = async () => {
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await sleep(150);
  };
  const fullscreenState = () => evaluate(`(() => {
    const graph = document.querySelector('.cx-full .xgraph');
    const stage = document.querySelector('.cx-full .xstage');
    const node = document.querySelector('.cx-full .xnode');
    if (!graph || !stage || !node) return null;
    const r = graph.getBoundingClientRect();
    const dialog = document.querySelector('.cx-full');
    const dr = dialog.getBoundingClientRect();
    const edge = document.elementFromPoint(innerWidth - 4, innerHeight / 2);
    const matrix = new DOMMatrix(getComputedStyle(stage).transform);
    const tools = [...document.querySelectorAll('.cx-full .cx-graph-tools button')].map((el) => {
      const b = el.getBoundingClientRect();
      const x = b.left + b.width / 2;
      const y = b.top + b.height / 2;
      return { label: el.getAttribute('aria-label') || el.textContent.trim(), left: b.left, right: b.right, top: b.top, bottom: b.bottom,
        visible: document.elementFromPoint(x, y)?.closest('button') === el };
    });
    return { scale: matrix.a, fontSize: parseFloat(getComputedStyle(node).fontSize) * matrix.a,
      graph: { left: r.left, right: r.right, top: r.top, bottom: r.bottom, clientWidth: graph.clientWidth, clientHeight: graph.clientHeight, scrollWidth: graph.scrollWidth, scrollHeight: graph.scrollHeight, scrollLeft: graph.scrollLeft, scrollTop: graph.scrollTop },
      tools, viewport: { width: innerWidth, height: innerHeight }, overflow: document.documentElement.scrollWidth > innerWidth + 1,
      bodyOverflow: document.body.style.overflow, rootOverflow: document.documentElement.style.overflow,
      dialog: { left: dr.left, right: dr.right, width: dr.width, background: getComputedStyle(dialog).backgroundColor },
      edgeHit: { tag: edge?.tagName, className: edge?.className, insideDialog: Boolean(edge?.closest('.cx-full')) },
      layoutWidth: document.documentElement.clientWidth, visualWidth: visualViewport.width,
      inspector: Boolean(document.querySelector('.cx-full .xinspect')) };
  })()`);
  const assertFullscreenReadable = (label, state) => {
    if (!state?.inspector || !state.edgeHit.insideDialog || state.fontSize < 14 || state.overflow || state.bodyOverflow !== 'hidden' || state.rootOverflow !== 'hidden' || state.tools.some((b) => !b.visible || b.left < 0 || b.right > state.viewport.width + 1 || b.top < 0 || b.bottom > state.viewport.height + 1)) {
      throw new Error(`${label} is not readable/editable: ${JSON.stringify(state)}`);
    }
  };
  const visibleNode = () => evaluate(`(() => {
    const graph = document.querySelector('.cx-full .xgraph').getBoundingClientRect();
    for (const el of document.querySelectorAll('.cx-full .xnode')) {
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      if (x > graph.left + 5 && x < graph.right - 5 && y > graph.top + 5 && y < graph.bottom - 5) {
        return { x, y, left: el.style.left, top: el.style.top, label: el.textContent.trim() };
      }
    }
    return null;
  })()`);

  const visualState = () => evaluate(`(() => {
    const sheet = document.querySelector('.nr-sheet').getBoundingClientRect();
    return { sheet: { left: sheet.left, right: sheet.right }, images: [...document.querySelectorAll('.nr-fig img')].map((img) => {
      const r = img.getBoundingClientRect();
      return { src: img.getAttribute('src'), left: r.left, right: r.right, width: r.width, loaded: img.complete && img.naturalWidth > 0,
        inside: r.left >= sheet.left - 1 && r.right <= sheet.right + 1 };
    }), overflow: document.documentElement.scrollWidth > innerWidth + 1,
      katex: document.querySelectorAll('.katex').length,
      katexErrors: document.querySelectorAll('.katex-error').length };
  })()`);
  const assertVisuals = (label, state) => {
    if (!state.images.length || state.images.some((img) => !img.loaded || !img.inside || img.width <= 0)) {
      throw new Error(`${label} figures failed: ${JSON.stringify(state)}`);
    }
    if (!state.katex || state.katexErrors || state.overflow) {
      throw new Error(`${label} rendering failed: ${JSON.stringify(state)}`);
    }
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');

  for (const item of CASES) {
    await viewport(1440, 900, false);
    await navigate(`/connection?ws=linear-algebra&mode=${item.mode}`);
    await waitFor(`document.querySelector('.cx-try')`);
    const previousHref = await evaluate(`location.href`);
    const opened = await evaluate(`(() => {
      const preset = [...document.querySelectorAll('.cx-try')].find((el) => el.textContent.includes(${JSON.stringify(item.ask)}));
      if (!preset) return false;
      preset.click();
      return true;
    })()`);
    if (!opened) throw new Error(`Preset not found: ${item.id}`);
    await waitFor(`location.href !== ${JSON.stringify(previousHref)} && new URL(location.href).searchParams.has('t') && document.querySelector('.turn h1')?.textContent.trim().replace(/§$/, '') === ${JSON.stringify(item.title)}`);
    await waitFor(`document.querySelector('.xgraph') && document.querySelectorAll('.nr-fig img').length > 0 && [...document.querySelectorAll('.nr-fig img')].every((img) => img.complete && img.naturalWidth > 0)`);
    await sleep(450);

    const desktop = await visualState();
    assertVisuals(`${item.id} desktop`, desktop);
    if (desktop.images.length !== item.figures || !desktop.images.some((img) => decodeURI(img.src).endsWith(item.figure))) {
      throw new Error(`${item.id} opened the wrong preset: ${JSON.stringify(desktop.images)}`);
    }
    const heading = await evaluate(`document.querySelector('.turn h1')?.textContent.trim().replace(/§$/, '')`);
    if (heading !== item.title) throw new Error(`${item.id} heading mismatch: ${heading}`);
    const desktopPath = await screenshot(`r2-explore-${item.id}-desktop.png`);

    await evaluate(`document.querySelector('.nr-fig').scrollIntoView({ block: 'center', behavior: 'instant' })`);
    await sleep(500);
    const figurePath = await screenshot(`r2-explore-${item.id}-figure.png`);

    if (item.id === 'fragments') {
      const before = await evaluate(`(() => {
        const graph = document.querySelector('.xgraph');
        const r = graph.getBoundingClientRect();
        let point = null;
        for (let y = r.top + 24; y < r.bottom - 24 && !point; y += 28) {
          for (let x = r.left + 24; x < r.right - 24; x += 28) {
            const hit = document.elementFromPoint(x, y);
            if (hit && !hit.closest('.xnode, button, input, textarea, select, a')) { point = { x, y }; break; }
          }
        }
        return { point, scrollLeft: graph.scrollLeft, clientWidth: graph.clientWidth, scrollWidth: graph.scrollWidth,
          nodeLeft: document.querySelector('.xnode')?.style.left ?? '' };
      })()`);
      if (!before.point || before.scrollWidth <= before.clientWidth + 1) throw new Error(`Graph is not scrollable: ${JSON.stringify(before)}`);
      await drag(before.point, 180, 0);
      const after = await evaluate(`(() => ({ scrollLeft: document.querySelector('.xgraph').scrollLeft,
        nodeLeft: document.querySelector('.xnode')?.style.left ?? '' }))()`);
      if (before.scrollLeft - after.scrollLeft <= 80 || before.nodeLeft !== after.nodeLeft) {
        throw new Error(`Background drag did not pan cleanly: ${JSON.stringify({ before, after })}`);
      }

      const node = await evaluate(`(() => {
        const graph = document.querySelector('.xgraph').getBoundingClientRect();
        for (const el of document.querySelectorAll('.xnode')) {
          const r = el.getBoundingClientRect();
          const x = r.left + r.width / 2;
          const y = r.top + r.height / 2;
          if (x > graph.left + 5 && x < graph.right - 5 && y > graph.top + 5 && y < graph.bottom - 5) {
            return { x, y, left: el.style.left, top: el.style.top };
          }
        }
        return null;
      })()`);
      if (!node) throw new Error('No visible node available for drag regression');
      await drag({ x: node.x, y: node.y }, 45, 20);
      const moved = await evaluate(`(() => { const el = document.querySelector('.xnode'); return { left: el.style.left, top: el.style.top }; })()`);
      if (node.left === moved.left && node.top === moved.top) throw new Error(`Node drag did not move the node: ${JSON.stringify({ node, moved })}`);
      console.log(`PASS canvas pan (${before.scrollLeft} -> ${after.scrollLeft}) and node drag`);

      await evaluate(`document.querySelector('.cx-graph-tools button[aria-label="全屏"]').click()`);
      await waitFor(`document.querySelector('.cx-full .xgraph')`);
      await sleep(250);
      const full = await fullscreenState();
      assertFullscreenReadable('fragments fullscreen', full);
      const fullPath = await screenshot('r2-explore-fragments-fullscreen.png');

      const fullNode = await visibleNode();
      if (!fullNode) throw new Error('Fullscreen has no visible node');
      await drag({ x: fullNode.x, y: fullNode.y }, 42, 18);
      const fullMoved = await visibleNode();
      if (fullNode.left === fullMoved.left && fullNode.top === fullMoved.top) throw new Error(`Fullscreen node drag failed: ${JSON.stringify({ fullNode, fullMoved })}`);

      await doubleClick({ x: fullMoved.x, y: fullMoved.y });
      await waitFor(`document.querySelector('.cx-full .xnode input')`);
      await evaluate(`(() => { const input = document.querySelector('.cx-full .xnode input'); input.focus(); input.select(); })()`);
      await send('Input.insertText', { text: '全屏改名节点' });
      await evaluate(`document.querySelector('.cx-full .xnode input').blur()`);
      await waitFor(`[...document.querySelectorAll('.cx-full .xnode')].some((el) => el.textContent.includes('全屏改名节点'))`);

      const nodeCount = await evaluate(`document.querySelectorAll('.cx-full .xnode').length`);
      const addButton = await evaluate(`(() => {
        const button = [...document.querySelectorAll('.cx-full .cx-graph-tools button')].find((el) => el.textContent.trim() === '加节点');
        const r = button.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      })()`);
      await click(addButton);
      await waitFor(`document.querySelectorAll('.cx-full .xnode').length === ${nodeCount + 1} && document.querySelector('.cx-full #xi-label')?.value === '新概念'`);
      const removeButton = await evaluate(`(() => {
        const button = [...document.querySelectorAll('.cx-full .xinspect button')].find((el) => el.textContent.trim() === '删除节点');
        const r = button.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      })()`);
      await click(removeButton);
      await waitFor(`document.querySelectorAll('.cx-full .xnode').length === ${nodeCount}`);

      const edge = await evaluate(`(() => {
        const graph = document.querySelector('.cx-full .xgraph').getBoundingClientRect();
        for (const el of document.querySelectorAll('.cx-full .xe-label')) {
          const r = el.getBoundingClientRect();
          const x = r.left + r.width / 2;
          const y = r.top + r.height / 2;
          if (x > graph.left + 5 && x < graph.right - 5 && y > graph.top + 5 && y < graph.bottom - 5) return { x, y };
        }
        return null;
      })()`);
      if (!edge) throw new Error('Fullscreen has no visible relation label');
      await click(edge);
      await waitFor(`document.querySelector('.cx-full .xi-path') && document.querySelector('.cx-full .xi-why')`);
      const fullDetailPath = await screenshot('r2-explore-fragments-fullscreen-detail.png');

      const panBefore = await fullscreenState();
      const panPoint = await evaluate(`(() => {
        const graph = document.querySelector('.cx-full .xgraph').getBoundingClientRect();
        for (let y = graph.top + 20; y < graph.bottom - 20; y += 24) {
          for (let x = graph.left + 20; x < graph.right - 20; x += 24) {
            const hit = document.elementFromPoint(x, y);
            if (hit && !hit.closest('.xnode, button, input, textarea, select, a')) return { x, y };
          }
        }
        return null;
      })()`);
      if (!panPoint || panBefore.graph.scrollWidth <= panBefore.graph.clientWidth + 1) throw new Error(`Fullscreen graph is not pannable: ${JSON.stringify(panBefore)}`);
      await drag(panPoint, -120, 0);
      const panAfter = await fullscreenState();
      if (panAfter.graph.scrollLeft - panBefore.graph.scrollLeft <= 60) throw new Error(`Fullscreen background pan failed: ${JSON.stringify({ panPoint, panBefore, panAfter })}`);

      await escape();
      await waitFor(`!document.querySelector('.cx-full') && document.querySelector('.cx-graph .xgraph')`);
      const persisted = await evaluate(`document.querySelector('.cx-graph .xgraph').textContent.includes('全屏改名节点')`);
      if (!persisted) throw new Error('Fullscreen edits were lost after Esc');
      console.log(`PASS fullscreen: ${full.fontSize.toFixed(1)}px nodes, visible tools, drag/rename/add/delete/edge details/pan, edits persist after Esc`);
      console.log(`  ${fullPath}\n  ${fullDetailPath}`);
    }

    await viewport(375, 812, true);
    await evaluate(`window.scrollTo({ top: 0, behavior: 'instant' })`);
    await sleep(200);
    const narrow = await visualState();
    assertVisuals(`${item.id} narrow`, narrow);
    const narrowPath = await screenshot(`r2-explore-${item.id}-narrow.png`);
    await evaluate(`document.querySelector('.nr-fig').scrollIntoView({ block: 'center', behavior: 'instant' })`);
    await sleep(500);
    const narrowFigurePath = await screenshot(`r2-explore-${item.id}-narrow-figure.png`);
    console.log(`PASS ${item.id}: ${desktop.images.length} figures loaded, ${desktop.katex} formulas, desktop/narrow fit`);
    console.log(`  ${desktopPath}\n  ${figurePath}\n  ${narrowPath}\n  ${narrowFigurePath}`);

    if (item.id === 'fragments') {
      await evaluate(`document.querySelector('.cx-graph-tools button[aria-label="全屏"]').click()`);
      await waitFor(`document.querySelector('.cx-full .xgraph')`);
      await sleep(250);
      const narrowFull = await fullscreenState();
      assertFullscreenReadable('fragments narrow fullscreen', narrowFull);
      const narrowFullPath = await screenshot('r2-explore-fragments-narrow-fullscreen.png');
      await escape();
      await waitFor(`!document.querySelector('.cx-full')`);
      console.log(`PASS narrow fullscreen: ${narrowFull.fontSize.toFixed(1)}px nodes, controls in viewport, no page overflow`);
      console.log(`  ${narrowFullPath}`);
    }
  }

  await viewport(1440, 900, false);
  await navigate('/workspace?ws=linear-algebra&file=note-2-1');
  await waitFor(`document.querySelector('.ft-file')`);
  const figures = [
    ['三个数据点与两条候选直线', '/demo/linear-algebra/notes/figures/2-0-问题探讨.svg'],
    ['图 2-1 b 在列空间上的最近点', '/demo/linear-algebra/notes/figures/2-1.svg'],
    ['图 2-2 从残差正交到法方程', '/demo/linear-algebra/notes/figures/2-2-从正交到法方程.svg'],
    ['图 2-3 最佳直线与残差', '/demo/linear-algebra/notes/figures/2-3.svg'],
    ['图 2-4 参数不唯一', '/demo/linear-algebra/notes/figures/2-4-参数不唯一.svg'],
    ['图 2-5 投影矩阵', '/demo/linear-algebra/notes/figures/2-5-投影矩阵.svg'],
  ];
  for (const [name, src] of figures) {
    const clicked = await evaluate(`(() => {
      const file = [...document.querySelectorAll('.ft-file')].find((el) => el.textContent.trim() === ${JSON.stringify(name)});
      if (!file) return false;
      file.click();
      return true;
    })()`);
    if (!clicked) throw new Error(`Workspace figure missing from file tree: ${name}`);
    await waitFor(`document.querySelector('.figure-view img')?.getAttribute('src') === ${JSON.stringify(encodeURI(src))} && document.querySelector('.figure-view img')?.naturalWidth > 0`);
  }
  await evaluate(`[...document.querySelectorAll('.ft-file')].find((el) => el.textContent.includes('正交投影与最小二乘法')).click()`);
  await waitFor(`document.querySelector('.nr-fig img') && [...document.querySelectorAll('.nr-fig img')].every((img) => img.complete && img.naturalWidth > 0)`);
  console.log(`PASS workspace file tree: ${figures.length} registered figures opened successfully`);
  await sleep(450);
  const noteDesktop = await visualState();
  assertVisuals('note desktop', noteDesktop);
  const noteDesktopPath = await screenshot('r2-note-2-1-desktop.png');
  await evaluate(`document.querySelector('.nr-fig').scrollIntoView({ block: 'center', behavior: 'instant' })`);
  await sleep(500);
  const noteFigurePath = await screenshot('r2-note-2-1-figure.png');
  await viewport(375, 812, true);
  await evaluate(`window.scrollTo({ top: 0, behavior: 'instant' })`);
  await sleep(200);
  const noteNarrow = await visualState();
  assertVisuals('note narrow', noteNarrow);
  const noteNarrowPath = await screenshot('r2-note-2-1-narrow.png');
  await evaluate(`document.querySelector('.nr-fig').scrollIntoView({ block: 'center', behavior: 'instant' })`);
  await sleep(500);
  const noteNarrowFigurePath = await screenshot('r2-note-2-1-narrow-figure.png');
  console.log(`PASS note: ${noteDesktop.images.length} figures loaded, ${noteDesktop.katex} formulas, desktop/narrow fit`);
  console.log(`  ${noteDesktopPath}\n  ${noteFigurePath}\n  ${noteNarrowPath}\n  ${noteNarrowFigurePath}`);

  if (browserErrors.length) throw new Error(`Browser errors: ${browserErrors.join(' | ')}`);
  console.log('PASS no application console, runtime, or resource errors');
} finally {
  ws?.close();
  chrome.kill();
  await server.close();
  await sleep(150);
  rmSync(profile, { recursive: true, force: true });
}
