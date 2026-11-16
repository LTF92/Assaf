import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';

import type { ClientSnapshot } from './client';
import { useConnections } from './store';
import type { Connection, Message } from './types';

/**
 * The main channel: what agents sent on their own (cron jobs and other scheduled
 * deliveries, marked `origin: 'scheduled'` by the bridge) plus approvals that are
 * still waiting, gathered from every connection.
 */
export type InboxKind = 'scheduled' | 'approval' | 'error';

export interface InboxItem {
  key: string;
  kind: InboxKind;
  conn: Connection;
  m: Message;
  title: string;
  body: string;
  unread: boolean;
}

const FAILED = /(^|\W)(error|failed|failure|exception)(\W|$)|فشل|تعذّر|تعذر|خطأ/i;
const READ_KEY = 'hm.inbox.read.v1';
const READ_LIMIT = 600;

// ── read state, shared by every screen ──
let readIds = new Set<string>();
let readVersion = 0;
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => {
  readVersion++;
  listeners.forEach((fn) => fn());
};
function persist() {
  const list = Array.from(readIds).slice(-READ_LIMIT);
  readIds = new Set(list);
  void AsyncStorage.setItem(READ_KEY, JSON.stringify(list));
}
async function loadRead() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(READ_KEY);
    if (raw) readIds = new Set(JSON.parse(raw) as string[]);
  } catch {}
  emit();
}
export function markRead(keys: string[]) {
  let changed = false;
  for (const k of keys) if (!readIds.has(k)) (readIds.add(k), (changed = true));
  if (!changed) return;
  persist();
  emit();
}
const subscribeRead = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

function clean(s: string) {
  return s.replace(/^#+\s*/, '').replace(/[*_`]/g, '').trim();
}

/** A report's first short line becomes its title; the rest is the body. */
export function splitTitle(text: string): { title: string; body: string } {
  const lines = text.trim().split('\n');
  const first = clean(lines[0] ?? '');
  const rest = lines.slice(1).join('\n').trim();
  if (rest && first.length <= 70) return { title: first, body: rest };
  return { title: '', body: text.trim() };
}

function classify(m: Message): InboxKind | null {
  if (m.deleted || m.interim) return null;
  if (m.kind === 'card' && m.card?.state === 'pending') return 'approval';
  if (m.origin === 'scheduled' && m.role === 'assistant' && (m.kind === 'text' || m.kind === 'media')) {
    return FAILED.test(m.text.slice(0, 200)) ? 'error' : 'scheduled';
  }
  return null;
}

/** Live snapshots of every connection's chat, re-rendering when any of them changes. */
export function useAllChats(): { conn: Connection; snap: ClientSnapshot | undefined }[] {
  const { connections, client } = useConnections();
  const subscribe = useCallback(
    (fn: () => void) => {
      const offs = connections.map((c) => client(c.id)?.subscribe(fn));
      return () => offs.forEach((off) => off?.());
    },
    [connections, client],
  );
  const key = useSyncExternalStore(subscribe, () =>
    connections.map((c) => `${c.id}:${client(c.id)?.getSnapshot().version ?? 0}`).join(','),
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => connections.map((conn) => ({ conn, snap: client(conn.id)?.getSnapshot() })), [key, connections]);
}

export function useInbox(): { items: InboxItem[]; unread: number } {
  const chats = useAllChats();
  useEffect(() => void loadRead(), []);
  const rv = useSyncExternalStore(subscribeRead, () => readVersion);
  return useMemo(() => {
    const items: InboxItem[] = [];
    for (const { conn, snap } of chats) {
      for (const m of snap?.messages ?? []) {
        const kind = classify(m);
        if (!kind) continue;
        const key = `${conn.id}:${m.id}`;
        const { title, body } = kind === 'approval'
          ? { title: m.card?.title ?? '', body: m.card?.command || m.card?.description || m.text }
          : splitTitle(m.text);
        // A pending approval stays unread until it is answered.
        items.push({ key, kind, conn, m, title, body, unread: kind === 'approval' || !readIds.has(key) });
      }
    }
    items.sort((a, b) => b.m.ts - a.m.ts);
    return { items, unread: items.filter((i) => i.unread).length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chats, rv]);
}
