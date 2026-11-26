import { useMemo, useState } from 'react';
import { Icon } from '../../ui/Icon';
import { useT } from '../../ui/prefs';
import type { ModelConfig } from '../../ui/prefs';
import { readText } from '../../store/open';
import type { Workspace, WorkspaceStore } from '../../store/types';
import { ChangePreview } from './ChangePreview';
import type { ChangeSet } from './changes';
import { discoverResources, generateLesson, lessonChanges, loadManifest, type Discovery, type ResourceCandidate } from './deskLesson';
import type { OrganizeLesson } from './deskOrganize';

/**
 * 步骤 2 的面板：选一节（来自整理方案的目录）→ 找资源（候选资源卡，采纳由你勾选）→ 生成教材体讲义 → 预览落盘。
 * 资源只引用不复制；候选 status=candidate，登记进 resources/manifest.json。无 key 时讲义与候选都标注「示例」。
 */
export function DeskLesson({
  model,
  store,
  ws,
  lessons,
  onWorkspace,
  onStatus,
}: {
  model: ModelConfig | null;
  store: WorkspaceStore | null;
  ws: Workspace;
  lessons: OrganizeLesson[];
  onWorkspace?: (w: Workspace) => void;
  onStatus: (s: string) => void;
}) {
  const tr = useT();
  const [idx, setIdx] = useState(0);
  const [manualTitle, setManualTitle] = useState('');
  const [manualSections, setManualSections] = useState('');
  const [discovery, setDiscovery] = useState<Discovery | null>(null);
  const [adopted, setAdopted] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<'find' | 'gen' | null>(null);
  const [preview, setPreview] = useState<ChangeSet | null>(null);
  const [genSample, setGenSample] = useState(false);

  const lesson: OrganizeLesson = useMemo(() => {
    if (lessons.length) return lessons[Math.min(idx, lessons.length - 1)]!;
    const title = manualTitle.trim() || '新建讲义';
    return { file: `notes/${title}.md`, title, sections: manualSections.split(/[,，、\n]/).map((s) => s.trim()).filter(Boolean) };
  }, [lessons, idx, manualTitle, manualSections]);

  const adoptedCandidates: ResourceCandidate[] = useMemo(
    () => (discovery?.candidates ?? []).filter((c) => adopted.has(c.id)),
    [discovery, adopted],
  );

  const find = async () => {
    if (busy) return;
    setBusy('find');
    setDiscovery(null);
    setAdopted(new Set());
    try {
      const d = await discoverResources(model, ws, lesson, []);
      setDiscovery(d);
    } catch (e) {
      onStatus((e as Error).message);
    }
    setBusy(null);
  };

  const generate = async () => {
    if (busy || !store) return;
    setBusy('gen');
    try {
      const existing = await readText(store, lesson.file);
      const draft = await generateLesson(model, ws, lesson, adoptedCandidates, existing);
      setGenSample(draft.sample);
      if (draft.status !== 'ok') {
        onStatus(draft.unresolved.join('；') || tr('模型认为资料不足，没有写讲义。', 'The model found the material insufficient.'));
        setBusy(null);
        return;
      }
      const manifest = await loadManifest(store);
      setPreview(lessonChanges(lesson.file, draft.markdown, existing !== null, manifest, adoptedCandidates, ws.id));
    } catch (e) {
      onStatus((e as Error).message);
    }
    setBusy(null);
  };

  return (
    <div className="desk-panel">
      <p className="answer-foot dock-mode">
        {model
          ? tr('按目录逐节找公开资源、写成教材体讲义；资源只引用不复制，确认后才落盘。', 'Find public resources per section and write a textbook-style lesson. Resources are cited, not copied; nothing is written until you confirm.')
          : tr('示例模式：讲义与资源卡取自预置样例。接入你自己的 API key 后，按你的目录生成。', 'Sample mode: lesson and resource cards are presets. Add your own API key to generate from your outline.')}
      </p>

      {lessons.length > 0 ? (
        <label className="desk-field">
          {tr('选一节', 'Pick a section')}
          <select value={idx} onChange={(e) => setIdx(Number(e.target.value))}>
            {lessons.map((l, i) => (
              <option key={l.file} value={i}>
                {l.title}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <>
          <input value={manualTitle} onChange={(e) => setManualTitle(e.target.value)} placeholder={tr('讲义题名（专业名词短语）', 'Lesson title (a professional noun phrase)')} autoComplete="off" />
          <input value={manualSections} onChange={(e) => setManualSections(e.target.value)} placeholder={tr('小节，用逗号分隔', 'Sections, comma-separated')} autoComplete="off" />
        </>
      )}

      <div className="desk-attach">
        <button type="button" className="btn quiet" onClick={() => void find()} disabled={busy !== null}>
          <Icon name="link" />
          {busy === 'find' ? tr('正在找资源…', 'Finding resources…') : tr('找资源', 'Find resources')}
        </button>
        <button type="button" className="btn primary" onClick={() => void generate()} disabled={busy !== null || !store}>
          <Icon name="doc" />
          {busy === 'gen' ? tr('正在写讲义…', 'Writing lesson…') : tr('生成讲义', 'Generate lesson')}
        </button>
      </div>

      {discovery && (
        <div className="dock-answer">
          <p className="answer-where">{tr('候选资源（勾选采纳）', 'Candidate resources (check to adopt)')}</p>
          {discovery.candidates.map((c) => (
            <div className="res-card" key={c.id}>
              <label>
                <input
                  type="checkbox"
                  checked={adopted.has(c.id)}
                  onChange={(e) =>
                    setAdopted((s) => {
                      const n = new Set(s);
                      if (e.target.checked) n.add(c.id);
                      else n.delete(c.id);
                      return n;
                    })
                  }
                />
                <h4>{c.title}</h4>
              </label>
              <p className="res-meta">
                {c.author} · {c.license} · <a href={c.uri} target="_blank" rel="noreferrer">{tr('来源', 'source')}</a>
              </p>
              {c.trustWhy && <p className="res-why">{c.trustWhy}</p>}
              <p className="res-limit">{tr('局限：', 'Limitation: ')}{c.limitations}</p>
            </div>
          ))}
          {discovery.stillMissing.length > 0 && <p className="answer-foot">{tr('找不到：', 'Not found: ')}{discovery.stillMissing.join('；')}</p>}
          {discovery.sample && <p className="answer-foot">{tr('示例候选：预置公开来源，非针对本节实时检索。', 'Sample candidates: preset public sources, not a live search for this section.')}</p>}
        </div>
      )}

      {genSample && <p className="answer-foot">{tr('示例讲义：取自示例知识库，非针对你的资料生成。', 'Sample lesson: from the demo knowledge base, not generated from your material.')}</p>}

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