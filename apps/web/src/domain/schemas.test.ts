import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

/** QUALITY_GATES A13：schema 与样例数据必须一致，字段名不许漂移。 */

const at = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const json = (rel: string) => JSON.parse(readFileSync(at(rel), 'utf8')) as unknown;

const SCHEMAS = {
  kb: '../../../../schemas/kb.schema.json',
  graph: '../../../../schemas/graph.schema.json',
  manifest: '../../../../schemas/manifest.schema.json',
  layout: '../../../../schemas/layout.schema.json',
  evidence: '../../../../schemas/evidence.schema.json',
} as const;

function compile(name: keyof typeof SCHEMAS): ValidateFunction {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const schema = json(SCHEMAS[name]);
  const validate = ajv.compile(schema as object);
  if (ajv.errors) throw new Error(`${name}.schema.json 自身不合法：${JSON.stringify(ajv.errors)}`);
  return validate;
}

function expectOk(validate: ValidateFunction, data: unknown, label: string) {
  const ok = validate(data);
  if (!ok) {
    const detail = (validate.errors ?? [])
      .map((e) => `  · ${e.instancePath || '(root)'} ${e.message} ${e.params ? JSON.stringify(e.params) : ''}`)
      .join('\n');
    throw new Error(`${label} 未通过 schema 校验：\n${detail}`);
  }
  expect(ok).toBe(true);
}

describe('schema 与样例数据一致', () => {
  it('kb.json ↔ kb.schema.json', () => {
    expectOk(compile('kb'), json('../../../../content/demo/linear-algebra/kb.json'), 'kb.json');
  });

  it('graph.json ↔ graph.schema.json', () => {
    expectOk(compile('graph'), json('../../../../content/demo/linear-algebra/graph.json'), 'graph.json');
  });

  it('manifest.json ↔ manifest.schema.json', () => {
    expectOk(compile('manifest'), json('../../../../content/demo/linear-algebra/resources/manifest.json'), 'manifest.json');
  });

  for (const view of ['structure', 'logic', 'personal']) {
    it(`layouts/${view}.json ↔ layout.schema.json`, () => {
      expectOk(compile('layout'), json(`../../../../content/demo/linear-algebra/layouts/${view}.json`), `layouts/${view}.json`);
    });
  }

  it('evidence/learning.json ↔ evidence.schema.json', () => {
    expectOk(compile('evidence'), json('../../../../content/demo/linear-algebra/evidence/learning.json'), 'evidence/learning.json');
  });
});

describe('schema 会咬人（负向）', () => {
  const layout = compile('layout');

  it('手绘边出现在结构视图 → 拒绝', () => {
    const bad = {
      schemaVersion: '1.0',
      id: 'layout.structure',
      kbId: 'kb.demo',
      viewType: 'structure',
      positions: { 'n.a': { x: 0, y: 0 } },
      layers: [{ layer: 0, label: 'L', nodeIds: ['n.a'] }],
      personalEdges: [{ id: 'pe.1', from: 'n.a', to: 'n.a', label: 'x' }],
    };
    expect(layout(bad)).toBe(false);
  });

  it('手绘边没有可见标签 → 拒绝（meaning 缺失反而允许，ADR-0006）', () => {
    const noLabel = {
      schemaVersion: '1.0',
      id: 'layout.personal',
      kbId: 'kb.demo',
      viewType: 'personal',
      positions: { 'n.a': { x: 0, y: 0 } },
      personalEdges: [{ id: 'pe.1', from: 'n.a', to: 'n.a' }],
    };
    expect(layout(noLabel)).toBe(false);

    const noMeaning = {
      schemaVersion: '1.0',
      id: 'layout.personal',
      kbId: 'kb.demo',
      viewType: 'personal',
      positions: { 'n.a': { x: 0, y: 0 } },
      personalEdges: [{ id: 'pe.1', from: 'n.a', to: 'n.a', label: '先几何后代数' }],
    };
    expect(layout(noMeaning)).toBe(true);
  });

  it('逻辑视图缺一个 epistemic 线型 → 拒绝', () => {
    const data = json('../../../../content/demo/linear-algebra/layouts/logic.json') as {
      edgeStyle: Record<string, unknown>;
    };
    delete data.edgeStyle.analogy;
    expect(layout(data)).toBe(false);
  });

  it('学习证据把 apply 漏掉 → 拒绝', () => {
    const data = json('../../../../content/demo/linear-algebra/evidence/learning.json') as {
      evidence: { score: Record<string, unknown> }[];
    };
    delete data.evidence[0]!.score.apply;
    expect(compile('evidence')(data)).toBe(false);
  });
});
