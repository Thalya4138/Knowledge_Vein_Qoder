import { afterEach, describe, expect, it, vi } from 'vitest';
import { chat, readStream, type StreamProgress } from './chat';

/** 把 SSE 文本按给定的切点拆成几个网络包（模拟一行被拆在两个包里） */
const sse = (text: string, cuts: number[] = []) => {
  const enc = new TextEncoder().encode(text);
  const points = [0, ...cuts, enc.length];
  return new ReadableStream<Uint8Array>({
    start(c) {
      for (let i = 0; i + 1 < points.length; i += 1) c.enqueue(enc.slice(points[i], points[i + 1]));
      c.close();
    },
  });
};

afterEach(() => vi.unstubAllGlobals());

describe('流式读取', () => {
  it('OpenAI 兼容：先思考再写，拼出正文、数出思考字数；被拆开的行也能接上', async () => {
    const body = [
      'data: {"choices":[{"delta":{"reasoning_content":"先想想"}}]}',
      'data: {"choices":[{"delta":{"content":"你好"}}]}',
      'data: {"choices":[{"delta":{"content":"，世界"},"finish_reason":"stop"}]}',
      'data: [DONE]',
      '',
    ].join('\n');
    const seen: StreamProgress[] = [];
    const out = await readStream(sse(body, [20, 75]), false, (p) => seen.push(p));
    expect(out).toEqual({ text: '你好，世界', cut: false });
    expect(seen[0]).toEqual({ text: '', thinking: 3 });
    expect(seen.at(-1)!.text).toBe('你好，世界');
  });

  it('OpenAI 兼容：finish_reason=length 判为截断', async () => {
    const out = await readStream(sse('data: {"choices":[{"delta":{"content":"半"},"finish_reason":"length"}]}\n'), false, () => undefined);
    expect(out.cut).toBe(true);
  });

  it('Anthropic：text_delta 拼正文、thinking_delta 计思考、max_tokens 判截断', async () => {
    const body = [
      'event: content_block_delta',
      'data: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"嗯"}}',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"答"}}',
      'data: {"type":"message_delta","delta":{"stop_reason":"max_tokens"}}',
      '',
    ].join('\n');
    const out = await readStream(sse(body), true, () => undefined);
    expect(out).toEqual({ text: '答', cut: true });
  });

  it('流里报错：抛出模型服务的错误信息', async () => {
    await expect(readStream(sse('data: {"error":{"message":"overloaded"}}\n'), false, () => undefined)).rejects.toThrow('overloaded');
  });

  it('chat 传了 onDelta 就请求 stream；服务不理会、照样回 JSON 时也能用', async () => {
    let sent: { stream?: boolean } = {};
    vi.stubGlobal('fetch', async (_u: string, init: RequestInit) => {
      sent = JSON.parse(init.body as string);
      return new Response(JSON.stringify({ choices: [{ message: { content: '整段' }, finish_reason: 'stop' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const cfg = { provider: 'openai-compatible' as const, baseUrl: 'https://x.test/v1', model: 'm', apiKey: 'k' };
    expect(await chat(cfg, [{ role: 'user', content: 'q' }], undefined, 100, () => undefined)).toBe('整段');
    expect(sent.stream).toBe(true);
  });

  it('chat 流式：进度回调拿到累计正文', async () => {
    vi.stubGlobal('fetch', async () =>
      new Response(sse('data: {"choices":[{"delta":{"content":"a"}}]}\ndata: {"choices":[{"delta":{"content":"b"},"finish_reason":"stop"}]}\n'), {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
    );
    const cfg = { provider: 'openai-compatible' as const, baseUrl: 'https://x.test/v1', model: 'm', apiKey: 'k' };
    const seen: string[] = [];
    expect(await chat(cfg, [{ role: 'user', content: 'q' }], undefined, 100, (p) => seen.push(p.text))).toBe('ab');
    expect(seen).toEqual(['a', 'ab']);
  });
});
