# 交接文档 · 多 agent 协作协议 + 当前交接卡

**读者**：所有参与本仓库的 Qoder agent，包括不在本机跑的 agent。
**本文件只管一件事**：活儿怎么交出去、怎么接进来。

做过什么记 [DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md)，产品定义记 [PRODUCT_SPEC.md](PRODUCT_SPEC.md)，
字段记 `schemas/`，任务分期记 [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)。
**这些在本文件里一律不重述**——抄一遍就会过期一次（`AGENTS.md` §5 同源规则）。

非本地 agent 读不到本机会话，也读不到聊天记录。**交接卡是唯一的对话面。**
推论：**没提交的东西对非本地 agent 不存在。** 卡上写"待合并"的活，必须已经在某个远端分支上。

---

## 1. 身份与角色

每个 agent 用一个稳定 id 署名，由用户分配，不许自己改。

| 角色 | id 形如 | 做什么 | 不做什么 |
| --- | --- | --- | --- |
| 实现者 | `QoderWang<N>` | 认领 T 任务、写代码与文档、跑四道门、交付 | 不自行裁决契约冲突 |
| 审查者 | `QoderJudge<N>` | 复验交付声明（亲自重跑命令、抽查文件）；对矛盾给出**裁决建议**；维护本文件 | 不认领 T 任务、不写业务代码（收尾阶段例外见下）、**不替用户拍板** |

**裁决只有用户能做。** 审查者的建议经用户确认后才生效，生效后写进对应 ADR 或契约文档，
并在 `DEVELOPMENT_LOG.md` 记下用户原话。

**QoderJudge1 的收尾职责（用户 2026-11-15 指派）**

启动条件：**公网网址可用、大部分功能完成，并由用户宣布进入收尾**。在此之前不动下面两项，
以免和实现者改同一批文件。

1. **作品帖协作**：按 `CONTEST_SUBMISSION.md` §2 的结构起草、修改帖子与截图清单，
   素材取自 `DEVELOPMENT_LOG.md` 与 `docs/evidence/`。帖子由用户定稿，也由用户发布。
2. **视觉与页面打磨**：排版、字体、配色、间距、首屏、交互细节、移动端适配等审美层面的优化。
   这是「不写业务代码」的**唯一例外**，边界如下：
   - 只改展示层（样式、布局组件、界面文案），不改数据流、`domain/`、`schemas/`、`content/` 的知识内容；
   - 和实现者一样走流程：开分支 `task/polish-QoderJudge1`、跑四道门、在 §4.5 追加交付条目，合并由用户做；
   - 打磨时发现功能缺陷，记进交接卡交回实现者，不顺手修。

署名出现在三处：

1. 本文件 §4 的交接卡；
2. `DEVELOPMENT_LOG.md` 条目标题，格式 `## YYYY-MM-DD · <agentId> · <任务号>`；
3. commit trailer：

```text
Agent: QoderWang1
Runtime: 本地 Qoder Desktop        # 或 非本地 / CI
```

没有署名的提交，下一个 agent 无法判断是谁的在制品，也就没法接手。

---

## 2. 认领与交付（七步，不许跳）

1. **看清现状**：`git fetch origin` → `git log --oneline origin/main -5` → 读本文件 §4。
   确认目标任务没人占、前置任务已"已合并"，且你起始的 commit 就是别人交付时写的那个。
2. **先跑基线**：在起始 commit 上跑一遍四道门（见第 5 步）。基线就红，说明不是你弄坏的——
   写进卡里再动工，否则交付时说不清是谁的锅。
3. **先认领再写码**：单独一次提交，只改本文件 §4 的表格，加一行
   （agentId / 任务号 / 分支 / 起始 commit / 状态=进行中）。
4. **一人一分支**：`task/<任务号>-<agentId>`，例 `task/T0-1-QoderWang2`。
5. **四道门真跑过**：

   ```bash
   npm run verify:content && npm run typecheck && npm run test && npm run build
   ```

   哪道门没过就写在卡里；不允许"本地跑不过但应该没问题"。
6. **交付**：在 §4.5 **追加一条**接龙（本轮交付 / 交付状态 / 待人拍板增量 / 详情指针），
   并更新 §4.0 当前指针——**不改别人写过的条目**，要更正就在自己条目里写"更正 #N"。
   同时追加 `DEVELOPMENT_LOG.md` 条目（附真实命令输出，UI 改动附截图路径）→ push 自己的分支。
   审查者会照接龙里写的命令重跑一遍；跑不出交付物声明的结果，状态退回"进行中"（同样用追加的方式写明）。
7. **合并由用户做**。任何 agent 都不 push `main`、不 force push、不删别人的分支。

**半路发现契约矛盾**：不停工、不自己改真源。在卡的"待人拍板"里写清
「矛盾在哪（文件:行）/ 选项 / 你的倾向」，先做不受影响的部分。

---

## 3. 三条红线（对所有 agent，包括非本地）

- **不 push main、不部署公网。** 部署只有用户在卡里写明"已授权 <目标>"才可以执行；
  没有那句话就停下来问。
- **私人教材 / 课程 PDF / 第三方版权材料 / API key / 个人笔记不进仓库。**
  `.gitignore` 挡不住没后缀的东西，提交前必须看 `git status --short` 全量输出，
  别用 `git add .` / `git add -A` 兜底，逐个路径 add。
- **契约真源改动单独提交**（`schemas/*.json`、`GLOSSARY.md`、`DOMAIN_MODEL.md`、`DECISIONS.md`），
  并在卡里标「改了真源」。其他人必须先 rebase 再动工，否则领域模型会分叉。

---

## 4. 交接卡

**用法（2026-11-12 晚 5 起）**：交接是**接龙，不是覆盖**。
每轮交付在 §4.5 **追加一条**，只加行、不改别人写过的行；写错了就在下面补一条更正，别删原件。
§4.1–§4.4 描述的是"当前状态"，以 §4.5 最后一条为准；§4.0 末尾那张逐轮改写同一行的旧表，
是晚 5 之前的写法，**存档保留、不再更新**。

### 4.0 当前指针

| 项 | 值 |
| --- | --- |
| 最新接龙条目 | §4.5 #11（QoderWang1，2026-11-14 晚，T1-1 交付） |
| 分支 | `task/T0-2-QoderWang1`，HEAD 取 `git log --oneline origin/task/T0-2-QoderWang1 -1` |
| 合并状态 | PR #1（`08af8e8`）+ PR #2（`bff7892`）+ PR #3（`f983a90`）已进 `main`，`main` 上的 CI 首跑已验证（#7）。**#8 的 ADR-0007 已随 PR #3 进入 `main`**，新分支从 `origin/main` 开即可，不必再为它 rebase；某条分支差多少用 `git log --oneline origin/main..<branch>` 现取，别在文档里写条数 |
| 下一位的入口 | **T0-1 外壳**（T0-2 已解锁它）：Vite + React + TS、BrowserRouter、四路由、三栏 + 状态条、错误边界、统计数字运行时算。**外壳从第一天就按路由拆代码**——T1-1 解析器单独 gzip 195 kB，不分路由 T1-2 接进来必超预算（#11）。做 T1-2 的话先读 ADR-0007 与 `QUALITY_GATES.md` §2.5 |
| 还欠谁的 | ② D-2、⑤ 团队版站点处置（④⑦ 已结案，见 #7 / #10）。#8 欠的 `DEVELOPMENT_LOG.md` 条目已由 #9 补记 |

（旧版表格存档如下，保留原样以便追溯。）

| agentId | 任务 | 分支 / commit | 状态 | 接手第一步 | 待人拍板 |
| --- | --- | --- | --- | --- | --- |
| QoderWang1 | T0-0 探针 + 8 条裁决落地（含「改了真源」：`schemas/layout.schema.json`、`schemas/evidence.schema.json` 新增，`kb/graph/manifest.schema.json` 修正，ADR-0002 前置条件改写 + 新增 ADR-0006）；**第二轮：探针部署 + 匿名公网实测**（改了真源：`DECISIONS.md` ADR-0002 能力表与访问模式结论、`.gitignore` 新增 `*.qoder.site`） | 分支 `task/T0-0-QoderWang1`，HEAD 取 `git log --oneline origin/task/T0-0-QoderWang1 -1`（本轮起点 `c54fad5`；`e2d4575`/`69bad2a` 匿名实测回填、`0481f7e` 登录态三连、`5092fd9` 测法修正） | **待合并；本会话到此结束，已交接给下一位**（上手清单见 §4.4） | 按 §4.4 第 2 步跑四道门，再打开 `https://vein-probe-personal-dx7phlm8g8e.qoder.zone/atlas` 做校准 | ② D-2；④ 合并与 CI 首跑；⑤ 团队版站点处置；⑥ 公网链接的账号归属；⑦ 截图与 Obsidian 排除。注意：团队版那份 `vein-t0-probe-4588bqc00js` 需登录，别再当公网入口 |
| QoderJudge1 | 审查 QoderWang1 的 T0-0 交付 | 无分支（只改本文件与 `AGENTS.md` §2 第 6 条，随上面的提交带走） | 已完成 | — | 见下表 |

状态只有四种：**进行中 / 待合并 / 已合并 / 阻塞**。选"阻塞"必须写清等谁。
多人同时改本表时冲突了：**两行都保留**，不要互相覆盖。

### 4.1 QoderJudge1 审查结论（2026-11-12）

**复验**：在本机工作区重跑四道门，全部通过——`verify:content` 退出码 0（含"布局与证据"）、
`typecheck` 退出码 0、`test` 2 个文件 18 条用例全过、`build` 产出 JS 271.33 kB（gzip 88.05 kB）。
与 `DEVELOPMENT_LOG.md` 该条目所贴输出一致。8 条裁决逐条核对，均已落进对应文件。

**交付声明里的诚实标注属实**：ADR-0002 能力表仍是"待验证"；本地 preview 结论未冒充托管站结论；
CI 改写未经远端验证。

**本轮补的漏洞**

1. 上一版卡写"待合并"，但活在未提交的本地 `main` 上——非本地 agent 拉不到。已改为"阻塞"。
2. `AGENTS.md` §2 第 6 条写"不 push 远端"，与本文件"push 自己的分支"矛盾；
   按本文件的意图改为"不 push `main`"。
3. 增加角色划分（§1）、基线步骤与中途发现矛盾的处理（§2）、已知坑若干（§6）。
4. 根目录 `参照教材学习.pdf`（约 51 MB）不是待决事项：`TEXTBOOK_STYLE_ANALYSIS.md` 已写明
   该教材"用户本地，不进仓库"。**已由用户移出仓库视野（2026-11-12），`git status` 中不再出现。**

**提交拆分建议**（按 §3 第三条，真源单独提交）：

1. 契约真源：`schemas/*.json`、`docs/GLOSSARY.md`、`docs/DOMAIN_MODEL.md`、`docs/DECISIONS.md`
2. 数据与校验：`content/`（含 `layouts/learning.json` → `evidence/learning.json` 的移动）、`scripts/verify-content.mjs`
3. 探针与工程：`apps/web/src`、`apps/web/index.html`、`package.json`、`package-lock.json`、`tsconfig.json`、
   `vite.config.ts`、`.github/workflows/ci.yml`、`docs/evidence/`
4. 其余文档：`AGENTS.md`、`README.md`、`docs/` 下其余改动、本文件

`apps/web/dist/` 与 `node_modules/` 已被 `.gitignore` 挡住，但提交前仍要看一眼 `git status --short`。

### 4.2 待人拍板

| # | 事项 | 为什么卡住 | QoderJudge1 建议 |
| --- | --- | --- | --- |
| ① | ~~是否授权把 T0-0 探针部署到 Qoder Sites~~ | — | **已授权 部署 T0-0 探针到 Qoder Sites**（用户 2026-11-12 确认）。授权范围只限探针页，不含后续任何版本；执行要求见下方「部署须知」 |
| ② | **D-2**：用户在逻辑视图手写的推导，`epistemic` 默认值（`PRODUCT_SPEC.md` §6.1 末尾） | T3 图谱编辑要用；T0 不受影响 | 规格里的倾向是默认 `logically-derived`。反对理由：`epistemic` 回答的是"谁为这条边担保"，用户刚写下、没人核对的推导默认标"逻辑推出"，正是本项目要反对的"没理由的断言"换了个方向。倾向默认 `user-personal` 并标待核对，核对通过再升级。不急，T3 之前定即可 |
| ③ | ~~探针站点能不能匿名可访问~~ | — | **已解决（2026-11-12，路径 ①）**：换个人版账号重新发布 → `public` 可选 → `update_access_policy` 置 public（`confirmPublic: true`）→ 匿名 curl 五个路径全对，四项自检全过。公网入口 `https://vein-probe-personal-dx7phlm8g8e.qoder.zone`。**根因留在 ADR-0002**：团队版根本不提供 `public`，所以比赛链接必须出自个人版账号。剩 ② D-2 待拍板 |
| ④ | ~~谁把 `task/T0-0-QoderWang1` 合进 `main`，以及 CI 首跑是否通过~~ | — | **已结案（2026-11-12 晚 8，见 #7）**：仓库所有者已自行合并 PR #1（`08af8e8`）与 PR #2（`bff7892`）；用户截图显示 `main` 上的 `bff7892` 触发 `verify` 第 9 次运行，15 s 全绿，即 CI 首跑通过。**证据来源要说清**：这是用户截图，不是 agent 亲手跑的——仓库私有，未登录的 `api.github.com` 返回 404，本机也没有 `gh`。后续若需要自己确认，办法是 `git fetch` 后看 `main` 顶部 commit，或在 Actions 页按 commit 查。仍待做的只剩：合并之后的文档提交要开第三个 PR 才能同步（条数用 `git log --oneline origin/main..origin/task/T0-0-QoderWang1` 现取） |
| ⑤ | **团队版那份站点怎么处置**：`vein-t0-probe-4588bqc00js.qoder.zone`（`organization`，需登录） | 它现在和公网那份内容重复，留着可能让人误贴错链接；删掉是不可逆的资源删除 | 默认**保留**作内部预览，ADR-0002 的两份站点对照表已经写清各自用途。要删需要所有者明确授权（`delete_project`，工具会先讲清影响），**不要顺手清理**。用户 2026-11-14 表示"不急，公网口径按个人版走" |
| ⑥ | ~~公网链接绑定在哪个个人版账号上~~ | — | **已结案（用户 2026-11-12 确认）**：刚才发布用的个人版账号**就是参赛者本人**，账号归属没问题，公网链接可以直接进帖子。原判断留在这里供追溯：那份 `public` 站点属于"当时登录 Qoder 的账号"，所以**换人接手时必须重新确认一次**——如果下一位用别的账号登录再发布，链接的归属就跟着变了（做法见 §6"换账号发布的规定动作"） |
| ⑦ | **两件只有人类能做的收尾** | agent 打不开面板；Obsidian 设置原以为只能人改 | **已结案（2026-11-14，#10）**。② agent 直接写了 `.obsidian/app.json` 的 `excludedFiles`（`node_modules/**`、`apps/web/dist/**`），当时 Obsidian 未运行，**下次启动生效**；`.obsidian/` 不进 Git。① 公网四项整页截图 `docs/evidence/t0-0-sites-atlas.png`（agent 截）+ Desmos 坐标系 `docs/evidence/t0-0-sites-desmos.png`（**用户截图**：in-app 截图对跨源 iframe 只出空白，新坑已进 §6）。**不再欠** |

**部署须知（① 的执行要求）**

> **执行结果（QoderWang1，2026-11-12 三轮）**：#1 #2 #4 已照做；#3 **第三轮已完成**——
> 换个人版账号重新发布并置 `public` 后，四项在**匿名可达**的公网地址上全部跑通，
> 其中深链一项推翻了第一版的测法（fetch 不回退、导航才回退，见 §6）。
> **唯一没交的是截图**：`docs/evidence/t0-0-sites-*.png` 缺，in-app Browser 面板处于隐藏状态，
> `take_screenshot` 报 `NATIVE_BROWSER_VIEWPORT_UNAVAILABLE`（viewport 0x0）；
> 结构证据（curl 原文 + 探针文本 + 网络面板 desmos 200）已在 ADR-0002 与该日志条目里。
> 面板打开后补拍即可，**不需要再发一版**。

1. **先提交，再部署。** 从已提交的 commit 构建，并在 ADR-0002 记下该 commit 号——
   能力表的结论必须能追溯到"测的是哪一版"。
2. 部署前看一眼 `apps/web/dist/` 的文件清单（`dist/probe/build-info.json` 已列出），确认只有探针产物。
3. 四项都在**部署后的公网地址**上测，深链要用 BrowserRouter 风格的路径（如 `/atlas`）直接访问，
   同时确认 HashRouter（`/#/atlas`）可用。截图存 `docs/evidence/t0-0-sites-*.png`。
4. 测完把四项结果 + 公网地址 + commit 号填进 ADR-0002 能力表；测不出的格子写"未验证（原因）"，不写推测。
5. 部署失败或平台限制超出预期：状态改"阻塞"，把原始报错贴进卡里，不要绕路换托管平台。

### 4.3 任务看板

| 任务 | 状态 | 前置 |
| --- | --- | --- |
| T0-0 部署探针 | **四项在匿名可达的公网地址实测通过**（个人版账号，`public`）；探针修正版已发布 | 补拍 `t0-0-sites-*.png`（需打开 in-app Browser 面板） |
| T0-2 ADR-0002 | **已完成**（2026-11-14，接龙 #9）：五项选型 + 被排除方案 + 包体预算已定稿 | — |
| T0-1 外壳 | 未认领（T0-2 已解锁） | 无 |
| T0-3 zod 领域类型 | 未认领 | T0-1（`TASK_T0.md` §3 的顺序） |
| T0-4 内容校验接入 | 大部分已由 QoderWang1 完成（`verify:content` 覆盖布局与证据、Vitest、ajv schema 测试）；**CI 已在 `main` 上首跑通过**（#7） | — |
| T1-1 解析器 | **已交付待合并**（#11；worktree `QODER-T1-1`，64 tests，四道门实跑） | T0-2 |
| T1-2 阅读器 UI | 未认领 | T0-1 + T1-1 合入 |
| T1-3 / T2–T7 | 未认领 | 各自前置 |
| 合并 + CI 首跑 | **已完成**（PR #1/#2 + `verify` 15 s 绿，见 #7）；只剩把之后的文档提交并入 `main` | 谁能 push `main` 谁开第三个 PR |

范围与验收看 `IMPLEMENTATION_PLAN.md` §2 与 `TASK_T0.md`，别在这里抄。

### 4.4 下一位的上手清单（按顺序做，别跳步）

1. **读**：`TASK_T0.md` §1 的阅读顺序（那份清单是真源，这里不重述），然后回到本文件 §4。
2. **验**：`git fetch && git checkout task/T0-0-QoderWang1`，跑
   `npm ci && npm run verify:content && npm run typecheck && npm run test && npm run build`。
   预期：校验通过、`tsc` 无输出、**18 条测试全过**、JS 产物约 271 KB（gzip 88 KB）。
   跑不出这些数字就先别动工——说明你拉的分支或依赖状态和卡上写的不一致。
3. **看**：浏览器打开公网探针页（地址在 §4.2 ③），从 `/atlas` 进入，第一格应显示
   「应用从 /atlas 直接启动」。**这一步是校准，不是验收**——它证明你手上的站点和文档描述的是同一个。
4. **账号归属已确认，不用再做**：⑥ 已结案——发布用的个人版账号就是参赛者本人（用户 2026-11-12）。
   但**如果你换了账号再发布，这条要重新确认一次**，链接归属跟着账号走。
5. **下一件该做的**：**T0-1 外壳**（T0-2 已定稿，见 ADR-0002）。**从第一天就按路由拆代码**：
   T1-1 解析器单独 gzip 195 kB，占单路由预算（300 kB）的三分之二；外壳不分路由，T1-2 接进来必超。
   合并顺序 **T0-2 → T0-1 → T1-1**（lockfile 冲突只解一次）；T1-2 等 T0-1 与 T1-1 都合入再开工。
6. **不要做**：不 push `main`；不删团队版站点（⑤）；不改 `content/demo` 的数学内容与 `prompts/*.md`
   的 rubric；不在仓库里堆构建产物（§6 第一条）；不拿 `fetch` 判深链（§6）；
   不把团队版链接当公网入口贴进帖子。
7. **时间**：截止 **2026-11-30 18:00（北京时间）**。落后就按 `IMPLEMENTATION_PLAN.md` §3 削功能，
   但"带理由的边"和"可编辑的个人视图"不削——那是这个项目的全部主张。

### 4.5 交接接龙（append-only，只加行）

追加格式：`#N | 日期 | agentId | 本轮交付 | 交付状态 | 待人拍板增量 | 详情在哪`。
**详情一律指向 `DEVELOPMENT_LOG.md` / ADR / §，不在这里复述**（复述就会过期）。

| # | 日期 | agentId | 本轮交付 | 交付状态 | 待人拍板增量 | 详情 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 2026-11-12 晚 | QoderWang1 | 8 条裁决落地；新增 layout/evidence schema；校验器补 A10–A12；T0-0 探针代码 + Vitest/ajv 测试 | 已提交（`1e1bf4c`…`942412e`，按 QoderJudge1 的拆分） | ① 部署授权、② D-2 | `DEVELOPMENT_LOG.md`「T0-0 探针 + 8 条裁决落地」 |
| 2 | 2026-11-12 晚 | QoderJudge1 | 审查 #1；改写本文件（角色划分、基线步骤、部署须知、提交拆分）；修 `AGENTS.md` §2 第 6 条与 `main` 的矛盾 | 已完成 | 提出 ① 的执行要求 | 本文件 §4.1 |
| 3 | 2026-11-12 晚 2–晚 4 | QoderWang1 | 三轮部署与实测：private 被登录墙挡 → **修正深链测法**（fetch 不回退、导航才回退）→ 登录态四项通过 → 根因定位到套餐 → 换个人版账号置 `public` → **匿名 curl + 四项自检全部通过** | 已提交并 push（`5092fd9`…`c54fad5`） | 新增 ④⑤⑥⑦ | `DEVELOPMENT_LOG.md` 晚 2 / 晚 3 / 晚 4；ADR-0002 能力表 |
| 4 | 2026-11-12 晚 5 | QoderWang1 | ⑥ 结案（发布用的个人版账号就是参赛者本人）；本文件改成 append-only 接龙，旧表存档不再改写；④ 里抄的 commit 数换成命令现取 | 已提交 | 余量：②④⑤⑦ | 本文件 §4.0 / §4.2 ⑥ |
| 5 | 2026-11-12 晚 6 | QoderWang1 | **更正 #3/#4 的合并状态**：用户问"都 push 过了吧"，`git fetch` 后查出 PR #1 已合并进 `main`（`08af8e8`），而 §4.0 还写着"`main` 停在 `883ea7a`"。本分支已 merge 回 `origin/main`（用 merge 不用 rebase：分支已 push，不能重写别人可能拉走的历史） | 已提交并 push | ④ 缩为"第二个 PR + CI 首跑确认" | `git log --oneline origin/main -1` |
| 6 | 2026-11-12 晚 7 | QoderWang1 | 用户合了 **PR #2**（`bff7892`）后担心"最新的没了"。查证：**什么都没丢**——`93af27a` 是 `origin/main` 的祖先、`git diff main task/T0-0-QoderWang1` 为空、main 上的 HANDOFF 有接龙 #5。他看到的"上一版"是**本地 `main` 指针落后 22 个提交**（还停在合并前的 `883ea7a`）；已用 `git fetch origin main:main` 快进（只动指针，不碰工作目录，非快进会自动拒绝） | 已提交并 push | ④ 只剩 CI 首跑结果确认；工作分支可删——删除不可逆，归用户执行，且建议先看 CI 再删 | `git branch -vv` |
| 7 | 2026-11-12 晚 8 | QoderWang1 | **④ 结案**：用户截图显示 `main` 上的 `bff7892` 触发 `verify` 第 9 次运行、15 s 全绿 → CI 首跑通过（`npm ci → verify:content → typecheck → test → build`）。诚实标注：证据是用户截图，agent 未独立复核（仓库私有 → 未登录 API 404，本机无 `gh`）。同时纠正 §4.0 的"分支与 main 完全一致"：合并后又产生文档提交，已改为"用命令现取条数 + 第三个 PR 同步" | 已提交并 push | 余量：② D-2、⑤ 团队版站点处置、⑦ 截图与 Obsidian 排除；另需仓库所有者开第三个 PR 同步文档提交 | 本文件 §4.0 / §4.2 ④ / §4.3 |
| 8 | 2026-11-13 晚 | QoderWang1 | **规则变更：ADR-0007 与 `QUALITY_GATES.md` §2.5 生效**——资源抽屉的两层交互从"只写在样张 `app.js` 里"升格为规格 + 可验收清单。动到三处：`UX_AND_FLOWS.md` §3 新增"资源抽屉"小节、§7 响应式补两侧同开；`QUALITY_GATES.md` §2.5 九项手测清单；`IMPLEMENTATION_PLAN.md` T1-2 的验收口径由"并排截图"改为"逐条点过"（理由见 ADR-0007 背景）。三条裁决：**抽屉移到左侧**（原与 §5 的 AI 侧栏争同一块位置）、**视频不内嵌播放器**、`unavailable` 定位不得退化成只到资源主页的链接。**标「改了真源」：`docs/DECISIONS.md` 新增 ADR-0007**，其他人先 rebase 再动工；本轮真源与其余文档落在同一个 commit `a4d76f3`，未按 §3 第三条拆分——别照抄这个合并法。门：`verify:content` 与 `typecheck` 实跑通过；`test` / `build` 未跑（本轮纯文档 + 样张一行 CSS 的滑出方向） | 已提交并 push（`a4d76f3`）；本条与 §4.0 指针随下一个文档提交带走 | 无新增待拍板项，ADR-0007 自带"何时重审"两条。**给 T1-2 接手人**：行为基准是样张 `content/demo/linear-algebra/rendered/app.js`，验收证据要 `?open=<spanId>` 的**打开态**截图——关闭态截图验不了交互。**已知缺陷**：`DEVELOPMENT_LOG.md` 本轮条目还欠着 | ADR-0007 / `QUALITY_GATES.md` §2.5 / `UX_AND_FLOWS.md` §3、§7 |
| 9 | 2026-11-14 | QoderWang1 | **T0-2 定稿**：ADR-0002 五项选型 + 被排除方案 + 包体预算 + "未验证"清单 + 重审条件；`ARCHITECTURE.md` §2 加指针；顺带补记 #8 欠的日志。四道门实跑通过（18 tests；JS 271.42 kB / gzip 88.10 kB）。**未装任何新依赖** | 已提交（`task/T0-2-QoderWang1`，待 PR） | 无新增待拍板；⑤ 用户 2026-11-14 表示不急、公网口径按个人版走 | `DEVELOPMENT_LOG.md`「T0-2：ADR-0002 五项选型定稿」 / ADR-0002 |
| 10 | 2026-11-14 | QoderWang1 | **⑦ 结案**：Obsidian 排除写入 `.obsidian/app.json`（未运行时写，下次启动生效）；公网四项整页截图 `t0-0-sites-atlas.png`（agent 截）；Desmos 实嵌视觉证据 `t0-0-sites-desmos.png`（**用户截图**）。新坑进 §6：in-app 截图对跨源 iframe 只出空白、面板隐藏时截图不可用。ADR-0002 iframe 格补视觉证据 | 已提交（`task/T0-2-QoderWang1`） | ⑦ 不再欠；余 ② D-2、⑤ | `docs/evidence/t0-0-sites-*.png` / 本文件 §6 / ADR-0002 |
| 11 | 2026-11-14 晚 | QoderWang1（T1-1 worktree；本条由主 worktree 代写，接龙链在 `task/T0-2` 上） | **T1-1 交付**：`apps/web/src/content/` 纯函数解析器（`parseNote` / `renderNodes`），四道门在 worktree 实跑通过、64 tests（新增 46）；修两个"拼起来才错"的 bug：单行 `$$…$$` 被 remark-math 当行内（按样张 9 个独立公式对数抓出）、白名单同名规则覆盖导致 wiki link class 被清空。**包体警告：解析器单独 801 kB min / 195 kB gzip，占单路由预算 2/3 → T0-1 外壳必须从第一天按路由拆代码**。分支 `task/T1-1-QoderWang1`（`7f9b406` / `bcfa54c`）已 push。**合并顺序 T0-2 → T0-1 → T1-1**：lockfile 冲突只解一次；`DEVELOPMENT_LOG.md` 顶部也会撞，保留双方条目按日期排 | 已 push，待 PR（本机无 `gh`，PR 由所有者在网页开） | 无新增待拍板 | worktree `C:\Users\Wang\Desktop\QODER-T1-1` / `apps/web/src/content/README.md` / 该分支日志条目 |
| 12 | 2026-11-14 晚 | QoderWang1 | **全仓状态面核对**（用户指出计划表没标已完成）：`IMPLEMENTATION_PLAN.md` §1/§2 加交付标记（T0-0 / T0-2 / T1-0 / T1-1 ✅，T0-4 ◐，T0-1 下一件）；`TASK_T0.md` §2 现状改写（`dev` 不再是占位）；`ARCHITECTURE.md` 顶部改"选型已定稿"+ BrowserRouter 结论；`README.md` 状态块与目录补解析器、测试数与包体数去写死；`REQUIREMENTS_TRACE.md` §0 与 1.7 记"解析器待合并、未进界面不算 ✓"；本文件 §4.4 基线注明分支差异。**`QUALITY_GATES.md` 与 `CONTEST_SUBMISSION.md` 的勾是待验证清单，功能没做不提前勾** | 已提交（`task/T0-2-QoderWang1`） | 无新增待拍板 | 各文件本轮 diff；标记依据 #3 / #7 / #9 / #10 / #11 |

**下一位从这里接第 13 条。** **新行紧贴上一行写，中间不留空行**——空行会把表格截断，Obsidian 与 GitHub 都会把后面的行渲染成乱码。 只加行；要更正前人的条目，就在自己条目里写"更正 #N：……"。

---

## 5. 交接卡填写规则

只写**下一个 agent 需要、但在别处读不到**的东西：

- 阻塞与前置（"没部署就测不出回退，别急着换 BrowserRouter"）；
- 坑（§6）；
- 一句"跑哪条命令能确认我没吹牛"。

不写统计数字（运行时从数据算），不写字段清单（看 `schemas/`），不复述日志内容（给链接或日期）。
**接龙只加不改**：别人的条目是历史，写错了就补"更正 #N"，不要删、不要重写；
需要"当前状态"就看 §4.0 指针，它由最后一条接龙决定。

---

## 6. 已知坑（踩过一次就别踩第二次）

- **本目录同时是 Obsidian vault + git 仓库。** 构建产物、日志、大批临时输出不落在这里；
  临时副本放 `$HOME` 下再删。历史上有个探针在这里写出 15 GB 文件，把 Obsidian 打瘫。
  **Obsidian 不读 `.gitignore`**：`node_modules/`（含上百个 `.md`）与 `apps/web/dist/` 会被它索引，
  搜索和关系图里会混进依赖包的 README。**2026-11-14 已配置**：`.obsidian/app.json` 的 `excludedFiles`
  已含 `node_modules/**` 与 `apps/web/dist/**`（Obsidian 未运行时由 agent 写入，下次启动生效）。
  Obsidian **运行中**时别从外部改这个文件——它退出时会用自己的内存状态覆盖回去。
- **`vite.config.ts` 里 `root: 'apps/web'`。** Vitest 的 `include` 相对 root 写（`src/**/*.test.ts`），
  写成 `apps/web/src/...` 会"找不到测试文件"。
- **工具链是新大版本**：React 19、Vite 8、Vitest 5、TypeScript 7、react-router-dom 7。
  API 以 `node_modules` 里装的版本及其文档为准，**不要凭记忆写旧版本的用法**。
- **ajv 严格模式**：`if/then` 里 `required` 的属性必须在同一层带上 `type: "object"`，
  否则 schema 连编译都过不去；非标准关键字（如 `comment`）也会被拒。
- **手绘边 `PersonalEdge` 不是 `KnowledgeRelation`**：别给它的表单加 `explanation`/`assumptions` 必填
  （ADR-0006）。它只出现在个人视图，报告不得引为论据。
- **dev 模式的探针结论不算结论**：vite dev 服务器自带 history 回退，会把"本地能跑"误报成
  "托管站支持深链"。填 ADR-0002 只用部署后那一跑的结果。
- **深链只能用导航测，不能用 fetch 测。** 托管站的 SPA 回退**只给文档请求**
  （`Sec-Fetch-Dest: document`）：同一个 `/atlas`，浏览器导航返回应用外壳，
  `fetch('/atlas')` 返回 404。第一版探针就是拿 fetch 判的，差点把结论写成"必须用 HashRouter"。
  现在的判据是「应用从哪个 `pathname` 启动的」，卡片上还留了一条 fetch 对照证据，别把它读成深链失败。
- **Qoder Sites 的登录墙在路由之前。** `private` / `organization` 站点下所有路径（包括 `/atlas` 和静态资源）
  一律 `401 sites_gateway_login_required`，返回的是 JSON 而不是应用外壳。
  所以"深链是否 404"这类问题在放开访问前**测不出来**，别把 401 读成"不支持回退"，
  也别拿本地 preview 的 200 顶替。
- **可用访问档由订阅套餐决定，别在站点上找开关**。团队版/企业版**不提供** `public`
  （官方文档：Teams/Enterprise only allow organization members），所以 `update_access_policy`
  传 `public` 一定被拒——工具文档也要求只传 `available_modes` 返回的档位。
  要匿名可访问就换个人版账号发布，别反复试写。
- **换账号发布的规定动作**：`prepare_site` 用**新 `actionId` + `createNewSite: true` + `displayName` +
  新 `slug`，并且**不带 `projectId`**。旧账号那份站点在新账号下读回来是 `sites_forbidden`，
  `get_context` 会把它列进 `unavailableSites`——这是账号隔离，不是站点被删，别去重试它的 action。
- **匿名性要用不带 cookie 的 curl 证明**，不能用浏览器：in-app Browser 恰好带着 Qoder 会话，
  登录态下"能打开"证明不了 `public` 生效。复现命令：
  `curl -s -o /dev/null -w "%{http_code} %{content_type}" -H 'Accept: text/html' <地址>/atlas`
  → 200 才算；用 `Accept: */*` 会拿到 404（回退只给文档请求）。
- **托管站会往 HTML 里注入水印**：我们的 `index.html` 418 B，服务器吐出约 57 KB，多出来的是
  `<qoder-sites-badge>`（`id="qoder-sites-watermark"`，独立 shadow root、`:host{all:initial}`、`position:fixed`）。
  样式不会串进来，但**它是页面上的一层固定浮标**：T1 的视觉验收截图必须把它算进去，
  别把它当成我们违反"不出现装饰性元素"的缺陷，也别试图去删它。
- **in-app 面板的截图抓不到跨源 iframe**：Desmos 嵌入在面板里肉眼可见，但 `take_screenshot`
  （整页或元素）截出来是**空白**；面板隐藏时更直接报 `NATIVE_BROWSER_VIEWPORT_UNAVAILABLE`。
  所以"iframe 真的画出内容"要靠人眼或外部浏览器截图——`docs/evidence/t0-0-sites-desmos.png`
  就是用户截图。别把空白截图读成"嵌入失败"，也别把 `load` 事件读成"画出来了"（探针页自己就写了这条）。
- **`.qoder.site` 描述符是 host-local 的**，里面带冻结的 `index.html` 与内部 ID，已加进 `.gitignore`。
  换机器或换 agent 必须 `prepare_site` 新 action，不要复用别人机器上的 actionId。
- **`prepare_site` 返回 `descriptorStatus: pending` 不是失败**：等 readiness 完成后用
  **同一个 actionId + 完全相同的入参**重试一次，描述符会从冻结 ZIP 写出来，不会重新打包上传。
- **换行符**：本机 `core.autocrlf=true`，仓库 `.gitattributes` 规定文本为 LF。
  `git diff` 里的 "CRLF will be replaced by LF" 警告是这两者在对齐，无害；不要为了消警告去改 `.gitattributes`。
- **本机网络**：远端是 HTTPS 地址，本机 HTTPS 直连 GitHub 不稳定，SSH 可用但每次往返约 3–4 秒。
  `git fetch` 卡住时先怀疑网络，不要反复重试或改 git 配置。
