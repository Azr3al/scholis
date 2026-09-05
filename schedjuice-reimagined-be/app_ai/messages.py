"""Deterministic, tone-aware copy for AI pending/interaction states."""
from __future__ import annotations

from app_auth.models import User
from app_auth.models_user_ai import UserAIPreferences

ToneKey = str  # "default" | "casual" | "formal"


def resolve_message_tone(user: User) -> ToneKey:
    from app_ai.user_preferences import get_preferences_for_user

    prefs = get_preferences_for_user(user)
    if prefs is None or prefs.tone == UserAIPreferences.Tone.DEFAULT:
        return "default"
    if prefs.tone == UserAIPreferences.Tone.CASUAL:
        return "casual"
    if prefs.tone == UserAIPreferences.Tone.FORMAL:
        return "formal"
    return "default"


def format_candidate_lines(candidates: list[dict]) -> str:
    lines = []
    for row in candidates or []:
        key = row.get("key", "?")
        name = row.get("name") or row.get("title") or "?"
        extra = ""
        if row.get("primary_email"):
            extra = f" ({row['primary_email']})"
        lines.append(f"{key}) {name}{extra}")
    return "\n".join(lines)


def build_disambiguation_message(
    *,
    field_label: str,
    query: str,
    candidates: list[dict],
    tone: ToneKey,
) -> str:
    options = format_candidate_lines(candidates)
    if tone == "casual":
        header = f'Which {field_label} did you mean for "{query}"?'
        footer = "Reply with a letter, full name, or cancel."
    elif tone == "formal":
        header = (
            f'Multiple {field_label} matches were found for "{query}". Please select one:'
        )
        footer = 'Reply with the option letter, full name, or "cancel".'
    else:
        header = f'I found a few matches for "{query}". Which {field_label}?'
        footer = "Reply A, B, the full name, or cancel."
    return f"{header}\n\n{options}\n\n{footer}"


def build_role_required_message(
    *,
    staff_name: str,
    course_title: str,
    candidates: list[dict],
    tone: ToneKey,
) -> str:
    options = format_candidate_lines(candidates)
    if tone == "casual":
        header = f"What role should {staff_name} have on {course_title}?"
        footer = "Reply with a letter, role name, or cancel."
    elif tone == "formal":
        header = f"Please specify the role for {staff_name} on {course_title}:"
        footer = 'Reply with the option letter, role name, or "cancel".'
    else:
        header = f"Which role should {staff_name} have on {course_title}?"
        footer = "Reply A, B, C, the role name, or cancel."
    return f"{header}\n\n{options}\n\n{footer}"


def format_session_scope(
    *,
    weekdays: list[int] | None,
    weekday_labels: list[str] | None,
    session_count: int | None,
    tone: ToneKey,
) -> str:
    """Human-readable session scope for assign-staff confirm."""
    if not weekdays and not weekday_labels:
        if tone == "formal":
            return "This assignment applies to all course sessions."
        return "Adding to all course sessions."
    labels = weekday_labels or []
    if len(labels) == 1:
        days = labels[0]
    elif len(labels) == 2:
        days = f"{labels[0]} and {labels[1]}"
    elif labels:
        days = ", ".join(labels[:-1]) + f", and {labels[-1]}"
    else:
        days = "selected days"
    if session_count and session_count > 0:
        return f"Adding to {days} sessions ({session_count} slots)."
    return f"Adding to {days} sessions."


def build_confirm_message(
    *,
    action: str,
    tone: ToneKey,
    staff_name: str = "",
    student_name: str = "",
    course_title: str = "",
    role_name: str = "",
    weekdays: list[int] | None = None,
    weekday_labels: list[str] | None = None,
    session_count: int | None = None,
) -> str:
    name = staff_name or student_name
    if action == "remove_staff":
        question = f"Remove {name} from {course_title}?"
        scope_line = ""
    elif action == "remove_student":
        question = f"Remove {name} from {course_title}?"
        scope_line = ""
    elif action == "enroll_student":
        question = f"Enroll {name} in {course_title}?"
        scope_line = ""
    elif action == "assign_staff":
        question = f"Assign {name} as {role_name} on {course_title}?"
        scope_line = format_session_scope(
            weekdays=weekdays,
            weekday_labels=weekday_labels,
            session_count=session_count,
            tone=tone,
        )
    else:
        question = f"Confirm this change on {course_title}?"
        scope_line = ""

    if tone == "casual":
        footer = "Tap Confirm or say yes. Say cancel to stop."
    elif tone == "formal":
        footer = 'Tap Confirm or reply "confirm". Reply "cancel" to abort.'
    else:
        footer = "Tap Confirm or reply yes. Reply cancel to abort."

    if scope_line:
        return f"{question}\n\n{scope_line}\n\n{footer}"
    return f"{question}\n\n{footer}"


def build_confirm_success(*, action: str, result: dict, tone: ToneKey) -> str:
    course = (result.get("course") or {}).get("title", "the course")
    if action == "remove_staff":
        name = (result.get("staff") or {}).get("name", "Staff")
        prefix = "Done —" if tone != "formal" else "Completed:"
        return f"{prefix} removed {name} from {course}."
    if action == "remove_student":
        name = (result.get("student") or {}).get("name", "Student")
        prefix = "Done —" if tone != "formal" else "Completed:"
        return f"{prefix} removed {name} from {course}."
    if action == "enroll_student":
        name = (result.get("student") or {}).get("name", "Student")
        return f"Enrolled {name} in {course}."
    if action == "assign_staff":
        name = (result.get("staff") or {}).get("name", "Staff")
        role = (result.get("role") or {}).get("name", "role")
        count = result.get("sessions_assigned", 0)
        return f"Assigned {name} as {role} on {course} ({count} sessions)."
    return "Roster change completed."


def build_confirm_cancelled(tone: ToneKey) -> str:
    if tone == "formal":
        return "The pending change was cancelled."
    return "Cancelled."


def build_confirm_expired(tone: ToneKey) -> str:
    if tone == "formal":
        return "This confirmation has expired. Please submit your request again."
    return "This confirmation expired. Ask again to retry."


def build_switch_prompt(
    *,
    prior_summary: str,
    new_summary: str,
    tone: ToneKey,
) -> str:
    question = (
        f"You have a pending change: {prior_summary}. "
        f"Cancel it and {new_summary} instead?"
    )
    if tone == "formal":
        footer = 'Reply "yes" to switch or "no" to continue the pending change.'
    elif tone == "casual":
        footer = "Reply yes to switch or no to keep going with the pending change."
    else:
        footer = "Reply yes to switch or no to continue the pending change."
    return f"{question}\n\n{footer}"


def build_switch_declined(*, prior_reminder: str, tone: ToneKey) -> str:
    if tone == "formal":
        prefix = "Understood — continuing with the pending change."
    else:
        prefix = "OK — continuing with the pending change."
    if prior_reminder:
        return f"{prefix}\n\n{prior_reminder}"
    return prefix


def build_pending_reminder(*, summary: str, channel_key: str, tone: ToneKey) -> str:
    if tone == "casual":
        base = f"Still waiting: {summary}"
    else:
        base = f"Pending: {summary}"
    if channel_key.startswith("telegram:"):
        return f"{base}\nTap Confirm or reply yes. Reply cancel to abort."
    return f"{base}\nReply confirm to proceed or cancel to abort."
