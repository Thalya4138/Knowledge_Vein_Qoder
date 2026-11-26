import { describe, expect, it } from 'vitest';
import { memoryStore } from '../../store/memoryStore';
import type { Workspace } from '../../store/types';
import { applyChanges, diffLines, touchedPaths, undoChanges, type FileChange } from './changes';

const folderWs: Workspace = { id: 'local:x', name: '课', glyph: '课', origin: 'folder', folders: [] };

describe('diffLines（确定性差异预览）', () => {
  it('完全相同：全是 same', () => {
    expect(diffLines('a\nb', 'a\nb')).toEqual([
      { type: 'same', text: 'a' },
      { type: 'same', text: 'b' },
    ]);
  });
  it('增删行各自标出', () => {
    const d = diffLines('a\nb\nc', 'a\nx\nc');
    expect(d).toContainEqual({ type: 'del', text: 'b' });
    expect(d).toContainEqual({ type: 'add', text: 'x' });
    expect(d.filter((l) => l.type === 'same').map((l) => l.text)).toEqual(['a', 'c']);
  });
  it('超大文件退化为整段删+整段增，不做 O(n·m)', () => {
    const big = Array.from({ length: 700 }, (_, i) => `l${i}`).join('\n');
    const d = diffLines(big, big + '\nextra');
    expect(d.every((l) => l.type !== 'same')).toBe(true);
  });
});

describe('applyChanges / undoChanges（写入闸门）', () => {
  it('新建：落盘并留下 before=null 的反向快照', async () => {
    const { store, data } = memoryStore({}, 'folder');
    const changes: FileChange[] = [{ op: 'create', path: 'notes/a.md', content: '# A\n', reason: '新建讲义' }];
    const { applied } = await applyChanges(store, folderWs, changes);
    expect(data.get('notes/a.md')).toBe('# A\n');
    expect(applied).toEqual([{ path: 'notes/a.md', before: null }]);
  });

  it('修改：抓旧内容，撤销后写回旧内容', async () => {
    const { store, data } = memoryStore({ 'notes/a.md': 'old\n' }, 'folder');
    const { applied } = await applyChanges(store, folderWs, [{ op: 'update', path: 'notes/a.md', content: 'new\n', reason: '补一句' }]);
    expect(data.get('notes/a.md')).toBe('new\n');
    expect(applied[0]!.before).toBe('old\n');
    await undoChanges(store, folderWs, applied);
    expect(data.get('notes/a.md')).toBe('old\n');
  });

  it('撤销新建＝删除文件', async () => {
    const { store, data } = memoryStore({}, 'folder');
    const { applied } = await applyChanges(store, folderWs, [{ op: 'create', path: 'notes/a.md', content: 'x', reason: '' }]);
    await undoChanges(store, folderWs, applied);
    expect(data.has('notes/a.md')).toBe(false);
  });

  it('改名：新路径出现、旧路径消失；撤销复原', async () => {
    const { store, data } = memoryStore({ 'materials/raw.md': 'body\n' }, 'folder');
    const { applied } = await applyChanges(store, folderWs, [{ op: 'rename', from: 'materials/raw.md', to: 'materials/第一讲.md', reason: '人能看懂的名字' }]);
    expect(data.get('materials/第一讲.md')).toBe('body\n');
    expect(data.has('materials/raw.md')).toBe(false);
    await undoChanges(store, folderWs, applied);
    expect(data.get('materials/raw.md')).toBe('body\n');
    expect(data.has('materials/第一讲.md')).toBe(false);
  });

  it('改名一个不存在的文件：报错，不写任何东西', async () => {
    const { store, data } = memoryStore({}, 'folder');
    await expect(applyChanges(store, folderWs, [{ op: 'rename', from: 'no.md', to: 'yes.md', reason: '' }])).rejects.toThrow('不存在');
    expect(data.size).toBe(0);
  });

  it('多条提案一起撤销，倒序恢复', async () => {
    const { store, data } = memoryStore({ 'notes/a.md': 'A0\n' }, 'folder');
    const { applied } = await applyChanges(store, folderWs, [
      { op: 'update', path: 'notes/a.md', content: 'A1\n', reason: '' },
      { op: 'create', path: 'notes/b.md', content: 'B\n', reason: '' },
    ]);
    await undoChanges(store, folderWs, applied);
    expect(data.get('notes/a.md')).toBe('A0\n');
    expect(data.has('notes/b.md')).toBe(false);
  });
});

describe('touchedPaths', () => {
  it('去重，改名涉及两个路径', () => {
    expect(
      touchedPaths([
        { op: 'update', path: 'a.md', content: '', reason: '' },
        { op: 'update', path: 'a.md', content: '', reason: '' },
        { op: 'rename', from: 'b.md', to: 'c.md', reason: '' },
      ]),
    ).toEqual(['a.md', 'b.md', 'c.md']);
  });
});