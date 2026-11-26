import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { memoryStore } from '../../store/memoryStore';
import type { Workspace } from '../../store/types';
import { EMPTY_MEMORY, LEGACY_MEMORY_KEY, loadMaps, mapWriter, MEMORY_PATH, MIND_PATH } from './maps';
import { blankDoc, MIND_DOC_KEY, seedDoc, serialize } from './mindDoc';

const legacy = (items: Record<string, string>) => {
  const m = new Map(Object.entries(items));
  return { getItem: (k: string) => m.get(k) ?? null, removeItem: (k: string) => void m.delete(k), m };
};

const demoWs: Workspace = { id: 'linear-algebra', name: '线性代数', glyph: '线', origin: 'demo', folders: [] };
const folderWs: Workspace = { id: 'local:力学', name: '力学', glyph: '力', origin: 'folder', folders: [] };

describe('maps/ 读写（R2-L L3）', () => {
  it('新工作区没有导图：返回 null，不拿示例冒充', async () => {
    const { store } = memoryStore({ 'notes/a.md': '# A' });
    const maps = await loadMaps(store, folderWs, legacy({}));
    expect(maps.mind).toBeNull();
    expect(maps.graph).toBeNull();
    expect(maps.knowledge.relations).toEqual([]);
    expect(maps.memory).toEqual(EMPTY_MEMORY);
  });

  it('读回已存的导图，并带上工作区自己的 graph.json', async () => {
    const graph = {
      nodes: [{ id: 'n.a', kind: 'concept', title: '应力', aliases: ['应力张量'] }],
      relations: [{ id: 'r1', from: 'n.a', to: 'n.a', type: 'prerequisite', status: 'accepted', explanation: 'e', assumptions: ['小变形'], epistemic: 'source-backed' }],
    };
    const { store } = memoryStore({ [MIND_PATH]: serialize(blankDoc('力学')), 'graph.json': JSON.stringify(graph) });
    const maps = await loadMaps(store, folderWs, legacy({}));
    expect(maps.mind?.title).toBe('力学');
    expect(maps.knowledge.info('n.a')?.aliases).toEqual(['应力张量']);
    expect(maps.knowledge.relations).toHaveLength(1);
  });

  it('文件夹里的 mind.json 不是导图格式时报错，不覆盖用户文件', async () => {
    const { store } = memoryStore({ [MIND_PATH]: '{"hello":1}' });
    await expect(loadMaps(store, folderWs, legacy({}))).rejects.toThrow('不是知脉的导图格式');
  });

  it('示例工作区：旧 localStorage 的导图与练习一次性搬进 maps/，搬完删旧键', async () => {
    const doc = seedDoc();
    doc.title = '我改过的线代';
    const old = legacy({ [MIND_DOC_KEY]: serialize(doc), [LEGACY_MEMORY_KEY]: JSON.stringify({ blanks: ['x'] }) });
    const { store, data } = memoryStore({}, 'demo');
    const maps = await loadMaps(store, demoWs, old);
    expect(maps.mind?.title).toBe('我改过的线代');
    expect(maps.fresh).toBe(false);
    expect(maps.memory.blanks).toEqual(['x']);
    expect(JSON.parse(data.get(MIND_PATH)!).title).toBe('我改过的线代');
    expect(data.has(MEMORY_PATH)).toBe(true);
    expect(old.m.size).toBe(0);
  });

  it('示例工作区第一次打开：用示例导图，标记为 fresh，但不提前写文件', async () => {
    const { store, data } = memoryStore({}, 'demo');
    const maps = await loadMaps(store, demoWs, legacy({}));
    expect(maps.mind?.root.kids).toHaveLength(4);
    expect(maps.fresh).toBe(true);
    expect(data.size).toBe(0);
  });

  it('本地文件夹工作区：导图直接写进文件夹，后写覆盖先写', async () => {
    const { store, data } = memoryStore();
    const ws: Workspace = { id: 'browser:x', name: '课', glyph: '课', origin: 'folder', folders: [] };
    const seen: Workspace[] = [];
    const write = mapWriter(store, ws, MIND_PATH, (w) => seen.push(w));
    await write('{"a":1}');
    await write('{"a":2}');
    expect(data.get(MIND_PATH)).toBe('{"a":2}');
    expect(seen).toHaveLength(0); // 本地文件夹的文件栏靠重新扫描，不手工登记
  });
});

describe('schemas/map.schema.json', () => {
  const at = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
  const schema = JSON.parse(readFileSync(at('../../../../../schemas/map.schema.json'), 'utf8')) as object;
  const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
  ajv.addSchema(schema);
  const id = 'https://cognitive-atlas.local/schemas/map.schema.json';
  const mind = ajv.getSchema(`${id}#/$defs/mind`)!;
  const memory = ajv.getSchema(`${id}#/$defs/memory`)!;

  it('示例导图、空白导图与练习状态都符合 schema', () => {
    expect(mind(JSON.parse(serialize(seedDoc()))), JSON.stringify(mind.errors)).toBe(true);
    expect(mind(blankDoc('力学'))).toBe(true);
    expect(memory(EMPTY_MEMORY)).toBe(true);
  });

  it('缺 root 的不是导图', () => {
    expect(mind({ version: 2, title: 'x', links: [], view: {}, seq: 0 })).toBe(false);
  });
});
