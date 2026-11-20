import { useEffect, useMemo, useRef, useState } from 'react';
import type { Nodes } from 'mdast';
import { Icon } from '../../ui/Icon';
import { parseNote } from '../../content/parseNote';
import { NoteReader } from '../../reader/NoteReader';
import { demoManifest } from '../../app/demo';
import { localFileUrl, saveLocalText } from './localFolder';
import { browserFileUrl, saveBrowserText } from '../../store/browser';
import { DEMO_WORKSPACE, type WsFile } from './workspaceData';
import { useWorkspace } from '../../app/WorkspaceProvider';
import { loadAnnotations, saveAnnotations } from '../../reader/annotationStore';
import type { Annotation } from '../../reader/annotations';

export interface LocateRequest {
  heading: string;
  /** 每次请求换一个值，同一处可以反复定位 */
  nonce: number;
}

const draftKey = (id: string) => `vein.draft.${id}`;
const DEMO_BASE = '/demo/linear-algebra';

const isMarkdown = (file: WsFile) => file.kind === 'lecture' || (file.kind === 'source' && file.lang === 'markdown');

/** 收集文档里全部图片的相对路径与 `![[嵌入]]` 的目标（主栏与 callout 内都要）。 */
function imageSrcs(source: string): { images: string[]; embeds: string[] } {
  const doc = parseNote(source);
  const images = new Set<string>();
  const embeds = new Set<string>();
  const walk = (n: Nodes) => {
    if (n.type === 'image' && !/^[a-z][a-z0-9+.-]*:/i.test(n.url)) images.add(decodeURI(n.url));
    if (n.type === 'obEmbed') embeds.add(n.data.target);
    if ('children' in n) for (const c of n.children) walk(c as Nodes);
  };
  for (const b of doc.blocks) {
    if (b.type === 'prose') b.nodes.forEach(walk);
    if (b.type === 'callout') b.body.forEach(walk);
  }
  return { images: [...images], embeds: [...embeds] };
}

const normalize = (path: string) => {
  const out: string[] = [];
  for (const seg of path.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }
  return out.join('/');
};

/**
 * 按 Obsidian 的规则找文件：先相对笔记所在目录，再相对库根目录，最后只按文件名在整个库里找
 * （Obsidian 默认「最短路径」，`![[图.png]]` 与 `![](附件/图.png)` 都常见）。
 */
function findInVault(files: WsFile[], noteDir: string, ref: string): WsFile | undefined {
  const byPath = new Map(files.filter((f) => f.path).map((f) => [f.path!, f]));
  const clean = normalize(ref.split('#')[0]!);
  const withMd = (p: string) => (/\.[a-z0-9]+$/i.test(p) ? [p] : [p, `${p}.md`]);
  for (const p of [...withMd(normalize(`${noteDir}/${clean}`)), ...withMd(clean)]) {
    const hit = byPath.get(p);
    if (hit) return hit;
  }
  const base = clean.split('/').at(-1)!.toLowerCase();
  return files.find((f) => {
    const name = f.path?.split('/').at(-1)?.toLowerCase();
    return name === base || name === `${base}.md`;
  });
}

/**
 * Markdown 阅读视图（R1b / T1-2）：示例讲义与本地 md 都走 T1-1 解析器 + NoteReader。
 * 示例讲义带资源抽屉（manifest）；本地 / 浏览器工作区 md 的图片与嵌入先解析成 blob 地址再渲染。
 * 编辑模式下是块级编辑：点一段改一段，改完立即存回（本地文件夹 / 浏览器 / 示例的本机草稿），可撤销。
 * 叠加层（荧光、批改、便签……）存在 `.vein/annotations/`，不写进讲义。
 */
function NoteView({
  file,
  url,
  locate,
  editing,
  files,
  onStatus,
}: {
  file: WsFile;
  url: string;
  locate: LocateRequest | null;
  editing: boolean;
  files: WsFile[];
  onStatus: (s: string | null) => void;
}) {
  const { workspace } = useWorkspace();
  const ws = workspace ?? DEMO_WORKSPACE;
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState(false);
  const [assets, setAssets] = useState<Map<string, string>>(new Map());
  const [nonce, setNonce] = useState(0);
  const [anns, setAnns] = useState<Annotation[]>([]);
  const past = useRef<string[]>([]);
  const future = useRef<string[]>([]);
  const [, bump] = useState(0);

  useEffect(() => {
    let alive = true;
    setText(null);
    setError(null);
    setAssets(new Map());
    past.current = [];
    future.current = [];
    const saved = file.local || file.browser ? null : localStorage.getItem(draftKey(`${file.id}.md`));
    setDraft(saved !== null);
    const load = saved !== null ? Promise.resolve(saved) : fetch(url).then((r) => {
      if (!r.ok) throw new Error(`读取失败（HTTP ${r.status}）`);
      return r.text();
    });
    load
      .then(async (t) => {
        if (!alive) return t;
        if ((file.local || file.browser) && file.path) {
          const resolve = file.local ? localFileUrl : browserFileUrl;
          const dir = file.path.split('/').slice(0, -1).join('/');
          const map = new Map<string, string>();
          const { images, embeds } = imageSrcs(t);
          await Promise.all(
            [...images, ...embeds].map(async (src) => {
              const hit = findInVault(files, dir, src);
              if (!hit) return;
              try {
                map.set(src, await resolve(hit.id));
              } catch {
                // 读不到的图片保持原样，浏览器显示裂图，不中断整篇阅读
              }
            }),
          );
          if (alive) setAssets(map);
        }
        return t;
      })
      .then((t) => alive && setText(t))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [file, url, nonce, files]);

  useEffect(() => {
    let alive = true;
    setAnns([]);
    loadAnnotations(ws, file)
      .then((a) => alive && setAnns(a))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [ws, file]);

  const assetUrl = useMemo(() => {
    if (file.local || file.browser) return (src: string) => assets.get(decodeURI(src)) ?? src;
    return (src: string) => encodeURI(`${DEMO_BASE}/notes/${src}`);
  }, [file.local, file.browser, assets]);
  const embedUrl = useMemo(() => (target: string) => assets.get(target), [assets]);

  // AI 对话框的定位：按标题文字找到 slug，滚动并短暂高亮
  useEffect(() => {
    if (!locate || text === null) return;
    const doc = parseNote(text);
    const hit = doc.headings.find((h) => h.text.trim() === locate.heading || h.text.includes(locate.heading));
    if (!hit) return;
    const el = document.getElementById(hit.slug);
    if (!el) return;
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' });
    el.classList.add('nr-flash');
    const t = window.setTimeout(() => el.classList.remove('nr-flash'), 2400);
    return () => window.clearTimeout(t);
  }, [locate, text]);

  const persist = async (next: string) => {
    setText(next);
    try {
      if (file.local) {
        await saveLocalText(file.id, next);
        onStatus(`已存回你的文件夹：${file.path}`);
      } else if (file.browser) {
        await saveBrowserText(file.id, next);
        onStatus(`已保存到浏览器工作区：${file.path}`);
      } else {
        localStorage.setItem(draftKey(`${file.id}.md`), next);
        setDraft(true);
        onStatus('示例讲义只读，改动已存为这台电脑的本机草稿');
      }
    } catch (e) {
      onStatus(`没有保存：${(e as Error).message}`);
    }
  };

  const change = (next: string) => {
    if (text === null || next === text) return;
    past.current.push(text);
    future.current = [];
    bump((n) => n + 1);
    void persist(next);
  };
  const undo = () => {
    const prev = past.current.pop();
    if (prev === undefined || text === null) return;
    future.current.push(text);
    bump((n) => n + 1);
    void persist(prev);
  };
  const redo = () => {
    const next = future.current.pop();
    if (next === undefined || text === null) return;
    past.current.push(text);
    bump((n) => n + 1);
    void persist(next);
  };

  // 编辑模式下，焦点不在输入框里时 Ctrl+Z / Ctrl+Y 撤销重做整段的改动
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('textarea, input, [contenteditable="true"]')) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const changeAnns = (next: Annotation[]) => {
    setAnns(next);
    saveAnnotations(ws, file, next).catch((e: Error) => onStatus(`批注没有保存：${e.message}`));
  };

  if (error) return <p className="viewer-state">{error}</p>;
  if (text === null) return <p className="viewer-state">正在读取…</p>;

  return (
    <>
      {draft && (
        <p className="draft-note">
          正在看你的本机草稿。
          <button
            type="button"
            onClick={() => {
              localStorage.removeItem(draftKey(`${file.id}.md`));
              setNonce((n) => n + 1);
            }}
          >
            恢复原稿
          </button>
        </p>
      )}
      {editing && (
        <div className="edit-bar" role="toolbar" aria-label="编辑">
          <span>点任意一段即可修改；每一段改完立即保存。</span>
          <button type="button" className="btn quiet small" onClick={undo} disabled={past.current.length === 0} title="撤销（Ctrl+Z）">
            撤销
          </button>
          <button type="button" className="btn quiet small" onClick={redo} disabled={future.current.length === 0} title="重做（Ctrl+Y）">
            重做
          </button>
        </div>
      )}
      <NoteReader
        source={text}
        manifest={file.local || file.browser ? undefined : demoManifest}
        resourceBase={DEMO_BASE}
        assetUrl={assetUrl}
        embedUrl={embedUrl}
        editable={editing}
        onSourceChange={change}
        annotations={anns}
        onAnnotationsChange={changeAnns}
      />
    </>
  );
}

function SourceView({
  file,
  url,
  editing,
  onStatus,
  onSaved,
}: {
  file: WsFile;
  url: string;
  editing: boolean;
  onStatus: (s: string | null) => void;
  onSaved: () => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const local = Boolean(file.local);
  const browser = Boolean(file.browser);
  const persisted = local || browser;

  useEffect(() => {
    let alive = true;
    setText(null);
    setError(null);
    const saved = persisted ? null : localStorage.getItem(draftKey(file.id));
    if (saved !== null) {
      setText(saved);
      setDraft(saved);
      return;
    }
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`读取失败（HTTP ${r.status}）`);
        return r.text();
      })
      .then((t) => {
        if (!alive) return;
        const shown = file.lang === 'json' && !persisted ? JSON.stringify(JSON.parse(t), null, 2) : t;
        setText(shown);
        setDraft(shown);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [url, file.id, file.lang, persisted]);

  if (error) return <p className="viewer-state">{error}</p>;
  if (text === null) return <p className="viewer-state">正在读取…</p>;

  if (editing) {
    const save = async () => {
      try {
        if (local) {
          await saveLocalText(file.id, draft);
          onStatus(`已存回你的文件夹：${file.path}`);
        } else if (browser) {
          await saveBrowserText(file.id, draft);
          onStatus(`已保存到浏览器工作区：${file.path}`);
        } else {
          localStorage.setItem(draftKey(file.id), draft);
          onStatus('示例文件只读，已保存为这台电脑的本机草稿');
        }
        setText(draft);
        onSaved();
      } catch (e) {
        onStatus(`没有保存：${(e as Error).message}`);
      }
    };
    return (
      <div className="source-edit">
        <div className="format-bar" role="toolbar" aria-label="源文件">
          <span className="format-hint">
            {local ? '改动会直接写回你的文件' : browser ? '改动会保存到这个浏览器工作区' : '示例文件只读，改动保存为本机草稿'}
          </span>
          <span className="format-sep" aria-hidden="true" />
          <button type="button" className="strong" onClick={save} disabled={draft === text}>
            <Icon name="save" />
            保存
          </button>
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          aria-label={`编辑 ${file.name}`}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
              e.preventDefault();
              void save();
            }
          }}
        />
      </div>
    );
  }

  return (
    <div className="source">
      <ol>
        {text.split('\n').map((line, i) => (
          <li key={i}>
            <code>{line || ' '}</code>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function FileViewer({
  file,
  view,
  locate,
  editing,
  files,
  onStatus,
}: {
  file: WsFile;
  view: 'read' | 'source';
  locate: LocateRequest | null;
  editing: boolean;
  /** 工作区全部文件：Obsidian 的图片与嵌入按文件名在整个库里找 */
  files: WsFile[];
  onStatus: (s: string | null) => void;
}) {
  const [url, setUrl] = useState<string | null>(file.local || file.browser ? null : file.url);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!file.local && !file.browser) {
      setUrl(file.url);
      return;
    }
    let made: string | null = null;
    let alive = true;
    setUrl(null);
    setError(null);
    const load = file.local ? localFileUrl : browserFileUrl;
    load(file.id)
      .then((u) => {
        made = u;
        if (alive) setUrl(u);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [file.id, file.local, file.browser, file.url, nonce]);

  if (error) return <p className="viewer-state">{error}</p>;
  if (!url) return <p className="viewer-state">正在打开…</p>;

  if (isMarkdown(file)) {
    // 阅读视图下编辑 = 在渲染结果上块级编辑；源文件视图下编辑 = 直接改整篇 Markdown
    if (view === 'source') {
      const sourceFile = file.kind === 'lecture' ? { ...file, id: `${file.id}.md` } : file;
      const sourceUrl = file.kind === 'lecture' ? file.sourceUrl! : url;
      return <SourceView file={sourceFile} url={sourceUrl} editing={editing} onStatus={onStatus} onSaved={() => setNonce((n) => n + 1)} />;
    }
    return <NoteView file={file} url={file.kind === 'lecture' ? file.sourceUrl! : url} locate={locate} editing={editing} files={files} onStatus={onStatus} />;
  }
  if (file.kind === 'source') {
    return <SourceView file={file} url={url} editing={editing} onStatus={onStatus} onSaved={() => setNonce((n) => n + 1)} />;
  }
  if (file.kind === 'pdf' || file.kind === 'html') {
    return <iframe key={file.id} className="frame" src={url} title={file.name} />;
  }
  if (file.kind === 'image') {
    return (
      <div className="figure-view">
        <img src={url} alt={file.name} />
      </div>
    );
  }
  return (
    <div className="link-view">
      <h2>{file.name}</h2>
      <p className="link-meta">{[file.meta?.kind, file.meta?.author].filter(Boolean).join('，')}</p>
      {file.meta?.note && <p className="link-note">{file.meta.note}</p>}
      {file.meta?.license && <p className="link-meta">许可：{file.meta.license}</p>}
      <a className="btn primary" href={file.url} target="_blank" rel="noreferrer">
        <Icon name="link" />
        在原网站打开
      </a>
      <p className="link-meta">外部网站不允许嵌入，版权归原作者。</p>
    </div>
  );
}

export function canEdit(file: WsFile): boolean {
  return file.kind === 'lecture' || file.kind === 'source';
}
