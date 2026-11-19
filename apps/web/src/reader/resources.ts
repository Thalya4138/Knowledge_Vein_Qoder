/**
 * resources/manifest.json 的 span → 抽屉显示模型。
 * 抽屉里出现的每一个字都从 manifest 读，组件不写死任何资源内容（QUALITY_GATES §2.5）。
 */

export interface ManifestResource {
  id: string;
  kind: string;
  title: string;
  author?: string;
  license?: string;
  uri?: string | null;
  localPath?: string;
  videoId?: string;
}

export interface ManifestSpan {
  id: string;
  resourceId: string;
  locator: { type: string; value: string; end?: string };
  quote: string;
  why?: string;
}

export interface Manifest {
  resources: ManifestResource[];
  spans: ManifestSpan[];
}

export interface QuotePart {
  ts?: string;
  text: string;
  mark?: boolean;
}

export interface DrawerAction {
  label: string;
  href: string;
  primary?: boolean;
}

export interface DrawerModel {
  spanId: string;
  kind: string;
  kindLabel: string;
  title: string;
  meta: string;
  loc: string;
  unavailable: boolean;
  quote: QuotePart[];
  why?: string;
  actions: DrawerAction[];
  /** PDF 才有：抽屉内嵌预览，定位到对应页。视频永不内嵌（ADR-0007）。 */
  pdfPreview?: string;
}

const KIND_LABEL: Record<string, string> = {
  video: '视频',
  'video-course': '视频课程',
  pdf: 'PDF',
  web: '网页',
  note: '讲义',
};

const toSeconds = (t: string): number => {
  const parts = t.split(':').map(Number);
  return parts.reduce((s, n) => s * 60 + (Number.isFinite(n) ? n : 0), 0);
};

/** 把引文切成带时间戳的逐句片段；定位起点那一句话高亮（样张的关键句高亮）。 */
function timedQuote(quote: string, start: string): QuotePart[] {
  const parts = quote.split(/\[(\d+:\d{2})\]/);
  const out: QuotePart[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const ts = parts[i]!;
    out.push({ ts, text: (parts[i + 1] ?? '').trim(), mark: ts === start });
  }
  return out.length ? out : [{ text: quote }];
}

/** 网页：文本片段锚指向的那句话高亮。 */
function webQuote(quote: string, fragmentUrl: string): QuotePart[] {
  const raw = fragmentUrl.split(':~:text=')[1];
  if (!raw) return [{ text: quote }];
  const needle = decodeURIComponent(raw);
  const at = quote.indexOf(needle);
  if (at < 0) return [{ text: quote }];
  return [
    { text: quote.slice(0, at) },
    { text: needle, mark: true },
    { text: quote.slice(at + needle.length) },
  ].filter((p) => p.text);
}

/** PDF：结论句（最后一句）高亮，与样张一致。 */
function pdfQuote(quote: string): QuotePart[] {
  let lastStart = 0;
  for (const s of quote.matchAll(/[.!?](?:\s+|$)/g)) {
    const idx = (s.index ?? 0) + s[0].length;
    if (idx < quote.length) lastStart = idx;
  }
  return [
    { text: quote.slice(0, lastStart).trim() },
    { text: quote.slice(lastStart).trim(), mark: true },
  ].filter((p) => p.text);
}

export function buildDrawerModel(
  spanId: string,
  manifest: Manifest,
  resourceBase?: string,
): DrawerModel | undefined {
  const span = manifest.spans.find((s) => s.id === spanId);
  const res = span && manifest.resources.find((r) => r.id === span.resourceId);
  if (!span || !res) return undefined;

  const loc = span.locator;
  const unavailable = loc.type === 'unavailable';
  const actions: DrawerAction[] = [];
  let pdfPreview: string | undefined;
  let locText = loc.value;
  let quote: QuotePart[];

  switch (loc.type) {
    case 'time': {
      locText = `${loc.value}${loc.end ? ` – ${loc.end}` : ''}`;
      quote = timedQuote(span.quote, loc.value);
      const yt = res.videoId?.replace(/^youtube:/, '');
      if (yt) {
        actions.push({
          label: `从 ${loc.value} 开始播放`,
          href: `https://www.youtube.com/watch?v=${yt}&t=${toSeconds(loc.value)}s`,
          primary: true,
        });
      }
      if (res.uri) actions.push({ label: '课程页（字幕下载）', href: res.uri });
      break;
    }
    case 'page': {
      locText = `第 ${loc.value} 页`;
      quote = pdfQuote(span.quote);
      const local = res.localPath && resourceBase ? `${resourceBase}/${res.localPath}` : undefined;
      if (local) {
        pdfPreview = `${local}#page=${loc.value}&view=FitH`;
        actions.push({ label: `打开第 ${loc.value} 页`, href: `${local}#page=${loc.value}`, primary: true });
        if (res.uri) actions.push({ label: '在线原文（同页）', href: `${res.uri}#page=${loc.value}` });
      } else if (res.uri) {
        actions.push({ label: `打开第 ${loc.value} 页`, href: `${res.uri}#page=${loc.value}`, primary: true });
      }
      break;
    }
    case 'text-fragment': {
      locText = `“…${decodeURIComponent(loc.value.split(':~:text=')[1] ?? loc.value)}…”`;
      quote = webQuote(span.quote, loc.value);
      const href = loc.value.startsWith('http') ? loc.value : res.uri;
      if (href) actions.push({ label: '打开并高亮这句话', href, primary: true });
      break;
    }
    case 'section': {
      locText = loc.value.includes('#') ? `讲义 §${loc.value.split('#')[1]}` : loc.value;
      quote = [{ text: span.quote }];
      break;
    }
    default: {
      locText = unavailable ? '位置待核对' : loc.value;
      quote = [{ text: span.quote }];
    }
  }

  return {
    spanId,
    kind: res.kind,
    kindLabel: KIND_LABEL[res.kind] ?? res.kind,
    title: res.title,
    meta: [res.author, res.license].filter(Boolean).join(' · '),
    loc: locText,
    unavailable,
    quote,
    ...(span.why ? { why: span.why } : {}),
    // 定位不可用时不得退化成只到资源主页的链接（UX §3）
    actions: unavailable ? [] : actions,
    ...(pdfPreview && !unavailable ? { pdfPreview } : {}),
  };
}

/** 旁栏资源卡上的一行定位（短形式）。 */
export function cardLoc(model: DrawerModel): string {
  return model.unavailable ? '位置待核对' : model.loc;
}
