"""Deterministic roster command parsing and mid-flow intent switching."""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Literal

from app_ai.confirmation import (
    clear_all_roster_pending,
    execute_pending_write_confirmation,
    get_active_write_confirmation,
    infer_action_source,
)
from app_ai.disambiguation import (
    clear_pending,
    get_active_pending,
    save_pending,
)
from app_ai.messages import build_switch_declined, build_switch_prompt, resolve_message_tone
from app_ai.pending_turn import PendingTurnResult
from app_ai.tools.intent import is_cancel_reply

RosterAction = Literal[
    "assign_staff", "remove_staff", "enroll_student", "remove_student"
]

_REMOVE_RE = re.compile(
    r"\b(remove|unassign|take off|drop)\b(?!\s+\d+\s+(?:merit|point))",
    re.IGNORECASE,
)
_ASSIGN_RE = re.compile(r"\b(assign|add)\b", re.IGNORECASE)
_ENROLL_RE = re.compile(r"\b(enroll|add student)\b", re.IGNORECASE)
_UNENROLL_RE = re.compile(r"\b(unenroll|remove student)\b", re.IGNORECASE)
_SELF_RE = re.compile(r"\b(me|myself)\b", re.IGNORECASE)
_COURSE_FROM_RE = re.compile(
    r"\b(?:from|off of|off)\s+(.+?)(?:\s*$|[?.!,])",
    re.IGNORECASE,
)
_COURSE_ON_RE = re.compile(
    r"\b(?:on|to|in)\s+(.+?)(?:\s*$|[?.!,])",
    re.IGNORECASE,
)
_ROLE_AT_RE = re.compile(r"\b(?:as\s+)?(?:at|assistant\s+teacher)\b", re.IGNORECASE)
_ROLE_MT_RE = re.compile(r"\b(?:as\s+)?(?:mt|main\s+teacher)\b", re.IGNORECASE)

SWITCH_YES = frozenset({"yes", "y", "yeah", "confirm"})
SWITCH_NO = frozenset({"no", "n", "nope"})

_ACTION_TO_TOOL = {
    "assign_staff": "assign_staff_to_course",
    "remove_staff": "remove_staff_from_course",
    "enroll_student": "enroll_student_in_course",
    "remove_student": "remove_student_from_course",
}


@dataclass
class RosterCommand:
    action: RosterAction
    user_id: int | None = None
    staff_query: str | None = None
    student_query: str | None = None
    course_query: str | None = None
    course_id: int | None = None
    role_hint: str | None = None


def _extract_course_query(text: str, *, for_remove: bool) -> str | None:
    if for_remove:
        match = _COURSE_FROM_RE.search(text)
    else:
        match = _COURSE_ON_RE.search(text)
    if not match:
        return None
    return match.group(1).strip()


def parse_roster_command(prompt: str, *, user) -> RosterCommand | None:
    text = (prompt or "").strip()
    if not text:
        return None

    action: RosterAction | None = None
    if _UNENROLL_RE.search(text):
        action = "remove_student"
    elif _ENROLL_RE.search(text):
        action = "enroll_student"
    elif _REMOVE_RE.search(text) and (
        "from" in text.lower() or _SELF_RE.search(text)
    ):
        action = "remove_staff"
    elif _ASSIGN_RE.search(text):
        action = "assign_staff"
    else:
        return None

    role_hint = None
    if _ROLE_AT_RE.search(text):
        role_hint = "AT"
    elif _ROLE_MT_RE.search(text):
        role_hint = "MT"

    user_id = None
    staff_query = None
    student_query = None
    if _SELF_RE.search(text):
        user_id = getattr(user, "id", None)
    elif action in {"remove_staff", "assign_staff"}:
        staff_match = re.search(r"\b(remove|assign|add)\s+(\w+)\b", text, re.I)
        if staff_match and staff_match.group(2).lower() not in {
            "me",
            "student",
            "staff",
            "teacher",
        }:
            staff_query = staff_match.group(2)
    elif action in {"enroll_student", "remove_student"} and not _SELF_RE.search(text):
        student_match = re.search(
            r"\b(?:enroll|unenroll|remove student)\s+(\w+)\b", text, re.I
        )
        if student_match:
            student_query = student_match.group(1)

    course_query = _extract_course_query(
        text, for_remove=action in {"remove_staff", "remove_student"}
    )

    return RosterCommand(
        action=action,
        user_id=user_id,
        staff_query=staff_query,
        student_query=student_query,
        course_query=course_query,
        role_hint=role_hint,
    )


def is_explicit_roster_command(cmd: RosterCommand, *, user, org) -> bool:
    from app_ai.tools.resolve import resolve_accessible_course

    has_person = (
        cmd.user_id is not None
        or bool(cmd.staff_query or cmd.student_query)
    )
    if cmd.action in {"remove_staff", "assign_staff"} and not has_person:
        return False
    if cmd.action in {"enroll_student", "remove_student"} and not has_person:
        return False
    if not cmd.course_query and cmd.course_id is None:
        return False
    if cmd.course_id is not None:
        return has_person
    if org is None:
        return False
    resolved = resolve_accessible_course(
        user=user, course_id=None, query=cmd.course_query
    )
    return resolved.get("status") == "ok" and has_person


def _tool_for_action(action: RosterAction) -> str:
    return _ACTION_TO_TOOL[action]


def _args_for_command(cmd: RosterCommand) -> dict[str, Any]:
    args: dict[str, Any] = {}
    if cmd.course_id is not None:
        args["course_id"] = cmd.course_id
    elif cmd.course_query:
        args["course_query"] = cmd.course_query
    if cmd.user_id is not None:
        args["user_id"] = cmd.user_id
    elif cmd.staff_query:
        args["staff_query"] = cmd.staff_query
    elif cmd.student_query:
        args["student_query"] = cmd.student_query
    if cmd.action == "assign_staff" and cmd.role_hint:
        args["role_seniority"] = cmd.role_hint
    return args


def _human_summary(cmd: RosterCommand, *, user, org) -> str:
    from app_ai.tools.resolve import resolve_accessible_course

    course_title = cmd.course_query or "the course"
    if org is not None and cmd.course_query:
        resolved = resolve_accessible_course(
            user=user, course_id=None, query=cmd.course_query
        )
        if resolved.get("status") == "ok":
            course_title = resolved["course"].title

    if cmd.action == "remove_staff":
        return f"remove you from {course_title}"
    if cmd.action == "assign_staff":
        role = cmd.role_hint or "staff"
        return f"assign you as {role} on {course_title}"
    if cmd.action == "enroll_student":
        who = cmd.student_query or "the student"
        return f"enroll {who} in {course_title}"
    if cmd.action == "remove_student":
        who = cmd.student_query or "the student"
        return f"remove {who} from {course_title}"
    return "proceed with your new request"


def _prior_summary(*, disambig, write) -> str:
    if write is not None:
        return write.summary
    if disambig is not None:
        partial = disambig.partial_args or {}
        staff = partial.get("_staff_name") or "the staff member"
        course = partial.get("_course_title") or "the course"
        if disambig.pending_field == "course_role":
            return f"choose a role for {staff} on {course}"
        if disambig.pending_field == "course":
            return f"choose a course for {partial.get('course_query', 'your request')}"
        if disambig.pending_field == "subject":
            return "choose a person for your request"
    return "the pending roster change"


def _conflicts_with_pending(cmd: RosterCommand, *, disambig, write) -> bool:
    pending_tool = None
    if disambig is not None and disambig.pending_field != "switch_confirm":
        pending_tool = disambig.tool_name
    elif write is not None:
        pending_tool = write.tool_name
    if pending_tool is None:
        return False
    return pending_tool != _tool_for_action(cmd.action)


def _snapshot_pending(*, disambig, write) -> dict[str, Any]:
    if disambig is not None and disambig.pending_field != "switch_confirm":
        return {
            "kind": "disambiguation",
            "tool_name": disambig.tool_name,
            "pending_field": disambig.pending_field,
            "partial_args": dict(disambig.partial_args or {}),
            "candidates": list(disambig.candidates or []),
        }
    if write is not None:
        return {
            "kind": "write_confirm",
            "tool_name": write.tool_name,
            "action": write.action,
            "execution_payload": dict(write.execution_payload or {}),
            "summary": write.summary,
            "preview": dict(write.preview or {}),
        }
    return {}


def _restore_prior_pending(*, user, channel_key: str, snapshot: dict[str, Any]) -> None:
    if not snapshot:
        return
    if snapshot.get("kind") == "disambiguation":
        save_pending(
            user=user,
            channel_key=channel_key,
            tool_name=snapshot["tool_name"],
            pending_field=snapshot["pending_field"],
            partial_args=snapshot.get("partial_args") or {},
            candidates=snapshot.get("candidates") or [],
        )
    elif snapshot.get("kind") == "write_confirm":
        from app_ai.confirmation import save_write_confirmation

        save_write_confirmation(
            user=user,
            channel_key=channel_key,
            tool_name=snapshot["tool_name"],
            action=snapshot["action"],
            execution_payload=snapshot.get("execution_payload") or {},
            summary=snapshot.get("summary") or "",
            preview=snapshot.get("preview") or {},
        )


def _prior_reminder_text(*, user, channel_key: str, snapshot: dict[str, Any]) -> str:
    from app_ai.disambiguation import _build_reminder
    from app_ai.messages import build_pending_reminder
    from app_telegram.models import AIDisambiguationPending

    if snapshot.get("kind") == "write_confirm":
        tone = resolve_message_tone(user)
        return build_pending_reminder(
            summary=snapshot.get("summary") or "",
            channel_key=channel_key,
            tone=tone,
        )
    if snapshot.get("kind") == "disambiguation":
        row = AIDisambiguationPending(
            user=user,
            channel_key=channel_key,
            tool_name=snapshot.get("tool_name") or "",
            pending_field=snapshot.get("pending_field") or "",
            partial_args=snapshot.get("partial_args") or {},
            candidates=snapshot.get("candidates") or [],
        )
        return _build_reminder(row)
    return ""


def _execute_explicit_roster_command(
    *,
    tool_name: str,
    args: dict[str, Any],
    user,
    channel_key: str,
    org,
) -> dict[str, Any]:
    from app_ai.tools.registry import get_tool

    clear_all_roster_pending(user=user, channel_key=channel_key)
    tool = get_tool(tool_name)
    result = tool.run(args, user, channel_key=channel_key, org=org)
    if result.get("status") == "pending_confirmation":
        pending = get_active_write_confirmation(user=user, channel_key=channel_key)
        if pending is not None:
            result = execute_pending_write_confirmation(
                pending=pending,
                actor=user,
                tenant=org,
                source=infer_action_source(channel_key),
            )
    clear_all_roster_pending(user=user, channel_key=channel_key)
    return result


def _resolve_switch_confirm(
    *,
    prompt: str,
    user,
    channel_key: str,
    org,
    row,
) -> PendingTurnResult:
    partial = dict(row.partial_args or {})
    snapshot = partial.get("prior_snapshot") or {}
    tone = resolve_message_tone(user)
    normalized = (prompt or "").strip().lower()

    if normalized in SWITCH_YES:
        tool_name = partial.get("new_tool_name") or ""
        args = dict(partial.get("new_args") or {})
        clear_pending(user=user, channel_key=channel_key)
        result = _execute_explicit_roster_command(
            tool_name=tool_name,
            args=args,
            user=user,
            channel_key=channel_key,
            org=org,
        )
        return PendingTurnResult(executed=True, payload=result)

    if normalized in SWITCH_NO:
        clear_pending(user=user, channel_key=channel_key)
        prior_reminder = _prior_reminder_text(
            user=user, channel_key=channel_key, snapshot=snapshot
        )
        _restore_prior_pending(user=user, channel_key=channel_key, snapshot=snapshot)
        return PendingTurnResult(
            reminder=build_switch_declined(prior_reminder=prior_reminder, tone=tone)
        )

    if is_cancel_reply(prompt):
        clear_pending(user=user, channel_key=channel_key)
        _restore_prior_pending(user=user, channel_key=channel_key, snapshot=snapshot)
        return PendingTurnResult(cancelled=True)

    return PendingTurnResult(
        reminder=build_switch_prompt(
            prior_summary=partial.get("prior_summary") or "the pending roster change",
            new_summary=partial.get("new_summary") or "proceed with your new request",
            tone=tone,
        )
    )


def try_resolve_roster_switch(
    *,
    prompt: str,
    user,
    channel_key: str,
    org,
) -> PendingTurnResult | None:
    row = get_active_pending(user=user, channel_key=channel_key)
    if row is not None and row.pending_field == "switch_confirm":
        return _resolve_switch_confirm(
            prompt=prompt,
            user=user,
            channel_key=channel_key,
            org=org,
            row=row,
        )

    cmd = parse_roster_command(prompt, user=user)
    if cmd is None:
        return None

    disambig = get_active_pending(user=user, channel_key=channel_key)
    write = get_active_write_confirmation(user=user, channel_key=channel_key)
    if disambig is None and write is None:
        return None

    if not _conflicts_with_pending(cmd, disambig=disambig, write=write):
        return None

    if not is_explicit_roster_command(cmd, user=user, org=org):
        return None

    tone = resolve_message_tone(user)
    new_summary = _human_summary(cmd, user=user, org=org)
    prior_summary = _prior_summary(disambig=disambig, write=write)
    snapshot = _snapshot_pending(disambig=disambig, write=write)

    save_pending(
        user=user,
        channel_key=channel_key,
        tool_name=_tool_for_action(cmd.action),
        pending_field="switch_confirm",
        partial_args={
            "new_tool_name": _tool_for_action(cmd.action),
            "new_args": _args_for_command(cmd),
            "new_summary": new_summary,
            "prior_summary": prior_summary,
            "prior_snapshot": snapshot,
        },
        candidates=[],
    )
    return PendingTurnResult(
        reminder=build_switch_prompt(
            prior_summary=prior_summary,
            new_summary=new_summary,
            tone=tone,
        )
    )
