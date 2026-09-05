# AI Roster Write Tools — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four AI roster write tools (enroll/remove student, assign/remove staff) with mandatory confirmation, RBAC, Telegram inline Confirm/Cancel, and auditable `CourseMembershipEvent.source`.

**Architecture:** Tools validate + resolve entities, return `pending_confirmation`, and store `AIPendingWriteConfirmation`. Telegram callbacks (or future web confirm) call `app_course.roster_writes` — shared execution mirroring HTTP views. Disambiguation (`AIDisambiguationPending`) runs before confirmation.

**Tech Stack:** Django, django-tenant-schemas, RBAC (`app_rbac`), Gemini (`app_ai.client`), Telegram Bot API (`app_telegram.client`).

**Spec:** `docs/superpowers/specs/2026-07-01-ai-roster-write-tools-design.md`

**Repo:** `schedjuice-reimagined-be` only

---

## File map

| File | Responsibility |
| --- | --- |
| `app_course/models.py` | `CourseMembershipEvent.Source` choices |
| `app_course/migrations/010N_*.py` | Add `source` column |
| `app_course/membership_history.py` | Accept `source=` on record helpers |
| `app_course/roster_writes.py` | `execute_enroll_student`, `execute_remove_student`, `execute_assign_staff`, `execute_remove_staff`, `event_weekday`, `filter_events_for_weekdays` |
| `app_course/views.py` | Pass `source="api"` on existing `record_membership_event*` calls |
| `app_ai/tools/course_rbac.py` | `require_course_manage_members`, `require_course_write_access` |
| `app_ai/tools/resolve.py` | `resolve_course_role`, extend disambiguation for `course_role` field |
| `app_ai/tools/roster_common.py` | Shared preview builder, `infer_action_source(channel_key)`, `save_roster_confirmation` |
| `app_ai/tools/enroll_student_in_course.py` | Write tool |
| `app_ai/tools/remove_student_from_course.py` | Write tool |
| `app_ai/tools/assign_staff_to_course.py` | Write tool |
| `app_ai/tools/remove_staff_from_course.py` | Write tool |
| `app_ai/confirmation.py` | Pending write CRUD, `try_resolve_pending_confirmation`, `execute_pending_roster_write` |
| `app_telegram/models.py` | `AIPendingWriteConfirmation` |
| `app_telegram/migrations/000N_*.py` | Pending confirmation table |
| `app_ai/tools/intent.py` | Roster write heuristics |
| `app_ai/tools/registry.py` | Register four tools |
| `app_ai/prompts.py` | Roster write instructions |
| `app_ai/service.py` | Pre-flight confirmation before disambiguation fast-path |
| `app_ai/disambiguation.py` | After disambiguation resolves, allow tool to return `pending_confirmation` without clearing incorrectly |
| `app_telegram/client.py` | `reply_markup`, `answer_callback_query` |
| `app_telegram/config.py` | Add `callback_query` to `WEBHOOK_ALLOWED_UPDATES` |
| `app_telegram/webhook.py` | Dispatch `callback_query` |
| `app_telegram/callbacks.py` | `handle_callback_query` |
| `app_telegram/tasks.py` | Send inline confirm after `pending_confirmation` |
| `app_ai/links.py` | `course_member_edit_url(org, course_id)` |
| Tests | See task sections |

---

## Conventions

- **Tests:** `@unittest.skipUnless(_database_reachable())`, `@override_settings(RBAC_ENFORCE="log_only")`
- **Schema:** `schema_name = "xschedjuice"`, `migrate_schemas` + `load-data` in `setUpTestData`
- **Run backend tests:** `./scripts/run_backend_tests.sh <target>` (always `--keepdb --noinput`)
- **Commits:** Do not commit unless the user asks (repo rule)
- **Branch:** Work on current branch (`dev`); no feature branches
- **Web confirm:** Stub only — `web_roster_confirm_enabled = False` in `app_ai/confirmation.py`; web channel stores pending but does not execute until flag enabled

**Decisions locked for v1 (from spec open items):**

- Telegram confirm message **supplements** model reply (bot sends separate message with buttons; model may also summarize)
- Webhook rollout: document in PR — run `telegram-set-webhooks` per tenant after deploy

---

## Task 1: `CourseMembershipEvent.source`

**Files:**
- Modify: `app_course/models.py`
- Create: `app_course/migrations/0103_coursemembershipevent_source.py`
- Modify: `app_course/membership_history.py`
- Test: `app_course/tests/test_membership_history.py`

- [ ] **Step 1: Write failing test**

Add to `app_course/tests/test_membership_history.py`:

```python
def test_record_membership_event_persists_source(self):
    with schema_context(self.schema_name):
        event = record_membership_event(
            course_id=self.course.id,
            user_id=self.student.id,
            event_type=CourseMembershipEvent.EventType.JOINED,
            actor_id=self.admin.id,
            source=CourseMembershipEvent.Source.TELEGRAM_BOT,
        )
        event.refresh_from_db()
        self.assertEqual(event.source, CourseMembershipEvent.Source.TELEGRAM_BOT)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/run_backend_tests.sh app_course.tests.test_membership_history.MembershipHistoryTests.test_record_membership_event_persists_source`

Expected: FAIL — unexpected keyword `source`

- [ ] **Step 3: Add model field**

In `CourseMembershipEvent`:

```python
class Source(models.TextChoices):
    API = "api", "api"
    WEB_AI = "web_ai", "web_ai"
    TELEGRAM_BOT = "telegram_bot", "telegram_bot"
    IMPORT = "import", "import"

source = models.CharField(
    max_length=32,
    choices=Source.choices,
    null=True,
    blank=True,
)
```

Generate migration `0103_coursemembershipevent_source.py`.

- [ ] **Step 4: Update membership_history helpers**

```python
@dataclass(frozen=True)
class MembershipEventInput:
    course_id: int
    user_id: int
    event_type: str
    actor_id: int | None = None
    occurred_at: datetime | None = None
    source: str | None = None


def record_membership_event(
    *,
    course_id: int,
    user_id: int,
    event_type: str,
    actor_id: int | None = None,
    occurred_at: datetime | None = None,
    source: str | None = None,
) -> CourseMembershipEvent:
    return CourseMembershipEvent.objects.create(
        course_id=course_id,
        user_id=user_id,
        event_type=event_type,
        actor_id=actor_id,
        occurred_at=occurred_at or timezone.now(),
        source=source,
    )
```

Mirror `source` in `record_membership_events_bulk`.

- [ ] **Step 5: Run test to verify it passes**

Run: `./scripts/run_backend_tests.sh app_course.tests.test_membership_history`

Expected: PASS

---

## Task 2: HTTP call sites pass `source="api"`

**Files:**
- Modify: `app_course/views.py`
- Modify: `app_auth/import_commit.py`
- Modify: `app_course/serializers.py` (if inline `record_membership_event` exists)

- [ ] **Step 1: Grep and update all `record_membership_event` / `MembershipEventInput` call sites**

Run: `rg 'record_membership_event|MembershipEventInput' app_course app_auth -n`

For each call in HTTP/import paths, add `source=CourseMembershipEvent.Source.API` (or `"api"` string matching model choices).

Example in `CourseStudentListCreateView.post`:

```python
record_membership_event(
    course_id=course.id,
    user_id=user.id,
    event_type=models.CourseMembershipEvent.EventType.JOINED,
    actor_id=actor.id,
    source=models.CourseMembershipEvent.Source.API,
)
```

Bulk paths use `MembershipEventInput(..., source=models.CourseMembershipEvent.Source.API)`.

- [ ] **Step 2: Run membership history tests**

Run: `./scripts/run_backend_tests.sh app_course.tests.test_membership_history`

Expected: PASS

---

## Task 3: Weekday helpers + event filtering

**Files:**
- Create: `app_course/roster_event_weekdays.py`
- Test: `app_course/tests/test_roster_event_weekdays.py`

- [ ] **Step 1: Write failing tests**

Create `app_course/tests/test_roster_event_weekdays.py`:

```python
import unittest
from datetime import datetime
from zoneinfo import ZoneInfo

from django.test import SimpleTestCase

from app_course.roster_event_weekdays import event_weekday, filter_events_for_weekdays


class RosterEventWeekdayTests(SimpleTestCase):
    def test_event_weekday_uses_org_timezone(self):
        # 2026-07-06 17:00 UTC is Monday evening in Asia/Rangoon (Mon=1)
        event_date = datetime(2026, 7, 6, 17, 0, tzinfo=ZoneInfo("UTC"))
        self.assertEqual(event_weekday(event_date, "Asia/Rangoon"), 1)

    def test_filter_events_for_weekdays(self):
        mon = datetime(2026, 7, 6, 9, 0, tzinfo=ZoneInfo("UTC"))
        tue = datetime(2026, 7, 7, 9, 0, tzinfo=ZoneInfo("UTC"))
        events = [{"id": 1, "date": mon}, {"id": 2, "date": tue}]
        filtered = filter_events_for_weekdays(events, weekdays=[1], tz_name="UTC")
        self.assertEqual([e["id"] for e in filtered], [1])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/run_backend_tests.sh app_course.tests.test_roster_event_weekdays`

Expected: FAIL — module not found

- [ ] **Step 3: Implement helpers**

Create `app_course/roster_event_weekdays.py`:

```python
from __future__ import annotations

from datetime import datetime
from typing import Iterable
from zoneinfo import ZoneInfo


def event_weekday(event_date: datetime, tz_name: str) -> int:
    """Return 0=Sunday … 6=Saturday in org timezone (JS Date.getDay)."""
    tz = ZoneInfo(tz_name or "UTC")
    if event_date.tzinfo is None:
        local = event_date.replace(tzinfo=tz)
    else:
        local = event_date.astimezone(tz)
    # Python weekday(): Mon=0 … Sun=6 → convert to JS: Sun=0 … Sat=6
    py = local.weekday()
    return (py + 1) % 7


def filter_events_for_weekdays(
    events: Iterable,
    *,
    weekdays: list[int] | None,
    tz_name: str,
) -> list:
    items = list(events)
    if not weekdays:
        return items
    allowed = set(int(d) for d in weekdays)
    out = []
    for event in items:
        dt = event.date if hasattr(event, "date") else event["date"]
        if event_weekday(dt, tz_name) in allowed:
            out.append(event)
    return out


WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]


def format_weekday_labels(weekdays: list[int] | None) -> list[str]:
    if not weekdays:
        return ["All sessions"]
    return [WEEKDAY_LABELS[int(d)] for d in sorted(set(weekdays))]
```

- [ ] **Step 4: Run tests**

Run: `./scripts/run_backend_tests.sh app_course.tests.test_roster_event_weekdays`

Expected: PASS

---

## Task 4: Shared roster execution service

**Files:**
- Create: `app_course/roster_writes.py`
- Test: `app_course/tests/test_roster_writes.py`

- [ ] **Step 1: Write failing enroll test skeleton**

Create `app_course/tests/test_roster_writes.py` with DB setup matching `app_ai/tests/test_get_course_roster.py` patterns (admin with `course.manage_members`, course, student user, `seed_rbac`).

```python
def test_execute_enroll_student_creates_user_course_and_event(self):
    with schema_context(self.schema_name):
        result = execute_enroll_student(
            actor=self.admin,
            course=self.course,
            student=self.student,
            source=CourseMembershipEvent.Source.TELEGRAM_BOT,
        )
    self.assertEqual(result["status"], "ok")
    with schema_context(self.schema_name):
        self.assertTrue(
            UserCourse.objects.filter(
                user_id=self.student.id,
                course_id=self.course.id,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            ).exists()
        )
        event = CourseMembershipEvent.objects.filter(
            course_id=self.course.id,
            user_id=self.student.id,
            event_type=CourseMembershipEvent.EventType.JOINED,
        ).latest("id")
        self.assertEqual(event.source, CourseMembershipEvent.Source.TELEGRAM_BOT)
```

Add parallel tests for: `already enrolled` (second call returns error), `execute_remove_student`, `execute_assign_staff` (all sessions), `execute_assign_staff` (weekdays), `already_assigned`, `execute_remove_staff`.

- [ ] **Step 2: Run tests — verify FAIL**

Run: `./scripts/run_backend_tests.sh app_course.tests.test_roster_writes`

- [ ] **Step 3: Implement `roster_writes.py`**

Key structure:

```python
from __future__ import annotations

from django.db import transaction
from rest_framework.exceptions import PermissionDenied

from app_attendance.models import UserEvent
from app_attendance.serializers import UserEventSerializer
from app_course.course_scoping import check_course_write, check_teacher_event_assignment
from app_course.membership_history import record_membership_event
from app_course.models import Course, CourseMembershipEvent, Event, UserCourse, AssignedAsRole
from app_course.roster_event_weekdays import filter_events_for_weekdays
from app_auth.models import User


def execute_enroll_student(*, actor, course, student, source: str) -> dict:
    check_course_write(actor, course)
    if not student.is_student():
        return {"error": "validation_error", "message": "User is not a student."}
    if UserCourse.objects.filter(user_id=student.id, course_id=course.id).exists():
        return {"error": "already_enrolled", "message": "Student is already enrolled."}
    # MS Teams pre-checks: copy guard block from CourseStudentListCreateView.post
    with transaction.atomic():
        student.is_waiting_for_activation = False
        student.save(update_fields=["is_waiting_for_activation"])
        user_course, created = UserCourse.objects.get_or_create(
            user_id=student.id,
            course_id=course.id,
            defaults={"assigned_as": UserCourse.AssignedAs.STUDENT},
        )
        if created:
            record_membership_event(
                course_id=course.id,
                user_id=student.id,
                event_type=CourseMembershipEvent.EventType.JOINED,
                actor_id=actor.id,
                source=source,
            )
    refresh_course_member_counts_now([course.id])
    return {"status": "ok", "action": "enroll_student", ...}


def execute_remove_student(*, actor, course, student, source: str) -> dict:
    # Mirror CourseStudentRemoveView.delete
    ...


def execute_assign_staff(
    *,
    actor,
    course,
    staff,
    assigned_as_role: AssignedAsRole,
    weekdays: list[int] | None,
    source: str,
    tenant,
) -> dict:
    check_teacher_event_assignment(actor, staff.id, course)
    if UserCourse.objects.filter(user_id=staff.id, course_id=course.id).exists():
        return {"error": "already_assigned", "message": "Staff member is already on this course."}
    events = list(Event.objects.filter(course_id=course.id))
    events = filter_events_for_weekdays(events, weekdays=weekdays, tz_name=tenant.timezone)
    if not events:
        return {"error": "validation_error", "message": "No course sessions match the requested weekdays."}
    # Mirror TeacherAssignView.post body for UserCourse create + UserEvent bulk create
    ...


def execute_remove_staff(*, actor, course, staff, source: str, tenant) -> dict:
    # Mirror UserCourseManagementView delete path for teachers
    ...


def execute_roster_action(*, action: str, actor, tenant, payload: dict, source: str) -> dict:
    dispatch = {
        "enroll_student": execute_enroll_student,
        "remove_student": execute_remove_student,
        "assign_staff": execute_assign_staff,
        "remove_staff": execute_remove_staff,
    }
    fn = dispatch[action]
    return fn(actor=actor, tenant=tenant, source=source, **payload)
```

Copy MS Teams guard blocks verbatim from `CourseStudentListCreateView` and `TeacherAssignView` — do not weaken checks.

- [ ] **Step 4: Run tests until PASS**

Run: `./scripts/run_backend_tests.sh app_course.tests.test_roster_writes`

---

## Task 5: `resolve_course_role`

**Files:**
- Modify: `app_ai/tools/resolve.py`
- Test: `app_ai/tests/test_resolve_course_role.py`

- [ ] **Step 1: Write failing tests**

```python
def test_mt_single_role(self):
    with schema_context(self.schema_name):
        result = resolve_course_role(role_seniority="MT")
    self.assertEqual(result["status"], "ok")
    self.assertEqual(result["role"].seniority, AssignedAsRole.Seniority.MAIN_TEACHER)

def test_at_multiple_roles_ambiguous(self):
    # create two AT roles
    with schema_context(self.schema_name):
        result = resolve_course_role(role_seniority="AT")
    self.assertEqual(result["status"], "ambiguous")
    self.assertEqual(result["candidates"][0]["key"], "A")
```

- [ ] **Step 2: Implement `resolve_course_role`**

```python
def resolve_course_role(
    *,
    role_seniority: str | None = None,
    course_role_query: str | None = None,
    course_role_id: int | None = None,
    limit: int = 5,
) -> dict[str, Any]:
    from app_course.models import AssignedAsRole

    if course_role_id is not None:
        role = AssignedAsRole.objects.filter(id=course_role_id).first()
        if role is None:
            return {"status": "not_found", "message": "Course role not found."}
        return {"status": "ok", "role": role}

    seniority = None
    if role_seniority:
        key = role_seniority.strip().upper()
        if key in {"MT", "MAIN_TEACHER", "MAIN TEACHER"}:
            seniority = AssignedAsRole.Seniority.MAIN_TEACHER
        elif key in {"AT", "ASSISTANT_TEACHER", "ASSISTANT TEACHER"}:
            seniority = AssignedAsRole.Seniority.ASSISTANT_TEACHER

    qs = AssignedAsRole.objects.all()
    if seniority:
        qs = qs.filter(seniority=seniority)
    elif course_role_query:
        qs = qs.filter(name__icontains=course_role_query.strip())
    else:
        return {
            "status": "validation_error",
            "message": "Provide role_seniority (MT/AT) or course_role_query.",
        }

    matches = list(qs.order_by("id")[: limit + 1])
    if not matches:
        return {"status": "not_found", "message": "No matching course role."}
    if len(matches) > 1:
        return _ambiguous_payload(
            message="Multiple course roles match.",
            query=course_role_query or role_seniority or "",
            candidates=[{"id": r.id, "name": r.name, "seniority": r.seniority} for r in matches[:limit]],
        )
    return {"status": "ok", "role": matches[0]}
```

- [ ] **Step 3: Run tests**

Run: `./scripts/run_backend_tests.sh app_ai.tests.test_resolve_course_role`

Expected: PASS

---

## Task 6: `AIPendingWriteConfirmation` + `confirmation.py`

**Files:**
- Modify: `app_telegram/models.py`
- Create: `app_telegram/migrations/000N_aidpendingwriteconfirmation.py`
- Create: `app_ai/confirmation.py`
- Test: `app_ai/tests/test_confirmation.py`

- [ ] **Step 1: Write failing test**

```python
def test_save_and_execute_pending_enroll(self):
    with schema_context(self.schema_name):
        row = save_write_confirmation(
            user=self.admin,
            channel_key="telegram:42",
            tool_name="enroll_student_in_course",
            action="enroll_student",
            execution_payload={
                "course_id": self.course.id,
                "student_id": self.student.id,
            },
            summary="Enroll James in PET 151?",
            preview={"course": {"id": self.course.id}, "student": {"id": self.student.id}},
        )
        result = execute_pending_write_confirmation(
            pending=row,
            actor=self.admin,
            tenant=self.org,
            source=CourseMembershipEvent.Source.TELEGRAM_BOT,
        )
    self.assertEqual(result["status"], "ok")
```

- [ ] **Step 2: Add model**

```python
class AIPendingWriteConfirmation(BaseModel):
    user = models.ForeignKey("app_auth.User", on_delete=models.CASCADE)
    channel_key = models.CharField(max_length=128, db_index=True)
    tool_name = models.CharField(max_length=64)
    action = models.CharField(max_length=32)
    execution_payload = models.JSONField(default=dict)
    summary = models.TextField()
    preview = models.JSONField(default=dict)
    telegram_chat_id = models.BigIntegerField(null=True, blank=True)
    telegram_message_id = models.BigIntegerField(null=True, blank=True)
    expires_at = models.DateTimeField()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "channel_key"],
                name="uniq_ai_write_confirm_user_channel",
            ),
        ]
```

- [ ] **Step 3: Implement `app_ai/confirmation.py`**

```python
WEB_ROSTER_CONFIRM_ENABLED = False
DEFAULT_TTL = timedelta(minutes=10)

def infer_action_source(channel_key: str) -> str:
    if channel_key.startswith("telegram:"):
        return CourseMembershipEvent.Source.TELEGRAM_BOT
    return CourseMembershipEvent.Source.WEB_AI

def save_write_confirmation(...)-> AIPendingWriteConfirmation:
    ...

def get_active_write_confirmation(*, user, channel_key: str) -> AIPendingWriteConfirmation | None:
    ...

def clear_write_confirmation(*, user, channel_key: str) -> None:
    ...

def execute_pending_write_confirmation(*, pending, actor, tenant, source: str) -> dict:
    from app_course.roster_writes import execute_roster_action
    return execute_roster_action(
        action=pending.action,
        actor=actor,
        tenant=tenant,
        payload=pending.execution_payload,
        source=source,
    )

def try_resolve_pending_confirmation(*, prompt: str, user, channel_key: str, org) -> PendingTurnResult | None:
    row = get_active_write_confirmation(user=user, channel_key=channel_key)
    if row is None:
        return None
    if channel_key.startswith("web:"):
        if not WEB_ROSTER_CONFIRM_ENABLED:
            return PendingTurnResult(
                reminder="Roster change awaiting confirmation. Web confirm is not enabled yet; use Telegram or the member edit page.",
            )
        # When enabled: parse confirm/cancel — implement in follow-up
    return None  # Telegram uses callback_query, not text
```

- [ ] **Step 4: Run tests**

Run: `./scripts/run_backend_tests.sh app_ai.tests.test_confirmation`

---

## Task 7: Course RBAC helper for tools

**Files:**
- Create: `app_ai/tools/course_rbac.py`

- [ ] **Step 1: Implement helpers**

```python
from app_rbac.resolution import effective_permissions
from app_course.course_scoping import check_course_write


def require_course_manage_members(user) -> dict | None:
    if "course.manage_members" not in set(effective_permissions(user)):
        return {"error": "permission_denied", "message": "Requires course.manage_members."}
    return None


def require_course_write_access(user, course) -> dict | None:
    denied = require_course_manage_members(user)
    if denied:
        return denied
    try:
        check_course_write(user, course)
    except PermissionDenied:
        return {"error": "permission_denied", "message": "You do not have access to this course."}
    return None
```

---

## Task 8: `enroll_student_in_course` tool

**Files:**
- Create: `app_ai/tools/enroll_student_in_course.py`
- Test: `app_ai/tests/test_enroll_student_in_course.py`

- [ ] **Step 1: Write failing test — returns pending, no DB change**

```python
def test_returns_pending_confirmation_without_mutation(self):
    with schema_context(self.schema_name):
        before = UserCourse.objects.filter(course_id=self.course.id).count()
        result = run_enroll_student_in_course(
            {"course_id": self.course.id, "student_query": self.student.name},
            self.admin,
            channel_key="telegram:1",
            org=self.org,
        )
        after = UserCourse.objects.filter(course_id=self.course.id).count()
    self.assertEqual(result["status"], "pending_confirmation")
    self.assertEqual(before, after)
```

- [ ] **Step 2: Implement tool**

Pattern: validate RBAC → resolve course + student → check `already_enrolled` → build summary → `save_write_confirmation` → return `pending_confirmation`.

Register in `registry.py` with `exposure="write"`.

- [ ] **Step 3: Run tests**

Run: `./scripts/run_backend_tests.sh app_ai.tests.test_enroll_student_in_course`

---

## Task 9: `remove_student_from_course` tool

**Files:**
- Create: `app_ai/tools/remove_student_from_course.py`
- Test: `app_ai/tests/test_remove_student_from_course.py`

Same pattern as Task 8. Guard: `not_enrolled` if no student `UserCourse`.

---

## Task 10: `assign_staff_to_course` tool

**Files:**
- Create: `app_ai/tools/assign_staff_to_course.py`
- Test: `app_ai/tests/test_assign_staff_to_course.py`

- [ ] **Key tests**

| Test | Expected |
| --- | --- |
| MT role, all sessions | `pending_confirmation`, `session_count` > 0 |
| weekdays `[1,3]` | preview lists Mon, Wed |
| `specific_event_ids=[1]` | `adhoc_not_supported` + `member_edit_url` |
| staff already on course | `already_assigned` |
| ambiguous AT role | `ambiguous_course_role` + pending disambiguation (extend disambiguation for `course_role` field) |

- [ ] **Extend disambiguation for `course_role`**

In `app_ai/disambiguation.py` `try_resolve_pending_turn`, add branch:

```python
elif row.pending_field == "course_role":
    args["course_role_id"] = picked_id
    args.pop("course_role_query", None)
    args.pop("role_seniority", None)
```

---

## Task 11: `remove_staff_from_course` tool

**Files:**
- Create: `app_ai/tools/remove_staff_from_course.py`
- Test: `app_ai/tests/test_remove_staff_from_course.py`

Mirror remove student; filter `assigned_as=TEACHER`; error `not_on_roster`.

---

## Task 12: Intent router + prompts + registry counts

**Files:**
- Modify: `app_ai/tools/intent.py`
- Modify: `app_ai/prompts.py`
- Modify: `app_ai/tests/test_tool_intent.py`
- Modify: `app_ai/tests/test_tool_registry.py`

- [ ] **Step 1: Extend `_WRITE_PATTERN`**

```python
_WRITE_PATTERN = re.compile(
    r"\b("
    r"award|deduct|give|remove|add|subtract|grant|take away"
    r")\b.*\b(points?|merit|demerit)\b|"
    r"\b(points?|merit)\b.*\b(award|deduct|give|remove|add)\b|"
    r"\b(enroll|unenroll|add student|remove student|assign teacher|add teacher|"
    r"remove teacher|assign staff|remove staff)\b",
    re.IGNORECASE,
)
```

- [ ] **Step 2: Add prompt block** (from spec §10.2)

- [ ] **Step 3: Update registry test** — write turn exposes 5 write tools (points + 4 roster)

Run: `./scripts/run_backend_tests.sh app_ai.tests.test_tool_intent app_ai.tests.test_tool_registry`

---

## Task 13: `AIService` pre-flight for write confirmation

**Files:**
- Modify: `app_ai/service.py`
- Test: `app_ai/tests/test_confirmation_service.py`

- [ ] **Step 1: Before disambiguation check, call `try_resolve_pending_confirmation`**

Order in `AIService.run()`:

1. `try_resolve_pending_confirmation` (web stub reminder / future execute)
2. `try_resolve_pending_turn` (disambiguation)
3. Normal Gemini flow

When any roster tool returns `pending_confirmation` during tool loop, persist is already done inside tool — `run_ai_query` must detect this in result metadata.

Also: if active write confirmation exists and user sends unrelated message, inject reminder context (like disambiguation).

---

## Task 14: Telegram client + inline keyboard delivery

**Files:**
- Modify: `app_telegram/client.py`
- Create: `app_telegram/confirm_ui.py`
- Modify: `app_telegram/tasks.py`
- Test: `app_telegram/tests/test_confirm_ui.py`

- [ ] **Step 1: Extend `TelegramClient.send_message`**

```python
def send_message(
    self,
    chat_id: int,
    text: str,
    parse_mode: str | None = "HTML",
    *,
    reply_to_message_id: int | None = None,
    reply_markup: dict | None = None,
) -> dict:
    ...
    if reply_markup is not None:
        payload["reply_markup"] = reply_markup
```

Add `answer_callback_query(self, callback_query_id: str, *, text: str | None = None)`.

- [ ] **Step 2: Add `build_roster_confirm_keyboard(pending_id: int)`**

```python
def build_roster_confirm_keyboard(pending_id: int) -> dict:
    return {
        "inline_keyboard": [[
            {"text": "Confirm", "callback_data": f"ai:confirm:{pending_id}"},
            {"text": "Cancel", "callback_data": f"ai:cancel:{pending_id}"},
        ]]
    }
```

- [ ] **Step 3: After AI result in `run_ai_query`, detect pending confirmation**

Parse `result.tool_results` or have `GeminiClient` expose last tool payload. When `status == pending_confirmation"`:

```python
from app_ai.confirmation import get_active_write_confirmation

pending = get_active_write_confirmation(user=user, channel_key=channel_key)
if pending:
    sent = client.send_message(
        chat_id,
        pending.summary,
        reply_markup=build_roster_confirm_keyboard(pending.id),
    )
    pending.telegram_chat_id = chat_id
    pending.telegram_message_id = sent["message_id"]
    pending.save(update_fields=["telegram_chat_id", "telegram_message_id"])
```

---

## Task 15: Telegram `callback_query` handler

**Files:**
- Modify: `app_telegram/config.py` — add `"callback_query"` to `WEBHOOK_ALLOWED_UPDATES`
- Modify: `app_telegram/webhook.py`
- Create: `app_telegram/callbacks.py`
- Test: `app_telegram/tests/test_callbacks.py`

- [ ] **Step 1: Dispatch in webhook**

```python
elif "callback_query" in update:
    from app_telegram.callbacks import handle_callback_query
    handle_callback_query(tenant, update["callback_query"])
```

- [ ] **Step 2: Implement handler**

```python
def handle_callback_query(tenant, payload: dict) -> None:
    data = (payload.get("data") or "").strip()
    if not data.startswith("ai:"):
        return
    parts = data.split(":")
    if len(parts) != 3:
        return
    _, action, pending_id_str = parts
    from_user = payload.get("from") or {}
    tg_user_id = from_user.get("id")
    user = User.objects.filter(telegram_user_id=tg_user_id).first()
    if user is None:
        return
    pending = AIPendingWriteConfirmation.objects.filter(id=int(pending_id_str)).first()
    if pending is None or pending.user_id != user.id:
        client.answer_callback_query(payload["id"], text="Not authorized.")
        return
    if pending.expires_at <= timezone.now():
        client.answer_callback_query(payload["id"], text="Expired.")
        return
    client = TelegramClient(tenant)
    if action == "cancel":
        clear_write_confirmation(user=user, channel_key=f"telegram:{payload['message']['chat']['id']}")
        client.edit_message_text(..., "Cancelled.", reply_markup={"inline_keyboard": []})
        return
    if action == "confirm":
        result = execute_pending_write_confirmation(
            pending=pending,
            actor=user,
            tenant=tenant,
            source=CourseMembershipEvent.Source.TELEGRAM_BOT,
        )
        clear_write_confirmation(...)
        text = "Done." if result.get("status") == "ok" else result.get("message", "Failed.")
        client.edit_message_text(..., text, reply_markup={"inline_keyboard": []})
```

- [ ] **Step 3: Run callback tests**

Run: `./scripts/run_backend_tests.sh app_telegram.tests.test_callbacks`

---

## Task 16: `course_member_edit_url` + links test

**Files:**
- Modify: `app_ai/links.py`
- Modify: `app_ai/tests/test_links.py`

```python
def course_member_edit_url(org: Organization, course_id: int) -> str:
    return build_frontend_url(org, f"/courses/{course_id}/edit?tab=edit-members")
```

---

## Task 17: End-to-end integration test

**Files:**
- Modify: `app_telegram/tests/test_ai_query.py`

- [ ] **Step 1: Add test with mocked Gemini calling `assign_staff_to_course`**

Assert:
1. Tool returns `pending_confirmation`
2. `send_message` called with `reply_markup`
3. Simulated callback `ai:confirm:{id}` creates `UserCourse` + `CourseMembershipEvent(source=telegram_bot)`

Run: `./scripts/run_backend_tests.sh app_telegram.tests.test_ai_query`

---

## Task 18: Final verification + spec status

- [ ] **Step 1: Run full AI + course + telegram test bundle**

Run:

```bash
./scripts/run_backend_tests.sh \
  app_ai.tests.test_resolve_course_role \
  app_ai.tests.test_confirmation \
  app_ai.tests.test_enroll_student_in_course \
  app_ai.tests.test_remove_student_from_course \
  app_ai.tests.test_assign_staff_to_course \
  app_ai.tests.test_remove_staff_from_course \
  app_ai.tests.test_tool_intent \
  app_ai.tests.test_tool_registry \
  app_course.tests.test_roster_writes \
  app_course.tests.test_roster_event_weekdays \
  app_telegram.tests.test_callbacks \
  app_telegram.tests.test_ai_query
```

Expected: all PASS

- [ ] **Step 2: Update spec status**

In `docs/superpowers/specs/2026-07-01-ai-roster-write-tools-design.md`, set `Status: Approved`.

- [ ] **Step 3: Document deploy note**

Add to spec or PR description: after deploy, run `python manage.py telegram-set-webhooks` per Telegram-enabled tenant so `callback_query` is registered.

---

## Self-review (plan vs spec)

| Spec requirement | Task |
| --- | --- |
| Four write tools | Tasks 8–11 |
| RBAC | Task 7, all tools |
| Always confirm | Tasks 6, 8–11, 13–15 |
| `CourseMembershipEvent.source` | Tasks 1–2 |
| Staff audit events | Task 4 |
| MT/AT + role disambiguation | Tasks 5, 10 |
| Weekdays 0–6, NL via model | Tasks 3, 10, 12 |
| Ad-hoc reject + edit URL | Tasks 10, 16 |
| Already assigned reject | Tasks 4, 10 |
| Telegram inline confirm | Tasks 14–15 |
| Web deferred | Task 6 `WEB_ROSTER_CONFIRM_ENABLED = False` |
| Intent + prompts | Task 12 |
| Integration tests | Task 17 |

No TBD placeholders in task steps; web confirm explicitly stubbed with flag.

---

## Follow-up (post-v1)

1. Enable web confirm — define keyword (`confirm`/`cancel`), set `WEB_ROSTER_CONFIRM_ENABLED = True`, add `test_confirmation_web.py`
2. Refactor HTTP views to call `roster_writes.py` (DRY)
3. Staff JOINED events on HTTP `TeacherAssignView` (align audit policy)
