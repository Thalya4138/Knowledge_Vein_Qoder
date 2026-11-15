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
}

export const SPACES: Space[] = [
  {
    key: 'workspace',
    path: '/workspace',
    name: '学习工作台',
    short: '学习工作台',
    line: '科目即工作区：手里零散的资源，加上 AI 辅助的强大搜索，做出真正全面的讲义。',
  },
  {
    key: 'lab',
    path: '/lab',
    name: '可视化实验室',
    short: '可视化实验室',
    line: '抽象的直觉变为可视化的呈现，让学习具象化。',
  },
  {
    key: 'connection',
    path: '/connection',
    name: '知识关联探索',
    short: '关联探索',
    line: '让散落的知识熵减，让混乱的思路清晰。',
  },
  {
    key: 'atlas',
    path: '/atlas',
    name: '认知记忆图谱',
    short: '记忆图谱',
    line: '当记忆长出骨架，学习的血肉便会自由生长。',
  },
];

export function spaceForPath(pathname: string): Space | undefined {
  return SPACES.find((s) => pathname === s.path || pathname.startsWith(`${s.path}/`));
}
