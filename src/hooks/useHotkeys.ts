import { useEffect } from 'react';
import { useMapStore } from '../stores/mapStore';

/** 正在输入框里打字时，不抢键盘事件 */
function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
}

/**
 * 全局快捷键。所有动作都只作用于「用户已经选中的节点」，
 * 空选中时一律不拦截，保证 Tab 仍能正常切换焦点（可访问性）。
 */
export function useHotkeys() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const s = useMapStore.getState();
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        s.redo();
        return;
      }
      if (e.key === 'Escape') {
        s.setSelected([]);
        return;
      }

      const ids = s.selectedIds;
      if (ids.length === 0) return;
      if (mod) return;

      if (e.key === 'Tab') {
        e.preventDefault();
        s.addNode({ parentId: ids[0] });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        s.addNode({ parentId: s.doc.nodes[ids[0]]?.parentId ?? null });
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        // Delete 与 Backspace 都能删，一次删掉全部选中项，只产生一条撤销记录
        e.preventDefault();
        s.deleteNodes(ids);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
