"""Who gets pushed what, and what a guest may do. No Hermes imports, so it is unit-tested."""

from __future__ import annotations

import re
import time
from typing import Any, Optional

# What each phone gets pushed unless it says otherwise (``notify`` frame). ``quiet`` hours hold
# everything but approvals; ``tz`` is the phone's UTC offset in minutes.
NOTIFY_DEFAULTS: dict[str, Any] = {"approval": True, "scheduled": True, "errors": True, "replies": True,
                                   "muted": False, "quiet": {"on": False, "start": 23, "end": 7}, "tz": 0}

# Looks like a failure report (cron job error, "couldn't reach the disk"...): goes to the main channel.
FAILED = re.compile(r"(^|\W)(error|failed|failure|exception|traceback)(\W|$)|فشل|تعذّر|تعذر|خطأ", re.I)

# Tools a "read" guest may use; a "chat" guest gets none. Anything not listed is blocked for them.
READ_ONLY_TOOLS = frozenset({
    "read_file", "search_files", "list_files", "list_directory", "grep", "glob", "web_search", "web_extract",
    "vision_analyze", "session_search", "skill_view", "skills_list", "clarify", "todo",
})

GUEST_PROMPTS = {
    "chat": "Only converse. Do not use any tools: do not read or change files, run commands, browse, or send anything.",
    "read": "You may read files and search, but never change files, run commands that modify anything, or send messages.",
    "full": "You may use your tools; sensitive steps go to the owner for approval.",
}


def wants_push(prefs: Optional[dict[str, Any]], kind: str, now: Optional[float] = None) -> bool:
    """Does a phone with these ``notify`` prefs want a push of this kind right now?"""
    p = {**NOTIFY_DEFAULTS, **(prefs or {})}
    if p.get("muted"):
        return False
    key = {"approval": "approval", "scheduled": "scheduled", "error": "errors"}.get(kind, "replies")
    if not p.get(key, True):
        return False
    quiet = p.get("quiet") or {}
    if kind != "approval" and quiet.get("on"):
        try:
            minutes = int(((now or time.time()) / 60 + int(p.get("tz") or 0)) % 1440)
            start, end = int(quiet.get("start", 23)) * 60, int(quiet.get("end", 7)) * 60
        except (TypeError, ValueError):
            return True
        inside = start <= minutes < end if start < end else (minutes >= start or minutes < end)
        if inside:
            return False
    return True


def guest_block(scope: Optional[str], tool_name: str) -> Optional[str]:
    """The block message for a tool a guest of this scope may not use, else None."""
    if scope == "chat" or (scope == "read" and tool_name not in READ_ONLY_TOOLS):
        return (f"BLOCKED: {tool_name} is not available in this shared chat (the owner gave this guest "
                f"{'chat-only' if scope == 'chat' else 'read-only'} access). Answer without it.")
    return None


def guest_prompt(name: str, scope: Optional[str], topic: Optional[str]) -> str:
    """The per-chat instruction that tells the agent who the guest is and what they may ask."""
    parts = [f"You are talking with {name}, a guest the owner shared this agent with.",
             GUEST_PROMPTS.get(scope or "full", GUEST_PROMPTS["full"])]
    if topic:
        parts.append(f"Stay strictly within this topic: {topic}. Politely decline anything else.")
    parts.append("Never reveal the owner's other conversations, scheduled jobs, files outside the topic, or other agents.")
    return " ".join(parts)
