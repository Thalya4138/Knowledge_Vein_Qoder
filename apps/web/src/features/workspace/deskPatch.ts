import type { ChangeSet } from './changes';
import type { DeskSource } from './deskAsk';

/**
 * 步骤 3 · 问答「一键补进笔记」（SMART_SEARCH.md 阶段 3）。
 * 补入是确定性的：把读者已经得到的回答插进讲义的某个标题之后，不需要模型（§3 降级表里补入「完整可用」）。
 * 程序做成 update 提案，预览差异、确认后写入，靠 before 快照一步撤销（changes.ts）。
 */

const norm = (s: string): string => s.replace(/[\s　#]+/g, '').replace(/[＊*]/g, '');

/** 锚点 `path#标题` 取标题部分；没有 # 时整串当标题。 */
export function anchorHeading(anchor: string): string {
  const i = anchor.indexOf('#');
  return i < 0 ? anchor : anchor.slice(i + 1);
}

/**
 * 把 insertion 插到 anchor 标题那一节的末尾（下一个同级或更高级标题之前）。
 * 找不到标题就追加到全文末尾。绝不改动原有文字，只插入。
 */
export function insertAfterAnchor(note: string, anchor: string, insertion: string): string {
  const heading = norm(anchorHeading(anchor));
  const lines = note.replace(/\r\n/g, '\n').split('\n');
  const block = insertion.replace(/\r\n/g, '\n').replace(/\s+$/, '');
  if (heading) {
    for (let i = 0; i < lines.length; i += 1) {
      const m = /^(#{1,6})\s+(.*)$/.exec(lines[i]!);
      if (!m || norm(m[2]!) !== heading) continue;
      const level = m[1]!.length;
      let end = lines.length;
      for (let j = i + 1; j < lines.length; j += 1) {
        const h = /^(#{1,6})\s+/.exec(lines[j]!);
        if (h && h[1]!.length <= level) {
          end = j;
          break;
        }
      }
      // 去掉本节末尾的空行，插入后再补一个空行，保持段落间距
      let trim = end;
      while (trim > i + 1 && lines[trim - 1]!.trim() === '') trim -= 1;
      const before = lines.slice(0, trim).join('\n');
      const after = lines.slice(trim).join('\n');
      return `${before}\n\n${block}\n\n${after}`.replace(/\n{3,}/g, '\n\n');
    }
  }
  const base = note.replace(/\s+$/, '');
  return `${base}\n\n${block}\n`;
}

/** 补入正文：一行出处说明 + 回答原文（不改写回答），有出处时附位置清单。 */
export function patchInsertion(q: string, answer: string, sources: DeskSource[], date: string): string {
  const head = `*补自工作台问答 · ${date}${q ? ` · 问：${q.replace(/\n/g, ' ')}` : ''}*`;
  const where = sources.length ? `\n\n*出处：${sources.map((s) => `[${s.n}] ${s.label}`).join('；')}*` : '';
  return `${head}\n\n${answer.trim()}${where}`;
}

export function buildPatchChanges(
  targetPath: string,
  targetAnchor: string,
  noteText: string,
  q: string,
  answer: string,
  sources: DeskSource[],
  date: string,
): ChangeSet {
  const insertion = patchInsertion(q, answer, sources, date);
  const next = insertAfterAnchor(noteText, targetAnchor, insertion);
  return {
    title: '把回答补进笔记',
    changes: [{ op: 'update', path: targetPath, content: next, reason: targetAnchor ? `插到「${anchorHeading(targetAnchor)}」一节之后` : '追加到讲义末尾' }],
  };
}