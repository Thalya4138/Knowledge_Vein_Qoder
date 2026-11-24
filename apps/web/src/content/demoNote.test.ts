/**
 * 对照 demo 讲义与样张（content/demo/linear-algebra/rendered/src.html）的解析契约测试。
 * 期望值来自样张的版式，不是来自解析器自己的输出——解析器跑偏时这里会红。
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { toHtml } from 'hast-util-to-html';
import { DEMO_WORKSPACE } from '../features/workspace/workspaceData';
import { CALLOUT_KINDS, parseNote, renderNodes } from './index';
import type { CalloutBlock, NoteBlock, NoteDocument } from './index';

const repo = (p: string) => readFileSync(new URL(`../../../../${p}`, import.meta.url), 'utf8');
const KB = 'content/demo/linear-algebra';
const CONTENT_URL = new URL('../../../../content/', import.meta.url);
const source = repo(`${KB}/notes/2.1-列空间中的最近点.md`);
const doc: NoteDocument = parseNote(source);

const callouts = doc.blocks.filter((b): b is CalloutBlock => b.type === 'callout');
const byKind = (k: string) => callouts.filter((c) => c.kind === k);
const rowOf = (id: string) => doc.rows.find((r) => r.main.includes(id) || r.side.includes(id));

describe('demo 讲义：结构', () => {
  it('没有任何诊断', () => {
    expect(doc.diagnostics).toEqual([]);
  });

  it('读出 frontmatter 与标题（含行尾注释、引号）', () => {
    expect(doc.frontmatter.title).toBe('第2章 第1节 正交投影与最小二乘法');
    expect(doc.frontmatter.kb).toBe('kb.linear-algebra');
    expect(doc.frontmatter.style).toBe('textbook');
    expect(doc.title).toBe('第1节　正交投影与最小二乘法');
  });

  it('标题锚点：四个小节，slug 去掉标点、保留中文', () => {
    expect(doc.headings.filter((h) => h.depth === 2).map((h) => h.slug)).toEqual([
      '从代数问题到几何问题', '最近点满足的条件', '法方程', '点唯一参数未必唯一',
    ]);
    expect(doc.headings[0]).toMatchObject({ depth: 1, line: 12, slug: '第1节-正交投影与最小二乘法' });
  });

  it('栏目顺序与样张一致', () => {
    expect(callouts.map((c) => c.kind)).toEqual([
      'problem', 'focus', 'side', 'figure', 'res', 'side', 'figure', 'res',
      'figure', 'figure', 'res', 'figure', 'res',
      'table', 'training', 'training', 'exercise', 'res', 'exercise',
    ]);
  });

  it('段落锚：全部摘下，源码标记不残留在正文里', () => {
    expect([...doc.anchors.keys()]).toEqual([
      'p-intro', 'p-legendre', 'p-colspace', 'p-project', 'p-orth',
      'p-normal-eq', 'p-example', 'p-unique', 'p-proj', 'exercises',
    ]);
    const intro = doc.blockById.get('p-intro')!;
    expect(intro.lines).toEqual({ start: 29, end: 29 });
    const html = renderAll(doc).html;
    expect(html).not.toMatch(/\^p-|\^exercises|@p-/);
  });

  it('独占一行的 ^exercises 标注前一个块（练习与应用）', () => {
    const ex = doc.blockById.get('exercises') as CalloutBlock;
    expect(ex.kind).toBe('exercise');
    expect(ex.fold).toBe('none');
  });

  it('折叠语法：答案与参考思路默认折叠', () => {
    expect(byKind('training').map((c) => c.fold)).toEqual(['none', 'closed']);
    expect(byKind('exercise').map((c) => c.fold)).toEqual(['none', 'closed']);
    expect(byKind('exercise')[1]!.titleText).toBe('答案与解析');
  });
});

describe('demo 讲义：主栏 / 旁栏对齐（样张为准）', () => {
  it('本节聚焦没写 @，前面没有正文段 → 与后一段 ^p-intro 同行', () => {
    const focus = byKind('focus')[0]!;
    expect(focus.placement).toBe('side');
    expect(focus.alignTo).toBe('p-intro');
    expect(rowOf(focus.id)!.main[0]).toBe('p-intro');
  });

  it('问题探讨在主栏，标题与图片分开', () => {
    const p = byKind('problem')[0]!;
    expect(p.placement).toBe('main');
    expect(p.titleText).toBe('问题探讨');
    expect(p.body[0]!.type).toBe('paragraph');
    expect(toHtml(renderNodes(p.body).hast)).toContain(`src="${encodeURI('figures/2-0-问题探讨.svg')}"`);
  });

  it('相关信息贴着勒让德段；该段之后无旁栏的段落并入同一行', () => {
    const row = rowOf('p-legendre')!;
    expect(row.side).toHaveLength(1);
    expect((doc.blockById.get(row.side[0]!) as CalloutBlock).kind).toBe('side');
    expect(row.main).toHaveLength(2);
  });

  it('带 @ 的图进旁栏，新增核心图在主栏；表留在主栏', () => {
    const figures = byKind('figure');
    expect(figures).toHaveLength(5);
    expect(figures[0]).toMatchObject({ placement: 'side', alignTo: 'p-colspace' });
    expect(figures[1]).toMatchObject({ placement: 'main' });
    expect(figures[2]).toMatchObject({ placement: 'side', alignTo: 'p-example' });
    expect(figures.slice(3).map((f) => f.placement)).toEqual(['main', 'main']);
    expect(figures[0]!.title.some((n) => n.type === 'inlineMath')).toBe(true);
    expect(figures.map((f) => f.titleText.match(/图 2-\d/)?.[0])).toEqual([
      '图 2-1', '图 2-2', '图 2-3', '图 2-4', '图 2-5',
    ]);
    expect(byKind('table')[0]!.placement).toBe('main');
  });

  it('资源卡：只取 span id，对齐到各自的段落', () => {
    expect(byKind('res').map((c) => [c.spanId, c.alignTo])).toEqual([
      ['s.ocw-ses22-p2', 'p-project'],
      ['s.l15-normal', 'p-normal-eq'],
      ['s.l15-indep', 'p-unique'],
      ['s.wiki-lls-projection', 'p-proj'],
      ['s.l15-split', 'exercises'],
    ]);
    for (const r of byKind('res')) expect(r.title).toEqual([]);
  });

  it('每个旁栏块都出现在且仅出现在一行里', () => {
    const sides = doc.blocks.filter((b) => b.placement === 'side').map((b) => b.id);
    const placed = doc.rows.flatMap((r) => r.side);
    expect(placed.sort()).toEqual(sides.sort());
    const mains = doc.blocks.filter((b) => b.placement === 'main').map((b) => b.id);
    expect(doc.rows.flatMap((r) => r.main)).toEqual(mains);
  });
});

describe('demo 讲义：渲染', () => {
  it('全部公式用 KaTeX 渲染成功，含 \\tag{2-1}', () => {
    const { html, diagnostics } = renderAll(doc);
    expect(diagnostics).toEqual([]);
    expect(html).toContain('class="katex"');
    expect(html).toContain('katex-display');
    expect(html).toContain('2-1');
    expect(html).not.toContain('katex-error');
  });

  it.each(['src.html', 'index.html'])('手工样张 %s 同步三张核心图，使用随讲义导出的相对路径', (file) => {
    const rendered = repo(`${KB}/rendered/${file}`);
    for (const figure of ['2-2-从正交到法方程.svg', '2-4-参数不唯一.svg', '2-5-投影矩阵.svg']) {
      expect(rendered).toContain(`src="../notes/figures/${figure}"`);
    }
    for (const label of ['图 2-2', '图 2-4', '图 2-5']) {
      expect(rendered).toContain(`<span class="fig-no">${label}</span>`);
    }
    expect(rendered).toContain('（图 2-3）');
  });

  it('工作区文件树登记全部讲义图，且每个地址都指向真实文件', () => {
    const images = DEMO_WORKSPACE.folders.find((folder) => folder.id === 'figures')!.files;
    expect(images.map((file) => file.id)).toEqual(['fig-2-0', 'fig-2-1', 'fig-2-2', 'fig-2-3', 'fig-2-4', 'fig-2-5']);
    expect(images.map((file) => file.url)).not.toContain('/demo/linear-algebra/notes/figures/2-2.svg');
    for (const file of images) {
      expect(file.kind).toBe('image');
      expect(file.url).toBe(encodeURI(decodeURI(file.url)));
      expect(existsSync(new URL(decodeURI(file.url).slice(1), CONTENT_URL)), file.url).toBe(true);
    }
  });

  it('独立公式数与样张一致（样张 index.html 有 9 个 katex-display）', () => {
    expect(renderAll(doc).html.match(/class="katex-display"/g)).toHaveLength(9);
  });

  it('表格（GFM）在表块里渲染出来', () => {
    const html = toHtml(renderNodes(byKind('table')[0]!.body).hast);
    expect(html).toContain('<table>');
    expect((html.match(/<tr>/g) ?? []).length).toBe(4);
  });

  it('图片地址可改写，且不改动解析结果本身', () => {
    const fig = byKind('figure')[0]!;
    const html = toHtml(renderNodes(fig.body, { assetUrl: (s) => `/kb/la/notes/${s}` }).hast);
    expect(html).toContain('src="/kb/la/notes/figures/2-1.svg"');
    expect(toHtml(renderNodes(fig.body).hast)).toContain('src="figures/2-1.svg"');
    const local = toHtml(renderNodes(fig.body, { assetUrl: () => 'blob:http://localhost/local-image' }).hast);
    expect(local).toContain('src="blob:http://localhost/local-image"');
  });
});

describe('与 verify-content.mjs、manifest 不漂移', () => {
  const script = repo('scripts/verify-content.mjs');

  it('callout 白名单与校验脚本的 BLOCKS 完全一致', () => {
    const block = /const BLOCKS = new Set\(\[([\s\S]*?)\]\);/.exec(script)![1]!;
    const kinds = [...block.matchAll(/^\s*'([a-z-]+)'/gm)].map((m) => m[1]);
    expect([...CALLOUT_KINDS].sort()).toEqual(kinds.sort());
  });

  it('锚点集合与校验脚本的正则读出来的一致', () => {
    const re = /(?:^|\s)\^([A-Za-z0-9-]+)\s*$/gm; // 照抄 verify-content.mjs
    const theirs = [...source.matchAll(re)].map((m) => m[1]);
    expect([...doc.anchors.keys()]).toEqual(theirs);
  });

  it('每张资源卡的 span 在 manifest 里存在并带 why', () => {
    const manifest = JSON.parse(repo(`${KB}/resources/manifest.json`)) as { spans: { id: string; why?: string }[] };
    const spans = new Map(manifest.spans.map((s) => [s.id, s]));
    for (const r of byKind('res')) expect(spans.get(r.spanId!)?.why).toBeTruthy();
  });
});

function renderAll(d: NoteDocument) {
  const parts: string[] = [];
  const diagnostics = [];
  for (const b of d.blocks) {
    for (const nodes of contentOf(b)) {
      const r = renderNodes(nodes);
      parts.push(toHtml(r.hast));
      diagnostics.push(...r.diagnostics);
    }
  }
  return { html: parts.join('\n'), diagnostics };
}

function contentOf(b: NoteBlock) {
  if (b.type === 'prose') return [b.nodes];
  if (b.type === 'heading') return [[{ type: 'paragraph' as const, children: b.children }]];
  return [[{ type: 'paragraph' as const, children: b.title }], b.body];
}
