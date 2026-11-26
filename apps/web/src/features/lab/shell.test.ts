import { describe, expect, it } from 'vitest';
import type { GenPlan } from './generate';
import { assemblePage, checkCore, slidersOf } from './shell';
import { capOf } from './toolCaps';

const plan: GenPlan = {
  title: '双纽线：到两焦点距离之积为定值',
  tool: 'GeoGebra',
  whyTool: '几何轨迹可拖可量',
  see: '拖动 P 时 |PF₁|·|PF₂| 始终等于 a²',
  controls: [{ name: 'a（半焦距）', effect: '曲线随 a 缩放', key: 'a', min: 0.5, max: 4, step: 0.1, value: 2, unit: '' }],
  steps: [],
  facts: [{ claim: '双纽线是卡西尼卵形线的特例', source: '无来源，待核对' }],
  caveat: '示意图，非真实比例',
  explain: ['你看到的是一条横放的“8”字。', '它上面的点到两个焦点的距离之积是常数。'],
};

const CORE = `const api = await new Promise((res) => new GGBApplet({ appName: 'graphing', appletOnLoad: res }, true).inject('v-stage'));
vein.onDraw((p) => { api.evalCommand('SetValue(a,' + p.a + ')'); });`;

describe('slidersOf：控件 → 滑块规格', () => {
  it('模型没给数值范围时给可用默认，value 夹进范围', () => {
    const s = slidersOf([{ name: '强度', effect: '变亮' }])[0]!;
    expect(s.key).toBe('c0');
    expect(s.min).toBe(0);
    expect(s.max).toBe(10);
    expect(s.step).toBeGreaterThan(0);
    expect(s.value).toBeGreaterThanOrEqual(s.min);
    expect(s.value).toBeLessThanOrEqual(s.max);
  });
  it('key 不合法按序号编，重复的 key 不撞', () => {
    const s = slidersOf([
      { name: '一', effect: '', key: 'a b' },
      { name: '二', effect: '', key: 'x' },
      { name: '三', effect: '', key: 'x' },
    ]);
    expect(s.map((x) => x.key)).toEqual(['c0', 'x', 'x_2']);
  });
  it('max 不大于 min 时修正；value 越界夹回', () => {
    const s = slidersOf([{ name: 'n', effect: '', key: 'n', min: 5, max: 1, value: 99 }])[0]!;
    expect(s.max).toBeGreaterThan(s.min);
    expect(s.value).toBeLessThanOrEqual(s.max);
  });
});

describe('assemblePage：程序生成整页，模型只写核心', () => {
  const html = assemblePage(plan, capOf('GeoGebra')!, CORE, 'zh');
  it('加载工具的库与 KaTeX，核心在 module script 里', () => {
    expect(html).toContain('<script src="https://www.geogebra.org/apps/deployggb.js"></script>');
    expect(html).toContain('katex.min.js');
    expect(html).toContain('katex.min.css');
    expect(html).toContain(`<script type="module">\n${CORE}\n</script>`);
  });
  it('控件、阐释、caveat、事实都由壳渲染', () => {
    expect(html).toContain('id="v-a"');
    expect(html).toContain('data-key="a"');
    expect(html).toContain('曲线随 a 缩放');
    expect(html).toContain('横放的“8”字');
    expect(html).toContain('示意图，非真实比例');
    expect(html).toContain('卡西尼卵形线');
  });
  it('veinReady 有兜底、明暗两套主题、窄屏单列、减少动态', () => {
    expect(html).toContain('window.veinReady=window.veinReady||function(){}');
    expect(html).toContain('prefers-color-scheme:dark');
    expect(html).toContain('max-width:880px');
    expect(html).toContain('prefers-reduced-motion:reduce');
  });
  it('标题与正文里的 HTML 被转义，进不了页面结构', () => {
    const evil = assemblePage({ ...plan, title: '<script>x</script>', explain: ['<img onerror=alert(1)>'] }, capOf('GeoGebra')!, CORE, 'zh');
    expect(evil).not.toContain('<script>x</script>');
    expect(evil).not.toContain('<img onerror');
    expect(evil).toContain('&lt;script&gt;');
  });
  it('没有控件时不渲染滑块，也不因找不到重置按钮而报错', () => {
    const noCtl = assemblePage({ ...plan, controls: [] }, capOf('GeoGebra')!, CORE, 'zh');
    expect(noCtl).not.toContain('type="range"');
    expect(noCtl).toContain('if(resetBtn)');
  });
  it('Three.js 走 importmap，模块地址不当普通脚本加载', () => {
    const three = assemblePage({ ...plan, tool: 'Three.js' }, capOf('Three.js')!, 'vein.onDraw(()=>{});', 'zh');
    expect(three).toContain('"three/addons/":"https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"');
    expect(three).not.toContain('<script src="https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js">');
    expect(three).not.toContain('<script src="https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/controls/OrbitControls.js">');
  });
  it('英文界面用英文标签', () => {
    const en = assemblePage(plan, capOf('GeoGebra')!, CORE, 'en');
    expect(en).toContain('Try changing');
    expect(en).toContain('lang="en"');
  });
  it('有步骤时渲染上一步/下一步', () => {
    const stepped = assemblePage({ ...plan, steps: [{ title: '定焦点', what: '两点出现' }] }, capOf('GeoGebra')!, CORE, 'zh');
    expect(stepped).toContain('id="v-prev"');
    expect(stepped).toContain('id="v-next"');
    expect(stepped).toContain('定焦点');
  });
});

describe('checkCore：运行前的确定性核对', () => {
  const cap = capOf('GeoGebra')!;
  it('合格的核心没有问题', () => {
    expect(checkCore(CORE, cap)).toEqual([]);
  });
  it('没注册重画、空代码、</script>、存储、弹窗都报', () => {
    expect(checkCore('const x = 1;', cap).join()).toContain('vein.onDraw');
    expect(checkCore('', cap).join()).toContain('没有给出');
    expect(checkCore('vein.onDraw(()=>{}); // </script>', cap).join()).toContain('</script>');
    expect(checkCore('localStorage.setItem("a","1"); vein.onDraw(()=>{});', cap).join()).toContain('存储');
    expect(checkCore('alert(1); vein.onDraw(()=>{});', cap).join()).toContain('alert');
  });
  it('只放行工具库与 KaTeX 的地址', () => {
    expect(checkCore('fetch("https://evil.example/x"); vein.onDraw(()=>{});', cap).join()).toContain('不允许的地址');
    expect(checkCore('const u = "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"; vein.onDraw(()=>{});', cap)).toEqual([]);
  });
  it('超过 60 KB 报太大', () => {
    expect(checkCore('vein.onDraw(()=>{});' + ' '.repeat(60_000), cap).join()).toContain('太大');
  });
});