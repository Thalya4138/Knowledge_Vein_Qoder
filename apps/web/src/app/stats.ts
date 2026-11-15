import { TOOLS, type ToolRegistration } from '../features/lab/tools';
import { demoGraph, demoKb } from './demo';

export interface HomeStats {
  /** 讲义节数：kb.json 里 status === "written" 的 outline 条目数 */
  noteSections: number;
  /** 知识节点数 */
  nodes: number;
  /** 带理由的关系数：只算 status === "accepted" */
  relations: number;
  /** 可用的真实实验数：注册表中 status === "real" 的工具数 */
  experiments: number;
}

export interface OutlineLike {
  status?: string;
}
export interface RelationLike {
  status?: string;
}

export function countWritten(outline: readonly OutlineLike[]): number {
  return outline.filter((e) => e.status === 'written').length;
}

export function countAccepted(relations: readonly RelationLike[]): number {
  return relations.filter((r) => r.status === 'accepted').length;
}

export function countRealTools(tools: readonly ToolRegistration[]): number {
  return tools.filter((t) => t.status === 'real').length;
}

export interface StatsInput {
  outline: readonly OutlineLike[];
  nodes: readonly unknown[];
  relations: readonly RelationLike[];
  tools: readonly ToolRegistration[];
}

export function computeHomeStats(input: StatsInput): HomeStats {
  return {
    noteSections: countWritten(input.outline),
    nodes: input.nodes.length,
    relations: countAccepted(input.relations),
    experiments: countRealTools(input.tools),
  };
}

export function homeStats(): HomeStats {
  return computeHomeStats({
    outline: demoKb.outline,
    nodes: demoGraph.nodes,
    relations: demoGraph.relations,
    tools: TOOLS,
  });
}
