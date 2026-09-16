# Data Verification Request Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade DVRs with expiry, per-field required flags, sync role snapshot enrollment (no email), and a sticky in-app banner for pending staff until they self-verify.

**Architecture:** Evolve `DataVerificationRequest` (`expires_on` + object-shaped `fields`). On create, bulk-create `UserDataVerificationRequest` rows for users whose roles overlap selected types. Pure helpers own field normalize/validate, enrollment query, required-field checks, and banner pick. FE create defaults + AppShell banner; verify form respects required flags; detail already has copyable verify URL.

**Tech Stack:** Django + DRF (`app_auth`), Next.js client components, Vitest, existing `CopyInput` / `AppShell` / `GenericForm`, BE `./scripts/run_backend_tests.sh` with `--keepdb`.

**Spec:** `docs/superpowers/specs/2026-07-18-data-verification-request-upgrade-design.md`

## Global Constraints

- No automatic email on create; stop enqueueing `CREATE_DVR_AND_SEND_EMAIL`.
- Enrollment is snapshot-at-create only (no live role enrollment, no re-snapshot on edit).
- Role targets only; default staff roles = `superadmin`, `admin`, `manager`, `finance`, `hr`, `teacher` (not `student`).
- Field catalog unchanged: `communication_email`, `alternative_name`, `date_of_birth`, `phone_number`, `house_number`, `street`, `township`, `city`, `region`, `country`.
- `fields` shape: `[{ "name": string, "required": bool }, ...]`; legacy strings coerce to `{ name, required: false }`.
- Default `expires_on` = today + 7 days; after expiry banner hides, verify URL still works.
- Banner clears only when UserDVR becomes `verified` (self-submit) or DVR is expired.
- Default included = all catalog fields; default `required` = false (admin opts in).
- Do not refactor unrelated `created_by` assignment bugs.
- Backend tests must use `--keepdb` via `./scripts/run_backend_tests.sh`.
- FE unit tests: `bun run test:unit -- <path>`.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `schedjuice-reimagined-be/app_auth/dvr.py` | Create | Field normalize/validate, role overlap QS, required checks, banner pick |
| `schedjuice-reimagined-be/app_auth/tests/test_dvr.py` | Create | Helper + serializer create/verify tests |
| `schedjuice-reimagined-be/app_auth/models.py` | Modify | Add `expires_on` on `DataVerificationRequest` |
| `schedjuice-reimagined-be/app_auth/migrations/0075_dvr_expires_on_and_fields_shape.py` | Create | Column + data migration (use next number if taken) |
| `schedjuice-reimagined-be/app_auth/serializers.py` | Modify | Validate fields/expiry; sync snapshot; no email tasks; enforce required on verify |
| `schedjuice-reimagined-fe/src/helpers/dvr.ts` | Create | Normalize fields, staff defaults, expiry default, schema pick helpers |
| `schedjuice-reimagined-fe/src/helpers/dvr.test.ts` | Create | Unit tests for helpers |
| `schedjuice-reimagined-fe/src/types/dvr.ts` | Modify | Zod for `expires_on` + field objects |
| `schedjuice-reimagined-fe/src/sdk/_types/data-verification-requests.ts` | Modify | Type fields for list/detail/banner |
| `schedjuice-reimagined-fe/src/components/form/generic-form.tsx` | Modify | Pass create response into `onSuccess` for detail redirect |
| `schedjuice-reimagined-fe/src/app/(internal)/data-verification-requests/create/page.tsx` | Modify | Defaults + include/required UI; redirect to detail |
| `schedjuice-reimagined-fe/src/app/(internal)/data-verification-requests/[id]/verify/page.tsx` | Modify | Required vs optional schema from field config |
| `schedjuice-reimagined-fe/src/app/(internal)/data-verification-requests/[id]/page.tsx` | Modify | Show expiry + required badges on fields |
| `schedjuice-reimagined-fe/src/app/(internal)/data-verification-requests/dvr-columns.tsx` | Modify | Show `expires_on` |
| `schedjuice-reimagined-fe/src/components/layout/dvr-pending-banner.tsx` | Create | Sticky non-dismissible banner |
| `schedjuice-reimagined-fe/src/components/layout/dvr-pending-banner.test.tsx` | Create | Banner eligibility rendering tests |
| `schedjuice-reimagined-fe/src/components/shell/app-shell.tsx` | Modify | Mount banner near `ViewAsBanner` |

---

### Task 1: Backend DVR helpers (pure)

**Files:**
- Create: `schedjuice-reimagined-be/app_auth/dvr.py`
- Create: `schedjuice-reimagined-be/app_auth/tests/test_dvr.py`

**Interfaces:**
- Consumes: `User`, `DataVerificationRequest`, `UserDataVerificationRequest`
- Produces:
  - `DVR_FIELD_CATALOG: frozenset[str]`
  - `normalize_dvr_fields(raw) -> list[dict]` with keys `name`, `required`
  - `validate_dvr_fields(fields) -> list[dict]` raises `ValidationError`
  - `users_matching_roles(role_types: list[str]) -> QuerySet[User]`
  - `required_field_names(fields) -> list[str]`
  - `user_missing_required_fields(user, fields) -> list[str]`
  - `pick_banner_user_dvr(user_dvrs, today: date) -> UserDataVerificationRequest | None`

- [ ] **Step 1: Write the failing helper tests**

Create `app_auth/tests/test_dvr.py` (start with `SimpleTestCase` helpers; serializer tests added in later tasks):

```python
from datetime import date, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock

from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError

from app_auth.dvr import (
    normalize_dvr_fields,
    pick_banner_user_dvr,
    required_field_names,
    user_missing_required_fields,
    validate_dvr_fields,
)


class NormalizeDvrFieldsTests(SimpleTestCase):
    def test_legacy_strings_become_optional_objects(self):
        self.assertEqual(
            normalize_dvr_fields(["phone_number", "city"]),
            [
                {"name": "phone_number", "required": False},
                {"name": "city", "required": False},
            ],
        )

    def test_objects_preserved(self):
        self.assertEqual(
            normalize_dvr_fields(
                [{"name": "phone_number", "required": True}, {"name": "city", "required": False}]
            ),
            [
                {"name": "phone_number", "required": True},
                {"name": "city", "required": False},
            ],
        )


class ValidateDvrFieldsTests(SimpleTestCase):
    def test_rejects_empty(self):
        with self.assertRaises(ValidationError):
            validate_dvr_fields([])

    def test_rejects_unknown_field(self):
        with self.assertRaises(ValidationError):
            validate_dvr_fields([{"name": "not_a_field", "required": False}])

    def test_accepts_catalog_fields(self):
        out = validate_dvr_fields([{"name": "phone_number", "required": True}])
        self.assertEqual(out[0]["name"], "phone_number")


class RequiredFieldChecksTests(SimpleTestCase):
    def test_required_names(self):
        fields = [
            {"name": "phone_number", "required": True},
            {"name": "city", "required": False},
        ]
        self.assertEqual(required_field_names(fields), ["phone_number"])

    def test_missing_required(self):
        user = SimpleNamespace(phone_number="", city="Yangon")
        fields = [
            {"name": "phone_number", "required": True},
            {"name": "city", "required": False},
        ]
        self.assertEqual(user_missing_required_fields(user, fields), ["phone_number"])


class PickBannerUserDvrTests(SimpleTestCase):
    def test_picks_soonest_unexpired_pending(self):
        today = date(2026, 7, 18)
        a = SimpleNamespace(
            id=1,
            status="pending",
            data_verification_request=SimpleNamespace(expires_on=today + timedelta(days=10)),
        )
        b = SimpleNamespace(
            id=2,
            status="pending",
            data_verification_request=SimpleNamespace(expires_on=today + timedelta(days=2)),
        )
        expired = SimpleNamespace(
            id=3,
            status="pending",
            data_verification_request=SimpleNamespace(expires_on=today - timedelta(days=1)),
        )
        verified = SimpleNamespace(
            id=4,
            status="verified",
            data_verification_request=SimpleNamespace(expires_on=today + timedelta(days=1)),
        )
        picked = pick_banner_user_dvr([a, b, expired, verified], today)
        self.assertIs(picked, b)

    def test_none_when_all_expired_or_verified(self):
        today = date(2026, 7, 18)
        rows = [
            SimpleNamespace(
                id=1,
                status="pending",
                data_verification_request=SimpleNamespace(expires_on=today - timedelta(days=1)),
            ),
            SimpleNamespace(
                id=2,
                status="verified",
                data_verification_request=SimpleNamespace(expires_on=today + timedelta(days=1)),
            ),
        ]
        self.assertIsNone(pick_banner_user_dvr(rows, today))
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_auth.tests.test_dvr.NormalizeDvrFieldsTests
```

Expected: FAIL (import error / module missing)

- [ ] **Step 3: Implement helpers**

Create `app_auth/dvr.py`:

```python
from __future__ import annotations

from datetime import date
from typing import Any, Iterable

from django.db.models import Q, QuerySet
from rest_framework.exceptions import ValidationError

from app_auth.models import User

DVR_FIELD_CATALOG = frozenset(
    {
        "communication_email",
        "alternative_name",
        "date_of_birth",
        "phone_number",
        "house_number",
        "street",
        "township",
        "city",
        "region",
        "country",
    }
)


def normalize_dvr_fields(raw: Any) -> list[dict]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise ValidationError({"fields": "Must be a list."})
    out: list[dict] = []
    for item in raw:
        if isinstance(item, str):
            out.append({"name": item, "required": False})
        elif isinstance(item, dict) and "name" in item:
            out.append(
                {
                    "name": str(item["name"]),
                    "required": bool(item.get("required", False)),
                }
            )
        else:
            raise ValidationError({"fields": "Each field must be a string or {name, required}."})
    return out


def validate_dvr_fields(raw: Any) -> list[dict]:
    fields = normalize_dvr_fields(raw)
    if not fields:
        raise ValidationError({"fields": "Select at least one field."})
    names = [f["name"] for f in fields]
    if len(names) != len(set(names)):
        raise ValidationError({"fields": "Duplicate field names are not allowed."})
    unknown = [n for n in names if n not in DVR_FIELD_CATALOG]
    if unknown:
        raise ValidationError({"fields": f"Unknown fields: {', '.join(unknown)}"})
    return fields


def required_field_names(fields: Iterable[dict]) -> list[str]:
    return [f["name"] for f in fields if f.get("required")]


def user_missing_required_fields(user: Any, fields: Iterable[dict]) -> list[str]:
    missing: list[str] = []
    for name in required_field_names(fields):
        value = getattr(user, name, None)
        if value is None or value == "":
            missing.append(name)
    return missing


def users_matching_roles(role_types: list[str]) -> QuerySet[User]:
    """Users whose roles array overlaps any selected role (OR)."""
    if not role_types:
        return User.objects.none()
    q = Q()
    for role in role_types:
        q |= Q(roles__contains=[role])
    return User.objects.filter(q).distinct()


def pick_banner_user_dvr(user_dvrs: Iterable[Any], today: date) -> Any | None:
    eligible = []
    for row in user_dvrs:
        if getattr(row, "status", None) != "pending":
            continue
        dvr = getattr(row, "data_verification_request", None)
        expires_on = getattr(dvr, "expires_on", None) if dvr is not None else None
        if expires_on is None or expires_on < today:
            continue
        eligible.append(row)
    if not eligible:
        return None
    eligible.sort(
        key=lambda r: (
            r.data_verification_request.expires_on,
            getattr(r, "id", 0) or 0,
        )
    )
    return eligible[0]
```

- [ ] **Step 4: Run helper tests**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_auth.tests.test_dvr.NormalizeDvrFieldsTests app_auth.tests.test_dvr.ValidateDvrFieldsTests app_auth.tests.test_dvr.RequiredFieldChecksTests app_auth.tests.test_dvr.PickBannerUserDvrTests
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-be
git add app_auth/dvr.py app_auth/tests/test_dvr.py
git commit -m "$(cat <<'EOF'
feat(auth): add DVR field and banner helper utilities

EOF
)"
```

---

### Task 2: Model + migration (`expires_on`, fields shape)

**Files:**
- Modify: `schedjuice-reimagined-be/app_auth/models.py` (`DataVerificationRequest` ~L545)
- Create: `schedjuice-reimagined-be/app_auth/migrations/0075_dvr_expires_on_and_fields_shape.py` (next number if 0075 exists)

**Interfaces:**
- Consumes: Task 1 `normalize_dvr_fields`
- Produces: `DataVerificationRequest.expires_on: date | None` (required on new creates via serializer)

- [ ] **Step 1: Add model field**

In `DataVerificationRequest`:

```python
expires_on = models.DateField(null=True, blank=True)
```

Keep `fields = models.JSONField(null=True, blank=True)` (shape changes in data only).

- [ ] **Step 2: Create migration with backfill**

```bash
cd schedjuice-reimagined-be
./env/bin/python manage.py makemigrations app_auth --name dvr_expires_on_and_fields_shape
```

Then edit the migration to add a `RunPython` after `AddField`:

```python
from datetime import timedelta

def forwards(apps, schema_editor):
    DataVerificationRequest = apps.get_model("app_auth", "DataVerificationRequest")
    for dvr in DataVerificationRequest.objects.all().iterator():
        # Expiry: created_at + 7 days so old campaigns are already past and never banner.
        if dvr.expires_on is None and dvr.created_at is not None:
            dvr.expires_on = (dvr.created_at + timedelta(days=7)).date()
        raw = dvr.fields or []
        normalized = []
        if isinstance(raw, list):
            for item in raw:
                if isinstance(item, str):
                    normalized.append({"name": item, "required": False})
                elif isinstance(item, dict) and "name" in item:
                    normalized.append(
                        {
                            "name": item["name"],
                            "required": bool(item.get("required", False)),
                        }
                    )
        dvr.fields = normalized
        dvr.save(update_fields=["expires_on", "fields"])


def backwards(apps, schema_editor):
    DataVerificationRequest = apps.get_model("app_auth", "DataVerificationRequest")
    for dvr in DataVerificationRequest.objects.all().iterator():
        raw = dvr.fields or []
        if isinstance(raw, list):
            dvr.fields = [
                item["name"] if isinstance(item, dict) and "name" in item else item
                for item in raw
            ]
            dvr.save(update_fields=["fields"])
```

Wire `migrations.RunPython(forwards, backwards)`.

- [ ] **Step 3: Apply migration locally**

```bash
cd schedjuice-reimagined-be
./env/bin/python manage.py migrate app_auth
```

Expected: OK

- [ ] **Step 4: Commit**

```bash
cd schedjuice-reimagined-be
git add app_auth/models.py app_auth/migrations/0075_dvr_expires_on_and_fields_shape.py
git commit -m "$(cat <<'EOF'
feat(auth): add DVR expires_on and migrate fields shape

EOF
)"
```

---

### Task 3: Serializer create — validate, snapshot, no email

**Files:**
- Modify: `schedjuice-reimagined-be/app_auth/serializers.py` (`DataVerificationRequestSerializer`)
- Modify: `schedjuice-reimagined-be/app_auth/tests/test_dvr.py`

**Interfaces:**
- Consumes: `validate_dvr_fields`, `users_matching_roles` from Task 1
- Produces: Create path that bulk-creates pending UserDVRs and creates **zero** `CREATE_DVR_AND_SEND_EMAIL` tasks

- [ ] **Step 1: Write failing serializer tests**

Append to `app_auth/tests/test_dvr.py`:

```python
from datetime import date, timedelta
from uuid import uuid4
from unittest.mock import MagicMock

from django.test import TestCase
from tenant_schemas.utils import schema_context

from app_auth.models import DataVerificationRequest, User, UserDataVerificationRequest
from app_auth.serializers import DataVerificationRequestSerializer
from app_tasks.models import Task


class DataVerificationRequestCreateTests(TestCase):
    schema_name = "xschedjuice"

    def _user(self, email: str, roles: list[str]) -> User:
        return User.objects.create(
            email=email,
            name=email.split("@")[0],
            phone_number="1",
            communication_email=email,
            code=f"dvr-{uuid4().hex[:8]}",
            roles=roles,
        )

    def test_create_snapshots_overlapping_roles_without_email_tasks(self):
        with schema_context(self.schema_name):
            teacher = self._user(f"t-{uuid4().hex[:8]}@x.io", ["teacher"])
            student = self._user(f"s-{uuid4().hex[:8]}@x.io", ["student"])
            admin = self._user(f"a-{uuid4().hex[:8]}@x.io", ["admin"])
            request = MagicMock()
            request.user = admin

            expires = date.today() + timedelta(days=7)
            ser = DataVerificationRequestSerializer(
                data={
                    "name": f"dvr-{uuid4().hex[:8]}",
                    "fields": [
                        {"name": "phone_number", "required": True},
                        {"name": "city", "required": False},
                    ],
                    "requested_user_types": ["teacher"],
                    "expires_on": expires.isoformat(),
                },
                context={"request": request},
            )
            self.assertTrue(ser.is_valid(), ser.errors)
            dvr = ser.save()

            self.assertEqual(dvr.expires_on, expires)
            user_ids = set(
                UserDataVerificationRequest.objects.filter(
                    data_verification_request=dvr
                ).values_list("user_id", flat=True)
            )
            self.assertIn(teacher.id, user_ids)
            self.assertNotIn(student.id, user_ids)
            self.assertEqual(
                Task.objects.filter(
                    name=Task.TaskName.CREATE_DVR_AND_SEND_EMAIL,
                    data__dvr_id=dvr.id,
                ).count(),
                0,
            )

    def test_create_rejects_empty_fields(self):
        with schema_context(self.schema_name):
            admin = self._user(f"a-{uuid4().hex[:8]}@x.io", ["admin"])
            request = MagicMock()
            request.user = admin
            ser = DataVerificationRequestSerializer(
                data={
                    "name": f"dvr-{uuid4().hex[:8]}",
                    "fields": [],
                    "requested_user_types": ["teacher"],
                    "expires_on": (date.today() + timedelta(days=7)).isoformat(),
                },
                context={"request": request},
            )
            self.assertFalse(ser.is_valid())
            self.assertIn("fields", ser.errors)
```

- [ ] **Step 2: Run to verify fail**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_auth.tests.test_dvr.DataVerificationRequestCreateTests
```

Expected: FAIL (still creates tasks / no validation)

- [ ] **Step 3: Update serializer**

Replace `DataVerificationRequestSerializer` body with:

```python
from datetime import date, timedelta

from app_auth.dvr import users_matching_roles, validate_dvr_fields
from app_auth.models import UserDataVerificationRequest
# remove Task import usage from this create path


class DataVerificationRequestSerializer(BaseModelSerializer):
    class Meta:
        model = DataVerificationRequest
        fields = "__all__"
        expandable_fields = {
            "created_by": ("app_auth.serializers.UserSerializer"),
        }

    def validate_fields(self, value):
        return validate_dvr_fields(value)

    def validate_requested_user_types(self, value):
        if not value:
            raise serializers.ValidationError("Select at least one user type.")
        return value

    def validate_expires_on(self, value):
        if value is None:
            raise serializers.ValidationError("Expiry date is required.")
        return value

    def create(self, validated_data):
        request = self.context.get("request")
        # Keep existing created_by lookup behavior (do not expand into a refactor).
        validated_data["created_by"] = User.objects.filter(
            email=getattr(request.user, "id", None)
        ).first()
        if "expires_on" not in validated_data or validated_data["expires_on"] is None:
            validated_data["expires_on"] = date.today() + timedelta(days=7)

        dvr = super().create(validated_data)
        role_types = validated_data.get("requested_user_types") or []
        user_ids = list(users_matching_roles(role_types).values_list("id", flat=True))
        UserDataVerificationRequest.objects.bulk_create(
            [
                UserDataVerificationRequest(
                    user_id=uid,
                    data_verification_request=dvr,
                    status=UserDataVerificationRequest.Status.PENDING,
                )
                for uid in user_ids
            ],
            ignore_conflicts=True,
        )
        return dvr
```

Ensure `serializers` is the DRF module already imported in this file (use `from rest_framework import serializers` or existing alias). Drop unused `Task` import from this create path if nothing else in-file needs it from this block.

- [ ] **Step 4: Run create tests**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_auth.tests.test_dvr.DataVerificationRequestCreateTests
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-be
git add app_auth/serializers.py app_auth/tests/test_dvr.py
git commit -m "$(cat <<'EOF'
feat(auth): snapshot DVR users on create without email tasks

EOF
)"
```

---

### Task 4: Enforce required fields when marking verified

**Files:**
- Modify: `schedjuice-reimagined-be/app_auth/serializers.py` (`UserDataVerificationRequestSerializer`)
- Modify: `schedjuice-reimagined-be/app_auth/tests/test_dvr.py`

**Interfaces:**
- Consumes: `normalize_dvr_fields`, `user_missing_required_fields`
- Produces: PATCH/PUT to `verified` rejected with 400 if required user fields empty

- [ ] **Step 1: Write failing test**

```python
class UserDataVerificationRequestVerifyTests(TestCase):
    schema_name = "xschedjuice"

    def test_cannot_verify_when_required_field_empty(self):
        with schema_context(self.schema_name):
            user = User.objects.create(
                email=f"u-{uuid4().hex[:8]}@x.io",
                name="U",
                phone_number="",
                communication_email=f"u-{uuid4().hex[:8]}@x.io",
                code=f"dvr-{uuid4().hex[:8]}",
                roles=["teacher"],
            )
            dvr = DataVerificationRequest.objects.create(
                name=f"dvr-{uuid4().hex[:8]}",
                fields=[{"name": "phone_number", "required": True}],
                requested_user_types=["teacher"],
                expires_on=date.today() + timedelta(days=7),
            )
            udvr = UserDataVerificationRequest.objects.create(
                user=user,
                data_verification_request=dvr,
                status=UserDataVerificationRequest.Status.PENDING,
            )
            ser = UserDataVerificationRequestSerializer(
                udvr,
                data={"status": "verified"},
                partial=True,
            )
            self.assertFalse(ser.is_valid())
            self.assertIn("status", ser.errors)
```

- [ ] **Step 2: Run to verify fail**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_auth.tests.test_dvr.UserDataVerificationRequestVerifyTests
```

Expected: FAIL (currently accepts)

- [ ] **Step 3: Implement validate on UserDVR serializer**

```python
from app_auth.dvr import normalize_dvr_fields, user_missing_required_fields


class UserDataVerificationRequestSerializer(BaseModelSerializer):
    class Meta:
        model = UserDataVerificationRequest
        fields = "__all__"

    expandable_fields = {
        "user": ("app_auth.serializers.UserSerializer"),
        "data_verification_request": (
            "app_auth.serializers.DataVerificationRequestSerializer"
        ),
    }

    def validate(self, attrs):
        attrs = super().validate(attrs) if hasattr(super(), "validate") else attrs
        new_status = attrs.get("status", getattr(self.instance, "status", None))
        if new_status != UserDataVerificationRequest.Status.VERIFIED:
            return attrs
        instance = self.instance
        if instance is None:
            return attrs
        dvr = instance.data_verification_request
        fields = normalize_dvr_fields(dvr.fields)
        missing = user_missing_required_fields(instance.user, fields)
        if missing:
            raise serializers.ValidationError(
                {
                    "status": (
                        "Cannot verify until required fields are filled: "
                        + ", ".join(missing)
                    )
                }
            )
        return attrs
```

Note: if `BaseModelSerializer.validate` exists, call it; otherwise only run the status check.

- [ ] **Step 4: Run tests**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_auth.tests.test_dvr
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-be
git add app_auth/serializers.py app_auth/tests/test_dvr.py
git commit -m "$(cat <<'EOF'
feat(auth): block DVR verify when required fields are empty

EOF
)"
```

---

### Task 5: FE DVR helpers + types

**Files:**
- Create: `schedjuice-reimagined-fe/src/helpers/dvr.ts`
- Create: `schedjuice-reimagined-fe/src/helpers/dvr.test.ts`
- Modify: `schedjuice-reimagined-fe/src/types/dvr.ts`
- Modify: `schedjuice-reimagined-fe/src/sdk/_types/data-verification-requests.ts`

**Interfaces:**
- Consumes: `dvrFieldSchema` paths, `STAFF_ROLES` from `@/helpers/role`
- Produces:
  - `DvrFieldConfig = { name: string; required: boolean }`
  - `normalizeDvrFields(raw: unknown): DvrFieldConfig[]`
  - `defaultDvrFieldConfigs(): DvrFieldConfig[]` (all catalog, required false)
  - `defaultDvrExpiresOn(today?: Date): string` (ISO date today+7)
  - `includedFieldNames(fields): string[]`
  - `requiredFieldNames(fields): string[]`
  - `pickBannerUserDvr(rows, today): row | null`

- [ ] **Step 1: Write failing unit tests**

`src/helpers/dvr.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  defaultDvrExpiresOn,
  defaultDvrFieldConfigs,
  normalizeDvrFields,
  pickBannerUserDvr,
  requiredFieldNames,
} from "./dvr";

describe("normalizeDvrFields", () => {
  it("coerces legacy strings", () => {
    expect(normalizeDvrFields(["phone_number"])).toEqual([
      { name: "phone_number", required: false },
    ]);
  });
});

describe("defaultDvrFieldConfigs", () => {
  it("includes all catalog fields as optional", () => {
    const all = defaultDvrFieldConfigs();
    expect(all.length).toBeGreaterThan(5);
    expect(all.every((f) => f.required === false)).toBe(true);
  });
});

describe("defaultDvrExpiresOn", () => {
  it("is today + 7 days", () => {
    expect(defaultDvrExpiresOn(new Date("2026-07-18T12:00:00Z"))).toBe(
      "2026-07-25",
    );
  });
});

describe("pickBannerUserDvr", () => {
  it("picks soonest pending unexpired", () => {
    const picked = pickBannerUserDvr(
      [
        {
          id: 1,
          status: "pending",
          data_verification_request: { id: 10, expires_on: "2026-07-28", name: "A" },
        },
        {
          id: 2,
          status: "pending",
          data_verification_request: { id: 11, expires_on: "2026-07-20", name: "B" },
        },
      ],
      new Date("2026-07-18T12:00:00Z"),
    );
    expect(picked?.id).toBe(2);
  });
});

describe("requiredFieldNames", () => {
  it("returns only required", () => {
    expect(
      requiredFieldNames([
        { name: "phone_number", required: true },
        { name: "city", required: false },
      ]),
    ).toEqual(["phone_number"]);
  });
});
```

- [ ] **Step 2: Run to verify fail**

```bash
cd schedjuice-reimagined-fe
bun run test:unit -- src/helpers/dvr.test.ts
```

Expected: FAIL (module missing)

- [ ] **Step 3: Implement helpers + types**

`src/helpers/dvr.ts`:

```ts
import { getPropertyPaths } from "@/helpers/getPropertyPaths";
import { STAFF_ROLES } from "@/helpers/role";
import { dvrFieldSchema } from "@/types/user";

export type DvrFieldConfig = { name: string; required: boolean };

export const DVR_STAFF_ROLE_DEFAULTS = [...STAFF_ROLES] as string[];

export function normalizeDvrFields(raw: unknown): DvrFieldConfig[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === "string") {
        return { name: item, required: false };
      }
      if (item && typeof item === "object" && "name" in item) {
        const name = String((item as { name: unknown }).name);
        const required = Boolean((item as { required?: unknown }).required);
        return { name, required };
      }
      return null;
    })
    .filter((x): x is DvrFieldConfig => x != null);
}

export function defaultDvrFieldConfigs(): DvrFieldConfig[] {
  return getPropertyPaths(dvrFieldSchema).map((name) => ({
    name,
    required: false,
  }));
}

export function defaultDvrExpiresOn(today: Date = new Date()): string {
  const d = new Date(today);
  d.setDate(d.getDate() + 7);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function includedFieldNames(fields: DvrFieldConfig[]): string[] {
  return fields.map((f) => f.name);
}

export function requiredFieldNames(fields: DvrFieldConfig[]): string[] {
  return fields.filter((f) => f.required).map((f) => f.name);
}

export type BannerUserDvr = {
  id: number;
  status: string;
  data_verification_request?: {
    id: number;
    name?: string;
    expires_on?: string | null;
  } | null;
};

function toLocalIsoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function pickBannerUserDvr(
  rows: BannerUserDvr[],
  today: Date = new Date(),
): BannerUserDvr | null {
  const todayStr = toLocalIsoDate(today);

  const eligible = rows.filter((row) => {
    if (row.status !== "pending") return false;
    const exp = row.data_verification_request?.expires_on;
    if (!exp) return false;
    return exp >= todayStr;
  });
  if (eligible.length === 0) return null;
  eligible.sort((a, b) => {
    const ae = a.data_verification_request!.expires_on!;
    const be = b.data_verification_request!.expires_on!;
    if (ae !== be) return ae < be ? -1 : 1;
    return a.id - b.id;
  });
  return eligible[0] ?? null;
}
```

Update `src/types/dvr.ts`:

```ts
export const dvrFieldConfigSchema = z.object({
  name: z.string(),
  required: z.boolean(),
});

export const dataVerificationRequestSchema = z.object({
  id: z.number(),
  name: z.string(),
  fields: z.array(z.union([z.string(), dvrFieldConfigSchema])).optional(),
  requested_user_types: z.any(),
  expires_on: z.string().optional().nullable(),
  created_by: z.any().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const dvrCreateSchema = dataVerificationRequestSchema.pick({
  name: true,
  fields: true,
  requested_user_types: true,
  expires_on: true,
});
```

Update SDK type:

```ts
export type DataVerificationRequest = {
  id: number;
  name: string;
  fields?: Array<string | { name: string; required: boolean }> | null;
  requested_user_types?: string[] | null;
  expires_on?: string | null;
  created_by?: { id: number; name?: string } | null;
  created_at?: string;
  updated_at?: string;
};
```

- [ ] **Step 4: Run unit tests**

```bash
cd schedjuice-reimagined-fe
bun run test:unit -- src/helpers/dvr.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/helpers/dvr.ts src/helpers/dvr.test.ts src/types/dvr.ts src/sdk/_types/data-verification-requests.ts
git commit -m "$(cat <<'EOF'
feat(dvr): add field/expiry helpers and types

EOF
)"
```

---

### Task 6: Create page defaults + include/required UI

**Files:**
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/data-verification-requests/create/page.tsx`

**Interfaces:**
- Consumes: `defaultDvrFieldConfigs`, `defaultDvrExpiresOn`, `DVR_STAFF_ROLE_DEFAULTS`, `normalizeDvrFields`
- Produces: POST body with object `fields`, `expires_on`, staff defaults; redirect to detail (CopyInput already there)

- [ ] **Step 1: Update create page state defaults**

```tsx
const [selectedFields, setSelectedFields] = useState<DvrFieldConfig[]>(() =>
  defaultDvrFieldConfigs(),
);
const [selectedRoles, setSelectedRoles] = useState<string[]>(() => [
  ...DVR_STAFF_ROLE_DEFAULTS,
]);
const [expiresOn, setExpiresOn] = useState(() => defaultDvrExpiresOn());
```

- [ ] **Step 2: Replace field checkboxes with include + required**

For each catalog path from `defaultDvrFieldConfigs()` / `getPropertyPaths(dvrFieldSchema)`:

- Checkbox “include” — toggles presence in `selectedFields`
- Checkbox “required” — disabled when not included; sets `required` on that config

Keep RoleChooser wired to `selectedRoles`.

Add an expiry date input bound to `expiresOn` (native `type="date"` or existing date field component used elsewhere in admin forms). Include it in submit payload.

- [ ] **Step 3: Submit + redirect to detail**

`GenericForm` create `onSuccess` currently ignores the mutation response (`onSuccess: () => { ... }`). Make the smallest change so callers can redirect with the new id:

In `src/components/form/generic-form.tsx`:

1. Widen prop type: `onSuccess?: (created?: any) => void`
2. Change create mutation to:

```tsx
onSuccess: (res) => {
  toast.add({
    description: `${entityName} created successfully`,
  });
  queryClient.invalidateQueries({
    queryKey: [`getAll${entityName}`],
  });
  if (onSucess) {
    onSucess(res);
  } else {
    router.push(redirectUrl || `/${apiUrl}`);
  }
},
```

On the create page:

```tsx
const router = useRouter();

const onSubmit = useCallback(
  (data: any, submit: () => void) => {
    if (selectedFields.length === 0) {
      toast.add({ description: "Please select at least one field" });
      return;
    }
    if (selectedRoles.length === 0) {
      toast.add({ description: "Please select at least one user type" });
      return;
    }
    data.fields = selectedFields;
    data.requested_user_types = selectedRoles;
    data.expires_on = expiresOn;
    submit();
  },
  [selectedFields, selectedRoles, expiresOn, toast],
);

// GenericForm:
onSuccess={(res) => {
  const id = res?.data?.data?.id;
  if (id != null) {
    router.push(`/data-verification-requests/${id}`);
    return;
  }
  router.push("/data-verification-requests");
}}
```

Detail page already renders `CopyInput` for the verify URL — that satisfies the “admin copies link” requirement.

- [ ] **Step 4: Manual smoke**

Run FE dev server, create a DVR with defaults, confirm POST payload shape and landing on detail with copy link.

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/app/(internal)/data-verification-requests/create/page.tsx src/components/form/generic-form.tsx
git commit -m "$(cat <<'EOF'
feat(dvr): create defaults, required flags, and detail redirect

EOF
)"
```

---

### Task 7: Verify page respects required flags

**Files:**
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/data-verification-requests/[id]/verify/page.tsx`

**Interfaces:**
- Consumes: `normalizeDvrFields`, `includedFieldNames`, `requiredFieldNames`
- Produces: Zod pick where required names are non-optional; optional included remain optional

- [ ] **Step 1: Replace getSchema**

```tsx
import { normalizeDvrFields, includedFieldNames, requiredFieldNames } from "@/helpers/dvr";

const getSchema = (rawFields: unknown) => {
  const configs = normalizeDvrFields(rawFields);
  const included = includedFieldNames(configs);
  const required = new Set(requiredFieldNames(configs));
  const picked = accountEditSchema.pick(
    Object.fromEntries(included.map((f) => [f, true])) as any,
  );
  // Soften optional fields: for each included name not in required, make zod optional/nullable
  // Pattern used elsewhere: picked.extend / .partial on optional keys
  const optionalKeys = included.filter((f) => !required.has(f));
  return optionalKeys.length ? picked.partial(
    Object.fromEntries(optionalKeys.map((k) => [k, true])) as any,
  ) : picked;
};
```

Use whatever zod partial pattern already works with `accountEditSchema` in this codebase; required keys must remain required.

Keep success flow: update user → mutate UserDVR status `verified`.

- [ ] **Step 2: Smoke / unit if cheap**

If extracting `getSchema` to `helpers/dvr.ts` as `buildDvrVerifySchema(rawFields)`, add a small vitest; otherwise manual verify with one required empty field blocked client-side.

- [ ] **Step 3: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/app/(internal)/data-verification-requests/[id]/verify/page.tsx src/helpers/dvr.ts src/helpers/dvr.test.ts
git commit -m "$(cat <<'EOF'
feat(dvr): enforce required fields on verify form

EOF
)"
```

---

### Task 8: Pending DVR banner in AppShell

**Files:**
- Create: `schedjuice-reimagined-fe/src/components/layout/dvr-pending-banner.tsx`
- Create: `schedjuice-reimagined-fe/src/components/layout/dvr-pending-banner.test.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/shell/app-shell.tsx`

**Interfaces:**
- Consumes: `pickBannerUserDvr`, `useUser`, search `user-data-verification-requests` with expand
- Produces: Sticky non-dismissible banner with Verify CTA

- [ ] **Step 1: Write component test (render eligibility)**

Test the pure presentational branch by exporting a small inner component or testing `pickBannerUserDvr` integration:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DvrPendingBannerView } from "./dvr-pending-banner";

describe("DvrPendingBannerView", () => {
  it("renders due date and verify link", () => {
    render(
      <DvrPendingBannerView
        dvrId={42}
        expiresOn="2026-07-25"
        name="Staff data check"
      />,
    );
    expect(screen.getByText(/verify your profile data/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /verify/i })).toHaveAttribute(
      "href",
      "/data-verification-requests/42/verify",
    );
  });
});
```

- [ ] **Step 2: Implement banner**

`dvr-pending-banner.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { searchEntities } from "@/app/client-api/utils";
import { useUser } from "@/hooks/useUser";
import { pickBannerUserDvr, type BannerUserDvr } from "@/helpers/dvr";
import { operatorEnum } from "@/types/api";
import { bannerStickyClassName } from "@/lib/ui/overlay-classnames";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/primitives";

export function DvrPendingBannerView(props: {
  dvrId: number;
  expiresOn: string;
  name?: string;
}) {
  return (
    <div
      className={cn(
        bannerStickyClassName,
        "border-b border-amber-600/50 bg-amber-100 px-4 py-3 text-amber-950 dark:bg-amber-950/50 dark:text-amber-50",
      )}
    >
      <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium">
          Please verify your profile data
          {props.name ? ` (${props.name})` : ""} — due {props.expiresOn}
        </p>
        <Link
          href={`/data-verification-requests/${props.dvrId}/verify`}
          className={cn(buttonVariants({ size: "sm", variant: "primary" }))}
        >
          Verify
        </Link>
      </div>
    </div>
  );
}

export function DvrPendingBanner() {
  const { user } = useUser();
  const { data } = useQuery({
    queryKey: ["pending-user-dvrs", user?.id],
    enabled: !!user?.id,
    queryFn: () =>
      searchEntities(
        "user-data-verification-requests",
        { expand: ["data_verification_request"] },
        {
          filter_params: [
            {
              field_name: "user_id",
              operator: operatorEnum.exact,
              value: String(user!.id),
            },
            {
              field_name: "status",
              operator: operatorEnum.exact,
              value: "pending",
            },
          ],
        },
      ),
  });

  const rows = (data?.data?.data ?? []) as BannerUserDvr[];
  const picked = pickBannerUserDvr(rows);
  if (!picked?.data_verification_request?.id) return null;

  return (
    <DvrPendingBannerView
      dvrId={picked.data_verification_request.id}
      expiresOn={picked.data_verification_request.expires_on ?? ""}
      name={picked.data_verification_request.name}
    />
  );
}
```

Mount in `app-shell.tsx` inside the `sj-content-reset empty:hidden` block **below** `ViewAsBanner`:

```tsx
<ViewAsBanner />
<DvrPendingBanner />
```

- [ ] **Step 3: Run unit test**

```bash
cd schedjuice-reimagined-fe
bun run test:unit -- src/components/layout/dvr-pending-banner.test.tsx
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/components/layout/dvr-pending-banner.tsx src/components/layout/dvr-pending-banner.test.tsx src/components/shell/app-shell.tsx
git commit -m "$(cat <<'EOF'
feat(dvr): show sticky pending verification banner in app shell

EOF
)"
```

---

### Task 9: List/detail polish

**Files:**
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/data-verification-requests/dvr-columns.tsx`
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/data-verification-requests/[id]/page.tsx`

**Interfaces:**
- Consumes: `normalizeDvrFields`, `expires_on` on DVR
- Produces: List shows expiry; detail shows expiry + field required badges; keep existing `CopyInput`

- [ ] **Step 1: Add expires_on column**

```tsx
column.date<DataVerificationRequest>({
  id: "expires_on",
  header: "Expires",
  accessor: (row) => row.expires_on,
}),
```

(Match existing `column.date` API used in `dvr-columns.tsx`.)

- [ ] **Step 2: Detail page**

- Show `Expires on: {dvrData.expires_on}` near header/audit.
- When mapping fields, use `normalizeDvrFields(dvrData.fields)` and render `phone number (required)` vs `city` for optional.
- Keep `CopyInput` verify URL unchanged.

Optional YAGNI: pending/verified counts via a second `searchEntities("user-data-verification-requests", …)` filtered by `data_verification_request_id` — only if a cheap pattern already exists on the page; otherwise skip counts for this task.

- [ ] **Step 3: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/app/(internal)/data-verification-requests/dvr-columns.tsx src/app/(internal)/data-verification-requests/[id]/page.tsx
git commit -m "$(cat <<'EOF'
feat(dvr): show expiry and required field labels in admin UI

EOF
)"
```

---

### Task 10: End-to-end verification + cleanup notes

**Files:**
- None required (manual + full test run). Optional: leave `create_dvr_and_send_email` task handler in place for old queued tasks; do not enqueue new ones.

- [ ] **Step 1: Run backend suite for DVR**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_auth.tests.test_dvr
```

Expected: PASS

- [ ] **Step 2: Run FE unit tests touched**

```bash
cd schedjuice-reimagined-fe
bun run test:unit -- src/helpers/dvr.test.ts src/components/layout/dvr-pending-banner.test.tsx
```

Expected: PASS

- [ ] **Step 3: Manual checklist**

1. Admin opens Create DVR → all fields included, staff roles selected, expiry +7d.
2. Create → lands on detail → CopyInput has verify URL.
3. No email tasks created for that DVR.
4. Teacher in snapshot sees banner; student not in snapshot does not.
5. Banner CTA opens verify; optional field can stay empty; required empty blocks submit.
6. After verify, banner gone.
7. Set `expires_on` in past (admin edit or shell) → banner gone; verify URL still loads.

- [ ] **Step 4: Final commit only if leftover fixes**

```bash
# only if Step 3 required code fixes
git commit -m "$(cat <<'EOF'
fix(dvr): address upgrade smoke-test issues

EOF
)"
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
| --- | --- |
| `expires_on` default +7d | 2, 3, 5, 6 |
| Object `fields` + required flags | 1, 2, 5, 6, 7 |
| Snapshot enrollment by role overlap | 1, 3 |
| No email | 3 |
| Copyable verify URL after create | 6 → existing detail `CopyInput` |
| Sticky non-dismissible banner | 8 |
| Banner hides after expiry; verify still works | 1, 4, 8 |
| Banner clears on self-verify | 4, 7, 8 |
| Server required enforcement | 4 |
| List/detail expiry + field summary | 9 |
| No live enrollment / no re-snapshot | 3, 9 (edit untouched for enrollment) |
| Staff role defaults | 5, 6 |

## Placeholder / consistency fixes applied while writing

- `pickBannerUserDvr` FE uses local `YYYY-MM-DD` string compare (not UTC-shift helper misuse).
- Role matching is OR-overlap via `users_matching_roles` (product intent), not ArrayField `contains` of the full list.
- Create success uses detail page CopyInput rather than inventing a second share surface.
