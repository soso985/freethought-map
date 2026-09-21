import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  ConnectionMode,
  Controls,
  MarkerType,
  ReactFlow,
  useReactFlow,
  useStoreApi,
  type Connection,
  type Edge,
  type NodeChange,
} from '@xyflow/react';
import { useMapStore } from '../../stores/mapStore';
import { useThemeStore } from '../../stores/themeStore';
import type { ID } from '../../types';
import { childrenMap, hiddenIds } from '../../utils/doc';
import { DEFAULT_NODE_H, DEFAULT_NODE_W } from '../../utils/layout';
import { ThoughtNode, type ThoughtNodeType } from '../Node/ThoughtNode';
import { AutoTreeEdge } from '../Edge/AutoTreeEdge';

const nodeTypes = { thought: ThoughtNode };
const edgeTypes = { autoTree: AutoTreeEdge };

const TREE_EDGE_STYLE = { stroke: '#94a3b8', strokeWidth: 1.5 };
const FREE_EDGE_STYLE = { stroke: '#f472b6', strokeWidth: 1.5, strokeDasharray: '6 4', opacity: 0.65 };

/** 右键「轻点」与「拖动」的分界：位移不超过这个像素数才算轻点（弹菜单），否则算拖动（平移画布） */
const RIGHT_CLICK_SLOP = 5;

/**
 * React Flow 的平移过滤器里有一条：事件目标身上（或祖先里）有 `noPanClassName` 这个类，就不平移。
 * 而它同时会把这个类名挂到节点（可拖拽时）、锚点、连线上——所以随手换个类名没用，节点还是带着它，
 * 右键按在节点上拖不动，留下「节点是死区」的缺口。
 *
 * 本项目左键已不是平移键（见 panOnDrag），这条保护只剩负作用，于是把它变成一个永远匹配不到的选择器：
 * 元素拿到的类名是字面量 `ft-nopan-off:not(.ft-nopan-off)`（不是 `ft-nopan-off` 这个类），
 * 过滤器拿它去 closest 永远返回 null，等于只关掉这条保护。
 * 节点自身的拖动走 XYDrag（只认左键），锚点起连线也只在左键，都不受影响。
 */
const NO_PAN_CLASS = 'ft-nopan-off:not(.ft-nopan-off)';

export default function Canvas() {
  const theme = useThemeStore((s) => s.theme);
  const doc = useMapStore((s) => s.doc);
  const selectedIds = useMapStore((s) => s.selectedIds);
  const query = useMapStore((s) => s.query);
  const fitSignal = useMapStore((s) => s.fitSignal);
  const setSelected = useMapStore((s) => s.setSelected);
  const moveLive = useMapStore((s) => s.moveLive);
  const updateNodeLive = useMapStore((s) => s.updateNodeLive);
  const beginEdit = useMapStore((s) => s.beginEdit);
  const endEdit = useMapStore((s) => s.endEdit);
  const deleteNodes = useMapStore((s) => s.deleteNodes);
  const addNode = useMapStore((s) => s.addNode);
  const updateNode = useMapStore((s) => s.updateNode);
  const setParent = useMapStore((s) => s.setParent);
  const addFreeLink = useMapStore((s) => s.addFreeLink);
  const removeFreeLink = useMapStore((s) => s.removeFreeLink);

  const { fitView } = useReactFlow();
  const store = useStoreApi();

  /**
   * 方向键平移画布：只挪视口，绝不改动任何节点数据。
   * 打字时（输入框 / 可编辑区）让位给光标移动；焦点在节点上时 React Flow 自己的
   * 无障碍快捷键已经 preventDefault 了（那是移动选中节点），这里不抢。
   */
  useEffect(() => {
    const STEP = 60;
    const onKeyDown = (e: KeyboardEvent) => {
      const delta =
        e.key === 'ArrowUp'
          ? { x: 0, y: STEP }
          : e.key === 'ArrowDown'
            ? { x: 0, y: -STEP }
            : e.key === 'ArrowLeft'
              ? { x: STEP, y: 0 }
              : e.key === 'ArrowRight'
                ? { x: -STEP, y: 0 }
                : null;
      if (!delta || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      e.preventDefault();
      void store.getState().panBy(delta);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [store]);

  // 右键菜单：所有条目都只是「用户明确点一下」才执行，没有任何自动行为
  const [menu, setMenu] = useState<{ id: ID; x: number; y: number } | null>(null);

  /**
   * 右键身兼两职：轻点 = 弹节点菜单，按住拖动 = 平移画布。
   * 用按下时的坐标和菜单事件带来的坐标比距离来区分（见 onNodeContextMenu），
   * 所以要在 pointerdown 阶段（capture）先记一笔，晚于这个时机就被 React Flow 吞掉了。
   */
  const rightDown = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (e.button === 2) rightDown.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, []);

  /**
   * 视口重定位：新建图 / 载入存档 / 一键布局之后，节点位置全变了，
   * 而 <ReactFlow fitView> 只在首次挂载生效一次，所以这里订阅 store 的信号手动重定位。
   * 延后 60ms 等节点测量尺寸完成，否则 fitView 会按默认尺寸算包围盒。
   */
  useEffect(() => {
    if (fitSignal === 0) return;
    const t = window.setTimeout(() => {
      void fitView({ padding: 0.18, duration: 300 });
    }, 60);
    return () => window.clearTimeout(t);
  }, [fitSignal, fitView]);

  const hidden = useMemo(() => hiddenIds(doc), [doc]);
  const kids = useMemo(() => childrenMap(doc), [doc]);

  // 搜索命中集合：只用于高亮，绝不移动或改动任何节点
  const matched = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const set = new Set<ID>();
    for (const n of Object.values(doc.nodes)) {
      if (
        n.title.toLowerCase().includes(q) ||
        n.body.toLowerCase().includes(q) ||
        n.tags.some((t) => t.toLowerCase().includes(q))
      ) {
        set.add(n.id);
      }
    }
    return set;
  }, [doc.nodes, query]);

  // 节点位置只来自 doc.nodes[].position —— 逻辑与视觉在这里天然解耦
  const nodes = useMemo<ThoughtNodeType[]>(
    () =>
      Object.values(doc.nodes)
        .filter((n) => !hidden.has(n.id))
        .map((n) => ({
          id: n.id,
          type: 'thought' as const,
          position: n.position,
          selected: selectedIds.includes(n.id),
          // 顶层宽高必须给：受控模式下每次 store 变更都会重建节点对象，
          // 若缺少顶层尺寸，React Flow 会认为节点「还没有尺寸」并把容器隐藏一帧再测量，
          // 表现为缩放时闪一下。这里用文档里的尺寸兜底默认值，容器始终有尺寸。
          width: n.width ?? DEFAULT_NODE_W,
          height: n.height ?? DEFAULT_NODE_H,
          data: {
            title: n.title,
            body: n.body,
            tags: n.tags,
            color: n.color,
            locked: n.locked,
            collapsed: n.collapsed,
            hasChildren: (kids.get(n.id) ?? []).length > 0,
            match: matched?.has(n.id),
            shape: n.shape,
            width: n.width,
            height: n.height,
          },
        })),
    [doc.nodes, hidden, kids, selectedIds, matched],
  );

  // Tree 边是派生数据（由 parentId 算出），从不落盘；自由联想线独立存储、不参与任何计算
  const edges = useMemo<Edge[]>(() => {
    const treeEdges: Edge[] = Object.values(doc.nodes)
      .filter((n) => n.parentId && doc.nodes[n.parentId] && !hidden.has(n.id))
      .map((n) => ({
        id: `t:${n.parentId}->${n.id}`,
        source: n.parentId as string,
        target: n.id,
        // 用自定义边：进出边按两节点相对位置实时算，节点拖到哪一侧线就从哪一侧贴上去。
        // （写死 'b'/'t' 会让子节点跑到父节点上方时绕大半张图，见 AutoTreeEdge 注释）
        type: 'autoTree',
        // 下面两个锚点只是为了让 React Flow 认出这条边（找不到 handle 就不渲染边），
        // 真正画在哪条边上由 AutoTreeEdge 决定。
        sourceHandle: 'b',
        targetHandle: 't',
        style: TREE_EDGE_STYLE,
        markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8', width: 16, height: 16 },
      }));

    const freeEdges: Edge[] = doc.freeLinks
      .filter((l) => doc.nodes[l.a] && doc.nodes[l.b] && !hidden.has(l.a) && !hidden.has(l.b))
      .map((l) => ({
        id: `f:${l.id}`,
        source: l.a,
        target: l.b,
        type: 'straight',
        className: 'edge-free',
        style: FREE_EDGE_STYLE,
      }));

    return [...freeEdges, ...treeEdges];
  }, [doc.nodes, doc.freeLinks, hidden]);

  /**
   * React Flow 只告诉我们「哪些节点的选中态变了」，选中态的唯一真源在 store。
   * 一次框选/加选会在同一批 change 里带来多个 select，所以把整批并进集合后只写一次。
   * 缩放（NodeResizer）发的是 dimensions 变更，尺寸的唯一真源同样在 store，
   * 写回 width/height 后节点才不会被下一次渲染还原；历史由 resize 的开始/结束统一管（只记一条）。
   */
  const onNodesChange = useCallback(
    (changes: NodeChange<ThoughtNodeType>[]) => {
      let nextSel: ID[] | null = null;
      const removed: ID[] = [];
      for (const c of changes) {
        if (c.type === 'position' && c.position) moveLive(c.id, c.position);
        else if (c.type === 'dimensions' && c.dimensions)
          updateNodeLive(c.id, {
            width: Math.round(c.dimensions.width),
            height: Math.round(c.dimensions.height),
          });
        else if (c.type === 'remove') removed.push(c.id);
        else if (c.type === 'select') {
          const base: ID[] = nextSel ?? useMapStore.getState().selectedIds;
          nextSel = c.selected ? [...base, c.id] : base.filter((id: ID) => id !== c.id);
        }
      }
      if (nextSel) setSelected([...new Set(nextSel)]);
      if (removed.length) deleteNodes(removed);
    },
    [moveLive, updateNodeLive, setSelected, deleteNodes],
  );

  /**
   * 用户亲手拉线，锚点方向即语义（draw.io 范式，没有模式开关）：
   * 从下边锚点拉出 → Tree 父子线；从左右锚点拉出 → 自由联想线。
   * 上边锚点只是「入口」，不允许从它拉出，避免同一根线有两种解释。
   */
  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target || c.source === c.target) return;
      if (c.sourceHandle === 'b') setParent(c.target, c.source);
      else addFreeLink(c.source, c.target);
    },
    [setParent, addFreeLink],
  );

  /**
   * 点线即断（两种线都走 commit，Ctrl+Z 都能找回）：
   * - 粉色自由联想线 → 删掉这条联想
   * - 灰色父子线 → 断开这条父子关系，子节点变成独立节点（位置不动、内容不动，只是不再有父）
   */
  const onEdgeClick = useCallback(
    (_e: React.MouseEvent, edge: Edge) => {
      if (edge.id.startsWith('f:')) removeFreeLink(edge.id.slice(2));
      else if (edge.id.startsWith('t:')) setParent(edge.target, null);
    },
    [removeFreeLink, setParent],
  );

  const onNodeContextMenu = useCallback(
    (e: React.MouseEvent, node: ThoughtNodeType) => {
      e.preventDefault();
      // 右键拖过（平移画布）就别弹菜单了；只有原地轻点才算「叫菜单」
      const start = rightDown.current;
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > RIGHT_CLICK_SLOP) return;
      setSelected([node.id]);
      setMenu({ id: node.id, x: e.clientX, y: e.clientY });
    },
    [setSelected],
  );

  const closeMenu = useCallback(() => setMenu(null), []);

  const menuNode = menu ? doc.nodes[menu.id] : undefined;

  return (
    <div className="canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onEdgeClick={onEdgeClick}
        onNodeContextMenu={onNodeContextMenu}
        /* 右键现在是平移键，空白与连线上的原生浏览器菜单一律屏蔽，免得每次拖完弹一下 */
        onPaneContextMenu={(e) => e.preventDefault()}
        onEdgeContextMenu={(e) => e.preventDefault()}
        onNodeDragStart={() => {
          closeMenu();
          beginEdit();
        }}
        onNodeDragStop={endEdit}
        onMoveStart={closeMenu}
        onPaneClick={() => {
          closeMenu();
          setSelected([]);
        }}
        connectionMode={ConnectionMode.Loose}
        /* 左键 = 选中：拖空白拉框选；右键（和中键）= 平移画布。
           Shift / Ctrl 仍是加选，点空白 = 取消选中。 */
        selectionOnDrag
        panOnDrag={[1, 2]}
        multiSelectionKeyCode={['Shift', 'Control', 'Meta']}
        noPanClassName={NO_PAN_CLASS}
        deleteKeyCode={null}
        fitView
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        {/* 网格点：深色底用深灰点，白色底用浅灰点，否则相互看不见 */}
        <Background gap={20} size={1} color={theme === 'dark' ? '#2a2f3a' : '#ccd3e0'} />
        <Controls showInteractive={false} />
      </ReactFlow>

      {menu && menuNode && (
        <>
          <div className="ctx-backdrop" onClick={closeMenu} onContextMenu={(e) => e.preventDefault()} />
          <div className="ctx-menu" style={{ left: menu.x, top: menu.y }}>
            <button
              className="ctx-item"
              onClick={() => {
                addNode({ parentId: menu.id });
                closeMenu();
              }}
            >
              新建子节点
            </button>
            <button
              className="ctx-item"
              onClick={() => {
                addNode({ parentId: menuNode.parentId });
                closeMenu();
              }}
            >
              新建同级节点
            </button>
            <button
              className="ctx-item"
              onClick={() => {
                updateNode(menu.id, { locked: !menuNode.locked });
                closeMenu();
              }}
            >
              {menuNode.locked ? '解除位置锁定' : '锁定位置'}
            </button>
            <button
              className="ctx-item ctx-item--danger"
              onClick={() => {
                deleteNodes([menu.id]);
                closeMenu();
              }}
            >
              删除节点
            </button>
          </div>
        </>
      )}

      {matched && <div className="canvas-search">搜索命中 {matched.size} 个节点</div>}
    </div>
  );
}
