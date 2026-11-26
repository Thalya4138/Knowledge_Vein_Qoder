import { describe, expect, it } from 'vitest';
import { forModel, promptFor } from './prompts';

describe('发给模型的提示词', () => {
  it('维护者段落与只属于别的位置的段落不发给模型', () => {
    const t = forModel('A\n<!-- author -->版本 v1<!-- /author -->\nB\n<!-- only:x,y -->给 x<!-- /only -->\n<!-- 注释 -->C', 'y');
    expect(t).toBe('A\n\nB\n给 x\nC');
    expect(forModel('<!-- only:x -->给 x<!-- /only -->', 'z')).toBe('');
  });

  for (const slot of ['connection.fragments', 'connection.meta', 'connection.cross', 'atlas.mindmap'] as const) {
    it(`${slot}：没有版本头、变更记录、已撤销的骨架和模型读不到的文件路径`, async () => {
      const { text } = await promptFor(slot);
      expect(text).not.toMatch(/\*\*版本\*\*|变更记录|变更依据|用户原话|先列关系一览|selfCheck/);
      expect(text).not.toMatch(/docs\/|content\/demo|NOTE_GENERATION\.md/);
      expect(text).not.toContain('<!--');
    });
  }

  it('导图的呈现规则只发给导图；关联探索看不到', async () => {
    expect((await promptFor('atlas.mindmap')).text).toContain('横向是层级');
    expect((await promptFor('connection.meta')).text).not.toContain('思维导图与图谱：呈现规则');
  });

  it('关联探索：推广方向、assumptions 必填、动机不画线都写明了', async () => {
    const { text } = await promptFor('connection.fragments');
    expect(text).toContain('from 是特例');
    expect(text).toContain('assumptions` **至少写一项**');
    expect(text).toContain('动机只在正文里讲');
  });
});
