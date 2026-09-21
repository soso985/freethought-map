import { create } from 'zustand';

export type Theme = 'light' | 'dark';

const KEY = 'freethought-map:theme:v1';

/** 只认 'dark'；没有存档（首次打开）就是白色主题 */
const read = (): Theme => (localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light');

type ThemeState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

/**
 * 主题只影响配色，与文档、AI 状态无关，所以单独一个 store。
 * 具体颜色全写在 index.css 的 CSS 变量里，这里只负责切换 <html data-theme>。
 */
export const useThemeStore = create<ThemeState>((set) => ({
  theme: read(),

  setTheme: (theme) => {
    localStorage.setItem(KEY, theme);
    document.documentElement.dataset.theme = theme;
    set({ theme });
  },
}));

// import 时就落到 <html> 上，避免「记住的是深色 → 打开先白闪一帧」
document.documentElement.dataset.theme = useThemeStore.getState().theme;
