import { Link } from 'react-router-dom';
import { demoKb, demoNoteUrl } from './demo';
import { homeStats } from './stats';

export function HomePage() {
  const s = homeStats();
  const written = demoKb.outline.find((e) => e.status === 'written');
  return (
    <div className="home">
      <h1 className="hero-title">知脉 Vein</h1>
      <p className="hero-lede">已经学过的东西，怎样才能真正连起来？</p>

      <div className="hero-actions">
        <Link className="action primary" to="/workspace">
          打开示例课程：最小二乘
        </Link>
        <Link className="action" to="/workspace">
          导入我的资料
        </Link>
        <Link className="action" to="/connection">
          探索两个概念
        </Link>
      </div>

      <p className="hero-stats">
        示例包含：{s.noteSections} 节讲义 · {s.nodes} 个知识节点 · {s.relations} 条带理由的关系 ·{' '}
        {s.experiments} 个实验
      </p>

      <section className="preview" aria-label="讲义第一屏预览">
        <h2>讲义第一屏：{written?.title ?? '示例讲义'}</h2>
        <iframe className="preview-frame" src={demoNoteUrl} title="教材式讲义样张：列空间中的最近点" />
        <p className="preview-note">
          这是真实的样张页面（可滚动、可操作），不是截图。阅读器（以 Markdown 为真源）接入后，这里会换成站内渲染。
          <a href={demoNoteUrl} target="_blank" rel="noreferrer">
            在新标签页打开完整样张
          </a>
        </p>
      </section>
    </div>
  );
}
