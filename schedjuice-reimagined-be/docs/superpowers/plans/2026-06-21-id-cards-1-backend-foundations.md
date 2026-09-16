# ID Cards — Plan 1: Backend Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the backend data and a public verify endpoint that the staff/student ID-card feature depends on: a `blood_type` user field, presigned ID-photo URLs, tenant-level card branding, a signed verify token, and a public minimal-identity endpoint.

**Architecture:** Django (multi-tenant, schema-per-tenant via `tenant_schemas`). New user/org model fields via migrations; computed serializer fields for presigned image URLs and a signed verify token; one new public `RBACView` (`authentication_classes = []`, `rbac_decision = "public"`) that decodes the token (PyJWT HS256, same `JWT` secret as recording-share links) and returns safe public identity fields. Repo: `schedjuice-reimagined-be`.

**Tech Stack:** Django 4.2, DRF, `djangorestframework-simplejwt`, PyJWT, `tenant_schemas`, `python-decouple`, Django `TestCase`/`APITestCase`.

**Spec:** `schedjuice-reimagined-fe/docs/superpowers/specs/2026-06-21-id-cards-design.md` (§12 Backend work).

---

## File Structure

| File | Responsibility |
| --- | --- |
| `app_auth/models.py` | Add `BloodType` choices + `blood_type` field to `User` |
| `app_auth/migrations/0064_user_blood_type.py` | Migration for `blood_type` |
| `app_auth/id_card_tokens.py` (NEW) | Encode/decode signed ID-verify tokens |
| `app_auth/serializers.py` | Add `id_photo_url`, `profile_image_url`, `id_verify_token` method fields to `UserSerializer` |
| `app_auth/views.py` | Add `PublicIdVerifyView` (public) |
| `app_auth/urls.py` | Route `public/id-verify/<token>` |
| `app_organization/models.py` | Add card-branding fields to `Organization` |
| `app_organization/migrations/00NN_org_id_card_branding.py` | Migration for branding fields (autogen) |
| `app_organization/serializers.py` | Expose branding on `OrganizationSerializer` + `OrganizationTenantPublicSerializer` |
| `app_auth/tests/test_id_card.py` (NEW) | Tests for tokens, serializer fields, public endpoint |

**Run a single test:** `./scripts/run_backend_tests.sh app_auth.tests.test_id_card.IdCardTests.<method>`
**Run all card tests:** `./scripts/run_backend_tests.sh app_auth.tests.test_id_card`

---

## Task 1: Add `blood_type` to the User model

**Files:**
- Modify: `app_auth/models.py`
- Create: `app_auth/migrations/0064_user_blood_type.py`
- Test: `app_auth/tests/test_id_card.py`

- [ ] **Step 1: Add the `BloodType` choices and field to `User`**

In `app_auth/models.py`, add a `TextChoices` near the other choice classes (e.g. beside `Gender`):

```python
class BloodType(models.TextChoices):
    A_POS = "A+", "A+"
    A_NEG = "A-", "A-"
    B_POS = "B+", "B+"
    B_NEG = "B-", "B-"
    AB_POS = "AB+", "AB+"
    AB_NEG = "AB-", "AB-"
    O_POS = "O+", "O+"
    O_NEG = "O-", "O-"
```

Add the field to the `User` model, next to `emergency_contact_relationship`:

```python
    blood_type = models.CharField(
        max_length=8,
        choices=BloodType.choices,
        null=True,
        blank=True,
    )
```

- [ ] **Step 2: Create the migration**

Run:

```bash
python manage.py makemigrations app_auth
```

Expected: creates `app_auth/migrations/0064_user_blood_type.py` depending on `0063_user_id_photo`. It must look like:

```python
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("app_auth", "0063_user_id_photo"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="blood_type",
            field=models.CharField(
                blank=True,
                choices=[
                    ("A+", "A+"), ("A-", "A-"), ("B+", "B+"), ("B-", "B-"),
                    ("AB+", "AB+"), ("AB-", "AB-"), ("O+", "O+"), ("O-", "O-"),
                ],
                max_length=8,
                null=True,
            ),
        ),
    ]
```

- [ ] **Step 3: Write the failing test**

Create `app_auth/tests/test_id_card.py`:

```python
import unittest

from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIClient

from app_auth.models import User


def _database_reachable() -> bool:
    from django.db import connection
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class IdCardTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        self.user = User.objects.create_user(
            email="card.teacher@example.com",
            password="Password1!",
            name="Thiri Kyaw",
            phone_number="+95 9 700000000",
            roles=["teacher"],
        )
        self.user.blood_type = "O+"
        self.user.emergency_contact_name = "Su Su"
        self.user.emergency_contact_phone_number = "+95 9 711111111"
        self.user.emergency_contact_relationship = "Sister"
        self.user.save()

    def _client(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_X_DTS_SCHEMA=self.schema_name)
        return client

    def test_blood_type_persists(self):
        fresh = User.objects.get(pk=self.user.pk)
        self.assertEqual(fresh.blood_type, "O+")
```

- [ ] **Step 4: Run test to verify it passes (after migrate)**

Run: `./scripts/run_backend_tests.sh app_auth.tests.test_id_card.IdCardTests.test_blood_type_persists`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app_auth/models.py app_auth/migrations/0064_user_blood_type.py app_auth/tests/test_id_card.py
git commit -m "feat(id-card): add blood_type field to User"
```

---

## Task 2: Presigned `id_photo_url` and `profile_image_url` on UserSerializer

**Files:**
- Modify: `app_auth/serializers.py`
- Test: `app_auth/tests/test_id_card.py`

The model stores `id_photo` / `profile_image` on `PrivateMediaStorage`. The frontend card needs an HTTP(S) URL. Expose computed (presigned) URLs.

- [ ] **Step 1: Write the failing test**

Add to `IdCardTests`:

```python
    def test_user_serializer_exposes_photo_urls(self):
        from app_auth.serializers import UserSerializer
        data = UserSerializer(self.user).data
        self.assertIn("id_photo_url", data)
        self.assertIn("profile_image_url", data)
        # No photo uploaded → None, never a raw storage path
        self.assertIsNone(data["id_photo_url"])
        self.assertIsNone(data["profile_image_url"])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/run_backend_tests.sh app_auth.tests.test_id_card.IdCardTests.test_user_serializer_exposes_photo_urls`
Expected: FAIL — `KeyError: 'id_photo_url'`

- [ ] **Step 3: Implement the method fields**

In `app_auth/serializers.py`, inside `class UserSerializer(BaseModelSerializer)`:

```python
    id_photo_url = serializers.SerializerMethodField(read_only=True)
    profile_image_url = serializers.SerializerMethodField(read_only=True)

    def _signed_url(self, image_field):
        if not image_field:
            return None
        try:
            return image_field.url
        except Exception:
            return None

    def get_id_photo_url(self, obj) -> "str | None":
        return self._signed_url(obj.id_photo)

    def get_profile_image_url(self, obj) -> "str | None":
        return self._signed_url(obj.profile_image)
```

`image_field.url` triggers the storage backend (django-storages S3) to produce a presigned URL; for local/empty fields it returns `None`.

- [ ] **Step 4: Run test to verify it passes**

Run: `./scripts/run_backend_tests.sh app_auth.tests.test_id_card.IdCardTests.test_user_serializer_exposes_photo_urls`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app_auth/serializers.py app_auth/tests/test_id_card.py
git commit -m "feat(id-card): expose presigned id_photo_url and profile_image_url"
```

---

## Task 3: Signed ID-verify token helpers

**Files:**
- Create: `app_auth/id_card_tokens.py`
- Test: `app_auth/tests/test_id_card.py`

Mirror the recording-share JWT pattern (`app_course/views.py:3243-3300`): PyJWT HS256 signed with `config("JWT")`, plus a `purpose` claim and the tenant `schema`. ID badges are long-lived, so **no expiry**.

- [ ] **Step 1: Write the failing test**

Add to `app_auth/tests/test_id_card.py` (top-level, no DB needed):

```python
class IdCardTokenTests(unittest.TestCase):
    def test_round_trip(self):
        from app_auth import id_card_tokens
        token = id_card_tokens.encode_id_verify_token(uid=42, schema="xschedjuice")
        payload = id_card_tokens.decode_id_verify_token(token)
        self.assertEqual(payload["uid"], 42)
        self.assertEqual(payload["schema"], "xschedjuice")
        self.assertEqual(payload["purpose"], "id-verify")

    def test_tampered_token_rejected(self):
        from app_auth import id_card_tokens
        token = id_card_tokens.encode_id_verify_token(uid=42, schema="xschedjuice")
        with self.assertRaises(id_card_tokens.InvalidIdVerifyToken):
            id_card_tokens.decode_id_verify_token(token + "x")

    def test_wrong_purpose_rejected(self):
        import jwt
        from app_auth import id_card_tokens
        bad = jwt.encode(
            {"purpose": "recording-share", "uid": 1, "schema": "xschedjuice"},
            id_card_tokens._secret(),
            algorithm="HS256",
        )
        with self.assertRaises(id_card_tokens.InvalidIdVerifyToken):
            id_card_tokens.decode_id_verify_token(bad)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/run_backend_tests.sh app_auth.tests.test_id_card.IdCardTokenTests`
Expected: FAIL — `ModuleNotFoundError: app_auth.id_card_tokens`

- [ ] **Step 3: Implement the helpers**

Create `app_auth/id_card_tokens.py`:

```python
"""Signed, long-lived tokens that back the public ID-card verify link.

Mirrors the recording-share JWT pattern (PyJWT HS256 + the shared ``JWT`` secret),
but carries no expiry because a printed badge is long-lived. The ``purpose`` claim
prevents tokens minted for other features from being accepted here.
"""

import jwt
from decouple import config

ID_VERIFY_PURPOSE = "id-verify"


class InvalidIdVerifyToken(Exception):
    """Raised when a token is malformed, tampered, or has the wrong purpose."""


def _secret() -> str:
    return config("JWT")


def encode_id_verify_token(*, uid: int, schema: str) -> str:
    return jwt.encode(
        {"purpose": ID_VERIFY_PURPOSE, "uid": uid, "schema": schema},
        _secret(),
        algorithm="HS256",
    )


def decode_id_verify_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, _secret(), algorithms=["HS256"])
    except jwt.InvalidTokenError as exc:
        raise InvalidIdVerifyToken(str(exc)) from exc

    if payload.get("purpose") != ID_VERIFY_PURPOSE:
        raise InvalidIdVerifyToken("wrong purpose")
    if "uid" not in payload or "schema" not in payload:
        raise InvalidIdVerifyToken("missing claims")
    return payload
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./scripts/run_backend_tests.sh app_auth.tests.test_id_card.IdCardTokenTests`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app_auth/id_card_tokens.py app_auth/tests/test_id_card.py
git commit -m "feat(id-card): add signed id-verify token helpers"
```

---

## Task 4: Expose `id_verify_token` on UserSerializer

**Files:**
- Modify: `app_auth/serializers.py`
- Test: `app_auth/tests/test_id_card.py`

The frontend needs the signed token to build the QR's verify URL (`<origin>/verify/<token>`). Minting is cheap and the token only ever resolves to safe public fields, so include it on the user payload.

- [ ] **Step 1: Write the failing test**

Add to `IdCardTests`:

```python
    def test_user_serializer_exposes_verify_token(self):
        from app_auth.serializers import UserSerializer
        from app_auth.id_card_tokens import decode_id_verify_token
        data = UserSerializer(self.user, context={"request": None}).data
        self.assertIn("id_verify_token", data)
        payload = decode_id_verify_token(data["id_verify_token"])
        self.assertEqual(payload["uid"], self.user.pk)
        self.assertEqual(payload["schema"], self.schema_name)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/run_backend_tests.sh app_auth.tests.test_id_card.IdCardTests.test_user_serializer_exposes_verify_token`
Expected: FAIL — `KeyError: 'id_verify_token'`

- [ ] **Step 3: Implement the field**

In `app_auth/serializers.py`, add to `UserSerializer`:

```python
    id_verify_token = serializers.SerializerMethodField(read_only=True)

    def get_id_verify_token(self, obj) -> "str | None":
        from django.db import connection
        from app_auth.id_card_tokens import encode_id_verify_token

        if not obj.pk:
            return None
        return encode_id_verify_token(uid=obj.pk, schema=connection.schema_name)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./scripts/run_backend_tests.sh app_auth.tests.test_id_card.IdCardTests.test_user_serializer_exposes_verify_token`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app_auth/serializers.py app_auth/tests/test_id_card.py
git commit -m "feat(id-card): expose signed id_verify_token on UserSerializer"
```

---

## Task 5: Organization card-branding fields

**Files:**
- Modify: `app_organization/models.py`
- Create: `app_organization/migrations/00NN_org_id_card_branding.py` (autogen)
- Modify: `app_organization/serializers.py`
- Test: `app_auth/tests/test_id_card.py`

Admin-overridable branding. Defaults are emerald (staff) / amber (student); org `name`/`logo` are the fallback for `id_card_org_name`/`id_card_logo` (resolved on the frontend, see Plan 2).

- [ ] **Step 1: Add the fields to `Organization`**

In `app_organization/models.py`, inside `class Organization(BaseModel, TenantMixin)`, after `default_cover_image`:

```python
    id_card_org_name = models.CharField(max_length=4096, null=True, blank=True)
    id_card_logo = models.ImageField(
        upload_to=get_upload_to_path_for_logos,
        null=True,
        blank=True,
        storage=PublicMediaStorage(),
    )
    id_card_staff_accent = models.CharField(max_length=9, default="#5ea37e")
    id_card_student_accent = models.CharField(max_length=9, default="#d97706")
```

(`get_upload_to_path_for_logos` and `PublicMediaStorage` are already imported/defined in this module — reuse them.)

- [ ] **Step 2: Create the migration**

Run:

```bash
python manage.py makemigrations app_organization
```

Expected: a new `app_organization/migrations/00NN_org_id_card_branding.py` with four `AddField` operations depending on the current latest `app_organization` migration.

- [ ] **Step 3: Write the failing test**

Add to `IdCardTests`:

```python
    def test_org_branding_defaults_and_serializer(self):
        from app_organization.models import Organization
        from app_organization.serializers import OrganizationTenantPublicSerializer

        org = Organization.objects.get(schema_name=self.schema_name)
        self.assertEqual(org.id_card_staff_accent, "#5ea37e")
        self.assertEqual(org.id_card_student_accent, "#d97706")

        data = OrganizationTenantPublicSerializer(org).data
        for key in (
            "id_card_org_name",
            "id_card_logo",
            "id_card_staff_accent",
            "id_card_student_accent",
        ):
            self.assertIn(key, data)
```

- [ ] **Step 4: Run test to verify it fails**

Run: `./scripts/run_backend_tests.sh app_auth.tests.test_id_card.IdCardTests.test_org_branding_defaults_and_serializer`
Expected: FAIL — branding keys missing from the public serializer.

- [ ] **Step 5: Expose branding in the serializers**

In `app_organization/serializers.py`, ensure both `OrganizationSerializer` and `OrganizationTenantPublicSerializer` output the four fields.

- For an `exclude`-based `OrganizationSerializer` (`fields = "__all__"` minus secrets): no change needed if it already includes all model fields; otherwise add them to the field list.
- For `OrganizationTenantPublicSerializer` (a curated public payload), add the four field names to its `Meta.fields`:

```python
class OrganizationTenantPublicSerializer(BaseModelSerializer):
    class Meta:
        model = Organization
        fields = (
            # ... existing public fields ...
            "name",
            "logo",
            "id_card_org_name",
            "id_card_logo",
            "id_card_staff_accent",
            "id_card_student_accent",
        )
```

(Keep the existing fields; only append the four new ones. If the serializer is a manual `serializers.Serializer`, declare the four as `serializers.CharField(...)` / `serializers.ImageField(...)` with `allow_null=True`.)

- [ ] **Step 6: Run test to verify it passes**

Run: `./scripts/run_backend_tests.sh app_auth.tests.test_id_card.IdCardTests.test_org_branding_defaults_and_serializer`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add app_organization/models.py app_organization/migrations/ app_organization/serializers.py app_auth/tests/test_id_card.py
git commit -m "feat(id-card): add tenant card-branding fields"
```

---

## Task 6: Public `PublicIdVerifyView` endpoint

**Files:**
- Modify: `app_auth/views.py`
- Modify: `app_auth/urls.py`
- Test: `app_auth/tests/test_id_card.py`

Public, unauthenticated endpoint. Decodes the token, enforces the token's `schema` matches the request tenant (anti cross-tenant replay), and returns **only** safe public identity fields plus `user_id` (so a logged-in scanner's browser can deep-link to `/users/<id>`).

- [ ] **Step 1: Write the failing tests**

Add to `IdCardTests`:

```python
    def test_public_verify_returns_minimal_identity(self):
        from app_auth.id_card_tokens import encode_id_verify_token

        token = encode_id_verify_token(uid=self.user.pk, schema=self.schema_name)
        client = APIClient()
        client.credentials(HTTP_X_DTS_SCHEMA=self.schema_name)
        res = client.get(f"/api/v1/public/id-verify/{token}")
        self.assertEqual(res.status_code, 200)
        data = res.json()["data"]
        self.assertEqual(data["name"], "Thiri Kyaw")
        self.assertEqual(data["user_id"], self.user.pk)
        self.assertTrue(data["verified"])
        self.assertIn("roles", data)
        # Must NOT leak sensitive contact fields publicly
        self.assertNotIn("phone_number", data)
        self.assertNotIn("email", data)
        self.assertNotIn("emergency_contact_phone_number", data)

    def test_public_verify_rejects_invalid_token(self):
        client = APIClient()
        client.credentials(HTTP_X_DTS_SCHEMA=self.schema_name)
        res = client.get("/api/v1/public/id-verify/not-a-real-token")
        self.assertEqual(res.status_code, 400)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `./scripts/run_backend_tests.sh app_auth.tests.test_id_card.IdCardTests.test_public_verify_returns_minimal_identity`
Expected: FAIL — 404 (route does not exist).

- [ ] **Step 3: Implement the view**

In `app_auth/views.py`, add (near `PublicTeacherProfileView`):

```python
from django.db import connection

from app_auth.id_card_tokens import decode_id_verify_token, InvalidIdVerifyToken


class PublicIdVerifyView(RBACView):
    """Public ID-card verify — resolves a signed token to minimal public identity."""

    name = "Public ID verify view"
    authentication_classes = []
    permission_classes = [RBACPermission]
    rbac_decision = "public"

    def get(self, request, token: str):
        try:
            payload = decode_id_verify_token(token)
        except InvalidIdVerifyToken:
            return self.bad_request("This badge could not be verified.")

        if payload.get("schema") != request.tenant.schema_name:
            return self.bad_request("This badge could not be verified.")

        connection.set_schema(payload["schema"])
        user = models.User.objects.filter(pk=payload["uid"]).first()
        if user is None or user.is_active is False:
            return self.not_found("This badge could not be verified.")

        def _signed(image_field):
            if not image_field:
                return None
            try:
                return image_field.url
            except Exception:
                return None

        data = {
            "verified": True,
            "user_id": user.pk,
            "name": user.name,
            "roles": user.roles,
            "id_photo_url": _signed(user.id_photo) or _signed(user.profile_image),
            "org_name": request.tenant.id_card_org_name or request.tenant.name,
            "public_profile_slug": user.public_profile_slug,
        }
        return self.ok(data=data)
```

- [ ] **Step 4: Add the route**

In `app_auth/urls.py`, alongside the other `public/...` routes:

```python
    path("public/id-verify/<str:token>", views.PublicIdVerifyView.as_view()),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `./scripts/run_backend_tests.sh app_auth.tests.test_id_card.IdCardTests.test_public_verify_returns_minimal_identity app_auth.tests.test_id_card.IdCardTests.test_public_verify_rejects_invalid_token`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app_auth/views.py app_auth/urls.py app_auth/tests/test_id_card.py
git commit -m "feat(id-card): add public id-verify endpoint"
```

---

## Task 7: Apply migrations across schemas

- [ ] **Step 1: Migrate shared + tenant schemas**

```bash
python manage.py migrate_schemas --shared
python manage.py migrate_schemas
```

Expected: `app_auth.0064` applies to every tenant schema; `app_organization` branding migration applies to the shared (public) schema.

- [ ] **Step 2: Run the full card test module**

Run: `./scripts/run_backend_tests.sh app_auth.tests.test_id_card`
Expected: all tests PASS.

- [ ] **Step 3: Commit (if any migration state files changed)**

```bash
git add -A
git commit -m "chore(id-card): apply id-card migrations"
```

---

## Self-Review

- **Spec §12.1 blood_type:** Task 1. ✅
- **Spec §12.2 signed verify token + public minimal-identity endpoint:** Tasks 3, 6 (no ID leak — token is opaque; endpoint returns curated fields only). ✅
- **Spec §12.3 id_photo_url on user API:** Task 2. ✅
- **Spec §12.4 tenant branding fields:** Task 5. ✅
- **Token consistency:** `encode_id_verify_token(uid=, schema=)` / `decode_id_verify_token(token)` / `InvalidIdVerifyToken` / `ID_VERIFY_PURPOSE = "id-verify"` used identically in Tasks 3, 4, 6. ✅
- **Response envelope:** uses `self.send_response(is_error, message, {"data": ...}, status=...)` per `BaseView` convention; tests read `res.json()["data"]["data"]`. ✅
- **Cross-tenant safety:** Task 6 rejects tokens whose `schema` ≠ `request.tenant.schema_name`. ✅
