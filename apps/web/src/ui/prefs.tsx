import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/**
 * 全站偏好：主题（白天 / 夜间 / 跟随系统）与模型接入设置。
 * 主题存本机（不是隐私）；API key 只存在本页内存，刷新即清除（AGENTS.md §1 第 7 条）。
 */

export type ThemePref = 'light' | 'dark' | 'system';
const THEME_KEY = 'vein.theme';

function systemDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function applyTheme(pref: ThemePref) {
  const dark = pref === 'dark' || (pref === 'system' && systemDark());
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

/** 在首次渲染前调用，避免白天 / 夜间闪一下。 */
export function initTheme() {
  const saved = (localStorage.getItem(THEME_KEY) as ThemePref | null) ?? 'system';
  applyTheme(saved);
}

export interface ModelConfig {
  provider: 'openai-compatible' | 'anthropic';
  baseUrl: string;
  model: string;
  apiKey: string;
}

interface Prefs {
  theme: ThemePref;
  setTheme: (t: ThemePref) => void;
  resolvedDark: boolean;
  model: ModelConfig;
  setModel: (m: ModelConfig) => void;
  settingsOpen: boolean;
  openSettings: (tab?: SettingsTab) => void;
  closeSettings: () => void;
  settingsTab: SettingsTab;
}

export type SettingsTab = 'model' | 'storage' | 'appearance' | 'account';

const Ctx = createContext<Prefs | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePref>(() => (localStorage.getItem(THEME_KEY) as ThemePref | null) ?? 'system');
  const [resolvedDark, setResolvedDark] = useState(() => document.documentElement.dataset.theme === 'dark');
  const [model, setModel] = useState<ModelConfig>({ provider: 'openai-compatible', baseUrl: '', model: '', apiKey: '' });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('model');

  const setTheme = useCallback((t: ThemePref) => {
    localStorage.setItem(THEME_KEY, t);
    setThemeState(t);
  }, []);

  useEffect(() => {
    const sync = () => {
      applyTheme(theme);
      setResolvedDark(document.documentElement.dataset.theme === 'dark');
    };
    sync();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [theme]);

  const value = useMemo<Prefs>(
    () => ({
      theme,
      setTheme,
      resolvedDark,
      model,
      setModel,
      settingsOpen,
      settingsTab,
      openSettings: (tab = 'model') => {
        setSettingsTab(tab);
        setSettingsOpen(true);
      },
      closeSettings: () => setSettingsOpen(false),
    }),
    [theme, setTheme, resolvedDark, model, settingsOpen, settingsTab],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePrefs(): Prefs {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePrefs 必须在 PrefsProvider 内使用');
  return v;
}

/** 模型是否已配置（填了地址、模型名与 key）。 */
export function modelReady(m: ModelConfig): boolean {
  return Boolean(m.baseUrl && m.model && m.apiKey);
}
