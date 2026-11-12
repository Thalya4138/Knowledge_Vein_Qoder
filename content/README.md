# content/ 目录说明

## demo/ 可以提交，workspace/ 不可以

| 目录 | 内容 | 进 Git？ |
| --- | --- | --- |
| `content/demo/` | **原创**演示知识库，公开可用 | ✅ |
| `workspace/` | 用户的真实课程材料、私人笔记 | ❌（已在 `.gitignore`） |

**不要把课程 PPT、教材 PDF、课堂录音转写放进 `content/demo/`**，哪怕只是"测试一下"。
一旦进了 Git 历史就很难彻底移除。

**唯一例外**：开放许可、明确允许再分发的公开材料（如 MIT OCW 的 CC BY-NC-SA 讲义），
可以放进 `resources/files/`，前提是 `manifest.json` 里登记了 `license`、`uri` 和 `localPath`。

## 一个知识库的最小结构

```text
content/demo/<kb-name>/
  kb.json                元信息 + level(学科/课程/专题) + 主干大纲（written / planned）+ 父子知识库
  notes/*.md             讲义（唯一内容真源），教材式版式见 prompts/NOTE_GENERATION.md §3.5
  notes/figures/         讲义插图
  graph.json             节点 + 带理由的关系 + 关系组 + 记忆线索
  resources/manifest.json 资源清单 + 片段级来源（spanId → 页 / 时间 / 文本锚 + 引文 + why）
  resources/files/       开放许可材料的本地副本（可选）
  layouts/
    structure.json       结构视图布局
    logic.json           逻辑视图布局
    personal.json        个人记忆视图布局
    learning.json        学习证据（可选）
  rendered/              讲义的期望渲染结果（可选，仅 demo 用于阅读器验收；不属于知识库格式）
```

大纲里 `status: "planned"` 的章节只有图谱节点、还没有讲义——图谱可以比已写的讲义更大。

## 写讲义时的硬规则

只用 `prompts/NOTE_GENERATION.md` §3.5、§4 列出的块类型，别的会被 `verify:content` 拒绝：

```text
正文块：material  note  aside  link  trap  exercise  method  viewpoint  unsourced
教材栏目：problem  focus  side  ask  xref  res  figure  table  practice  discuss  critical  training  summary
```

**不要自创 `> [!tip]` / `> [!caution]`** —— 同义词扩散会让前端解析器
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
- 教材版式：必备栏目齐全；旁栏 `@锚点` 对应真实的 `^锚点`；资源卡 `> [!res] s.id` 指向真实 span 且带 `why`；图片文件存在
- 图谱的 `noteAnchor` / `sourceSpanIds` / `evidenceIds` 都能落地
