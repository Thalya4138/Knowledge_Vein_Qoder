import { readJson, writeJson, writeText } from '../../store/open';
import type { Workspace, WorkspaceStore } from '../../store/types';
import { demoGraph } from '../../app/demo';
import { mapWriter, MIND_PATH } from '../atlas/maps';
import { blankDoc, normalizeDoc, pasteBranches, seedDoc, newId, type MDoc, type MNode } from '../atlas/mindDoc';
import { EPI_NAME, REL_NAME, leadParagraph, spanningTree, type ExploreResult, type XEdge } from './explore';

/**
 * 关联探索 → 认知记忆图谱的两条路（TASK_R2_LINKAGE §2.3、L4）：
 *
 * 1. 「加入思维导图」：整张关联图变成导图根下的一个分支，写进 maps/mind.json。
 *    放不进树的边变成「我的连线」并带上理由；改动可一步撤回。
 * 2. 「接受」一条关系：写进工作区 graph.json，status = accepted。
 *    只有用户逐条接受的才写（VISION 第四节：不是每条 AI 推荐的关联都直接写入知识网络）；
 *    写进去之后，导图上对应的主题会显示这条知识关系与它的前提。
 */

/* ---------- 加入思维导图 ---------- */

export function toMindBranch(doc: MDoc, r: ExploreResult): MNode {
  const { root, kids } = spanningTree(r);
  const node = (id: string) => r.graph.nodes.find((n) => n.id === id)!;
  const made = new Map<string, MNode>();
  const treeEdges = new Set<string>();

  const build = (id: string, via?: XEdge): MNode => {
    const x = node(id);
    const m: MNode = { id: newId(doc), text: x.label, kids: [] };
    if (x.ref) m.ref = x.ref;
    const notes: string[] = [];
    if (x.note) notes.push(x.note);
    if (via) {
      treeEdges.add(via.id);
      notes.push(`${REL_NAME[via.type]}（${EPI_NAME[via.epistemic]}）：${via.explanation}`, `前提：${via.assumptions.join('；')}`);
      if (via.boundary) notes.push(`不适用的情形：${via.boundary}`);
      if (via.label) {
        m.tag = via.label;
        m.tagNote = via.explanation;
      }
    }
    if (notes.length) m.notes = notes.join('\n\n');
    made.set(id, m);
    for (const k of kids.get(id) ?? []) m.kids.push(build(k.id, k.via));
    return m;
  };

  let branch: MNode;
  if (root) {
    // 分支的根是这次探索的标题，关联图里最抽象的节点挂在它下面，结构不丢
    branch = { id: newId(doc), text: r.title, kids: [build(root)] };
  } else {
    branch = { id: newId(doc), text: r.title, kids: [] };
    const maxLayer = Math.max(...r.graph.nodes.map((n) => n.layer));
    for (const t of r.graph.nodes.filter((n) => n.layer === maxLayer)) branch.kids.push(build(t.id));
  }
  branch.src = '关联探索';
  branch.notes = leadParagraph(r.note) || undefined;

  // 放不进树的边 → 我的连线（理由来自探索结果）
  for (const e of r.graph.edges) {
    if (e.status === 'rejected' || treeEdges.has(e.id)) continue;
    const a = made.get(e.from);
    const b = made.get(e.to);
    if (!a || !b) continue;
    doc.links.push({ id: newId(doc), from: a.id, to: b.id, label: e.label || REL_NAME[e.type], reason: e.explanation, src: `关联探索：${r.title}` });
  }
  return branch;
}

export interface MindChange {
  /** 改之前的文件内容；null = 原来没有导图 */
  before: string | null;
  branchId: string;
  title: string;
}

async function currentMind(store: WorkspaceStore, workspace: Workspace): Promise<{ doc: MDoc; before: string | null }> {
  const raw = await readJson<unknown>(store, MIND_PATH);
  if (raw !== null) {
    const doc = normalizeDoc(raw);
    if (!doc) throw new Error(`${MIND_PATH} 不是知脉的导图格式，没有改动它。`);
    return { doc, before: JSON.stringify(raw) };
  }
  return { doc: workspace.origin === 'demo' ? seedDoc() : blankDoc(workspace.name), before: null };
}

export async function addToMind(store: WorkspaceStore, workspace: Workspace, r: ExploreResult, onWorkspace?: (w: Workspace) => void): Promise<MindChange> {
  const { doc, before } = await currentMind(store, workspace);
  const branch = toMindBranch(doc, r);
  pasteBranches(doc, doc.root.id, [branch]);
  await mapWriter(store, workspace, MIND_PATH, onWorkspace)(JSON.stringify(doc));
  return { before, branchId: branch.id, title: r.title };
}

export async function undoMind(store: WorkspaceStore, change: MindChange): Promise<void> {
  if (change.before === null) await store.remove(MIND_PATH);
  else await writeText(store, MIND_PATH, change.before, 'application/json');
}

/* ---------- 接受关系 → graph.json ---------- */

interface GraphFile {
  schemaVersion: string;
  kbId: string;
  nodes: { id: string; kind: string; title: string; importance: string; origin?: string; aliases?: string[] }[];
  relations: Record<string, unknown>[];
  [k: string]: unknown;
}

export const GRAPH_PATH = 'graph.json';

export async function readGraph(store: WorkspaceStore, workspace: Workspace): Promise<GraphFile | null> {
  let g: GraphFile | null = null;
  try {
    g = await readJson<GraphFile>(store, GRAPH_PATH);
  } catch {
    g = null;
  }
  if (g && Array.isArray(g.nodes) && Array.isArray(g.relations)) return g;
  return workspace.origin === 'demo' ? (structuredClone(demoGraph) as unknown as GraphFile) : null;
}

const slug = () => Math.random().toString(36).slice(2, 8);

const KIND_OF: Record<string, string> = { item: 'concept', core: 'concept', concept: 'concept', structure: 'concept', domain: 'concept', idea: 'idea' };

/**
 * 把用户接受的边写进 graph.json。端点没有 ref 的节点先作为新知识点加进去（origin = ai），
 * 返回节点 id → 图谱 id 的对应，调用方据此把 ref 回填到探索结果上。
 */
export async function acceptIntoGraph(
  store: WorkspaceStore,
  workspace: Workspace,
  r: ExploreResult,
  edges: XEdge[],
  onWorkspace?: (w: Workspace) => void,
): Promise<{ refs: Record<string, string>; relIds: Record<string, string> }> {
  const g: GraphFile = (await readGraph(store, workspace)) ?? { schemaVersion: '1.0', kbId: `kb.${workspace.id.replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'ws'}`, nodes: [], relations: [] };
  const refs: Record<string, string> = {};
  const relIds: Record<string, string> = {};
  const ensure = (id: string): string => {
    const x = r.graph.nodes.find((n) => n.id === id)!;
    if (x.ref && g.nodes.some((n) => n.id === x.ref)) return x.ref;
    if (refs[id]) return refs[id];
    const same = g.nodes.find((n) => n.title === x.label);
    const nid = same?.id ?? `n.x-${slug()}`;
    if (!same) g.nodes.push({ id: nid, kind: KIND_OF[x.kind] ?? 'concept', title: x.label, importance: 'supporting', origin: 'ai' });
    refs[id] = nid;
    return nid;
  };
  for (const e of edges) {
    const from = ensure(e.from);
    const to = ensure(e.to);
    const existing = g.relations.find((x) => x.from === from && x.to === to && x.type === e.type);
    const rel: Record<string, unknown> = {
      id: (existing?.id as string) ?? `r.x-${slug()}`,
      from,
      to,
      type: e.type,
      explanation: e.explanation,
      assumptions: e.assumptions,
      epistemic: e.mine ? 'user-personal' : e.epistemic,
      status: 'accepted',
      evidenceIds: [],
      origin: 'explore',
    };
    if (e.boundary) rel.boundaryOrCounterexample = e.boundary;
    if (e.sources?.length) rel.sources = e.sources;
    if (existing) Object.assign(existing, rel);
    else g.relations.push(rel);
    relIds[e.id] = rel.id as string;
  }
  await mapWriter(store, workspace, GRAPH_PATH, onWorkspace)(JSON.stringify(g, null, 2) + '\n');
  return { refs, relIds };
}

/** 撤销接受：把这条关系在 graph.json 里改回 proposed（不删，留痕） */
export async function unacceptInGraph(store: WorkspaceStore, workspace: Workspace, relId: string): Promise<void> {
  const g = await readGraph(store, workspace);
  if (!g) return;
  const rel = g.relations.find((x) => x.id === relId);
  if (!rel) return;
  rel.status = 'proposed';
  await writeJson(store, GRAPH_PATH, g);
}
