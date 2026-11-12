#!/usr/bin/env node
/**
 * 样例数据校验。CI 与本地 `npm run verify:content` 都跑这个。
 *
 * 它检查的不只是 JSON 语法合法，而是本产品的核心不变量：
 *   1. 每条关系都有 explanation / assumptions / epistemic（schema 层面）
 *   2. 关系的 from/to 指向真实存在的节点（引用完整性）
 *   3. relationGroup 的前提与结论节点存在
 *   4. 讲义中的 [[wiki link]] 都能落到一个节点（防止讲义与图谱脱节）
 *   5. 讲义里引用的 chapters 文件真实存在（status=planned 的章节可以没有讲义）
 *   6. 教材版式：资源卡 [!res] 指向真实 span 且带 why；旁栏 @锚点 真实存在；图片文件存在
 *   7. 图谱的 noteAnchor / sourceSpanIds / evidenceIds 都能落地
 *
 * 用法：node scripts/verify-content.mjs
 */
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), 'content/demo');
const EPISTEMIC = new Set([
  'source-backed', 'logically-derived', 'pedagogical-inference',
  'analogy', 'hypothesis', 'user-personal',
]);
// 讲义语义块白名单（与 prompts/NOTE_GENERATION.md §4 保持一致，改这里必须同步改那里）
// 语义块白名单（Obsidian callout 类型）。按「内容功能」命名，不按技术文档命名。
// 与 prompts/NOTE_GENERATION.md §4 保持一致，改这里必须同步改那里。
const BLOCKS = new Set([
  'material',   // 材料：原文/引文/资源摘录（带出处）
  'note',       // 注：术语、读音、符号约定（小字侧栏）
  'aside',      // 补充：延伸解释（正文大小，竖向侧栏）
  'link',       // 关联便签：与另一处知识的联系（可展开的对话框样式）
  'method',     // 方法：可复用的步骤（适用/步骤/注意）
  'trap',       // 易错：最常见的错误与原因
  'exercise',   // 练习：题目，答案折叠
  'viewpoint',  // 看法：存在多种合理解读
  'unsourced',  // 无来源：本段为原创论述，须显式声明
  // ---- 教材栏目（prompts/NOTE_GENERATION.md §3.5；样张见 content/demo/*/rendered/）----
  'problem',    // 问题探讨（节首）
  'focus',      // 本节聚焦（旁栏）
  'side',       // 相关信息（旁栏）
  'ask',        // 旁栏问题
  'xref',       // 知识链接（跨章 / 跨知识库）
  'res',        // 资源卡：> [!res] s.<spanId> @<锚点>
  'figure',     // 图（编号 + 图注）
  'table',      // 表（编号 + 题注）
  'practice',   // 探究·实践
  'discuss',    // 思考·讨论
  'critical',   // 批判性思维
  'training',   // 思维训练（节末）
  'summary',    // 本章小结
]);
// 栏目块不计入"正文块 ≤8"的限制（R12 只管正文流里的语义块）
const COLUMN_BLOCKS = new Set(['problem', 'focus', 'side', 'ask', 'xref', 'res', 'figure', 'table',
  'practice', 'discuss', 'critical', 'training', 'exercise', 'summary']);
const REQUIRED_COLUMNS = ['problem', 'focus', 'training', 'exercise'];

// 资源三态与覆盖状态（与 schemas/manifest.schema.json 保持一致）
const ORIGINS = new Set(['user-import', 'discovered', 'generated']);
const RES_STATUS = new Set(['used', 'candidate', 'unused', 'rejected']);
const SPAN_LOCATORS = new Set(['page', 'section', 'time', 'range', 'text-fragment', 'unavailable']);

const REL_TYPES = new Set([
  'contains', 'prerequisite', 'defined-by', 'derives-from', 'equivalent-under',
  'generalizes', 'applies-to', 'contrasts-with', 'shared-mechanism',
  'analogy-to', 'counterexample-to',
]);

const errors = [];
const warns = [];
const fail = (m) => errors.push(m);
const warn = (m) => warns.push(m);

async function readJson(p) {
  const raw = await readFile(p, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    fail(`${path.relative(ROOT, p)}: JSON 解析失败 — ${e.message}`);
    return null;
  }
}

async function main() {
  const kbs = (await readdir(ROOT, { withFileTypes: true }))
    .filter((d) => d.isDirectory()).map((d) => d.name);

  if (kbs.length === 0) fail('content/demo 下没有任何知识库');

  for (const kb of kbs) {
    const dir = path.join(ROOT, kb);
    const kbPath = path.join(dir, 'kb.json');
    const graphPath = path.join(dir, 'graph.json');
    if (!existsSync(kbPath)) { fail(`${kb}: 缺 kb.json`); continue; }
    if (!existsSync(graphPath)) { fail(`${kb}: 缺 graph.json`); continue; }

    const course = await readJson(kbPath);
    const graph = await readJson(graphPath);
    if (!course || !graph) continue;

    // ---- 节点 ----
    const nodeIds = new Set();
    for (const n of graph.nodes ?? []) {
      if (nodeIds.has(n.id)) fail(`${kb}: 重复节点 id ${n.id}`);
      nodeIds.add(n.id);
      if (!n.title) fail(`${kb}: 节点 ${n.id} 缺 title`);
      if (!['core', 'supporting', 'extension'].includes(n.importance)) {
        fail(`${kb}: 节点 ${n.id} importance 非法：${n.importance}`);
      }
    }

    // ---- 关系：这是最关键的一条 ----
    const relIds = new Set();
    for (const r of graph.relations ?? []) {
      const tag = `${kb}/${r.id}`;
      if (relIds.has(r.id)) fail(`${tag}: 重复关系 id`);
      relIds.add(r.id);

      if (!REL_TYPES.has(r.type)) fail(`${tag}: 关系类型非法 "${r.type}"`);
      if (!EPISTEMIC.has(r.epistemic)) fail(`${tag}: epistemic 非法 "${r.epistemic}"`);
      if (!r.explanation || r.explanation.trim().length < 12) {
        fail(`${tag}: explanation 为空或过短 —— 不允许无理由的边`);
      }
      if (!Array.isArray(r.assumptions) || r.assumptions.length === 0) {
        fail(`${tag}: assumptions 为空 —— 不允许无条件的结论`);
      }
      if (!nodeIds.has(r.from)) fail(`${tag}: from 指向不存在的节点 ${r.from}`);
      if (!nodeIds.has(r.to)) fail(`${tag}: to 指向不存在的节点 ${r.to}`);
      if ((r.epistemic === 'analogy' || r.epistemic === 'hypothesis')
          && !r.boundaryOrCounterexample) {
        fail(`${tag}: ${r.epistemic} 必须写明 boundaryOrCounterexample`);
      }
      if (r.epistemic === 'source-backed'
          && (!Array.isArray(r.evidenceIds) || r.evidenceIds.length === 0)) {
        fail(`${tag}: 声称 source-backed 却没有 evidenceIds`);
      }
    }

    // ---- 关系组 ----
    for (const g of graph.relationGroups ?? []) {
      for (const id of [...(g.premiseIds ?? []), ...(g.conclusionIds ?? [])]) {
        if (!nodeIds.has(id)) fail(`${kb}/${g.id}: 引用了不存在的节点 ${id}`);
      }
      if (!g.explanation || g.explanation.trim().length < 12) {
        fail(`${kb}/${g.id}: 关系组缺 explanation`);
      }
    }

    // ---- 记忆线索 ----
    for (const c of graph.memoryCues ?? []) {
      for (const id of c.linkedNodeIds ?? []) {
        if (!nodeIds.has(id)) fail(`${kb}/${c.id}: 引用了不存在的节点 ${id}`);
      }
    }

    // ---- 布局引用的节点必须存在 ----
    const layoutDir = path.join(dir, 'layouts');
    if (existsSync(layoutDir)) {
      for (const f of await readdir(layoutDir)) {
        if (!f.endsWith('.json')) continue;
        const layout = await readJson(path.join(layoutDir, f));
        if (!layout) continue;
        for (const id of Object.keys(layout.positions ?? {})) {
          if (!nodeIds.has(id)) fail(`${kb}/layouts/${f}: 引用了不存在的节点 ${id}`);
        }
        for (const layer of layout.layers ?? []) {
          for (const id of layer.nodeIds ?? []) {
            if (!nodeIds.has(id)) fail(`${kb}/layouts/${f}: 层 "${layer.label}" 引用不存在的节点 ${id}`);
          }
        }
      }
    }

    // ---- 先读资源清单里的 span，供讲义与图谱校验 ----
    const mfPrePath = path.join(dir, 'resources', 'manifest.json');
    const mfPre = existsSync(mfPrePath) ? await readJson(mfPrePath) : null;
    const spanById = new Map((mfPre?.spans ?? []).map((s) => [s.id, s]));

    // ---- 图谱落地：noteAnchor / sourceSpanIds / evidenceIds ----
    for (const n of graph.nodes ?? []) {
      if (n.noteAnchor) {
        const file = n.noteAnchor.split('#')[0];
        if (!existsSync(path.join(dir, file))) fail(`${kb}: 节点 ${n.id} 的 noteAnchor 指向不存在的讲义 ${file}`);
      }
      for (const sid of n.sourceSpanIds ?? []) {
        if (!spanById.has(sid)) fail(`${kb}: 节点 ${n.id} 引用不存在的 span ${sid}`);
      }
    }
    for (const r of graph.relations ?? []) {
      for (const sid of r.evidenceIds ?? []) {
        if (!spanById.has(sid)) fail(`${kb}/${r.id}: evidenceIds 引用不存在的 span ${sid}`);
      }
    }

    // ---- 章节文件存在 ----
    for (const ch of course.outline ?? []) {
      if (ch.status === 'planned' && !ch.notePath) continue; // 待写章节：只有图谱节点
      if (!ch.notePath) { fail(`${kb}: 章节 ${ch.id} 状态为 ${ch.status ?? '未标注'} 却没有 notePath`); continue; }
      if (ch.rendered && !existsSync(path.join(dir, ch.rendered))) fail(`${kb}: 章节 ${ch.id} 的 rendered 样张不存在 ${ch.rendered}`);
      const p = path.join(dir, ch.notePath);
      if (!existsSync(p)) { fail(`${kb}: 章节 ${ch.id} 的讲义缺失 ${ch.notePath}`); continue; }

      const md = await readFile(p, 'utf8');
      // wiki link → 必须能在图谱里找到同名节点
      const links = [...md.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)].map((m) => m[1].trim());
      // 可解析目标 = 节点 title ∪ 节点 aliases ∪ 章节 title（指向另一节讲义也是合法的链接）
      const titles = new Map();
      for (const n of graph.nodes ?? []) {
        titles.set(n.title, n.id);
        for (const a of n.aliases ?? []) titles.set(a, n.id);
      }
      for (const ch2 of course.outline ?? []) titles.set(ch2.title, ch2.id);
      for (const l of links) {
        const hit = titles.get(l);
        if (!hit) {
          warn(`${kb}: 讲义 ${ch.notePath} 的 [[${l}]] 在图谱中没有同名节点（建议补节点或改标题）`);
        }
      }

      // 块类型必须在白名单内 —— 防止「caution/warning/tip」这类同义词扩散
      const callouts = [...md.matchAll(/^>\s*\[!([a-zA-Z_-]+)\]/gm)];
      for (const m of callouts) {
        if (!BLOCKS.has(m[1])) {
          fail(`${kb}: ${ch.notePath} 使用了未定义的块类型 "> [!${m[1]}]"（见 prompts/NOTE_GENERATION.md §4）`);
        }
      }
      // 禁止回退到 ::: 语法（Obsidian 不认）
      if (/^:::\s*[a-zA-Z_-]+/m.test(md)) {
        fail(`${kb}: ${ch.notePath} 用了 ::: 块语法 —— Obsidian 无法渲染，请用 > [!type] callout`);
      }

      // 块体系：正文块 ≤8（栏目块不计）
      const bodyBlocks = callouts.filter((m) => !COLUMN_BLOCKS.has(m[1]));
      if (bodyBlocks.length > 8) {
        warn(`${kb}: ${ch.notePath} 有 ${bodyBlocks.length} 个正文块（建议 ≤8），正文可能被切碎`);
      }
      const isTextbook = callouts.some((m) => COLUMN_BLOCKS.has(m[1]));
      if (isTextbook) {
        // 教材版式：必备栏目（NOTE_GENERATION R14）
        for (const c of REQUIRED_COLUMNS) {
          if (!callouts.some((m) => m[1] === c)) warn(`${kb}: ${ch.notePath} 缺必备栏目 > [!${c}]（NOTE_GENERATION §3.5）`);
        }
        // 段落锚 ^id 与旁栏对齐 @id
        const blockIds = new Set([...md.matchAll(/(?:^|\s)\^([A-Za-z0-9-]+)\s*$/gm)].map((m) => m[1]));
        for (const m of md.matchAll(/^>\s*\[![a-z-]+\][+-]?[^\n]*?@([A-Za-z0-9-]+)\s*$/gm)) {
          if (!blockIds.has(m[1])) fail(`${kb}: ${ch.notePath} 的旁栏块对齐到不存在的锚点 @${m[1]}`);
        }
        // 资源卡必须指向真实 span，且 span 带 why 与可验证定位
        for (const m of md.matchAll(/^>\s*\[!res\]\s+(s\.[A-Za-z0-9.-]+)/gm)) {
          const sp = spanById.get(m[1]);
          if (!sp) { fail(`${kb}: ${ch.notePath} 的资源卡引用不存在的 span ${m[1]}`); continue; }
          if (!sp.why) fail(`${kb}/${sp.id}: 作为旁栏资源卡使用，但缺 why（为什么链到这里）`);
          if (sp.locator?.type === 'section') warn(`${kb}/${sp.id}: 资源卡定位只到 section，建议精确到页 / 时间 / 文本片段`);
        }
      } else if (!callouts.some((m) => m[1] === 'link')) {
        warn(`${kb}: ${ch.notePath} 没有 > [!link] 块——本章与其它知识的关联没有被显式接出来`);
      }
      // 图片文件必须存在
      for (const m of md.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)) {
        if (/^https?:/.test(m[1])) continue;
        if (!existsSync(path.join(path.dirname(p), decodeURI(m[1])))) fail(`${kb}: ${ch.notePath} 引用的图片不存在 ${m[1]}`);
      }

      // 讲义不该是关键词堆
      const bullets = (md.match(/^\s*[-*]\s+/gm) ?? []).length;
      const paragraphs = md.split(/\n\s*\n/).filter((p) => p.trim() && !p.trim().startsWith('-')).length;
      if (paragraphs > 0 && bullets / Math.max(paragraphs, 1) > 2.5) {
        warn(`${kb}: ${ch.notePath} 列表密度过高（${bullets} bullets / ${paragraphs} blocks）——检查是否退化成提纲`);
      }
    }

    // ---- course.nodeIds 与 graph 一致 ----
    for (const id of course.nodeIds ?? []) {
      if (!nodeIds.has(id)) fail(`${kb}: kb.json 的 nodeIds 含不存在节点 ${id}`);
    }

    // ---- 资源清单：三态 origin / 覆盖状态 / 引用完整性 ----
    const manifestPath = path.join(dir, 'resources', 'manifest.json');
    if (existsSync(manifestPath)) {
      const mf = await readJson(manifestPath);
      if (mf) {
        const resIds = new Set();
        for (const r of mf.resources ?? []) {
          if (resIds.has(r.id)) fail(`${kb}: 重复资源 id ${r.id}`);
          resIds.add(r.id);
          if (!ORIGINS.has(r.origin)) fail(`${kb}/${r.id}: origin 非法 "${r.origin}"`);
          if (!RES_STATUS.has(r.status)) fail(`${kb}/${r.id}: status 非法 "${r.status}"`);
          if (!r.license) fail(`${kb}/${r.id}: 缺 license —— 来源必须可追溯`);
        }
        for (const s of mf.spans ?? []) {
          if (!resIds.has(s.resourceId)) fail(`${kb}/${s.id}: 指向不存在的资源 ${s.resourceId}`);
          if (!s.locator || !SPAN_LOCATORS.has(s.locator.type)) {
            fail(`${kb}/${s.id}: locator.type 非法（应为 page/section/time/range/text-fragment/unavailable）`);
          }
        }
        // 覆盖矩阵：必须覆盖 outline 的每一章，且 unsourced 章要带 warning
        const chapterIds = new Set((course.outline ?? []).map((c) => c.id));
        const writtenIds = new Set((course.outline ?? []).filter((c) => c.status !== 'planned').map((c) => c.id));
        const covered = new Set();
        for (const c of mf.coverage?.byChapter ?? []) {
          covered.add(c.chapterId);
          if (!chapterIds.has(c.chapterId)) fail(`${kb}: coverage 引用了不存在的章节 ${c.chapterId}`);
          for (const rid of c.resourceIds ?? []) {
            if (!resIds.has(rid)) fail(`${kb}: 章节 ${c.chapterId} 引用不存在的资源 ${rid}`);
          }
          if (c.unsourced && !c.warning) {
            warn(`${kb}: 章节 ${c.chapterId} 标记为无来源，但没有 warning 说明（UI 需要它来提示幻觉风险）`);
          }
        }
        for (const cid of writtenIds) {
          if (!covered.has(cid)) warn(`${kb}: 章节 ${cid} 没有在 coverage 中出现（资源—讲义映射不完整）`);
        }
        // discovered 资源必须有 uri，否则无法核对
        for (const r of mf.resources ?? []) {
          if (r.origin === 'discovered' && !r.uri) {
            fail(`${kb}/${r.id}: discovered 资源必须有 uri`);
          }
        }
      }
    } else {
      warn(`${kb}: 缺 resources/manifest.json（无法回答「这段是哪来的」）`);
    }
  }

  // ---- 输出 ----
  if (warns.length) {
    console.log(`\n⚠ ${warns.length} 条警告：`);
    for (const w of warns) console.log(`  · ${w}`);
  }
  if (errors.length) {
    console.error(`\n✗ ${errors.length} 条错误：`);
    for (const e of errors) console.error(`  · ${e}`);
    process.exit(1);
  }
  console.log('\n✓ 内容校验通过（节点 / 关系 / 引用完整性 / 讲义链接 / 资源来源 / 覆盖矩阵）');
}

main().catch((e) => { console.error(e); process.exit(1); });
