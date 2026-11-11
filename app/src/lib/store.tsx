import * as Crypto from 'expo-crypto';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { HermesClient, type ClientSnapshot } from './client';
import { colorFor, type PairingPayload } from './pairing';
import { registerForPush } from './push';
import {
  deleteConnectionData, loadCache, loadConnections, loadToken, saveCache, saveConnections, saveToken,
} from './storage';
import type { Connection } from './types';

interface Ctx {
  ready: boolean;
  connections: Connection[];
  client: (id: string) => HermesClient | undefined;
  add: (p: PairingPayload) => Promise<Connection>;
  remove: (id: string) => Promise<void>;
  rename: (id: string, label: string) => Promise<void>;
}

const ConnectionsContext = createContext<Ctx | null>(null);

function makeClient(conn: Connection, token: string): HermesClient {
  return new HermesClient(conn, token, {
    load: () => loadCache(conn.id),
    save: (cache) => saveCache(conn.id, cache),
    newId: () => Crypto.randomUUID(),
  });
}

export function ConnectionsProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [connections, setConnections] = useState<Connection[]>([]);
  const clients = useRef(new Map<string, HermesClient>());
  const pushToken = useRef<string | null>(null);

  // boot: restore saved connections and open them all (like a messenger, every chat stays live)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await loadConnections();
      for (const conn of list) {
        const token = await loadToken(conn.id);
        if (token && !clients.current.has(conn.id)) {
          const c = makeClient(conn, token);
          clients.current.set(conn.id, c);
          c.start();
        }
      }
      if (!cancelled) {
        setConnections(list);
        setReady(true);
      }
      pushToken.current = await registerForPush();
      if (pushToken.current) clients.current.forEach((c) => c.setPushToken(pushToken.current));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // foreground/background: reconnect quickly and tell bridges whether to send push notifications
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      const active = state === 'active';
      clients.current.forEach((c) => {
        c.setActive(active);
        if (active) c.reconnect();
      });
    });
    return () => sub.remove();
  }, []);

  const add = useCallback(async (p: PairingPayload) => {
    const existing = (await loadConnections()).find((c) => c.url === p.url && c.profile === p.profile);
    const conn: Connection = existing
      ? { ...existing, label: p.label, role: p.role }
      : { id: Crypto.randomUUID(), url: p.url, profile: p.profile, label: p.label, role: p.role,
          createdAt: Date.now(), color: colorFor(p.url + p.profile) };
    await saveToken(conn.id, p.token);
    clients.current.get(conn.id)?.stop();
    const client = makeClient(conn, p.token);
    clients.current.set(conn.id, client);
    client.start();
    if (pushToken.current) client.setPushToken(pushToken.current);
    setConnections((prev) => {
      const next = existing ? prev.map((c) => (c.id === conn.id ? conn : c)) : [...prev, conn];
      void saveConnections(next);
      return next;
    });
    return conn;
  }, []);

  const remove = useCallback(async (id: string) => {
    const c = clients.current.get(id);
    c?.setPushToken(null);
    c?.stop();
    clients.current.delete(id);
    await deleteConnectionData(id);
    setConnections((prev) => {
      const next = prev.filter((x) => x.id !== id);
      void saveConnections(next);
      return next;
    });
  }, []);

  const rename = useCallback(async (id: string, label: string) => {
    setConnections((prev) => {
      const next = prev.map((c) => (c.id === id ? { ...c, label } : c));
      void saveConnections(next);
      return next;
    });
  }, []);

  const value = useMemo<Ctx>(
    () => ({ ready, connections, client: (id) => clients.current.get(id), add, remove, rename }),
    [ready, connections, add, remove, rename],
  );
  return <ConnectionsContext.Provider value={value}>{children}</ConnectionsContext.Provider>;
}

export function useConnections(): Ctx {
  const ctx = useContext(ConnectionsContext);
  if (!ctx) throw new Error('useConnections must be used inside ConnectionsProvider');
  return ctx;
}

const EMPTY: ClientSnapshot = {
  version: 0, status: 'offline', messages: [], typing: false, profileLabel: '', deviceName: '', role: 'owner',
  hasOlder: false, lastError: null,
};
const noopSubscribe = () => () => {};

/** Live state of one connection's chat. */
export function useChat(id: string | undefined): { client?: HermesClient; snap: ClientSnapshot } {
  const { client } = useConnections();
  const c = id ? client(id) : undefined;
  const snap = useSyncExternalStore(c ? c.subscribe : noopSubscribe, c ? c.getSnapshot : () => EMPTY);
  return { client: c, snap };
}
