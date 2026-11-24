import { readJson, writeJson } from '../../store/open';
import type { WorkspaceStore } from '../../store/types';
import type { ExploreResult, Issue, ModeId, XEdge, XNode } from './explore';
import { PRESETS, presetResult } from './presets';

/**
 * 对话历史存在工作区里（`.vein/explore/threads.json`），跟着工作区走：
 * 本地文件夹工作区里就是硬盘上的一个文件，git 能管，换浏览器也在。
 * 每一轮保存的是核对后的结果 + 用户对每条线的态度与拖动位置。
 */

export const THREADS_PATH = '.vein/explore/threads.json';
const KEEP = 60;

export interface Turn {
  id: string;
  ask: string;
  files: { kind: string; name: string }[];
  result: ExploreResult;
  issues: Issue[];
  at: number;
  /** preset = 随站发布的示例（离线整理、人工核对），界面要标出来 */
  origin: 'model' | 'preset';
  model?: string;
  presetId?: string;
  presetRev?: number;
}

export interface Thread {
  id: string;
  mode: ModeId;
  title: string;
  at: number;
  turns: Turn[];
}

/** 把用户在旧结果上做过的事（裁决、拖动、改字）带到新结果上：按节点 / 边的 id 对应 */
export function carryOver(next: ExploreResult, prev: ExploreResult, keepPositions = true): ExploreResult {
  const oldNodes = new Map(prev.graph.nodes.map((n) => [n.id, n]));
  const oldEdges = new Map(prev.graph.edges.map((e) => [e.id, e]));
  const nodes: XNode[] = next.graph.nodes.map((n) => {
    const o = oldNodes.get(n.id);
    return keepPositions && o && o.x !== undefined ? { ...n, x: o.x, y: o.y } : n;
  });
  const edges: XEdge[] = next.graph.edges.map((e) => {
    const o = oldEdges.get(e.id);
    return o && o.status !== 'proposed' ? { ...e, status: o.status, reason: o.reason, relId: o.relId } : e;
  });
  // 用户自己画的线与加的节点保留
  const ids = new Set(nodes.map((n) => n.id));
  for (const n of prev.graph.nodes) if (!ids.has(n.id) && prev.graph.edges.some((e) => e.mine && (e.from === n.id || e.to === n.id))) nodes.push(n);
  const nids = new Set(nodes.map((n) => n.id));
  for (const e of prev.graph.edges) if (e.mine && nids.has(e.from) && nids.has(e.to)) edges.push(e);
  return { ...next, graph: { nodes, edges } };
}

/** 旧格式（2026-11-24 上午，answer / table / sections 分字段）→ 讲义体 note */
function legacyNote(r: Record<string, unknown>): string {
  const s = (v: unknown) => (typeof v === 'string' ? v : '');
  const out = [`# ${s(r.title)}`, '', s(r.answer)];
  const t = r.table as { caption?: string; columns?: string[]; rows?: { head: string; cells: string[] }[] } | null;
  if (t?.columns?.length && t.rows?.length) {
    out.push('', `> [!table] ${t.caption ?? '表 1'}`, `> | ${t.columns.join(' | ')} |`, `> | ${t.columns.map(() => '---').join(' | ')} |`);
    for (const row of t.rows) out.push(`> | ${[row.head, ...row.cells].join(' | ')} |`);
  }
  for (const sec of (r.sections as { heading: string; body: string }[] | undefined) ?? []) out.push('', `## ${sec.heading}`, '', sec.body);
  const diff = (r.differences as string[] | undefined) ?? [];
  if (diff.length) out.push('', '## 不同之处', '', ...diff.map((d) => `- ${d}`));
  if (s(r.boundary)) out.push('', `> [!critical] 批判性思维`, `> ${s(r.boundary)}`);
  return out.join('\n') + '\n';
}

export function upgradeTurn(t: Turn, mode: ModeId): Turn {
  const r = t.result as unknown as Record<string, unknown>;
  if (t.origin === 'preset') {
    const p = PRESETS.find((x) => x.id === t.presetId) ?? PRESETS.find((x) => x.mode === mode && x.ask === t.ask);
    if (p && (t.presetRev !== p.rev || typeof r.note !== 'string')) {
      const fresh = presetResult(p);
      const prev = typeof r.note === 'string' ? t.result : { ...t.result, graph: (r.graph as ExploreResult['graph']) ?? { nodes: [], edges: [] } };
      return { ...t, ask: p.ask, result: carryOver(fresh.result, prev, false), issues: fresh.issues, presetId: p.id, presetRev: p.rev };
    }
    return t;
  }
  if (typeof r.note !== 'string') return { ...t, result: { title: String(r.title ?? ''), note: legacyNote(r), graph: (r.graph as ExploreResult['graph']) ?? { nodes: [], edges: [] } } };
  return t;
}

export async function loadThreads(store: WorkspaceStore): Promise<{ threads: Thread[]; upgraded: boolean }> {
  try {
    const t = await readJson<Thread[]>(store, THREADS_PATH);
    if (!Array.isArray(t)) return { threads: [], upgraded: false };
    let upgraded = false;
    const threads = t
      .filter((x) => x && Array.isArray(x.turns))
      .map((th) => {
        const turns = th.turns.map((u) => upgradeTurn(u, th.mode));
        if (turns.some((u, i) => u !== th.turns[i])) upgraded = true;
        return { ...th, title: turns[0]?.result.title || th.title, turns };
      });
    return { threads, upgraded };
  } catch {
    return { threads: [], upgraded: false };
  }
}

export async function saveThreads(store: WorkspaceStore, threads: Thread[]): Promise<void> {
  const sorted = [...threads].sort((a, b) => b.at - a.at).slice(0, KEEP);
  await writeJson(store, THREADS_PATH, sorted);
}

export const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
