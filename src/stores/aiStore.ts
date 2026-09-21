import { create } from 'zustand';
import type { AIConfig } from '../services/ai';
import { generate, isConfigured, loadConfig, saveConfig } from '../services/ai';
import { useMapStore } from './mapStore';

type GenMode = 'new' | 'expand';

type AIState = {
  open: boolean;
  loading: boolean;
  error: string;
  prompt: string;
  preview: string;
  config: AIConfig;

  setOpen: (open: boolean) => void;
  setPrompt: (prompt: string) => void;
  setPreview: (preview: string) => void;
  setError: (error: string) => void;
  setConfig: (config: AIConfig) => void;
  generate: (mode: GenMode) => Promise<void>;
};

export const useAIStore = create<AIState>((set, get) => ({
  open: false,
  loading: false,
  error: '',
  prompt: '',
  preview: '',
  config: loadConfig(),

  setOpen: (open) => set({ open }),
  setPrompt: (prompt) => set({ prompt }),
  setPreview: (preview) => set({ preview }),
  setError: (error) => set({ error }),
  setConfig: (config) => {
    saveConfig(config);
    set({ config });
  },

  generate: async (mode) => {
    const { prompt, config } = get();
    if (!prompt.trim()) {
      set({ error: '先写下你的描述，再让 AI 生成。' });
      return;
    }
    if (!isConfigured(config)) {
      set({ error: '尚未配置 AI 接口，可在下方“接口设置”里填写；也可以直接手写正文走同一条确认流程。' });
      return;
    }

    const map = useMapStore.getState();
    const first = map.selectedIds[0];
    const selected = first ? map.doc.nodes[first] : null;
    if (mode === 'expand' && !selected) {
      set({ error: '请先在画布上选中一个节点，再使用“扩展选中节点”。' });
      return;
    }

    const userPrompt =
      mode === 'expand' && selected
        ? `请扩展下面这个节点的内容。\n【节点标题】${selected.title}\n【已有正文】${selected.body || '（空）'}\n【我的补充描述】${prompt}`
        : `请根据我的描述写出一个节点的正文。\n【我的描述】${prompt}`;

    set({ loading: true, error: '' });
    try {
      const text = await generate(config, userPrompt);
      set({ preview: text, loading: false });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  },
}));
