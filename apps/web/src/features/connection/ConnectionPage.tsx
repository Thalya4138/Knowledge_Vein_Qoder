import { Link } from 'react-router-dom';
import { homeStats } from '../../app/stats';

export function ConnectionPage() {
  const s = homeStats();
  return (
    <div>
      <header className="page-head">
        <h1>知识关联探索</h1>
        <p className="page-lede">把几个概念放在一起，找它们共同的底层结构——联系必须给出理由、条件和反例检验。</p>
      </header>

      <div className="empty">
        探索链路尚未接入（示例模式）。预置探索主题：最小二乘 × 点到平面距离 × 异面直线距离——它们都与「在约束集合中最小化距离」有关。
      </div>
      <p className="next-step">
        下一步：先去看图谱里已有的 {s.relations} 条带理由、带条件的关系。探索产出的结论未来可以在这里追问、验证，再保存进图谱。
      </p>
      <Link className="action secondary" to="/atlas">
        查看已接受的关系
      </Link>
    </div>
  );
}
