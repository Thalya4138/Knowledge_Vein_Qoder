import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/**
 * 全站偏好：主题（白天 / 夜间 / 跟随系统）与模型接入设置。
 * 主题存本机（不是隐私）。模型设置（含 key）默认存在当前标签页（sessionStorage）：刷新不丢、关掉标签页即清；
 * 用户勾选「在这台电脑上记住」才写 localStorage，可随时一键清除（AGENTS.md §1 第 7 条）。
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

/**
 * 界面语言。英文模式只覆盖外壳、封面、设置、入门文档与四个板块的入口层；
 * 示例讲义正文、导图编辑器与阅读器内部仍为中文（切换时界面上会说明）。
 * 文案原地写成中英一对：t('学习工作台', 'Study Desk')——改中文的人一眼看得到英文要不要跟着改。
 */
export type Lang = 'zh' | 'en';
const LANG_KEY = 'vein.lang';

function savedLang(): Lang {
  return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'zh';
}

/** 在首次渲染前调用：<html lang> 决定断词、字体回退与读屏语言。 */
export function initLang() {
  document.documentElement.lang = savedLang() === 'en' ? 'en' : 'zh-CN';
}

export interface ModelConfig {
  provider: 'openai-compatible' | 'anthropic';
  baseUrl: string;
  model: string;
  apiKey: string;
}

const MODEL_KEY = 'vein.model';
const EMPTY_MODEL: ModelConfig = { provider: 'openai-compatible', baseUrl: '', model: '', apiKey: '' };

function parseModel(raw: string | null): ModelConfig | null {
  if (!raw) return null;
  try {
    const m = JSON.parse(raw) as Partial<ModelConfig>;
    return { ...EMPTY_MODEL, ...m };
  } catch {
    return null;
  }
}

/** 先看「记住」的，再看当前标签页的 */
function loadModel(): { model: ModelConfig; remembered: boolean } {
  try {
    const kept = parseModel(localStorage.getItem(MODEL_KEY));
    if (kept) return { model: kept, remembered: true };
    const tab = parseModel(sessionStorage.getItem(MODEL_KEY));
    if (tab) return { model: tab, remembered: false };
  } catch {
    /* 存储被禁用（隐私模式等）：退回只在内存 */
  }
  return { model: EMPTY_MODEL, remembered: false };
}

interface Prefs {
  lang: Lang;
  setLang: (l: Lang) => void;
  theme: ThemePref;
  setTheme: (t: ThemePref) => void;
  resolvedDark: boolean;
  model: ModelConfig;
  /** remember = 在这台电脑上记住（localStorage）；否则只存在当前标签页 */
  setModel: (m: ModelConfig, remember: boolean) => void;
  /** 当前设置是否记在这台电脑上 */
  modelRemembered: boolean;
  /** 清除这台电脑与当前标签页里保存的模型设置 */
  forgetModel: () => void;
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
  const [initial] = useState(loadModel);
  const [model, setModelState] = useState<ModelConfig>(initial.model);
  const [modelRemembered, setRemembered] = useState(initial.remembered);
  const setModel = useCallback((m: ModelConfig, remember: boolean) => {
    try {
      sessionStorage.setItem(MODEL_KEY, JSON.stringify(m));
      if (remember) localStorage.setItem(MODEL_KEY, JSON.stringify(m));
      else localStorage.removeItem(MODEL_KEY);
    } catch {
      /* 存不进去就只在内存里 */
    }
    setModelState(m);
    setRemembered(remember);
  }, []);
  const forgetModel = useCallback(() => {
    try {
      sessionStorage.removeItem(MODEL_KEY);
      localStorage.removeItem(MODEL_KEY);
    } catch {
      /* 无存储可清 */
    }
    setModelState(EMPTY_MODEL);
    setRemembered(false);
  }, []);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('model');
  const [lang, setLangState] = useState<Lang>(savedLang);
  const setLang = useCallback((l: Lang) => {
    localStorage.setItem(LANG_KEY, l);
    document.documentElement.lang = l === 'en' ? 'en' : 'zh-CN';
    setLangState(l);
  }, []);

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
      lang,
      setLang,
      theme,
      setTheme,
      resolvedDark,
      model,
      setModel,
      modelRemembered,
      forgetModel,
      settingsOpen,
      settingsTab,
      openSettings: (tab = 'model') => {
        setSettingsTab(tab);
        setSettingsOpen(true);
      },
      closeSettings: () => setSettingsOpen(false),
    }),
    [lang, setLang, theme, setTheme, resolvedDark, model, setModel, modelRemembered, forgetModel, settingsOpen, settingsTab],
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

/** 中英一对里取当前语言的那一个。 */
export function useT(): (zh: string, en: string) => string {
  const { lang } = usePrefs();
  return useCallback((zh: string, en: string) => (lang === 'en' ? en : zh), [lang]);
}
