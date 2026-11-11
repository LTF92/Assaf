/**
 * One live connection to one Hermes profile (see docs/protocol.md).
 *
 * Plain TypeScript with no React Native imports, so it also runs under Node for tests.
 * Persistence is injected (`load`/`save`) and the WebSocket constructor can be swapped.
 */
import type { Attachment, ConnStatus, Connection, Message } from './types';

export interface ChatCacheLike {
  rev: number;
  messages: Message[];
  outbox: Message[];
}

export interface ClientOptions {
  load?: () => Promise<ChatCacheLike>;
  save?: (cache: ChatCacheLike) => void | Promise<void>;
  WebSocketImpl?: typeof WebSocket;
  newId?: () => string;
  now?: () => number;
}

export interface ClientSnapshot {
  version: number;
  status: ConnStatus;
  messages: Message[];
  typing: boolean;
  profileLabel: string;
  deviceName: string;
  role: 'owner' | 'guest';
  hasOlder: boolean;
  lastError: string | null;
}

type Listener = () => void;

export interface DeviceInfo {
  id: string;
  name: string;
  role: 'owner' | 'guest';
  chat_id: string;
  created_at: number;
  last_seen: number | null;
  online: boolean;
  me: boolean;
}

const TYPING_TTL_MS = 8000;
const PING_EVERY_MS = 25000;
const PONG_TIMEOUT_MS = 10000;

function defaultId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export class HermesClient {
  readonly conn: Connection;
  private token: string;
  private opts: ClientOptions;
  private ws: WebSocket | null = null;
  private stopped = true;
  private retry = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private typingTimer: ReturnType<typeof setTimeout> | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<Listener>();
  private byId = new Map<string, Message>();
  private outbox: Message[] = [];
  private rev = 0;
  private loaded: Promise<void> | null = null;
  private active = true;
  private pushToken: string | null = null;
  private snapshot: ClientSnapshot;
  private nextRef = 1;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();

  constructor(conn: Connection, token: string, opts: ClientOptions = {}) {
    this.conn = conn;
    this.token = token;
    this.opts = opts;
    this.snapshot = {
      version: 0, status: 'offline', messages: [], typing: false, profileLabel: conn.label,
      deviceName: '', role: conn.role, hasOlder: false, lastError: null,
    };
  }

  // ── subscription (useSyncExternalStore-friendly)
  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): ClientSnapshot => this.snapshot;

  private emit(patch: Partial<ClientSnapshot> = {}, messagesChanged = false) {
    const messages = messagesChanged ? this.sortedMessages() : this.snapshot.messages;
    this.snapshot = { ...this.snapshot, ...patch, messages, version: this.snapshot.version + 1 };
    this.listeners.forEach((fn) => fn());
    if (messagesChanged) this.scheduleSave();
  }

  private sortedMessages(): Message[] {
    const list = [...this.byId.values()].filter((m) => !m.deleted);
    const pending = this.outbox.filter((m) => !list.some((x) => x.client_id && x.client_id === m.client_id));
    return [...list, ...pending].sort((a, b) => a.ts - b.ts || a.rev - b.rev);
  }

  private scheduleSave() {
    if (!this.opts.save) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      // Attachment bytes are not persisted (too large); a restart re-sends the text only.
      const outbox = this.outbox.map(({ _attachments, ...m }: any) => m);
      void this.opts.save?.({ rev: this.rev, messages: [...this.byId.values()], outbox });
    }, 500);
  }

  // ── lifecycle
  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.loaded ??= (async () => {
      const cache = await this.opts.load?.();
      if (cache) {
        this.rev = cache.rev;
        cache.messages.forEach((m) => this.byId.set(m.id, m));
        // keep anything queued while the cache was loading
        this.outbox = [...cache.outbox.map((m) => ({ ...m, pending: 'sending' as const })), ...this.outbox];
        this.emit({}, true);
      }
    })();
    void this.loaded.then(() => this.open());
  }

  stop() {
    this.stopped = true;
    this.clearTimers();
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
    this.emit({ status: 'offline' });
  }

  /** Reconnect now (app came to the foreground, network changed, pull-to-refresh). */
  reconnect() {
    if (this.stopped) return this.start();
    if (this.snapshot.status === 'online' || this.snapshot.status === 'unauthorized') return;
    this.retry = 0;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.open();
  }

  private clearTimers() {
    [this.retryTimer, this.pongTimer, this.typingTimer].forEach((t) => t && clearTimeout(t));
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.retryTimer = this.pongTimer = this.typingTimer = null;
    this.pingTimer = null;
  }

  private open() {
    if (this.stopped) return;
    const WS = this.opts.WebSocketImpl ?? WebSocket;
    this.emit({ status: 'connecting' });
    let ws: WebSocket;
    try {
      ws = new WS(`${this.conn.url}/ws`);
    } catch (e) {
      this.emit({ lastError: String(e) });
      return this.scheduleRetry();
    }
    this.ws = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'auth', token: this.token, since: this.rev }));
    };
    ws.onmessage = (ev: MessageEvent) => {
      if (ws !== this.ws) return;
      try {
        this.handle(JSON.parse(String(ev.data)));
      } catch {
        /* ignore malformed frames */
      }
    };
    ws.onerror = () => {
      /* onclose follows */
    };
    ws.onclose = (ev: CloseEvent) => {
      if (ws !== this.ws) return;
      this.ws = null;
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = null;
      if (ev.code === 4003) {
        this.emit({ status: 'unauthorized', typing: false });
        return;
      }
      this.emit({ status: 'offline', typing: false });
      this.scheduleRetry();
    };
  }

  private scheduleRetry() {
    if (this.stopped || this.retryTimer) return;
    const base = Math.min(30000, 1000 * 2 ** this.retry);
    this.retry = Math.min(this.retry + 1, 6);
    const delay = base / 2 + Math.random() * (base / 2);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.open();
    }, delay);
  }

  private startPing() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      this.sendRaw({ type: 'ping', t: Date.now() });
      if (this.pongTimer) clearTimeout(this.pongTimer);
      this.pongTimer = setTimeout(() => {
        // dead socket (common after a phone switches networks): force a reconnect
        try {
          this.ws?.close();
        } catch {
          /* ignore */
        }
      }, PONG_TIMEOUT_MS);
    }, PING_EVERY_MS);
  }

  private sendRaw(payload: unknown): boolean {
    if (!this.ws || this.ws.readyState !== 1) return false;
    this.ws.send(JSON.stringify(payload));
    return true;
  }

  // ── inbound
  private handle(msg: any) {
    switch (msg?.type) {
      case 'welcome':
        this.retry = 0;
        this.emit({
          status: 'online', lastError: null,
          profileLabel: msg.profile?.label || this.conn.label,
          deviceName: msg.device?.name || '', role: msg.device?.role === 'guest' ? 'guest' : 'owner',
        });
        this.startPing();
        this.sendRaw({ type: 'presence', active: this.active });
        if (this.pushToken) this.sendRaw({ type: 'push_token', token: this.pushToken });
        this.flushOutbox();
        break;
      case 'sync':
        if (msg.reset) this.byId.clear();
        (msg.messages as Message[]).forEach((m) => this.byId.set(m.id, m));
        this.rev = Math.max(this.rev, msg.rev || 0);
        this.emit({ hasOlder: !!msg.truncated || this.snapshot.hasOlder }, true);
        break;
      case 'upsert':
        this.upsert(msg.message as Message);
        break;
      case 'history': {
        const older = msg.messages as Message[];
        older.forEach((m) => this.byId.has(m.id) || this.byId.set(m.id, m));
        this.emit({ hasOlder: older.length >= 100 }, true);
        break;
      }
      case 'typing':
        if (this.typingTimer) clearTimeout(this.typingTimer);
        if (msg.on) this.typingTimer = setTimeout(() => this.emit({ typing: false }), TYPING_TTL_MS);
        this.emit({ typing: !!msg.on });
        break;
      case 'invite':
      case 'devices':
        this.settle(msg.ref, msg);
        break;
      case 'pong':
        if (this.pongTimer) clearTimeout(this.pongTimer);
        this.pongTimer = null;
        break;
      case 'error':
        if (typeof msg.ref === 'number' && this.pending.has(msg.ref)) {
          this.settle(msg.ref, null, String(msg.code));
          break;
        }
        if (msg.code === 'unauthorized' || msg.code === 'revoked') this.emit({ status: 'unauthorized' });
        else this.emit({ lastError: String(msg.code) });
        if (msg.ref) this.outbox = this.outbox.map((m) => (m.client_id === msg.ref ? { ...m, pending: 'failed' } : m));
        this.emit({}, true);
        break;
    }
  }

  private upsert(m: Message) {
    this.byId.set(m.id, m);
    this.rev = Math.max(this.rev, m.rev || 0);
    if (m.role === 'user' && m.client_id) this.outbox = this.outbox.filter((o) => o.client_id !== m.client_id);
    // A finished assistant message means the agent is no longer "typing" that answer.
    const typing = m.role === 'assistant' && m.kind === 'text' && !m.interim ? false : this.snapshot.typing;
    this.emit({ typing }, true);
  }

  // ── outbound
  send(text: string, attachments: Attachment[] = []): void {
    const clientId = (this.opts.newId ?? defaultId)();
    const now = (this.opts.now ?? Date.now)() / 1000;
    const local: Message & { _attachments?: Attachment[] } = {
      id: `local-${clientId}`, rev: Number.MAX_SAFE_INTEGER, chat_id: '', role: 'user', kind: 'text', text, ts: now,
      client_id: clientId, pending: 'sending',
      attachments: attachments.map((a) => ({ name: a.name, mime: a.mime, size: Math.floor((a.data.length * 3) / 4) })),
      _attachments: attachments,
    };
    this.outbox.push(local);
    this.emit({}, true);
    this.flushOutbox();
  }

  retrySend(clientId: string) {
    this.outbox = this.outbox.map((m) => (m.client_id === clientId ? { ...m, pending: 'sending' } : m));
    this.emit({}, true);
    this.flushOutbox();
  }

  discard(clientId: string) {
    this.outbox = this.outbox.filter((m) => m.client_id !== clientId);
    this.emit({}, true);
  }

  private flushOutbox() {
    for (const m of this.outbox) {
      if (m.pending !== 'sending') continue;
      const atts = (m as any)._attachments as Attachment[] | undefined;
      const ok = this.sendRaw({
        type: 'send', client_id: m.client_id, text: m.text,
        attachments: (atts || []).map(({ name, mime, data }) => ({ name, mime, data })),
      });
      if (!ok) break;
    }
  }

  act(messageId: string, value: string): boolean {
    return this.sendRaw({ type: 'action', message_id: messageId, value });
  }

  loadOlder(): void {
    const first = this.snapshot.messages.find((m) => !m.pending);
    if (first) this.sendRaw({ type: 'history', before_ts: first.ts });
  }

  setActive(active: boolean) {
    this.active = active;
    this.sendRaw({ type: 'presence', active });
  }

  setPushToken(token: string | null) {
    this.pushToken = token;
    this.sendRaw({ type: 'push_token', token });
  }

  // ── owner tools: share this profile with someone, manage devices
  private settle(ref: unknown, value: any, error?: string) {
    const p = typeof ref === 'number' ? this.pending.get(ref) : undefined;
    if (!p) return;
    this.pending.delete(ref as number);
    if (error) p.reject(new Error(error));
    else p.resolve(value);
  }

  private request<T>(payload: Record<string, unknown>, timeoutMs = 10000): Promise<T> {
    const ref = this.nextRef++;
    return new Promise<T>((resolve, reject) => {
      if (!this.sendRaw({ ...payload, ref })) return reject(new Error('offline'));
      this.pending.set(ref, { resolve, reject });
      setTimeout(() => this.settle(ref, null, 'timeout'), timeoutMs);
    });
  }

  /** Create a guest device on this profile and return its pairing payload (owner only). */
  async invite(name: string): Promise<{ token: string; role: 'guest'; device: { id: string; name: string } }> {
    return this.request({ type: 'invite', name });
  }

  async devices(): Promise<DeviceInfo[]> {
    return (await this.request<{ devices: DeviceInfo[] }>({ type: 'devices' })).devices;
  }

  async revokeDevice(deviceId: string): Promise<DeviceInfo[]> {
    return (await this.request<{ devices: DeviceInfo[] }>({ type: 'revoke', device_id: deviceId })).devices;
  }

  mediaHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.token}` };
  }
}
