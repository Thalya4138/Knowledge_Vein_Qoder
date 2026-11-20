import { afterEach, describe, expect, it, vi } from 'vitest';
import { chat, extractJson } from '../../ai/chat';
import { memoryStore } from '../../store/memoryStore';
import type { ModelConfig } from '../../ui/prefs';
import { checkOutput, collectInput, generateMind, NOTE_BUDGET, splitNote, type MindInput } from './mindGen';

const NOTE = `# 应力

开头一段。

## 柯西应力

$$\\sigma_{ij} = \\sigma_{ji}$$

\`\`\`
# 这不是标题
\`\`\`
`;

const input = (over: Partial<MindInput> = {}): MindInput => ({
  kb: { title: '力学' },
  nodes: [{ id: 'n.stress', title: '应力', kind: 'concept', aliases: [] }],
  relations: [],
  notes: splitNote('notes/应力.md', NOTE),
  existingMap: null,
  userRequest: '生成一张思维导图',
  ...over,
});

describe('笔记切片', () => {
  it('按标题切段并记下锚点，代码块里的 # 不算标题', () => {
    const spans = splitNote('notes/应力.md', NOTE);
    expect(spans.map((s) => s.anchor)).toEqual(['notes/应力.md#应力', 'notes/应力.md#柯西应力']);
    expect(spans[1]!.text).toContain('# 这不是标题');
  });

  it('只收工作区里的笔记，不收 maps/ 与 .vein/，超出上限的段落计数', async () => {
    const big = 'x'.repeat(NOTE_BUDGET);
    const { store } = memoryStore({
      'notes/应力.md': NOTE,
      'notes/z-大.md': `# 大\n${big}`,
      'maps/mind.json': '{}',
      '.vein/prompts/atlas.mindmap.md': '# 我的提示词',
      'kb.json': JSON.stringify({ title: '弹性力学', subtitle: '一条线' }),
    });
    const { input: got, stats } = await collectInput(store, '力学', null);
    expect(got.notes.map((n) => n.anchor)).toEqual(['notes/应力.md#应力', 'notes/应力.md#柯西应力']);
    expect(stats).toMatchObject({ files: 2, dropped: 1 });
    expect(got.kb).toEqual({ title: '弹性力学', subtitle: '一条线' });
  });
});

describe('核对模型输出（保真）', () => {
  it('删掉原文里没有的公式、编造的出处、图谱里不存在的 ref，并告诉用户', () => {
    const raw = {
      title: '力学',
      root: {
        id: 'whatever',
        text: '力学',
        kids: [
          {
            id: 'a',
            text: '应力',
            ref: 'n.stress',
            src: 'notes/应力.md#柯西应力',
            f: ['\\sigma_{ij}=\\sigma_{ji}', 'E=mc^2'],
            kids: [{ id: 'b', text: '编的', ref: 'n.fake', src: '教材第 99 页', kids: [] }],
          },
          { id: 'a', text: '重复 id', kids: [] },
          { id: 'c', text: '', kids: [] },
        ],
      },
      links: [{ from: 'a', to: 'b' }],
    };
    const r = checkOutput(raw, input());
    const [a, dup] = r.doc.root.kids;
    expect(r.doc.root.id).toBe('root');
    expect(a).toMatchObject({ ref: 'n.stress', src: '应力 § 柯西应力', f: ['\\sigma_{ij}=\\sigma_{ji}'], band: 0, side: 1 });
    expect(a!.kids[0]).not.toHaveProperty('ref');
    expect(a!.kids[0]).not.toHaveProperty('src');
    expect(dup!.id).not.toBe('a');
    expect(r.doc.root.kids).toHaveLength(2); // 空主题丢弃
    expect(r.doc.links).toEqual([]); // 模型不得画「我的连线」
    expect(r.fixes.join('；')).toMatch(/1 条公式.*1 处出处.*1 处指向.*1 个重复/);
    expect(r.warnings.some((w) => w.includes('主题'))).toBe(true);
  });

  it('没有 root 的回答直接判失败', () => {
    expect(() => checkOutput({ title: 'x' }, input())).toThrow('缺少 root');
  });

  it('容忍 ```json 围栏和前后的话', () => {
    expect(extractJson('好的：\n```json\n{"a":1}\n```\n以上')).toEqual({ a: 1 });
    expect(() => extractJson('我不会')).toThrow('JSON');
  });
});

describe('模型调用（浏览器直连）', () => {
  const cfg: ModelConfig = { provider: 'openai-compatible', baseUrl: 'https://api.example.com/v1/', model: 'm', apiKey: 'sk-test' };
  afterEach(() => vi.unstubAllGlobals());

  it('OpenAI 兼容：POST /chat/completions，key 只在请求头里', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }] })));
    vi.stubGlobal('fetch', fetchMock);
    expect(await chat(cfg, [{ role: 'system', content: 's' }, { role: 'user', content: 'u' }])).toBe('hi');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.example.com/v1/chat/completions');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-test');
    expect(JSON.parse(init.body as string).messages[0]).toEqual({ role: 'system', content: 's' });
  });

  it('Anthropic：POST /messages，带浏览器直连头，system 单独放', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' })));
    vi.stubGlobal('fetch', fetchMock);
    expect(await chat({ ...cfg, provider: 'anthropic' }, [{ role: 'system', content: 's' }, { role: 'user', content: 'u' }])).toBe('ok');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.example.com/v1/messages');
    expect((init.headers as Record<string, string>)['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(JSON.parse(init.body as string)).toMatchObject({ system: 's', messages: [{ role: 'user', content: 'u' }] });
  });

  it('401、截断、跨域失败都给人话', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 401 })));
    await expect(chat(cfg, [])).rejects.toThrow('拒绝了这个 key');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{' }, finish_reason: 'length' }] }))));
    await expect(chat(cfg, [])).rejects.toThrow('截断');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(chat(cfg, [])).rejects.toThrow('跨域');
  });

  it('端到端：工作区覆盖的提示词会被用上，输出经过核对', async () => {
    const answer = { title: '力学', root: { id: 'root', text: '力学', kids: [{ id: 'a', text: '应力', f: ['E=mc^2'], kids: [] }] } };
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ choices: [{ message: { content: '```json\n' + JSON.stringify(answer) + '\n```' }, finish_reason: 'stop' }] })));
    vi.stubGlobal('fetch', fetchMock);
    const { store } = memoryStore({ '.vein/prompts/atlas.mindmap.md': '# 我自己的导图规则' });
    const r = await generateMind(cfg, store, input());
    const sent = JSON.parse(fetchMock.mock.calls[0]![1].body as string).messages[0].content as string;
    expect(sent).toContain('# 我自己的导图规则');
    expect(sent).toContain('质量底线'); // 共用底线不能被工作区覆盖掉
    expect(r.doc.root.kids[0]).not.toHaveProperty('f');
    expect(r.fixes[0]).toContain('公式');
  });
});
