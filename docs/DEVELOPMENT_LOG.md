# 开发日志 / 过程证据

> **只记录实际发生的事。** 未运行的写"未验证"，不写"通过"。
> 这份日志同时是比赛帖子第 5 段（Qoder 开发过程）的素材来源。

---

## 2026-11-12（晚 2）· QoderWang1 · T0-0 探针部署到 Qoder Sites

**目标**：按 `HANDOFF.md` §4.2「部署须知」把探针发布出去，用公网地址实测四项能力，结果回填 ADR-0002。
**明确不做**：不改选型结论（四项没测到就不填）、不开 Function/数据库、不动访问策略（`public` 不在可选档里，
放开匿名访问需要用户单独授权）、不 push `main`。

**开发输入**：用户授权部署 + QoderJudge1 的「部署须知」五条与提交拆分建议。

**实际改动**

- `docs/DECISIONS.md` ADR-0002：能力表由"待验证"改为实测结果 + 实测条件（commit、地址、`spa: true`）；
  表外记下这次真正的收获 —— 访问模式只有 `private`/`selected`/`organization`，**没有 `public`**
- `docs/HANDOFF.md`：我的卡行改状态与接手第一步；待人拍板新增 **③ 探针能否匿名可访问**（三条路 a/b/c）；
  部署须知写明 #1 #2 #4 已照做、**#3 未做到**及原因；看板 T0-0 / T0-2 状态更新；
  §6 新增三条坑（登录墙在路由之前、`.qoder.site` 是 host-local、`descriptorStatus: pending` 的正确处理）
- `.gitignore`：新增 `*.qoder.site`

**人工判断**

- 探针页发布时 `spa: true` 是我主动开的（这个开关本身就是待测能力），并在 ADR 里写明"主动开启"，
  不让它看起来像默认行为。
- 没有把本地 preview 的四项通过结果搬进 ADR。须知 #4 要求"测不出的格子写未验证（原因）"，
  四项就照这么写，只把"整包 523 KB 上传通过"记成**部分**结论。

**验证**

```text
# 从已提交 commit 构建（须知 #1）
$ git rev-parse --short HEAD
942412e
$ npm run build → 271.33 kB │ gzip 88.05 kB，✓ built in 163ms
$ dist 清单：index.html / assets/*.css / assets/*.js / probe/large.txt / probe/build-info.json（5 个文件）

# 发布链路（工具返回，逐条核对）
prepare_site → artifactReady true、dependenciesReady true、blockers []、canPublish true
publish_site → operation succeeded、committed true、published true
readiness    → publication_completed
地址         → https://vein-t0-probe-4588bqc00js.qoder.zone（access_mode: private）
descriptor   → descriptorStatus: written（重试同一 action + 同入参后写出）

# 公网实测（须知 #3）—— 五项全部被登录墙挡住
$ for p in / /atlas /no-such-route-abc123 /probe/large.txt /probe/build-info.json; do curl …; done
/                        HTTP 401 | application/json | 69 bytes
/atlas                   HTTP 401 | application/json | 69 bytes
/no-such-route-abc123    HTTP 401 | application/json | 69 bytes
/probe/large.txt         HTTP 401 | application/json | 69 bytes
/probe/build-info.json   HTTP 401 | application/json | 69 bytes
body: {"code":"sites_gateway_login_required","message":"login is r…

# 浏览器同一地址：标题「登录后即可访问」，跳转 qoder.cn/users/sign-in（未代用户登录）
# get_site_access → available_modes: private / selected(≤50, 同组织) / organization   ← 无 public
```

**证据缺口**：`docs/evidence/t0-0-sites-*.png` **没有**。探针四项在公网地址上一次都没跑起来，
截图只会是登录页，那不是能力证据。按须知 #5 的状态处理：卡里写"阻塞"，不绕路换托管平台。

**剩余问题**

- [ ] ③ 未拍板：`public` 档能否开。比赛要求"公网可用、匿名可访问"，这条不解决就不是"部署完成"。
- [ ] ADR-0002 四项能力仍"未验证（原因）"。若用户先在浏览器登录一次，我可以在登录态下重跑并回填（那是 a 路）。
- [ ] CI 仍未经远端验证（本轮只 push 分支，`ci.yml` 的 job 只在 push main / PR 时跑）。

---


## 2026-11-12（晚）· QoderWang1 · T0-0 探针 + 8 条裁决落地

**范围**：把用户对 8 条矛盾的裁决写进契约、schema 与数据；补上没人守的布局 schema；搭 T0-0 部署探针。
**明确不做**：阅读器 / 检索 / 图谱 / 实验（T1–T5）、接 LLM、推远端、部署公网（探针部署待用户确认）。

**开发输入**：用户裁决。其中 #1 与 #8 合并成一个死结——ADR-0002 要实测结果，实测要能部署的东西，
所以"先写完 ADR 再开工"这句被废止，顺序改为 **T0-0 探针 → ADR-0002 → T0-1 外壳**。
#5 是产品决策：手绘边不受 ADR-0003 强制，但必须与知识关系视觉可分、且只待在个人视图。

**实际改动**

- **文档规则改写**（类 A 的根因）：文档只写"为什么"和"以谁为准"，
  字段清单与统计数字一律指向 `schemas/` 与 `content/demo/` —— 见 AGENTS §5、DOMAIN_MODEL 表头、
  QUALITY_GATES §8、UX_AND_FLOWS §8（首页四个数字改为运行时计算，并写清统计口径）
- 新增 `schemas/layout.schema.json`、`schemas/evidence.schema.json`
- 修 schema↔数据漂移：`kb.schema.json` 的 `id` → `kbId`（另两个 schema 本来就用 `kbId`）、声明 `integrity`；
  `graph.schema.json` 的 `if/then` 补 `type`（否则 ajv 严格模式直接拒绝编译）
- `layouts/learning.json` → `evidence/learning.json`（`PRODUCT_SPEC` 早就是这么规定的，是数据放错了）；
  `structure.json` 注释 `course.outline` → `kb.json 的 outline`
- `verify-content.mjs` 新增 A10–A12：`layouts/` 只许三视图、`positions`/`layers`/`groups`/`hyperEdges`/`personalEdges`
  引用的节点必须存在、超边必须与 `relationGroups` 同 id、手绘边不得进入客观视图、
  逻辑视图六档 `epistemic` 线型齐全且弱断言必须带文字标签、学习证据 `score` 三件套分开记
- 裁决入文档：ADR-0002 前置条件改写 + 新增 **ADR-0006**；AGENTS 第 3 条限定适用范围、
  §4 "五类 `epistemic`" 改六类（与 GLOSSARY 一致）；GLOSSARY 增 `PersonalEdge` 与 `kbId`；
  PRODUCT_SPEC §6.1 增两实体对照表；TASK_T0 / IMPLEMENTATION_PLAN / QUALITY_GATES 同步
- **新代码**：`apps/web` T0-0 探针（Vite 8 + React 19 + TS 7 + Vitest 5 + ajv 8）。
  HashRouter；四项自检各带"结论 / 证据 / 这个结论会怎么骗人"；Desmos 实嵌区供肉眼确认；
  结论可一键复制成 ADR-0002 表格。`domain/math.ts` + `math.test.ts`（A8）+ `schemas.test.ts`（A13）

**人工判断**

- `manifest.json` 有 `kind: "video"` 而 schema 枚举只有 `video-course`：判数据为准，补 `video`
  并写明"单条视频 vs 整套课程"不许合并（定位方式不同：时间戳 vs 章节）。
- 探针第一版有两处不诚实：dev 模式下把 HTML 回退当 JSON 解析而抛异常；把 vite dev 服务器的
  history 回退写成"BrowserRouter 可用"。改为按 content-type 判定并如实标注来源 ——
  本地结论不能冒充托管站结论。

**验证**

```text
$ node scripts/verify-content.mjs
✓ 内容校验通过（节点 / 关系 / 引用完整性 / 讲义链接 / 资源来源 / 覆盖矩阵 / 布局与证据）

$ npx vitest run
 ✓ src/domain/math.test.ts (7 tests)
 ✓ src/domain/schemas.test.ts (11 tests)
 Test Files  2 passed (2)
      Tests  18 passed (18)

$ npx tsc --noEmit        # 无输出，通过

$ npx vite build
apps/web/dist/assets/index-DdnsdOkZ.js   271.33 kB │ gzip: 88.05 kB
✓ built in 109ms
```

反向测试（在 `$HOME` 下的临时副本破坏 6 类，仓库内不留产物）：9 条错误全部命中，退出码 1；
真实仓库退出码 0。破坏项含：学习证据放回 `layouts/`、手绘边进结构视图且标签为空、
`analogy` 线型缺标签、超边 id 对不上 `relationGroups`、证据指向不存在节点、`score.apply` 缺失。

浏览器实测（`npm run build` + `vite preview`，来源 `http://localhost:4173`）：

| 探针 | 结果 | 关键证据 |
| --- | --- | --- |
| SPA 深链 | 通过（限本机来源） | `GET /no-such-route-… → 200 text/html`，含 `#root` |
| 大静态资源 | 通过 | 产物合计 523 KB；取回 256 KB 用时 5 ms |
| 外部 iframe | 通过 | Desmos `load` 事件 521 ms；`?lang=zh-CN` 返回 200；坐标系确实画出（见截图） |
| IndexedDB | 通过 | 写 200,000 字符 → 重载后首次时间不变、累计次数递增 |

截图：`docs/evidence/t0-0-probe-build.png`（四格结论）、`docs/evidence/t0-0-desmos-embed.png`（Desmos 真渲染）、
`docs/evidence/t0-0-probe-desktop.png`（首版，已过时，保留作迭代痕迹）。
dev 模式另测一次：`#/atlas` 深链可达，静态资源项如实返回"无法判定"。

**剩余问题**

- [ ] **探针还没上 Qoder Sites**：ADR-0002 的能力表仍是"待验证"。本地 preview 只证明代码能跑，
      不证明托管站的回退、大小上限与 CSP。部署需要用户确认。
- [ ] 窄屏 375px 未截图：本轮只有探针页，三栏外壳与断点在 T0-1。
- [ ] D-2 仍未拍板：用户在逻辑视图手写推导时 `epistemic` 的默认值（PRODUCT_SPEC §6.1 末尾）。
- [ ] 探针页没有设计系统，T0-1 外壳会重做它；`domain/` 的 zod 类型（T0-3）未开始。
- [ ] `.github/workflows/ci.yml` 已从"只跑内容校验"改写为 `npm ci → verify:content → typecheck → test → build`，
      但**未验证**：CI 只在 push 到远端后才跑，本轮没有 push。

---

## 2026-11-11 · 仓库重构

**背景**：初版仓库有 23 个 Markdown 文件、零行代码。
问题：契约不可执行、无数据实例、四板块被重复描述、prompt 不可调用。
本次重构目标是**让开发能无歧义地开工**，不是写更多文档。

**做了什么**

- [x] 重写 `README.md`：改为"按数据流组织"，去掉功能卡片堆砌
- [x] 重写 `AGENTS.md`：加入七条不可协商 + 每轮开工协议
- [x] **新增 `docs/GLOSSARY.md`**：统一命名（此前同一个概念有 3–4 个叫法）
- [x] 重写 `docs/PRODUCT_SPEC.md`：确立"最小单位是被回答的问题"这一第一原理
- [x] 重写 `docs/DOMAIN_MODEL.md`：名词表 → 带不变量的契约表
- [x] 重写 `prompts/NOTE_GENERATION.md`：散文 → I/O JSON + 二元 rubric（R1–R10）+ 反模式对照
- [x] 重写 `prompts/CONNECTION_EXPLORER.md`：加入对应表强制、C1/C2 分离、候选硬规则
- [x] 重写 `prompts/GRAPH_ASSISTANT.md`：加入"整理任务必须给双方案"与冲突报告
- [x] **新增 `prompts/SMART_SEARCH.md`**：此前"问题式学习"只有一句描述，不可实现
- [x] 重写 `docs/ARCHITECTURE.md`、`docs/UX_AND_FLOWS.md`、`docs/QUALITY_GATES.md`、`docs/IMPLEMENTATION_PLAN.md`
- [x] **新增 `schemas/*.json`**：把"每条边必须有理由"从文档话变成 CI 可执行约束
- [x] **新增 `scripts/verify-content.mjs`**：校验引用完整性、讲义链接、提纲化风险
- [x] **重写 `content/demo/linear-algebra/`**：3 节讲义 + 9 节点 + 9 条关系 + 3 份布局
- [x] **新增 `LICENSE`**（MIT）
- [x] `.gitignore` 增补 workspace/inbox/zip 等

**验证证据**

```text
$ node scripts/verify-content.mjs
✓ 内容校验通过（节点 / 关系 / 引用完整性 / 讲义链接）
```

校验器在首次运行时抓到两个真实错误并已修复：
1. `course.json` 引用了不存在的节点 `n.optimization-first-order`（实为 `n.first-order-cond`）
2. 讲义 `[[法方程]]`、`[[列空间]]` 无法解析到节点（节点缺少中文别名）

**未验证 / 已知缺口**

- [ ] **没有任何应用代码**。`apps/web` 尚不存在，`npm install / npm run dev` 目前不可用。
      README 中"30 秒跑起来"的描述是**目标状态**，不是现状 —— T0-1 完成前它不成立。
- [ ] `schemas/*.json` 尚未接入 CI（目前只有手写的 `verify-content.mjs` 在跑，
      尚未用 ajv 做 JSON Schema 校验）
- [ ] `content/demo` 只有线性代数一个知识库；缺中文人文社科样例（用于验证讲义风格的跨学科适配）
- [ ] 未在 Qoder Sites 上验证任何能力（ADR-0002 待填）

**下一步**

基于用户需求，我们需要先完成 T0 地基，见 `docs/TASK_T0.md`。

---

## 2026-11-12 · 澄清三点边界

用户澄清了三处会被实现误读的地方：

1. **网页是"渲染器"，不是生成器。** 讲义生成走 BYOK / 本地，网页负责渲染、检索、编辑、
   图谱、导出。这排除了"必须内置生成才能用"的误解。
2. **知识库粒度由用户决定**：可以是一个学科、一门课、或一个专题。
   → `course.json` / `course.schema.json` 重命名为 `kb.json` / `kb.schema.json`，
   新增 `level`（discipline/course/topic）、`parentKbId`、`childKbIds`。
   旧的 `course.*` 已移到仓库外（`../_qoder_archive/`），不再被任何代码或文档引用。
3. **整个平台就是一个网页。** 不拆桌面端；四板块是同一页面的四个工作区。

**验证**

```text
$ node scripts/verify-content.mjs
✓ 内容校验通过（节点 / 关系 / 引用完整性 / 讲义链接）
```

**未做**：比赛 demo 的知识库仍是 `course` 级。学科级只保留在 schema 层与 UI 说明里，
不额外开发——这是刻意的取舍。

---

## 2026-11-12 · 逐条审计用户的原始需求（发现 6 处真缺口）

用户提出"详细的功能这些都落实了吗"，要求不给屎盆镶金边。逐条核对结果如下，
**只看文件实际内容，不凭记忆**：

| 用户原话 | 审计结果 | 处理 |
| --- | --- | --- |
| "你去帮我整合"资源 | ❌ **只有"需用户勾选"一句，无产出契约** | 新增 `prompts/RESOURCE_DISCOVERY.md` |
| "导航+关联资源库（需要一个汇总）" | ❌ 完全缺失，全文搜"资源库"零命中 | 新增 `PRODUCT_SPEC` §3.6 + `UX_AND_FLOWS` 二级导航 + `schemas/manifest.schema.json` |
| "练习可以展开和折叠" | ⚠️ 3 个折叠块全是"拓展"，**没有一个真练习** | `notes/02` 新增 3 道分级练习（算/条件/理解），答案折叠 |
| "生成一份报告文件" | ⚠️ 只有一句"可生成报告"，无格式无契约 | 新增 `prompts/REPORT_WRITER.md` + `Report` 实体 |
| "三种视角…我希望都是可以编辑的" | ⚠️ 只详述了个人视图，逻辑视图的编辑没定义 | `PRODUCT_SPEC` §6.1 补三视图编辑对照表 + 逻辑视图四种编辑动作 |
| "可追问" | ⚠️ 只在流程里出现过一次，无实体 | 新增 `Thread` 实体 |
| "显示进度与先修" | ⚠️ 只有一句，无数据模型 | 新增 `ChapterProgress`；明确 `read ≠ 掌握` |

**审计中发现并修正的错误**：练习 1 里原先写了一段"先算错、再验算发现错误"的过程，
但真实数值是对的，那段"错误"是虚构的。这种**演出来的纠错**正是本项目要杜绝的。
已改为正确推导 + 真实自检（`Aᵀr = 0`），并用 numpy 验证：
`s = [4/3, 7/3]`，`Aᵀr = [-2.2e-16, -4.4e-16]`（机器精度 0）。

**验证**

```text
$ node scripts/verify-content.mjs
✓ 内容校验通过（节点 / 关系 / 引用完整性 / 讲义链接 / 资源来源 / 覆盖矩阵）
```

校验器新增了资源清单检查：origin 三态、discovered 必须有 uri、span 必须指向真实资源、
coverage 必须覆盖每一章、无来源的章必须带 warning。

---

## 2026-11-12（晚）· 讲义重写：从"说明文"改成真正的笔记

**用户反馈**：demo 讲义"不懂什么叫笔记"，看了样本却学不到东西。

**上一版错在哪（如实记录）**：
上一版读了 notebrick 样本，提炼了六条特征，结果写成了一篇**关于笔记的评论**——
有散文的外形，没有散文的信息密度；也没有手写笔记的结构骨架。**两头不靠。**

真正的问题是：把 notebrick 当成了唯一范本。而用户实际记的笔记（线代 50 页、数分 45 页）
是另一种形态：编号推进、红框锁结论、页边批注方法、句句可背。

**改了什么**

1. **重写全部四章**，改为"第一章 线性方程组 → 最近点 → 法方程 → 三种最近"的完整链条：
   - `01-线性方程组.md`（新）：相容性判据、自由变量、解集 = p + N(A)、线性相关四等价
   - `02-最近点.md`：残差正交的反证、左乘 Aᵀ 为何不是推导
   - `03-法方程.md`：三处必检条件、三层错法的练习（算/条件/理解）
   - `04-三种最近.md`：六行对照表、"是否需要参数化"作为唯一性根源、就地展开的 MIT 链接
2. **确立两种声音**（写进 `NOTE_GENERATION.md` §6）：
   - 干货（编号、判据、可背、无修辞）≈ 50–60%
   - 人话（有主语、解释为什么、可以比喻但交代边界）≈ 40–50%
   - 明确禁止第三种"说明文腔"
3. **资源链接就地化**（新增 §7.5）：链接紧贴起作用的那句话，说明它补了什么，
   值得展开就展开 2–4 句；文末不堆参考列表。
4. **章节重编号**：旧 `01-列空间` / `02-法方程` / `03-三种最近` 变成弃用占位文件
   （内容已拆入新四章），并从 `kb.json` 移除引用。
5. 图谱新增 6 个节点（相容性判据、自由变量、零空间、仿射集、线性相关、正交投影）
   + 4 条关系，全部带 `explanation` / `assumptions` / `epistemic`。

**结构指标**（自动测）

```text
01-线性方程组  段落24 列表3 块9 折叠1 字数3607
02-最近点      段落20 列表4 块6 折叠1 字数2812
03-法方程      段落27 列表5 块6 折叠4 字数3829
04-三种最近    段落23 列表7 块4 折叠0 字数3182
```

段落数远多于列表项数 —— 说明是叙述而非提纲。

**校验器在这一轮抓到 3 处问题**（这就是它存在的价值）：
- `::: tip` 不在白名单 → 已改为 `::: note`
- 新增关系的 `assumptions` 为空 → 补上条件
- `coverage` 缺 `ch.04` → 补上

**未做**
- 语文导图与 ADS 课件尚未提炼（前者是"边没理由"的反面教材，后者与线代链条无关）
- 手写笔记的**内容**一律未使用，只提炼了结构写法

---

## 2026-11-12（上午）· 信息架构回顾：把样张放回全貌里

**触发**：用户认可 `preview/textbook-demo`，并提醒"这只是第一个功能的部分 demo"。

**发现的三个缺口**（都是"最新进展没回写到真源"）
1. 样张在任何文档里都不存在 —— 开发时无从得知它是验收标准。
2. **规格与样张冲突**：`UX_AND_FLOWS` §3 写"宽屏不用两栏正文"，而样张正是主栏+旁栏。
   照规格做会做出用户否决过的一维流。已改，并规定冲突时以样张为准。
3. 样张的版式规则（栏目系统、旁栏对齐、资源卡 `why`）不在生成契约里 ——
   手写的 HTML 和生成器之间没有桥。

**改了什么**
- 新增 `preview/README.md`：样张是什么、在 IA 里的位置、证明了什么 / 没证明什么、第三方许可
- 新增 `docs/REQUIREMENTS_TRACE.md`：用户全部需求 → 规格 → P0/P1/P2 → 任务 → 现状；开放决策 D-1（比赛版要不要一次真实生成）
- 新增 `docs/REFERENCES.md`：7 个参照站点实际抓取后的事实 + 借/不借
- `NOTE_GENERATION.md` 新增 §3.5 教材版式（栏目表、`^锚` / `@锚` / `[!res] s.id` 语法、资源卡硬要求）
- `SourceSpan` 新增 `text-fragment` 定位类型、`end`、`why`（schema + 校验器 + DOMAIN_MODEL，均为可选字段）
- `IMPLEMENTATION_PLAN` 新增 T1-0，T1 验收改为"与样张并排截图"；README / T0 任务说明指向样张与对照表

**验证**

```text
$ node scripts/verify-content.mjs
✓ 内容校验通过（节点 / 关系 / 引用完整性 / 讲义链接 / 资源来源 / 覆盖矩阵）
```

**未做**
- demo 讲义 md 尚未改写成 §3.5 语法（列为 T1-0）
- 参照站点 Thinki 只拿到 meta 描述（JS 应用）

---

## 2026-11-12（中午）· 教材范本写进 prompt；愿景原文落库；可编辑/批注入规格

**用户确认**
- `preview/` 的 demo 是学习人教版《生物学 必修2》的版式、语言、内容产出做出来的，要写进 prompt。
- demo 后期要可编辑、可批注、可高亮。
- 愿景长文需要固定在仓库里，作为需求的唯一原文 → 落库。
- D-1（动态生成）推迟到平台搭起来后。

**做了什么**
- 精读教材第 1 章（第 1、2 节 + 本章小结 + 复习与提高），全书栏目用目录核对 → 新增 `docs/TEXTBOOK_STYLE_ANALYSIS.md`（15 种栏目、9 条语言规律、内容产出规律、不照搬的部分，均带 PDF 页码）
- `NOTE_GENERATION.md` v2.1：§3.5 栏目表扩成完整 14 栏 + 章级小结；新增 §6.5 教材腔 L1–L9；R14–R17；
  §6 人称规则改为"'你'只出现在任务里"——**原规则允许正文说'你'，与样张（主栏'你'出现 0 次）和教材都冲突**
- `PRODUCT_SPEC.md` §3.7 编辑 / 高亮 / 批注；`DOMAIN_MODEL.md` 新实体 `Annotation`（sidecar 存储、TextQuote 锚定、失锚不丢）
- 新增 `docs/VISION.md`：愿景原文 + 用户补充 + 按日期追加区；README / AGENTS / T0 任务说明均指向它
- `REQUIREMENTS_TRACE.md` 新增 1.13–1.15；D-1 记为"用户决定推迟"

**验证**

```text
$ node scripts/verify-content.mjs
✓ 内容校验通过（节点 / 关系 / 引用完整性 / 讲义链接 / 资源来源 / 覆盖矩阵）
```

**未做**
- 教材 PDF 不进仓库（版权）；分析文档只引短句
- 未用 §6.5 回头逐条审 `content/demo` 的四章 md。粗筛（关键词计数，未区分是否在练习里）："你" 共 3 处，自评词（其实/关键/核心/很隐蔽/难点）共 8 处，`02-最近点.md` 最多（4 处）。逐条修正留作 T1-0 的一部分

---

## 2026-11-12（下午）· 仓库口吻统一

**用户要求**：仓库内容以项目团队口吻书写；不出现 AI 助手身份，不出现对开发工具下指令的对话语言。

**改了什么**
- `prompts/QODER_KICKOFF.md`（对话式指令）→ 改写为中性任务说明 `docs/TASK_T0.md`，原文件删除；README、package.json 引用同步
- `AGENTS.md` 改为"开发规范"口吻（文件名保留：通用约定，开发工具会自动读取）
- ARCHITECTURE / DECISIONS / DOMAIN_MODEL / ci.yml / preview README / REQUIREMENTS_TRACE / NOTE_GENERATION 中"由 X 实现/填写"类表述改为中性
- 本日志与 VISION 中的第一人称、AI 助手名称改为中性
- **保留**：比赛与工具的事实性表述（Qoder 大赛、Qoder Sites、评分项"Qoder 使用深度"、帖子"Qoder 开发过程"段）

---

## 2026-11-12（傍晚）· 旧讲义退役；样张嵌入知识库

**用户决定**：旧四章讲义（早于教材式规则）删除，避免误导；`content/` 与 `preview/` 二选一合并或嵌套。

**结构决定：嵌套。** 知识库是唯一单位；样张是讲义的**期望渲染结果**（golden file），放进所属知识库的 `rendered/`。
不合并的原因：HTML / 字体等渲染产物不属于"md + json、可被 Obsidian 打开"的知识库格式。

**改了什么**
- 删除 `notes/01–04*.md`、`preview/lecture.html`、`scripts/build-preview.mjs`、`scripts/to-callouts.mjs`（后两者只服务旧讲义）及 `package.json` 中对应命令
- 样张转写为唯一讲义 `notes/2.1-列空间中的最近点.md`（§3.5 语法），三张图拆为 `notes/figures/*.svg`；
  **补写了练习答案与思维训练参考思路**（样张没有），数值经 numpy 验算
- `preview/textbook-demo` → `content/demo/linear-algebra/rendered/`；MIT PDF → `resources/files/`
- `kb.json` 大纲改为 `ch.01`(planned) / `sec.2-1`(written) / `sec.2-2`(planned)
- `manifest.json`：新增 3 个 discovered 资源与 5 个片段级 span（时间戳 / 页码 / 文本锚 + 引文 + why），2 个原创讲义 span
- `graph.json`：7 个节点锚到新讲义；8 个节点（第 1 章与"三种最近"）保留、锚点置空；5 条关系的证据改指真实 span
- 校验器：教材栏目入白名单；planned 章节可无讲义；新增锚点 / 资源卡 / 图片 / 图谱落地检查；schema 同步
- 全仓库路径引用同步（13 个文件）；`content/README.md` 明确开放许可材料的例外

**验证**

```text
$ node scripts/verify-content.mjs
✓ 内容校验通过（节点 / 关系 / 引用完整性 / 讲义链接 / 资源来源 / 覆盖矩阵）
```

反向测试（临时副本中故意破坏 4 处）：4 处全部报错，退出码 1——新检查确实生效：

```text
· 旁栏块对齐到不存在的锚点 @p-nonexist
· s.l15-normal: 作为旁栏资源卡使用，但缺 why
· 资源卡引用不存在的 span s.bogus-span
· 引用的图片不存在 figures/missing.svg
```

**未做**
- 讲义 md 与样张已出现内容差（md 多了答案）；样张未同步，因为答案默认折叠、不影响版式验收
- `scripts/obsidian-snippets/cognitive-atlas.css` 仍只覆盖旧块类型，教材栏目在 Obsidian 中显示为默认 callout 样式

---

## 2026-11-12（晚）· 产品更名：知脉 · Vein

- **目标**：产品总名由 Cognitive Atlas 改为「知脉 · Vein」。
- **原因**：Cognitive Atlas 与神经科学领域已有的同名本体项目撞名，且与 04 板块英文名重复，介绍时自相嵌套。
- **实际改动**：README、PRODUCT_SPEC、CONTEST_SUBMISSION 帖子标题、REFERENCES 对比表、UX_AND_FLOWS 线框图、
  讲义样张页眉（index.html / src.html）、manifest 作者字段、.env.example、package.json `name`、Obsidian css 注释。
- **明确不改**：VISION.md 原文（只在第三部分追加说明）；本日志历史条目；GitHub 仓库地址；
  schema `$id` 与 `cognitive-atlas.css` 文件名（技术标识符，改动会断引用）。04 板块英文名仍为 Cognitive Atlas。

## 条目模板（之后照此追加）

```markdown
### YYYY-MM-DD · TASK-ID / 版本

- **目标**：本轮做什么；**明确不做**什么
- **开发输入**：本轮需求要点 / 开发会话记录路径（帖子"Qoder 开发过程"的素材）
- **实际改动**：文件与要点
- **人工判断**：对开发结果做了哪些修改、为什么
- **验证**：命令 / 用例 / 预期 / 实际 / 截图路径
- **剩余问题**：已知缺陷与下一步
```
