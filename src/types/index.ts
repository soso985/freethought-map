export type ID = string;

/** 节点形状：纯视觉属性，不参与任何逻辑判断 */
export type NodeShape = 'rect' | 'rounded' | 'ellipse' | 'diamond' | 'note';

/**
 * 节点：逻辑层级与视觉位置彻底分离的唯一真源。
 * - parentId 决定 Tree 父子关系（逻辑层，决定大纲）
 * - position 只是视觉坐标，拖拽只改这里
 */
export type ThoughtNode = {
  id: ID;
  /** Tree 父子关系的唯一真源；null 表示它没有父节点（顶层 / 独立节点，全图允许多个） */
  parentId: ID | null;
  title: string;
  body: string;
  tags: string[];
  color?: string;
  /** 折叠：隐藏其后代（仅视觉），并在一键 Tree 布局中视为叶子 */
  collapsed?: boolean;
  /** 纯视觉坐标，不参与任何逻辑判断 */
  position: { x: number; y: number };
  /** 锁定的节点不参与一键 Tree 布局 */
  locked?: boolean;
  /** 视觉形状，缺省为 rounded */
  shape?: NodeShape;
  /** 视觉宽高（px）；缺省时由布局按默认尺寸计算 */
  width?: number;
  height?: number;
};

/** 自由联想线：无方向语义、不参与布局与层级计算 */
export type FreeLink = {
  id: ID;
  a: ID;
  b: ID;
};

export type MapDoc = {
  version: 1;
  nodes: Record<ID, ThoughtNode>;
  freeLinks: FreeLink[];
  updatedAt: number;
};
