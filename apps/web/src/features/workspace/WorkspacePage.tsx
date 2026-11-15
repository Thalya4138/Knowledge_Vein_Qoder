import { Link } from 'react-router-dom';
import { demoKb, demoNoteUrl } from '../../app/demo';
import { homeStats } from '../../app/stats';

const STATUS_LABEL: Record<string, string> = {
  written: '已成稿',
  planned: '待写',
};

export function WorkspacePage() {
  const s = homeStats();
  return (
    <div>
      <header className="page-head">
        <h1>学习工作台</h1>
        <p className="page-lede">读讲义、做练习、留下证据——掌握度只来自练习证据与自评，不来自「读过」。</p>
      </header>

      <div className="empty">
        阅读器与「导入我的资料」尚未接入（示例模式）。当前知识库：{demoKb.title}——成稿 {s.noteSections} 节，
        其余章节只有图谱节点、尚无讲义。
      </div>

      <section className="section">
        <h2>课程大纲（{demoKb.outline.length} 节）</h2>
        <ul className="outline-list">
          {demoKb.outline.map((e) => (
            <li key={e.id}>
              <span>
                {e.title}
                <span className={e.status === 'written' ? 'badge written' : 'badge planned'}>
                  {STATUS_LABEL[e.status] ?? e.status}
                </span>
              </span>
              <p className="outline-goal">{e.goal}</p>
              <p className="outline-action">
                {e.status === 'written' ? (
                  <a href={demoNoteUrl} target="_blank" rel="noreferrer">
                    读成稿样张
                  </a>
                ) : (
                  '讲义待写：本章节点与先修关系已在图谱中。'
                )}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <p className="next-step">
        下一步：阅读器（以 Markdown 为真源）接入后，这里会换成站内阅读与练习入口；现在可以先读样张，
        或去图谱看 {s.relations} 条带理由、带条件的关系。
      </p>
      <Link className="action secondary" to="/atlas">
        查看已接受的关系
      </Link>
    </div>
  );
}