import { useEffect, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import Canvas from './components/Canvas/Canvas';
import Toolbar from './components/Toolbar/Toolbar';
import AIPanel from './components/AIPanel/AIPanel';
import Inspector from './components/Inspector/Inspector';
import OutlineView from './components/Sidebar/OutlineView';
import { useHotkeys } from './hooks/useHotkeys';
import { useMapStore } from './stores/mapStore';

export default function App() {
  const load = useMapStore((s) => s.load);
  const hasSelection = useMapStore((s) => s.selectedIds.length > 0);
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);

  // 挂载时恢复本地文档（无存档则用空白图）
  useEffect(() => {
    load();
  }, [load]);

  useHotkeys();

  // ReactFlowProvider 提到最外层：工具栏的「导出图片」需要在 ReactFlow 实例之外拿到节点尺寸
  return (
    <ReactFlowProvider>
      <div className="app">
        <Toolbar
          outlineOpen={outlineOpen}
          onToggleOutline={() => setOutlineOpen((v) => !v)}
          inspectorOpen={inspectorOpen}
          onToggleInspector={() => setInspectorOpen((v) => !v)}
        />
        <div className="app-body">
          {/* 节点面板是「选中节点的属性编辑器」，没有选中就不该占着一栏宽度 */}
          {inspectorOpen && hasSelection && <Inspector />}
          <Canvas />
          {outlineOpen && <OutlineView />}
        </div>
        {/* AI 面板是浮在画布上的自由窗口（position: fixed），不参与左右分栏，所以不占画布宽度 */}
        <AIPanel />
      </div>
    </ReactFlowProvider>
  );
}
