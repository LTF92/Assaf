import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

import { detectDirection, type Dir } from './direction';
import { isRTL, setLanguage, type Lang } from './i18n';
import { applyColors, type AccentName, type ThemeMode } from './theme';

export interface Settings {
  theme: ThemeMode | 'system';
  accent: AccentName;
  fontScale: number;
  language: Lang | 'system';
  textDirection: 'auto' | Dir;
  toolSteps: 'collapsed' | 'expanded' | 'hidden';
  timestamps: boolean;
  sendOnEnter: boolean;
  animations: boolean;
  haptics: boolean;
  appLock: boolean;
  lockAfterMin: number;
  notifications: boolean;
}

export const DEFAULTS: Settings = {
  theme: 'dark',
  accent: 'gold',
  fontScale: 1,
  language: 'system',
  textDirection: 'auto',
  toolSteps: 'collapsed',
  timestamps: false,
  sendOnEnter: false,
  animations: true,
  haptics: true,
  appLock: false,
  lockAfterMin: 0,
  notifications: true,
};

const KEY = 'hm.settings.v1';

/**
 * The settings as of the last render, for code outside React (helpers that
 * pick a text direction or fire a haptic). Components use useSettings().
 */
export let current: Settings = { ...DEFAULTS };

/** Reading direction for a piece of text, following the user's choice. */
export function textDir(text: string): Dir {
  if (current.textDirection !== 'auto') return current.textDirection;
  return detectDirection(text) ?? (isRTL ? 'rtl' : 'ltr');
}

interface Ctx {
  settings: Settings;
  ready: boolean;
  /** Changes whenever anything visual changes; used to rebuild styles. */
  themeKey: string;
  mode: ThemeMode;
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  reset: () => void;
}

const SettingsContext = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [ready, setReady] = useState(false);
  const scheme = useColorScheme();

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => raw && setSettings({ ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) }))
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const mode: ThemeMode = settings.theme === 'system' ? (scheme === 'light' ? 'light' : 'dark') : settings.theme;

  // Apply synchronously during render so every child of this render already sees the new palette and strings.
  current = settings;
  applyColors(mode, settings.accent);
  setLanguage(settings.language);
  const themeKey = `${mode}.${settings.accent}.${settings.fontScale}.${settings.language}.${settings.textDirection}`;

  const set = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      void AsyncStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setSettings(DEFAULTS);
    void AsyncStorage.removeItem(KEY);
  }, []);

  const value = useMemo(() => ({ settings, ready, themeKey, mode, set, reset }), [settings, ready, themeKey, mode, set, reset]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): Ctx {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings outside SettingsProvider');
  return ctx;
}
