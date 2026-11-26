import { lazy, Suspense } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { CoverPage } from './app/CoverPage';
import { useWorkspace, WorkspaceProvider } from './app/WorkspaceProvider';
import { DEMO_WORKSPACE } from './features/workspace/workspaceData';
import { Wordmark } from './ui/brand/Wordmark';
import { Icon } from './ui/Icon';
import { usePrefs, useT } from './ui/prefs';
import { TourProvider } from './app/tour/Tour';
import { SettingsDialog } from './ui/SettingsDialog';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { SPACES, spaceForPath, spaceText } from './ui/spaces';
import { HerbariumPlate, LabPlate, VenationPlate } from './ui/plate/Backdrops';

// 封面直接打包：评委落地即见。四个板块按路由懒加载，进哪个才下载哪个（ADR-0002 包体预算）。
const WorkspacePage = lazy(() =>
  import('./features/workspace/WorkspacePage').then((m) => ({ default: m.WorkspacePage })),
);
const LabPage = lazy(() => import('./features/lab/LabPage').then((m) => ({ default: m.LabPage })));
const ConnectionPage = lazy(() =>
  import('./features/connection/ConnectionPage').then((m) => ({ default: m.ConnectionPage })),
);
const AtlasPage = lazy(() =>
  import('./features/atlas/AtlasPage').then((m) => ({ default: m.AtlasPage })),
);
const GuidePage = lazy(() => import('./app/GuidePage').then((m) => ({ default: m.GuidePage })));

function WorkspaceSwitcher() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const { spaces, ready, workspace } = useWorkspace();
  const current = workspace ?? DEMO_WORKSPACE;
  const t = useT();

  return (
    <label className="workspace-switch">
      <Icon name="folder" />
      <span className="sr-only">{t('当前工作区', 'Current workspace')}</span>
      <select
        aria-label={t('当前工作区', 'Current workspace')}
        value={current.id}
        disabled={!ready}
        onChange={(e) => {
          const next = new URLSearchParams(search);
          next.set('ws', e.target.value);
          for (const key of ['file', 'view', 'open', 'map']) next.delete(key);
          navigate({ pathname, search: `?${next.toString()}` });
        }}
      >
        {spaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
      </select>
    </label>
  );
}

/** 页眉右侧：入门文档、白天 / 夜间、设置（模型、存储、语言、账号都在设置里）。 */
function TopbarActions() {
  const p = usePrefs();
  const t = useT();
  return (
    <div className="topbar-end">
      <Link to="/guide" className="key small" viewTransition>
        <Icon name="book" />
        <span>{t('入门', 'Guide')}</span>
      </Link>
      <button
        type="button"
        className="key small square lang-toggle"
        onClick={() => p.setLang(p.lang === 'en' ? 'zh' : 'en')}
        aria-label={p.lang === 'en' ? '切换到中文' : 'Switch to English'}
        title={p.lang === 'en' ? '中文' : 'English'}
        lang={p.lang === 'en' ? 'zh-CN' : 'en'}
      >
        {p.lang === 'en' ? '中' : 'EN'}
      </button>
      <button
        type="button"
        className="key small square"
        onClick={() => p.setTheme(p.resolvedDark ? 'light' : 'dark')}
        aria-label={p.resolvedDark ? t('切换到白天模式', 'Switch to light mode') : t('切换到夜间模式', 'Switch to dark mode')}
        title={p.resolvedDark ? t('白天模式', 'Light mode') : t('夜间模式', 'Dark mode')}
      >
        <Icon name={p.resolvedDark ? 'sun' : 'moon'} />
      </button>
      <button type="button" className="key small square" onClick={() => p.openSettings()} aria-label={t('设置', 'Settings')} title={t('设置：模型、存储、语言、账号', 'Settings: model, storage, language, account')}>
        <Icon name="settings" />
      </button>
    </div>
  );
}

function PageLoading() {
  return <div className="page-loading" role="status" aria-live="polite" />;
}

function NotFound() {
  const t = useT();
  return (
    <div className="plain-page">
      <h1 className="display">{t('这个地址没有页面', 'Nothing lives at this address')}</h1>
      <p>{t('链接可能写错了。', 'The link may be mistyped.')}</p>
      <Link className="btn primary" to="/" viewTransition>
        {t('回到封面', 'Back to the cover')}
      </Link>
    </div>
  );
}

export default function App() {
  const { pathname, search } = useLocation();
  const space = spaceForPath(pathname);
  const currentWorkspace = new URLSearchParams(search).get('ws');
  const { lang } = usePrefs();
  const t = useT();

  return (
    <WorkspaceProvider>
      <TourProvider>
      <div className="shell" data-page={space?.key ?? (pathname === '/' ? 'cover' : 'other')}>
      <a className="skip" href="#main">
        {t('跳到正文', 'Skip to content')}
      </a>
      <header className="topbar">
        <div className="topbar-context">
          <Link to="/" className="topbar-brand" aria-label={t('知脉 Vein 封面', 'Vein — cover')} viewTransition>
            <Wordmark size="small" />
          </Link>
          <WorkspaceSwitcher />
        </div>
        <nav className="topbar-nav" aria-label={t('工作空间', 'Spaces')}>
          <ul>
            {SPACES.map((s) => (
              <li key={s.key}>
                <NavLink
                  to={`${s.path}${currentWorkspace ? `?ws=${encodeURIComponent(currentWorkspace)}` : ''}`}
                  viewTransition
                  className={({ isActive }) => (isActive ? 'key small on' : 'key small')}
                >
                  {spaceText(s, lang).short}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <TopbarActions />
      </header>

      {/* 背景图版：按板块挂一张，钉在视口里（DESIGN.md §14）。工作台是阅读区，不挂。 */}
      {space?.key === 'lab' && <LabPlate />}
      {space?.key === 'connection' && <HerbariumPlate />}
      {space?.key === 'atlas' && <VenationPlate />}
      <main id="main" className="main">
        {/* 页面级错误边界：页面出错或代码块下载失败时页眉仍在；换路由即重置。 */}
        <ErrorBoundary key={pathname}>
          <Suspense fallback={<PageLoading />}>
            <Routes>
              <Route path="/" element={<CoverPage />} />
              <Route path="/workspace" element={<WorkspacePage />} />
              <Route path="/lab" element={<LabPage />} />
              <Route path="/connection" element={<ConnectionPage />} />
              <Route path="/atlas" element={<AtlasPage />} />
              <Route path="/guide" element={<GuidePage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
      <SettingsDialog />
      </div>
      </TourProvider>
    </WorkspaceProvider>
  );
}
