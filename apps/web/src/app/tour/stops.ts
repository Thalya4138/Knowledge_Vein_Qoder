/**
 * 导览站点表（用户 2026-11-26 定的路线）：封面 → 学习工作台 → 可视化实验室 → 关联探索（三种模式都过）
 * → 认知记忆图谱（思维导图与个人记忆图谱都过）。每一站讲清楚当前页面能做什么。
 *
 * 一站 = 去哪个地址 + 高亮哪个元素 + 说什么。改导览只改这张表；引擎在 Tour.tsx。
 * 说明里写到的每一项功能都必须在站内真实可用（AGENTS.md：规划不等于已完成）。
 */

export interface TourStop {
  id: string;
  /** 站点地址（路径 + 查询）。与当前地址不同时先跳过去 */
  path: string;
  /** 依次尝试，第一个找到的元素被高亮；都找不到就把说明放在屏幕中央 */
  sel: string[];
  /** 到站后、找元素前，先在页面上做的一步（比如点开一个示例）。返回 false = 页面还没准备好，稍后再试 */
  before?: () => boolean;
  zh: { title: string; body: string };
  en: { title: string; body: string };
}

const WS = 'ws=linear-algebra';

export const TOUR: TourStop[] = [
  {
    id: 'cover-welcome',
    path: '/',
    sel: ['.cover-front'],
    zh: {
      title: '欢迎来到知脉',
      body: '知脉把一门课的资料整理成能读的讲义，再把讲义里的知识连成一张每条线都有理由的网。四个板块共用同一个工作区：在一处做的事，另外三处都看得到。下面用内置的线性代数示例走一遍。',
    },
    en: {
      title: 'Welcome to Vein',
      body: 'Vein turns a course’s materials into lecture notes you can read, then links the knowledge in them into a web where every line has a reason. All four spaces share one workspace: what you do in one shows up in the others. Let’s walk through the built-in linear algebra sample.',
    },
  },
  {
    id: 'cover-entries',
    path: '/',
    sel: ['.entries'],
    zh: {
      title: '四个板块',
      body: '学习工作台读讲义、整理资料；可视化实验室把抽象的东西画出来；关联探索找知识之间的联系；认知记忆图谱用导图组织知识并自测。导览按这个顺序走。',
    },
    en: {
      title: 'Four spaces',
      body: 'Study Desk is for reading notes and organizing materials; Visual Lab draws what is abstract; Connection Explorer finds how pieces of knowledge relate; Memory Atlas organizes it as a map and lets you test yourself. The tour goes in this order.',
    },
  },
  {
    id: 'ws-rail',
    path: `/workspace?${WS}&file=note-2-1`,
    sel: ['.ws-rail'],
    zh: {
      title: '工作区：一门课一个',
      body: '左栏是你的工作区。可以新建空白工作区，也可以直接打开电脑上的文件夹——读写都发生在你的文件夹里，能和 Obsidian 共用；或者把文件夹导入浏览器。示例工作区只读，你的改动存在这台电脑的浏览器里。',
    },
    en: {
      title: 'Workspaces: one per course',
      body: 'The left rail lists your workspaces. Create a blank one, or open a folder on your computer directly — reads and writes happen in that folder, so it works alongside Obsidian — or import a folder into the browser. The sample is read-only; your edits stay in this browser.',
    },
  },
  {
    id: 'ws-tree',
    path: `/workspace?${WS}&file=note-2-1`,
    sel: ['.ws-tree'],
    zh: {
      title: '文件栏',
      body: '一个工作区就是一个普通文件夹：讲义是 Markdown，课程资料、知识结构、插图分组列出。图谱里的导图和练习记录也存在这个文件夹的 maps/ 里。',
    },
    en: {
      title: 'Files',
      body: 'A workspace is just a folder: notes are Markdown, with course materials, knowledge structure and figures grouped. The maps and practice records from the Atlas are saved in this folder’s maps/ too.',
    },
  },
  {
    id: 'ws-reader',
    path: `/workspace?${WS}&file=note-2-1`,
    sel: ['.nr-sheet', '.ws-content'],
    zh: {
      title: '讲义：照教科书的样子排',
      body: '正文在主栏，「相关信息」和资源卡在旁栏；资源卡指向原视频的具体时刻、原文档的具体页。右上角可切换阅读 / 源文件，点「编辑」可以一段一段直接改；选中文字能高亮、批注，批注单独存放，不改动原文。',
    },
    en: {
      title: 'Notes laid out like a textbook',
      body: 'The main column holds the text; side notes and resource cards sit in the margin, each pointing to an exact moment in a video or page in a document. Switch between Read and Source at the top right, or press Edit to change one paragraph at a time. Select text to highlight or annotate — annotations are stored separately and never alter the source.',
    },
  },
  {
    id: 'ws-golink',
    path: `/workspace?${WS}&file=note-2-1`,
    sel: ['.nr-golink'],
    zh: {
      title: '从讲义跳到导图',
      body: '讲到某个知识点的小节，标题旁有「在导图里看」。点它会打开认知记忆图谱，并选中同一个知识点。四个板块用的是同一套知识点，所以能这样来回跳。',
    },
    en: {
      title: 'From the notes to the map',
      body: 'Sections that teach a concept carry “See in map” beside the heading. It opens the Memory Atlas with that same concept selected. All four spaces share one set of concepts, which is what makes these jumps possible.',
    },
  },
  {
    id: 'ws-dock',
    path: `/workspace?${WS}&file=note-2-1`,
    sel: ['.dock-bar'],
    zh: {
      title: '问这个工作区',
      body: '在这里提问，回答会给出它在讲义里的出处，点出处就跳到那一段并高亮。示例模式只能回答预置的几个问题；接入你自己的模型后可以问任何内容。',
    },
    en: {
      title: 'Ask this workspace',
      body: 'Ask here and the answer cites where it comes from in the notes — click a citation to jump there. Sample mode answers only a few prepared questions; with your own model you can ask anything.',
    },
  },
  {
    id: 'lab-ask',
    path: `/lab?${WS}`,
    sel: ['.lab-composer'],
    zh: {
      title: '可视化实验室：说出你想看见什么',
      body: '用一句话描述想看懂的东西，比如「为什么最近点就是正交投影」。下面可以指定用什么工具实现（GeoGebra、Manim、Three.js……），默认自动选择。',
    },
    en: {
      title: 'Visual Lab: say what you want to see',
      body: 'Describe in one sentence what you want to understand — say, why the closest point is the orthogonal projection. Below, you can pick the tool to build it with (GeoGebra, Manim, Three.js…), or leave it on Auto.',
    },
  },
  {
    id: 'lab-presets',
    path: `/lab?${WS}`,
    sel: ['.lab-presets'],
    zh: {
      title: '示例问题',
      body: '标「示例」的几题有随站发布、人工核对过的实验页，不需要模型就能打开。',
    },
    en: {
      title: 'Sample questions',
      body: 'The ones marked Sample have lab pages that ship with the site and were checked by hand — they open without any model.',
    },
  },
  {
    id: 'lab-result',
    path: `/lab?${WS}&viz=viz.photosynthesis`,
    sel: ['.lab-frame'],
    zh: {
      title: '实验页可以动手',
      body: '实验页是能拖动、能播放的交互页面，不是静态图片。右栏是逐项阐释，可以折叠，让画布占满宽度。',
    },
    en: {
      title: 'Lab pages are hands-on',
      body: 'A lab page is interactive — you can drag and play it, not just look. The right column explains it step by step and can be collapsed to give the canvas the full width.',
    },
  },
  {
    id: 'lab-attach',
    path: `/lab?${WS}&viz=viz.photosynthesis`,
    sel: ['.lab-foot'],
    zh: {
      title: '挂到导图主题上',
      body: '一张实验可以挂到导图的某个主题上。之后在导图里选中那个主题，点「去可视化」就回到这里；从导图打开时，这里的主题名也能点回去。写入前先预览，可以撤销。',
    },
    en: {
      title: 'Attach it to a map topic',
      body: 'A lab page can be attached to a topic in the mind map. Select that topic later and “Visualize” brings you back here; when opened from the map, the topic name here links back. You preview before anything is written, and it can be undone.',
    },
  },
  {
    id: 'cx-modes',
    path: `/connection?${WS}&mode=fragments`,
    sel: ['.cx-head .segmented'],
    zh: {
      title: '关联探索：三种问法',
      body: '碎片串联、学科元思考、跨学科并联是三种不同的任务，各有各的写法，不套同一个模板。下面逐个看。',
    },
    en: {
      title: 'Connection Explorer: three kinds of question',
      body: 'Linking fragments, subject meta-thinking and crossing disciplines are three different tasks, each written its own way — not one template. Let’s look at each.',
    },
  },
  {
    id: 'cx-fragments',
    path: `/connection?${WS}&mode=fragments`,
    sel: ['.cx-tries'],
    zh: {
      title: '碎片串联',
      body: '把零散的知识、题目、方法放进来（文字、网页、PDF、截图都行），它自下而上找出这些东西的共同结构，并说明每一处怎样自己动手验证。下一步会打开这个示例的完整回答。',
    },
    en: {
      title: 'Linking fragments',
      body: 'Drop in scattered concepts, problems and methods (text, web pages, PDFs, screenshots). It works bottom-up to find the structure they share, and shows how you can check each piece yourself. Next, we open this sample’s full answer.',
    },
  },
  {
    id: 'cx-graph',
    path: `/connection?${WS}&mode=fragments`,
    before: () => {
      const b = document.querySelector<HTMLButtonElement>('.cx-try');
      b?.click();
      return !!b;
    },
    sel: ['.cx-graph'],
    zh: {
      title: '关联图：每条线都有理由',
      body: '回答里的关系画成这张图。点一条线能看到它的理由和成立条件，再由你决定：收进图谱、先放着、改一改，或者不认同。只有收进的才写进这个工作区的知识图谱，之后也能撤回；整张图还可以加入思维导图，一步就能撤回。',
    },
    en: {
      title: 'The relation graph: every line has a reason',
      body: 'The relations in the answer are drawn here. Click a line to see its reason and the conditions under which it holds, then decide: add it to the graph, leave it for later, edit it, or disagree. Only what you add is written to this workspace’s knowledge graph, and it can be withdrawn later. The whole graph can also be added to the mind map, undone in one step.',
    },
  },
  {
    id: 'cx-meta',
    path: `/connection?${WS}&mode=meta`,
    sel: ['.cx-tries'],
    zh: {
      title: '学科元思考',
      body: '说一门课或一个专题，它从整体结构重新组织这门课：有哪几类对象、反复出现哪几种动作、它们怎样交织成网，并把依赖、等价、推广、动机这几种联系分开讲。',
    },
    en: {
      title: 'Subject meta-thinking',
      body: 'Name a course or a topic and it reorganizes the subject by its overall structure: which kinds of objects there are, which moves keep recurring, how they weave into a web — keeping dependence, equivalence, generalization and motivation apart.',
    },
  },
  {
    id: 'cx-cross',
    path: `/connection?${WS}&mode=cross`,
    sel: ['.cx-tries'],
    zh: {
      title: '跨学科并联',
      body: '说两个领域，它在两边之间建立双向映射，并标出每一条联系的性质：是同一个对象、可以推导、借用工具、类比，还是有待验证的猜想。',
    },
    en: {
      title: 'Across disciplines',
      body: 'Name two fields and it maps each onto the other, labelling every link for what it is: the same object, derivable, a borrowed tool, an analogy, or a conjecture still to be tested.',
    },
  },
  {
    id: 'cx-composer',
    path: `/connection?${WS}&mode=cross`,
    sel: ['.cx-composer'],
    zh: {
      title: '放进你自己的材料',
      body: '输入框可以直接粘贴截图、拖入 PDF、添加网页。用的是你自己的模型，key 只存在本页内存里。',
    },
    en: {
      title: 'Bring your own material',
      body: 'Paste screenshots, drag in PDFs or add web pages right in the input. It runs on your own model; the key stays in this page’s memory only.',
    },
  },
  {
    id: 'atlas-mind',
    path: `/atlas?${WS}&map=mind&focus=n.normal-eq`,
    sel: ['.me-board'],
    zh: {
      title: '思维导图',
      body: '认知记忆图谱的第一种图。像常用的导图软件一样用 Tab、Enter 编辑，公式用 LaTeX，改完自动保存到工作区的 maps/mind.json。主题上的「前提」「关联」角标来自知识图谱；蓝线是知识关系，朱色双线是你自己画的连线（Ctrl+K）。',
    },
    en: {
      title: 'The mind map',
      body: 'The first kind of map in the Atlas. Edit with Tab and Enter as in familiar mind-map tools, write formulas in LaTeX, and changes save to the workspace’s maps/mind.json. The “prerequisite” and “relation” badges come from the knowledge graph; blue lines are knowledge relations, red double lines are links you drew yourself (Ctrl+K).',
    },
  },
  {
    id: 'atlas-insp',
    path: `/atlas?${WS}&map=mind&focus=n.normal-eq`,
    sel: ['.me-insp-body'],
    zh: {
      title: '主题详情',
      body: '选中一个主题，右栏显示它的公式、成立条件和知识关系。「打开讲义对应处」回到讲义里讲它的那一段；「拿去关联探索」带着它和相连的知识去提问。',
    },
    en: {
      title: 'Topic details',
      body: 'Select a topic and the right column shows its formulas, the conditions it needs, and its relations. “Open in the notes” goes back to the passage that teaches it; “Explore connections” takes it and its linked concepts to the Connection Explorer.',
    },
  },
  {
    id: 'atlas-tools',
    path: `/atlas?${WS}&map=mind&focus=n.normal-eq`,
    sel: ['.atlas-tools'],
    zh: {
      title: '按资料更新、切换图谱',
      body: '讲义改过之后，「按资料更新」让模型对照最新笔记修改导图，先给你看改了哪里，确认后才应用。右边切换到第二种图：个人记忆图谱。',
    },
    en: {
      title: 'Update from notes, switch maps',
      body: 'After your notes change, “Update from notes” has the model revise the map against them — you see the diff and apply only what you accept. On the right, switch to the second kind of map: the memory map.',
    },
  },
  {
    id: 'atlas-memory',
    path: `/atlas?${WS}&map=memory`,
    sel: ['.mm-bar', '.mm'],
    zh: {
      title: '个人记忆图谱：考考自己',
      body: '第二种图从同一张导图出发，用来自测：收起、遮盖，或者把叶子全部挖空，填完按 O 对照原文。练习记录存在 maps/memory.json。这张图的布局只有你能改，AI 不会自动重排。',
    },
    en: {
      title: 'The memory map: test yourself',
      body: 'The second map starts from the same mind map and is for self-testing: fold, cover, or blank out every leaf, then press O to check against the original. Practice is saved in maps/memory.json. Only you arrange this map — AI never rearranges it.',
    },
  },
  {
    id: 'end',
    path: '/',
    sel: ['.topbar-end'],
    zh: {
      title: '走完了',
      body: '「入门」里有完整的使用说明；齿轮里可以接入你自己的模型（DeepSeek、通义千问、Kimi 等已实测可直接调用）。旁边可以切换英文界面和夜间模式。导览随时可以从封面重新开始。',
    },
    en: {
      title: 'That’s the tour',
      body: '“Guide” has the full manual; the gear lets you connect your own model (DeepSeek, Qwen, Kimi and others are tested to work from the browser). Next to it you can switch language and dark mode. Restart the tour from the cover any time.',
    },
  },
];
