import type { Connection } from './types';

export interface PairingPayload {
  v: number;
  url: string;
  token: string;
  profile: string;
  label: string;
  role: 'owner' | 'guest';
}

function b64urlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Same format as bridge/hermes_mobile/pair.py. */
export function buildPairingLink(p: PairingPayload): string {
  const { v, url, token, profile, label, role } = p;
  return `hermesmobile://pair?d=${b64urlEncode(JSON.stringify({ v, url, token, profile, label, role }))}`;
}

function b64urlDecode(input: string): string {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (input.length % 4)) % 4);
  // atob is available in Hermes (React Native's JS engine).
  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Parse `hermesmobile://pair?d=…` (from the QR code or a pasted link). Returns null when invalid. */
export function parsePairingLink(raw: string): PairingPayload | null {
  const text = (raw || '').trim();
  const match = text.match(/[?&]d=([A-Za-z0-9_-]+)/);
  if (!match) return null;
  try {
    const payload = JSON.parse(b64urlDecode(match[1]));
    if (payload?.v !== 1 || typeof payload.url !== 'string' || typeof payload.token !== 'string') return null;
    if (!/^wss?:\/\//.test(payload.url)) return null;
    return {
      v: 1,
      url: payload.url.replace(/\/+$/, ''),
      token: payload.token,
      profile: String(payload.profile || 'default'),
      label: String(payload.label || payload.profile || 'Hermes'),
      role: payload.role === 'guest' ? 'guest' : 'owner',
    };
  } catch {
    return null;
  }
}

export function httpBase(conn: Pick<Connection, 'url'>): string {
  return conn.url.replace(/^ws/, 'http');
}

const PALETTE = ['#F5B544', '#5EC2B7', '#8E8CF2', '#F2787A', '#6FB1F2', '#B6D86A', '#E58CD1'];

export function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
