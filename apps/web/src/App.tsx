import { Link, Route, Routes } from 'react-router-dom';
import { ProbePage } from './probe/ProbePage';

const VIEWS = [
  { path: '/workspace', no: '01', name: '学习工作台' },
  { path: '/lab', no: '02', name: '可视化实验室' },
  { path: '/connection', no: '03', name: '知识关联探索' },
  { path: '/atlas', no: '04', name: '认知与记忆图谱' },
];

/** 探针阶段的路由占位：只证明深链能到达，不做外壳（外壳是 T0-1）。 */
function ViewStub({ no, name }: { no: string; name: string }) {
  return (
    <main className="page">
      <h1>
        {no} {name}
      </h1>
      <p className="lede">
        你能看到这个页面，说明这条深链是可达的。功能尚未实现——三栏外壳排在 T0-1。
      </p>
      <Link className="action" to="/">
        返回探针
      </Link>
    </main>
  );
}

export default function App() {
  const mode = import.meta.env.DEV ? 'dev（构建产物相关项测不到）' : '构建产物';
  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">知脉 Vein</span>
        <span className="tag">T0-0 部署探针</span>
        <nav className="nav">
          <Link to="/">探针</Link>
          {VIEWS.map((v) => (
            <Link key={v.path} to={v.path}>
              {v.no}
            </Link>
          ))}
        </nav>
      </header>

      <div className="body">
        <Routes>
          <Route path="/" element={<ProbePage />} />
          {VIEWS.map((v) => (
            <Route key={v.path} path={v.path} element={<ViewStub no={v.no} name={v.name} />} />
          ))}
          <Route path="*" element={<ViewStub no="—" name="未匹配的路径（探针仍活着）" />} />
        </Routes>
      </div>

      <footer className="statusbar">
        <span>{mode}</span>
        <span>来源 {location.origin}</span>
        <span>无私人数据 · 无 API Key · 不写 localStorage</span>
      </footer>
    </div>
  );
}
