#!/usr/bin/env node
/**
 * 构建时渲染：把讲义 Markdown 编译成自包含 HTML。
 *
 * 设计要点（吃过亏）：
 *   1. 不依赖任何 CDN 的 JS。内容在构建时就渲染成 HTML，断网也能读。
 *   2. 公式：如果在线，KaTeX 从 CDN 加载并渲染；如果离线，保留原始 LaTeX 文本，
 *      仍然可读（只是不好看）。这不构成"白屏"。
 *   3. Obsidian callout（> [!type] 标题）渲染成带样式的块。
 *
 * 用法：node scripts/build-preview.mjs
 * 输出：preview/lecture.html
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const KB = 'content/demo/linear-algebra';
const OUT = 'preview/lecture.html';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ────────────────────────── 行内渲染 ────────────────────────── */
function inline(s) {
  let h = esc(s);
  // 行内公式先抽出来，避免被后续规则破坏
  const maths = [];
  h = h.replace(/\$\$([\s\S]+?)\$\$/g, (_, m) => {
    maths.push({ m, display: true });
    return `\u0000M${maths.length - 1}\u0000`;
  });
  h = h.replace(/\$([^$\n]+?)\$/g, (_, m) => {
    maths.push({ m, display: false });
    return `\u0000M${maths.length - 1}\u0000`;
  });
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (_, t, label) => `<span class="wikilink" title="知识库节点：${t}">${label || t}</span>`);
  h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
    (_, t, u) => `<a href="${u}" target="_blank" rel="noopener">${t}</a>`);
  // 还原公式
  h = h.replace(/\u0000M(\d+)\u0000/g, (_, i) => {
    const { m, display } = maths[+i];
    return display
      ? `<span class="math-display">$$${m}$$</span>`
      : `<span class="math-inline">$${m}$</span>`;
  });
  return h;
}

/* ────────────────────────── 块渲染 ────────────────────────── */
const CALLOUT_CLASS = {
  material: 'b-material', note: 'b-note', aside: 'b-aside', link: 'b-link',
  trap: 'b-trap', exercise: 'b-exercise', method: 'b-method',
  viewpoint: 'b-viewpoint', unsourced: 'b-unsourced',
};

function renderBody(lines) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // 空行
    if (!line.trim()) { i++; continue; }

    // details
    if (/^<details>/.test(line.trim())) {
      const summary = (lines[i + 1] || '').replace(/<\/?summary>/g, '').trim();
      const buf = [];
      i += 2;
      while (i < lines.length && !/^<\/details>/.test(lines[i].trim())) buf.push(lines[i++]);
      i++;
      out.push(`<details><summary>${inline(summary)}</summary>${renderBody(buf)}</details>`);
      continue;
    }

    // 标题
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const lv = h[1].length;
      out.push(`<h${lv}>${inline(h[2])}</h${lv}>`);
      i++;
      continue;
    }

    // 分割线
    if (/^---+$/.test(line.trim())) { out.push('<hr>'); i++; continue; }

    // 表格
    if (/^\|/.test(line) && /^\|[\s:|-]+\|$/.test((lines[i + 1] || '').trim())) {
      const head = line.split('|').slice(1, -1).map((c) => c.trim());
      i += 2;
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) {
        rows.push(lines[i].split('|').slice(1, -1).map((c) => c.trim()));
        i++;
      }
      out.push('<table><thead><tr>' + head.map((c) => `<th>${inline(c)}</th>`).join('')
        + '</tr></thead><tbody>'
        + rows.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('')
        + '</tbody></table>');
      continue;
    }

    // 引用块
    if (/^>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>${renderBody(buf)}</blockquote>`);
      continue;
    }

    // 无序列表
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i++].replace(/^\s*[-*]\s+/, ''));
      }
      out.push('<ul>' + items.map((x) => `<li>${inline(x)}</li>`).join('') + '</ul>');
      continue;
    }

    // 有序列表
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i++].replace(/^\s*\d+\.\s+/, ''));
      }
      out.push('<ol>' + items.map((x) => `<li>${inline(x)}</li>`).join('') + '</ol>');
      continue;
    }

    // 独占一行的 $$ 公式
    if (/^\$\$$/.test(line.trim())) {
      const buf = [];
      i++;
      while (i < lines.length && !/^\$\$$/.test(lines[i].trim())) buf.push(lines[i++]);
      i++;
      out.push(`<div class="math-display">$$${esc(buf.join('\n'))}$$</div>`);
      continue;
    }

    // 段落（连续非空行）
    const para = [];
    while (i < lines.length && lines[i].trim()
           && !/^(#{1,4}\s|>|\||<details>|---+$|\s*[-*]\s|\s*\d+\.\s|\$\$$)/.test(lines[i])) {
      para.push(lines[i++]);
    }
    if (!para.length) { i++; continue; }
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return out.join('\n');
}

function renderNote(md) {
  const lines = md.split('\n');
  const out = [];
  let i = 0;
  let buf = [];
  const flush = () => { if (buf.length) { out.push(renderBody(buf)); buf = []; } };

  while (i < lines.length) {
    const open = lines[i].match(/^>\s*\[!([a-zA-Z_-]+)\][+-]?\s*(.*)$/);
    if (open) {
      flush();
      const type = open[1];
      const title = open[2].trim();
      const body = [];
      i++;
      while (i < lines.length && /^>/.test(lines[i])) {
        body.push(lines[i++].replace(/^>\s?/, ''));
      }
      const cls = CALLOUT_CLASS[type] || '';
      if (type === 'link') {
        out.push(`<div class="block ${cls}" onclick="this.classList.toggle('open')">`
          + `<div class="block-title"><span class="badge">关联</span>${inline(title)}`
          + `<span class="hint">点击展开</span></div>`
          + `<div class="body">${renderBody(body)}</div></div>`);
      } else if (type === 'trap') {
        out.push(`<div class="block ${cls}"><div class="block-title">⚠ ${inline(title)}</div>`
          + `${renderBody(body)}</div>`);
      } else {
        const t = title ? `<div class="block-title">${inline(title)}</div>` : '';
        out.push(`<div class="block ${cls}">${t}${renderBody(body)}</div>`);
      }
      continue;
    }
    buf.push(lines[i++]);
  }
  flush();
  return out.join('\n');
}

/* ────────────────────────── 组装 ────────────────────────── */
const kb = JSON.parse(await readFile(path.join(KB, 'kb.json'), 'utf8'));
const chapters = [];
for (const ch of kb.outline) {
  const p = path.join(KB, ch.notePath);
  if (!existsSync(p)) continue;
  let md = await readFile(p, 'utf8');
  md = md.replace(/^---\n[\s\S]*?\n---\n/, '');
  chapters.push({ id: ch.id, title: ch.title, html: renderNote(md) });
}

const toc = chapters.map((c, i) =>
  `<a href="#${c.id}" data-target="${c.id}" class="${i === 0 ? 'active' : ''}">${esc(c.title)}</a>`
).join('\n');

const bodies = chapters.map((c, i) =>
  `<article id="${c.id}" class="${i === 0 ? 'show' : ''}">${c.html}</article>`
).join('\n');

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(kb.title)}</title>
<style>
:root{--ink:#1a1a1a;--ink-soft:#4a4a4a;--muted:#6b6b6b;--paper:#fbfaf7;
--line:#e2ded5;--accent:#1f3a5f;--lyric:#efece4;--amber:#b8860b;--amber-bg:#fdf8f0}
*{box-sizing:border-box}
html{font-size:17px}
body{margin:0;background:var(--paper);color:var(--ink);
font-family:"Source Han Serif SC","Noto Serif SC","Songti SC",SimSun,"宋体",Georgia,serif;
line-height:1.85;-webkit-font-smoothing:antialiased}
.layout{display:grid;grid-template-columns:220px minmax(0,1fr);max-width:1200px;margin:0 auto}
nav{position:sticky;top:0;height:100vh;overflow:auto;padding:2.2rem 1rem;
border-right:1px solid var(--line);font-family:system-ui,"PingFang SC",sans-serif;font-size:.82rem}
nav .brand{font-size:.92rem;font-weight:600;margin-bottom:.25rem;line-height:1.4}
nav .sub{color:var(--muted);font-size:.72rem;margin-bottom:1.4rem;line-height:1.5}
nav a{display:block;color:var(--ink-soft);text-decoration:none;padding:.3rem .5rem;border-radius:4px}
nav a:hover{background:var(--lyric)}
nav a.active{background:var(--accent);color:#fff}
main{padding:3rem 3.2rem 8rem;max-width:48em}
article{display:none} article.show{display:block}
h1{font-size:1.7rem;line-height:1.35;margin:0 0 2rem;font-weight:600}
h2{font-size:1.18rem;margin:2.8rem 0 1rem;padding-top:1.3rem;border-top:1px solid var(--line)}
h3{font-size:1.02rem;margin:1.8rem 0 .7rem}
h4{font-size:.96rem;margin:1.4rem 0 .5rem}
p{margin:0 0 1.1rem;text-align:justify;text-justify:inter-ideograph}
strong{font-weight:600}
a{color:var(--accent)}
hr{border:0;border-top:1px solid var(--line);margin:2.6rem 0}
ul,ol{margin:0 0 1.1rem;padding-left:1.5rem}
li{margin:.3rem 0}
.block{margin:1.7rem 0;padding:1rem 1.3rem;border-radius:5px;position:relative}
.block-title{font-size:.8rem;font-family:system-ui,"PingFang SC",sans-serif;
font-weight:600;color:var(--ink-soft);letter-spacing:.02em}
.b-material{border:1px solid var(--line);background:#fff;padding:1.15rem 1.3rem;margin-left:-1.4em;margin-right:-1.4em}
.b-material>.block-title{position:absolute;top:-.7rem;left:1.1rem;background:var(--paper);padding:0 .45rem;line-height:1.2}
.b-note{border-left:2px solid var(--line);border-radius:0;padding:.2rem 0 .2rem 1.1rem;
font-size:.9rem;color:var(--ink-soft);background:transparent}
.b-note>.block-title,.b-aside>.block-title{display:block;margin-bottom:.3rem}
.b-aside{border-left:2px solid var(--line);border-radius:0;padding:.2rem 0 .2rem 1.1rem;background:transparent}
.b-trap{background:var(--amber-bg);border-left:3px solid var(--amber);border-radius:0 4px 4px 0;padding:.95rem 1.2rem}
.b-trap>.block-title{color:#8a6300;margin-bottom:.4rem}
.b-link{background:#fffdf8;border:1px solid var(--line);border-radius:6px;
box-shadow:0 1px 3px rgba(0,0,0,.05);cursor:pointer;padding:.9rem 1.1rem}
.b-link::after{content:"";position:absolute;top:0;right:0;width:15px;height:15px;
background:linear-gradient(225deg,var(--paper) 50%,var(--line) 50%);border-radius:0 6px 0 0}
.b-link>.block-title{display:flex;align-items:center;gap:.45rem;color:var(--accent);margin-bottom:.5rem}
.b-link .badge{font-size:.68rem;background:var(--accent);color:#fff;padding:.08rem .4rem;
border-radius:3px;font-weight:500}
.b-link .hint{font-size:.72rem;color:var(--muted);font-family:system-ui,sans-serif;font-weight:400}
.b-link .body{display:none}
.b-link.open .body{display:block}
.b-exercise{background:#fff;border:1px solid var(--line);padding:1rem 1.2rem}
.b-exercise>.block-title{display:block;margin-bottom:.55rem;color:var(--accent)}
.b-method{border:1px dashed var(--line);background:transparent}
.b-viewpoint{border-left:3px solid var(--accent);border-radius:0;background:transparent}
.b-unsourced{background:var(--lyric);font-size:.9rem}
details{margin:1.1rem 0;padding:.7rem 1rem;background:var(--lyric);border-radius:4px}
summary{cursor:pointer;font-family:system-ui,"PingFang SC",sans-serif;font-size:.86rem;color:var(--accent)}
details[open] summary{margin-bottom:.7rem}
table{border-collapse:collapse;width:100%;margin:1.5rem 0;font-size:.88rem;
font-family:system-ui,"PingFang SC",sans-serif}
th,td{border-bottom:1px solid var(--line);padding:.55rem .65rem;text-align:left;vertical-align:top}
th{background:var(--lyric);font-weight:600}
.b-material>*:first-child{margin-top:0}
.b-material>*:last-child{margin-bottom:0}
.b-material>.block-title~*:first-of-type{margin-top:0}
blockquote{margin:1.4rem 0;padding-left:1rem;border-left:2px solid var(--line);color:var(--ink-soft)}
.wikilink{color:var(--accent);border-bottom:1px dotted var(--accent);cursor:help}
code{font-family:Consolas,monospace;font-size:.86em;background:var(--lyric);padding:.1em .35em;border-radius:3px}
.math-display{display:block;text-align:center;margin:1.2rem 0;font-family:Consolas,monospace;
font-size:.9rem;color:var(--ink-soft);overflow-x:auto}
@media(max-width:820px){.layout{grid-template-columns:1fr}
nav{position:static;height:auto;border-right:0;border-bottom:1px solid var(--line)}
main{padding:1.5rem 1.1rem 4rem}
.b-material{margin-left:0;margin-right:0}}
</style>
</head>
<body>
<div class="layout">
<nav><div class="brand">${esc(kb.title)}</div>
<div class="sub">${esc(kb.subtitle || '')}</div>
${toc}</nav>
<main>
${bodies}
</main>
</div>
<script>
document.querySelectorAll('nav a').forEach(a=>{
  a.onclick=e=>{e.preventDefault();
    const id=a.dataset.target;
    document.querySelectorAll('article').forEach(x=>x.classList.toggle('show',x.id===id));
    document.querySelectorAll('nav a').forEach(x=>x.classList.toggle('active',x===a));
    window.scrollTo(0,0);};
});
</script>
<!-- 公式：在线时由 KaTeX 接管；离线则保留上面的纯文本 LaTeX，不白屏 -->
<script>
(function(){
  var s=document.createElement('script');
  s.src='https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js';
  s.onload=function(){
    var c=document.createElement('script');
    c.src='https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js';
    c.onload=function(){
      renderMathInElement(document.body,{delimiters:[
        {left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}
      ],throwOnError:false});
    };
    document.head.appendChild(c);
    var l=document.createElement('link');
    l.rel='stylesheet';l.href='https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css';
    document.head.appendChild(l);
  };
  document.head.appendChild(s);
})();
</script>
</body>
</html>`;

await mkdir('preview', { recursive: true });
await writeFile(OUT, html, 'utf8');
console.log(`✓ 已生成 ${OUT}（${(html.length / 1024).toFixed(0)} KB）`);
console.log('  内容为构建时渲染，断网可读；公式离线时显示为 LaTeX 源码。');
