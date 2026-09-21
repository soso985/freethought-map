import { useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { toPng } from 'html-to-image';
import { useMapStore } from '../../stores/mapStore';
import { useAIStore } from '../../stores/aiStore';
import { useThemeStore } from '../../stores/themeStore';
import { download, stamp, toMarkdown } from '../../utils/doc';
import HelpPanel from '../Help/HelpPanel';

type Props = {
  outlineOpen: boolean;
  onToggleOutline: () => void;
  inspectorOpen: boolean;
  onToggleInspector: () => void;
};

/** 工具栏：所有操作都由用户亲手触发，没有任何自动行为 */
export default function Toolbar({ outlineOpen, onToggleOutline, inspectorOpen, onToggleInspector }: Props) {
  const doc = useMapStore((s) => s.doc);
  const selectedIds = useMapStore((s) => s.selectedIds);
  const canUndo = useMapStore((s) => s.past.length > 0);
  const canRedo = useMapStore((s) => s.future.length > 0);

  const addNode = useMapStore((s) => s.addNode);
  const deleteNodes = useMapStore((s) => s.deleteNodes);
  const applyTreeLayout = useMapStore((s) => s.applyTreeLayout);
  const undo = useMapStore((s) => s.undo);
  const redo = useMapStore((s) => s.redo);
  const reset = useMapStore((s) => s.reset);

  const aiOpen = useAIStore((s) => s.open);
  const toggleAI = useAIStore((s) => s.setOpen);

  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  // getNodesBounds 需要 React Flow 实例上下文（缩放等），必须从 hook 取，不能直接 import
  const { getNodes, getNodesBounds } = useReactFlow();
  const [exporting, setExporting] = useState(false);

  const exportJSON = () =>
    download(`freethought-map-${stamp()}.json`, JSON.stringify(doc, null, 2), 'application/json');
  const exportMarkdown = () =>
    download(`freethought-map-${stamp()}.md`, toMarkdown(doc), 'text/markdown');

  /**
   * 导出 PNG：把视图容器按「全部可见节点的包围盒」重新摆正后截图。
   * 这样导出结果与用户当前的缩放/平移无关，永远是一张完整的图。
   */
  const exportPNG = async () => {
    const viewport = document.querySelector<HTMLElement>('.react-flow__viewport');
    const nodes = getNodes();
    if (!viewport || nodes.length === 0) return;

    const b = getNodesBounds(nodes);
    const PAD = 40;
    const width = Math.ceil(b.width + PAD * 2);
    const height = Math.ceil(b.height + PAD * 2);

    setExporting(true);
    try {
      // 底色跟着当前主题走：直接读 CSS 变量，避免和 index.css 各写一份
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#f5f6f8';
      const url = await toPng(viewport, {
        backgroundColor: bg,
        width,
        height,
        pixelRatio: 2,
        style: {
          width: `${width}px`,
          height: `${height}px`,
          transform: `translate(${-b.x + PAD}px, ${-b.y + PAD}px) scale(1)`,
        },
      });
      const a = document.createElement('a');
      a.href = url;
      a.download = `freethought-map-${stamp()}.png`;
      a.click();
    } catch (e) {
      window.alert(`导出图片失败：${(e as Error).message}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
    <header className="toolbar">
      <span className="toolbar-brand">FreeThought Map</span>
      <span className="toolbar-hint">框架我定 · 节点我建 · 连线我拉 · 位置我摆</span>

      <div className="toolbar-group">
        <button
          className="tbtn"
          onClick={() => addNode({ parentId: selectedIds[0] })}
          title="选中节点时挂在它下面，未选中则建顶层节点（Tab）"
        >
          新建节点
        </button>
        <button
          className="tbtn"
          disabled={selectedIds.length === 0}
          onClick={() => deleteNodes(selectedIds)}
          title="子节点会上提一级，不会连带丢掉内容（Delete / Backspace）"
        >
          {selectedIds.length > 1 ? `删除 ${selectedIds.length} 个节点` : '删除节点'}
        </button>
      </div>

      <div className="toolbar-group">
        <button
          className="tbtn"
          onClick={applyTreeLayout}
          title="按父子层级把全部节点重新摆成自上而下的树：只改视觉位置，不改父子关系；锁定的节点不动，可用 Ctrl+Z 撤销"
        >
          一键整理位置
        </button>
        <button className="tbtn" disabled={!canUndo} onClick={undo} title="Ctrl+Z">
          撤销
        </button>
        <button className="tbtn" disabled={!canRedo} onClick={redo} title="Ctrl+Shift+Z / Ctrl+Y">
          重做
        </button>
      </div>

      <div className="toolbar-group">
        <button className="tbtn" onClick={() => toggleAI(!aiOpen)} title="AI 只写文本：生成结果先预览，确认后才进画布">
          {aiOpen ? '隐藏 AI 面板' : 'AI 面板'}
        </button>
        <button
          className="tbtn"
          onClick={onToggleInspector}
          title="选中节点时才出现，点空白即消失；这里改标题 / 正文 / 标签 / 外观 / 层级"
        >
          {inspectorOpen ? '隐藏节点面板' : '显示节点面板'}
        </button>
        <button className="tbtn" onClick={onToggleOutline} title="按父子层级列出全部节点，可搜索与跳转">
          {outlineOpen ? '隐藏大纲' : '显示大纲'}
        </button>
      </div>

      <span className="toolbar-spacer" />

      <div className="toolbar-group">
        <button
          className="tbtn"
          onClick={exportPNG}
          disabled={exporting}
          title="按全部可见节点的范围截图，与当前缩放、平移无关"
        >
          {exporting ? '导出中…' : '导出图片'}
        </button>
        <button className="tbtn" onClick={exportMarkdown} title="单向导出，不提供反向导入">
          导出 Markdown
        </button>
        <button className="tbtn" onClick={exportJSON} title="完整存档文件">
          导出 JSON
        </button>
        <button
          className="tbtn"
          onClick={() => {
            if (window.confirm('清空当前全部节点，重新开始？此操作可用撤销找回。')) reset();
          }}
          title="清空全部节点重新开始（可 Ctrl+Z 找回）"
        >
          新建图
        </button>
        <button
          className="tbtn"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title={`当前：${theme === 'dark' ? '深色' : '白色'}主题，点击切换；选择会被记住`}
        >
          {theme === 'dark' ? '白色主题' : '深色主题'}
        </button>
        <HelpPanel />
      </div>
    </header>
    </>
  );
}
