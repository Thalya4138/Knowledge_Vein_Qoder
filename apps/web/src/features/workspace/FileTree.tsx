import { useEffect, useMemo, useState } from 'react';
import { Icon, type IconName } from '../../ui/Icon';
import type { FileKind, Workspace, WsFile } from './workspaceData';

/**
 * 文件栏：按真实目录层级显示（像 Obsidian / VS Code 的文件树），文件夹可以折叠。
 *
 * 数据模型不变（工作区仍是「分组 → 文件」，导图、对齐文件夹等都依赖它）；树只在这里按 file.path 重建。
 * 没有 path 的文件（示例工作区）用所在分组当一级目录。
 */

interface DirNode {
  key: string;
  label: string;
  dirs: DirNode[];
  files: WsFile[];
}

const collator = new Intl.Collator('zh', { numeric: true, sensitivity: 'base' });

/** 文件在树里显示的名字：路径最后一段；Markdown 去掉扩展名（Obsidian 也这样显示） */
export function leafName(file: WsFile): string {
  const last = (file.path ?? file.name).split('/').at(-1) ?? file.name;
  return file.path ? last.replace(/\.(md|markdown)$/i, '') : file.name;
}

export function buildTree(ws: Workspace): DirNode {
  const root: DirNode = { key: '', label: '', dirs: [], files: [] };
  const dirOf = (parent: DirNode, seg: string, label: string): DirNode => {
    let d = parent.dirs.find((x) => x.label === label);
    if (!d) {
      d = { key: parent.key ? `${parent.key}/${seg}` : seg, label, dirs: [], files: [] };
      parent.dirs.push(d);
    }
    return d;
  };
  for (const folder of ws.folders) {
    for (const file of folder.files) {
      const segs = file.path ? file.path.split('/').slice(0, -1) : folder.name === '根目录' ? [] : [folder.name];
      let at = root;
      segs.forEach((seg, i) => {
        // 一级目录沿用分组的显示名（浏览器工作区里 notes → 讲义）
        at = dirOf(at, seg, i === 0 && file.path ? folder.name : seg);
      });
      at.files.push(file);
    }
  }
  // 示例工作区（文件没有 path）的一级目录保持定义时的顺序：讲义在前，资料在后
  const keepOrder = ws.folders.every((f) => f.files.every((x) => !x.path));
  const sort = (d: DirNode) => {
    if (!(keepOrder && d === root)) d.dirs.sort((a, b) => collator.compare(a.label, b.label));
    d.files.sort((a, b) => collator.compare(leafName(a), leafName(b)));
    d.dirs.forEach(sort);
  };
  sort(root);
  return root;
}

function ancestors(root: DirNode, id: string): string[] {
  const walk = (d: DirNode, trail: string[]): string[] | null => {
    if (d.files.some((f) => f.id === id)) return trail;
    for (const c of d.dirs) {
      const hit = walk(c, [...trail, c.key]);
      if (hit) return hit;
    }
    return null;
  };
  return walk(root, []) ?? [];
}

function count(d: DirNode): number {
  return d.files.length + d.dirs.reduce((n, c) => n + count(c), 0);
}

export function FileTree({
  ws,
  activeId,
  onOpen,
  icons,
}: {
  ws: Workspace;
  activeId?: string;
  onOpen: (id: string) => void;
  icons: Record<FileKind, IconName>;
}) {
  const tree = useMemo(() => buildTree(ws), [ws]);
  // 文件不多时一级目录默认展开；多了就只展开当前文件所在的那一串
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    setOpen(new Set(count(tree) <= 40 ? tree.dirs.map((d) => d.key) : []));
  }, [ws.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!activeId) return;
    const need = ancestors(tree, activeId);
    if (need.length) setOpen((s) => (need.every((k) => s.has(k)) ? s : new Set([...s, ...need])));
  }, [activeId, tree]);

  const toggle = (key: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const renderDir = (d: DirNode, depth: number) => (
    <ul className="ft-list" role={depth ? 'group' : 'tree'} aria-label={depth ? undefined : '文件'}>
      {d.dirs.map((c) => {
        const isOpen = open.has(c.key);
        return (
          <li key={c.key} role="treeitem" aria-expanded={isOpen}>
            <button type="button" className="ft-row ft-dir" style={{ ['--depth' as string]: depth }} onClick={() => toggle(c.key)} title={c.key}>
              <Icon name="chevron" className={isOpen ? 'icon ft-chev open' : 'icon ft-chev'} />
              <span>{c.label}</span>
            </button>
            {isOpen && renderDir(c, depth + 1)}
          </li>
        );
      })}
      {d.files.map((f) => (
        <li key={f.id} role="treeitem" aria-selected={f.id === activeId}>
          <button
            type="button"
            className={f.id === activeId ? 'ft-row ft-file active' : 'ft-row ft-file'}
            style={{ ['--depth' as string]: depth }}
            aria-current={f.id === activeId ? 'page' : undefined}
            onClick={() => onOpen(f.id)}
            title={f.path ?? f.name}
          >
            <Icon name={icons[f.kind]} />
            <span>{leafName(f)}</span>
          </button>
        </li>
      ))}
    </ul>
  );

  return <div className="ft">{renderDir(tree, 0)}</div>;
}
