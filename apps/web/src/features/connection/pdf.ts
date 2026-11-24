/**
 * PDF 正文抽取（pdf.js，用户 2026-11-24 批准引入 pdfjs-dist）。按需加载，不进首屏包。
 * 每页一段文字，出处锚点写成 `路径#page=N`，模型引用时能指到页。
 * 扫描版 PDF 没有文字层，抽出来是空的——如实返回空，由调用方告诉用户。
 */

let loader: Promise<typeof import('pdfjs-dist')> | null = null;

async function pdfjs() {
  if (!loader) {
    loader = (async () => {
      const lib = await import('pdfjs-dist');
      const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
      lib.GlobalWorkerOptions.workerSrc = worker;
      return lib;
    })();
  }
  return loader;
}

export interface PdfText {
  pages: string[];
  total: number;
}

const cache = new Map<string, Promise<PdfText>>();

export function pdfText(data: ArrayBuffer | Blob, key?: string, maxPages = 120): Promise<PdfText> {
  if (key && cache.has(key)) return cache.get(key)!;
  const job = (async () => {
    const lib = await pdfjs();
    const buf = data instanceof Blob ? await data.arrayBuffer() : data;
    const task = lib.getDocument({ data: new Uint8Array(buf) });
    const doc = await task.promise;
    const total = doc.numPages;
    const n = Math.min(total, maxPages);
    const pages: string[] = [];
    for (let i = 1; i <= n; i += 1) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      let s = '';
      for (const it of tc.items) {
        if ('str' in it) s += it.str + (it.hasEOL ? '\n' : '');
      }
      pages.push(s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim());
    }
    await task.destroy();
    return { pages, total };
  })();
  if (key) {
    cache.set(key, job);
    job.catch(() => cache.delete(key));
  }
  return job;
}
