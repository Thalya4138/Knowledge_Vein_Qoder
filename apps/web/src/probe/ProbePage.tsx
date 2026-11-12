import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  probeDeepLink,
  probeIframe,
  probeIndexedDb,
  probeStaticAsset,
  type ProbeResult,
  type ProbeState,
} from './checks';

const DESMOS_URL = 'https://www.desmos.com/calculator';

const STATE_LABEL: Record<ProbeState, string> = {
  pass: '通过',
  fail: '失败',
  unknown: '无法判定',
  running: '检测中',
};

interface Check {
  key: string;
  question: string;
  adrCell: string;
  run: () => Promise<ProbeResult>;
  manual: string;
  /** 需要整页导航才能测的项，给出重载目标路径。 */
  reloadPath?: string;
}

const CHECKS: Check[] = [
  {
    key: 'deeplink',
    question: '深链（如 /atlas）能否到达应用外壳',
    adrCell: 'SPA 深链是否 404',
    run: probeDeepLink,
    manual: '点「从 /atlas 重新加载」：看到本探针页 = 文档请求被回退；看到 404 页 = 这台来源不回退。',
    reloadPath: '/atlas',
  },
  {
    key: 'asset',
    question: '较大的静态资源能否上传并被完整下载',
    adrCell: '构建产物 / 单资源大小限制',
    run: probeStaticAsset,
    manual: 'dev 模式测不到，必须 npm run build 后在 preview 或部署站点上看。',
  },
  {
    key: 'iframe',
    question: '能否嵌入外部 iframe（Desmos / GeoGebra）',
    adrCell: '可否 iframe 嵌入',
    run: () => probeIframe(DESMOS_URL),
    manual: '看下面那一块是否真的画出坐标系——load 事件证明不了这个。',
  },
  {
    key: 'idb',
    question: 'IndexedDB 能否读写、刷新后是否还在',
    adrCell: 'IndexedDB 可否读写、是否被清理',
    run: probeIndexedDb,
    manual: '首次运行只会得到「无法判定」；重载页面第二次才算测到跨刷新存活。',
  },
];

type Results = Record<string, ProbeResult | undefined>;

function toMarkdown(results: Results): string {
  const rows = CHECKS.map((c) => {
    const r = results[c.key];
    const verdict = r ? `${STATE_LABEL[r.state]}：${r.summary}` : '未运行';
    return `| ${c.adrCell} | ${verdict} |`;
  });
  return ['| 问题 | 结果 |', '| --- | --- |', ...rows].join('\n');
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function ProbePage() {
  const [results, setResults] = useState<Results>({});
  const [copied, setCopied] = useState(false);
  const started = useRef(false);

  const runOne = useCallback(async (c: Check) => {
    setResults((prev) => ({ ...prev, [c.key]: { state: 'running', summary: '检测中', evidence: [], caveat: '' } }));
    try {
      const r = await c.run();
      setResults((prev) => ({ ...prev, [c.key]: r }));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setResults((prev) => ({
        ...prev,
        [c.key]: { state: 'fail', summary: `探针抛出异常：${message}`, evidence: [], caveat: '异常本身也是结论：说明这条能力在当前环境下不可用。' },
      }));
    }
  }, []);

  const runAll = useCallback(async () => {
    for (const c of CHECKS) await runOne(c);
  }, [runOne]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void runAll();
  }, [runAll]);

  const done = CHECKS.filter((c) => results[c.key] && results[c.key]!.state !== 'running').length;
  const md = toMarkdown(results);

  return (
    <main className="page">
      <h1>T0-0 部署探针</h1>
      <p className="lede">
        这个页面只有一个用途：把 <code>ADR-0002</code> 里那四项「待验证」变成实测结果。
        它不是产品外壳，也不包含任何用户数据。每项都同时给出自动结论、证据，以及
        <strong>这个结论会以什么方式骗人</strong>。
      </p>
      <p className="caveat">
        结论只在<strong>当前来源</strong>成立（见底部状态条）。localhost 的 preview 只证明代码能跑，
        不证明 Qoder Sites 的回退与大小策略 —— 部署到站点后必须在这个页面重跑一次，
        拿 origin 是 <code>*.qoder.site</code> 的那一份结果去填 ADR-0002。
      </p>

      <div className="toolbar">
        <button type="button" className="action" onClick={() => void runAll()}>
          重新运行全部（{done}/{CHECKS.length} 已完成）
        </button>
        <button
          type="button"
          className="action secondary"
          onClick={() => {
            void copy(md).then((ok) => {
              setCopied(ok);
              window.setTimeout(() => setCopied(false), 2000);
            });
          }}
        >
          {copied ? '已复制，粘进 DECISIONS.md' : '复制为 ADR-0002 表格'}
        </button>
        <a className="action secondary" href="#manual-checks">
          人工确认项
        </a>
      </div>

      {CHECKS.map((c) => {
        const r = results[c.key];
        const state = r?.state ?? 'running';
        return (
          <section className={`card state-${state}`} key={c.key}>
            <h2>{c.question}</h2>
            <p className="verdict">
              <span className={`pill pill-${state}`}>{STATE_LABEL[state]}</span>
              {r?.summary ?? '排队中'}
            </p>
            {r && r.evidence.length > 0 && (
              <pre className="evidence">{r.evidence.join('\n')}</pre>
            )}
            {r?.caveat && <p className="caveat">可能骗人之处：{r.caveat}</p>}
            <p className="manual">人工确认：{c.manual}</p>
            <button type="button" className="action secondary" onClick={() => void runOne(c)}>
              只重跑这一项
            </button>
            {c.reloadPath && (
              <button
                type="button"
                className="action"
                onClick={() => {
                  window.location.assign(c.reloadPath!);
                }}
              >
                从 {c.reloadPath} 重新加载（整页导航）
              </button>
            )}
          </section>
        );
      })}

      <section className="card" id="embed-target">
        <h2>Desmos 嵌入（给人看的那一块）</h2>
        <p className="verdict">上面第三项的 load 事件只说明没被拦截；坐标系是否真出现，看这里。</p>
        <iframe
          className="embed"
          title="Desmos 计算器嵌入测试"
          src={DESMOS_URL}
          width="640"
          height="360"
          loading="lazy"
        />
      </section>

      <section className="card" id="manual-checks">
        <h2>深链人工确认</h2>
        <p className="verdict">四个视口都在，切换不刷新；每个都该显示自己的标题。</p>
        <ul className="links">
          <li><Link to="/workspace">/workspace 学习工作台</Link></li>
          <li><Link to="/lab">/lab 可视化实验室</Link></li>
          <li><Link to="/connection">/connection 知识关联探索</Link></li>
          <li><Link to="/atlas">/atlas 认知与记忆图谱</Link></li>
        </ul>
        <p className="manual">
          把这四个地址里的 <code>#/</code> 换成 <code>/</code> 直接访问：能打开说明站方支持 SPA 回退，
          可以换 BrowserRouter；出现 404 或空白就继续用 HashRouter，并把结论写进 ADR-0002。
        </p>
      </section>

      <section className="card">
        <h2>将要写进 ADR-0002 的结论</h2>
        <pre className="evidence">{md}</pre>
      </section>
    </main>
  );
}
