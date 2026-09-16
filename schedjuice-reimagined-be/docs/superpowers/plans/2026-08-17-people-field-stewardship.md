# People Field Stewardship Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let students (self) and course teachers (on-behalf of enrolled students) directly edit a frozen identity allowlist, with a silent per-person audit log, without broadening `user.update` or `canEditUser`.

**Architecture:** A code-defined gate in `app_auth/field_stewardship.py` answers `user_write_mode(actor, target) -> full | steward | none`. `PUT /users/{id}` and ID-photo uploads call it. Allowlisted changes append `UserFieldChange` rows. The client trusts `user_write_mode` / `writable_fields` on detail GET. Course Student Info adds a Profile tab; Policy Overview shows a read-only People data block.

**Tech Stack:** Django + DRF (tenant schemas), existing `UserCourse` photo connection helpers, Next.js / Vitest, `UserSerializer` detail context flag.

**Spec:** `docs/superpowers/specs/2026-08-17-people-field-stewardship-design.md`

## Global Constraints

- Backend tests: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh <target>` (always `--keepdb` via the script). Never `manage.py test` without `--keepdb`. Never touch the Railway/dev DB.
- FE tests: `cd schedjuice-reimagined-fe && npm run test:unit -- <path>`
- High-value tests only: auth denials, wrong connection, extra keys 403, audit old→new, empty `name` 400. No render-smoke.
- Do **not** add an RBAC catalog code. Do **not** change `canEditUser` meaning. Do **not** put identity editors on `/courses/:id/students`. Do **not** enable teacher edits on the student data sheet.
- Connection = course staff + target `assigned_as=STUDENT` on that course (mirror `course_staff_can_upload_student_image`). Never `user_is_connected_to_user`.
- Steward PATCH with any non-allowlisted key (including `custom_data`, `roles`, login `email`) → 403 whole request.
- `UserSerializer` list/search must **not** compute stewardship (N+1). Only detail GET + `users/profile` with context `include_stewardship=True`.
- RecordOverview is the user-record identity surface for allowlisted builtins (add `alternative_name` + address there). Do **not** set `InlineGroup canEdit=true` for teachers — group save mixes office fields.
- Commit after each task. Do not push.

---

## File Structure

| File | Action | Responsibility |
| --- | --- | --- |
| `schedjuice-reimagined-be/app_auth/field_stewardship.py` | Create | Allowlist, mode, connection, request keys, audit source, record changes |
| `schedjuice-reimagined-be/app_auth/models.py` | Modify | `UserFieldChange` |
| `schedjuice-reimagined-be/app_auth/migrations/0084_userfieldchange.py` | Create | Table |
| `schedjuice-reimagined-be/app_auth/views.py` | Modify | Gate on PUT; skip `user.update` when mode ≠ none; drop student-self blanket 403 |
| `schedjuice-reimagined-be/app_auth/serializers.py` | Modify | `user_write_mode`, `writable_fields` when context flag set |
| `schedjuice-reimagined-be/app_auth/field_change_views.py` | Create | `GET /users/{id}/field-changes` |
| `schedjuice-reimagined-be/app_auth/urls.py` | Modify | History route |
| `schedjuice-reimagined-be/app_auth/user_image_views.py` | Modify | Student-self `id_image` upload |
| `schedjuice-reimagined-be/app_auth/tests/test_field_stewardship.py` | Create | Pure gate tests |
| `schedjuice-reimagined-be/app_auth/tests/test_field_stewardship_api.py` | Create | HTTP + audit + history |
| `schedjuice-reimagined-be/app_auth/tests/test_profile_self_update.py` | Modify | Student self-name allowed; code still 403 |
| `schedjuice-reimagined-fe/src/lib/users/steward-fields.ts` | Create | Frozen allowlist + copy + `canMutateUserField` |
| `schedjuice-reimagined-fe/src/types/user.ts` | Modify | Optional `user_write_mode`, `writable_fields` |
| `schedjuice-reimagined-fe/src/helpers/authorization.ts` | Modify | Header media: profile/ID follow stewardship; cover not for students |
| `schedjuice-reimagined-fe/src/components/record/sections/record-overview.tsx` | Modify | Per-field lock; alt name + address |
| `schedjuice-reimagined-fe/src/components/record/record-profile-header-actions.tsx` | Modify | Profile + ID photo from writable fields |
| `schedjuice-reimagined-fe/src/components/record/user-field-history-sheet.tsx` | Create | Merged timeline |
| `schedjuice-reimagined-fe/src/app/client-api/user-field-changes.ts` | Create | History GET client |
| `schedjuice-reimagined-fe/src/lib/rbac/people-data-policy.ts` | Create | Policy Overview copy |
| `schedjuice-reimagined-fe/src/components/rbac/policy-overview.tsx` | Modify | People data block above role select |
| `schedjuice-reimagined-fe/src/components/rbac/policy-pdf-document.tsx` | Modify | Same block at top of PDF |
| `schedjuice-reimagined-fe/src/components/course/student-info/course-student-info-tabs.tsx` | Modify | Profile first |
| `schedjuice-reimagined-fe/src/app/(internal)/courses/[id]/student-info/page.tsx` | Modify | Redirect to `/profile` |
| `schedjuice-reimagined-fe/src/app/(internal)/courses/[id]/student-info/profile/page.tsx` | Create | Profile tab page |
| `schedjuice-reimagined-fe/src/components/course/student-info/profile/course-student-info-profile.tsx` | Create | Searchable inline identity table |

---

### Task 1: Gate module (pure)

**Files:**
- Create: `schedjuice-reimagined-be/app_auth/field_stewardship.py`
- Test: `schedjuice-reimagined-be/app_auth/tests/test_field_stewardship.py`

**Interfaces:**
- Consumes: `app_course.course_student_photos.user_is_course_staff`, `user_is_enrolled_student`; `app_auth.user_scoping.check_user_write`; `app_rbac.resolution.effective_permissions`
- Produces:
  - `STEWARD_USER_KEYS: frozenset[str]`
  - `STEWARD_IMAGE_TYPES: frozenset[str]` (`{"id_image"}`)
  - `user_write_mode(actor, target) -> Literal["full", "steward", "none"]`
  - `course_staff_may_steward_student(actor, target, course=None) -> bool`
  - `request_write_keys(data) -> set[str]`
  - `write_source(actor, target, mode: str) -> str` (`self` \| `connected_teacher` \| `admin`)

- [ ] **Step 1: Write the failing tests**

```python
from datetime import date, timedelta
from uuid import uuid4
from django.test import TestCase
from django.utils import timezone
from tenant_schemas.utils import schema_context
from app_auth.models import User
from app_auth.field_stewardship import (
    STEWARD_USER_KEYS,
    course_staff_may_steward_student,
    request_write_keys,
    user_write_mode,
    write_source,
)
from app_course.models import Category, Course, Program, UserCourse
from app_rbac.seeding import seed_rbac


class FieldStewardshipGateTests(TestCase):
    schema_name = "xschedjuice"

    def setUp(self):
        with schema_context(self.schema_name):
            seed_rbac()
            suffix = uuid4().hex[:6]
            today = timezone.localdate()
            cat = Category.objects.create(name=f"C {suffix}")
            prog = Program.objects.create(
                name=f"P {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title=f"Course {suffix}",
                category=cat,
                program=prog,
                start_date=today,
                end_date=today + timedelta(days=30),
            )
            self.teacher = User.objects.create(
                email=f"t-{suffix}@x.io",
                name="T",
                phone_number="1",
                communication_email=f"t-{suffix}@x.io",
                code=f"t-{suffix}",
                roles=[User.UserRole.TEACHER],
            )
            self.outsider = User.objects.create(
                email=f"o-{suffix}@x.io",
                name="O",
                phone_number="1",
                communication_email=f"o-{suffix}@x.io",
                code=f"o-{suffix}",
                roles=[User.UserRole.TEACHER],
            )
            self.student = User.objects.create(
                email=f"s-{suffix}@x.io",
                name="S",
                phone_number="2",
                communication_email=f"s-{suffix}@x.io",
                code=f"s-{suffix}",
                roles=[User.UserRole.STUDENT],
            )
            self.admin = User.objects.create(
                email=f"a-{suffix}@x.io",
                name="A",
                phone_number="3",
                communication_email=f"a-{suffix}@x.io",
                code=f"a-{suffix}",
                roles=[User.UserRole.MANAGER],
            )
            UserCourse.objects.create(
                user=self.teacher,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.TEACHER,
            )
            UserCourse.objects.create(
                user=self.student,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )

    def test_allowlist_contains_identity_keys(self):
        for key in (
            "name",
            "alternative_name",
            "phone_number",
            "communication_email",
            "house_number",
            "profile_image",
            "id_photo",
        ):
            self.assertIn(key, STEWARD_USER_KEYS)
        self.assertNotIn("email", STEWARD_USER_KEYS)
        self.assertNotIn("code", STEWARD_USER_KEYS)

    def test_student_self_is_steward(self):
        with schema_context(self.schema_name):
            self.assertEqual(user_write_mode(self.student, self.student), "steward")

    def test_teacher_self_is_full(self):
        with schema_context(self.schema_name):
            self.assertEqual(user_write_mode(self.teacher, self.teacher), "full")

    def test_connected_teacher_is_steward_on_student(self):
        with schema_context(self.schema_name):
            self.assertTrue(course_staff_may_steward_student(self.teacher, self.student))
            self.assertEqual(user_write_mode(self.teacher, self.student), "steward")

    def test_outsider_teacher_is_none(self):
        with schema_context(self.schema_name):
            self.assertFalse(
                course_staff_may_steward_student(self.outsider, self.student)
            )
            self.assertEqual(user_write_mode(self.outsider, self.student), "none")

    def test_classmate_is_none(self):
        with schema_context(self.schema_name):
            other = User.objects.create(
                email="c@x.io",
                name="C",
                phone_number="4",
                communication_email="c@x.io",
                code="c-x",
                roles=[User.UserRole.STUDENT],
            )
            UserCourse.objects.create(
                user=other,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            self.assertEqual(user_write_mode(self.student, other), "none")

    def test_manager_on_other_is_full(self):
        with schema_context(self.schema_name):
            self.assertEqual(user_write_mode(self.admin, self.student), "full")

    def test_request_write_keys_ignores_queryish(self):
        self.assertEqual(
            request_write_keys({"name": "A", "expand": [], "fields": ["name"]}),
            {"name"},
        )

    def test_write_source_connected_teacher(self):
        with schema_context(self.schema_name):
            self.assertEqual(
                write_source(self.teacher, self.student, "steward"),
                "connected_teacher",
            )
```

- [ ] **Step 2: Run — expect FAIL** (module missing)

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_auth.tests.test_field_stewardship`

Expected: FAIL import `field_stewardship`

- [ ] **Step 3: Implement `field_stewardship.py`**

```python
from __future__ import annotations
from typing import Literal

from app_auth.models import User
from app_course.course_student_photos import (
    user_is_course_staff,
    user_is_enrolled_student,
)
from app_course.models import Course, UserCourse
from app_auth.user_scoping import check_user_write
from app_rbac.resolution import effective_permissions
from rest_framework.exceptions import PermissionDenied

WriteMode = Literal["full", "steward", "none"]

STEWARD_USER_KEYS = frozenset({
    "name",
    "alternative_name",
    "phone_number",
    "communication_email",
    "house_number",
    "street",
    "township",
    "city",
    "region",
    "country",
    "profile_image",
    "id_photo",
})
STEWARD_IMAGE_TYPES = frozenset({"id_image"})
_IGNORED_REQUEST_KEYS = frozenset({"expand", "fields", "sorts", "page", "size"})


def course_staff_may_steward_student(
    actor: User, target: User, course: Course | None = None
) -> bool:
    if actor.is_student():
        return False
    if course is not None:
        return (
            user_is_enrolled_student(course, target)
            and user_is_course_staff(actor, course)
        )
    teacher_course_ids = UserCourse.objects.filter(
        user_id=actor.id,
        assigned_as=UserCourse.AssignedAs.TEACHER,
    ).values_list("course_id", flat=True)
    creator_ids = Course.objects.filter(created_by_id=actor.id).values_list(
        "id", flat=True
    )
    course_ids = set(teacher_course_ids) | set(creator_ids)
    if not course_ids:
        return False
    return UserCourse.objects.filter(
        user_id=target.id,
        assigned_as=UserCourse.AssignedAs.STUDENT,
        course_id__in=course_ids,
    ).exists()


def user_write_mode(actor: User, target: User) -> WriteMode:
    held = set(effective_permissions(actor))
    if "user.update" in held:
        try:
            check_user_write(actor, target)
            return "full"
        except PermissionDenied:
            pass
    if actor.id == target.id:
        if User.UserRole.STUDENT not in (actor.roles or []):
            return "full"
        return "steward"
    if course_staff_may_steward_student(actor, target):
        return "steward"
    return "none"


def request_write_keys(data) -> set[str]:
    if not hasattr(data, "keys"):
        return set()
    return {str(k) for k in data.keys() if str(k) not in _IGNORED_REQUEST_KEYS}


def write_source(actor: User, target: User, mode: str) -> str:
    if actor.id == target.id:
        return "self"
    if mode == "full" and "user.update" in set(effective_permissions(actor)):
        return "admin"
    return "connected_teacher"
```

For `course_staff_may_steward_student` without `course`, also treat `user_is_course_staff` admin-on-any-course as already covered by `user.update` → `"full"`. Do not use generic co-enrollment.

- [ ] **Step 4: Run — expect PASS**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_auth.tests.test_field_stewardship`

- [ ] **Step 5: Commit**

```bash
git add schedjuice-reimagined-be/app_auth/field_stewardship.py \
  schedjuice-reimagined-be/app_auth/tests/test_field_stewardship.py
git commit -m "$(cat <<'EOF'
Add the people field stewardship gate for student self and course teachers.

EOF
)"
```

---

### Task 2: `UserFieldChange` model

**Files:**
- Modify: `schedjuice-reimagined-be/app_auth/models.py` (append after `UserImage`)
- Create: `schedjuice-reimagined-be/app_auth/migrations/0084_userfieldchange.py` (makemigrations; next number after `0083` if HEAD moved)
- Test: add `test_model_stores_old_new` in `test_field_stewardship.py`

**Interfaces:**
- Produces: `UserFieldChange` with `user`, `actor` (SET_NULL), `field_key`, `old_value`, `new_value`, `source`, `created_at`

- [ ] **Step 1: Failing test** — create a row in schema, assert old/new/`source`

- [ ] **Step 2: Run — expect FAIL** (`UserFieldChange` missing)

- [ ] **Step 3: Add model**

```python
class UserFieldChange(BaseModel):
    class Source(models.TextChoices):
        SELF = "self", "self"
        CONNECTED_TEACHER = "connected_teacher", "connected_teacher"
        ADMIN = "admin", "admin"

    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="field_changes"
    )
    actor = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="authored_field_changes",
    )
    field_key = models.CharField(max_length=64)
    old_value = models.TextField(null=True, blank=True)
    new_value = models.TextField(null=True, blank=True)
    source = models.CharField(max_length=32, choices=Source.choices)

    class Meta:
        indexes = [models.Index(fields=["user", "-created_at"])]
```

Run makemigrations in the backend venv against the **test** workflow only if needed; prefer writing `0084_userfieldchange.py` by hand matching neighboring migrations (tenant schema, no `db_alias` tricks).

Also add `record_steward_field_changes(actor, target, mode, previous: dict, current: dict) -> int` in `field_stewardship.py`: for each key in `STEWARD_USER_KEYS` where `str(previous.get(k) or "") != str(current.get(k) or "")`, insert a row. Skip identical. Return count inserted. Image fields: use `"(replaced)"` if either side looks like a file.

- [ ] **Step 4: Run gate tests + new model test — PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
Add UserFieldChange for silent people-identity audit rows.

EOF
)"
```

---

### Task 3: Wire PUT `/users/{id}` + serializer fields

**Files:**
- Modify: `schedjuice-reimagined-be/app_auth/views.py` (`UserDetailsView.check_permissions`, `put`; `UserProfileView.get`)
- Modify: `schedjuice-reimagined-be/app_auth/serializers.py` (`UserSerializer`)
- Modify: `schedjuice-reimagined-be/app_auth/tests/test_profile_self_update.py`
- Test: `schedjuice-reimagined-be/app_auth/tests/test_field_stewardship_api.py`

**Interfaces:**
- Consumes: `user_write_mode`, `request_write_keys`, `STEWARD_USER_KEYS`, `record_steward_field_changes`, `write_source`
- Produces: GET detail/profile `{ user_write_mode, writable_fields }` when `context["include_stewardship"]`; steward PUT 200/403 per spec

- [ ] **Step 1: Replace student self-edit test; add API tests**

In `test_profile_self_update.py` **replace** `test_student_cannot_update_own_profile` with:

```python
def test_student_can_update_own_name(self):
    with schema_context(self.schema_name):
        student_id = self.student.id
    response = self._client(self.student).put(
        f"{self.api_prefix}/users/{student_id}",
        {"name": "Student Self Edit"},
        format="json",
    )
    self.assertEqual(response.status_code, 200, response.content)
    self.assertEqual(response.json()["data"]["name"], "Student Self Edit")

def test_student_cannot_update_own_code(self):
    with schema_context(self.schema_name):
        student_id = self.student.id
        old_code = self.student.code
    response = self._client(self.student).put(
        f"{self.api_prefix}/users/{student_id}",
        {"code": "HACK"},
        format="json",
    )
    self.assertEqual(response.status_code, 403, response.content)
    with schema_context(self.schema_name):
        self.assertEqual(User.objects.get(pk=student_id).code, old_code)
```

Keep `test_teacher_cannot_update_other_user_profile` (outsider teacher, no shared course).

New `test_field_stewardship_api.py` (same user/course setup as Task 1 tests, plus `APIClient` + `HTTP_X_DTS_SCHEMA` + `seed_rbac` + `@override_settings(RBAC_ENFORCE="enforce")`):

- Connected teacher PUT `{"name": "Fixed"}` → 200; `UserFieldChange` one row `source=connected_teacher`, old/new.
- Outsider teacher PUT name → 403; zero rows.
- Connected teacher PUT `{"name": "X", "code": "Z"}` → 403; name and code unchanged.
- Student PUT classmate name → 403.
- Manager PUT `{"code": "NEW"}` still 200 (office).
- Manager PUT name → audit `source=admin`.
- Connected teacher PUT same name again → 200, **no** new audit row.
- GET `/users/{student_id}` as connected teacher: `user_write_mode == "steward"` and `writable_fields` contains `name`.
- GET `/users/{student_id}` as outsider: `none` and `[]`.
- GET `/users` list (no stewardship keys required); if present they must not force extra queries — simply omit keys unless `include_stewardship`.

- [ ] **Step 2: Run — expect FAIL** (student still 403)

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_auth.tests.test_profile_self_update app_auth.tests.test_field_stewardship_api`

- [ ] **Step 3: Implement**

`UserDetailsView.check_permissions`: on PUT/PATCH, load target by `obj_id`; if actor and target and `user_write_mode(actor, target) != "none"`: return; else `super()`.

`UserDetailsView.put`:
1. Remove the blanket student-self 403.
2. After auth, `mode = user_write_mode(user, obj)`.
3. If `mode == "none"`: 403 `"Not allowed for this user."`
4. If `mode == "steward"`: `keys = request_write_keys(request.data)`; `bad = keys - STEWARD_USER_KEYS`; if `bad`: 403 `details` listing sorted `bad`.
5. If `mode == "full"`: keep existing `check_user_write`, role-assign, `is_active` blocks.
6. If `mode == "steward"`: **do not** call `check_user_write`.
7. Snapshot `{k: getattr(obj, k, None) for k in STEWARD_USER_KEYS}` before `super().put`.
8. After 200, refresh obj, `record_steward_field_changes(...)`.

`UserSerializer`: `user_write_mode` and `writable_fields` as `SerializerMethodField`. If not `self.context.get("include_stewardship")`: return `None` / `[]` **and omit from representation** via `to_representation` pop when flag false.

```python
def get_user_write_mode(self, obj):
    if not self.context.get("include_stewardship"):
        return None
    request = self.context.get("request")
    actor = getattr(request, "user", None) if request else None
    # JWT user may be email-id; use acting_user(request) if available
    from app_course.course_scoping import acting_user
    actor = acting_user(request) if request else None
    if actor is None:
        return "none"
    return user_write_mode(actor, obj)

def get_writable_fields(self, obj):
    mode = self.get_user_write_mode(obj)
    if mode != "steward":
        return []
    return sorted(STEWARD_USER_KEYS)
```

`UserDetailsView.get`: pass `include_stewardship=True` into serializer context (however `get_serializer` is invoked today — set on `self.request` or override `get_serializer`).

`UserProfileView.get`: same flag (student own profile).

- [ ] **Step 4: Run API + self-update + gate tests — PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
Allow steward identity writes on user PUT and expose writable_fields.

EOF
)"
```

---

### Task 4: History GET

**Files:**
- Create: `schedjuice-reimagined-be/app_auth/field_change_views.py`
- Modify: `schedjuice-reimagined-be/app_auth/urls.py`
- Test: `test_field_stewardship_api.py` (append)

**Interfaces:**
- Produces: `GET /api/v1/users/<user_id>/field-changes` paginated `{ items: [{ id, field_key, old_value, new_value, source, created_at, actor_id, actor_name }], ...meta }`
- Auth: `check_user_read` AND (`user_write_mode` in `{full, steward}` OR actor.id == target.id). Classmate / outsider teacher → 403.

- [ ] **Step 1: Tests** — connected teacher 200 after a name change; outsider 403; classmate 403; student GET own history 200.

- [ ] **Step 2: Run — FAIL** (404 route)

- [ ] **Step 3: View + url** next to user-images routes:

`path("users/<int:user_id>/field-changes", UserFieldChangeListView.as_view(), name="user-field-changes")`

`rbac_decision = "authenticated_only"`; enforce the spec in `get`. Order `-created_at`. Use `CustomPagination` like `UserImageListCreateView`.

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
Expose per-person field change history for stewardship writers.

EOF
)"
```

---

### Task 5: Student-self ID image upload

**Files:**
- Modify: `schedjuice-reimagined-be/app_auth/user_image_views.py` (`_actor_can_upload_user_image`)
- Test: `schedjuice-reimagined-be/app_auth/tests/test_user_images.py` (append; follow existing multipart fixtures)

**Interfaces:**
- Consumes: `STEWARD_IMAGE_TYPES`, actor.id == subject.id
- Produces: student POST `image_type=id_image` without `user_image.upload.id_image` and without `course_id` → 201. Award image without permission still 403. Course-staff path unchanged.

- [ ] **Step 1: Tests** — student self `id_image` 201; student self `award_image` 403; course teacher `id_image` + `course_id` still 201 (regression).

- [ ] **Step 2: Run — FAIL** (student 403)

- [ ] **Step 3: At end of `_actor_can_upload_user_image`**, before the global permission check:

```python
if actor.id == subject.id and image_type in STEWARD_IMAGE_TYPES:
    return True, None, None
```

Keep course_id branch first (unchanged). Then self id_image. Then global upload permission.

- [ ] **Step 4: Run `test_user_images` — PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
Allow students to upload their own ID images without the global upload grant.

EOF
)"
```

---

### Task 6: FE types + field helpers

**Files:**
- Create: `schedjuice-reimagined-fe/src/lib/users/steward-fields.ts`
- Create: `schedjuice-reimagined-fe/src/lib/users/steward-fields.test.ts`
- Modify: `schedjuice-reimagined-fe/src/types/user.ts` (`tempSchema` / account schema)
- Modify: `schedjuice-reimagined-fe/src/helpers/authorization.ts` (`canEditProfileMedia` usage is **not** globally flipped; add `canUpdateCoverImage`)
- Modify: `schedjuice-reimagined-fe/src/helpers/authorization-media.test.ts`

**Interfaces:**
- Produces:
  - `STEWARD_USER_KEYS` (same strings as BE)
  - `UserWriteMode = "full" | "steward" | "none"`
  - `canMutateUserField(subject: { user_write_mode?: UserWriteMode | null; writable_fields?: string[] | null }, viewer, field, { canEditUser })`
  - Logic: if `canEditUser(viewer, subject.id)` → true for any field except callers still lock login `email` themselves; else `user_write_mode === "steward" && writable_fields.includes(field)`

```ts
export const STEWARD_USER_KEYS = [
  "name",
  "alternative_name",
  "phone_number",
  "communication_email",
  "house_number",
  "street",
  "township",
  "city",
  "region",
  "country",
  "profile_image",
  "id_photo",
] as const;

export function canMutateUserField(args: {
  viewer: accountType;
  subject: Pick<accountType, "id" | "user_write_mode" | "writable_fields">;
  field: string;
}): boolean {
  if (canEditUser(args.viewer, args.subject.id)) return true;
  if (args.subject.user_write_mode !== "steward") return false;
  return (args.subject.writable_fields ?? []).includes(args.field);
}
```

Tests: teacher + steward + `name` → true; teacher + none → false; `canEditUser` still false for teacher viewing student; student + steward + `name` → true; student + `email` not in list → false.

`canUpdateCoverImage(viewer, subjectId)`: `canEditProfileMedia(viewer, subjectId) && !isStudent(viewer)` (cover is not steward). Update `authorization-media.test.ts`: student cannot update **cover** via this helper; student **can** mutate `profile_image` through `canMutateUserField` when mode is steward.

- [ ] **Step 1: Write failing tests**
- [ ] **Step 2: Run** `npm run test:unit -- src/lib/users/steward-fields.test.ts src/helpers/authorization-media.test.ts` — FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: PASS**
- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
Add FE stewardship field helpers without broadening canEditUser.

EOF
)"
```

---

### Task 7: User record Overview + header + history sheet

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/record/sections/record-overview.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/record/record-profile-header-actions.tsx`
- Create: `schedjuice-reimagined-fe/src/app/client-api/user-field-changes.ts`
- Create: `schedjuice-reimagined-fe/src/components/record/user-field-history-sheet.tsx`
- Test: `schedjuice-reimagined-fe/src/lib/users/overview-field-lock.test.ts` (pure: which fields locked given mode)

**Interfaces:**
- Consumes: `canMutateUserField`, `canEditUser`, `listUserFieldChanges`, `listUserImages`
- Produces: Overview locks `name` / phone / comm email / alt name / address unless `canMutateUserField`; login `email` always `locked`. Header: profile photo if `canMutateUserField(..., "profile_image")`; ID photo if `id_photo`; cover if `canUpdateCoverImage`. History button if mode is `full` or `steward` or viewer is subject.

Overview: add `alternative_name` InlineField; add address InlineFields (`house_number` … `country`) in a “Address” `RecordSection`. Each uses `locked={!canMutateUserField({ viewer, subject, field })}`.

Autosave already PUTs a diff — steward-safe if one key.

History sheet: fetch field-changes + `listUserImages(id, "id_image")`; merge by `created_at` descending; show field label, actor name, old → new. 403 → empty state “Not available”.

- [ ] **Step 1: Unit test lock matrix** (steward teacher: name unlocked, email locked, code not shown)
- [ ] **Step 2–4: Implement + PASS**
- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
Unlock allowlisted identity fields on the user record for steward writers.

EOF
)"
```

Do **not** change `RecordRecords` / `InlineGroup` `canEdit`.

---

### Task 8: Policy Overview People data

**Files:**
- Create: `schedjuice-reimagined-fe/src/lib/rbac/people-data-policy.ts`
- Create: `schedjuice-reimagined-fe/src/lib/rbac/people-data-policy.test.ts`
- Modify: `schedjuice-reimagined-fe/src/components/rbac/policy-overview.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/rbac/policy-pdf-document.tsx`

**Interfaces:**
- Produces: `PEOPLE_DATA_POLICY_PARAGRAPHS: string[]` — exact spec copy (four sentences). Rendered **above** the role `<Select>` even when the selected role has zero codes. PDF: same block under the title, before “At a glance”.

Copy (verbatim from spec):

1. Students may update their own full name, alternative name, phone, communication email, address, profile photo, and ID photo.
2. A teacher assigned to a course may update those same fields for students enrolled in that course.
3. People with permission to edit users may update all people fields.
4. These changes are logged on the person’s record. Login email, student code, date of birth, and similar office fields stay office-only.

Test: paragraphs length 4; first includes “full name”; component test optional — prefer testing the constant + that `PolicyOverview` imports it (a small render test that queries “People data” heading is OK if it does not snapshot the whole page).

- [ ] **Step 1–5: TDD, implement, commit**

```bash
git commit -m "$(cat <<'EOF'
Show read-only People data rules on Policy Overview and PDF export.

EOF
)"
```

---

### Task 9: Course Student Info Profile tab

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/course/student-info/course-student-info-tabs.tsx`
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/courses/[id]/student-info/page.tsx` — redirect to `.../profile`
- Create: `schedjuice-reimagined-fe/src/app/(internal)/courses/[id]/student-info/profile/page.tsx`
- Create: `schedjuice-reimagined-fe/src/components/course/student-info/profile/course-student-info-profile.tsx`
- Create: `schedjuice-reimagined-fe/src/components/course/student-info/profile/course-student-info-profile.test.ts` (helpers only)
- Modify: `schedjuice-reimagined-fe/src/config/course-record-nav.ts` only if `isCourseHubRoute` must treat `student-info/profile` like `student-info/photo-gallery` (it already special-cases `student-info` prefix — verify, do not duplicate)

**Interfaces:**
- Consumes: `useCourseHub` (`teacherMemberIds`, `course`, `courseId`), `useUserCoursesList` with `assigned_as=student` (same filters as `students/page.tsx`), `canEditCourse(viewer, teacherMemberIds, createdById)`, `STEWARD_USER_KEYS`, `updateEntity("users", id, { [field]: value })`, `UserFieldHistorySheet`
- Produces: Default Student Info tab **Profile**. Staff-only (existing layout). Search filters by name / alt name / email. Table columns: name, alternative_name, phone_number, communication_email, History. Address + history in a row sheet (not extra columns). No bulk edit. No photo uploader (Photo Gallery unchanged). If `!canEditCourse`, fields read-only (admin still `canEditCourse` via `hasAdminCredentials`).

Helper to test:

```ts
export function courseRosterStewardEnabled(viewer: accountType, ctx: {
  teacherMemberIds: number[];
  createdById?: number | null;
}): boolean {
  return canEditCourse(viewer, ctx.teacherMemberIds, ctx.createdById ?? null);
}
```

Tests: student viewer → false; teacher on roster → true; outsider teacher → false.

Redirect:

```tsx
redirect(`/courses/${id}/student-info/profile`);
```

Tabs array: Profile first (`segment: "profile"`), then photo-gallery, academic-performance.

Inline save: one key per PUT. Empty name: keep client required message; rely on 400 `details`.

- [ ] **Step 1: Helper tests FAIL then PASS**
- [ ] **Step 2: Redirect + tabs**
- [ ] **Step 3: Profile table UI**
- [ ] **Step 4: `npm run test:unit -- src/components/course/student-info/profile/course-student-info-profile.test.ts src/helpers/authorization-student-info.test.ts`** — student info section still hidden for students
- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
Add a course Student Info Profile tab for class-teacher identity edits.

EOF
)"
```

---

## Spec coverage

| Spec requirement | Task |
| --- | --- |
| Code-defined gate; no new RBAC verb | 1 |
| Student self steward; teacher connected steward; office full | 1, 3 |
| Photo-rule connection, not co-enrollment | 1 |
| Allowlist including ID photo | 1, 5 |
| Whole-request 403 on extra keys | 3 |
| `writable_fields` on detail GET only | 3 |
| Silent `UserFieldChange` + office name logged | 2, 3 |
| History GET ACL | 4 |
| Student self `id_image` | 5 |
| `canEditUser` unchanged; per-field helper | 6 |
| User record Overview + header | 7 |
| Policy Overview + PDF | 8 |
| Course Profile tab default; Students page untouched | 9 |
| Data sheet unchanged | 6 (no file touch) |
| Mixed Records groups not unlocked | 7 (explicit non-touch) |
| Mobile unchanged | — |

## Out of scope (do not implement)

Parent accounts, notifications, tenant-editable matrix, data sheet edits, Students membership table editors, custom `filled_by` keys, award-image policy changes, unifying `User.id_photo` with `UserImage`.
