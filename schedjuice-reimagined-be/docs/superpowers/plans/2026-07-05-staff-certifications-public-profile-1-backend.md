# Staff Certifications & Public Profile — Plan 1: Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `UserCertification` CRUD, expand public profiles to all staff at `GET /public/people/{slug}`, add `show_certifications_on_public_profile`, generalize slug assignment, and delete the legacy `GET /public/teachers/{slug}` route.

**Architecture:** Django multi-tenant (`schedjuice-reimagined-be`). New model on `User` with Attachment FK; nested REST under `/users/{id}/certifications` with self-or-`check_user_write` authorization; public endpoint uses staff role overlap filter and presigned URLs. Slug helpers switch from `is_teacher()` to staff overlap.

**Tech Stack:** Django 4.2, DRF, `tenant_schemas`, `PrivateMediaStorage`, Django `TestCase`/`APITestCase`.

**Spec:** `schedjuice-reimagined-fe/docs/superpowers/specs/2026-07-05-staff-certifications-public-profile-design.md`

**Run tests:** `./scripts/run_backend_tests.sh <target>` (always uses `--keepdb --noinput`)

---

## File Structure

| File | Responsibility |
| --- | --- |
| `app_auth/staff_helpers.py` (NEW) | `user_is_staff()`, `staff_role_label()`, `STAFF_ROLES` re-export |
| `app_auth/models.py` | `UserCertification` model; `User.show_certifications_on_public_profile` |
| `app_auth/migrations/0071_user_certification.py` | Migration (autogen) |
| `app_auth/public_profile_helpers.py` | Staff slug assignment; `p_*` prefix for new slugs |
| `app_auth/certification_serializers.py` (NEW) | `UserCertificationSerializer` |
| `app_auth/certification_views.py` (NEW) | List/create/detail certification views |
| `app_auth/views.py` | Replace `PublicTeacherProfileView` → `PublicProfileView`; delete old class |
| `app_auth/serializers.py` | `PublicProfileSerializer`; UserSerializer field + validation updates |
| `app_auth/urls.py` | Certification routes; swap public URL; remove teachers route |
| `app_auth/tests/test_user_certifications.py` (NEW) | CRUD RBAC + validation tests |
| `app_auth/tests/test_public_profile.py` (NEW) | Public people endpoint + slug tests |

---

## Task 1: Staff helpers

**Files:**
- Create: `app_auth/staff_helpers.py`
- Test: `app_auth/tests/test_public_profile.py`

- [ ] **Step 1: Write the failing test**

Create `app_auth/tests/test_public_profile.py`:

```python
from django.test import SimpleTestCase

from app_auth.models import User
from app_auth.staff_helpers import user_is_staff, staff_role_label


class StaffHelpersTests(SimpleTestCase):
    def test_user_is_staff_true_for_hr(self):
        user = User(roles=[User.UserRole.HR])
        self.assertTrue(user_is_staff(user))

    def test_user_is_staff_false_for_student_only(self):
        user = User(roles=[User.UserRole.STUDENT])
        self.assertFalse(user_is_staff(user))

    def test_staff_role_label(self):
        user = User(roles=[User.UserRole.HR, User.UserRole.TEACHER])
        self.assertEqual(staff_role_label(user), "HR")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/run_backend_tests.sh app_auth.tests.test_public_profile.StaffHelpersTests -v 2`
Expected: FAIL — `ModuleNotFoundError: app_auth.staff_helpers`

- [ ] **Step 3: Implement `app_auth/staff_helpers.py`**

```python
from __future__ import annotations

from app_auth.models import User
from app_auth.shortcuts_availability_helpers import STAFF_ROLES_FOR_SHORTCUTS

STAFF_ROLES = STAFF_ROLES_FOR_SHORTCUTS

_ROLE_LABELS = {
    User.UserRole.SUPERADMIN: "Superadmin",
    User.UserRole.ADMIN: "Admin",
    User.UserRole.MANAGER: "Manager",
    User.UserRole.FINANCE: "Finance",
    User.UserRole.HR: "HR",
    User.UserRole.TEACHER: "Teacher",
}


def user_is_staff(user: User) -> bool:
    roles = set(user.roles or [])
    if User.UserRole.STUDENT in roles and roles == {User.UserRole.STUDENT}:
        return False
    return bool(roles.intersection(STAFF_ROLES))


def staff_role_label(user: User) -> str:
    for role in user.get_sorted_roles():
        if role in _ROLE_LABELS:
            return _ROLE_LABELS[role]
        if role != User.UserRole.STUDENT:
            return role.replace("_", " ").title()
    return "Staff"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./scripts/run_backend_tests.sh app_auth.tests.test_public_profile.StaffHelpersTests -v 2`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add app_auth/staff_helpers.py app_auth/tests/test_public_profile.py
git commit -m "feat(auth): add staff helper utilities for public profiles"
```

---

## Task 2: UserCertification model + User field

**Files:**
- Modify: `app_auth/models.py`
- Create: `app_auth/migrations/0071_user_certification.py` (via makemigrations)

- [ ] **Step 1: Add model and field to `app_auth/models.py`**

After the `User` class (or in same file before migrations break), add:

```python
class UserCertification(BaseModel):
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="certifications",
    )
    title = models.CharField(max_length=256)
    issuing_organization = models.CharField(max_length=256)
    issued_on = models.DateField()
    expires_on = models.DateField(null=True, blank=True)
    attachment = models.ForeignKey(
        "app_attachment.Attachment",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="user_certifications",
    )
    sort_order = models.PositiveIntegerField(default=0)
    created_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name="created_certifications",
    )

    class Meta:
        ordering = ["sort_order", "created_at"]

    def __str__(self):
        return f"<UserCertification:{self.id} {self.title}>"
```

On `User`, after `public_profile_slug`:

```python
    show_certifications_on_public_profile = models.BooleanField(default=False)
```

- [ ] **Step 2: Create migration**

Run:
```bash
cd schedjuice-reimagined-be
./env/bin/python manage.py makemigrations app_auth
```
Expected: `app_auth/migrations/0071_...py` depending on `0070_user_code_counter`.

- [ ] **Step 3: Apply migration locally (optional sanity check)**

Run: `./env/bin/python manage.py migrate app_auth --noinput`

- [ ] **Step 4: Commit**

```bash
git add app_auth/models.py app_auth/migrations/0071_*.py
git commit -m "feat(auth): add UserCertification model and cert visibility flag"
```

---

## Task 3: Generalize public profile slug helpers

**Files:**
- Modify: `app_auth/public_profile_helpers.py`
- Test: `app_auth/tests/test_public_profile.py`

- [ ] **Step 1: Write failing slug test**

Append to `app_auth/tests/test_public_profile.py`:

```python
from unittest.mock import patch

from django.test import TestCase

from app_auth.models import User
from app_auth.public_profile_helpers import (
    generate_public_profile_slug,
    should_assign_public_profile_slug,
)


class PublicProfileSlugTests(TestCase):
    def test_generate_public_profile_slug_uses_p_prefix(self):
        slug = generate_public_profile_slug()
        self.assertTrue(slug.startswith("p_"))

    def test_should_assign_for_hr_staff(self):
        user = User(roles=[User.UserRole.HR])
        self.assertTrue(
            should_assign_public_profile_slug(user, {"is_public_profile_enabled": True})
        )

    def test_should_not_assign_for_student(self):
        user = User(roles=[User.UserRole.STUDENT])
        self.assertFalse(
            should_assign_public_profile_slug(user, {"is_public_profile_enabled": True})
        )
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `./scripts/run_backend_tests.sh app_auth.tests.test_public_profile.PublicProfileSlugTests -v 2`

- [ ] **Step 3: Update `app_auth/public_profile_helpers.py`**

Replace teacher-specific logic:

```python
import json
import uuid

from django.db import IntegrityError
from rest_framework.exceptions import ValidationError

from app_auth.staff_helpers import user_is_staff

MAX_QUALIFICATIONS_BYTES = 20 * 1024
LEGACY_SLUG_PREFIX = "t_"
SLUG_PREFIX = "p_"
SLUG_RANDOM_HEX_LEN = 8
MAX_SLUG_ATTEMPTS = 10


def generate_public_profile_slug() -> str:
    return f"{SLUG_PREFIX}{uuid.uuid4().hex[:SLUG_RANDOM_HEX_LEN]}"


# Backward compat alias used by existing code paths
generate_public_teacher_slug = generate_public_profile_slug


def validate_qualifications_size(value) -> None:
    if value is None:
        return
    if len(json.dumps(value, separators=(",", ":"))) > MAX_QUALIFICATIONS_BYTES:
        raise ValidationError("Qualifications content is too large.")


def should_assign_public_profile_slug(instance, validated_data: dict) -> bool:
    if not user_is_staff(instance) or instance.public_profile_slug:
        return False
    if "qualifications" in validated_data:
        return True
    if "is_public_profile_enabled" in validated_data:
        return True
    if "show_certifications_on_public_profile" in validated_data:
        return True
    if instance.qualifications:
        return True
    return False


def ensure_public_profile_slug(user) -> bool:
    if not user_is_staff(user) or user.public_profile_slug:
        return False

    for _ in range(MAX_SLUG_ATTEMPTS):
        user.public_profile_slug = generate_public_profile_slug()
        try:
            user.save(update_fields=["public_profile_slug"])
            return True
        except IntegrityError:
            user.public_profile_slug = None

    raise ValidationError("Could not generate a unique public profile link.")
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `./scripts/run_backend_tests.sh app_auth.tests.test_public_profile -v 2`

- [ ] **Step 5: Commit**

```bash
git add app_auth/public_profile_helpers.py app_auth/tests/test_public_profile.py
git commit -m "feat(auth): generalize public profile slug assignment to all staff"
```

---

## Task 4: Certification serializers

**Files:**
- Create: `app_auth/certification_serializers.py`

- [ ] **Step 1: Create serializer**

```python
from __future__ import annotations

from rest_framework import serializers

from app_attachment.models import Attachment
from app_auth.models import User, UserCertification
from schedjuice_backend.storages import PrivateMediaStorage

MAX_CERTIFICATIONS_PER_USER = 50


class UserCertificationSerializer(serializers.ModelSerializer):
    attachment_id = serializers.PrimaryKeyRelatedField(
        source="attachment",
        queryset=Attachment.objects.all(),
        required=False,
        allow_null=True,
    )
    attachment_filename = serializers.SerializerMethodField()
    attachment_url = serializers.SerializerMethodField()

    class Meta:
        model = UserCertification
        fields = (
            "id",
            "title",
            "issuing_organization",
            "issued_on",
            "expires_on",
            "sort_order",
            "attachment_id",
            "attachment_filename",
            "attachment_url",
            "created_at",
        )
        read_only_fields = ("id", "created_at", "attachment_filename", "attachment_url")

    def get_attachment_filename(self, obj) -> str | None:
        return obj.attachment.filename if obj.attachment_id else None

    def get_attachment_url(self, obj) -> str | None:
        if not obj.attachment or not obj.attachment.data:
            return None
        try:
            return PrivateMediaStorage().url(obj.attachment.data.name, expire=3600)
        except Exception:
            return None

    def validate(self, attrs):
        issued = attrs.get("issued_on") or getattr(self.instance, "issued_on", None)
        expires = attrs.get("expires_on")
        if issued and expires and expires < issued:
            raise serializers.ValidationError(
                {"expires_on": "Expiry date must be on or after issue date."}
            )
        return attrs

    def validate_attachment_id(self, attachment):
        if attachment is None:
            return attachment
        user = self.context.get("subject_user")
        if user is None:
            return attachment
        if attachment.table_name != "user_certification":
            raise serializers.ValidationError("Invalid attachment type.")
        if attachment.foreign_key not in (None, user.pk):
            raise serializers.ValidationError("Attachment does not belong to this user.")
        return attachment

    def create(self, validated_data):
        user = self.context["subject_user"]
        count = UserCertification.objects.filter(user=user).count()
        if count >= MAX_CERTIFICATIONS_PER_USER:
            raise serializers.ValidationError("Maximum certifications limit reached.")
        validated_data["user"] = user
        validated_data["created_by"] = self.context["actor"]
        return super().create(validated_data)
```

- [ ] **Step 2: Commit**

```bash
git add app_auth/certification_serializers.py
git commit -m "feat(auth): add UserCertification serializer"
```

---

## Task 5: Certification views + URLs

**Files:**
- Create: `app_auth/certification_views.py`
- Modify: `app_auth/urls.py`

- [ ] **Step 1: Create views**

```python
from __future__ import annotations

from rest_framework.exceptions import PermissionDenied
from rest_framework.views import Request

from app_auth.certification_serializers import UserCertificationSerializer
from app_auth.models import User, UserCertification
from app_auth.staff_helpers import user_is_staff
from app_auth.user_scoping import acting_user, check_user_write
from app_rbac.views import RBACView
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication


def _can_manage_certifications(actor: User, subject: User) -> bool:
    if actor.id == subject.id:
        return True
    try:
        check_user_write(actor, subject)
        return True
    except PermissionDenied:
        return False


class UserCertificationListCreateView(RBACView):
    name = "User certifications list/create"
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    rbac_decision = "authenticated_only"

    def get(self, request: Request, user_id: int):
        actor = acting_user(request)
        if actor is None:
            return self.unauthorized("Authentication required.")
        subject = User.objects.filter(pk=user_id).first()
        if subject is None:
            return self.not_found("User not found.")
        if not _can_manage_certifications(actor, subject):
            return self.forbidden("Not allowed for this user.")
        qs = UserCertification.objects.filter(user=subject).select_related("attachment")
        ser = UserCertificationSerializer(qs, many=True, context={"subject_user": subject})
        return self.ok(ser.data)

    def post(self, request: Request, user_id: int):
        actor = acting_user(request)
        if actor is None:
            return self.unauthorized("Authentication required.")
        subject = User.objects.filter(pk=user_id).first()
        if subject is None or not user_is_staff(subject):
            return self.not_found("User not found.")
        if not _can_manage_certifications(actor, subject):
            return self.forbidden("Not allowed for this user.")
        ser = UserCertificationSerializer(
            data=request.data,
            context={"subject_user": subject, "actor": actor},
        )
        if not ser.is_valid():
            return self.bad_request(details=ser.errors)
        cert = ser.save()
        out = UserCertificationSerializer(cert, context={"subject_user": subject})
        return self.created(out.data)


class UserCertificationDetailView(RBACView):
    name = "User certification detail"
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    rbac_decision = "authenticated_only"

    def _get_cert(self, user_id: int, cert_id: int):
        return (
            UserCertification.objects.select_related("attachment", "user")
            .filter(user_id=user_id, pk=cert_id)
            .first()
        )

    def patch(self, request: Request, user_id: int, cert_id: int):
        actor = acting_user(request)
        if actor is None:
            return self.unauthorized("Authentication required.")
        cert = self._get_cert(user_id, cert_id)
        if cert is None:
            return self.not_found("Certification not found.")
        if not _can_manage_certifications(actor, cert.user):
            return self.forbidden("Not allowed for this user.")
        ser = UserCertificationSerializer(
            cert,
            data=request.data,
            partial=True,
            context={"subject_user": cert.user, "actor": actor},
        )
        if not ser.is_valid():
            return self.bad_request(details=ser.errors)
        cert = ser.save()
        out = UserCertificationSerializer(cert, context={"subject_user": cert.user})
        return self.ok(out.data)

    def delete(self, request: Request, user_id: int, cert_id: int):
        actor = acting_user(request)
        if actor is None:
            return self.unauthorized("Authentication required.")
        cert = self._get_cert(user_id, cert_id)
        if cert is None:
            return self.not_found("Certification not found.")
        if not _can_manage_certifications(actor, cert.user):
            return self.forbidden("Not allowed for this user.")
        cert.delete()
        return self.no_content()
```

- [ ] **Step 2: Register URLs in `app_auth/urls.py`**

Add imports and paths (adjust `users/` prefix to match existing user detail routes):

```python
from app_auth import certification_views

urlpatterns += [
    path(
        "users/<int:user_id>/certifications",
        certification_views.UserCertificationListCreateView.as_view(),
        name="user-certifications",
    ),
    path(
        "users/<int:user_id>/certifications/<int:cert_id>",
        certification_views.UserCertificationDetailView.as_view(),
        name="user-certification-detail",
    ),
]
```

Verify existing user routes use the same `users/<int:...>` pattern in this file before adding.

- [ ] **Step 3: Commit**

```bash
git add app_auth/certification_views.py app_auth/urls.py
git commit -m "feat(auth): add user certification CRUD endpoints"
```

---

## Task 6: Certification RBAC tests

**Files:**
- Create: `app_auth/tests/test_user_certifications.py`

- [ ] **Step 1: Write integration tests**

Follow patterns from `app_auth/tests/` APITestCase tenant setup. Minimum cases:

```python
# app_auth/tests/test_user_certifications.py
# - staff self can list/create/delete own cert
# - admin with user.update can manage another user's cert
# - unrelated teacher cannot create cert for HR user → 403
# - expires_on before issued_on → 400
# - 51st cert → 400
```

Use `./scripts/run_backend_tests.sh app_auth.tests.test_user_certifications -v 2`

- [ ] **Step 2: Commit**

```bash
git add app_auth/tests/test_user_certifications.py
git commit -m "test(auth): cover user certification CRUD RBAC"
```

---

## Task 7: Public profile endpoint + UserSerializer updates

**Files:**
- Modify: `app_auth/serializers.py`
- Modify: `app_auth/views.py`
- Modify: `app_auth/urls.py`

- [ ] **Step 1: Replace `PublicTeacherProfileSerializer` with `PublicProfileSerializer`**

In `app_auth/serializers.py`:

```python
class PublicCertificationSerializer(serializers.Serializer):
    title = serializers.CharField()
    issuing_organization = serializers.CharField()
    issued_on = serializers.DateField()
    expires_on = serializers.DateField(allow_null=True)
    file_url = serializers.CharField(allow_null=True, allow_blank=True)
    file_filename = serializers.CharField(allow_null=True, allow_blank=True)


class PublicProfileSerializer(serializers.Serializer):
    name = serializers.CharField()
    role_label = serializers.CharField()
    profile_image_url = serializers.CharField(allow_null=True, allow_blank=True)
    qualifications = serializers.JSONField(allow_null=True)
    certifications = PublicCertificationSerializer(many=True, required=False)
```

Add to `UserSerializer.Meta.fields`: `show_certifications_on_public_profile`.

Update `public_profile_keys` in `validate()`:

```python
public_profile_keys = {
    "qualifications",
    "is_public_profile_enabled",
    "show_certifications_on_public_profile",
}
if inst is not None and public_profile_keys.intersection(attrs.keys()):
    if not user_is_staff(inst):
        for key in public_profile_keys:
            attrs.pop(key, None)
```

Replace teacher role check (`User.UserRole.TEACHER not in roles`) with `not user_is_staff(inst)`.

- [ ] **Step 2: Replace view in `app_auth/views.py`**

Delete `PublicTeacherProfileView`. Add:

```python
class PublicProfileView(RBACView):
    """Public staff profile — no authentication required."""

    name = "Public profile view"
    authentication_classes = []
    permission_classes = [RBACPermission]
    rbac_decision = "public"

    def get(self, request, slug: str):
        from app_auth.staff_helpers import staff_role_label, user_is_staff, STAFF_ROLES
        from schedjuice_backend.storages import PrivateMediaStorage

        user = models.User.objects.filter(
            public_profile_slug=slug,
            is_public_profile_enabled=True,
            roles__overlap=list(STAFF_ROLES),
        ).first()
        if user is None or not user_is_staff(user):
            return self.not_found("Profile not found.")

        storage = PrivateMediaStorage()
        profile_image_url = None
        if user.profile_image:
            try:
                profile_image_url = storage.url(user.profile_image.name, expire=3600)
            except Exception:
                profile_image_url = None

        certifications = []
        if user.show_certifications_on_public_profile:
            for cert in user.certifications.select_related("attachment").all():
                file_url = None
                file_filename = None
                if cert.attachment and cert.attachment.data:
                    file_filename = cert.attachment.filename
                    try:
                        file_url = storage.url(cert.attachment.data.name, expire=3600)
                    except Exception:
                        file_url = None
                certifications.append(
                    {
                        "title": cert.title,
                        "issuing_organization": cert.issuing_organization,
                        "issued_on": cert.issued_on,
                        "expires_on": cert.expires_on,
                        "file_url": file_url,
                        "file_filename": file_filename,
                    }
                )

        payload = {
            "name": user.name,
            "role_label": staff_role_label(user),
            "qualifications": user.qualifications,
            "profile_image_url": profile_image_url,
            "certifications": certifications,
        }
        serializer = serializers.PublicProfileSerializer(data=payload)
        serializer.is_valid(raise_exception=True)
        response = self.ok(serializer.data)
        response["Cache-Control"] = "public, max-age=0, must-revalidate"
        return response
```

- [ ] **Step 3: Swap URL — delete teachers route**

In `app_auth/urls.py`:

```python
    path(
        "public/people/<str:slug>",
        views.PublicProfileView.as_view(),
        name="public-profile",
    ),
```

Remove the `public/teachers/<str:slug>` entry entirely.

- [ ] **Step 4: Add public endpoint tests**

Append to `app_auth/tests/test_public_profile.py`:

```python
# - HR user with enabled profile returns 200 at /public/people/{slug}/
# - GET /public/teachers/{slug}/ returns 404 (route gone)
# - certifications omitted when show_certifications_on_public_profile=False
# - certifications included when toggle True
```

Run: `./scripts/run_backend_tests.sh app_auth.tests.test_public_profile -v 2`

- [ ] **Step 5: Commit**

```bash
git add app_auth/serializers.py app_auth/views.py app_auth/urls.py app_auth/tests/test_public_profile.py
git commit -m "feat(auth): add public people profile endpoint and remove teachers route"
```

---

## Task 8: Final verification

- [ ] **Step 1: Run full auth test module**

Run: `./scripts/run_backend_tests.sh app_auth.tests.test_user_certifications app_auth.tests.test_public_profile -v 2`
Expected: all PASS

- [ ] **Step 2: Smoke-check OpenAPI / manual curl**

```bash
curl -s -o /dev/null -w "%{http_code}" \
  -H "Host: <tenant-domain>" \
  "http://localhost:8000/api/v1/public/teachers/t_deadbeef"
```
Expected: `404`

---

## Handoff to Plan 2

Deploy this backend plan before or with FE Plan 2. FE depends on:

- `GET /public/people/{slug}`
- `GET/POST/PATCH/DELETE /users/{id}/certifications`
- `show_certifications_on_public_profile` on user PATCH
- Staff slug assignment for non-teacher roles
