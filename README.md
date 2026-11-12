# 知脉 · Vein

把课程材料变成**人愿意读、能长期维护**的讲义；把抽象概念变成**能动手验证**的实验；
把已学知识之间**有依据的联系**发现出来；把这些沉淀成**自己能编辑、能回忆**的知识网络。

> **状态：契约 + 样例数据 + 讲义视觉样张 + 一个部署探针（T0-0）。学习产品本身仍未实现。**
> 样张 `content/demo/linear-algebra/rendered/index.html`（双击即开）只覆盖「01 学习工作台」里的讲义阅读这一格，
> 而且是人工写的静态 HTML。全貌与每块的分期见 [docs/REQUIREMENTS_TRACE.md](docs/REQUIREMENTS_TRACE.md)。
> 现在能跑的代码是**探针**，不是产品：它只回答"Qoder Sites 能不能撑住这个架构"。
> 任何“已完成”的说法必须以 `docs/DEVELOPMENT_LOG.md` 中的测试证据为准。

---

## 现在能跑什么

```bash
npm install
npm run verify:content   # ✓ 样例数据 + 引用完整性 + 讲义链接 + 布局与证据
npm run typecheck        # ✓
npm run test             # ✓ 18 项：schema↔数据一致性（A13）、A8 满列秩反例
npm run build            # ✓ 271 KB / gzip 88 KB
npm run dev              # ✓ T0-0 探针页 + 四个视口的深链占位
```

`verify:content` 强制"每条知识关系必须有理由、条件、认知状态"这条硬约束，
并检查三视图布局与学习证据的引用完整性。

`npm run dev` 打开的是 **T0-0 部署探针**（`docs/TASK_T0.md` §3）：四项能力自检
（深链回退 / 大静态资源 / 外部 iframe / IndexedDB），每项都同时给出结论、证据，
以及"这个结论会以什么方式骗人"。它的四个路由只是深链测试面，**不是外壳**（外壳是 T0-1）。

**学习产品仍然没有代码**：阅读器、检索、图谱、实验（T1–T5）都还没开始。
文档里的界面、流程、验收标准是**目标契约**，不是现状。

> 之所以先把契约和数据写完再写代码，是因为本项目最容易崩的地方不是技术，
> 是"生成的图没有理由"。这条约束必须写在 schema 里，不能写在产品文档里靠自觉。

---

## 先读哪一页

| 你是 | 读这个 | 为什么 |
| --- | --- | --- |
| **开发者** | [AGENTS.md](AGENTS.md) → [docs/TASK_T0.md](docs/TASK_T0.md) | 开发规范 + 第一轮任务说明 |
| **来干活的 agent（本地或非本地）** | [docs/HANDOFF.md](docs/HANDOFF.md) → [AGENTS.md](AGENTS.md) §2 | 认领、分支、交付、红线；交接卡是唯一对话面，聊天记录不算 |
| **想知道用户到底要什么** | [docs/VISION.md](docs/VISION.md) | 用户愿景**原文**；规格是它的工程翻译 |
| **想知道"做到哪了"的人** | [docs/REQUIREMENTS_TRACE.md](docs/REQUIREMENTS_TRACE.md) | 每条需求 → 规格 → 分期 → 现状，含待拍板的决策 |
| **要做阅读器的人** | [content/demo/linear-algebra/rendered/README.md](content/demo/linear-algebra/rendered/README.md) → `content/demo/linear-algebra/rendered/index.html` | 视觉验收样张，规格与之冲突时以样张为准 |
| **评委 / 第一次打开仓库的人** | 本页 → [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md) §2 | 3 分钟理解产品在做什么 |
| **要改产品定义的人（作者）** | [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md) | 唯一产品真源，其他文档只引用不重述 |
| **要改数据结构的人** | [docs/DOMAIN_MODEL.md](docs/DOMAIN_MODEL.md) → [content/demo/](content/demo/) | 类型表 + 真实 JSON 实例 |
| **要写讲义 / 改写作风格的人** | [prompts/NOTE_GENERATION.md](prompts/NOTE_GENERATION.md) → [docs/TEXTBOOK_STYLE_ANALYSIS.md](docs/TEXTBOOK_STYLE_ANALYSIS.md)（人教版教科书范本）→ [docs/NOTE_SAMPLE_ANALYSIS.md](docs/NOTE_SAMPLE_ANALYSIS.md) | 生成契约 + 人读得懂的可检查标准 |
| **要提交比赛的人** | [docs/CONTEST_SUBMISSION.md](docs/CONTEST_SUBMISSION.md) | 帖子模板、证据清单、倒计时 |

---

## 第一原理：仓库按数据流组织，不按功能页组织

四个板块是**用户意图的入口**，不是**系统的划分**。系统只有一条流水线：

```text
Resource ──► SourceSpan ──► NoteDocument ──► KnowledgeNode
（教材/PDF/     （页码、段落、     （Markdown，          （概念/定理/方法/
  课件/网页）      时间戳）          唯一真源）            例题/疑问）
                                                        │
                                          KnowledgeRelation（带理由、条件、证据）
                                                        │
                                    ┌───────────────────┼───────────────────┐
                                    ▼                   ▼                   ▼
                              StructureView       LogicView        PersonalView
                              （客观结构）        （推导结构）      （你自己的记忆路径）
```

四个板块只是这条流水线上的**四个视口**：

- **01 学习工作台** 操作 `Resource → NoteDocument`
- **02 可视化实验室** 消费 `KnowledgeNode`，产出 `VisualizationRun`（回链到笔记）
- **03 知识关联探索** 生产 `KnowledgeRelation` 的**候选**
- **04 认知与记忆图谱** 消费并编辑 `KnowledgeNode/Relation` 的**三种布局**

⚠️ **03 与 04 不是同一个功能。** 03 负责“发现并验证关系”，04 负责“组织、保存、重新提取关系”。
把它们合并成“自动生成思维导图”，就是本项目要反对的那个东西。

---

## 为什么现有的 AI 思维导图很鸡肋（设计约束，写给实现者）

不是因为布局算法不好，是因为**边不携带理由**。一张图告诉你 A 连着 B，却不告诉你
“凭什么连、在什么条件下成立、什么时候不成立”，于是它既不能用于回忆，也不能用于迁移。

因此本仓库有一处**不可协商的 schema 约束**：

> 任何 `KnowledgeRelation` 的 `explanation`（为什么）与 `assumptions`（在什么条件下）
> 都是**必填且非空**，并且 `epistemic` 必须标明它是
> `source-backed`（有出处）/ `logically-derived`（可推导）/ `pedagogical-inference`（教学推论）
> / `analogy`（类比启发）/ `hypothesis`（猜想）/ `user-personal`（个人联想）。

达不到这条的边，宁可不存在。见 [docs/DOMAIN_MODEL.md](docs/DOMAIN_MODEL.md) §3。

---

## 本仓库同时是三个东西（注意它们的边界）

| 身份 | 职责 | 不该做的事 |
| --- | --- | --- |
| **源码仓库** | 应用代码、schema、prompt、公开 demo | 不装私人课程资料、不装 API key |
| **内容仓库** | `content/demo/` 下的 Markdown 讲义、图谱 JSON | 不装第三方版权材料 |
| **本地知识库（长期）** | 用户自己的 `workspace/`，Obsidian 可直接打开，Git 管理 | **不进本仓库**（`.gitignore` 已排除） |

网页端的定位是 **阅读器 + 编译器 + 编辑器**：Markdown 是唯一真源，网页负责渲染、检索、
编辑和图谱视图。**不要设计只有数据库能读懂的私有格式**——那会毁掉“落盘成本地、可 Git、可换工具”
这个前提。导出必须是标准 `.md` + sidecar `.json`。

> 运维提醒：本机曾把一个 Obsidian vault 当作构建临时目录，探针写出 15 GB 文件把 Obsidian 打瘫。
> 本目录就是一个 vault + git 仓库，**不要把构建产物、日志、大批临时输出写在这里**。
> `.gitignore` 只能挡住 Git，挡不住 Obsidian。

---

## 比赛

- 赛题：<https://tianchi.aliyun.com/competition/entrance/532536>（2026 Qoder 高校创造力大赛）
- 赛道：**StudyHack**
- 硬截止：**2026-11-30 18:00（北京时间）** — 报名 + 作品帖 + 公网可用，三者都不能晚
- 交付形态：Qoder 开发 → 部署到 Qoder Sites → 天池赛题页论坛发帖
- 评分：创意与洞察 / 完成度 / 体验与设计 / Qoder 使用深度（**技术复杂度本身不计分**）

比赛版只承诺一条**纵向闭环**：

> 打开示例课程 → 读讲义（可折叠例题、可跳锚点）→ 搜到具体段落 → 提出一条关联并看到理由与边界
> → 用户确认后进入图谱 → 在个人记忆视图里改布局 → 导出，再导入，一切还在。

细节与帖子模板见 [docs/CONTEST_SUBMISSION.md](docs/CONTEST_SUBMISSION.md)。

---

## 目录

```text
apps/                 应用代码
  web/                React + Vite 前端 —— 目前只有 T0-0 探针（src/probe/）与深链占位路由
content/demo/         公开样例知识库：讲义、图谱、资源清单、学习证据 + rendered/（讲义的期望渲染结果）
docs/                 产品、数据、架构、验收、比赛、多 agent 交接（一文件一职责，不互相重述）
prompts/              给模型的契约（带版本与 I/O schema）
schemas/              JSON Schema：kb / graph / manifest / layout / evidence，CI 用它校验样例数据
workspace/            ← 本地私人知识库，.gitignore 排除，永不提交
```

---

## 链接

- GitHub：<https://github.com/Thalya4138/Knowledge_Vein_Qoder>
- 天池赛题页 / 论坛：见上
- 产品定义：[docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md)
- 参照产品（notasand / Thinki / 3B1B / WiseGraph / ClassPulse …）：[docs/REFERENCES.md](docs/REFERENCES.md)
