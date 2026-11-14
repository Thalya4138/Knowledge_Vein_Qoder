# content/ · 讲义解析（T1-1）

把一篇讲义 Markdown 变成阅读器、检索、锚点跳转共用的结构。**这里不画界面**，界面是 T1-2。

```text
parseNote(md)            → NoteDocument   结构：块 / 栏目 / 锚点 / 旁栏对齐 / 版式行 / wiki link / 行号 / 诊断
renderNodes(nodes, opts) → hast           某一块的内容：KaTeX、GFM 表格、白名单过滤后的原生 HTML
```

两层分开的原因：栏目框长什么样（标题、折叠、旁栏位置）由 React 组件按 `CalloutBlock` 的字段决定；
`renderNodes` 只负责框里面的 Markdown。这样白名单过滤只针对正文内容，不会误伤我们自己的版式类名。

## 阅读器怎么用（T1-2）

```ts
const doc = parseNote(source);
for (const row of doc.rows) {            // 一行 = 样张里的一个 <div class="row">
  row.main.map((id) => doc.blockById.get(id));   // 主栏，按源码顺序
  row.side.map((id) => doc.blockById.get(id));   // 与本行对齐的旁栏块
}
```

- 块的种类：`prose`（`nodes` → `renderNodes`）、`heading`（`slug` 作锚点）、`callout`（`kind` / `fold` / `title` / `body` / `spanId`）。
- `[!res]` 只给 `spanId`，卡片内容从 `resources/manifest.json` 读（NOTE_GENERATION §3.5）。
- 窄屏：旁栏块按 `alignTo` 插到对应主栏块之后即可。
- hast 转 React 用 `hast-util-to-jsx-runtime`（T1-2 引入）；KaTeX 的 CSS 由 T1-2 引入 `katex/dist/katex.min.css`。
- `renderNodes(nodes, { wikiHref, assetUrl })`：wiki link 落地地址、图片相对路径改写都由调用方提供。
- 包体：本模块单独打包 **801 kB min / 195 kB gzip**（KaTeX、micromark、parse5 是大头），
  必须随阅读器路由懒加载（ADR-0002 预算：单路由块 gzip ≤ 300 kB）。

## 规则（与规格的对应）

| 规则 | 出处 | 测试 |
| --- | --- | --- |
| callout 白名单 = `verify-content.mjs` 的 `BLOCKS` | NOTE_GENERATION §4 / §3.5 | `demoNote.test.ts` 防漂移 |
| `^锚` 摘下且不出现在渲染结果里；独占一行的 `^锚` 标注前一块 | §3.5、Obsidian | 同上 |
| 旁栏对齐：`@锚` 优先；否则同小节前一段；否则同小节后一段 | §3.5 + 样张（"本节聚焦"与 `^p-intro` 同行） | `demoNote` / `edgeCases` |
| 带 `@` 的图进旁栏，表与其余栏目在主栏 | §3.5 表格"位置"列 + 样张 | `demoNote` |
| 独占一段的单行 `$$…$$` 是独立公式 | Obsidian 行为（remark-math 默认不认） | 样张 9 个独立公式，逐一对数 |
| 原生 HTML 过白名单；`<details>` 跨节点收成一块 | ADR-0002 §2 | `edgeCases` |

## 诊断（不抛异常，交给界面显示）

`unknown-callout`（内容保留）· `dangling-align`（按就近规则兜底）· `duplicate-anchor` · `res-missing-span` ·
`side-unaligned` · `frontmatter-unsupported` · `math-render`（坏公式降级为红字，其余照常）。

## 已知限制

- frontmatter 只支持一层 `key: value`；嵌套与列表会被跳过并报 warning。
- `^锚` 只识别顶层段落与独占一行的写法；列表项、callout 内部的锚暂不识别（demo 未用到）。
- 引用式链接（`[文字][ref]` + 文末定义）按块分开渲染时找不到定义；讲义规范不使用这种写法。
- wiki link 的行号取所在文本节点的起始行，不精确到列；`![[嵌入]]` 不支持。
- 表格单元格里的 `[[目标|别名]]` 会和 GFM 的列分隔符冲突，需写成 `\|`（与 Obsidian 相同）。
- `verify-content.mjs` 仍用自己的正则；两边由防漂移测试对齐，尚未改为直接调用本模块。
