# Roster Workflow Intent Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix roster write workflow traps (stale pending, wrong tool after assign→remove) via deterministic intent routing, switch prompts, pending hygiene, and Flash Lite–safe prompts.

**Architecture:** New `app_ai/roster_intent.py` parses roster commands and resolves mid-flow switches before existing pending handlers. Pending hygiene clears both disambiguation and write confirm on execute. Write-turn prompt injected dynamically; workflow state never delegated to Gemini 3.1 Flash Lite.

**Tech Stack:** Django, existing AI tool/disambiguation/confirmation infra, Gemini 3.1 Flash Lite (`google.genai` ThinkingConfig), Telegram callbacks.

**Spec:** `docs/superpowers/specs/2026-07-06-roster-workflow-intent-design.md`

---

## File map

| File | Action |
| --- | --- |
| `app_ai/roster_intent.py` | **Create** — parser + switch resolver |
| `app_ai/tests/test_roster_intent.py` | **Create** — parser unit tests |
| `app_ai/tests/test_roster_switch.py` | **Create** — switch flow integration tests |
| `app_ai/tests/test_roster_pending_hygiene.py` | **Create** — clear-on-execute tests |
| `app_ai/confirmation.py` | **Modify** — `clear_all_roster_pending`, disambiguation clear on save |
| `app_ai/messages.py` | **Modify** — switch prompt templates |
| `app_ai/tests/test_messages.py` | **Modify** — switch template tests |
| `app_ai/interaction.py` | **Modify** — `switch_confirm` pending message |
| `app_ai/service.py` | **Modify** — wire router, inject write context |
| `app_ai/prompts.py` | **Modify** — trim platform prompt; `build_roster_write_context()` |
| `app_ai/tests/test_prompts.py` | **Create** — token/size guard tests |
| `app_ai/tools/assign_staff_to_course.py` | **Modify** — description verb lead |
| `app_ai/tools/remove_staff_from_course.py` | **Modify** — description verb lead |
| `app_ai/tools/enroll_student_in_course.py` | **Modify** — description verb lead |
| `app_ai/tools/remove_student_from_course.py` | **Modify** — description verb lead |
| `app_ai/client.py` | **Modify** — `thinking_level="low"` on write turns |
| `app_telegram/callbacks.py` | **Modify** — `clear_all_roster_pending` on success |
| `app_telegram/tests/test_callbacks.py` | **Modify** — assert disambiguation cleared |

---

### Task 1: Roster command parser

**Files:**
- Create: `app_ai/roster_intent.py`
- Create: `app_ai/tests/test_roster_intent.py`

- [ ] **Step 1: Write failing parser tests**

```python
# app_ai/tests/test_roster_intent.py
from django.test import SimpleTestCase
from unittest.mock import MagicMock

from app_ai.roster_intent import parse_roster_command, is_explicit_roster_command


class RosterCommandParserTests(SimpleTestCase):
    def setUp(self):
        self.user = MagicMock(id=42, name="Thiha Swan Htet")

    def test_remove_me_from_course(self):
        cmd = parse_roster_command("now, remove me from KET 152", user=self.user)
        self.assertIsNotNone(cmd)
        self.assertEqual(cmd.action, "remove_staff")
        self.assertEqual(cmd.user_id, 42)
        self.assertIn("KET 152", cmd.course_query or "")

    def test_remove_him_from_course(self):
        cmd = parse_roster_command("remove him from KET 152", user=self.user)
        self.assertIsNotNone(cmd)
        self.assertEqual(cmd.action, "remove_staff")
        self.assertIsNone(cmd.user_id)
        self.assertEqual(cmd.staff_query, "him")

    def test_assign_as_at(self):
        cmd = parse_roster_command("assign me as AT on KET 152 WE", user=self.user)
        self.assertIsNotNone(cmd)
        self.assertEqual(cmd.action, "assign_staff")
        self.assertEqual(cmd.role_hint, "AT")

    def test_read_query_returns_none(self):
        cmd = parse_roster_command("how many students in KET 152", user=self.user)
        self.assertIsNone(cmd)

    def test_remove_without_course_not_explicit(self):
        cmd = parse_roster_command("remove me", user=self.user)
        self.assertIsNotNone(cmd)
        self.assertFalse(is_explicit_roster_command(cmd, user=self.user, org=None))
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_ai.tests.test_roster_intent`

Expected: FAIL — `ModuleNotFoundError: app_ai.roster_intent`

- [ ] **Step 3: Implement parser**

```python
# app_ai/roster_intent.py
"""Deterministic roster command parsing for workflow routing."""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

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
    elif _REMOVE_RE.search(text) and "from" in text.lower():
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
            "me", "student", "staff", "teacher",
        }:
            staff_query = staff_match.group(2)

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

    has_person = cmd.user_id is not None or bool(cmd.staff_query or cmd.student_query)
    if not has_person and cmd.action in {"remove_staff", "assign_staff"}:
        if cmd.user_id is None and not cmd.staff_query:
            return False
    if not cmd.course_query and cmd.course_id is None:
        return False
    if cmd.course_id is not None:
        return has_person or cmd.user_id is not None
    resolved = resolve_accessible_course(user=user, course_id=None, query=cmd.course_query)
    return resolved.get("status") == "ok" and (
        cmd.user_id is not None or bool(cmd.staff_query or cmd.student_query)
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `./scripts/run_backend_tests.sh app_ai.tests.test_roster_intent`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app_ai/roster_intent.py app_ai/tests/test_roster_intent.py
git commit -m "feat(ai): add deterministic roster command parser"
```

---

### Task 2: Pending hygiene helpers

**Files:**
- Modify: `app_ai/confirmation.py`
- Create: `app_ai/tests/test_roster_pending_hygiene.py`

- [ ] **Step 1: Write failing hygiene test**

```python
# app_ai/tests/test_roster_pending_hygiene.py (excerpt)
from app_ai.confirmation import clear_all_roster_pending, save_write_confirmation
from app_ai.disambiguation import get_active_pending, save_pending

def test_save_write_confirmation_clears_disambiguation(self):
    save_pending(
        user=self.admin,
        channel_key="telegram:99",
        tool_name="assign_staff_to_course",
        pending_field="course_role",
        partial_args={"course_id": self.course.id},
        candidates=[{"key": "A", "id": 1, "name": "AT"}],
    )
    save_write_confirmation(
        user=self.admin,
        channel_key="telegram:99",
        tool_name="assign_staff_to_course",
        action="assign_staff",
        execution_payload={"course_id": self.course.id, "staff_id": self.admin.id},
        summary="Assign?",
        preview={},
    )
    self.assertIsNone(get_active_pending(user=self.admin, channel_key="telegram:99"))

def test_clear_all_clears_both_stores(self):
    # save both pending types, call clear_all_roster_pending, assert both None
    ...
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `./scripts/run_backend_tests.sh app_ai.tests.test_roster_pending_hygiene`

- [ ] **Step 3: Implement in confirmation.py**

```python
def clear_all_roster_pending(*, user, channel_key: str) -> None:
    from app_ai.disambiguation import clear_pending

    clear_write_confirmation(user=user, channel_key=channel_key)
    clear_pending(user=user, channel_key=channel_key)


def save_write_confirmation(...):
    ...
    if channel_key:
        from app_ai.disambiguation import clear_pending
        clear_pending(user=user, channel_key=channel_key)
    row, _ = AIPendingWriteConfirmation.objects.update_or_create(...)
```

Also call `clear_all_roster_pending` at end of successful
`try_resolve_pending_confirmation` execute path and in
`execute_pending_write_confirmation` callers (see Task 7).

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

---

### Task 3: Switch message templates

**Files:**
- Modify: `app_ai/messages.py`
- Modify: `app_ai/tests/test_messages.py`
- Modify: `app_ai/interaction.py`

- [ ] **Step 1: Write failing tests**

```python
def test_switch_prompt(self):
    text = build_switch_prompt(
        prior_summary="assign you as AT on KET 152 WE",
        new_summary="remove you from KET 152 WE",
        tone="default",
    )
    self.assertIn("Cancel", text)
    self.assertIn("remove you from KET 152 WE", text)
    self.assertIn("yes", text.lower())
```

- [ ] **Step 2: Implement builders**

```python
def build_switch_prompt(*, prior_summary: str, new_summary: str, tone: ToneKey) -> str:
    question = (
        f"You have a pending change: {prior_summary}. "
        f"Cancel it and {new_summary} instead?"
    )
    footer = "Reply yes to switch or no to continue the pending change."
    return f"{question}\n\n{footer}"


def build_switch_declined(*, prior_reminder: str, tone: ToneKey) -> str:
    return f"OK — continuing with the pending change.\n\n{prior_reminder}"
```

- [ ] **Step 3: Handle `switch_confirm` in interaction.py**

```python
if row.pending_field == "switch_confirm":
    partial = row.partial_args or {}
    return build_switch_prompt(
        prior_summary=partial.get("prior_summary", "the pending roster change"),
        new_summary=partial.get("new_summary", "proceed with your new request"),
        tone=tone,
    )
```

- [ ] **Step 4: Run `./scripts/run_backend_tests.sh app_ai.tests.test_messages`**

- [ ] **Step 5: Commit**

---

### Task 4: Switch resolver

**Files:**
- Modify: `app_ai/roster_intent.py`
- Create: `app_ai/tests/test_roster_switch.py`

- [ ] **Step 1: Write failing integration test (assign role pending → remove → switch)**

Use existing test DB patterns from `app_ai/tests/test_confirmation.py`.
Scenario:

1. `save_pending` course_role for assign on KET 152 WE.
2. `try_resolve_roster_switch(prompt="remove me from KET 152", ...)` returns
   reminder containing "Cancel".
3. `try_resolve_roster_switch(prompt="yes", ...)` with switch row saved →
   `executed=True`, payload status ok (mock execute path).

- [ ] **Step 2: Implement `try_resolve_roster_switch`**

Key logic:

```python
def try_resolve_roster_switch(*, prompt, user, channel_key, org) -> PendingTurnResult | None:
    row = get_active_pending(user=user, channel_key=channel_key)
    if row and row.pending_field == "switch_confirm":
        return _resolve_switch_confirm(prompt, user, channel_key, org, row)

    cmd = parse_roster_command(prompt, user=user)
    if cmd is None:
        return None

    disambig = get_active_pending(user=user, channel_key=channel_key)
    write = get_active_write_confirmation(user=user, channel_key=channel_key)
    if disambig is None and write is None:
        return None

    if not _conflicts_with_pending(cmd, disambig=disambig, write=write):
        return None

    if is_explicit_roster_command(cmd, user=user, org=org):
        new_summary = _human_summary(cmd, user=user, org=org)
        prior_summary = _prior_summary(disambig=disambig, write=write)
        save_pending(
            pending_field="switch_confirm",
            partial_args={
                "new_tool_name": _tool_for_action(cmd.action),
                "new_args": _args_for_command(cmd),
                "new_summary": new_summary,
                "prior_summary": prior_summary,
                "prior_pending_kind": "disambiguation" if disambig else "write_confirm",
            },
            ...
        )
        return PendingTurnResult(reminder=build_switch_prompt(...))

    return None  # vague conflicting message falls through to existing pending reminder
```

Implement `_execute_explicit_roster_command` calling registry tool then
auto-confirming if `pending_confirmation`:

```python
def _execute_explicit_roster_command(...):
    clear_all_roster_pending(user=user, channel_key=channel_key)
    tool = get_tool(tool_name)
    result = tool.run(args, user, channel_key=channel_key, org=org)
    if result.get("status") == "pending_confirmation":
        pending = get_active_write_confirmation(user=user, channel_key=channel_key)
        if pending:
            result = execute_pending_write_confirmation(
                pending=pending, actor=user, tenant=org,
                source=infer_action_source(channel_key),
            )
            clear_all_roster_pending(user=user, channel_key=channel_key)
    return result
```

- [ ] **Step 3: Run `./scripts/run_backend_tests.sh app_ai.tests.test_roster_switch`**

- [ ] **Step 4: Commit**

---

### Task 5: Wire router in AIService

**Files:**
- Modify: `app_ai/service.py`

- [ ] **Step 1: Write failing service test**

Extend `app_ai/tests/test_disambiguation_fastpath.py`:

```python
@patch("app_ai.service.try_resolve_roster_switch")
def test_switch_turn_uses_fast_path(self, mock_switch):
    mock_switch.return_value = PendingTurnResult(
        reminder="Cancel pending assign and remove you instead? Reply yes or no."
    )
    # assert generate_with_tools called with tools=[]
```

- [ ] **Step 2: Insert before confirmation pre-flight**

```python
from app_ai.roster_intent import try_resolve_roster_switch

if tenant is not None and channel_key:
    switch_turn = try_resolve_roster_switch(
        prompt=prompt, user=user, channel_key=channel_key, org=tenant,
    )
    if switch_turn is not None:
        # mirror confirm_turn / pending_turn handling
        ...
```

- [ ] **Step 3: Inject write context after intent classification**

```python
from app_ai.prompts import build_roster_write_context

if intent == TurnIntent.WRITE and not disambiguation_fast_path:
    dynamic_context = _append_dynamic_block(
        dynamic_context, build_roster_write_context()
    )
```

- [ ] **Step 4: Run `./scripts/run_backend_tests.sh app_ai.tests.test_disambiguation_fastpath`**

- [ ] **Step 5: Commit**

---

### Task 6: Prompt diet + tool descriptions

**Files:**
- Modify: `app_ai/prompts.py`
- Create: `app_ai/tests/test_prompts.py`
- Modify: four roster write tool files

- [ ] **Step 1: Write failing prompt size test**

```python
def test_roster_write_context_under_400_tokens(self):
    text = build_roster_write_context()
    self.assertLess(len(text.split()), 400)

def test_platform_prompt_has_no_duplicate_roster_blocks(self):
    text = build_platform_base_prompt(org=MagicMock(name="School"))
    self.assertEqual(text.count("Never claim roster membership changed"), 1)
```

- [ ] **Step 2: Move roster bullets to `build_roster_write_context()`; remove duplicates from `PLATFORM_BASE_TEMPLATE`**

Keep only one line in platform prompt: *"Roster writes: see session context on write turns."*

- [ ] **Step 3: Update tool descriptions** — lead with verb mapping per spec §5.3.

- [ ] **Step 4: Run `./scripts/run_backend_tests.sh app_ai.tests.test_prompts`**

- [ ] **Step 5: Commit**

---

### Task 7: Thinking level + Telegram callback hygiene

**Files:**
- Modify: `app_ai/client.py`
- Modify: `app_telegram/callbacks.py`
- Modify: `app_telegram/tests/test_callbacks.py`

- [ ] **Step 1: Pass `turn_intent` into `_build_generate_config`**

```python
def _build_generate_config(..., turn_intent: TurnIntent | None = None):
    level = "low" if turn_intent == TurnIntent.WRITE else None
    kwargs = {"include_thoughts": True}
    if level:
        kwargs["thinking_level"] = level
    thinking_config = types_module.ThinkingConfig(**kwargs)
```

- [ ] **Step 2: Replace `clear_write_confirmation` with `clear_all_roster_pending` in callbacks.py on success/cancel/expired**

- [ ] **Step 3: Extend test_callbacks.py**

After confirm success, assert `get_active_pending(...)` is None when disambiguation
was seeded before confirm.

- [ ] **Step 4: Run `./scripts/run_backend_tests.sh app_telegram.tests.test_callbacks app_ai.tests.test_roster_pending_hygiene`**

- [ ] **Step 5: Commit**

---

### Task 8: Regression test (assign → remove)

**Files:**
- Modify: `app_telegram/tests/test_ai_query.py`

- [ ] **Step 1: Add test mirroring screenshot flow**

Mock `AIService.run` sequence:

1. First call completes assign (pending cleared).
2. Second prompt `"now, remove me from KET 152"` must not return role-required template.

Assert `resolve_interaction_message` output contains "Remove" or switch prompt,
not "Which role".

- [ ] **Step 2: Run `./scripts/run_backend_tests.sh app_telegram.tests.test_ai_query`**

- [ ] **Step 3: Commit**

---

### Task 9: Full suite

- [ ] **Run full targeted suite**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh \
  app_ai.tests.test_roster_intent \
  app_ai.tests.test_roster_switch \
  app_ai.tests.test_roster_pending_hygiene \
  app_ai.tests.test_prompts \
  app_ai.tests.test_messages \
  app_ai.tests.test_confirmation \
  app_ai.tests.test_disambiguation \
  app_telegram.tests.test_callbacks \
  app_telegram.tests.test_ai_query
```

Expected: all PASS

- [ ] **Final commit if any fixups**

```bash
git commit -m "test(ai): roster workflow intent routing regression coverage"
```

---

## Plan self-review (spec coverage)

| Spec § | Task |
| --- | --- |
| §4.1 roster_intent module | Task 1, 4 |
| §4.2 switch_confirm pending | Task 4 |
| §4.3 pending hygiene | Task 2, 7 |
| §4.4 explicit definition | Task 1, 4 |
| §4.5 explicit fast-path execute | Task 4 |
| §5 prompt strategy | Task 6 |
| §5.4 thinking level | Task 7 |
| §6 message templates | Task 3 |
| §8 service integration | Task 5 |
| §10 testing | Tasks 1–9 |
| §13 success criteria | Task 8, 9 |

No placeholder steps. All file paths are explicit.
