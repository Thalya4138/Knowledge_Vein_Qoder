import { lazy, Suspense, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { HomePage } from './app/HomePage';
import { demoKb } from './app/demo';
import { ErrorBoundary } from './ui/ErrorBoundary';

// 首页直接打包：评委落地即见，不多等一次请求。
// 四个视口按路由懒加载：进哪个页面才下载哪个页面的代码。
// T1-1 解析器 gzip 约 195 kB，接进工作台后只落在工作台那一块，不拖慢首页（ADR-0002 包体预算）。
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

function PageLoading() {
  return (
    <div className="page" role="status" aria-live="polite">
      <p className="lede">正在载入页面…</p>
    </div>
  );
}

const SECTIONS = [
  { path: '/workspace', no: '01', name: '学习工作台' },
  { path: '/lab', no: '02', name: '可视化实验室' },
  { path: '/connection', no: '03', name: '知识关联探索' },
  { path: '/atlas', no: '04', name: '认知与记忆图谱' },
];

function AiSidebar({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <>
      <aside className={open ? 'ai open' : 'ai collapsed'} aria-label="AI 助手侧栏">
        <div className="ai-head">
          <h2>AI 助手</h2>
          <button type="button" className="linklike" onClick={onToggle} aria-label="收起 AI 侧栏">
            收起
          </button>
        </div>
        <p className="ai-empty">
          选中讲义文字或图谱节点后，在这里追问。
          <br />
          当前没有选区——先去读一页讲义。
        </p>
        <button type="button" className="ai-expand" onClick={onToggle} aria-label="展开 AI 侧栏">
          AI
        </button>
      </aside>
      {!open && (
        <button type="button" className="ai-tab" onClick={onToggle} aria-label="打开 AI 侧栏">
          AI
        </button>
      )}
    </>
  );
}

function NotFound() {
  return (
    <div className="page">
      <h1>页面不存在</h1>
      <p className="lede">这个地址没有对应的页面。</p>
      <Link className="action" to="/">
        返回首页
      </Link>
    </div>
  );
}

export default function App() {
  const [aiOpen, setAiOpen] = useState(() => window.matchMedia('(min-width: 1280px)').matches);
  const { pathname } = useLocation();
  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">
          <Link to="/">知脉 Vein</Link>
        </span>
        <span className="kb-chip">当前知识库：{demoKb.title}（示例）</span>
      </header>

      <div className="layout">
        <nav className="sidenav" aria-label="主导航">
          <ul>
            <li>
              <Link className="home-link" to="/">
                首页
              </Link>
            </li>
            {SECTIONS.map((s) => (
              <li key={s.path}>
                <NavLink to={s.path} className={({ isActive }) => (isActive ? 'active' : undefined)}>
                  <span className="no">{s.no}</span>
                  {s.name}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <main className="main">
          {/* 页面级错误边界：页面内部出错或代码块下载失败（如重新部署后旧文件已不存在）时，
              导航与状态条仍在；换路由即重置（key）。外层 main.tsx 那一层只兜外壳自身。 */}
          <ErrorBoundary key={pathname}>
            <Suspense fallback={<PageLoading />}>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/workspace" element={<WorkspacePage />} />
                <Route path="/lab" element={<LabPage />} />
                <Route path="/connection" element={<ConnectionPage />} />
                <Route path="/atlas" element={<AtlasPage />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </main>

        <AiSidebar open={aiOpen} onToggle={() => setAiOpen((v) => !v)} />
      </div>

      <footer className="statusbar">
        <span>示例模式：数据来自内置示例库</span>
        <span>未配置 API（生成功能不可用）</span>
        <span>本地持久化未接入</span>
      </footer>
    </div>
  );
}
