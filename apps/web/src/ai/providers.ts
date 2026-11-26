import type { ModelConfig } from '../ui/prefs';

/**
 * 常用模型服务（BYOK）。只把「浏览器能不能直连」写成实测过的事实：
 * 2026-11-26 用无头 Chrome 从网页里带无效 key 调对话接口——读到 HTTP 401 即跨域放行，抛 TypeError 即被拦。
 * 证据与复测方法见 docs/SYNC_AND_API.md §4.1。服务会改策略，结论过期了就重测，不要凭印象改这张表。
 *
 * 模型名大多留空：各家改名很快，写死的名字会过期。「测试连接」会列出这个 key 真正能用的模型供挑选。
 */
export interface Provider {
  name: string;
  cfg: Pick<ModelConfig, 'provider' | 'baseUrl' | 'model'>;
  /** ok = 实测浏览器可直连；untested = 本站所在网络连不上，未能实测 */
  cors: 'ok' | 'untested';
}

export const PROVIDERS: Provider[] = [
  // 模型名 2026-11-26 查官方文档：DeepSeek 推荐 deepseek-flash（另有 deepseek-v4-pro），旧名 deepseek-chat 已不在文档里；
  // 通义千问当前一代是 qwen3.7-plus / qwen4-max / qwen3.8-flash。过期了以「测试连接」列出的为准，再改这里。
  { name: 'DeepSeek', cfg: { provider: 'openai-compatible', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-flash' }, cors: 'ok' },
  { name: '通义千问', cfg: { provider: 'openai-compatible', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen3.7-plus' }, cors: 'ok' },
  { name: 'Kimi', cfg: { provider: 'openai-compatible', baseUrl: 'https://api.moonshot.cn/v1', model: '' }, cors: 'ok' },
  { name: '硅基流动', cfg: { provider: 'openai-compatible', baseUrl: 'https://api.siliconflow.cn/v1', model: '' }, cors: 'ok' },
  { name: 'OpenRouter', cfg: { provider: 'openai-compatible', baseUrl: 'https://openrouter.ai/api/v1', model: '' }, cors: 'ok' },
  { name: 'OpenAI', cfg: { provider: 'openai-compatible', baseUrl: 'https://api.openai.com/v1', model: '' }, cors: 'untested' },
  { name: 'Anthropic', cfg: { provider: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-opus-5-5' }, cors: 'untested' },
];

/** 实测不允许网页直连的服务：填了这些地址，直接说清楚，免得用户去查 key 和网络。 */
const BLOCKED: { host: string; name: string }[] = [{ host: 'open.bigmodel.cn', name: '智谱 GLM' }];

function hostOf(baseUrl: string): string | null {
  try {
    return new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** 已知会被浏览器拦下的服务名；不在名单里返回 null。 */
export function knownBlocked(baseUrl: string): string | null {
  const h = hostOf(baseUrl);
  if (!h) return null;
  return BLOCKED.find((b) => h === b.host || h.endsWith('.' + b.host))?.name ?? null;
}

/** 当前地址对应的预设（用于显示「已实测 / 未实测」）。 */
export function providerOf(baseUrl: string): Provider | null {
  const h = hostOf(baseUrl);
  if (!h) return null;
  return PROVIDERS.find((p) => hostOf(p.cfg.baseUrl) === h) ?? null;
}

/** 连不上时的解释：已知被拦的给结论，其余才说「可能是跨域，也可能是网络」。 */
export function networkHint(baseUrl: string, lang: 'zh' | 'en' = 'zh'): string {
  const en = lang === 'en';
  const blocked = knownBlocked(baseUrl);
  if (blocked)
    return en
      ? `${blocked} does not allow calls from a web page (CORS, tested 2026-11). Choose another provider — it is not your key or network.`
      : `${blocked} 不允许网页直接调用（跨域限制，2026-11 实测），换一家服务即可，不是你的 key 或网络的问题。`;
  const p = providerOf(baseUrl);
  if (p?.cors === 'ok')
    return en
      ? `${p.name} does allow browser calls (tested), so the network or the URL is the likely cause.`
      : `${p.name} 本身允许网页直连（已实测），所以多半是网络不通或地址写错了。`;
  return en
    ? 'Either this service does not allow calls from a web page (CORS), or the network or URL is wrong.'
    : '可能是这家服务不允许网页直接调用（跨域限制），也可能是网络不通或地址有误。';
}
