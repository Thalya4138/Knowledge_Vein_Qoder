import { useEffect, useMemo, useState } from 'react';
import type { Nodes } from 'mdast';
import { Icon } from '../../ui/Icon';
import { parseNote } from '../../content/parseNote';
import { NoteReader } from '../../reader/NoteReader';
import { demoManifest } from '../../app/demo';
import { localFileUrl, saveLocalText } from './localFolder';
import { browserFileUrl, saveBrowserText } from '../../store/browser';
import type { WsFile } from './workspaceData';

export interface LocateRequest {
  heading: string;
  /** 每次请求换一个值，同一处可以反复定位 */
  nonce: number;
}

const draftKey = (id: string) => `vein.draft.${id}`;
const DEMO_BASE = '/demo/linear-algebra';

const isMarkdown = (file: WsFile) => file.kind === 'lecture' || (file.kind === 'source' && file.lang === 'markdown');

/** 收集文档里全部图片的相对路径（主栏与 callout 内都要）。 */
function imageSrcs(source: string): string[] {
  const doc = parseNote(source);
  const out = new Set<string>();
  const walk = (n: Nodes) => {
    if (n.type === 'image' && !/^[a-z][a-z0-9+.-]*:/i.test(n.url)) out.add(n.url);
    if ('children' in n) for (const c of n.children) walk(c as Nodes);
  };
  for (const b of doc.blocks) {
    if (b.type === 'prose') b.nodes.forEach(walk);
    if (b.type === 'callout') b.body.forEach(walk);
  }
  return [...out];
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
 * Markdown 阅读视图（R1b / T1-2）：示例讲义与本地 md 都走 T1-1 解析器 + NoteReader。
 * 示例讲义带资源抽屉（manifest）；本地 md 的相对图片先解析成 blob 地址再渲染。
 */
function NoteView({ file, url, locate }: { file: WsFile; url: string; locate: LocateRequest | null }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState(false);
  const [assets, setAssets] = useState<Map<string, string>>(new Map());
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    setText(null);
    setError(null);
    setAssets(new Map());
    const saved = file.local || file.browser ? null : localStorage.getItem(draftKey(`${file.id}.md`));
    setDraft(saved !== null);
    const load = saved !== null ? Promise.resolve(saved) : fetch(url).then((r) => {
      if (!r.ok) throw new Error(`读取失败（HTTP ${r.status}）`);
      return r.text();
    });
    load
      .then(async (t) => {
        if (!alive) return t;
        if (file.local && file.path) {
          const prefix = file.id.slice(0, file.id.length - file.path.length);
          const dir = file.path.split('/').slice(0, -1).join('/');
          const map = new Map<string, string>();
          await Promise.all(
            imageSrcs(t).map(async (src) => {
              const handleId = `${prefix}${normalize(`${dir}/${src}`)}`;
              try {
                map.set(normalize(src), await localFileUrl(handleId));
              } catch {
                // 图片句柄不存在时保留原路径，阅读器照常渲染其余内容
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
  }, [file, url, nonce]);

  const assetUrl = useMemo(() => {
    if (file.local) return (src: string) => assets.get(normalize(src)) ?? src;
    if (file.browser) return (src: string) => src;
    return (src: string) => encodeURI(`${DEMO_BASE}/notes/${src}`);
  }, [file.local, file.browser, assets]);

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
      <NoteReader source={text} manifest={file.local || file.browser ? undefined : demoManifest} resourceBase={DEMO_BASE} assetUrl={assetUrl} />
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
  onStatus,
}: {
  file: WsFile;
  view: 'read' | 'source';
  locate: LocateRequest | null;
  editing: boolean;
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
    // 编辑在 Markdown 源文件上进行（渲染态的结构化编辑属 PRODUCT_SPEC §3.7，另排）
    if (editing || view === 'source') {
      const sourceFile = file.kind === 'lecture' ? { ...file, id: `${file.id}.md` } : file;
      const sourceUrl = file.kind === 'lecture' ? file.sourceUrl! : url;
      return <SourceView file={sourceFile} url={sourceUrl} editing={editing} onStatus={onStatus} onSaved={() => setNonce((n) => n + 1)} />;
    }
    return <NoteView file={file} url={file.kind === 'lecture' ? file.sourceUrl! : url} locate={locate} />;
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
