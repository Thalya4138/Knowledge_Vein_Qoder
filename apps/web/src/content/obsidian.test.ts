import { describe, expect, test } from 'vitest';
import { toHtml } from 'hast-util-to-html';
import { parseNote, renderNodes } from './index';
import { preprocessObsidian } from './obsidian';
import { tokenize } from './highlight';
import type { RenderOptions } from './render';

const html = (src: string, opts: RenderOptions = {}) => {
  const doc = parseNote(src);
  return doc.blocks
    .map((b) => (b.type === 'heading' ? '' : toHtml(renderNodes(b.type === 'callout' ? b.body : b.nodes, { footnotes: doc.footnotes, ...opts }).hast)))
    .join('\n');
};

describe('preprocessObsidian：逐行改写，行数不变', () => {
  test('%% 注释 %% 抹掉，跨行也行', () => {
    const src = 'a %%隐藏%% b\n%%\n整段\n注释\n%%\nc';
    const out = preprocessObsidian(src);
    expect(out.split('\n')).toHaveLength(src.split('\n').length);
    expect(out).not.toContain('隐藏');
    expect(out).not.toContain('整段');
    expect(out).toContain('a  b');
  });

  test('\\[ \\] 与 \\( \\) 改成 $$ 与 $；\\\\[4pt] 不动；代码里不动', () => {
    expect(preprocessObsidian('\\[ x^2 \\]')).toBe('$$ x^2 $$');
    expect(preprocessObsidian('设 \\( a+b \\) 为')).toBe('设 $a+b$ 为');
    expect(preprocessObsidian('$$a \\\\[4pt] b$$')).toBe('$$a \\\\[4pt] b$$');
    expect(preprocessObsidian('`\\(x\\)`')).toBe('`\\(x\\)`');
    expect(preprocessObsidian('```\n%% 代码里 %%\n\\[x\\]\n```')).toBe('```\n%% 代码里 %%\n\\[x\\]\n```');
  });
});

describe('行内：荧光、嵌入、标签', () => {
  test('==荧光== → <mark>', () => {
    expect(html('有 ==重点== 在')).toContain('<mark>重点</mark>');
  });

  test('行内代码里的 == 不动', () => {
    expect(html('`a == b`')).toContain('<code>a == b</code>');
  });

  test('![[图.png]] 找得到时是图片，找不到时明确标出', () => {
    const opts = { embedUrl: (t: string) => (t === '图.png' ? 'blob:x' : undefined) };
    expect(html('![[图.png|300]]', opts)).toMatch(/<img src="blob:x" alt="图.png" width="300">/);
    expect(html('![[不存在.png]]', opts)).toContain('class="ob-embed unresolved"');
    expect(html('![[不存在.png]]', opts)).not.toMatch(/^<p>!/);
  });

  test('#标签 → span；纯数字不是标签', () => {
    const out = html('看 #线性代数/投影 和 #123');
    expect(out).toContain('<span class="ob-tag">#线性代数/投影</span>');
    expect(out).not.toContain('#123</span>');
  });
});

describe('提示框与脚注', () => {
  test('Obsidian 的 [!tip] 不报诊断', () => {
    const doc = parseNote('> [!tip] 提示\n> 内容');
    expect(doc.diagnostics.filter((d) => d.code === 'unknown-callout')).toHaveLength(0);
    expect(doc.blocks[0]).toMatchObject({ type: 'callout', kind: 'tip' });
  });

  test('真正未知的类型仍然报诊断', () => {
    expect(parseNote('> [!zzz] x').diagnostics.some((d) => d.code === 'unknown-callout')).toBe(true);
  });

  test('脚注正文渲染在引用它的那一块里，id 不重复加前缀', () => {
    const out = html('正文[^1]\n\n[^1]: 脚注内容');
    expect(out).toContain('脚注内容');
    expect(out).not.toContain('user-content-user-content-');
  });
});

describe('代码着色', () => {
  test('python：关键字、字符串、注释、数字', () => {
    const toks = tokenize('def f(x):\n    return "a" # 注释\n    y = 42', 'python');
    const cls = (t: string) => toks.find(([, s]) => s === t)?.[0];
    expect(cls('def')).toBe('hl-kw');
    expect(cls('f')).toBe('hl-fn');
    expect(cls('"a"')).toBe('hl-str');
    expect(cls('# 注释')).toBe('hl-com');
    expect(cls('42')).toBe('hl-num');
  });

  test('拼回去与原文完全一致', () => {
    const src = 'int main() { /* c */ return 0; } // end';
    expect(tokenize(src, 'c').map(([, t]) => t).join('')).toBe(src);
  });

  test('代码块渲染出语言标记与着色 span', () => {
    const out = html('```js\nconst a = 1;\n```');
    expect(out).toContain('class="nr-code"');
    expect(out).toContain('data-lang="js"');
    expect(out).toContain('<span class="hl-kw">const</span>');
  });
});

describe('字色', () => {
  test('<span style="color:#…"> 保留颜色', () => {
    expect(html('这是<span style="color:#c0392b">红字</span>。')).toContain('<span style="color:#c0392b">红字</span>');
  });

  test('别的内联样式一律过滤，文字保留', () => {
    const out = html('<span style="position:fixed;top:0">盖住页面</span>和<span style="color:red;background:url(x)">混入</span>');
    expect(out).not.toContain('position');
    expect(out).not.toContain('url(');
    expect(out).toContain('盖住页面');
    expect(out).toContain('混入');
  });
});
