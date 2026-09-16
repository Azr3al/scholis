# Microsoft Bulk Password Reset — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Repo policy:** Run `git commit` steps only when the user has authorized commits.

**Goal:** Add a platform-internal `/debug/microsoft-password-reset` page and backend preview/commit endpoints so superadmins can paste up to 50 emails and reset Entra passwords to `IMPORT_PASSWORD` (`Password123$`).

**Architecture:** New `app_microsoft/password_reset_bulk.py` holds email normalization, user resolution, and Graph orchestration; thin RBAC views (`debug.access`, MS tenant gate) expose preview (no Graph) and commit (per-email Graph reset with partial success). Frontend reuses `parseStudentEmailPaste`, shows preview table, then confirm dialog before commit.

**Tech Stack:** Django + DRF (`schedjuice-reimagined-be`), React/Next.js + Vitest + TanStack Query (`schedjuice-reimagined-fe`), MS Graph via `MSUser.reset_password`.

**Spec:** `docs/superpowers/specs/2026-07-07-ms-bulk-password-reset-design.md`

## File Structure

**Backend (`schedjuice-reimagined-be`)**

- Modify `app_microsoft/graph_wrapper/user.py` — optional `password` kwarg on `reset_password`.
- Modify `app_auth/views.py` — fix `OauthPasswordResetView` to pass `request.tenant` (existing one-arg call is broken).
- Create `app_microsoft/password_reset_bulk.py` — `preview_emails`, `commit_emails`, validation helpers.
- Modify `app_microsoft/views.py` — `MicrosoftPasswordResetPreviewView`, `MicrosoftPasswordResetCommitView`.
- Modify `app_microsoft/urls.py` — register two routes.
- Create `app_microsoft/tests/test_password_reset_bulk.py` — unit + API tests.

**Frontend (`schedjuice-reimagined-fe`)**

- Modify `src/app/client-api/microsoft.ts` — preview/commit client + types.
- Create `src/lib/microsoft/password-reset-bulk.ts` — `MAX_MS_PASSWORD_RESET_EMAILS` constant.
- Create `src/lib/microsoft/password-reset-bulk.test.ts` — cap constant test.
- Create `src/app/(internal)/debug/microsoft-password-reset/page.tsx` — paste/preview/confirm UI.
- Modify `src/config/nav-routes.tsx` — nav link under Platform → Debug.

---

### Task 1: Graph — `reset_password` accepts optional password

**Files:**
- Modify: `schedjuice-reimagined-be/app_microsoft/graph_wrapper/user.py`
- Modify: `schedjuice-reimagined-be/app_auth/views.py` (fix tenant arg on existing OAuth reset call)
- Create: `schedjuice-reimagined-be/app_microsoft/tests/test_reset_password_kwarg.py`

- [ ] **Step 1: Write failing test**

Create `app_microsoft/tests/test_reset_password_kwarg.py`:

```python
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from app_microsoft.graph_wrapper.user import MSUser


class ResetPasswordKwargTests(SimpleTestCase):
    @patch.object(MSUser, "post")
    @patch.object(MSUser, "get_token")
    def test_uses_provided_password(self, _mock_token, mock_post):
        mock_post.return_value = MagicMock(status_code=200)
        tenant = MagicMock()
        ms = MSUser.__new__(MSUser)

        result = ms.reset_password("ms-id-1", tenant, password="Password123$")

        self.assertEqual(result["new_password"], "Password123$")
        self.assertEqual(result["status"], 200)
        payload = mock_post.call_args[0][1]
        self.assertIn("Password123$", payload)

    @patch.object(MSUser, "post")
    @patch.object(MSUser, "get_token")
    @patch.object(MSUser, "_generate_password", return_value="Random1!")
    def test_defaults_to_generated_password(self, _mock_gen, _mock_token, mock_post):
        mock_post.return_value = MagicMock(status_code=200)
        tenant = MagicMock()
        ms = MSUser.__new__(MSUser)

        result = ms.reset_password("ms-id-1", tenant)

        self.assertEqual(result["new_password"], "Random1!")
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_microsoft.tests.test_reset_password_kwarg -v 2
```
Expected: FAIL — `reset_password() got an unexpected keyword argument 'password'`

- [ ] **Step 3: Implement**

In `app_microsoft/graph_wrapper/user.py`, replace `reset_password`:

```python
    def reset_password(self, user_id: str, tenant, *, password: str | None = None):
        new_password = password or self._generate_password()
        payload = {
            "newPassword": new_password,
        }
        self.get_token(tenant, with_password=True)

        response = self.post(
            f"{self.URL}users/{user_id}/authentication/methods/{self.PASSWORD_METHOD_ID}/resetPassword",
            json.dumps(payload),
        )
        return {
            "new_password": new_password,
            "status": response.status_code,
        }
```

In `app_auth/views.py` `OauthPasswordResetView.post`, fix the call:

```python
            x = ms_user.reset_password(local_user.microsoft_id, request.tenant)
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_microsoft.tests.test_reset_password_kwarg -v 2
```
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-be
git add app_microsoft/graph_wrapper/user.py app_auth/views.py app_microsoft/tests/test_reset_password_kwarg.py
git commit -m "feat(ms): allow optional password on Graph reset_password"
```

---

### Task 2: Backend — bulk preview logic

**Files:**
- Create: `schedjuice-reimagined-be/app_microsoft/password_reset_bulk.py`
- Create: `schedjuice-reimagined-be/app_microsoft/tests/test_password_reset_bulk.py` (preview tests only in this task)

- [ ] **Step 1: Write failing preview tests**

Create `app_microsoft/tests/test_password_reset_bulk.py`:

```python
from uuid import uuid4

from django.test import SimpleTestCase, TestCase
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_microsoft.password_reset_bulk import (
    BulkPasswordResetError,
    MAX_EMAILS,
    preview_emails,
)


class ParseEmailListTests(SimpleTestCase):
    def test_rejects_non_list(self):
        tenant = type("T", (), {"is_microsoft_on": True})()
        with self.assertRaises(BulkPasswordResetError) as ctx:
            preview_emails(tenant, None)
        self.assertEqual(ctx.exception.code, "missing_emails")

    def test_rejects_empty_list(self):
        tenant = type("T", (), {"is_microsoft_on": True})()
        with self.assertRaises(BulkPasswordResetError) as ctx:
            preview_emails(tenant, [])
        self.assertEqual(ctx.exception.code, "missing_emails")

    def test_rejects_over_cap(self):
        tenant = type("T", (), {"is_microsoft_on": True})()
        emails = [f"u{i}@x.io" for i in range(MAX_EMAILS + 1)]
        with self.assertRaises(BulkPasswordResetError) as ctx:
            preview_emails(tenant, emails)
        self.assertEqual(ctx.exception.code, "too_many_emails")

    def test_rejects_ms_disabled_tenant(self):
        tenant = type("T", (), {"is_microsoft_on": False})()
        with self.assertRaises(BulkPasswordResetError) as ctx:
            preview_emails(tenant, ["a@x.io"])
        self.assertEqual(ctx.exception.code, "not_supported")


class PreviewEmailsTests(TestCase):
    schema_name = "xschedjuice"

    def setUp(self):
        suffix = uuid4().hex[:8]
        with schema_context(self.schema_name):
            self.eligible = User.objects.create(
                email=f"eligible-{suffix}@x.io",
                name="Eligible",
                phone_number="1",
                communication_email=f"eligible-{suffix}@x.io",
                code=f"ms-pw-{suffix}-e",
                roles=["student"],
                microsoft_id="ms-graph-id-1",
            )
            self.unlinked = User.objects.create(
                email=f"unlinked-{suffix}@x.io",
                name="Unlinked",
                phone_number="1",
                communication_email=f"unlinked-{suffix}@x.io",
                code=f"ms-pw-{suffix}-u",
                roles=["student"],
                microsoft_id="",
            )

    def test_classifies_eligible_not_found_and_unlinked(self):
        tenant = type("T", (), {"is_microsoft_on": True})()
        with schema_context(self.schema_name):
            result = preview_emails(
                tenant,
                [
                    self.eligible.email,
                    "missing@x.io",
                    self.unlinked.email,
                ],
            )

        self.assertEqual(result["summary"]["eligible"], 1)
        self.assertEqual(result["summary"]["not_found"], 1)
        self.assertEqual(result["summary"]["no_microsoft_account"], 1)
        statuses = {r["email"]: r["status"] for r in result["results"]}
        self.assertEqual(statuses[self.eligible.email], "eligible")
        self.assertEqual(statuses["missing@x.io"], "not_found")
        self.assertEqual(statuses[self.unlinked.email], "no_microsoft_account")

    def test_dedupes_case_insensitively(self):
        tenant = type("T", (), {"is_microsoft_on": True})()
        with schema_context(self.schema_name):
            result = preview_emails(
                tenant,
                [self.eligible.email.upper(), self.eligible.email],
            )

        self.assertEqual(result["summary"]["total"], 1)
        self.assertEqual(len(result["results"]), 1)
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_microsoft.tests.test_password_reset_bulk -v 2
```
Expected: FAIL — `ModuleNotFoundError: app_microsoft.password_reset_bulk`

- [ ] **Step 3: Implement preview module**

Create `app_microsoft/password_reset_bulk.py`:

```python
from __future__ import annotations

from app_auth.models import User
from app_organization.acca_spreadsheet_import import normalize_email

MAX_EMAILS = 50


class BulkPasswordResetError(Exception):
    def __init__(self, message: str, code: str):
        super().__init__(message)
        self.code = code


def _require_microsoft_tenant(tenant) -> None:
    if not getattr(tenant, "is_microsoft_on", False):
        raise BulkPasswordResetError(
            "Microsoft integration is not enabled for this organization.",
            "not_supported",
        )


def _parse_email_list(raw_emails) -> list[str]:
    if not isinstance(raw_emails, list):
        raise BulkPasswordResetError("emails must be an array.", "missing_emails")
    seen: set[str] = set()
    parsed: list[str] = []
    for item in raw_emails:
        if not isinstance(item, str):
            continue
        display = item.strip()
        normalized = normalize_email(display)
        if not normalized:
            continue
        if normalized in seen:
            continue
        seen.add(normalized)
        parsed.append(normalized)
    if not parsed:
        raise BulkPasswordResetError("emails must be a non-empty array.", "missing_emails")
    if len(parsed) > MAX_EMAILS:
        raise BulkPasswordResetError(
            f"At most {MAX_EMAILS} emails per request.",
            "too_many_emails",
        )
    return parsed


def _resolve_preview_row(email: str) -> dict:
    user = User.objects.filter(email=email).first()
    if user is None:
        return {"email": email, "status": "not_found"}
    if not (user.microsoft_id or "").strip():
        return {
            "email": email,
            "status": "no_microsoft_account",
            "user_id": user.id,
        }
    return {
        "email": email,
        "status": "eligible",
        "user_id": user.id,
        "microsoft_id": user.microsoft_id,
    }


def preview_emails(tenant, raw_emails: list) -> dict:
    _require_microsoft_tenant(tenant)
    emails = _parse_email_list(raw_emails)
    results = [_resolve_preview_row(email) for email in emails]
    summary = {
        "total": len(results),
        "eligible": sum(1 for r in results if r["status"] == "eligible"),
        "not_found": sum(1 for r in results if r["status"] == "not_found"),
        "no_microsoft_account": sum(
            1 for r in results if r["status"] == "no_microsoft_account"
        ),
    }
    return {"results": results, "summary": summary}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_microsoft.tests.test_password_reset_bulk -v 2
```
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-be
git add app_microsoft/password_reset_bulk.py app_microsoft/tests/test_password_reset_bulk.py
git commit -m "feat(ms): add bulk password reset preview logic"
```

---

### Task 3: Backend — commit logic

**Files:**
- Modify: `schedjuice-reimagined-be/app_microsoft/password_reset_bulk.py`
- Modify: `schedjuice-reimagined-be/app_microsoft/tests/test_password_reset_bulk.py`

- [ ] **Step 1: Write failing commit tests**

Append to `app_microsoft/tests/test_password_reset_bulk.py`:

```python
from unittest.mock import MagicMock, patch

from app_microsoft.password_reset_bulk import commit_emails
from app_organization.acca_spreadsheet_import import IMPORT_PASSWORD


class CommitEmailsTests(TestCase):
    schema_name = "xschedjuice"

    def setUp(self):
        suffix = uuid4().hex[:8]
        with schema_context(self.schema_name):
            self.eligible = User.objects.create(
                email=f"commit-eligible-{suffix}@x.io",
                name="Eligible",
                phone_number="1",
                communication_email=f"commit-eligible-{suffix}@x.io",
                code=f"ms-pw-c-{suffix}-e",
                roles=["student"],
                microsoft_id="ms-graph-id-commit",
            )
            self.unlinked = User.objects.create(
                email=f"commit-unlinked-{suffix}@x.io",
                name="Unlinked",
                phone_number="1",
                communication_email=f"commit-unlinked-{suffix}@x.io",
                code=f"ms-pw-c-{suffix}-u",
                roles=["student"],
                microsoft_id="",
            )

    @patch("app_microsoft.password_reset_bulk.MSUser")
    def test_resets_eligible_with_import_password(self, mock_ms_user_cls):
        tenant = MagicMock(is_microsoft_on=True)
        mock_ms_user_cls.return_value.reset_password.return_value = {"status": 200}

        with schema_context(self.schema_name):
            result = commit_emails(
                tenant,
                [self.eligible.email, "missing@x.io", self.unlinked.email],
            )

        mock_ms_user_cls.return_value.reset_password.assert_called_once_with(
            self.eligible.microsoft_id,
            tenant,
            password=IMPORT_PASSWORD,
        )
        self.assertEqual(result["summary"]["succeeded"], 1)
        self.assertEqual(result["summary"]["skipped"], 2)
        self.assertEqual(result["summary"]["failed"], 0)

    @patch("app_microsoft.password_reset_bulk.MSUser")
    def test_graph_failure_marks_failed_and_continues(self, mock_ms_user_cls):
        tenant = MagicMock(is_microsoft_on=True)
        mock_ms_user_cls.return_value.reset_password.return_value = {
            "status": 403,
        }

        with schema_context(self.schema_name):
            result = commit_emails(tenant, [self.eligible.email])

        self.assertEqual(result["summary"]["failed"], 1)
        self.assertEqual(result["results"][0]["status"], "failed")
        self.assertIn("Graph 403", result["results"][0]["reason"])
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_microsoft.tests.test_password_reset_bulk.CommitEmailsTests -v 2
```
Expected: FAIL — `cannot import name 'commit_emails'`

- [ ] **Step 3: Implement commit**

Append to `app_microsoft/password_reset_bulk.py`:

```python
from app_microsoft.graph_wrapper.user import MSUser
from app_organization.acca_spreadsheet_import import IMPORT_PASSWORD


def _graph_failure_reason(status_code: int, response=None) -> str:
    body = ""
    if response is not None:
        body = (getattr(response, "text", None) or "")[:200]
    if body:
        return f"Graph {status_code}: {body}"
    return f"Graph {status_code}"


def commit_emails(tenant, raw_emails: list) -> dict:
    preview = preview_emails(tenant, raw_emails)
    ms_user = MSUser(tenant)
    results = []

    for row in preview["results"]:
        email = row["email"]
        if row["status"] == "not_found":
            results.append({"email": email, "status": "skipped", "reason": "not_found"})
            continue
        if row["status"] == "no_microsoft_account":
            results.append(
                {
                    "email": email,
                    "status": "skipped",
                    "reason": "no_microsoft_account",
                }
            )
            continue

        graph_result = ms_user.reset_password(
            row["microsoft_id"],
            tenant,
            password=IMPORT_PASSWORD,
        )
        status_code = graph_result.get("status", 0)
        if 200 <= status_code < 300:
            results.append({"email": email, "status": "succeeded"})
        else:
            results.append(
                {
                    "email": email,
                    "status": "failed",
                    "reason": _graph_failure_reason(status_code),
                }
            )

    summary = {
        "total": len(results),
        "succeeded": sum(1 for r in results if r["status"] == "succeeded"),
        "skipped": sum(1 for r in results if r["status"] == "skipped"),
        "failed": sum(1 for r in results if r["status"] == "failed"),
    }
    return {"results": results, "summary": summary}
```

Move the `MSUser` and `IMPORT_PASSWORD` imports to the top of the file (consolidate imports).

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_microsoft.tests.test_password_reset_bulk -v 2
```
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-be
git add app_microsoft/password_reset_bulk.py app_microsoft/tests/test_password_reset_bulk.py
git commit -m "feat(ms): add bulk password reset commit logic"
```

---

### Task 4: Backend — views, URLs, API tests

**Files:**
- Modify: `schedjuice-reimagined-be/app_microsoft/views.py`
- Modify: `schedjuice-reimagined-be/app_microsoft/urls.py`
- Modify: `schedjuice-reimagined-be/app_microsoft/tests/test_password_reset_bulk.py`

- [ ] **Step 1: Write failing API tests**

Append to `app_microsoft/tests/test_password_reset_bulk.py`:

```python
from unittest.mock import patch

from django.test import override_settings
from rest_framework.test import APIClient
from tenant_schemas.test.cases import TenantTestCase
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_organization.models import Organization
from app_rbac.seeding import seed_rbac


class PasswordResetBulkApiTests(TenantTestCase):
    tenant_domain = "xschedjuice.localhost"
    api_prefix = "/api/v1"

    def setUp(self):
        seed_rbac()
        suffix = uuid4().hex[:8]
        with schema_context(self.schema_name):
            self.superadmin = User.objects.create(
                email=f"sa-{suffix}@x.io",
                name="Superadmin",
                phone_number="1",
                communication_email=f"sa-{suffix}@x.io",
                code=f"sa-{suffix}",
                roles=["superadmin"],
            )
            self.teacher = User.objects.create(
                email=f"t-{suffix}@x.io",
                name="Teacher",
                phone_number="1",
                communication_email=f"t-{suffix}@x.io",
                code=f"t-{suffix}",
                roles=["teacher"],
            )
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=self.schema_name).update(
                is_microsoft_on=True,
            )

    def tearDown(self):
        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=self.schema_name).update(
                is_microsoft_on=False,
            )

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_X_DTS_SCHEMA=self.schema_name)
        return client

    @override_settings(RBAC_ENFORCE="enforce")
    def test_preview_requires_debug_access(self):
        response = self._client(self.teacher).post(
            f"{self.api_prefix}/microsoft/password-reset/preview",
            {"emails": ["a@x.io"]},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    @override_settings(RBAC_ENFORCE="enforce")
    @patch("app_microsoft.views.preview_emails")
    def test_preview_ok_for_superadmin(self, mock_preview):
        mock_preview.return_value = {
            "results": [],
            "summary": {
                "total": 0,
                "eligible": 0,
                "not_found": 0,
                "no_microsoft_account": 0,
            },
        }
        response = self._client(self.superadmin).post(
            f"{self.api_prefix}/microsoft/password-reset/preview",
            {"emails": ["a@x.io"]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        mock_preview.assert_called_once()

    @override_settings(RBAC_ENFORCE="enforce")
    @patch("app_microsoft.views.commit_emails")
    def test_commit_ok_for_superadmin(self, mock_commit):
        mock_commit.return_value = {
            "results": [{"email": "a@x.io", "status": "succeeded"}],
            "summary": {"total": 1, "succeeded": 1, "skipped": 0, "failed": 0},
        }
        response = self._client(self.superadmin).post(
            f"{self.api_prefix}/microsoft/password-reset/commit",
            {"emails": ["a@x.io"]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["data"]["summary"]["succeeded"], 1)
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_microsoft.tests.test_password_reset_bulk.PasswordResetBulkApiTests -v 2
```
Expected: FAIL — 404 (routes/views missing)

- [ ] **Step 3: Add views and URLs**

In `app_microsoft/views.py`, add imports and views:

```python
from app_microsoft.password_reset_bulk import BulkPasswordResetError, commit_emails, preview_emails


class MicrosoftPasswordResetPreviewView(_MicrosoftToolsBaseView):
    """POST microsoft/password-reset/preview — resolve emails, no Graph calls."""

    required_permissions = {"POST": "debug.access"}

    def post(self, request: Request):
        blocked = self._require_microsoft_on(request)
        if blocked is not None:
            return blocked
        emails = (request.data or {}).get("emails")
        try:
            result = preview_emails(request.tenant, emails)
        except BulkPasswordResetError as exc:
            return self.bad_request(exc.args[0], message=exc.code)
        return self.ok(result)


class MicrosoftPasswordResetCommitView(_MicrosoftToolsBaseView):
    """POST microsoft/password-reset/commit — reset eligible Entra passwords."""

    required_permissions = {"POST": "debug.access"}

    def post(self, request: Request):
        blocked = self._require_microsoft_on(request)
        if blocked is not None:
            return blocked
        emails = (request.data or {}).get("emails")
        try:
            result = commit_emails(request.tenant, emails)
        except BulkPasswordResetError as exc:
            return self.bad_request(exc.args[0], message=exc.code)
        return self.ok(result)
```

In `app_microsoft/urls.py`, add:

```python
    path(
        "microsoft/password-reset/preview",
        views.MicrosoftPasswordResetPreviewView.as_view(),
        name="microsoft-password-reset-preview",
    ),
    path(
        "microsoft/password-reset/commit",
        views.MicrosoftPasswordResetCommitView.as_view(),
        name="microsoft-password-reset-commit",
    ),
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_microsoft.tests.test_password_reset_bulk -v 2
```
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-be
git add app_microsoft/views.py app_microsoft/urls.py app_microsoft/tests/test_password_reset_bulk.py
git commit -m "feat(ms): expose bulk password reset preview/commit API"
```

---

### Task 5: Frontend — API client and cap constant

**Files:**
- Modify: `schedjuice-reimagined-fe/src/app/client-api/microsoft.ts`
- Create: `schedjuice-reimagined-fe/src/lib/microsoft/password-reset-bulk.ts`
- Create: `schedjuice-reimagined-fe/src/lib/microsoft/password-reset-bulk.test.ts`

- [ ] **Step 1: Write failing cap test**

Create `src/lib/microsoft/password-reset-bulk.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import {
  MAX_MS_PASSWORD_RESET_EMAILS,
  isOverPasswordResetEmailCap,
} from "./password-reset-bulk";

describe("password-reset-bulk", () => {
  it("exports cap of 50", () => {
    expect(MAX_MS_PASSWORD_RESET_EMAILS).toBe(50);
  });

  it("detects over-cap lists", () => {
    const emails = Array.from({ length: 51 }, (_, i) => `u${i}@x.io`);
    expect(isOverPasswordResetEmailCap(emails)).toBe(true);
    expect(isOverPasswordResetEmailCap(emails.slice(0, 50))).toBe(false);
  });
});
```

Create `src/lib/microsoft/password-reset-bulk.ts`:

```typescript
export const MAX_MS_PASSWORD_RESET_EMAILS = 50;

export function isOverPasswordResetEmailCap(emails: string[]): boolean {
  return emails.length > MAX_MS_PASSWORD_RESET_EMAILS;
}
```

- [ ] **Step 2: Run test**

Run:
```bash
cd schedjuice-reimagined-fe
npm test -- src/lib/microsoft/password-reset-bulk.test.ts
```
Expected: PASS

- [ ] **Step 3: Add API client types and functions**

Append to `src/app/client-api/microsoft.ts`:

```typescript
export type MicrosoftPasswordResetPreviewStatus =
  | "eligible"
  | "not_found"
  | "no_microsoft_account";

export type MicrosoftPasswordResetPreviewRow = {
  email: string;
  status: MicrosoftPasswordResetPreviewStatus;
  user_id?: number;
};

export type MicrosoftPasswordResetPreviewSummary = {
  total: number;
  eligible: number;
  not_found: number;
  no_microsoft_account: number;
};

export type MicrosoftPasswordResetCommitStatus =
  | "succeeded"
  | "skipped"
  | "failed";

export type MicrosoftPasswordResetCommitRow = {
  email: string;
  status: MicrosoftPasswordResetCommitStatus;
  reason?: string;
};

export type MicrosoftPasswordResetCommitSummary = {
  total: number;
  succeeded: number;
  skipped: number;
  failed: number;
};

export const microsoftPasswordResetPreview = (emails: string[]) =>
  axiosClient.post<{
    data: {
      results: MicrosoftPasswordResetPreviewRow[];
      summary: MicrosoftPasswordResetPreviewSummary;
    };
  }>("microsoft/password-reset/preview", { emails });

export const microsoftPasswordResetCommit = (emails: string[]) =>
  axiosClient.post<{
    data: {
      results: MicrosoftPasswordResetCommitRow[];
      summary: MicrosoftPasswordResetCommitSummary;
    };
  }>("microsoft/password-reset/commit", { emails });
```

- [ ] **Step 4: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/app/client-api/microsoft.ts src/lib/microsoft/password-reset-bulk.ts src/lib/microsoft/password-reset-bulk.test.ts
git commit -m "feat(ms): add bulk password reset API client"
```

---

### Task 6: Frontend — debug page and nav

**Files:**
- Create: `schedjuice-reimagined-fe/src/app/(internal)/debug/microsoft-password-reset/page.tsx`
- Modify: `schedjuice-reimagined-fe/src/config/nav-routes.tsx`

- [ ] **Step 1: Create page**

Create `src/app/(internal)/debug/microsoft-password-reset/page.tsx`:

```tsx
"use client";

import {
  microsoftPasswordResetCommit,
  microsoftPasswordResetPreview,
  MicrosoftPasswordResetCommitRow,
  MicrosoftPasswordResetPreviewRow,
} from "@/app/client-api/microsoft";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { parseSchedjuiceApiError } from "@/helpers/schedjuice-api-error";
import { isOverPasswordResetEmailCap } from "@/lib/microsoft/password-reset-bulk";
import { parseStudentEmailPaste } from "@/lib/course/parse-student-email-paste";
import { role } from "@/types/user";
import { useMutation } from "@tanstack/react-query";
import { KeyRound, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useUser } from "@/hooks/useUser";

type Row = MicrosoftPasswordResetPreviewRow | MicrosoftPasswordResetCommitRow;

function statusLabel(status: string): string {
  switch (status) {
    case "eligible":
      return "Eligible";
    case "not_found":
      return "Not found";
    case "no_microsoft_account":
      return "No MS account";
    case "succeeded":
      return "Succeeded";
    case "skipped":
      return "Skipped";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

export default function MicrosoftPasswordResetPage() {
  const { user, isLoading } = useUser();
  const { toast } = useToast();
  const [pasteText, setPasteText] = useState("");
  const [parsedEmails, setParsedEmails] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<Row[]>([]);
  const [previewSummary, setPreviewSummary] = useState<{
    eligible: number;
    not_found: number;
    no_microsoft_account: number;
    total: number;
  } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [phase, setPhase] = useState<"idle" | "preview" | "done">("idle");

  const overCap = useMemo(
    () => isOverPasswordResetEmailCap(parseStudentEmailPaste(pasteText)),
    [pasteText],
  );

  const previewMutation = useMutation({
    mutationFn: async () => {
      const emails = parseStudentEmailPaste(pasteText);
      setParsedEmails(emails);
      const res = await microsoftPasswordResetPreview(emails);
      return res.data.data;
    },
    onSuccess: (data) => {
      setPreviewRows(data.results);
      setPreviewSummary(data.summary);
      setPhase("preview");
    },
    onError: (err) =>
      toast({
        variant: "destructive",
        title: "Preview failed",
        description: parseSchedjuiceApiError(err),
      }),
  });

  const commitMutation = useMutation({
    mutationFn: async () => {
      const res = await microsoftPasswordResetCommit(parsedEmails);
      return res.data.data;
    },
    onSuccess: (data) => {
      setPreviewRows(data.results);
      setPhase("done");
      setConfirmOpen(false);
      toast({
        title: "Password reset complete",
        description: `${data.summary.succeeded} succeeded · ${data.summary.skipped} skipped · ${data.summary.failed} failed`,
      });
    },
    onError: (err) => {
      setConfirmOpen(false);
      toast({
        variant: "destructive",
        title: "Reset failed",
        description: parseSchedjuiceApiError(err),
      });
    },
  });

  if (isLoading || !user?.roles?.includes(role.superadmin)) {
    return (
      <div className="font-mono flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const eligible = previewSummary?.eligible ?? 0;

  return (
    <PageContainer width="wide" className="font-mono text-sm min-h-[70vh] max-w-3xl">
      <div className="border-b border-border pb-4 mb-6">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          <KeyRound className="h-4 w-4" />
          <span>SUPERADMIN TOOLS</span>
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Microsoft password reset</h1>
        <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
          Paste emails to reset Entra passwords to the default onboarding password
          (Password123$). Does not change local Schedjuice passwords. Maximum 50 emails
          per batch.
        </p>
      </div>

      <Textarea
        value={pasteText}
        onChange={(e) => {
          setPasteText(e.target.value);
          setPhase("idle");
          setPreviewRows([]);
          setPreviewSummary(null);
        }}
        placeholder="One email per line (tabs from Excel also work)"
        rows={8}
        className="font-mono text-xs"
      />

      {overCap ? (
        <p className="text-xs text-destructive mt-2">
          Maximum 50 emails per batch. Split your list and run again.
        </p>
      ) : null}

      <div className="flex gap-2 mt-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => previewMutation.mutate()}
          isLoading={previewMutation.isLoading}
          disabled={!pasteText.trim() || overCap}
        >
          Preview
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => setConfirmOpen(true)}
          disabled={phase !== "preview" || eligible === 0 || commitMutation.isLoading}
        >
          Reset passwords{eligible > 0 ? ` (${eligible})` : ""}
        </Button>
      </div>

      {previewSummary ? (
        <p className="text-xs text-muted-foreground mt-4">
          {previewSummary.eligible} eligible · {previewSummary.not_found} not found ·{" "}
          {previewSummary.no_microsoft_account} no MS account
        </p>
      ) : null}

      {previewRows.length > 0 ? (
        <div className="border border-border mt-4 max-h-96 overflow-auto divide-y divide-border/60">
          {previewRows.map((row) => (
            <div
              key={row.email}
              className="flex items-center justify-between gap-2 px-3 py-2 text-xs"
            >
              <span className="truncate">{row.email}</span>
              <span className="shrink-0 text-muted-foreground">
                {statusLabel(row.status)}
                {"reason" in row && row.reason ? ` · ${row.reason}` : ""}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Entra passwords?</AlertDialogTitle>
            <AlertDialogDescription>
              Reset Entra passwords to the default onboarding password for {eligible}{" "}
              user{eligible === 1 ? "" : "s"}? Skipped emails will not be changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => commitMutation.mutate()}>
              Confirm reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
```

- [ ] **Step 2: Add nav link**

In `src/config/nav-routes.tsx`, import `KeyRound` from `lucide-react` (add to existing import list) and insert after Microsoft Bulk Repair entry:

```typescript
      {
        title: "Microsoft Password Reset",
        icon: KeyRound,
        href: "/debug/microsoft-password-reset",
        requiredPermissions: ["debug.access"],
        canShow: (tenant) => tenant.is_microsoft_on,
      },
```

- [ ] **Step 3: Manual smoke test**

1. Log in as superadmin on an MS-enabled tenant.
2. Open `/debug/microsoft-password-reset`.
3. Paste 2–3 emails (mix of valid, unknown, unlinked).
4. Preview → confirm table statuses.
5. Confirm reset → verify succeeded/skipped rows and toast summary.

- [ ] **Step 4: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/app/\(internal\)/debug/microsoft-password-reset/page.tsx src/config/nav-routes.tsx
git commit -m "feat(ms): add bulk password reset debug page"
```

---

### Task 7: Copy plan to repo docs and final verification

**Files:**
- Create: `docs/superpowers/plans/2026-07-07-ms-bulk-password-reset.md` (workspace root)
- Copy to `schedjuice-reimagined-be/docs/superpowers/plans/` and `schedjuice-reimagined-fe/docs/superpowers/plans/`

- [ ] **Step 1: Run full backend test module**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_microsoft.tests.test_password_reset_bulk app_microsoft.tests.test_reset_password_kwarg -v 2
```
Expected: all PASS

- [ ] **Step 2: Run frontend unit test**

```bash
cd schedjuice-reimagined-fe
npm test -- src/lib/microsoft/password-reset-bulk.test.ts
```
Expected: PASS

- [ ] **Step 3: Update spec status**

In all three copies of `docs/superpowers/specs/2026-07-07-ms-bulk-password-reset-design.md`, change status line to:

```markdown
**Status:** Approved — implementation plan at `docs/superpowers/plans/2026-07-07-ms-bulk-password-reset.md`
```

- [ ] **Step 4: Commit docs** (when user authorizes commits)

```bash
# backend
cd schedjuice-reimagined-be
git add docs/superpowers/plans/2026-07-07-ms-bulk-password-reset.md docs/superpowers/specs/2026-07-07-ms-bulk-password-reset-design.md
git commit -m "docs: add MS bulk password reset implementation plan"

# frontend
cd schedjuice-reimagined-fe
git add docs/superpowers/plans/2026-07-07-ms-bulk-password-reset.md docs/superpowers/specs/2026-07-07-ms-bulk-password-reset-design.md
git commit -m "docs: add MS bulk password reset implementation plan"
```

---

## Spec Coverage Checklist

| Spec requirement | Task |
| --- | --- |
| Entra-only reset to `IMPORT_PASSWORD` | Task 1, 3 |
| Skip `not_found` / `no_microsoft_account` | Task 2, 3 |
| 50-email synchronous cap | Task 2, 5, 6 |
| Preview then confirm UI | Task 6 |
| `debug.access` + MS tenant gate | Task 4 |
| Superadmin component gate | Task 6 |
| No Django password change | Task 3 (no `set_password` calls) |
| No dedicated audit log | N/A (omitted by design) |
| Per-email results on partial failure | Task 3, 6 |
| Nav under Platform → Debug | Task 6 |

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-07-ms-bulk-password-reset.md`. Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
