# Telegram Admin Link On Behalf Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let platform superadmins generate Telegram link tokens and force-unlink teachers from the user record UI, plus make bot replies tenant-aware.

**Architecture:** Add `telegram.link_on_behalf` (`PLATFORM_INTERNAL`) permission and two user-scoped admin endpoints mirroring Microsoft routes. Reuse `issue_link_token` and a shared `clear_user_telegram_binding` helper. Extend `TelegramConnectorRow` with superadmin-only copy-to-clipboard and force-unlink actions. Replace hardcoded `"Schedjuice"` bot strings with `tenant.name`.

**Tech Stack:** Django REST Framework, RBAC (`RBACView`), React/Next.js, TanStack Query, existing `app_telegram` binding/webhook flow.

**Spec:** `docs/superpowers/specs/2026-07-07-telegram-admin-link-on-behalf-design.md`

---

## File map

| File | Action |
| --- | --- |
| `schedjuice-reimagined-be/app_telegram/binding.py` | Tenant-aware messages + `clear_user_telegram_binding` |
| `schedjuice-reimagined-be/app_telegram/views.py` | Use shared unlink helper |
| `schedjuice-reimagined-be/app_telegram/tests/test_ai_query.py` | Update expected bot message strings |
| `schedjuice-reimagined-be/app_rbac/catalog.py` | Add `telegram.link_on_behalf` permission |
| `schedjuice-reimagined-be/app_rbac/tests/test_catalog.py` | Assert new permission tier |
| `schedjuice-reimagined-be/app_auth/views.py` | Two admin RBAC views |
| `schedjuice-reimagined-be/app_auth/urls.py` | Register routes |
| `schedjuice-reimagined-be/app_auth/serializers.py` | Mark `telegram_*` read-only |
| `schedjuice-reimagined-be/app_telegram/tests/test_admin_link.py` | **Create** — admin link/unlink API tests |
| `schedjuice-reimagined-fe/src/app/client-api/telegram.ts` | Two admin API functions |
| `schedjuice-reimagined-fe/src/components/connectors/telegram-connector-row.tsx` | Superadmin UI |

---

### Task 1: Tenant-aware bot messages

**Files:**
- Modify: `schedjuice-reimagined-be/app_telegram/binding.py`
- Modify: `schedjuice-reimagined-be/app_telegram/tests/test_ai_query.py`

- [ ] **Step 1: Write failing test updates**

In `app_telegram/tests/test_ai_query.py`, in `setUp`, after loading org, set a known name:

```python
    def setUp(self):
        with schema_context(get_public_schema_name()):
            self.org = Organization.objects.get(schema_name=self.schema_name)
            self.org.name = "Test School"
            self.org.save()
```

Update `test_unlinked_user_gets_link_prompt`:

```python
        MockClient.return_value.send_message.assert_called_once_with(
            9999,
            "Your Telegram isn't linked to Test School yet. Sign in to link your account.",
        )
```

Update `test_linked_user_without_permission_gets_denial`:

```python
        MockClient.return_value.send_message.assert_called_once_with(
            self.teacher.telegram_chat_id,
            "You don't have access to the Test School assistant.",
        )
```

Add a new test for invalid token message in `app_telegram/tests/test_binding.py`:

```python
    @patch("app_telegram.binding.TelegramClient")
    def test_invalid_start_token_reply_is_tenant_aware(self, MockClient):
        with schema_context(get_public_schema_name()):
            self.org.name = "Test School"
            self.org.save()
        with patch("app_telegram.binding.TelegramClient"):
            handle_message(
                self.org,
                {
                    "text": "/start expired-token",
                    "chat": {"id": 4242, "type": "private"},
                    "from": {"id": 4242, "username": "teach"},
                },
            )
        MockClient.return_value.send_message.assert_called_once_with(
            4242,
            "This link is invalid or expired. Generate a new one from your Test School profile.",
        )
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_telegram.tests.test_ai_query.TelegramFreeTextHandlerTests.test_unlinked_user_gets_link_prompt app_telegram.tests.test_binding.TelegramBindingTests.test_invalid_start_token_reply_is_tenant_aware
```

Expected: FAIL — messages still contain `"Schedjuice"`.

- [ ] **Step 3: Update binding.py messages**

In `app_telegram/binding.py`, replace the three hardcoded strings:

```python
# _handle_start_link — invalid/expired token
f"This link is invalid or expired. Generate a new one from your {tenant.name} profile.",

# _handle_free_text_query — unlinked user
f"Your Telegram isn't linked to {tenant.name} yet. Sign in to link your account.",

# _handle_free_text_query — no ai.telegram_use
f"You don't have access to the {tenant.name} assistant.",
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_telegram.tests.test_ai_query app_telegram.tests.test_binding
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-be
git add app_telegram/binding.py app_telegram/tests/test_ai_query.py app_telegram/tests/test_binding.py
git commit -m "Make Telegram bot replies tenant-aware."
```

---

### Task 2: Shared unlink helper

**Files:**
- Modify: `schedjuice-reimagined-be/app_telegram/binding.py`
- Modify: `schedjuice-reimagined-be/app_telegram/views.py`

- [ ] **Step 1: Add helper to binding.py**

After `issue_link_token`, add:

```python
TELEGRAM_BINDING_FIELDS = (
    "telegram_user_id",
    "telegram_chat_id",
    "telegram_username",
    "telegram_linked_at",
)


def clear_user_telegram_binding(user: User) -> None:
    """Clear all Telegram account binding fields on a user."""
    user.telegram_user_id = None
    user.telegram_chat_id = None
    user.telegram_username = None
    user.telegram_linked_at = None
    user.save(update_fields=list(TELEGRAM_BINDING_FIELDS))
```

- [ ] **Step 2: Refactor TelegramUnlinkView**

In `app_telegram/views.py`, replace inline field clearing with:

```python
from app_telegram.binding import clear_user_telegram_binding, issue_link_token

# inside TelegramUnlinkView.post:
        clear_user_telegram_binding(user)
        return Response({"ok": True, "message": ""}, status=status.HTTP_200_OK)
```

- [ ] **Step 3: Run existing binding/unlink tests**

Run:

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_telegram.tests.test_binding
```

Expected: PASS (no behavior change)

- [ ] **Step 4: Commit**

```bash
cd schedjuice-reimagined-be
git add app_telegram/binding.py app_telegram/views.py
git commit -m "Extract clear_user_telegram_binding helper."
```

---

### Task 3: RBAC permission

**Files:**
- Modify: `schedjuice-reimagined-be/app_rbac/catalog.py`
- Modify: `schedjuice-reimagined-be/app_rbac/tests/test_catalog.py`

- [ ] **Step 1: Write failing catalog test**

In `app_rbac/tests/test_catalog.py`, add to `test_known_codes_present`:

```python
        for code in (
            "course.manage_all",
            "payment.verify",
            "rbac.manage",
            "debug.access",
            "telegram.link_on_behalf",
        ):
            self.assertIn(code, catalog.ALL_CODES)
```

Add:

```python
    def test_telegram_link_on_behalf_is_platform_internal(self):
        perm = next(p for p in catalog.ALL_PERMISSIONS if p.code == "telegram.link_on_behalf")
        self.assertEqual(perm.tier, catalog.PLATFORM_INTERNAL)
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_rbac.tests.test_catalog
```

Expected: FAIL — `telegram.link_on_behalf` not in catalog

- [ ] **Step 3: Add permission to catalog.py**

After the `telegram.configure` entry:

```python
    _p(
        "telegram.link_on_behalf",
        "Link Telegram on behalf of users",
        "generate link tokens and unlink Telegram for users on behalf of support",
        "Operational",
        tier=PLATFORM_INTERNAL,
    ),
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_rbac.tests.test_catalog
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-be
git add app_rbac/catalog.py app_rbac/tests/test_catalog.py
git commit -m "Add telegram.link_on_behalf platform-internal permission."
```

---

### Task 4: Admin link/unlink API endpoints

**Files:**
- Create: `schedjuice-reimagined-be/app_telegram/tests/test_admin_link.py`
- Modify: `schedjuice-reimagined-be/app_auth/views.py`
- Modify: `schedjuice-reimagined-be/app_auth/urls.py`

- [ ] **Step 1: Write failing admin link tests**

Create `app_telegram/tests/test_admin_link.py`:

```python
import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_organization.models import Organization
from app_rbac.seeding import seed_rbac
from app_telegram.models import TelegramLinkToken


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class TelegramAdminLinkTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(get_public_schema_name()):
            self.org = Organization.objects.get(schema_name=self.schema_name)
            self.org.telegram_bot_username = "schoolbot"
            self.org.is_telegram_on = True
            self.org.save()
        with schema_context(self.schema_name):
            seed_rbac()
            self.superadmin = User.objects.create_user(
                email=f"sa-{suffix}@example.com",
                password="x",
                name="Superadmin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.SUPERADMIN],
            )
            self.admin = User.objects.create_user(
                email=f"adm-{suffix}@example.com",
                password="x",
                name="Admin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )
            self.teacher = User.objects.create_user(
                email=f"tch-{suffix}@example.com",
                password="x",
                name="Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )

    def _client(self, user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def test_superadmin_can_issue_link_token_for_teacher(self):
        url = f"/api/v1/users/{self.teacher.id}/telegram-link-token"
        res = self._client(self.superadmin).post(url)
        self.assertEqual(res.status_code, 200, res.content)
        self.assertIn("https://t.me/schoolbot?start=", res.data["deep_link"])
        with schema_context(self.schema_name):
            self.assertTrue(
                TelegramLinkToken.objects.filter(user=self.teacher).exists()
            )

    def test_admin_forbidden_on_link_token(self):
        url = f"/api/v1/users/{self.teacher.id}/telegram-link-token"
        res = self._client(self.admin).post(url)
        self.assertEqual(res.status_code, 403)

    def test_link_token_rejects_non_teacher(self):
        url = f"/api/v1/users/{self.admin.id}/telegram-link-token"
        res = self._client(self.superadmin).post(url)
        self.assertEqual(res.status_code, 400)
        self.assertIn("teachers", res.data["message"].lower())

    def test_link_token_rejects_already_linked_teacher(self):
        with schema_context(self.schema_name):
            self.teacher.telegram_user_id = 12345
            self.teacher.telegram_chat_id = 12345
            self.teacher.telegram_linked_at = timezone.now()
            self.teacher.save()
        url = f"/api/v1/users/{self.teacher.id}/telegram-link-token"
        res = self._client(self.superadmin).post(url)
        self.assertEqual(res.status_code, 400)
        self.assertIn("already", res.data["message"].lower())

    def test_superadmin_can_force_unlink_teacher(self):
        with schema_context(self.schema_name):
            self.teacher.telegram_user_id = 12345
            self.teacher.telegram_chat_id = 12345
            self.teacher.telegram_username = "teach"
            self.teacher.telegram_linked_at = timezone.now()
            self.teacher.save()
        url = f"/api/v1/users/{self.teacher.id}/unlink-telegram"
        res = self._client(self.superadmin).post(url)
        self.assertEqual(res.status_code, 200, res.content)
        with schema_context(self.schema_name):
            self.teacher.refresh_from_db()
        self.assertIsNone(self.teacher.telegram_user_id)

    def test_unlink_rejects_not_linked(self):
        url = f"/api/v1/users/{self.teacher.id}/unlink-telegram"
        res = self._client(self.superadmin).post(url)
        self.assertEqual(res.status_code, 400)
        self.assertIn("does not have", res.data["message"].lower())

    def test_self_service_link_token_still_works(self):
        res = self._client(self.teacher).post("/api/v1/telegram/link-token")
        self.assertEqual(res.status_code, 200, res.content)
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_telegram.tests.test_admin_link
```

Expected: FAIL — 404 (routes not registered)

- [ ] **Step 3: Add views to app_auth/views.py**

Add near other user-scoped Microsoft views:

```python
class UserTelegramLinkTokenView(RBACView):
    """POST users/<id>/telegram-link-token — issue binding deep link for target user."""

    model = models.User
    serializer = serializers.UserSerializer
    required_permissions = {"POST": "telegram.link_on_behalf"}

    def post(self, request, user_id: int):
        from app_telegram.binding import issue_link_token

        org = request.tenant
        if not org.telegram_bot_username:
            return self.bad_request("Telegram is not configured for this school.")
        user = models.User.objects.filter(id=user_id).first()
        if not user:
            return self.not_found("User not found.")
        if not user.is_teacher():
            return self.bad_request("Telegram linking is only available for teachers.")
        if user.telegram_user_id:
            return self.bad_request("This user already has Telegram linked.")
        deep_link = issue_link_token(user, org.telegram_bot_username)
        return Response({"deep_link": deep_link}, status=status.HTTP_200_OK)


class UserUnlinkTelegramView(RBACView):
    """POST users/<id>/unlink-telegram — clear target user's Telegram binding."""

    model = models.User
    serializer = serializers.UserSerializer
    required_permissions = {"POST": "telegram.link_on_behalf"}

    def post(self, request, user_id: int):
        from app_telegram.binding import clear_user_telegram_binding

        user = models.User.objects.filter(id=user_id).first()
        if not user:
            return self.not_found("User not found.")
        if not user.is_teacher():
            return self.bad_request("Telegram linking is only available for teachers.")
        if not user.telegram_user_id:
            return self.bad_request("This user does not have Telegram linked.")
        clear_user_telegram_binding(user)
        return Response({"ok": True, "message": ""}, status=status.HTTP_200_OK)
```

Ensure `Response` and `status` are imported at top of `views.py` (already used elsewhere).

- [ ] **Step 4: Register routes in app_auth/urls.py**

After Microsoft routes:

```python
    path(
        "users/<int:user_id>/telegram-link-token",
        views.UserTelegramLinkTokenView.as_view(),
        name="user-telegram-link-token",
    ),
    path(
        "users/<int:user_id>/unlink-telegram",
        views.UserUnlinkTelegramView.as_view(),
        name="user-unlink-telegram",
    ),
```

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_telegram.tests.test_admin_link
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd schedjuice-reimagined-be
git add app_auth/views.py app_auth/urls.py app_telegram/tests/test_admin_link.py
git commit -m "Add superadmin Telegram link-on-behalf API endpoints."
```

---

### Task 5: Serializer hardening

**Files:**
- Modify: `schedjuice-reimagined-be/app_auth/serializers.py`

- [ ] **Step 1: Mark telegram fields read-only on UserSerializer**

Inside `class UserSerializer`, after existing explicit fields (e.g. after `scoped_category_ids`), add:

```python
    telegram_user_id = serializers.IntegerField(read_only=True)
    telegram_chat_id = serializers.IntegerField(read_only=True)
    telegram_username = serializers.CharField(read_only=True)
    telegram_linked_at = serializers.DateTimeField(read_only=True)
```

These override `fields = "__all__"` for those four columns.

- [ ] **Step 2: Run user-related tests**

Run:

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_telegram.tests.test_admin_link app_auth.tests
```

Expected: PASS (no regressions)

- [ ] **Step 3: Commit**

```bash
cd schedjuice-reimagined-be
git add app_auth/serializers.py
git commit -m "Make User telegram binding fields read-only on serializer."
```

---

### Task 6: Frontend API client

**Files:**
- Modify: `schedjuice-reimagined-fe/src/app/client-api/telegram.ts`

- [ ] **Step 1: Add admin API functions**

Append to `telegram.ts`:

```typescript
/** Platform superadmin: issue link token for another user. */
export const createTelegramLinkTokenForUser = (userId: number) =>
  axiosClient.post<{ deep_link: string }>(
    `users/${userId}/telegram-link-token`,
    {},
  );

/** Platform superadmin: force-unlink another user's Telegram account. */
export const unlinkTelegramAccountForUser = (userId: number) =>
  axiosClient.post(`users/${userId}/unlink-telegram`, {});
```

- [ ] **Step 2: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/app/client-api/telegram.ts
git commit -m "Add admin Telegram link-on-behalf API client functions."
```

---

### Task 7: Superadmin UI in TelegramConnectorRow

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/connectors/telegram-connector-row.tsx`

- [ ] **Step 1: Add imports and superadmin gate**

Add imports:

```typescript
import {
  createTelegramLinkToken,
  createTelegramLinkTokenForUser,
  unlinkTelegramAccount,
  unlinkTelegramAccountForUser,
} from "@/app/client-api/telegram";
import { isSuperAdmin } from "@/helpers/authorization";
```

After `const isSelf = ...`, add:

```typescript
  const canAdminLink =
    !isSelf && isSuperAdmin(viewerAccount) && userHasRoles(user, [role.teacher]);
```

- [ ] **Step 2: Add admin generate-link mutation**

```typescript
  const adminLinkMutation = useMutation({
    mutationFn: async () => {
      const res = await createTelegramLinkTokenForUser(user.id);
      const payload = res.data as {
        deep_link?: string;
        data?: { deep_link?: string };
      };
      return payload.data?.deep_link ?? payload.deep_link;
    },
    onSuccess: async (deepLink: string | undefined) => {
      if (!deepLink) {
        toast({
          variant: "destructive",
          title: "Could not generate Telegram link",
          description: "No deep link returned from the server.",
        });
        return;
      }
      try {
        await navigator.clipboard.writeText(deepLink);
        toast({
          title: "Link copied",
          description:
            "Send it to the teacher. They must tap Start in Telegram.",
        });
      } catch {
        toast({
          variant: "destructive",
          title: "Could not copy link",
          description: deepLink,
        });
      }
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Could not generate Telegram link",
        description: parseSchedjuiceApiError(error),
      });
    },
  });

  const adminUnlinkMutation = useMutation({
    mutationFn: () => unlinkTelegramAccountForUser(user.id),
    onSuccess: () => {
      toast({ title: "Telegram account unlinked" });
      onUpdated?.();
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Could not unlink Telegram",
        description: parseSchedjuiceApiError(error),
      });
    },
  });
```

- [ ] **Step 3: Update description for superadmin viewing other user**

Replace the non-self description branch:

```typescript
  const description = isLinked
    ? "Telegram account is linked for course group notifications."
    : isSelf
      ? "Connect your Telegram account to join teacher course groups."
      : canAdminLink
        ? "Generate a link and send it to the teacher. They must tap Start in Telegram."
        : "This teacher has not linked Telegram yet. They must connect from their own profile.";
```

- [ ] **Step 4: Add admin action buttons**

Update `isBusy` to include admin mutations:

```typescript
  const isBusy =
    connectMutation.isLoading ||
    unlinkMutation.isLoading ||
    adminLinkMutation.isLoading ||
    adminUnlinkMutation.isLoading;
```

After the `{isSelf ? (...)` block, add admin branch:

```typescript
      {canAdminLink ? (
        <div className="flex flex-wrap gap-2 md:justify-end md:pt-0.5">
          {!isLinked ? (
            <Button
              type="button"
              size="sm"
              onClick={() => adminLinkMutation.mutate()}
              isLoading={adminLinkMutation.isLoading}
              disabled={isLinked}
              className="active:scale-[0.98] transition-transform"
            >
              Generate link
            </Button>
          ) : (
            <ConfirmationDialog
              title="Force unlink Telegram?"
              content="This clears the teacher's Telegram binding. They will need a new link to reconnect."
              onConfirm={() => adminUnlinkMutation.mutate()}
              isLoading={adminUnlinkMutation.isLoading}
            >
              <Button
                type="button"
                size="sm"
                variant="outline"
                isLoading={adminUnlinkMutation.isLoading}
                disabled={!isLinked}
                className="active:scale-[0.98] transition-transform"
              >
                Force unlink
              </Button>
            </ConfirmationDialog>
          )}
        </div>
      ) : null}
```

- [ ] **Step 5: Manual verification**

1. Log in as superadmin, open a teacher user record → Connectors
2. Click **Generate link** → clipboard contains `https://t.me/...?start=...`
3. Teacher opens link and taps Start → record shows linked
4. Click **Force unlink** → status returns to not linked
5. Log in as regular admin → no admin buttons on another user's record
6. DM bot as unlinked user → message shows org name, not "Schedjuice"

- [ ] **Step 6: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/components/connectors/telegram-connector-row.tsx
git commit -m "Add superadmin Telegram link-on-behalf UI on user record."
```

---

## Manual test checklist (end-to-end)

- [ ] Superadmin generates link for unlinked teacher → deep link copied
- [ ] Teacher completes Start → user record shows linked status + username
- [ ] Superadmin force-unlinks → fields cleared
- [ ] Org admin (non-superadmin) sees read-only status, no buttons
- [ ] Teacher self-service connect/disconnect still works on own profile
- [ ] Unlinked user DMs bot → tenant name in reply

---

## Spec coverage self-review

| Spec requirement | Task |
| --- | --- |
| `telegram.link_on_behalf` permission | Task 3 |
| Admin link-token endpoint | Task 4 |
| Admin unlink endpoint | Task 4 |
| Shared unlink helper | Task 2 |
| Serializer read-only hardening | Task 5 |
| Tenant-aware bot messages | Task 1 |
| FE copy-to-clipboard admin UX | Task 7 |
| Superadmin-only gate | Task 4 (403 tests) + Task 7 (`isSuperAdmin`) |
| Self-service unchanged | Task 4 (`test_self_service_link_token_still_works`) |
| Clipboard fallback on deny | Task 7 (`catch` shows deep link in toast description) |
