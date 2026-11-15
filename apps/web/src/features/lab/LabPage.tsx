import { demoNoteUrl } from '../../app/demo';
import { countRealTools } from '../../app/stats';
import { TOOLS } from './tools';

export function LabPage() {
  const real = countRealTools(TOOLS);
  return (
    <div>
      <header className="page-head">
        <h1>可视化实验室</h1>
        <p className="page-lede">把抽象的数学对象变成可以动手的模型：改参数、预测结果、再运行验证。</p>
      </header>

      <div className="empty">
        当前没有已注册的真实实验（可用工具 {real} 个）。浏览器内仿真与工具注册表在后续版本接入。
      </div>
      <p className="next-step">
        下一步：实验接入后，讲义中的「探究·实践」栏目会直接链接到这里。现在可以先读成稿讲义，看看实验应该长在哪里。
      </p>
      <a className="action secondary" href={demoNoteUrl} target="_blank" rel="noreferrer">
        读成稿讲义
      </a>
    </div>
  );
}
