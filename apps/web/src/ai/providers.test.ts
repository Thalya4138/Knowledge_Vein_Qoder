import { describe, expect, it } from 'vitest';
import { knownBlocked, networkHint, PROVIDERS, providerOf } from './providers';

describe('模型服务清单', () => {
  it('预设地址都是合法的 https 地址，名字不重复', () => {
    for (const p of PROVIDERS) expect(new URL(p.cfg.baseUrl).protocol).toBe('https:');
    expect(new Set(PROVIDERS.map((p) => p.name)).size).toBe(PROVIDERS.length);
  });

  it('已知被拦的服务直接给结论，不让人去查 key', () => {
    expect(knownBlocked('https://open.bigmodel.cn/api/paas/v4')).toBe('智谱 GLM');
    expect(knownBlocked('https://api.deepseek.com/v1')).toBeNull();
    expect(knownBlocked('不是地址')).toBeNull();
    expect(networkHint('https://open.bigmodel.cn/api/paas/v4')).toContain('不是你的 key');
  });

  it('实测可直连的服务连不上时，指向网络而不是跨域', () => {
    expect(providerOf('https://api.moonshot.cn/v1/')?.name).toBe('Kimi');
    expect(networkHint('https://api.moonshot.cn/v1')).toContain('网络不通');
    expect(networkHint('https://example.com/v1')).toContain('跨域');
  });
});
