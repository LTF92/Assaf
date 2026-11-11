/**
 * Drives the real HermesClient (src/lib/client.ts) against bridge/dev_server.py.
 * Run from app/:  npm run test:integration   (needs python3 with `websockets`; set PYTHON to override)
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { HermesClient, type ChatCacheLike } from '../src/lib/client.ts';

const PORT = 18765 + Math.floor(Math.random() * 500);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until<T>(fn: () => T | undefined | false, ms = 8000): Promise<T> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await sleep(25);
  }
  throw new Error('timeout');
}

test('client ⇄ bridge: send, tools, streaming, cards, resync', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hm-'));
  const tokenFile = join(dir, 'token');
  const py = spawn(process.env.PYTHON || 'python3',
    ['../bridge/dev_server.py', '--port', String(PORT), '--host', '127.0.0.1', '--dir', dir, '--token-file', tokenFile, '--delay', '0.05'],
    { stdio: 'inherit' });
  try {
    await until(() => existsSync(tokenFile) && readFileSync(tokenFile, 'utf8'));
    const token = readFileSync(tokenFile, 'utf8');
    const conn = { id: 'c1', url: `ws://127.0.0.1:${PORT}`, profile: 'demo', label: 'x', role: 'owner' as const, createdAt: 0 };
    let saved: ChatCacheLike = { rev: 0, messages: [], outbox: [] };
    const client = new HermesClient(conn, token, { load: async () => saved, save: (c) => { saved = c; } });

    // queued before the socket is up -> flushed after welcome
    client.start();
    client.send('hello');
    await until(() => client.getSnapshot().status === 'online');
    assert.equal(client.getSnapshot().profileLabel, 'Demo Agent');

    const answer = await until(() => client.getSnapshot().messages.find((m) => m.role === 'assistant' && m.kind === 'text' && m.text.endsWith('cache too?')));
    const snap = client.getSnapshot();
    const tools = snap.messages.filter((m) => m.kind === 'tool');
    assert.equal(tools.length, 2);
    assert.ok(tools.every((m) => m.tool?.status === 'ok' && m.tool.output));
    assert.equal(snap.messages.filter((m) => m.role === 'user').length, 1, 'outbox replaced by server copy');
    assert.ok(!snap.messages.some((m) => m.pending));
    assert.ok(answer.text.includes('| Disk |'));

    // approval card -> tap
    client.send('approve');
    const card = await until(() => client.getSnapshot().messages.find((m) => m.card?.state === 'pending'));
    assert.equal(card.card!.command, 'rm -rf ./build && make release');
    client.act(card.id, 'once');
    await until(() => client.getSnapshot().messages.find((m) => m.id === card.id && m.card?.state === 'resolved'));

    // owner shares the profile with a guest who then connects to their own private chat
    const inv = await client.invite('Ahmed');
    assert.equal(inv.role, 'guest');
    assert.ok((await client.devices()).some((d) => d.name === 'Ahmed' && d.role === 'guest'));
    const guest = new HermesClient(conn, inv.token);
    guest.start();
    await until(() => guest.getSnapshot().status === 'online');
    assert.equal(guest.getSnapshot().role, 'guest');
    assert.equal(guest.getSnapshot().messages.length, 0, 'guest cannot see the owner chat');
    await assert.rejects(guest.invite('x'), /forbidden/);
    await client.revokeDevice(inv.device.id);
    await until(() => guest.getSnapshot().status === 'unauthorized');
    guest.stop();

    // disconnect, server keeps talking, reconnect with saved rev -> gets only what changed
    client.stop();
    await sleep(700); // let the debounced cache save run
    const revBefore = saved.rev;
    assert.ok(revBefore > 0);
    const client2 = new HermesClient(conn, token, { load: async () => saved, save: (c) => { saved = c; } });
    client2.start();
    await until(() => client2.getSnapshot().status === 'online');
    assert.equal(client2.getSnapshot().messages.length, client.getSnapshot().messages.length);
    client2.stop();

    // bad token -> unauthorized, no retry loop
    const bad = new HermesClient(conn, 'nope');
    bad.start();
    await until(() => bad.getSnapshot().status === 'unauthorized');
    bad.stop();
  } finally {
    py.kill();
  }
});
