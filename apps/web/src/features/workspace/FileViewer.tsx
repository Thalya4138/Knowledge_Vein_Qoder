import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../ui/Icon';
import { localFileUrl, saveLocalText } from './localFolder';
import type { WsFile } from './workspaceData';

export interface LocateRequest {
  heading: string;
  /** 每次请求换一个值，同一处可以反复定位 */
  nonce: number;
}

const HIGHLIGHT_MS = 2400;
const draftKey = (id: string) => `vein.draft.${id}`;

/** 讲义样张自带一条工具栏；在工作台里由工作台的工具栏取代，嵌入时隐藏（同源页面，不改样张本身）。 */
function embedClean(doc: Document) {
  if (doc.getElementById('vein-embed')) return;
  const style = doc.createElement('style');
  style.id = 'vein-embed';
  style.textContent = `body > .toolbar { display: none; } body { padding-bottom: 120px; }
    html.vein-editing .sheet { outline: 2px dashed rgb(36 86 211 / 0.35); outline-offset: 6px; caret-color: #2456d3; }`;
  doc.head.appendChild(style);
}

/** 在同源的讲义页面里按标题文字定位，滚到上部并短暂高亮，然后高亮自己消失。 */
function locateIn(doc: Document, heading: string): boolean {
  const target = [...doc.querySelectorAll<HTMLElement>('h1, h2, h3, h4')].find(
    (el) => el.textContent?.trim() === heading || el.textContent?.includes(heading),
  );
  if (!target) return false;
  const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  target.style.scrollMarginTop = '96px';
  target.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' });
  const prev = target.getAttribute('style') ?? '';
  target.setAttribute(
    'style',
    `${prev};background-color:rgb(255 214 102 / 0.55);border-radius:4px;box-shadow:0 0 0 6px rgb(255 214 102 / 0.55);transition:background-color 600ms,box-shadow 600ms;`,
  );
  window.setTimeout(() => {
    target.style.backgroundColor = 'transparent';
    target.style.boxShadow = '0 0 0 6px transparent';
    window.setTimeout(() => target.setAttribute('style', prev), 700);
  }, HIGHLIGHT_MS);
  return true;
}

/** 把本机草稿放回讲义的每一页，并重新接上旁栏资源卡的点击（样张的 open() 是页面的全局函数）。 */
function restoreDraft(frame: HTMLIFrameElement, html: string[]) {
  const doc = frame.contentDocument!;
  const sheets = [...doc.querySelectorAll<HTMLElement>('.sheet')];
  sheets.forEach((s, i) => {
    if (html[i] !== undefined) s.innerHTML = html[i]!;
  });
  const win = frame.contentWindow as (Window & { open?: (id: string) => void }) | null;
  doc.querySelectorAll<HTMLAnchorElement>('a.res').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      win?.open?.(a.dataset.res ?? '');
    }),
  );
}

const FORMAT: { cmd: string; arg?: string; label: string; key: string }[] = [
  { cmd: 'bold', label: '加粗', key: 'B' },
  { cmd: 'italic', label: '斜体', key: 'I' },
  { cmd: 'hiliteColor', arg: '#ffe08a', label: '高亮', key: 'H' },
  { cmd: 'strikeThrough', label: '删除线', key: 'S' },
  { cmd: 'undo', label: '撤销', key: 'Z' },
  { cmd: 'redo', label: '重做', key: 'Y' },
];

function LectureFrame({
  file,
  locate,
  editing,
  onStatus,
}: {
  file: WsFile;
  locate: LocateRequest | null;
  editing: boolean;
  onStatus: (s: string | null) => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [hasDraft, setHasDraft] = useState(() => localStorage.getItem(draftKey(file.id)) !== null);

  useEffect(() => setLoaded(false), [file.id]);

  useEffect(() => {
    if (!locate || !loaded || !frameRef.current?.contentDocument) return;
    locateIn(frameRef.current.contentDocument, locate.heading);
  }, [locate, loaded]);

  // 编辑：直接在排好版的讲义上改（designMode），像文字处理软件一样
  useEffect(() => {
    const doc = frameRef.current?.contentDocument;
    if (!loaded || !doc) return;
    doc.designMode = editing ? 'on' : 'off';
    doc.documentElement.classList.toggle('vein-editing', editing);
    if (editing) doc.execCommand('styleWithCSS', false, 'true');
  }, [editing, loaded]);

  const run = (cmd: string, arg?: string) => {
    const doc = frameRef.current?.contentDocument;
    if (!doc) return;
    doc.execCommand(cmd, false, arg);
    frameRef.current?.contentWindow?.focus();
  };

  const save = () => {
    const doc = frameRef.current?.contentDocument;
    if (!doc) return;
    const html = [...doc.querySelectorAll<HTMLElement>('.sheet')].map((s) => s.innerHTML);
    localStorage.setItem(draftKey(file.id), JSON.stringify(html));
    setHasDraft(true);
    onStatus('已保存到这台电脑的浏览器（本机草稿）');
  };

  const discard = () => {
    localStorage.removeItem(draftKey(file.id));
    setHasDraft(false);
    onStatus('已恢复原稿');
    frameRef.current?.contentWindow?.location.reload();
  };

  return (
    <div className="lecture">
      {editing && (
        <div className="format-bar" role="toolbar" aria-label="格式">
          {FORMAT.map((f) => (
            <button key={f.cmd} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => run(f.cmd, f.arg)} title={`${f.label}（Ctrl+${f.key}）`}>
              {f.label}
            </button>
          ))}
          <span className="format-sep" aria-hidden="true" />
          <button type="button" className="strong" onClick={save}>
            <Icon name="save" />
            保存
          </button>
        </div>
      )}
      {hasDraft && !editing && (
        <p className="draft-note">
          正在看你的本机草稿。
          <button type="button" onClick={discard}>
            恢复原稿
          </button>
        </p>
      )}
      <iframe
        ref={frameRef}
        key={file.id}
        className="frame"
        src={file.url}
        title={file.name}
        onLoad={() => {
          const frame = frameRef.current;
          if (!frame?.contentDocument) return;
          embedClean(frame.contentDocument);
          const raw = localStorage.getItem(draftKey(file.id));
          if (raw) restoreDraft(frame, JSON.parse(raw) as string[]);
          setLoaded(true);
        }}
      />
    </div>
  );
}

function SourceView({
  file,
  url,
  editing,
  onStatus,
}: {
  file: WsFile;
  url: string;
  editing: boolean;
  onStatus: (s: string | null) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const local = Boolean(file.local);

  useEffect(() => {
    let alive = true;
    setText(null);
    setError(null);
    const saved = local ? null : localStorage.getItem(draftKey(file.id));
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
        const shown = file.lang === 'json' && !local ? JSON.stringify(JSON.parse(t), null, 2) : t;
        setText(shown);
        setDraft(shown);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [url, file.id, file.lang, local]);

  if (error) return <p className="viewer-state">{error}</p>;
  if (text === null) return <p className="viewer-state">正在读取…</p>;

  if (editing) {
    const save = async () => {
      try {
        if (local) {
          await saveLocalText(file.id, draft);
          onStatus(`已存回你的文件夹：${file.path}`);
        } else {
          localStorage.setItem(draftKey(file.id), draft);
          onStatus('示例文件只读，已保存为这台电脑的本机草稿');
        }
        setText(draft);
      } catch (e) {
        onStatus(`没有保存：${(e as Error).message}`);
      }
    };
    return (
      <div className="source-edit">
        <div className="format-bar" role="toolbar" aria-label="源文件">
          <span className="format-hint">{local ? '改动会直接写回你的文件' : '示例文件只读，改动保存为本机草稿'}</span>
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
  const [url, setUrl] = useState<string | null>(file.local ? null : file.url);
  const [error, setError] = useState<string | null>(null);

  // 本地文件按需生成临时地址，换文件时回收
  useEffect(() => {
    if (!file.local) {
      setUrl(file.url);
      return;
    }
    let made: string | null = null;
    let alive = true;
    setUrl(null);
    setError(null);
    localFileUrl(file.id)
      .then((u) => {
        made = u;
        if (alive) setUrl(u);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [file.id, file.local, file.url]);

  if (error) return <p className="viewer-state">{error}</p>;
  if (!url) return <p className="viewer-state">正在打开…</p>;

  if (file.kind === 'lecture' && view === 'source' && file.sourceUrl) {
    return <SourceView file={{ ...file, id: `${file.id}.md` }} url={file.sourceUrl} editing={editing} onStatus={onStatus} />;
  }
  if (file.kind === 'lecture') return <LectureFrame file={{ ...file, url }} locate={locate} editing={editing} onStatus={onStatus} />;
  if (file.kind === 'source') return <SourceView file={file} url={url} editing={editing} onStatus={onStatus} />;
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
