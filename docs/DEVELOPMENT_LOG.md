# 开发日志 / 过程证据

> **只记录实际发生的事。** 未运行的写"未验证"，不写"通过"。
> 这份日志同时是比赛帖子第 5 段（Qoder 开发过程）的素材来源。

---

## 2026-11-11 · 仓库重构（作者手动完成，非 Qoder）

**背景**：初版仓库由 ChatGPT 协助生成，23 个 Markdown 文件、零行代码。
问题：契约不可执行、无数据实例、四板块被重复描述、prompt 不可调用。
本次重构目标是**让 Qoder 无歧义开工**，不是写更多文档。

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
      README 中"30 秒跑起来"的描述是**目标状态**，不是现状 —— Qoder 的 T0-1 任务完成前它不成立。
- [ ] `schemas/*.json` 尚未接入 CI（目前只有手写的 `verify-content.mjs` 在跑，
      尚未用 ajv 做 JSON Schema 校验）
- [ ] `content/demo` 只有线性代数一个知识库；缺中文人文社科样例（用于验证讲义风格的跨学科适配）
- [ ] 未在 Qoder Sites 上验证任何能力（ADR-0002 待填）

**下一步（交给 Qoder）**

见 `prompts/QODER_KICKOFF.md` 的 T0 任务。

---

## 条目模板（之后照此追加）

```markdown
### YYYY-MM-DD · TASK-ID / 版本

- **目标**：本轮做什么；**明确不做**什么
- **Qoder 输入**：给它的指令要点 / 会话证据路径
- **实际改动**：文件与要点
- **人工判断**：我改了它什么、为什么
- **验证**：命令 / 用例 / 预期 / 实际 / 截图路径
- **剩余问题**：已知缺陷与下一步
```
