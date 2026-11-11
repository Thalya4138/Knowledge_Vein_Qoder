# Cognitive Atlas · 认知图谱

> 从课程材料到可读讲义，从交互式理解到知识关联，再到可编辑、可回忆的个人认知网络。

**项目状态：需求与工程交接骨架（尚无应用实现）。** 这是 2026 Qoder 高校创造力大赛 StudyHack 方向的开发仓库，同时面向赛后的长期维护。不要把规划文档误当成已完成功能。

## 产品主张

Cognitive Atlas 不只是 PDF 摘要器、AI 聊天框或自动思维导图。它让学习者：
1. 从本地材料与系统主动发现的可靠资源中，生成**人真正愿意读、能持续维护的讲义/笔记**；
2. 用交互式可视化与多种计算工具理解抽象知识；
3. 从具体题型、整门学科的元结构和跨学科视角中发现**有依据、可检验的联系**；
4. 把知识、逻辑关系、个人联想路径与复习表现整合进**可编辑的认知网络**。

## 四个一级板块

| 板块 | 用户核心动作 | 典型输出 |
| --- | --- | --- |
| 学习工作台 Learning Workspace | 建课程库、导入/发现资源、生成与维护讲义、跨笔记智能检索、追问 | 可读 Markdown 讲义、资源索引、定位结果、可编辑补丁 |
| 可视化实验室 Visual Learning Lab | 选择交互模块、改变参数、比较模型、调用工具 | 可复现的可视化实验、参数/结论 |
| 知识关联探索 Connection Explorer | 甩入几个知识/题型寻找本质联系；探索学科元结构；跨学科迁移 | 可追问的解释、证据卡、可视化、报告、候选图谱边 |
| 认知与记忆图谱 Cognitive & Memory Atlas | 编辑结构/逻辑/个人记忆三种视图，构造路径、主动回忆 | 可编辑知识网络、个人布局、复习记录 |

四板块共用一个带来源、版本和学习状态的底层知识模型。**关系候选必须经过用户判断，不自动把 AI 猜测变成事实。**

## 比赛边界与产品边界

- 比赛：2026 Qoder 高校创造力大赛，建议 StudyHack；2026-11-30 18:00（北京时间）前公开部署至 **Qoder Sites** 并在天池赛题页论坛发帖。须记录实际 Qoder 开发过程。详见 [比赛交付](docs/CONTEST_SUBMISSION.md)。
- 比赛版优先：**导入资源 → 可读讲义 → 全文/语义定位 → 关联候选 → 手动编辑图谱 → 导出/重新导入** 的真实闭环，附至少一个可交互线代实验。无 API key 也应能体验真实样例。
- 长期版：多模态资源爬取、广泛工具平台集成、真实 Git 双向同步、多学科可视化库、长期记忆模型。
- 网站优先；昂贵计算经由用户自带 API（BYOK）或可选本地运行时。**普通网页没有未经授权写任意本地文件夹的能力**。离线导入/导出与可选本地同步桥接分阶段实现。
- 个人笔记、私人教材、API key 和 PDF 样本默认不提交到公开 Git 仓库。

## 交给 Qoder 的入口

1. 阅读 [AGENTS.md](AGENTS.md) 了解工作规范。
2. 阅读 [产品规格](docs/PRODUCT_SPEC.md)、[架构](docs/ARCHITECTURE.md)、[领域模型](docs/DOMAIN_MODEL.md)。
3. 阅读 [界面与流程](docs/UX_AND_FLOWS.md)、[实施路线](docs/IMPLEMENTATION_PLAN.md)、[验收](docs/QUALITY_GATES.md)。
4. 对内容生成使用 [讲义生成规范](prompts/NOTE_GENERATION.md)；对知识联系使用 [关联引擎规范](prompts/CONNECTION_EXPLORER.md)；对图谱编辑使用 [图谱助手规范](prompts/GRAPH_ASSISTANT.md)。
5. 从 [Qoder 开工指令](prompts/QODER_KICKOFF.md) 开始，每个阶段完成后在 [开发日志](docs/DEVELOPMENT_LOG.md) 留证据。

## 约定目录（随实施创建）

- apps/web/：前端应用，阅读器、编辑器、交互图谱与实验室。
- packages/domain/：领域类型、校验、导入/导出与版本规则。
- packages/learning/：检索、讲义、关联提议与回忆逻辑。
- packages/visualizations/：经过验证的可视化实验模块和工具适配。
- content/demo/：**自有或获授权**的公开演示材料。
- docs/：需求、技术决策、验收与比赛证据。
- prompts/：供 AI 和开发代理执行的明确规范。
- workspace/：本机私人工作区，不进入 Git。

## 重要链接

- [天池比赛](https://tianchi.aliyun.com/competition/entrance/532536)
- [比赛论坛](https://tianchi.aliyun.com/competition/entrance/532536/forum)
- [GitHub 仓库](https://github.com/Thalya4138/Cognitive-Atlas_Qoder)

技术方案与范围可能在 Qoder 实作时更新；每次变更记录动机、取舍和验证证据。