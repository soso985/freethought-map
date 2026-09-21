import { BaseEdge, Position, getBezierPath, useInternalNode, type EdgeProps, type InternalNode } from '@xyflow/react';
import { DEFAULT_NODE_H, DEFAULT_NODE_W } from '../../utils/layout';

type Pt = { x: number; y: number; position: Position };

/** 节点中心（用实测尺寸；未测量前回落到布局默认值） */
function center(n: InternalNode) {
  const { x, y } = n.internals.positionAbsolute;
  return {
    x: x + (n.measured.width ?? DEFAULT_NODE_W) / 2,
    y: y + (n.measured.height ?? DEFAULT_NODE_H) / 2,
    w: n.measured.width ?? DEFAULT_NODE_W,
    h: n.measured.height ?? DEFAULT_NODE_H,
  };
}

/**
 * 「从节点中心朝 toward 方向射出」与节点矩形边框的交点，以及交点落在哪条边上。
 * 射线与边框相交：横向、纵向各算一个缩放系数，取小的那个就是先碰到的那条边。
 */
function borderPoint(n: InternalNode, toward: { x: number; y: number }): Pt {
  const { x, y, w, h } = center(n);
  const dx = toward.x - x;
  const dy = toward.y - y;
  if (dx === 0 && dy === 0) return { x, y: y + h / 2, position: Position.Bottom };

  const kx = dx === 0 ? Infinity : w / 2 / Math.abs(dx);
  const ky = dy === 0 ? Infinity : h / 2 / Math.abs(dy);
  const k = Math.min(kx, ky);

  return {
    x: x + dx * k,
    y: y + dy * k,
    position: kx <= ky ? (dx > 0 ? Position.Right : Position.Left) : dy > 0 ? Position.Bottom : Position.Top,
  };
}

/**
 * 父子线：进出边由两个节点的相对位置实时决定，不写死「父底 → 子上」。
 *
 * 为什么需要它：节点位置完全由用户摆，子节点可能落在父节点的上方、左方、右方。
 * 如果锚点钉死在「父底 → 子上」，子节点一旦跑到父节点上方，线就得从父节点底边出发、
 * 绕大半张图再钻进子节点顶边——节点越多、挪得越散，绕的圈越大。
 *
 * 这里改成：取两个节点中心连线，各自与自己的边框相交，交点在哪条边就从哪条边进出。
 * 位置一变线就跟着变，永远走最近的一侧。
 *
 * 边上的 sourceHandle/targetHandle 仍在 Canvas.tsx 里保留（'b'/'t'），
 * 只为了让 React Flow 能解析出这条边；实际画线位置由本组件覆盖。
 */
export function AutoTreeEdge({ id, source, target, style, markerEnd }: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  if (!sourceNode || !targetNode) return null;

  const from = borderPoint(sourceNode, center(targetNode));
  const to = borderPoint(targetNode, center(sourceNode));

  const [path] = getBezierPath({
    sourceX: from.x,
    sourceY: from.y,
    sourcePosition: from.position,
    targetX: to.x,
    targetY: to.y,
    targetPosition: to.position,
  });

  return <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />;
}
