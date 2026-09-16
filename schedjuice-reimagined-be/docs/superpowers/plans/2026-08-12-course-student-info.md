# Course Student Info — Photo Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a staff-only **Student Info** course hub section with a **Photo Gallery** sub-tab (gallery/list views, ID + award photos, course-scoped uploads, per-student history) and an **Academic Performance** "Coming soon" placeholder.

**Architecture:** Extend the existing `UserImage` upload API with optional `course_id` so course teachers can upload without global `user_image.upload.*`. Frontend adds a new rail item, URL-driven sub-tabs, and a photo gallery that batch-loads resolved URLs for enrolled students via existing read APIs. Reuse `UserImageUploadDialog`, history sheet pattern from `UserPhotosSection`, and User Hub toolbar segment toggles.

**Tech Stack:** Django 4 + `django-tenant-schemas`, DRF, React + Next.js App Router, TanStack Query, `nuqs`, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-12-course-student-info-design.md`

## Global Constraints

- Always run backend tests via `./scripts/run_backend_tests.sh <target>` from `schedjuice-reimagined-be`. Never run `manage.py test` without `--keepdb --noinput`. Never use the Railway/dev `DATABASE_URL`.
- Staff only: students must not see the rail item or reach the page (`!isStudent(viewer)`).
- Course-scoped upload: teachers on course roster (mirror FE `canEditCourse`) may upload for enrolled students when `course_id` is sent; global `user_image.upload.*` path unchanged.
- Photo type filter default: `all`. View mode default: `gallery`.
- Reuse append-only `UserImage` history — no new audit model.
- Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`. Max size: `10 * 1024 * 1024` bytes.
- Academic Performance tab: static "Coming soon" only — no API calls.
- Tests follow `.cursor/rules/high-value-tests.mdc`: auth denials, wrong enrollment, regression on global upload path.
- `schedjuice-reimagined-be` and `schedjuice-reimagined-fe` are **separate git repos**. Backend tasks commit in BE; frontend tasks commit in FE. Stage only files listed per task.
- Do **not** change global RBAC defaults for the teacher role.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `app_course/course_student_photos.py` (create) | `user_is_enrolled_student`, `user_is_course_staff`, `course_staff_can_upload_student_image` |
| `app_course/tests/test_course_student_photos.py` (create) | Unit tests for course-scoped upload helper |
| `app_auth/user_image_views.py` (modify) | Course-scoped upload auth on POST; optional `sources` on batch URL response |
| `app_auth/tests/test_user_images.py` (modify) | API tests for `course_id` upload path + regressions |
| `schedjuice-reimagined-fe/src/config/course-record-nav.ts` (modify) | `student-info` rail entry + hub segment |
| `schedjuice-reimagined-fe/src/helpers/authorization.ts` (modify) | `canViewStudentInfoSection`, `canUploadUserImageOnCourse` |
| `schedjuice-reimagined-fe/src/helpers/authorization-student-info.test.ts` (create) | Auth helper tests |
| `schedjuice-reimagined-fe/src/app/client-api/user-images.ts` (modify) | `uploadUserImage` accepts optional `courseId` |
| `schedjuice-reimagined-fe/src/app/client-api/user-images.test.ts` (modify) | Upload with `courseId` test |
| `schedjuice-reimagined-fe/src/hooks/use-user-image-upload.ts` (modify) | Pass `courseId` through mutation |
| `schedjuice-reimagined-fe/src/components/users/user-image-upload-dialog.tsx` (modify) | Optional `courseId` prop |
| `schedjuice-reimagined-fe/src/hooks/course-student-info/use-course-student-photo-filters.ts` (create) | URL-synced `type` + persisted `view` filters |
| `schedjuice-reimagined-fe/src/hooks/course-student-info/use-course-student-photo-urls.ts` (create) | Batch URL fetch for roster student IDs |
| `schedjuice-reimagined-fe/src/components/course/student-info/course-student-info-tabs.tsx` (create) | Sub-tab nav (Photo Gallery \| Academic Performance) |
| `schedjuice-reimagined-fe/src/components/course/student-info/student-photo-history-sheet.tsx` (create) | Extracted history side sheet (from `UserPhotosSection` pattern) |
| `schedjuice-reimagined-fe/src/components/course/student-info/photo-gallery/student-photo-toolbar.tsx` (create) | Type filter, view toggle, search |
| `schedjuice-reimagined-fe/src/components/course/student-info/photo-gallery/student-photo-gallery-card.tsx` (create) | Gallery card per student |
| `schedjuice-reimagined-fe/src/components/course/student-info/photo-gallery/student-photo-gallery-table.tsx` (create) | List view table |
| `schedjuice-reimagined-fe/src/components/course/student-info/photo-gallery/course-student-info-photo-gallery.tsx` (create) | Main gallery orchestrator |
| `schedjuice-reimagined-fe/src/components/course/student-info/academic-performance/course-student-info-academic-performance.tsx` (create) | Placeholder |
| `schedjuice-reimagined-fe/src/app/(internal)/courses/[id]/student-info/page.tsx` (create) | Redirect → photo-gallery |
| `schedjuice-reimagined-fe/src/app/(internal)/courses/[id]/student-info/photo-gallery/page.tsx` (create) | Route shell |
| `schedjuice-reimagined-fe/src/app/(internal)/courses/[id]/student-info/academic-performance/page.tsx` (create) | Route shell |
| `schedjuice-reimagined-fe/src/types/user-image.ts` (modify) | `UserImageBatchResolve` type with optional `sources` |

---

# Phase 1 — Backend: course-scoped upload

### Task 1: Course staff upload helper

**Files:**
- Create: `app_course/course_student_photos.py`
- Create: `app_course/tests/test_course_student_photos.py`

**Interfaces:**
- Produces:
  - `user_is_enrolled_student(course: Course, user: User) -> bool`
  - `user_is_course_staff(actor: User, course: Course) -> bool`
  - `course_staff_can_upload_student_image(actor: User, course: Course, target_user: User) -> bool`

- [ ] **Step 1: Write the failing tests**

Create `app_course/tests/test_course_student_photos.py`:

```python
import unittest
from datetime import date, timedelta
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from django.utils import timezone
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.course_student_photos import course_staff_can_upload_student_image
from app_course.models import Category, Course, Program, UserCourse


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class CourseStudentPhotoAuthTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        today = timezone.localdate()
        with schema_context(self.schema_name):
            cat = Category.objects.create(name=f"Cat {suffix}")
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
            self.teacher = User.objects.create_user(
                email=f"t-{suffix}@example.com",
                password="x",
                name="Teacher",
                phone_number="1",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"t-{suffix}@example.com",
                code=f"t-{suffix}",
                roles=[User.UserRole.TEACHER],
            )
            self.student = User.objects.create_user(
                email=f"s-{suffix}@example.com",
                password="x",
                name="Student",
                phone_number="2",
                date_of_birth=date(2000, 1, 1),
                communication_email=f"s-{suffix}@example.com",
                code=f"s-{suffix}",
                roles=[User.UserRole.STUDENT],
            )
            self.outsider_teacher = User.objects.create_user(
                email=f"o-{suffix}@example.com",
                password="x",
                name="Outsider",
                phone_number="3",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"o-{suffix}@example.com",
                code=f"o-{suffix}",
                roles=[User.UserRole.TEACHER],
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

    def test_course_teacher_can_upload_for_enrolled_student(self):
        with schema_context(self.schema_name):
            self.assertTrue(
                course_staff_can_upload_student_image(
                    self.teacher, self.course, self.student
                )
            )

    def test_outsider_teacher_denied(self):
        with schema_context(self.schema_name):
            self.assertFalse(
                course_staff_can_upload_student_image(
                    self.outsider_teacher, self.course, self.student
                )
            )

    def test_student_actor_denied_even_when_self(self):
        with schema_context(self.schema_name):
            self.assertFalse(
                course_staff_can_upload_student_image(
                    self.student, self.course, self.student
                )
            )
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_course.tests.test_course_student_photos.CourseStudentPhotoAuthTests.test_course_teacher_can_upload_for_enrolled_student`

Expected: FAIL with `ModuleNotFoundError: No module named 'app_course.course_student_photos'`.

- [ ] **Step 3: Implement helper**

Create `app_course/course_student_photos.py`:

```python
from __future__ import annotations

from app_auth.models import User
from app_course.models import Course, UserCourse


def user_is_enrolled_student(course: Course, user: User) -> bool:
    return UserCourse.objects.filter(
        course=course,
        user=user,
        assigned_as=UserCourse.AssignedAs.STUDENT,
    ).exists()


def user_is_course_staff(actor: User, course: Course) -> bool:
    """Mirror FE canEditCourse / BE user_can_edit_course_status semantics."""
    if actor.is_admin():
        return True
    if course.created_by_id == actor.id:
        return True
    return UserCourse.objects.filter(
        course=course,
        user=actor,
        assigned_as=UserCourse.AssignedAs.TEACHER,
    ).exists()


def course_staff_can_upload_student_image(
    actor: User, course: Course, target_user: User
) -> bool:
    if actor.is_student():
        return False
    if not user_is_enrolled_student(course, target_user):
        return False
    return user_is_course_staff(actor, course)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_course.tests.test_course_student_photos`

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-be
git add app_course/course_student_photos.py app_course/tests/test_course_student_photos.py
git commit -m "feat(course): add course-scoped student photo upload auth helper"
```

---

### Task 2: Extend `UserImage` POST with `course_id`

**Files:**
- Modify: `app_auth/user_image_views.py` (POST handler in `UserImageListCreateView`)
- Modify: `app_auth/tests/test_user_images.py` (add `UserImageCourseUploadApiTests` class)

**Interfaces:**
- Consumes: `course_staff_can_upload_student_image` from Task 1
- Produces: POST accepts optional multipart field `course_id` (integer)

- [ ] **Step 1: Write the failing API tests**

Append to `app_auth/tests/test_user_images.py`:

```python
@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class UserImageCourseUploadApiTests(TestCase):
    schema_name = "xschedjuice"
    api_prefix = "/api/v1"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        from app_course.models import Category, Course, Program, UserCourse
        from django.utils import timezone
        from datetime import timedelta

        suffix = uuid4().hex[:6]
        today = timezone.localdate()
        self.client = APIClient()
        with schema_context(self.schema_name):
            seed_rbac()
            cat = Category.objects.create(name=f"Cat {suffix}")
            prog = Program.objects.create(
                name=f"P {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title=f"C {suffix}",
                category=cat,
                program=prog,
                start_date=today,
                end_date=today + timedelta(days=30),
            )
            self.teacher = User.objects.create_user(
                email=f"ct-{suffix}@example.com",
                password="x",
                name="T",
                phone_number="1",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"ct-{suffix}@example.com",
                code=f"ct-{suffix}",
                roles=[User.UserRole.TEACHER],
            )
            self.student = User.objects.create_user(
                email=f"cs-{suffix}@example.com",
                password="x",
                name="S",
                phone_number="2",
                date_of_birth=date(2000, 1, 1),
                communication_email=f"cs-{suffix}@example.com",
                code=f"cs-{suffix}",
                roles=[User.UserRole.STUDENT],
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

    def _auth(self, user):
        self.client.force_authenticate(user=user)

    def test_course_teacher_can_upload_without_global_permission(self):
        self._auth(self.teacher)
        res = self.client.post(
            f"{self.api_prefix}/users/{self.student.id}/user-images",
            {
                "image_type": "award_image",
                "image": _make_jpeg(),
                "course_id": self.course.id,
            },
            format="multipart",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(res.status_code, 201, res.content)

    def test_course_upload_denied_when_student_not_enrolled(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            other = User.objects.create_user(
                email=f"oth-{suffix}@example.com",
                password="x",
                name="O",
                phone_number="9",
                date_of_birth=date(2000, 1, 1),
                communication_email=f"oth-{suffix}@example.com",
                code=f"oth-{suffix}",
                roles=[User.UserRole.STUDENT],
            )
        self._auth(self.teacher)
        res = self.client.post(
            f"{self.api_prefix}/users/{other.id}/user-images",
            {
                "image_type": "award_image",
                "image": _make_jpeg(),
                "course_id": self.course.id,
            },
            format="multipart",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(res.status_code, 400)

    def test_course_upload_denied_for_student_actor(self):
        self._auth(self.student)
        res = self.client.post(
            f"{self.api_prefix}/users/{self.student.id}/user-images",
            {
                "image_type": "award_image",
                "image": _make_jpeg(),
                "course_id": self.course.id,
            },
            format="multipart",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(res.status_code, 403)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_auth.tests.test_user_images.UserImageCourseUploadApiTests.test_course_teacher_can_upload_without_global_permission`

Expected: FAIL with status 403.

- [ ] **Step 3: Implement upload auth branch**

In `app_auth/user_image_views.py`, add imports:

```python
from app_course.course_scoping import user_can_access_course
from app_course.course_student_photos import course_staff_can_upload_student_image
from app_course.models import Course
```

Add helper before `UserImageListCreateView`:

```python
def _actor_can_upload_user_image(
    actor: User, subject: User, image_type: str, course_id_raw
) -> tuple[bool, str | None]:
    """Return (allowed, error_message_for_400)."""
    if _require_upload_permission(actor, image_type):
        return True, None
    if course_id_raw in (None, ""):
        return False, None
    try:
        course_id = int(course_id_raw)
    except (TypeError, ValueError):
        return False, "course_id must be an integer."
    course = Course.objects.filter(pk=course_id).first()
    if course is None:
        return False, None  # handled as 404 by caller if needed
    if not user_can_access_course(actor, course):
        return False, None
    if not course_staff_can_upload_student_image(actor, course, subject):
        if not subject.id or not Course.objects.filter(pk=course_id).exists():
            return False, None
        # enrolled check failure → 400
        from app_course.course_student_photos import user_is_enrolled_student

        if not user_is_enrolled_student(course, subject):
            return False, "Student is not enrolled in this course."
        return False, None
    return True, None
```

Replace POST permission block (lines 83–84):

```python
        course_id_raw = request.data.get("course_id")
        allowed, enrollment_error = _actor_can_upload_user_image(
            actor, subject, image_type, course_id_raw
        )
        if not allowed:
            if enrollment_error:
                return self.bad_request(enrollment_error)
            if course_id_raw not in (None, ""):
                try:
                    cid = int(course_id_raw)
                except (TypeError, ValueError):
                    return self.bad_request("course_id must be an integer.")
                if not Course.objects.filter(pk=cid).exists():
                    return self.not_found("Course not found.")
            return self.forbidden("Missing permission for this image type.")
```

- [ ] **Step 4: Run tests**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_auth.tests.test_user_images.UserImageCourseUploadApiTests`

Expected: PASS (3 tests).

Also run: `./scripts/run_backend_tests.sh app_auth.tests.test_user_images.UserImageApiTests.test_upload_denied_without_permission`

Expected: PASS (regression — teacher without course_id still denied).

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-be
git add app_auth/user_image_views.py app_auth/tests/test_user_images.py
git commit -m "feat(auth): allow course-scoped user image uploads via course_id"
```

---

### Task 3: Batch URL response includes `sources` for legacy badge

**Files:**
- Modify: `app_auth/user_image_views.py` (`UserImageUrlsView.post`)
- Modify: `app_auth/tests/test_user_images.py` (one batch test)

**Interfaces:**
- Produces: `POST /user-image-urls` response shape `{ urls: Record<string, string|null>, sources: Record<string, string|null> }`

- [ ] **Step 1: Write failing test**

Add to `UserImageApiTests` or new class:

```python
    def test_batch_urls_include_sources(self):
        with schema_context(self.schema_name):
            self.student.id_photo = _make_jpeg()
            self.student.save(update_fields=["id_photo"])
        self._auth(self.hr)
        res = self.client.post(
            f"{self.api_prefix}/user-image-urls",
            {"user_ids": [self.student.id], "image_type": "id_image"},
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(res.status_code, 200)
        data = res.data["data"]
        self.assertEqual(data["sources"][str(self.student.id)], "legacy_id_photo")
```

- [ ] **Step 2: Run test — expect FAIL** (KeyError on `sources`)

- [ ] **Step 3: Extend `UserImageUrlsView.post`**

```python
        urls: dict[str, str | None] = {}
        sources: dict[str, str | None] = {}
        for uid in user_ids:
            target = users.get(uid)
            if target is None or not user_can_access_user(actor, target):
                continue
            resolved = resolve_user_image(target, image_type, expire=URL_EXPIRE)
            urls[str(uid)] = resolved.url if resolved else None
            sources[str(uid)] = resolved.source if resolved else None
        return self.ok({"urls": urls, "sources": sources})
```

- [ ] **Step 4: Run test — expect PASS**

Run: `./scripts/run_backend_tests.sh app_auth.tests.test_user_images.UserImageApiTests.test_batch_urls_include_sources`

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-be
git add app_auth/user_image_views.py app_auth/tests/test_user_images.py
git commit -m "feat(auth): include image source metadata in batch user-image-urls"
```

---

# Phase 2 — Frontend foundation

### Task 4: Authorization helpers

**Files:**
- Modify: `schedjuice-reimagined-fe/src/helpers/authorization.ts`
- Create: `schedjuice-reimagined-fe/src/helpers/authorization-student-info.test.ts`

**Interfaces:**
- Produces:
  - `canViewStudentInfoSection(viewer: accountType): boolean`
  - `canUploadUserImageOnCourse(viewer, imageType, ctx): boolean`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, expect, it } from "vitest";
import {
  canUploadUserImageOnCourse,
  canViewStudentInfoSection,
} from "@/helpers/authorization";
import { role, type accountType } from "@/types/user";

function user(id: number, roles: role[]): accountType {
  return { id, roles } as accountType;
}

describe("student info authorization", () => {
  it("hides section from students", () => {
    expect(canViewStudentInfoSection(user(1, [role.student]))).toBe(false);
  });

  it("shows section to teachers", () => {
    expect(canViewStudentInfoSection(user(2, [role.teacher]))).toBe(true);
  });

  it("allows course teacher to upload on course", () => {
    const teacher = user(10, [role.teacher]);
    expect(
      canUploadUserImageOnCourse(teacher, "id_image", {
        teacherMemberIds: [10],
        createdById: null,
      }),
    ).toBe(true);
  });

  it("denies outsider teacher", () => {
    const teacher = user(10, [role.teacher]);
    expect(
      canUploadUserImageOnCourse(teacher, "id_image", {
        teacherMemberIds: [99],
        createdById: null,
      }),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`canViewStudentInfoSection is not exported`)

Run: `cd schedjuice-reimagined-fe && npm run test -- src/helpers/authorization-student-info.test.ts`

- [ ] **Step 3: Implement**

In `authorization.ts`:

```typescript
export const canViewStudentInfoSection = (viewer: accountType | undefined | null) =>
  Boolean(viewer && !isStudent(viewer));

export const canUploadUserImageOnCourse = (
  viewer: accountType,
  _imageType: UserImageType,
  ctx: { teacherMemberIds: number[]; createdById?: number | null },
) => canEditCourse(viewer, ctx.teacherMemberIds, ctx.createdById ?? null);
```

Import `UserImageType` from `@/types/user-image`.

Upload visibility in UI: `canUploadUserImageOnCourse(...) || canUploadUserImage(...)`.

- [ ] **Step 4: Run tests — PASS**

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/helpers/authorization.ts src/helpers/authorization-student-info.test.ts
git commit -m "feat(auth): add student info section authorization helpers"
```

---

### Task 5: Upload API + hook accept `courseId`

**Files:**
- Modify: `schedjuice-reimagined-fe/src/app/client-api/user-images.ts`
- Modify: `schedjuice-reimagined-fe/src/app/client-api/user-images.test.ts`
- Modify: `schedjuice-reimagined-fe/src/hooks/use-user-image-upload.ts`
- Modify: `schedjuice-reimagined-fe/src/components/users/user-image-upload-dialog.tsx`
- Modify: `schedjuice-reimagined-fe/src/types/user-image.ts` (batch response type)

- [ ] **Step 1: Write failing upload test**

Add to `user-images.test.ts`:

```typescript
  it("includes course_id in multipart upload when provided", async () => {
    postMock.mockResolvedValue({
      data: { data: { id: 1, image_type: "award_image" } },
    });
    const file = new File(["x"], "a.jpg", { type: "image/jpeg" });
    const { uploadUserImage } = await import("@/app/client-api/user-images");
    await uploadUserImage(7, "award_image", file, { courseId: 42 });
    const [, body] = postMock.mock.calls[0];
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get("course_id")).toBe("42");
  });
```

Update `uploadUserImage` signature:

```typescript
export async function uploadUserImage(
  userId: number,
  imageType: UserImageType,
  file: File,
  opts?: { courseId?: number },
): Promise<UserImageRow> {
  const formData = new FormData();
  formData.append("image_type", imageType);
  formData.append("image", file);
  if (opts?.courseId != null) {
    formData.append("course_id", String(opts.courseId));
  }
  // ... rest unchanged
}
```

Update `fetchUserImageUrls` return type:

```typescript
export type UserImageBatchResult = {
  urls: Record<string, string | null>;
  sources: Record<string, string | null>;
};

export async function fetchUserImageUrls(
  userIds: number[],
  imageType: UserImageType,
): Promise<UserImageBatchResult> {
  const res = await axiosClient.post<ApiEnvelope<UserImageBatchResult>>(
    "user-image-urls",
    { user_ids: userIds, image_type: imageType },
  );
  const data = res.data.data;
  return {
    urls: data.urls ?? {},
    sources: data.sources ?? {},
  };
}
```

Update existing `fetchUserImageUrls` test to expect `sources` key.

Extend `useUserImageUpload`:

```typescript
mutationFn: async ({
  imageType,
  file,
  courseId,
}: {
  imageType: UserImageType;
  file: File;
  courseId?: number;
}) => uploadUserImage(userId, imageType, file, { courseId }),
```

Add optional `courseId?: number` to `UserImageUploadDialog` and pass to `uploadUserImage({ imageType, file, courseId })`.

- [ ] **Step 2–4: Run tests — PASS**

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/app/client-api/user-images.ts src/app/client-api/user-images.test.ts \
  src/hooks/use-user-image-upload.ts src/components/users/user-image-upload-dialog.tsx \
  src/types/user-image.ts
git commit -m "feat(user-images): support course_id on upload and batch sources"
```

---

### Task 6: Course nav + routes + sub-tab shell

**Files:**
- Modify: `schedjuice-reimagined-fe/src/config/course-record-nav.ts`
- Create: `schedjuice-reimagined-fe/src/components/course/student-info/course-student-info-tabs.tsx`
- Create: `schedjuice-reimagined-fe/src/app/(internal)/courses/[id]/student-info/page.tsx`
- Create: `schedjuice-reimagined-fe/src/app/(internal)/courses/[id]/student-info/photo-gallery/page.tsx` (shell)
- Create: `schedjuice-reimagined-fe/src/app/(internal)/courses/[id]/student-info/academic-performance/page.tsx`
- Create: `schedjuice-reimagined-fe/src/components/course/student-info/academic-performance/course-student-info-academic-performance.tsx`

- [ ] **Step 1: Add nav entry**

In `course-record-nav.ts`:

```typescript
import { isStudent } from "@/helpers/authorization"; // if not already

export type CourseRecordNavId =
  | "overview"
  // ...
  | "student-info";

// In COURSE_RECORD_NAV_ENTRIES, after students:
{
  id: "student-info",
  label: "Student Info",
  segment: "student-info",
  group: "roster",
  canShow: (user) => !isStudent(user),
},
```

`HUB_SEGMENTS` is derived from entries — no manual change needed if filter logic unchanged.

- [ ] **Step 2: Create redirect page**

`student-info/page.tsx`:

```typescript
import { redirect } from "next/navigation";

export default function CourseStudentInfoIndexPage({
  params,
}: {
  params: { id: string };
}) {
  redirect(`/courses/${params.id}/student-info/photo-gallery`);
}
```

- [ ] **Step 3: Create sub-tab component**

`course-student-info-tabs.tsx` — use `Link` + `usePathname` for active state:

```typescript
const TABS = [
  { segment: "photo-gallery", label: "Photo Gallery" },
  { segment: "academic-performance", label: "Academic Performance" },
] as const;
```

Render `ToolbarSegmentGroup` (same primitives as User Hub).

- [ ] **Step 4: Academic Performance placeholder**

```typescript
export function CourseStudentInfoAcademicPerformance() {
  return (
    <div className="rounded-md border border-border p-8 text-center">
      <h2 className="text-lg font-medium">Academic Performance</h2>
      <p className="mt-2 text-sm text-muted-foreground">Coming soon.</p>
    </div>
  );
}
```

- [ ] **Step 5: Wire route pages**

Both sub-route pages use `PageContainer`, `useCourseHub`, `CourseStudentInfoTabs`, and gate with `canViewStudentInfoSection` — redirect to `/courses/:id` or show forbidden message if student.

- [ ] **Step 6: Manual smoke**

Navigate to `/courses/<id>/student-info` → redirects to photo-gallery; rail shows **Student Info** for teacher, hidden for student.

- [ ] **Step 7: Commit**

```bash
git add src/config/course-record-nav.ts src/components/course/student-info/ \
  src/app/(internal)/courses/[id]/student-info/
git commit -m "feat(course): add Student Info hub section routes and tabs"
```

---

# Phase 3 — Photo Gallery UI

### Task 7: Filters hook + batch URL hook

**Files:**
- Create: `schedjuice-reimagined-fe/src/hooks/course-student-info/use-course-student-photo-filters.ts`
- Create: `schedjuice-reimagined-fe/src/hooks/course-student-info/use-course-student-photo-urls.ts`

**Interfaces:**
- Produces:
  - `useCourseStudentPhotoFilters()` → `{ type: "all"|"id"|"award", view: "gallery"|"list", search, setters }`
  - `useCourseStudentPhotoUrls(studentIds, typeFilter)` → `{ idUrls, awardUrls, idSources, awardSources, isLoading }`

- [ ] **Step 1: Implement filters hook with nuqs**

```typescript
const parsers = {
  type: parseAsStringEnum(["all", "id", "award"]).withDefault("all"),
  view: parseAsStringEnum(["gallery", "list"]).withDefault("gallery"),
};
```

Persist `view` to `localStorage` key `schedjuice:student-info-photo-view` on change (read on mount).

- [ ] **Step 2: Implement batch URL hook**

```typescript
export function useCourseStudentPhotoUrls(
  studentIds: number[],
  typeFilter: "all" | "id" | "award",
) {
  const needId = typeFilter === "all" || typeFilter === "id";
  const needAward = typeFilter === "all" || typeFilter === "award";

  const idQuery = useQuery({
    queryKey: ["course-student-photo-urls", "id_image", studentIds],
    queryFn: () => fetchUserImageUrls(studentIds, "id_image"),
    enabled: needId && studentIds.length > 0,
  });
  const awardQuery = useQuery({
    queryKey: ["course-student-photo-urls", "award_image", studentIds],
    queryFn: () => fetchUserImageUrls(studentIds, "award_image"),
    enabled: needAward && studentIds.length > 0,
  });

  return {
    idUrls: idQuery.data?.urls ?? {},
    idSources: idQuery.data?.sources ?? {},
    awardUrls: awardQuery.data?.urls ?? {},
    awardSources: awardQuery.data?.sources ?? {},
    isLoading: (needId && idQuery.isLoading) || (needAward && awardQuery.isLoading),
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/course-student-info/
git commit -m "feat(course): add student photo gallery data hooks"
```

---

### Task 8: History sheet component

**Files:**
- Create: `schedjuice-reimagined-fe/src/components/course/student-info/student-photo-history-sheet.tsx`

**Interfaces:**
- Props: `{ open, onOpenChange, userId, userName, imageType: UserImageType }`

- [ ] **Step 1: Extract sheet from `UserPhotosSection`**

Copy the `Sheet` block from `user-photos-section.tsx` into `StudentPhotoHistorySheet`. Use `listUserImages(userId, imageType)` via `useQuery` with `enabled: open`.

- [ ] **Step 2: (Optional refactor)** Update `UserPhotosSection` to use `StudentPhotoHistorySheet` to avoid duplication.

- [ ] **Step 3: Commit**

```bash
git add src/components/course/student-info/student-photo-history-sheet.tsx \
  src/components/users/user-photos-section.tsx
git commit -m "refactor(users): extract shared student photo history sheet"
```

---

### Task 9: Gallery card + list table + toolbar

**Files:**
- Create: `photo-gallery/student-photo-toolbar.tsx`
- Create: `photo-gallery/student-photo-gallery-card.tsx`
- Create: `photo-gallery/student-photo-gallery-table.tsx`

- [ ] **Step 1: Toolbar**

Three `ToolbarSegmentToggle` groups:
1. Type: All | ID Photos | Award Photos
2. View: Gallery | List (icons from `iconoir-react`: `ViewGrid`, `List`)
3. Search `Input`

- [ ] **Step 2: Gallery card**

Props:

```typescript
type StudentPhotoGalleryCardProps = {
  student: { id: number; name: string | null; email?: string | null };
  typeFilter: "all" | "id" | "award";
  idUrl: string | null;
  awardUrl: string | null;
  idSource: string | null;
  canUploadId: boolean;
  canUploadAward: boolean;
  courseId: number;
  teacherMemberIds: number[];
  createdById: number | null;
  viewer: accountType;
};
```

Render photo slots, legacy badge when `idSource === "legacy_id_photo"`, `FullScreenImageViewer` on click, Upload + History buttons.

- [ ] **Step 3: List table**

Use `ResourceTable` with dynamic columns based on `typeFilter`. Thumbnail cells use `<Image unoptimized />` or placeholder.

- [ ] **Step 4: Commit**

```bash
git add src/components/course/student-info/photo-gallery/
git commit -m "feat(course): add student photo gallery card, table, and toolbar"
```

---

### Task 10: Main gallery page assembly

**Files:**
- Create: `photo-gallery/course-student-info-photo-gallery.tsx`
- Modify: `photo-gallery/page.tsx` (mount gallery component)

- [ ] **Step 1: Load roster**

Mirror `students/page.tsx`:

```typescript
const list = useUserCoursesList({
  filters: [
    { field_name: "course", operator: operatorEnum.exact, value: courseId },
    { field_name: "assigned_as", operator: operatorEnum.exact, value: "student" },
  ],
  fields: ["id", "user"],
});
```

Map rows → `{ id, name, email }` from nested `user` object.

- [ ] **Step 2: Filter by search client-side**

- [ ] **Step 3: Render toolbar + gallery grid or table**

Query key for uploads: `["course-student-info-photos", courseId]`.

Pass `courseId` to every `UserImageUploadDialog`.

- [ ] **Step 4: Empty states**

- No students enrolled: "No students in this class yet."
- Loading: `Skeleton` grid

- [ ] **Step 5: Commit**

```bash
git add src/components/course/student-info/photo-gallery/course-student-info-photo-gallery.tsx \
  src/app/(internal)/courses/[id]/student-info/photo-gallery/page.tsx
git commit -m "feat(course): wire student photo gallery page"
```

---

### Task 11: Frontend component tests

**Files:**
- Create: `schedjuice-reimagined-fe/src/components/course/student-info/photo-gallery/student-photo-gallery-card.test.tsx`

- [ ] **Step 1: Write tests**

```typescript
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StudentPhotoGalleryCard } from "./student-photo-gallery-card";
import { role, type accountType } from "@/types/user";

vi.mock("@/components/users/user-image-upload-dialog", () => ({
  UserImageUploadDialog: () => null,
}));

const viewer = { id: 1, roles: [role.teacher] } as accountType;

describe("StudentPhotoGalleryCard", () => {
  it("shows upload when course teacher can upload", () => {
    render(
      <StudentPhotoGalleryCard
        student={{ id: 7, name: "Jane" }}
        typeFilter="id"
        idUrl={null}
        awardUrl={null}
        idSource={null}
        canUploadId
        canUploadAward={false}
        courseId={99}
        teacherMemberIds={[1]}
        createdById={null}
        viewer={viewer}
      />,
    );
    expect(screen.getByRole("button", { name: /upload/i })).toBeTruthy();
  });

  it("hides award slot when filter is id", () => {
    render(
      <StudentPhotoGalleryCard
        student={{ id: 7, name: "Jane" }}
        typeFilter="id"
        idUrl={null}
        awardUrl="https://example.com/a.jpg"
        idSource={null}
        canUploadId
        canUploadAward
        courseId={99}
        teacherMemberIds={[1]}
        createdById={null}
        viewer={viewer}
      />,
    );
    expect(screen.queryByText(/award/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — PASS**

Run: `npm run test -- src/components/course/student-info/photo-gallery/student-photo-gallery-card.test.tsx`

- [ ] **Step 3: Commit**

```bash
git add src/components/course/student-info/photo-gallery/student-photo-gallery-card.test.tsx
git commit -m "test(course): cover student photo gallery card upload visibility"
```

---

## Self-Review (plan vs spec)

| Spec requirement | Task |
|---|---|
| New rail item Student Info | Task 6 |
| Staff only visibility | Task 4, 6 |
| Sub-tabs Photo Gallery + Academic Performance | Task 6 |
| All / ID / Award filter | Task 7, 9 |
| Gallery default + list view | Task 7, 9 |
| Course-scoped upload | Task 1, 2, 5 |
| Per-student history | Task 8 |
| Reuse UserImage APIs | Task 2, 5, 7 |
| Legacy id_photo badge | Task 3 |
| High-value tests | Tasks 1–3, 4, 11 |
| Academic Performance coming soon | Task 6 |

No placeholders remain. `useGridViewPreference` corrected to dedicated gallery/list hook in Task 7.

---

## Manual test checklist

1. Log in as **course teacher** (no global `user_image.upload.*`) → open Student Info → upload ID + award photo for enrolled student → succeeds.
2. Log in as **outsider teacher** → no upload button / API returns 403.
3. Log in as **student** → rail item hidden; direct URL blocked or redirected.
4. Toggle **All / ID / Award** filter → correct slots/columns shown.
5. Toggle **Gallery / List** → layout switches; preference persists on reload.
6. Open **History** → prior uploads listed newest-first with uploader.
7. Student with only legacy `id_photo` → ID slot shows image + legacy badge.
8. **Academic Performance** tab → "Coming soon" only.
