import type { ModelConfig } from '../ui/prefs';

/**
 * 模型调用适配层（R3 的最小切片，SYNC_AND_API.md §4）：浏览器直连用户自己的模型服务，
 * key 只在内存里经过这一次请求，不写日志、不落盘、不进 URL（AGENTS.md §1 第 7 条）。
 * 一个 OpenAI 兼容实现覆盖 DeepSeek / 通义千问兼容模式 / Kimi / OpenAI；Anthropic 单独一支。
 */

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

export class ModelError extends Error {}

function explain(status: number, body: string): string {
  if (status === 401 || status === 403) return `模型服务拒绝了这个 key（HTTP ${status}）。请在设置里检查 key。`;
  if (status === 404) return `地址或模型名不对（HTTP 404）。请在设置里核对 Base URL 与模型名。`;
  if (status === 429) return `模型服务说太忙或额度用完了（HTTP 429），稍后再试。`;
  if (status === 400) return `模型服务不接受这次请求（HTTP 400）${body ? `：${body.slice(0, 160)}` : ''}`;
  return `模型服务出错（HTTP ${status}）${body ? `：${body.slice(0, 160)}` : ''}`;
}

export async function chat(m: ModelConfig, messages: ChatMessage[], signal?: AbortSignal, maxTokens = 8192): Promise<string> {
  const base = m.baseUrl.replace(/\/+$/, '');
  const system = messages.filter((x) => x.role === 'system').map((x) => x.content).join('\n\n');
  const user = messages.filter((x) => x.role === 'user');
  const anthropic = m.provider === 'anthropic';
  const url = anthropic ? `${base}/messages` : `${base}/chat/completions`;
  const headers: Record<string, string> = anthropic
    ? {
        'content-type': 'application/json',
        'x-api-key': m.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      }
    : { 'content-type': 'application/json', authorization: `Bearer ${m.apiKey}` };
  const body = anthropic
    ? { model: m.model, max_tokens: maxTokens, system, messages: user }
    : { model: m.model, temperature: 0.2, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, ...user] };

  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ModelError('浏览器连不上这个模型服务：可能是网络不通，或者这家服务不允许网页直接调用（跨域）。可以在设置里点「测试连接」确认。');
  }
  if (!res.ok) throw new ModelError(explain(res.status, await res.text().catch(() => '')));
  const data = (await res.json()) as {
    choices?: { message?: { content?: string }; finish_reason?: string }[];
    content?: { type: string; text?: string }[];
    stop_reason?: string;
  };
  const text = anthropic
    ? (data.content ?? []).map((c) => c.text ?? '').join('')
    : data.choices?.[0]?.message?.content ?? '';
  const cut = anthropic ? data.stop_reason === 'max_tokens' : data.choices?.[0]?.finish_reason === 'length';
  if (cut) throw new ModelError('模型的回答太长被截断了。可以换一个上下文更长的模型，或先减少工作区里的笔记再试。');
  if (!text.trim()) throw new ModelError('模型返回了空回答。');
  return text;
}

/** 从模型回答里取出 JSON 对象：容忍 ```json 围栏与前后多余的话。 */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = fenced ? fenced[1]! : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) throw new ModelError('模型没有按要求返回 JSON。');
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    throw new ModelError('模型返回的 JSON 不完整或格式有误。');
  }
}
