import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { candidateToResource, lessonChanges, mergeManifest, parseCandidates, parseDraft, sampleCandidates, sampleLesson } from './deskLesson';

const at = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const schema = JSON.parse(readFileSync(at('../../../../../schemas/manifest.schema.json'), 'utf8')) as object;
const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
const validate = ajv.compile(schema);

describe('deskLesson · 资源发现与讲义生成', () => {
  it('parseCandidates 丢掉缺题名或 uri 的候选，许可缺失写待核对，status 一律 candidate', () => {
    const { candidates, stillMissing } = parseCandidates({
      candidates: [
        { title: 'MIT 18.06', uri: 'https://ocw.mit.edu/x', kind: 'video-course', license: 'CC BY-NC-SA 4.0', limitations: 'NC' },
        { title: '没有地址' },
        { uri: 'https://x.com', title: '没有许可', kind: '不存在的类型' },
      ],
      stillMissing: ['缺定义'],
    });
    expect(candidates).toHaveLength(2);
    expect(candidates[0]!.id).toMatch(/^res\./);
    expect(candidates[1]!.license).toBe('待核对');
    expect(candidates[1]!.kind).toBe('web');
    expect(candidates[1]!.limitations).toContain('自行核对');
    expect(stillMissing).toEqual(['缺定义']);
  });

  it('candidateToResource：origin=discovered，status=candidate，note 含局限', () => {
    const c = parseCandidates({ candidates: [{ title: 'T', uri: 'https://x.com', limitations: 'NC 许可' }] }).candidates[0]!;
    const r = candidateToResource(c);
    expect(r.origin).toBe('discovered');
    expect(r.status).toBe('candidate');
    expect(r.note).toContain('NC 许可');
  });

  it('mergeManifest 按 id 与 uri 去重，保留 spans，且符合 manifest schema', () => {
    const adopted = sampleCandidates().candidates;
    const first = mergeManifest(null, adopted, 'kb.x');
    expect(first.resources).toHaveLength(2);
    expect(validate(first), JSON.stringify(validate.errors)).toBe(true);
    // 再并一次同样的候选不重复；uri 相同但 id 不同也不重复
    const again = mergeManifest(first, [...adopted, { ...adopted[0]!, id: 'res.discovered.别名' }], 'kb.x');
    expect(again.resources).toHaveLength(2);
    expect(validate(again)).toBe(true);
  });

  it('mergeManifest 保留读者已登记的资源与 spans', () => {
    const existing = { schemaVersion: '1.1', kbId: 'kb.x', resources: [candidateToResource(sampleCandidates().candidates[0]!)], spans: [{ id: 's.1', resourceId: 'res.discovered.mit1806sc-l15', locator: { type: 'page', value: '1' } }] };
    const merged = mergeManifest(existing, sampleCandidates().candidates, 'kb.x');
    expect(merged.resources).toHaveLength(2);
    expect(merged.spans).toHaveLength(1);
  });

  it('lessonChanges：讲义新建 + 清单登记；已有讲义则更新', () => {
    const adopted = sampleCandidates().candidates;
    const fresh = lessonChanges('notes/新课.md', '# 新课', false, null, adopted, 'kb.x');
    expect(fresh.changes.map((c) => c.op)).toEqual(['create', 'create']);
    const update = lessonChanges('notes/新课.md', '# 新课（改）', true, null, [], 'kb.x');
    expect(update.changes).toHaveLength(1);
    expect(update.changes[0]!.op).toBe('update');
  });

  it('parseDraft 容忍非对象；示例讲义非空且是教材体', () => {
    expect(parseDraft(null).markdown).toBe('');
    expect(parseDraft({ status: 'insufficient' }).status).toBe('insufficient');
    const md = sampleLesson();
    expect(md.length).toBeGreaterThan(500);
    expect(md).toContain('[!');
  });
});