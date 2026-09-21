import type { ID, MapDoc, ThoughtNode } from '../types';
import { childrenMap, hiddenIds, rootIds } from './doc';

export const DEFAULT_NODE_W = 220;
export const DEFAULT_NODE_H = 84;
const H_GAP = 40;
const V_GAP = 90;

const widthOf = (n: ThoughtNode) => n.width ?? DEFAULT_NODE_W;
const heightOf = (n: ThoughtNode) => n.height ?? DEFAULT_NODE_H;

/**
 * 一键 Tree 布局（可选辅助）。
 * 只计算视觉坐标，绝不改动 parentId 等任何逻辑数据。
 * 节点尺寸用户可自定义，所以这里一律读节点自带宽高，不做任何写死的假设。
 * ponytail: 自写 tidy-tree（O(n)），不引入 d3-hierarchy；单子树根节点比子树跨度还宽时会与同层兄弟轻微重叠。
 */
export function treeLayout(doc: MapDoc): Map<ID, { x: number; y: number }> {
  const kids = childrenMap(doc);
  const hidden = hiddenIds(doc);
  /** 节点中心的 x：叶子依次排开，父节点对齐到子树的中心 */
  const centerX = new Map<ID, number>();
  const depthOf = new Map<ID, number>();
  /** 每一层的最高节点，用来算下一层的 y（节点高矮不一） */
  const rowH: number[] = [];
  let cursorX = 0;

  const place = (id: ID, depth: number): number => {
    const node = doc.nodes[id];
    const w = widthOf(node);
    rowH[depth] = Math.max(rowH[depth] ?? 0, heightOf(node));
    depthOf.set(id, depth);

    const children = (kids.get(id) ?? []).filter((c) => doc.nodes[c] && !hidden.has(c));
    let cx: number;

    if (children.length === 0) {
      cx = cursorX + w / 2;
      cursorX += w + H_GAP;
    } else {
      let first = Number.POSITIVE_INFINITY;
      let last = Number.NEGATIVE_INFINITY;
      for (const c of children) {
        const ccx = place(c, depth + 1);
        if (ccx < first) first = ccx;
        if (ccx > last) last = ccx;
      }
      cx = (first + last) / 2;
    }

    centerX.set(id, cx);
    return cx;
  };

  for (const r of rootIds(doc)) {
    if (hidden.has(r)) continue;
    place(r, 0);
    cursorX += H_GAP;
  }

  const rowY: number[] = [];
  let y = 0;
  for (let d = 0; d < rowH.length; d += 1) {
    rowY[d] = y;
    y += (rowH[d] ?? DEFAULT_NODE_H) + V_GAP;
  }

  const pos = new Map<ID, { x: number; y: number }>();
  for (const [id, cx] of centerX) {
    // position 存的是左上角坐标（与 ThoughtNode.position 语义一致）
    pos.set(id, { x: Math.round(cx - widthOf(doc.nodes[id]) / 2), y: rowY[depthOf.get(id) ?? 0] });
  }
  return pos;
}
