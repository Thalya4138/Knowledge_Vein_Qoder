# content/ 目录说明

## demo/ 可以提交，workspace/ 不可以

| 目录 | 内容 | 进 Git？ |
| --- | --- | --- |
| `content/demo/` | **原创**演示知识库，公开可用 | ✅ |
| `workspace/` | 用户的真实课程材料、私人笔记 | ❌（已在 `.gitignore`） |

**不要把课程 PPT、教材 PDF、课堂录音转写放进 `content/demo/`**，哪怕只是"测试一下"。
一旦进了 Git 历史就很难彻底移除。

## 一个知识库的最小结构

```text
content/demo/<kb-name>/
  course.json            课程主干、章节、先修、节点清单
  notes/*.md             讲义（唯一内容真源）
  graph.json             节点 + 带理由的关系 + 关系组 + 记忆线索
  resources/manifest.json 资源清单 + 来源片段（spanId → 定位）
  layouts/
    structure.json       结构视图布局
    logic.json           逻辑视图布局
    personal.json        个人记忆视图布局
    learning.json        学习证据（可选）
```

## 写讲义时的硬规则

只用 `prompts/NOTE_GENERATION.md` §4 列出的块类型，别的会被 `verify:content` 拒绝：

```text
definition  theorem  derivation  proof  source_quote  note
viewpoint   method   extension   caveat  correction   unresolved
worked_example  contrast
```

**不要自创 `::: tip` / `::: caution` / `::: warning`** —— 同义词扩散会让前端解析器
和导出器各自为政，这正是初版仓库的病根之一。

## 写关系时的硬规则

每条 `KnowledgeRelation` 必须有：

- `explanation`（≥12 字，说清机制，不能是"两者相关"）
- `assumptions`（至少 1 条，成立条件）
- `epistemic`（六选一，不许为了显得有把握而升级）
- `analogy` / `hypothesis` 额外必须有 `boundaryOrCounterexample`

`related` 这个类型名在 schema 里被**禁止**，因为它等于"我不知道有什么关系"。

## 加一个新知识库时

能跑过 `npm run verify:content` 才算加完。它会检查：

- 关系两端指向真实节点
- 布局里没有幽灵节点
- 讲义里的 `[[链接]]` 能落到节点或章节
- 讲义没有退化成提纲（列表密度检测）
