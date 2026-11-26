import { describe, expect, it } from 'vitest';
import { checkHtml, checkPlan, fenced, wrapHtml } from './generate';
import { capOf, resolveTool, PHET_SIMS } from './toolCaps';

const plan = (o: Record<string, unknown>) => ({ title: 't', see: '看见残差与列空间垂直', controls: [{ name: 'b', effect: 'e' }], steps: [], facts: [], caveat: '', explain: ['p'], ...o });

describe('工具能力表', () => {
  it('要第三方授权的工具换成浏览器工具，并给出原因', () => {
    const r = resolveTool('Desmos');
    expect(r.cap?.name).toBe('JSXGraph');
    expect(r.substituted?.why).toMatch(/API key/);
    expect(resolveTool('Manim').cap?.tier).toBe('local');
    expect(resolveTool(null).cap).toBeNull();
  });
  it('每个浏览器工具的库地址都钉了版本或是官方固定入口', () => {
    for (const n of ['Three.js', 'Plotly', 'D3.js', 'Matter.js', '3Dmol.js', 'JSXGraph', 'Matplotlib']) {
      for (const l of capOf(n)!.libs!) expect(l, n).toMatch(/@\d|\/v\d/);
    }
  });
});

describe('计划核对', () => {
  it('用户点名的工具不让模型改', () => {
    expect(checkPlan(plan({ tool: 'Plotly' }), 'GeoGebra').tool).toBe('GeoGebra');
  });
  it('自动选择时挑了清单外的工具，退回 D3.js 而不是失败', () => {
    expect(checkPlan(plan({ tool: 'Unity' }), null).tool).toBe('D3.js');
  });
  it('PhET 只能从核实过的清单里挑，编造的名字直接拒绝', () => {
    expect(checkPlan(plan({ tool: 'PhET', phet: PHET_SIMS[0] }), null).phet).toBe(PHET_SIMS[0]);
    expect(() => checkPlan(plan({ tool: 'PhET', phet: 'quantum-magic-lab' }), null)).toThrow(/不在核实过的清单/);
  });
  it('没写「读者会看见什么」的计划不能用；没写出处的事实标「无来源，待核对」', () => {
    expect(() => checkPlan(plan({ tool: 'D3.js', see: '' }), null)).toThrow();
    expect(checkPlan(plan({ tool: 'D3.js', facts: [{ claim: 'c' }] }), null).facts[0]!.source).toBe('无来源，待核对');
  });
});

describe('代码与沙箱', () => {
  it('取 html 代码块；续写拼回来、没有收尾 ``` 的也能取', () => {
    expect(fenced('说明\n```html\n<html></html>\n```', 'html')).toBe('<html></html>');
    expect(fenced('说明\n```html\n<!doctype html><html><body>x', 'html')).toBe('<!doctype html><html><body>x');
  });
  it('检查越权地址、存储与 veinReady', () => {
    const cap = capOf('Plotly')!;
    const ok = `<html><head><script src="${cap.libs![0]}"></script></head><body><script>window.veinReady()</script></body></html>`;
    expect(checkHtml(ok, cap)).toEqual([]);
    const bad = ok.replace('</body>', '<script src="https://evil.example/x.js"></script><script>localStorage.x=1</script></body>').replace('window.veinReady()', '');
    const issues = checkHtml(bad, cap).join('\n');
    expect(issues).toMatch(/evil\.example/);
    expect(issues).toMatch(/浏览器存储/);
    expect(issues).toMatch(/veinReady/);
  });
  it('外壳把内容安全策略与报告脚本放在页面最前面', () => {
    const w = wrapHtml('<!doctype html><html><head><title>x</title></head><body></body></html>');
    expect(w.indexOf('Content-Security-Policy')).toBeLessThan(w.indexOf('<title>'));
    expect(w).toContain("default-src 'none'");
    expect(w).toContain('veinReady');
    expect(wrapHtml('<div>x</div>')).toMatch(/^<!doctype html><html><head>/);
  });
});
