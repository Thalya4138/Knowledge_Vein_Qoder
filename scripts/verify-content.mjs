#!/usr/bin/env node
/**
 * 样例数据校验。CI 与本地 `npm run verify:content` 都跑这个。
 *
 * 它检查的不只是 JSON 语法合法，而是本产品的核心不变量：
 *   1. 每条关系都有 explanation / assumptions / epistemic（schema 层面）
 *   2. 关系的 from/to 指向真实存在的节点（引用完整性）
 *   3. relationGroup 的前提与结论节点存在
 *   4. 讲义中的 [[wiki link]] 都能落到一个节点（防止讲义与图谱脱节）
 *   5. 讲义里引用的 chapters 文件真实存在
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
const BLOCKS = new Set([
  'definition', 'theorem', 'derivation', 'proof', 'source_quote', 'note',
  'viewpoint', 'method', 'extension', 'caveat', 'correction', 'unresolved',
  'worked_example', 'contrast',
]);

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
    const coursePath = path.join(dir, 'course.json');
    const graphPath = path.join(dir, 'graph.json');
    if (!existsSync(coursePath)) { fail(`${kb}: 缺 course.json`); continue; }
    if (!existsSync(graphPath)) { fail(`${kb}: 缺 graph.json`); continue; }

    const course = await readJson(coursePath);
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

    // ---- 章节文件存在 ----
    for (const ch of course.outline ?? []) {
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

      // 语义块名必须在白名单内 —— 防止「caution/warning/tip」这类同义词扩散
      for (const m of md.matchAll(/^:::\s*([a-zA-Z_-]+)/gm)) {
        if (!BLOCKS.has(m[1])) {
          fail(`${kb}: ${ch.notePath} 使用了未定义的块类型 "::: ${m[1]}"（见 prompts/NOTE_GENERATION.md §4）`);
        }
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
      if (!nodeIds.has(id)) fail(`${kb}: course.json 的 nodeIds 含不存在节点 ${id}`);
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
  console.log('\n✓ 内容校验通过（节点 / 关系 / 引用完整性 / 讲义链接）');
}

main().catch((e) => { console.error(e); process.exit(1); });
