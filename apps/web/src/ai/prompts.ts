import { readText } from '../store/open';
import type { WorkspaceStore } from '../store/types';
import qualityBar from '../../../../prompts/QUALITY_BAR.md?raw';
import mindmap from '../../../../prompts/MINDMAP.md?raw';

/**
 * 每个 AI 位置的内置提示词（登记表 prompts/registry.json）。提示词随网站发布；
 * 工作区里放 `.vein/prompts/<位置>.md` 就用它替换内置的同名提示词（SYNC_AND_API.md §8）。
 * 共用底线 QUALITY_BAR.md 永远附在前面，工作区不能把它覆盖掉。
 */

const BUILT_IN = {
  'atlas.mindmap': mindmap,
} as const;

export type PromptSlot = keyof typeof BUILT_IN;

export async function promptFor(slot: PromptSlot, store?: WorkspaceStore): Promise<{ text: string; overridden: boolean }> {
  const own = store ? await readText(store, `.vein/prompts/${slot}.md`) : null;
  const body = own?.trim() ? own : BUILT_IN[slot];
  return { text: `${qualityBar}\n\n---\n\n${body}`, overridden: Boolean(own?.trim()) };
}
