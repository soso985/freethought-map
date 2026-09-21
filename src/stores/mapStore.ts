import { create } from 'zustand';
import type { FreeLink, ID, MapDoc, ThoughtNode } from '../types';
import { createEmptyDoc, loadDoc, nid, rootIds, saveDocDebounced } from '../utils/doc';
import { DEFAULT_NODE_H, DEFAULT_NODE_W, treeLayout } from '../utils/layout';

const HISTORY_LIMIT = 50;

/** 可被 updateNode / updateNodeLive 修改的字段 */
export type NodePatch = Partial<
  Pick<ThoughtNode, 'title' | 'body' | 'tags' | 'color' | 'locked' | 'shape' | 'width' | 'height'>
>;

type MapState = {
  doc: MapDoc;
  /** 当前选中的节点（多选是常态，所以永远是数组） */
  selectedIds: ID[];
  /** 搜索关键词：只做高亮与过滤，绝不改动节点位置或层级 */
  query: string;
  past: MapDoc[];
  future: MapDoc[];
  /** 连续操作（拖拽 / 输入）开始时的快照：过程中不进历史，结束时只记一条 */
  editSnapshot: MapDoc | null;
  /** 视口重定位信号：一变就表示「请把视图对准全部节点」（新建图 / 载入 / 一键布局后） */
  fitSignal: number;

  load: () => void;
  reset: () => void;

  addNode: (opts?: { parentId?: ID | null; title?: string; body?: string; position?: { x: number; y: number } }) => ID;
  updateNode: (id: ID, patch: NodePatch) => void;
  /** 连续输入中调用：直接写、不进历史（配 beginEdit / endEdit 用） */
  updateNodeLive: (id: ID, patch: NodePatch) => void;
  /** 批量删除：子节点上提一级，不连带丢掉用户内容 */
  deleteNodes: (ids: ID[]) => void;
  toggleCollapse: (id: ID) => void;

  /** 建立 / 断开 Tree 父子关系（有向）。会拒绝成环与自指；parentId 传 null 即断开成独立节点。 */
  setParent: (childId: ID, parentId: ID | null) => boolean;
  /** 把某个节点提到顶层：当前所有顶层节点都挂到它下面 */
  setRoot: (id: ID) => void;
  /** 拖拽中：只改视觉坐标，直接写、不进历史 */
  moveLive: (id: ID, position: { x: number; y: number }) => void;
  /** 一次连续操作开始：拍快照。无实际变化时 endEdit 不会产生历史 */
  beginEdit: () => void;
  endEdit: () => void;

  addFreeLink: (a: ID, b: ID) => void;
  removeFreeLink: (id: ID) => void;

  setSelected: (ids: ID[]) => void;
  setQuery: (query: string) => void;

  /** 一键 Tree 布局：只改视觉位置 */
  applyTreeLayout: () => void;

  undo: () => void;
  redo: () => void;
};

function isDescendant(doc: MapDoc, ancestorId: ID, maybeDescendantId: ID): boolean {
  let cursor: ID | null = maybeDescendantId;
  const guard = new Set<ID>();
  while (cursor && !guard.has(cursor)) {
    if (cursor === ancestorId) return true;
    guard.add(cursor);
    cursor = doc.nodes[cursor]?.parentId ?? null;
  }
  return false;
}

/** 被删节点的子节点要挂到哪里：沿着祖先一路向上找第一个没被删的节点 */
function liftTarget(doc: MapDoc, kill: Set<ID>, from: ID): ID | null {
  const guard = new Set<ID>();
  let cursor: ID | null = doc.nodes[from]?.parentId ?? null;
  while (cursor && kill.has(cursor) && !guard.has(cursor)) {
    guard.add(cursor);
    cursor = doc.nodes[cursor]?.parentId ?? null;
  }
  return cursor;
}

/** 补丁里是否有真实变化（数组按元素比较）——没有变化就不写状态，避免污染历史判断 */
function hasChange(node: ThoughtNode, patch: NodePatch): boolean {
  return (Object.keys(patch) as (keyof NodePatch)[]).some((k) => {
    const a = node[k];
    const b = patch[k];
    if (Array.isArray(a) && Array.isArray(b)) return a.length !== b.length || a.some((v, i) => v !== b[i]);
    return a !== b;
  });
}

const NODE_GAP = 40;

/**
 * 新节点的初始落点：父节点正下方一行；同一父下已经有兄弟时，排到最右侧兄弟的右边。
 * 只算这一个新节点的坐标，不动任何已有节点——位置依然是用户随便拖的。
 */
function dropPosition(doc: MapDoc, parent: ThoughtNode): { x: number; y: number } {
  const siblings = Object.values(doc.nodes).filter((n) => n.parentId === parent.id);
  if (siblings.length === 0) {
    return { x: parent.position.x, y: parent.position.y + (parent.height ?? DEFAULT_NODE_H) + NODE_GAP };
  }
  const rightMost = siblings.reduce((a, b) =>
    a.position.x + (a.width ?? DEFAULT_NODE_W) >= b.position.x + (b.width ?? DEFAULT_NODE_W) ? a : b,
  );
  return { x: rightMost.position.x + (rightMost.width ?? DEFAULT_NODE_W) + NODE_GAP, y: rightMost.position.y };
}

export const useMapStore = create<MapState>((set, get) => {
  const commit = (fn: (doc: MapDoc) => MapDoc) =>
    set((s) => ({
      doc: { ...fn(s.doc), updatedAt: Date.now() },
      past: [...s.past, s.doc].slice(-HISTORY_LIMIT),
      future: [],
    }));

  /** 请求把视图对准全部节点（配合 Canvas 里的 fitSignal effect） */
  const requestFit = (s: MapState) => ({ fitSignal: s.fitSignal + 1 });

  return {
    doc: createEmptyDoc(),
    selectedIds: [],
    query: '',
    past: [],
    future: [],
    editSnapshot: null,
    fitSignal: 0,

    load: () =>
      set((s) => ({
        doc: loadDoc() ?? createEmptyDoc(),
        past: [],
        future: [],
        selectedIds: [],
        ...requestFit(s),
      })),

    reset: () =>
      set((s) => ({
        doc: createEmptyDoc(),
        past: [...s.past, s.doc].slice(-HISTORY_LIMIT),
        future: [],
        selectedIds: [],
        ...requestFit(s),
      })),

    addNode: (opts = {}) => {
      const id = nid();
      commit((doc) => {
        // 不指定父节点（undefined）时挂到第一个顶层节点下；显式传 null = 就是要一个独立节点
        const parentId = opts.parentId === undefined ? (rootIds(doc)[0] ?? null) : opts.parentId;
        const parent = parentId ? doc.nodes[parentId] : null;
        const position =
          opts.position ??
          (parent
            ? dropPosition(doc, parent)
            : { x: Math.round(Math.random() * 300 - 150), y: Math.round(Math.random() * 200) });
        const node: ThoughtNode = {
          id,
          parentId: parent ? parentId : null,
          title: opts.title ?? '新节点',
          body: opts.body ?? '',
          tags: [],
          position,
        };
        return { ...doc, nodes: { ...doc.nodes, [id]: node } };
      });
      set({ selectedIds: [id] });
      return id;
    },

    updateNode: (id, patch) =>
      commit((doc) => {
        const node = doc.nodes[id];
        if (!node) return doc;
        return { ...doc, nodes: { ...doc.nodes, [id]: { ...node, ...patch } } };
      }),

    updateNodeLive: (id, patch) =>
      set((s) => {
        const node = s.doc.nodes[id];
        if (!node || !hasChange(node, patch)) return s;
        return { doc: { ...s.doc, nodes: { ...s.doc.nodes, [id]: { ...node, ...patch } } } };
      }),

    deleteNodes: (ids) =>
      set((s) => {
        const kill = new Set(ids.filter((id) => s.doc.nodes[id]));
        if (kill.size === 0) return s;

        const nodes: Record<ID, ThoughtNode> = {};
        for (const n of Object.values(s.doc.nodes)) {
          if (kill.has(n.id)) continue;
          // 子节点上提一级，避免连带删除用户数据
          const parentId = n.parentId && kill.has(n.parentId) ? liftTarget(s.doc, kill, n.parentId) : n.parentId;
          nodes[n.id] = parentId === n.parentId ? n : { ...n, parentId };
        }

        return {
          doc: {
            ...s.doc,
            nodes,
            freeLinks: s.doc.freeLinks.filter((l) => !kill.has(l.a) && !kill.has(l.b)),
            updatedAt: Date.now(),
          },
          selectedIds: s.selectedIds.filter((id) => !kill.has(id)),
          past: [...s.past, s.doc].slice(-HISTORY_LIMIT),
          future: [],
        };
      }),

    toggleCollapse: (id) =>
      commit((doc) => {
        const node = doc.nodes[id];
        if (!node) return doc;
        return { ...doc, nodes: { ...doc.nodes, [id]: { ...node, collapsed: !node.collapsed } } };
      }),

    setParent: (childId, parentId) => {
      const doc = get().doc;
      if (childId === parentId) return false;
      if (!doc.nodes[childId]) return false;
      if (parentId && !doc.nodes[parentId]) return false;
      if (parentId && isDescendant(doc, childId, parentId)) return false; // 拒绝成环
      // parentId = null 就是「断开父子关系」：该节点变成独立节点，全图允许多个顶层节点
      commit((d) => ({ ...d, nodes: { ...d.nodes, [childId]: { ...d.nodes[childId], parentId } } }));
      return true;
    },

    setRoot: (id) =>
      commit((doc) => {
        const node = doc.nodes[id];
        if (!node || node.parentId === null) return doc;
        const nodes: Record<ID, ThoughtNode> = { ...doc.nodes };
        // 原顶层节点挂到新顶层节点下，保证不成环
        for (const r of rootIds(doc)) {
          if (r !== id) nodes[r] = { ...nodes[r], parentId: id };
        }
        nodes[id] = { ...nodes[id], parentId: null };
        return { ...doc, nodes };
      }),

    moveLive: (id, position) =>
      set((s) => {
        const node = s.doc.nodes[id];
        if (!node || node.locked) return s;
        if (node.position.x === position.x && node.position.y === position.y) return s;
        return { doc: { ...s.doc, nodes: { ...s.doc.nodes, [id]: { ...node, position } } } };
      }),

    beginEdit: () => set((s) => ({ editSnapshot: s.doc })),

    endEdit: () =>
      set((s) => {
        if (!s.editSnapshot) return { editSnapshot: null };
        // 快照与当前文档同一引用 = 这段时间什么都没改，不产生历史
        if (s.editSnapshot === s.doc) return { editSnapshot: null };
        return { past: [...s.past, s.editSnapshot].slice(-HISTORY_LIMIT), future: [], editSnapshot: null };
      }),

    addFreeLink: (a, b) =>
      commit((doc) => {
        if (a === b || !doc.nodes[a] || !doc.nodes[b]) return doc;
        const exists = doc.freeLinks.some((l) => (l.a === a && l.b === b) || (l.a === b && l.b === a));
        if (exists) return doc;
        const link: FreeLink = { id: nid(), a, b };
        return { ...doc, freeLinks: [...doc.freeLinks, link] };
      }),

    removeFreeLink: (id) => commit((doc) => ({ ...doc, freeLinks: doc.freeLinks.filter((l) => l.id !== id) })),

    setSelected: (ids) => set({ selectedIds: ids }),
    setQuery: (query) => set({ query }),

    applyTreeLayout: () =>
      set((s) => {
        const pos = treeLayout(s.doc);
        const nodes: Record<ID, ThoughtNode> = {};
        for (const [id, node] of Object.entries(s.doc.nodes)) {
          const next = pos.get(id);
          nodes[id] = next && !node.locked ? { ...node, position: next } : node;
        }
        return {
          doc: { ...s.doc, nodes, updatedAt: Date.now() },
          past: [...s.past, s.doc].slice(-HISTORY_LIMIT),
          future: [],
          ...requestFit(s),
        };
      }),

    undo: () =>
      set((s) => {
        const prev = s.past[s.past.length - 1];
        if (!prev) return s;
        return {
          doc: prev,
          past: s.past.slice(0, -1),
          future: [s.doc, ...s.future].slice(0, HISTORY_LIMIT),
          selectedIds: s.selectedIds.filter((id) => prev.nodes[id]),
        };
      }),

    redo: () =>
      set((s) => {
        const next = s.future[0];
        if (!next) return s;
        return {
          doc: next,
          past: [...s.past, s.doc].slice(-HISTORY_LIMIT),
          future: s.future.slice(1),
          selectedIds: s.selectedIds.filter((id) => next.nodes[id]),
        };
      }),
  };
});

// 任何文档变化都落盘（防抖）
useMapStore.subscribe((s) => saveDocDebounced(s.doc));
