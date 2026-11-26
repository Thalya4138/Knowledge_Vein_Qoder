import { describe, expect, it } from 'vitest';
import { parseRewrite, replaceSelection, rewriteChanges } from './deskRewrite';

describe('deskRewrite · 改写选中段落', () => {
  it('parseRewrite：缺 after 视为 decline，risk 缺省补上', () => {
    expect(parseRewrite({ status: 'ok', after: '新段落' })).toMatchObject({ status: 'ok', after: '新段落', risk: '中' });
    expect(parseRewrite({ status: 'ok', after: '' }).status).toBe('decline');
    expect(parseRewrite({ status: 'decline', reason: '做不到' }).status).toBe('decline');
    expect(parseRewrite(null).status).toBe('decline');
  });

  it('replaceSelection 只换第一处精确匹配，保留前后文', () => {
    const note = '前文。\n\n要改的段落。\n\n后文。';
    const out = replaceSelection(note, '要改的段落。', '改好的段落。');
    expect(out).toBe('前文。\n\n改好的段落。\n\n后文。');
  });

  it('replaceSelection 找不到返回 null，不瞎改', () => {
    expect(replaceSelection('abc', '不存在', 'x')).toBeNull();
    expect(replaceSelection('abc', '', 'x')).toBeNull();
  });

  it('replaceSelection 容忍选中文字两端多余空白', () => {
    expect(replaceSelection('a 目标 b', ' 目标 ', 'X')).toBe('aXb');
  });

  it('rewriteChanges 产出一条 update 提案', () => {
    const cs = rewriteChanges('notes/a.md', '新全文', '讲得更通俗');
    expect(cs.changes[0]).toMatchObject({ op: 'update', path: 'notes/a.md', content: '新全文', reason: '讲得更通俗' });
  });
});