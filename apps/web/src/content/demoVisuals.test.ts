import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const KB = new URL('../../../../content/demo/linear-algebra/', import.meta.url);
const DOCUMENTS = [
  'notes/2.1-列空间中的最近点.md',
  'explore/fragments.md',
  'explore/meta.md',
  'explore/cross.md',
  'explore/cross-bio.md',
];

type Visual = {
  block: string;
  caption: string;
  label: string;
  number: string;
  alt: string;
  src: string;
};

const visuals = (markdown: string): Visual[] => [...markdown.matchAll(
  /^>\s*\[!figure\][^\n]*\n>\s*!\[([^\]]+)\]\(([^)\s]+)\)/gm,
)].map((match) => {
  const caption = match[0]!.split('\n')[0]!;
  const number = /图\s+(\d+(?:-\d+)?)/.exec(caption)?.[1];
  if (!number) throw new Error(`图块缺编号：${caption}`);
  return {
    block: match[0],
    caption,
    label: `图 ${number}`,
    number,
    alt: match[1]!.trim(),
    src: match[2]!,
  };
});

describe.each(DOCUMENTS)('解释性图示：%s', (relativePath) => {
  const markdown = readFileSync(new URL(relativePath, KB), 'utf8');
  const figures = visuals(markdown);

  it('至少有一张图，编号连续且正文就地引用', () => {
    expect(figures.length).toBeGreaterThan(0);
    const chapter = figures[0]!.number.includes('-') ? figures[0]!.number.split('-')[0] : null;
    const numbers = figures.map((figure) => Number(
      chapter ? figure.number.split('-')[1] : figure.number,
    ));
    expect(numbers).toEqual(numbers.map((_, index) => index + 1));
    const prose = figures.reduce((text, figure) => text.replace(figure.block, ''), markdown);
    for (const figure of figures) expect(prose).toContain(figure.label);
  });

  it('每张图有具体 alt、真实本地文件、SVG 标题与描述', () => {
    for (const figure of figures) {
      expect(figure.alt.length, `${relativePath} ${figure.label} 的 alt 过于简略`).toBeGreaterThanOrEqual(8);
      expect(['图片', '示意图', '图']).not.toContain(figure.alt);
      const file = resolve(dirname(fileURLToPath(new URL(relativePath, KB))), decodeURI(figure.src));
      expect(existsSync(file), `${relativePath} 缺图片 ${figure.src}`).toBe(true);
      const svg = readFileSync(file, 'utf8');
      expect(svg).toMatch(/<title(?:\s|>)/);
      expect(svg).toMatch(/<desc(?:\s|>)/);
    }
  });

  it('图注写明本项目原创与 MIT 许可', () => {
    for (const figure of figures) expect(figure.caption).toContain('本项目原创，MIT');
  });
});
