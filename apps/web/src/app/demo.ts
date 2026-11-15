import kbData from '../../../../content/demo/linear-algebra/kb.json';
import graphData from '../../../../content/demo/linear-algebra/graph.json';
import manifestData from '../../../../content/demo/linear-algebra/resources/manifest.json';
import structureLayout from '../../../../content/demo/linear-algebra/layouts/structure.json';

export const demoKb = kbData;
export const demoGraph = graphData;
/** 资源清单：讲义引用的教材、课件、视频及其出处与许可。 */
export const demoResources = manifestData.resources;
/** 结构图谱的布局：节点 id → 坐标（只含已排布的节点）。 */
export const demoStructurePositions: Record<string, { x: number; y: number }> = structureLayout.positions;

/** 成稿讲义的静态样张（T1 阅读器接入前直接打开它）。 */
export const demoNoteUrl = '/demo/linear-algebra/rendered/index.html';

const nodeTitles = new Map(graphData.nodes.map((n) => [n.id, n.title]));
/** 节点 id → 标题；查不到时原样返回 id，方便发现数据错误。 */
export function nodeTitle(id: string): string {
  return nodeTitles.get(id) ?? id;
}
