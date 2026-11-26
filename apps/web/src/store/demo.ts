import { browserStore } from './browser';
import { classify, placeBrowserFile, SKIP_DIR } from './tree';
import { filePath } from '../features/workspace/workspaceData';
import type { FileEntry, Workspace, WorkspaceStore } from './types';

/**
 * 示例工作区的存储：原件随网站发布、只读（fetch）；用户在示例里产生的东西
 * （导图、记忆练习）写进本机浏览器的一层「覆盖」，读的时候覆盖层优先。
 * 这样示例和其他工作区走同一个接口，又不会改动线上的示例原件。
 */
/** `known`：随网站发布的示例原件路径（讲义等），列目录时一并列出，AI 才读得到示例讲义 */
export function demoStore(wsId: string, base: string, known: readonly string[] = []): WorkspaceStore {
  const overlay = browserStore(wsId);
  return {
    kind: 'demo',
    writable: true,
    async list(prefix = '') {
      const own = await overlay.list(prefix);
      const have = new Set(own.map((e) => e.path));
      return [...own, ...known.filter((p) => p.startsWith(prefix) && !have.has(p)).map((path) => ({ path, size: 0, hash: '' }))];
    },
    async read(path) {
      try {
        return await overlay.read(path);
      } catch {
        const res = await fetch(encodeURI(`${base}/${path}`));
        // 单页应用的托管站（本地 vite preview 与 Qoder Sites 都是）对不存在的路径回 200 + 首页 HTML，
        // 不能当成文件内容；只有本来就是 .html 的文件才接受 HTML
        const html = (res.headers.get('content-type') ?? '').includes('text/html') && !/\.html?$/i.test(path);
        if (!res.ok || html) throw new Error(`文件不存在：${path}`);
        return res.blob();
      }
    },
    write: (path, data) => overlay.write(path, data),
    remove: (path) => overlay.remove(path),
  };
}

/** 覆盖层里能进文件栏的条目（跳过隐藏目录、依赖与打不开的类型）。 */
export function overlayEntries(entries: readonly FileEntry[]): FileEntry[] {
  return entries.filter((e) => classify(e.path) !== null && !e.path.split('/').some((p) => p.startsWith('.') || SKIP_DIR.test(p)));
}

/**
 * 示例文件栏 = 发布原件 + 本机覆盖层：覆盖层新文件进栏（AI 写入后立刻可见），
 * 被撤销删掉的覆盖层文件出栏；原件保留 id 与原文地址，深链不受影响。
 */
export function withDemoOverlay(ws: Workspace, entries: readonly FileEntry[]): Workspace {
  const have = new Set(entries.map((e) => e.path));
  const known = new Set(
    ws.folders.flatMap((f) => f.files).map(filePath).filter((p): p is string => p !== null),
  );
  let next: Workspace = {
    ...ws,
    folders: ws.folders
      .map((f) => ({ ...f, files: f.files.filter((x) => !x.browser || (x.path !== undefined && have.has(x.path))) }))
      .filter((f) => f.files.length > 0),
  };
  for (const e of entries) {
    if (known.has(e.path) || next.folders.some((f) => f.files.some((x) => x.path === e.path))) continue;
    next = placeBrowserFile(next, e.path).workspace;
  }
  return next;
}

/** 读示例文件的覆盖层（AI 写入的那份）；没有覆盖时返回 null，调用方回退发布原件。 */
export async function readDemoOverlay(wsId: string, path: string): Promise<string | null> {
  try {
    return await (await browserStore(wsId).read(path)).text();
  } catch {
    return null;
  }
}