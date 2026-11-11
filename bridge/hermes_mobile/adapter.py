"""Hermes Mobile — a private gateway channel for the Hermes Mobile phone app.

Install as a user platform plugin (see bridge/README.md). One adapter runs per Hermes profile and
listens on its own port (``HERMES_MOBILE_PORT``, default 8765). Phones pair with
``hermes [-p <profile>] mobile pair``; each paired device holds a token that only reaches this
profile, so giving a friend one profile is just pairing them as a ``guest`` on that profile.

What the phone gets beyond plain text:
* approvals (dangerous commands), clarify questions and slash confirmations as tappable cards;
* every tool call as a structured, collapsible ``tool`` message (command + output), fed by the
  ``pre_tool_call`` / ``post_tool_call`` hooks, instead of emoji progress bubbles;
* push notifications (Expo) when an answer or an approval arrives while the app is closed.
"""

from __future__ import annotations

import asyncio
import contextlib
import datetime
import json
import logging
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Optional

from gateway.config import Platform
from gateway.platforms.base import (
    BasePlatformAdapter,
    SendResult,
    cache_audio_from_bytes,
    cache_document_from_bytes,
    cache_image_from_bytes,
)
from gateway.platforms.event import MessageEvent, MessageType
from gateway.platforms._shared import coerce_port, get_scoped_secret

from .core import PRIVATE_KEY, ChatStore, Device, DeviceRegistry, looks_like_progress
from .server import MobileServer

logger = logging.getLogger(__name__)

PLATFORM_NAME = "hermes_mobile"
DEFAULT_PORT = 8765
TOOL_OUTPUT_CHARS = 8000
TOOL_ARGS_CHARS = 4000
_TRUTHY = {"1", "true", "yes", "on"}

_ADAPTERS: list["HermesMobileAdapter"] = []
_ADAPTERS_LOCK = threading.Lock()


# ─────────────────────────────────────────────────────────────────────────── helpers


def data_dir() -> Path:
    """``<hermes home of the active profile>/mobile`` — devices.json and chat history live here."""
    from hermes_constants import get_hermes_home
    return Path(get_hermes_home()) / "mobile"


def profile_name() -> str:
    from hermes_constants import get_hermes_home
    home = Path(get_hermes_home())
    return home.name if home.parent.name == "profiles" else "default"


def _env(name: str, default: str = "") -> str:
    return str(get_scoped_secret(name, default) or default).strip()


def _clip(value: Any, limit: int) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        try:
            value = json.dumps(value, ensure_ascii=False, indent=1, default=str)
        except (TypeError, ValueError):
            value = str(value)
    return value if len(value) <= limit else value[:limit] + f"\n… ({len(value) - limit} more chars)"


def _tool_summary(tool_name: str, args: Any) -> str:
    """One-line label for a tool call: the shell command for ``terminal``, the key argument otherwise."""
    if isinstance(args, dict):
        for key in ("command", "cmd", "code", "query", "url", "path", "file_path", "pattern", "goal"):
            if isinstance(args.get(key), str) and args[key].strip():
                first = args[key].strip().splitlines()[0]
                return first[:200]
    return ""


# ─────────────────────────────────────────────────────────────────────────── adapter


class HermesMobileAdapter(BasePlatformAdapter):
    MAX_MESSAGE_LENGTH = 60_000
    supports_code_blocks = True

    def __init__(self, config, **kwargs):
        super().__init__(config=config, platform=Platform(PLATFORM_NAME))
        extra = getattr(config, "extra", {}) or {}
        self.host = str(extra.get("host") or _env("HERMES_MOBILE_HOST", "0.0.0.0"))
        self.port = coerce_port(extra.get("port") or _env("HERMES_MOBILE_PORT", str(DEFAULT_PORT)), DEFAULT_PORT)
        self.label = str(extra.get("label") or _env("HERMES_MOBILE_LABEL") or "")
        self.push_enabled = str(extra.get("push", _env("HERMES_MOBILE_PUSH", "true"))).lower() in _TRUTHY
        self._dir = data_dir()
        self._profile = profile_name()
        self.registry = DeviceRegistry(self._dir / "devices.json")
        self.store = ChatStore(self._dir)
        self.server = MobileServer(self.registry, self.store, self, host=self.host, port=self.port)
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._tool_started: dict[str, float] = {}

    # ── lifecycle
    async def connect(self, *, is_reconnect: bool = False) -> bool:
        try:
            await self.server.start()
        except OSError as exc:
            msg = f"Hermes Mobile could not listen on {self.host}:{self.port} ({exc}). Set HERMES_MOBILE_PORT to a free port."
            logger.error(msg)
            self._set_fatal_error("port_unavailable", msg, retryable=True)
            return False
        self._loop = asyncio.get_running_loop()
        with _ADAPTERS_LOCK:
            if self not in _ADAPTERS:
                _ADAPTERS.append(self)
        self._mark_connected()
        logger.info("[hermes_mobile] profile %s ready on port %s (%d paired device(s))",
                    self._profile, self.server.port, len(self.registry.list()))
        return True

    async def disconnect(self) -> None:
        with _ADAPTERS_LOCK:
            if self in _ADAPTERS:
                _ADAPTERS.remove(self)
        await self.server.stop()
        self._mark_disconnected()

    # ── BridgeHandlers (called by the server)
    def profile_info(self) -> dict[str, Any]:
        return {"name": self._profile, "label": self.label or self._profile}

    @staticmethod
    def _user_id(device: Device) -> str:
        # Owner phones share one identity, so an approval asked on one phone can be answered on another.
        return "owner" if device.is_owner else f"guest:{device.id}"

    async def on_send(self, device: Device, text: str, attachments: list[dict[str, Any]],
                      message: dict[str, Any]) -> None:
        if not self._message_handler:
            raise RuntimeError("gateway handler not attached yet")
        media_urls, media_types = [], []
        msg_type = MessageType.TEXT
        for att in attachments:
            mime, data = att["mime"], att["bytes"]
            if mime.startswith("image/"):
                ext = "." + (mime.split("/", 1)[1].split(";")[0].replace("jpeg", "jpg") or "jpg")
                path = cache_image_from_bytes(data, ext=ext)
                msg_type = MessageType.PHOTO
            elif mime.startswith("audio/"):
                path = cache_audio_from_bytes(data)
                msg_type = MessageType.VOICE if msg_type == MessageType.TEXT else msg_type
            else:
                path = cache_document_from_bytes(data, att["name"])
                msg_type = MessageType.DOCUMENT if msg_type == MessageType.TEXT else msg_type
            media_urls.append(path)
            media_types.append(mime)
        source = self.build_source(chat_id=device.chat_id, chat_name=device.name if not device.is_owner else "Me",
                                   chat_type="dm", user_id=self._user_id(device), user_name=device.name)
        event = MessageEvent(text=text, message_type=msg_type, source=source, message_id=message["id"],
                             timestamp=datetime.datetime.now(), media_urls=media_urls, media_types=media_types)
        await self.handle_message(event)

    async def on_action(self, device: Device, message: dict[str, Any], value: str) -> Optional[str]:
        card = message.get("card") or {}
        private = message.get(PRIVATE_KEY) or {}
        chat_id = message["chat_id"]
        ctype = card.get("type")
        if ctype == "approval":
            from tools.approval import resolve_gateway_approval_card
            count = resolve_gateway_approval_card(private.get("session_key", ""), value, private.get("request_id"),
                                                  actor_id=self._user_id(device), extra=self.config.extra)
            if count:
                self.resume_typing_for_chat(chat_id)
            return {"once": "Approved once", "session": "Approved for this session", "always": "Always approved",
                    "deny": "Denied"}.get(value, value) if count else None
        if ctype == "clarify":
            from tools.clarify_gateway import mark_awaiting_text, resolve_gateway_clarify
            clarify_id = private.get("clarify_id", "")
            if value == "other":
                return "" if mark_awaiting_text(clarify_id) else None
            choices = private.get("choices") or []
            try:
                answer = choices[int(value.split(":", 1)[1])]
            except (IndexError, ValueError):
                return None
            return answer if resolve_gateway_clarify(clarify_id, answer) else None
        if ctype == "confirm":
            from tools import slash_confirm
            result = await slash_confirm.resolve(private.get("session_key", ""), private.get("confirm_id", ""), value)
            if result:
                await self.send(chat_id, result)
            return {"once": "Approved once", "always": "Always approved", "cancel": "Cancelled"}.get(value, value)
        return None

    async def on_presence(self, device: Device, chat_id: str) -> None:
        return None

    # ── outbound text
    async def send(self, chat_id: str, content: str, reply_to: Optional[str] = None,
                   metadata: Optional[dict[str, Any]] = None) -> SendResult:
        content = content or ""
        kind = "tool" if looks_like_progress(content) else "text"
        interim = bool((metadata or {}).get("_interim_send"))
        msg = self.store.upsert(chat_id, role="assistant", kind=kind, text=content, reply_to=reply_to,
                                interim=interim, tool={"name": "progress", "status": "info"} if kind == "tool" else None)
        await self.server.publish_message(msg)
        if kind == "text" and not interim:
            self._schedule_push(chat_id, self.profile_info()["label"], content)
        return SendResult(success=True, message_id=msg["id"])

    async def edit_message(self, chat_id: str, message_id: str, content: str, *, finalize: bool = False,
                           **kwargs: Any) -> SendResult:
        existing = self.store.get(chat_id, message_id)
        if existing is None or existing.get("deleted"):
            return SendResult(success=False, error="message not found")
        kind = existing.get("kind", "text")
        is_progress_bubble = (existing.get("tool") or {}).get("name") == "progress"
        if kind == "text" or is_progress_bubble:  # a streamed answer or a progress bubble: re-classify
            kind = "tool" if looks_like_progress(content) else "text"
        msg = self.store.upsert(chat_id, message_id, text=content or "", kind=kind, edited=True,
                                tool={"name": "progress", "status": "info"} if kind == "tool" else existing.get("tool"))
        await self.server.publish_message(msg)
        return SendResult(success=True, message_id=message_id)

    async def delete_message(self, chat_id: str, message_id: str) -> bool:
        msg = self.store.delete(chat_id, message_id)
        if msg:
            await self.server.publish_message(msg)
        return bool(msg)

    async def send_typing(self, chat_id: str, metadata=None) -> None:
        await self.server.publish_typing(chat_id, True)

    async def stop_typing(self, chat_id: str) -> None:
        await self.server.publish_typing(chat_id, False)

    async def get_chat_info(self, chat_id: str) -> dict[str, Any]:
        devices = self.registry.devices_for_chat(chat_id)
        name = "Me" if chat_id == "owner" else (devices[0].name if devices else chat_id)
        return {"name": name, "type": "dm", "chat_id": chat_id}

    # ── outbound media
    async def _send_file(self, chat_id: str, path: str, kind: str, caption: Optional[str] = None,
                         file_name: Optional[str] = None, reply_to: Optional[str] = None) -> SendResult:
        import mimetypes
        p = Path(path)
        if not p.is_file():
            return SendResult(success=False, error=f"file not found: {path}")
        name = file_name or p.name
        mime = mimetypes.guess_type(name)[0] or {"image": "image/jpeg", "audio": "audio/ogg",
                                                 "video": "video/mp4"}.get(kind, "application/octet-stream")
        media = {"id": uuid.uuid4().hex, "kind": kind, "name": name, "mime": mime, "size": p.stat().st_size}
        msg = self.store.upsert(chat_id, role="assistant", kind="media", text=caption or "", media=media,
                                reply_to=reply_to, **{PRIVATE_KEY: {"path": str(p.resolve())}})
        await self.server.publish_message(msg)
        self._schedule_push(chat_id, self.profile_info()["label"], caption or f"📎 {name}")
        return SendResult(success=True, message_id=msg["id"])

    async def send_image(self, chat_id: str, image_url: str, caption: Optional[str] = None,
                         reply_to: Optional[str] = None, metadata: Optional[dict[str, Any]] = None) -> SendResult:
        msg = self.store.upsert(chat_id, role="assistant", kind="media", text=caption or "", reply_to=reply_to,
                                media={"id": uuid.uuid4().hex, "kind": "image", "url": image_url, "mime": "image/*"})
        await self.server.publish_message(msg)
        return SendResult(success=True, message_id=msg["id"])

    async def send_image_file(self, chat_id: str, image_path: str, caption: Optional[str] = None,
                              reply_to: Optional[str] = None, metadata=None, **kwargs) -> SendResult:
        return await self._send_file(chat_id, image_path, "image", caption, reply_to=reply_to)

    async def send_document(self, chat_id: str, file_path: str, caption: Optional[str] = None,
                            file_name: Optional[str] = None, reply_to: Optional[str] = None,
                            metadata=None, **kwargs) -> SendResult:
        return await self._send_file(chat_id, file_path, "file", caption, file_name=file_name, reply_to=reply_to)

    async def send_voice(self, chat_id: str, audio_path: str, caption: Optional[str] = None,
                         reply_to: Optional[str] = None, metadata=None, **kwargs) -> SendResult:
        return await self._send_file(chat_id, audio_path, "audio", caption, reply_to=reply_to)

    async def send_video(self, chat_id: str, video_path: str, caption: Optional[str] = None,
                         reply_to: Optional[str] = None, metadata=None, **kwargs) -> SendResult:
        return await self._send_file(chat_id, video_path, "video", caption, reply_to=reply_to)

    # ── interactive cards
    async def _send_card(self, chat_id: str, card: dict[str, Any], text: str, private: dict[str, Any],
                         push_title: str) -> SendResult:
        card = {"state": "pending", **card}
        msg = self.store.upsert(chat_id, role="assistant", kind="card", text=text, card=card,
                                **{PRIVATE_KEY: private})
        await self.server.publish_message(msg)
        self._schedule_push(chat_id, push_title, text, force=True)
        return SendResult(success=True, message_id=msg["id"])

    async def _send_exec_approval_prompt(self, prompt) -> SendResult:
        actions = [{"label": label, "value": choice, "style": style or ""} for label, choice, style in prompt.actions]
        card = {"type": "approval", "title": "Approval needed", "command": prompt.command,
                "description": prompt.description, "smart_denied": bool(prompt.smart_denied), "actions": actions}
        return await self._send_card(prompt.chat_id, card, prompt.text,
                                     {"session_key": prompt.session_key, "request_id": prompt.request_id},
                                     f"⚠️ {self.profile_info()['label']}: approval needed")

    async def send_clarify(self, chat_id: str, question: str, choices: Optional[list], clarify_id: str,
                           session_key: str, metadata: Optional[dict[str, Any]] = None) -> SendResult:
        multi = False
        with contextlib.suppress(Exception):
            from tools.clarify_gateway import get_pending
            multi = bool(getattr(get_pending(clarify_id), "multi_select", False))
        if not choices or multi:
            # Open question (or multi-select): the next typed message answers it.
            return await super().send_clarify(chat_id, question, choices, clarify_id, session_key, metadata)
        choices = [str(c) for c in choices]
        actions = [{"label": c, "value": f"c:{i}", "style": ""} for i, c in enumerate(choices)]
        actions.append({"label": "Other…", "value": "other", "style": "secondary"})
        card = {"type": "clarify", "title": "Question", "actions": actions}
        return await self._send_card(chat_id, card, question,
                                     {"clarify_id": clarify_id, "session_key": session_key, "choices": choices},
                                     f"❓ {self.profile_info()['label']}")

    async def retire_clarify_card(self, clarify_id: str, notice: str) -> None:
        for chat_id in {d.chat_id for d in self.registry.list()}:
            for m in self.store.find(chat_id, lambda m: (m.get(PRIVATE_KEY) or {}).get("clarify_id") == clarify_id):
                card = m.get("card") or {}
                if card.get("state") == "pending":
                    msg = self.store.upsert(chat_id, m["id"], card=dict(card, state="resolved",
                                                                        resolution={"label": notice, "value": None}))
                    await self.server.publish_message(msg)

    async def send_slash_confirm(self, chat_id: str, title: str, message: str, session_key: str, confirm_id: str,
                                 metadata: Optional[dict[str, Any]] = None) -> SendResult:
        actions = [{"label": "Approve once", "value": "once", "style": "primary"},
                   {"label": "Always", "value": "always", "style": ""},
                   {"label": "Cancel", "value": "cancel", "style": "danger"}]
        card = {"type": "confirm", "title": title, "actions": actions}
        return await self._send_card(chat_id, card, message, {"session_key": session_key, "confirm_id": confirm_id},
                                     f"⚠️ {title}")

    # ── tool activity (called from plugin hooks, possibly off-loop)
    def _publish_threadsafe(self, msg: dict[str, Any]) -> None:
        loop = self._loop
        if loop is None or loop.is_closed():
            return
        asyncio.run_coroutine_threadsafe(self.server.publish_message(msg), loop)

    def record_tool_start(self, chat_id: str, call_id: str, tool_name: str, args: Any) -> None:
        self._tool_started[call_id] = time.time()
        msg = self.store.upsert(chat_id, f"tool-{call_id}", role="assistant", kind="tool",
                                text=_tool_summary(tool_name, args),
                                tool={"name": tool_name, "status": "running", "args": _clip(args, TOOL_ARGS_CHARS)})
        self._publish_threadsafe(msg)

    def record_tool_end(self, chat_id: str, call_id: str, tool_name: str, args: Any, result: Any,
                        status: str, error: Optional[str], duration_ms: Optional[int]) -> None:
        started = self._tool_started.pop(call_id, None)
        if duration_ms in (None, 0) and started:
            duration_ms = int((time.time() - started) * 1000)
        existing = self.store.get(chat_id, f"tool-{call_id}") or {}
        msg = self.store.upsert(chat_id, f"tool-{call_id}", role="assistant", kind="tool",
                                text=existing.get("text") or _tool_summary(tool_name, args),
                                tool={"name": tool_name, "status": "error" if status in ("error", "blocked") else "ok",
                                      "args": _clip(args, TOOL_ARGS_CHARS),
                                      "output": _clip(error or result, TOOL_OUTPUT_CHARS),
                                      "duration_ms": duration_ms})
        self._publish_threadsafe(msg)

    # ── push notifications (Expo)
    def _schedule_push(self, chat_id: str, title: str, body: str, force: bool = False) -> None:
        if not self.push_enabled or self.server.has_active_viewer(chat_id):
            return
        tokens = [d.push_token for d in self.registry.devices_for_chat(chat_id) if d.push_token]
        if not tokens:
            return
        body = " ".join((body or "").split())[:180]
        payload = [{"to": t, "title": title[:80], "body": body or "…", "sound": "default",
                    "priority": "high", "data": {"chat_id": chat_id, "profile": self._profile}} for t in tokens]
        with contextlib.suppress(RuntimeError):
            asyncio.get_running_loop().create_task(self._send_push(payload))

    @staticmethod
    async def _send_push(payload: list[dict[str, Any]]) -> None:
        try:
            import httpx
            async with httpx.AsyncClient(timeout=10) as client:
                await client.post("https://exp.host/--/api/v2/push/send", json=payload,
                                  headers={"Accept": "application/json"})
        except Exception as exc:  # push is best-effort
            logger.debug("[hermes_mobile] push failed: %s", exc)


# ─────────────────────────────────────────────────────────────────────────── tool hooks


def _adapter_for_hook() -> tuple[Optional[HermesMobileAdapter], Optional[str]]:
    """The live adapter + chat id for the tool call being observed, or (None, None) for other platforms."""
    try:
        from gateway.session_context import get_session_env
    except Exception:
        return None, None
    if get_session_env("HERMES_SESSION_PLATFORM", "") != PLATFORM_NAME:
        return None, None
    chat_id = get_session_env("HERMES_SESSION_CHAT_ID", "")
    if not chat_id:
        return None, None
    with _ADAPTERS_LOCK:
        adapters = list(_ADAPTERS)
    if len(adapters) == 1:
        return adapters[0], chat_id
    try:  # several profiles in one (multiplexed) gateway: match the profile's home
        here = data_dir()
        for a in adapters:
            if a._dir == here:
                return a, chat_id
    except Exception:
        pass
    return None, None


def _on_pre_tool_call(**kwargs: Any) -> None:
    adapter, chat_id = _adapter_for_hook()
    if adapter is None:
        return
    call_id = str(kwargs.get("tool_call_id") or uuid.uuid4().hex)
    with contextlib.suppress(Exception):
        adapter.record_tool_start(chat_id, call_id, str(kwargs.get("tool_name") or "tool"), kwargs.get("args"))


def _on_post_tool_call(**kwargs: Any) -> None:
    adapter, chat_id = _adapter_for_hook()
    if adapter is None:
        return
    call_id = str(kwargs.get("tool_call_id") or "")
    if not call_id:
        return
    with contextlib.suppress(Exception):
        adapter.record_tool_end(chat_id, call_id, str(kwargs.get("tool_name") or "tool"), kwargs.get("args"),
                                kwargs.get("result"), str(kwargs.get("status") or "ok"),
                                kwargs.get("error_message"), kwargs.get("duration_ms"))


# ─────────────────────────────────────────────────────────────────────────── registration


def _enabled() -> bool:
    return _env("HERMES_MOBILE_ENABLED").lower() in _TRUTHY


def check_requirements() -> bool:
    try:
        import websockets  # noqa: F401  (Hermes core dependency)
        return True
    except ImportError:
        return False


def validate_config(config) -> bool:
    return _enabled() or bool((getattr(config, "extra", {}) or {}).get("port"))


def is_connected(config) -> bool:
    return validate_config(config)


def _env_enablement() -> Optional[dict]:
    if not _enabled():
        return None
    seed: dict[str, Any] = {}
    if port := _env("HERMES_MOBILE_PORT"):
        seed["port"] = coerce_port(port, DEFAULT_PORT)
    if host := _env("HERMES_MOBILE_HOST"):
        seed["host"] = host
    if label := _env("HERMES_MOBILE_LABEL"):
        seed["label"] = label
    return seed


def register(ctx) -> None:
    ctx.register_platform(
        name=PLATFORM_NAME,
        label="Hermes Mobile",
        adapter_factory=HermesMobileAdapter,
        check_fn=check_requirements,
        validate_config=validate_config,
        is_connected=is_connected,
        required_env=["HERMES_MOBILE_ENABLED"],
        install_hint="No extra packages needed",
        env_enablement_fn=_env_enablement,
        # The WebSocket token IS the access control (one token per paired phone), so the gateway's
        # user allowlist is opened for this channel only. Unpaired clients never get past the socket.
        allow_all_env="HERMES_MOBILE_ALLOW_ALL_USERS",
        allowed_users_env="HERMES_MOBILE_ALLOWED_USERS",
        max_message_length=HermesMobileAdapter.MAX_MESSAGE_LENGTH,
        emoji="📱",
        pii_safe=True,
        platform_hint=(
            "You are chatting through the Hermes Mobile phone app. Markdown, fenced code blocks and tables "
            "render well. Tool calls are shown to the user automatically as collapsible cards, so you do "
            "not need to echo commands or their raw output; give a clear, well-structured answer instead."),
    )
    ctx.register_hook("pre_tool_call", _on_pre_tool_call)
    ctx.register_hook("post_tool_call", _on_post_tool_call)
    with contextlib.suppress(Exception):
        from .cli import register_cli
        register_cli(ctx)
