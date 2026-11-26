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
 * 一律流式请求（服务不理会 stream 参数、照样回 JSON 时也能用）：输出上限可以放得很高而不怕请求超时，
 * 传了 onDelta 还能把进度显示给人看（长输出要几分钟）。
 *
 * maxTokens 是调用方对「这一步大概要写多长」的估计，只作下限：实际请求的上限取 OUTPUT_CEILING 与它的较大者，
 * 因为思考型模型（DeepSeek、通义的思考模式、Claude 新模型）的思考也计入 max_tokens，按正文长度给上限，
 * 正文常常还没写就被思考挤掉。上限只是天花板，没写出来的 token 不计费。
 * 某家服务嫌上限太高（HTTP 400）时，按它报的数字或调用方原值重试，并记住这个模型的上限。
 */
export async function chat(
  m: ModelConfig,
  messages: ChatMessage[],
  signal?: AbortSignal,
  maxTokens = 8192,
  onDelta?: (p: StreamProgress) => void,
): Promise<string> {
  // 回答被输出上限截断时接着写：把已写的部分作为 assistant 消息带回去，再追加一条 user 消息让模型从断点续上。
  // 最后一条是 user 消息，不是「预填」，所以 Anthropic 新模型（不接受预填）也能这样续写。
  let text = '';
  let want = maxTokens;
  for (let round = 0; round <= MAX_CONTINUE; round += 1) {
    const before = text;
    const part = await once(m, messages, text, signal, want, maxTokens, (p) => onDelta?.({ text: before + p.text, thinking: p.thinking }));
    text += part.text;
    if (!part.cut) {
      if (!text.trim()) throw new ModelError('模型返回了空回答。');
      return text;
    }
    if (!part.text.trim()) {
      // 一个字正文都没写就到了上限：额度全被思考用掉了。续写没有意义（没有断点），只能把上限再放大重来。
      if (part.sent >= capOf(m)) {
        throw new ModelError(
          `模型把整个输出上限（${part.sent} token）都用在了思考上，没写出正文。可以在服务那边关掉或调低思考，换一个输出上限更高的模型，或把问题拆小一些再试。`,
        );
      }
      want = part.sent * 2;
    }
  }
  throw new ModelError('模型的回答太长，续写几次后仍未写完。可以换一个输出上限更高的模型，或把问题拆小一些再试。');
}

const MAX_CONTINUE = 3;
const CONTINUE = '继续。从上一条回答停下的地方接着写，第一个字紧接断点，不重复已经写过的内容，不加任何说明。';

/**
 * 默认请求的输出上限。Claude 现行模型单次最多 64K–128K；OpenAI 兼容的各家差别大（DeepSeek 非思考 8K、思考 64K，
 * 通义、Kimi 各有不同），取 32K，超了由服务报 400、再按它给的数字回退（见 learnedCap）。
 */
const OUTPUT_CEILING = { anthropic: 64000, 'openai-compatible': 32768 } as const;

/** 服务报过「上限太高」的模型，记住它真正接受的上限，本页面后续请求不再试错。 */
const learnedCap = new Map<string, number>();
const capKey = (m: ModelConfig) => `${m.provider}|${m.baseUrl.replace(/\/+$/, '')}|${m.model}`;
const capOf = (m: ModelConfig) => learnedCap.get(capKey(m)) ?? Number.POSITIVE_INFINITY;

/** 400 的正文在说输出上限（max_tokens）不对，而不是别的参数 */
const TOKEN_LIMIT = /max[_\s-]*(completion[_\s-]*|output[_\s-]*)?tokens|maximum[^.\n]{0,40}tokens|tokens?[^.\n]{0,20}(limit|range)|输出长度|最大.{0,6}token/i;

/** 从报错正文里找服务接受的上限：小于这次请求值的最大整数；找不到返回 null */
function limitFrom(body: string, sent: number): number | null {
  const nums = (body.match(/\d{3,7}/g) ?? []).map(Number).filter((n) => n >= 256 && n < sent);
  return nums.length ? Math.max(...nums) : null;
}

async function once(
  m: ModelConfig,
  messages: ChatMessage[],
  soFar: string,
  signal: AbortSignal | undefined,
  want: number,
  fallback: number,
  onPart: (p: StreamProgress) => void,
): Promise<{ text: string; cut: boolean; sent: number }> {
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
  const payload = (maxTokens: number) =>
    JSON.stringify({
      ...(anthropic
        ? { model: m.model, max_tokens: maxTokens, system, messages: user }
        : { model: m.model, temperature: 0.2, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, ...user] }),
      stream: true,
    });

  // 先试较高的上限；服务说太高，就试它报的数字，再不行退回调用方原来给的值
  let sent = Math.min(Math.max(want, OUTPUT_CEILING[m.provider]), capOf(m));
  let res: Response;
  for (;;) {
    try {
      res = await fetch(url, { method: 'POST', headers, body: payload(sent), signal });
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      throw new ModelError('浏览器连不上这个模型服务。' + networkHint(m.baseUrl));
    }
    if (res.ok) break;
    const body = await res.text().catch(() => '');
    const next = res.status === 400 && TOKEN_LIMIT.test(body) && sent > fallback ? Math.max(limitFrom(body, sent) ?? fallback, fallback) : null;
    if (next == null || next >= sent) throw new ModelError(explain(res.status, body, m.model));
    learnedCap.set(capKey(m), next);
    sent = next;
  }
  // 有的服务不理会 stream 参数、照样一次返回 JSON：按响应类型分流，而不是按请求时的意图
  if (res.body && (res.headers.get('content-type') ?? '').includes('event-stream')) return { ...(await readStream(res.body, anthropic, onPart)), sent };
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
  return { text, cut, sent };
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
