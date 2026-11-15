# T0 · 地基任务说明

基于用户需求，在写任何功能之前，我们需要先把应用外壳、技术选型、领域类型和内容校验立起来。
T0 只做地基；阅读器、检索、图谱、实验分别是 T1–T5（见 `IMPLEMENTATION_PLAN.md` §2）。

---

## 1. 开工前阅读顺序

| # | 文件 | 读它是为了 |
| --- | --- | --- |
| 0 | `docs/VISION.md` | 用户愿景原文（意图的原件；规格是它的工程翻译） |
| 1 | `docs/HANDOFF.md` | 认领与交接协议；多 agent 协作时先看交接卡，别占别人的活儿 |
| 2 | `README.md` | 产品在做什么、仓库为什么这样组织 |
| 3 | `AGENTS.md` | 七条不可协商 + 每轮开工协议 |
| 4 | `docs/PRODUCT_SPEC.md` | 产品唯一真源 |
| 5 | `docs/GLOSSARY.md` | 命名唯一真源（代码命名严格以它为准） |
| 6 | `docs/DOMAIN_MODEL.md` + `content/demo/linear-algebra/*.json` | 数据结构（JSON 比表格更精确） |
| 7 | `docs/ARCHITECTURE.md` + `docs/UX_AND_FLOWS.md` | 技术边界与界面 |
| 8 | `prompts/NOTE_GENERATION.md` §3.5、§6.5 + `docs/TEXTBOOK_STYLE_ANALYSIS.md` | 阅读器要渲染的语法与讲义质量判据 |
| 9 | `content/demo/linear-algebra/rendered/README.md` + `content/demo/linear-algebra/rendered/index.html` | 阅读器的视觉验收样张 |
| 10 | `docs/REQUIREMENTS_TRACE.md` | 全部需求与分期；T0 只覆盖其中一小块 |

## 2. 现状（2026-11-14 更新）

- **应用代码只有两块**：T0-0 探针（`apps/web/src/probe/`）与 T1-1 讲义解析器
  （`apps/web/src/content/`，纯函数，已合入）；外壳（T0-1，PR #6）已合入，四视口为占位页。其余功能仍无代码。
  契约文档、JSON Schema、样例数据、校验脚本，以及知识库内 `rendered/` 下的静态视觉样张照旧
  （手写 HTML，不在其上扩展；T1 在 `apps/web` 里重做）。
- `npm run dev` 跑的是 **T0-0 探针页**（Vite）；它的四个路由是深链测试面，**不是外壳**（外壳是 T0-1）。
- 样例数据已通过 `node scripts/verify-content.mjs`；四道门基线在 `main` 上是 18 条测试，
  T1-1 合入后 64 条——**以你拉到的分支实跑为准**。
- 任何功能在有测试或截图之前，都不记为"已实现"。

## 3. 任务

顺序是 **T0-0 → T0-2 → T0-1 → T0-3 → T0-4**。
ADR-0002 的能力表只能靠部署一次实测来填，所以探针排在选型前面，外壳排在选型之后
（理由见 `ARCHITECTURE.md` 顶部；原"T0-1 先、T0-2 后"的写法已废止）。

**T0-0 部署探针**（只做探测，不做功能）
- 一个最小 Vite 应用，页面上直接显示四项自检结果：
  1. **深链**：直接访问 `/atlas`（HashRouter 先跑通，同时记录 BrowserRouter 是否 404）
  2. **静态资源**：放一个较大的资源，验证大小限制与加载
  3. **iframe**：嵌一次 Desmos，验证是否允许外部框架
  4. **IndexedDB**：写一条、读一条、刷新后仍在
- 部署到 Qoder Sites，四项结果填进 ADR-0002 的表格。
- **上公网前需要用户确认**（`AGENTS.md` §2 第 6 条）。探针不放任何私人材料。

**T0-1 脚手架**
- Vite + React + TypeScript
- 四个一级路由：`/workspace` `/lab` `/connection` `/atlas`；探针结论出来前用 HashRouter
- 三栏布局外壳（左导航 / 主区 / 可收起的 AI 侧栏）+ 底部状态条
- 错误边界；首屏所有按钮都有动作
- 首屏统计数字**运行时从数据算出**，不写死（`UX_AND_FLOWS.md` §8）

**T0-2 ADR-0002**
- 填写 `docs/DECISIONS.md` 的 ADR-0002：框架、Markdown 解析器、编辑器、图谱库、存储
- 能力表用 T0-0 的实测结果填写，未测的写"未验证"，不写推测
- 每个选择写明"被排除的方案及原因"

**T0-3 领域类型**
- 用 zod 写出 `content/demo/linear-algebra/*.json` 的类型
- 类型名与字段名与 `docs/GLOSSARY.md`、JSON **完全一致**
- 覆盖五个 schema：kb / graph / manifest / layout / evidence
- `PersonalEdge` 是独立类型，**不继承** `KnowledgeRelation` 的必填项（ADR-0006）
- 加载器：开发时从 `content/demo` 读取，构建后能静态提供

**T0-4 内容校验接入**
- `npm run verify:content` 调用 `scripts/verify-content.mjs`
  （已覆盖布局与证据：三视图文件齐备、引用落地、手绘边不出现在客观视图）
- schema 校验接入：`schemas/*.json` 是字段权威，CI 跑一遍，避免"schema 写了没人跑"
- Vitest 就位（`npm run test`）：T0 阶段至少要有领域校验测试，A8 的
  `AᵀA 可逆 ⇔ A 满列秩`（含 `[1 1]` 反例）可以直接拿来用

## 4. 开工记录（先写，再写代码）

在 `docs/DEVELOPMENT_LOG.md` 新开一条，15 行以内写明：

1. 选定的技术栈，以及**最关键的一个取舍**（不罗列全部备选）
2. 目录结构
3. 如何验证"外壳真的能用"，而不只是"build 通过"
4. 在仓库中发现的**矛盾或不明确之处**（这一条最重要）

## 5. 完成判据

```bash
npm install
npm run dev             # 四个路由都能点，看到外壳和已加载的知识库标题
npm run typecheck       # 通过
npm run test            # 通过（Vitest，至少含领域校验与 A8 反例）
npm run verify:content  # 通过（含 schema 校验）
npm run build           # 通过
```

并且 `docs/DEVELOPMENT_LOG.md` 有本轮记录，附**真实命令输出**与至少 1 张截图。

## 6. 本轮不做

- 阅读器、图谱、检索、实验（T1–T5）
- 接入 LLM
- 推送远端。**公网部署只限 T0-0 探针这一件事**，且需用户确认后才能上（`AGENTS.md` §2 第 6 条）
- 修改 `content/demo` 的数学内容，或 `prompts/*.md` 的 rubric
- 把 ADR-0003 的必填范围扩大或缩小——手绘边的例外单独记在 ADR-0006，不动知识关系

## 7. 用户验收要点

- 只看三件事：讲义能不能读、图谱能不能编辑、链接能不能打开。
- "已完成"必须附命令输出或截图，否则不予采信。
- 每天对照 `IMPLEMENTATION_PLAN.md` 的时间表；落后时按 §3 削减功能，
  但**"带理由的边"和"可编辑的个人视图"不削**——那是这个项目的核心。
