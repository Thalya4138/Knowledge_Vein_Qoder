# 存储、同步与 AI 接口（SYNC_AND_API）

**状态**：设计稿（2026-11-15），对应 `IMPLEMENTATION_PLAN.md` §5 的 R2、R3。实现前须经用户确认；
其中标「待实测」的结论，在实测前不得写进界面文案。

**要解决的问题**（用户原话，`VISION.md` 2026-11-15）：
「本身网址上我可以实现上面的功能。同时我可以 pull 下来到我本地，或者就是从我本地 push 到这里面去，
也可能是网页 push 到 GitHub 上。接口怎么做，功能怎么实现。」

约束：网站部署在 Qoder Sites，**没有后端**（ADR-0002）；所有逻辑在浏览器里跑；项目方不提供 API key。

---

## 1. 一个工作区就是一个普通文件夹

网页、本地、GitHub 三处存的是**同一种东西**：一个结构固定的文件夹。这样「拉到本地」「推上 GitHub」都不需要格式转换，
本地也可以直接用 Obsidian、VS Code、git 打开它。

```text
<工作区>/
  kb.json                 课程大纲、元信息（schemas/kb.schema.json）
  graph.json              知识节点与关系（schemas/graph.schema.json）
  notes/*.md              讲义（Markdown 是唯一真源）
  notes/figures/*         讲义插图
  resources/manifest.json 资源清单（出处、许可、在讲义中的位置）
  resources/files/*       可再分发的资源文件（PDF 等）
  layouts/*.json          三种图谱视图的布局（schemas/layout.schema.json）
  maps/*.json             思维导图与个人记忆图谱（R5 新增，schema 待定）
  chats/*.jsonl           对话记录，一行一轮（R3 新增）
  evidence/*.json         练习与回忆的证据（schemas/evidence.schema.json）
```

`content/demo/linear-algebra/` 就是一个这样的工作区。界面上显示的文件夹名与文件名是**给人看的名字**
（「讲义」「课程资料」「图 2-1 b 在列空间上的最近点」），与磁盘上的路径分开存放，由工作区自己的清单给出。

**不进工作区的东西**：API key、GitHub 令牌、浏览器偏好。它们只存在内存里（`AGENTS.md` §1 第 7 条）。

## 2. 存储适配器：四种来源，一个接口

```ts
interface WorkspaceStore {
  list(prefix?: string): Promise<FileEntry[]>;          // 路径、大小、内容哈希
  read(path: string): Promise<Blob>;
  write(path: string, data: Blob): Promise<void>;
  remove(path: string): Promise<void>;
  readonly kind: 'demo' | 'browser' | 'folder' | 'github';
  readonly writable: boolean;
}
```

| 适配器 | 实现 | 用途 | 状态 |
| --- | --- | --- | --- |
| `demo` | `fetch` 站内静态文件 | 内置示例工作区，只读 | 已有（工作台在用） |
| `browser` | IndexedDB（大文件放 OPFS） | 网页上的默认工作区，可读写 | R2 |
| `folder` | File System Access API（`showDirectoryPicker`） | 直接读写本地文件夹 | R2；**仅 Chromium 内核**（Chrome / Edge）；其他浏览器退化为导入/导出 |
| `github` | GitHub REST API | 拉取、推送一个仓库里的工作区 | R2；`api.github.com` 允许浏览器跨域调用 |

界面只认 `WorkspaceStore`。换来源不改界面，也不改上层的检索、图谱、对话。

## 3. 三个方向的同步

| 用户说的 | 做法 |
| --- | --- |
| **网页 → 本地**（pull 到本地） | 「导出」：整个工作区打成 ZIP 下载；或用 `folder` 适配器直接写进用户选的文件夹 |
| **本地 → 网页**（从本地 push 进来） | 「导入」：选一个文件夹或 ZIP，校验 schema 后写入 `browser`；或用 `folder` 适配器直接打开，边看边改 |
| **网页 → GitHub**（推送） | 用户填一个只授权单个仓库的 fine-grained token（只放内存）。推送用 Git Data API：为改动的文件建 blob → 建 tree → 建 commit → 更新分支引用 |
| **GitHub → 网页**（拉取） | 读分支的 tree，按内容哈希只下载变化的文件 |

**冲突**：推送前比对远端分支的提交号。远端在我们上次拉取之后动过，就**拒绝推送**，先拉取并逐个文件显示差异，由用户决定保留哪一版。
不做自动合并：讲义与图谱是用户的认知记录，静默合并比报错更糟。

本地那一侧不需要任何新工具：工作区本身就是 git 仓库里的普通文件夹，`git pull` / `git push` 照常可用。

## 4. AI 接入（BYOK）

用户 2026-11-15 已裁决（`HANDOFF.md` §4.2 ⑨）：AI 分三层，**确定性 / 构建时预置 / 用户自己的 key 实时生成**；项目不放自己的 key。

```ts
interface ModelProvider {
  id: string;                         // 'openai-compatible' | 'anthropic'
  chat(req: ChatRequest, signal: AbortSignal): AsyncIterable<ChatChunk>;  // 流式
}
```

- **OpenAI 兼容接口**一个实现覆盖多家：用户填 base URL、模型名、key（DeepSeek、通义千问的兼容模式、Kimi、OpenAI 等）。
- **Anthropic**：浏览器直连需要请求头 `anthropic-dangerous-direct-browser-access: true`。
- **待实测**：各家接口是否允许浏览器跨域直连（CORS）。实测前不在界面上列出「支持某某」。
- 模型的一切写入都走 `ProposedChange`：预览差异 → 确认 / 拒绝 → 可撤销（`AGENTS.md` §1 第 4 条）。

## 5. 问题式学习：定位不交给模型

「问一个知识点 → 定位到笔记里的位置 → 高亮 → 讲解与关联」拆成两步：

1. **定位是确定性的**：T1-1 解析器给每个标题、段落、栏目生成锚点；检索在这些锚点上做（标题、正文、别名），返回的每一处都**真实存在**。
2. **讲解与关联交给模型**：把命中的段落与图谱里相关的关系一起交给模型，要求它只基于这些材料讲解。

模型永远不负责「在哪里」，所以不会编出一个不存在的页码。现在的示例模式已按这个分工实现：位置来自讲义标题，讲解来自图谱关系原文。

## 6. 联网找资料

浏览器不能直接调用搜索引擎（跨域限制）。可选路线，按优先级：

1. 模型服务自带的联网搜索工具（部分服务提供，随用户的 key 走）；
2. 用户自己的搜索 API key（**待实测**跨域）；
3. 本地伴随程序：用户提供的 [guiless-search](https://github.com/wszqkzqk/guiless-search) 与
   [qt-web-extractor](https://github.com/wszqkzqk/qt-web-extractor) 在本机运行，网页通过 `http://localhost` 调用。
   **待实测**：Chrome 的私有网络访问限制可能要求本地服务返回额外的预检响应头。

找到的资源一律进 `resources/manifest.json`，带出处与许可；讲义里只引用、不搬运。

## 7. 导出成文件

| 格式 | 做法 | 新依赖 |
| --- | --- | --- |
| Markdown | 原样（工作区里本来就是 Markdown） | 无 |
| HTML / PDF | 阅读器的打印样式 + 浏览器「打印为 PDF」 | 无 |
| Word / PPT | 用户明确要求时再做；届时说明为什么需要 `docx` / `pptxgenjs`，并按路由懒加载 | 有，待批准 |

## 8. 每个位置有自己的提示词（2026-11-16）

用户要求：「接进来的模型得能够在不同的位置去拥有那个部分的 prompt 和要求」。做法是一张登记表加一条覆盖规则：

- **登记表** `prompts/registry.json`：每个 AI 位置（如 `workspace.ask`、`connection.fragments`、`atlas.quiz`）登记它用哪份提示词、输入是什么、输出必须是什么结构、现在的状态。所有位置共用 `QUALITY_BAR.md` 的底线。
- **调用**：界面只说「我在哪个位置」，由适配层按登记表取提示词、拼输入、校验输出结构；校验不过就不展示，提示重试。模型换了，提示词不跟着散落在代码里。
- **覆盖**：工作区里放 `.vein/prompts/<位置>.md`，就用它替换内置的同名提示词。工作区接入 GitHub 后，提示词的每次修改都有版本记录，可以对比效果、随时回退。

## 9. 现状（2026-11-16）

| 能力 | 状态 |
| --- | --- |
| 本地文件夹：打开、浏览、文本文件编辑并存回 | 已实现（Chrome / Edge）；句柄只在本页内存，刷新后需重新选择 |
| 示例工作区的编辑 | 渲染结果与源文件都可编辑，改动存为本机草稿（localStorage），可恢复原稿 |
| 模型设置与测试连接 | 已实现；key 只在内存；「测试连接」只请求模型列表 |
| GitHub 拉取 / 推送 | 未实现。本机直连 GitHub HTTPS 不稳定（需代理），要在部署后的公网地址实测跨域与网络后再接 |
| 统一的模型调用与流式输出 | 未实现（R3） |


## 10. 用一张图讲清：模型怎么拿到各个位置的提示词（2026-11-16）

用户问：「API 接入之后那个模型仅通过这个网页就能获取各个 prompt？还是？」

答案是：**模型自己什么都不「获取」，是网页在每次提问时把这个位置的提示词和你的内容一起发给模型。**

```text
你在关联探索里点「发送」
        │
        ▼
网页（运行在你的浏览器里）
  1. 看你在哪个位置：connection.fragments
  2. 按 prompts/registry.json 取这个位置的提示词（随网站一起发布；工作区里有同名文件就用工作区的）
  3. 拼成一次请求：提示词 + 你输入的碎片 + 要求的输出格式
        │  用你在设置里填的 key，直接发给模型服务（DeepSeek、通义千问……）
        ▼
模型服务：只看到这一次请求的内容，按要求作答，然后忘掉
        │
        ▼
网页：检查回答是否符合要求的格式 → 显示回答与关联图 → 你确认后才写进笔记或图谱
```

几个要点：

- **提示词在网站里，不在模型里。** 模型没有记忆，不知道「知脉」有哪些位置；每一次调用，网页都把对应的提示词完整地带过去。所以换模型不用改提示词，改提示词也不用动模型。
- **每个位置一份提示词**，登记在 `prompts/registry.json`；这些文件随网站一起部署，所以「仅通过这个网页」就能用到全部提示词。
- **工作区可以覆盖**：在你的工作区里放 `.vein/prompts/<位置>.md`，网页就优先用它。工作区连上 GitHub 后，提示词的每一次修改都有版本记录。
- **没有中间服务器**：请求从你的浏览器直接到模型服务，key 只在内存里。代价是要求模型服务允许浏览器直接调用（跨域），这正是设置里「测试连接」要检查的事。
