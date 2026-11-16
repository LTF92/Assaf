"""Scheduled jobs, notification preferences and guest limits (Hermes-independent parts)."""

import sys
import time
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from hermes_mobile.core import DeviceRegistry  # noqa: E402
from hermes_mobile.jobs import JobPrefs, JobsService, cron_to_schedule, schedule_to_cron  # noqa: E402
from hermes_mobile.policy import guest_block, guest_prompt, wants_push  # noqa: E402
from hermes_mobile.server import JobsError  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dev_server import FakeCron  # noqa: E402


def test_schedule_round_trip():
    for spec in ({"freq": "daily", "time": "07:30"}, {"freq": "weekly", "time": "08:00", "days": [0, 3]},
                 {"freq": "monthly", "time": "09:05", "dom": 1}):
        assert cron_to_schedule(schedule_to_cron(spec)) == spec
    assert schedule_to_cron({"freq": "weekly", "time": "8:00", "days": [0]}) == "0 8 * * 0"
    assert cron_to_schedule("*/5 * * * *") is None
    for bad in ({"freq": "daily", "time": "25:00"}, {"freq": "weekly", "time": "08:00", "days": []},
                {"freq": "monthly", "time": "08:00", "dom": 31}, {"freq": "yearly", "time": "08:00"}):
        with pytest.raises(JobsError):
            schedule_to_cron(bad)


def test_jobs_service(tmp_path):
    svc = JobsService(JobPrefs(tmp_path / "jobs.json"), cron=FakeCron())
    job = svc.handle({"op": "create", "name": "Morning", "prompt": "summarise", "show": "chat",
                      "schedule": {"freq": "daily", "time": "07:00"}})["job"]
    assert job["schedule"] == {"freq": "daily", "time": "07:00"} and job["show"] == "chat" and job["enabled"]
    job = svc.handle({"op": "pause", "id": job["id"]})["job"]
    assert not job["enabled"]
    job = svc.handle({"op": "update", "id": job["id"], "show": "silent",
                      "schedule": {"freq": "weekly", "time": "08:00", "days": [5]}})["job"]
    assert job["show"] == "silent" and job["schedule"]["days"] == [5]
    assert len(svc.handle({"op": "list"})["jobs"]) == 1
    assert svc.handle({"op": "delete", "id": job["id"]}) == {"deleted": job["id"]}
    with pytest.raises(JobsError):
        svc.handle({"op": "run", "id": job["id"]})


def test_wants_push():
    assert wants_push(None, "reply") and wants_push(None, "approval")
    assert not wants_push({"muted": True}, "approval")
    assert not wants_push({"scheduled": False}, "scheduled") and wants_push({"scheduled": False}, "error")
    quiet = {"quiet": {"on": True, "start": 23, "end": 7}, "tz": 180}  # UTC+3
    midnight_riyadh = 21 * 3600  # 21:00 UTC = 00:00 in Riyadh
    assert not wants_push(quiet, "scheduled", now=midnight_riyadh)
    assert wants_push(quiet, "approval", now=midnight_riyadh)  # approvals pass quiet hours
    assert wants_push(quiet, "scheduled", now=9 * 3600)  # noon in Riyadh


def test_guest_limits(tmp_path):
    assert guest_block("chat", "read_file") and guest_block("read", "terminal")
    assert guest_block("read", "read_file") is None and guest_block("full", "terminal") is None
    assert "website" in guest_prompt("Khalid", "read", "website")
    reg = DeviceRegistry(tmp_path / "devices.json")
    guest, token = reg.pair("Khalid", role="guest", scope="read", topic="website", expires_at=time.time() + 60)
    assert reg.authenticate(token).scope == "read" and guest.public()["topic"] == "website"
    reg.update(guest.id, expires_at=time.time() - 1)
    assert reg.authenticate(token) is None
    with pytest.raises(ValueError):
        reg.pair("x", role="guest", scope="admin")
