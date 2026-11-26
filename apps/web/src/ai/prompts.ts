import { readText } from '../store/open';
import type { WorkspaceStore } from '../store/types';
import qualityBar from '../../../../prompts/QUALITY_BAR.md?raw';
import mindmap from '../../../../prompts/MINDMAP.md?raw';
import explorer from '../../../../prompts/CONNECTION_EXPLORER.md?raw';
import fragments from '../../../../prompts/EXPLORE_FRAGMENTS.md?raw';
import meta from '../../../../prompts/EXPLORE_META.md?raw';
import cross from '../../../../prompts/EXPLORE_CROSS.md?raw';
import visualize from '../../../../prompts/VISUALIZE.md?raw';
import workspaceAsk from '../../../../prompts/WORKSPACE_ASK.md?raw';
import workspaceOrganize from '../../../../prompts/WORKSPACE_ORGANIZE.md?raw';
import workspaceRewrite from '../../../../prompts/WORKSPACE_REWRITE.md?raw';
import noteGeneration from '../../../../prompts/NOTE_GENERATION.md?raw';
import resourceDiscovery from '../../../../prompts/RESOURCE_DISCOVERY.md?raw';

/**
 * 每个 AI 位置的内置提示词（登记表 prompts/registry.json）。提示词随网站发布；
 * 工作区里放 `.vein/prompts/<位置>.md` 就用它替换内置的同名提示词（SYNC_AND_API.md §8）。
 * 共用底线 QUALITY_BAR.md 永远附在前面，工作区不能把它覆盖掉；
 * 有共用约束的位置（关联探索三种模式共用 CONNECTION_EXPLORER.md）同样不能被覆盖，只替换模式文件。
 */

const BUILT_IN = {
  'atlas.mindmap': mindmap,
  'connection.fragments': fragments,
  'connection.meta': meta,
  'connection.cross': cross,
  'lab.visualize': visualize,
  'workspace.ask': workspaceAsk,
  'workspace.organize': workspaceOrganize,
  'workspace.rewrite': workspaceRewrite,
  'note.generate': noteGeneration,
  'workspace.resources': resourceDiscovery,
} as const;

const SHARED: Partial<Record<keyof typeof BUILT_IN, string>> = {
  'connection.fragments': explorer,
  'connection.meta': explorer,
  'connection.cross': explorer,
};

export type PromptSlot = keyof typeof BUILT_IN;

/**
 * 发给模型前的整理。提示词文件同时写给维护者看，两种标记把不该给模型的部分去掉：
 * - `<!-- author --> … <!-- /author -->`：版本头、变更记录、用户原话、写给作者的交付清单。
 *   模型看到旧版本的做法会照着做（变更记录里写着已撤掉的骨架），看到它读不到的文件路径会凭空补。
 * - `<!-- only:atlas.mindmap,… --> … <!-- /only -->`：只对这些位置有用的段落（共用底线里导图的呈现规则）。
 */
export function forModel(text: string, slot: string): string {
  return text
    .replace(/<!--\s*author\s*-->[\s\S]*?<!--\s*\/author\s*-->/g, '')
    .replace(/<!--\s*only:([^>]*?)\s*-->([\s\S]*?)<!--\s*\/only\s*-->/g, (_m, slots: string, body: string) =>
      slots.split(',').map((x) => x.trim()).includes(slot) ? body : '',
    )
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function promptFor(slot: PromptSlot, store?: WorkspaceStore): Promise<{ text: string; overridden: boolean }> {
  const own = store ? await readText(store, `.vein/prompts/${slot}.md`) : null;
  const body = own?.trim() ? own : BUILT_IN[slot];
  const parts = [qualityBar, SHARED[slot], body].filter((p): p is string => Boolean(p)).map((p) => forModel(p, slot));
  return { text: parts.join('\n\n---\n\n'), overridden: Boolean(own?.trim()) };
}
