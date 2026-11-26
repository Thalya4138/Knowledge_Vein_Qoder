/**
 * 博查 web-search 浏览器直连（2026-11-26 按 SYNC_AND_API §4.1 实测跨域可用）。
 * key 由浏览器直接发给博查，不经过知脉服务器；不写日志、不进 URL。
 */
export interface WebResult {
  title: string;
  url: string;
  snippet: string;
  siteName: string;
  date: string;
}

const ENDPOINT = 'https://api.bochaai.com/v1/web-search';

export async function searchBocha(apiKey: string, query: string, signal?: AbortSignal): Promise<WebResult[]> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ query, count: 8, summary: true, freshness: 'noLimit' }),
      signal,
    });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new Error('连不上搜索服务，检查网络后重试。');
  }
  if (!res.ok) {
    let detail = '';
    try {
      detail = ((await res.json()) as { message?: string }).message ?? '';
    } catch {
      /* 非 JSON 错误体 */
    }
    throw new Error(res.status === 401 ? '搜索 key 无效，到设置里核对后重新保存。' : `搜索服务返回 ${res.status}${detail ? `：${detail}` : ''}`);
  }
  const json = (await res.json()) as { data?: { webPages?: { value?: unknown } } };
  const value = json.data?.webPages?.value;
  if (!Array.isArray(value)) throw new Error('搜索服务没有返回网页结果。');
  return value
    .map((v) => {
      const x = (v ?? {}) as Record<string, unknown>;
      const s = (k: string): string => (typeof x[k] === 'string' ? (x[k] as string).trim() : '');
      return { title: s('name'), url: s('url'), snippet: s('summary') || s('snippet'), siteName: s('siteName'), date: s('dateLastCrawled') || s('datePublished') };
    })
    .filter((r) => r.title && r.url)
    .slice(0, 8);
}