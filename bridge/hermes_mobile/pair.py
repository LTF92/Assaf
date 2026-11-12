#!/usr/bin/env python3
"""Pair phones with a Hermes profile (works with or without Hermes importable).

    python3 pair.py pair                      # pair your own phone with the default profile
    python3 pair.py -p coder pair --guest --name "Ahmed"   # give Ahmed the "coder" profile only
    python3 pair.py -p coder list
    python3 pair.py -p coder revoke <device-id>

Also available as ``hermes [-p <profile>] mobile ...`` when Hermes loads the plugin's CLI.
The command prints a QR code (if the ``qrcode`` package is installed) and a ``hermesmobile://``
link; scan it from the app's "Add connection" screen.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import socket
import subprocess
import sys
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from core import DeviceRegistry  # type: ignore
else:
    from .core import DeviceRegistry

DEFAULT_PORT = 8765


def hermes_root() -> Path:
    return Path(os.environ.get("HERMES_ROOT") or Path.home() / ".hermes")


def profile_home(profile: str | None) -> Path:
    if profile and profile != "default":
        return hermes_root() / "profiles" / profile
    if os.environ.get("HERMES_HOME") and not profile:
        return Path(os.environ["HERMES_HOME"])
    return hermes_root()


def read_dotenv(home: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    try:
        for line in (home / ".env").read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            values[key.strip().removeprefix("export ").strip()] = val.strip().strip('"').strip("'")
    except OSError:
        pass
    return values


def detect_host() -> str:
    """Tailscale IP when available (reachable from anywhere you are), else this machine's LAN IP."""
    try:
        out = subprocess.run(["tailscale", "ip", "-4"], capture_output=True, text=True, timeout=3)
        ip = out.stdout.strip().splitlines()[0] if out.returncode == 0 and out.stdout.strip() else ""
        if ip:
            return ip
    except (OSError, subprocess.SubprocessError, IndexError):
        pass
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))
            return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"


def pairing_link(url: str, token: str, profile: str, label: str, role: str) -> str:
    payload = {"v": 1, "url": url, "token": token, "profile": profile, "label": label, "role": role}
    data = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode().rstrip("=")
    return f"hermesmobile://pair?d={data}"


def print_qr(text: str) -> None:
    """Draw the QR in the terminal: Python `qrcode` if installed, else the `qrencode` CLI."""
    try:
        import qrcode  # type: ignore
    except ImportError:
        qrcode = None
    if qrcode is not None:
        qr = qrcode.QRCode(border=1)
        qr.add_data(text)
        qr.make(fit=True)
        qr.print_ascii(invert=True)
        return
    import shutil
    if shutil.which("qrencode"):
        # the secret goes through stdin, never the process list
        res = subprocess.run(["qrencode", "-t", "ANSIUTF8", "-m", "1"], input=text.encode(), check=False)
        if res.returncode == 0:
            return
    print("(No QR tool found. Install one to see a QR code here: brew install qrencode)\n")


def cmd_pair(args, home: Path, profile: str) -> int:
    env = read_dotenv(home)
    port = args.port or int(env.get("HERMES_MOBILE_PORT") or os.environ.get("HERMES_MOBILE_PORT") or DEFAULT_PORT)
    host = args.host or env.get("HERMES_MOBILE_PUBLIC_HOST") or detect_host()
    scheme = "wss" if args.tls else "ws"
    url = args.url or f"{scheme}://{host}:{port}"
    label = args.label or env.get("HERMES_MOBILE_LABEL") or profile
    role = "guest" if args.guest else "owner"
    registry = DeviceRegistry(home / "mobile" / "devices.json")
    device, token = registry.pair(args.name or "", role=role)
    link = pairing_link(url, token, profile, label, role)
    print()
    print_qr(link)
    print(f"Profile : {profile}  ({label})")
    print(f"Device  : {device.name}  [{role}]  id={device.id}")
    print(f"Address : {url}")
    print("\nScan the QR code in Hermes Mobile → Add connection, or paste this link:\n")
    print(link)
    print("\nThe link contains a secret key. Share it only with the person it is for.")
    if role == "guest":
        print("Guests get their own private chat on this profile and nothing else.")
    print(f"Revoke later with: pair.py -p {profile} revoke {device.id}\n")
    return 0


def cmd_list(args, home: Path, profile: str) -> int:
    devices = DeviceRegistry(home / "mobile" / "devices.json").list()
    if not devices:
        print(f"No paired devices for profile '{profile}'.")
        return 0
    for d in devices:
        push = "push" if d.push_token else "-"
        print(f"{d.id}  {d.role:<5}  {push:<4}  {d.name}")
    return 0


def cmd_revoke(args, home: Path, profile: str) -> int:
    ok = DeviceRegistry(home / "mobile" / "devices.json").revoke(args.device_id)
    print("Revoked." if ok else "No such device.")
    return 0 if ok else 1


def add_arguments(parser: argparse.ArgumentParser) -> None:
    subs = parser.add_subparsers(dest="mobile_command")
    p = subs.add_parser("pair", help="Pair a phone (prints a QR code)")
    p.add_argument("--name", help="Device or person name, e.g. 'Lateef iPhone' or 'Ahmed'")
    p.add_argument("--guest", action="store_true", help="Give someone else access to this profile only")
    p.add_argument("--host", help="Address the phone should dial (default: Tailscale IP, else LAN IP)")
    p.add_argument("--port", type=int, help="Port (default: HERMES_MOBILE_PORT or 8765)")
    p.add_argument("--url", help="Full ws:// or wss:// URL (overrides host/port), e.g. behind a tunnel")
    p.add_argument("--tls", action="store_true", help="Use wss:// (when a reverse proxy terminates TLS)")
    p.add_argument("--label", help="Name shown in the app for this profile")
    subs.add_parser("list", help="List paired devices")
    r = subs.add_parser("revoke", help="Revoke a device")
    r.add_argument("device_id")


def run(args, home: Path, profile: str) -> int:
    handlers = {"pair": cmd_pair, "list": cmd_list, "revoke": cmd_revoke}
    handler = handlers.get(getattr(args, "mobile_command", None) or "list")
    return handler(args, home, profile)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Pair phones with a Hermes profile for Hermes Mobile")
    parser.add_argument("-p", "--profile", help="Hermes profile name (default: default)")
    add_arguments(parser)
    args = parser.parse_args(argv)
    home = profile_home(args.profile)
    if not home.exists():
        print(f"Profile home not found: {home}", file=sys.stderr)
        return 2
    return run(args, home, args.profile or "default")


if __name__ == "__main__":
    sys.exit(main())
