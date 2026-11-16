import type { ClientSnapshot, GuestLimits, GuestScope } from './client';
import type { Connection } from './types';
import { t } from './i18n';

export const DURATIONS = { '24h': 86400, '7d': 7 * 86400, none: null } as const;
export type DurationKey = keyof typeof DURATIONS;

export function scopeLabel(scope?: GuestScope | null): string {
  return scope === 'chat' ? t.scopeChat : scope === 'read' ? t.scopeRead : t.scopeFull;
}

/** "7 أيام" / "23 ساعة" for a number of seconds. */
export function spanText(sec: number): string {
  if (sec >= 86400 - 60) return t.days(Math.round(sec / 86400));
  return t.hours(Math.max(1, Math.ceil(sec / 3600)));
}

/** Seconds left until a unix-seconds expiry; null when it never expires. */
export function secondsLeft(expiresAt?: number | null): number | null {
  if (expiresAt == null) return null;
  return Math.max(0, expiresAt - Date.now() / 1000);
}

export function durationKeyFor(expiresAt?: number | null): DurationKey {
  const left = secondsLeft(expiresAt);
  if (left == null) return 'none';
  return left <= 86400 ? '24h' : '7d';
}

/** Initial of a person's name for a round avatar. */
export function initial(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? '•';
}

/** A guest connection's limits: live from the bridge when connected, else from the invite. */
export function guestLimits(conn: Connection, snap?: ClientSnapshot): GuestLimits {
  if (snap?.guest) return snap.guest;
  return { scope: conn.invite?.scope ?? 'full', topic: conn.invite?.topic ?? '', expires_at: conn.invite?.exp ?? null };
}
