#!/usr/bin/env node
/**
 * 把 `::: type 标题` … `:::` 语义块转换成 Obsidian 原生 callout 语法：
 *
 *   > [!type] 标题
 *   > 正文（每行加 "> "）
 *
 * 为什么改：项目要求知识库「落盘成本地、可被 Obsidian 直接打开」。
 * `:::` 是 markdown-it-container 的私有扩展，Obsidian 不认识，会原样显示成文字。
 * callout 则是 Obsidian 原生语法，而且在 GitHub / 纯文本里会优雅降级为引用块，
 * 不会露出一堆 `:::`。
 *
 * 用法：node scripts/to-callouts.mjs [--check]
 *   --check  只检查还有多少 ::: 块，不写文件
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const KB = 'content/demo/linear-algebra/notes';
const checkOnly = process.argv.includes('--check');

// 块类型 → Obsidian callout 类型
// Obsidian 内置：note / abstract / info / tip / success / question / warning /
//               failure / danger / bug / example / quote
// 其余是自定义类型，需要 CSS snippet（见 scripts/obsidian-snippets/cognitive-atlas.css）
const MAP = {
  // 保持语义名，不映射成 Obsidian 内置名。
  // 原因：内置名（warning/question）表达的是"语气"，我们要表达的是"内容功能"。
  // 视觉样式由 CSS snippet 提供；即使不装 snippet，callout 仍会渲染成普通引用块，可用。
  material: 'material',
  note: 'note',
  aside: 'aside',
  link: 'link',
  trap: 'trap',
  exercise: 'exercise',
  method: 'method',
  viewpoint: 'viewpoint',
  unsourced: 'unsourced',
};

const files = (await readdir(KB)).filter((f) => f.endsWith('.md'));

let total = 0;
const report = [];

for (const f of files) {
  const p = path.join(KB, f);
  let text = await readFile(p, 'utf8');
  let count = 0;
  let out = [];
  let inBlock = null;

  for (const line of text.split('\n')) {
    const open = line.match(/^::: ([a-zA-Z_-]+)\s*(.*)$/);
    if (open) {
      const [, type, title] = open;
      const mapped = MAP[type];
      if (!mapped) throw new Error(`${f}: 未知块类型 ${type}`);
      inBlock = { type: mapped, title: title.trim(), lines: [] };
      count++;
      continue;
    }
    if (/^:::\s*$/.test(line) && inBlock) {
      // 输出 callout：标题行 + 每行加 "> "
      const head = inBlock.title ? `> [!${inBlock.type}] ${inBlock.title}` : `> [!${inBlock.type}]`;
      out.push(head);
      // 去掉块内首尾空行
      const body = inBlock.lines.slice();
      while (body.length && !body[0].trim()) body.shift();
      while (body.length && !body[body.length - 1].trim()) body.pop();
      for (const b of body) out.push(b.trim() === '' ? '>' : `> ${b}`);
      out.push('');           // 块后空行
      inBlock = null;
      continue;
    }
    if (inBlock) inBlock.lines.push(line);
    else out.push(line);
  }

  total += count;
  report.push(`${f}: ${count} 块`);
  if (!checkOnly && count > 0) {
    // 压缩连续空行
    const merged = out.join('\n').replace(/\n{3,}/g, '\n\n');
    await writeFile(p, merged, 'utf8');
  }
}

console.log(report.join('\n'));
console.log(`\n共 ${total} 个块${checkOnly ? '（仅检查）' : ' 已转换'}`);
