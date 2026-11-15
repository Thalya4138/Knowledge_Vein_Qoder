export interface ToolRegistration {
  id: string;
  name: string;
  status: 'real' | 'planned';
}

/** 可视化实验室的工具注册表；真实实验接入前为空。 */
export const TOOLS: ToolRegistration[] = [];
