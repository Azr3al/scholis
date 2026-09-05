# Org Flags: Auto-MT Creator + Course Roles — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `auto_assign_creator_as_main_teacher` and `is_course_role_enabled` org flags so teacher-only creators become MT on all sessions, and tenants can force every teacher assignment to the sole MT role — plus org-settings help UI with pseudo-code copy.

**Architecture:** Two booleans on public `Organization`. New `app_course/course_role_policy.py` owns eligibility, MT resolution, force-MT, and catalog uniqueness helpers. Extend creator assign + all teacher-assign entry points; FE gates role pickers and adds reusable `OrgSettingHelp`.

**Tech Stack:** Django / DRF / django-tenants; Next.js / Zod / React; Vitest; `./scripts/run_backend_tests.sh` (always `--keepdb`).

**Spec:** `docs/superpowers/specs/2026-07-21-org-flags-auto-mt-and-course-roles-design.md`

## Global Constraints

- Follow high-value test rules: edge/auth/error cases; at most one thin success path per behavior.
- Backend tests: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh <target>` (script adds `--keepdb --noinput`).
- Do **not** commit unless the user explicitly asks (omit/skip commit steps until requested).
- Leave unrelated WIP in the working tree untouched.
- No create-form schedule UI work (already exists).
- No data migration for legacy duplicate MT/AT roles.
- Org flags live on public schema; toggle in tests via `schema_context(get_public_schema_name())`.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `app_organization/models.py` | Add two `BooleanField`s |
| `app_organization/migrations/0077_*.py` | Additive migration (depends on `0076_…`) |
| `app_demo/org_config.py` | Allow demo toggles for both keys |
| `app_course/course_role_policy.py` | **Create** — eligibility, resolve MT, force-MT, catalog uniqueness |
| `app_course/course_scoping.py` | Extend `assign_creator_as_teacher_if_applicable` |
| `app_course/roster_management.py` | Force MT on teacher rows when roles disabled |
| `app_course/roster_writes.py` | Force MT in `execute_assign_staff` |
| `app_course/views.py` | Force MT in `TeacherAssignView`; uniqueness already via serializer |
| `app_course/serializers.py` | `AssignedAsRoleSerializer.validate` uniqueness |
| `app_course/tests/test_course_role_policy.py` | **Create** — unit tests for helpers |
| `app_course/tests/test_auto_assign_creator_mt.py` | **Create** — creator auto-MT + events |
| `app_course/tests/test_course_roles_disabled_assign.py` | **Create** — force-MT assign paths |
| `app_course/tests/test_assigned_as_role_uniqueness.py` | **Create** — catalog uniqueness |
| `schedjuice-reimagined-fe/src/types/organization.ts` | Zod fields |
| `…/config/organization-profile-sections.ts` | Section keys |
| `…/config/org-setting-help-copy.ts` | **Create** — copy map |
| `…/components/org/org-setting-help.tsx` | **Create** — help UI |
| `…/components/org/record/use-org-record-form.tsx` | Wire help into fieldConfig descriptions |
| `…/components/course/course-member-chooser.tsx` | Hide role picker when flag off |
| `…/components/course/teacher-schedule-edit.tsx` | Hide/force role when flag off |
| `…/components/org/org-setting-help.test.tsx` | **Create** — help renders for both keys |

---

### Task 1: Organization flags (model + migration + demo)

**Files:**
- Modify: `schedjuice-reimagined-be/app_organization/models.py` (near other feature toggles, after `is_legacy_discount_visible` ~365)
- Create: `schedjuice-reimagined-be/app_organization/migrations/0077_auto_assign_creator_mt_and_course_roles.py`
- Modify: `schedjuice-reimagined-be/app_demo/org_config.py` (`ALLOWED_ORG_TOGGLE_KEYS`)

**Interfaces:**
- Consumes: existing `Organization` model / migration `0076_organization_teaching_subjects_allow_level_category_search`
- Produces: `Organization.auto_assign_creator_as_main_teacher: bool` (default `False`); `Organization.is_course_role_enabled: bool` (default `True`). Serializers already expose model fields (no exclude needed unless AI-split pattern).

- [ ] **Step 1: Add model fields**

```python
auto_assign_creator_as_main_teacher = models.BooleanField(
    default=False,
    help_text=(
        "When True, if the course creator has exactly one role and it is teacher, "
        "assign them as MAIN_TEACHER on the course and all of its events."
    ),
)
is_course_role_enabled = models.BooleanField(
    default=True,
    help_text=(
        "When False, teacher assignments ignore course-role choice and force the "
        "tenant's MAIN_TEACHER AssignedAsRole. Errors if no MT role exists."
    ),
)
```

- [ ] **Step 2: Generate / write migration**

```bash
cd schedjuice-reimagined-be
./env/bin/python manage.py makemigrations app_organization --name auto_assign_creator_mt_and_course_roles
```

Ensure `dependencies = [("app_organization", "0076_organization_teaching_subjects_allow_level_category_search")]` (or whatever HEAD is at implement time).

- [ ] **Step 3: Allow demo toggles**

Add both keys to `ALLOWED_ORG_TOGGLE_KEYS` in `app_demo/org_config.py`.

- [ ] **Step 4: Smoke — fields exist**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_organization.tests.test_default_session_schedule
```

Expected: PASS (or unrelated failures only). Confirm migration applies under `migrate_schemas`.

---

### Task 2: `course_role_policy` helpers (TDD)

**Files:**
- Create: `schedjuice-reimagined-be/app_course/course_role_policy.py`
- Create: `schedjuice-reimagined-be/app_course/tests/test_course_role_policy.py`

**Interfaces:**
- Consumes: `User`, `AssignedAsRole`, optional `tenant` with flag attrs
- Produces:

```python
class MissingMainTeacherRole(Exception):
    """Raised when no AssignedAsRole with MAIN_TEACHER seniority exists."""

def is_exclusive_teacher(user: User) -> bool:
    """True iff user.roles is exactly {teacher}."""

def resolve_main_teacher_role() -> AssignedAsRole:
    """Lowest-id MAIN_TEACHER role, or raise MissingMainTeacherRole."""

def course_roles_enabled(tenant) -> bool:
    """getattr(tenant, 'is_course_role_enabled', True)."""

def resolve_teacher_assigned_as_role(*, tenant, requested_role_id: int | None) -> AssignedAsRole:
    """If roles disabled: resolve_main_teacher_role(). Else: load requested id or raise ValidationError."""

def assert_assigned_as_role_seniority_unique(*, seniority: str, exclude_pk: int | None = None) -> None:
    """Raise ValidationError if another AssignedAsRole already has this MT/AT seniority."""
```

- [ ] **Step 1: Write failing tests**

Create `app_course/tests/test_course_role_policy.py` using the same DB gate / `xschedjuice` / `migrate_schemas` pattern as `test_payment_plan_mandatory.py`. Inside `schema_context(schema_name)`:

```python
def test_is_exclusive_teacher_only_single_teacher_role(self):
    only = User(roles=[User.UserRole.TEACHER])
    multi = User(roles=[User.UserRole.TEACHER, User.UserRole.ADMIN])
    admin = User(roles=[User.UserRole.ADMIN])
    self.assertTrue(is_exclusive_teacher(only))
    self.assertFalse(is_exclusive_teacher(multi))
    self.assertFalse(is_exclusive_teacher(admin))

def test_resolve_main_teacher_role_missing_raises(self):
    AssignedAsRole.objects.filter(seniority=AssignedAsRole.Seniority.MAIN_TEACHER).delete()
    with self.assertRaises(MissingMainTeacherRole):
        resolve_main_teacher_role()

def test_resolve_main_teacher_role_picks_lowest_id_when_duplicates(self):
    # create two MT roles if needed; assert resolve returns min(id)

def test_assert_seniority_unique_blocks_second_mt(self):
    AssignedAsRole.objects.create(name=f"MT-{uuid4().hex[:6]}", seniority=AssignedAsRole.Seniority.MAIN_TEACHER)
    with self.assertRaises(ValidationError):
        assert_assigned_as_role_seniority_unique(seniority=AssignedAsRole.Seniority.MAIN_TEACHER)

def test_resolve_teacher_role_forces_mt_when_disabled(self):
    tenant = SimpleNamespace(is_course_role_enabled=False)
    mt = resolve_main_teacher_role()
    at = AssignedAsRole.objects.filter(seniority=AssignedAsRole.Seniority.ASSISTANT_TEACHER).first()
    # ensure AT exists or create
    got = resolve_teacher_assigned_as_role(tenant=tenant, requested_role_id=at.id if at else None)
    self.assertEqual(got.id, mt.id)
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_course.tests.test_course_role_policy
```

Expected: FAIL (module / names missing).

- [ ] **Step 3: Implement `course_role_policy.py`**

```python
from __future__ import annotations

from rest_framework.exceptions import ValidationError

from app_auth.models import User
from app_course.models import AssignedAsRole


class MissingMainTeacherRole(Exception):
    def __init__(self, message: str = "This school has no Main Teacher course role configured."):
        super().__init__(message)
        self.message = message


def is_exclusive_teacher(user: User) -> bool:
    roles = set(user.roles or [])
    return roles == {User.UserRole.TEACHER}


def course_roles_enabled(tenant) -> bool:
    return bool(getattr(tenant, "is_course_role_enabled", True))


def resolve_main_teacher_role() -> AssignedAsRole:
    role = (
        AssignedAsRole.objects.filter(seniority=AssignedAsRole.Seniority.MAIN_TEACHER)
        .order_by("id")
        .first()
    )
    if role is None:
        raise MissingMainTeacherRole()
    return role


def resolve_teacher_assigned_as_role(*, tenant, requested_role_id: int | None) -> AssignedAsRole:
    if not course_roles_enabled(tenant):
        return resolve_main_teacher_role()
    if requested_role_id is None:
        raise ValidationError({"assigned_as_role": "Course role is required."})
    role = AssignedAsRole.objects.filter(id=requested_role_id).first()
    if role is None:
        raise ValidationError({"assigned_as_role": "Course role not found."})
    return role


def assert_assigned_as_role_seniority_unique(*, seniority: str | None, exclude_pk: int | None = None) -> None:
    if seniority not in (
        AssignedAsRole.Seniority.MAIN_TEACHER,
        AssignedAsRole.Seniority.ASSISTANT_TEACHER,
    ):
        return
    qs = AssignedAsRole.objects.filter(seniority=seniority)
    if exclude_pk is not None:
        qs = qs.exclude(pk=exclude_pk)
    if qs.exists():
        label = "Main Teacher" if seniority == AssignedAsRole.Seniority.MAIN_TEACHER else "Assistant Teacher"
        raise ValidationError(
            {"seniority": f"Only one {label} course role is allowed. Another already exists."}
        )
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
./scripts/run_backend_tests.sh app_course.tests.test_course_role_policy
```

Expected: PASS.

---

### Task 3: Creator auto-assign as MT + event backfill

**Files:**
- Modify: `schedjuice-reimagined-be/app_course/course_scoping.py` (`assign_creator_as_teacher_if_applicable`)
- Create: `schedjuice-reimagined-be/app_course/tests/test_auto_assign_creator_mt.py`
- Optionally adjust callers to pass `tenant` (today `CourseSerializer.create` has `request.tenant`)

**Interfaces:**
- Consumes: `is_exclusive_teacher`, `resolve_main_teacher_role`, `MissingMainTeacherRole`; `ensure_teacher_userevents_for_events`
- Produces: updated signature:

```python
def assign_creator_as_teacher_if_applicable(
    creator: User | None,
    course: Course,
    tenant=None,
) -> None:
```

Behavior:
1. If `tenant` has `auto_assign_creator_as_main_teacher` and `is_exclusive_teacher(creator)`:
   - Resolve MT (raise `ValidationError` wrapping `MissingMainTeacherRole` so create returns 400).
   - `get_or_create` / update `UserCourse` with `assigned_as=teacher`, `assigned_as_role=MT`.
   - Backfill: `ensure_teacher_userevents_for_events(course_id=course.id, event_ids=list(course.events.values_list("id", flat=True)), user_ids=[creator.id])` (use actual related name for events — typically `Event.objects.filter(course_id=course.id)`).
   - Refresh member counts.
   - Return (do **not** also run legacy path).
2. Else if flag is **off** (or tenant missing flag): legacy `is_teacher() and not is_admin()` roster-only, no MT.
3. If flag **on** but creator ineligible: no-op (no legacy fallback).

- [ ] **Step 1: Write failing API/unit tests**

Mirror `test_payment_plan_mandatory.py` setup. Create exclusive teacher user (`roles=[TEACHER]` only). Ensure an MT `AssignedAsRole` exists.

```python
def test_auto_assign_sets_mt_and_userevents_when_flag_on(self):
    # public schema: auto_assign_creator_as_main_teacher=True
    # create course as exclusive teacher via API or serializer with tenant flag
    # create Event rows for course (or POST edit-events)
    # assert UserCourse.assigned_as_role.seniority == MAIN_TEACHER
    # assert UserEvent exists for (creator, each event)

def test_auto_assign_skips_multi_role_teacher(self):
    # user roles [TEACHER, ADMIN]; flag on → no UserCourse

def test_auto_assign_missing_mt_role_returns_400(self):
    # delete all MAIN_TEACHER roles; flag on; exclusive teacher create → 400

def test_flag_off_keeps_legacy_roster_only(self):
    # flag false; exclusive teacher → UserCourse exists, assigned_as_role is null
```

Update `CourseSerializer.create` call to pass tenant:

```python
assign_creator_as_teacher_if_applicable(
    validated_data.get("created_by"), instance, tenant=self.context["request"].tenant
)
```

Also update patches in `app_microsoft/tests/test_team_provisioning.py` if signature breaks (kwargs OK if tenant optional).

- [ ] **Step 2: Run — expect FAIL**

```bash
./scripts/run_backend_tests.sh app_course.tests.test_auto_assign_creator_mt
```

- [ ] **Step 3: Implement assign logic**

In `course_scoping.py`, implement the branching above. Convert `MissingMainTeacherRole` to `ValidationError({"detail": ...})` so DRF returns 400 from serializer create.

Event backfill:

```python
from app_attendance.userevent_sync import ensure_teacher_userevents_for_events
from app_course.models import Event

event_ids = list(Event.objects.filter(course_id=course.id).values_list("id", flat=True))
if event_ids:
    ensure_teacher_userevents_for_events(
        course_id=course.id, event_ids=event_ids, user_ids=[creator.id]
    )
```

Later `edit-events` already calls `ensure_teacher_userevents_for_events` for all roster teachers — no change required there once creator is on roster.

- [ ] **Step 4: Run — expect PASS**

```bash
./scripts/run_backend_tests.sh app_course.tests.test_auto_assign_creator_mt app_course.tests.test_course_scoping
```

Expected: PASS (legacy scoping tests still green).

---

### Task 4: Force-MT on all teacher assign paths

**Files:**
- Modify: `schedjuice-reimagined-be/app_course/roster_management.py` (`apply_user_course_management`)
- Modify: `schedjuice-reimagined-be/app_course/views.py` (`TeacherAssignView.post`)
- Modify: `schedjuice-reimagined-be/app_course/roster_writes.py` (`execute_assign_staff` and any caller that chooses role before call — prefer resolve inside `execute_assign_staff` or immediately before)
- Create: `schedjuice-reimagined-be/app_course/tests/test_course_roles_disabled_assign.py`

**Interfaces:**
- Consumes: `resolve_teacher_assigned_as_role`, `MissingMainTeacherRole`, `course_roles_enabled`
- Produces: when `is_course_role_enabled` is False, every new/updated **teacher** `UserCourse` gets MT role; missing MT → 400

- [ ] **Step 1: Write failing tests**

```python
def test_roster_management_forces_mt_when_roles_disabled(self):
    # flag False; POST user-courses/management with teacher + AT role id
    # assert stored assigned_as_role is MT

def test_roster_management_400_when_no_mt(self):
    # flag False; delete MT roles; assign teacher → 400

def test_teacher_assign_view_forces_mt(self):
    # flag False; POST assign-events with AT role id → UserCourse uses MT

def test_execute_assign_staff_forces_mt(self):
    # call execute_assign_staff with AT role while flag False → result role is MT
```

Use manager actor with `course.manage_members`; seed RBAC like payment-plan tests.

- [ ] **Step 2: Run — expect FAIL**

```bash
./scripts/run_backend_tests.sh app_course.tests.test_course_roles_disabled_assign
```

- [ ] **Step 3: Wire force-MT**

**`apply_user_course_management`:** before create/update loops, if not `course_roles_enabled(tenant)`:

```python
try:
    mt = resolve_main_teacher_role()
except MissingMainTeacherRole as exc:
    raise ValidationError({"assigned_as_role": str(exc)}) from exc
for row in entities:
    if row.get("assigned_as") == models.UserCourse.AssignedAs.TEACHER:
        row["assigned_as_role"] = mt.id
```

**`TeacherAssignView.post`:** after loading course/user, replace role resolution with:

```python
from app_course.course_role_policy import (
    MissingMainTeacherRole,
    resolve_teacher_assigned_as_role,
)
try:
    assigned_as_role = resolve_teacher_assigned_as_role(
        tenant=request.tenant,
        requested_role_id=request.data.get("assigned_as_role_id"),
    )
except MissingMainTeacherRole as exc:
    return self.bad_request(str(exc))
except ValidationError as exc:
    return self.bad_request(exc.detail)
```

When roles disabled, `assigned_as_role_id` may be omitted — adjust required_fields:

```python
required_fields = ("user_id", "new_events", "removed_events")
if course_roles_enabled(request.tenant):
    required_fields = required_fields + ("assigned_as_role_id",)
```

**`execute_assign_staff`:** at start, if not `course_roles_enabled(tenant)`, replace `assigned_as_role` with `resolve_main_teacher_role()` (catch missing → return `{"error": "validation_error", "message": ...}`).

- [ ] **Step 4: Run — expect PASS**

```bash
./scripts/run_backend_tests.sh app_course.tests.test_course_roles_disabled_assign
```

---

### Task 5: Catalog uniqueness on `AssignedAsRole`

**Files:**
- Modify: `schedjuice-reimagined-be/app_course/serializers.py` (`AssignedAsRoleSerializer`)
- Create: `schedjuice-reimagined-be/app_course/tests/test_assigned_as_role_uniqueness.py`

**Interfaces:**
- Consumes: `assert_assigned_as_role_seniority_unique`
- Produces: create/update of second MT or AT → 400; `OTHER` unlimited; existing duplicates untouched

- [ ] **Step 1: Write failing tests**

```python
def test_cannot_create_second_main_teacher_role(self):
    # ensure one MT exists; POST assigned-as-roles with MAIN_TEACHER → 400

def test_cannot_update_other_to_duplicate_mt(self):
    # OTHER role PATCH seniority=MAIN_TEACHER while MT exists → 400

def test_can_create_other_seniority_freely(self):
    # POST OTHER → 201
```

- [ ] **Step 2: Run — expect FAIL**

```bash
./scripts/run_backend_tests.sh app_course.tests.test_assigned_as_role_uniqueness
```

- [ ] **Step 3: Implement serializer validate**

```python
class AssignedAsRoleSerializer(BaseModelSerializer):
    class Meta:
        model = models.AssignedAsRole
        fields = "__all__"

    def validate(self, attrs):
        seniority = attrs.get("seniority")
        if seniority is None and self.instance is not None:
            seniority = self.instance.seniority
        from app_course.course_role_policy import assert_assigned_as_role_seniority_unique
        assert_assigned_as_role_seniority_unique(
            seniority=seniority,
            exclude_pk=self.instance.pk if self.instance else None,
        )
        return attrs
```

- [ ] **Step 4: Run — expect PASS**

```bash
./scripts/run_backend_tests.sh app_course.tests.test_assigned_as_role_uniqueness
```

---

### Task 6: FE org schema + `OrgSettingHelp`

**Files:**
- Modify: `schedjuice-reimagined-fe/src/types/organization.ts`
- Modify: `schedjuice-reimagined-fe/src/config/organization-profile-sections.ts`
- Create: `schedjuice-reimagined-fe/src/config/org-setting-help-copy.ts`
- Create: `schedjuice-reimagined-fe/src/components/org/org-setting-help.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/org/record/use-org-record-form.tsx` (or wherever `fieldConfig` is built — `useOrgFieldConfig`)
- Create: `schedjuice-reimagined-fe/src/components/org/org-setting-help.test.tsx`

**Interfaces:**
- Consumes: Zod `organizationFieldsSchema`; org section registry
- Produces: both flags editable in org settings; `OrgSettingHelp` under those fields via `description: <OrgSettingHelp settingKey="…" />` (FieldConfigItem already allows `ReactNode` description)

- [ ] **Step 1: Add Zod fields** (near other booleans, with `.describe()` labels)

```ts
auto_assign_creator_as_main_teacher: z
  .boolean()
  .describe("Auto-assign creator as main teacher"),
is_course_role_enabled: z
  .boolean()
  .describe("Enable course roles (MT/AT)"),
```

- [ ] **Step 2: Register section keys**

Put both under `access-library` (next to `can_teacher_create_course`) **or** a new `"course-staffing"` section — prefer `access-library` to avoid new section boilerplate unless the form becomes crowded:

```ts
keys: [
  // ...
  "can_teacher_create_course",
  "auto_assign_creator_as_main_teacher",
  "is_course_role_enabled",
  // ...
]
```

Ensure `organization-profile-sections` coverage check still passes (every schema key once).

- [ ] **Step 3: Copy map + component**

`org-setting-help-copy.ts`:

```ts
export type OrgSettingHelpEntry = {
  summary: string;
  pseudoCode: string;
};

export const ORG_SETTING_HELP: Partial<Record<string, OrgSettingHelpEntry>> = {
  auto_assign_creator_as_main_teacher: {
    summary:
      "When on, a teacher-only creator becomes main teacher on the new course and all of its sessions.",
    pseudoCode: `if flag and creator.roles == [teacher]:
  assign creator as MT on course
  assign creator to every course event`,
  },
  is_course_role_enabled: {
    summary:
      "When off, every teacher assignment is forced to the tenant’s Main Teacher role (role picker hidden).",
    pseudoCode: `if not flag:
  role = tenant.sole_MT_role  # error if missing
  assign(user, course, role=role)`,
  },
};
```

`org-setting-help.tsx`: collapsible “How it works” with `<pre>` for pseudo-code; if key missing from map, render nothing.

- [ ] **Step 4: Wire into fieldConfig**

In `useOrgFieldConfig` / `use-org-record-form.tsx`, for each key in `ORG_SETTING_HELP`, set:

```tsx
fieldConfig[key] = {
  ...fieldConfig[key],
  description: <OrgSettingHelp settingKey={key} />,
};
```

(Preserve any existing description by composing summary inside the component.)

- [ ] **Step 5: Vitest**

```tsx
it("renders summary and expandable pseudo-code for auto_assign flag", () => {
  render(<OrgSettingHelp settingKey="auto_assign_creator_as_main_teacher" />);
  expect(screen.getByText(/teacher-only creator/i)).toBeInTheDocument();
  // open How it works
  expect(screen.getByText(/creator.roles/i)).toBeInTheDocument();
});

it("renders nothing for unknown keys", () => {
  const { container } = render(<OrgSettingHelp settingKey="not_a_real_flag" />);
  expect(container).toBeEmptyDOMElement();
});
```

```bash
cd schedjuice-reimagined-fe && npx vitest run src/components/org/org-setting-help.test.tsx
```

Expected: PASS.

---

### Task 7: FE hide course-role picker when roles disabled

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/course/course-member-chooser.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/course/teacher-schedule-edit.tsx`
- Check: `src/app/(internal)/users/[id]/assign-courses/page.tsx` if it has a role dropdown

**Interfaces:**
- Consumes: `useTenant()` → `tenant?.is_course_role_enabled !== false` (default True when undefined)
- Produces: role UI hidden when false; payloads may omit role or send MT id — BE force-MT is source of truth

- [ ] **Step 1: Gate UI**

```tsx
const courseRolesEnabled = tenant?.is_course_role_enabled !== false;
// when rendering role Select: {courseRolesEnabled ? <RoleSelect ... /> : null}
```

When submitting with roles disabled, either omit `assigned_as_role` or pass the MT role id if already loaded — BE overwrites either way.

- [ ] **Step 2: Manual smoke**

With tenant `is_course_role_enabled=false`, open course members / teacher schedule edit — no role dropdown; assign still works.

(Optional thin Vitest: mock `useTenant` and assert role combobox absent — only if cheap; otherwise manual is enough given BE coverage.)

---

## Spec coverage self-check

| Spec requirement | Task |
| --- | --- |
| `auto_assign_creator_as_main_teacher` default False | 1 |
| Exclusive teacher → MT + all events (create + later sync + backfill) | 3 |
| Ineligible skip when flag on | 3 |
| Legacy path when flag off | 3 |
| `is_course_role_enabled` default True | 1 |
| Force MT all assign paths | 4 |
| Missing MT → 400 | 2, 3, 4 |
| Catalog one MT + one AT (forward-only) | 2, 5 |
| OrgSettingHelp + pseudo-code | 6 |
| Hide role picker | 7 |
| No schedule UI / no duplicate migration | Global constraints |

## Placeholder / type scan

- Helper names locked in Task 2; later tasks use the same signatures.
- Migration number `0077_*` — adjust if HEAD moves before implement.
- Event related query uses `Event.objects.filter(course_id=…)` (not assumed related_name).

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-21-org-flags-auto-mt-and-course-roles.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — execute tasks in this session with executing-plans checkpoints  

Which approach?
