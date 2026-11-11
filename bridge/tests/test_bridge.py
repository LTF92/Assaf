"""Tests for the Hermes-independent parts of the bridge (device registry, chat store, server protocol).

Run:  python -m pytest bridge/tests   (needs: websockets, pytest, pytest-asyncio)
"""

import asyncio
import base64
import json
import sys
from pathlib import Path

import pytest
import websockets

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from hermes_mobile.core import ChatStore, DeviceRegistry, looks_like_progress  # noqa: E402
from hermes_mobile.pair import pairing_link  # noqa: E402
from hermes_mobile.server import MobileServer  # noqa: E402


# ── core


def test_pair_authenticate_revoke(tmp_path):
    reg = DeviceRegistry(tmp_path / "devices.json")
    owner, owner_token = reg.pair("Lateef iPhone")
    guest, guest_token = reg.pair("Ahmed", role="guest")
    assert owner.chat_id == "owner" and guest.chat_id == f"guest-{guest.id}"
    assert reg.authenticate(owner_token).id == owner.id
    assert reg.authenticate(guest_token).id == guest.id
    assert reg.authenticate("nope") is None
    assert owner_token not in (tmp_path / "devices.json").read_text()  # only hashes on disk
    # another process (the pair CLI) writes the file -> picked up without restart
    other = DeviceRegistry(tmp_path / "devices.json")
    third, third_token = other.pair("Tablet")
    assert reg.authenticate(third_token).id == third.id
    assert reg.revoke(guest.id)
    assert reg.authenticate(guest_token) is None


def test_store_upsert_since_and_persistence(tmp_path):
    store = ChatStore(tmp_path)
    a = store.upsert("owner", role="user", text="hi")
    b = store.upsert("owner", text="hel")
    rev_after_b = store.rev("owner")
    store.upsert("owner", b["id"], text="hello")  # streamed edit
    msgs, rev, truncated = store.since("owner", rev_after_b)
    assert [m["text"] for m in msgs] == ["hello"] and rev == rev_after_b + 1 and not truncated
    store.upsert("owner", text="secret card", card={"state": "pending"}, _private={"request_id": "r1"})
    msgs, _, _ = store.since("owner", 0)
    assert all("_private" not in m for m in msgs)
    store.flush()
    reloaded = ChatStore(tmp_path)
    assert reloaded.rev("owner") == store.rev("owner")
    assert reloaded.get("owner", a["id"])["text"] == "hi"


def test_store_trim_keeps_pending_cards(tmp_path):
    store = ChatStore(tmp_path, max_messages=3)
    card = store.upsert("c", text="approve?", card={"state": "pending"})
    for i in range(5):
        store.upsert("c", text=str(i))
    assert store.get("c", card["id"]) is not None
    assert len(store.since("c", 0)[0]) == 3


def test_progress_heuristic():
    assert looks_like_progress('💻 terminal: "ls -la"')
    assert looks_like_progress("🔍 Searching the web for hermes\n💻 terminal\n```\nls\n```")
    assert not looks_like_progress("Here is the answer.\n💻 terminal")
    assert not looks_like_progress("")


def test_pairing_link_roundtrip():
    link = pairing_link("ws://100.64.0.1:8765", "tok", "coder", "Coder", "guest")
    data = link.split("d=", 1)[1]
    payload = json.loads(base64.urlsafe_b64decode(data + "=" * (-len(data) % 4)))
    assert payload == {"v": 1, "url": "ws://100.64.0.1:8765", "token": "tok", "profile": "coder",
                       "label": "Coder", "role": "guest"}


# ── server protocol


class FakeHermes:
    def __init__(self):
        self.sent = []
        self.actions = []
        self.server = None

    def profile_info(self):
        return {"name": "coder", "label": "Coder"}

    async def on_send(self, device, text, attachments, message):
        self.sent.append((device.id, text, [(a["name"], a["mime"], a["bytes"]) for a in attachments]))
        reply = self.server.store.upsert(device.chat_id, text=f"echo: {text}")
        await self.server.publish_message(reply)

    async def on_action(self, device, message, value):
        self.actions.append((message["_private"]["request_id"], value))
        return "Approved once" if value == "once" else None

    async def on_presence(self, device, chat_id):
        pass


@pytest.fixture
async def bridge(tmp_path):
    reg = DeviceRegistry(tmp_path / "devices.json")
    store = ChatStore(tmp_path)
    fake = FakeHermes()
    server = MobileServer(reg, store, fake, host="127.0.0.1", port=0)
    fake.server = server
    await server.start()
    yield reg, store, fake, server
    await server.stop()


async def _recv_until(ws, kind, timeout=3):
    while True:
        msg = json.loads(await asyncio.wait_for(ws.recv(), timeout))
        if msg["type"] == kind:
            return msg


async def _connect(server, token, since=0):
    ws = await websockets.connect(f"ws://127.0.0.1:{server.port}/ws")
    await ws.send(json.dumps({"type": "auth", "token": token, "since": since}))
    return ws


async def test_auth_rejects_bad_token(bridge):
    reg, store, fake, server = bridge
    ws = await _connect(server, "bad")
    err = json.loads(await ws.recv())
    assert err == {"type": "error", "code": "unauthorized"}
    with pytest.raises(websockets.ConnectionClosed):
        await asyncio.wait_for(ws.recv(), 2)


async def test_send_echo_sync_and_isolation(bridge):
    reg, store, fake, server = bridge
    _, owner_token = reg.pair("phone")
    guest, guest_token = reg.pair("Ahmed", role="guest")
    ws = await _connect(server, owner_token)
    welcome = await _recv_until(ws, "welcome")
    assert welcome["profile"]["label"] == "Coder" and welcome["chat_id"] == "owner"
    await _recv_until(ws, "sync")

    img = base64.b64encode(b"\x89PNG fake").decode()
    await ws.send(json.dumps({"type": "send", "client_id": "c1", "text": "hello",
                              "attachments": [{"name": "a.png", "mime": "image/png", "data": img}]}))
    user_msg = (await _recv_until(ws, "upsert"))["message"]
    assert user_msg["role"] == "user" and user_msg["client_id"] == "c1"
    reply = (await _recv_until(ws, "upsert"))["message"]
    assert reply["text"] == "echo: hello"
    assert fake.sent[0][2] == [("a.png", "image/png", b"\x89PNG fake")]

    # resend with the same client_id (flaky network) is not delivered twice
    await ws.send(json.dumps({"type": "send", "client_id": "c1", "text": "hello"}))
    await _recv_until(ws, "upsert")
    assert len(fake.sent) == 1

    # a reconnecting phone gets what it missed
    rev = store.rev("owner")
    late = store.upsert("owner", text="while you were away")
    ws2 = await _connect(server, owner_token, since=rev)
    await _recv_until(ws2, "welcome")
    sync = await _recv_until(ws2, "sync")
    assert [m["id"] for m in sync["messages"]] == [late["id"]]

    # the guest sees only their own chat
    wg = await _connect(server, guest_token)
    assert (await _recv_until(wg, "welcome"))["chat_id"] == guest.chat_id
    assert (await _recv_until(wg, "sync"))["messages"] == []
    for w in (ws, ws2, wg):
        await w.close()


async def test_card_action_flow_and_revocation(bridge):
    reg, store, fake, server = bridge
    dev, token = reg.pair("phone")
    card = store.upsert("owner", kind="card", text="rm -rf build?", _private={"request_id": "r9", "session_key": "s"},
                        card={"type": "approval", "state": "pending",
                              "actions": [{"label": "Approve", "value": "once"}, {"label": "Deny", "value": "deny"}]})
    ws = await _connect(server, token)
    sync = await _recv_until(ws, "sync")
    assert sync["messages"][0]["card"]["state"] == "pending"
    assert "_private" not in sync["messages"][0]

    await ws.send(json.dumps({"type": "action", "message_id": card["id"], "value": "hack"}))
    assert (await _recv_until(ws, "error"))["code"] == "bad_choice"

    await ws.send(json.dumps({"type": "action", "message_id": card["id"], "value": "once"}))
    updated = (await _recv_until(ws, "upsert"))["message"]
    assert updated["card"]["state"] == "resolved" and updated["card"]["resolution"]["label"] == "Approved once"
    assert fake.actions == [("r9", "once")]

    await ws.send(json.dumps({"type": "action", "message_id": card["id"], "value": "once"}))
    assert (await _recv_until(ws, "error"))["code"] == "card_closed"

    reg.revoke(dev.id)
    await ws.send(json.dumps({"type": "ping"}))
    assert (await _recv_until(ws, "error"))["code"] == "revoked"


async def test_media_download_requires_token_and_chat(bridge, tmp_path):
    reg, store, fake, server = bridge
    _, owner_token = reg.pair("phone")
    _, guest_token = reg.pair("g", role="guest")
    f = tmp_path / "report.pdf"
    f.write_bytes(b"%PDF-1.4 hello")
    store.upsert("owner", kind="media", media={"id": "m1", "kind": "file", "mime": "application/pdf"},
                 _private={"path": str(f)})

    import urllib.request

    def get(token):
        req = urllib.request.Request(f"http://127.0.0.1:{server.port}/media/m1")
        if token:
            req.add_header("Authorization", f"Bearer {token}")
        try:
            with urllib.request.urlopen(req, timeout=3) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            return e.code, b""

    assert await asyncio.to_thread(get, None) == (401, b"")
    assert (await asyncio.to_thread(get, guest_token))[0] == 404
    assert await asyncio.to_thread(get, owner_token) == (200, b"%PDF-1.4 hello")


async def test_owner_can_invite_list_and_revoke_guests(bridge):
    reg, store, fake, server = bridge
    _, owner_token = reg.pair("phone")
    _, guest_token = reg.pair("g", role="guest")
    ws = await _connect(server, owner_token)
    await _recv_until(ws, "sync")
    await ws.send(json.dumps({"type": "invite", "name": "Ahmed", "ref": 1}))
    inv = await _recv_until(ws, "invite")
    assert inv["role"] == "guest" and reg.authenticate(inv["token"]).name == "Ahmed"
    await ws.send(json.dumps({"type": "devices"}))
    names = {d["name"] for d in (await _recv_until(ws, "devices"))["devices"]}
    assert names == {"phone", "g", "Ahmed"}
    wg = await _connect(server, guest_token)
    await _recv_until(wg, "sync")
    await wg.send(json.dumps({"type": "invite", "name": "x"}))
    assert (await _recv_until(wg, "error"))["code"] == "forbidden"
    await ws.send(json.dumps({"type": "revoke", "device_id": inv["device"]["id"]}))
    assert "Ahmed" not in {d["name"] for d in (await _recv_until(ws, "devices"))["devices"]}
    for w in (ws, wg):
        await w.close()
