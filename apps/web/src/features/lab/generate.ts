import { chat, extractJson, ModelError } from '../../ai/chat';
import { promptFor } from '../../ai/prompts';
import { readText, writeText } from '../../store/open';
import type { WorkspaceStore } from '../../store/types';
import type { ModelConfig } from '../../ui/prefs';
import type { GraphLike } from '../atlas/mindDoc';
import { gatherContext } from '../connection/exploreAi';
import { ALLOWED_ORIGINS, AUTO_CHOICES, capOf, PHET_SIMS, resolveTool, SHARED_LIBS, type ToolCap } from './toolCaps';

/**
 * 可视化实验室的生成（位置 lab.visualize，提示词 prompts/VISUALIZE.md）。三步，每步一次模型调用：
 *   ① 计划：选工具、要让人看见什么、控件、步骤、事实与出处、阐释（JSON，确定性核对）
 *   ② 写代码：浏览器工具写一张单文件 HTML；本地工具写可运行脚本；PhET 不写代码，由程序嵌入官方模拟
 *   ③ 修复：页面在沙箱里报错或白屏时，把错误原文交回模型修一次（由界面在运行后触发）
 * 结果存进工作区 `.vein/lab/runs/<id>.json`，会话历史指向它，刷新、换电脑（文件夹工作区）都还在。
 */

export interface GenPlan {
  title: string;
  tool: string;
  whyTool: string;
  phet?: string;
  see: string;
  controls: { name: string; effect: string }[];
  steps: { title: string; what: string }[];
  facts: { claim: string; source: string }[];
  caveat: string;
  explain: string[];
}

export type GenStatus = 'running' | 'ok' | 'failed' | 'local';

export interface GenRun {
  id: string;
  q: string;
  /** 用户点名的工具（「自动选择」为 null） */
  requested: string | null;
  /** 实际实现用的工具 */
  tool: string;
  tier: ToolCap['tier'];
  /** 用户点名的工具用不了、换成了别的：写明原因 */
  substitutedWhy?: string;
  plan: GenPlan;
  /** browser：完整 HTML（未包沙箱外壳）；local：脚本；embed：空 */
  code: string;
  lang: string;
  status: GenStatus;
  errors: string[];
  repairs: number;
  at: number;
  model: string;
}

export const RUNS_DIR = '.vein/lab/runs';
export const runPath = (id: string) => `${RUNS_DIR}/${id}.json`;
export const genUid = () => `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export async function saveRun(store: WorkspaceStore, run: GenRun): Promise<void> {
  await writeText(store, runPath(run.id), JSON.stringify(run, null, 2), 'application/json');
}

export async function loadRun(store: WorkspaceStore, id: string): Promise<GenRun | null> {
  if (!/^g[a-z0-9]+$/.test(id)) return null;
  const text = await readText(store, runPath(id));
  if (!text) return null;
  try {
    return JSON.parse(text) as GenRun;
  } catch {
    return null;
  }
}

/* ---------- 拼消息 ---------- */

function toolMenu(requested: string | null): { text: string; cap: ToolCap | null; substitutedWhy?: string } {
  const r = resolveTool(requested);
  if (r.cap) {
    return {
      cap: r.cap,
      substitutedWhy: r.substituted?.why,
      text: `## 工具\n这次只能用：${r.cap.name}${r.substituted ? `（读者选的是 ${r.substituted.name}，${r.substituted.why}）` : ''}。\n`,
    };
  }
  const lines = AUTO_CHOICES.map((n) => `- ${n}：${capOf(n)?.hint ?? ''}`).join('\n');
  return { cap: null, text: `## 工具\n读者没有指定。从下面挑最能让这件事「看得见因果」的一个，原样照抄名字：\n${lines}\n` };
}

const phetList = () => `## 可嵌入的 PhET 模拟（只能从这里挑 id）\n${PHET_SIMS.join('、')}\n`;

function libsFor(cap: ToolCap): string {
  const libs = [...(cap.libs ?? []), ...SHARED_LIBS];
  return `## 可用的库（只能加载这些地址，原样照抄）\n${libs.map((l) => `- ${l}`).join('\n')}\n用法：${cap.hint ?? '无'}\n`;
}

async function contextText(store: WorkspaceStore | null, graph: GraphLike | null, q: string): Promise<string> {
  if (!store) return '';
  try {
    const ctx = await gatherContext(store, graph, q);
    const spans = ctx.spans.slice(0, 5);
    if (!spans.length) return '';
    return `## 工作区片段（讲义原文，事实优先从这里取；引用时写它的 anchor）\n${spans.map((s) => `### ${s.anchor}\n${s.text.slice(0, 1600)}`).join('\n\n')}\n`;
  } catch {
    return '';
  }
}

const PLAN_FORMAT = `## 这一次要做的：计划（还不写代码）
只输出一个 JSON 对象，不要别的文字：
{"title":"≤16 字，说出读者会看见什么","tool":"工具名，原样照抄","whyTool":"一句：为什么这个工具最能让这件事看得见",
 "phet":"只有选 PhET 时写：清单里的 id",
 "see":"一句：读者动手之后会看见的那件事（就是问题的答案）",
 "controls":[{"name":"控件，写清范围与单位","effect":"改它会看见什么变化"}],
 "steps":[{"title":"步骤名","what":"这一步画面上变了什么、为什么"}],
 "facts":[{"claim":"页面上要用到的一条事实或数据","source":"工作区片段的 anchor，或《书名》第N章，或「无来源，待核对」"}],
 "caveat":"一行：哪里是示意或简化（没有就写空字符串）",
 "explain":["给读者的阐释，2–4 段教材书面语：看到的是什么、为什么是这样、试着做一件事会看见什么"]}
controls 至少一个、最多四个；steps 没有过程就写空数组。`;

const CODE_FORMAT = (local: ToolCap | null) =>
  local?.file
    ? `## 这一次要做的：写代码（本地运行）
按上面的计划写一个完整、能直接运行的 ${local.name} 脚本，放在一个 \`\`\`${local.file.lang} 代码块里；文件开头用注释写依赖与运行命令（${local.file.run}）。代码块之前用两三段话说明运行后会看到什么、改哪个参数会看到什么变化。`
    : `## 这一次要做的：写页面
按上面的计划写一张完整的单文件 HTML 页面，放在一个 \`\`\`html 代码块里。遵守提示词第 3、4 节：只加载「可用的库」里的地址；打开就有初始画面；画完调用 window.veinReady()；左画布右阐释栏（阐释栏用计划里的 explain，步骤或参数变化时高亮对应段落）；画布角落一行写 caveat。`;

/* ---------- 三步 ---------- */

export interface GenInput {
  model: ModelConfig;
  store: WorkspaceStore | null;
  graph: GraphLike | null;
  q: string;
  requested: string | null;
  lang: 'zh' | 'en';
  signal?: AbortSignal;
  onStage?: (label: string) => void;
}

export async function generateViz(input: GenInput): Promise<GenRun> {
  const { model, store, graph, q, requested, signal, onStage } = input;
  const prompt = await promptFor('lab.visualize', store ?? undefined);
  const system = { role: 'system' as const, content: prompt.text };
  const menu = toolMenu(requested);
  const ctx = await contextText(store, graph, q);
  const head = `## 读者想看懂的\n${q}\n\n${menu.text}\n${phetList()}\n${ctx}`;

  onStage?.('拟计划：选工具、定要让人看见什么');
  const planRaw = await chat(model, [system, { role: 'user', content: `${head}\n${PLAN_FORMAT}` }], signal, 4096);
  const plan = checkPlan(extractJson(planRaw), menu.cap?.name ?? null);
  const cap = capOf(plan.tool)!;

  const base: Omit<GenRun, 'code' | 'lang' | 'status'> = {
    id: genUid(),
    q,
    requested,
    tool: cap.name,
    tier: cap.tier,
    substitutedWhy: menu.substitutedWhy,
    plan,
    errors: [],
    repairs: 0,
    at: Date.now(),
    model: model.model,
  };
  if (cap.tier === 'embed') return { ...base, code: '', lang: 'phet', status: 'running' };

  onStage?.(cap.tier === 'local' ? `写 ${cap.name} 代码` : `用 ${cap.name} 写页面`);
  const codeMsg = `${head}\n## 计划（上一步定的）\n${JSON.stringify(plan, null, 1)}\n\n${cap.tier === 'browser' ? libsFor(cap) : ''}\n${CODE_FORMAT(cap.tier === 'local' ? cap : null)}`;
  const out = await chat(model, [system, { role: 'user', content: codeMsg }], signal, 16000);
  if (cap.tier === 'local') {
    const code = fenced(out, cap.file!.lang) ?? fenced(out, '');
    if (!code) throw new ModelError('模型没有给出代码块。');
    return { ...base, code, lang: cap.file!.lang, status: 'local' };
  }
  const html = fenced(out, 'html');
  if (!html) throw new ModelError('模型没有给出 HTML 页面。');
  const issues = checkHtml(html, cap);
  return { ...base, code: html, lang: 'html', status: 'running', errors: issues };
}

/** 页面跑不起来：把错误原文与上一版代码交回模型，要一张完整的修好的页面 */
export async function repairViz(input: GenInput, run: GenRun, errors: string[]): Promise<GenRun> {
  const { model, store, signal, onStage } = input;
  const cap = capOf(run.tool)!;
  const prompt = await promptFor('lab.visualize', store ?? undefined);
  onStage?.(`修复页面（第 ${run.repairs + 1} 次）`);
  const msg = `## 读者想看懂的\n${run.q}\n\n## 计划\n${JSON.stringify(run.plan, null, 1)}\n\n${libsFor(cap)}
## 上一版页面在沙箱里没有跑起来
${errors.map((e) => `- ${e}`).join('\n')}

## 上一版代码
\`\`\`html
${run.code}
\`\`\`

## 这一次要做的：修复
找出原因，输出一张完整的修好的页面，放在一个 \`\`\`html 代码块里。代码块外只用一句话说原因。仍然遵守提示词第 3、4 节。`;
  const out = await chat(model, [{ role: 'system', content: prompt.text }, { role: 'user', content: msg }], signal, 16000);
  const html = fenced(out, 'html');
  if (!html) throw new ModelError('模型修复时没有给出 HTML 页面。');
  return { ...run, code: html, repairs: run.repairs + 1, errors: checkHtml(html, cap), status: 'running' };
}

/* ---------- 确定性核对 ---------- */

const str = (v: unknown, max = 600) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function checkPlan(raw: unknown, forced: string | null): GenPlan {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  let tool = forced ?? str(o.tool, 40);
  const cap = capOf(tool);
  if (!cap || (!forced && !AUTO_CHOICES.includes(tool))) {
    if (forced) throw new ModelError(`计划里的工具「${tool}」不可用。`);
    tool = 'D3.js'; // 模型挑了清单外的工具：退回最通用的 SVG 方案，而不是失败
  }
  const phet = str(o.phet, 60);
  if (tool === 'PhET' && !PHET_SIMS.includes(phet)) throw new ModelError(`模型挑的 PhET 模拟「${phet || '（空）'}」不在核实过的清单里。`);
  const arr = <T>(v: unknown, f: (x: Record<string, unknown>) => T | null, max: number): T[] =>
    (Array.isArray(v) ? v : []).map((x) => (x && typeof x === 'object' ? f(x as Record<string, unknown>) : null)).filter((x): x is T => x !== null).slice(0, max);
  const plan: GenPlan = {
    title: str(o.title, 40) || '可视化',
    tool,
    whyTool: str(o.whyTool, 200),
    phet: tool === 'PhET' ? phet : undefined,
    see: str(o.see, 200),
    controls: arr(o.controls, (x) => (str(x.name) ? { name: str(x.name, 80), effect: str(x.effect, 200) } : null), 4),
    steps: arr(o.steps, (x) => (str(x.title) ? { title: str(x.title, 40), what: str(x.what, 300) } : null), 12),
    facts: arr(o.facts, (x) => (str(x.claim) ? { claim: str(x.claim, 300), source: str(x.source, 200) || '无来源，待核对' } : null), 12),
    caveat: str(o.caveat, 160),
    explain: (Array.isArray(o.explain) ? o.explain : []).map((p) => str(p, 1200)).filter(Boolean).slice(0, 6),
  };
  if (!plan.see) throw new ModelError('计划没有写「读者会看见什么」，这一版不能用。');
  return plan;
}

/** 取 ```lang 代码块；lang 为空时取第一个代码块 */
export function fenced(text: string, lang: string): string | null {
  const re = lang ? new RegExp('```' + lang + '[^\\n]*\\n([\\s\\S]*?)```', 'i') : /```[^\n]*\n([\s\S]*?)```/;
  const m = re.exec(text);
  if (m) return m[1]!.trim();
  // 被截断后续写拼回来的回答可能没有收尾的 ```
  if (lang === 'html') {
    const i = text.search(/<!doctype html|<html/i);
    if (i >= 0) return text.slice(i).replace(/```\s*$/, '').trim();
  }
  return null;
}

function originAllowed(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return true; // 相对地址、data:、blob: 由沙箱的内容安全策略管
  return ALLOWED_ORIGINS.some((o) => {
    const host = new URL(url).origin;
    return o.includes('*') ? host.endsWith(o.replace('https://*', '')) : host === o;
  });
}

/** 运行前的确定性检查：只报真正会让页面跑不起来或越权的问题 */
export function checkHtml(html: string, cap: ToolCap): string[] {
  const issues: string[] = [];
  if (!/<body[\s>]/i.test(html) && !/<script[\s>]/i.test(html)) issues.push('页面没有 body，也没有脚本。');
  if (html.length > 160_000) issues.push(`页面太大（${Math.round(html.length / 1000)} KB）。`);
  const srcs = [...html.matchAll(/<(?:script|link)[^>]+(?:src|href)\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]!);
  const imports = [...html.matchAll(/(?:from\s+|import\s*\(\s*)["'](https?:\/\/[^"']+)["']/g)].map((m) => m[1]!);
  for (const u of [...srcs, ...imports]) if (!originAllowed(u)) issues.push(`加载了不允许的地址：${u}`);
  if (/\b(localStorage|sessionStorage|document\.cookie)\b/.test(html)) issues.push('用了浏览器存储（沙箱里不可用）。');
  if (/\b(alert|confirm|prompt)\s*\(/.test(html)) issues.push('用了 alert / confirm / prompt（沙箱里会被拦下）。');
  if (!/veinReady\s*\(/.test(html)) issues.push('没有调用 window.veinReady()。');
  if (cap.libs?.length && !cap.libs.some((l) => html.includes(l.replace(/\/[^/]+$/, '')))) issues.push(`没有加载 ${cap.name} 的库。`);
  return issues;
}

/* ---------- 沙箱外壳 ---------- */

/**
 * 给生成的页面加一层外壳再放进 iframe（data: 地址 + sandbox；data: 文档来源匿名、与本站不同源，碰不到你的 key 与工作区）：
 * - 内容安全策略：只许从允许的 CDN 加载，不许向任何地方发数据；
 * - 报错、加载失败、画完（veinReady）、两秒半后画面上有没有东西，都经 postMessage 报给实验室。
 */
export function wrapHtml(html: string): string {
  const src = ALLOWED_ORIGINS.join(' ');
  const csp = [
    "default-src 'none'",
    `script-src 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob: ${src}`,
    `style-src 'unsafe-inline' ${src}`,
    `img-src data: blob: ${src}`,
    `font-src data: ${src}`,
    `connect-src ${src}`,
    'worker-src blob:',
    `frame-src ${src}`,
    'media-src data: blob:',
  ].join('; ');
  const prelude = `<meta http-equiv="Content-Security-Policy" content="${csp}">
<script>(function(){
var post=function(t,d){try{parent.postMessage(Object.assign({source:'vein-gen',type:t},d||{}),'*')}catch(e){}};
var mem=function(){var m={};return{getItem:function(k){return k in m?m[k]:null},setItem:function(k,v){m[k]=String(v)},removeItem:function(k){delete m[k]},clear:function(){m={}},key:function(i){return Object.keys(m)[i]||null},get length(){return Object.keys(m).length}}};
['localStorage','sessionStorage'].forEach(function(n){try{window[n].length}catch(e){try{Object.defineProperty(window,n,{value:mem(),configurable:true})}catch(_){}}});
window.alert=window.confirm=window.prompt=function(){return null};
try{document.cookie}catch(e){var jar={};Object.defineProperty(document,'cookie',{configurable:true,get:function(){return Object.keys(jar).map(function(k){return k+'='+jar[k]}).join('; ')},set:function(v){var p=String(v).split(';')[0].split('=');jar[p[0].trim()]=(p[1]||'').trim()}})}
var done=false;window.veinReady=function(){if(!done){done=true;post('ready')}};
window.addEventListener('error',function(e){var t=e.target;if(t&&t!==window&&(t.src||t.href)){post('error',{msg:'资源加载失败：'+(t.src||t.href)})}else{post('error',{msg:(e.message||'脚本错误')+(e.lineno?' （第 '+e.lineno+' 行）':'')})}},true);
window.addEventListener('unhandledrejection',function(e){var r=e.reason;post('error',{msg:'未处理的异步错误：'+(r&&r.message||String(r))})});
document.addEventListener('securitypolicyviolation',function(e){post('error',{msg:'被安全策略拦下：'+e.blockedURI})});
var probe=function(){var n=0;document.querySelectorAll('canvas,svg,img,iframe,video,.ggbApplet,[id^=ggb]').forEach(function(el){var r=el.getBoundingClientRect();if(r.width>60&&r.height>60)n++});post('probe',{visual:n,text:(document.body&&document.body.innerText||'').trim().length,ready:done})};
window.addEventListener('load',function(){setTimeout(probe,2500);setTimeout(probe,9000)});
})();</script>`;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => `${m}\n${prelude}`);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (m) => `${m}<head>${prelude}</head>`);
  return `<!doctype html><html><head>${prelude}</head><body>${html}</body></html>`;
}
