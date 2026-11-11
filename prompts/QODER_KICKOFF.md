# 交给 Qoder 的第一轮执行指令

请将下面内容粘贴给 Qoder；本文件不是项目实现本身。

---

你现在接手位于 C:\Users\Wang\Desktop\QODER 的 Cognitive Atlas 项目，GitHub 仓库 Thalya4138/Cognitive-Atlas_Qoder。先完整阅读 README.md、AGENTS.md、docs/PRODUCT_SPEC.md、docs/ARCHITECTURE.md、docs/DOMAIN_MODEL.md、docs/UX_AND_FLOWS.md、docs/IMPLEMENTATION_PLAN.md、docs/QUALITY_GATES.md 和 prompts/NOTE_GENERATION.md。

这是一个 2026 Qoder 高校创造力大赛 StudyHack 项目，2026-11-30 18:00（北京时间）前需通过 Qoder Sites 公开部署，且论坛展示真实 Qoder 开发过程。当前仅有规划文档，**没有已实现的网页**；不要宣称已经实现功能，也不要把全部长期愿景塞进首版。

任务第一阶段：
1. 用 1 页内的技术选型决策（ADR）说明框架、Markdown 编辑器、图谱/存储/数学可视化库，兼顾 Qoder Sites、无 Key 演示和本地优先；
2. 设计并创建应用脚手架、四个一级导航、可折叠 AI 侧栏、基础可访问性与视觉系统（高对比、自然学术美感，拒绝小字淡导航和无意义装饰）；
3. 建立经过 schema 校验的本地知识实体、IndexedDB 持久化、可导入/导出的基础；
4. 创建**真实可读**、原创且适合公开演示的“线性代数：最小二乘与正交投影”笔记，不要读取或公开用户上传的第三方课程笔记 PDF；
5. 将完整的纵向流程拆成小任务，按 P0 优先级迭代，明确每个任务的验收条款和实际测试。

先向我反馈：技术选型、目录结构、拟执行的前 3 个最小任务、预计验证方式，再开始写代码。每轮提供真实改动、测试与截图，不要把“已生成代码”等同于“已验证交付”。请在 docs/DEVELOPMENT_LOG.md 留存 Qoder 过程记录，用于比赛帖子，附真实测试与部署证据。

关键体验必须走通：资源/可读讲义 → 搜索定位 → 关联说明（附条件/边界）→ 用户确认图谱联系 → 三视图可编辑且持久化 → 导出/重新导入。可视化实验至少做一个数学正确、参数可操作的线代例子。

未明确授权前不要：上传私人课程资料、把 API key 入库、自动推送远端/公网部署、默默覆盖用户文件。部署时遵守 Qoder Sites 条件并记录真实步骤。

最终不是做四页介绍 PPT，而是评委点开能完成 5 步演示的产品。
