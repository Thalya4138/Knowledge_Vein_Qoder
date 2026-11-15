/** 关系类型与可信度（epistemic）的显示文字。取值以 docs/GLOSSARY.md 为准。 */

export const RELATION_TYPE_LABEL: Record<string, string> = {
  contains: '包含',
  prerequisite: '先修',
  'defined-by': '由……刻画',
  'derives-from': '推出',
  'equivalent-under': '等价',
  generalizes: '推广',
  'applies-to': '应用于',
  'contrasts-with': '对照',
  'shared-mechanism': '共用机制',
  'analogy-to': '类比',
  'counterexample-to': '反例',
};

export interface EpistemicMeta {
  label: string;
  /** 一句话说明谁为这条边担保 */
  hint: string;
  /** 线型：与 GLOSSARY 的 UI 呈现建议一致 */
  line: 'solid-strong' | 'solid' | 'dashed' | 'dotted' | 'double';
}

export const EPISTEMIC: Record<string, EpistemicMeta> = {
  'source-backed': { label: '有出处', hint: '有原文出处支持', line: 'solid-strong' },
  'logically-derived': { label: '可推出', hint: '可从已接受的前提推导', line: 'solid' },
  'pedagogical-inference': { label: '教学归纳', hint: '教学上的合理归纳，没有独立证据', line: 'dashed' },
  analogy: { label: '类比', hint: '类比启发，不是证明', line: 'dotted' },
  hypothesis: { label: '待验证', hint: '猜想，尚待验证', line: 'dotted' },
  'user-personal': { label: '我的', hint: '个人联想，不对他人成立', line: 'double' },
};

export function epistemicOf(value: string): EpistemicMeta {
  return EPISTEMIC[value] ?? { label: value, hint: '', line: 'solid' };
}
