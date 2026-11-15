# 开发日志 / 过程证据

> **只记录实际发生的事。** 未运行的写"未验证"，不写"通过"。
> 这份日志同时是比赛帖子第 5 段（Qoder 开发过程）的素材来源。

---

## 2026-11-15 · QoderWang1 · 修 PR #6 CI TS2307：补回被 .gitignore 吞掉的 WorkspacePage

**目标**：修复 PR #6（`task/T0-1-QoderPeng1`）`verify` 工作流的类型检查失败
（`App.tsx(5,31) TS2307: Cannot find module './features/workspace/WorkspacePage'`）。
**明确不做**：不碰 `main`、不改其余三视口页与外壳、不削弱隐私规则、不删功能或加空壳骗 CI。

**根因**（两层）：

1. `.gitignore` 私有知识库规则里的 `workspace/` **未锚定**，匹配任意层级同名目录，含
   `apps/web/src/features/workspace/`。11-15 同步提交（`8bf6857`）时 `git add` 静默跳过该目录：
   文件在 QoderPeng1 本地工作区存在（故本地 typecheck / test / 截图全过），但从未进入 commit。
   CI 在 Linux checkout 提交树 → 缺文件 → TS2307。其余三视口目录不同名，未受影响。
2. 该文件在 git 全历史任何 ref 中都不存在（`git log --all -S 'WorkspacePage'` 只命中 App.tsx 的
   import），原实现不可恢复，按交付契约重建。

**做了什么**：

1. 按 T0-1 交付契约重建 `apps/web/src/features/workspace/WorkspacePage.tsx`（本日志「T0-1 交付」：
   「工作台列大纲（状态徽章）」；接龙 #11）：大纲运行时取自 `demoKb.outline`，`written/planned`
   状态徽章复用已提交的 `.outline-list` / `.badge.written` / `.badge.planned` 样式；空状态如实说明
   阅读器未接入并给下一步动作；成稿节链接静态样张；统计走 `homeStats()`。文案结构对齐其余三视口占位页。
2. `.gitignore` 加一条精确例外 `!apps/web/src/features/workspace/`（置于私有规则块之后），
   **隐私规则覆盖面不变**；`git check-ignore -v` 验证该文件不再被忽略。
3. 证据截图 `docs/evidence/t0-1-workspace-{desktop,narrow}.png`（headless Chrome 1440×900 / 414×896）。
4. HANDOFF 接龙 #14 + §4.0 指针；更正 #13 的分支名（实际推送名 `task/T0-1-QoderPeng1`，即 PR #6）。

**验证**（本分支实跑）：

```text
$ npm ci（首跑 EPERM：上一会话遗留 vite dev server PID 1584 锁住 @rolldown 原生绑定；
  经用户授权结束它与遗留 preview PID 11388 后重装成功）
$ npm run verify:content → ✓ 内容校验通过
$ npm run typecheck     → 无输出（退出码 0）
$ npm run test          → Test Files 5 passed (5) / Tests 70 passed (70)
$ npm run build         → index-SH76PsvM.js 281.32 kB │ gzip 90.65 kB
$ 浏览器（in-app 面板 + headless Chrome）：/workspace 深链可达，大纲 3 节 / 徽章 / 样张链接正确；
  点「查看已接受的关系」→ /atlas 渲染 9 条带理由关系；控制台 0 错误 0 警告；
  桌面三栏 / 窄屏单栏见 docs/evidence/t0-1-workspace-*.png
```

**已知缺陷**：重建文案与丢失原件不可能逐字相同（build 数字与 #13 声明的 281.30 kB / gzip 90.72 kB
略有出入，系文案差异）；功能与交付声明逐条对齐。

**下一步**：本次 push 后 PR #6 CI 应转绿，合并仍由用户做；T0-3 从合并后的 `main` 起。

---

## 2026-11-15 · QoderPeng1 · GitHub 同步：本地 main 并入远端，保留 T0-1

**目标**：按用户要求「根据 GitHub 上的库同步本地文件，保留今天 T0-1 的工作成果」——
本地 `main` = GitHub `main`（`b70cb87`）+ T0-1 外壳。**明确不做**：不推 `main`（回推走 PR）、
不改 `content/demo` 数学内容与 `prompts/*.md`、不部署。

**做了什么**

1. 对比：`origin/main` 与本地 `main`（`2f5a558`）历史不连通、42 个文件不同——远端多了 T0-2 选型定稿
   （QoderWang1 版）、T1-1 解析器（`apps/web/src/content/`，remark 系新依赖）、T0-0 公网截图、修复版 `ci.yml`；
   本地多了 T0-1 全套。两份 ADR-0002 选型**实质一致**（Vite+React+TS / unified+KaTeX / CodeMirror 6 /
   React Flow / IndexedDB+Dexie），取 GitHub 文本，状态行补用户 2026-11-15「选型可行」采纳确认。
2. 方案（用户选定**线性叠加**）：新分支 `task/sync-main-T0-1-QoderPeng1` 从 `origin/main` 出发，
   叠入 T0-1 的 17 个文件（外壳代码 / 配置 / 证据截图）。
3. 文档合并：HANDOFF 两边接龙 #9/#10 撞号且内容不同 → 远端 #1–#10 保留，本地两条改编号为 **#11/#12**，
   追加 #13 本条；DEVELOPMENT_LOG 保留远端全部条目，另补本地独有的 11-12「晚 6」与 11-15 T0-1 三条
   （本地两条 T0-2 日志按用户决定丢弃）；`ci.yml`、`package.json`/lock 取远端（本地那份 `ci.yml`
   缺 `on:` 且有 `actioon:ns` 拼写错误，已被远端修复版替代）。
4. 安全网：同步前的本地 `main` 存为 `backup/local-main-pre-sync`；本地 `task/T0-1-QoderPeng1`、
   `task/T0-2-QoderPeng1` 保留但勿再推送。

**验证**（本轮实跑）

```text
$ npm ci（按远端 lock 重装，含 T1-1 remark 系依赖）
$ npm run verify:content → ✓ 通过
$ npm run typecheck     → 无输出
$ npm run test          → Test Files 5 passed (5) / Tests 70 passed (70)（远端 64 + T0-1 stats 6）
$ npm run build         → index-19ssRwwN.js 281.30 kB │ gzip 90.72 kB（与 T0-1 交付数字一致；解析器未接外壳不入包）
```

**已知缺陷**：浏览器实测沿用 T0-1 交付时的两张截图（外壳代码未变）；`origin/main` 已含 T1-1 解析器
但尚未接入界面（T1-2 的事）。

**下一步**：同步分支开 PR 由用户合并；T0-3（zod 领域类型）从合并后的 `main` 起。

---

## 2026-11-15 · QoderPeng1 · T0-1 复验（用户指派为检查者）

- **做什么**：按 HANDOFF §1 审查者职责复验 T0-1 交付声明——亲自重跑四道门、抽查 `apps/web` 源码、浏览器实测路由、核对截图与 commit 署名。**不做**：不改业务代码、不认领新任务、不替用户拍板。
- **复验结果（全部真实输出）**：
  - `npm run verify:content` ✓ `✓ 内容校验通过（节点 / 关系 / 引用完整性 / 讲义链接 / 资源来源 / 覆盖矩阵 / 布局与证据）`
  - `npm run typecheck` ✓ 无输出（退出码 0）
  - `npm run test` ✓ `Test Files 3 passed (3) / Tests 24 passed (24)`——与卡上预期 24 条一致
  - `npm run build` ✓ `index-19ssRwwN.js 281.30 kB │ gzip: 90.72 kB`——与交付声明数字一致，且产物哈希与交付时 `dist/` 里的文件**相同**（构建可复现）
  - 浏览器（browser-use MCP，dev server 5175）：首页、`/workspace` `/lab` `/connection`、深链直访 `/atlas`、未知路径 404 页全部可达；控制台 0 错误 0 警告；`/atlas` 页实渲染 9 条 accepted 关系（中文类型标签 + explanation），数据确实穿过外壳
  - 源码抽查：`main.tsx`（BrowserRouter + ErrorBoundary 包裹）、`App.tsx`（三栏 + 状态条 + 四路由 + 404）、`HomePage.tsx`（三按钮 + 运行时统计 + 真实样张 iframe 且诚实标注）、`stats.ts`/`stats.test.ts`（纯函数 + 防写死测试）、四视口占位页（空状态均给下一步动作）、`vite.config.ts`（publicDir 指向 `content/`）——与交付声明逐条吻合
  - 截图实看：`t0-1-desktop.png`（三栏）、`t0-1-narrow.png`（单栏）与声明一致
- **审查中发现的问题**：
  1. **T0-1 的 4 个 commit（`276c9dd` `d308873` `e2e63fa` `76773af`）均缺 `Agent:` trailer**（HANDOFF §1 署名三处之一；T0-2 的 commit 都有）。已提交的本地历史不建议改写，**后续提交必须补 trailer**。
  2. 交接卡 §4.0 合并状态曾写「均由用户在本地合并进 `main`」，与 git 实际不符（`main` 停在 `b1a44ec`）——本轮已在指针里更正。
  3. `apps/web/node_modules/`（陈旧 vitest 缓存）存在，已被 `.gitignore` 挡住，但 Obsidian 会索引（HANDOFF §6 已知坑）——建议删除，未擅动。
  4. 观察项（不构成缺陷）：外壳 UI 文案用 15px/1.6 sans——AGENTS §4 的「衬线 ≥16px / 行高 1.7」针对讲义正文，讲义正文目前由样张 iframe 自带样式，T1 阅读器需守住该底线。
- **环境插曲（过程记录）**：复验开始时 `node_modules/.bin` 为空（tsc/vite/vitest shim 缺失，先于本次审查存在）；`npm ci` 恢复时遇 EPERM——上一会话遗留的本仓库 dev server（vite，端口 5175）锁住 `@rolldown` 原生绑定。经用户授权结束该进程（及其 supervisor 重启的实例 PID 9424/cmd 11120）后 `npm ci` 完成（55 packages，0 vulnerabilities），四道门重跑全绿。用户的另一个项目 `my-vite-app` 的 3 个 dev server 未触碰。
- **裁决建议（待用户拍板）**：无新增。② D-2 仍开放；T0-2/T0-1 合并仍由用户在本地做；下一件该做的是 T0-3。

## 2026-11-15 · QoderPeng1 · T0-1 交付（脚手架）

- **目标**：T0-1 脚手架（见开工记录条目）。
- **实际改动**（3 个 commit：认领 `276c9dd`、开工记录 `d308873`、实现 `e2e63fa`，均在本机分支 `task/T0-1-QoderPeng1`）：
  - `main.tsx` HashRouter → **BrowserRouter**（Qoder Sites 回退已实测，ADR-0002 已采纳）。
  - `App.tsx` 重写：左导航 / 主区 / 可收起 AI 侧栏三栏外壳 + 底部状态条；断点 ≥1280 三栏、768–1279 AI 变抽屉（浮动 AI 按钮）、<768 单栏（导航横滚）；404 页；AI 侧栏空状态如实说明"当前没有选区"。
  - 首页（`src/app/HomePage.tsx`）：三个动作按钮（打开示例课程 / 导入我的资料 → /workspace，探索两个概念 → /connection）+ **运行时统计**（`stats.ts` 纯函数）+ **讲义第一屏 = 真实样张 iframe**（`/demo/linear-algebra/rendered/index.html`，可滚动可操作，非截图）。
  - `vite.config.ts` `publicDir: '../../content'`：`content/demo` 是样例数据真源，整目录作静态文件服务（不复制进 `src/`），讲义样张、资源等运行时直接访问；`tsconfig.json` 开 `resolveJsonModule`。
  - 四视口占位页（`features/{workspace,lab,connection,atlas}/`）：空状态均给下一步动作；工作台列大纲（状态徽章）；图谱页列出 9 条 accepted 关系（中文类型标签 + explanation），证明数据穿过外壳。
  - `probe/` 保留但不进路由；错误边界文案通用化。
- **统计口径**（UX §8，全部运行时）：讲义节数 = `kb.json` `status:"written"`；节点数 = `graph.nodes`；关系数 = `status:"accepted"`；实验数 = 工具注册表（`features/lab/tools.ts`，当前空）中 `status:'real'`。首页显示 1 / 15 / 9 / 0。
- **验证**（四道门，全部真实输出）：
  - `verify:content` ✓ 校验通过；`typecheck` ✓ 无输出
  - `test` ✓ 3 文件 24 条全过（新增 stats 6 条：计数逻辑 + "与独立计数一致"防写死）
  - `build` ✓ JS 281.30 kB / gzip 90.72 kB（比基线大 ~10 kB：路由外壳；另外 publicDir 使 dist 含 demo 内容 ~1.1 MB）
  - 浏览器（browser-use MCP，dev server）：首页 / 四路由 / 深链 `/atlas` 直访 / 404 全部可达；控制台无错误；截图 `docs/evidence/t0-1-desktop.png`（1440×900，三栏）、`t0-1-narrow.png`（414×896，单栏）；1000px 两栏抽屉临时截图已人工确认（AI 面板默认收起、浮动按钮可见），未入库。
- **已知缺陷 / 取舍**：① 讲义第一屏用静态样张 iframe，Markdown 阅读器（真源渲染、旁栏、折叠）是 T1，届时要替换掉这里并保留"阅读器尚未接入"的诚实标注；② AI 侧栏只有空状态，追问链路未接；③ 状态条声明"本地持久化未接入"，等 T6 接入后再改文案；④ 桌面端 AI 侧栏收起/展开只做了视觉确认（截图），未做脚本化交互测试。
- **下一步**：T0-3 zod 领域类型与数据加载（`TASK_T0.md` §3）；交接卡 §4.4 第 2 步预期数字已更新为 24 测试 / 281.30 kB / gzip 90.72 kB。

## 2026-11-15 · QoderPeng1 · T0-1 开工记录（脚手架）

- **本轮做什么**：T0-1 脚手架——BrowserRouter + 四个一级路由（`/workspace` `/lab` `/connection` `/atlas`）；三栏外壳（左导航 / 主区 / 可收起 AI 侧栏）+ 底部状态条；错误边界；首屏三按钮有动作；首屏统计**运行时从 `content/demo/linear-algebra` 的 `kb.json` / `graph.json` 算出**（UX_AND_FLOWS §8），不写死。
- **明确不做什么**：T0-3 的 zod 领域类型与加载器；四个视口的功能（只放带"下一步动作"的空状态页）；IndexedDB 持久化（T6）；AI 调用（无 Key 一律示例模式并明标）；探针代码（`src/probe/` 保留但不进路由，已部署的探针站不受影响）。
- **关键取舍**：`main.tsx` 探针注释已预告"改动只在这一行"→ HashRouter 换 BrowserRouter（Qoder Sites 回退实测过）。统计口径：讲义节数 = `outline[]` 中 `status:"written"`；关系数 = `graph.relations` 中 `status:"accepted"`；实验数 = 工具注册表中 `status:'real'`（当前 0）。`tsconfig.json` 需开 `resolveJsonModule` 才能直接 import JSON。
- **目录结构**（新文件）：`src/app/stats.ts`（纯函数）+ `stats.test.ts`；`src/features/{workspace,lab,connection,atlas}/` 各一占位页；`App.tsx` 重写为真外壳；`app.css` 按 UX §4 断点扩展。
- **验证方式**：四道门 + 桌面/窄屏两张截图（`docs/evidence/t0-1-*.png`）。
- **已知矛盾**：无。

---

## 2026-11-14（晚）· QoderWang1 · T1-1：讲义 Markdown 解析器

**目标**：把 `notes/2.1-列空间中的最近点.md` 解析成阅读器、检索、锚点跳转共用的结构，并能把每块内容渲染成
带 KaTeX 的 HTML 树。与 T0-1 外壳并行开发，因此**只做纯函数，不碰界面**。
**明确不做**：不接路由、不写 React 组件、不改 `content/demo`、不改 `verify-content.mjs`。

**做了什么**

1. `apps/web/src/content/`：`parseNote()` 产出块 / 栏目 / `^锚` / 旁栏对齐 / 版式行 / wiki link / 行号 / 诊断；
   `renderNodes()` 走 remark-rehype → rehype-raw → rehype-sanitize → rehype-katex。接口与限制见该目录 `README.md`。
2. 旁栏对齐按样张取规则：没写 `@` 的"本节聚焦"前面没有正文段，与**后一段** `^p-intro` 同行——
   规格原文只写了"对齐前一段"，样张补全了这个边界。
3. **发现并修复一处方言差异**：讲义的独立公式都写成单行 `$$…$$`，Obsidian 视为独立公式，
   remark-math 却按行内公式解析——全篇 9 个独立公式会挤进行内，带 `\tag{2-1}` 的直接报错。
   解析器把"独占一段的 `$$…$$`"提升为公式块，测试按样张逐一对数（9 个 `katex-display`）。
4. 白名单合并：GitHub 默认 schema 对 `<a>` 已有一条 `className` 规则，追加第二条不生效，
   wiki link 的 class 会被清空；改为合并成一条。
5. 防漂移测试：callout 白名单、锚点集合与 `verify-content.mjs` 逐项比对；资源卡 span 必须在 manifest 里且带 `why`。
6. 新增依赖（均为 ADR-0002 §2 已定的 remark 系）：`unified` `remark-parse` `remark-gfm` `remark-math`
   `remark-frontmatter` `remark-rehype` `rehype-raw` `rehype-sanitize` `rehype-katex` `vfile`；
   开发依赖 `@types/mdast` `@types/hast` `hast-util-to-html`（测试里把 hast 转成字符串比对）。

**验证**（本轮实跑）

```text
$ npm run verify:content → ✓ 通过
$ npm run typecheck     → 无输出
$ npm run test          → 4 files / 64 tests passed（新增 46：demo 讲义 20 + 边界与反例 26）
$ npm run build         → JS 271.42 kB │ gzip 88.10 kB（外壳尚未引用解析器，包体不变）
解析器单独打包         → 801.4 kB min / 195.4 kB gzip
```

**已知缺陷**：解析器单独就占单路由预算（gzip ≤ 300 kB）的三分之二，T1-2 必须懒加载；parse5（`rehype-raw`）
只为 `<details>` 服务，若预算吃紧可评估改为只放行 `<details>`/`<summary>` 的轻量处理。
`verify-content.mjs` 尚未改为调用本模块，两边靠测试对齐。其余限制列在 `apps/web/src/content/README.md`。

**下一步**：T1-2 阅读器 UI 接 `doc.rows`（等 T0-1 外壳合入后开工）；T1-3 锚点跳转直接用 `headings[].slug` 与 `anchors`。

---

---

---

---

## 2026-11-14 · QoderWang1 · ⑦ 收尾：Obsidian 排除 + 公网截图补证

**目标**：把交接卡 ⑦ 的两件"人类专属收尾"做掉。**明确不做**：不删团队版站点、不重新部署、不动 `main`。

**做了什么**

1. Obsidian：确认进程未运行后，直接写 `.obsidian/app.json` 的 `excludedFiles`
   （`node_modules/**`、`apps/web/dist/**`），JSON 校验通过；`.obsidian/` 在 `.gitignore` 里，不进仓库。
2. 截图：in-app 面板打开公网探针页 `/atlas`，整页截图存 `docs/evidence/t0-0-sites-atlas.png`
   （四项"通过"与证据文字都在画面里）。
3. Desmos：agent 的整页/元素截图都是**空白**——跨源 iframe 抓不到；面板隐藏后截图接口直接报
   `NATIVE_BROWSER_VIEWPORT_UNAVAILABLE`。**用户目视确认坐标系已画出并提供截图**，存
   `docs/evidence/t0-0-sites-desmos.png`。这条限制写进 `HANDOFF.md` §6，ADR-0002 iframe 格补视觉证据。

**验证**：两张 PNG 落盘且内容核对（四项结论文字 / Desmos 坐标系与工具栏）；`app.json` 用 node 解析通过。
**已知缺陷**：Desmos 那张的证据来源是用户截图，不是 agent 亲手截的（与 #7 的 CI 截图同口径，已标注）。
**下一步**：T0-1 外壳。

---

## 2026-11-14 · QoderWang1 · T0-2：ADR-0002 五项选型定稿

**目标**：按 `TASK_T0.md` §3 把框架 / Markdown / 编辑器 / 图谱 / 存储五项连同被排除方案写进 ADR-0002，
让 T0-1 外壳有据可依。**明确不做**：不装 CodeMirror / React Flow / Dexie，不写业务代码，不部署，不动 `main`。

**做了什么**

1. ADR-0002 从"选型仍待填"改为"已定稿"：五项各写"选择 / 为什么 / 被排除方案 / 验证方式"，
   外加共同前提（来自探针实测）、"尚未验证的假设"清单和"何时重审"。
2. 三条关键取舍：**编辑器选 CodeMirror 6 不选 Tiptap**（Markdown 是真源，富文本回写会丢 callout /
   details / wiki link，踩 A7 红线）；**图谱选 React Flow**，判据是能编辑而不是能展示；**Markdown 选
   remark 系**，因为检索与锚点跳转需要源码行号（`node.position`）。
3. `ARCHITECTURE.md` §2 顶部加指针：与 ADR-0002 冲突时以 ADR 为准。
4. 包体预算首次写死：首屏 gzip ≤ 300 kB、单路由懒加载块 ≤ 300 kB、整包 ≤ 2 MB——超了先查重复打包。

**验证**（本轮实跑）

```text
$ npm run verify:content → ✓ 通过（节点/关系/引用/讲义链接/资源来源/覆盖矩阵/布局与证据）
$ npm run typecheck     → 无输出
$ npm run test          → 2 files / 18 tests passed（388 ms）
$ npm run build         → JS 271.42 kB │ gzip 88.10 kB（26 modules，168 ms）
```

**已知缺陷**：五项里真正实测过的只有栈本身与托管能力；React Flow 300 节点性能、CodeMirror 移动端、
Dexie 打包体积都**未测**，ADR 已把它们单列成"未验证"。本轮纯文档，无新依赖。

**下一步**：T0-1 外壳（BrowserRouter、四路由、三栏 + 状态条、错误边界、统计数字运行时算）。

---

## 2026-11-13 晚 · QoderWang1 · 资源抽屉升格为规格（ADR-0007，补记）

> 本条按 `HANDOFF.md` §4.5 #8 补记，不是当轮日志原文；当轮漏写日志已在 #8 的"已知缺陷"里认过。

**内容**：抽屉两层交互从样张 `app.js` 升格为规格与验收清单——ADR-0007（左侧抽屉、视频不内嵌、
`unavailable` 不得退化成资源主页链接）、`UX_AND_FLOWS.md` §3/§7、`QUALITY_GATES.md` §2.5 九项手测、
`IMPLEMENTATION_PLAN.md` T1-2 验收口径改为"逐条点过"。**当轮门**：`verify:content` 与 `typecheck`
实跑通过；`test` / `build` 未跑（纯文档 + 样张一行 CSS 的滑出方向）。


**目标**：回答"都 push 过了吧"——不靠记忆，用 `git fetch` + 比对本地/远端。
**明确不做**：不 rebase（分支已 push，重写历史会影响别人）、不动 `main`、不再部署。

**发现（我上一条卡写错了）**

```text
$ git branch -vv
  main   883ea7a [origin/main: behind 5]        ← 本地 main 落后，说明远端动过
$ git log --oneline origin/main -1
08af8e8 Merge pull request #1 from Thalya4138/task/T0-0-QoderWang1
$ git log --oneline HEAD..origin/main
08af8e8                                        ← 本分支缺那个 merge commit
```

**PR #1 已经被合并**：晚 5 之前的四个提交（8 条裁决 + schema/校验器 + 探针代码 + 日志）已进 `main`。
而我在 §4.0 与 ④ 里写的是"`main` 还停在 `883ea7a`、整条分支待合并"——**过期结论写进了权威文件**。

**处理**

1. `git merge origin/main` 进本分支（merge 而非 rebase：分支已 push，不能重写别人可能拉走的历史）。
2. §4.0 指针更正为"部分已合并，剩第二个 PR（部署与实测 13 个提交）"。
3. §4.2 ④ 按接龙规则**追加更正**，原文不删；并提醒 CI 首跑结果没人确认过，别默认它是绿的。
4. §4.5 追加 **#5 更正 #3/#4**，把这次的错判写成一条历史记录而不是抹掉。

**教训（接上一条）**：卡里凡是"远端现在处于什么状态"这类断言，必须是**刚 fetch 过的**结果；
`main` 是共享分支，别人（或用户）随时会推进它。写"停在某个 commit"就等于埋了一颗过期雷——
更好的做法是像 ④ 那样给出取法命令。

**验证**

```text
$ git merge origin/main → Merge made by the 'ort' strategy（无内容冲突）
$ git status --short --branch → ahead 2
$ npm run verify:content / typecheck / test / build → 通过（18 tests）
$ git log --oneline HEAD..origin/main → 空（不再分叉）
```

**剩余问题**：④ 变成"开第二个 PR + 确认 CI 首跑"；②⑤⑦ 不变。

---

## 2026-11-12（晚 6）· QoderWang1 · 复查推送状态时发现 PR #1 已合并

**目标**：回答"都 push 过了吧"——不靠记忆，用 `git fetch` + 比对本地/远端。
**明确不做**：不 rebase（分支已 push，重写历史会影响别人）、不动 `main`、不再部署。

**发现（我上一条卡写错了）**

```text
$ git branch -vv
  main   883ea7a [origin/main: behind 5]        ← 本地 main 落后，说明远端动过
$ git log --oneline origin/main -1
08af8e8 Merge pull request #1 from Thalya4138/task/T0-0-QoderWang1
$ git log --oneline HEAD..origin/main
08af8e8                                        ← 本分支缺那个 merge commit
```

**PR #1 已经被合并**：晚 5 之前的四个提交（8 条裁决 + schema/校验器 + 探针代码 + 日志）已进 `main`。
而我在 §4.0 与 ④ 里写的是"`main` 还停在 `883ea7a`、整条分支待合并"——**过期结论写进了权威文件**。

**处理**

1. `git merge origin/main` 进本分支（merge 而非 rebase：分支已 push，不能重写别人可能拉走的历史）。
2. §4.0 指针更正为"部分已合并，剩第二个 PR（部署与实测 13 个提交）"。
3. §4.2 ④ 按接龙规则**追加更正**，原文不删；并提醒 CI 首跑结果没人确认过，别默认它是绿的。
4. §4.5 追加 **#5 更正 #3/#4**，把这次的错判写成一条历史记录而不是抹掉。

**教训（接上一条）**：卡里凡是"远端现在处于什么状态"这类断言，必须是**刚 fetch 过的**结果；
`main` 是共享分支，别人（或用户）随时会推进它。写"停在某个 commit"就等于埋了一颗过期雷——
更好的做法是像 ④ 那样给出取法命令。

**验证**

```text
$ git merge origin/main → Merge made by the 'ort' strategy（无内容冲突）
$ git status --short --branch → ahead 2
$ npm run verify:content / typecheck / test / build → 通过（18 tests）
$ git log --oneline HEAD..origin/main → 空（不再分叉）
```

**剩余问题**：④ 变成"开第二个 PR + 确认 CI 首跑"；②⑤⑦ 不变。

---

## 2026-11-12（晚 5）· QoderWang1 · ⑥ 结案；交接卡改为接龙结构

**目标**：把用户确认的"⑥ 那个个人账号就是我"落进卡里；按用户指出的方式把交接卡从
"逐轮改写同一行"改成 **append-only 接龙**。**明确不做**：不改代码、不再部署、不动 `main`。

**实际改动**

- `docs/HANDOFF.md`：新增 §4.0 当前指针 + §4.5 接龙表（#1–#4，详情一律指向日志/ADR/§，不复述）；
  §4.2 ⑥ 结案（保留原判断，标注"换账号再发布时要重新确认"）；§4.4 第 4 步改为"已确认，不用再做"；
  §2 第 6 步与 §5 写入接龙规则（**只加行；更正写成"更正 #N"，不删别人条目**）；
  §4.0 里顺手把 ④ 抄来的 commit 数换成命令现取
- 旧版逐轮改写的表格保留在 §4.0 末尾作存档，不删

**人工判断（对我的批评）**

我前面三轮每次都在**重写自己那一行**——状态从"阻塞"改成"待合并"、HEAD 一路换、待人拍板一格反复改写。
这正是"覆盖式交接"：非本地的合作者看不到中间状态，也就无法追溯"哪一轮从阻塞变成待合并"。
用户指出后改成接龙：历史条目不动，当前状态由 §4.0 指针 + 最后一条接龙给出。
另外本轮我第三次犯同一个错——用 Edit 插入新条目时把相邻的标题吞了两次
（`## 5. 交接卡填写规则`、上一轮是 `## 2026-11-12（晚 3）` 条目标题），每次都靠 `grep '^## '` 复查补回。
**教训：往 Markdown 里插章节后必须立刻跑一次标题结构检查**，别相信编辑成功的返回。

**验证**

```text
$ grep -n "^## \|^### 4\." docs/HANDOFF.md   → §1–§6 与 §4.0–§4.5 齐全，无标题丢失
$ awk 检查 §4.2 表格列数 → ①–⑦ 每行 4 列一致
$ npm run verify:content / typecheck / test / build → 通过（18 tests，JS 271 KB / gzip 88 KB）
```

**剩余问题**：与 §4.2 未结案项一致——② D-2、④ 合并与 CI 首跑、⑤ 团队版站点处置、
⑦ 补截图 + Obsidian 排除目录。代码与文档无新增欠账。

---

## 2026-11-12（晚 4）· QoderWang1 · 个人版账号发布，匿名公网实测四项通过

**目标**：执行路径 ①——换个人版账号重新发布探针，把 `access_mode` 放开成 `public`，
用**匿名**请求复测四项能力并回填 ADR-0002。
**明确不做**：不改探针源码（上一轮的测法修正已够用）、不删团队版那份站点、不动 `main`。

**授权记录**：用户明确要求"1 你现在试一下"，路径 ① 的目的就是匿名可访问；
`update_access_policy` 的 `mode: public` 带 `confirmPublic: true` 是在该授权下执行的。

**实际改动**

- 新站点（个人版账号）：`prepare_site` 新 action + `createNewSite: true` + slug `vein-probe-personal`
  + `spa: true`，不带 `projectId` → `publish_site` → `update_access_policy(public)`
- `docs/DECISIONS.md`：ADR-0002 能力表全部换成**匿名**实测结果；访问模式一节改为已解决，
  并记下"比赛链接必须出自个人版账号"这条结论 + 两份站点对照表 + 平台注入水印的事实
- `docs/HANDOFF.md`：③ 标为已解决；卡行状态/接手第一步换成新地址；看板 T0-0；
  §6 新增三条（换账号的规定动作、匿名性要用不带 cookie 的 curl 证明、水印注入）

**人工判断**

- 换账号后先做**身份判定**再动手：`list_sites(owned)` 返回 0 个项目 + 旧 action 报 `sites_forbidden`
  ⇒ 确认是账号切换而不是 Sites 服务故障（服务正常才会两者同时成立）。
  这一步不能跳——在团队版账号上 `createNewSite` 只会再产出一个不能匿名的站点。
- `public` 一可选我就放开，但**匿名结论只用 curl 作证**。浏览器恰好带着 Qoder 会话，
  它"能打开"证明不了 `public` 生效，所以四项自检与匿名性是两组独立证据，文档里分开写。

**验证**

```text
# 身份判定
list_sites(owned) → total_size 0            # 当前账号名下没有站点
get_publish_status(旧 action) → sites_forbidden
get_site_access(新 siteId) → available_modes 含 public（requires_confirmation: true）
                              selected 不再要求同组织  ⇒ 个人版

# 发布与放开
prepare_site → artifactReady true、canPublish true、blockers []
publish_site → succeeded、committed true、published true
update_access_policy(public, confirmPublic) → mode: public、auth_integration_status: not_required

# 匿名 curl（不带 cookie，Accept 两种各测一遍）
/                       text/html → 200 text/html 57460B 含 #root      | */* → 200
/atlas                  text/html → 200 含 #root                       | */* → 404
/no-such-route-abc123   text/html → 200 含 #root                       | */* → 404
/probe/large.txt        → 200 text/plain 262144B（两种 Accept 一致）
/probe/build-info.json  → 200 application/json 394B

# 浏览器四项自检（https://vein-probe-personal-dx7phlm8g8e.qoder.zone/atlas）
1 深链      通过  应用从 /atlas 直接启动
2 静态资源  通过  整包 523.9 KB；256 KB 下载完整 439 ms
3 iframe    通过  Desmos load 3.2–6.0 s
4 IndexedDB 通过  首次 04:31:00 不变，重载后累计 2 次、内容完整
```

**顺带测到的新事实**：托管站把 418 B 的 `index.html` 扩成约 57 KB 输出，多出来的是
`<qoder-sites-badge>`（`id="qoder-sites-watermark"`，独立 shadow root、`:host{all:initial}`、`position:fixed`）。
样式不会串进来，但它是页面上的固定浮标——T1 的视觉验收要把它算进画面，也别去删它。

**剩余问题**

- [ ] 截图 `docs/evidence/t0-0-sites-*.png` 仍缺：in-app Browser 面板隐藏
      （`take_screenshot` 报 `NATIVE_BROWSER_VIEWPORT_UNAVAILABLE`，viewport 0x0 / attached false）。
      本轮证据是 curl 原文 + 探针文本 + 网络面板，图像证据待面板打开后补。
- [ ] 包体/单资源**上限**仍未测；IndexedDB"会不会被清理"要隔天再访问才知道。
- [ ] ADR-0002 的**选型本身**（框架 / Markdown / 编辑器 / 图谱 / 存储 + 被排除方案）仍未填 —— 现在能力表齐了，可以填。
- [ ] ② D-2 待拍板。团队版那份站点保留但不再是公网入口。
- [ ] **本会话到此结束**（用户 2026-11-12 收线）。下一位从 `HANDOFF.md` §4.4 上手清单开始；
      待拍板项集中在 §4.2 的 ②④⑤⑥⑦，其中 **⑥ 公网链接的账号归属**要先确认——
      那份 `public` 站点挂在"当时登录的个人版账号"下，不一定是参赛者本人的。

---

## 2026-11-12（晚 3）· QoderWang1 · 探针修正与登录态实测四项

**目标**：用户登录后重跑四项能力，把 ADR-0002 的能力表填成真结果。
**明确不做**：不改选型结论本身（框架/编辑器/图谱/存储仍待填）、不动访问策略（`public` 不在可选档里）、
不 push `main`、不换托管平台。

**实际改动**

- `apps/web/src/probe/checks.ts`：`probeSpaFallback` → `probeDeepLink`。判据从"fetch 一个不存在的路径"
  换成"应用是从哪个 `pathname` 启动的"，并保留一条 fetch 对照证据，标明它**不决定**深链
- `apps/web/src/probe/ProbePage.tsx`：该项卡片加「从 /atlas 重新加载（整页导航）」按钮
- `docs/DECISIONS.md`：ADR-0002 能力表全部改为实测结果 + 测法踩坑记录 + HashRouter 临时决定的更新
  （**T0-1 外壳可以直接用 BrowserRouter**；探针页保持 HashRouter 不动）
- `docs/HANDOFF.md`：卡行状态改「待合并」、③ 更新（a 已执行完、b/c 待办）、部署须知执行结果、
  看板 T0-0/T0-2、§6 新增"深链只能用导航测"

**人工判断（本轮最重要的一条）**

第一版探针在部署站上把深链判成 **失败**（`fetch('/atlas') → 404`），而浏览器导航 `/atlas`
拿到的是应用外壳。查明差异是**回退只给文档请求**（`Sec-Fetch-Dest: document`），资源请求一律 404。
也就是说：**如果照第一版的自动结论填 ADR，我们会写下"必须用 HashRouter"，那是错的**。
修正判据后重发一版（新 action，`spa: true` 不变）才测出通过。这条已进 §6 已知坑。

**验证**

```text
$ npm run typecheck → 通过   $ npm run test → 2 files / 18 tests   $ npm run build → 271.42 kB │ gzip 88.10 kB

# 发布（修正版）
prepare_site（新 action，projectId 复用，spa: true）→ artifactReady true、canPublish true、blockers []
publish_site → operation succeeded、committed true、published true
site.access_mode → organization（用户登录后从 private 变了；available_modes 仍无 public）

# 公网地址实测：https://vein-t0-probe-4588bqc00js.qoder.zone/atlas
1 深链        通过  location.pathname = /atlas，应用直接启动
              对照：fetch 不存在路径 → HTTP 404 不含 #root（资源请求行为，不决定深链）
2 静态资源    通过  整包 523.9 KB / 4 文件；probe/large.txt 256 KB → HTTP 200 实收 262144 B，456 ms
3 iframe      通过  Desmos load 437 ms；网络面板 https://www.desmos.com/calculator?lang=zh-CN → 200 text/html
4 IndexedDB   通过  写 200,000 字符；跨 4 次加载首次时间戳 04:04:51 不变、内容完整；配额显示 ~162 GB
```

**剩余问题**

- [ ] 截图 `docs/evidence/t0-0-sites-*.png` **没有**：in-app Browser 面板隐藏，`take_screenshot` 报
      `NATIVE_BROWSER_VIEWPORT_UNAVAILABLE`。上面是结构与网络证据，不是图像证据。面板打开后补拍即可。
- [ ] ③ 匿名可访问仍未解决：`access_mode: organization`，评委需要 Qoder 登录才能打开。
- [ ] ADR-0002 的**选型本身**（框架 / Markdown 解析器 / 编辑器 / 图谱库 / 存储 + 被排除方案）还没填。
- [ ] IndexedDB 的"会不会被清理"要隔天再访问才知道；大小上限没探到边界就不能写。

---


## 2026-11-12（晚 2）· QoderWang1 · T0-0 探针部署到 Qoder Sites

**目标**：按 `HANDOFF.md` §4.2「部署须知」把探针发布出去，用公网地址实测四项能力，结果回填 ADR-0002。
**明确不做**：不改选型结论（四项没测到就不填）、不开 Function/数据库、不动访问策略（`public` 不在可选档里，
放开匿名访问需要用户单独授权）、不 push `main`。

**开发输入**：用户授权部署 + QoderJudge1 的「部署须知」五条与提交拆分建议。

**实际改动**

- `docs/DECISIONS.md` ADR-0002：能力表由"待验证"改为实测结果 + 实测条件（commit、地址、`spa: true`）；
  表外记下这次真正的收获 —— 访问模式只有 `private`/`selected`/`organization`，**没有 `public`**
- `docs/HANDOFF.md`：我的卡行改状态与接手第一步；待人拍板新增 **③ 探针能否匿名可访问**（三条路 a/b/c）；
  部署须知写明 #1 #2 #4 已照做、**#3 未做到**及原因；看板 T0-0 / T0-2 状态更新；
  §6 新增三条坑（登录墙在路由之前、`.qoder.site` 是 host-local、`descriptorStatus: pending` 的正确处理）
- `.gitignore`：新增 `*.qoder.site`

**人工判断**

- 探针页发布时 `spa: true` 是我主动开的（这个开关本身就是待测能力），并在 ADR 里写明"主动开启"，
  不让它看起来像默认行为。
- 没有把本地 preview 的四项通过结果搬进 ADR。须知 #4 要求"测不出的格子写未验证（原因）"，
  四项就照这么写，只把"整包 523 KB 上传通过"记成**部分**结论。

**验证**

```text
# 从已提交 commit 构建（须知 #1）
$ git rev-parse --short HEAD
942412e
$ npm run build → 271.33 kB │ gzip 88.05 kB，✓ built in 163ms
$ dist 清单：index.html / assets/*.css / assets/*.js / probe/large.txt / probe/build-info.json（5 个文件）

# 发布链路（工具返回，逐条核对）
prepare_site → artifactReady true、dependenciesReady true、blockers []、canPublish true
publish_site → operation succeeded、committed true、published true
readiness    → publication_completed
地址         → https://vein-t0-probe-4588bqc00js.qoder.zone（access_mode: private）
descriptor   → descriptorStatus: written（重试同一 action + 同入参后写出）

# 公网实测（须知 #3）—— 五项全部被登录墙挡住
$ for p in / /atlas /no-such-route-abc123 /probe/large.txt /probe/build-info.json; do curl …; done
/                        HTTP 401 | application/json | 69 bytes
/atlas                   HTTP 401 | application/json | 69 bytes
/no-such-route-abc123    HTTP 401 | application/json | 69 bytes
/probe/large.txt         HTTP 401 | application/json | 69 bytes
/probe/build-info.json   HTTP 401 | application/json | 69 bytes
body: {"code":"sites_gateway_login_required","message":"login is r…

# 浏览器同一地址：标题「登录后即可访问」，跳转 qoder.cn/users/sign-in（未代用户登录）
# get_site_access → available_modes: private / selected(≤50, 同组织) / organization   ← 无 public
```

**证据缺口**：`docs/evidence/t0-0-sites-*.png` **没有**。探针四项在公网地址上一次都没跑起来，
截图只会是登录页，那不是能力证据。按须知 #5 的状态处理：卡里写"阻塞"，不绕路换托管平台。

**剩余问题**

- [ ] ③ 未拍板：`public` 档能否开。比赛要求"公网可用、匿名可访问"，这条不解决就不是"部署完成"。
- [ ] ADR-0002 四项能力仍"未验证（原因）"。若用户先在浏览器登录一次，我可以在登录态下重跑并回填（那是 a 路）。
- [ ] CI 仍未经远端验证（本轮只 push 分支，`ci.yml` 的 job 只在 push main / PR 时跑）。

---


## 2026-11-12（晚）· QoderWang1 · T0-0 探针 + 8 条裁决落地

**范围**：把用户对 8 条矛盾的裁决写进契约、schema 与数据；补上没人守的布局 schema；搭 T0-0 部署探针。
**明确不做**：阅读器 / 检索 / 图谱 / 实验（T1–T5）、接 LLM、推远端、部署公网（探针部署待用户确认）。

**开发输入**：用户裁决。其中 #1 与 #8 合并成一个死结——ADR-0002 要实测结果，实测要能部署的东西，
所以"先写完 ADR 再开工"这句被废止，顺序改为 **T0-0 探针 → ADR-0002 → T0-1 外壳**。
#5 是产品决策：手绘边不受 ADR-0003 强制，但必须与知识关系视觉可分、且只待在个人视图。

**实际改动**

- **文档规则改写**（类 A 的根因）：文档只写"为什么"和"以谁为准"，
  字段清单与统计数字一律指向 `schemas/` 与 `content/demo/` —— 见 AGENTS §5、DOMAIN_MODEL 表头、
  QUALITY_GATES §8、UX_AND_FLOWS §8（首页四个数字改为运行时计算，并写清统计口径）
- 新增 `schemas/layout.schema.json`、`schemas/evidence.schema.json`
- 修 schema↔数据漂移：`kb.schema.json` 的 `id` → `kbId`（另两个 schema 本来就用 `kbId`）、声明 `integrity`；
  `graph.schema.json` 的 `if/then` 补 `type`（否则 ajv 严格模式直接拒绝编译）
- `layouts/learning.json` → `evidence/learning.json`（`PRODUCT_SPEC` 早就是这么规定的，是数据放错了）；
  `structure.json` 注释 `course.outline` → `kb.json 的 outline`
- `verify-content.mjs` 新增 A10–A12：`layouts/` 只许三视图、`positions`/`layers`/`groups`/`hyperEdges`/`personalEdges`
  引用的节点必须存在、超边必须与 `relationGroups` 同 id、手绘边不得进入客观视图、
  逻辑视图六档 `epistemic` 线型齐全且弱断言必须带文字标签、学习证据 `score` 三件套分开记
- 裁决入文档：ADR-0002 前置条件改写 + 新增 **ADR-0006**；AGENTS 第 3 条限定适用范围、
  §4 "五类 `epistemic`" 改六类（与 GLOSSARY 一致）；GLOSSARY 增 `PersonalEdge` 与 `kbId`；
  PRODUCT_SPEC §6.1 增两实体对照表；TASK_T0 / IMPLEMENTATION_PLAN / QUALITY_GATES 同步
- **新代码**：`apps/web` T0-0 探针（Vite 8 + React 19 + TS 7 + Vitest 5 + ajv 8）。
  HashRouter；四项自检各带"结论 / 证据 / 这个结论会怎么骗人"；Desmos 实嵌区供肉眼确认；
  结论可一键复制成 ADR-0002 表格。`domain/math.ts` + `math.test.ts`（A8）+ `schemas.test.ts`（A13）

**人工判断**

- `manifest.json` 有 `kind: "video"` 而 schema 枚举只有 `video-course`：判数据为准，补 `video`
  并写明"单条视频 vs 整套课程"不许合并（定位方式不同：时间戳 vs 章节）。
- 探针第一版有两处不诚实：dev 模式下把 HTML 回退当 JSON 解析而抛异常；把 vite dev 服务器的
  history 回退写成"BrowserRouter 可用"。改为按 content-type 判定并如实标注来源 ——
  本地结论不能冒充托管站结论。

**验证**

```text
$ node scripts/verify-content.mjs
✓ 内容校验通过（节点 / 关系 / 引用完整性 / 讲义链接 / 资源来源 / 覆盖矩阵 / 布局与证据）

$ npx vitest run
 ✓ src/domain/math.test.ts (7 tests)
 ✓ src/domain/schemas.test.ts (11 tests)
 Test Files  2 passed (2)
      Tests  18 passed (18)

$ npx tsc --noEmit        # 无输出，通过

$ npx vite build
apps/web/dist/assets/index-DdnsdOkZ.js   271.33 kB │ gzip: 88.05 kB
✓ built in 109ms
```

反向测试（在 `$HOME` 下的临时副本破坏 6 类，仓库内不留产物）：9 条错误全部命中，退出码 1；
真实仓库退出码 0。破坏项含：学习证据放回 `layouts/`、手绘边进结构视图且标签为空、
`analogy` 线型缺标签、超边 id 对不上 `relationGroups`、证据指向不存在节点、`score.apply` 缺失。

浏览器实测（`npm run build` + `vite preview`，来源 `http://localhost:4173`）：

| 探针 | 结果 | 关键证据 |
| --- | --- | --- |
| SPA 深链 | 通过（限本机来源） | `GET /no-such-route-… → 200 text/html`，含 `#root` |
| 大静态资源 | 通过 | 产物合计 523 KB；取回 256 KB 用时 5 ms |
| 外部 iframe | 通过 | Desmos `load` 事件 521 ms；`?lang=zh-CN` 返回 200；坐标系确实画出（见截图） |
| IndexedDB | 通过 | 写 200,000 字符 → 重载后首次时间不变、累计次数递增 |

截图：`docs/evidence/t0-0-probe-build.png`（四格结论）、`docs/evidence/t0-0-desmos-embed.png`（Desmos 真渲染）、
`docs/evidence/t0-0-probe-desktop.png`（首版，已过时，保留作迭代痕迹）。
dev 模式另测一次：`#/atlas` 深链可达，静态资源项如实返回"无法判定"。

**剩余问题**

- [ ] **探针还没上 Qoder Sites**：ADR-0002 的能力表仍是"待验证"。本地 preview 只证明代码能跑，
      不证明托管站的回退、大小上限与 CSP。部署需要用户确认。
- [ ] 窄屏 375px 未截图：本轮只有探针页，三栏外壳与断点在 T0-1。
- [ ] D-2 仍未拍板：用户在逻辑视图手写推导时 `epistemic` 的默认值（PRODUCT_SPEC §6.1 末尾）。
- [ ] 探针页没有设计系统，T0-1 外壳会重做它；`domain/` 的 zod 类型（T0-3）未开始。
- [ ] `.github/workflows/ci.yml` 已从"只跑内容校验"改写为 `npm ci → verify:content → typecheck → test → build`，
      但**未验证**：CI 只在 push 到远端后才跑，本轮没有 push。

---

## 2026-11-11 · 仓库重构

**背景**：初版仓库有 23 个 Markdown 文件、零行代码。
问题：契约不可执行、无数据实例、四板块被重复描述、prompt 不可调用。
本次重构目标是**让开发能无歧义地开工**，不是写更多文档。

**做了什么**

- [x] 重写 `README.md`：改为"按数据流组织"，去掉功能卡片堆砌
- [x] 重写 `AGENTS.md`：加入七条不可协商 + 每轮开工协议
- [x] **新增 `docs/GLOSSARY.md`**：统一命名（此前同一个概念有 3–4 个叫法）
- [x] 重写 `docs/PRODUCT_SPEC.md`：确立"最小单位是被回答的问题"这一第一原理
- [x] 重写 `docs/DOMAIN_MODEL.md`：名词表 → 带不变量的契约表
- [x] 重写 `prompts/NOTE_GENERATION.md`：散文 → I/O JSON + 二元 rubric（R1–R10）+ 反模式对照
- [x] 重写 `prompts/CONNECTION_EXPLORER.md`：加入对应表强制、C1/C2 分离、候选硬规则
- [x] 重写 `prompts/GRAPH_ASSISTANT.md`：加入"整理任务必须给双方案"与冲突报告
- [x] **新增 `prompts/SMART_SEARCH.md`**：此前"问题式学习"只有一句描述，不可实现
- [x] 重写 `docs/ARCHITECTURE.md`、`docs/UX_AND_FLOWS.md`、`docs/QUALITY_GATES.md`、`docs/IMPLEMENTATION_PLAN.md`
- [x] **新增 `schemas/*.json`**：把"每条边必须有理由"从文档话变成 CI 可执行约束
- [x] **新增 `scripts/verify-content.mjs`**：校验引用完整性、讲义链接、提纲化风险
- [x] **重写 `content/demo/linear-algebra/`**：3 节讲义 + 9 节点 + 9 条关系 + 3 份布局
- [x] **新增 `LICENSE`**（MIT）
- [x] `.gitignore` 增补 workspace/inbox/zip 等

**验证证据**

```text
$ node scripts/verify-content.mjs
✓ 内容校验通过（节点 / 关系 / 引用完整性 / 讲义链接）
```

校验器在首次运行时抓到两个真实错误并已修复：
1. `course.json` 引用了不存在的节点 `n.optimization-first-order`（实为 `n.first-order-cond`）
2. 讲义 `[[法方程]]`、`[[列空间]]` 无法解析到节点（节点缺少中文别名）

**未验证 / 已知缺口**

- [ ] **没有任何应用代码**。`apps/web` 尚不存在，`npm install / npm run dev` 目前不可用。
      README 中"30 秒跑起来"的描述是**目标状态**，不是现状 —— T0-1 完成前它不成立。
- [ ] `schemas/*.json` 尚未接入 CI（目前只有手写的 `verify-content.mjs` 在跑，
      尚未用 ajv 做 JSON Schema 校验）
- [ ] `content/demo` 只有线性代数一个知识库；缺中文人文社科样例（用于验证讲义风格的跨学科适配）
- [ ] 未在 Qoder Sites 上验证任何能力（ADR-0002 待填）

**下一步**

基于用户需求，我们需要先完成 T0 地基，见 `docs/TASK_T0.md`。

---

## 2026-11-12 · 澄清三点边界

用户澄清了三处会被实现误读的地方：

1. **网页是"渲染器"，不是生成器。** 讲义生成走 BYOK / 本地，网页负责渲染、检索、编辑、
   图谱、导出。这排除了"必须内置生成才能用"的误解。
2. **知识库粒度由用户决定**：可以是一个学科、一门课、或一个专题。
   → `course.json` / `course.schema.json` 重命名为 `kb.json` / `kb.schema.json`，
   新增 `level`（discipline/course/topic）、`parentKbId`、`childKbIds`。
   旧的 `course.*` 已移到仓库外（`../_qoder_archive/`），不再被任何代码或文档引用。
3. **整个平台就是一个网页。** 不拆桌面端；四板块是同一页面的四个工作区。

**验证**

```text
$ node scripts/verify-content.mjs
✓ 内容校验通过（节点 / 关系 / 引用完整性 / 讲义链接）
```

**未做**：比赛 demo 的知识库仍是 `course` 级。学科级只保留在 schema 层与 UI 说明里，
不额外开发——这是刻意的取舍。

---

## 2026-11-12 · 逐条审计用户的原始需求（发现 6 处真缺口）

用户提出"详细的功能这些都落实了吗"，要求不给屎盆镶金边。逐条核对结果如下，
**只看文件实际内容，不凭记忆**：

| 用户原话 | 审计结果 | 处理 |
| --- | --- | --- |
| "你去帮我整合"资源 | ❌ **只有"需用户勾选"一句，无产出契约** | 新增 `prompts/RESOURCE_DISCOVERY.md` |
| "导航+关联资源库（需要一个汇总）" | ❌ 完全缺失，全文搜"资源库"零命中 | 新增 `PRODUCT_SPEC` §3.6 + `UX_AND_FLOWS` 二级导航 + `schemas/manifest.schema.json` |
| "练习可以展开和折叠" | ⚠️ 3 个折叠块全是"拓展"，**没有一个真练习** | `notes/02` 新增 3 道分级练习（算/条件/理解），答案折叠 |
| "生成一份报告文件" | ⚠️ 只有一句"可生成报告"，无格式无契约 | 新增 `prompts/REPORT_WRITER.md` + `Report` 实体 |
| "三种视角…我希望都是可以编辑的" | ⚠️ 只详述了个人视图，逻辑视图的编辑没定义 | `PRODUCT_SPEC` §6.1 补三视图编辑对照表 + 逻辑视图四种编辑动作 |
| "可追问" | ⚠️ 只在流程里出现过一次，无实体 | 新增 `Thread` 实体 |
| "显示进度与先修" | ⚠️ 只有一句，无数据模型 | 新增 `ChapterProgress`；明确 `read ≠ 掌握` |

**审计中发现并修正的错误**：练习 1 里原先写了一段"先算错、再验算发现错误"的过程，
但真实数值是对的，那段"错误"是虚构的。这种**演出来的纠错**正是本项目要杜绝的。
已改为正确推导 + 真实自检（`Aᵀr = 0`），并用 numpy 验证：
`s = [4/3, 7/3]`，`Aᵀr = [-2.2e-16, -4.4e-16]`（机器精度 0）。

**验证**

```text
$ node scripts/verify-content.mjs
✓ 内容校验通过（节点 / 关系 / 引用完整性 / 讲义链接 / 资源来源 / 覆盖矩阵）
```

校验器新增了资源清单检查：origin 三态、discovered 必须有 uri、span 必须指向真实资源、
coverage 必须覆盖每一章、无来源的章必须带 warning。

---

## 2026-11-12（晚）· 讲义重写：从"说明文"改成真正的笔记

**用户反馈**：demo 讲义"不懂什么叫笔记"，看了样本却学不到东西。

**上一版错在哪（如实记录）**：
上一版读了 notebrick 样本，提炼了六条特征，结果写成了一篇**关于笔记的评论**——
有散文的外形，没有散文的信息密度；也没有手写笔记的结构骨架。**两头不靠。**

真正的问题是：把 notebrick 当成了唯一范本。而用户实际记的笔记（线代 50 页、数分 45 页）
是另一种形态：编号推进、红框锁结论、页边批注方法、句句可背。

**改了什么**

1. **重写全部四章**，改为"第一章 线性方程组 → 最近点 → 法方程 → 三种最近"的完整链条：
   - `01-线性方程组.md`（新）：相容性判据、自由变量、解集 = p + N(A)、线性相关四等价
   - `02-最近点.md`：残差正交的反证、左乘 Aᵀ 为何不是推导
   - `03-法方程.md`：三处必检条件、三层错法的练习（算/条件/理解）
   - `04-三种最近.md`：六行对照表、"是否需要参数化"作为唯一性根源、就地展开的 MIT 链接
2. **确立两种声音**（写进 `NOTE_GENERATION.md` §6）：
   - 干货（编号、判据、可背、无修辞）≈ 50–60%
   - 人话（有主语、解释为什么、可以比喻但交代边界）≈ 40–50%
   - 明确禁止第三种"说明文腔"
3. **资源链接就地化**（新增 §7.5）：链接紧贴起作用的那句话，说明它补了什么，
   值得展开就展开 2–4 句；文末不堆参考列表。
4. **章节重编号**：旧 `01-列空间` / `02-法方程` / `03-三种最近` 变成弃用占位文件
   （内容已拆入新四章），并从 `kb.json` 移除引用。
5. 图谱新增 6 个节点（相容性判据、自由变量、零空间、仿射集、线性相关、正交投影）
   + 4 条关系，全部带 `explanation` / `assumptions` / `epistemic`。

**结构指标**（自动测）

```text
01-线性方程组  段落24 列表3 块9 折叠1 字数3607
02-最近点      段落20 列表4 块6 折叠1 字数2812
03-法方程      段落27 列表5 块6 折叠4 字数3829
04-三种最近    段落23 列表7 块4 折叠0 字数3182
```

段落数远多于列表项数 —— 说明是叙述而非提纲。

**校验器在这一轮抓到 3 处问题**（这就是它存在的价值）：
- `::: tip` 不在白名单 → 已改为 `::: note`
- 新增关系的 `assumptions` 为空 → 补上条件
- `coverage` 缺 `ch.04` → 补上

**未做**
- 语文导图与 ADS 课件尚未提炼（前者是"边没理由"的反面教材，后者与线代链条无关）
- 手写笔记的**内容**一律未使用，只提炼了结构写法

---

## 2026-11-12（上午）· 信息架构回顾：把样张放回全貌里

**触发**：用户认可 `preview/textbook-demo`，并提醒"这只是第一个功能的部分 demo"。

**发现的三个缺口**（都是"最新进展没回写到真源"）
1. 样张在任何文档里都不存在 —— 开发时无从得知它是验收标准。
2. **规格与样张冲突**：`UX_AND_FLOWS` §3 写"宽屏不用两栏正文"，而样张正是主栏+旁栏。
   照规格做会做出用户否决过的一维流。已改，并规定冲突时以样张为准。
3. 样张的版式规则（栏目系统、旁栏对齐、资源卡 `why`）不在生成契约里 ——
   手写的 HTML 和生成器之间没有桥。

**改了什么**
- 新增 `preview/README.md`：样张是什么、在 IA 里的位置、证明了什么 / 没证明什么、第三方许可
- 新增 `docs/REQUIREMENTS_TRACE.md`：用户全部需求 → 规格 → P0/P1/P2 → 任务 → 现状；开放决策 D-1（比赛版要不要一次真实生成）
- 新增 `docs/REFERENCES.md`：7 个参照站点实际抓取后的事实 + 借/不借
- `NOTE_GENERATION.md` 新增 §3.5 教材版式（栏目表、`^锚` / `@锚` / `[!res] s.id` 语法、资源卡硬要求）
- `SourceSpan` 新增 `text-fragment` 定位类型、`end`、`why`（schema + 校验器 + DOMAIN_MODEL，均为可选字段）
- `IMPLEMENTATION_PLAN` 新增 T1-0，T1 验收改为"与样张并排截图"；README / T0 任务说明指向样张与对照表

**验证**

```text
$ node scripts/verify-content.mjs
✓ 内容校验通过（节点 / 关系 / 引用完整性 / 讲义链接 / 资源来源 / 覆盖矩阵）
```

**未做**
- demo 讲义 md 尚未改写成 §3.5 语法（列为 T1-0）
- 参照站点 Thinki 只拿到 meta 描述（JS 应用）

---

## 2026-11-12（中午）· 教材范本写进 prompt；愿景原文落库；可编辑/批注入规格

**用户确认**
- `preview/` 的 demo 是学习人教版《生物学 必修2》的版式、语言、内容产出做出来的，要写进 prompt。
- demo 后期要可编辑、可批注、可高亮。
- 愿景长文需要固定在仓库里，作为需求的唯一原文 → 落库。
- D-1（动态生成）推迟到平台搭起来后。

**做了什么**
- 精读教材第 1 章（第 1、2 节 + 本章小结 + 复习与提高），全书栏目用目录核对 → 新增 `docs/TEXTBOOK_STYLE_ANALYSIS.md`（15 种栏目、9 条语言规律、内容产出规律、不照搬的部分，均带 PDF 页码）
- `NOTE_GENERATION.md` v2.1：§3.5 栏目表扩成完整 14 栏 + 章级小结；新增 §6.5 教材腔 L1–L9；R14–R17；
  §6 人称规则改为"'你'只出现在任务里"——**原规则允许正文说'你'，与样张（主栏'你'出现 0 次）和教材都冲突**
- `PRODUCT_SPEC.md` §3.7 编辑 / 高亮 / 批注；`DOMAIN_MODEL.md` 新实体 `Annotation`（sidecar 存储、TextQuote 锚定、失锚不丢）
- 新增 `docs/VISION.md`：愿景原文 + 用户补充 + 按日期追加区；README / AGENTS / T0 任务说明均指向它
- `REQUIREMENTS_TRACE.md` 新增 1.13–1.15；D-1 记为"用户决定推迟"

**验证**

```text
$ node scripts/verify-content.mjs
✓ 内容校验通过（节点 / 关系 / 引用完整性 / 讲义链接 / 资源来源 / 覆盖矩阵）
```

**未做**
- 教材 PDF 不进仓库（版权）；分析文档只引短句
- 未用 §6.5 回头逐条审 `content/demo` 的四章 md。粗筛（关键词计数，未区分是否在练习里）："你" 共 3 处，自评词（其实/关键/核心/很隐蔽/难点）共 8 处，`02-最近点.md` 最多（4 处）。逐条修正留作 T1-0 的一部分

---

## 2026-11-12（下午）· 仓库口吻统一

**用户要求**：仓库内容以项目团队口吻书写；不出现 AI 助手身份，不出现对开发工具下指令的对话语言。

**改了什么**
- `prompts/QODER_KICKOFF.md`（对话式指令）→ 改写为中性任务说明 `docs/TASK_T0.md`，原文件删除；README、package.json 引用同步
- `AGENTS.md` 改为"开发规范"口吻（文件名保留：通用约定，开发工具会自动读取）
- ARCHITECTURE / DECISIONS / DOMAIN_MODEL / ci.yml / preview README / REQUIREMENTS_TRACE / NOTE_GENERATION 中"由 X 实现/填写"类表述改为中性
- 本日志与 VISION 中的第一人称、AI 助手名称改为中性
- **保留**：比赛与工具的事实性表述（Qoder 大赛、Qoder Sites、评分项"Qoder 使用深度"、帖子"Qoder 开发过程"段）

---

## 2026-11-12（傍晚）· 旧讲义退役；样张嵌入知识库

**用户决定**：旧四章讲义（早于教材式规则）删除，避免误导；`content/` 与 `preview/` 二选一合并或嵌套。

**结构决定：嵌套。** 知识库是唯一单位；样张是讲义的**期望渲染结果**（golden file），放进所属知识库的 `rendered/`。
不合并的原因：HTML / 字体等渲染产物不属于"md + json、可被 Obsidian 打开"的知识库格式。

**改了什么**
- 删除 `notes/01–04*.md`、`preview/lecture.html`、`scripts/build-preview.mjs`、`scripts/to-callouts.mjs`（后两者只服务旧讲义）及 `package.json` 中对应命令
- 样张转写为唯一讲义 `notes/2.1-列空间中的最近点.md`（§3.5 语法），三张图拆为 `notes/figures/*.svg`；
  **补写了练习答案与思维训练参考思路**（样张没有），数值经 numpy 验算
- `preview/textbook-demo` → `content/demo/linear-algebra/rendered/`；MIT PDF → `resources/files/`
- `kb.json` 大纲改为 `ch.01`(planned) / `sec.2-1`(written) / `sec.2-2`(planned)
- `manifest.json`：新增 3 个 discovered 资源与 5 个片段级 span（时间戳 / 页码 / 文本锚 + 引文 + why），2 个原创讲义 span
- `graph.json`：7 个节点锚到新讲义；8 个节点（第 1 章与"三种最近"）保留、锚点置空；5 条关系的证据改指真实 span
- 校验器：教材栏目入白名单；planned 章节可无讲义；新增锚点 / 资源卡 / 图片 / 图谱落地检查；schema 同步
- 全仓库路径引用同步（13 个文件）；`content/README.md` 明确开放许可材料的例外

**验证**

```text
$ node scripts/verify-content.mjs
✓ 内容校验通过（节点 / 关系 / 引用完整性 / 讲义链接 / 资源来源 / 覆盖矩阵）
```

反向测试（临时副本中故意破坏 4 处）：4 处全部报错，退出码 1——新检查确实生效：

```text
· 旁栏块对齐到不存在的锚点 @p-nonexist
· s.l15-normal: 作为旁栏资源卡使用，但缺 why
· 资源卡引用不存在的 span s.bogus-span
· 引用的图片不存在 figures/missing.svg
```

**未做**
- 讲义 md 与样张已出现内容差（md 多了答案）；样张未同步，因为答案默认折叠、不影响版式验收
- `scripts/obsidian-snippets/cognitive-atlas.css` 仍只覆盖旧块类型，教材栏目在 Obsidian 中显示为默认 callout 样式

---

## 2026-11-12（晚）· 产品更名：知脉 · Vein

- **目标**：产品总名由 Cognitive Atlas 改为「知脉 · Vein」。
- **原因**：Cognitive Atlas 与神经科学领域已有的同名本体项目撞名，且与 04 板块英文名重复，介绍时自相嵌套。
- **实际改动**：README、PRODUCT_SPEC、CONTEST_SUBMISSION 帖子标题、REFERENCES 对比表、UX_AND_FLOWS 线框图、
  讲义样张页眉（index.html / src.html）、manifest 作者字段、.env.example、package.json `name`、Obsidian css 注释。
- **明确不改**：VISION.md 原文（只在第三部分追加说明）；本日志历史条目；GitHub 仓库地址；
  schema `$id` 与 `cognitive-atlas.css` 文件名（技术标识符，改动会断引用）。04 板块英文名仍为 Cognitive Atlas。

## 条目模板（之后照此追加）

```markdown
### YYYY-MM-DD · TASK-ID / 版本

- **目标**：本轮做什么；**明确不做**什么
- **开发输入**：本轮需求要点 / 开发会话记录路径（帖子"Qoder 开发过程"的素材）
- **实际改动**：文件与要点
- **人工判断**：对开发结果做了哪些修改、为什么
- **验证**：命令 / 用例 / 预期 / 实际 / 截图路径
- **剩余问题**：已知缺陷与下一步
```
