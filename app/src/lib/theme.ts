import { Platform } from 'react-native';

// "Hermes Mobile" look: deep ink background, warm gold accent (Hermes, the messenger).
export const colors = {
  bg: '#0B0D12',
  surface: '#141821',
  surface2: '#1B2030',
  border: '#262C3B',
  text: '#ECEFF6',
  textDim: '#9AA3B6',
  textFaint: '#626B80',
  accent: '#F5B544',
  accentText: '#1A1305',
  userBubble: '#2A3350',
  danger: '#F2787A',
  ok: '#5EC2B7',
  warn: '#F5B544',
  code: '#0F121A',
};

export const radius = { sm: 8, md: 14, lg: 20, pill: 999 };
export const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' });
