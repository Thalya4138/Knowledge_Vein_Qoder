import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useWorkspace } from '../../app/WorkspaceProvider';
import { Icon } from '../../ui/Icon';
import { DEMO_WORKSPACE } from '../workspace/workspaceData';
import { ProjectionLab } from './ProjectionLab';
import '../../styles/lab.css';

/**
 * 可视化实验室：对话气泡起手。指定工具就按工具返回，不指定就返回几种可视化。
 * 示例模式：只有「为什么最近点就是正交投影」有现成结果；其中交互实验是真的，另外两种标明计划中。
 */

/**
 * 能实现这些可视化的主要工具，按学科分组。指定一个就按它返回；默认自动选择，可能返回几种。
 * 例：光合作用的全过程可由 Manim 或 Three.js 做动画；人体解剖与组装由 BioDigital Human、Z-Anatomy 一类三维模型实现。
 */
const TOOL_GROUPS: { field: string; tools: string[] }[] = [
  { field: '数学', tools: ['GeoGebra', 'Desmos', 'Manim', 'Mathematica'] },
  { field: '物理', tools: ['PhET', 'Matter.js', 'Falstad 电路', 'VPython'] },
  { field: '化学', tools: ['3Dmol.js', 'JSmol', 'ChemDoodle'] },
  { field: '生物与医学', tools: ['BioDigital Human', 'Z-Anatomy', 'Blender'] },
  { field: '计算与数据', tools: ['Matplotlib', 'Plotly', 'MATLAB', 'PyTorch', 'D3.js'] },
  { field: '三维与动画', tools: ['Three.js', 'WebGL'] },
];
const AUTO = '自动选择';

const PRESETS = [
  { q: '为什么最近点就是正交投影？', ready: true },
  { q: '光合作用的全过程', ready: false },
  { q: '单摆从小角度到大角度，周期怎么变', ready: false },
];

export function LabPage() {
  const { ready: workspacesReady, error, workspace } = useWorkspace();
  const current = workspace ?? DEMO_WORKSPACE;
  const [tool, setTool] = useState(AUTO);
  const [draft, setDraft] = useState('');
  const [asked, setAsked] = useState<string | null>(null);
  const ready = PRESETS.find((p) => p.q === asked)?.ready ?? false;

  const ask = (q: string) => {
    setAsked(q.trim());
    setDraft('');
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (draft.trim()) ask(draft);
  };

  if (!workspacesReady) return <div className="lab"><p role="status">正在读取工作区…</p></div>;

  if (current.origin !== 'demo') {
    const fileCount = current.folders.reduce((n, f) => n + f.files.length, 0);
    return (
      <div className="lab">
        <section className="lab-stage" aria-label="工作区可视化">
          <div className="lab-bubble">
            <span className="lab-mark" aria-hidden="true" />
            <p>当前工作区 · {current.name}</p>
          </div>
          <p className="lab-note">
            已识别这个工作区的 {fileCount} 个文件；实验室尚未从这里收集公式，也不会套用线性代数示例。
          </p>
          {error && <p role="alert">工作区存储异常：{error}</p>}
          <Link className="btn primary" to={`/workspace?ws=${encodeURIComponent(current.id)}`} viewTransition>
            回工作台选择讲义
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="lab">
      <div className="lab-sky" aria-hidden="true">
        <div className="lab-floor" />
        <svg className="lab-orbits" viewBox="-400 -200 800 400">
          <ellipse rx="330" ry="60" transform="rotate(-6)" />
          <ellipse rx="250" ry="88" transform="rotate(10)" />
          <ellipse id="lab-orbit" rx="380" ry="44" transform="rotate(3)" />
          <circle r="4" className="lab-sat">
            <animateMotion dur="18s" repeatCount="indefinite" rotate="auto">
              <mpath href="#lab-orbit" />
            </animateMotion>
          </circle>
        </svg>
      </div>
      <section className={asked ? 'lab-stage asked' : 'lab-stage'}>
        <div className="lab-bubble">
          <span className="lab-mark" aria-hidden="true" />
          <p>{asked ? asked : '你好。我们要 Visualize 些什么？'}</p>
        </div>

        <form className="lab-composer" onSubmit={submit}>
          <label htmlFor="lab-input" className="sr-only">
            想看见什么
          </label>
          <input
            id="lab-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="例如：为什么最近点就是正交投影？"
            autoComplete="off"
          />
          <button type="submit" className="lab-send" aria-label="发送" disabled={!draft.trim()}>
            <Icon name="send" />
          </button>
        </form>

        <div className="lab-tools" role="group" aria-label="用什么工具实现">
          <button type="button" className="key small" aria-pressed={tool === AUTO} onClick={() => setTool(AUTO)}>
            {AUTO}
          </button>
          <dl>
            {TOOL_GROUPS.map((g) => (
              <div key={g.field}>
                <dt>{g.field}</dt>
                <dd>
                  {g.tools.map((t) => (
                    <button key={t} type="button" className="key small" aria-pressed={t === tool} onClick={() => setTool(t)}>
                      {t}
                    </button>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {!asked && (
          <ul className="lab-presets">
            {PRESETS.map((p) => (
              <li key={p.q}>
                <button type="button" onClick={() => ask(p.q)}>
                  {p.q}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {asked && ready && (
        <section className="lab-results" aria-label="可视化结果">
          <article className="lab-window wide">
            <header>
              <h2>交互实验：拖动 b，再沿直线拖动 q</h2>
              <span className="lab-tag">可操作</span>
            </header>
            <ProjectionLab />
            <p className="lab-caption">
              q 走到哪里，|b − q| 都不小于 |b − p|；p 恰好是残差 r 与直线垂直（r · a = 0）的那一点。这就是「最近点 = 正交投影」。
            </p>
          </article>
          <article className="lab-window">
            <header>
              <h2>几何讲解（3B1B 式）</h2>
              <span className="lab-tag muted">计划中</span>
            </header>
            <ol className="lab-story">
              <li>一束平行光垂直照向直线，b 的影子落在 p</li>
              <li>把影子沿直线推开，b 到影子的距离只会变长</li>
              <li>距离最短的那一刻，连线恰好与直线垂直</li>
              <li>把直线换成平面、换成列空间，同一件事成立</li>
            </ol>
            <p className="lab-caption">接入后由 Manim 预渲染成动画，在这里播放。</p>
          </article>
          <article className="lab-window">
            <header>
              <h2>可调图像（GeoGebra）</h2>
              <span className="lab-tag muted">计划中</span>
            </header>
            <p className="lab-caption">
              三维里的列空间是一个平面：拖动 b、改 A 的两列，看投影与残差如何跟着变；A 的两列共线时，投影仍唯一，参数不再唯一。
            </p>
          </article>
        </section>
      )}

      {asked && !ready && (
        <p className="lab-note">
          示例模式只准备了「为什么最近点就是正交投影？」。接入你自己的 API key 后，任何问题都会返回几种可视化。
          <button type="button" className="lab-link" onClick={() => ask(PRESETS[0]!.q)}>
            看这个示例
          </button>
        </p>
      )}
    </div>
  );
}
