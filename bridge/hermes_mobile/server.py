"""WebSocket + tiny HTTP server the phone app talks to (protocol: docs/protocol.md).

Depends only on ``websockets`` (already a Hermes core dependency) and ``core``; the Hermes glue
lives in ``adapter.py`` and plugs in through :class:`BridgeHandlers`.
"""

from __future__ import annotations

import asyncio
import base64
import binascii
import contextlib
import json
import logging
import mimetypes
import os
import time
from http import HTTPStatus
from pathlib import Path
from typing import Any, Awaitable, Callable, Optional, Protocol

from websockets.asyncio.server import Server, ServerConnection, serve
from websockets.datastructures import Headers
from websockets.exceptions import ConnectionClosed
from websockets.http11 import Request, Response

from .core import PRIVATE_KEY, ChatStore, Device, DeviceRegistry, public_message

logger = logging.getLogger("hermes_mobile.server")

PROTOCOL_VERSION = 1
AUTH_TIMEOUT_S = 15
MAX_FRAME_BYTES = 40 * 1024 * 1024
MAX_TEXT_CHARS = 20_000
MAX_ATTACHMENTS = 6
MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024
MAX_SERVED_FILE_BYTES = 100 * 1024 * 1024


class BridgeHandlers(Protocol):
    """Implemented by the Hermes adapter."""

    def profile_info(self) -> dict[str, Any]: ...

    async def on_send(self, device: Device, text: str, attachments: list[dict[str, Any]],
                      message: dict[str, Any]) -> None: ...

    async def on_action(self, device: Device, message: dict[str, Any], value: str) -> Optional[str]:
        """Answer a card. Return the resolution label, or None when the card had already expired."""
        ...

    async def on_presence(self, device: Device, chat_id: str) -> None: ...


class AttachmentError(ValueError):
    pass


def decode_attachments(raw: Any) -> list[dict[str, Any]]:
    """Validate ``[{name, mime, data(base64)}]`` from the phone -> ``[{name, mime, bytes}]``."""
    if raw in (None, []):
        return []
    if not isinstance(raw, list) or len(raw) > MAX_ATTACHMENTS:
        raise AttachmentError("too_many_attachments")
    out = []
    for item in raw:
        if not isinstance(item, dict) or not isinstance(item.get("data"), str):
            raise AttachmentError("bad_attachment")
        if len(item["data"]) > MAX_ATTACHMENT_BYTES * 4 // 3 + 16:
            raise AttachmentError("attachment_too_large")
        try:
            data = base64.b64decode(item["data"], validate=True)
        except (binascii.Error, ValueError):
            raise AttachmentError("bad_attachment") from None
        name = os.path.basename(str(item.get("name") or "file"))[:120] or "file"
        mime = str(item.get("mime") or mimetypes.guess_type(name)[0] or "application/octet-stream")[:100]
        out.append({"name": name, "mime": mime, "bytes": data})
    return out


def _json_response(status: HTTPStatus, body: dict[str, Any]) -> Response:
    data = json.dumps(body).encode()
    headers = Headers([("Content-Type", "application/json"), ("Content-Length", str(len(data))),
                       ("Cache-Control", "no-store")])
    return Response(status.value, status.phrase, headers, data)


class MobileServer:
    def __init__(self, registry: DeviceRegistry, store: ChatStore, handlers: BridgeHandlers,
                 host: str = "0.0.0.0", port: int = 8765):
        self.registry = registry
        self.store = store
        self.handlers = handlers
        self.host, self.port = host, port
        self._server: Optional[Server] = None
        self._conns: dict[str, set[ServerConnection]] = {}
        self._conn_device: dict[ServerConnection, Device] = {}
        self._active: dict[ServerConnection, bool] = {}
        self._flush_task: Optional[asyncio.Task] = None

    # ── lifecycle
    async def start(self) -> None:
        self._server = await serve(
            self._handle, self.host, self.port, process_request=self._process_request,
            max_size=MAX_FRAME_BYTES, ping_interval=20, ping_timeout=20, server_header="hermes-mobile")
        sockets = getattr(self._server, "sockets", None) or []
        if sockets:
            self.port = sockets[0].getsockname()[1]
        self._flush_task = asyncio.create_task(self._flush_loop())
        logger.info("hermes-mobile listening on %s:%s", self.host, self.port)

    async def stop(self) -> None:
        if self._flush_task:
            self._flush_task.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await self._flush_task
        if self._server is not None:
            self._server.close()
            with contextlib.suppress(Exception):
                await asyncio.wait_for(self._server.wait_closed(), 5)
        self.store.flush()

    async def _flush_loop(self) -> None:
        while True:
            await asyncio.sleep(1.0)
            if self.store.has_unsaved:
                await asyncio.to_thread(self.store.flush)

    # ── presence
    def connected_devices(self, chat_id: str) -> list[Device]:
        return [self._conn_device[c] for c in self._conns.get(chat_id, ()) if c in self._conn_device]

    def has_active_viewer(self, chat_id: str) -> bool:
        """True when some phone of this chat is connected AND in the foreground."""
        return any(self._active.get(c, False) for c in self._conns.get(chat_id, ()))

    # ── outbound
    async def publish(self, chat_id: str, payload: dict[str, Any]) -> None:
        conns = list(self._conns.get(chat_id, ()))
        if not conns:
            return
        data = json.dumps(payload, ensure_ascii=False)
        await asyncio.gather(*(self._safe_send(c, data) for c in conns))

    async def publish_message(self, msg: dict[str, Any]) -> None:
        await self.publish(msg["chat_id"], {"type": "upsert", "message": public_message(msg)})

    async def publish_typing(self, chat_id: str, on: bool) -> None:
        await self.publish(chat_id, {"type": "typing", "on": bool(on)})

    @staticmethod
    async def _safe_send(conn: ServerConnection, data: str) -> None:
        with contextlib.suppress(ConnectionClosed, Exception):
            await conn.send(data)

    # ── HTTP side (health + authenticated media download)
    def _bearer_device(self, request: Request) -> Optional[Device]:
        auth = request.headers.get("Authorization", "")
        if auth.lower().startswith("bearer "):
            return self.registry.authenticate(auth[7:].strip())
        return None

    async def _process_request(self, connection: ServerConnection, request: Request) -> Optional[Response]:
        path = request.path.split("?", 1)[0]
        if path in ("/ws", "/ws/"):
            return None  # continue with the WebSocket handshake
        if path == "/health":
            return _json_response(HTTPStatus.OK, {"ok": True, "app": "hermes-mobile", "protocol": PROTOCOL_VERSION})
        if path.startswith("/media/"):
            return await asyncio.to_thread(self._serve_media, request, path[len("/media/"):])
        return _json_response(HTTPStatus.NOT_FOUND, {"ok": False, "error": "not_found"})

    def _serve_media(self, request: Request, media_id: str) -> Response:
        device = self._bearer_device(request)
        if device is None:
            return _json_response(HTTPStatus.UNAUTHORIZED, {"ok": False, "error": "unauthorized"})
        hits = self.store.find(device.chat_id, lambda m: (m.get("media") or {}).get("id") == media_id)
        if not hits:
            return _json_response(HTTPStatus.NOT_FOUND, {"ok": False, "error": "not_found"})
        msg = hits[0]
        file_path = (msg.get(PRIVATE_KEY) or {}).get("path")
        try:
            p = Path(file_path or "")
            size = p.stat().st_size
            if not p.is_file() or size > MAX_SERVED_FILE_BYTES:
                raise OSError
            data = p.read_bytes()
        except OSError:
            return _json_response(HTTPStatus.GONE, {"ok": False, "error": "file_gone"})
        media = msg.get("media") or {}
        headers = Headers([("Content-Type", media.get("mime") or "application/octet-stream"),
                           ("Content-Length", str(len(data))), ("Cache-Control", "private, max-age=86400")])
        return Response(200, "OK", headers, data)

    # ── WebSocket side
    async def _handle(self, conn: ServerConnection) -> None:
        device = await self._authenticate(conn)
        if device is None:
            return
        chat_id = device.chat_id
        self._conns.setdefault(chat_id, set()).add(conn)
        self._conn_device[conn] = device
        self._active[conn] = True
        try:
            async for raw in conn:
                await self._dispatch(conn, device, raw)
        except ConnectionClosed:
            pass
        finally:
            self._conns.get(chat_id, set()).discard(conn)
            self._conn_device.pop(conn, None)
            self._active.pop(conn, None)
            with contextlib.suppress(Exception):
                self.registry.update(device.id, last_seen=time.time())

    async def _authenticate(self, conn: ServerConnection) -> Optional[Device]:
        try:
            raw = await asyncio.wait_for(conn.recv(), AUTH_TIMEOUT_S)
            hello = json.loads(raw)
        except (asyncio.TimeoutError, ConnectionClosed, ValueError, TypeError):
            await conn.close(4001, "auth required")
            return None
        if not isinstance(hello, dict) or hello.get("type") != "auth":
            await conn.close(4001, "auth required")
            return None
        device = self.registry.authenticate(hello.get("token"))
        if device is None:
            await self._safe_send(conn, json.dumps({"type": "error", "code": "unauthorized"}))
            await conn.close(4003, "unauthorized")
            return None
        try:
            since = int(hello.get("since") or 0)
        except (TypeError, ValueError):
            since = 0
        messages, rev, truncated = self.store.since(device.chat_id, since if since <= self.store.rev(device.chat_id) else 0)
        await conn.send(json.dumps({
            "type": "welcome", "protocol": PROTOCOL_VERSION, "device": device.public(),
            "profile": self.handlers.profile_info(), "chat_id": device.chat_id,
        }, ensure_ascii=False))
        await conn.send(json.dumps({"type": "sync", "messages": messages, "rev": rev, "truncated": truncated,
                                    "reset": since > rev}, ensure_ascii=False))
        return device

    async def _reply_error(self, conn: ServerConnection, code: str, ref: Any = None) -> None:
        await self._safe_send(conn, json.dumps({"type": "error", "code": code, "ref": ref}))

    async def _dispatch(self, conn: ServerConnection, device: Device, raw: Any) -> None:
        try:
            msg = json.loads(raw)
            if not isinstance(msg, dict):
                raise ValueError
        except (ValueError, TypeError):
            return await self._reply_error(conn, "bad_json")
        kind = msg.get("type")
        # Re-check the token's device on every frame: a revoked phone is cut off immediately.
        if self.registry.get(device.id) is None:
            await self._reply_error(conn, "revoked")
            await conn.close(4003, "revoked")
            return
        if kind == "ping":
            return await self._safe_send(conn, json.dumps({"type": "pong", "t": msg.get("t")}))
        if kind == "send":
            return await self._on_send(conn, device, msg)
        if kind == "action":
            return await self._on_action(conn, device, msg)
        if kind == "history":
            try:
                before = float(msg.get("before_ts"))
            except (TypeError, ValueError):
                return await self._reply_error(conn, "bad_request", msg.get("ref"))
            older = self.store.before(device.chat_id, before, limit=100)
            return await self._safe_send(conn, json.dumps({"type": "history", "messages": older,
                                                           "ref": msg.get("ref")}, ensure_ascii=False))
        if kind == "presence":
            self._active[conn] = bool(msg.get("active", True))
            if self._active[conn]:
                await self.handlers.on_presence(device, device.chat_id)
            return
        if kind in ("invite", "devices", "revoke"):
            return await self._on_admin(conn, device, kind, msg)
        if kind == "push_token":
            token = msg.get("token")
            if token is None or (isinstance(token, str) and len(token) < 300):
                self.registry.update(device.id, push_token=token or None)
            return
        await self._reply_error(conn, "unknown_type", msg.get("ref"))

    async def _on_admin(self, conn: ServerConnection, device: Device, kind: str, msg: dict[str, Any]) -> None:
        """Owner-only device management from the phone: invite a guest, list devices, revoke one."""
        ref = msg.get("ref")
        if not device.is_owner:
            return await self._reply_error(conn, "forbidden", ref)
        if kind == "invite":
            role = "owner" if msg.get("role") == "owner" else "guest"
            new_dev, token = self.registry.pair(str(msg.get("name") or ""), role=role)
            payload = {"type": "invite", "ref": ref, "token": token, "role": role, "device": new_dev.public(),
                       "profile": self.handlers.profile_info()}
            return await self._safe_send(conn, json.dumps(payload, ensure_ascii=False))
        if kind == "revoke":
            target = str(msg.get("device_id") or "")
            if target == device.id:
                return await self._reply_error(conn, "cannot_revoke_self", ref)
            ok = self.registry.revoke(target)
            for c, d in list(self._conn_device.items()):
                if d.id == target:
                    with contextlib.suppress(Exception):
                        await c.close(4003, "revoked")
            if not ok:
                return await self._reply_error(conn, "not_found", ref)
        devices = [{**d.public(), "created_at": d.created_at, "last_seen": d.last_seen,
                    "online": any(x.id == d.id for x in self._conn_device.values()), "me": d.id == device.id}
                   for d in self.registry.list()]
        await self._safe_send(conn, json.dumps({"type": "devices", "ref": ref, "devices": devices}, ensure_ascii=False))

    async def _on_send(self, conn: ServerConnection, device: Device, msg: dict[str, Any]) -> None:
        text = msg.get("text") if isinstance(msg.get("text"), str) else ""
        client_id = str(msg.get("client_id") or "")[:64] or None
        if len(text) > MAX_TEXT_CHARS:
            return await self._reply_error(conn, "text_too_long", client_id)
        try:
            attachments = decode_attachments(msg.get("attachments"))
        except AttachmentError as exc:
            return await self._reply_error(conn, str(exc), client_id)
        if not text.strip() and not attachments:
            return await self._reply_error(conn, "empty", client_id)
        if client_id:  # idempotent resend after a flaky reconnect
            dup = self.store.find(device.chat_id, lambda m: m.get("client_id") == client_id and m.get("role") == "user")
            if dup:
                return await self._safe_send(conn, json.dumps({"type": "upsert", "message": public_message(dup[0])},
                                                              ensure_ascii=False))
        stored = self.store.upsert(
            device.chat_id, role="user", kind="text", text=text, client_id=client_id,
            author={"id": device.id, "name": device.name},
            attachments=[{"name": a["name"], "mime": a["mime"], "size": len(a["bytes"])} for a in attachments])
        await self.publish_message(stored)
        try:
            await self.handlers.on_send(device, text, attachments, stored)
        except Exception:
            logger.exception("hermes-mobile: on_send failed")
            await self._reply_error(conn, "deliver_failed", client_id)

    async def _on_action(self, conn: ServerConnection, device: Device, msg: dict[str, Any]) -> None:
        message_id, value = str(msg.get("message_id") or ""), str(msg.get("value") or "")
        card_msg = self.store.get(device.chat_id, message_id)
        card = (card_msg or {}).get("card") or {}
        if not card_msg or card.get("state") != "pending":
            return await self._reply_error(conn, "card_closed", message_id)
        if value not in {a.get("value") for a in card.get("actions", [])}:
            return await self._reply_error(conn, "bad_choice", message_id)
        try:
            label = await self.handlers.on_action(device, card_msg, value)
        except Exception:
            logger.exception("hermes-mobile: on_action failed")
            label = None
        if label is None:
            new_card = dict(card, state="expired", resolution=None)
        elif label == "":  # handled, but the card stays open (e.g. "Other…" waits for typed text)
            new_card = dict(card, awaiting_text=True)
        else:
            new_card = dict(card, state="resolved", resolution={"value": value, "label": label, "by": device.name})
        updated = self.store.upsert(device.chat_id, message_id, card=new_card)
        await self.publish_message(updated)
