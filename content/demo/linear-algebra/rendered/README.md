# rendered/ · 讲义的期望渲染结果（不是应用代码）

本目录是 `../notes/2.1-列空间中的最近点.md` **应当被渲染成的样子**，手工制作，2026-11-12 用户认可。
它与讲义的关系是"输入 → 期望输出"：阅读器（T1）把 md 渲染出来，与本目录并排对比，差距即缺陷。

**直接双击 `index.html` 就能看。** 整页截图：`shot-full.png`。

| 文件 | 是什么 |
| --- | --- |
| `index.html` | 样张成品（公式已用 KaTeX 预渲染，离线可开） |
| `src.html` | 样张源文件（含 `$…$` 公式原文） |
| `app.js` | 旁栏资源抽屉；`RESOURCES` 表与 `../resources/manifest.json` 的 span 一一对应 |
| `style.css` / `katex.min.css` / `fonts/` | 版式与公式字体 |
| `build.mjs` | 把 `src.html` 的公式预渲染进 `index.html` |
| `shot-full.png` | 整页截图（4 页：问题探讨 → 本节聚焦 → 主栏+旁栏正文 → 表 2-1 → 思维训练 → 练习与应用） |

版式与语言规则：`prompts/NOTE_GENERATION.md` §3.5、§6.5；证据：`docs/TEXTBOOK_STYLE_ANALYSIS.md`。

## 它证明了什么 / 没证明什么

**证明了**
- "人读得懂"的目标形态写得出来：教材腔、栏目系统、图表编号、可折叠练习。
- 片段级定位可行：视频时间戳（取自 MIT OCW 官方字幕）、PDF 页码、网页 `#:~:text=` 文本锚。
- 每条旁栏资源带"为什么链到这里"，且理由可核对（引文就在抽屉里）。

**没证明**
- 系统能否从一堆资源**自动**产出这个质量。样张与讲义均为人工撰写；动态生成在平台搭起来后再做（`docs/REQUIREMENTS_TRACE.md` D-1）。帖子里需如实写明"讲义为人工示范"。

## 开发时如何使用

- 样张是 T1 阅读器**视觉与交互的验收标准**，不是要扩展的代码。
- 讲义 md 已按 §3.5 语法写好（栏目块、`^段落锚`、`> [!res] s.id @锚`），span 已在 manifest 中补齐。
- 样张与讲义的已知差异：md 版补上了练习答案与思维训练参考思路（默认折叠）；样张未包含。

## 与讲义的同步

讲义是唯一内容真源。改内容先改 md；样张只在**版式**变化时更新（改 `src.html` → 运行 `build.mjs`）。
`build.mjs` 目前从临时目录加载 katex（`KATEX_FROM` 环境变量）；`apps/web` 建立后 katex 作为正式依赖，此脚本可删除。

## 第三方材料与许可

- 讲义 PDF（`../resources/files/MIT18_06SCF11_Ses2.2sum.pdf`）、视频引文与时间戳：MIT OpenCourseWare 18.06SC，**CC BY-NC-SA 4.0**（非商业、署名、相同方式共享）。
- Wikipedia 引文：CC BY-SA 4.0。
- `fonts/` 与 `katex.min.css`：KaTeX，MIT License。
