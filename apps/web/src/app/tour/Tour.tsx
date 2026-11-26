import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { usePrefs, useT } from '../../ui/prefs';
import { spaceForPath, spaceText } from '../../ui/spaces';
import { TOUR, type TourStop } from './stops';
import '../../styles/tour.css';

/**
 * 聚光灯导览（用户 2026-11-26 选定的形式）：每一站先跳到站点地址，等目标元素出现，
 * 把它滚进视野，四周压暗、只留它亮着，旁边一张说明卡。站点内容全在 stops.ts。
 *
 * 页面在导览期间仍然可以操作（亮洞不拦点击），用户随手点一下不会把导览弄坏：
 * 「下一步」总是先回到下一站的地址。进度存 sessionStorage，刷新后接着走，关掉标签页就清。
 */

const STEP_KEY = 'vein.tour.step';
// 实验页 iframe 与主页面同源、共享 sessionStorage：静态实验页地址若被托管回退成站点本身，
// iframe 里的导览会读到同一份进度并把 iframe 导航到站点路由，造成无限嵌套。导览只在顶层渲染。
const IN_FRAME = typeof window !== 'undefined' && window.self !== window.top;
const PAD = 8;
const GAP = 14;
const WAIT_MS = 5000;
const GIVE_UP_MS = 15000;

interface TourApi {
  start: (at?: number) => void;
  active: boolean;
}

const Ctx = createContext<TourApi>({ start: () => {}, active: false });

export function useTour() {
  return useContext(Ctx);
}

function readStep(): number | null {
  const v = sessionStorage.getItem(STEP_KEY);
  const n = v === null ? NaN : Number(v);
  return Number.isInteger(n) && n >= 0 && n < TOUR.length ? n : null;
}

/** 当前地址是否已经在这一站：路径相同，且站点要求的每个参数都对得上（多出来的参数不管）。 */
export function atStop(pathname: string, search: string, path: string): boolean {
  const want = new URL(path, 'http://x.test');
  if (want.pathname !== pathname) return false;
  const have = new URLSearchParams(search);
  for (const [k, v] of want.searchParams) if (have.get(k) !== v) return false;
  return true;
}

export function TourProvider({ children }: { children: ReactNode }) {
  const [step, setStepState] = useState<number | null>(readStep);
  const setStep = useCallback((n: number | null) => {
    if (n === null) sessionStorage.removeItem(STEP_KEY);
    else sessionStorage.setItem(STEP_KEY, String(n));
    setStepState(n);
  }, []);
  const api = useMemo<TourApi>(() => ({ start: (at = 0) => setStep(at), active: step !== null }), [step, setStep]);
  return (
    <Ctx.Provider value={api}>
      {children}
      {step !== null && !IN_FRAME && <TourOverlay step={step} setStep={setStep} />}
    </Ctx.Provider>
  );
}

type Box = { top: number; left: number; width: number; height: number };

/** 目标元素在视口里可见的那一块（加内边距后裁到视口内） */
function visibleBox(el: Element): Box | null {
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const top = Math.max(r.top - PAD, 4);
  const left = Math.max(r.left - PAD, 4);
  const bottom = Math.min(r.bottom + PAD, vh - 4);
  const right = Math.min(r.right + PAD, vw - 4);
  if (bottom <= top || right <= left) return null;
  return { top, left, width: right - left, height: bottom - top };
}

function findTarget(stop: TourStop): Element | null {
  for (const s of stop.sel) {
    const el = document.querySelector(s);
    if (el && el.getBoundingClientRect().width > 0) return el;
  }
  return null;
}

/** 说明卡放哪：下 → 上 → 右 → 左；都放不下（目标几乎占满屏）就压在目标右下角里面。 */
function placeCard(box: Box | null, cw: number, ch: number): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clampX = (x: number) => Math.min(Math.max(x, 12), vw - cw - 12);
  const clampY = (y: number) => Math.min(Math.max(y, 12), vh - ch - 12);
  if (!box) return { top: clampY((vh - ch) / 2), left: clampX((vw - cw) / 2) };
  const below = box.top + box.height + GAP;
  if (below + ch <= vh - 12) return { top: below, left: clampX(box.left) };
  const above = box.top - GAP - ch;
  if (above >= 12) return { top: above, left: clampX(box.left) };
  const right = box.left + box.width + GAP;
  if (right + cw <= vw - 12) return { top: clampY(box.top), left: right };
  const left = box.left - GAP - cw;
  if (left >= 12) return { top: clampY(box.top), left };
  return { top: clampY(box.top + box.height - ch - 16), left: clampX(box.left + box.width - cw - 16) };
}

function TourOverlay({ step, setStep }: { step: number; setStep: (n: number | null) => void }) {
  const { lang } = usePrefs();
  const t = useT();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const stop = TOUR[step]!;
  const text = lang === 'en' ? stop.en : stop.zh;
  const [box, setBox] = useState<Box | null>(null);
  const [searching, setSearching] = useState(true);
  const [narrow, setNarrow] = useState(() => window.innerWidth < 720);
  const [cardSize, setCardSize] = useState({ w: 360, h: 200 });
  const card = useRef<HTMLDivElement>(null);
  const target = useRef<Element | null>(null);
  const loc = useRef({ pathname, search });
  loc.current = { pathname, search };

  const last = step === TOUR.length - 1;
  const next = useCallback(() => setStep(last ? null : step + 1), [last, step, setStep]);
  const prev = useCallback(() => step > 0 && setStep(step - 1), [step, setStep]);
  const close = useCallback(() => setStep(null), [setStep]);

  // 进站：只在换站时跳地址，之后用户在页面里点出新参数（比如打开一条对话）不会被拽回去
  useEffect(() => {
    if (!atStop(loc.current.pathname, loc.current.search, stop.path)) navigate(stop.path);
    target.current = null;
    setBox(null);
    setSearching(true);
    let ranBefore = !stop.before;
    let cancelled = false;
    const t0 = Date.now();
    const poll = window.setInterval(() => {
      if (cancelled) return;
      if (!ranBefore) ranBefore = stop.before!();
      const el = ranBefore ? findTarget(stop) : null;
      if (el) {
        window.clearInterval(poll);
        target.current = el;
        const r = el.getBoundingClientRect();
        const tall = r.height > window.innerHeight * 0.7;
        if (r.top < 64 || r.bottom > window.innerHeight || tall) {
          const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          el.scrollIntoView({ block: tall ? 'start' : 'center', behavior: smooth ? 'smooth' : 'auto' });
        }
        setSearching(false);
      } else if (Date.now() - t0 > WAIT_MS) {
        // 页面慢（首次加载代码块、网络慢）：先把说明卡放到屏幕中间，导览不能卡死；
        // 但继续找，元素一出现跟随循环就会补上高亮。再过 GIVE_UP_MS 才真正放弃
        setSearching(false);
        if (Date.now() - t0 > GIVE_UP_MS) window.clearInterval(poll);
      }
    }, 100);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // 跟随目标：滚动、缩放、版面变化（字体加载、懒加载内容）都会移动它
  useEffect(() => {
    if (searching) return;
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setNarrow(window.innerWidth < 720);
        const el = target.current;
        setBox(el && el.isConnected ? visibleBox(el) : null);
      });
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    const tick = window.setInterval(measure, 300);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      window.clearInterval(tick);
    };
  }, [searching, step]);

  useLayoutEffect(() => {
    const el = card.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (w !== cardSize.w || h !== cardSize.h) setCardSize({ w, h });
  });

  // 换站时把焦点交给说明卡，读屏会读出标题与说明
  useEffect(() => {
    card.current?.focus({ preventScroll: true });
  }, [step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
      if (e.key === 'Escape') close();
      else if (typing) return;
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, next, prev]);

  const stopPath = new URL(stop.path, 'http://x.test').pathname;
  const space = spaceForPath(stopPath);
  const section = space ? spaceText(space, lang).name : t('封面', 'Cover');
  const pos = narrow ? null : placeCard(box, cardSize.w, cardSize.h);

  return (
    <div className="tour" data-searching={searching || undefined}>
      {box ? (
        <div className="tour-hole" style={{ top: box.top, left: box.left, width: box.width, height: box.height }} aria-hidden="true" />
      ) : (
        <div className="tour-dim" aria-hidden="true" />
      )}
      <div
        ref={card}
        className={`tour-card${narrow ? ' sheet' : ''}`}
        style={pos ? { top: pos.top, left: pos.left } : undefined}
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        tabIndex={-1}
        data-space={space?.key ?? 'cover'}
      >
        <div className="tour-meta">
          <span className="tour-section">{section}</span>
          <span className="tour-count">
            {step + 1} / {TOUR.length}
          </span>
          <button type="button" className="tour-close" onClick={close} aria-label={t('结束导览', 'End tour')} title={t('结束导览（Esc）', 'End tour (Esc)')}>
            ×
          </button>
        </div>
        <h2 id="tour-title" className="tour-title">
          {text.title}
        </h2>
        <p id="tour-body" className="tour-body">
          {text.body}
        </p>
        <div className="tour-progress" aria-hidden="true">
          <span style={{ width: `${((step + 1) / TOUR.length) * 100}%` }} />
        </div>
        <div className="tour-actions">
          <button type="button" className="btn quiet small" onClick={prev} disabled={step === 0}>
            {t('上一步', 'Back')}
          </button>
          <button type="button" className="btn primary small" onClick={next}>
            {last ? t('完成', 'Done') : t('下一步', 'Next')}
          </button>
        </div>
      </div>
    </div>
  );
}
