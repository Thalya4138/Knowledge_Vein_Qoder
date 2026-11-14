/**
 * callout 类型白名单与版位规则。
 *
 * 白名单必须与 `scripts/verify-content.mjs` 的 BLOCKS、`prompts/NOTE_GENERATION.md` §4 / §3.5 一致；
 * `callouts.test.ts` 会读取校验脚本做比对，任何一边单改都会让测试失败。
 */
export const CALLOUT_KINDS = [
  // 正文语义块（NOTE_GENERATION §4）
  'material', 'note', 'aside', 'link', 'method', 'trap', 'exercise', 'viewpoint', 'unsourced',
  // 教材栏目（NOTE_GENERATION §3.5）
  'problem', 'focus', 'side', 'ask', 'xref', 'res', 'figure', 'table',
  'practice', 'discuss', 'critical', 'training', 'summary',
] as const;

export type CalloutKind = (typeof CALLOUT_KINDS)[number];

const KNOWN = new Set<string>(CALLOUT_KINDS);
export const isCalloutKind = (k: string): k is CalloutKind => KNOWN.has(k);

/** 永远进旁栏的栏目（§3.5 表格"位置"一列为"旁栏"）。 */
const SIDE_KINDS = new Set<string>(['focus', 'side', 'ask', 'xref', 'res', 'critical']);

/**
 * 版位判定。
 * - 旁栏栏目固定进旁栏；
 * - 图"主栏或旁栏"：写了 `@锚` 就进旁栏与该段同高（样张图 2-1、图 2-2），否则留在主栏；
 * - 其余（问题探讨、表、思维训练、练习……）都在主栏。
 */
export function placementOf(kind: string, explicitAlign: string | undefined): 'main' | 'side' {
  if (SIDE_KINDS.has(kind)) return 'side';
  if (kind === 'figure' && explicitAlign) return 'side';
  return 'main';
}
