import { browserStore } from './browser';
import type { WorkspaceStore } from './types';

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
