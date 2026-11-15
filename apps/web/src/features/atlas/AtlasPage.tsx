import { demoGraph } from '../../app/demo';
import { homeStats } from '../../app/stats';

const TYPE_LABEL: Record<string, string> = {
  contains: '包含',
  prerequisite: '先修',
  'defined-by': '由……定义',
  'derives-from': '由……推出',
  'equivalent-under': '等价',
  generalizes: '推广',
  'applies-to': '应用于',
  'contrasts-with': '对照',
  'shared-mechanism': '共用机制',
  'analogy-to': '类比',
  'counterexample-to': '反例',
};

export function AtlasPage() {
  const s = homeStats();
  const titleOf = new Map(demoGraph.nodes.map((n) => [n.id, n.title]));
  const accepted = demoGraph.relations.filter((r) => r.status === 'accepted');
  return (
    <div>
      <header className="page-head">
        <h1>认知与记忆图谱</h1>
        <p className="page-lede">把学到的、理解的、发现的东西，组织成可以检索、回忆、重构的个人知识网络。</p>
      </header>

      <div className="empty">
        图谱画布（三视图：结构 / 逻辑 / 个人记忆）尚未接入。数据里已有 {s.relations} 条被接受的关系——接入画布后，它们会变成可编辑的图谱。
      </div>

      <section className="section">
        <h2>已接受的关系（{accepted.length} 条，每条都有理由与条件）</h2>
        <ul className="rel-list">
          {accepted.map((r) => (
            <li key={r.id}>
              <span className="rel-path">
                {titleOf.get(r.from) ?? r.from}
                <span className="rel-type">{TYPE_LABEL[r.type] ?? r.type}</span>
                {titleOf.get(r.to) ?? r.to}
              </span>
              <p className="rel-expl">{r.explanation}</p>
            </li>
          ))}
        </ul>
      </section>

      <p className="next-step">
        下一步：接入画布后，你可以在三个视图之间切换、编辑布局、画自己的联想边（虚线「我的联想」），并安排主动回忆。
      </p>
    </div>
  );
}
