import { Link, useSearchParams } from 'react-router-dom';
import { demoGraph, demoKb } from '../../app/demo';
import { AskBar } from '../../ui/AskBar';
import { MiniTerrain } from '../../ui/cover/Terrain';
import { Icon } from '../../ui/Icon';
import { MindMap } from './MindMap';
import { buildDemoMap, mapNodeCount } from './mindmapData';
import '../../styles/atlas.css';

/**
 * 认知记忆图谱：选工作区 → 选图谱 → 画布。选择写进地址（?ws= &map=），可以直接分享到画布。
 */

const MAPS = [
  { id: 'mind', name: '思维导图', line: '横向分层、纵向逻辑，可以编辑，改完自动保存。' },
  { id: 'memory', name: '个人记忆图谱', line: '从思维导图出发：收起、遮盖、挖空，考考自己。' },
] as const;

/** 选图谱卡片上的小图：一棵横向分层的树；记忆图谱的几个叶子是挖空的框。 */
function MapSketch({ blank }: { blank: boolean }) {
  const leaves = [22, 50, 78, 106, 134];
  return (
    <svg className="map-sketch" viewBox="0 0 300 156" aria-hidden="true">
      <rect className="ms-root" x="10" y="66" width="62" height="24" rx="12" />
      {[40, 116].map((y, i) => (
        <g key={y}>
          <path className="ms-edge" d={`M72 78 C96 78 96 ${y} 120 ${y}`} />
          <rect className="ms-mid" x="120" y={y - 11} width="56" height="22" rx="6" />
          {leaves.slice(i * 2 + (i ? 1 : 0), i * 2 + (i ? 3 : 2) + (i ? 0 : 1)).map((ly, j) => (
            <g key={ly}>
              <path className="ms-edge" d={`M176 ${y} C198 ${y} 198 ${ly} 220 ${ly}`} />
              <rect className={blank && (i + j) % 2 === 0 ? 'ms-leaf blank' : 'ms-leaf'} x="220" y={ly - 8} width={64 - j * 8} height="16" rx="4" />
            </g>
          ))}
        </g>
      ))}
    </svg>
  );
}

export function AtlasPage() {
  const [params] = useSearchParams();
  const ws = params.get('ws');
  const map = MAPS.find((m) => m.id === params.get('map'));

  if (ws !== 'linear-algebra') {
    return (
      <div className="atlas-pick">
        <h1 className="display">选一个工作区</h1>
        <ul className="pick-grid">
          <li>
            <Link className="pick-card art" to="?ws=linear-algebra" viewTransition>
              <MiniTerrain />
              <span className="pick-glyph" aria-hidden="true">
                线
              </span>
              <span className="pick-name">{demoKb.title}</span>
              <span className="pick-meta">
                {demoGraph.nodes.length} 个知识点，{demoGraph.relations.length} 条带理由的关系
              </span>
            </Link>
          </li>
          <li>
            <span className="pick-card disabled" aria-disabled="true">
              <span className="pick-glyph" aria-hidden="true">
                <Icon name="plus" />
              </span>
              <span className="pick-name">新建工作区</span>
              <span className="pick-meta">接入本地文件夹或 GitHub 后可用</span>
            </span>
          </li>
        </ul>
      </div>
    );
  }

  if (!map) {
    return (
      <div className="atlas-pick">
        <p className="crumb-back">
          <Link to="/atlas" viewTransition>
            工作区
          </Link>
          <Icon name="chevron" className="icon crumb-sep" />
          线性代数
        </p>
        <h1 className="display">选一张图</h1>
        <ul className="pick-grid">
          {MAPS.map((m) => (
            <li key={m.id}>
              <Link className="pick-card art" to={`?ws=linear-algebra&map=${m.id}`} viewTransition>
                <MapSketch blank={m.id === 'memory'} />
                <span className="pick-name">{m.name}</span>
                <span className="pick-meta">{m.line}</span>
                <span className="pick-meta">{mapNodeCount(buildDemoMap())} 个节点</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="atlas-canvas">
      <header className="atlas-head">
        <p className="crumb-back">
          <Link to="/atlas" viewTransition>
            工作区
          </Link>
          <Icon name="chevron" className="icon crumb-sep" />
          <Link to="?ws=linear-algebra" viewTransition>
            线性代数
          </Link>
          <Icon name="chevron" className="icon crumb-sep" />
          <strong>{map.name}</strong>
        </p>
        <div className="segmented" role="group" aria-label="切换图谱">
          {MAPS.map((m) => (
            <Link key={m.id} to={`?ws=linear-algebra&map=${m.id}`} aria-current={m.id === map.id ? 'page' : undefined} replace>
              {m.name}
            </Link>
          ))}
        </div>
      </header>
      <MindMap key={map.id} mode={map.id} />
      <AskBar placeholder={map.id === 'mind' ? '问这张图，或让它帮你改：比如「把同一类问题合并成一支」' : '让它帮你出题，或照你的想法新建一张图'} />
    </div>
  );
}
