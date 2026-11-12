# 技术架构与本地优先边界

**状态**：提议架构。**必须先在 `DECISIONS.md` 写完 ADR-0002 再开工**，
不得跳过选型直接写代码——选型漂移会让领域模型全部作废。

---

## 1. 分层

```text
┌──────────────────────────────────────────────────────────┐
│ UI：阅读器 / 编辑器 / 实验室 / 关联 / 图谱 / AI 侧栏        │
├──────────────────────────────────────────────────────────┤
│ domain：实体类型 · 校验 · 迁移 · id 规则（唯一真源）        │
├──────────────────────────────────────────────────────────┤
│ content：Markdown 解析（标题锚点 / callout 块 / details /    │
│          [[wiki link]]）· 确定性检索 · 导出导入            │
├──────────────────────────────────────────────────────────┤
│ store：IndexedDB（Dexie 类）· 版本 · 撤销栈 · 自动保存      │
├──────────────────────────────────────────────────────────┤
│ ai：provider adapter（BYOK）· 重试/超时/取消 · 无 Key 降级 │
├──────────────────────────────────────────────────────────┤
│ tools：可视化工具注册表（浏览器原生优先）                   │
└──────────────────────────────────────────────────────────┘
        ↑ 可选：用户授权的目录句柄 / 本地 companion
```

**关键原则：确定性层不依赖 AI 层。** 反过来不行。

---

## 2. 技术选型建议（可改，但须写 ADR）

| 关注点 | 建议 | 理由 | 备选 |
| --- | --- | --- | --- |
| 构建 | Vite | Qoder Sites 静态托管友好，零配置 | — |
| UI | React + TS | 生态成熟、图谱库支持好 | Vue |
| Markdown 渲染 | `unified`/`remark` + `remark-math` + KaTeX | 可控 AST，能解析 Obsidian callout 与 wiki link | markdown-it |
| 编辑 | CodeMirror 6（分栏预览） | 轻、可控、移动端尚可 | Tiptap（WYSIWYG 更友好但导出保真难） |
| 图谱 | React Flow（编辑优先）或 Cytoscape（大图性能） | **本项目要"能编辑"，不是"能展示"** → 优先 React Flow | d3-force（完全自控） |
| 存储 | IndexedDB + Dexie | 大文本、离线、事务 | localforage |
| 数学 | KaTeX | 快 | MathJax |
| 测试 | Vitest + Playwright | 单元 + 浏览器 E2E | — |

⚠️ **图谱库选择的判据不是"渲染多好看"，是"拖拽/连线/撤销是否好实现"。**

---

## 3. 浏览器能做什么、不能做什么（别幻想）

| 能力 | 现实 |
| --- | --- |
| 读用户本地文件 | 需用户主动选（`<input type=file>` 或 File System Access API） |
| 写用户本地目录 | **仅** Chromium 系 + 用户授权目录句柄；Safari/Firefox 不行 |
| 长期保存 | IndexedDB（可能被清理，需提示用户导出） |
| 执行 Python/MATLAB/PyTorch | **不能**。需本地运行时或远程服务 |
| 调用 LLM | 能，但**key 会暴露在前端**。必须明示风险，或用代理 |

因此：

- **比赛版**：IndexedDB 为工作副本；文件导入；导出 ZIP/目录（`.md` + `.json` + assets）。
- **赛后 P1**：可选本地 companion（Node，仅监听 127.0.0.1，鉴权 + 防路径穿越），
  负责真实目录读写与 Git 操作。
- **永远不做的**：网页自动读 `C:\`、自动 push Git。

---

## 4. 数据与同步

- 实体带 `id` / `schemaVersion` / `origin` / `updatedAt`。
- 用户文档是源；索引、图谱、布局是衍生物，**不得反向覆盖原文**。
- 自动保存按编辑节流，UI 显示「待保存 / 已保存 / 失败」。
- AI 改动一律先 `ProposedChange`，可预览 diff、可撤销。
- 导入做**校验 + 预览 + 冲突检测**，失败可回滚，未知字段保留。

---

## 5. 检索

- **P0**：标题 / 正文 / 别名 / 锚点的确定性匹配 + 高亮跳转。必须先保证"结果真的指向存在的段落"。
- **P1**：可选 embedding 索引 + 重排；外部检索需来源与许可。
- **无结果返回"未找到"**，不猜页码。

---

## 6. AI 与工具

### Provider adapter

```ts
interface AiProvider {
  id: string;
  models: string[];
  chat(req: ChatRequest, signal: AbortSignal): AsyncIterable<Chunk>;
  capabilities: { json: boolean; streaming: boolean };
}
```

必须处理：超时、取消、限流、错误分类、流式、JSON 模式降级（模型不支持 JSON 时用分隔符解析）。

### 密钥处理

- 默认**只存在内存**，刷新即失。
- 用户显式勾选"记住"才写 `sessionStorage`（**不写** `localStorage`、不进日志、不进 URL）。
- UI 必须说明：前端直连提供商会让 key 出现在浏览器 devtools 里。

### 工具注册表

```ts
interface VisualTool {
  id: string;
  inputs: InputSpec;          // 声明需要什么，前端才能选
  runtime: 'browser' | 'prerendered' | 'remote';
  license?: string;
  costHint?: 'instant' | 'seconds' | 'minutes';
  run(params: unknown): Promise<RunResult>;
}
```

`run` 返回 `status: 'real' | 'pre-rendered' | 'example' | 'failed'`，
**UI 必须显示这个状态**。这是防止"假动画伪装实时计算"的机制。

---

## 7. 安全

- 不在 `VITE_` 变量里放秘密（会打进 bundle）。
- Markdown 渲染需消毒（XSS）；外链 `rel="noopener"`；禁 `javascript:`。
- 上传文件校验类型与大小，防文件轰炸。
- **检索到的内容不得当作指令执行**（提示注入隔离）：把检索片段当数据，不当 system 指令。
- 模型生成的代码**不在共享主机执行**；本地执行须显式授权 + 沙箱。

---

## 8. 目录

```text
apps/web/src/
  app/          路由、布局外壳、错误边界
  features/
    workspace/  资源、讲义阅读/编辑、检索
    lab/        实验模块、工具注册
    connection/ 三模式 UI、候选确认
    atlas/      三视图、布局编辑、AI 侧栏
  domain/       实体类型、校验（zod）、迁移、id
  content/      Markdown 解析、锚点、callout、wiki link
  store/        Dexie schema、撤销栈
  ai/           provider adapter、prompt 调用、降级
  ui/           设计系统
```

---

## 9. 未验证项（必须先验证再依赖）

- [ ] Qoder Sites 是否支持 SPA 路由回退（deep link 404？）
- [ ] 构建产物大小限制
- [ ] 是否允许 iframe 嵌入（GeoGebra/Desmos）
- [ ] 自定义域名 / HTTPS
- [ ] 是否有任何持久化后端能力（大概率没有 → 走 IndexedDB）

**验证结果写进 `DECISIONS.md` 的 ADR-0002。**
