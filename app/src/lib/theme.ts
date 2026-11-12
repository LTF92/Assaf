import { Platform } from 'react-native';

// "Hermes Mobile" look: deep ink background, warm gold accent (Hermes, the messenger).
export const colors = {
  bg: '#090B10',
  surface: '#12161F',
  surface2: '#1A1F2B',
  surface3: '#222837',
  border: '#232A39',
  borderStrong: '#2E3648',
  text: '#EEF1F7',
  textDim: '#9BA4B8',
  textFaint: '#5F687D',
  accent: '#F5B544',
  accentSoft: 'rgba(245,181,68,0.14)',
  accentGlow: 'rgba(245,181,68,0.35)',
  accentText: '#1A1305',
  userBubble: '#F5B544',
  userText: '#1A1305',
  danger: '#F2787A',
  dangerSoft: 'rgba(242,120,122,0.12)',
  ok: '#5EC2B7',
  warn: '#F5B544',
  code: '#0C0F16',
};

export const radius = { sm: 8, md: 14, lg: 20, xl: 26, pill: 999 };

/** Soft drop shadow for floating things (buttons, cards). */
export const shadow = Platform.select({
  ios: { shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  android: { elevation: 6 },
  default: { boxShadow: '0 6px 18px rgba(0,0,0,0.35)' },
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
