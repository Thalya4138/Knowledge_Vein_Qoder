import { useEffect, useState } from 'react';
import { Icon } from '../../ui/Icon';
import { useT } from '../../ui/prefs';
import { readText } from '../../store/open';
import type { Workspace, WorkspaceStore } from '../../store/types';
import { applyChanges, changePath, diffLines, undoChanges, type AppliedChange, type FileChange } from './changes';

/**
 * 四步共用的写入预览（AGENTS.md §1 第 4 条）：先把提案逐条摆出来——新建给全文、修改给行级差异、
 * 改名给从→到——用户确认后才落盘；落盘后还能一步撤销。程序不算命，差异是确定性算出来的。
 */
export function ChangePreview({
  open,
  title,
  changes,
  store,
  ws,
  onWorkspace,
  onClose,
  onStatus,
  onApplied,
  controller,
}: {
  open: boolean;
  title: string;
  changes: FileChange[];
  store: WorkspaceStore | null;
  ws: Workspace;
  onWorkspace?: (w: Workspace) => void;
  onClose: () => void;
  onStatus?: (s: string) => void;
  onApplied?: (applied: AppliedChange[]) => void;
  /** 阅读视图改写用它接管落盘与撤销（沿用 NoteView 的 change/undo 与本机草稿），不走 store */
  controller?: { before: Record<string, string | null>; apply: () => Promise<void> | void; undo: () => void };
}) {
  const tr = useT();
  const [befores, setBefores] = useState<Record<string, string | null>>({});
  const [phase, setPhase] = useState<'preview' | 'done'>('preview');
  const [applied, setApplied] = useState<AppliedChange[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPhase('preview');
    setApplied([]);
    if (controller) {
      setBefores(controller.before);
      return;
    }
    if (!store) return;
    let alive = true;
    const paths = [...new Set(changes.flatMap((c) => (c.op === 'rename' ? [c.from, c.to] : [c.path])))];
    void Promise.all(paths.map(async (p) => [p, await readText(store, p)] as const)).then((entries) => {
      if (alive) setBefores(Object.fromEntries(entries));
    });
    return () => {
      alive = false;
    };
  }, [open, store, changes, controller]);

  if (!open) return null;

  const confirm = async () => {
    if (busy || (!store && !controller)) return;
    setBusy(true);
    try {
      if (controller) {
        await controller.apply();
        setPhase('done');
        onStatus?.(tr('已写入改动。', 'Change written.'));
      } else {
        const res = await applyChanges(store!, ws, changes, onWorkspace);
        setApplied(res.applied);
        setPhase('done');
        onApplied?.(res.applied);
        onStatus?.(tr(`已写入 ${res.applied.length} 处改动。`, `Wrote ${res.applied.length} change(s).`));
      }
    } catch (e) {
      onStatus?.((e as Error).message);
    }
    setBusy(false);
  };

  const undo = async () => {
    if (busy || (!store && !controller)) return;
    setBusy(true);
    try {
      if (controller) {
        controller.undo();
      } else {
        await undoChanges(store!, ws, applied, onWorkspace);
      }
      onStatus?.(tr('已撤销刚才的写入。', 'Undone the last write.'));
      onClose();
    } catch (e) {
      onStatus?.((e as Error).message);
    }
    setBusy(false);
  };

  return (
    <div className="chg-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="chg-dialog">
        <header className="chg-head">
          <span>{title}</span>
          <button type="button" className="btn quiet" onClick={onClose} aria-label={tr('关闭', 'Close')}>
            <Icon name="close" />
          </button>
        </header>

        {!store && !controller ? (
          <p className="chg-empty">{tr('要先打开或授权这个工作区，才能写入。', 'Open or allow this workspace first to write into it.')}</p>
        ) : (
          <div className="chg-body">
            {changes.map((c, i) => (
              <section className="chg-item" key={i}>
                <p className="chg-item-head">
                  <span className={`chg-op ${c.op}`}>
                    {c.op === 'create' ? tr('新建', 'New') : c.op === 'update' ? tr('修改', 'Edit') : tr('改名', 'Rename')}
                  </span>
                  <code>{c.op === 'rename' ? `${c.from} → ${c.to}` : changePath(c)}</code>
                </p>
                {c.reason && <p className="chg-reason">{c.reason}</p>}
                {c.op === 'update' ? (
                  <pre className="chg-diff">
                    {diffLines(befores[c.path] ?? '', c.content).map((l, j) => (
                      <span key={j} className={`chg-line ${l.type}`}>
                        {l.type === 'add' ? '+ ' : l.type === 'del' ? '− ' : '  '}
                        {l.text || ' '}
                        {'\n'}
                      </span>
                    ))}
                  </pre>
                ) : c.op === 'create' ? (
                  <pre className="chg-new">{c.content.length > 4000 ? c.content.slice(0, 4000) + '\n…' : c.content}</pre>
                ) : null}
              </section>
            ))}
          </div>
        )}

        <footer className="chg-foot">
          {phase === 'preview' ? (
            <>
              <span className="chg-hint">{tr('确认后才会写进工作区；写完仍可一步撤销。', 'Nothing is written until you confirm; you can undo afterwards.')}</span>
              <button type="button" className="btn quiet" onClick={onClose} disabled={busy}>
                {tr('拒绝', 'Reject')}
              </button>
              <button type="button" className="btn primary" onClick={() => void confirm()} disabled={busy || (!store && !controller) || changes.length === 0}>
                <Icon name="save" />
                {tr('确认写入', 'Confirm')}
              </button>
            </>
          ) : (
            <>
              <span className="chg-hint">{tr(`已写入 ${applied.length} 处。`, `${applied.length} change(s) written.`)}</span>
              <button type="button" className="btn quiet" onClick={() => void undo()} disabled={busy}>
                <Icon name="history" />
                {tr('撤销', 'Undo')}
              </button>
              <button type="button" className="btn primary" onClick={onClose} disabled={busy}>
                {tr('完成', 'Done')}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}