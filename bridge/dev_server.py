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
  * "cron"           → a scheduled report, as a cron job delivers it (lands in the main channel)

``--seed`` starts the chat with a scheduled report and a pending approval.
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
from hermes_mobile.jobs import JobPrefs, JobsService  # noqa: E402
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


REPORT = """تقرير الصباح
السيرفر شغال، القرص مستخدم **42%**، وما فيه خدمات واقفة.

- النسخ الاحتياطي: تم 3:00 ص
- التحديثات: لا شيء جديد"""

APPROVAL = {"type": "approval", "state": "pending", "command": "rm -rf ./build && make release",
            "description": "recursive delete",
            "actions": [{"label": "Allow once", "value": "once", "style": "primary"},
                        {"label": "Allow for session", "value": "session", "style": ""},
                        {"label": "Deny", "value": "deny", "style": "danger"}]}


BLOCKS_1 = """هذا ملخص أداء الخوادم لهذا الأسبوع:

| الخادم | المعالج | الذاكرة | القرص | الحالة | آخر تحديث |
|---|---|---|---|---|---|
| web-01 | 42% | 3.1 GB | 58% | **يعمل** | قبل دقيقتين |
| web-02 | 77% | 5.8 GB | 81% | تحذير | قبل 5 دقائق |
| db-main | 31% | 12.4 GB | 64% | يعمل | قبل دقيقة |

> ملاحظة: الخادم web-02 يحتاج تنظيف ملفات السجلات قريبًا.

```python
def disk_usage(path="/"):
    # يرجّع نسبة الاستخدام
    total, used, free = shutil.disk_usage(path)
    return round(used / total * 100, 1)
```

```hamza
[
  {"type": "progress", "title": "نشر الإصدار 2.4", "percent": 60,
   "steps": [{"label": "بناء الحزمة", "status": "done"}, {"label": "الاختبارات", "status": "done"},
             {"label": "رفع للخادم", "status": "running"}, {"label": "التحقق", "status": "waiting"}]},
  {"type": "stats", "items": [{"label": "الطلبات", "value": "12.4K", "note": "+8%", "tone": "good"},
                               {"label": "الأخطاء", "value": "37", "note": "+3", "tone": "bad"},
                               {"label": "زمن الاستجابة", "value": "182ms", "note": "ثابت"}]},
  {"type": "chart", "kind": "bar", "title": "الطلبات اليومية", "subtitle": "آخر 7 أيام", "unit": "K",
   "labels": ["سبت", "أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة"], "values": [8, 11, 9, 14, 12, 7, 5]},
  {"type": "chart", "kind": "line", "title": "استخدام المعالج", "labels": ["00", "04", "08", "12", "16", "20"], "values": [22, 18, 45, 71, 64, 38], "unit": "%"},
  {"type": "chart", "kind": "pie", "title": "توزيع الزيارات", "labels": ["جوال", "سطح المكتب", "تابلت"], "values": [62, 30, 8], "unit": "%"}
]
```
"""

BLOCKS_2 = """جهزت لك المطلوب:

```hamza
[
  {"type": "link", "url": "https://github.com/ltf92/assaf", "title": "ltf92/assaf", "description": "تطبيق همزة لوكلاء Hermes", "site": "github.com"},
  {"type": "location", "title": "مكتب الرياض", "address": "طريق الملك فهد، العليا، الرياض", "lat": 24.7136, "lng": 46.6753},
  {"type": "images", "images": ["https://picsum.photos/id/1018/600/400", "https://picsum.photos/id/1015/600/400", "https://picsum.photos/id/1039/600/400", "https://picsum.photos/id/1043/600/400", "https://picsum.photos/id/1050/600/400"], "caption": "صور الموقع"},
  {"type": "file", "name": "report-q3.pdf", "size": "2.4 MB", "meta": "PDF · 12 صفحة"},
  {"type": "audio", "url": "https://example.com/note.m4a", "duration": "0:42"},
  {"type": "video", "url": "https://example.com/demo.mp4", "duration": "2:15"},
  {"type": "choices", "question": "وش تبي أسوي بعدها؟", "options": [{"label": "أعد التشغيل", "primary": true}, "اعرض السجلات", "تجاهل"]},
  {"type": "form", "title": "حجز موعد صيانة", "fields": [{"name": "date", "label": "التاريخ", "type": "date", "value": "2026-11-20"},
     {"name": "window", "label": "الفترة", "type": "choice", "options": ["صباحًا", "مساءً"], "value": "صباحًا"},
     {"name": "note", "label": "ملاحظة", "type": "text"}], "submit": "تأكيد الحجز"},
  {"type": "checklist", "title": "قائمة ما قبل النشر", "items": [{"label": "تحديث الإصدار", "done": true}, {"label": "مراجعة السجل", "done": true}, {"label": "نسخة احتياطية"}, {"label": "إشعار الفريق"}]}
]
```
"""


class FakeCron:
    """In-memory stand-in for Hermes' ``cron.jobs`` (same function names and job shape)."""

    def __init__(self):
        self.jobs: dict[str, dict] = {}

    @staticmethod
    def parse_schedule(expr: str) -> dict:
        if len(expr.split()) != 5:
            raise ValueError(expr)
        return {"kind": "cron", "expr": expr, "display": expr}

    def create_job(self, prompt, schedule, name=None, deliver=None, origin=None, **_):
        job_id = uuid.uuid4().hex[:12]
        self.jobs[job_id] = {"id": job_id, "name": name or prompt[:50], "prompt": prompt,
                             "schedule": self.parse_schedule(schedule), "schedule_display": schedule,
                             "enabled": True, "state": "scheduled", "next_run_at": "2026-11-17T07:00:00+03:00",
                             "last_run_at": None, "last_status": None, "deliver": deliver, "origin": origin}
        return dict(self.jobs[job_id])

    def get_job(self, job_id):
        job = self.jobs.get(job_id)
        return dict(job) if job else None

    def list_jobs(self, include_disabled=False):
        return [dict(j) for j in self.jobs.values() if include_disabled or j["enabled"]]

    def update_job(self, job_id, updates):
        if job_id not in self.jobs:
            return None
        self.jobs[job_id].update(updates)
        return dict(self.jobs[job_id])

    def pause_job(self, job_id, reason=None):
        return self.update_job(job_id, {"enabled": False, "state": "paused", "next_run_at": None})

    def resume_job(self, job_id):
        return self.update_job(job_id, {"enabled": True, "state": "scheduled", "next_run_at": "2026-11-17T07:00:00+03:00"})

    def trigger_job(self, job_id):
        return self.update_job(job_id, {"next_run_at": "now"})

    def remove_job(self, job_id):
        return self.jobs.pop(job_id, None) is not None


class FakeHermes:
    def __init__(self, workdir: Path, delay: float = 0.4, profile: str = "demo", label: str = "Demo Agent"):
        self.server: MobileServer | None = None
        self.workdir = workdir
        self.delay = delay
        self.profile, self.label = profile, label
        self.model, self.provider = "claude-fable-5", "anthropic"
        self.cron = FakeCron()
        self.jobs = JobsService(JobPrefs(workdir / "jobs.json"), cron=self.cron)

    def profile_info(self):
        return {"name": self.profile, "label": self.label, "host": "MacBook Pro", "owner": "عبداللطيف"}

    async def on_models(self, device, msg):
        return {"current": {"model": self.model, "provider": self.provider}, "providers": [
            {"slug": "anthropic", "name": "Anthropic", "models": ["claude-fable-5", "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"]},
            {"slug": "openai-codex", "name": "OpenAI Codex", "models": ["gpt-6-astra", "gpt-6", "gpt-6-mini"]},
            {"slug": "openrouter", "name": "OpenRouter", "models": ["google/gemini-3-pro", "deepseek/deepseek-v4", "qwen/qwen-4-max"]}]}

    async def on_jobs(self, device, msg):
        return self.jobs.handle(msg)

    def seed_jobs(self, jobs):
        for name, prompt, spec, status, enabled in jobs:
            job = self.jobs.handle({"op": "create", "name": name, "prompt": prompt, "schedule": spec})["job"]
            self.cron.update_job(job["id"], {"last_status": status, "last_run_at": "2026-11-16T07:00:00+03:00"})
            if not enabled:
                self.cron.pause_job(job["id"])

    async def seed(self, chat_id: str):
        await self._say(chat_id, text=REPORT, origin="scheduled")
        await self._say(chat_id, kind="card", text="Run a dangerous command?", _private={"kind": "approval"}, card=APPROVAL)

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
                            card=APPROVAL)
            return await s.publish_typing(chat_id, False)
        if text.startswith("/model "):
            parts = text.split()
            self.model = parts[1]
            if "--provider" in parts:
                self.provider = parts[parts.index("--provider") + 1]
            await self._say(chat_id, text=f"Switched to `{self.model}` ({self.provider}) for this session.")
            return await s.publish_typing(chat_id, False)
        if text == "blocks":
            await self._say(chat_id, text=BLOCKS_1)
            await self._say(chat_id, text=BLOCKS_2)
            return await s.publish_typing(chat_id, False)
        if text == "cron":
            await self._say(chat_id, text=REPORT, origin="scheduled")
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
    ap.add_argument("--profile", default="demo")
    ap.add_argument("--label", default="Demo Agent")
    ap.add_argument("--seed", action="store_true", help="start with a scheduled report and a pending approval")
    ap.add_argument("--jobs", help="JSON file of [name, prompt, schedule, last_status, enabled] to seed")
    args = ap.parse_args()
    workdir = Path(args.dir or tempfile.mkdtemp(prefix="hermes-mobile-dev-"))
    reg, store = DeviceRegistry(workdir / "devices.json"), ChatStore(workdir)
    fake = FakeHermes(workdir, args.delay, args.profile, args.label)
    server = MobileServer(reg, store, fake, host=args.host, port=args.port)
    fake.server = server
    await server.start()
    device, token = reg.pair("Dev phone")
    if args.seed:
        await fake.seed(device.chat_id)
    if args.jobs:
        import json as _json
        fake.seed_jobs(_json.loads(Path(args.jobs).read_text(encoding="utf-8")))
    if args.token_file:
        Path(args.token_file).write_text(token)
    else:
        link = pairing_link(f"ws://{args.public_host or detect_host()}:{server.port}", token, args.profile, args.label, "owner")
        print_qr(link)
        print(link, flush=True)
    print(f"listening on {args.host}:{server.port}", flush=True)
    await asyncio.Future()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
