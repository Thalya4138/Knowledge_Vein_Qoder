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
});
