import { demoGraph, demoKb, nodeTitle } from '../../app/demo';

/**
 * 示例思维导图：由示例知识库生成。
 * 第一层是课程主线（kb.json 的 subtitle），第二、三层是图谱节点按「先理解什么、再理解什么」的归组。
 * 归组是本示例的编排，不是新增的知识；跨分支连线只取图谱里已有的关系。
 */

export interface MapNode {
  id: string;
  text: string;
  children: MapNode[];
  /** 对应的图谱节点 */
  ref?: string;
}

const t = (id: string) => nodeTitle(id).split(/[：\s]/)[0] ?? id;
const leaf = (ref: string): MapNode => ({ id: ref, text: t(ref), ref, children: [] });
const group = (id: string, text: string, children: MapNode[]): MapNode => ({ id, text, children });

const spine = demoKb.subtitle
  .replace(/^一条线：/, '')
  .split('→')
  .map((s) => s.trim());

export function buildDemoMap(): MapNode {
  return group('root', demoKb.title.split('：')[0] ?? demoKb.title, [
    group('s1', spine[0] ?? '有没有解', [
      leaf('n.solvability'),
      leaf('n.free-variable'),
      group('s1-struct', '解集的结构', [leaf('n.linear-independence'), leaf('n.nullspace'), leaf('n.affine-set')]),
    ]),
    group('s2', spine[1] ?? '无解怎么办', [leaf('n.colspace'), leaf('n.least-squares')]),
    group('s3', spine[2] ?? '最近点', [
      group('s3-what', '最近点是什么', [leaf('n.orth-proj'), leaf('n.orthogonality')]),
      group('s3-how', '怎样算出来', [leaf('n.normal-eq'), leaf('n.full-column-rank'), leaf('n.unique-solution')]),
      group('s3-same', '同一类问题', [leaf('n.point-plane'), leaf('n.skew-lines')]),
    ]),
    group('s4', spine[3] ?? '一阶最优条件', [leaf('n.first-order-cond')]),
  ]);
}

const SHORT_REL: Record<string, string> = {
  prerequisite: '先修',
  'derives-from': '推出',
  'equivalent-under': '等价',
  'shared-mechanism': '同一机制',
  'contrasts-with': '对照',
  'defined-by': '由它刻画',
  'analogy-to': '类比',
};

export interface CrossLink {
  id: string;
  from: string;
  to: string;
  label: string;
}

/** 跨分支连线：两端落在不同的第一层分支下，才画出来（同一分支内的关系已由树表达）。 */
export function crossLinks(root: MapNode): CrossLink[] {
  const branch = new Map<string, string>();
  const walk = (n: MapNode, top: string) => {
    if (n.ref) branch.set(n.ref, top);
    n.children.forEach((c) => walk(c, top));
  };
  root.children.forEach((c) => walk(c, c.id));
  return demoGraph.relations
    .filter((r) => branch.has(r.from) && branch.has(r.to) && branch.get(r.from) !== branch.get(r.to))
    .map((r) => ({ id: r.id, from: r.from, to: r.to, label: SHORT_REL[r.type] ?? '' }));
}

export interface Placed {
  node: MapNode;
  depth: number;
  x: number;
  y: number;
  parent?: string;
}

export const COL = [0, 210, 400, 600];
export const ROW = 46;

/** 横向分层的整齐树：x 由深度决定，y 由叶子顺序决定，父节点居中于子节点。 */
export function layoutTree(root: MapNode, collapsed: Set<string>): Placed[] {
  const out: Placed[] = [];
  let row = 0;
  const place = (n: MapNode, depth: number, parent?: string): number => {
    const kids = collapsed.has(n.id) ? [] : n.children;
    let y: number;
    if (kids.length === 0) {
      y = row * ROW;
      row += 1;
    } else {
      const ys = kids.map((k) => place(k, depth + 1, n.id));
      y = (ys[0]! + ys[ys.length - 1]!) / 2;
    }
    out.push({ node: n, depth, x: COL[Math.min(depth, COL.length - 1)]! + (depth >= COL.length ? (depth - COL.length + 1) * 190 : 0), y, parent });
    return y;
  };
  place(root, 0);
  return out;
}

export function mapNodeCount(root: MapNode): number {
  return 1 + root.children.reduce((s, c) => s + mapNodeCount(c), 0);
}
