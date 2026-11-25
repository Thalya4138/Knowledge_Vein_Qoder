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
const PORT = 4176;
const CDP_PORT = 9341;
const EVIDENCE = resolve('docs/evidence');
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const server = await createServer({ server: { host: '127.0.0.1', port: PORT, strictPort: true } });
await server.listen();
const profile = mkdtempSync(join(tmpdir(), 'vein-lab-fit-'));
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
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
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
  await send('Page.enable');
  await send('Runtime.enable');

  const frameReady = `document.querySelector('.lab-frame') && document.querySelector('.lab-frame').contentDocument && document.querySelector('.lab-frame').contentDocument.readyState === 'complete'`;
  const outer = () => evaluate(`(() => {
    const f = document.querySelector('.lab-frame');
    const r = f.getBoundingClientRect();
    const lab = document.querySelector('.lab').getBoundingClientRect();
    const plate = document.querySelector('.plate-backdrop');
    return {
      pageScroll: document.documentElement.scrollHeight - innerHeight,
      pageOverflowX: document.documentElement.scrollWidth - innerWidth,
      frameH: Math.round(r.height), frameW: Math.round(r.width),
      head: !!document.querySelector('.lab-bar'),
      barH: Math.round(document.querySelector('.lab-bar').getBoundingClientRect().height),
      innerHeaderHidden: getComputedStyle(f.contentDocument.querySelector('header.top')).display === 'none',
      startHidden: !document.querySelector('.lab-start'),
      bleedLeft: Math.round(lab.left), bleedW: Math.round(lab.width), vw: document.documentElement.clientWidth,
      plateGone: !plate || getComputedStyle(plate).display === 'none',
      frameTop: Math.round(r.top), frameBottom: Math.round(r.bottom), vh: innerHeight,
      shellTheme: document.documentElement.dataset.theme || 'light',
      innerTheme: f.contentDocument.documentElement.dataset.theme || 'light',
      innerBg: getComputedStyle(f.contentDocument.body).backgroundColor,
    };
  })()`);
  const photoInner = () => evaluate(`(() => {
    const d = document.querySelector('.lab-frame').contentDocument;
    const w = d.defaultView;
    const layout = d.querySelector('.layout');
    const stage = d.querySelector('.stage-wrap').getBoundingClientRect();
    const panel = d.querySelector('.panel');
    const pr = panel.getBoundingClientRect();
    const cards = [...panel.querySelectorAll(':scope > .card')].slice(0, 3).map((c) => {
      const b = c.getBoundingClientRect();
      return { id: c.id || c.querySelector('h3').textContent.slice(0, 6), top: Math.round(b.top - pr.top), bottom: Math.round(b.bottom - pr.top), visible: b.bottom <= pr.bottom + 1 };
    });
    return {
      cols: w.getComputedStyle(layout).gridTemplateColumns.split(' ').length,
      railRight: pr.left >= stage.right - 1,
      innerScroll: d.documentElement.scrollHeight - w.innerHeight,
      innerOverflowX: d.documentElement.scrollWidth - w.innerWidth,
      panelScrollTop: panel.scrollTop,
      cards,
      svgH: Math.round(d.querySelector('#svg').getBoundingClientRect().height),
    };
  })()`);
  const quadricInner = () => evaluate(`(() => {
    const d = document.querySelector('.lab-frame').contentDocument;
    const w = d.defaultView;
    const exp = d.querySelector('.exp').getBoundingClientRect();
    const panel = d.querySelector('.panel').getBoundingClientRect();
    return {
      railRight: panel.left >= exp.right - 1,
      innerScroll: d.documentElement.scrollHeight - w.innerHeight,
      innerOverflowX: d.documentElement.scrollWidth - w.innerWidth,
      viewH: Math.round(d.querySelector('#view').getBoundingClientRect().height),
      panelScrollable: d.querySelector('.panel').scrollHeight > d.querySelector('.panel').clientHeight,
    };
  })()`);

  const cases = [
    { q: '光合作用的全过程', kind: 'photo', tag: 'photo' },
    { q: '二次曲面的标准型与截线', kind: 'quadric', tag: 'quadric' },
  ];
  for (const [width, height, mobile] of [[1440, 900, false], [1280, 800, false], [1024, 768, false], [414, 800, true]]) {
    await viewport(width, height, mobile);
    for (const c of cases) {
      await navigate(`/lab?q=${encodeURIComponent(c.q)}`);
      await waitFor(frameReady);
      await sleep(600);
      const o = await outer();
      const label = `${c.tag}@${width}x${height}`;
      check(`${label} 外壳无纵向滚动`, o.pageScroll <= 2, `scroll=${o.pageScroll}`);
      check(`${label} 外壳无横向溢出`, o.pageOverflowX <= 1, `overflowX=${o.pageOverflowX}`);
      check(`${label} 结果页无起点列表`, o.head && o.startHidden);
      if (!mobile) check(`${label} 顶栏一条且页内顶栏撤掉`, o.barH <= 56 && o.innerHeaderHidden, `barH=${o.barH} hidden=${o.innerHeaderHidden}`);
      else check(`${label} 窄屏顶栏不超两条`, o.barH <= 90 && o.innerHeaderHidden, `barH=${o.barH} hidden=${o.innerHeaderHidden}`);
      check(`${label} 工作区铺满整页`, o.bleedLeft === 0 && o.bleedW === o.vw && o.plateGone, `left=${o.bleedLeft} w=${o.bleedW}/${o.vw} plateGone=${o.plateGone}`);
      check(`${label} 窗口在视口内`, o.frameTop >= 0 && o.frameBottom <= o.vh + 1, `top=${o.frameTop} bottom=${o.frameBottom}/${o.vh}`);
      check(`${label} 内外主题一致`, o.shellTheme === o.innerTheme, `shell=${o.shellTheme} inner=${o.innerTheme} bg=${o.innerBg}`);
      if (mobile) {
        const inner = c.kind === 'photo' ? await photoInner() : await quadricInner();
        check(`${label} 页内无横向溢出`, inner.innerOverflowX <= 1, `overflowX=${inner.innerOverflowX}`);
        check(`${label} 窄屏窗口可用`, o.frameH >= 300, `frameH=${o.frameH}`);
        if (c.kind === 'photo') await screenshot(`lab-fit-${c.tag}-414.png`);
        continue;
      }
      check(`${label} 窗口高度自适应`, o.frameH >= 420 && o.frameH <= height - 120, `frameH=${o.frameH}`);
      if (c.kind === 'photo') {
        const inner = await photoInner();
        check(`${label} 两栏：阐释在画布右`, inner.cols === 2 && inner.railRight, `cols=${inner.cols}`);
        check(`${label} 页内不滚动`, inner.innerScroll <= 2, `scroll=${inner.innerScroll}`);
        check(`${label} 前三卡首屏可见`, inner.cards.every((x) => x.visible), JSON.stringify(inner.cards));
        check(`${label} 画布有高度`, inner.svgH > 200, `svgH=${inner.svgH}`);
        if (width === 1024) await screenshot(`lab-fit-${c.tag}-1024.png`);
        if (width === 1440) {
          await screenshot(`lab-fit-${c.tag}-1440.png`);
          const before = await evaluate(`document.querySelector('.lab-frame').contentDocument.querySelector('#zoomPct').textContent`);
          await evaluate(`document.querySelector('.lab-frame').contentDocument.querySelector('#zoomIn').click()`);
          const after = await evaluate(`document.querySelector('.lab-frame').contentDocument.querySelector('#zoomPct').textContent`);
          check(`${label} 缩放控件生效`, before !== after, `${before} -> ${after}`);
          await evaluate(`document.querySelector('.lab-frame').contentDocument.querySelector('#zoomPct').click()`);
          const dirBefore = await evaluate(`document.querySelector('.lab-frame').contentDocument.querySelector('#relBody').textContent.length`);
          await evaluate(`document.querySelector('.lab-frame').contentDocument.querySelectorAll('.dirlink')[2].click()`);
          await sleep(200);
          const dirAfter = await evaluate(`(() => { const d = document.querySelector('.lab-frame').contentDocument; return { len: d.querySelector('#relBody').textContent.length, cur: d.querySelectorAll('.dirlink[aria-current="true"]').length }; })()`);
          check(`${label} 一览点击原位阅读`, dirAfter.cur >= 1 && dirAfter.len !== dirBefore, `len ${dirBefore} -> ${dirAfter.len}`);
          await evaluate(`document.querySelector('.lab-frame').contentDocument.querySelector('#stageSub').click()`);
          const open = await evaluate(`document.querySelector('.lab-frame').contentDocument.querySelector('#stageSub').classList.contains('open')`);
          check(`${label} 画布说明可展开`, open === true);
          await evaluate(`document.querySelector('.lab-frame').contentDocument.querySelector('#stageSub').click()`);
          const railBtn = `document.querySelector('.lab-bar-end .lab-rail-btn')`;
          const railState = `document.querySelector('.lab-frame').contentDocument.querySelector('.layout').classList.contains('rail-hidden')`;
          const colsBefore = await evaluate(railState);
          await evaluate(`${railBtn}.click()`);
          await sleep(250);
          const colsFolded = await evaluate(railState);
          await evaluate(`${railBtn}.click()`);
          await sleep(250);
          const colsBack = await evaluate(railState);
          check(`${label} 顶栏遥控右栏折叠`, colsBefore === false && colsFolded === true && colsBack === false, `${colsBefore}->${colsFolded}->${colsBack}`);
          const themeBtn = `document.querySelector('.topbar-end button[aria-label*="模式"]')`;
          const t0 = await evaluate(`document.documentElement.dataset.theme`);
          await evaluate(`${themeBtn}.click()`);
          await sleep(300);
          const t1 = await evaluate(`({ shell: document.documentElement.dataset.theme, inner: document.querySelector('.lab-frame').contentDocument.documentElement.dataset.theme })`);
          await evaluate(`${themeBtn}.click()`);
          await sleep(300);
          const t2 = await evaluate(`({ shell: document.documentElement.dataset.theme, inner: document.querySelector('.lab-frame').contentDocument.documentElement.dataset.theme })`);
          check(`${label} 顶栏昼夜同步内外`, t1.shell !== t0 && t1.shell === t1.inner && t2.shell === t0 && t2.inner === t0, `${t0}->${JSON.stringify(t1)}->${JSON.stringify(t2)}`);
          const barSlim = await evaluate(`(() => { const end = document.querySelector('.lab-bar-end'); return { buttons: [...end.querySelectorAll('button')].map((b) => b.textContent.trim()), links: end.querySelectorAll('a').length, footOpen: !!document.querySelector('.lab-foot-open'), footAttach: !!document.querySelector('.lab-foot-attach') }; })()`);
          check(`${label} 顶栏只留视图操作`, barSlim.links === 0 && barSlim.buttons.length > 0 && barSlim.buttons.every((t) => /右栏|历史/.test(t)) && barSlim.footOpen && barSlim.footAttach, JSON.stringify(barSlim));
          await evaluate(`document.querySelector('.lab-foot-attach').click()`);
          await waitFor(`document.querySelector('.viz-attach')`);
          await evaluate(`document.querySelector('.viz-attach button').click()`);
          await waitFor(`!document.querySelector('.viz-attach')`);
          check(`${label} 挂载移到脚注仍可用`, true);
        }
      } else {
        const inner = await quadricInner();
        check(`${label} 两栏：参数在画布右`, inner.railRight);
        check(`${label} 页内不滚动`, inner.innerScroll <= 2, `scroll=${inner.innerScroll}`);
        check(`${label} 三维视图有高度`, inner.viewH > 180, `viewH=${inner.viewH}`);
        if (width === 1440) await screenshot(`lab-fit-${c.tag}-1440.png`);
      }
    }
  }
  // 入口页与站内 React 实验： full-bleed 改动不能把它们弄坏
  await viewport(1440, 900, false);
  await navigate('/lab');
  await waitFor(`document.querySelectorAll('.lab-try').length >= 3`);
  const entry = await evaluate(`(() => {
    const plate = document.querySelector('.plate-backdrop');
    const hb = document.querySelector('.lab-history-btn');
    const hr = hb ? hb.getBoundingClientRect() : null;
    return {
      tries: document.querySelectorAll('.lab-try').length,
      badges: document.querySelectorAll('.lab-try span').length,
      startGone: !document.querySelector('.lab-start'),
      histRight: hr ? Math.round(innerWidth - hr.right) : -1,
      histTop: hr ? Math.round(hr.top) : -1,
      plateShown: !!plate && getComputedStyle(plate).display !== 'none',
      overflowX: document.documentElement.scrollWidth - innerWidth,
      full: !!document.querySelector('.lab-full'),
    };
  })()`);
  check('入口页示例入口仍在、起点区已移除', entry.tries >= 3 && entry.badges >= 3 && entry.startGone, JSON.stringify(entry));
  check('入口页历史按钮立页面右缘', entry.histRight >= 8 && entry.histRight <= 24 && entry.histTop > 64, JSON.stringify(entry));
  check('入口页保留背景图版、不铺满', entry.plateShown && !entry.full && entry.overflowX <= 1);
  await screenshot('lab-fit-entry-1440.png');

  await viewport(414, 800, true);
  await navigate('/lab');
  await waitFor(`document.querySelectorAll('.lab-try').length >= 3`);
  const mEntry = await evaluate(`(() => { const hb = document.querySelector('.lab-history-btn').getBoundingClientRect(); const bb = document.querySelector('.lab-bubble').getBoundingClientRect(); return { hr: Math.round(innerWidth - hb.right), ht: Math.round(hb.top), overlap: hb.bottom > bb.top && hb.top < bb.bottom && hb.right > bb.left && hb.left < bb.right, overflowX: document.documentElement.scrollWidth - innerWidth }; })()`);
  check('窄屏入口历史按钮右置不压气泡', mEntry.hr >= 8 && mEntry.hr <= 24 && !mEntry.overlap && mEntry.overflowX <= 1, JSON.stringify(mEntry));
  await viewport(1440, 900, false);

  await navigate(`/lab?q=${encodeURIComponent('为什么最近点就是正交投影？')}`);
  await waitFor(`document.querySelector('.plab-svg')`);
  await sleep(300);
  const proj = await evaluate(`(() => {
    const lab = document.querySelector('.lab').getBoundingClientRect();
    const svg = document.querySelector('.plab-svg').getBoundingClientRect();
    return {
      full: !!document.querySelector('.lab-full'),
      bleedLeft: Math.round(lab.left), bleedW: Math.round(lab.width), vw: document.documentElement.clientWidth,
      svgW: Math.round(svg.width), svgH: Math.round(svg.height),
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      pageScroll: document.documentElement.scrollHeight - innerHeight,
      windows: document.querySelectorAll('.lab-window').length,
    };
  })()`);
  check('投影结果页铺满且实验可用', proj.full && proj.bleedLeft === 0 && proj.bleedW === proj.vw && proj.svgW > 400 && proj.svgH > 200 && proj.overflowX <= 1 && proj.windows === 3, JSON.stringify(proj));
  await screenshot('lab-fit-projection-1440.png');

  // 会话历史：问过的、打开过的都进工作区，刷新 / 回入口 / 深链都同步
  await viewport(1440, 900, false);
  await navigate('/lab');
  await waitFor(`document.querySelector('.lab-history-btn')`);
  await waitFor(`/历史[ ]*3/.test(document.querySelector('.lab-history-btn').textContent)`);
  const entryCount = await evaluate(`document.querySelector('.lab-history-btn').textContent`);
  if (!/历史\s*3/.test(entryCount)) {
    console.log('IDB DIAG', JSON.stringify(await evaluate(`new Promise((res) => { const rq = indexedDB.open('vein-workspaces'); rq.onsuccess = () => { const db = rq.result; const tx = db.transaction('files').objectStore('files').getAllKeys(); tx.onsuccess = () => res({ keys: tx.result }); tx.onerror = () => res({ err: String(tx.error) }); }; rq.onerror = () => res({ err: String(rq.error) }); })`)));
  }
  check('入口页历史计数', /历史\s*3/.test(entryCount), entryCount);
  await evaluate(`document.querySelector('.lab-history-btn').click()`);
  await waitFor(`document.querySelectorAll('.lab-history li').length === 3`);
  await screenshot('lab-fit-history-1440.png');
  await evaluate(`[...document.querySelectorAll('.lab-history li strong')].find((x) => x.textContent === '光合作用的全过程').closest('li').querySelector('button').click()`);
  await waitFor(frameReady);
  const opened = await evaluate(`({ search: location.search, pill: document.querySelector('.lab-bar-ask').textContent, viz: new URLSearchParams(location.search).get('viz') })`);
  check('历史条目还原结果与地址', opened.viz === 'viz.photosynthesis' && opened.pill.includes('同一张画布'), JSON.stringify(opened));
  await navigate(`/lab?q=${encodeURIComponent('光合作用的全过程')}&viz=viz.photosynthesis`);
  await waitFor(frameReady);
  await evaluate(`document.querySelector('.lab-bar-end .lab-history-btn').click()`);
  await waitFor(`document.querySelectorAll('.lab-history li').length === 3`);
  const reloadKept = await evaluate(`document.querySelectorAll('.lab-history li').length`);
  check('刷新后历史仍在', reloadKept === 3, `n=${reloadKept}`);
  await evaluate(`document.querySelector('.lab-history li .lab-history-del').click()`);
  await sleep(200);
  const afterDel = await evaluate(`document.querySelectorAll('.lab-history li').length`);
  check('历史可删除', afterDel === 2, `n=${afterDel}`);
  await navigate('/lab');
  await waitFor(`document.querySelector('.lab-history-btn')`);
  await waitFor(`/历史[ ]*2/.test(document.querySelector('.lab-history-btn').textContent)`);
  const entryCount2 = await evaluate(`document.querySelector('.lab-history-btn').textContent`);
  check('删除同步到入口计数', /历史\s*2/.test(entryCount2), entryCount2);

  check('控制台无错误', browserErrors.length === 0, browserErrors.slice(0, 3).join(' | '));
} finally {
  ws?.close();
  chrome.kill();
  await server.close();
}
if (failures.length) {
  console.log(`\n${failures.length} 项未过：${failures.join('；')}`);
  process.exit(1);
}
console.log('\n全部通过');