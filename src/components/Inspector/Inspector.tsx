import { useEffect, useMemo, useState } from 'react';
import { useMapStore } from '../../stores/mapStore';
import type { NodeShape } from '../../types';
import { childrenMap, nodeDepth } from '../../utils/doc';
import { DEFAULT_NODE_H, DEFAULT_NODE_W } from '../../utils/layout';

/** 颜色只给一组克制的预设，避免变成「花哨样式」工具 */
const COLORS = ['#60a5fa', '#f472b6', '#34d399', '#fbbf24', '#a78bfa', '#f87171'];

const SHAPES: { value: NodeShape; label: string }[] = [
  { value: 'rect', label: '矩形' },
  { value: 'rounded', label: '圆角' },
  { value: 'ellipse', label: '椭圆' },
  { value: 'diamond', label: '菱形' },
  { value: 'note', label: '便签' },
];

/** 宽高输入：清空或填非法值 = 回到默认尺寸 */
function parseSize(raw: string, min: number, max: number): number | undefined {
  const v = Number(raw);
  if (!Number.isFinite(v) || v <= 0) return undefined;
  return Math.round(Math.min(max, Math.max(min, v)));
}

/**
 * 节点面板：选中节点的全部可编辑属性集中在这里。
 * 标题/正文用 beginEdit → updateNodeLive → endEdit，输入过程实时反映到画布，
 * 但整段输入只产生一条撤销记录。
 */
export default function Inspector() {
  const doc = useMapStore((s) => s.doc);
  const selectedIds = useMapStore((s) => s.selectedIds);
  const updateNode = useMapStore((s) => s.updateNode);
  const updateNodeLive = useMapStore((s) => s.updateNodeLive);
  const beginEdit = useMapStore((s) => s.beginEdit);
  const endEdit = useMapStore((s) => s.endEdit);
  const deleteNodes = useMapStore((s) => s.deleteNodes);
  const setParent = useMapStore((s) => s.setParent);
  const setRoot = useMapStore((s) => s.setRoot);
  const removeFreeLink = useMapStore((s) => s.removeFreeLink);
  const setSelected = useMapStore((s) => s.setSelected);

  const [tagsDraft, setTagsDraft] = useState('');
  const [notice, setNotice] = useState('');

  const selectedId = selectedIds[0];
  const multi = selectedIds.length > 1;
  const node = selectedId ? doc.nodes[selectedId] : undefined;

  // 切换选中节点时重载标签草稿（标签以逗号分隔，边输入边解析会吃掉分隔符，所以只在失焦时写回）
  useEffect(() => {
    setNotice('');
    setTagsDraft(selectedId ? (doc.nodes[selectedId]?.tags ?? []).join(', ') : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const kids = useMemo(() => childrenMap(doc), [doc]);
  const links = useMemo(
    () => (node ? doc.freeLinks.filter((l) => l.a === node.id || l.b === node.id) : []),
    [doc.freeLinks, node],
  );

  // 没有选中节点时不渲染（App 已按选中状态决定挂载与否，这里只是兜底）
  if (!node) return null;

  const commitTags = () => {
    const tags = tagsDraft
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean);
    updateNode(node.id, { tags });
    setTagsDraft(tags.join(', '));
  };

  const changeParent = (value: string) => {
    const ok = setParent(node.id, value || null);
    setNotice(ok ? '' : '不能把节点挂到它自己的后代下面（会形成环）。');
  };

  return (
    <aside className="inspector">
      <div className="panel-head">
        <span className="panel-title">节点</span>
        <span className="panel-meta">
          {multi ? `选中 ${selectedIds.length} 个 · ` : ''}第 {nodeDepth(doc, node.id) + 1} 层 · {links.length} 条联想线
        </span>
      </div>

      {multi && <p className="panel-hint">已选中 {selectedIds.length} 个节点，这里编辑的是其中一个。</p>}

      <label className="field-label" htmlFor="insp-title">
        标题
      </label>
      <input
        id="insp-title"
        className="ai-input"
        value={node.title}
        onFocus={beginEdit}
        onBlur={endEdit}
        onChange={(e) => updateNodeLive(node.id, { title: e.target.value })}
      />

      <label className="field-label" htmlFor="insp-body">
        正文
      </label>
      <textarea
        id="insp-body"
        className="ai-textarea"
        rows={6}
        value={node.body}
        placeholder="写你的想法"
        onFocus={beginEdit}
        onBlur={endEdit}
        onChange={(e) => updateNodeLive(node.id, { body: e.target.value })}
      />

      <label className="field-label" htmlFor="insp-tags" title="多个标签用逗号分隔，例如：疑问, 待查">
        标签
      </label>
      <input
        id="insp-tags"
        className="ai-input"
        value={tagsDraft}
        placeholder="例如：疑问, 待查"
        onChange={(e) => setTagsDraft(e.target.value)}
        onBlur={commitTags}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commitTags();
        }}
      />

      <span className="field-label">颜色</span>
      <div className="swatches">
        <button
          className={`swatch${!node.color ? ' is-active' : ''}`}
          onClick={() => updateNode(node.id, { color: undefined })}
          title="默认色"
        >
          ×
        </button>
        {COLORS.map((c) => (
          <button
            key={c}
            className={`swatch${node.color === c ? ' is-active' : ''}`}
            style={{ background: c }}
            onClick={() => updateNode(node.id, { color: c })}
            title={c}
          />
        ))}
      </div>

      <span className="field-label">形状</span>
      <div className="toolbar-group" role="group" aria-label="节点形状">
        {SHAPES.map((s) => (
          <button
            key={s.value}
            className={`tbtn${(node.shape ?? 'rounded') === s.value ? ' is-active' : ''}`}
            onClick={() => updateNode(node.id, { shape: s.value })}
          >
            {s.label}
          </button>
        ))}
      </div>

      <label className="field-label" htmlFor="insp-w">
        宽 / 高
      </label>
      <div className="insp-size">
        <input
          id="insp-w"
          className="ai-input"
          type="number"
          min={80}
          max={800}
          step={10}
          placeholder={String(DEFAULT_NODE_W)}
          value={node.width ?? ''}
          title={`留空用默认 ${DEFAULT_NODE_W} × ${DEFAULT_NODE_H}；也可以选中节点后直接拖四角缩放`}
          onFocus={beginEdit}
          onBlur={endEdit}
          onChange={(e) => updateNodeLive(node.id, { width: parseSize(e.target.value, 80, 800) })}
        />
        <input
          className="ai-input"
          type="number"
          min={40}
          max={800}
          step={10}
          placeholder={String(DEFAULT_NODE_H)}
          value={node.height ?? ''}
          onFocus={beginEdit}
          onBlur={endEdit}
          onChange={(e) => updateNodeLive(node.id, { height: parseSize(e.target.value, 40, 800) })}
        />
      </div>

      <label
        className="field-label"
        htmlFor="insp-parent"
        title="决定大纲的层级；选「独立节点」= 断开与父节点的关系，位置和内容都不动"
      >
        父节点
      </label>
      <select
        id="insp-parent"
        className="ai-input"
        value={node.parentId ?? ''}
        onChange={(e) => changeParent(e.target.value)}
      >
        {/* 选它 = 断开父子关系，节点变成独立节点（与画布上点灰线断开等价） */}
        <option value="">独立节点</option>
        {Object.values(doc.nodes)
          .filter((n) => n.id !== node.id)
          .map((n) => (
            <option key={n.id} value={n.id}>
              {n.title || '未命名'}
            </option>
          ))}
      </select>
      {notice && <p className="panel-warn">{notice}</p>}

      {node.parentId !== null && (
        <button
          className="tbtn"
          onClick={() => setRoot(node.id)}
          title="把它提到顶层：当前所有顶层节点（含独立节点）会挂到它下面"
        >
          设为中心主题
        </button>
      )}

      <div className="insp-actions">
        <button className="tbtn" onClick={() => updateNode(node.id, { locked: !node.locked })}>
          {node.locked ? '解除位置锁定' : '锁定位置'}
        </button>
        {(kids.get(node.id) ?? []).length > 0 && (
          <button className="tbtn" onClick={() => useMapStore.getState().toggleCollapse(node.id)}>
            {node.collapsed ? '展开后代' : '折叠后代'}
          </button>
        )}
      </div>

      {links.length > 0 && (
        <>
          <span className="field-label">这个节点的自由联想线</span>
          {links.map((l) => {
            const other = doc.nodes[l.a === node.id ? l.b : l.a];
            return (
              <div className="link-row" key={l.id}>
                <span className="link-row-name">{other?.title || '未命名'}</span>
                <button className="tbtn tbtn--danger" onClick={() => removeFreeLink(l.id)}>
                  删除
                </button>
              </div>
            );
          })}
        </>
      )}

      <div className="insp-actions insp-actions--end">
        <button className="tbtn" onClick={() => setSelected([])}>
          取消选中
        </button>
        <button
          className="tbtn tbtn--danger"
          onClick={() => deleteNodes(selectedIds)}
          title="子节点会上提一级，不会连带丢掉内容"
        >
          {multi ? `删除选中的 ${selectedIds.length} 个` : '删除节点'}
        </button>
      </div>
    </aside>
  );
}
