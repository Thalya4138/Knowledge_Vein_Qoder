# 技术与产品决策记录（ADR）

一条决策 = 背景 + 选项 + 选择 + 代价 + 何时重审。**不要只写结论。**

---

## ADR-0001 · 网站优先、文件优先、用户控制（2026-11-11，已采纳）

**背景**：用户要一个网页，但长期要把知识库落盘到本地、用 Git 管理、可被其他工具打开。

**选项**
1. 纯网页 + 云端数据库：体验顺，但知识库被锁死，违反"落盘成本地"。
2. 桌面应用（Electron/Tauri）：本地能力完整，但比赛要求部署到 Qoder Sites，且开发成本高。
3. **网页 + 浏览器存储 + 显式导入导出 + 后续本地 companion**。

**选择**：3。

**代价**：浏览器不能随意写 `C:\`；IndexedDB 可能被清理；用户需要手动导出。
**缓解**：常驻状态条说明数据位置；自动导出提醒；P1 提供目录句柄或本地 companion。

**何时重审**：若 Qoder Sites 提供任何持久化后端，或用户日常使用频率高到"手动导出"成为负担。

---

## ADR-0002 · 应用框架 / 编辑器 / 图谱 / 存储选型（2026-11-14 定稿；2026-11-15 用户确认「选型可行」后已采纳）

**背景修正**（2026-11-12）：`ARCHITECTURE.md` 原写"必须先写完本 ADR 再开工"，那句做不到——
下面的能力表只能靠部署一次实测得到，先写 ADR 就是让 ADR 猜。因此顺序改为
**T0-0 探针 → 本 ADR → T0-1 外壳**。探针见 `TASK_T0.md` §3；上公网前需用户确认。

探针结论出来之前的临时决定：**路由用 HashRouter**。它在任何静态托管上都能跑深链，
日后实测确认支持 SPA 回退再换 BrowserRouter，改动只有一行。这是临时措施，不是选型结论。

**2026-11-12 实测后的更新**：托管站在 `spa: true` 下确实把文档请求回退到 `index.html`
（从 `/atlas` 整页导航能启动应用），所以 **T0-1 外壳可以直接用 BrowserRouter**，不必保留 HashRouter。
探针页自身维持 HashRouter 不动——它已经发布可用，而换路由不会影响上面测出的任何一格结论。

**状态：已定稿（2026-11-14）并已采纳（2026-11-15，用户确认「选型可行」）**。每项写清"选择 / 为什么 / 被排除的方案 / 怎么验证"。凡是没实测的，
本节一律标"未验证"，不把估算写成结论。

**先记住五个共同前提**（都来自下面的能力表，不是假设）：

1. 托管站是**静态托管 + SPA 文档回退**：整页导航有回退，资源请求没有。所以路由资源必须用构建后的
   真实路径，**不能用 `fetch('/某路由')` 探活**（§6 的坑）。
2. **没有默认后端**：比赛版全部逻辑在浏览器内；BYOK 的 key 只能在内存，不能进 localStorage、URL、日志。
3. **IndexedDB 可读写**（20 万字符写入/重载读取已通过），但"浏览器不会清理它"**未验证**。
4. 单个静态资源 **256 KB**、整包 **523.9 KB** 已验证可部署；**上限未测**——所以选型要能懒加载，不能假设无限。
5. iframe 可嵌入外部站点（Desmos 已通过），但视频仍不在抽屉内嵌（ADR-0007）。

### 1. 框架与构建：Vite + React + TypeScript（已采纳）

- **选择**：Vite 8 + React 19 + TypeScript 7（就是 T0-0 探针用的栈，`package.json` 现状），输出静态
  `dist/`，托管站直接吃。
- **包体多大**：探针产物 JS 271.33 kB / gzip 88.05 kB（已含 react-router）。**内部预算**：首屏 JS
  gzip ≤ 300 kB、任一单路由懒加载块 gzip ≤ 300 kB、整包 ≤ 2 MB。超预算先查重复打包和误引入，
  再考虑换库——不是先换库。
- **为什么**：探针已在这套栈上实测过三项能力，换栈等于把实测作废；TS 与 `schemas/`、zod（T0-3）
  是同一套类型思路；图谱与编辑器的 React 生态最厚。
- **被排除**：Next.js / Remix —— 要 Node 运行时或 SSR，Sites 是静态托管，本项目也没有 SEO 诉求，
  只增加部署面；Vue / Svelte —— 运行时更小，但现有探针、样例与工具链都在 React 上，迁移无收益；
  Astro —— 内容站思维，四个视口都是长驻交互应用，岛屿模型不合。
- **代价**：React 运行时占首屏大头 → 用路由级 `lazy()` 把编辑器、图谱、实验室拆出去。

### 2. Markdown：unified / remark + KaTeX，自写小插件（已采纳）

- **选择**：`unified` + `remark-parse` + `remark-gfm` + `remark-math` + `rehype-katex`；Obsidian callout、
  `[[wiki link]]`、`<details>` 各由一个小插件/白名单放行。
- **为什么不是 markdown-it**：检索命中、锚点跳转、"这条证据对应哪一句"都要**源码行号**。mdast 的
  `node.position` 是稳定契约；markdown-it 的 `token.map` 要为每条规则单独兜底。AST 还能让 callout
  变成结构化的栏目标注，而不是再拿正则扫 HTML。
- **被排除**：marked（插件模型太弱，改不动 AST）；MDX（正文可执行 JSX——LLM 或用户输入就成了代码
  注入面，也违背"Markdown 是唯一真源"）；自写解析器（CommonMark 边界成本远超收益）。
- **安全**：`<details>` 等原生 HTML 走 `rehype-raw` 时必须过 `rehype-sanitize` 白名单；LLM 生成的正文
  一律按不可信输入处理。
- **导出降级**：渲染器**不写回原文**；导出直接写源文件字节（A7 的 Markdown hash 一致）。callout 在
  GitHub / 纯文本里自动降级为引用块（ADR-0005），不丢内容。
- **锚点规则**：源文件里的 `^blockId` 原样保留（`verify:content` 已在校验 `@锚点`）；标题锚点由解析器
  按同一规则生成，检索索引与阅读器**共用这份实现**，不许各写一套。
- **验证**：T1-1 拿 `content/demo/linear-algebra/notes/2.1-*.md` 做"解析 → 渲染 → 导出回读"，
  T1-3 验跳转与复制。

### 3. 编辑器：CodeMirror 6（分栏预览，懒加载）（已采纳）

- **选择**：CodeMirror 6 + `@codemirror/lang-markdown`，左编辑右预览；只在进入编辑态时 `import()`。
- **为什么**：真源是 Markdown 文本，CM6 本来就是文本编辑器，编辑后导出天然无损；行号、选区、undo
  都与"改了哪一行"一致。
- **被排除**：Tiptap / ProseMirror —— 富文本模型再序列化回 Markdown 会丢 callout / details / wiki link，
  直接踩 ADR-0005 与 A7 保真红线；Monaco —— 约 2 MB 量级，IDE 能力用不上；纯 textarea —— 大文档
  滚动与语法高亮不达标。
- **代价**：没有真正的 WYSIWYG，只能分栏预览；移动端编辑一般——比赛版以读为主，编辑是轻量场景
  （`UX_AND_FLOWS.md` §7）。
- **导出保真怎么验**：A7（导出 → 清库 → 导入后 Markdown hash 与节点/边/布局/记忆线索一致）进 `test`；
  另做一次手测：编辑后不提交、直接导出，不得把未确认的改动写进文件。

### 4. 图谱：React Flow（`@xyflow/react`）（已采纳）

- **选择**：React Flow 12（包名 `@xyflow/react`），自定义节点与边，路由级懒加载。
- **判据**（不是美观）：拖拽、连线、撤销、大图性能。React Flow 原生给节点拖拽、连接手柄、视口、
  选择与自定义渲染；"先填理由再落边"用受控连线做——`onConnect` 只开理由表单，确认后才写领域模型。
- **撤销**：**不用库自带的历史**，领域层维护统一命令栈（图编辑、布局、候选确认共用），避免两套状态
  打架，也让 `ProposedChange` 的确认/拒绝可以撤销。
- **被排除**：Cytoscape —— 大图性能更强，但编辑交互与 React 状态要另接一层，连线理由表单更难做；
  d3-force —— 命中测试、拖拽、连线、撤销全得自建，工期不够；vis-network —— 样式与无障碍控制不足。
- **规模**：样例 15 节点 / 13 条关系 / 1 个关系组，渲染压力可忽略。**目标**是 ≥ 300 节点仍可拖动，
  **未测**——T3-1 用合成数据实测后回填本 ADR。
- **代价**：大图要靠 memo 与分层渲染；布局是衍生物，坐标只进 `layouts/*.json` 与 IndexedDB，
  不回写 Markdown。

### 5. 存储：IndexedDB + Dexie（已采纳）

- **选择**：Dexie 4 封 IndexedDB；表覆盖文档工作副本、三视图布局、`ProposedChange`、撤销栈、设置；
  用 `version(n).upgrade()` 做迁移。
- **为什么**：需要多表、索引（按 `kbId` / `nodeId` 查）、跨表事务与版本迁移——正好是 Dexie 的强项，
  探针已验证 IndexedDB 能扛 20 万字符。
- **被排除**：localforage —— 只有 KV，没有索引/事务/迁移；裸 IndexedDB —— 样板与迁移全自己写；
  localStorage —— 5 MB 上限且同步阻塞，装不下大笔记加布局；`idb` —— 省几十 KB 但迁移和查询要自建，
  不值。
- **边界**：IndexedDB 是**工作副本与衍生物**，不是真源；Markdown 文件才是。浏览器可能清理站点数据
  （未验证），所以启动时请求 `navigator.storage.persist()` + 明确提示"导出备份"；写入失败/配额满
  必须显示状态，不吞异常。
- **AI 写入**：一律先进 `ProposedChange` 表，用户确认后才改文档（AGENTS 第 4 条）；key 只驻内存。

### 6. 数学与测试（次要，一并定下）

- **KaTeX** 本地渲染，不依赖外部 CDN；数学公式不走 iframe。
- **Vitest** 已就位（T0-4）。**Playwright 暂缓**：等 T1-2 / T3-3 出现第一个必须点着验的交互再加，
  它体积大、只进 devDependencies，不进运行时包；加的时候单独记一次依赖决定。

### 尚属未验证的假设（T0-2 不把推测写成结论）

- 平台单资源/整包上限：只测到 256 KB 与 523.9 KB 的**下界**。
- IndexedDB 数据是否会被浏览器清理：只测了刷新后仍在。
- React Flow 在 300 节点时的拖拽帧率。
- CodeMirror 在 375 px 宽下的实际可用度。

以上由 T0-1 / T1 / T3 的实测回填；回填前不得在比赛材料里引用为"已验证"。

### 何时重审

- 首屏 gzip 超 300 kB 或整包超 2 MB，且不是重复打包导致；
- 300 节点实测低于可接受交互帧率；
- 导出 → 导入（A7）出现内容丢失——那是保真红线，**出现即修**，不是重审；
- Qoder Sites 开放可用后端、且用户要求用代理隐藏 BYOK 密钥。

**Qoder Sites 能力实测结果**

实测条件：探针页（深链测法修正版）发布到**个人版账号**下的站点
`https://vein-probe-personal-dx7phlm8g8e.qoder.zone`，`access_mode: public`、
`auth_integration_status: not_required`。构建自干净工作树的 commit `0dd380b`，
`prepare_site` 新 action + `createNewSite: true`、`spa: true` 主动开启。
**匿名性由不带 cookie 的 curl 证明**，四项自检在浏览器里跑（浏览器恰好登录，但站点已不需要登录）。

| 问题 | 探针里怎么测 | 结果 |
| --- | --- | --- |
| SPA 深链是否 404 | 从 `/atlas` 整页导航，看应用是否启动 | **通过（匿名）**：`/atlas` 与任意不存在路径在 `Accept: text/html` 下都返回 200 + 应用外壳 → **BrowserRouter 可行**。`Accept: */*` 是 404，见下方测法说明 |
| 构建产物 / 单资源大小限制 | 放一个较大的静态资源并加载 | **通过（下界）**：整包 523.9 KB 上传与校验通过；`probe/large.txt` 256 KB 匿名下载完整（262144 B，439 ms）。**上限未测**——没探到边界就不能写上限 |
| 可否 iframe 嵌入 GeoGebra/Desmos | 嵌一次 Desmos | **通过**：`load` 事件 3.2–6.0 s（首次较慢），网络面板 `calculator?lang=zh-CN` → 200 `text/html`。2026-11-14 补视觉证据：四项整页 `docs/evidence/t0-0-sites-atlas.png`（agent 截）；Desmos 坐标系 `docs/evidence/t0-0-sites-desmos.png`（**用户截图**——in-app 截图对跨源 iframe 只出空白，见 `HANDOFF.md` §6） |
| IndexedDB 可否读写、是否被清理 | 写一条、刷新、再读 | **通过**：写 200,000 字符，重载后首次时间戳不变、累计次数递增、内容完整。**"不会被清理"没测到**——那需要隔天再访问 |
| 是否有任何持久化后端能力 | 看 Sites 是否给存储/函数能力 | **未启用**：探针刻意不带 Function/数据库。平台确有 `functionDirectory` / `databaseAccess` / Storage 入口，是否允许由后续 ADR 决定 |

**测法本身踩过一个坑，值得记进决策依据**：第一版探针用 `fetch('/no-such-route')` 判回退，
在同一个 `/atlas` 上得到 404，而浏览器导航得到应用外壳——**回退只给文档请求**
（`Sec-Fetch-Dest: document`），资源请求一律 404。据此差点写下"必须用 HashRouter"的错误结论。
判据改成"应用是从哪个 `pathname` 启动的"之后才测对。这条已写进 `HANDOFF.md` §6。

**2026-11-19 完整应用发布（R5b 思维导图 + 记忆图谱 UI）**：同一站点（个人版
`vein-probe-personal-dx7phlm8g8e.qoder.zone`，`public`）由旧 T0-0 探针替换为完整应用。
发布时分支 HEAD `dc810b3`（应用代码 `8db03f9`），`prepare_site` 复用 projectId、新 action
`d9a7ff42-4cf8-4d0f-a515-98dbff0c8e81`、`spa: true`、`databaseAccess: none`；`publish_site` 后
`published: true`、`readiness: publication_completed`。**匿名 curl（不带 cookie，文档请求头
`Accept: text/html` + `Sec-Fetch-Dest: document`）**：`/`、`/workspace`、
`/atlas?ws=linear-algebra&map=memory`、`/guide`、任意不存在路径均 200 + 应用外壳（入口
`index-B3o431L4.js`）；资源 200 且 content-type 正确。**再次踩到并验证上述测法坑**：默认
`Accept: */*` 的 curl 对深链得 404（资源请求不回退），加文档头即 200——非缺陷。**未测**：
设置里 BYOK「测试连接」在公网地址下的跨域结果（需浏览器与模型服务，留待用户）；IndexedDB 隔天清理仍未测。

**2026-11-20 R2-L3 版本发布（工作区存储补全 + BYOK 导图生成）**：同一站点、同一 projectId，
新 action `5f2551f9-a833-4365-9f30-c2f9f510dc0b`（`spa: true`）。发布时分支
`task/R2-L3-QoderWang2` HEAD `9846d48`（真源单独一笔 `58a54b0`、代码 `41dd420`、文档 `9846d48`，
均已 push）。`published: true`、`readiness: publication_completed`；线上入口
`index-kHQR9TfK.js` 与本地构建一致。匿名 curl（文档请求头）五个路径含深链均 200。
**未测**：真实 key 的导图生成质量与公网跨域——用户本轮选择跳过，留待下一轮（未达标先改
`prompts/MINDMAP.md`，不改核对代码）。

**2026-11-20 晚 R3/R4 版本发布（对齐文件夹 + 导图 AI 对话 + 博物图鉴拓印美工）**：同一站点、
同一 projectId，新 action `c60fa45c-309f-40fc-99d9-9079a238ae4b`（`spa: true`）。发布时分支
`task/R2-L3-QoderWang2` HEAD `27feae1`（代码 `709b9b5`、文档 `27feae1`，均已 push）。
`published: true`；线上入口 `index-CBBbtEP0.js` 与本地构建一致；匿名 curl（文档请求头）
五个路径含深链均 200。**未测**：真实模型的改图质量与跨域；拓印滤镜只在 Chrome 验证。

**2026-11-24 R2-L4 关联探索版本发布（碎片串联 / 学科元思考 / 跨学科并联、PDF 读取与 PPT 导出）**：
同一公开站点、同一 projectId，action `0a30eb98-0032-44e6-9faf-58da502245f1`（`spa: true`，
`webDirectory: dist`）。发布时分支 `task/R2-L4-connection-QoderWang2` HEAD `5503acb`；三笔
`5b1b275` / `81e6508` / `5503acb` 均已 push。`published: true`、`readiness: publication_completed`，
publish operation `01a20d01-687f-7aa6-bd0c-9a627b22d919`，deployment
`01a20d01-0c5d-70e5-b44b-ecff880f897b`，release `01a20d01-687f-7a41-bde3-e0f381014e87`。
线上入口 `index-yujg0S_A.js` 与本地构建一致；匿名 curl（文档请求头）`/`、`/connection`、
`/workspace`、`/atlas`、`/guide` 与不存在路径均 200 + 应用外壳，JS / CSS 资源 200 且类型正确。
**未测**：真实 key 下三种模式的生成质量与公网跨域；桌面 / 移动端视觉与横向溢出。

**访问模式由订阅套餐决定（已解决，但留作决策依据）**：团队版账号下 `available_modes` 里没有
`public`，站点只能 `organization`/`selected`（评委打不开）。用户账号套餐是「团队版 · 成员」，
官方文档原文："Individual plans offer 'Anyone can access' (public) or 'Only invited users'.
**Teams/Enterprise only allow organization members.**"
换到个人版账号重新发布（新 action + `createNewSite: true` + 新 slug、不带 `projectId`）后
`public` 立刻可选，`update_access_policy` 置为 `public` 后 `auth_integration_status` 变 `not_required`，
匿名 curl 全部通过。**结论：比赛用的公网链接必须出自个人版账号**，团队版那份只能内部预览。

两份站点并存，别混：

| 账号 | 地址 | 访问 | 用途 |
| --- | --- | --- | --- |
| 个人版 | `vein-probe-personal-dx7phlm8g8e.qoder.zone` | `public`，匿名可开 | 比赛口径的公网入口，ADR 结论以它为准 |
| 团队版 | `vein-t0-probe-4588bqc00js.qoder.zone` | `organization`，需登录 | 内部预览；它的 action/描述符不属于当前账号，换回来要重新登录 |

**顺带测到一件会影响 T1 的事**：托管站会把我们的 `index.html`（418 B）扩成约 57 KB 再吐出来，
注入的是 `<qoder-sites-badge>`（`id="qoder-sites-watermark"`，独立 shadow root，`:host { all: initial }`，
`position: fixed`）。影子 DOM 意味着它**不会污染我们的排版与样式**，但它是页面上的一层固定浮标——
阅读器验收截图里会出现它，视觉底线里的"不出现装饰性元素"不能算到平台头上，写验收说明时要讲清楚。

---

## ADR-0003 · 关系的 `explanation` / `assumptions` / `epistemic` 设为 schema 必填（2026-11-11，已采纳）

**背景**：本项目要解决的核心问题就是"AI 生成的图没有理由"。

**选项**
1. 选填，靠 prompt 约束 → 实测会退化成空字符串或"两者相关"。
2. **schema 强制 + CI 校验** → 生成端必须产出理由，否则数据进不了库。

**选择**：2。

**代价**：生成更慢、更贵；用户手动连边时也必须填一句。
**缓解**：手动连边时给"为什么"输入框一个 placeholder（"例：先找投影，再看残差"），
不阻塞但强提示；批量导入旧数据时给迁移脚本补 `explanation: "未填写（历史数据）"` 并标为 `proposed`。

**何时重审**：若实测手动连边因这个必填流失严重。**但即使改，也不能允许 accepted 状态缺少理由。**

> **2026-11-12 重审发生了一次**：个人视图的手绘连线确实遇到这个问题。
> 处理见 ADR-0006——放开的是 `PersonalEdge`，**不是** `KnowledgeRelation`；
> `accepted` 的状态缺理由仍然禁止，本 ADR 的强制范围不变。

---

## ADR-0004 · 03 与 04 不合并（2026-11-11，已采纳）

**背景**：很容易顺手把"发现联系"和"图谱"做成同一个功能——发现即入库。

**选择**：分开。03 只产出 `proposed`，04 负责接受、编辑、布局、回忆。

**理由**：合并会让图谱被 AI 猜测淹没，用户失去对自己认知结构的控制权——而这正是
本产品要解决的问题。分开还有一个好处：03 可以"用完即弃"，不污染长期结构。

---

## ADR-0005 · 讲义用 Markdown 而非富文本私有格式（2026-11-11，已采纳）

**理由**：可 Git、可 diff、可被 Obsidian/编辑器打开、可迁移、不会被本产品锁定。
callout 是 Obsidian 原生语法，在 GitHub/纯文本中自动降级为引用块；导出时不丢内容。

**代价**：块级编辑的即时预览需要自己做；复杂排版能力有限。
**接受**：学术讲义不需要复杂排版。

---

## ADR-0006 · 个人视图的手绘边不是知识关系（2026-11-12，已采纳）

**背景**：AGENTS 第 3 条要求每条边都有理由。但个人记忆视图里用户手绘的连线——demo 里
`pe.1` 的 meaning 写的是"这是我的空间比喻，不是数学命题"——与 `MemoryCue` 同族，
记录的是"我怎样记住"，不是"知识之间凭什么相连"。给它套 ADR-0003 的三件套只有两种结局：
用户嫌烦不再画线（个人视图退化），或者为了过校验写一句空洞的理由（污染数据）。

**选项**
1. 一并强制：手绘边也算 `KnowledgeRelation`。→ 把记忆当知识，而且 `source-backed`
   这类档位对个人联想根本没有意义。
2. 完全不约束：想画就画，什么都不用填。→ "图谱的边都有理由"被自家样例打破。
3. **分开建模**（选择）：新增 `PersonalEdge`，可见标签 `label` 必填，理由 `meaning` 选填，
   只存在于 `layouts/personal.json`。

**选择**：3。用户裁决原话：手绘的边可以写理由，也可以不写；ADR-0003 的强制规定只管知识关系。

**代价，以及必须守住的两条**
1. **看得出区别**——虚线 +「我的联想」标签，与知识关系一眼可分，不是只换个颜色深浅。
2. **只待在个人视图**——不渲染进逻辑视图与结构视图，报告不得引为论据。

放开的是"必须写理由"，换来的是活动范围缩进一个视图：**没理由的边根本不在客观视图里**，
所以"客观视图里的边都有理由"仍然成立。反方风险也要认——评委看到"有的边不用填理由"
可能以为原则打了折扣，因此上面两条是验收必查项（`QUALITY_GATES.md` §4），
而且不靠自觉：`verify:content` 的 A11 会在手绘边出现在 structure/logic 时直接报错。

**落点**：`schemas/layout.schema.json` 的 `personalEdge`（`label` required、`meaning` 可选）
加一条 if/then——`viewType` 为 structure/logic 时 `personalEdges` 不得存在。
**不进 `schemas/graph.schema.json`**，因为它不是知识关系。

**可选升级（不急）**：设置页加「画边时要求写理由」开关，默认关。那是用户对自己的约束，
不改变本 ADR。

**何时重审**：若个人视图里带 `meaning` 的边占比过低，说明光有标签不够用；
或出现报告把 `PersonalEdge` 当证据引用的实现——那是这条决定的红线，出现即修。

---

## ADR-0007 · 资源抽屉在左、AI 侧栏在右；视频不在抽屉内嵌（2026-11-13，已采纳）

**背景**：样张的旁栏资源卡点开后是一个抽屉——先在抽屉里看引文与定位（PDF 还能直接预览到对应页），
再从抽屉里的按钮去详情页（视频从时间戳开始播放、PDF 跳页、网页高亮原句）。这套两层交互当时只写在
样张的 `app.js` 里，规格只有一句"右侧抽屉显示引文 + 位置 + 理由"，验收只有"并排截图"——
截图里抽屉是关着的，交互即使被做丢也能通过验收。同时 §5 的 AI 侧栏也在右侧，两者会争同一块位置。

**选项**
1. 两者都在右侧，后开的覆盖先开的：实现最省，但边看资源边问 AI 的场景做不了。
2. 资源抽屉替换 AI 侧栏的内容：两种功能混进一个容器，状态难管。
3. **分居两侧**：资源抽屉在左，AI 侧栏在右。

**选择**：3。用户裁决：撞车就放在左右两边。左侧的理由是资源卡本身位于主栏左侧的旁栏——从哪里点，就在哪里展开。

**视频是否在抽屉里内嵌播放**：不内嵌。用户裁决：负荷太大。抽屉里给逐句时间戳引文，
"从 mm:ss 开始播放"深链到原站。PDF 的内嵌预览保留（浏览器原生能力，代价小）。

**代价**：资源抽屉打开时会盖住左导航；窄屏放不下两侧，退回"后开的覆盖先开的"。
样张 `rendered/` 的抽屉已同步改到左侧，避免样张与规格互相矛盾。

**落点**：`UX_AND_FLOWS.md` §3"资源抽屉"、§7 响应式；`QUALITY_GATES.md` §2.5；`IMPLEMENTATION_PLAN.md` T1-2。

**何时重审**：若左导航在阅读时被频繁使用、抽屉盖住它成了阻碍；或评委网络下视频站可稳定加载、且用户希望"不离开页面看视频"。
