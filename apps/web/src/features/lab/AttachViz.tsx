import { Link } from 'react-router-dom';
import { indexDoc, type MDoc } from '../atlas/mindDoc';
import type { ToolRegistration } from './tools';

/**
 * 「挂到主题上」：列出当前工作区导图的主题，逐项显示已挂/未挂。
 * 这一屏就是写入前的预览；点一下才写 maps/mind.json，写入后可撤销（TASK_R2_LINKAGE L5）。
 */
export function AttachViz({
  tool,
  mind,
  wsId,
  onToggle,
  onClose,
}: {
  tool: ToolRegistration;
  mind: MDoc | null;
  wsId: string;
  onToggle: (nodeId: string, on: boolean) => void;
  onClose: () => void;
}) {
  const ix = mind ? indexDoc(mind) : null;
  const topics = ix ? [...ix.byId.values()].map((n) => ({ n, depth: ix.depth.get(n.id) ?? 0 })) : [];

  return (
    <div className="viz-attach-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="viz-attach" role="dialog" aria-modal="true" aria-labelledby="viz-attach-t">
        <header>
          <h2 id="viz-attach-t">把「{tool.name}」挂到主题上</h2>
          <button type="button" className="key small" onClick={onClose}>
            关闭
          </button>
        </header>
        {mind ? (
          <>
            <p className="viz-attach-note">
              挂载只改主题上的指向，不新增知识关系；写入工作区的 <code>maps/mind.json</code>，下一步可撤销。
            </p>
            <ul className="viz-attach-list">
              {topics.map(({ n, depth }) => {
                const on = n.viz === tool.id;
                return (
                  <li key={n.id} style={{ paddingLeft: `calc(${depth} * var(--s-16))` }}>
                    <span className={on ? 'viz-attach-topic on' : 'viz-attach-topic'}>
                      {n.text || '（中心主题）'}
                    </span>
                    <button
                      type="button"
                      className={on ? 'key small on' : 'key small'}
                      aria-pressed={on}
                      onClick={() => onToggle(n.id, !on)}
                    >
                      {on ? '已挂载 · 取消' : '挂上'}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <p className="viz-attach-note">
            这个工作区还没有导图。先到{' '}
            <Link to={`/atlas?ws=${encodeURIComponent(wsId)}`}>认知记忆图谱</Link>{' '}
            生成一张，或从空白开始，再回来挂载。
          </p>
        )}
      </div>
    </div>
  );
}