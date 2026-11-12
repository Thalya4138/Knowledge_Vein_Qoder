# T0 · 地基任务说明

基于用户需求，在写任何功能之前，我们需要先把应用外壳、技术选型、领域类型和内容校验立起来。
T0 只做地基；阅读器、检索、图谱、实验分别是 T1–T5（见 `IMPLEMENTATION_PLAN.md` §2）。

---

## 1. 开工前阅读顺序

| # | 文件 | 读它是为了 |
| --- | --- | --- |
| 0 | `docs/VISION.md` | 用户愿景原文（意图的原件；规格是它的工程翻译） |
| 1 | `README.md` | 产品在做什么、仓库为什么这样组织 |
| 2 | `AGENTS.md` | 七条不可协商 + 每轮开工协议 |
| 3 | `docs/PRODUCT_SPEC.md` | 产品唯一真源 |
| 4 | `docs/GLOSSARY.md` | 命名唯一真源（代码命名严格以它为准） |
| 5 | `docs/DOMAIN_MODEL.md` + `content/demo/linear-algebra/*.json` | 数据结构（JSON 比表格更精确） |
| 6 | `docs/ARCHITECTURE.md` + `docs/UX_AND_FLOWS.md` | 技术边界与界面 |
| 7 | `prompts/NOTE_GENERATION.md` §3.5、§6.5 + `docs/TEXTBOOK_STYLE_ANALYSIS.md` | 阅读器要渲染的语法与讲义质量判据 |
| 8 | `preview/README.md` + `preview/textbook-demo/index.html` | 阅读器的视觉验收样张 |
| 9 | `docs/REQUIREMENTS_TRACE.md` | 全部需求与分期；T0 只覆盖其中一小块 |

## 2. 现状

- **仓库里没有应用代码。** 只有契约文档、JSON Schema、样例数据、校验脚本，
  以及 `preview/` 下的静态视觉样张（手写 HTML，不在其上扩展；T1 在 `apps/web` 里重做）。
- `npm run dev` 等脚本目前是占位，会直接报"未实现"。
- 样例数据已通过 `node scripts/verify-content.mjs`。
- 任何功能在有测试或截图之前，都不记为"已实现"。

## 3. 任务

**T0-1 脚手架**
- Vite + React + TypeScript
- 四个一级路由：`/workspace` `/lab` `/connection` `/atlas`
- 三栏布局外壳（左导航 / 主区 / 可收起的 AI 侧栏）+ 底部状态条
- 错误边界；首屏所有按钮都有动作

**T0-2 ADR-0002**
- 填写 `docs/DECISIONS.md` 的 ADR-0002：框架、Markdown 解析器、编辑器、图谱库、存储
- **先验证 Qoder Sites 的能力**（SPA 深链回退、包体限制、iframe 嵌入），结果填进 ADR 的表格
- 每个选择写明"被排除的方案及原因"

**T0-3 领域类型**
- 用 zod 写出 `content/demo/linear-algebra/*.json` 的类型
- 类型名与字段名与 `docs/GLOSSARY.md`、JSON **完全一致**
- 加载器：开发时从 `content/demo` 读取，构建后能静态提供

**T0-4 内容校验接入**
- `npm run verify:content` 调用 `scripts/verify-content.mjs`
- （可选）用 ajv 加载 `schemas/*.json` 做完整的 schema 校验

## 4. 开工记录（先写，再写代码）

在 `docs/DEVELOPMENT_LOG.md` 新开一条，15 行以内写明：

1. 选定的技术栈，以及**最关键的一个取舍**（不罗列全部备选）
2. 目录结构
3. 如何验证"外壳真的能用"，而不只是"build 通过"
4. 在仓库中发现的**矛盾或不明确之处**（这一条最重要）

## 5. 完成判据

```bash
npm install
npm run dev             # 四个路由都能点，看到外壳和已加载的课程标题
npm run typecheck       # 通过
npm run verify:content  # 通过
npm run build           # 通过
```

并且 `docs/DEVELOPMENT_LOG.md` 有本轮记录，附**真实命令输出**与至少 1 张截图。

## 6. 本轮不做

- 阅读器、图谱、检索、实验（T1–T5）
- 接入 LLM
- 推送远端、公网部署（需用户确认）
- 修改 `content/demo` 的数学内容，或 `prompts/*.md` 的 rubric

## 7. 用户验收要点

- 只看三件事：讲义能不能读、图谱能不能编辑、链接能不能打开。
- "已完成"必须附命令输出或截图，否则不予采信。
- 每天对照 `IMPLEMENTATION_PLAN.md` 的时间表；落后时按 §3 削减功能，
  但**"带理由的边"和"可编辑的个人视图"不削**——那是这个项目的核心。
