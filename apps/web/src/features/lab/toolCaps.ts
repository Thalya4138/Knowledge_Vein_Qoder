/**
 * 可视化工具能做到哪一步（2026-11-26 实测连通性后定）。知脉没有服务器，生成的页面在浏览器的沙箱里运行，
 * 所以一个工具能不能「在这里跑起来」，取决于它的库能不能从 CDN 加载进网页：
 *
 * - browser：库从 CDN 加载，模型写一张单文件页面，在沙箱里实时运行。
 * - embed：嵌入官方现成的模拟（PhET）。模型只能从下面核实过的清单里挑，不许编地址。
 * - local：只能在你自己的电脑上运行（要装软件或 Python 环境）。生成可下载的代码与运行说明，不假装能在网页里跑。
 * - external：要第三方账号 / 授权，或者不开放嵌入。改用 `fallback` 里的浏览器工具实现，并在结果上写明。
 *
 * 地址都钉死版本，并在 2026-11-26 从国内网络实测可达；改版本前重测。
 */

export type Tier = 'browser' | 'embed' | 'local' | 'external';

export interface ToolCap {
  name: string;
  tier: Tier;
  /** browser：页面可以加载的库（<script src> 或 import 地址），程序会原样告诉模型 */
  libs?: string[];
  /** 给模型的一句用法提示 */
  hint?: string;
  /** local：生成的代码文件扩展名与运行方式 */
  file?: { ext: string; lang: string; run: string; runEn: string };
  /** external：改用哪个浏览器工具，以及为什么 */
  fallback?: string;
  why?: string;
  whyEn?: string;
}

const JSD = 'https://cdn.jsdelivr.net/npm';
const KATEX = [`${JSD}/katex@0.16.11/dist/katex.min.css`, `${JSD}/katex@0.16.11/dist/katex.min.js`];

export const CAPS: ToolCap[] = [
  { name: 'GeoGebra', tier: 'browser', libs: ['https://www.geogebra.org/apps/deployggb.js'], hint: '用 new GGBApplet({appName:"classic"|"3d"|"graphing", width, height, showToolBar:false, appletOnLoad(api){ api.evalCommand(...) }}, true).inject("容器id") 建图；所有对象用 evalCommand 创建，滑块用 Slider 命令' },
  { name: 'JSXGraph', tier: 'browser', libs: [`${JSD}/jsxgraph@1.10.1/distrib/jsxgraphcore.js`, `${JSD}/jsxgraph@1.10.1/distrib/jsxgraph.css`], hint: '二维几何与函数图像，JXG.JSXGraph.initBoard；点可拖动，用 functiongraph、slider' },
  { name: 'Desmos', tier: 'external', fallback: 'JSXGraph', why: 'Desmos 的嵌入接口要向官方申请 API key，网页里不能直接用；改用 JSXGraph 画同样的函数图像。', whyEn: 'Desmos embedding needs an API key from Desmos; JSXGraph draws the same graphs instead.' },
  { name: 'Manim', tier: 'local', file: { ext: 'py', lang: 'python', run: '装好 Manim Community 后运行：manim -pqh 文件名.py 场景类名', runEn: 'With Manim Community installed: manim -pqh file.py SceneName' } },
  { name: 'Mathematica', tier: 'local', file: { ext: 'wl', lang: 'mathematica', run: '在 Mathematica 或免费的 Wolfram Engine 里打开运行', runEn: 'Run in Mathematica or the free Wolfram Engine' } },
  { name: 'PhET', tier: 'embed', hint: '只能从「可嵌入的 PhET 模拟」清单里选一个 id，不许编' },
  { name: 'Matter.js', tier: 'browser', libs: [`${JSD}/matter-js@0.20.0/build/matter.min.js`], hint: '二维刚体物理：Engine、Render、Runner、Bodies、Composite；参数改了要能重置场景' },
  { name: 'Falstad 电路', tier: 'external', fallback: 'D3.js', why: 'Falstad 电路模拟器不开放按内容嵌入，只能在它的官网手动搭电路（falstad.com/circuit）；这里改用 D3.js 画电路与随参数变化的电压电流。', whyEn: 'The Falstad simulator cannot be embedded with generated circuits (build them at falstad.com/circuit); D3.js draws the circuit and its live values instead.' },
  { name: 'VPython', tier: 'local', file: { ext: 'py', lang: 'python', run: 'pip install vpython 后运行：python 文件名.py（浏览器会弹出三维窗口）；也可粘贴到 glowscript.org', runEn: 'pip install vpython, then python file.py (a 3D window opens in the browser); or paste into glowscript.org' } },
  { name: '3Dmol.js', tier: 'browser', libs: [`${JSD}/3dmol@2.4.2/build/3Dmol-min.js`], hint: '分子结构：$3Dmol.createViewer，用 addModel 载入页面里内联的 xyz / pdb / sdf 文本（不要从网上取分子文件），setStyle、zoomTo、render' },
  { name: 'JSmol', tier: 'external', fallback: '3Dmol.js', why: 'JSmol 没有稳定的 CDN 版本，网页里加载不可靠；改用 3Dmol.js 显示同样的分子结构。', whyEn: 'JSmol has no reliable CDN build; 3Dmol.js shows the same structures.' },
  { name: 'ChemDoodle', tier: 'external', fallback: '3Dmol.js', why: 'ChemDoodle 网页组件需要单独授权下载，不能从公共 CDN 加载；改用 3Dmol.js。', whyEn: 'ChemDoodle web components require a separate licensed download; 3Dmol.js is used instead.' },
  { name: 'BioDigital Human', tier: 'external', fallback: 'Three.js', why: 'BioDigital Human 需要开发者账号与授权才能嵌入；改用 Three.js 做示意性的三维结构，并标明是示意。', whyEn: 'BioDigital Human requires a developer account to embed; Three.js builds a labelled schematic instead.' },
  { name: 'Z-Anatomy', tier: 'external', fallback: 'Three.js', why: 'Z-Anatomy 是基于 Blender 的桌面软件，没有网页嵌入方式；改用 Three.js 做示意性的三维结构，并标明是示意。', whyEn: 'Z-Anatomy is a Blender-based desktop app with no web embed; Three.js builds a labelled schematic instead.' },
  { name: 'Blender', tier: 'local', file: { ext: 'py', lang: 'python', run: '在 Blender 的 Scripting 面板里打开并运行', runEn: 'Open and run it in Blender’s Scripting workspace' } },
  { name: 'Matplotlib', tier: 'browser', libs: ['https://cdn.jsdelivr.net/pyodide/v0.27.2/full/pyodide.js'], hint: '用 Pyodide 在浏览器里跑真正的 Python：loadPyodide() → loadPackage(["numpy","matplotlib"]) → runPython；图用 plt.savefig 到 io.BytesIO 转 base64 放进 <img>，参数控件改了就重跑。首次加载约十几秒，先显示「正在加载 Python」' },
  { name: 'Plotly', tier: 'browser', libs: [`${JSD}/plotly.js-dist-min@2.35.2/plotly.min.js`], hint: '交互图表与三维曲面：Plotly.newPlot / Plotly.react；参数控件改了用 react 重画' },
  { name: 'MATLAB', tier: 'local', file: { ext: 'm', lang: 'matlab', run: '在 MATLAB 或免费的 GNU Octave 里运行', runEn: 'Run in MATLAB or the free GNU Octave' } },
  { name: 'PyTorch', tier: 'local', file: { ext: 'py', lang: 'python', run: 'pip install torch matplotlib 后运行：python 文件名.py', runEn: 'pip install torch matplotlib, then python file.py' } },
  { name: 'D3.js', tier: 'browser', libs: [`${JSD}/d3@7.9.0/dist/d3.min.js`], hint: '数据驱动的 SVG：示意图、流程、网络、电路、坐标图；用 join 更新，参数改了就重画' },
  { name: 'Three.js', tier: 'browser', libs: [`${JSD}/three@0.170.0/build/three.module.js`, `${JSD}/three@0.170.0/examples/jsm/controls/OrbitControls.js`], hint: '三维：用 <script type="importmap"> 把 "three" 映射到上面的 three.module.js、"three/addons/" 映射到 examples/jsm/，再 import；OrbitControls 旋转缩放' },
  { name: 'WebGL', tier: 'browser', libs: [], hint: '原生 WebGL / Canvas，不加载任何库' },
];

/** 公式渲染（任何浏览器页面都可以加载） */
export const SHARED_LIBS = KATEX;

/** 页面允许连接的来源（沙箱页面的内容安全策略按它放行） */
export const ALLOWED_ORIGINS = ['https://cdn.jsdelivr.net', 'https://www.geogebra.org', 'https://*.geogebra.org', 'https://phet.colorado.edu'];

/**
 * 可嵌入的 PhET 模拟（2026-11-26 逐个核实 `https://phet.colorado.edu/sims/html/<id>/latest/<id>_all.html` 返回 200）。
 * 模型只能从这里挑；挑出清单外的 id 视为不合格。
 */
export const PHET_SIMS: string[] = [
  'projectile-motion', 'pendulum-lab', 'forces-and-motion-basics', 'energy-skate-park', 'circuit-construction-kit-dc', 'wave-on-a-string',
  'waves-intro', 'gravity-and-orbits', 'masses-and-springs', 'faradays-law', 'coulombs-law', 'gas-properties', 'states-of-matter',
  'build-an-atom', 'molecule-shapes', 'ph-scale', 'balancing-chemical-equations', 'bending-light', 'geometric-optics', 'graphing-quadratics',
  'graphing-lines', 'vector-addition', 'collision-lab', 'friction', 'normal-modes', 'fourier-making-waves', 'density', 'buoyancy',
  'hookes-law', 'ohms-law', 'resistance-in-a-wire', 'color-vision', 'molarity', 'concentration', 'reactants-products-and-leftovers',
  'natural-selection', 'gene-expression-essentials', 'neuron', 'calculus-grapher', 'trig-tour', 'curve-fitting', 'least-squares-regression',
  'plinko-probability', 'molecule-polarity', 'energy-forms-and-changes', 'my-solar-system', 'keplers-laws', 'wave-interference',
  'greenhouse-effect', 'diffusion',
];

export const phetUrl = (id: string, lang: 'zh' | 'en') => `https://phet.colorado.edu/sims/html/${id}/latest/${id}_all.html?locale=${lang === 'en' ? 'en' : 'zh_CN'}`;

export function capOf(name: string): ToolCap | undefined {
  return CAPS.find((c) => c.name === name);
}

/** 用户选的工具 → 实际用来实现的工具（external 换成它的替代） */
export function resolveTool(name: string | null): { requested: string | null; cap: ToolCap | null; substituted: ToolCap | null } {
  if (!name) return { requested: null, cap: null, substituted: null };
  const cap = capOf(name) ?? null;
  if (cap?.tier === 'external' && cap.fallback) return { requested: name, cap: capOf(cap.fallback) ?? null, substituted: cap };
  return { requested: name, cap, substituted: null };
}

/** 「自动选择」时可以选的：能在网页里跑的工具与 PhET */
export const AUTO_CHOICES = CAPS.filter((c) => c.tier === 'browser' || c.tier === 'embed').map((c) => c.name);
