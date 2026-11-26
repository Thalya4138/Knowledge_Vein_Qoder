import { useEffect, useMemo, useRef, useState } from 'react';
import { ModelError } from '../../ai/chat';
import type { WorkspaceStore } from '../../store/types';
import { usePrefs, useT } from '../../ui/prefs';
import type { GraphLike } from '../atlas/mindDoc';
import { generateViz, loadRun, repairViz, saveRun, wrapHtml, type GenInput, type GenRun } from './generate';
import { capOf, phetUrl } from './toolCaps';

/**
 * 实验室的「现场生成」：计划 → 写页面 → 在沙箱里跑 → 跑不起来自动修一次 → 仍不行就如实显示错误。
 * 生成的页面以 data: 地址放进 sandbox iframe：来源是匿名的、与本站不同源，读不到 key、工作区与本站存储。
 */

/** 一张页面跑起来没有：等它报告「画完了」；报错且一直没画出东西算失败 */
export type Outcome = { ok: true; warnings: string[] } | { ok: false; errors: string[] };

const AUTO_REPAIRS = 1;

export function GenPanel({
  q,
  requested,
  runId,
  store,
  graph,
  onRun,
  onAuto,
}: {
  q: string;
  requested: string | null;
  runId: string | null;
  store: WorkspaceStore | null;
  graph: GraphLike | null;
  /** 新生成或更新了一次运行：外面记进地址与会话历史 */
  onRun: (run: GenRun) => void;
  /** 换成「自动选择」重新生成（本地工具想先在网页里看一个近似版时用） */
  onAuto: () => void;
}) {
  const { model, lang } = usePrefs();
  const t = useT();
  const [run, setRun] = useState<GenRun | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const current = useRef<GenRun | null>(null);
  current.current = run;

  const input = (): GenInput => ({ model, store, graph, q, requested, lang, signal: abort.current?.signal, onStage: setStage });

  const persist = async (r: GenRun) => {
    setRun(r);
    current.current = r;
    if (store) await saveRun(store, r).catch(() => undefined);
    onRun(r);
  };

  // 打开历史里的一次：从工作区读回；没有就现场生成。
  // 请求控制器由这次 effect 自己建、自己在清理时取消：组件重新挂载（开发模式的 StrictMode 会模拟一次）时，
  // 旧请求被取消、新的一次照常开始，不会卡在半路。
  useEffect(() => {
    // 刚生成完、地址里写上了这次的 id：就是眼前这一次，不重读、不重跑
    if (runId && current.current?.id === runId) return;
    const ctrl = new AbortController();
    abort.current = ctrl;
    setFailure(null);
    setRun(null);
    setStage(null);
    void (async () => {
      if (runId && store) {
        const saved = await loadRun(store, runId);
        if (ctrl.signal.aborted) return;
        if (saved) {
          setRun(saved);
          onRun(saved);
          return;
        }
        if (!model.apiKey) return setFailure(t('这次生成的记录不在当前工作区里了。', 'This generated result is no longer in the workspace.'));
      }
      if (!model.apiKey) return;
      try {
        const r = await generateViz(input());
        if (ctrl.signal.aborted) return;
        setStage(null);
        await persist(r.tier === 'embed' ? { ...r, status: 'ok' } : r);
      } catch (e) {
        if (ctrl.signal.aborted || (e as Error).name === 'AbortError') return;
        setStage(null);
        setFailure(e instanceof ModelError ? e.message : `生成失败：${(e as Error).message}`);
      }
    })();
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, q, requested, store]);

  /** 沙箱报告结果：失败且还没自动修过，就修一次 */
  const onOutcome = async (o: Outcome) => {
    if (!run || run.status !== 'running') return;
    if (o.ok) return void persist({ ...run, status: 'ok', errors: o.warnings });
    if (run.repairs < AUTO_REPAIRS) return void repair(o.errors);
    await persist({ ...run, status: 'failed', errors: o.errors });
  };

  const repair = async (errors: string[]) => {
    if (!run) return;
    abort.current = new AbortController();
    try {
      const fixed = await repairViz(input(), run, [...run.errors, ...errors]);
      setStage(null);
      await persist(fixed);
    } catch (e) {
      setStage(null);
      await persist({ ...run, status: 'failed', errors: [...errors, e instanceof Error ? e.message : String(e)] });
    }
  };

  if (failure) {
    return (
      <section className="lab-results">
        <p className="lab-note" role="alert">
          {failure}
        </p>
      </section>
    );
  }
  if (!run) {
    return (
      <section className="lab-results" aria-busy="true">
        <p className="lab-gen-stage" role="status">
          <span className="lab-gen-dot" aria-hidden="true" />
          {stage ?? t('读工作区里相关的讲义', 'Reading related notes in the workspace')}
        </p>
      </section>
    );
  }

  const cap = capOf(run.tool);
  return (
    <section className="lab-results" aria-label={t('可视化结果', 'Visualization')}>
      <article className="lab-window wide lab-gen">
        {run.substitutedWhy && <p className="lab-gen-sub">{run.substitutedWhy}</p>}
        {run.tier === 'browser' && <SandboxFrame key={`${run.id}:${run.repairs}`} run={run} onOutcome={(o) => void onOutcome(o)} />}
        {run.tier === 'embed' && run.plan.phet && (
          <div className="lab-gen-embed">
            <iframe className="lab-frame" src={phetUrl(run.plan.phet, lang)} title={run.plan.title} allow="fullscreen" />
            <Explain run={run} />
          </div>
        )}
        {run.tier === 'local' && <LocalCode run={run} onAuto={onAuto} />}
        {stage && (
          <p className="lab-gen-stage" role="status">
            <span className="lab-gen-dot" aria-hidden="true" />
            {stage}
          </p>
        )}
        {run.status === 'ok' && run.tier === 'browser' && run.errors.length > 0 && (
          <details className="lab-gen-failed warn">
            <summary>
              {t(`页面跑起来了，但运行中报了 ${run.errors.length} 个错误；画面不对时可以让模型修一下`, `The page runs, but reported ${run.errors.length} error(s); repair it if the view looks wrong`)}
            </summary>
            <ul>
              {run.errors.slice(0, 6).map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
            <button type="button" className="key small" disabled={Boolean(stage)} onClick={() => void repair(run.errors)}>
              {t('修一下', 'Repair')}
            </button>
          </details>
        )}
        {run.status === 'failed' && (
          <div className="lab-gen-failed" role="alert">
            <p>{t(`页面没有跑起来（已自动修复 ${run.repairs} 次）。沙箱报告的错误：`, `The page did not run (auto-repaired ${run.repairs} time(s)). Errors reported by the sandbox:`)}</p>
            <ul>
              {run.errors.slice(0, 6).map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
            <button type="button" className="key small" disabled={Boolean(stage)} onClick={() => void repair(run.errors)}>
              {t('再修一次', 'Try another repair')}
            </button>
          </div>
        )}
        <footer className="lab-foot">
          <p className="lab-caption">
            <strong>{run.plan.see}</strong>
            {run.plan.caveat ? ` ${run.plan.caveat}` : ''}
          </p>
          <details className="lab-gen-facts">
            <summary>
              {t('这张图依据的事实', 'Facts this view relies on')}（{run.plan.facts.length}）· {cap?.name} · {t('模型', 'model')} {run.model}
            </summary>
            <ul>
              {run.plan.facts.map((f) => (
                <li key={f.claim}>
                  {f.claim} <span className="lab-gen-src">— {f.source}</span>
                </li>
              ))}
            </ul>
            {run.plan.whyTool && <p>{t('为什么用这个工具：', 'Why this tool: ')}{run.plan.whyTool}</p>}
          </details>
          {run.tier === 'browser' && (
            <button type="button" className="lab-link" onClick={() => download(`${run.plan.title}.html`, run.code, 'text/html')}>
              {t('下载这张页面', 'Download this page')}
            </button>
          )}
        </footer>
      </article>
    </section>
  );
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name.replace(/[\\/:*?"<>|]/g, '_');
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 生成的页面在沙箱里运行，并判断它跑起来没有 */
function SandboxFrame({ run, onOutcome }: { run: GenRun; onOutcome: (o: Outcome) => void }) {
  const t = useT();
  const frame = useRef<HTMLIFrameElement>(null);
  const doc = useMemo(() => wrapHtml(run.code), [run.code]);
  const src = useMemo(() => dataUrl(doc), [doc]);
  const settled = run.status !== 'running';

  useEffect(() => {
    if (settled) return;
    const errors: string[] = [];
    let ready = false;
    let visual = 0;
    let done = false;
    const finish = (o: Outcome) => {
      if (done) return;
      done = true;
      onOutcome(o);
    };
    const onMsg = (ev: MessageEvent) => {
      if (ev.source !== frame.current?.contentWindow) return;
      const m = ev.data as { source?: string; type?: string; msg?: string; visual?: number; ready?: boolean };
      if (m?.source !== 'vein-gen') return;
      if (m.type === 'error' && m.msg && !errors.includes(m.msg)) errors.push(m.msg);
      if (m.type === 'ready') {
        ready = true;
        // 画完之后再等一下，把紧跟着抛出的错误一起收进来
        setTimeout(() => finish({ ok: true, warnings: [...errors] }), 800);
      }
      if (m.type === 'probe') {
        visual = Math.max(visual, m.visual ?? 0);
        // 报了错、又没报告画完：算没跑起来。只看「画面上有没有东西」不够——空的 svg、没画东西的 canvas 也算元素
        if (!ready && errors.length) finish({ ok: false, errors: [...errors] });
      }
    };
    window.addEventListener('message', onMsg);
    // Python（Pyodide）首次加载要十几秒
    const limit = run.tool === 'Matplotlib' ? 60_000 : 20_000;
    const timer = window.setTimeout(() => {
      if (ready) return;
      if (visual > 0 && !errors.length) finish({ ok: true, warnings: ['页面画出了内容，但没有调用 veinReady()'] });
      else finish({ ok: false, errors: errors.length ? [...errors] : ['页面在规定时间内没有画出任何东西'] });
    }, limit);
    return () => {
      window.removeEventListener('message', onMsg);
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, settled]);

  return (
    <iframe
      ref={frame}
      className="lab-frame"
      title={`${run.plan.title}（${t('AI 生成的交互页，在沙箱中运行', 'AI-generated interactive page, sandboxed')}）`}
      // 隔离靠 data: 地址：data: 文档的来源永远是匿名的，与本站不同源，读不到 key、工作区与本站存储，也碰不到父页面。
      // 不用 srcdoc + 无 allow-same-origin：那样每一层内嵌框架都各得一个匿名来源，GeoGebra 访问不了自己建的内层框架（2026-11-26 实测）。
      // sandbox 仍然拦下顶层跳转、弹窗与表单提交。
      sandbox="allow-scripts allow-same-origin allow-downloads"
      src={src}
      referrerPolicy="no-referrer"
    />
  );
}

/** UTF-8 文本 → data: 地址（btoa 只认 Latin-1，先按字节编码） */
export function dataUrl(html: string): string {
  const bytes = new TextEncoder().encode(html);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:text/html;charset=utf-8;base64,${btoa(bin)}`;
}

function Explain({ run }: { run: GenRun }) {
  const t = useT();
  return (
    <aside className="lab-gen-explain">
      <h3>{run.plan.title}</h3>
      {run.plan.explain.map((p) => (
        <p key={p.slice(0, 40)}>{p}</p>
      ))}
      {run.plan.controls.length > 0 && (
        <>
          <h4>{t('试着改', 'Try changing')}</h4>
          <ul>
            {run.plan.controls.map((c) => (
              <li key={c.name}>
                <strong>{c.name}</strong>：{c.effect}
              </li>
            ))}
          </ul>
        </>
      )}
      {run.plan.steps.length > 0 && (
        <ol>
          {run.plan.steps.map((s) => (
            <li key={s.title}>
              <strong>{s.title}</strong>：{s.what}
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}

/** 只能在本地运行的工具：给代码与运行说明，不假装能在网页里跑 */
function LocalCode({ run, onAuto }: { run: GenRun; onAuto: () => void }) {
  const t = useT();
  const { lang } = usePrefs();
  const cap = capOf(run.tool);
  const [copied, setCopied] = useState(false);
  return (
    <div className="lab-gen-embed">
      <div className="lab-gen-code">
        <p className="lab-gen-local">
          {t(`${run.tool} 只能在你自己的电脑上运行，这里给的是可以直接运行的代码。`, `${run.tool} runs on your own computer; here is ready-to-run code.`)}
          {cap?.file && <> {lang === 'en' ? cap.file.runEn : cap.file.run}</>}
        </p>
        <div className="lab-gen-code-tools">
          <button
            type="button"
            className="key small"
            onClick={() => void navigator.clipboard.writeText(run.code).then(() => setCopied(true))}
          >
            {copied ? t('已复制', 'Copied') : t('复制代码', 'Copy code')}
          </button>
          <button type="button" className="key small" onClick={() => download(`${run.plan.title}.${cap?.file?.ext ?? 'txt'}`, run.code, 'text/plain')}>
            {t('下载', 'Download')}
          </button>
          <button type="button" className="key small" onClick={onAuto}>
            {t('先在网页里看一个近似版', 'Preview an in-browser version')}
          </button>
        </div>
        <pre className="lab-gen-pre">
          <code>{run.code}</code>
        </pre>
      </div>
      <Explain run={run} />
    </div>
  );
}
