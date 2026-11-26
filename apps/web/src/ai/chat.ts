import type { ModelConfig } from '../ui/prefs';
import { networkHint } from './providers';

/**
 * 模型调用适配层（R3 的最小切片，SYNC_AND_API.md §4）：浏览器直连用户自己的模型服务，
 * key 不写日志、不进 URL、不进工作区；它存在哪里由设置决定（ui/prefs.tsx，AGENTS.md §1 第 7 条）。
 * 一个 OpenAI 兼容实现覆盖 DeepSeek / 通义千问兼容模式 / Kimi / OpenAI；Anthropic 单独一支。
 */

/** 用户消息可以夹带图片（截图），给支持看图的模型；纯文本消息仍然只是字符串 */
export type ContentPart = { type: 'text'; text: string } | { type: 'image'; mediaType: string; data: string };

export interface ChatMessage {
  role: 'system' | 'user';
  content: string | ContentPart[];
}

const asText = (c: ChatMessage['content']) => (typeof c === 'string' ? c : c.map((p) => (p.type === 'text' ? p.text : '')).join('\n'));

/** 两家接口对图片的写法不同：OpenAI 兼容用 data URL，Anthropic 用 base64 source */
function wire(c: ChatMessage['content'], anthropic: boolean): unknown {
  if (typeof c === 'string') return c;
  return c.map((p) =>
    p.type === 'text'
      ? { type: 'text', text: p.text }
      : anthropic
        ? { type: 'image', source: { type: 'base64', media_type: p.mediaType, data: p.data } }
        : { type: 'image_url', image_url: { url: `data:${p.mediaType};base64,${p.data}` } },
  );
}

export class ModelError extends Error {}

function explain(status: number, body: string, model = ''): string {
  // 模型名不对时各家回 400 或 404，正文里都会提到 model：直接说「换模型名」，不让人去查 key 和地址
  if ((status === 400 || status === 404) && /model/i.test(body) && /not[\s_-]*(exist|found|support)|does not exist|invalid|不存在|不支持/i.test(body))
    return `这家服务没有「${model}」这个模型（HTTP ${status}）。请在设置里点「测试连接」，从列出的模型里选一个。`;
  if (status === 401 || status === 403) return `模型服务拒绝了这个 key（HTTP ${status}）。请在设置里检查 key。`;
  if (status === 404) return `地址或模型名不对（HTTP 404）。请在设置里核对 Base URL 与模型名。`;
  if (status === 429) return `模型服务说太忙或额度用完了（HTTP 429），稍后再试。`;
  if (status === 400 && /image|vision|multimodal|图片|图像/i.test(body)) return '这个模型看不了图片（HTTP 400）。请去掉截图，或在设置里换一个支持看图的模型。';
  if (status === 400) return `模型服务不接受这次请求（HTTP 400）${body ? `：${body.slice(0, 160)}` : ''}`;
  return `模型服务出错（HTTP ${status}）${body ? `：${body.slice(0, 160)}` : ''}`;
}

/** 流式进度：到目前为止写出的正文（含续写前的部分），以及模型「思考」了多少字（思考型模型先想后写） */
export interface StreamProgress {
  text: string;
  thinking: number;
}

/**
 * 传了 onDelta 就流式请求：模型每写出一段就回调一次，界面能显示进度（长输出要几分钟，不流式时这段时间什么都看不到）。
 * 不传时与原来一样一次拿全。
 */
export async function chat(
  m: ModelConfig,
  messages: ChatMessage[],
  signal?: AbortSignal,
  maxTokens = 8192,
  onDelta?: (p: StreamProgress) => void,
): Promise<string> {
  // 回答被输出上限截断时接着写：把已写的部分作为 assistant 消息带回去，让模型从断点续上。
  // 很多服务单次输出有上限（常见 8K token），而一篇关联探索的完整回答可以超过它。
  let text = '';
  for (let round = 0; round <= MAX_CONTINUE; round += 1) {
    const before = text;
    const part = await once(m, messages, text, signal, maxTokens, onDelta && ((p) => onDelta({ text: before + p.text, thinking: p.thinking })));
    text += part.text;
    if (!part.cut) {
      if (!text.trim()) throw new ModelError('模型返回了空回答。');
      return text;
    }
    if (m.provider === 'anthropic') break; // Anthropic 接口的新模型思考常开，不接受预填续写；上限已取 16000
  }
  throw new ModelError('模型的回答太长，续写几次后仍未写完。可以换一个输出上限更高的模型，或把问题拆小一些再试。');
}

const MAX_CONTINUE = 3;
const CONTINUE = '继续。从上一条回答停下的地方接着写，第一个字紧接断点，不重复已经写过的内容，不加任何说明。';

async function once(
  m: ModelConfig,
  messages: ChatMessage[],
  soFar: string,
  signal: AbortSignal | undefined,
  maxTokens: number,
  onPart?: (p: StreamProgress) => void,
): Promise<{ text: string; cut: boolean }> {
  const base = m.baseUrl.replace(/\/+$/, '');
  const anthropic = m.provider === 'anthropic';
  const system = messages.filter((x) => x.role === 'system').map((x) => asText(x.content)).join('\n\n');
  const user: { role: 'user' | 'assistant'; content: unknown }[] = messages
    .filter((x) => x.role === 'user')
    .map((x) => ({ role: 'user' as const, content: wire(x.content, anthropic) }));
  if (soFar) user.push({ role: 'assistant', content: soFar }, { role: 'user', content: CONTINUE });
  const url = anthropic ? `${base}/messages` : `${base}/chat/completions`;
  const headers: Record<string, string> = anthropic
    ? {
        'content-type': 'application/json',
        'x-api-key': m.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      }
    : { 'content-type': 'application/json', authorization: `Bearer ${m.apiKey}` };
  const body = {
    ...(anthropic
      ? // Anthropic 接口的新模型思考常开且计入 max_tokens：上限太低时回答会被思考挤掉，取 16000 作底
        { model: m.model, max_tokens: Math.max(maxTokens, 16000), system, messages: user }
      : { model: m.model, temperature: 0.2, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, ...user] }),
    ...(onPart ? { stream: true } : {}),
  };

  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ModelError('浏览器连不上这个模型服务。' + networkHint(m.baseUrl));
  }
  if (!res.ok) throw new ModelError(explain(res.status, await res.text().catch(() => ''), m.model));
  // 有的服务不理会 stream 参数、照样一次返回 JSON：按响应类型分流，而不是按请求时的意图
  if (onPart && res.body && (res.headers.get('content-type') ?? '').includes('event-stream')) return readStream(res.body, anthropic, onPart);
  const data = (await res.json()) as {
    choices?: { message?: { content?: string }; finish_reason?: string }[];
    content?: { type: string; text?: string }[];
    stop_reason?: string;
  };
  const text = anthropic
    ? (data.content ?? []).map((c) => c.text ?? '').join('')
    : data.choices?.[0]?.message?.content ?? '';
  if (anthropic && data.stop_reason === 'refusal') throw new ModelError('模型出于安全策略拒绝回答这次请求。换个问法，或换一个模型再试。');
  const cut = anthropic ? data.stop_reason === 'max_tokens' : data.choices?.[0]?.finish_reason === 'length';
  return { text, cut };
}

/**
 * 读 SSE 流。两家格式：
 * - OpenAI 兼容：`data: {choices:[{delta:{content, reasoning_content}, finish_reason}]}`，以 `data: [DONE]` 结束；
 *   思考型模型（DeepSeek、通义的思考模式等）先在 reasoning_content 里想，再在 content 里写。
 * - Anthropic：`content_block_delta` 带 text_delta / thinking_delta；`message_delta` 带 stop_reason。
 */
export async function readStream(
  stream: ReadableStream<Uint8Array>,
  anthropic: boolean,
  onPart: (p: StreamProgress) => void,
): Promise<{ text: string; cut: boolean }> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let text = '';
  let thinking = 0;
  let cut = false;
  let refusal = false;
  const take = (data: string) => {
    if (!data || data === '[DONE]') return;
    let j: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    try {
      j = JSON.parse(data);
    } catch {
      return;
    }
    if (j.error) throw new ModelError(`模型服务出错：${String(j.error.message ?? j.error).slice(0, 160)}`);
    if (anthropic) {
      if (j.type === 'content_block_delta') {
        if (j.delta?.type === 'text_delta') text += j.delta.text ?? '';
        else if (j.delta?.type === 'thinking_delta') thinking += String(j.delta.thinking ?? '').length;
      } else if (j.type === 'message_delta') {
        if (j.delta?.stop_reason === 'max_tokens') cut = true;
        if (j.delta?.stop_reason === 'refusal') refusal = true;
      }
    } else {
      const c = j.choices?.[0];
      if (typeof c?.delta?.content === 'string') text += c.delta.content;
      const r = c?.delta?.reasoning_content ?? c?.delta?.reasoning;
      if (typeof r === 'string') thinking += r.length;
      if (c?.finish_reason === 'length') cut = true;
    }
    onPart({ text, thinking });
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line.startsWith('data:')) take(line.slice(5).trim());
    }
  }
  if (buf.trim().startsWith('data:')) take(buf.trim().slice(5).trim());
  if (refusal) throw new ModelError('模型出于安全策略拒绝回答这次请求。换个问法，或换一个模型再试。');
  return { text, cut };
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
