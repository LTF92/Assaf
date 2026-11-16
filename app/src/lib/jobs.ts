import { useCallback, useEffect, useState } from 'react';

import type { Job, JobSchedule } from './client';
import { lang, t } from './i18n';
import { useAllChats } from './inbox';
import { useConnections } from './store';
import type { Connection } from './types';

export interface JobRow {
  conn: Connection;
  job: Job;
}

/** Scheduled jobs of every agent this phone owns, fetched from each bridge. */
export function useJobs() {
  const { connections, client } = useConnections();
  const chats = useAllChats();
  // Re-fetch whenever an owner connection comes online (a request sent while offline fails).
  const onlineKey = chats.filter((c) => c.conn.role === 'owner' && c.snap?.status === 'online').map((c) => c.conn.id).join(',');
  const [rows, setRows] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<Connection[]>([]);

  const refresh = useCallback(async () => {
    const owners = connections.filter((c) => c.role === 'owner');
    const results = await Promise.all(
      owners.map(async (conn) => {
        try {
          if (client(conn.id)?.getSnapshot().status !== 'online') throw new Error('offline');
          const jobs = (await client(conn.id)?.jobs()) ?? [];
          return { conn, jobs, ok: true };
        } catch {
          return { conn, jobs: [] as Job[], ok: false };
        }
      }),
    );
    setRows(results.flatMap((r) => r.jobs.map((job) => ({ conn: r.conn, job }))));
    setFailed(results.filter((r) => !r.ok).map((r) => r.conn));
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connections, client, onlineKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { rows, loading, failed, refresh, setRows };
}

export function clockLabel(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const d = new Date(2026, 0, 1, h, m);
  return d.toLocaleTimeString(lang === 'ar' ? 'ar' : 'en', { hour: 'numeric', minute: '2-digit' });
}

/** "Every Sunday · 8:00 AM", "Daily · 7:30 AM", "Day 1 of each month · 9:00 AM". */
export function scheduleLabel(s: JobSchedule | null, fallback: string): string {
  if (!s) return fallback;
  const at = clockLabel(s.time);
  if (s.freq === 'daily') return `${t.daily} · ${at}`;
  if (s.freq === 'monthly') return `${t.monthlyOn(s.dom ?? 1)} · ${at}`;
  const days = (s.days ?? []).slice().sort();
  if (days.length === 7) return `${t.daily} · ${at}`;
  if (days.join() === '0,1,2,3,4') return `${t.workdays} · ${at}`;
  return `${t.every} ${days.map((d) => t.dayNames[d]).join(lang === 'ar' ? '، ' : ', ')} · ${at}`;
}

/** "Tomorrow", "Today 7:00 PM", "Sunday 22 Nov". */
export function nextRunLabel(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso === 'now' ? t.now : '';
  const loc = lang === 'ar' ? 'ar' : 'en';
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const time = d.toLocaleTimeString(loc, { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return `${t.today} ${time}`;
  if (d.toDateString() === tomorrow.toDateString()) return `${t.tomorrow} ${time}`;
  return d.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' });
}
