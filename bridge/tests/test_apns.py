import asyncio
import json

import pytest

from hermes_mobile.apns import APNs

jwt = pytest.importorskip("jwt")
ec = pytest.importorskip("cryptography.hazmat.primitives.asymmetric.ec")


def _setup(tmp_path):
    from cryptography.hazmat.primitives import serialization
    key = ec.generate_private_key(ec.SECP256R1())
    pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    (tmp_path / "AuthKey_ABC123.p8").write_bytes(pem)
    (tmp_path / "apns.json").write_text(json.dumps({"team_id": "TEAM123456"}))
    return APNs(tmp_path)


def test_unconfigured(tmp_path):
    assert APNs(tmp_path).config() is None
    assert asyncio.run(APNs(tmp_path).send("apns:00", "t", "b", {})) == "unconfigured"


def test_sandbox_fallback_and_memory(tmp_path):
    a = _setup(tmp_path)
    cfg = a.config()
    assert cfg["key_id"] == "ABC123" and cfg["topic"] == "com.ltf92.hermesmobile"
    calls = []

    def post(env, tok, cfg, payload):
        calls.append(env)
        assert payload["aps"]["alert"] == {"title": "t", "body": "b"} and payload["profile"] == "assaf"
        return (200, "") if env == "sandbox" else (400, "BadDeviceToken")
    a._post = post
    assert asyncio.run(a.send("apns:abcd", "t", "b", {"chat_id": "owner", "profile": "assaf"})) == "ok"
    assert asyncio.run(a.send("apns:abcd", "t", "b", {"chat_id": "owner", "profile": "assaf"})) == "ok"
    assert calls == ["production", "sandbox", "sandbox"]


def test_gone(tmp_path):
    a = _setup(tmp_path)
    a._post = lambda *args: (410, "Unregistered")
    assert asyncio.run(a.send("apns:abcd", "t", "b", {})) == "gone"
