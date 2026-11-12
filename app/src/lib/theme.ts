import { useMemo } from 'react';
import { Platform, StyleSheet } from 'react-native';

import { useSettings } from './settings';

export type ThemeMode = 'dark' | 'light' | 'black';
export type AccentName = 'gold' | 'teal' | 'blue' | 'violet' | 'rose' | 'green';

/** Accent colours: [main, gradient end, text on accent]. */
export const ACCENTS: Record<AccentName, [string, string, string]> = {
  gold: ['#F5B544', '#E9873B', '#1A1305'],
  teal: ['#4FC7B9', '#2E8FB8', '#03211D'],
  blue: ['#5B9BFF', '#4A5CF2', '#FFFFFF'],
  violet: ['#A98BF5', '#6E56E0', '#FFFFFF'],
  rose: ['#F27C8E', '#D9488F', '#FFFFFF'],
  green: ['#7FD17A', '#2FA36B', '#08210A'],
};

function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

const BASES: Record<ThemeMode, Record<string, string>> = {
  dark: {
    bg: '#090B10', surface: '#12161F', surface2: '#1A1F2B', surface3: '#222837',
    border: '#232A39', borderStrong: '#2E3648',
    text: '#EEF1F7', textDim: '#9BA4B8', textFaint: '#5F687D',
    code: '#0C0F16', codeText: '#D7DCE8', codeInline: '#FFD58A',
  },
  black: {
    bg: '#000000', surface: '#0D0F14', surface2: '#15181F', surface3: '#1C2029',
    border: '#1C2029', borderStrong: '#272C37',
    text: '#F2F4F8', textDim: '#9BA4B8', textFaint: '#5A6275',
    code: '#07090D', codeText: '#D7DCE8', codeInline: '#FFD58A',
  },
  light: {
    bg: '#F5F6F9', surface: '#FFFFFF', surface2: '#EEF0F5', surface3: '#E3E7EF',
    border: '#E1E5EC', borderStrong: '#CDD3DE',
    text: '#141821', textDim: '#566074', textFaint: '#8C95A8',
    code: '#1A1F2B', codeText: '#E3E7EF', codeInline: '#9A5B00',
  },
};

export function buildColors(mode: ThemeMode, accent: AccentName) {
  const [a, a2, onA] = ACCENTS[accent];
  const b = BASES[mode];
  return {
    bg: b.bg,
    surface: b.surface,
    surface2: b.surface2,
    surface3: b.surface3,
    border: b.border,
    borderStrong: b.borderStrong,
    text: b.text,
    textDim: b.textDim,
    textFaint: b.textFaint,
    code: b.code,
    codeText: b.codeText,
    codeInline: b.codeInline,
    accent: a,
    accent2: a2,
    accentSoft: hexA(a, mode === 'light' ? 0.16 : 0.14),
    accentGlow: hexA(a, 0.35),
    accentText: onA,
    userBubble: a,
    userText: onA,
    danger: mode === 'light' ? '#D6404A' : '#F2787A',
    dangerSoft: hexA('#F2787A', 0.12),
    ok: mode === 'light' ? '#1F9E8F' : '#5EC2B7',
    warn: mode === 'light' ? '#C98A10' : '#F5B544',
    statusBar: mode === 'light' ? 'dark' : 'light',
  } as const;
}

export type Colors = ReturnType<typeof buildColors>;

/**
 * The live palette. It is replaced in place when the theme setting changes, so
 * code that reads `colors.x` while rendering always gets the current theme.
 */
export const colors: { -readonly [K in keyof Colors]: Colors[K] } = { ...buildColors('dark', 'gold') } as any;

export function applyColors(mode: ThemeMode, accent: AccentName) {
  Object.assign(colors, buildColors(mode, accent));
}

export const radius = { sm: 8, md: 14, lg: 20, xl: 26, pill: 999 };

/** Soft drop shadow for floating things (buttons, cards). */
export const shadow = Platform.select({
  ios: { shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  android: { elevation: 6 },
  default: { boxShadow: '0 6px 18px rgba(0,0,0,0.25)' },
}) as object;

/** Avatar colours per profile: a two-tone pair so each agent is easy to spot. */
export const avatarPalette = [
  ['#F5B544', '#E9773B'],
  ['#5EC2B7', '#3A7BD5'],
  ['#B48CF2', '#6A5AE0'],
  ['#F2787A', '#D9488F'],
  ['#8BD17C', '#2FA36B'],
  ['#6EC1F5', '#4A6CF2'],
];
export const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' });

/** Current palette plus a font-size helper; re-renders the caller when the theme or text size changes. */
export function useTheme() {
  const { themeKey, settings } = useSettings();
  return useMemo(() => ({ colors: { ...colors } as Colors, fs: (n: number) => Math.round(n * settings.fontScale), key: themeKey }), [themeKey, settings.fontScale]);
}

/**
 * Styles that follow the theme: `const useStyles = makeStyles((c, fs) => ({ ... }))`,
 * then `const s = useStyles()` inside the component.
 */
type StylesArg = Parameters<typeof StyleSheet.create>[0];

export function makeStyles<T extends StylesArg>(fn: (c: Colors, fs: (n: number) => number) => T & StylesArg) {
  return function useStyles(): Readonly<T> {
    const { colors: c, fs, key } = useTheme();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return useMemo(() => StyleSheet.create(fn(c, fs)), [key]);
  };
}
