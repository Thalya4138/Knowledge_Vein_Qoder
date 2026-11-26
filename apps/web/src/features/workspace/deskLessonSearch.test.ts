import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Workspace } from '../../store/types';
import { discoverResources } from './deskLesson';
import type { OrganizeLesson } from './deskOrganize';

afterEach(() => vi.unstubAllGlobals());

const ws = { id: 'ws-test', origin: 'browser' } as Workspace;
const lesson: OrganizeLesson = { file: 'notes/双纽线.md', title: '双纽线', sections: ['定义与方程'] };

const hit = () =>
  new Response(JSON.stringify({ code: 200, data: { webPages: { value: [{ name: '卡西尼卵形线', url: 'https://example.org/cassini', summary: '双纽线是其特例', siteName: '示例百科' }] } } }));

describe('discoverResources：搜索 key 可选的三条路', () => {
  it('有搜索 key 命中 → 实时候选，许可待核对，不需要模型', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => hit()));
    const d = await discoverResources(null, ws, lesson, [], 'test-key');
    expect(d.live).toBe(true);
    expect(d.sample).toBe(false);
    expect(d.candidates[0]).toMatchObject({ id: 'res.web.1', kind: 'web', license: '待核对', uri: 'https://example.org/cassini' });
    expect(d.candidates[0]!.limitations).toContain('未核对');
  });
  it('搜索失败且无模型 → 降级样例并如实说明，不伪造搜索结果', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: 'Invalid API KEY' }), { status: 401 })));
    const d = await discoverResources(null, ws, lesson, [], 'bad-key');
    expect(d.sample).toBe(true);
    expect(d.live).toBeUndefined();
    expect(d.stillMissing.join()).toContain('联网检索不可用');
  });
  it('搜索无命中且无模型 → 样例候选并注明没找到', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: { webPages: { value: [] } } }))));
    const d = await discoverResources(null, ws, lesson, [], 'test-key');
    expect(d.sample).toBe(true);
    expect(d.stillMissing.join()).toContain('没有找到相关网页');
  });
  it('无搜索 key 无模型 → 原样例路径，不发起搜索', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const d = await discoverResources(null, ws, lesson, []);
    expect(d.sample).toBe(true);
    expect(f).not.toHaveBeenCalled();
  });
});