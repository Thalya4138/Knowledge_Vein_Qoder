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
| 审查者 | `QoderJudge<N>` | 复验交付声明（亲自重跑命令、抽查文件）；对矛盾给出**裁决建议**；维护本文件 | 不认领 T 任务、不写业务代码、**不替用户拍板** |

**裁决只有用户能做。** 审查者的建议经用户确认后才生效，生效后写进对应 ADR 或契约文档，
并在 `DEVELOPMENT_LOG.md` 记下用户原话。

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
6. **交付**：更新卡（状态=待合并 + 接手第一步 + 待人拍板）→ 追加 `DEVELOPMENT_LOG.md`
   条目（附真实命令输出，UI 改动附截图路径）→ push 自己的分支。
   审查者会照"接手第一步"重跑一遍；跑不出卡上写的结果，状态退回"进行中"。
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

## 4. 当前交接卡

| agentId | 任务 | 分支 / commit | 状态 | 接手第一步 | 待人拍板 |
| --- | --- | --- | --- | --- | --- |
| QoderWang1 | T0-0 探针 + 8 条裁决落地（含「改了真源」：`schemas/layout.schema.json`、`schemas/evidence.schema.json` 新增，`kb/graph/manifest.schema.json` 修正，ADR-0002 前置条件改写 + 新增 ADR-0006）；**第二轮：探针部署 + 匿名公网实测**（改了真源：`DECISIONS.md` ADR-0002 能力表与访问模式结论、`.gitignore` 新增 `*.qoder.site`） | 分支 `task/T0-0-QoderWang1`，HEAD 见 `git log --oneline -1`（其下 `0481f7e` 是登录态实测三连） | **待合并：四项已在**匿名可达**的公网地址实测通过（个人版账号，`access_mode: public`）；剩截图** | `npm ci && npm run verify:content && npm run typecheck && npm run test && npm run build`；探针页 `https://vein-probe-personal-dx7phlm8g8e.qoder.zone/atlas`（**不用登录**；从 `/atlas` 进入时第一格应显示「应用从 /atlas 直接启动」） | ② D-2（见下表）。注意：团队版那份 `vein-t0-probe-4588bqc00js` 需登录，别再当公网入口 |
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

**部署须知（① 的执行要求）**

> **执行结果（QoderWang1，2026-11-12 两轮）**：#1 #2 #4 已照做；#3 **第二轮已完成**——
> 用户登录后探针重新发布（`spa: true`），四项都在公网地址上跑通，其中深链一项推翻了第一版
> 的测法（fetch 不回退、导航才回退，见 §6）。**唯一没交的是截图**：`docs/evidence/t0-0-sites-*.png`
> 缺，in-app Browser 面板处于隐藏状态，`take_screenshot` 报
> `NATIVE_BROWSER_VIEWPORT_UNAVAILABLE`；结构证据（探针文本 + 网络面板 desmos 200）已在 ADR-0002 里。
> 面板打开后补拍即可，不需要再发一版。
> 仍未解决的是**匿名可访问**：`access_mode` 现在是 `organization`，`available_modes` 里还是没有 `public`（③）。

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
| T0-2 ADR-0002 | 能力表已回填；**选型本身仍未填**（框架 / Markdown / 编辑器 / 图谱 / 存储 + 被排除方案） | 深链结论已可用：BrowserRouter 不被托管站阻挡 |
| T0-1 外壳 | 未认领，阻塞 | T0-2 |
| T0-3 zod 领域类型 | 未认领 | T0-1（`TASK_T0.md` §3 的顺序） |
| T0-4 内容校验接入 | 大部分已由 QoderWang1 完成（`verify:content` 覆盖布局与证据、Vitest、ajv schema 测试）；**剩 CI 未经远端验证** | 合并后首次 push 触发 CI |
| T1–T7 | 未认领 | T0 全部合并 |

范围与验收看 `IMPLEMENTATION_PLAN.md` §2 与 `TASK_T0.md`，别在这里抄。

---

## 5. 交接卡填写规则

只写**下一个 agent 需要、但在别处读不到**的东西：

- 阻塞与前置（"没部署就测不出回退，别急着换 BrowserRouter"）；
- 坑（§6）；
- 一句"跑哪条命令能确认我没吹牛"。

不写统计数字（运行时从数据算），不写字段清单（看 `schemas/`），不复述日志内容（给链接或日期）。

---

## 6. 已知坑（踩过一次就别踩第二次）

- **本目录同时是 Obsidian vault + git 仓库。** 构建产物、日志、大批临时输出不落在这里；
  临时副本放 `$HOME` 下再删。历史上有个探针在这里写出 15 GB 文件，把 Obsidian 打瘫。
  **Obsidian 不读 `.gitignore`**：`node_modules/`（含上百个 `.md`）与 `apps/web/dist/` 会被它索引，
  搜索和关系图里会混进依赖包的 README。用 Obsidian 时在"设置 → 文件与链接 → 排除的文件"里加上这两个目录。
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
- **`.qoder.site` 描述符是 host-local 的**，里面带冻结的 `index.html` 与内部 ID，已加进 `.gitignore`。
  换机器或换 agent 必须 `prepare_site` 新 action，不要复用别人机器上的 actionId。
- **`prepare_site` 返回 `descriptorStatus: pending` 不是失败**：等 readiness 完成后用
  **同一个 actionId + 完全相同的入参**重试一次，描述符会从冻结 ZIP 写出来，不会重新打包上传。
- **换行符**：本机 `core.autocrlf=true`，仓库 `.gitattributes` 规定文本为 LF。
  `git diff` 里的 "CRLF will be replaced by LF" 警告是这两者在对齐，无害；不要为了消警告去改 `.gitattributes`。
- **本机网络**：远端是 HTTPS 地址，本机 HTTPS 直连 GitHub 不稳定，SSH 可用但每次往返约 3–4 秒。
  `git fetch` 卡住时先怀疑网络，不要反复重试或改 git 配置。
