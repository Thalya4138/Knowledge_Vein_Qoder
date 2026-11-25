import { describe, expect, it } from 'vitest';
import {
  addChild,
  addSibling,
  answerKey,
  assumptionsOf,
  attachViz,
  demoKnowledge,
  foldToLevel,
  indexDoc,
  insertParent,
  loadDoc,
  moveNode,
  moveSibling,
  nodesWithViz,
  normalizeDoc,
  parseImported,
  parseOutline,
  pasteBranches,
  removeNode,
  seedDoc,
  serialize,
  toMapNode,
  toMarkdown,
  MIND_DOC_KEY,
} from './mindDoc';

const texts = (ids: { text: string }[]) => ids.map((n) => n.text);

describe('示例导图', () => {
  it('由示例知识库生成：四段主线，叶子都指回图谱节点', () => {
    const doc = seedDoc();
    expect(doc.root.kids).toHaveLength(4);
    const ix = indexDoc(doc);
    const ctx = demoKnowledge();
    for (const n of ix.byId.values()) if (n.ref) expect(ctx.info(n.ref)).not.toBeNull();
  });

  it('挂到叶子上的公式都来自讲义原文', () => {
    const ix = indexDoc(seedDoc());
    const normal = [...ix.byId.values()].find((n) => n.ref === 'n.normal-eq');
    expect(normal?.f?.[0]).toContain('A^{\\mathsf T}A');
    expect(normal?.src).toBe('讲义 §2.1');
  });

  it('成立条件取自知识关系的前提，并去重', () => {
    const pre = assumptionsOf(demoKnowledge(), 'n.least-squares');
    expect(pre.length).toBeGreaterThan(0);
    expect(new Set(pre.map((p) => p.text)).size).toBe(pre.length);
  });
});

describe('结构操作', () => {
  it('Tab 加子主题、Enter 加同级、Shift+Tab 加父主题', () => {
    const doc = seedDoc();
    const first = doc.root.kids[0]!;
    const child = addChild(doc, first.id)!;
    expect(first.kids.at(-1)!.id).toBe(child);
    const sib = addSibling(doc, child)!;
    expect(first.kids.at(-1)!.id).toBe(sib);
    const before = addSibling(doc, sib, true)!;
    expect(first.kids.at(-2)!.id).toBe(before);
    const parent = insertParent(doc, sib)!;
    const p = indexDoc(doc).byId.get(parent)!;
    expect(p.kids.map((k) => k.id)).toEqual([sib]);
  });

  it('中心主题不能删除、不能加父主题', () => {
    const doc = seedDoc();
    expect(removeNode(doc, doc.root.id)).toBeNull();
    expect(insertParent(doc, doc.root.id)).toBeNull();
  });

  it('删除主题时一并删除连到它的「我的连线」，并选中相邻的主题', () => {
    const doc = seedDoc();
    const [a, b] = doc.root.kids;
    doc.links.push({ id: 'p1', from: a!.id, to: b!.id, label: '', reason: '', src: '' });
    const next = removeNode(doc, a!.id);
    expect(next).toBe(b!.id);
    expect(doc.links).toHaveLength(0);
  });

  it('上移下移只在同级之间进行', () => {
    const doc = seedDoc();
    const ids = doc.root.kids.map((k) => k.id);
    expect(moveSibling(doc, ids[0]!, -1)).toBe(false);
    expect(moveSibling(doc, ids[0]!, 1)).toBe(true);
    expect(doc.root.kids.map((k) => k.id)).toEqual([ids[1], ids[0], ids[2], ids[3]]);
  });

  it('拖拽换父：不能拖进自己的后代；拖到中心主题下成为第一层并带上分区', () => {
    const doc = seedDoc();
    const s3 = doc.root.kids[2]!;
    const inner = s3.kids[0]!;
    expect(moveNode(doc, s3.id, inner.id, 'in')).toBe(false);
    expect(moveNode(doc, inner.id, doc.root.id, 'in')).toBe(true);
    const moved = doc.root.kids.at(-1)!;
    expect(moved.id).toBe(inner.id);
    expect(moved.band).toBeTypeOf('number');
  });

  it('展开到第 n 层', () => {
    const doc = seedDoc();
    foldToLevel(doc, 2);
    const ix = indexDoc(doc);
    for (const [id, n] of ix.byId) if (n.kids.length && (ix.depth.get(id) ?? 0) >= 2) expect(n.fold).toBe(true);
    expect(doc.root.kids.every((k) => !k.fold)).toBe(true);
  });
});

describe('粘贴与导出', () => {
  it('缩进文本、列表与标题都能变成分支', () => {
    const doc = seedDoc();
    const out = parseOutline(doc, '牛顿定律\n\t动量\n\t\t碰撞\n\t能量\n- 刚体\n  - 定轴转动');
    expect(texts(out)).toEqual(['牛顿定律', '刚体']);
    expect(texts(out[0]!.kids)).toEqual(['动量', '能量']);
    expect(texts(out[0]!.kids[0]!.kids)).toEqual(['碰撞']);
    expect(texts(out[1]!.kids)).toEqual(['定轴转动']);
    const sel = pasteBranches(doc, doc.root.id, out);
    expect(sel).toBe(out[0]!.id);
  });

  it('Markdown 导出带公式与「我的连线」', () => {
    const doc = seedDoc();
    const [a, b] = doc.root.kids;
    doc.links.push({ id: 'p1', from: a!.id, to: b!.id, label: '先问再答', reason: '', src: '' });
    const md = toMarkdown(doc);
    expect(md.startsWith('# ')).toBe(true);
    expect(md).toContain('$$A^{\\mathsf T}A');
    expect(md).toContain('## 我的连线');
    expect(md).toContain('先问再答');
  });

  it('导入只接受本导图的文档', () => {
    expect(parseImported('{"a":1}')).toBeNull();
    expect(parseImported('不是 JSON')).toBeNull();
    const back = parseImported(serialize(seedDoc()));
    expect(back?.root.kids).toHaveLength(4);
  });

  it('本机存储：读回保存的文档；损坏时回到示例', () => {
    const doc = seedDoc();
    doc.title = '我的线代';
    const store = (v: string | null) => ({ getItem: (k: string) => (k === MIND_DOC_KEY ? v : null) });
    expect(loadDoc(store(serialize(doc))).title).toBe('我的线代');
    expect(loadDoc(store('{坏了')).root.kids).toHaveLength(4);
  });

  it('个人记忆图谱读的是思维导图本身，公式原样保留', () => {
    const doc = seedDoc();
    doc.root.kids[0]!.text = '先问有没有解 $Ax=b$';
    expect(toMapNode(doc.root).children[0]!.text).toBe('先问有没有解 $Ax=b$');
  });

  it('挖空比对忽略 $、排版命令、空白与全角符号', () => {
    expect(answerKey('残差 $\\mathbf e=\\mathbf b-\\mathbf p$')).toBe(answerKey('残差 e = b − p'));
    expect(answerKey('$A^{\\top}A$')).toBe(answerKey('A^TA'));
    expect(answerKey('法方程')).not.toBe(answerKey('正交条件'));
  });
});

describe('可视化挂载（TASK_R2_LINKAGE L5）', () => {
  it('attachViz 写主题上的 viz，重复挂同一张返回 false，取消后字段消失', () => {
    const doc = seedDoc();
    const id = doc.root.kids[0]!.id;
    expect(attachViz(doc, id, 'viz.photosynthesis')).toBe(true);
    expect(indexDoc(doc).byId.get(id)!.viz).toBe('viz.photosynthesis');
    expect(attachViz(doc, id, 'viz.photosynthesis')).toBe(false);
    expect(attachViz(doc, 'nope', 'viz.photosynthesis')).toBe(false);
    expect(attachViz(doc, id, null)).toBe(true);
    expect(indexDoc(doc).byId.get(id)!.viz).toBeUndefined();
    expect(attachViz(doc, id, null)).toBe(false);
  });

  it('nodesWithViz 只列出挂着同一张实验的主题', () => {
    const doc = seedDoc();
    const [a, b] = doc.root.kids;
    attachViz(doc, a!.id, 'viz.quadric-surfaces');
    attachViz(doc, b!.id, 'viz.photosynthesis');
    expect(nodesWithViz(doc, 'viz.quadric-surfaces').map((n) => n.id)).toEqual([a!.id]);
    expect(nodesWithViz(doc, 'viz.photosynthesis').map((n) => n.id)).toEqual([b!.id]);
    expect(nodesWithViz(doc, 'viz.none')).toEqual([]);
  });

  it('viz 经导出与导入原样保留', () => {
    const doc = seedDoc();
    const id = doc.root.kids[1]!.id;
    attachViz(doc, id, 'viz.photosynthesis');
    const back = parseImported(serialize(doc));
    expect(back && indexDoc(back).byId.get(id)!.viz).toBe('viz.photosynthesis');
    const norm = normalizeDoc(JSON.parse(serialize(doc)));
    expect(norm && indexDoc(norm).byId.get(id)!.viz).toBe('viz.photosynthesis');
  });
});
