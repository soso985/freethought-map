import { memo, useState } from 'react';
import { Handle, NodeResizer, Position, type Node, type NodeProps } from '@xyflow/react';
import { useMapStore } from '../../stores/mapStore';
import type { NodeShape } from '../../types';

export type ThoughtNodeData = {
  title: string;
  body: string;
  tags: string[];
  color?: string;
  locked?: boolean;
  collapsed?: boolean;
  hasChildren?: boolean;
  /** 命中当前搜索关键词（仅视觉高亮） */
  match?: boolean;
  shape?: NodeShape;
  width?: number;
  height?: number;
};

export type ThoughtNodeType = Node<ThoughtNodeData, 'thought'>;

function ThoughtNodeView({ id, data, selected }: NodeProps<ThoughtNodeType>) {
  const updateNode = useMapStore((s) => s.updateNode);
  const toggleCollapse = useMapStore((s) => s.toggleCollapse);
  const beginEdit = useMapStore((s) => s.beginEdit);
  const endEdit = useMapStore((s) => s.endEdit);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const startEdit = () => {
    setDraft(data.title);
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== data.title) updateNode(id, { title: next });
  };

  return (
    <div
      className={`tnode tnode--${data.shape ?? 'rounded'}${selected ? ' is-selected' : ''}${
        data.locked ? ' is-locked' : ''
      }${data.match ? ' is-match' : ''}`}
      style={{ width: data.width, height: data.height, borderColor: data.color }}
      title={data.body || undefined}
      onDoubleClick={startEdit}
    >
      {/* 选中后才出现的缩放手柄：拖四角/四边即可缩放，松手整个缩放只记一条历史（Ctrl+Z 一次撤回）。
          min/max 与 Inspector 的数值输入保持一致，两条路径改的是同一份 width/height。 */}
      {selected && (
        <NodeResizer
          minWidth={80}
          minHeight={40}
          maxWidth={800}
          maxHeight={800}
          onResizeStart={beginEdit}
          onResizeEnd={endEdit}
        />
      )}

      {/* 上=父锚点（只能被连入），下=子锚点 → 从下方拉出的是 Tree 父子线 */}
      <Handle type="target" position={Position.Top} id="t" isConnectableStart={false} />
      {/* 左右=联想锚点 → 从左右拉出的是自由联想线 */}
      <Handle type="source" position={Position.Left} id="l" />
      <Handle type="source" position={Position.Right} id="r" />

      {editing ? (
        <input
          className="tnode-input nodrag"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setEditing(false);
          }}
        />
      ) : (
        <div className="tnode-title">{data.title || '未命名'}</div>
      )}

      {data.body && <div className="tnode-body">{data.body}</div>}
      {data.tags.length > 0 && (
        <div className="tnode-tags">
          {data.tags.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      )}

      {/* 位置锁定：不占用节点文字区，只在右下角点一个小锁（形状随节点走） */}
      {data.locked && (
        <span className="tnode-lock" title="位置已锁定">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <rect x="4.5" y="10.5" width="15" height="9.5" rx="2" />
            <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
          </svg>
        </span>
      )}

      {data.hasChildren && (
        <div className="tnode-bar">
          <button
            className="tnode-fold nodrag"
            onClick={(e) => {
              e.stopPropagation();
              toggleCollapse(id);
            }}
          >
            {data.collapsed ? '展开' : '折叠'}
          </button>
        </div>
      )}

      <Handle type="source" position={Position.Bottom} id="b" />
    </div>
  );
}

export const ThoughtNode = memo(ThoughtNodeView);
