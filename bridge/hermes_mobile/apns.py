"""Push straight from this Mac to Apple (APNs), with the owner's own APNs key. No third party in between.

Setup (shared by every profile on the Mac):

    ~/.hermes/apns/AuthKey_<KEYID>.p8     the key downloaded from developer.apple.com
    ~/.hermes/apns/apns.json              {"team_id": "ABCDE12345"}   (key_id / topic optional)

The phone registers ``apns:<hex device token>``. A token from a debug build only works on Apple's
sandbox host, an App Store / TestFlight one only on production, so each token is tried on production
first and remembered on whichever host accepts it.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

PREFIX = "apns:"
DEFAULT_TOPIC = "com.ltf92.hermesmobile"
HOSTS = {"production": "https://api.push.apple.com", "sandbox": "https://api.sandbox.push.apple.com"}
JWT_TTL = 45 * 60  # Apple accepts a token for an hour; refresh well before that


def apns_dir() -> Path:
    return Path(os.environ.get("HERMES_MOBILE_APNS_DIR") or Path.home() / ".hermes" / "apns").expanduser()


class APNs:
    def __init__(self, folder: Optional[Path] = None):
        self.folder = folder or apns_dir()
        self._jwt: tuple[str, float] | None = None
        self._env: dict[str, str] = {}  # token -> host that accepted it

    def config(self) -> Optional[dict[str, str]]:
        """``{key, key_id, team_id, topic}``, or None when the Mac has no key set up yet."""
        try:
            cfg = json.loads((self.folder / "apns.json").read_text()) if (self.folder / "apns.json").exists() else {}
            keys = sorted(self.folder.glob("AuthKey_*.p8"))
            key_file = self.folder / cfg["key_file"] if cfg.get("key_file") else (keys[0] if keys else None)
            team = str(cfg.get("team_id") or os.environ.get("HERMES_MOBILE_APNS_TEAM_ID") or "")
            if not key_file or not key_file.exists() or not team:
                return None
            key_id = str(cfg.get("key_id") or key_file.stem.removeprefix("AuthKey_"))
            return {"key": key_file.read_text(), "key_id": key_id, "team_id": team,
                    "topic": str(cfg.get("topic") or DEFAULT_TOPIC)}
        except Exception:
            logger.debug("[hermes_mobile] apns config unreadable", exc_info=True)
            return None

    def _token(self, cfg: dict[str, str]) -> str:
        now = time.time()
        if self._jwt and now - self._jwt[1] < JWT_TTL:
            return self._jwt[0]
        import jwt  # PyJWT[crypto] ships with Hermes
        token = jwt.encode({"iss": cfg["team_id"], "iat": int(now)}, cfg["key"], algorithm="ES256",
                           headers={"kid": cfg["key_id"]})
        self._jwt = (token, now)
        return token

    async def send(self, device_token: str, title: str, body: str, data: dict[str, Any]) -> str:
        """``ok`` | ``gone`` (drop the token) | ``error`` | ``unconfigured``."""
        cfg = self.config()
        if cfg is None:
            return "unconfigured"
        hex_token = device_token.removeprefix(PREFIX)
        payload = {"aps": {"alert": {"title": title, "body": body}, "sound": "default",
                           "thread-id": str(data.get("chat_id") or "")}, **data, "body": data}
        envs = [self._env[hex_token]] if hex_token in self._env else ["production", "sandbox"]
        for env in envs:
            status, reason = await asyncio.to_thread(self._post, env, hex_token, cfg, payload)
            if status == 200:
                self._env[hex_token] = env
                return "ok"
            if status == 403 and reason in ("ExpiredProviderToken", "InvalidProviderToken"):
                self._jwt = None
            if status == 410 or (reason == "Unregistered"):
                return "gone"
            if reason == "BadDeviceToken" and env != envs[-1]:
                continue  # a sandbox token on the production host: try the other one
            logger.info("[hermes_mobile] apns %s %s on %s", status, reason, env)
            return "gone" if reason == "BadDeviceToken" and len(envs) > 1 else "error"
        return "error"

    def _post(self, env: str, hex_token: str, cfg: dict[str, str], payload: dict[str, Any]) -> tuple[int, str]:
        url = f"{HOSTS[env]}/3/device/{hex_token}"
        headers = {"authorization": f"bearer {self._token(cfg)}", "apns-topic": cfg["topic"],
                   "apns-push-type": "alert", "apns-priority": "10"}
        body = json.dumps(payload, ensure_ascii=False).encode()
        try:  # httpx speaks HTTP/2 when the h2 package is there...
            import h2  # noqa: F401
            import httpx
            with httpx.Client(http2=True, timeout=10) as client:
                r = client.post(url, content=body, headers=headers)
                return r.status_code, _reason(r.text)
        except ImportError:
            pass
        curl = shutil.which("curl")  # ...otherwise the system curl does (macOS ships one with HTTP/2)
        if not curl:
            return 0, "no_http2"
        args = [curl, "-sS", "--http2", "-m", "10", "-o", "-", "-w", "\n%{http_code}", "-X", "POST", "--data-binary", "@-"]
        for k, v in headers.items():
            args += ["-H", f"{k}: {v}"]
        args.append(url)
        try:
            out = subprocess.run(args, input=body, capture_output=True, timeout=15).stdout.decode(errors="replace")
        except Exception as exc:
            return 0, str(exc)
        text, _, code = out.rpartition("\n")
        return (int(code) if code.strip().isdigit() else 0), _reason(text)


def _reason(text: str) -> str:
    try:
        return str(json.loads(text).get("reason") or "")
    except Exception:
        return ""
