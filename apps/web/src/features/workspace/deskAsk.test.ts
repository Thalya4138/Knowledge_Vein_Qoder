import { describe, expect, it } from 'vitest';
import { promptFor } from '../../ai/prompts';
import type { WsFile } from '../../store/types';
import { buildAsk, citedNumbers, sourceOf } from './deskAsk';

const files: WsFile[] = [
  { id: 'note-2-1', name: '列空间中的最近点', kind: 'lecture', url: '', sourceUrl: encodeURI('/demo/linear-algebra/notes/2.1-列空间中的最近点.md') },
  { id: 'local:a', name: '笔记', kind: 'lecture', url: '', path: '力学/笔记.md' },
];

describe('工作台问答', () => {
  it('片段锚点对到工作台里的文件与标题（示例按 sourceUrl，本地按 path）', () => {
    expect(sourceOf({ anchor: 'notes/2.1-列空间中的最近点.md#法方程', text: '' }, 1, files)).toMatchObject({ fileId: 'note-2-1', heading: '法方程', label: '列空间中的最近点 / 法方程' });
    expect(sourceOf({ anchor: '力学/笔记.md', text: '' }, 2, files)).toMatchObject({ fileId: 'local:a', heading: '', label: '笔记' });
    // 一级标题与文件名只差全角空格：只写一遍
    expect(sourceOf({ anchor: '力学/笔记.md#笔　记', text: '' }, 4, files).label).toBe('笔记');
  });

  it('对不上文件的出处（如 PDF 页）只显示、不跳转', () => {
    expect(sourceOf({ anchor: '资料/讲义.pdf#page=3', text: '' }, 3, files).fileId).toBeUndefined();
  });

  it('只把回答里真正引用过的编号当出处', () => {
    expect([...citedNumbers('先看 [1]，再对照 [3][1]。数组 a[i] 不算')]).toEqual([1, 3]);
    expect(citedNumbers('讲义里没有讲到这一点。').size).toBe(0);
  });

  it('给模型的消息：段落按编号列出，没找到时明说，追问带上此前对话', () => {
    const msg = buildAsk('为什么唯一？', [{ anchor: 'a.md#x', text: '正文' }], [{ q: '法方程怎么来', a: '由正交条件' }]);
    expect(msg).toContain('[1] 位置：a.md#x\n正文');
    expect(msg).toContain('读者：法方程怎么来');
    expect(msg.indexOf('读者的问题')).toBeGreaterThan(msg.indexOf('[1]'));
    expect(buildAsk('q', [], [])).toContain('没有找到相关段落');
  });

  it('提示词：带共用底线、要求只用给出的编号，且不含维护者段落', async () => {
    const { text } = await promptFor('workspace.ask');
    expect(text).toContain('编号只能用给出的那些');
    expect(text).not.toMatch(/\*\*版本\*\*|<!--/);
  });
});
