# 领域模型 · 知识不是一张随意连线的图

**状态：v1.0 契约。** TypeScript 类型在 `apps/web/src/domain/` 落地；本文件与 `schemas/*.json` 是权威。
真实实例见 `content/demo/linear-algebra/`——**写代码前先读那几份 JSON，它们比本表更精确。**

术语统一见 [GLOSSARY.md](GLOSSARY.md)。产品约束的来源见 [PRODUCT_SPEC.md](PRODUCT_SPEC.md) §6.3。

---

## 1. 实体总表

| 实体 | 关键字段 | 不变量（违反即为 bug） |
| --- | --- | --- |
| `Workspace` | id, name, locale, storageMode | 私人工作区与公开 demo 严格隔离 |
| `KnowledgeBase` | id, title, outline[], prereqIds[], resourceIds[] | 课程主干顺序与自由探索并存 |
| `Resource` | id, kind, origin, title, uri?, author?, license, hash, retrievedAt | `origin` 必为 `user-import`/`discovered`/`generated`；**无许可不得标 discovered** |
| `SourceSpan` | id, resourceId, locator{page/section/time/range/text-fragment, end?}, quote?, **why?**, hash | `why` = 为什么链到正文这里；进旁栏的 span 必填（样张 `preview/textbook-demo/app.js` 的 `RESOURCES` 即其雏形）。 定位器必须可验证；不知道就写 `unavailable`，**不许猜页码** |
| `NoteDocument` | id, kbId, path, md, revision, sourceSpanIds[] | Markdown 是内容真源；AI 不得覆盖 user-authored 段落 |
| `Annotation` | id, noteId, revision, target{blockAnchor, textQuote{exact, prefix, suffix}}, kind, color?, body?, linkedNodeIds[], createdAt | `kind` ∈ highlight/comment/question/explain；**存在 sidecar（`annotations/<note>.json`），不写进 md 正文**；按文本引文重新定位，找不到就标 `orphaned` 并保留，不静默丢弃 |
| `KnowledgeNode` | id, kind, title, aliases[], noteAnchor?, sourceSpanIds[], importance | `kind` ∈ concept/theorem/method/example/question/idea |
| `KnowledgeRelation` | id, from, to, type, direction, explanation, assumptions[], epistemic, status, evidenceIds[] | **`explanation` 与 `assumptions` 非空**；`epistemic` 必填 |
| `RelationGroup` | id, premiseIds[], conclusionIds[], logicType, proofRef? | 多前提推导不得压成二元边 |
| `ViewLayout` | id, viewType, positions{nodeId:{x,y,layer?,collapsed?}}, groups[], style | 三视图独立；**AI 不得自动重排 personal** |
| `LearningEvidence` | id, targetIds[], task, response, rubric, score, date | 掌握状态从证据推断，不来自阅读次数 |
| `ChapterProgress` | chapterId, status, lastOpenedAt, evidenceIds[] | 状态只能是 `unread`/`reading`/`read`/`verified`；**`read` ≠ 掌握** |
| `MemoryCue` | id, text, linkedNodeIds[], layoutId | 用户私有；不得被描述为客观事实 |
| `ProposedChange` | id, op, target, before, after, rationale, evidence, status, undoToken? | 必须经用户确认；`undoToken` 由应用层生成 |
| `VisualizationRun` | id, tool, inputRef, params, resultRef, status, noteAnchor? | `status` ∈ real/pre-rendered/example/failed，**不许伪装** |
| `Report` | id, title, question, markdown, citedRelationIds[], citedNodeIds[], createdAt | 报告是**论证文本**，不是对话导出；每条论断有锚点或标为推论 |
| `Thread` | id, anchorContext, turns[], origin | 「追问」的载体；上下文来自选区，不来自页面 |
| `ExportBundle` | schemaVersion, manifest, docs[], graph, layouts[], assets[] | 导出→导入必须保真（节点/关系/三布局/来源） |

---

## 2. 关系类型（最小集合）

| type | 语义 | 方向 |
| --- | --- | --- |
| `contains` | 包含 / 分类 | 父 → 子 |
| `prerequisite` | 先修 | 先 → 后 |
| `defined-by` | 由……定义 | 被定义者 → 定义 |
| `derives-from` | 由……推出 | 结论 → 前提 |
| `equivalent-under` | 在给定条件下等价 | 双向 |
| `generalizes` | 推广（后者是前者的推广） | 特例 → 一般 |
| `applies-to` | 应用于 | 方法 → 场景 |
| `contrasts-with` | 对照/对立 | 双向 |
| `shared-mechanism` | 共用同一底层机制 | 双向 |
| `analogy-to` | 启发性类比（**非证明**） | 双向 |
| `counterexample-to` | 反例 / 冲突 | 反例 → 被反驳者 |

`epistemic` 的六个取值见 [GLOSSARY.md](GLOSSARY.md) §认知状态。

**禁止**：用 `related` / `关联` / `有关` 作为关系类型。它是"我不知道有什么关系"的伪装。

---

## 3. 为什么这些约束是硬的（不是风格问题）

一条只有两端、没有解释的边，会产生三个具体后果：

1. **不可回忆**：回忆靠路径重建，路径需要"为什么这一步"。没有理由的边只能被"看"，不能被"想"。
2. **不可迁移**：不知道成立条件，就无法判断新问题是否落在同类里——这正是"学过但不会用"的机制。
3. **不可纠错**：没有 `epistemic`，用户无法区分"教材这么说"与"AI 觉得像"，
   于是错误会以事实的身份进入知识库，且无法定位来源。

所以 `explanation` + `assumptions` + `epistemic` 三者是**schema 级必填**，
校验失败的关系**不得写入 accepted**。这是本产品与"AI 思维导图"的分界线。

---

## 4. 实例：最小二乘（完整数据见 `content/demo/linear-algebra/graph.json`）

```jsonc
// 节点
{ "id": "n.colspace", "kind": "concept", "title": "列空间 Col(A)",
  "importance": "core", "noteAnchor": "notes/01-列空间与最近点.md#列空间" }

{ "id": "n.normal-eq", "kind": "theorem", "title": "法方程 AᵀAs=Aᵀb",
  "importance": "core" }

// 关系：注意四个必填项
{ "id": "r.normaleq",
  "from": "n.orthogonality", "to": "n.normal-eq",
  "type": "derives-from", "direction": "forward",
  "explanation": "残差 r=b−As 与列空间正交，即 Aᵀr=0；代入 r=b−As 整理得 AᵀAs=Aᵀb。这不是从 Ax=b 变形而来，而是从最优性条件推出。",
  "assumptions": ["实数域上的标准欧氏内积", "最小化的是二范数平方"],
  "epistemic": "logically-derived", "status": "accepted",
  "evidenceIds": ["s.notes-01-orthogonality"] }

// 多前提推导：不能压成二元边
{ "id": "g.unique",
  "premiseIds": ["n.orthogonality", "n.full-column-rank"],
  "conclusionIds": ["n.unique-solution"],
  "logicType": "conjunction→conclusion",
  "note": "欧氏内积 + A 满列秩 ⇒ 最小二乘参数解唯一。缺任一前提都不成立。" }
```

**注意 `r.normaleq` 的 `assumptions`**：去掉"实数域"这个条件，在复空间里要换成共轭转置。
这种条件如果不在数据里，图谱就是错的——而"看起来一样"的图会让人以为它无条件成立。

---

## 5. 数据流

```text
Resource → SourceSpan → NoteDocument → KnowledgeNode ──► KnowledgeRelation (proposed)
                                                              │ 用户确认
                                                              ▼
                                                       accepted graph
                                                              │
                            ┌─────────────────────────────────┼──────────────────┐
                            ▼                                 ▼                  ▼
                     ViewLayout(structure)          ViewLayout(logic)   ViewLayout(personal)
                                                              │
                                                     LearningEvidence（练习/回忆）
                                                              │
                                                     MemoryCue（用户私有线索）
```

- 生成新讲义或重新导入时：**保留用户已有布局**，待合并的差异以"冲突卡"呈现，不静默覆盖。
- 索引、图谱、布局都是 `NoteDocument` 的衍生物，**不得反向覆盖原文**。

---

## 6. 版本与迁移

- 每个实体带 `schemaVersion`、`createdAt`、`updatedAt`、`origin`(`user` / `ai` / `import`)。
- 结构变更 → `schemaVersion` 递增 → 必须配迁移器与回归样例（导出→导入后字段不丢）。
- 用户自写字段与 AI 生成字段分开存，AI 更新**不得擦除 user-authored 内容**。
- 未知字段在导入时**保留**，不静默丢弃（前向兼容）。

### 导出保真测试（必须写成自动化测试）

导出 → 清库 → 导入，然后断言：节点数、关系数与类型分布、三份布局的坐标、
`MemoryCue`、`SourceSpan` 引用完整性、讲义 Markdown 的 hash 全部一致。
