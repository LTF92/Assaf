/**
 * Connection speed: a dial that hangs (SYN sent before the Tailscale route existed) or a socket that
 * died with the network must not leave the app "connecting" for the ~75 s TCP timeout.
 * Uses a fake WebSocket, so it runs without the bridge.  Run: npm run test:integration
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { HermesClient } from '../src/lib/client.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class FakeWS {
  static all: FakeWS[] = [];
  /** Which dial numbers (0-based) succeed; others hang forever like a lost SYN. */
  static answers = new Set<number>();
  static respondPings = true;
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: any[] = [];
  closed = false;
  url: string;
  constructor(url: string) {
    this.url = url;
    const n = FakeWS.all.length;
    FakeWS.all.push(this);
    if (FakeWS.answers.has(n)) setTimeout(() => this.accept(), 20);
  }
  accept() {
    if (this.closed) return;
    this.readyState = 1;
    this.onopen?.();
  }
  send(raw: string) {
    const msg = JSON.parse(raw);
    this.sent.push(msg);
    const reply = (m: unknown) => setTimeout(() => !this.closed && this.onmessage?.({ data: JSON.stringify(m) }), 5);
    if (msg.type === 'auth') {
      reply({ type: 'welcome', device: { role: 'owner' }, profile: { label: 'P' } });
      reply({ type: 'sync', messages: [], rev: 0 });
    }
    if (msg.type === 'ping' && FakeWS.respondPings) reply({ type: 'pong', t: msg.t });
  }
  close() {
    // A dead network never reports the close back; the client must not wait for it.
    this.closed = true;
    this.readyState = 3;
  }
}

const conn = { id: 'c', url: 'ws://100.64.0.1:8765', profile: 'p', label: 'x', role: 'owner' as const, createdAt: 0 };

async function until(fn: () => boolean, ms: number) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return Date.now();
    await sleep(20);
  }
  throw new Error('timeout');
}

test('a hung first dial is overtaken by a parallel one within a few seconds', async () => {
  FakeWS.all = [];
  FakeWS.answers = new Set([1]);
  const c = new HermesClient(conn, 't', { WebSocketImpl: FakeWS as any });
  const t0 = Date.now();
  c.start();
  await until(() => c.getSnapshot().status === 'online', 4500);
  assert.ok(Date.now() - t0 < 4000, 'online quickly');
  assert.ok(FakeWS.all[0].closed, 'the stuck dial was dropped');
  c.stop();
});

test('coming back to the foreground dials fresh instead of waiting on a stuck dial', async () => {
  FakeWS.all = [];
  FakeWS.answers = new Set([1]);
  const c = new HermesClient(conn, 't', { WebSocketImpl: FakeWS as any });
  c.start();
  await sleep(300);
  const t0 = Date.now();
  c.reconnect(); // e.g. Tailscale just switched on
  await until(() => c.getSnapshot().status === 'online', 1500);
  assert.ok(Date.now() - t0 < 1000);
  c.stop();
});

test('foreground on a dead "online" socket redials in ~3 s, not after the 35 s ping cycle', async () => {
  FakeWS.all = [];
  FakeWS.answers = new Set([0, 1]);
  FakeWS.respondPings = false; // network changed: the old socket is silently dead
  const c = new HermesClient(conn, 't', { WebSocketImpl: FakeWS as any });
  c.start();
  await until(() => c.getSnapshot().status === 'online', 1000);
  const t0 = Date.now();
  c.reconnect();
  await until(() => FakeWS.all.length === 2 && c.getSnapshot().status === 'online', 4500);
  assert.ok(Date.now() - t0 < 4000);
  FakeWS.respondPings = true;
  c.stop();
});

test('foreground on a healthy socket keeps it', async () => {
  FakeWS.all = [];
  FakeWS.answers = new Set([0]);
  const c = new HermesClient(conn, 't', { WebSocketImpl: FakeWS as any });
  c.start();
  await until(() => c.getSnapshot().status === 'online', 1000);
  c.reconnect();
  await sleep(3500);
  assert.equal(FakeWS.all.length, 1);
  assert.equal(c.getSnapshot().status, 'online');
  c.stop();
});
