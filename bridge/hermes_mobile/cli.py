"""``hermes [-p <profile>] mobile pair|list|revoke`` (same as running pair.py)."""

from __future__ import annotations

import argparse
from pathlib import Path

from .pair import add_arguments, run


def _dispatch(args: argparse.Namespace) -> int:
    from hermes_constants import get_hermes_home
    home = Path(get_hermes_home())
    profile = home.name if home.parent.name == "profiles" else "default"
    return run(args, home, profile)


def register_cli(ctx) -> None:
    ctx.register_cli_command(name="mobile", help="Pair phones with this profile for the Hermes Mobile app",
                             setup_fn=add_arguments, handler_fn=_dispatch)
