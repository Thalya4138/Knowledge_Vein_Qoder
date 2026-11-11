# 技术架构与本地优先边界

状态：提议性架构，Qoder 实施前需验证 Qoder Sites 实际支持的能力。

## 1. 系统分层

~~~text
Browser web app (Reader/Editor | Visual Lab | Connection | Graph)
   ├── UI state + offline storage (IndexedDB)
   ├── Shared domain model + deterministic import/export/search
   ├── AI provider adapter (optional BYOK, explicit consent)
   ├── Visual tool registry (local JS first; sandboxed runtime later)
   └── Local workspace adapter
         ├── user-approved file/directory picker or download/ZIP fallback
         └── optional localhost companion (future)
     Optional serverless API proxy (only if Qoder Sites capability verified)
~~~

前端候选：React + TypeScript + Vite，Markdown AST + KaTeX、编辑器（可选择 CodeMirror/Tiptap）、图谱库（React Flow/Cytoscape）、IndexedDB（Dexie 类）。这里是建议而非锁定，Qoder 应评估包体、许可、移动端、可测试性。

## 2. 网站、私有文件与 Git 的真实边界

- 站点用浏览器访问：不能默认随意读写 C:\Users\...。Chrome/Edge 的 File System Access API 需用户主动选择目录、授权，支持范围因浏览器而异。
- 比赛 P0：浏览器 IndexedDB 作为工作副本；用户选择文件导入；Markdown + metadata JSON + assets 的 ZIP/目录导出；保存/恢复版本，明确写入成功提示。
- 赛后本地同步：可选 Node companion 在用户机器上运行，接受明确授权的工作区路径，通过受限端点读取/写入；文件监控和冲突检测；仅监听本机、鉴权、防路径穿越。或浏览器目录句柄在兼容环境里使用。
- Git：网页显示导出/提交建议，本地 companion 可辅助 Git diff/commit；**没有用户授权不自动 push，不把私人库上传公共 GitHub**。
- 用户学习库与本项目源码仓库是不同概念；可各自有 Git 版本历史。

## 3. 数据与同步

- 每个实体有稳定 id、schemaVersion、createdAt、updatedAt、provenance。
- 用户文档是可编辑源；索引、图谱建议与渲染是衍生物，不应反向覆盖原文。
- Markdown 文本/引用 anchors 与关系元数据分别存，导出必须保持关系和三种视图布局。
- 导入做校验与预览，处理重复/冲突；失败可回滚。维护迁移器；不要默默丢弃未知字段。
- 自动保存按编辑节流；显式状态“待保存/已保存/失败”；每次 AI 改动可审阅 diff、撤销。
- 面向长期 Obsidian/Markdown 兼容，避免私有格式锁定；允许 .md + sidecar JSON。

## 4. 检索与来源

P0：标题、正文、概念标签、别名、引用锚点的确定性检索 + 高亮/跳转；先保证结果确实指向存在段落。P1：可配置 embedding 向量索引、重排、外部搜索，多源去重；无证据返回“未找到”，不伪造页码。

资源项包含作者、标题、URI、访问日期、版权/许可或用户授权、内容哈希、片段锚点；生成内容逐段可指回来源或标为原创解释/推论。外部检索选择有访问许可的资料，避免绕过付费墙或登录。

## 5. AI 与工具

- Provider adapter：model、endpoint（allowlist/明确用户确认）、密钥使用策略、超时、取消、限流、流式输出、错误处理。前端直接请求提供商可能暴露 BYOK key：明确提示，默认只在会话内存，不写日志/URL/Git；支持安全后端代理优先，但其可用性必须验证。
- 无 Key 演示：采用**明确标注为示例**的预制资源、联系建议及回忆流程；编辑/搜索/图谱/导入导出都必须真实执行。
- Visual tool registry：工具能力（输入类型、依赖、耗时、输出与许可）、确定性参数、运行状态、结果引用。浏览器优先 SVG/Canvas；Manim、MATLAB、PyTorch 分别需独立运行时/服务或本机授权环境，不能假称仅靠静态 Sites 页面即可执行。
- LLM 生成代码不得在共享主机直接运行；使用隔离进程/沙箱、资源限制和显式授权。

## 6. 安全性与可靠性

- 不在客户端构建环境变量（VITE_）中放秘密。
- 上传材料和调用模型时说明数据发送给谁；默认不上传个人私有知识库。
- 文件类型、大小、HTML 渲染和 Markdown 链接都需校验，防 XSS、路径穿越、文件轰炸。
- 不把检索内容当成有权改变系统行为的指令（提示注入隔离）。
- 关键体验有本地恢复路径；无需 API/网络即可打开样例。
- 日志留本地且脱敏，错误状态可读，禁止空白屏。
- 图谱中多前提推理可采用 RelationGroup/Hyperedge，不能用二元“相关”伪装必要充分条件。

## 7. 工程结构建议

- apps/web：路由、页面、状态与组件；
- packages/domain：schemas、类型、校验与迁移；
- packages/learning：索引、链接建议、证据与生成契约；
- packages/visualizations：实验插件、视觉工具适配；
- content/demo：合法公开演示，不含用户上传 PDF；
- tests：领域单元测试、导入导出回归、浏览器端到端测试。

在开始实际搭建前，Qoder 应写一个短 ADR，说明最终选择的框架/编辑器/图谱库及理由。