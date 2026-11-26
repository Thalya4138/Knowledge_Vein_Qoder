import { describe, expect, it } from 'vitest';
import { memoryStore } from '../../store/memoryStore';
import { DESK_HISTORY_PATH, deskUid, loadDeskHistory, saveDeskHistory, upsertTurn, type DeskTurn } from './deskHistory';

const turn = (q: string, at: number): DeskTurn => ({ id: deskUid(), q, a: `答:${q}`, at, origin: 'ask' });

describe('deskHistory（对话历史落 .vein/desk/）', () => {
  it('没有历史时返回空数组，不抛错', async () => {
    const { store } = memoryStore({}, 'folder');
    expect(await loadDeskHistory(store)).toEqual([]);
  });

  it('存进工作区文件，刷新（重新读）后还在，按时间倒序', async () => {
    const { store, data } = memoryStore({}, 'folder');
    await saveDeskHistory(store, [turn('旧', 1), turn('新', 2)]);
    expect(data.has(DESK_HISTORY_PATH)).toBe(true);
    const back = await loadDeskHistory(store);
    expect(back.map((t) => t.q)).toEqual(['新', '旧']);
  });

  it('坏数据被过滤，不冒充历史', async () => {
    const { store } = memoryStore({ [DESK_HISTORY_PATH]: JSON.stringify([{ q: 'ok', a: 'x', at: 1 }, { nope: 1 }, null]) }, 'folder');
    expect(await loadDeskHistory(store)).toHaveLength(1);
  });

  it('同一问只留一条，再问提到最前', () => {
    const all = [turn('甲', 1), turn('乙', 2)];
    const next = upsertTurn(all, turn('甲', 3));
    expect(next.map((t) => t.q)).toEqual(['甲', '乙']);
    expect(next[0]!.at).toBe(3);
  });
});