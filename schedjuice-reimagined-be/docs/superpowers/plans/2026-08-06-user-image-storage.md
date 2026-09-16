# User Image Storage (`UserImage`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add append-only typed user photo storage (`award_image`, `id_image`) with RBAC, resolve API, and profile Photos UI — without certificate integration in v1.

**Architecture:** New `UserImage` model in `app_auth` stores each upload as its own row with `ImageField` on private S3. A shared `resolve_user_image()` helper resolves the latest row per type, with `id_image` falling back to legacy `User.id_photo`. Dedicated REST endpoints handle upload, history, resolve, and batch presigned URLs. Frontend adds a Photos section on user profile wired to the new API and RBAC permissions.

**Tech Stack:** Django 4 + `django-tenant-schemas`, DRF, `PrivateMediaStorage` (S3), Pillow (tests), React + TanStack Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-06-user-image-design.md`

## Global Constraints

- Always run backend tests via `./scripts/run_backend_tests.sh <target>` from `schedjuice-reimagined-be`. Never run `manage.py test` without `--keepdb --noinput`. Never use the Railway/dev `DATABASE_URL`.
- `award_image` resolve returns **null when no upload** — no fallback chain.
- `id_image` resolve falls back to legacy `User.id_photo` only; new uploads **do not** sync to `User.id_photo`.
- Allowed MIME types: `image/jpeg`, `image/png`, `image/webp` only. Max size: `10 * 1024 * 1024` bytes.
- Append-only in v1 — no update/delete endpoints.
- Certificate generation integration is **out of scope for v1**.
- No backfill of existing `User.id_photo` into `UserImage`.
- Tests follow `.cursor/rules/high-value-tests.mdc`: auth denials, scope checks, resolve invariants, invalid input — not happy-path-only smoke.
- `schedjuice-reimagined-be` and `schedjuice-reimagined-fe` are **separate git repos**. Backend tasks commit in BE; frontend tasks commit in FE. Stage only files listed per task.
- New `app_auth` migration must depend on `0077_microsoft_delegated_oauth`. Check `ls app_auth/migrations/` before naming.
- New `app_rbac` migration must depend on `0017_payment_show_fee`. Check `ls app_rbac/migrations/` before naming.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `app_auth/models.py` (modify) | `UserImage` model + upload helper |
| `app_auth/migrations/0078_userimage.py` (create) | Schema for `UserImage` |
| `app_auth/user_image_validation.py` (create) | MIME/size validation constants + validator |
| `app_auth/user_images.py` (create) | `ResolvedUserImage`, `resolve_user_image`, permission helpers |
| `app_auth/user_image_serializers.py` (create) | `UserImageSerializer`, resolve payload serializer |
| `app_auth/user_image_views.py` (create) | Upload, list, resolve, batch URL views |
| `app_auth/urls.py` (modify) | Wire four new routes |
| `app_auth/tests/test_user_images.py` (create) | API + resolve high-value tests |
| `app_rbac/catalog.py` (modify) | Four new permissions |
| `app_rbac/defaults.py` (modify) | Default role grants |
| `app_rbac/migrations/0018_user_image_permissions.py` (create) | Re-seed RBAC |
| `schedjuice-reimagined-fe/src/types/user-image.ts` (create) | `UserImageType`, response types |
| `schedjuice-reimagined-fe/src/app/client-api/user-images.ts` (create) | Upload/list/resolve/batch API client |
| `schedjuice-reimagined-fe/src/app/client-api/user-images.test.ts` (create) | Client helper tests |
| `schedjuice-reimagined-fe/src/helpers/authorization.ts` (modify) | `canUploadUserImage`, `canViewUserImage` |
| `schedjuice-reimagined-fe/src/helpers/authorization-user-images.test.ts` (create) | Permission helper tests |
| `schedjuice-reimagined-fe/src/hooks/use-user-image-upload.ts` (create) | Upload mutation + query invalidation |
| `schedjuice-reimagined-fe/src/components/users/user-photos-section.tsx` (create) | Photos section + history drawer |
| `schedjuice-reimagined-fe/src/components/record/sections/record-overview.tsx` (modify) | Mount `UserPhotosSection` |

---

# Phase 1 — Backend foundation

### Task 1: `UserImage` model and migration

**Files:**
- Modify: `app_auth/models.py` (after `UserCertification`, before next unrelated model)
- Create: `app_auth/migrations/0078_userimage.py`

**Interfaces:**
- Produces: `UserImage.ImageType` enum (`award_image`, `id_image`); model accessible as `User.user_images` related name.

- [ ] **Step 1: Write the failing test**

Create `app_auth/tests/test_user_images.py` with only the model smoke test for now:

```python
import io
import unittest
from datetime import date
from uuid import uuid4

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from PIL import Image
from tenant_schemas.utils import schema_context

from app_auth.models import User, UserImage

def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False

def _make_jpeg():
    buf = io.BytesIO()
    Image.new("RGB", (80, 100), color=(120, 140, 160)).save(buf, format="JPEG")
    return SimpleUploadedFile("photo.jpg", buf.getvalue(), content_type="image/jpeg")

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class UserImageModelTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def test_creates_user_image_row(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            user = User.objects.create_user(
                email=f"ui-{suffix}@example.com",
                password="x",
                name="Stu",
                phone_number="1",
                date_of_birth=date(2000, 1, 1),
                communication_email=f"ui-{suffix}@example.com",
                code=f"ui-{suffix}",
                roles=[User.UserRole.STUDENT],
            )
            row = UserImage.objects.create(
                user=user,
                image_type=UserImage.ImageType.AWARD_IMAGE,
                image=_make_jpeg(),
                uploaded_by=user,
            )
            self.assertEqual(row.image_type, "award_image")
            self.assertEqual(user.user_images.count(), 1)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/run_backend_tests.sh app_auth.tests.test_user_images.UserImageModelTests.test_creates_user_image_row`
Expected: FAIL with `ImportError: cannot import name 'UserImage'`.

- [ ] **Step 3: Add model and migration**

In `app_auth/models.py`, add upload helper near existing photo helpers:

```python
def get_tenant_specific_upload_folder_for_user_images(instance, filename):
    return get_tenant_specific_upload_folder(filename, "user_images")
```

Add model:

```python
class UserImage(BaseModel):
    class ImageType(models.TextChoices):
        AWARD_IMAGE = "award_image", "Award image"
        ID_IMAGE = "id_image", "ID image"

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="user_images",
    )
    image_type = models.CharField(max_length=32, choices=ImageType.choices)
    image = models.ImageField(
        upload_to=get_tenant_specific_upload_folder_for_user_images,
        storage=PrivateMediaStorage(),
    )
    uploaded_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="uploaded_user_images",
    )

    class Meta:
        indexes = [
            models.Index(fields=["user", "image_type", "-created_at"]),
        ]
```

Run: `./env/bin/python manage.py makemigrations app_auth --name userimage`
Expected: creates `0078_userimage.py`.

- [ ] **Step 4: Run test to verify it passes**

Run: `./scripts/run_backend_tests.sh app_auth.tests.test_user_images.UserImageModelTests`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app_auth/models.py app_auth/migrations/0078_userimage.py app_auth/tests/test_user_images.py
git commit -m "feat(auth): add UserImage model for typed user photos"
```

---

### Task 2: RBAC permissions and default grants

**Files:**
- Modify: `app_rbac/catalog.py` (Personal / user section)
- Modify: `app_rbac/defaults.py`
- Create: `app_rbac/migrations/0018_user_image_permissions.py`

**Interfaces:**
- Produces: permission codes `user_image.upload.award_image`, `user_image.upload.id_image`, `user_image.view.award_image`, `user_image.view.id_image`.

- [ ] **Step 1: Write the failing test**

Append to `app_auth/tests/test_user_images.py`:

```python
from app_rbac.seeding import seed_rbac
from app_rbac.resolution import effective_permissions

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class UserImagePermissionSeedTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def test_student_has_award_image_upload_and_view(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            seed_rbac()
            student = User.objects.create_user(
                email=f"perm-s-{suffix}@example.com",
                password="x",
                name="Stu",
                phone_number="1",
                date_of_birth=date(2000, 1, 1),
                communication_email=f"perm-s-{suffix}@example.com",
                code=f"perm-s-{suffix}",
                roles=[User.UserRole.STUDENT],
            )
            perms = set(effective_permissions(student))
        self.assertIn("user_image.upload.award_image", perms)
        self.assertIn("user_image.view.award_image", perms)
        self.assertNotIn("user_image.upload.id_image", perms)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/run_backend_tests.sh app_auth.tests.test_user_images.UserImagePermissionSeedTests.test_student_has_award_image_upload_and_view`
Expected: FAIL — permission not in effective set.

- [ ] **Step 3: Register permissions and defaults**

In `app_rbac/catalog.py`, after existing user permissions:

```python
    _p(
        "user_image.upload.award_image",
        "Upload award photos",
        "upload award photos for users",
        "Personal",
    ),
    _p(
        "user_image.upload.id_image",
        "Upload ID photos",
        "upload ID photos for users",
        "Personal",
    ),
    _p(
        "user_image.view.award_image",
        "View award photos",
        "view award photos for users",
        "Personal",
    ),
    _p(
        "user_image.view.id_image",
        "View ID photos",
        "view ID photos for users",
        "Personal",
    ),
```

In `app_rbac/defaults.py`, append to role lists:

- `admin`, `manager`: all four codes
- `hr`: all four codes
- `teacher`: `user_image.view.award_image`, `user_image.view.id_image`
- `student`: `user_image.upload.award_image`, `user_image.view.award_image`

Create `app_rbac/migrations/0018_user_image_permissions.py`:

```python
from django.db import migrations


def forwards(apps, schema_editor):
    from app_rbac.seeding import seed_rbac
    seed_rbac()


def backwards(apps, schema_editor):
    Role = apps.get_model("app_rbac", "Role")
    RolePermission = apps.get_model("app_rbac", "RolePermission")
    codes = [
        "user_image.upload.award_image",
        "user_image.upload.id_image",
        "user_image.view.award_image",
        "user_image.view.id_image",
    ]
    for slug in ("admin", "manager", "hr", "teacher", "student"):
        role = Role.objects.filter(slug=slug, is_system=True).first()
        if role:
            RolePermission.objects.filter(role=role, permission_code__in=codes).delete()
    from app_rbac.cache import bump_matrix_generation
    from django.db import connection
    bump_matrix_generation(getattr(connection, "schema_name", None) or "public")


class Migration(migrations.Migration):
    dependencies = [("app_rbac", "0017_payment_show_fee")]
    operations = [migrations.RunPython(forwards, backwards)]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./scripts/run_backend_tests.sh app_auth.tests.test_user_images.UserImagePermissionSeedTests`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app_rbac/catalog.py app_rbac/defaults.py app_rbac/migrations/0018_user_image_permissions.py app_auth/tests/test_user_images.py
git commit -m "feat(rbac): add user_image permissions with default role grants"
```

---

### Task 3: Upload validation module

**Files:**
- Create: `app_auth/user_image_validation.py`
- Modify: `app_auth/tests/test_user_images.py`

**Interfaces:**
- Produces: `validate_user_image_upload(uploaded_file, filename) -> str` (detected MIME); raises `django.core.exceptions.ValidationError`.

- [ ] **Step 1: Write the failing test**

Append to `app_auth/tests/test_user_images.py`:

```python
from django.core.exceptions import ValidationError

from app_auth.user_image_validation import MAX_USER_IMAGE_BYTES, validate_user_image_upload

class UserImageValidationTests(TestCase):
    def test_accepts_jpeg(self):
        f = _make_jpeg()
        self.assertEqual(validate_user_image_upload(f, "photo.jpg"), "image/jpeg")

    def test_rejects_pdf(self):
        pdf = SimpleUploadedFile("scan.pdf", b"%PDF-1.4 junk", content_type="application/pdf")
        with self.assertRaises(ValidationError):
            validate_user_image_upload(pdf, "scan.pdf")

    def test_rejects_oversize(self):
        huge = SimpleUploadedFile(
            "big.jpg",
            b"\xff\xd8\xff" + b"x" * (MAX_USER_IMAGE_BYTES + 1),
            content_type="image/jpeg",
        )
        with self.assertRaises(ValidationError):
            validate_user_image_upload(huge, "big.jpg")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/run_backend_tests.sh app_auth.tests.test_user_images.UserImageValidationTests`
Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Implement validation**

Create `app_auth/user_image_validation.py`:

```python
from __future__ import annotations

from pathlib import Path

from django.core.exceptions import ValidationError

from app_attachment.validation import MIME_TO_ALLOWED_EXTENSIONS, sniff_upload_mime
from app_custom_fields.attachment_rules import FILE_TYPE_PRESET_IMAGE

MAX_USER_IMAGE_BYTES = 10 * 1024 * 1024
ALLOWED_USER_IMAGE_MIMES = frozenset({"image/jpeg", "image/png", "image/webp"})
ALLOWED_USER_IMAGE_EXTENSIONS = FILE_TYPE_PRESET_IMAGE["extensions"] - {".gif"}


def validate_user_image_upload(uploaded_file, filename: str) -> str:
    ext = Path(filename or "").suffix.lower()
    if ext not in ALLOWED_USER_IMAGE_EXTENSIONS:
        raise ValidationError({"image": f"File extension '{ext}' is not allowed."})

    size = getattr(uploaded_file, "size", 0) or 0
    if size > MAX_USER_IMAGE_BYTES:
        raise ValidationError({"image": "File exceeds 10 MB maximum size."})

    detected_mime = sniff_upload_mime(uploaded_file, filename)
    if detected_mime not in ALLOWED_USER_IMAGE_MIMES:
        raise ValidationError({"image": f"MIME type '{detected_mime}' is not allowed."})

    allowed_exts = MIME_TO_ALLOWED_EXTENSIONS.get(detected_mime)
    if allowed_exts and ext not in allowed_exts:
        raise ValidationError({"image": f"Extension '{ext}' does not match MIME '{detected_mime}'."})
    return detected_mime
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./scripts/run_backend_tests.sh app_auth.tests.test_user_images.UserImageValidationTests`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app_auth/user_image_validation.py app_auth/tests/test_user_images.py
git commit -m "feat(auth): validate user image uploads (jpeg/png/webp, 10MB)"
```

---

### Task 4: Resolution service

**Files:**
- Create: `app_auth/user_images.py`
- Modify: `app_auth/tests/test_user_images.py`

**Interfaces:**
- Produces:
  - `ResolvedUserImage(source: str, url: str | None, user_image_id: int | None, created_at: datetime | None)`
  - `resolve_user_image(user, image_type: str, *, expire: int = 3600) -> ResolvedUserImage | None`
  - `user_image_upload_permission(image_type: str) -> str`
  - `user_image_view_permission(image_type: str) -> str`

- [ ] **Step 1: Write the failing tests**

Append to `app_auth/tests/test_user_images.py`:

```python
from app_auth.user_images import resolve_user_image

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class ResolveUserImageTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            self.user = User.objects.create_user(
                email=f"res-{suffix}@example.com",
                password="x",
                name="Stu",
                phone_number="1",
                date_of_birth=date(2000, 1, 1),
                communication_email=f"res-{suffix}@example.com",
                code=f"res-{suffix}",
                roles=[User.UserRole.STUDENT],
            )

    def test_id_image_falls_back_to_legacy_id_photo(self):
        with schema_context(self.schema_name):
            self.user.id_photo = _make_jpeg()
            self.user.save(update_fields=["id_photo"])
            resolved = resolve_user_image(self.user, UserImage.ImageType.ID_IMAGE, expire=60)
        self.assertIsNotNone(resolved)
        self.assertEqual(resolved.source, "legacy_id_photo")
        self.assertIsNotNone(resolved.url)

    def test_award_image_returns_none_without_upload(self):
        with schema_context(self.schema_name):
            resolved = resolve_user_image(self.user, UserImage.ImageType.AWARD_IMAGE)
        self.assertIsNone(resolved)

    def test_latest_user_image_wins(self):
        with schema_context(self.schema_name):
            UserImage.objects.create(
                user=self.user,
                image_type=UserImage.ImageType.AWARD_IMAGE,
                image=_make_jpeg(),
                uploaded_by=self.user,
            )
            second = UserImage.objects.create(
                user=self.user,
                image_type=UserImage.ImageType.AWARD_IMAGE,
                image=_make_jpeg(),
                uploaded_by=self.user,
            )
            resolved = resolve_user_image(self.user, UserImage.ImageType.AWARD_IMAGE, expire=60)
        self.assertEqual(resolved.source, "user_image")
        self.assertEqual(resolved.user_image_id, second.id)
```

Add missing import at top: `from django.test import override_settings`

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/run_backend_tests.sh app_auth.tests.test_user_images.ResolveUserImageTests`
Expected: FAIL with `ModuleNotFoundError: app_auth.user_images`.

- [ ] **Step 3: Implement resolver**

Create `app_auth/user_images.py`:

```python
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from app_auth.models import User, UserImage
from schedjuice_backend.storages import PrivateMediaStorage

VALID_IMAGE_TYPES = frozenset({c.value for c in UserImage.ImageType})


def user_image_upload_permission(image_type: str) -> str:
    return f"user_image.upload.{image_type}"


def user_image_view_permission(image_type: str) -> str:
    return f"user_image.view.{image_type}"


@dataclass(frozen=True)
class ResolvedUserImage:
    source: str  # "user_image" | "legacy_id_photo"
    url: str | None
    user_image_id: int | None
    created_at: datetime | None


def _presigned(field, *, expire: int) -> str | None:
    if not field:
        return None
    try:
        return PrivateMediaStorage().url(field.name, expire=expire)
    except Exception:
        return None


def resolve_user_image(user: User, image_type: str, *, expire: int = 3600) -> ResolvedUserImage | None:
    if image_type not in VALID_IMAGE_TYPES:
        return None

    latest = (
        UserImage.objects.filter(user=user, image_type=image_type)
        .order_by("-created_at")
        .first()
    )
    if latest is not None:
        return ResolvedUserImage(
            source="user_image",
            url=_presigned(latest.image, expire=expire),
            user_image_id=latest.id,
            created_at=latest.created_at,
        )

    if image_type == UserImage.ImageType.ID_IMAGE and user.id_photo:
        return ResolvedUserImage(
            source="legacy_id_photo",
            url=_presigned(user.id_photo, expire=expire),
            user_image_id=None,
            created_at=None,
        )

    return None
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./scripts/run_backend_tests.sh app_auth.tests.test_user_images.ResolveUserImageTests`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app_auth/user_images.py app_auth/tests/test_user_images.py
git commit -m "feat(auth): add resolve_user_image with id_photo legacy fallback"
```

---

# Phase 2 — Backend API

### Task 5: Serializers

**Files:**
- Create: `app_auth/user_image_serializers.py`

**Interfaces:**
- Produces: `UserImageSerializer`, `ResolvedUserImageSerializer`, `UploadedBySerializer` (minimal `{id, name}`).

- [ ] **Step 1: Create serializers**

Create `app_auth/user_image_serializers.py`:

```python
from __future__ import annotations

from rest_framework import serializers

from app_auth.models import User, UserImage
from app_auth.user_image_validation import validate_user_image_upload
from app_auth.user_images import ResolvedUserImage
from schedjuice_backend.storages import PrivateMediaStorage


class UploadedBySerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "name")
        read_only_fields = fields


class UserImageSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()
    uploaded_by = UploadedBySerializer(read_only=True)

    class Meta:
        model = UserImage
        fields = (
            "id",
            "user",
            "image_type",
            "image",
            "image_url",
            "uploaded_by",
            "created_at",
        )
        read_only_fields = ("id", "user", "image_url", "uploaded_by", "created_at")

    def get_image_url(self, obj) -> str | None:
        if not obj.image:
            return None
        try:
            return PrivateMediaStorage().url(obj.image.name, expire=3600)
        except Exception:
            return None

    def validate_image(self, image):
        validate_user_image_upload(image, getattr(image, "name", "upload.jpg"))
        return image

    def validate_image_type(self, value):
        if value not in {c.value for c in UserImage.ImageType}:
            raise serializers.ValidationError("Invalid image_type.")
        return value


class ResolvedUserImageSerializer(serializers.Serializer):
    source = serializers.CharField(allow_null=True)
    url = serializers.CharField(allow_null=True)
    user_image_id = serializers.IntegerField(allow_null=True)
    created_at = serializers.DateTimeField(allow_null=True)

    @classmethod
    def from_resolved(cls, resolved: ResolvedUserImage | None):
        if resolved is None:
            return {"source": None, "url": None, "user_image_id": None, "created_at": None}
        return {
            "source": resolved.source,
            "url": resolved.url,
            "user_image_id": resolved.user_image_id,
            "created_at": resolved.created_at,
        }
```

- [ ] **Step 2: Commit**

```bash
git add app_auth/user_image_serializers.py
git commit -m "feat(auth): add UserImage serializers"
```

---

### Task 6: API views, URLs, and integration tests

**Files:**
- Create: `app_auth/user_image_views.py`
- Modify: `app_auth/urls.py`
- Modify: `app_auth/tests/test_user_images.py`

**Interfaces:**
- Consumes: Task 4 resolver, Task 5 serializers, Task 2 permissions, `user_can_access_user` from `app_auth.user_scoping`.
- Produces REST endpoints:
  - `POST /api/v1/users/{user_id}/user-images`
  - `GET /api/v1/users/{user_id}/user-images?image_type=&page=&size=`
  - `GET /api/v1/users/{user_id}/user-images/resolve?image_type=`
  - `POST /api/v1/user-image-urls` body `{ user_ids, image_type }`

- [ ] **Step 1: Write failing API tests**

Append to `app_auth/tests/test_user_images.py`:

```python
from rest_framework.test import APIClient

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class UserImageApiTests(TestCase):
    schema_name = "xschedjuice"
    api_prefix = "/api/v1"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        self.client = APIClient()
        with schema_context(self.schema_name):
            seed_rbac()
            self.hr = User.objects.create_user(
                email=f"hr-{suffix}@example.com",
                password="x",
                name="HR",
                phone_number="1",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"hr-{suffix}@example.com",
                code=f"hr-{suffix}",
                roles=[User.UserRole.HR],
            )
            self.student = User.objects.create_user(
                email=f"stu-{suffix}@example.com",
                password="x",
                name="Stu",
                phone_number="2",
                date_of_birth=date(2000, 1, 1),
                communication_email=f"stu-{suffix}@example.com",
                code=f"stu-{suffix}",
                roles=[User.UserRole.STUDENT],
            )

    def _auth(self, user):
        self.client.force_authenticate(user=user)

    def test_upload_denied_without_permission(self):
        with schema_context(self.schema_name):
            teacher = User.objects.create_user(
                email=f"t-{uuid4().hex[:6]}@example.com",
                password="x",
                name="T",
                phone_number="3",
                date_of_birth=date(1990, 1, 1),
                communication_email="t@example.com",
                code=f"t-{uuid4().hex[:6]}",
                roles=[User.UserRole.TEACHER],
            )
        self._auth(teacher)
        res = self.client.post(
            f"{self.api_prefix}/users/{self.student.id}/user-images",
            {"image_type": "award_image", "image": _make_jpeg()},
            format="multipart",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(res.status_code, 403)

    def test_hr_can_upload_id_image(self):
        self._auth(self.hr)
        res = self.client.post(
            f"{self.api_prefix}/users/{self.student.id}/user-images",
            {"image_type": "id_image", "image": _make_jpeg()},
            format="multipart",
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(res.data["data"]["image_type"], "id_image")

    def test_resolve_id_image_legacy_fallback(self):
        with schema_context(self.schema_name):
            self.student.id_photo = _make_jpeg()
            self.student.save(update_fields=["id_photo"])
        self._auth(self.hr)
        res = self.client.get(
            f"{self.api_prefix}/users/{self.student.id}/user-images/resolve",
            {"image_type": "id_image"},
            HTTP_X_DTS_SCHEMA=self.schema_name,
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["data"]["source"], "legacy_id_photo")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `./scripts/run_backend_tests.sh app_auth.tests.test_user_images.UserImageApiTests`
Expected: FAIL — 404 (routes missing).

- [ ] **Step 3: Implement views and URLs**

Create `app_auth/user_image_views.py`:

```python
from __future__ import annotations

from rest_framework.views import Request

from app_auth.models import User, UserImage
from app_auth.user_image_serializers import (
    ResolvedUserImageSerializer,
    UserImageSerializer,
)
from app_auth.user_images import (
    resolve_user_image,
    user_image_upload_permission,
    user_image_view_permission,
)
from app_auth.user_scoping import check_user_read, user_can_access_user
from app_course.course_scoping import acting_user
from app_rbac.resolution import effective_permissions
from app_rbac.views import RBACView
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication
from utilitas.pagination import CustomPagination

MAX_BATCH = 50
URL_EXPIRE = 3600


def _parse_image_type(raw: str | None) -> str | None:
    if raw in {c.value for c in UserImage.ImageType}:
        return raw
    return None


def _require_view_permission(actor: User, image_type: str) -> bool:
    return user_image_view_permission(image_type) in set(effective_permissions(actor))


def _require_upload_permission(actor: User, image_type: str) -> bool:
    return user_image_upload_permission(image_type) in set(effective_permissions(actor))


class UserImageListCreateView(RBACView):
    name = "User images list/create"
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    rbac_decision = "authenticated_only"
    pagination_class = CustomPagination

    def get(self, request: Request, user_id: int):
        actor = acting_user(request)
        if actor is None:
            return self.unauthorized("Authentication required.")
        image_type = _parse_image_type(request.query_params.get("image_type"))
        if image_type is None:
            return self.bad_request("image_type is required and must be valid.")
        subject = User.objects.filter(pk=user_id).first()
        if subject is None:
            return self.not_found("User not found.")
        if not user_can_access_user(actor, subject):
            return self.forbidden("Not allowed for this user.")
        if not _require_view_permission(actor, image_type):
            return self.forbidden("Missing permission for this image type.")
        qs = UserImage.objects.filter(user=subject, image_type=image_type).select_related(
            "uploaded_by"
        ).order_by("-created_at")
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(qs, request, view=self)
        ser = UserImageSerializer(page, many=True)
        meta = paginator.get_paginated_response()
        return self.ok({"items": ser.data, **meta})

    def post(self, request: Request, user_id: int):
        actor = acting_user(request)
        if actor is None:
            return self.unauthorized("Authentication required.")
        subject = User.objects.filter(pk=user_id).first()
        if subject is None:
            return self.not_found("User not found.")
        if not user_can_access_user(actor, subject):
            return self.forbidden("Not allowed for this user.")
        image_type = _parse_image_type(request.data.get("image_type"))
        if image_type is None:
            return self.bad_request("image_type is required and must be valid.")
        if not _require_upload_permission(actor, image_type):
            return self.forbidden("Missing permission for this image type.")
        ser = UserImageSerializer(data=request.data)
        if not ser.is_valid():
            return self.bad_request(details=ser.errors)
        row = ser.save(user=subject, uploaded_by=actor)
        out = UserImageSerializer(row)
        return self.created(out.data)


class UserImageResolveView(RBACView):
    name = "User image resolve"
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    rbac_decision = "authenticated_only"

    def get(self, request: Request, user_id: int):
        actor = acting_user(request)
        if actor is None:
            return self.unauthorized("Authentication required.")
        image_type = _parse_image_type(request.query_params.get("image_type"))
        if image_type is None:
            return self.bad_request("image_type is required and must be valid.")
        subject = User.objects.filter(pk=user_id).first()
        if subject is None:
            return self.not_found("User not found.")
        check_user_read(actor, subject)
        if not _require_view_permission(actor, image_type):
            return self.forbidden("Missing permission for this image type.")
        resolved = resolve_user_image(subject, image_type, expire=URL_EXPIRE)
        return self.ok(ResolvedUserImageSerializer.from_resolved(resolved))


class UserImageUrlsView(RBACView):
    name = "User image batch URLs"
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    rbac_decision = "authenticated_only"

    def post(self, request: Request):
        actor = acting_user(request)
        if actor is None:
            return self.unauthorized("Authentication required.")
        body = request.data or {}
        raw_ids = body.get("user_ids")
        image_type = _parse_image_type(body.get("image_type"))
        if image_type is None:
            return self.bad_request("image_type is required and must be valid.")
        if not _require_view_permission(actor, image_type):
            return self.forbidden("Missing permission for this image type.")
        if not isinstance(raw_ids, list):
            return self.bad_request("user_ids must be a list.")
        if len(raw_ids) > MAX_BATCH:
            return self.bad_request(f"Maximum {MAX_BATCH} user_ids per request.")
        try:
            user_ids = [int(x) for x in raw_ids]
        except (TypeError, ValueError):
            return self.bad_request("user_ids must be integers.")
        users = {
            u.id: u
            for u in User.objects.filter(pk__in=user_ids).only("id", "id_photo")
        }
        urls: dict[str, str | None] = {}
        for uid in user_ids:
            target = users.get(uid)
            if target is None or not user_can_access_user(actor, target):
                continue
            resolved = resolve_user_image(target, image_type, expire=URL_EXPIRE)
            urls[str(uid)] = resolved.url if resolved else None
        return self.ok({"urls": urls})
```

In `app_auth/urls.py`, add:

```python
from app_auth.user_image_views import (
    UserImageListCreateView,
    UserImageResolveView,
    UserImageUrlsView,
)

# inside urlpatterns:
path(
    "users/<int:user_id>/user-images",
    UserImageListCreateView.as_view(),
    name="user-images",
),
path(
    "users/<int:user_id>/user-images/resolve",
    UserImageResolveView.as_view(),
    name="user-images-resolve",
),
path(
    "user-image-urls",
    UserImageUrlsView.as_view(),
    name="user-image-urls",
),
```

- [ ] **Step 4: Run full backend test module**

Run: `./scripts/run_backend_tests.sh app_auth.tests.test_user_images`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add app_auth/user_image_views.py app_auth/urls.py app_auth/tests/test_user_images.py
git commit -m "feat(auth): add user image upload, history, resolve, and batch URL API"
```

---

# Phase 3 — Frontend

### Task 7: Types, API client, and authorization helpers

**Files:**
- Create: `schedjuice-reimagined-fe/src/types/user-image.ts`
- Create: `schedjuice-reimagined-fe/src/app/client-api/user-images.ts`
- Create: `schedjuice-reimagined-fe/src/app/client-api/user-images.test.ts`
- Modify: `schedjuice-reimagined-fe/src/helpers/authorization.ts`
- Create: `schedjuice-reimagined-fe/src/helpers/authorization-user-images.test.ts`

**Interfaces:**
- Produces:
  - `UserImageType = "award_image" | "id_image"`
  - `uploadUserImage(userId, imageType, file)`
  - `listUserImages(userId, imageType, page?)`
  - `resolveUserImage(userId, imageType)`
  - `fetchUserImageUrls(userIds, imageType)`
  - `canUploadUserImage(viewer, imageType)`, `canViewUserImage(viewer, imageType)`

- [ ] **Step 1: Write failing authorization test**

Create `src/helpers/authorization-user-images.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { canUploadUserImage, canViewUserImage } from "@/helpers/authorization";
import { role, type accountType } from "@/types/user";

function user(id: number, roles: role[], permissions: string[] = []): accountType {
  return { id, roles, permissions } as accountType;
}

describe("user image permissions", () => {
  it("allows upload when permission held", () => {
    const student = user(1, [role.student], ["user_image.upload.award_image"]);
    expect(canUploadUserImage(student, "award_image")).toBe(true);
  });

  it("denies upload without permission", () => {
    const teacher = user(2, [role.teacher], ["user_image.view.award_image"]);
    expect(canUploadUserImage(teacher, "award_image")).toBe(false);
  });

  it("allows view when view permission held", () => {
    const teacher = user(2, [role.teacher], ["user_image.view.id_image"]);
    expect(canViewUserImage(teacher, "id_image")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/helpers/authorization-user-images.test.ts` (from `schedjuice-reimagined-fe`)
Expected: FAIL — exports not defined.

- [ ] **Step 3: Implement types, client, authorization**

Create `src/types/user-image.ts`:

```typescript
export type UserImageType = "award_image" | "id_image";

export type UserImageRow = {
  id: number;
  user: number;
  image_type: UserImageType;
  image_url: string | null;
  uploaded_by: { id: number; name: string } | null;
  created_at: string;
};

export type ResolvedUserImage = {
  source: "user_image" | "legacy_id_photo" | null;
  url: string | null;
  user_image_id: number | null;
  created_at: string | null;
};
```

Create `src/app/client-api/user-images.ts`:

```typescript
import { makeGetRequest, makePostRequest } from "@/app/client-api/utils";
import type { ResolvedUserImage, UserImageRow, UserImageType } from "@/types/user-image";

export async function uploadUserImage(
  userId: number,
  imageType: UserImageType,
  file: File,
): Promise<UserImageRow> {
  const formData = new FormData();
  formData.append("image_type", imageType);
  formData.append("image", file);
  const res = await makePostRequest(`users/${userId}/user-images`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data.data as UserImageRow;
}

export async function listUserImages(
  userId: number,
  imageType: UserImageType,
  page = 1,
): Promise<{ items: UserImageRow[]; count: number }> {
  const res = await makeGetRequest(
    `users/${userId}/user-images?image_type=${imageType}&page=${page}&size=20`,
  );
  const data = res.data.data;
  return { items: data.items ?? [], count: data.count ?? 0 };
}

export async function resolveUserImage(
  userId: number,
  imageType: UserImageType,
): Promise<ResolvedUserImage> {
  const res = await makeGetRequest(
    `users/${userId}/user-images/resolve?image_type=${imageType}`,
  );
  return res.data.data as ResolvedUserImage;
}

export async function fetchUserImageUrls(
  userIds: number[],
  imageType: UserImageType,
): Promise<Record<string, string | null>> {
  const res = await makePostRequest("user-image-urls", {
    user_ids: userIds,
    image_type: imageType,
  });
  return (res.data?.data?.urls ?? {}) as Record<string, string | null>;
}
```

In `src/helpers/authorization.ts`, add:

```typescript
import type { UserImageType } from "@/types/user-image";

export const canUploadUserImage = (viewer: accountType, imageType: UserImageType) =>
  permissionsFor(viewer).can(`user_image.upload.${imageType}`);

export const canViewUserImage = (viewer: accountType, imageType: UserImageType) =>
  permissionsFor(viewer).can(`user_image.view.${imageType}`);
```

Create `src/app/client-api/user-images.test.ts` with a batched URL smoke test mirroring `id-photo-urls.test.ts` (mock `makePostRequest`, assert body shape).

- [ ] **Step 4: Run FE tests**

Run: `npm test -- src/helpers/authorization-user-images.test.ts src/app/client-api/user-images.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/types/user-image.ts src/app/client-api/user-images.ts src/app/client-api/user-images.test.ts src/helpers/authorization.ts src/helpers/authorization-user-images.test.ts
git commit -m "feat(fe): add user image API client and RBAC helpers"
```

---

### Task 8: Profile Photos UI

**Files:**
- Create: `schedjuice-reimagined-fe/src/hooks/use-user-image-upload.ts`
- Create: `schedjuice-reimagined-fe/src/components/users/user-photos-section.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/record/sections/record-overview.tsx`

**Interfaces:**
- Consumes: Task 7 client + authorization helpers.
- Produces: `UserPhotosSection` mounted on user profile for all subjects (students + staff).

- [ ] **Step 1: Create upload hook**

Create `src/hooks/use-user-image-upload.ts`:

```typescript
"use client";

import { uploadUserImage } from "@/app/client-api/user-images";
import type { UserImageType } from "@/types/user-image";
import { useMutation, useQueryClient } from "@tanstack/react-query";

const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;

export function isAcceptedUserImage(file: File): boolean {
  return ACCEPTED_IMAGE_TYPES.includes(file.type) && file.size <= MAX_BYTES;
}

export function useUserImageUpload({
  userId,
  queryKey,
}: {
  userId: number;
  queryKey: unknown[];
}) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: async ({ imageType, file }: { imageType: UserImageType; file: File }) => {
      if (!isAcceptedUserImage(file)) {
        throw new Error("File must be JPEG, PNG, or WebP and at most 10 MB.");
      }
      return uploadUserImage(userId, imageType, file);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });
  return { uploadUserImage: mutation.mutateAsync, busy: mutation.isLoading };
}
```

- [ ] **Step 2: Build Photos section component**

Create `src/components/users/user-photos-section.tsx` with:

- Two cards: **Award Photo** (`award_image`) and **ID Photo** (`id_image`)
- Each card uses `useQuery` to call `resolveUserImage(userId, type)` on mount
- Preview `Image` when `url` present; "No photo" when null
- Legacy badge when `source === "legacy_id_photo"` on ID card
- Hidden upload `<input type="file" accept="image/png,image/jpeg,image/webp">` + Upload button when `canUploadUserImage(viewer, type)`
- History button opens a `Sheet` listing `listUserImages` results (newest first) when `canViewUserImage`
- Follow layout/styling patterns from `UserSignatureSection` (`RecordSection`, `Button`, `Image unoptimized`)

- [ ] **Step 3: Wire into profile overview**

In `record-overview.tsx`, import and render after Profile section:

```tsx
import { UserPhotosSection } from "@/components/users/user-photos-section";

// inside return, before UserSignatureSection:
<UserPhotosSection
  subject={subject}
  viewer={viewer}
  recordQueryKey={recordQueryKey}
/>
```

- [ ] **Step 4: Manual smoke check**

1. Start BE + FE locally against test tenant.
2. Open a student profile as HR — confirm ID Photo upload works and Award Photo upload works for student self.
3. Confirm teacher without upload permission sees preview only.
4. Confirm ID Photo shows legacy `id_photo` with badge when no `UserImage` rows exist.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-user-image-upload.ts src/components/users/user-photos-section.tsx src/components/record/sections/record-overview.tsx
git commit -m "feat(fe): add user profile Photos section for award and ID images"
```

---

## Spec self-review

| Spec requirement | Plan task |
|---|---|
| `UserImage` model with enum | Task 1 |
| Append-only history | Tasks 1, 6 (POST only) |
| `id_image` → legacy `id_photo` fallback | Task 4 |
| `award_image` no fallback | Task 4 |
| No sync to `User.id_photo` | Task 4 (no write path) |
| JPEG/PNG/WebP, 10 MB | Task 3 |
| Four RBAC permissions + tenant grants | Task 2 |
| Upload/view auth + `user_can_access_user` | Task 6 |
| REST endpoints (upload, list, resolve, batch) | Task 6 |
| Profile Photos UI | Task 8 |
| Certificate integration out of v1 | Not in plan |
| High-value tests | Tasks 1–6, 7 |

No placeholders remain. Type names (`UserImageType`, `ResolvedUserImage`, permission codes) are consistent across tasks.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-06-user-image-storage.md` (BE + FE repos).

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach do you want?
