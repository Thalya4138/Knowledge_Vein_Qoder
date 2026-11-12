export type ProbeState = 'pass' | 'fail' | 'unknown' | 'running';

export interface ProbeResult {
  state: ProbeState;
  summary: string;
  evidence: string[];
  /** 这项检测骗人的方式。写出来是为了不把「没报错」当成「通过」。 */
  caveat: string;
}

const fmt = (n: number) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${(n / 1024).toFixed(1)} KB`;

/** dev 服务器的回退不是托管站的回退，结论必须带上这个限定。 */
const originNote = () =>
  import.meta.env.DEV ? '（来源是 vite dev 服务器，不代表托管站）' : '';

/**
 * 探测 1 · SPA 深链回退。
 * 直接抓一个不可能存在的路径：如果站把未知路径重写成 index.html，
 * 说明 BrowserRouter 可用；返回 404 说明必须留在 HashRouter。
 */
export async function probeSpaFallback(): Promise<ProbeResult> {
  const token = Math.random().toString(36).slice(2, 8);
  const url = new URL(`/no-such-route-${token}`, location.origin);
  const res = await fetch(url.href, { cache: 'no-store' });
  const body = await res.text();
  const contentType = res.headers.get('content-type') ?? '(无)';
  const hasRoot = body.includes('id="root"');
  const evidence = [
    `GET ${url.pathname} → HTTP ${res.status}`,
    `content-type: ${contentType}`,
    `响应体 ${fmt(body.length)}；${hasRoot ? '包含 #root，是应用外壳' : '不含 #root'}`,
    `当前来源：${location.origin}`,
  ];
  if (res.status === 200 && hasRoot) {
    return {
      state: 'pass',
      summary: `未知路径回退到应用外壳 —— BrowserRouter 在这台来源上不会 404 ${originNote()}`,
      evidence,
      caveat:
        '两种情况会被误判为 pass：软 404（返回 200 但是错误页），以及 dev 服务器自带的 history 回退。' +
        '最终以部署站上地址栏直访 /workspace 的肉眼结果为准。',
    };
  }
  if (res.status === 404) {
    return {
      state: 'fail',
      summary: `未知路径返回 404 —— 这台来源没有 SPA 回退，必须使用 HashRouter ${originNote()}`,
      evidence,
      caveat: '这正是当前 HashRouter 默认值的依据；换 BrowserRouter 前需要站方提供回退配置。',
    };
  }
  return {
    state: 'unknown',
    summary: `返回 HTTP ${res.status}，无法判定 ${originNote()}`,
    evidence,
    caveat: '可能是登录墙、CDN 拦截或重定向；请人工在地址栏直访一次并记录看到的内容。',
  };
}

interface BuildInfo {
  builtAt: string;
  largeAssetBytes: number;
  totalBytes: number;
  files: { name: string; bytes: number }[];
}

/**
 * 探测 2 · 静态资源与包体大小。
 * 依赖构建产物里的 probe/ 目录，因此 dev 模式必然测不到——如实返回 unknown。
 */
export async function probeStaticAsset(): Promise<ProbeResult> {
  const infoRes = await fetch('/probe/build-info.json', { cache: 'no-store' });
  const isJson = (infoRes.headers.get('content-type') ?? '').includes('json');
  if (!infoRes.ok || !isJson) {
    return {
      state: 'unknown',
      summary: infoRes.ok
        ? '清单请求返回的不是 JSON —— 这是 dev 模式，构建产物不存在'
        : `清单请求返回 HTTP ${infoRes.status}，部署产物可能没带 probe/ 目录`,
      evidence: [
        `GET /probe/build-info.json → HTTP ${infoRes.status}`,
        `content-type: ${infoRes.headers.get('content-type') ?? '(无)'}`,
      ],
      caveat: 'dev 下测不到包体限制。用 npm run build && npm run preview 复现，或在已部署的探针上看。',
    };
  }
  const info = (await infoRes.json()) as BuildInfo;
  const started = performance.now();
  const res = await fetch('/probe/large.txt', { cache: 'no-store' });
  const buf = await res.arrayBuffer();
  const ms = Math.round(performance.now() - started);
  const evidence = [
    `构建于 ${info.builtAt}；产物合计 ${fmt(info.totalBytes)}，共 ${info.files.length} 个文件`,
    `最大的三个：${info.files.slice(0, 3).map((f) => `${f.name} ${fmt(f.bytes)}`).join('、')}`,
    `下载 ${fmt(info.largeAssetBytes)} 资源 → HTTP ${res.status}，实收 ${fmt(buf.byteLength)}，用时 ${ms} ms`,
  ];
  if (res.ok && buf.byteLength === info.largeAssetBytes) {
    return {
      state: 'pass',
      summary: `大资源可完整取回（${fmt(buf.byteLength)}，${ms} ms）`,
      evidence,
      caveat: '这只证明「这个大小能下下来」。上传包体的上限要等 Sites 部署那一步的实际结果。',
    };
  }
  return {
    state: res.status === 404 ? 'fail' : 'unknown',
    summary: `大资源取回异常：HTTP ${res.status}，实收 ${fmt(buf.byteLength)}`,
    evidence,
    caveat: '可能是大小限制、MIME 策略或缓存；部署后需重跑一次确认。',
  };
}

/**
 * 探测 3 · 外部 iframe 是否被拦。
 * 跨源框架的 load 事件在任何情况下都会触发，所以「触发」只能证明没被 CSP 拦掉，
 * 不能证明 Desmos 画出来了——那一半必须肉眼看。
 */
export function probeIframe(src: string, timeoutMs = 10_000): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    const started = performance.now();
    let settled = false;
    const finish = (r: ProbeResult) => {
      if (settled) return;
      settled = true;
      frame.remove();
      resolve(r);
    };
    frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:640px;height:480px;border:0';
    frame.addEventListener('load', () => {
      finish({
        state: 'pass',
        summary: `框架收到 load 事件（${Math.round(performance.now() - started)} ms）—— 未被 frame-src 拦截`,
        evidence: [`src: ${src}`],
        caveat: '跨源 iframe 的 load 对错误页也会触发，且读不到其内容。是否真的画出计算器要看页面上那一块。',
      });
    });
    frame.addEventListener('error', () => {
      finish({
        state: 'fail',
        summary: '框架加载报错',
        evidence: [`src: ${src}`],
        caveat: '浏览器的错误详情不会传出来，需要开控制台看 CSP / X-Frame-Options 的具体拒绝理由。',
      });
    });
    window.setTimeout(() => {
      finish({
        state: 'unknown',
        summary: `${timeoutMs / 1000} 秒内没有 load 事件`,
        evidence: [`src: ${src}`],
        caveat: '超时不等于被拦：也可能是网络或对方限流。重试一次再下结论。',
      });
    }, timeoutMs);
    frame.src = src;
    document.body.appendChild(frame);
  });
}

const DB_NAME = 'vein-probe';
const STORE = 'writes';
const RECORD_ID = 'probe';
const PAYLOAD_CHARS = 200_000;

interface ProbeRecord {
  id: string;
  writes: number;
  firstAt: string;
  lastAt: string;
  payloadChars: number;
  /** 只为验证「读回来的还是不是写进去的那串」；探针不存任何用户数据。 */
  payload?: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB 打开失败'));
  });
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB 操作失败'));
  });
}

/**
 * 探测 4 · IndexedDB 读写与跨刷新存活。
 * 第一次运行只能得到 unknown：还没东西可验证。重载页面后才测到「刷新后仍在」。
 */
export async function probeIndexedDb(): Promise<ProbeResult> {
  const db = await openDb();
  try {
    const before = (await tx(db, 'readonly', (s) => s.get(RECORD_ID))) as ProbeRecord | undefined;
    const now = new Date().toISOString();
    const record: ProbeRecord = {
      id: RECORD_ID,
      writes: (before?.writes ?? 0) + 1,
      firstAt: before?.firstAt ?? now,
      lastAt: now,
      payloadChars: PAYLOAD_CHARS,
    };
    await tx(db, 'readwrite', (s) => s.put({ ...record, payload: 'x'.repeat(PAYLOAD_CHARS) }));
    const after = (await tx(db, 'readonly', (s) => s.get(RECORD_ID))) as ProbeRecord | undefined;
    const payload = after?.payload;
    const samePayload = typeof payload === 'string' && payload.length === PAYLOAD_CHARS;

    const estimate = navigator.storage?.estimate ? await navigator.storage.estimate() : undefined;
    const evidence = [
      `来源 ${location.origin}（IndexedDB 按来源隔离，换端口就是换一个库）`,
      `库 ${DB_NAME} / 对象仓 ${STORE}：第 ${record.writes} 次写入`,
      `写后立读 ${samePayload ? '一致' : '不一致'}（${PAYLOAD_CHARS.toLocaleString()} 字符）`,
      `本次写入时间 ${now}`,
      ...(estimate?.quota ? [`存储配额约 ${fmt(estimate.quota)}，已用 ${fmt(estimate.usage ?? 0)}`] : []),
    ];
    if (!before) {
      return {
        state: 'unknown',
        summary: '首次运行：写入成功，但「刷新后仍在」还没测到',
        evidence,
        caveat: '请重新加载本页。第二次若显示第 2 次写入且首次时间不变，才算跨刷新存活。',
      };
    }
    if (samePayload) {
      return {
        state: 'pass',
        summary: `跨刷新存活：首次写入 ${before.firstAt}，累计 ${record.writes} 次，内容完整`,
        evidence,
        caveat:
          '存活 ≠ 安全。浏览器仍可能在空间紧张时清理 IndexedDB，而托管站也可能随时重建容器。' +
          '所以 ADR-0001 要求把显式导出留在产品里，不能只靠这里。',
      };
    }
    return {
      state: 'fail',
      summary: '写入后读回不完整',
      evidence,
      caveat: '可能是配额或事务问题；换浏览器/无痕窗口再测一次以排除扩展干扰。',
    };
  } finally {
    db.close();
  }
}
