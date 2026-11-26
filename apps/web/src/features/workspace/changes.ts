import { readText, writeText } from '../../store/open';
import { overlayEntries, withDemoOverlay } from '../../store/demo';
import { registerWorkspace } from '../../store/registry';
import { placeBrowserFile, SKIP_DIR } from '../../store/tree';
import type { Workspace, WorkspaceStore } from '../../store/types';

/**
 * 工作台 AI 的写入闸门（AGENTS.md §1 第 4 条：AI 的一切写入都走提案 → 预览 diff → 确认 → 可撤销）。
 * 四步（整理资料、生成讲义、补进笔记、改写段落）共用这一份：
 * 模型只产出 FileChange 提案，程序负责落盘与撤销，撤销靠落盘前抓的 before 快照。
 * 浏览器工作区写完后按存储重建文件栏，文件栏与硬盘/IndexedDB 始终一致。
 */

export type FileChange =
  | { op: 'create'; path: string; content: string; reason: string }
  | { op: 'update'; path: string; content: string; reason: string }
  | { op: 'rename'; from: string; to: string; reason: string };

/** 一条提案落盘后留下的反向快照：before=null 表示原来没有这个文件（撤销即删除） */
export interface AppliedChange {
  path: string;
  before: string | null;
}

export interface ChangeSet {
  title: string;
  changes: FileChange[];
}

function typeOf(path: string): string {
  if (/\.json$/i.test(path)) return 'application/json';
  if (/\.(md|markdown)$/i.test(path)) return 'text/markdown';
  return 'text/plain';
}

export function changePath(c: FileChange): string {
  return c.op === 'rename' ? c.to : c.path;
}

export function changeReason(c: FileChange): string {
  return c.reason;
}

/** 浏览器工作区：按当前存储重建文件栏（跳过隐藏目录与依赖），并登记。示例：合并覆盖层。其它存储返回原工作区。 */
async function syncTree(store: WorkspaceStore, ws: Workspace): Promise<Workspace> {
  if (ws.origin === 'demo') return withDemoOverlay(ws, overlayEntries(await store.list('')));
  if (ws.origin !== 'browser') return ws;
  const entries = (await store.list('')).filter((e) => !e.path.split('/').some((p) => p.startsWith('.') || SKIP_DIR.test(p)));
  let next: Workspace = { ...ws, folders: [] };
  for (const e of entries) next = placeBrowserFile(next, e.path).workspace;
  await registerWorkspace(next);
  return next;
}

/**
 * 落盘一组提案。返回反向快照与（浏览器工作区）更新后的工作区。
 * 调用方先把提案给用户预览，确认后才调这里；onWorkspace 用于刷新全站工作区列表。
 */
export async function applyChanges(
  store: WorkspaceStore,
  ws: Workspace,
  changes: FileChange[],
  onWorkspace?: (w: Workspace) => void,
): Promise<{ applied: AppliedChange[]; workspace: Workspace }> {
  const applied: AppliedChange[] = [];
  for (const c of changes) {
    if (c.op === 'rename') {
      const content = await readText(store, c.from);
      if (content === null) throw new Error(`要改名的文件不存在：${c.from}`);
      if (c.from === c.to) continue;
      applied.push({ path: c.to, before: null }, { path: c.from, before: content });
      await writeText(store, c.to, content, typeOf(c.to));
      await store.remove(c.from);
    } else {
      const before = await readText(store, c.path);
      applied.push({ path: c.path, before });
      await writeText(store, c.path, c.content, typeOf(c.path));
    }
  }
  const workspace = await syncTree(store, ws);
  if (workspace !== ws) onWorkspace?.(workspace);
  return { applied, workspace };
}

/** 一步撤销：按反向快照倒序恢复（原来没有的删掉，原来有的写回）。 */
export async function undoChanges(
  store: WorkspaceStore,
  ws: Workspace,
  applied: AppliedChange[],
  onWorkspace?: (w: Workspace) => void,
): Promise<Workspace> {
  for (const a of [...applied].reverse()) {
    if (a.before === null) await store.remove(a.path);
    else await writeText(store, a.path, a.before, typeOf(a.path));
  }
  const workspace = await syncTree(store, ws);
  if (workspace !== ws) onWorkspace?.(workspace);
  return workspace;
}

/* ---------- 差异预览（确定性，不调模型） ---------- */

export interface DiffLine {
  type: 'same' | 'add' | 'del';
  text: string;
}

/** 行级 diff（LCS）。文件过大时退化为「整段删 + 整段增」，避免 O(n·m) 卡住界面。 */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split('\n');
  const b = after.split('\n');
  if (a.length > 600 || b.length > 600) {
    return [...a.map((text) => ({ type: 'del' as const, text })), ...b.map((text) => ({ type: 'add' as const, text }))];
  }
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1)
    for (let j = m - 1; j >= 0; j -= 1) dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: 'same', text: a[i]! });
      i += 1;
      j += 1;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      out.push({ type: 'del', text: a[i]! });
      i += 1;
    } else {
      out.push({ type: 'add', text: b[j]! });
      j += 1;
    }
  }
  while (i < n) out.push({ type: 'del', text: a[i++]! });
  while (j < m) out.push({ type: 'add', text: b[j++]! });
  return out;
}

/** 提案涉及的文件清单（去重），供预览标题与确认文案用。 */
export function touchedPaths(changes: FileChange[]): string[] {
  const out: string[] = [];
  for (const c of changes) {
    if (c.op === 'rename') {
      if (!out.includes(c.from)) out.push(c.from);
      if (!out.includes(c.to)) out.push(c.to);
    } else if (!out.includes(c.path)) out.push(c.path);
  }
  return out;
}