/**
 * 四个工作空间。名称取自 docs/VISION.md；封面一句话描述的是「在这里做什么」，不解释功能。
 * 页眉导航、封面入口都从这里取。
 */

export type SpaceKey = 'workspace' | 'lab' | 'connection' | 'atlas';

export interface Space {
  key: SpaceKey;
  path: string;
  name: string;
  /** 页眉里的短名 */
  short: string;
  /** 封面索引的一句话：在这里做什么，用规范的表述 */
  line: string;
  /** 英文模式下的三项（同义，不逐字） */
  en: { name: string; short: string; line: string };
}

export const SPACES: Space[] = [
  {
    key: 'workspace',
    path: '/workspace',
    name: '学习工作台',
    short: '学习工作台',
    line: '科目即工作区：手里零散的资源，加上 AI 辅助的强大搜索，做出真正全面的讲义。',
    en: { name: 'Study Desk', short: 'Study Desk', line: 'One subject, one workspace: scattered materials become lecture notes you can learn from.' },
  },
  {
    key: 'lab',
    path: '/lab',
    name: '可视化实验室',
    short: '可视化实验室',
    line: '抽象的直觉变为可视化的呈现，让学习具象化。',
    en: { name: 'Visual Lab', short: 'Visual Lab', line: 'Turn an abstract intuition into something you can see and move.' },
  },
  {
    key: 'connection',
    path: '/connection',
    name: '知识关联探索',
    short: '关联探索',
    line: '让散落的知识熵减，让混乱的思路清晰。',
    en: { name: 'Connection Explorer', short: 'Connections', line: 'Bring order to scattered knowledge, and clarity to tangled thinking.' },
  },
  {
    key: 'atlas',
    path: '/atlas',
    name: '认知记忆图谱',
    short: '记忆图谱',
    line: '当记忆长出骨架，学习的血肉便会自由生长。',
    en: { name: 'Cognitive Memory Atlas', short: 'Memory Atlas', line: 'Once memory has a skeleton, the rest of learning can grow on it.' },
  },
];

export function spaceForPath(pathname: string): Space | undefined {
  return SPACES.find((s) => pathname === s.path || pathname.startsWith(`${s.path}/`));
}

/** 当前语言下的名字与一句话。 */
export function spaceText(s: Space, lang: 'zh' | 'en'): { name: string; short: string; line: string } {
  return lang === 'en' ? s.en : { name: s.name, short: s.short, line: s.line };
}
