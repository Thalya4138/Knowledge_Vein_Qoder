import { promptFor } from '../../ai/prompts';
import { describe, expect, it } from 'vitest';
import { toHtml } from 'hast-util-to-html';
import { parseNote } from '../../content/parseNote';
import { renderNodes } from '../../content/render';
import { graphHast, texToText } from '../../content/veinGraph';
import { blankDoc, indexDoc } from '../atlas/mindDoc';
import { toMindBranch } from './bridge';
import { checkGraph, checkResult, layoutGraph, lectureMarkdown, lintProse, parseOutput, plainMarkdown, repairTex, toOutline, type CheckContext, type Issue } from './explore';
import { STAGE_CLOSING_CROSS, STAGE_OUTLINE, STAGE_OUTLINE_META, STAGE_SINGLE, buildUserContent, parseToc, rankSpans, stageSection, terms } from './exploreAi';
import { blocksOf } from './exporting';
import { renderMd } from './md';
import { PRESETS, presetResult } from './presets';
import { carryOver, upgradeTurn, type Turn } from './threads';

const ctx = (mode: CheckContext['mode'] = 'fragments'): CheckContext => ({ mode, nodeIds: new Set(['n.a']), anchors: new Set(['notes/x.md#一']) });

const edge = (over: Record<string, unknown> = {}) => ({
  id: 'e1',
  from: 'a',
  to: 'b',
  type: 'shared-mechanism',
  label: '同一判据',
  explanation: '两者都由残差与可行方向正交刻画最近点',
  assumptions: ['欧氏内积'],
  epistemic: 'logically-derived',
  ...over,
});
const graphOf = (edges: unknown[]) => ({
  nodes: [
    { id: 'a', label: '甲', kind: 'item', layer: 0, ref: 'n.a' },
    { id: 'b', label: '乙', kind: 'core', layer: 1 },
  ],
  edges,
});
const check = (edges: unknown[], mode: CheckContext['mode'] = 'fragments') => {
  const issues: Issue[] = [];
  return { graph: checkGraph(graphOf(edges), ctx(mode), issues), issues };
};

describe('示例（金样例）', () => {
  it.each(PRESETS.map((p) => [p.mode, p] as const))('%s 拆分、核对零删改，没有教材禁用的说法', (_, p) => {
    const { result, issues } = presetResult(p);
    expect(issues).toEqual([]);
    expect(result.note).not.toContain('vein-graph');
    expect(result.graph.edges.length).toBeGreaterThanOrEqual(8);
    expect(result.title.length).toBeGreaterThan(4);
  });

  it('示例是规范不是模板：各篇不共用任何小节名，第一段直接给出判断', () => {
    const notes = PRESETS.map((p) => presetResult(p).result.note);
    const heads = notes.map((n) => [...n.matchAll(/^## (.+)$/gm)].map((m) => m[1]!.trim()));
    const all = heads.flat();
    expect(new Set(all).size).toBe(all.length);
    for (const n of notes) {
      // 标题之后紧跟的是一段正文，不是栏目
      const first = n.split(/\n\s*\n/)[1]!.trim();
      expect(first.startsWith('>')).toBe(false);
      expect(first.startsWith('#')).toBe(false);
    }
    // 碎片串联是直接回答，不套讲义的栏目
    const frag = presetResult(PRESETS.find((p) => p.mode === 'fragments')!).result.note;
    for (const k of ['[!problem]', '[!focus]', '[!exercise]']) expect(frag).not.toContain(k);
  });

  it.each(PRESETS.map((p) => [p.mode, p] as const))('%s 的每个公式都能被 KaTeX 渲染（不出红字）', (_, p) => {
    const { result } = presetResult(p);
    const html = toHtml(renderNodes(parseNote(result.note).blocks.flatMap((b) => (b.type === 'callout' ? b.body : b.type === 'prose' ? b.nodes : [])) as never).hast);
    expect(html).not.toContain('katex-error');
    const labels = [...result.graph.nodes.map((n) => n.label), ...result.graph.edges.map((e) => e.label)].map(renderMd);
    for (const l of labels) expect(l).not.toContain('katex-error');
  });

  it('拓展资源是资源卡或可以点开的 https 链接', () => {
    for (const p of PRESETS) {
      const note = presetResult(p).result.note;
      const links = [...note.matchAll(/\]\((https?:[^)]+)\)/g)].map((m) => m[1]!);
      const cards = (note.match(/\[!res\] s\.[\w-]+/g) ?? []).length;
      expect(links.length + cards).toBeGreaterThanOrEqual(2);
      for (const u of links) expect(u.startsWith('https://')).toBe(true);
    }
  });

  it('学科元思考：几类对象与三个动作，从线性组合讲起，四个子空间有图', () => {
    const { result } = presetResult(PRESETS.find((p) => p.mode === 'meta')!);
    expect((result.note.match(/^## /gm) ?? []).length).toBeGreaterThanOrEqual(5);
    // 基础概念不许跳过；公认的主干要在
    for (const s of ['线性组合', '线性无关', '维数', '列空间', '零空间', '行空间', '左零空间', '奇异值分解']) expect(result.note).toContain(s);
    // 对象不止一类，全称判断不出现
    for (const s of ['映射', '算子', '双线性型']) expect(result.note).toContain(s);
    expect(result.note).not.toMatch(/对象只有一个/);
    // 不变量与完全不变量分开；通篇谈的那张图画了出来
    expect(result.note).toContain('完全不变量');
    expect(result.note).toContain('figures/四个子空间.svg');
    expect(result.graph.nodes.length).toBeGreaterThanOrEqual(16);
    const top = Math.max(...result.graph.nodes.map((n) => n.layer));
    expect(result.graph.nodes.filter((n) => n.layer === top)).toHaveLength(1);
  });

  it('学科元思考：四种联系分开；动机只在正文里讲，不画成线（图上没有「动机」这种类型，画了就会被读成别的关系）', () => {
    const { result } = presetResult(PRESETS.find((p) => p.mode === 'meta')!);
    for (const s of ['依赖', '等价', '推广', '动机']) expect(result.note).toContain(`**${s}**`);
    expect(result.graph.edges.filter((e) => /这是动机/.test(e.explanation))).toEqual([]);
  });

  it('推广的方向统一为「特例 → 一般」', () => {
    const meta = presetResult(PRESETS.find((p) => p.mode === 'meta')!).result.graph.edges.find((e) => e.id === 'g-op');
    expect(meta && [meta.from, meta.to]).toEqual(['op', 'map']);
  });

  it('分步提示：元思考不强制单线，跨学科允许分叉与回头', () => {
    expect(STAGE_OUTLINE_META.split('\n')[0]).toBe(STAGE_OUTLINE.split('\n')[0]);
    expect(STAGE_OUTLINE_META).toContain('## 目录');
    expect(STAGE_OUTLINE_META).not.toContain('目录是一条推进的链');
    expect(STAGE_OUTLINE).not.toContain('目录是一条推进的链');
    expect(STAGE_OUTLINE).toContain('可以分叉、对照、回头');
    expect(STAGE_OUTLINE).toContain('不强行造一个统领全篇的中心公式');
    expect(stageSection(1, 4, '节名｜x', 1)).toContain('接住上一节留下的问题');
    expect(stageSection(1, 4, '节名｜x', 1, 'web')).not.toContain('接住上一节留下的问题');
    expect(stageSection(1, 4, '节名｜x', 1, 'web')).toContain('依赖、等价、推广还是动机');
    expect(stageSection(1, 4, '节名｜x', 1, 'cross')).toContain('可以回接前节，也可以分叉');
    expect(stageSection(1, 4, '节名｜x', 1, 'cross')).not.toContain('接住上一节留下的问题');
    expect(STAGE_CLOSING_CROSS).toContain('最小验证');
    expect(STAGE_CLOSING_CROSS).toContain('开放一个正文尚未解决的新分支');
  });

  it('碎片提示：统一模型、双向证明、唯一性与边界写在发给模型的模式文件里，写作指令不再重复成编号清单', async () => {
    const { text } = await promptFor('connection.fragments');
    for (const k of ['同一个数学模型', '**必要性**', '**充分性**', '解是否唯一', '成立边界与反例']) expect(text).toContain(k);
    expect(STAGE_SINGLE).toContain('不强制对应表');
    expect(STAGE_SINGLE).not.toMatch(/^d. /m);
  });

  it('碎片示例：统一模型、完整证明、伪逆与四个子空间都落实', () => {
    const { result } = presetResult(PRESETS.find((p) => p.mode === 'fragments')!);
    for (const s of ['充分性。', '必要性。', 'M^+', 'Moore–Penrose', '列空间', '零空间', '行空间', '左零空间', '参数解唯一', 'QR 或 SVD', '对称正定']) expect(result.note).toContain(s);
    expect(result.note).toContain('最近 $\\Leftrightarrow$ 残差垂直于列空间');
  });

  it.each(PRESETS.filter((p) => p.mode === 'cross'))('$id 跨学科：每条边都标了轨道，类比只在 C2', (p) => {
    const { result } = presetResult(p);
    for (const e of result.graph.edges) {
      expect(e.track).toBeDefined();
      if (e.epistemic === 'analogy') expect(e.track).toBe('C2');
    }
  });

  it('机器人示例：精确瞬时关系、有限自运动与力矩边界都不能省', () => {
    const { result } = presetResult(PRESETS.find((p) => p.id === 'cross')!);
    for (const s of ['精确的瞬时关系', '有限自运动', 'J^+', '总力矩', '反向传播']) expect(result.note).toContain(s);
  });

  it('生物神经 × AI：动力系统、信用分配、局部学习与预测误差分开', () => {
    const { result } = presetResult(PRESETS.find((p) => p.id === 'cross-bio')!);
    for (const s of [
      'Hodgkin–Huxley', '膜电位', '外向电流取正号', '前向 Euler', '漏电发放神经元', '尚未包含绝对不应期', '阈值不是一个固定电压',
      '链式法则', '信用怎样分配', 'STDP', '权重边界', '预测误差', '加权最小二乘', '固定且正定', '精度', '端到端能耗', '最小验证',
      '相同时间平均电流', '同一任务、读出与损失', '“向大脑学习”才会从比喻变成研究',
    ]) expect(result.note).toContain(s);
    expect(result.note).toContain('梯度能反向走，信用却未必能');
    expect(result.note).toContain('“能在模型中构造”与“大脑实际这样工作”');
    expect(result.graph.edges.length).toBeGreaterThanOrEqual(24);
    const analogies = result.graph.edges.filter((e) => e.epistemic === 'analogy');
    expect(analogies.length).toBeGreaterThanOrEqual(3);
    for (const e of analogies) expect(e.boundary).toBeTruthy();
    const bioBackprop = result.graph.edges.find((e) => e.id === 'b-backprop-bio')!;
    expect(bioBackprop.track).toBe('C2');
    expect(bioBackprop.type).toBe('analogy-to');
    const residual = result.graph.edges.find((e) => e.id === 'b-error-residual')!;
    expect(residual.track).toBe('C2');
    expect(residual.type).toBe('analogy-to');
    expect(residual.boundary).toContain('切空间');
    const source = PRESETS.find((p) => p.id === 'cross-bio')!.raw;
    expect(source).toContain('论文 @p-hh');
    expect(source).toContain('论文 @p-backprop');
  });

  it('KaTeX 不认 psmallmatrix（上面那条检查确实能抓到红字），核对会自动改写', () => {
    expect(renderMd('$\\begin{psmallmatrix}1&0\\\\0&1\\end{psmallmatrix}$')).toContain('katex-error');
    const fixed = repairTex('$\\begin{psmallmatrix}1&0\\\\0&1\\end{psmallmatrix}$');
    expect(fixed.fixed).toBe(2);
    expect(renderMd(fixed.text)).not.toContain('katex-error');
  });
});

describe('拆分模型输出', () => {
  it('去掉标题前的寒暄，取出图块；多个图块合并', () => {
    const out = parseOutput('好的，以下是讲义：\n\n# 标题\n\n正文\n\n```vein-graph\n{"nodes":[{"id":"a"}],"edges":[]}\n```\n\n## 二\n\n```vein-graph\n{"nodes":[{"id":"b"}],"edges":[{"id":"x"}]}\n```');
    expect(out.title).toBe('标题');
    expect(out.note.startsWith('# 标题')).toBe(true);
    expect(out.note).not.toContain('vein-graph');
    expect((out.graph as { nodes: unknown[] }).nodes.length).toBe(2);
  });

  it('整篇被 ```markdown 包住也能拆', () => {
    const out = parseOutput('```markdown\n# 标题\n\n正文\n```');
    expect(out.title).toBe('标题');
    expect(out.note).not.toContain('```');
  });

  it('坏的图块不崩，图为空并提醒', () => {
    const { result, issues } = checkResult(parseOutput('# 标题\n\n正文\n\n```vein-graph\n{坏的\n```'), ctx());
    expect(result.graph.edges).toEqual([]);
    expect(issues.some((i) => i.text.includes('关联图是空的'))).toBe(true);
  });

  it('目录小节拆成各项', () => {
    const t = parseToc('# 题\n\n导入\n\n## 目录\n- 一　甲｜问甲\n- 二　乙｜问乙\n');
    expect(t.items).toEqual(['一　甲｜问甲', '二　乙｜问乙']);
    expect(t.opening).not.toContain('目录');
  });
});

describe('核对关联图', () => {
  it('「相关」不是关系类型；没有前提或理由太短的不画', () => {
    expect(check([edge({ type: 'related' })]).graph.edges).toEqual([]);
    expect(check([edge({ assumptions: [] })]).graph.edges).toEqual([]);
    expect(check([edge({ explanation: '有关' })]).graph.edges).toEqual([]);
  });

  it('类比没写不适用的情形不画；写了就固定为类比', () => {
    const { graph } = check([edge({ type: 'analogy-to', epistemic: 'logically-derived' }), edge({ id: 'e2', type: 'analogy-to', boundary: '没有能量' })]);
    expect(graph.edges.map((e) => e.id)).toEqual(['e2']);
    expect(graph.edges[0]!.epistemic).toBe('analogy');
  });

  it('跨学科：借来的视角降为类比，C1 里的类比移到 C2', () => {
    const { graph } = check([edge({ id: 'x', track: 'C2', boundary: '不对应' }), edge({ id: 'y', track: 'C1', epistemic: 'analogy', boundary: '不对应' })], 'cross');
    const by = Object.fromEntries(graph.edges.map((e) => [e.id, e]));
    expect(by.x!.epistemic).toBe('analogy');
    expect(by.y!.track).toBe('C2');
  });

  it('编造的笔记锚点去掉并降级；书名、https 链接、真实片段放行', () => {
    const { graph } = check([
      edge({ id: 'p', epistemic: 'source-backed', sources: ['notes/编造的.md#第三节'] }),
      edge({ id: 'q', epistemic: 'source-backed', sources: ['notes/x.md#一'] }),
      edge({ id: 'r', epistemic: 'source-backed', sources: ['Strang《Introduction to Linear Algebra》第 4 章'] }),
      edge({ id: 's', epistemic: 'source-backed', sources: ['https://ocw.mit.edu/x'] }),
    ]);
    const by = Object.fromEntries(graph.edges.map((e) => [e.id, e]));
    expect(by.p!.epistemic).toBe('logically-derived');
    expect(by.q!.epistemic).toBe('source-backed');
    expect(by.r!.epistemic).toBe('source-backed');
    expect(by.s!.epistemic).toBe('source-backed');
  });

  it('工作区里没有的 ref 去掉；没有连线的节点不放进图', () => {
    const issues: Issue[] = [];
    const g = checkGraph({ nodes: [...graphOf([]).nodes, { id: 'c', label: '丙', layer: 0, ref: 'n.made-up' }], edges: [edge()] }, ctx(), issues);
    expect(g.nodes.map((n) => n.id)).toEqual(['a', 'b']);
    expect(issues.some((i) => i.text.includes('n.made-up'))).toBe(true);
  });
});

describe('文风', () => {
  it('教材禁用的说法被标出', () => {
    const hits = lintProse('这是一个很好的问题。下面我们来看，这非常重要，其实不是这样。综上所述，它深刻地揭示了统一之美。');
    expect(hits.length).toBeGreaterThanOrEqual(5);
  });

  it('不误伤正常的数学叙述与公式', () => {
    expect(lintProse('残差与列空间正交，因此最近点唯一。$\\text{其实}$ 不在正文里。')).toEqual([]);
  });
});

describe('讲义方言与导出', () => {
  const { result } = presetResult(PRESETS[0]!);

  it('关联图作为一幅编号图接在第一个小节之前；插入讲义时标题降一级', () => {
    const md = lectureMarkdown(result);
    const fig = md.indexOf('[!figure] 图 1');
    expect(fig).toBeGreaterThan(0);
    expect(fig).toBeLessThan(md.search(/^## /m));
    expect(lectureMarkdown(result, { demote: true })).toMatch(/^## 三种最短距离/);
  });

  it('粘进讲义后，阅读器把关联图块渲染成图（不是一段 JSON）', () => {
    const doc = parseNote(lectureMarkdown(result));
    const fig = doc.blocks.find((b) => b.type === 'callout' && b.kind === 'figure');
    expect(fig).toBeDefined();
    const html = toHtml(renderNodes((fig as unknown as { body: never }).body).hast);
    expect(html).toContain('<svg');
    expect(html).toContain('vein-graph');
    expect(html).not.toContain('"nodes"');
    expect(html).toContain('最小二乘');
  });

  it('静态图：被拒绝的线不画；字里的公式转成文字', () => {
    const r = structuredClone(result);
    r.graph.edges[0]!.status = 'rejected';
    const svg = toHtml(graphHast({ nodes: r.graph.nodes, edges: r.graph.edges }));
    expect((svg.match(/<path d=/g) ?? []).length).toBe(r.graph.edges.length - 1 + 1);
    expect(svg).toContain('Mᵀ');
  });

  it('通用 Markdown：栏目变成带标题的引用，锚点去掉', () => {
    const plain = plainMarkdown('> [!side] 相关信息 @p-x\n> 内容\n\n正文 ^p-x');
    expect(plain).toContain('> **相关信息**');
    expect(plain).not.toContain('^p-x');
    expect(plain).not.toContain('@p-x');
  });

  it('PPT 用的块序列：标题、栏目、表、公式都认得出', () => {
    const blocks = blocksOf(result.note);
    expect(blocks.filter((b) => b.kind === 'h2').length).toBeGreaterThanOrEqual(4);
    expect(blocks.some((b) => b.kind === 'callout' && b.title === '相关信息')).toBe(true);
    // 表与折叠栏目：示例里不一定有（示例不规定栏目），用一段固定的讲义方言来测
    const fixed = blocksOf(['# 题', '', '> [!table] 表 1　两种换基', '> | 换基 | 留下的量 |', '> | --- | --- |', '> | 相抵 | 秩 |', '> | 相似 | 特征值 |', '', '> [!exercise]- 答案与解析', '> 略', ''].join('\n'));
    const table = fixed.find((b) => b.kind === 'table');
    expect(table?.rows?.[0]).toContain('换基');
    expect(table?.rows?.length).toBe(3);
    expect(fixed.some((b) => b.kind === 'callout' && b.folded)).toBe(true);
  });

  it('LaTeX → 文字', () => {
    expect(texToText('$A^{\\mathsf T}A\\hat{\\mathbf x}$')).toBe('AᵀAx̂');
    expect(texToText('$C(A^{\\mathsf T})$')).toBe('C(Aᵀ)');
    expect(texToText('$\\lambda\\to0$')).toBe('λ→0');
    // PPT 里的公式：矩阵、分式、范数、括号修饰
    expect(texToText('$\\begin{bmatrix}\\mathbf u&-\\mathbf v\\end{bmatrix}\\begin{bmatrix}t\\\\ s\\end{bmatrix}$')).toBe('[u -v][t; s]');
    expect(texToText('$\\dfrac{|\\mathbf n\\cdot\\mathbf P-d|}{\\lVert\\mathbf n\\rVert}$')).toBe('(|n·P-d|)/(‖n‖)');
    expect(texToText('$\\lVert\\mathbf c-\\mathbf p\\rVert^2$')).toBe('‖c-p‖²');
    expect(texToText('$\\mathbf u\\cdot\\bigl(\\text{连线向量}\\bigr)=0$')).toBe('u·(连线向量)=0');
  });
});

describe('布局与导图分支', () => {
  const { result } = presetResult(PRESETS[0]!);

  it('横向按层：层号越大越靠右，同层纵向排开', () => {
    const { nodes } = layoutGraph(result.graph.nodes);
    const at = (id: string) => nodes.find((n) => n.id === id)!;
    expect(at('affine').x!).toBeLessThan(at('proj').x!);
    expect(at('proj').x!).toBeLessThan(at('orth').x!);
    expect(at('ls').y!).toBeLessThan(at('pp').y!);
  });

  it('大纲以最抽象的一层为根，所有节点都在', () => {
    const outline = toOutline(result);
    for (const n of result.graph.nodes) expect(outline).toContain(n.label);
  });

  it('导图分支：根是标题，结构完整；放不进树的边变成带理由的连线', () => {
    const doc = blankDoc('线性代数');
    const branch = toMindBranch(doc, result);
    doc.root.kids.push(branch);
    const ix = indexDoc(doc);
    expect(branch.text).toBe(result.title);
    const texts = [...ix.byId.values()].map((n) => n.text);
    for (const n of result.graph.nodes) expect(texts).toContain(n.label);
    expect(doc.links.length).toBe(result.graph.edges.length - (result.graph.nodes.length - 1));
    for (const l of doc.links) expect(l.reason.length).toBeGreaterThan(10);
  });
});

describe('对话历史升级', () => {
  it('旧版示例（answer 字段、psmallmatrix）打开时换成新版本，保留裁决', () => {
    const p = PRESETS.find((x) => x.mode === 'meta')!;
    const fresh = presetResult(p).result;
    const oldTurn = {
      id: 'u1', ask: '从更高的层次看，线性代数这门课到底在研究什么？', files: [], issues: [], at: 1, origin: 'preset',
      result: {
        title: '旧标题', answer: '旧的 $\\begin{psmallmatrix}1\\end{psmallmatrix}$',
        graph: { nodes: [{ ...fresh.graph.nodes[0]!, x: 11, y: 22 }], edges: [{ ...fresh.graph.edges[0]!, status: 'rejected', reason: '不对' }] },
      },
    } as unknown as Turn;
    const up = upgradeTurn(oldTurn, 'meta');
    expect(up.presetRev).toBe(p.rev);
    expect(up.result.note).not.toContain('psmallmatrix');
    // 示例改版后布局变了，旧位置不再有意义：不带过去
    expect(up.result.graph.nodes.every((n) => n.x === undefined)).toBe(true);
    expect(up.result.graph.edges.find((e) => e.id === fresh.graph.edges[0]!.id)!.status).toBe('rejected');
  });

  it('模型生成的旧格式回答转成讲义体，不丢内容', () => {
    const oldTurn = { id: 'u', ask: 'q', files: [], issues: [], at: 1, origin: 'model', result: { title: 'T', answer: '结论。', table: { caption: '表', columns: ['a', 'b'], rows: [{ head: 'x', cells: ['y'] }] }, sections: [{ heading: '一', body: '内容' }], differences: ['差异'], boundary: '边界', graph: { nodes: [], edges: [] } } } as unknown as Turn;
    const up = upgradeTurn(oldTurn, 'fragments');
    for (const s of ['# T', '结论。', '| x | y |', '## 一', '差异', '边界']) expect(up.result.note).toContain(s);
  });

  it('carryOver 保留我的连线', () => {
    const r = presetResult(PRESETS[0]!).result;
    const prev = structuredClone(r);
    prev.graph.edges.push({ id: 'mine-1', from: 'ls', to: 'pp', type: 'shared-mechanism', label: '', explanation: '', assumptions: [], epistemic: 'user-personal', status: 'proposed', mine: true });
    expect(carryOver(r, prev).graph.edges.some((e) => e.id === 'mine-1')).toBe(true);
  });
});

describe('喂给模型的材料', () => {
  it('中文按二字切词', () => {
    expect([...terms('最小二乘')]).toEqual(['最小', '小二', '二乘']);
  });

  it('只挑与问题相关的片段（PDF 页与笔记一样参与）', () => {
    const spans = [
      { anchor: 'a.md#法方程', text: '最小二乘的法方程由残差与列空间正交得到。'.repeat(3) },
      { anchor: '资料/b.pdf#page=3', text: '行列式是体积的缩放倍数。'.repeat(3) },
      { anchor: '资料/c.pdf#page=7', text: '法方程与最小二乘：投影矩阵。'.repeat(3) },
    ];
    expect(rankSpans(spans, '最小二乘和法方程是什么关系').map((s) => s.anchor).sort()).toEqual(['a.md#法方程', '资料/c.pdf#page=7']);
  });

  it('截图随消息发送；PDF 附件按页带锚点；追问附上不认同的理由', () => {
    const r = structuredClone(presetResult(PRESETS[0]!).result);
    r.graph.edges[0]!.status = 'rejected';
    r.graph.edges[0]!.reason = '我觉得不是推广';
    const parts = buildUserContent(
      'fragments',
      '再说说平行的情形',
      [
        { kind: 'image', name: 'a.png', mediaType: 'image/png', data: 'AAAA', url: '' },
        { kind: 'pdf', name: '讲义.pdf', pages: ['第一页', '第二页'], total: 2 },
      ],
      { nodes: [], relations: [], spans: [], files: 0, pdfs: 0 },
      [{ ask: '是同一个问题吗', result: r }],
      '## 这一次要写的',
    );
    expect(parts[1]).toEqual({ type: 'image', mediaType: 'image/png', data: 'AAAA' });
    const text = (parts[0] as { text: string }).text;
    expect(text).toContain('[anchor: 讲义.pdf#page=2]');
    expect(text).toContain('此前对话');
    expect(text).toContain('我觉得不是推广');
  });
});
