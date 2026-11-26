import { useRef, useState, type ChangeEvent } from 'react';
import { Icon } from '../../ui/Icon';
import { useT } from '../../ui/prefs';
import type { ModelConfig } from '../../ui/prefs';
import type { Workspace, WorkspaceStore } from '../../store/types';
import { readAttachment, type Attachment } from '../connection/exploreAi';
import { ChangePreview } from './ChangePreview';
import type { ChangeSet } from './changes';
import { deskOrganize, organizeChanges, urlsToAttachments, type OrganizeLesson, type OrganizePlan } from './deskOrganize';

/**
 * 步骤 1 的面板：放资料（文本 / PDF / 网页 / 截图）→ AI 给整理方案与讲义目录 → 预览差异 → 确认落盘。
 * 无 key 时给标注「示例」的方案。落盘与撤销都走共用的 ChangePreview。
 */
export function DeskOrganize({
  model,
  store,
  ws,
  onWorkspace,
  onStatus,
  onLessons,
}: {
  model: ModelConfig | null;
  store: WorkspaceStore | null;
  ws: Workspace;
  onWorkspace?: (w: Workspace) => void;
  onStatus: (s: string) => void;
  onLessons: (lessons: OrganizeLesson[]) => void;
}) {
  const tr = useT();
  const fileInput = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [url, setUrl] = useState('');
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<OrganizePlan | null>(null);
  const [sample, setSample] = useState(false);
  const [preview, setPreview] = useState<ChangeSet | null>(null);
  const abort = useRef<AbortController | null>(null);

  const addFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const picked = [...(e.target.files ?? [])];
    e.target.value = '';
    if (!picked.length) return;
    setBusy(true);
    const read = await Promise.all(picked.map((f) => readAttachment(f)));
    setAttachments((a) => [...a, ...read]);
    setBusy(false);
  };

  const addUrl = async () => {
    const u = url.trim();
    if (!u) return;
    setUrl('');
    setBusy(true);
    const [att] = await urlsToAttachments([u]);
    setAttachments((a) => [...a, att!]);
    setBusy(false);
  };

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setPlan(null);
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      const { plan: p, sample: s } = await deskOrganize(model, ws, attachments, instruction, ctrl.signal);
      setPlan(p);
      setSample(s);
      onLessons(p.lessons);
      if (p.status === 'insufficient') onStatus(p.summary || tr('资料不足，模型没有拟出目录。', 'Not enough material to outline.'));
    } catch (e) {
      if ((e as Error).name !== 'AbortError') onStatus((e as Error).message);
    }
    setBusy(false);
  };

  const openPreview = async () => {
    if (!plan || !store) return;
    const existing = new Set((await store.list('')).map((e) => e.path));
    setPreview(organizeChanges(plan, existing));
  };

  return (
    <div className="desk-panel">
      <p className="answer-foot dock-mode">
        {model
          ? tr('放入资料，AI 给出整理方案与讲义目录；确认后才写进工作区。', 'Add material; AI proposes an organization plan and outline. Nothing is written until you confirm.')
          : tr('示例模式：给出预置的整理方案。接入你自己的 API key 后，会按你放入的资料生成。', 'Sample mode: a preset plan. Add your own API key to generate from your material.')}
      </p>

      <div className="desk-attach">
        <button type="button" className="btn quiet" onClick={() => fileInput.current?.click()} disabled={busy}>
          <Icon name="plus" />
          {tr('添加文件', 'Add files')}
        </button>
        <input ref={fileInput} type="file" hidden multiple onChange={(e) => void addFiles(e)} />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={tr('或粘贴网页地址', 'or paste a web URL')}
          autoComplete="off"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void addUrl();
            }
          }}
        />
        <button type="button" className="btn quiet" onClick={() => void addUrl()} disabled={busy || !url.trim()}>
          {tr('读取', 'Fetch')}
        </button>
      </div>

      {attachments.length > 0 && (
        <div className="desk-chips">
          {attachments.map((a, i) => (
            <span className="desk-chip" key={i}>
              {a.name}
              <button type="button" onClick={() => setAttachments((all) => all.filter((_, j) => j !== i))} aria-label={tr('移除', 'Remove')}>
                <Icon name="close" />
              </button>
            </span>
          ))}
        </div>
      )}

      <textarea
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder={tr('整理要求（可选）：例如「按章节归类课件，拟一份最小二乘的讲义目录」', 'Optional instruction, e.g. “group slides by chapter; outline a least-squares lesson”')}
        rows={2}
      />

      <div>
        <button type="button" className="btn primary" onClick={() => void run()} disabled={busy}>
          <Icon name="send" />
          {busy ? tr('正在解读资料…', 'Reading material…') : tr('给出整理方案', 'Propose a plan')}
        </button>
      </div>

      {plan && (
        <div className="dock-answer">
          <p className="answer-body">{plan.summary}</p>
          {plan.lessons.length > 0 && (
            <>
              <p className="answer-where">{tr('讲义目录', 'Lesson outline')}</p>
              <ol className="desk-outline">
                {plan.lessons.map((l) => (
                  <li key={l.file}>
                    <strong>{l.title}</strong>
                    {l.sections.length > 0 && <span>：{l.sections.join(' / ')}</span>}
                  </li>
                ))}
              </ol>
            </>
          )}
          {plan.stillMissing.length > 0 && (
            <p className="answer-foot">{tr('还缺：', 'Still missing: ')}{plan.stillMissing.join('；')}</p>
          )}
          {sample && <p className="answer-foot">{tr('示例结果：预置方案，非针对你的资料生成。', 'Sample result: a preset plan, not generated from your material.')}</p>}
          {plan.status === 'ok' && plan.lessons.length + plan.moves.length > 0 && (
            <div>
              <button type="button" className="btn primary" onClick={() => void openPreview()} disabled={!store}>
                <Icon name="save" />
                {tr('预览并落盘', 'Preview & write')}
              </button>
            </div>
          )}
        </div>
      )}

      <ChangePreview
        open={preview !== null}
        title={preview?.title ?? ''}
        changes={preview?.changes ?? []}
        store={store}
        ws={ws}
        onWorkspace={onWorkspace}
        onStatus={onStatus}
        onClose={() => setPreview(null)}
      />
    </div>
  );
}