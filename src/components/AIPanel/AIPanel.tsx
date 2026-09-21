import { useRef, useState } from 'react';
import { useAIStore } from '../../stores/aiStore';
import { useMapStore } from '../../stores/mapStore';
import type { AIConfig } from '../../services/ai';

const POS_KEY = 'freethought-map:ai-pos:v1';

type Pos = { x: number; y: number };

/** 窗口太小时也别让面板跑到看不见的地方 */
function clampPos(p: Pos): Pos {
  return {
    x: Math.min(Math.max(0, p.x), Math.max(0, window.innerWidth - 80)),
    y: Math.min(Math.max(0, p.y), Math.max(0, window.innerHeight - 40)),
  };
}

function loadPos(): Pos {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Pos;
      if (Number.isFinite(p.x) && Number.isFinite(p.y)) return clampPos(p);
    }
  } catch {
    // 存档损坏就用默认位置
  }
  return { x: Math.max(8, window.innerWidth - 368), y: 72 };
}

/**
 * AI 面板：描述 → 生成 → 预览 → 用户点「确认写入」才落进画布。
 * 这里没有任何自动建节点、自动连线、自动整理的路径。
 * 面板是可自由拖动的浮窗（拖标题栏移动，位置记在本地），不占画布宽度。
 */
export default function AIPanel() {
  const open = useAIStore((s) => s.open);
  const loading = useAIStore((s) => s.loading);
  const error = useAIStore((s) => s.error);
  const prompt = useAIStore((s) => s.prompt);
  const preview = useAIStore((s) => s.preview);
  const config = useAIStore((s) => s.config);
  const setOpen = useAIStore((s) => s.setOpen);
  const setPrompt = useAIStore((s) => s.setPrompt);
  const setPreview = useAIStore((s) => s.setPreview);
  const setConfig = useAIStore((s) => s.setConfig);
  const generate = useAIStore((s) => s.generate);

  const selectedId = useMapStore((s) => s.selectedIds[0]);
  const addNode = useMapStore((s) => s.addNode);

  const [mode, setMode] = useState<'new' | 'expand'>('new');
  const [draft, setDraft] = useState<AIConfig>(config);
  const [pos, setPos] = useState<Pos>(loadPos);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  if (!open) return null;

  const startDrag = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return; // 标题栏上的按钮照常点击
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onDrag = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setPos(clampPos({ x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy }));
  };

  const endDrag = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
    const final = clampPos({ x: e.clientX - d.dx, y: e.clientY - d.dy });
    setPos(final);
    try {
      localStorage.setItem(POS_KEY, JSON.stringify(final));
    } catch {
      // 存不下也不影响本次使用
    }
  };

  const write = () => {
    const text = preview.trim();
    const map = useMapStore.getState();

    if (mode === 'expand' && selectedId) {
      const node = map.doc.nodes[selectedId];
      if (!node) return;
      // 追加而非覆盖：AI 只是补充，不销毁用户已有的正文
      map.updateNode(selectedId, { body: [node.body, text].filter(Boolean).join('\n') });
    } else {
      const title = prompt.trim().split('\n')[0].slice(0, 16) || '新节点';
      addNode({ parentId: selectedId, title, body: text });
    }
    setPreview('');
    setPrompt('');
  };

  return (
    <aside className="ai-panel" style={{ left: pos.x, top: pos.y }}>
      <div
        className="ai-head"
        onPointerDown={startDrag}
        onPointerMove={onDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        title="拖动这里可以移动面板"
      >
        <span
          className="ai-title"
          title="AI 只写文本：不建节点、不连线、不整理结构；生成结果先预览，点确认才落进画布"
        >
          AI · 笔与资料库
        </span>
        <button className="tbtn" onClick={() => setOpen(false)}>
          关闭
        </button>
      </div>

      <div className="toolbar-group" role="group" aria-label="生成模式">
        <button className={`tbtn${mode === 'new' ? ' is-active' : ''}`} onClick={() => setMode('new')}>
          写新节点
        </button>
        <button
          className={`tbtn${mode === 'expand' ? ' is-active' : ''}`}
          onClick={() => setMode('expand')}
          disabled={!selectedId}
        >
          扩展选中节点
        </button>
      </div>

      <label className="ai-label" htmlFor="ai-prompt">
        用一句话或一段话描述你的想法
      </label>
      <textarea
        id="ai-prompt"
        className="ai-textarea"
        rows={4}
        value={prompt}
        placeholder="例如：把「注意力残留」解释成一句能记住的话"
        onChange={(e) => setPrompt(e.target.value)}
      />

      <button className="tbtn tbtn--primary" disabled={loading} onClick={() => void generate(mode)}>
        {loading ? '生成中…' : '让 AI 生成'}
      </button>

      {error && <p className="ai-error">{error}</p>}

      <label
        className="ai-label"
        htmlFor="ai-preview"
        title="生成结果先到这里，可以直接改；点「确认写入」才会落进画布"
      >
        预览
      </label>
      <textarea
        id="ai-preview"
        className="ai-textarea"
        rows={5}
        value={preview}
        placeholder="生成结果显示在这里，可直接修改"
        onChange={(e) => setPreview(e.target.value)}
      />

      <button className="tbtn tbtn--primary" disabled={!preview.trim() && !prompt.trim()} onClick={write}>
        {mode === 'expand' && selectedId ? '确认写入选中节点' : '确认写入新节点'}
      </button>
      <p className="ai-hint">
        {selectedId ? '新节点会挂到你当前选中的节点下面。' : '当前未选中节点，新节点会挂到中心主题下面。'}
      </p>

      <details className="ai-settings">
        <summary>接口设置</summary>
        <label className="ai-label" htmlFor="ai-base" title="OpenAI 兼容的接口地址">
          Base URL
        </label>
        <input
          id="ai-base"
          className="ai-input"
          value={draft.baseUrl}
          onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
        />
        <label className="ai-label" htmlFor="ai-model">
          模型
        </label>
        <input
          id="ai-model"
          className="ai-input"
          value={draft.model}
          onChange={(e) => setDraft({ ...draft, model: e.target.value })}
        />
        <label className="ai-label" htmlFor="ai-key" title="只保存在本机浏览器，可以为空">
          API Key
        </label>
        <input
          id="ai-key"
          className="ai-input"
          type="password"
          value={draft.apiKey}
          onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
        />
        <button className="tbtn" onClick={() => setConfig(draft)}>
          保存设置
        </button>
      </details>
    </aside>
  );
}
