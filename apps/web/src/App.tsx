import { useState } from 'react';
import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { HomePage } from './app/HomePage';
import { demoKb } from './app/demo';
import { WorkspacePage } from './features/workspace/WorkspacePage';
import { LabPage } from './features/lab/LabPage';
import { ConnectionPage } from './features/connection/ConnectionPage';
import { AtlasPage } from './features/atlas/AtlasPage';

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
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/workspace" element={<WorkspacePage />} />
            <Route path="/lab" element={<LabPage />} />
            <Route path="/connection" element={<ConnectionPage />} />
            <Route path="/atlas" element={<AtlasPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
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
