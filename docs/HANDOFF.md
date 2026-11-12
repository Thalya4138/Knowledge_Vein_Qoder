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
| QoderWang1 | T0-0 探针 + 8 条裁决落地（含「改了真源」：`schemas/layout.schema.json`、`schemas/evidence.schema.json` 新增，`kb/graph/manifest.schema.json` 修正，ADR-0002 前置条件改写 + 新增 ADR-0006） | 起始 `883ea7a`；**全部改动仍是本地 `main` 上的未提交修改** | **阻塞：等用户按下方「提交拆分」提交到 `task/T0-0-QoderWang1` 并合并** | `npm ci && npm run verify:content && npm run typecheck && npm run test && npm run build`；再 `npm run build && npx vite preview` 打开探针页 | ② D-2（见下表）；① 部署已授权 |
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

**部署须知（① 的执行要求）**

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
| T0-0 部署探针 | 代码完成；**部署已授权**，待提交后执行（见部署须知） | 提交 |
| T0-2 ADR-0002 | 阻塞 | T0-0 部署实测 |
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
- **换行符**：本机 `core.autocrlf=true`，仓库 `.gitattributes` 规定文本为 LF。
  `git diff` 里的 "CRLF will be replaced by LF" 警告是这两者在对齐，无害；不要为了消警告去改 `.gitattributes`。
- **本机网络**：远端是 HTTPS 地址，本机 HTTPS 直连 GitHub 不稳定，SSH 可用但每次往返约 3–4 秒。
  `git fetch` 卡住时先怀疑网络，不要反复重试或改 git 配置。
