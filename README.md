# 知脉 · Vein
版权所有，侵权必究

把课程材料变成**人愿意读、能长期维护**的讲义；把抽象概念变成**能动手验证**的实验；
把已学知识之间**有依据的联系**发现出来；把这些沉淀成**自己能编辑、能回忆**的知识网络。

**在线体验**：<https://vein-probe-personal-dx7phlm8g8e.qoder.zone>　·　封面点「第一次来？跟着导览走一遍」，约五分钟走完四个板块。

2026 Qoder 高校创造力大赛 · StudyHack 赛道作品。

---

## 五步看懂它在做什么

用内置的示例课程「线性代数：从线性方程组到最小二乘」，不接模型也能走完：

1. **读讲义**：[学习工作台](https://vein-probe-personal-dx7phlm8g8e.qoder.zone/workspace?ws=linear-algebra&file=note-2-1) 打开《正交投影与最小二乘法》。版式照人教版教科书：主栏正文，旁栏「相关信息」与资源卡，资源卡指向原视频的具体时刻、原文档的具体页。
2. **问并定位**：底部对话框选「法方程是怎么推出来的？」，点回答里的出处，讲义跳到那一段并高亮。
3. **跳到导图**：小节标题旁的「在导图里看」打开认知记忆图谱，选中同一个知识点；导图里「打开讲义对应处」再跳回来。
4. **看一条有理由的关联**：关联探索里点示例问题，关联图上每条线都能点开看理由与成立条件；你点「收进图谱」，它才写进工作区的知识图谱。
5. **考自己**：个人记忆图谱里挖空叶子，填完按 <kbd>O</kbd> 对照原文。

---

## 四个板块

| 板块 | 做什么 | 不接模型时 |
| --- | --- | --- |
| **学习工作台** | 一门课一个工作区（就是一个文件夹）。教科书版式阅读、逐段编辑、高亮批注（批注单独存放，不改原文）；兼容 Obsidian 写法；可直接读写本地文件夹 | 阅读、编辑、批注、本地文件夹全部可用；问答只答预置问题 |
| **可视化实验室** | 一句话描述想看懂的东西，现场生成能拖动、能播放的实验页，在隔离沙箱里运行，跑不起来自动修一次。GeoGebra、JSXGraph、Plotly、D3、Three.js、Matter.js、3Dmol、Matplotlib（浏览器里的 Python）直接在网页运行；PhET 嵌入官方模拟；Manim、MATLAB、PyTorch 给本地可运行的代码；要第三方授权的（Desmos 等）换成能用的工具并写明原因。实验页可挂到导图主题上 | 三张随站发布、人工核对过的实验页（正交投影、光合作用、二次曲面）完整可用 |
| **知识关联探索** | 三种任务各有写法：碎片串联（自下而上找共同结构）、学科元思考（按整体结构重组一门课）、跨学科并联（双向映射，每条联系标明性质）；回答带可编辑关联图，可导出 Markdown / Word / PPT / PDF / 图片 | 三个示例问题的完整回答 |
| **认知记忆图谱** | 思维导图（Tab / Enter 编辑、LaTeX 公式、存 `maps/mind.json`）与个人记忆图谱（收起 / 遮盖 / 挖空自测、自由摆放） | 编辑与自测全部可用；按讲义生成 / 更新导图需要模型 |

四个板块共用同一个工作区和同一套知识点 id，所以能带着「正在看的东西」互相跳转：讲义 ⇄ 导图 ⇄ 关联探索 / 实验室。

**接入自己的模型（BYOK）**：页眉齿轮 → 模型。知脉没有服务器，浏览器直接调用模型服务；DeepSeek、通义千问、Kimi、硅基流动、OpenRouter 已实测允许浏览器直连（2026-11-26，方法见 [docs/SYNC_AND_API.md](docs/SYNC_AND_API.md) §4.1）。key 默认只存在当前标签页，关掉即清除；可在设置里选择「在这台电脑上记住」。

**界面语言**：页眉「EN」切换英文。英文覆盖页眉、封面、设置、入门文档、导览与四个板块的入口；示例课程内容、导图编辑器与阅读器内部仍为中文。

**GitHub 同步**：浏览器工作区可与一个仓库双向同步（文件栏「同步 GitHub」）。先比较，再推或拉；两边都改过的文件逐个选，不自动合并、不删文件；推送前再核对一次远端提交，不会盖掉别人的提交。令牌只存在页面内存里。

**尚未提供**：浏览器工作区直接导出为电脑上的文件夹（可先同步到 GitHub 再 `git pull`）、语义检索。

---

## 本地运行

```bash
npm install
npm run dev              # 开发服务器
npm run verify:content   # 样例数据：每条知识关系必须有理由、条件、认知状态；引用与讲义锚点完整
npm run typecheck
npm run test             # 单元测试（vitest）
npm run build            # 产物在 apps/web/dist
```

浏览器验收脚本（无头 Chrome，自带开发服务器，截图写到 `docs/evidence/`）：

```bash
node scripts/e2e-tour.mjs        # 导览 22 站逐站走完 + 入门文档 + 中英文 + 窄屏
node scripts/e2e-linkage.mjs     # 四板块联动、BYOK 设置、英文界面
node scripts/e2e-lab-fit.mjs     # 可视化实验室版式与会话历史
node scripts/e2e-lab-gen.mjs     # 现场生成：8 个浏览器库在沙箱里真实加载、隔离攻击页、自动修复、本地代码、PhET
node scripts/e2e-github.mjs      # GitHub 同步：推、拉、冲突、令牌错误（设了 VEIN_GH_REPO / VEIN_GH_TOKEN 就测真实仓库）
node scripts/e2e-real-model.mjs  # 真实模型跑实验室与关联探索（需要 VEIN_TEST_BASE / VEIN_TEST_MODEL / VEIN_TEST_KEY）
node scripts/e2e-connection-pan.mjs
```

需要本机装有 Chrome 或 Edge。用例数与产物大小以实跑输出为准，这里不抄写。

---

## 设计上不可协商的一条：边必须有理由

现有 AI 思维导图难用，主要原因在于**边不携带理由**：一张图告诉你 A 连着 B，却不告诉你凭什么连、
在什么条件下成立、什么时候不成立，于是它既不能用于回忆，也不能用于迁移。

所以任何 `KnowledgeRelation` 的 `explanation`（为什么）与 `assumptions`（在什么条件下）**必填且非空**，
`epistemic` 必须标明它是 `source-backed`（有出处）/ `logically-derived`（可推导）/ `pedagogical-inference`（教学推论）
/ `analogy`（类比启发）/ `hypothesis`（猜想）/ `user-personal`（个人联想）。
这条写在 `schemas/graph.schema.json` 里，由 `verify-content` 强制，不靠自觉。

唯一的例外是你在导图里自己画的连线（<kbd>Ctrl</kbd>+<kbd>K</kbd>）：它表达「我怎么记」，理由选填，
界面上与知识关系一眼可分，也不会被当作论据引用。

AI 的一切写入都走「提议 → 你预览差异 → 确认 → 可撤销」；个人记忆图谱的布局 AI 永远不自动重排。

---

## 仓库按数据流组织

四个板块是用户意图的入口；系统内部只有一条流水线：

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
```

- **学习工作台** 操作 `Resource → NoteDocument`
- **可视化实验室** 消费 `KnowledgeNode`，产出 `VisualizationRun`（回链到主题）
- **知识关联探索** 生产 `KnowledgeRelation` 的**候选**，由你逐条裁决
- **认知记忆图谱** 组织、保存、重新提取它们

Markdown 是唯一真源；图谱、布局、索引都是衍生物，不反向覆盖原文。工作区就是普通文件夹，Obsidian / VS Code / 纯文本编辑器都能直接打开。

```text
apps/web/src/
  app/          外壳、封面、入门文档、导览（app/tour/）、跨板块链接（links.ts）
  features/     workspace | lab | connection | atlas，对应四个板块
  reader/       讲义阅读器、块级编辑、批注
  content/      讲义解析（标题锚点、callout、Obsidian 语法）
  store/        工作区存储（IndexedDB / 本地文件夹）
  ai/           模型调用与服务清单（providers.ts，含跨域实测结论）
  ui/           设计系统组件
content/demo/   公开样例知识库（原创讲义 + 公开课程来源声明）
schemas/        JSON Schema：kb / graph / manifest / layout / evidence
prompts/        给模型的生成契约（带版本）
docs/           产品、数据、架构、设计、比赛、开发日志
workspace/      本地私人知识库，.gitignore 排除，永不提交
```

---

## 先读哪一页

| 你是 | 读这个 |
| --- | --- |
| **评委 / 第一次打开仓库** | 本页 → 在线体验的导览 → [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md) §2 |
| **开发者** | [AGENTS.md](AGENTS.md)（开发规范）→ [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) → [docs/DESIGN.md](docs/DESIGN.md) |
| **来接手任务的协作者** | [docs/HANDOFF.md](docs/HANDOFF.md)（认领、分支、交付；交接卡是唯一对话面） |
| **想知道用户要什么** | [docs/VISION.md](docs/VISION.md)（需求原文）→ [docs/REQUIREMENTS_TRACE.md](docs/REQUIREMENTS_TRACE.md)（需求 → 规格 → 现状） |
| **想知道做到哪了、怎么验证的** | [docs/DEVELOPMENT_LOG.md](docs/DEVELOPMENT_LOG.md)（只记实际发生的事，最新在上） |
| **要改数据结构** | [docs/DOMAIN_MODEL.md](docs/DOMAIN_MODEL.md) → [content/demo/](content/demo/) |
| **要改讲义 / 关联探索的写法** | [prompts/NOTE_GENERATION.md](prompts/NOTE_GENERATION.md) → [docs/TEXTBOOK_STYLE_ANALYSIS.md](docs/TEXTBOOK_STYLE_ANALYSIS.md)；`prompts/EXPLORE_*.md` |
| **要接模型 / 同步** | [docs/SYNC_AND_API.md](docs/SYNC_AND_API.md) |
| **要提交比赛** | [docs/CONTEST_SUBMISSION.md](docs/CONTEST_SUBMISSION.md)（规则与清单）→ [docs/CONTEST_POST.md](docs/CONTEST_POST.md)（帖子草稿） |

---

## 隐私边界

私人教材、课程 PDF、API key、个人笔记**不进 Git、不上公网**。密钥只存在页面内存里，不写日志、
不存浏览器存储、不进地址栏。本地知识库放 `workspace/`（已被 `.gitignore` 排除）。

> 本目录同时是一个 Obsidian vault。`.gitignore` 只挡得住 Git，挡不住 Obsidian：
> 不要把构建产物、日志、大批临时输出写在这里。

---

## 链接

- 在线体验：<https://vein-probe-personal-dx7phlm8g8e.qoder.zone>
- GitHub：<https://github.com/Thalya4138/Knowledge_Vein_Qoder>
- 赛题：<https://tianchi.aliyun.com/competition/entrance/532536>（StudyHack 赛道，截止 2026-11-30 18:00 北京时间）
- 参照产品：[docs/REFERENCES.md](docs/REFERENCES.md)
