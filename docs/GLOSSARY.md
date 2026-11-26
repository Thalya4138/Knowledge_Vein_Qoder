# 术语表（Glossary）

**本文件是命名的唯一真源。** 代码、文档、UI 文案、prompt 必须使用左列的术语，
不得混用右列的同义词——历史上正是同义词扩散导致 `explanation` / `rationale` / `description`
三套字段并存，最终图谱退化成装饰。

| 统一术语 | 英文 / 代码名 | 禁止混用 | 定义 |
| --- | --- | --- | --- |
| 知识库 | `KnowledgeBase`（落盘 `kb.json`，主键 `kbId`） | 课程、专题、项目；**代码与文件名不要再出现 `course`** | 一个可独立落盘的目录，含大纲、资源、讲义、图谱、布局、证据。粒度由用户开库时用 `level` 决定：`discipline` / `course` / `topic`，同一份 schema，不换结构 |
| 资源 | `Resource` | 材料、文档、文件 | 一份外部输入（PDF/网页/视频/课件），带来源与许可 |
| 来源片段 | `SourceSpan` | 引用、出处 | 资源内的一个可定位范围（页/段/时间戳），是"保真"的最小单位 |
| 讲义 | `NoteDocument` | 笔记、教案、教程 | 人能连续阅读的 Markdown 正文，**唯一内容真源** |
| 知识节点 | `KnowledgeNode` | 概念、知识点、卡片 | 图谱实体：concept/theorem/method/example/question/idea |
| 知识关系 | `KnowledgeRelation` | 边、连接、link | 两节点之间**带类型、理由、条件、证据**的关系 |
| 关系组 | `RelationGroup` | 超边、多边 | 多前提→多结论的推导结构，不可压成二元边 |
| 认知状态 | `epistemic` | 置信度、可信度 | 关系的认识论等级，见下 |
| 布局 | `ViewLayout` | 画布、视图、图 | 某一种视图下节点的位置/分组/样式，**只此一端** |
| 变更建议 | `ProposedChange` | 修改、编辑、更新 | AI 产出的待确认改动，必须经 diff 预览 |
| 可视化实验 | `VisualizationRun` | 演示、动画 | 一次可复现的参数化运行，含工具、参数、结果、结论 |
| 学习证据 | `LearningEvidence` | 进度、掌握度 | 练习/回忆的实测记录，掌握状态由它推断 |
| 个人联想边 | `PersonalEdge` / `personalEdges` | 手绘边、自定义连线、「我的关系」、「我的连线」（思维导图里的叫法） | 个人视图里用户自己画的记忆连线。**不是** `KnowledgeRelation`：理由选填（ADR-0006），但可见标签必填；不进逻辑/结构视图，不得充当证据 |
| 记忆线索 | `MemoryCue` | 备注、标签 | 用户私有的联想、谐音、场景、路径，**不是客观关系** |
| 工作区 | `Workspace` | 账户、空间 | 用户本地/浏览器内的私人数据根，不进公开仓库 |

## 认知状态 `epistemic` 的六个取值

顺序即强度，**不可混用颜色或语义**：

| 值 | 含义 | UI 呈现建议 |
| --- | --- | --- |
| `source-backed` | 有出处原文支持 | 实线，最深色 |
| `logically-derived` | 可从已接受前提推导 | 实线 |
| `pedagogical-inference` | 教学上的合理归纳，无独立证据 | 虚线 |
| `analogy` | 类比启发，非证明 | 点线 + 标明"类比" |
| `hypothesis` | 猜想/待验证 | 点线 + 标明"待验证" |
| `user-personal` | 用户个人联想，不对他人成立 | 双线 + 标明"我的" |

## 状态机

```text
proposed ──确认──► accepted ──► archived
    │                  │
    └──拒绝──► rejected  └── 可被新版建议替代（保留历史）
```

`proposed` 的关系**不得**参与"掌握度"计算，**不得**作为结构视图的主干，
**不得**在导出时省略状态字段。

## 可视化挂载 `viz`

导图主题上的可选字段 `viz`，值为一张预置实验的稳定 id（如 `viz.photosynthesis`），
对应一次 `VisualizationRun`。它只表示「这个主题该去实验室看哪张图」，**不是知识关系**，
不进图谱、不当证据；挂载与取消都由用户确认，写入 `maps/mind.json` 后可撤销
（`TASK_R2_LINKAGE.md` L5）。

## 四个板块的定名（UI 与文档一致）

| 编号 | 中文 | 英文 | 一句话 |
| --- | --- | --- | --- |
| 01 | 学习工作台 | Learning Workspace | 收：资源 → 讲义 |
| 02 | 可视化实验室 | Visual Learning Lab | 验单个概念：可观察、可操作 |
| 03 | 知识关联探索 | Connection Explorer | 验概念之间：共机制、元结构、跨学科 |
| 04 | 认知与记忆图谱 | Cognitive & Memory Atlas | 存：组织、编辑、回忆 |
| — | 认知引擎 | Cognitive Engine | 四者共享的领域模型与证据链 |
