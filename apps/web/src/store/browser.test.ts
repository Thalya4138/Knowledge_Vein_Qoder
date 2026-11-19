import { describe, expect, it } from 'vitest';
import { browserNoteDraft, makeBrowserWorkspace } from './browser';

describe('浏览器工作区', () => {
  it('新建空白工作区不伪造知识图谱或讲义', () => {
    const ws = makeBrowserWorkspace('我的课程', 'browser:test');
    expect(ws).toEqual({ id: 'browser:test', name: '我的课程', glyph: '我', origin: 'browser', folders: [] });
  });

  it('新建笔记使用同一工作区 id，并可重复打开同名笔记', () => {
    const ws = makeBrowserWorkspace('我的课程', 'browser:test');
    const draft = browserNoteDraft(ws, '  第一讲.md  ');
    expect(draft.file.id).toBe('browser:test/notes/第一讲.md');
    expect(draft.record.wsId).toBe('browser:test');
    expect(draft.workspace.folders[0]?.files).toEqual([draft.file]);
    const again = browserNoteDraft(draft.workspace, '第一讲');
    expect(again.workspace.folders[0]?.files).toHaveLength(1);
  });
});
