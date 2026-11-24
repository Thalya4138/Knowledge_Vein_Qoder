import fragments from '../../../../../content/demo/linear-algebra/explore/fragments.md?raw';
import meta from '../../../../../content/demo/linear-algebra/explore/meta.md?raw';
import cross from '../../../../../content/demo/linear-algebra/explore/cross.md?raw';
import { demoGraph } from '../../app/demo';
import { DEMO_NOTE_PATHS } from '../workspace/workspaceData';
import { checkResult, parseOutput, type CheckContext, type ExploreResult, type Issue, type ModeId } from './explore';

/**
 * 示例结果（AGENTS.md §3：无 key 时生成能力降级为预置样例，界面明确标注「示例」）。
 * 示例是讲义体 Markdown + 关联图块，和模型输出走同一道拆分与核对，所以它们同时是提示词的金样例：
 * 测试要求它们零删改、每个公式都能显示。
 *
 * rev：示例改写后加一。对话历史里存的是当时的副本，打开时发现 rev 落后就换成新版本（保留用户对线的裁决与拖动）。
 */

export interface Preset {
  id: string;
  mode: ModeId;
  ask: string;
  rev: number;
  raw: string;
  /** 书眉 */
  running: string;
}

function front(src: string): { data: Record<string, string>; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(src.replace(/\r\n/g, '\n'));
  if (!m) return { data: {}, body: src };
  const data: Record<string, string> = {};
  for (const line of m[1]!.split('\n')) {
    const kv = /^(\w+):\s*(.*)$/.exec(line);
    if (kv) data[kv[1]!] = kv[2]!.trim();
  }
  return { data, body: src.replace(/\r\n/g, '\n').slice(m[0].length) };
}

export const PRESETS: Preset[] = (
  [
    ['fragments', fragments],
    ['meta', meta],
    ['cross', cross],
  ] as const
).map(([id, src]) => {
  const { data, body } = front(src);
  return { id, mode: (data.mode ?? id) as ModeId, ask: data.ask ?? '', rev: Number(data.rev ?? 1), raw: body, running: data.running ?? '' };
});

/** 示例工作区里讲义的标题锚点：`路径#标题` */
export const DEMO_ANCHORS = new Set([
  ...DEMO_NOTE_PATHS,
  ...DEMO_NOTE_PATHS.flatMap((p) => ['从代数问题到几何问题', '最近点满足的条件', '法方程', '点唯一，参数未必唯一', '第1节　正交投影与最小二乘法'].map((h) => `${p}#${h}`)),
]);

export function demoContext(mode: ModeId): CheckContext {
  return { mode, nodeIds: new Set(demoGraph.nodes.map((n) => n.id)), anchors: DEMO_ANCHORS };
}

export function presetResult(p: Preset): { result: ExploreResult; issues: Issue[] } {
  return checkResult(parseOutput(p.raw), demoContext(p.mode));
}
