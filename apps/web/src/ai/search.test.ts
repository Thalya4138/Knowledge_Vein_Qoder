import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchBocha } from './search';

afterEach(() => vi.unstubAllGlobals());

const page = (over: Record<string, unknown> = {}) => ({
  name: '双纽线',
  url: 'https://example.org/lemniscate',
  summary: '到两焦点距离之积为定值',
  snippet: '兜底摘要',
  siteName: '示例站',
  dateLastCrawled: '2026-11-01T00:00:00Z',
  ...over,
});

describe('searchBocha：博查直连', () => {
  it('映射 webPages.value，summary 优先，过滤无题名/地址的条目', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ code: 200, data: { webPages: { value: [page(), page({ name: '' }), page({ url: '' }), { name: '只有 snippet', url: 'https://s', snippet: '短' }] } } })),
      ),
    );
    const r = await searchBocha('k', '双纽线');
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ title: '双纽线', url: 'https://example.org/lemniscate', siteName: '示例站', snippet: '到两焦点距离之积为定值' });
    expect(r[1]!.snippet).toBe('短');
  });
  it('请求带 Bearer 与查询词，发往博查端点', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ data: { webPages: { value: [] } } })));
    vi.stubGlobal('fetch', f);
    await searchBocha('test-key', '投影矩阵');
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.bochaai.com/v1/web-search');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
    expect(JSON.parse(String(init.body)).query).toBe('投影矩阵');
  });
  it('401 说 key 无效；网络失败说连不上', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: '401', message: 'Invalid API KEY' }), { status: 401 })));
    await expect(searchBocha('bad', 'x')).rejects.toThrow('搜索 key 无效');
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));
    await expect(searchBocha('k', 'x')).rejects.toThrow('连不上搜索服务');
  });
  it('返回结构缺失时如实报错，不伪造结果', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: 200, data: null }))));
    await expect(searchBocha('k', 'x')).rejects.toThrow('没有返回网页结果');
  });
});