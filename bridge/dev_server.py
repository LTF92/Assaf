#!/usr/bin/env python3
"""A fake Hermes for trying the app without Hermes (and for tests). Needs only ``websockets``.

    pip install websockets
    python3 bridge/dev_server.py --port 8765

It prints a pairing QR/link. In the app, try:
  * any text         → streamed markdown answer after two fake tool calls
  * "approve"        → an approval card (dangerous command)
  * "ask"            → a multiple-choice question card
  * "file"           → a file attachment
  * Arabic text      → a mixed Arabic/English answer (to check text direction)
"""

from __future__ import annotations

import argparse
import asyncio
import random
import sys
import tempfile
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from hermes_mobile.core import ChatStore, DeviceRegistry  # noqa: E402
from hermes_mobile.pair import detect_host, pairing_link, print_qr  # noqa: E402
from hermes_mobile.server import MobileServer  # noqa: E402

ANSWER = """**Done.** Here is what I found:

| Item | Status |
|---|---|
| Disk | 42% used |
| Services | all running |

```bash
systemctl status hermes-gateway
```

Want me to clean the cache too?"""

ANSWER_AR = """**تم.** هذي النتيجة:

| العنصر | الحالة |
|---|---|
| القرص | مستخدم 42% |
| الخدمات | كلها شغالة |

الأوامر اللي شغلتها:

```bash
systemctl status hermes-gateway
```

> ملاحظة: الكاش حجمه كبير شوي.

Steps to clean it:

1. Stop the gateway
2. Run `hermes cache clear`

تبيني أنظف الكاش؟"""


class FakeHermes:
    def __init__(self, workdir: Path, delay: float = 0.4):
        self.server: MobileServer | None = None
        self.workdir = workdir
        self.delay = delay

    def profile_info(self):
        return {"name": "demo", "label": "Demo Agent"}

    async def _say(self, chat_id: str, **fields):
        msg = self.server.store.upsert(chat_id, role="assistant", **fields)
        await self.server.publish_message(msg)
        return msg

    async def on_send(self, device, text, attachments, message):
        asyncio.create_task(self._respond(device.chat_id, text.strip().lower(), attachments))

    async def _respond(self, chat_id, text, attachments):
        s = self.server
        await s.publish_typing(chat_id, True)
        await asyncio.sleep(self.delay)
        if text == "approve":
            await self._say(chat_id, kind="card", text="Run a dangerous command?", _private={"kind": "approval"},
                            card={"type": "approval", "state": "pending", "command": "rm -rf ./build && make release",
                                  "description": "recursive delete",
                                  "actions": [{"label": "Allow once", "value": "once", "style": "primary"},
                                              {"label": "Allow for session", "value": "session", "style": ""},
                                              {"label": "Deny", "value": "deny", "style": "danger"}]})
            return await s.publish_typing(chat_id, False)
        if text == "ask":
            await self._say(chat_id, kind="card", text="Which environment should I deploy to?", _private={"kind": "clarify"},
                            card={"type": "clarify", "state": "pending",
                                  "actions": [{"label": "staging", "value": "c:0"}, {"label": "production", "value": "c:1"},
                                              {"label": "Other…", "value": "other", "style": "secondary"}]})
            return await s.publish_typing(chat_id, False)
        if text == "file":
            f = self.workdir / "report.txt"
            f.write_text("Hermes demo report\n")
            await self._say(chat_id, kind="media", text="Here is the report.",
                            media={"id": uuid.uuid4().hex, "kind": "file", "name": "report.txt", "mime": "text/plain",
                                   "size": f.stat().st_size}, _private={"path": str(f)})
            return await s.publish_typing(chat_id, False)
        for cmd, out in (("df -h /", "Filesystem  Size  Used Avail Use%\n/dev/sda1   100G   42G   58G  42%"),
                         ("systemctl --failed", "0 loaded units listed.")):
            call = uuid.uuid4().hex[:8]
            await self._say(chat_id, message_id=f"tool-{call}", kind="tool", text=cmd,
                            tool={"name": "terminal", "status": "running", "args": f'{{"command": "{cmd}"}}'})
            await asyncio.sleep(self.delay)
            await self._say(chat_id, message_id=f"tool-{call}", kind="tool", text=cmd,
                            tool={"name": "terminal", "status": "ok", "args": f'{{"command": "{cmd}"}}',
                                  "output": out, "duration_ms": random.randint(80, 900)})
        if attachments:
            await self._say(chat_id, text=f"Got {len(attachments)} attachment(s): "
                                          + ", ".join(a['name'] for a in attachments))
        msg = await self._say(chat_id, text="")
        answer = ANSWER_AR if any("\u0600" <= ch <= "\u06ff" for ch in text) else ANSWER
        for i in range(0, len(answer), 24):  # stream like the real gateway (send + edits)
            msg = s.store.upsert(chat_id, msg["id"], text=answer[: i + 24])
            await s.publish_message(msg)
            await asyncio.sleep(0.05)
        await s.publish_typing(chat_id, False)

    async def on_action(self, device, message, value):
        labels = {"once": "Allowed once", "session": "Allowed for session", "deny": "Denied",
                  "c:0": "staging", "c:1": "production"}
        if value == "other":
            return ""
        chat_id = message["chat_id"]
        asyncio.create_task(self._say(chat_id, text=f"OK — **{labels.get(value, value)}**."))
        return labels.get(value, value)

    async def on_presence(self, device, chat_id):
        return None


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--public-host", help="address phones dial (default: Tailscale or LAN IP)")
    ap.add_argument("--dir", default=None, help="state directory (default: a temp dir)")
    ap.add_argument("--token-file", help="write a fresh owner token here (for tests)")
    ap.add_argument("--delay", type=float, default=0.4)
    args = ap.parse_args()
    workdir = Path(args.dir or tempfile.mkdtemp(prefix="hermes-mobile-dev-"))
    reg, store = DeviceRegistry(workdir / "devices.json"), ChatStore(workdir)
    fake = FakeHermes(workdir, args.delay)
    server = MobileServer(reg, store, fake, host=args.host, port=args.port)
    fake.server = server
    await server.start()
    _, token = reg.pair("Dev phone")
    if args.token_file:
        Path(args.token_file).write_text(token)
    else:
        link = pairing_link(f"ws://{args.public_host or detect_host()}:{server.port}", token, "demo", "Demo Agent", "owner")
        print_qr(link)
        print(link, flush=True)
    print(f"listening on {args.host}:{server.port}", flush=True)
    await asyncio.Future()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
