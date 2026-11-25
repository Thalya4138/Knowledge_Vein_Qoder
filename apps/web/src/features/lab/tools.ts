/** DOMAIN_MODEL §1 VisualizationRun.status：结果来源必须如实标注，不许伪装。 */
export type VizStatus = 'real' | 'pre-rendered' | 'example' | 'failed';

export interface ToolRegistration {
  /** 稳定 id：导图主题的 `viz` 字段指向它，地址参数 `?viz=` 也用它 */
  id: string;
  name: string;
  status: 'real' | 'planned';
  /** 打开一次实验时记进 VisualizationRun 的来源；页面是随站发布的预置交互页 */
  runStatus: VizStatus;
  /** 站内静态可视化页；页面自带交互，实验室用 iframe 承载 */
  src?: string;
  /** 一句说明：这张图让人看见什么 */
  summary?: string;
  /** 顶栏气泡里的那一问：这张实验替用户回答什么 */
  question?: string;
  /** 画面恒定一类的前提说明，顶栏以弱标签如实标出 */
  modeTag?: string;
  /** 页内是否实时计算（区别于「随站预置」的来源标注） */
  live?: boolean;
}

export interface VisualizationRun {
  id: string;
  tool: string;
  inputRef?: { kind: 'node' | 'note' | 'formula'; id: string; text?: string };
  params?: Record<string, string>;
  resultRef: string;
  status: VizStatus;
  noteAnchor?: string;
}

export const RUN_STATUS_LABEL: Record<VizStatus, string> = {
  real: '实时计算',
  'pre-rendered': '预置实验',
  example: '示例结果',
  failed: '没有跑起来',
};

/** 可视化实验室的注册表：status 为 real 的会算进封面「真实实验」统计。 */
export const TOOLS: ToolRegistration[] = [
  {
    id: 'viz.photosynthesis',
    name: '光合作用 · 单画布',
    status: 'real',
    runStatus: 'pre-rendered',
    src: '/visualizations/photosynthesis.html',
    summary: '把光反应与碳反应放在同一张画布上：电子、质子与碳的流向各自可见，步进到任一阶段。',
    question: '光反应与卡尔文循环，怎样在同一张画布上同时发生？',
    modeTag: '同一参数与步号下画面恒定',
  },
  {
    id: 'viz.quadric-surfaces',
    name: '二次曲面',
    status: 'real',
    runStatus: 'pre-rendered',
    src: '/visualizations/quadric-surfaces.html',
    summary: '旋转、改参数、切截线：椭球面、抛物面、双曲面在同一坐标系里比较标准型与截面形状。',
    question: '方程里的 a、b、c，如何改变曲面的形状？',
    live: true,
  },
];

export function toolById(id: string | null | undefined): ToolRegistration | undefined {
  return id ? TOOLS.find((t) => t.id === id) : undefined;
}

/** 打开/挂载一次实验时构造的可追溯记录（TASK_R2_LINKAGE L5）。 */
export function vizRun(tool: ToolRegistration, inputRef?: VisualizationRun['inputRef']): VisualizationRun {
  return {
    id: `run.${tool.id}.${Date.now().toString(36)}`,
    tool: tool.id,
    inputRef,
    resultRef: tool.src ?? '',
    status: tool.runStatus,
  };
}

/** 图谱主题 → 实验室的深链；沿用全站的 `?ws=` 工作区约定。 */
export function labHref(o: { ws?: string; viz: string; node?: string }): string {
  const q = new URLSearchParams();
  if (o.ws) q.set('ws', o.ws);
  q.set('viz', o.viz);
  if (o.node) q.set('node', o.node);
  return `/lab?${q.toString()}`;
}