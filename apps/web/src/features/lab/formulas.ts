import { readText } from '../../store/open';
import type { WorkspaceStore } from '../../store/types';
import type { MDoc } from '../atlas/mindDoc';

/**
 * 实验室从当前工作区收集的「起点」公式（TASK_R2_LINKAGE L5）：
 * 导图主题上的 `f`（一行一条 LaTeX）+ 讲义里的独立公式 `$$…$$`。
 * 只读，不写回；没有模型时这些就是实验室诚实的素材来源。
 */
export interface FormulaPoint {
  latex: string;
  source: 'mind' | 'note';
  label: string;
  /** 来自导图时有主题 id，可反向定位 */
  nodeId?: string;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

export function formulasFromMind(doc: MDoc | null): FormulaPoint[] {
  const out: FormulaPoint[] = [];
  const walk = (n: MDoc['root']) => {
    for (const latex of n.f ?? []) {
      const t = clean(latex);
      if (t) out.push({ latex: t, source: 'mind', label: n.text || '主题', nodeId: n.id });
    }
    n.kids.forEach(walk);
  };
  if (doc) walk(doc.root);
  return out;
}

/** 只取独立公式；行内 `$…$` 太碎，不作为实验起点。 */
export function formulasFromMarkdown(path: string, md: string): FormulaPoint[] {
  const out: FormulaPoint[] = [];
  const label = path.split('/').pop()?.replace(/\.md$/i, '') || path;
  const re = /\$\$([\s\S]+?)\$\$/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md))) {
    const t = clean(m[1] ?? '');
    if (t && t.length <= 240) out.push({ latex: t, source: 'note', label });
  }
  return out;
}

/** 去重（忽略空白与 LaTeX 命令差异）并限条数，避免实验室首屏被公式淹没。 */
export function dedupeFormulas(points: FormulaPoint[], max = 12): FormulaPoint[] {
  const seen = new Set<string>();
  const out: FormulaPoint[] = [];
  for (const p of points) {
    const key = p.latex.replace(/\\[a-zA-Z]+|\s|[{}]/g, '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(p);
    if (out.length >= max) break;
  }
  return out;
}

export async function collectWorkspaceFormulas(
  store: WorkspaceStore,
  mind: MDoc | null,
  max = 12,
): Promise<{ points: FormulaPoint[]; notesRead: number }> {
  const points = formulasFromMind(mind);
  let notesRead = 0;
  const notes = (await store.list(''))
    .filter((e) => /\.md$/i.test(e.path))
    .slice(0, 6);
  for (const e of notes) {
    const md = await readText(store, e.path);
    if (md === null) continue;
    notesRead += 1;
    points.push(...formulasFromMarkdown(e.path, md));
  }
  return { points: dedupeFormulas(points, max), notesRead };
}