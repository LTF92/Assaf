"""Scheduled jobs (Hermes cron) for the phone: list, create, edit, pause, run now, delete.

The app speaks a small structured schedule (daily / weekly / monthly at a time) that maps to a
5-field cron expression; anything else Hermes accepts is shown read-only as ``custom``.

Nothing here imports Hermes at module load. ``JobsService`` takes the cron module to use, so
tests and ``dev_server.py`` can hand it a fake.
"""

from __future__ import annotations

import json
import re
import threading
from pathlib import Path
from typing import Any, Optional

from .server import JobsError

# Where a job's output shows up in the app: the main channel and the chat, the chat only, or
# nowhere (Hermes keeps it locally). Failures always reach the main channel.
SHOW_MODES = ("inbox", "chat", "silent")

_CRON_SIMPLE = re.compile(r"^(\d{1,2}) (\d{1,2}) (\*|\d{1,2}) \* (\*|[0-6](?:,[0-6])*)$")


def schedule_to_cron(spec: dict[str, Any]) -> str:
    """``{freq, time "HH:MM", days [0=Sun..6], dom}`` -> cron expression."""
    if not isinstance(spec, dict):
        raise JobsError("bad_schedule")
    freq = spec.get("freq")
    m = re.match(r"^(\d{1,2}):(\d{2})$", str(spec.get("time") or ""))
    if not m or int(m.group(1)) > 23 or int(m.group(2)) > 59:
        raise JobsError("bad_time")
    hh, mm = int(m.group(1)), int(m.group(2))
    if freq == "daily":
        return f"{mm} {hh} * * *"
    if freq == "weekly":
        days = sorted({int(d) for d in spec.get("days") or [] if str(d).isdigit() and 0 <= int(d) <= 6})
        if not days:
            raise JobsError("no_days")
        return f"{mm} {hh} * * {','.join(map(str, days))}"
    if freq == "monthly":
        dom = int(spec.get("dom") or 1)
        if not 1 <= dom <= 28:
            raise JobsError("bad_day")
        return f"{mm} {hh} {dom} * *"
    raise JobsError("bad_schedule")


def cron_to_schedule(expr: str) -> Optional[dict[str, Any]]:
    """The inverse for the shapes the app can edit; None for anything else."""
    m = _CRON_SIMPLE.match((expr or "").strip())
    if not m:
        return None
    mm, hh, dom, dow = m.groups()
    if int(hh) > 23 or int(mm) > 59:
        return None
    time = f"{int(hh):02d}:{int(mm):02d}"
    if dom == "*" and dow == "*":
        return {"freq": "daily", "time": time}
    if dom == "*":
        return {"freq": "weekly", "time": time, "days": [int(d) for d in dow.split(",")]}
    if dow == "*" and 1 <= int(dom) <= 31:
        return {"freq": "monthly", "time": time, "dom": int(dom)}
    return None


class JobPrefs:
    """Per-job display choices made in the app, in ``<dir>/jobs.json``."""

    def __init__(self, path: Path):
        self.path = Path(path)
        self._lock = threading.Lock()

    def _load(self) -> dict[str, Any]:
        try:
            return json.loads(self.path.read_text(encoding="utf-8") or "{}")
        except (OSError, ValueError):
            return {}

    def show(self, job_id: str) -> str:
        mode = (self._load().get(job_id) or {}).get("show")
        return mode if mode in SHOW_MODES else "inbox"

    def set_show(self, job_id: str, mode: str) -> None:
        if mode not in SHOW_MODES:
            raise JobsError("bad_show")
        with self._lock:
            data = self._load()
            data.setdefault(job_id, {})["show"] = mode
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self.path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")

    def forget(self, job_id: str) -> None:
        with self._lock:
            data = self._load()
            if data.pop(job_id, None) is not None:
                self.path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


def _iso(value: Any) -> Optional[str]:
    return str(value) if value else None


class JobsService:
    """Owner-side job management for one profile. ``cron`` is ``cron.jobs`` (or a fake)."""

    def __init__(self, prefs: JobPrefs, cron: Any = None, origin_chat: str = "owner", platform: str = "hermes_mobile"):
        self.prefs = prefs
        self._cron = cron
        self.origin = {"platform": platform, "chat_id": origin_chat}

    @property
    def cron(self) -> Any:
        if self._cron is None:
            try:
                from cron import jobs as cron_jobs  # Hermes
            except Exception as exc:  # pragma: no cover - only without Hermes
                raise JobsError("jobs_unavailable") from exc
            self._cron = cron_jobs
        return self._cron

    # -- shape sent to the phone
    def public(self, job: dict[str, Any]) -> dict[str, Any]:
        sched = job.get("schedule") or {}
        expr = sched.get("expr") if isinstance(sched, dict) else None
        state = job.get("state") or ("paused" if job.get("enabled") is False else "scheduled")
        last_status = job.get("last_status")
        return {
            "id": job.get("id"),
            "name": job.get("name") or "",
            "prompt": job.get("prompt") or "",
            "schedule": cron_to_schedule(expr) if expr else None,
            "schedule_display": job.get("schedule_display") or (sched.get("display") if isinstance(sched, dict) else ""),
            "enabled": bool(job.get("enabled", True)) and state != "paused",
            "state": state,
            "next_run_at": _iso(job.get("next_run_at")),
            "last_run_at": _iso(job.get("last_run_at")),
            "last_status": last_status,
            "last_error": job.get("last_error"),
            "deliver": job.get("deliver"),
            "show": "silent" if job.get("deliver") == "local" else self.prefs.show(str(job.get("id"))),
        }

    def _job(self, job_id: Any) -> dict[str, Any]:
        job = self.cron.get_job(str(job_id or ""))
        if not job:
            raise JobsError("not_found")
        return job

    def _parsed(self, spec: Any) -> tuple[dict[str, Any], str]:
        expr = schedule_to_cron(spec)
        try:
            parsed = self.cron.parse_schedule(expr)
        except ValueError as exc:
            raise JobsError("bad_schedule") from exc
        return parsed, parsed.get("display", expr)

    # -- requests
    def handle(self, msg: dict[str, Any]) -> dict[str, Any]:
        op = msg.get("op")
        if op == "list":
            return {"jobs": [self.public(j) for j in self.cron.list_jobs(include_disabled=True)]}
        if op == "create":
            name = str(msg.get("name") or "").strip()[:80]
            prompt = str(msg.get("prompt") or "").strip()
            if not prompt:
                raise JobsError("empty_prompt")
            show = msg.get("show") or "inbox"
            expr = schedule_to_cron(msg.get("schedule"))
            try:
                job = self.cron.create_job(prompt=prompt, schedule=expr, name=name or None,
                                           deliver="local" if show == "silent" else "origin", origin=self.origin)
            except ValueError as exc:
                raise JobsError("bad_job") from exc
            if show != "silent":
                self.prefs.set_show(job["id"], show)
            return {"job": self.public(job)}
        if op == "update":
            job = self._job(msg.get("id"))
            updates: dict[str, Any] = {}
            if "name" in msg:
                updates["name"] = str(msg.get("name") or "").strip()[:80] or job.get("name")
            if "prompt" in msg:
                prompt = str(msg.get("prompt") or "").strip()
                if not prompt:
                    raise JobsError("empty_prompt")
                updates["prompt"] = prompt
            if "schedule" in msg:
                updates["schedule"], updates["schedule_display"] = self._parsed(msg.get("schedule"))
            if "show" in msg:
                show = str(msg.get("show"))
                if show not in SHOW_MODES:
                    raise JobsError("bad_show")
                if show == "silent":
                    updates["deliver"] = "local"
                else:
                    if job.get("deliver") == "local":
                        updates["deliver"], updates["origin"] = "origin", job.get("origin") or self.origin
                    self.prefs.set_show(job["id"], show)
            updated = self.cron.update_job(job["id"], updates) if updates else job
            return {"job": self.public(updated or job)}
        if op in ("pause", "resume"):
            job = self._job(msg.get("id"))
            fn = self.cron.pause_job if op == "pause" else self.cron.resume_job
            updated = fn(job["id"]) if op == "resume" else fn(job["id"], "Paused from the phone")
            return {"job": self.public(updated or self._job(job["id"]))}
        if op == "run":
            job = self._job(msg.get("id"))
            updated = self.cron.trigger_job(job["id"])
            return {"job": self.public(updated or job)}
        if op == "delete":
            job = self._job(msg.get("id"))
            if not self.cron.remove_job(job["id"]):
                raise JobsError("not_found")
            self.prefs.forget(job["id"])
            return {"deleted": job["id"]}
        raise JobsError("bad_request")
