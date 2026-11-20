/**
 * 轻量代码着色（不引入依赖）：只分五类——注释、字符串、数字、关键字、函数名。
 * 够读，不求和 VS Code 一样精细。按语言家族选注释写法与关键字表；不认识的语言只着色字符串和数字。
 * 作为 rehype 插件放在 sanitize 之后：它产出的 class 是我们自己的，不经白名单。
 */
import type { Element, ElementContent, Root, Text } from 'hast';

interface Lang {
  line?: string[];
  block?: [string, string][];
  kw: Set<string>;
}

const words = (s: string) => new Set(s.split(/\s+/).filter(Boolean));

const C_LIKE = words(`
  if else for while do switch case default break continue return goto try catch finally throw throws new delete
  class struct enum union interface extends implements public private protected static const final virtual override
  void int long short char float double bool boolean unsigned signed auto var let function async await yield import
  export from as package namespace using template typename typeof instanceof in of true false null nullptr undefined this
  super sizeof include define`);
const PY = words(`
  False None True and as assert async await break class continue def del elif else except finally for from global if
  import in is lambda nonlocal not or pass raise return try while with yield print self`);
const SH = words(`if then else elif fi for while do done case esac in function return export local echo cd sudo`);
const MATLAB = words(`function end if elseif else for while switch case otherwise break continue return global persistent try catch`);
const SQL = words(`select from where and or not insert into values update set delete create table drop alter join left right inner outer on group by order having limit as distinct null is`);

const LANGS: Record<string, Lang> = {};
const reg = (names: string, l: Lang) => names.split(' ').forEach((n) => (LANGS[n] = l));
reg('js javascript ts typescript jsx tsx c cpp c++ h hpp java cs csharp go rust rs kotlin swift dart php scala', {
  line: ['//'],
  block: [['/*', '*/']],
  kw: C_LIKE,
});
reg('py python', { line: ['#'], kw: PY });
reg('sh bash shell zsh powershell ps1 ps', { line: ['#'], kw: SH });
reg('matlab m octave', { line: ['%'], kw: MATLAB });
reg('sql', { line: ['--'], kw: SQL });
reg('r', { line: ['#'], kw: words('if else for while function return TRUE FALSE NULL in next break library') });
reg('tex latex', { line: ['%'], kw: new Set() });
reg('json yaml yml toml', { line: ['#'], kw: words('true false null') });

type Tok = [cls: string | null, text: string];

export function tokenize(code: string, lang: string): Tok[] {
  const l: Lang = LANGS[lang.toLowerCase()] ?? { kw: new Set() };
  const out: Tok[] = [];
  let i = 0;
  let plain = '';
  const flush = () => {
    if (plain) out.push([null, plain]);
    plain = '';
  };
  while (i < code.length) {
    const rest = code.slice(i);
    const lc = l.line?.find((p) => rest.startsWith(p));
    if (lc) {
      const end = code.indexOf('\n', i);
      flush();
      out.push(['hl-com', code.slice(i, end < 0 ? code.length : end)]);
      i = end < 0 ? code.length : end;
      continue;
    }
    const bc = l.block?.find(([a]) => rest.startsWith(a));
    if (bc) {
      const end = code.indexOf(bc[1], i + bc[0].length);
      const stop = end < 0 ? code.length : end + bc[1].length;
      flush();
      out.push(['hl-com', code.slice(i, stop)]);
      i = stop;
      continue;
    }
    const ch = code[i]!;
    if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1;
      while (j < code.length && code[j] !== ch && code[j] !== '\n') j += code[j] === '\\' ? 2 : 1;
      const stop = Math.min(j + 1, code.length);
      flush();
      out.push(['hl-str', code.slice(i, stop)]);
      i = stop;
      continue;
    }
    const num = /^\d[\d_]*(\.\d+)?([eE][+-]?\d+)?/.exec(rest);
    if (num && !/[\w$]/.test(code[i - 1] ?? '')) {
      flush();
      out.push(['hl-num', num[0]]);
      i += num[0].length;
      continue;
    }
    const word = /^[A-Za-z_$][\w$]*/.exec(rest);
    if (word) {
      const w = word[0];
      const next = code.slice(i + w.length).match(/^\s*\(/);
      if (l.kw.has(w)) {
        flush();
        out.push(['hl-kw', w]);
      } else if (next) {
        flush();
        out.push(['hl-fn', w]);
      } else plain += w;
      i += w.length;
      continue;
    }
    plain += ch;
    i += 1;
  }
  flush();
  return out;
}

const textOf = (n: ElementContent): string => (n.type === 'text' ? n.value : 'children' in n ? n.children.map(textOf).join('') : '');

/** rehype 插件：给 <pre><code class="language-x"> 着色，并在 <pre> 上标出语言名。 */
export function rehypeLiteHighlight() {
  return (tree: Root) => {
    const visit = (n: Root | Element) => {
      for (const c of n.children) {
        if (c.type !== 'element') continue;
        if (c.tagName === 'pre') {
          const code = c.children.find((x): x is Element => x.type === 'element' && x.tagName === 'code');
          if (code) {
            const cls = ([] as unknown[]).concat(code.properties?.className ?? []).map(String);
            const lang = cls.find((x) => x.startsWith('language-'))?.slice(9) ?? '';
            const src = code.children.map(textOf).join('');
            code.children = tokenize(src, lang).map(([k, t]): Element | Text =>
              k ? { type: 'element', tagName: 'span', properties: { className: [k] }, children: [{ type: 'text', value: t }] } : { type: 'text', value: t },
            );
            c.properties = { ...c.properties, className: ['nr-code'], dataLang: lang || undefined };
          }
          continue;
        }
        visit(c);
      }
    };
    visit(tree);
  };
}
