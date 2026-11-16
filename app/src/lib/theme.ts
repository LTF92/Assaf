import { useMemo } from 'react';
import { Platform, StyleSheet } from 'react-native';

import { useSettings } from './settings';

export type ThemeMode = 'dark' | 'light' | 'black';
export type AccentName = 'gold' | 'teal' | 'blue' | 'violet' | 'rose' | 'green';

/** همزة brand: violet #6A00FF, deep violet #16004A, white, lavender #B88CFF. Flat, no gradients. */
export const BRAND = { violet: '#6A00FF', deep: '#16004A', white: '#FFFFFF', lavender: '#B88CFF', tint: '#EDE3FF' };

/** Kept for old saved settings; the brand colour is fixed now. */
export const ACCENTS: Record<AccentName, [string, string, string]> = {
  gold: [BRAND.violet, BRAND.violet, '#FFFFFF'], teal: [BRAND.violet, BRAND.violet, '#FFFFFF'],
  blue: [BRAND.violet, BRAND.violet, '#FFFFFF'], violet: [BRAND.violet, BRAND.violet, '#FFFFFF'],
  rose: [BRAND.violet, BRAND.violet, '#FFFFFF'], green: [BRAND.violet, BRAND.violet, '#FFFFFF'],
};

function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

const LIGHT = {
  bg: '#FFFFFF', surface: '#F5F1FF', surface2: '#EDE3FF', surface3: '#E6DCF8',
  border: '#EDE6FA', borderStrong: '#E6DCF8',
  text: '#16004A', textDim: '#5B4F80', textFaint: '#5B4F80',
  code: '#16004A', codeText: '#FFFFFF', codeInline: '#6A00FF',
  link: '#6A00FF', okDot: '#12A150', ok: '#0B6B3A', danger: '#A3161B', track: '#D9C8FA', switchOff: '#8F86A8',
  scrim: 'rgba(22,0,74,0.5)', onSurface: '#FFFFFF',
};
// Dark: near-black with a violet undertone and layered greys, so violet stays the accent
// (Grok / ChatGPT style) instead of every surface being purple.
const DARK = {
  bg: '#0B0912', surface: '#17131F', surface2: '#201B2B', surface3: '#2B2438',
  border: '#1E1A28', borderStrong: '#2B2438',
  text: '#F4F1FA', textDim: '#A79FBC', textFaint: '#7F7795',
  code: '#120F19', codeText: '#F4F1FA', codeInline: '#C4A2FF',
  link: '#B88CFF', okDot: '#2FD07F', ok: '#5EDC9B', danger: '#FF7A80', track: '#2B2438', switchOff: '#3F3752',
  scrim: 'rgba(0,0,0,0.65)', onSurface: '#201B2B',
};

export function buildColors(mode: ThemeMode, _accent?: AccentName) {
  const b = mode === 'light' ? LIGHT : DARK;
  return {
    ...b,
    accent: BRAND.violet,
    accent2: BRAND.violet,
    accentSoft: b.surface,
    accentGlow: hexA(BRAND.violet, 0.3),
    accentText: '#FFFFFF',
    userBubble: BRAND.violet,
    userText: '#FFFFFF',
    dangerSoft: hexA(b.danger, 0.12),
    warn: b.link,
    statusBar: mode === 'light' ? 'dark' : 'light',
  } as const;
}

export type Colors = ReturnType<typeof buildColors>;

/**
 * The live palette. It is replaced in place when the theme setting changes, so
 * code that reads `colors.x` while rendering always gets the current theme.
 */
export const colors: { -readonly [K in keyof Colors]: Colors[K] } = { ...buildColors('dark') } as any;

export function applyColors(mode: ThemeMode, accent: AccentName) {
  Object.assign(colors, buildColors(mode, accent));
}

export const radius = { sm: 10, md: 16, lg: 18, xl: 22, pill: 999 };

/** The brand is flat: no shadows. Kept as an empty style so callers need no change. */
export const shadow = {} as object;

/** Avatar backgrounds an agent can pick (and the default per agent). */
export const avatarPalette = ['#6A00FF', '#16004A', '#B88CFF', '#EDE3FF'];
export function avatarInk(bg: string) {
  return bg === '#B88CFF' ? '#16004A' : bg === '#EDE3FF' ? '#6A00FF' : '#FFFFFF';
}
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
