# Mobile Single-Device Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a tenant enables the policy, each user may have one active native mobile session; new mobile logins displace others; admins view/revoke devices from an Entra-style page.

**Architecture:** Extend `RefreshSession` + new `MobileDevice` registry in Django; enforce only in `create_refresh_session()` on `client_type=mobile_native`. Mobile sends app-generated `device_installation_id` (SecureStore UUID). Admin FE lists/revokes via new RBAC-gated APIs. Displacement uses 401 `session_revoked` + Expo push.

**Tech Stack:** Django 4.2 + DRF + tenant schemas, Expo/React Native, Next.js 15 + TanStack Query v4.

**Spec:** `docs/superpowers/specs/2026-09-09-mobile-single-device-login-design.md`

**Branch (all repos):** `feat/mobile-single-device-login` from `dev`

## Global Constraints

- Native app only — web sessions tagged `client_type=web`, never enforced.
- Org flag `is_single_mobile_device_enabled` — grandfather existing sessions; enforce on **next mobile login** only.
- **No** `Application.getAndroidId()` / `getIosIdForVendorAsync()` in v1 (app UUID only).
- New RBAC: `mobile_device_policy.configure`, `mobile_device.view`, `mobile_device.revoke` (not Login Activity perms).
- Burmese `my.ts` keys copy English placeholder.
- Backend tests: `./scripts/run_backend_tests.sh <target>` with `--keepdb --noinput`.
- Granular commits per layer (models → policy → APIs → mobile → FE).

---

## File map

### Backend (`schedjuice-reimagined-be`)

| File | Responsibility |
| --- | --- |
| `app_organization/models.py` | `is_single_mobile_device_enabled`, `single_mobile_device_enabled_at` |
| `app_organization/migrations/00xx_*.py` | Org fields migration |
| `app_organization/serializers.py` | Expose org fields; gate PATCH on `mobile_device_policy.configure` |
| `app_auth/models.py` | `ClientType`, `MobileDevice`, `RefreshSession` extensions |
| `app_auth/migrations/00xx_*.py` | Auth models migration |
| `app_auth/mobile_device_policy.py` | **New** — upsert device, enforce single mobile, revoke helpers |
| `app_auth/refresh_sessions.py` | Parse mobile metadata; call policy; `revoked_reason`; `last_seen_at` on refresh |
| `app_auth/session_revoked.py` | **New** — `SessionRevokedError` + DRF exception handler shape |
| `app_auth/mobile_device_serializers.py` | **New** — list/detail/revoke serializers |
| `app_auth/mobile_device_views.py` | **New** — list, detail, bulk revoke, stale revoke |
| `app_auth/urls.py` | Wire `/mobile-devices/` routes + `/users/<id>/mobile-devices/` |
| `app_auth/tests/test_mobile_device_policy.py` | **New** — enforcement + grandfathering |
| `app_auth/tests/test_mobile_device_api.py` | **New** — RBAC + revoke APIs |
| `app_rbac/catalog.py` | Three new permissions |
| `app_rbac/migrations/00xx_mobile_device_permissions.py` | `seed_rbac()` |
| `app_utils/push_fanout_tasks.py` or `app_auth/mobile_device_push.py` | `session_revoked` push payload |

### Mobile (`schedjuice-reimagined-mobile`)

| File | Responsibility |
| --- | --- |
| `lib/auth/device-identity.ts` | **New** — `getOrCreateDeviceInstallationId`, `getMobileDeviceMetadata` |
| `__tests__/lib/auth/device-identity.test.ts` | **New** |
| `lib/auth/auth-store.tsx` | Merge metadata into login calls |
| `lib/auth/jwt-refresh-session.ts` | Send metadata on `/token/refresh` |
| `lib/api.ts` | Parse `session_revoked` on 401; surface reason to auth store |
| `lib/auth/auth-store.tsx` | `sessionRevokedMessage` one-shot flag |
| `lib/notifications/handle-session-revoked-push.ts` | **New** — foreground/background handler |
| `lib/i18n/locales/en.ts` + `my.ts` | Displacement copy |
| `app/(auth)/login.tsx` or `use-login-screen.ts` | Show message after redirect |

### Frontend (`schedjuice-reimagined-fe`)

| File | Responsibility |
| --- | --- |
| `src/config/org-settings-registry.ts` | Mobile sign-in toggle in Access group |
| `src/types/organization.ts` (or existing org type) | New org fields |
| `src/helpers/authorization.ts` | `canViewMobileDevices`, `canRevokeMobileDevices`, `canConfigureMobileDevicePolicy` |
| `src/config/route-permissions.ts` | `/organizations/user-activity/devices` |
| `src/app/client-api/mobile-devices.ts` | **New** — query/mutation helpers |
| `src/app/(internal)/organizations/user-activity/devices/page.tsx` | **New** — devices table |
| `src/app/(internal)/organizations/user-activity/page.tsx` | Hub tile |
| `src/config/nav-routes.tsx` | Optional nav child |
| `src/components/record/sections/record-access.tsx` | Per-user mobile devices card |
| `src/config/__tests__/route-permissions.test.ts` | Route rule test |

---

## Phase 1 — Backend models & org flag

### Task 1: Organization policy fields

**Files:**
- Modify: `app_organization/models.py`
- Create: `app_organization/migrations/00xx_organization_single_mobile_device.py`
- Modify: `app_organization/serializers.py`

**Interfaces:**
- Produces: `Organization.is_single_mobile_device_enabled`, `Organization.single_mobile_device_enabled_at`

- [ ] **Step 1: Add fields to `Organization`**

```python
is_single_mobile_device_enabled = models.BooleanField(default=False)
single_mobile_device_enabled_at = models.DateTimeField(null=True, blank=True)
```

- [ ] **Step 2: Migration**

Run: `python manage.py makemigrations app_organization`

- [ ] **Step 3: Serializer + toggle logic**

In org update serializer `update()`:
- When `is_single_mobile_device_enabled` changes False→True: set `single_mobile_device_enabled_at=timezone.now()`.
- When True→False: clear `single_mobile_device_enabled_at`.
- Do **not** revoke sessions on toggle.

Gate PATCH field via view permission `mobile_device_policy.configure` (add to org profile view `required_permissions` for those keys only, or validate in serializer if partial PATCH).

- [ ] **Step 4: Commit**

```bash
git add app_organization/
git commit -m "feat(org): add single mobile device policy fields"
```

### Task 2: MobileDevice + RefreshSession extensions

**Files:**
- Modify: `app_auth/models.py`
- Create: `app_auth/migrations/00xx_mobile_device.py`

**Interfaces:**
- Produces: `ClientType`, `MobileDevice`, extended `RefreshSession` with `client_type`, `mobile_device`, `revoked_reason`, `last_seen_at`

- [ ] **Step 1: Add `ClientType` TextChoices and `MobileDevice` model** (per spec fields + `UniqueConstraint(user, installation_id)`)

- [ ] **Step 2: Extend `RefreshSession`**

```python
client_type = models.CharField(
    max_length=32, choices=ClientType.choices, default=ClientType.WEB
)
mobile_device = models.ForeignKey(
    "MobileDevice", null=True, blank=True, on_delete=models.SET_NULL, related_name="sessions"
)
revoked_reason = models.CharField(max_length=64, null=True, blank=True)
last_seen_at = models.DateTimeField(null=True, blank=True)
```

- [ ] **Step 3: Migration + backfill** — existing rows `client_type='web'`

- [ ] **Step 4: Commit**

```bash
git add app_auth/models.py app_auth/migrations/
git commit -m "feat(auth): add MobileDevice model and RefreshSession client metadata"
```

### Task 3: RBAC permissions

**Files:**
- Modify: `app_rbac/catalog.py`
- Create: `app_rbac/migrations/00xx_mobile_device_permissions.py`

- [ ] **Step 1: Add permissions** under Security/Operational group:

```python
_p("mobile_device_policy.configure", "Configure mobile device policy", "...", sensitive=True)
_p("mobile_device.view", "View mobile devices", "...", sensitive=True)
_p("mobile_device.revoke", "Revoke mobile devices", "...", sensitive=True)
```

- [ ] **Step 2: Migration** — pattern from `0010_attendance_manage_all.py`:

```python
def forwards(apps, schema_editor):
    from app_rbac.seeding import seed_rbac
    seed_rbac()
```

- [ ] **Step 3: Verify founder/admin roles receive all three in seed data** (adjust `seeding.py` role templates if needed).

- [ ] **Step 4: Commit**

```bash
git add app_rbac/
git commit -m "feat(rbac): add mobile device policy permissions"
```

---

## Phase 2 — Session metadata & enforcement

### Task 4: Parse mobile login metadata

**Files:**
- Modify: `app_auth/refresh_sessions.py`

**Interfaces:**
- Produces: `_client_metadata_from_request(request) -> dict` with keys:
  - `client_type: str` (`web` | `mobile_native`)
  - `installation_id: UUID | None`
  - `display_name`, `device_model`, `os_name`, `os_version`, `app_version`

- [ ] **Step 1: Replace/extend `_device_metadata_from_request`**

```python
def _client_metadata_from_request(request) -> dict:
    client_type = (request.data.get("client_type") or "web").strip().lower()
    if client_type not in (ClientType.WEB, ClientType.MOBILE_NATIVE):
        raise ValidationError({"client_type": "Invalid client_type."})
    installation_raw = request.data.get("device_installation_id")
    if client_type == ClientType.MOBILE_NATIVE and not installation_raw:
        raise ValidationError({"device_installation_id": "Required for mobile_native."})
    # parse UUID, map device_name -> display_name, etc.
```

- [ ] **Step 2: In `create_refresh_session`, set `client_type`, `last_seen_at=now()` on new `RefreshSession`**

- [ ] **Step 3: Commit**

```bash
git add app_auth/refresh_sessions.py
git commit -m "feat(auth): parse mobile client metadata on login"
```

### Task 5: mobile_device_policy module

**Files:**
- Create: `app_auth/mobile_device_policy.py`
- Create: `app_auth/tests/test_mobile_device_policy.py`
- Modify: `app_auth/refresh_sessions.py` — call policy after session create

**Interfaces:**
- Produces:
  - `register_mobile_device_for_session(user, session, meta, org) -> MobileDevice`
  - `enforce_single_mobile_device(user, session, mobile_device, org) -> list[MobileDevice]` (displaced devices for push)

- [ ] **Step 1: Write failing tests** (use `TenantTestCase` / existing `test_refresh_sessions.py` patterns):

```python
def test_flag_off_two_mobile_sessions_both_active(self): ...
def test_flag_on_grandfathered_sessions_still_refresh(self): ...
def test_flag_on_second_installation_displaces_first(self): ...
def test_same_installation_relogin_rotates_without_displace_push(self): ...
def test_web_login_never_displaces_mobile(self): ...
```

- [ ] **Step 2: Run tests** — expect FAIL

Run: `./scripts/run_backend_tests.sh app_auth.tests.test_mobile_device_policy -v 2`

- [ ] **Step 3: Implement `register_mobile_device_for_session`**

Upsert `MobileDevice` on `(user, installation_id)`; link `session.mobile_device`; update metadata.

- [ ] **Step 4: Implement `enforce_single_mobile_device`**

Only if `org.is_single_mobile_device_enabled`:
1. Revoke prior sessions on same `MobileDevice` with `revoked_reason=session_rotated` (no push).
2. Revoke other active mobile sessions for user with `revoked_reason=device_displaced`; set `mobile_device.is_active=False`.
3. Return list of displaced `MobileDevice` rows for push task.

Active session = `revoked_at is null` and `expires_at > now` and `client_type=mobile_native`.

- [ ] **Step 5: Wire into `create_refresh_session`** after `RefreshSession.objects.create(...)`.

Load org from `request.tenant` (Organization model in public schema — use existing tenant→org lookup helper).

- [ ] **Step 6: Run tests** — expect PASS

- [ ] **Step 7: Commit**

```bash
git add app_auth/mobile_device_policy.py app_auth/refresh_sessions.py app_auth/tests/test_mobile_device_policy.py
git commit -m "feat(auth): enforce single mobile device on login"
```

### Task 6: Session revoked error shape

**Files:**
- Modify: `app_auth/refresh_sessions.py` — `refresh_auth_tokens` revoked check
- Create: `app_auth/session_revoked.py`
- Modify: DRF exception handler if needed (check `schedjuice_backend` exception setup)

**Interfaces:**
- Produces: 401 body `{ "detail", "code": "session_revoked", "reason": "<revoked_reason>" }`

- [ ] **Step 1: When `session.revoked_at` is set, raise custom exception** with `reason=session.revoked_reason or "unknown"`

- [ ] **Step 2: Test** — revoked session refresh returns `code` + `reason`

- [ ] **Step 3: Set `revoked_reason` in `revoke_refresh_session` and `revoke_all_refresh_sessions_for_user`** (accept optional `reason` kwarg; map logout paths in `views.py`)

- [ ] **Step 4: Commit**

```bash
git add app_auth/
git commit -m "feat(auth): return session_revoked reason on revoked refresh"
```

### Task 7: Update last_seen_at on token refresh

**Files:**
- Modify: `app_auth/refresh_sessions.py` — `refresh_auth_tokens`
- Modify: `app_auth/views.py` — `TokenRefreshView` passes request body metadata

- [ ] **Step 1: Accept optional `device_installation_id` on refresh** (no enforcement); update `session.last_seen_at` and linked `MobileDevice.last_seen_at`.

- [ ] **Step 2: Test** — refresh bumps `last_seen_at`

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(auth): update mobile device last_seen on token refresh"
```

---

## Phase 3 — Admin APIs

### Task 8: Mobile device list & detail APIs

**Files:**
- Create: `app_auth/mobile_device_serializers.py`
- Create: `app_auth/mobile_device_views.py`
- Modify: `app_auth/urls.py`
- Create: `app_auth/tests/test_mobile_device_api.py`

**Interfaces:**
- Produces: `GET /api/v1/mobile-devices/`, `GET /api/v1/mobile-devices/<id>/`, `GET /api/v1/users/<id>/mobile-devices/`

- [ ] **Step 1: `MobileDeviceListView`** — `RBACView`, `required_permissions = {"GET": "mobile_device.view"}`

Filters: `user_id`, `is_active`, `q` (user name/email icontains), `stale_days` (last_seen_at cutoff).

Pagination: use existing list pagination pattern.

Serializer includes nested `user: {id, full_name, email}`, `active_session_id` from latest non-revoked session.

- [ ] **Step 2: Detail + per-user list views**

- [ ] **Step 3: Tests**

```python
def test_list_forbidden_without_view_permission(self): ...
def test_list_ok_with_view_permission(self): ...
def test_filter_by_user_id(self): ...
```

- [ ] **Step 4: Commit**

```bash
git add app_auth/mobile_device_*.py app_auth/urls.py app_auth/tests/test_mobile_device_api.py
git commit -m "feat(auth): add mobile device list APIs"
```

### Task 9: Revoke APIs

**Files:**
- Modify: `app_auth/mobile_device_views.py`
- Modify: `app_auth/mobile_device_policy.py` — `revoke_mobile_device(device, reason="admin_revoked")`

- [ ] **Step 1: `POST /mobile-devices/<id>/revoke/`** — `mobile_device.revoke`

Revoke active sessions for device; set `is_active=False`, `revoked_at=now()`; enqueue push.

- [ ] **Step 2: `POST /mobile-devices/bulk-revoke/`**

Body: `{ "device_ids": [1,2] }` OR `{ "user_id": 7 }`.

- [ ] **Step 3: `POST /mobile-devices/revoke-stale/`**

Body: `{ "inactive_days": 90 }` — revoke devices where `last_seen_at < now - days` and `is_active`.

- [ ] **Step 4: Tests** — revoke forbidden without permission; bulk by user_id revokes all mobile sessions

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(auth): add mobile device revoke and bulk revoke APIs"
```

---

## Phase 4 — Push notifications

### Task 10: session_revoked push payload

**Files:**
- Create: `app_auth/mobile_device_push.py` (or extend `app_utils/push_fanout_tasks.py`)
- Modify: `app_auth/mobile_device_policy.py` — call after displacement
- Modify: `app_auth/mobile_device_views.py` — call on admin revoke

**Interfaces:**
- Produces: `send_session_revoked_push(user, reason: str) -> None` (async task)

```python
payload = {
    "type": "session_revoked",
    "reason": reason,  # device_displaced | admin_revoked
    "title": "Signed out",
    "body": "...",  # reason-specific
}
```

- [ ] **Step 1: Implement Celery/async task** fanout to user's active Expo `Device` rows (reuse existing push patterns).

- [ ] **Step 2: Test** — mock push; displacement enqueues task; `session_rotated` does not

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(auth): push notify on mobile session displacement and admin revoke"
```

---

## Phase 5 — Mobile app

### Task 11: Device identity module

**Files:**
- Create: `lib/auth/device-identity.ts`
- Create: `__tests__/lib/auth/device-identity.test.ts`

**Interfaces:**
- Produces: `getOrCreateDeviceInstallationId(): Promise<string>`, `getMobileDeviceMetadata(): Promise<MobileDeviceMetadata>`

- [ ] **Step 1: Implement** (per spec — SecureStore + `expo-crypto` randomUUID; **no** hardware IDs)

- [ ] **Step 2: Jest tests** — mock SecureStore; ID persists when stored; generates new when empty

- [ ] **Step 3: Commit** (mobile repo)

```bash
git commit -m "feat(auth): add app-generated device installation identity"
```

### Task 12: Login + refresh metadata

**Files:**
- Modify: `lib/auth/auth-store.tsx`
- Modify: `lib/auth/jwt-refresh-session.ts`

- [ ] **Step 1: Spread `await getMobileDeviceMetadata()` into** `login`, `loginWithMicrosoft`, `loginWithTelegramBotOtp` POST bodies.

- [ ] **Step 2: Include same fields in `/token/refresh` POST body**

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(auth): send device metadata on mobile login and refresh"
```

### Task 13: Displacement UX

**Files:**
- Modify: `lib/api.ts`
- Modify: `lib/auth/auth-store.tsx`
- Create: `lib/notifications/handle-session-revoked-push.ts`
- Modify: push notification setup (find existing notification response handler)
- Modify: `lib/i18n/locales/en.ts`, `lib/i18n/locales/my.ts`
- Modify: `lib/hooks/use-login-screen.ts` or `app/(auth)/login.tsx`

- [ ] **Step 1: On 401, parse response JSON** — if `code === 'session_revoked'`, store reason in auth store before `logout()`.

- [ ] **Step 2: Map reasons to i18n keys**

```ts
// en.ts
sessionRevokedDeviceDisplaced: 'You were signed out because your account signed in on another device.',
sessionRevokedAdminRevoked: 'Your session was ended by a school administrator.',
```

Copy same English strings to `my.ts`.

- [ ] **Step 3: Login screen** — read one-shot message from store; show toast/alert; clear after display.

- [ ] **Step 4: Push handler** — on `data.type === 'session_revoked'`, set same message if foregrounded.

- [ ] **Step 5: Tests** — api interceptor unit test with mocked 401 body

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(auth): handle session_revoked displacement UX"
```

---

## Phase 6 — Frontend admin

### Task 14: Authorization helpers + route permissions

**Files:**
- Modify: `src/helpers/authorization.ts`
- Modify: `src/config/route-permissions.ts`
- Modify: `src/config/__tests__/route-permissions.test.ts`

- [ ] **Step 1: Add helpers**

```ts
export const canConfigureMobileDevicePolicy = (user: accountType) =>
  permissionsFor(user).can('mobile_device_policy.configure');
export const canViewMobileDevices = (user: accountType) =>
  permissionsFor(user).can('mobile_device.view');
export const canRevokeMobileDevices = (user: accountType) =>
  permissionsFor(user).can('mobile_device.revoke');
```

- [ ] **Step 2: Route rule** for `/organizations/user-activity/devices` → `mobile_device.view`

- [ ] **Step 3: Commit** (FE repo)

```bash
git commit -m "feat(authz): add mobile device RBAC helpers and route gate"
```

### Task 15: Org settings toggle

**Files:**
- Modify: `src/config/org-settings-registry.ts`
- Modify org TypeScript types if needed

- [ ] **Step 1: Add Access subsection "Mobile sign-in"** with `is_single_mobile_device_enabled` toggle + helper text from spec.

- [ ] **Step 2: Visibility** — only when `canConfigureMobileDevicePolicy(viewer)`.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(org): add single mobile device policy toggle"
```

### Task 16: Client API + Devices page

**Files:**
- Create: `src/app/client-api/mobile-devices.ts`
- Create: `src/app/(internal)/organizations/user-activity/devices/page.tsx`
- Modify: `src/app/(internal)/organizations/user-activity/page.tsx`

- [ ] **Step 1: API helpers** — list, revoke, bulkRevoke, revokeStale (TanStack Query keys: `['mobile-devices', filters]`)

- [ ] **Step 2: Devices page** — mirror `login-activity/page.tsx` shell: filters, table, row revoke with confirm, bulk selection, stale modal (default 90 days).

- [ ] **Step 3: Hub tile** — "Mobile devices" → `/organizations/user-activity/devices`

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(user-activity): add mobile devices admin page"
```

### Task 17: Per-user drill-down card

**Files:**
- Modify: `src/components/record/sections/record-access.tsx`

- [ ] **Step 1: When viewing another user and `canViewMobileDevices`**, fetch `GET users/{id}/mobile-devices/` via `useQuery`.

- [ ] **Step 2: Compact table** + revoke buttons if `canRevokeMobileDevices`.

- [ ] **Step 3: Link** to devices page with `?user_id=` filter.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(users): show mobile devices on access record section"
```

---

## Phase 7 — Manual verification

### Task 18: End-to-end smoke

- [ ] Enable flag in org settings (user with `mobile_device_policy.configure`).
- [ ] Login mobile device A (physical or sim) — verify `MobileDevice` row in admin page.
- [ ] Login mobile device B same account — A gets push + 401 on next action; B active.
- [ ] Admin revoke from devices page — mobile shows admin message.
- [ ] Web login on second browser — both web sessions remain (mobile unaffected).
- [ ] Toggle flag on with two existing mobile sessions — both still refresh until re-login.

---

## Spec coverage checklist

| Spec section | Task(s) |
| --- | --- |
| Org flag + grandfathering | 1 |
| MobileDevice + RefreshSession | 2 |
| RBAC permissions | 3 |
| Login metadata contract | 4 |
| Enforcement on login only | 5 |
| session_revoked 401 shape | 6 |
| last_seen on refresh | 7 |
| Admin list/detail APIs | 8 |
| Revoke + bulk + stale | 9 |
| Push on displacement/revoke | 10 |
| Mobile device identity (Option A) | 11 |
| Mobile login/refresh metadata | 12 |
| Displacement UX + i18n | 13 |
| FE org toggle | 15 |
| FE devices page | 14, 16 |
| FE per-user drill-down | 17 |
| Privacy (no hardware IDs) | 11 (explicitly excluded) |

---

## Commit order summary (cross-repo)

1. BE: org fields → models → RBAC → metadata → policy → session errors → APIs → push
2. Mobile: device-identity → login wiring → displacement UX
3. FE: authz → org toggle → devices page → record card

Each repo uses branch `feat/mobile-single-device-login` from latest `dev`.
