import { afterEach, describe, expect, it, vi } from 'vitest';
import { chat, ModelError } from './chat';

const cfg = { provider: 'openai-compatible' as const, baseUrl: 'https://x.test/v1', model: 'm', apiKey: 'k' };
const reply = (content: string, finish = 'stop') =>
  new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: finish }] }), { status: 200 });

afterEach(() => vi.unstubAllGlobals());

describe('chat 续写', () => {
  it('被输出上限截断时接着写，并把已写部分作为 assistant 消息带回去', async () => {
    const bodies: { messages: { role: string; content: unknown }[] }[] = [];
    const parts = [reply('前半段，', 'length'), reply('后半段。')];
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return parts.shift()!;
    }));
    const text = await chat(cfg, [{ role: 'system', content: 's' }, { role: 'user', content: 'q' }]);
    expect(text).toBe('前半段，后半段。');
    const second = bodies[1]!.messages;
    expect(second.at(-2)).toEqual({ role: 'assistant', content: '前半段，' });
    expect(second.at(-1)!.role).toBe('user');
  });

  it('续写次数有上限，写不完就如实报错', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply('又一段', 'length')));
    await expect(chat(cfg, [{ role: 'user', content: 'q' }])).rejects.toBeInstanceOf(ModelError);
    expect((fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(4);
  });

  it('Anthropic 被截断时也续写（追加的是 user 消息，不是预填）', async () => {
    const bodies: { max_tokens: number; messages: { role: string; content: unknown }[] }[] = [];
    const ant = (text: string, stop: string) =>
      new Response(JSON.stringify({ content: [{ type: 'text', text }], stop_reason: stop }), { status: 200 });
    const parts = [ant('上半，', 'max_tokens'), ant('下半。', 'end_turn')];
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return parts.shift()!;
    }));
    const a = { provider: 'anthropic' as const, baseUrl: 'https://a.test/v1', model: 'claude-x', apiKey: 'k' };
    expect(await chat(a, [{ role: 'user', content: 'q' }])).toBe('上半，下半。');
    expect(bodies[0]!.max_tokens).toBe(64000);
    expect(bodies[1]!.messages.at(-2)).toEqual({ role: 'assistant', content: '上半，' });
    expect(bodies[1]!.messages.at(-1)!.role).toBe('user');
  });
});

describe('chat 输出上限', () => {
  const ask = [{ role: 'user' as const, content: 'q' }];
  const sentOf = () => (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls.map((c) => JSON.parse(String(c[1].body)));

  it('不传 onDelta 也走流式，上限按 OUTPUT_CEILING 放高', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply('好')));
    expect(await chat({ ...cfg, model: 'm-stream' }, ask, undefined, 4096)).toBe('好');
    expect(sentOf()[0]).toMatchObject({ stream: true, max_tokens: 32768 });
  });

  it('服务嫌上限太高（400）：按它报的数字重试，并记住，下次直接用', async () => {
    const tooHigh = () => new Response('{"error":{"message":"Invalid max_tokens value, the valid range of max_tokens is [1, 8192]"}}', { status: 400 });
    const parts = [tooHigh(), reply('一'), reply('二')];
    vi.stubGlobal('fetch', vi.fn(async () => parts.shift()!));
    const m = { ...cfg, model: 'm-8k' };
    expect(await chat(m, ask, undefined, 4096)).toBe('一');
    expect(await chat(m, ask, undefined, 4096)).toBe('二');
    expect(sentOf().map((b) => b.max_tokens)).toEqual([32768, 8192, 8192]);
  });

  it('报错里找不到数字：退回调用方给的值', async () => {
    const parts = [new Response('max_tokens is too large', { status: 400 }), reply('好')];
    vi.stubGlobal('fetch', vi.fn(async () => parts.shift()!));
    expect(await chat({ ...cfg, model: 'm-nonum' }, ask, undefined, 4096)).toBe('好');
    expect(sentOf().map((b) => b.max_tokens)).toEqual([32768, 4096]);
  });

  it('与上限无关的 400 不重试', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('bad temperature', { status: 400 })));
    await expect(chat({ ...cfg, model: 'm-400' }, ask)).rejects.toBeInstanceOf(ModelError);
    expect(sentOf()).toHaveLength(1);
  });

  it('思考用光上限、一个字没写：不续写，放大上限重来', async () => {
    const parts = [reply('', 'length'), reply('正文')];
    vi.stubGlobal('fetch', vi.fn(async () => parts.shift()!));
    expect(await chat({ ...cfg, model: 'm-think' }, ask)).toBe('正文');
    const [a, b] = sentOf();
    expect([a.max_tokens, b.max_tokens]).toEqual([32768, 65536]);
    expect(b.messages.at(-1)).toEqual({ role: 'user', content: 'q' });
  });

  it('已到这个模型的上限仍只够思考：如实报错，不空转', async () => {
    const tooHigh = () => new Response('max_tokens must be <= 8192', { status: 400 });
    const parts = [tooHigh(), reply('', 'length')];
    vi.stubGlobal('fetch', vi.fn(async () => parts.shift()!));
    await expect(chat({ ...cfg, model: 'm-think-8k' }, ask)).rejects.toThrow('思考');
    expect(sentOf()).toHaveLength(2);
  });
});
