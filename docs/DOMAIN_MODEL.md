# 领域模型 · 知识不是一张随意连线的图

状态：设计契约，具体 TypeScript schema 由实现阶段落地并测试。

## 1. 核心实体

| 对象 | 关键字段 | 不变量 |
| --- | --- | --- |
| Workspace | id, name, locale, storageMode, schemaVersion | 私人工作区与公开演示数据严格区分 |
| Course/Topic | id, title, outline, prerequisites, resourceIds | 课程章节顺序与自由探索并存 |
| Resource | id, title, kind, uri/localRef, author, license, hash, fetchedAt | 不编造来源；原始内容不可被 LLM 静默覆盖 |
| SourceSpan | id, resourceId, locator(page/section/time/range), quote/hash | 定位器必须可验证；未知时标记 unavailable |
| NoteDocument | id, courseId, md, blocks, sourceSpanIds, revision | 可读 Markdown 是稳定可导出的内容主体 |
| KnowledgeNode | id, kind, title, aliases, noteAnchor, sourceSpanIds | concept/theorem/method/example/question/idea 等类型 |
| KnowledgeRelation | id, from, to, type, direction, explanation, assumptions, evidenceIds, status | 不允许只有“有关”两字；建议关系与确认关系分开 |
| RelationGroup | id, premiseNodeIds[], conclusionNodeIds[], logicType, proofRef | 多前提推导/合取条件，不强压成二元边 |
| ViewLayout | id, viewType, nodePositions, groups, collapsed, style | 三视图分别编辑和持久化，不复制知识节点 |
| LearningEvidence | id, nodeOrRelationIds, task, response, criteria, evaluation, date | 掌握状态从证据推断而非任意涂色 |
| MemoryCue | id, userText, linkedNodeIds, pathIds, layoutId | 用户自己的联想线索不等同于客观定理 |
| ProposedChange | id, target, before, after, rationale, evidence, status | AI 更改统一走预览 → 确认/拒绝 → 撤销 |
| VisualizationRun | id, tool, inputRef, parameters, resultRef, status | 区分真实运行、预置示例和失败 |
| ExportBundle | schemaVersion, manifest, documents, graph, layouts, assets | 导出后导入须保真，不丢布局/来源/用户修改 |

## 2. 关系类型与辨析

最小集合：
- contains/is-a（包含/分类；注意方向）
- prerequisite（先修）
- defined-by（定义）
- derives-from（推导）
- equivalent-under（在条件下等价）
- generalizes/specializes（推广/特例）
- applies-to（应用）
- contrasts-with（对比）
- analogy-to（启发性类比，非证明）
- challenges/counterexample-to（冲突/反例）

每条关系必须标记 evidenceStatus: source-backed | logically-derived | pedagogical-inference | hypothesis | user-personal。status: proposed | accepted | rejected。**推导、类比、个人记忆联想不能共用一种“真关系”颜色或语义。**

## 3. 示例：最小二乘

- 节点：列空间 Col(A)、正交投影、最小二乘、残差、法方程、AᵀA、满列秩。
- 在实数欧氏空间，最小二乘解 s 的残差 r=b−As 与 Col(A) 正交（Aᵀr=0），由此得 AᵀAs=Aᵀb。
- AᵀA 可逆当且仅当 A 满列秩；它不是无条件可逆。
- RelationGroup 可以表达“欧氏内积 + A 满列秩”到“唯一最小二乘解”的条件结构。
- 自定义记忆线索例如“先找投影，再看残差”可存 MemoryCue，**不得被描述为唯一客观证明路径**。

## 4. 数据流与同步

Resource → SourceSpan → NoteDocument → KnowledgeNode/Relation proposals；经用户确认进入 accepted graph；ViewLayout 引用这些稳定 id；LearningEvidence 更新个人掌握估计。再次导入/生成笔记时保留已有用户布局，待合并变更以冲突卡处理。

## 5. 版本和兼容

- schemaVersion 每次结构变更递增，迁移必须有回归样例。
- user-authored 与 AI-generated 字段区分 origin；生成更新不可擦除 user-authored 内容。
- 通过 JSON Schema 或 Zod 校验节点/边合法性与引用完整性。
- 导出后重新导入测试：节点数、关系类型、文档 hash、三个布局、个人线索一致。
