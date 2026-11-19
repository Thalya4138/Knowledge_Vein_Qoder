import { describe, expect, it } from 'vitest';
import { buildDrawerModel, type Manifest } from './resources';
import { demoManifest } from '../app/demo';

const BASE = '/demo/linear-algebra';
const model = (id: string) => buildDrawerModel(id, demoManifest, BASE)!;

describe('资源抽屉模型（QUALITY_GATES §2.5 的确定性部分）', () => {
  it('视频：逐句时间戳、定位起点句高亮、深链带起始秒数，无内嵌播放器', () => {
    const m = model('s.l15-normal');
    expect(m.kindLabel).toBe('视频');
    expect(m.loc).toBe('25:12 – 27:59');
    expect(m.quote.length).toBeGreaterThan(1);
    expect(m.quote[0]).toMatchObject({ ts: '25:12', mark: true });
    expect(m.quote.filter((p) => p.mark).map((p) => p.ts)).toEqual(['25:12']);
    expect(m.actions[0]).toMatchObject({ primary: true });
    expect(m.actions[0]!.href).toBe('https://www.youtube.com/watch?v=Y_Ac6KiQ1t0&t=1512s');
    expect(m.actions[0]!.label).toContain('25:12');
    expect(m.pdfPreview).toBeUndefined();
  });

  it('PDF：抽屉内嵌预览定位到对应页，主按钮打开本地副本同页', () => {
    const m = model('s.ocw-ses22-p2');
    expect(m.loc).toBe('第 2 页');
    expect(m.pdfPreview).toBe(`${BASE}/resources/files/MIT18_06SCF11_Ses2.2sum.pdf#page=2&view=FitH`);
    expect(m.actions[0]!.href).toContain('#page=2');
    expect(m.actions[1]!.href).toContain('ocw.mit.edu');
    expect(m.quote.at(-1)?.mark).toBe(true);
  });

  it('网页：文本片段锚指向的句子高亮，深链保留 :~:text=', () => {
    const m = model('s.wiki-lls-projection');
    expect(m.actions[0]!.href).toContain(':~:text=');
    const marked = m.quote.filter((p) => p.mark);
    expect(marked).toHaveLength(1);
    expect(marked[0]!.text).toBe('represents orthogonal projection onto the column space');
  });

  it('unavailable：显示「位置待核对」，不得退化成只到资源主页的链接', () => {
    const manifest: Manifest = {
      resources: [{ id: 'r1', kind: 'web', title: '某网页', uri: 'https://example.com/home' }],
      spans: [{ id: 's1', resourceId: 'r1', locator: { type: 'unavailable', value: '' }, quote: '一句话', why: '理由' }],
    };
    const m = buildDrawerModel('s1', manifest, BASE)!;
    expect(m.unavailable).toBe(true);
    expect(m.loc).toBe('位置待核对');
    expect(m.actions).toEqual([]);
    expect(m.why).toBe('理由');
  });

  it('span 或资源不存在时返回 undefined（卡片降级为待核对）', () => {
    expect(buildDrawerModel('s.nope', demoManifest, BASE)).toBeUndefined();
  });
});
