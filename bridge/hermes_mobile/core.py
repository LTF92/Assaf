"""Hermes Mobile bridge: device registry and chat store.

Nothing in this module imports Hermes, so it can be unit-tested on its own.

* ``DeviceRegistry`` keeps the paired phones of ONE Hermes profile. Each device holds a random
  bearer token; only its SHA-256 is written to disk. A device is either the profile ``owner``
  (all owner devices share one chat) or a ``guest`` (a friend you gave this profile to, with
  their own private chat).
* ``ChatStore`` keeps the recent messages of each chat as an upsertable list. Every change bumps
  a per-chat revision counter, so a phone that reconnects asks for "everything after rev N" and
  receives the messages that were created *or edited* while it was away.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import tempfile
import threading
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Optional

OWNER_CHAT_ID = "owner"
ROLES = ("owner", "guest")
MAX_MESSAGES_PER_CHAT = 600
MAX_TEXT_CHARS = 200_000

# Keys of a stored message that never leave the bridge (approval request ids, session keys...).
PRIVATE_KEY = "_private"


def _now() -> float:
    return time.time()


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _atomic_write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".tmp-", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False, indent=1)
        os.chmod(tmp, 0o600)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


# ─────────────────────────────────────────────────────────────────────────── devices


@dataclass
class Device:
    id: str
    name: str
    role: str
    chat_id: str
    token_hash: str
    created_at: float = field(default_factory=_now)
    last_seen: Optional[float] = None
    push_token: Optional[str] = None

    def public(self) -> dict[str, Any]:
        return {"id": self.id, "name": self.name, "role": self.role, "chat_id": self.chat_id}

    @property
    def is_owner(self) -> bool:
        return self.role == "owner"


class DeviceRegistry:
    """Paired devices of one profile, stored in ``<dir>/devices.json`` (mode 600).

    The file is re-read when its mtime changes, so ``hermes mobile pair`` (a separate process)
    takes effect on a running gateway without a restart.
    """

    def __init__(self, path: Path):
        self.path = Path(path)
        self._lock = threading.RLock()
        self._devices: dict[str, Device] = {}
        self._mtime: Optional[float] = None
        self._reload(force=True)

    # -- persistence
    def _reload(self, force: bool = False) -> None:
        with self._lock:
            try:
                mtime = self.path.stat().st_mtime
            except FileNotFoundError:
                if force or self._mtime is not None:
                    self._devices, self._mtime = {}, None
                return
            if not force and mtime == self._mtime:
                return
            try:
                raw = json.loads(self.path.read_text(encoding="utf-8") or "{}")
            except (OSError, ValueError):
                return  # keep the last good copy
            devices = {}
            for item in raw.get("devices", []):
                try:
                    dev = Device(**{k: item.get(k) for k in Device.__dataclass_fields__ if k in item})
                except TypeError:
                    continue
                if dev.role in ROLES and dev.token_hash:
                    devices[dev.id] = dev
            self._devices, self._mtime = devices, mtime

    def _save(self) -> None:
        with self._lock:
            _atomic_write_json(self.path, {"version": 1, "devices": [asdict(d) for d in self._devices.values()]})
            try:
                self._mtime = self.path.stat().st_mtime
            except OSError:
                self._mtime = None

    # -- api
    def pair(self, name: str, role: str = "owner") -> tuple[Device, str]:
        """Create a device and return ``(device, token)``. The token is shown once and never stored."""
        if role not in ROLES:
            raise ValueError(f"role must be one of {ROLES}")
        name = (name or "").strip()[:60] or ("My phone" if role == "owner" else "Guest")
        token = secrets.token_urlsafe(32)
        dev_id = uuid.uuid4().hex[:12]
        chat_id = OWNER_CHAT_ID if role == "owner" else f"guest-{dev_id}"
        dev = Device(id=dev_id, name=name, role=role, chat_id=chat_id, token_hash=_hash_token(token))
        with self._lock:
            self._reload()
            self._devices[dev.id] = dev
            self._save()
        return dev, token

    def authenticate(self, token: Optional[str]) -> Optional[Device]:
        if not token or not isinstance(token, str) or len(token) > 200:
            return None
        wanted = _hash_token(token)
        with self._lock:
            self._reload()
            for dev in self._devices.values():
                if hmac.compare_digest(dev.token_hash, wanted):
                    return dev
        return None

    def get(self, device_id: str) -> Optional[Device]:
        with self._lock:
            self._reload()
            return self._devices.get(device_id)

    def list(self) -> list[Device]:
        with self._lock:
            self._reload()
            return sorted(self._devices.values(), key=lambda d: d.created_at)

    def revoke(self, device_id: str) -> bool:
        with self._lock:
            self._reload()
            if self._devices.pop(device_id, None) is None:
                return False
            self._save()
            return True

    def update(self, device_id: str, **fields: Any) -> None:
        with self._lock:
            self._reload()
            dev = self._devices.get(device_id)
            if dev is None:
                return
            for key, value in fields.items():
                if key in ("last_seen", "push_token", "name"):
                    setattr(dev, key, value)
            self._save()

    def devices_for_chat(self, chat_id: str) -> list[Device]:
        return [d for d in self.list() if d.chat_id == chat_id]


# ─────────────────────────────────────────────────────────────────────────── chat store


def public_message(msg: dict[str, Any]) -> dict[str, Any]:
    """The wire form of a stored message (private bookkeeping stripped)."""
    return {k: v for k, v in msg.items() if k != PRIVATE_KEY}


class ChatStore:
    """Recent messages per chat, persisted to ``<dir>/chats/<chat_id>.json``.

    Message shape (see docs/protocol.md)::

        {id, rev, chat_id, role: user|assistant|system, kind: text|tool|status|card|media,
         text, ts, updated_ts, final, deleted, client_id?, tool?, card?, media?}
    """

    def __init__(self, directory: Path, *, max_messages: int = MAX_MESSAGES_PER_CHAT):
        self.dir = Path(directory)
        self.max_messages = max_messages
        self._lock = threading.RLock()
        self._chats: dict[str, dict[str, Any]] = {}
        self._dirty: set[str] = set()

    # -- persistence
    def _file(self, chat_id: str) -> Path:
        safe = "".join(c for c in chat_id if c.isalnum() or c in "-_") or "chat"
        return self.dir / "chats" / f"{safe}.json"

    def _chat(self, chat_id: str) -> dict[str, Any]:
        chat = self._chats.get(chat_id)
        if chat is None:
            chat = {"rev": 0, "messages": {}}
            try:
                raw = json.loads(self._file(chat_id).read_text(encoding="utf-8"))
                chat["rev"] = int(raw.get("rev", 0))
                for m in raw.get("messages", []):
                    if isinstance(m, dict) and m.get("id"):
                        chat["messages"][m["id"]] = m
            except (OSError, ValueError, TypeError):
                pass
            self._chats[chat_id] = chat
        return chat

    def flush(self) -> None:
        with self._lock:
            dirty, self._dirty = self._dirty, set()
            snapshots = {cid: {"rev": self._chats[cid]["rev"],
                               "messages": list(self._chats[cid]["messages"].values())}
                         for cid in dirty if cid in self._chats}
        for cid, snap in snapshots.items():
            try:
                _atomic_write_json(self._file(cid), snap)
            except OSError:
                with self._lock:
                    self._dirty.add(cid)

    @property
    def has_unsaved(self) -> bool:
        return bool(self._dirty)

    # -- api
    def rev(self, chat_id: str) -> int:
        with self._lock:
            return self._chat(chat_id)["rev"]

    def get(self, chat_id: str, message_id: str) -> Optional[dict[str, Any]]:
        with self._lock:
            msg = self._chat(chat_id)["messages"].get(message_id)
            return dict(msg) if msg else None

    def upsert(self, chat_id: str, message_id: Optional[str] = None, **fields: Any) -> dict[str, Any]:
        """Create or update a message; returns the stored copy (with private keys)."""
        with self._lock:
            chat = self._chat(chat_id)
            chat["rev"] += 1
            now = _now()
            message_id = message_id or uuid.uuid4().hex[:16]
            msg = chat["messages"].get(message_id)
            if msg is None:
                msg = {"id": message_id, "chat_id": chat_id, "role": "assistant", "kind": "text", "text": "",
                       "ts": now, "final": True, "deleted": False}
                chat["messages"][message_id] = msg
            for key, value in fields.items():
                if key == "text" and isinstance(value, str) and len(value) > MAX_TEXT_CHARS:
                    value = value[:MAX_TEXT_CHARS] + "\n…"
                if key == PRIVATE_KEY and isinstance(value, dict):
                    merged = dict(msg.get(PRIVATE_KEY) or {})
                    merged.update(value)
                    value = merged
                msg[key] = value
            msg["rev"] = chat["rev"]
            msg["updated_ts"] = now
            self._trim(chat)
            self._dirty.add(chat_id)
            return dict(msg)

    def delete(self, chat_id: str, message_id: str) -> Optional[dict[str, Any]]:
        with self._lock:
            if message_id not in self._chat(chat_id)["messages"]:
                return None
            return self.upsert(chat_id, message_id, deleted=True, text="")

    def since(self, chat_id: str, rev: int = 0, limit: int = 200) -> tuple[list[dict[str, Any]], int, bool]:
        """Messages changed after ``rev`` -> ``(public messages ordered by ts, current rev, truncated)``.

        A fresh phone (rev 0) gets the newest ``limit`` messages; ``truncated`` tells it older ones exist.
        """
        with self._lock:
            chat = self._chat(chat_id)
            changed = [m for m in chat["messages"].values() if m.get("rev", 0) > rev]
            changed.sort(key=lambda m: (m.get("ts", 0), m.get("rev", 0)))
            truncated = len(changed) > limit
            if truncated:
                changed = changed[-limit:]
            return [public_message(m) for m in changed], chat["rev"], truncated

    def before(self, chat_id: str, ts: float, limit: int = 100) -> list[dict[str, Any]]:
        """Older history page (messages strictly older than ``ts``)."""
        with self._lock:
            older = [m for m in self._chat(chat_id)["messages"].values() if m.get("ts", 0) < ts]
            older.sort(key=lambda m: (m.get("ts", 0), m.get("rev", 0)))
            return [public_message(m) for m in older[-limit:]]

    def find(self, chat_id: str, predicate) -> list[dict[str, Any]]:
        with self._lock:
            return [dict(m) for m in self._chat(chat_id)["messages"].values() if predicate(m)]

    def _trim(self, chat: dict[str, Any]) -> None:
        msgs = chat["messages"]
        overflow = len(msgs) - self.max_messages
        if overflow <= 0:
            return
        oldest = sorted(msgs.values(), key=lambda m: (m.get("ts", 0), m.get("rev", 0)))
        for m in oldest:
            if overflow <= 0:
                break
            card = m.get("card") or {}
            if card.get("state") == "pending":
                continue  # never drop an unanswered approval
            msgs.pop(m["id"], None)
            overflow -= 1


# ─────────────────────────────────────────────────────────────────────────── classification

_PROGRESS_PREFIXES = ("💬 ", "⚙️ ", "🔧 ", "💻 ", "🔍 ", "📖 ", "✍️ ", "📝 ", "🌐 ", "🧠 ", "🐍 ", "📂 ", "🔎 ")


def looks_like_progress(text: str) -> bool:
    """Heuristic safety net for Hermes' text tool-progress bubbles (when tool_progress is not off).

    A progress bubble is one or more short lines that each start with a tool emoji, or a fenced
    terminal block that follows one; real answers rarely look like that.
    """
    if not text:
        return False
    lines = [ln for ln in text.strip().splitlines() if ln.strip()]
    if not lines or len(lines) > 40:
        return False
    in_fence = False
    for ln in lines:
        s = ln.strip()
        if s.startswith("```"):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        if not s.startswith(_PROGRESS_PREFIXES) or len(s) > 400:
            return False
    return True
