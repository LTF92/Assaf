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
| `welcome` | `protocol`, `device {id,name,role,chat_id}`, `profile {name,label,host}`, `chat_id` |
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
  "origin": "scheduled",                                          // optional: sent unprompted (cron job, reminder)
  "tool":  {"name": "terminal", "status": "running|ok|error|info", "args": "…", "output": "…", "duration_ms": 812},
  "card":  {"type": "approval|clarify|confirm", "state": "pending|resolved|expired",
            "title": "…", "command": "…", "actions": [{"label": "Approve once", "value": "once", "style": "primary|danger|"}],
            "resolution": {"label": "Approved once", "value": "once", "by": "Lateef iPhone"}, "awaiting_text": false},
  "media": {"id": "…", "kind": "image|file|audio|video", "name": "…", "mime": "…", "size": 1234, "url": "…?"}
}
```

`origin: "scheduled"` marks an assistant message the agent sent on its own: a cron delivery
(Hermes passes cron/job keys in the send metadata) or any reply that arrives more than 15 minutes
after the user last wrote in that chat. The app gathers these, with pending approvals, in its
main channel. `profile.host` is the machine's friendly name ("MacBook Pro").

Every create or edit bumps the chat's `rev`, so a reconnecting phone sends `since=<last rev>`
and receives exactly the messages that were created **or changed** while it was away (streamed
answers are edits of one message).

### Push

The phone sends `{type: "push_token", token}`. On iPhone the token is `apns:<hex>`: the bridge pushes
straight to Apple with the owner's APNs key from `~/.hermes/apns/` (`AuthKey_<KEYID>.p8` plus
`apns.json` `{"team_id": "…"}`), trying production then sandbox. Other tokens go through Expo.

### Models (owner only)

`{type: "models", refresh?}` returns `{type: "models", current: {model, provider}, providers: [{slug, name, models: [id]}]}`,
the configured catalog Hermes's own `/model` picker uses. The app's brain menu switches by sending
a normal `/model <id> --provider <slug>` message (session-scoped), and shows that message as a small note.

### Rich blocks inside `text`

Assistant markdown can carry cards in a fenced block whose language is `hamza`, holding JSON
(one object or an array). Types: `progress`, `stats`, `chart` (bar/line/pie), `link`, `location`,
`images`, `file`, `audio`, `video`, `choices`, `form`, `checklist`. The full field list is in
`bridge/hermes_mobile/skills/hamza-blocks/SKILL.md` (installed into each profile as a Hermes
skill). Interactive blocks answer by sending a normal user message. Invalid JSON is shown as code.

## Scheduled jobs, notifications and guests (owner tools)

All requests carry a `ref`; the reply echoes it.

| Frame | Who | Reply |
| --- | --- | --- |
| `{"type":"jobs","op":"list"}` | owner | `{"type":"jobs","jobs":[Job…]}` |
| `{"type":"jobs","op":"create","name","prompt","schedule","show"}` | owner | `{"type":"jobs","job":Job}` |
| `{"type":"jobs","op":"update","id", …any of name/prompt/schedule/show}` | owner | `{"type":"jobs","job":Job}` |
| `{"type":"jobs","op":"pause"\|"resume"\|"run","id"}` | owner | `{"type":"jobs","job":Job}` |
| `{"type":"jobs","op":"delete","id"}` | owner | `{"type":"jobs","deleted":id}` |
| `{"type":"notify","approval","scheduled","errors","replies","muted","quiet":{"on","start","end"},"tz"}` | any | none (stored per device) |
| `{"type":"invite","name","scope","topic","expires_in"}` | owner | `{"type":"invite","token","device","profile"}` |
| `{"type":"update_guest","device_id","scope?","topic?","expires_in?"}` | owner | `{"type":"devices","devices":[…]}` |

`schedule` is `{"freq":"daily"|"weekly"|"monthly","time":"HH:MM","days":[0=Sun…6],"dom":1…28}` and maps to a
5-field cron expression. A `Job` adds `schedule` (null when the cron expression is something the app can't edit;
`schedule_display` then shows it), `enabled`, `state`, `next_run_at`, `last_run_at`, `last_status`, `last_error`
and `show` (`inbox` = main channel and chat, `chat` = chat only, `silent` = Hermes `deliver: local`).
Failures always reach the main channel. Errors come back as `{"type":"error","code":…}` with `forbidden`,
`jobs_unavailable`, `not_found`, `bad_time`, `no_days`, `bad_day`, `empty_prompt` or `bad_schedule`.

Guest devices carry `scope` (`chat` = no tools, `read` = read-only tools, `full`), an optional `topic` and
`expires_at` (unix seconds or null). An expired guest is refused at login and disconnected on its next frame.
Approvals raised in a guest chat go to the owner chat with `card.guest = {id, name}`; the guest sees a
`role: "system"` note instead. `profile` in `welcome` includes `owner` (the Mac user's name), and a guest's
`device` includes its limits. Guest pairing links add `scope`, `topic`, `exp` and `from`.

## HTTP

* `GET /health` → `{"ok": true}`
* `GET /media/<media id>` with `Authorization: Bearer <token>` → the file (only for media in
  that device's own chat).
