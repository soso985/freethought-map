import { useMemo } from 'react';
import type { ID, MapDoc, ThoughtNode } from '../../types';
import { childrenMap, rootIds } from '../../utils/doc';
import { useMapStore } from '../../stores/mapStore';

type Row = { node: ThoughtNode; depth: number; hasChildren: boolean };

/** 深度优先摊平成行列表（O(n)），缩进用 padding 表达，避免深层嵌套 DOM */
function flatten(doc: MapDoc, ignoreCollapse = false): Row[] {
  const kids = childrenMap(doc);
  const rows: Row[] = [];
  const walk = (id: ID, depth: number) => {
    const node = doc.nodes[id];
    if (!node) return;
    const children = kids.get(id) ?? [];
    rows.push({ node, depth, hasChildren: children.length > 0 });
    if (ignoreCollapse || !node.collapsed) for (const c of children) walk(c, depth + 1);
  };
  for (const r of rootIds(doc)) walk(r, 0);
  return rows;
}

function hitSet(doc: MapDoc, query: string): Set<ID> | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const hit = new Set<ID>();
  for (const n of Object.values(doc.nodes)) {
    if (
      n.title.toLowerCase().includes(q) ||
      n.body.toLowerCase().includes(q) ||
      n.tags.some((t) => t.toLowerCase().includes(q))
    ) {
      hit.add(n.id);
    }
  }
  return hit;
}

/** 大纲视图：与画布同源（都读 doc），反映 Tree 父子关系，不含自由联想线 */
export default function OutlineView() {
  const doc = useMapStore((s) => s.doc);
  const selectedIds = useMapStore((s) => s.selectedIds);
  const query = useMapStore((s) => s.query);
  const setQuery = useMapStore((s) => s.setQuery);
  const setSelected = useMapStore((s) => s.setSelected);
  const toggleCollapse = useMapStore((s) => s.toggleCollapse);

  const hit = useMemo(() => hitSet(doc, query), [doc, query]);

  // 搜索时忽略折叠状态，保证命中项一定看得见；并把命中项的祖先一并列出（灰显）
  const rows = useMemo(() => {
    const all = flatten(doc, !!hit);
    if (!hit) return all;
    const keep = new Set<ID>();
    for (const id of hit) {
      let cur: ID | null = id;
      while (cur && !keep.has(cur)) {
        keep.add(cur);
        cur = doc.nodes[cur]?.parentId ?? null;
      }
    }
    return all.filter((r) => keep.has(r.node.id));
  }, [doc, hit]);

  /** 点选命中项时先把被折叠的祖先展开，否则画布上看不到它 */
  const revealAndSelect = (id: ID) => {
    let cur = doc.nodes[id]?.parentId ?? null;
    while (cur) {
      const parent = doc.nodes[cur];
      if (!parent) break;
      if (parent.collapsed) toggleCollapse(cur);
      cur = parent.parentId ?? null;
    }
    setSelected([id]);
  };

  return (
    <aside className="outline">
      <div className="outline-head">
        <span className="panel-title">大纲</span>
        <span className="panel-meta">
          {Object.keys(doc.nodes).length} 节点 · {doc.freeLinks.length} 联想线
        </span>
      </div>

      <div className="outline-search">
        <input
          className="ai-input"
          value={query}
          placeholder="搜索标题 / 正文 / 标签"
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button className="tbtn" onClick={() => setQuery('')}>
            清除
          </button>
        )}
      </div>

      <div className="outline-list">
        {rows.length === 0 && <p className="panel-hint">没有匹配的节点。</p>}
        {rows.map(({ node, depth, hasChildren }) => (
          <div
            key={node.id}
            className={`outline-row${selectedIds.includes(node.id) ? ' is-selected' : ''}${
              hit && !hit.has(node.id) ? ' is-dim' : ''
            }`}
            style={{ paddingLeft: 6 + depth * 14 }}
            onClick={() => revealAndSelect(node.id)}
            title={node.body || undefined}
          >
            {hasChildren ? (
              <button
                className="outline-fold"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleCollapse(node.id);
                }}
                aria-label={node.collapsed ? '展开' : '折叠'}
              >
                {node.collapsed ? '▸' : '▾'}
              </button>
            ) : (
              <span className="outline-fold outline-fold--leaf">·</span>
            )}
            <span className="outline-name">{node.title || '未命名'}</span>
            {node.body && <span className="outline-body">{node.body.slice(0, 24)}</span>}
          </div>
        ))}
      </div>
    </aside>
  );
}
