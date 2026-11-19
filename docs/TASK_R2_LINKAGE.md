# 任务 R2-L：工作区打通四个板块

**状态**：进行中（2026-11-19）：注册表、浏览器工作区、本地句柄恢复和四板块共享当前工作区已接；完整 store 适配、maps 与 L4–L7 未做
**前置**：R5b 已交付（`task/R5b-mindmap-QoderWang1`）
**真源**：存储设计 `SYNC_AND_API.md` §1–§2；领域模型 `DOMAIN_MODEL.md`；不可协商的规则 `AGENTS.md` §1

---

## 0. 为什么要做

用户原话（2026-11-19）：「如果我在学习工作区建立了一个工作区，那么比如关联探索、认知与记忆图谱、可视化那边有没有更新」；
「当然要打通啊我自己也要用这个网站的，做的好的话为啥不造福一下」。

目标一句话：**用户在任何一个板块里打开或新建的工作区，另外三个板块立刻能用；在一个板块里的产出，能带进另一个板块。**

## 1. 开工前现状（2026-11-19 查证）

四个板块各自 `import` 示例数据，彼此没有联动：

| 板块 | 数据来源 | 证据 |
| --- | --- | --- |
| 学习工作台 | 示例知识库；「打开本地文件夹」的结果只在本页 React 状态里，刷新即失 | `features/workspace/WorkspacePage.tsx:67-75`，`localFolder.ts` 顶部注释 |
| 认知记忆图谱 | 示例知识库；工作区只认 `linear-algebra`；导图与记忆存在写死的 localStorage 键 | `features/atlas/AtlasPage.tsx:47`，`mindDoc.ts:345`，`MemoryMap.tsx:26` |
| 关联探索 | 示例图谱里写死的几条关系 | `features/connection/ConnectionPage.tsx:41,63` |
| 可视化实验室 | 独立的正交投影实验，不读工作区 | `features/lab/LabPage.tsx` |

根因：`SYNC_AND_API.md` §2 的 `WorkspaceStore` 只实现了 `demo` 一种，`apps/web/src/store/` 不存在（R2 未开始）。

## 2. 设计

### 2.1 分层

```text
              WorkspaceStore（demo / browser / folder / github，一个接口）
                                │  读写工作区文件夹里的文件
                                ▼
        WorkspaceRegistry（有哪些工作区、当前是哪个；IndexedDB）
                                │
                                ▼
   useWorkspace(wsId) → { kb, graph, notes, maps, store }   ← 全站唯一的数据入口
        │              │                 │                  │
     工作台         关联探索           认知记忆图谱         可视化实验室
```

- **一个工作区就是一个文件夹**（`SYNC_AND_API.md` §1）：导图存 `maps/mind.json`，记忆练习存 `maps/memory.json`，
  不再用写死的 localStorage 键。网页、本地文件夹、GitHub 存的是同一种东西。
- **同一个节点 id**（`AGENTS.md` §1 第 5 条）：导图主题的 `ref`、关联探索的候选关系、讲义锚点都指向 `graph.json` 的节点 id。
- **地址里带工作区**：全站统一用 `?ws=<id>`；页眉显示当前工作区并可切换，切到别的板块时带着走。

### 2.2 联动矩阵（做完后应当成立）

| 从 | 到 | 动作 |
| --- | --- | --- |
| 工作台 | 全部 | 新建 / 打开工作区后，另外三个板块的选择页立刻出现它 |
| 工作台讲义 | 图谱 | 讲义里的节点锚点「在图谱里看」；导图主题「打开讲义对应处」（双向） |
| 关联探索 | 图谱 | 回答里的关联图「加入思维导图」；候选关系「确认后写入图谱」 |
| 图谱 | 关联探索 | 选中主题「拿去探索」：带着节点与关系作为上下文 |
| 图谱 / 讲义 | 实验室 | 节点上的公式「去可视化」；可视化窗口「挂到这个主题上」 |
| 记忆图谱 | 工作台 | 挖空自测的结果写 `evidence/*.json`，工作台显示掌握情况 |

**所有写入都要先给用户预览、确认后再写，并且可以撤销**（`AGENTS.md` §1 第 4 条）；AI 不得自动重排个人记忆图谱。

## 3. 任务拆分（按依赖顺序）

每一步都单独可交付：四道门全绿 + 截图（1440 / 1024 / 390）+ `DEVELOPMENT_LOG.md` 条目 + 交接接龙一行。

| 步 | 内容 | 主要文件 | 验收 |
| --- | --- | --- | --- |
| **L0** 存储层 | `store/`：`WorkspaceStore` 接口；`demoStore`（迁移现有 fetch）、`browserStore`（IndexedDB，无新依赖）、`folderStore`（File System Access，句柄存进 IndexedDB，重开时 `requestPermission`） | `store/types.ts`、`store/demo.ts`、`store/browser.ts`、`store/folder.ts`、`store/*.test.ts` | 纯函数与 IndexedDB 读写有测试（Vitest 用 `fake-indexeddb` 需新依赖，先问；不加就只测纯函数 + 浏览器手测） |
| **L1** 注册表与当前工作区 | `WorkspaceRegistry`：新建空白工作区、打开本地文件夹、导入文件夹（`webkitdirectory`）、改名、删除；`useWorkspace()`；页眉的工作区切换 | `store/registry.ts`、`app/WorkspaceProvider.tsx`、页眉 | 刷新后工作区还在；本地文件夹重开只需点一次授权 |
| **L2** 工作台接入 | 工作台改读 `useWorkspace()`；新建工作区的入口；本地编辑写回 store | `features/workspace/*` | 新建的工作区在工作台可读写，刷新不丢 |
| **L3** 图谱接入 | 选工作区页列出全部工作区；导图与记忆改存 `maps/*.json`；`KnowledgeContext` 来自当前工作区的 `graph.json`；**新工作区的种子导图**（见 §4 ①）；旧 localStorage 键一次性迁移到示例工作区 | `features/atlas/*`，`mindDoc.ts` 的 `loadDoc / seedDoc` | 在工作台新建工作区 → 图谱页能选到它 → 编辑导图 → 在文件夹里看到 `maps/mind.json` |
| **L4** 关联探索接入 | 读当前工作区的节点与关系；「加入思维导图」（预览后写入 `maps/mind.json`）；「拿去探索」从图谱带上下文过来 | `features/connection/*` | 关联图能进导图并可撤销；没有图谱的工作区给出下一步动作，不白屏 |
| **L5** 实验室接入 | 从当前工作区收集公式（讲义 `$$…$$` + 导图 `f`）作为起点；可视化「挂到主题上」（导图主题新增可选字段，指向实验） | `features/lab/*`，`mindDoc.ts` | 导图主题能跳到对应可视化，反向亦然 |
| **L6** 讲义与图谱双向跳转 | 讲义锚点 ↔ 导图主题 ↔ 图谱节点 | `content/`、`features/workspace/FileViewer.tsx`、`features/atlas/*` | 三处任意一处都能跳到另外两处 |
| **L7**（后续）GitHub 推拉 | `githubStore`；部署到公网后实测跨域与网络（`SYNC_AND_API.md` §9） | `store/github.ts` | 另起任务 |

**改真源须单独提交**（`HANDOFF.md` §3）：`maps/*.json` 需要新增 `schemas/map.schema.json`，并在 `GLOSSARY.md` 登记「我的连线」等术语。

**2026-11-19 实施回填**：L0–L2 的浏览器 / 本地切片已落地——统一工作区与文件类型、IndexedDB 注册表和浏览器 Blob、本地目录句柄持久化、刷新恢复、移除入口、Markdown 阅读与保存。L1 的页眉切换和 L2 的工作台接入已完成；L3 目前只完成“全部板块识别同一 `?ws=`、图谱选择页列出注册工作区”，非示例工作区仍是有下一步动作的空态。**尚未完成**完整 `demoStore / folderStore` 适配、导入 / 改名 UI、`maps/*.json`、当前工作区 graph / notes / maps 数据入口以及 L4–L7。验收记录与原生目录选择框的限制见 `DEVELOPMENT_LOG.md` 同日 QoderPeng1 条目。

## 4. 待用户拍板

① **新工作区没有 `graph.json` 时，图谱从哪来？**
   - A. 按文件夹结构生成目录导图（文件夹为分支、文件为主题、Markdown 标题为子主题），用户在上面改（**建议**：确定性、马上能用）；
   - B. 空白导图，只有中心主题；
   - C. 等 R3 接入 AI 后按 `prompts/MINDMAP.md` 生成（无 key 时退回 A）。

② **导图默认写进工作区文件夹（`maps/`）还是只存浏览器？** 建议写进文件夹：用 Obsidian / git 打开时导图也在，换机器不丢。

③ **比赛截止（11-30）前做到哪一步？** 建议 L0–L3 必做（新工作区能在图谱里用），L4 做「加入思维导图」，L5–L6 视时间。

## 5. 风险与限制

- File System Access API **只在 Chrome / Edge** 可用；其他浏览器退化为「导入文件夹 + 导出 ZIP」（ZIP 要新依赖，先问）。
- 本地文件夹的授权浏览器不会永久保留：每次新会话重开都要点一次「允许」。
- IndexedDB 有配额，大 PDF 放 OPFS（`SYNC_AND_API.md` §2）。
- 新工作区在没有 AI 时没有知识关系：关联探索与「前提 n」角标会是空的，界面要说清下一步。
- 并行开发时注意：交接接龙写入前先重读 `HANDOFF.md` §4.0 当前指针（2026-11-19 发生过一次撞号）。

## 6. 端到端验收（全部做完后）

1. 工作台「新建工作区」→ 放进两份 Markdown 笔记；
2. 刷新页面，工作区还在；
3. 认知记忆图谱选到这个工作区，看到目录导图，加两个主题、画一条我的连线；
4. 关联探索选到同一工作区，问一个问题，把关联图「加入思维导图」，回到图谱看到新主题，Ctrl+Z 能撤回；
5. 用资源管理器打开这个文件夹，`maps/mind.json` 里有刚才的改动。

## 7. 用户实测反馈（2026-11-19，部署后打开本地文件夹）

用户报三个缺陷。②③ 已落在上面 L0–L2 的范围内；① 属阅读器（R1b），单列。根因均经查证，不是推测。

| # | 现象 | 根因 | 修复方向 / 归属 |
| --- | --- | --- | --- |
| ① | 本地 `.md` 全部不渲染，只显示逐行原文 | `localFolder.ts:24` 把 `.md` 归 `kind:'source'`；`FileViewer.tsx:314` 的 source 只走 `SourceView`（逐行原文）；「阅读 / 源文件」切换只对 `kind:'lecture'` 出现（`WorkspacePage.tsx:181`）。站内渲染器 `content/render.ts` 的 `renderNodes`（已含 KaTeX / callout / wiki link / sanitize）**已存在，但没有任何板块组件引用它**——R1b 未开工 | **R1b 阅读器**扩展到本地 md：把 `renderNodes` 产出的 hast 接成站内「阅读」视图，本地 markdown 也给「阅读 / 源文件」切换。渲染器不必新造，缺的是 hast→React 的接线（评估 `rehype-react` 或 hast 序列化，引入前按 §5 写明包体） |
| ② | 刷新后本地工作区消失 | `WorkspacePage.tsx:28` 的 `spaces` 只是 React state（初值仅示例）；`localFolder.ts:21` 的句柄只在内存 `Map`，无任何持久化 | **L0 / L1**：`folderStore` 句柄存 IndexedDB，重开时 `requestPermission`；`WorkspaceRegistry` 持久化工作区列表 |
| ③ | 无法删除本地工作区（功能缺失） | `WorkspacePage.tsx:81-121` 工作区栏只有「打开本地文件夹」，没有移除入口；`spaces` 只增不减 | **L1**：`WorkspaceRegistry` 删除 + 工作区栏「移除」入口。**移除只断开本页引用，不删用户磁盘上的文件** |

① 的验收：本地文件夹里放一份 `.md`，打开后默认是排好版的阅读视图（公式、callout 正常），可切到源文件再切回。②③ 的验收见 §6 第 2 步与 L1（刷新后工作区还在；能移除一个本地工作区且磁盘文件不受影响）。
