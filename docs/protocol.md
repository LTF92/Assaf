# Hermes Mobile protocol (v1)

The phone talks to one **connection** per Hermes profile. A connection is a WebSocket served by
the `hermes_mobile` plugin running inside that profile's gateway.

```
Phone app  ──ws://host:port/ws──►  hermes_mobile plugin  ──►  Hermes gateway  ──►  agent
           ◄── upserts, cards ───                        ◄──  replies, tools, approvals
```

## Pairing

`pair.py pair` creates a device and prints a QR code containing

```
hermesmobile://pair?d=<base64url(JSON)>
{"v":1, "url":"ws://100.x.y.z:8765", "token":"<secret>", "profile":"coder", "label":"Coder", "role":"owner|guest"}
```

Only the SHA-256 of the token is stored on the server (`<profile home>/mobile/devices.json`).

* **owner** devices share the chat `owner` (your phone and tablet see the same conversation).
* **guest** devices get a private chat `guest-<id>` and nothing else on that profile.

## Frames (JSON text)

### Client → server

| type | fields | notes |
|---|---|---|
| `auth` | `token`, `since` (last `rev` seen, 0 for none) | must be the first frame, within 15 s |
| `send` | `client_id`, `text`, `attachments?: [{name, mime, data(base64)}]` | max 20 000 chars, 6 files, 20 MB each. Resending the same `client_id` is a no-op. |
| `action` | `message_id`, `value` | tap a button on a card |
| `history` | `before_ts`, `ref?` | older page (100 messages) |
| `presence` | `active: bool` | app foreground/background (push is sent only when no phone is active) |
| `push_token` | `token` (Expo push token or null) | |
| `ping` | `t?` | answered with `pong` |

### Server → client

| type | fields |
|---|---|
| `welcome` | `protocol`, `device {id,name,role,chat_id}`, `profile {name,label}`, `chat_id` |
| `sync` | `messages[]`, `rev`, `truncated`, `reset` (sent right after `welcome`) |
| `upsert` | `message` (create or replace by `id`) |
| `typing` | `on` (the app hides it after ~8 s without a refresh) |
| `history` | `messages[]`, `ref` |
| `error` | `code`, `ref?` (`unauthorized`, `revoked`, `card_closed`, `bad_choice`, `text_too_long`, …) |
| `pong` | `t` |

## Message

```jsonc
{
  "id": "…", "rev": 42, "chat_id": "owner",
  "role": "user" | "assistant" | "system",
  "kind": "text" | "tool" | "card" | "media",
  "text": "markdown",
  "ts": 1731337200.1, "updated_ts": 1731337201.5,
  "deleted": false, "interim": false, "client_id": "…",          // user messages echo client_id
  "tool":  {"name": "terminal", "status": "running|ok|error|info", "args": "…", "output": "…", "duration_ms": 812},
  "card":  {"type": "approval|clarify|confirm", "state": "pending|resolved|expired",
            "title": "…", "command": "…", "actions": [{"label": "Approve once", "value": "once", "style": "primary|danger|"}],
            "resolution": {"label": "Approved once", "value": "once", "by": "Lateef iPhone"}, "awaiting_text": false},
  "media": {"id": "…", "kind": "image|file|audio|video", "name": "…", "mime": "…", "size": 1234, "url": "…?"}
}
```

Every create or edit bumps the chat's `rev`, so a reconnecting phone sends `since=<last rev>`
and receives exactly the messages that were created **or changed** while it was away (streamed
answers are edits of one message).

## HTTP

* `GET /health` → `{"ok": true}`
* `GET /media/<media id>` with `Authorization: Bearer <token>` → the file (only for media in
  that device's own chat).
