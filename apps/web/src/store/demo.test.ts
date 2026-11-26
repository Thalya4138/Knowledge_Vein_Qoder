import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoStore } from './demo';

/** 示例存储读线上原件；IndexedDB 覆盖层在 node 里不存在，读覆盖层会失败并回退到网络，正好测回退路径。 */
describe('示例工作区存储', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('托管站对不存在的路径回首页 HTML 时，当作文件不存在', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<!doctype html><title>知脉</title>', { status: 200, headers: { 'content-type': 'text/html' } })));
    await expect(demoStore('linear-algebra', '/demo/linear-algebra').read('maps/mind.json')).rejects.toThrow('文件不存在');
  });

  it('真实的原件照常读到', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"a":1}', { status: 200, headers: { 'content-type': 'application/json' } })));
    expect(await (await demoStore('linear-algebra', '/demo/linear-algebra').read('graph.json')).text()).toBe('{"a":1}');
  });
});
