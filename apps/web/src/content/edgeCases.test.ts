/** 边界与反例：demo 讲义里没有、但规格要求支持或必须拒绝的写法。 */
import { describe, expect, it } from 'vitest';
import { toHtml } from 'hast-util-to-html';
import { createSlugger, parseNote, renderNodes, slugify } from './index';
import type { CalloutBlock, ProseBlock } from './index';

const html = (md: string, opts = {}) => {
  const doc = parseNote(md);
  return doc.blocks
    .map((b) => (b.type === 'prose' ? toHtml(renderNodes(b.nodes, opts).hast) : ''))
    .join('');
};
const firstCallout = (md: string) => parseNote(md).blocks.find((b) => b.type === 'callout') as CalloutBlock;

describe('wiki link', () => {
  it('解析目标与别名，并记录行号与所在块', () => {
    const doc = parseNote('第一行\n\n参见 [[法方程|那组方程]] 与 [[列空间]]。 ^p-a');
    expect(doc.wikiLinks).toEqual([
      { target: '法方程', alias: '那组方程', line: 3, blockId: 'p-a' },
      { target: '列空间', line: 3, blockId: 'p-a' },
    ]);
  });

  it('代码与公式里的 [[ ]] 不是链接', () => {
    const doc = parseNote('`[[不是]]` 和 $[[a]]$ 都不算，[[算]] 才算。');
    expect(doc.wikiLinks.map((l) => l.target)).toEqual(['算']);
  });

  it('能落地的渲染成链接，落不了地的渲染成显式的 unresolved', () => {
    const out = html('[[法方程|这组方程]] 与 [[不存在]]', {
      wikiHref: (t: string) => (t === '法方程' ? '#/atlas/n.normal-eq' : undefined),
    });
    expect(out).toContain('<a href="#/atlas/n.normal-eq" class="wikilink" data-target="法方程">这组方程</a>');
    expect(out).toContain('<span class="wikilink unresolved" data-target="不存在">不存在</span>');
  });

  it('callout 标题与正文里的链接也被收集', () => {
    const doc = parseNote('> [!xref] 知识链接 [[投影]]\n> 参见 [[法方程]]');
    expect(doc.wikiLinks.map((l) => l.target)).toEqual(['投影', '法方程']);
  });
});

describe('callout', () => {
  it('+ / - / 无 三种折叠状态', () => {
    expect(firstCallout('> [!side]+ 相关信息\n> x').fold).toBe('open');
    expect(firstCallout('> [!side]- 相关信息\n> x').fold).toBe('closed');
    expect(firstCallout('> [!side] 相关信息\n> x').fold).toBe('none');
  });

  it('类型大小写不敏感（Obsidian 行为）', () => {
    expect(firstCallout('> [!Side] 相关信息\n> x').kind).toBe('side');
  });

  it('普通引用块不是 callout', () => {
    const doc = parseNote('> 这只是一段引文。');
    expect(doc.blocks[0]!.type).toBe('prose');
  });

  it('白名单外的类型：内容保留，同时报 warning', () => {
    const doc = parseNote('> [!warning] 注意\n> 正文');
    const c = doc.blocks[0] as CalloutBlock;
    expect(c).toMatchObject({ type: 'callout', kind: 'warning', known: false, placement: 'main' });
    expect(doc.diagnostics).toMatchObject([{ severity: 'warning', code: 'unknown-callout', line: 1 }]);
  });

  it('只有标题没有正文', () => {
    const c = firstCallout('> [!focus] 本节聚焦');
    expect(c.titleText).toBe('本节聚焦');
    expect(c.body).toEqual([]);
  });

  it('[!res] 缺 span id 是错误', () => {
    const doc = parseNote('段落 ^p\n\n> [!res] 一个好资源 @p');
    expect(doc.diagnostics.map((d) => d.code)).toEqual(['res-missing-span']);
  });

  it('没有 @ 的图留在主栏', () => {
    expect(firstCallout('> [!figure] 图 1\n> ![a](a.svg)').placement).toBe('main');
  });
});

describe('旁栏对齐', () => {
  it('没有 @ 时对齐同一小节里的前一段，而不是更早的段落', () => {
    const doc = parseNote('甲 ^a\n\n乙 ^b\n\n> [!ask]\n> 能否建立联系？');
    expect((doc.blocks.at(-1) as CalloutBlock).alignTo).toBe('b');
  });

  it('不跨小节向前对齐：小节开头的旁栏块对齐到本节后一段', () => {
    const doc = parseNote('甲 ^a\n\n## 新小节\n\n> [!side] 相关信息\n> x\n\n乙 ^b');
    expect((doc.blocks.find((b) => b.type === 'callout') as CalloutBlock).alignTo).toBe('b');
  });

  it('@ 指向不存在的锚：报 error，并按就近规则兜底，不丢块', () => {
    const doc = parseNote('甲 ^a\n\n> [!side] 相关信息 @nope\n> x');
    expect(doc.diagnostics).toMatchObject([{ severity: 'error', code: 'dangling-align', line: 3 }]);
    expect((doc.blocks[1] as CalloutBlock).alignTo).toBe('a');
  });

  it('整篇只有旁栏块：单独成行并报 warning', () => {
    const doc = parseNote('> [!side] 相关信息\n> x');
    expect(doc.rows).toEqual([{ main: [], side: [doc.blocks[0]!.id] }]);
    expect(doc.diagnostics.map((d) => d.code)).toEqual(['side-unaligned']);
  });

  it('同一段可以挂多个旁栏块，按源码顺序', () => {
    const doc = parseNote('甲 ^a\n\n> [!side] 一 @a\n> x\n\n> [!res] s.one @a');
    expect(doc.rows[0]!.side).toHaveLength(2);
  });
});

describe('锚点', () => {
  it('重复的 ^锚 是错误，第二个不生效', () => {
    const doc = parseNote('甲 ^a\n\n乙 ^a');
    expect(doc.diagnostics.map((d) => d.code)).toEqual(['duplicate-anchor']);
    expect(doc.blocks.map((b) => b.id)).toEqual(['a', 'blk-1']);
  });

  it('^ 不在行尾时不是锚（如上标写法 x^2）', () => {
    const doc = parseNote('x^2 与 x ^2a 之后还有字');
    expect(doc.anchors.size).toBe(0);
  });

  it('slug：全角空格、标点、同名去重', () => {
    expect(slugify('第1节　列空间中的最近点')).toBe('第1节-列空间中的最近点');
    expect(slugify('点唯一，参数未必唯一')).toBe('点唯一参数未必唯一');
    expect(slugify('Normal Equations (2-1)')).toBe('normal-equations-2-1');
    const s = createSlugger();
    expect([s('小结'), s('小结'), s('小结')]).toEqual(['小结', '小结-1', '小结-2']);
  });
});

describe('原生 HTML 与安全', () => {
  it('<details> 跨多个节点时收成一块，渲染出完整的折叠结构', () => {
    const md = '<details>\n<summary>证明</summary>\n\n设 $x$ 为**任意**向量。\n\n</details>\n\n后文';
    const doc = parseNote(md);
    expect(doc.blocks).toHaveLength(2);
    const out = toHtml(renderNodes((doc.blocks[0] as ProseBlock).nodes).hast);
    expect(out).toMatch(/^<details>[\s\S]*<summary>证明<\/summary>[\s\S]*<strong>任意<\/strong>[\s\S]*<\/details>$/);
    expect(out).toContain('katex');
  });

  it('脚本、事件属性、javascript: 链接全部被剥掉', () => {
    const out = html(
      '<script>alert(1)</script>\n\n<img src="x" onerror="alert(1)">\n\n[点我](javascript:alert(1))',
    );
    expect(out).not.toMatch(/<script|onerror|javascript:/i);
  });

  it('坏公式不抛异常：记 math-render 诊断，其余照常渲染', () => {
    const doc = parseNote('前文 $\\frac{1}{$ 后文');
    const r = renderNodes((doc.blocks[0] as ProseBlock).nodes);
    expect(r.diagnostics.map((d) => d.code)).toEqual(['math-render']);
    expect(toHtml(r.hast)).toContain('后文');
  });
});

describe('公式（Obsidian 方言）', () => {
  it('独占一段的单行 $$…$$ 是独立公式；单 $ 与夹在文字中的 $$ 仍是行内', () => {
    const doc = parseNote('$$x^2$$\n\n$y$\n\n文字 $$z$$ 文字');
    const kinds = doc.blocks.map((b) => (b as ProseBlock).nodes[0]!.type);
    expect(kinds).toEqual(['math', 'paragraph', 'paragraph']);
  });

  it('callout 正文里的 $$…$$ 同样提升', () => {
    const c = firstCallout('> [!method] 方法\n> $$a=b$$');
    expect(c.body[0]!.type).toBe('math');
  });
});

describe('frontmatter', () => {
  it('嵌套结构不猜，记 warning 并跳过', () => {
    const doc = parseNote('---\ntitle: 甲\ntags:\n  - a\n---\n\n正文');
    expect(doc.frontmatter).toEqual({ title: '甲' });
    expect(doc.diagnostics.map((d) => d.code)).toEqual(['frontmatter-unsupported', 'frontmatter-unsupported']);
  });

  it('frontmatter 不产出正文块，行号仍按原文件计', () => {
    const doc = parseNote('---\ntitle: 甲\n---\n\n正文 ^p');
    expect(doc.blocks).toHaveLength(1);
    expect(doc.blocks[0]!.lines.start).toBe(5);
  });
});
