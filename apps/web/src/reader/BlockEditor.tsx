import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * 块级编辑器：点讲义里的一段，只有这一段变成可编辑的 Markdown，其余照常渲染（Typora / Obsidian 实时预览的做法）。
 * 工具栏改的是 Markdown 本身，所以导出到 Obsidian 不会走样；离开这一段（点别处、Esc、Ctrl+Enter）即保存。
 */

type Wrap = { kind: 'wrap'; before: string; after: string };
type Line = { kind: 'line'; apply: (line: string) => string };

interface Tool {
  label: string;
  title: string;
  key?: string;
  op: Wrap | Line;
  cls?: string;
}

const HEADING = (line: string) => {
  const m = /^(#{1,6})\s+/.exec(line);
  const level = m ? m[1]!.length : 0;
  const body = line.replace(/^#{1,6}\s+/, '');
  return level >= 3 ? body : `${'#'.repeat(level + 1)} ${body}`;
};
const toggle = (prefix: string, re: RegExp) => (line: string) => (re.test(line) ? line.replace(re, '') : `${prefix}${line}`);

/** 字色：白纸上读得清楚的几种，名字按国画颜料叫 */
const COLORS: [string, string][] = [
  ['朱红', '#c0392b'],
  ['赭橙', '#c4621a'],
  ['藤黄', '#a37a00'],
  ['石绿', '#1e7f4f'],
  ['花青', '#2463a8'],
  ['青莲', '#7d3c98'],
  ['淡墨', '#7f8890'],
];
const OPEN_RE = /<span style="color:\s*#[0-9a-fA-F]{3,8};?">$/;
const CLOSE = '</span>';

const TOOLS: Tool[] = [
  { label: 'B', title: '加粗（Ctrl+B）', key: 'b', op: { kind: 'wrap', before: '**', after: '**' }, cls: 'be-b' },
  { label: 'I', title: '斜体（Ctrl+I）', key: 'i', op: { kind: 'wrap', before: '*', after: '*' }, cls: 'be-i' },
  { label: 'S', title: '删除线（Ctrl+Shift+S）', op: { kind: 'wrap', before: '~~', after: '~~' }, cls: 'be-s' },
  { label: '荧光', title: '荧光笔 ==…==（Ctrl+Shift+H）', op: { kind: 'wrap', before: '==', after: '==' }, cls: 'be-mark' },
  { label: '代码', title: '行内代码（Ctrl+E）', key: 'e', op: { kind: 'wrap', before: '`', after: '`' } },
  { label: '公式', title: '行内公式 $…$（Ctrl+M）', key: 'm', op: { kind: 'wrap', before: '$', after: '$' } },
  { label: '双链', title: '双向链接 [[…]]', op: { kind: 'wrap', before: '[[', after: ']]' } },
  { label: '链接', title: '链接（Ctrl+K）', key: 'k', op: { kind: 'wrap', before: '[', after: '](https://)' } },
  { label: '标题', title: '标题级别：正文 → 一级 → 二级 → 三级 → 正文', op: { kind: 'line', apply: HEADING } },
  { label: '列表', title: '无序列表', op: { kind: 'line', apply: toggle('- ', /^- /) } },
  { label: '引用', title: '引用', op: { kind: 'line', apply: toggle('> ', /^> /) } },
];

export function BlockEditor({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial);
  const [palette, setPalette] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const done = useRef(false);

  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [text]);

  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const commit = () => {
    if (done.current) return;
    done.current = true;
    onCommit(text);
  };

  const apply = (op: Wrap | Line) => {
    const el = ta.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b, value } = el;
    let next: string;
    let sel: [number, number];
    if (op.kind === 'wrap') {
      const inner = value.slice(a, b);
      const wrapped = value.slice(a - op.before.length, a) === op.before && value.slice(b, b + op.after.length) === op.after;
      if (wrapped) {
        next = value.slice(0, a - op.before.length) + inner + value.slice(b + op.after.length);
        sel = [a - op.before.length, b - op.before.length];
      } else {
        next = value.slice(0, a) + op.before + inner + op.after + value.slice(b);
        sel = [a + op.before.length, b + op.before.length];
      }
    } else {
      const ls = value.lastIndexOf('\n', a - 1) + 1;
      const le = value.indexOf('\n', b);
      const end = le < 0 ? value.length : le;
      const changed = value.slice(ls, end).split('\n').map(op.apply).join('\n');
      next = value.slice(0, ls) + changed + value.slice(end);
      sel = [ls, ls + changed.length];
    }
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(sel[0], sel[1]);
    });
  };

  /** 给选中的文字上色；已经包着字色的就换色；color 为 null 时清除 */
  const paint = (color: string | null) => {
    const el = ta.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b, value } = el;
    const open = OPEN_RE.exec(value.slice(Math.max(0, a - 40), a));
    const wrapped = open && value.slice(b, b + CLOSE.length) === CLOSE;
    const inner = value.slice(a, b);
    let next: string;
    let sel: [number, number];
    if (wrapped) {
      const from = a - open[0].length;
      const tag = color ? `<span style="color:${color}">` : '';
      next = value.slice(0, from) + tag + inner + (color ? CLOSE : '') + value.slice(b + CLOSE.length);
      sel = [from + tag.length, from + tag.length + inner.length];
    } else {
      if (!color) return;
      const tag = `<span style="color:${color}">`;
      next = value.slice(0, a) + tag + inner + CLOSE + value.slice(b);
      sel = [a + tag.length, b + tag.length];
    }
    setText(next);
    setPalette(false);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(sel[0], sel[1]);
    });
  };

  return (
    <div
      className="nr-editor"
      ref={box}
      onBlur={(e) => {
        // 焦点还在编辑器里（点工具栏）不算离开
        if (!box.current?.contains(e.relatedTarget as Node | null)) commit();
      }}
    >
      <div className="be-bar" role="toolbar" aria-label="格式">
        {TOOLS.map((t) => (
          <button
            key={t.label}
            type="button"
            className={t.cls ? `be-btn ${t.cls}` : 'be-btn'}
            title={t.title}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => apply(t.op)}
          >
            {t.label}
          </button>
        ))}
        <span className="be-color-wrap">
          <button
            type="button"
            className="be-btn be-color"
            title="字体颜色（写成 <span style=&quot;color:…&quot;>，Obsidian 也能显示）"
            aria-expanded={palette}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setPalette((v) => !v)}
          >
            字色
          </button>
          {palette && (
            <span className="be-palette" role="menu" aria-label="字体颜色">
              {COLORS.map(([name, hex]) => (
                <button
                  key={hex}
                  type="button"
                  role="menuitem"
                  className="be-swatch"
                  title={name}
                  aria-label={name}
                  style={{ background: hex }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => paint(hex)}
                />
              ))}
              <button type="button" role="menuitem" className="be-btn be-clear" onMouseDown={(e) => e.preventDefault()} onClick={() => paint(null)}>
                清除
              </button>
            </span>
          )}
        </span>
        <span className="be-end">
        <button type="button" className="be-btn" title="放弃这一段的改动（不保存）" onMouseDown={(e) => e.preventDefault()} onClick={() => { done.current = true; onCancel(); }}>
          取消
        </button>
        <button type="button" className="be-btn be-done" title="完成（Esc 或 Ctrl+Enter）" onMouseDown={(e) => e.preventDefault()} onClick={commit}>
          完成
        </button>
        </span>
      </div>
      <textarea
        ref={ta}
        value={text}
        spellCheck={false}
        aria-label="编辑这一段的 Markdown"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          const mod = e.ctrlKey || e.metaKey;
          if (e.key === 'Escape' || (mod && e.key === 'Enter')) {
            e.preventDefault();
            commit();
            return;
          }
          if (!mod) return;
          const k = e.key.toLowerCase();
          if (e.shiftKey && k === 'h') {
            e.preventDefault();
            apply(TOOLS[3]!.op);
          } else if (e.shiftKey && k === 's') {
            e.preventDefault();
            apply(TOOLS[2]!.op);
          } else {
            const t = TOOLS.find((x) => x.key === k && !e.shiftKey);
            if (t) {
              e.preventDefault();
              apply(t.op);
            }
          }
        }}
      />
      <p className="be-hint">改的是这一段的 Markdown；点别处、按 Esc 即保存。空着保存会删掉这一段。</p>
    </div>
  );
}
