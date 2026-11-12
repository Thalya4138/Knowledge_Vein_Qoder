# 交给 Qoder 的第一轮指令

> 把下面横线之间的内容整段粘贴给 Qoder。**一次只让它做 T0，不要一次给全部。**

---

你现在接手 `C:\Users\Wang\Desktop\QODER`（GitHub: `Thalya4138/Cognitive-Atlas_Qoder`），
一个 2026 Qoder 高校创造力大赛 StudyHack 项目。

## 先读（按此顺序，不要跳）

0. `docs/VISION.md` — 用户愿景原文（意图的原件；规格是它的工程翻译）
1. `README.md` — 产品在做什么、仓库为什么这样组织
2. `AGENTS.md` — 七条不可协商 + 每轮开工协议
3. `docs/PRODUCT_SPEC.md` — 产品唯一真源
4. `docs/GLOSSARY.md` — 命名唯一真源（**写代码时严格用它**）
5. `docs/DOMAIN_MODEL.md` + `content/demo/linear-algebra/` 下的真实 JSON — 数据结构
6. `docs/ARCHITECTURE.md` + `docs/UX_AND_FLOWS.md` — 技术边界与界面
7. `prompts/NOTE_GENERATION.md` — 讲义质量判据，**尤其 §3.5 教材版式**（阅读器要渲染的语法）
   与 §6.5 教材腔；证据在 `docs/TEXTBOOK_STYLE_ANALYSIS.md`
8. `preview/README.md` + 浏览器打开 `preview/textbook-demo/index.html` — **阅读器的视觉验收样张**
9. `docs/REQUIREMENTS_TRACE.md` — 全部需求与分期；你这一轮只碰其中一小块

## 现状（必须知道，避免误判）

- **仓库里没有任何应用代码。** 只有契约文档、JSON Schema、样例数据、校验脚本，
  以及 `preview/` 下的静态视觉样张（手写 HTML，**不要在它上面扩展**，T1 会在 `apps/web` 里重做）。
- `README.md` 里的 `npm install && npm run dev` 是**目标状态**，现在还跑不起来。
- 样例数据已通过 `node scripts/verify-content.mjs`。
- 不要宣称任何功能"已实现"，直到你能给出测试或截图。

## 本轮任务：T0 地基（只做这些）

**T0-1 脚手架**
- Vite + React + TypeScript
- 四个一级路由（`/workspace` `/lab` `/connection` `/atlas`）
- 三栏布局外壳（左导航 / 主区 / 可收起 AI 侧栏）+ 底部状态条
- 错误边界；所有首屏按钮有动作

**T0-2 ADR-0002**
- 填写 `docs/DECISIONS.md` 的 ADR-0002：框架、Markdown 解析器、编辑器、图谱库、存储
- **先验证 Qoder Sites 的能力**（SPA 深链、包体限制、iframe），把结果填进那张表
- 每个选择写"被排除的方案及原因"

**T0-3 领域类型**
- 用 zod 把 `content/demo/linear-algebra/*.json` 的类型写出来
- 类型名与字段名**必须**与 `docs/GLOSSARY.md` 和 JSON 完全一致
- 写一个加载器，开发时从 `content/demo` 读，构建后能静态提供

**T0-4 内容校验接入**
- 把 `scripts/verify-content.mjs` 挂到 `npm run verify:content`
- （可选）用 ajv 加载 `schemas/*.json` 做真正的 schema 校验

## 完成判据

```bash
npm install
npm run dev        # 四个路由都能点，看到外壳和已加载的课程标题
npm run typecheck  # 通过
npm run verify:content  # 通过
npm run build      # 通过
```

并且：`docs/DEVELOPMENT_LOG.md` 新增一条记录，附上**真实命令输出**与至少 1 张截图。

## 不要做（本轮）

- 不要写阅读器、图谱、检索、实验（那是 T1–T5）
- 不要接 LLM
- 不要 push 远端、不要部署公网（等我确认）
- 不要改 `content/demo` 的数学内容与 `prompts/*.md` 的 rubric

## 开始前先回复我

用不超过 15 行说清：
1. 你选的栈与**最关键的一个取舍**（不要罗列所有备选）
2. 目录结构
3. 你打算怎么验证"外壳真的能用"（而不只是"build 通过"）
4. 你发现的本仓库任何**矛盾或不明确之处**（这条很重要，不要客气）

然后开始写代码。每完成一个任务就在日志里记一条。
---

## 给用户的话（不要粘贴给 Qoder）

- 它开始跑了以后，**你只负责三件事**：验收讲义能不能读、图谱能不能编辑、链接能不能打开。
- 它说"已完成"时，要求它贴**命令输出**或**截图**。没有就不要采信。
- 每天结束看一眼 `docs/IMPLEMENTATION_PLAN.md` 的时间表，落后就按 §3 砍功能，
  但**不要砍"带理由的边"和"可编辑的个人视图"**——那是这个项目的全部。
