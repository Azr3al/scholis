# AI Interaction Messages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace stiff/hallucinated AI pending-state copy with tone-aware deterministic templates, fix Telegram confirm UX (one message + inline buttons + text fallback), and require explicit role selection before staff assign confirmation.

**Architecture:** New `app_ai/messages.py` builds all user-facing copy for confirm, disambiguation, and role-required flows keyed by `UserAIPreferences.Tone`. `run_ai_query` and web `AIQueryView` post-process `AIService.run` results by checking `get_active_write_confirmation` / `get_active_pending` and replacing model prose. `confirmation.py` executes text confirm on Telegram. `assign_staff_to_course` returns `role_required` when no role args.

**Tech Stack:** Django, existing AI tool/disambiguation/confirmation infra, Telegram Bot API inline keyboards.

**Spec:** `docs/superpowers/specs/2026-07-01-ai-interaction-messages-design.md`

---

## File map

| File | Action |
| --- | --- |
| `app_ai/messages.py` | **Create** — tone + template builders |
| `app_ai/tests/test_messages.py` | **Create** — template unit tests |
| `app_ai/tools/assign_staff_to_course.py` | **Modify** — `role_required` flow |
| `app_ai/tools/resolve.py` | **Modify** — `list_assignable_course_roles()` helper |
| `app_ai/tests/test_assign_staff_role_required.py` | **Create** |
| `app_ai/confirmation.py` | **Modify** — Telegram text confirm + role override + reminders |
| `app_ai/tests/test_confirmation.py` | **Modify/Create** |
| `app_ai/disambiguation.py` | **Modify** — template reminders |
| `app_ai/prompts.py` | **Modify** — interaction copy guardrails |
| `app_ai/service.py` | **Modify** — role override pre-flight (optional hook) |
| `app_ai/views.py` | **Modify** — web template override |
| `app_ai/interaction.py` | **Create** — `resolve_interaction_message(user, channel_key)` helper |
| `app_telegram/tasks.py` | **Modify** — single-message confirm + template override |
| `app_telegram/callbacks.py` | **Modify** — template success/cancel/expired |
| `app_telegram/tests/test_ai_query.py` | **Modify** — keyboard on ack edit |
| `app_telegram/tests/test_callbacks.py` | **Modify** — tone-aware success |

---

### Task 1: Message templates module

**Files:**
- Create: `app_ai/messages.py`
- Create: `app_ai/tests/test_messages.py`

- [ ] **Step 1: Write failing tests**

```python
# app_ai/tests/test_messages.py
from django.test import TestCase
from app_ai.messages import (
    build_confirm_message,
    build_role_required_message,
    build_disambiguation_message,
    resolve_message_tone,
)
from app_auth.models_user_ai import UserAIPreferences


class MessageTemplateTests(TestCase):
    def test_default_confirm_remove_staff(self):
        text = build_confirm_message(
            action="remove_staff",
            staff_name="Thiha",
            course_title="KET 152 WE",
            tone="default",
        )
        self.assertIn("Remove Thiha", text)
        self.assertIn("yes", text.lower())

    def test_formal_confirm_is_professional(self):
        text = build_confirm_message(
            action="remove_staff",
            staff_name="Thiha",
            course_title="KET 152 WE",
            tone="formal",
        )
        self.assertIn("confirm", text.lower())

    def test_role_required_lists_candidates(self):
        text = build_role_required_message(
            staff_name="Thiha",
            course_title="KET 152 WE",
            candidates=[
                {"key": "A", "name": "Main Teacher"},
                {"key": "B", "name": "Coordinator"},
            ],
            tone="default",
        )
        self.assertIn("A)", text)
        self.assertIn("cancel", text.lower())

    def test_assign_confirm_all_sessions_scope_line(self):
        text = build_confirm_message(
            action="assign_staff",
            staff_name="Thiha",
            course_title="KET 152 WE",
            role_name="Assistant Teacher",
            weekdays=None,
            tone="default",
        )
        self.assertIn("Adding to all course sessions", text)

    def test_assign_confirm_weekday_scope_line(self):
        text = build_confirm_message(
            action="assign_staff",
            staff_name="Thiha",
            course_title="KET 152 WE",
            role_name="Assistant Teacher",
            weekday_labels=["Monday", "Wednesday"],
            session_count=4,
            tone="default",
        )
        self.assertIn("Monday and Wednesday", text)
        self.assertIn("4", text)

    def test_resolve_message_tone_casual(self):
        class P:
            tone = UserAIPreferences.Tone.CASUAL
        self.assertEqual(resolve_message_tone(P()), "casual")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_ai.tests.test_messages`

Expected: FAIL — `ModuleNotFoundError: app_ai.messages`

- [ ] **Step 3: Implement `app_ai/messages.py`**

```python
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
        header = f'Multiple {field_label} matches were found for "{query}". Please select one:'
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
    if not weekdays:
        if tone == "formal":
            return "This assignment applies to all course sessions."
        return "Adding to all course sessions."
    labels = weekday_labels or []
    if len(labels) == 1:
        days = labels[0]
    elif len(labels) == 2:
        days = f"{labels[0]} and {labels[1]}"
    else:
        days = ", ".join(labels[:-1]) + f", and {labels[-1]}"
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


def build_pending_reminder(*, summary: str, channel_key: str, tone: ToneKey) -> str:
    if tone == "casual":
        base = f"Still waiting: {summary}"
    else:
        base = f"Pending: {summary}"
    if channel_key.startswith("telegram:"):
        return f"{base}\nTap Confirm or reply yes. Reply cancel to abort."
    return f"{base}\nReply confirm to proceed or cancel to abort."
```

- [ ] **Step 4: Run tests**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_ai.tests.test_messages`

Expected: PASS

---

### Task 2: Interaction resolver helper

**Files:**
- Create: `app_ai/interaction.py`
- Modify: `app_ai/tests/test_messages.py` (add integration-style test)

- [ ] **Step 1: Write failing test**

```python
def test_resolve_interaction_message_for_pending_confirm(self):
    from app_ai.confirmation import save_write_confirmation
    from app_ai.interaction import resolve_interaction_message
    # use existing test fixtures with user + channel_key
    save_write_confirmation(
        user=self.admin,
        channel_key="telegram:1",
        tool_name="remove_staff_from_course",
        action="remove_staff",
        execution_payload={"course_id": 1, "staff_id": 2},
        summary="legacy summary",
        preview={"staff": {"name": "Thiha"}, "course": {"title": "KET 152 WE"}},
    )
    text = resolve_interaction_message(user=self.admin, channel_key="telegram:1")
    self.assertIn("Remove Thiha", text)
```

- [ ] **Step 2: Implement `resolve_interaction_message`**

```python
# app_ai/interaction.py
from app_ai.confirmation import get_active_write_confirmation
from app_ai.disambiguation import get_active_pending
from app_ai.messages import (
    build_confirm_message,
    build_disambiguation_message,
    build_role_required_message,
    resolve_message_tone,
)


def resolve_interaction_message(*, user, channel_key: str) -> str | None:
    tone = resolve_message_tone(user)
    pending = get_active_write_confirmation(user=user, channel_key=channel_key)
    if pending is not None:
        preview = pending.preview or {}
        staff = preview.get("staff") or {}
        student = preview.get("student") or {}
        course = preview.get("course") or {}
        role = preview.get("role") or {}
        return build_confirm_message(
            action=pending.action,
            tone=tone,
            staff_name=staff.get("name", ""),
            student_name=student.get("name", ""),
            course_title=course.get("title", ""),
            role_name=role.get("name", ""),
            weekdays=preview.get("weekdays"),
            weekday_labels=preview.get("weekday_labels"),
            session_count=preview.get("session_count"),
        )

    row = get_active_pending(user=user, channel_key=channel_key)
    if row is None:
        return None

    labels = {
        "subject": "person",
        "course": "course",
        "course_role": "role",
        "point_type": "point type",
    }
    if row.pending_field == "course_role":
        partial = row.partial_args or {}
        # resolve names from preview stored in partial_args if available
        staff_name = (partial.get("_staff_name") or "this staff member")
        course_title = (partial.get("_course_title") or "this course")
        return build_role_required_message(
            staff_name=staff_name,
            course_title=course_title,
            candidates=row.candidates or [],
            tone=tone,
        )

    return build_disambiguation_message(
        field_label=labels.get(row.pending_field, row.pending_field),
        query=(row.partial_args or {}).get("staff_query")
        or (row.partial_args or {}).get("course_query")
        or (row.partial_args or {}).get("query")
        or "",
        candidates=row.candidates or [],
        tone=tone,
    )
```

Note: When implementing Task 3, store `_staff_name` / `_course_title` in `partial_args` inside `assign_staff_to_course` before `save_pending` for richer role-required copy.

- [ ] **Step 3: Run tests**

Expected: PASS

---

### Task 3: Staff assign — `role_required`

**Files:**
- Modify: `app_ai/tools/resolve.py`
- Modify: `app_ai/tools/assign_staff_to_course.py`
- Create: `app_ai/tests/test_assign_staff_role_required.py`

- [ ] **Step 1: Write failing test**

```python
def test_assign_without_role_returns_role_required(self):
    result = run_assign_staff_to_course(
        {"course_id": self.course.id, "user_id": self.staff.id},
        self.admin,
        channel_key="telegram:99",
    )
    self.assertEqual(result["status"], "role_required")
    self.assertTrue(result["candidates"])
    from app_ai.disambiguation import get_active_pending
    row = get_active_pending(user=self.admin, channel_key="telegram:99")
    self.assertEqual(row.pending_field, "course_role")
```

- [ ] **Step 2: Add helper in `resolve.py`**

```python
def list_assignable_course_roles(*, limit: int = 26) -> list[dict]:
    from app_course.models import AssignedAsRole
    qs = AssignedAsRole.objects.all().order_by("seniority", "name")[:limit]
    return [
        {"id": r.id, "name": r.name, "seniority": r.seniority}
        for r in qs
    ]
```

Apply `_with_letter_keys` when building `role_required` payload.

- [ ] **Step 3: Update `assign_staff_to_course` before `resolve_course_role`**

```python
has_role = any([
    args.get("role_seniority"),
    args.get("course_role_query"),
    args.get("course_role_id") is not None,
])
if not has_role:
    roles = list_assignable_course_roles()
    if not roles:
        return {"error": "not_found", "message": "No course roles configured."}
    candidates = _with_letter_keys(roles)
    partial_args["_staff_name"] = staff.name
    partial_args["_course_title"] = course.title
    if channel_key:
        save_pending(
            user=user,
            channel_key=channel_key,
            tool_name="assign_staff_to_course",
            pending_field="course_role",
            partial_args=partial_args,
            candidates=candidates,
        )
    return {
        "status": "role_required",
        "message": "Role required before assignment.",
        "candidates": candidates,
    }
```

- [ ] **Step 4: Run tests**

Run: `./scripts/run_backend_tests.sh app_ai.tests.test_assign_staff_role_required app_ai.tests.test_roster_write_tools`

Expected: PASS

---

### Task 4: Telegram text confirm + reminders

**Files:**
- Modify: `app_ai/confirmation.py`
- Modify: `app_ai/tests/test_confirmation.py`

- [ ] **Step 1: Write failing test**

```python
def test_telegram_yes_executes_pending(self):
    pending = save_write_confirmation(...)
    result = try_resolve_pending_confirmation(
        prompt="yes",
        user=self.admin,
        channel_key="telegram:1",
        org=self.org,
    )
    self.assertTrue(result.executed)
```

- [ ] **Step 2: Change Telegram branch in `try_resolve_pending_confirmation`**

Remove the block that only returns button reminder. Reuse the same `confirm`/`yes`/`y` branch as web (without requiring `WEB_ROSTER_CONFIRM_ENABLED`). Use `build_pending_reminder` for unrecognized replies.

Add helper `_parse_role_override(prompt, org)` — if pending.action == `assign_staff`, detect MT/AT/role name; if matched, `clear_write_confirmation` and return `PendingTurnResult(cancelled=False, payload={"role_override": ...})` for service to handle (or merge into disambiguation args directly).

- [ ] **Step 3: Run tests**

Run: `./scripts/run_backend_tests.sh app_ai.tests.test_confirmation`

Expected: PASS

---

### Task 5: Prompt guardrails

**Files:**
- Modify: `app_ai/prompts.py`

- [ ] **Step 1: Add Interaction copy section** (per spec §4.5) after roster writes block.

- [ ] **Step 2: Run existing prompt-related tests**

Run: `./scripts/run_backend_tests.sh app_ai.tests.test_actor_context`

Expected: PASS

---

### Task 6: Telegram single-message delivery

**Files:**
- Modify: `app_telegram/tasks.py`
- Modify: `app_telegram/tests/test_ai_query.py`

- [ ] **Step 1: Write failing test**

```python
@patch("app_telegram.tasks.AIService")
@patch("app_telegram.tasks.TelegramClient")
def test_pending_confirm_edits_ack_with_keyboard(self, MockClient, MockAIService):
    MockAIService.return_value.run.return_value = AIResult(
        text="I have initiated the removal...", model="x", iterations=1
    )
    # seed save_write_confirmation in DB for user
    run_ai_query(...)
    MockClient.return_value.edit_message_text.assert_called_once()
    kwargs = MockClient.return_value.edit_message_text.call_args.kwargs
    self.assertIn("reply_markup", kwargs)
    MockClient.return_value.send_message.assert_not_called()
```

- [ ] **Step 2: Refactor `run_ai_query` success path**

```python
from app_ai.interaction import resolve_interaction_message

result = AIService().run(...)
interaction_text = resolve_interaction_message(
    user=user, channel_key=channel_key or f"telegram:{chat_id}"
)
reply_text = cleanup_ai_response_text(
    interaction_text or result.text or "I couldn't find an answer."
)

if ack_message_id is not None:
    reply_markup = None
    pending = get_active_write_confirmation(user=user, channel_key=channel_key or f"telegram:{chat_id}")
    if pending is not None:
        reply_markup = build_roster_confirm_keyboard(pending.id)
    sent = client.edit_message_text(
        chat_id, ack_message_id, reply_text,
        format_markdown=interaction_text is None,
        reply_markup=reply_markup,
    )
    # store telegram_message_id on pending
else:
    # group threaded reply — same reply_markup logic on send_message
    ...
# REMOVE separate send_message block for pending.summary
```

Extend `_deliver_reply` / `edit_message_text` wrapper to accept `reply_markup` and pass through to client (update `TelegramClient.edit_message_text` usage in `_deliver_reply` if needed).

- [ ] **Step 3: Run tests**

Run: `./scripts/run_backend_tests.sh app_telegram.tests.test_ai_query`

Expected: PASS

---

### Task 7: Callback template messages

**Files:**
- Modify: `app_telegram/callbacks.py`
- Modify: `app_telegram/tests/test_callbacks.py`

- [ ] **Step 1: Replace `_success_message` with `build_confirm_success` + `resolve_message_tone(user)`**

- [ ] **Step 2: Use `build_confirm_cancelled` / `build_confirm_expired` for cancel/expired edits**

- [ ] **Step 3: Run tests**

Run: `./scripts/run_backend_tests.sh app_telegram.tests.test_callbacks`

Expected: PASS

---

### Task 8: Disambiguation reminders

**Files:**
- Modify: `app_ai/disambiguation.py`

- [ ] **Step 1: Replace `_build_reminder` to delegate to `build_disambiguation_message` / `build_role_required_message` using row data**

- [ ] **Step 2: Run tests**

Run: `./scripts/run_backend_tests.sh app_ai.tests.test_disambiguation`

Expected: PASS

---

### Task 9: Web channel template override

**Files:**
- Modify: `app_ai/views.py`

- [ ] **Step 1: After `AIService().run`, call `resolve_interaction_message`; if non-None, set `result.text` to that value before returning JSON**

- [ ] **Step 2: Manual smoke test** via existing AI query endpoint (optional automated test in `app_ai/tests/test_views.py` if present)

---

### Task 10: End-to-end verification

- [ ] **Run full targeted suite**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_ai.tests.test_messages app_ai.tests.test_assign_staff_role_required app_ai.tests.test_confirmation app_ai.tests.test_disambiguation app_telegram.tests.test_ai_query app_telegram.tests.test_callbacks`

Expected: all PASS

- [ ] **Manual Telegram checklist**

1. Remove staff → one ack message with Confirm/Cancel buttons.
2. Tap Confirm → message edits to success copy.
3. Repeat remove flow; reply `yes` instead of button → executes.
4. Add staff without role → role list; pick AT → confirm with role in text.
5. Start confirm with wrong role; send "add as AT" → new confirm with AT.

- [ ] **Ops note for deploy**

Document in PR: run `python manage.py telegram-set-webhooks` per tenant after deploy.

---

## Plan self-review (spec coverage)

| Spec requirement | Task |
| --- | --- |
| Session scope in assign confirm | Task 1 (`format_session_scope`) |
| Tone-aware templates | Task 1 |
| Template override post-process | Task 2, 6, 9 |
| One Telegram message + keyboard | Task 6 |
| Text confirm on Telegram | Task 4 |
| Role required before confirm | Task 3 |
| Mid-flow role change | Task 4 |
| Prompt guardrails | Task 5 |
| Disambiguation copy | Task 1, 8 |
| Callback success copy | Task 7 |
| Tests | All tasks |

No TBD placeholders remain in task steps.
