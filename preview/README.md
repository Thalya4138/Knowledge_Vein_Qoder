# preview/ · 视觉样张（不是应用代码）

## 这是什么

| 文件 | 是什么 | 状态 |
| --- | --- | --- |
| `textbook-demo/index.html` | **讲义阅读器的视觉验收样张**：一节「列空间中的最近点」，人教版教科书式主栏 + 旁栏 | ✅ 2026-11-12 用户认可，**T1 阅读器以它为准** |
| `textbook-demo/src.html` | 样张源文件（含 `$…$` 公式原文） | 改内容改这里 |
| `textbook-demo/build.mjs` | 把 `src.html` 的公式用 KaTeX 预渲染进 `index.html`（离线可开、无 CDN） | 临时脚本，见下 |
| `lecture.html` | 更早的一版预览，由 `scripts/build-preview.mjs` 从 `content/demo` 生成 | 已被 textbook-demo 取代，仅作对照 |
| `shot-full.png` | **textbook-demo 的整页截图**（4 页：问题探讨 → 本节聚焦 → 主栏+旁栏正文 → 表 2-1 → 思维训练 → 练习与应用） | 帖子/README 可直接用 |

**直接双击 `textbook-demo/index.html` 就能看。**

## 它在整个产品里的位置（别高估它）

```text
01 学习工作台
 ├─ 资源导入 / 系统发现资源           ✗ 未做
 ├─ 资源 → 讲义生成（多源融合）       ✗ 未做（样张是人工按 prompt 写的，不是生成的）
 ├─ ★ 讲义阅读：主栏+旁栏、片段级来源   ◐ ← 只有这一块，而且是静态 HTML
 ├─ 资源库 / 导航汇总页               ✗ 未做
 └─ 问题式检索 + 一键补入             ✗ 未做
02 实验室 · 03 关联探索 · 04 图谱     ✗ 全部未做
```

完整对照见 [`docs/REQUIREMENTS_TRACE.md`](../docs/REQUIREMENTS_TRACE.md)。

## 它证明了什么 / 没证明什么

**证明了**：
- 「人读得懂」的目标形态是可以写出来的：教材腔、两种声音、栏目系统、图表编号、可折叠练习。
- 片段级定位可行：视频时间戳（取自 MIT OCW 官方字幕）、PDF 页码、网页 `#:~:text=` 文本锚。
- 每条旁栏资源带"为什么链到这里"，而且理由是能被核对的（引文就在抽屉里）。

**没证明**（评委一定会问）：
- **系统能不能从一堆资源自动产出这个质量**。样张是按 `prompts/NOTE_GENERATION.md` 人工写的。
  这是本项目最大的未验证假设——比赛版要么做出生成链路，要么在帖子里诚实写清"样张为人工示范"。
- 它是 HTML，不是 Markdown。真源仍是 `content/**/notes/*.md`；阅读器要把 md + sidecar 渲染成这个样子。

## 开发时如何使用

- 做 T1 阅读器时，**样张是视觉与交互的验收标准**，不是要扩展的代码。
- 要从样张反推的是：md 里需要哪些语法（栏目块、旁栏锚、资源引用 id）、
  `resources/manifest.json` 的 `SourceSpan` 需要哪些字段（`start` 秒、`page`、文本锚、引文、`why`）。
- `app.js` 里 `RESOURCES` 那张表就是 `SourceSpan` 的雏形，字段可直接参考。

## 重建 index.html

`build.mjs` 目前从一个**临时目录**加载 katex（`KATEX_FROM` 环境变量，默认指向 `%TEMP%\katexbuild`）。
这是样张阶段的权宜之计；进入 `apps/web` 后 katex 作为正式依赖安装，此脚本可删除。

## 第三方材料与许可

- `textbook-demo/sources/MIT18_06SCF11_Ses2.2sum.pdf`：MIT OpenCourseWare 18.06SC，**CC BY-NC-SA 4.0**，
  非商业、需署名、相同方式共享；样张中已署名。
- 视频引文与时间戳：MIT OCW Lecture 15（YouTube `Y_Ac6KiQ1t0`）官方字幕，CC BY-NC-SA 4.0。
- Wikipedia 引文：CC BY-SA 4.0。
- `fonts/` 与 `katex.min.css`：KaTeX，MIT License。
