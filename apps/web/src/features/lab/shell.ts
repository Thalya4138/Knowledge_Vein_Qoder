import type { GenPlan } from './generate';
import type { ToolCap } from './toolCaps';
import { SHARED_LIBS } from './toolCaps';

/**
 * 确定性模板壳（接龙 #77）：整张 HTML 由程序生成——布局、明暗主题、阐释栏、控件、步骤、
 * 沙箱契约与 veinReady 都不再赌模型记得。模型只写一段画图核心 JS（vein.onDraw 注册重画函数），
 * 程序把它装进壳里。简单概念的核心只有一两 KB，大任务的全部输出额度都花在真正有内容的部分。
 *
 * 核心代码的契约（prompts/VISUALIZE.md §4 写给模型）：
 * - 在一个 module script 里运行，可用的库已按 toolCaps 加载（Three.js 走 importmap）；
 * - 调 vein.onDraw((params, step) => {...}) 注册重画；参数或步骤变了程序就调它；
 * - 只往 vein.stage 里画；控件、阐释、标题、caveat 都由壳负责；
 * - 首次重画成功后程序自动调 window.veinReady()，加载期用 vein.loading(true, '正在加载……')。
 */

export interface Slider {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  unit: string;
  effect: string;
}

type ControlSpec = GenPlan['controls'][number];

const KEY_RE = /^[A-Za-z][A-Za-z0-9_]*$/;

/** 计划里的控件 → 滑块规格：模型没给数值范围时给可用的默认，key 不合法就按序号编 */
export function slidersOf(controls: readonly ControlSpec[]): Slider[] {
  const used = new Set<string>();
  return controls.slice(0, 4).map((c, i) => {
    let key = typeof c.key === 'string' && KEY_RE.test(c.key) ? c.key : `c${i}`;
    while (used.has(key)) key = `${key}_${i}`;
    used.add(key);
    const min = Number.isFinite(c.min) ? (c.min as number) : 0;
    const max = Number.isFinite(c.max) && (c.max as number) > min ? (c.max as number) : min + 10;
    const step = Number.isFinite(c.step) && (c.step as number) > 0 ? (c.step as number) : (max - min) / 100;
    const raw = Number.isFinite(c.value) ? (c.value as number) : (min + max) / 2;
    return { key, label: c.name, min, max, step, value: Math.min(max, Math.max(min, raw)), unit: typeof c.unit === 'string' ? c.unit : '', effect: c.effect };
  });
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 核心代码运行前的确定性检查：只报真正会让页面跑不起来或越权的问题 */
export function checkCore(core: string, cap: ToolCap): string[] {
  const issues: string[] = [];
  if (!core.trim()) issues.push('没有给出画图代码。');
  if (core.length > 60_000) issues.push(`画图代码太大（${Math.round(core.length / 1000)} KB），壳已负责页面其余部分，核心应只写画法。`);
  if (/<\/script/i.test(core)) issues.push('代码里出现了 </script>，会截断页面。');
  if (!/vein\s*\.\s*onDraw\s*\(/.test(core)) issues.push('没有调用 vein.onDraw() 注册重画函数。');
  if (/\b(localStorage|sessionStorage|document\.cookie)\b/.test(core)) issues.push('用了浏览器存储（沙箱里不可用）。');
  if (/\b(alert|confirm|prompt)\s*\(/.test(core)) issues.push('用了 alert / confirm / prompt（沙箱里会被拦下）。');
  const urls = [...core.matchAll(/["'](https?:\/\/[^"']+)["']/g)].map((m) => m[1]!);
  const allowed = [...(cap.libs ?? []), ...SHARED_LIBS];
  for (const u of urls) {
    if (!allowed.some((l) => u.startsWith(l.replace(/\/[^/]+$/, '')) || u === l)) issues.push(`加载了不允许的地址：${u}`);
  }
  return issues;
}

const T = {
  zh: {
    loading: '正在加载……',
    try: '试着改',
    steps: '分步看',
    prev: '上一步',
    next: '下一步',
    facts: '这张图依据的事实',
    noSource: '无来源，待核对',
    err: '画面没有画出来：',
    reset: '重置',
  },
  en: {
    loading: 'Loading…',
    try: 'Try changing',
    steps: 'Step through',
    prev: 'Previous',
    next: 'Next',
    facts: 'Facts this view relies on',
    noSource: 'no source, to verify',
    err: 'The view failed to draw: ',
    reset: 'Reset',
  },
};

/** 计划 + 工具 + 核心代码 → 完整单文件 HTML（未包沙箱外壳，wrapHtml 再包一层） */
export function assemblePage(plan: GenPlan, cap: ToolCap, core: string, lang: 'zh' | 'en'): string {
  const t = T[lang];
  const sliders = slidersOf(plan.controls);
  const libs = [...(cap.libs ?? []), ...SHARED_LIBS];
  const three = cap.name === 'Three.js';
  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(plan.title)}</title>`,
    ...libs.map((l) =>
      /\.css(\?|$)/i.test(l) ? `<link rel="stylesheet" href="${l}">` : three && cap.libs!.includes(l) ? '' : `<script src="${l}"></script>`,
    ),
    three
      ? `<script type="importmap">{"imports":{"three":"${cap.libs![0]}","three/addons/":"${cap.libs![1]!.replace(/controls\/OrbitControls\.js$/, '')}"}}</script>`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const controlsHtml = sliders.length
    ? `<section class="v-controls" aria-label="${t.try}"><h2>${t.try}</h2>${sliders
        .map(
          (s) => `<div class="v-ctl">
<label for="v-${s.key}">${esc(s.label)}<output id="o-${s.key}"></output></label>
<input type="range" id="v-${s.key}" data-key="${s.key}" data-unit="${esc(s.unit)}" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.value}">
<p class="v-effect">${esc(s.effect)}</p>
</div>`,
        )
        .join('')}<button type="button" class="v-reset" id="v-reset">${t.reset}</button></section>`
    : '';

  const stepsHtml = plan.steps.length
    ? `<section class="v-steps" aria-label="${t.steps}"><h2>${t.steps}</h2>
<div class="v-stepbar"><button type="button" id="v-prev">${t.prev}</button><span id="v-stepno" role="status"></span><button type="button" id="v-next">${t.next}</button></div>
<p class="v-stepwhat"><strong id="v-steptitle"></strong><span id="v-stepbody"></span></p></section>`
    : '';

  const explainHtml = plan.explain.map((p, i) => `<p data-i="${i}">${esc(p)}</p>`).join('\n');
  const factsHtml = plan.facts.length
    ? `<details class="v-facts"><summary>${t.facts}（${plan.facts.length}）</summary><ul>${plan.facts
        .map((f) => `<li>${esc(f.claim)} <span class="v-src">— ${esc(f.source || t.noSource)}</span></li>`)
        .join('')}</ul></details>`
    : '';

  const paramsInit = JSON.stringify(Object.fromEntries(sliders.map((s) => [s.key, s.value])));
  const stepsInit = JSON.stringify(plan.steps.map((s) => ({ title: s.title, what: s.what })));

  const boot = `<script>(function(){
'use strict';
var params=${paramsInit},steps=${stepsInit},step=0,draw=null,busy=false,dirty=false,ready=false;
var stage=document.getElementById('v-stage'),loading=document.getElementById('v-loading'),errBox=document.getElementById('v-error');
var paras=[].slice.call(document.querySelectorAll('.v-explain p'));
var inputs=[].slice.call(document.querySelectorAll('.v-controls input[type=range]'));
var fmt=function(v){var n=Number(v);return Math.abs(n)>=1000||Number.isInteger(n)?String(n):n.toFixed(2).replace(/0+$/,'').replace(/\\.$/,'')};
var show=function(id,v){var o=document.getElementById('o-'+id);if(o)o.textContent=v};
var highlight=function(i){paras.forEach(function(p){p.classList.toggle('v-hl',Number(p.dataset.i)===i)})};
var fail=function(e){errBox.textContent=${JSON.stringify(t.err)}+(e&&e.message||String(e));errBox.hidden=false;console.error(e)};
var run=function(){
  if(!draw)return;
  if(busy){dirty=true;return}
  busy=true;dirty=false;
  var r;try{r=draw(Object.assign({},params),step)}catch(e){busy=false;fail(e);return}
  Promise.resolve(r).then(function(){
    busy=false;errBox.hidden=true;
    if(!ready){ready=true;loading.hidden=true;if(window.veinReady)window.veinReady()}
    if(dirty)run();
  },function(e){busy=false;fail(e)});
};
window.veinReady=window.veinReady||function(){};
window.vein={
  stage:stage,params:params,
  get step(){return step},
  onDraw:function(fn){draw=fn;run()},
  loading:function(on,msg){loading.hidden=!on;if(msg)loading.textContent=msg},
  tex:function(s){try{return katex.renderToString(s,{throwOnError:false})}catch(e){return s}}
};
inputs.forEach(function(inp){
  var k=inp.dataset.key;show(k,fmt(params[k])+(inp.dataset.unit||''));
  inp.addEventListener('input',function(){
    params[k]=Number(inp.value);show(k,fmt(inp.value)+(inp.dataset.unit||''));
    if(paras.length===inputs.length)highlight(inputs.indexOf(inp));
    run();
  });
});
var resetBtn=document.getElementById('v-reset');
if(resetBtn)resetBtn.addEventListener('click',function(){
  inputs.forEach(function(inp){inp.value=inp.defaultValue;params[inp.dataset.key]=Number(inp.defaultValue);show(inp.dataset.key,fmt(inp.defaultValue)+(inp.dataset.unit||''))});
  step=0;paintStep();run();
});
var paintStep=function(){
  if(!steps.length)return;
  document.getElementById('v-stepno').textContent=(step+1)+' / '+steps.length;
  document.getElementById('v-steptitle').textContent=steps[step].title;
  document.getElementById('v-stepbody').textContent='：'+steps[step].what;
  document.getElementById('v-prev').disabled=step===0;
  document.getElementById('v-next').disabled=step===steps.length-1;
  highlight(step);
};
if(steps.length){
  document.getElementById('v-prev').addEventListener('click',function(){if(step>0){step--;paintStep();run()}});
  document.getElementById('v-next').addEventListener('click',function(){if(step<steps.length-1){step++;paintStep();run()}});
  paintStep();
}
var rT;window.addEventListener('resize',function(){clearTimeout(rT);rT=setTimeout(run,200)});
})();</script>`;

  const css = `<style>
:root{--paper:#faf9f6;--ink:#1d2433;--ink2:#5a6478;--line:#e3e0d8;--accent:#2f6f5e;--hl:#eef3ee;--stage:#ffffff;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--paper:#161a22;--ink:#e8e6df;--ink2:#9aa3b5;--line:#2c3342;--accent:#7fc4ad;--hl:#202a26;--stage:#1c212b;color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.7 Georgia,'Songti SC','Noto Serif CJK SC',serif}
.v{display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:28px;max-width:1280px;margin:0 auto;padding:24px}
.v-stagewrap{position:relative;min-height:420px;border:1px solid var(--line);border-radius:10px;background:var(--stage);overflow:hidden}
#v-stage{position:absolute;inset:0}
#v-stage>*{max-width:100%}
.v-loading,.v-error{position:absolute;inset:auto 0 0 0;margin:0;padding:10px 16px;font-size:14px;background:var(--paper);border-top:1px solid var(--line)}
.v-error{color:#b3402e;top:0;bottom:auto;border-top:0;border-bottom:1px solid var(--line)}
.v-caveat{position:absolute;top:8px;left:12px;margin:0;font-size:12px;color:var(--ink2);background:var(--paper);padding:2px 8px;border-radius:6px;opacity:.9}
.v-side{min-width:0}
.v-side h1{font-size:22px;line-height:1.4;margin:0 0 8px}
.v-see{margin:0 0 20px;color:var(--ink2)}
.v-side h2{font-size:14px;letter-spacing:.08em;color:var(--ink2);margin:0 0 10px;font-weight:600}
.v-controls{margin-bottom:22px}
.v-ctl{margin-bottom:14px}
.v-ctl label{display:flex;justify-content:space-between;font-size:15px}
.v-ctl output{font-variant-numeric:tabular-nums;color:var(--accent)}
.v-ctl input{width:100%;accent-color:var(--accent);min-height:24px}
.v-effect{margin:2px 0 0;font-size:13px;color:var(--ink2)}
.v-reset,.v-stepbar button{font:inherit;font-size:14px;padding:4px 14px;border:1px solid var(--line);border-radius:8px;background:var(--stage);color:var(--ink);cursor:pointer}
.v-reset:hover,.v-stepbar button:hover:not(:disabled){border-color:var(--accent);color:var(--accent)}
.v-stepbar{display:flex;align-items:center;gap:12px;margin-bottom:8px}
.v-stepbar button:disabled{opacity:.4;cursor:default}
#v-stepno{font-variant-numeric:tabular-nums;font-size:14px;color:var(--ink2)}
.v-stepwhat{margin:0 0 22px;font-size:15px}
.v-explain p{margin:0 0 14px;padding:4px 10px;border-left:3px solid transparent;border-radius:0 6px 6px 0}
.v-explain p.v-hl{background:var(--hl);border-left-color:var(--accent)}
.v-facts{font-size:13px;color:var(--ink2);margin-top:18px}
.v-facts summary{cursor:pointer}
.v-facts ul{padding-left:18px;margin:8px 0}
.v-src{opacity:.8}
button:focus-visible,input:focus-visible,summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
@media (max-width:880px){.v{grid-template-columns:1fr;padding:16px}.v-stagewrap{min-height:340px}}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
</style>`;

  return `<!doctype html>
<html lang="${lang === 'en' ? 'en' : 'zh-CN'}">
<head>
${head}
${css}
</head>
<body>
<main class="v">
<section class="v-stagewrap" aria-label="${esc(plan.title)}">
<div id="v-stage"></div>
<p class="v-loading" id="v-loading" role="status">${t.loading}</p>
<p class="v-error" id="v-error" role="alert" hidden></p>
${plan.caveat ? `<p class="v-caveat">${esc(plan.caveat)}</p>` : ''}
</section>
<aside class="v-side">
<h1>${esc(plan.title)}</h1>
<p class="v-see">${esc(plan.see)}</p>
${controlsHtml}
${stepsHtml}
<div class="v-explain">
${explainHtml}
</div>
${factsHtml}
</aside>
</main>
${boot}
<script type="module">
${core}
</script>
</body>
</html>`;
}