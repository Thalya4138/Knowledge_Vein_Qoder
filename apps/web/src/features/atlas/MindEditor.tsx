import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
// 公式排版所需的样式与字体；字体由构建打成静态资源，按需加载
import 'katex/dist/katex.min.css';
import { MindCanvas, SHEET, type CanvasEls, type CanvasIO } from './mindCanvas';
import type { KnowledgeContext, MDoc } from './mindDoc';

/**
 * 可编辑思维导图的外框：工具条、大纲、画板、详情栏、底栏与快捷键表。
 * 画板内部由 MindCanvas 命令式绘制（见 mindCanvas.ts 顶部的说明）。
 */

const UNDO = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </svg>
);
const REDO = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m15 14 5-5-5-5" />
    <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
  </svg>
);

function Keys({ k }: { k: string }) {
  if (/^[一-龥$]/.test(k) && k !== '空格') return <b>{k}</b>;
  return (
    <>
      {k.split('+').map((x) => (
        <kbd key={x}>{x}</kbd>
      ))}
    </>
  );
}

export interface MindEditorProps extends CanvasIO {
  /** 打开时的导图（来自工作区的 maps/mind.json） */
  doc: MDoc;
  /** 工作区 graph.json 的只读知识关系 */
  knowledge: KnowledgeContext;
  /** 把画布交给外面（AI 对话框要读当前导图、整图应用修改） */
  onCanvas?: (c: MindCanvas | null) => void;
  /** 打开后选中挂着这个知识点的主题（地址里的 ?focus=） */
  focus?: string | null;
}

/** 父组件用 `key={工作区 id}` 挂载：换工作区就换一块画布。 */
export function MindEditor({ doc, knowledge, persist, fresh, savedLabel, seed, vizOf, goOf, onCanvas, focus }: MindEditorProps) {
  const navigate = useNavigate();
  // 画布只建一次；去处要读最新的工作区，所以经 ref 转一手
  const goRef = useRef(goOf);
  goRef.current = goOf;
  const rootRef = useRef<HTMLDivElement>(null);
  const canvas = useRef<MindCanvas | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [outline, setOutline] = useState(true);
  const [insp, setInsp] = useState(true);
  const [, setTick] = useState(0);
  const [title, setTitle] = useState('');

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const q = <T extends Element>(s: string) => root.querySelector(s) as T;
    const els: CanvasEls = {
      root,
      board: q('.me-board'),
      world: q('.me-world'),
      svg: q('.me-edges'),
      tree: q('.me-tree'),
      insp: q('.me-insp-body'),
      inspHead: q('.me-insp-head'),
      hints: q('.me-hints'),
      meta: q('.me-meta'),
      searchIn: q('.me-search input'),
      searchCount: q('.me-search .count'),
      fileIn: q('.me-file'),
      zoomVal: q('.me-zoom-val'),
    };
    let timer = 0;
    const c = new MindCanvas(
      els,
      knowledge,
      doc,
      (msg) => {
        setToast(msg);
        window.clearTimeout(timer);
        timer = window.setTimeout(() => setToast(null), 1800);
      },
      () => setSheet(true),
      { persist, fresh, savedLabel, seed, vizOf, goOf: (t) => goRef.current?.(t) ?? [] },
    );
    canvas.current = c;
    onCanvas?.(c);
    setTitle(c.title());
    const onState = () => setTick((t) => t + 1);
    root.addEventListener('me-state', onState);
    const onShow = (e: Event) => ((e as CustomEvent<string>).detail === 'outline' ? setOutline(true) : setInsp(true));
    root.addEventListener('me-show', onShow);
    // 详情栏里的去处是普通链接（可在新标签打开）；普通点击改走站内路由，不整页刷新
    const onNav = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[data-nav]');
      if (!a || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const url = new URL(a.href);
      if (url.origin !== window.location.origin) return;
      e.preventDefault();
      navigate(url.pathname + url.search + url.hash);
    };
    root.addEventListener('click', onNav);
    return () => {
      root.removeEventListener('click', onNav);
      root.removeEventListener('me-state', onState);
      root.removeEventListener('me-show', onShow);
      window.clearTimeout(timer);
      c.destroy();
      canvas.current = null;
      onCanvas?.(null);
    };
  }, []);

  useEffect(() => {
    if (focus && canvas.current && !canvas.current.focusRef(focus)) setToast('导图里还没有挂着这个知识点的主题');
  }, [focus]);

  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSheet(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheet]);

  const c = canvas.current;
  const fileAct = (f: (c: MindCanvas) => void) => () => {
    setSheet(false);
    if (canvas.current) f(canvas.current);
  };
  const cls = ['me', outline ? '' : 'no-outline', insp ? '' : 'no-inspector'].filter(Boolean).join(' ');

  return (
    <div className={cls} ref={rootRef}>
      <div className="me-bar">
        <input
          className="me-doc-title"
          aria-label="导图标题"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => c?.setTitle(title)}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <div className="me-keys">
          <button type="button" className="key small" aria-pressed={outline} onClick={() => setOutline((v) => !v)}>
            大纲
          </button>
          <button type="button" className="key small" aria-pressed={insp} onClick={() => setInsp((v) => !v)}>
            详情
          </button>
        </div>
        <div className="me-keys">
          <button type="button" className="key small square" aria-label="撤销" title="撤销 Ctrl+Z" disabled={!c?.canUndo()} onClick={() => c?.undo()}>
            {UNDO}
          </button>
          <button type="button" className="key small square" aria-label="重做" title="重做 Ctrl+Y" disabled={!c?.canRedo()} onClick={() => c?.redo()}>
            {REDO}
          </button>
          <button type="button" className="key small" title="F1" onClick={() => setSheet(true)}>
            快捷键与文件
          </button>
        </div>
      </div>

      <aside className="me-panel me-outline" aria-label="大纲">
        <div className="me-panel-head">
          <h2>大纲</h2>
        </div>
        <label className="me-search">
          <input type="search" placeholder="搜索主题、公式、笔记" aria-label="搜索" />
          <span className="count" />
        </label>
        <div className="me-panel-body">
          <ul className="me-tree" />
        </div>
      </aside>

      <div className="me-board" tabIndex={0} aria-label="思维导图画板，方向键移动，Tab 新建子主题">
        <div className="me-world">
          <svg className="me-edges" width="1" height="1" aria-hidden="true" />
        </div>
        <div className="me-tools top">
          <span className="me-tools-label">连线</span>
          <span className="segmented">
            <button type="button" data-view="links:sel">
              选中时
            </button>
            <button type="button" data-view="links:all">
              全部
            </button>
            <button type="button" data-view="links:none">
              隐藏
            </button>
          </span>
          <span className="segmented">
            <button type="button" data-view="fx">
              公式
            </button>
            <button type="button" data-view="chips">
              角标
            </button>
          </span>
          <span className="segmented">
            <button type="button" data-view="layout:both">
              两侧
            </button>
            <button type="button" data-view="layout:right">
              向右
            </button>
          </span>
        </div>
        <div className="me-tools bottom-left">
          <span className="me-tools-label">展开到</span>
          <span className="segmented">
            <button type="button" data-level="2">
              第 2 层
            </button>
            <button type="button" data-level="3">
              第 3 层
            </button>
            <button type="button" data-level="99">
              全部
            </button>
          </span>
        </div>
        <div className="me-tools bottom-right">
          <button type="button" className="key small square" aria-label="缩小" onClick={() => c?.zoom(1 / 1.2)}>
            −
          </button>
          <span className="me-zoom-val">100%</span>
          <button type="button" className="key small square" aria-label="放大" onClick={() => c?.zoom(1.2)}>
            ＋
          </button>
          <button type="button" className="key small" onClick={() => c?.fit()}>
            适应窗口
          </button>
        </div>
      </div>

      <aside className="me-panel me-inspector" aria-label="详情">
        <div className="me-panel-head me-insp-head" />
        <div className="me-panel-body me-insp-body" />
      </aside>

      <footer className="me-status">
        <div className="me-hints" />
        <div className="me-meta" />
      </footer>
      <input type="file" className="me-file" accept=".json,application/json" hidden />

      {sheet && (
        <div className="me-sheet-bg" onClick={(e) => e.target === e.currentTarget && setSheet(false)}>
          <div className="me-sheet" role="dialog" aria-modal="true" aria-labelledby="me-sheet-t">
            <h2 id="me-sheet-t">快捷键</h2>
            <p className="lead">Tab、Enter、Shift+Tab、F2、Delete 与 WPS 思维导图相同。改动自动保存在这台电脑的浏览器里。</p>
            <div className="cols">
              {SHEET.map(([group, rows]) => (
                <div key={group} className="col-group">
                  <h3>{group}</h3>
                  {rows.map(([k, v]) => (
                    <div className="kv" key={k + v}>
                      <span>{v}</span>
                      <span className="ks">
                        <Keys k={k} />
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div className="foot">
              <div className="me-keys">
                <button type="button" className="key small" onClick={fileAct(() => rootRef.current?.querySelector<HTMLInputElement>('.me-file')?.click())}>
                  导入 JSON
                </button>
                <button type="button" className="key small" onClick={fileAct((x) => x.exportJSON())}>
                  导出 JSON
                </button>
                <button type="button" className="key small" onClick={fileAct((x) => x.exportMD())}>
                  导出 Markdown
                </button>
                {seed && (
                  <button type="button" className="key small" onClick={fileAct((x) => x.reset())}>
                    恢复示例
                  </button>
                )}
              </div>
              <button type="button" className="key small" autoFocus onClick={() => setSheet(false)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div className="me-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
