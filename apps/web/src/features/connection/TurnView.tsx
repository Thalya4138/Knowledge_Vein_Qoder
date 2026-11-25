import { useState } from 'react';
import { demoManifest } from '../../app/demo';
import { NoteReader } from '../../reader/NoteReader';
import { DEMO_BASE } from '../workspace/workspaceData';
import { MODES, type ModeId } from './explore';
import type { Workspace } from '../../store/types';
import type { Issue } from './explore';
import { lectureFiles } from './exporting';
import type { Turn } from './threads';

/**
 * 一轮回答：用工作台的讲义阅读器显示（栏目、旁栏、编号的表与图、公式都和讲义一样），
 * 可以就地编辑。核对的结果不放在正文前面；只有确实有线没画出来、或做过自动修正时，在文末用一行说明。
 */

export interface TurnActions {
  exportTurn: (turn: Turn) => void;
  addToMind: (turn: Turn) => void;
  editNote: (turn: Turn, note: string) => void;
}

function Dropped({ issues }: { issues: Issue[] }) {
  const [open, setOpen] = useState(false);
  const shown = issues.filter((i) => i.level !== 'warn');
  if (!shown.length) return null;
  const removed = shown.filter((i) => i.level === 'removed').length;
  return (
    <div className="turn-foot">
      <button type="button" className="linkish" aria-expanded={open} onClick={() => setOpen(!open)}>
        {removed ? `关联图里有 ${removed} 处没有画出（缺少依据）` : `有 ${shown.length} 处已自动修正`}
      </button>
      {open && (
        <ul>
          {shown.map((i, k) => (
            <li key={k}>{i.text}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TurnView({ turn, mode, workspace, focused, onFocus, act }: { turn: Turn; mode: ModeId; workspace: Workspace; focused: boolean; onFocus: () => void; act: TurnActions }) {
  const demo = workspace.origin === 'demo';
  // 书眉：教材的位置写「第 2 章 …」，这里写来自哪个板块、哪种模式；示例标「示例」（AGENTS.md §3）
  const running = `关联探索　${MODES.find((m) => m.id === mode)!.label}${turn.origin === 'preset' ? '　示例' : ''}`;
  const [editing, setEditing] = useState(false);
  const wikiHref = (target: string) => {
    const t = target.replace(/\.md$/, '');
    const f = lectureFiles(workspace).find((x) => decodeURIComponent(x.path ?? x.sourceUrl ?? x.url).includes(t) || x.name.includes(t));
    return f ? `/workspace?ws=${encodeURIComponent(workspace.id)}&file=${encodeURIComponent(f.id)}` : undefined;
  };

  return (
    <div className={`turn${focused ? ' focused' : ''}`} data-turn={turn.id}>
      <div className="turn-ask">
        <span className="turn-q" aria-hidden="true">问</span>
        <p>{turn.ask}</p>
        {turn.files.length > 0 && (
          <ul className="msg-files">
            {turn.files.map((f, i) => (
              <li key={i}>
                <span>{f.kind === 'image' ? '截图' : f.kind === 'url' ? '网页' : f.kind === 'pdf' ? 'PDF' : '文件'}</span>
                {f.name}
              </li>
            ))}
          </ul>
        )}
      </div>

      <article className="turn-paper" onClick={onFocus} aria-label={turn.result.title}>
        <NoteReader
          source={turn.result.note}
          editable={editing}
          onSourceChange={(next) => act.editNote(turn, next)}
          wikiHref={wikiHref}
          runningHead={running}
          manifest={demo ? demoManifest : undefined}
          resourceBase={demo ? DEMO_BASE : undefined}
          assetUrl={turn.origin === 'preset' ? (src) => encodeURI(`${DEMO_BASE}/explore/${src}`) : undefined}
        />
        <Dropped issues={turn.issues} />
      </article>

      <footer className="turn-actions">
        <button type="button" className="key small" aria-pressed={editing} onClick={() => setEditing(!editing)} title="点一段改一段">
          {editing ? '完成编辑' : '编辑讲解'}
        </button>
        <button type="button" className="key small" onClick={() => act.exportTurn(turn)}>
          导出与复制
        </button>
        <button type="button" className="key small" onClick={() => act.addToMind(turn)} title="整张关联图作为一个分支加进这个工作区的思维导图，可撤回">
          加入思维导图
        </button>
      </footer>
    </div>
  );
}
