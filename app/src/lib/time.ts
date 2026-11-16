import { lang, t } from './i18n';

/** Chat-list style time: clock time today, "Yesterday", weekday this week, else a short date. */
export function timeLabel(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  const now = new Date();
  const loc = lang === 'ar' ? 'ar' : 'en';
  if (now.getTime() - d.getTime() < 60_000) return t.now;
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(loc, { hour: 'numeric', minute: '2-digit' });
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return t.yesterday;
  if (now.getTime() - d.getTime() < 6 * 86400_000) return d.toLocaleDateString(loc, { weekday: 'long' });
  return d.toLocaleDateString(loc, { month: 'short', day: 'numeric' });
}
