# Mobile Single-Device Login — Design

**Date:** 2026-09-09  
**Status:** Approved for implementation (brainstorming)  
**Repos:** `schedjuice-reimagined-be`, `schedjuice-reimagined-mobile`, `schedjuice-reimagined-fe`

## Goal

When a tenant enables the policy, each user account may have **at most one active native mobile app session**. Signing in on a second device revokes the first. School admins get an **Entra-style Devices page** to view and revoke mobile sign-ins, with bulk actions.

Web (desktop and mobile browser) sessions are **unaffected**.

---

## Locked decisions

| Topic | Choice |
|-------|--------|
| Scope | Native Expo/React Native app only |
| Policy control | Tenant org flag (`Organization.is_single_mobile_device_enabled`) |
| Enablement UX | Toggle in org settings → **Access** group; requires `mobile_device_policy.configure` |
| Grandfathering | Enabling the flag does **not** revoke existing sessions; enforcement starts on the **next mobile login** |
| Displacement | New mobile login wins; other active mobile sessions for that user are revoked |
| Displaced device UX | Push notification **and** in-app message on next failed auth |
| Admin page | `/organizations/user-activity/devices` — view, per-device revoke, bulk revoke |
| Admin permissions | New permission set (not reused from Login Activity) |
| Data model | **`MobileDevice` registry** linked to `RefreshSession` (Approach 2) |
| Device identity | **App-generated UUID only** (`device_installation_id` in SecureStore) — no IDFV / ANDROID_ID (avoids App Store / Play policy updates; hardware IDs deferred) |
| Web sessions | Tagged `client_type=web`; excluded from enforcement |

---

## Architecture overview

```text
┌─────────────────┐     login + installation_id      ┌──────────────────────┐
│  Mobile app     │ ─────────────────────────────────► │  create_refresh_     │
│  (Expo)         │     client_type=mobile_native      │  session()           │
└─────────────────┘                                    └──────────┬───────────┘
                                                                  │
                     if org flag ON: revoke other mobile sessions │
                     upsert MobileDevice, link RefreshSession     ▼
┌─────────────────┐     list / revoke / bulk          ┌──────────────────────┐
│  Admin FE       │ ◄────────────────────────────────►│  MobileDevice +      │
│  Devices page   │                                   │  RefreshSession APIs │
└─────────────────┘                                    └──────────────────────┘
```

**Enforcement runs only in `create_refresh_session()`** (login paths: email, Microsoft, Telegram, Google). Token refresh never revokes sibling sessions — this preserves grandfathered logins until re-login or natural expiry.

---

## Backend

### Organization fields

Add to `Organization` (`app_organization/models.py`):

| Field | Type | Notes |
|-------|------|-------|
| `is_single_mobile_device_enabled` | `BooleanField(default=False)` | Master toggle |
| `single_mobile_device_enabled_at` | `DateTimeField(null=True, blank=True)` | Set when toggled **ON**; cleared when toggled **OFF** |

**Toggle behavior:**

- **OFF → ON:** set `is_single_mobile_device_enabled=True`, set `single_mobile_device_enabled_at=now()`. Do **not** revoke any sessions.
- **ON → OFF:** set flag false, clear `single_mobile_device_enabled_at`. Existing mobile sessions remain valid until expiry/logout.

Expose both fields on the org serializer used by `/organizations/profile` PATCH (Access section). PATCH requires `mobile_device_policy.configure`.

### `ClientType` enum

```python
class ClientType(models.TextChoices):
    WEB = "web", "Web"
    MOBILE_NATIVE = "mobile_native", "Mobile native"
```

### `RefreshSession` extensions

| Field | Type | Notes |
|-------|------|-------|
| `client_type` | `CharField(max_length=32, choices=ClientType, default=ClientType.WEB)` | Set from login request |
| `mobile_device` | `FK(MobileDevice, null=True, blank=True, on_delete=SET_NULL)` | Populated for mobile logins |
| `revoked_reason` | `CharField(max_length=64, null=True, blank=True)` | e.g. `device_displaced`, `admin_revoked`, `user_logout` |
| `last_seen_at` | `DateTimeField(null=True, blank=True)` | Updated on login and token refresh for mobile sessions |

Existing rows backfill: `client_type=web`, `mobile_device=null`.

### Device identity (app-generated UUID — Option A)

**Strategy:** Use a **single app-generated identifier** persisted in SecureStore. Do **not** call `Application.getAndroidId()` or `Application.getIosIdForVendorAsync()` in v1 — avoids collecting platform hardware device IDs and **does not require App Store / Play Store privacy label updates** for a new “Device ID” category.

| ID | Source | Survives reinstall? | Role |
|----|--------|---------------------|------|
| `device_installation_id` | UUID v4 in SecureStore (`device_installation_id`) | **iOS:** often yes (Keychain may persist with same bundle ID). **Android:** no (wiped on uninstall) | Canonical key for `MobileDevice` |

**Known v1 limitation (accepted):** On **Android**, after reinstall the app gets a new UUID → server treats it as a new device. If the user had **two phones** logged in and reinstalls on one, the next login on the reinstalled phone may **incorrectly displace the other phone**. This is rare; hardware IDs can be added later if needed without changing the overall architecture (`hardware_id` column + migration).

**Future path:** Add optional `hardware_id` on `MobileDevice` and switch unique constraint to `(user, hardware_id)` when store/policy review allows — mobile sends both; server prefers hardware_id when present.

### `MobileDevice` model

Tenant-scoped (`app_auth/models.py`):

| Field | Type | Notes |
|-------|------|-------|
| `user` | FK → `User` | Owner |
| `installation_id` | `UUIDField(db_index=True)` | App-generated install ID from SecureStore |
| `display_name` | `CharField(max_length=256)` | e.g. `"James's iPhone 15 Pro"` |
| `device_model` | `CharField(max_length=128, null=True)` | From `expo-device` (display only) |
| `os_name` | `CharField(max_length=64, null=True)` | iOS / Android |
| `os_version` | `CharField(max_length=64, null=True)` | |
| `app_version` | `CharField(max_length=32, null=True)` | Expo app version |
| `first_seen_at` | `DateTimeField(auto_now_add=True)` | |
| `last_seen_at` | `DateTimeField` | Updated on login + refresh |
| `is_active` | `BooleanField(default=True)` | False when no active linked session |
| `revoked_at` | `DateTimeField(null=True, blank=True)` | Last admin/policy revocation |

**Constraints:** `UniqueConstraint(fields=["user", "installation_id"], name="unique_user_mobile_installation")`

One registry row per **app install** per user. Re-login on the same install upserts the row and rotates the session.

### Login request contract (mobile)

All mobile login endpoints accept optional metadata (ignored by web):

```json
{
  "client_type": "mobile_native",
  "device_installation_id": "<uuid>",
  "device_name": "James's iPhone 15 Pro",
  "device_model": "iPhone15,3",
  "os_name": "iOS",
  "os_version": "18.0",
  "app_version": "2.4.1"
}
```

Validation:

- When `client_type=mobile_native`, **`device_installation_id` is required** (400 if missing).
- Web logins omit `client_type` or send `web` — no installation ID required.

Implementation: extend `_device_metadata_from_request()` in `refresh_sessions.py` and thread through all login serializers.

### Enforcement logic

New helper: `enforce_single_mobile_device(user, new_session, org)` in `app_auth/mobile_device_policy.py`.

Called at end of `create_refresh_session()` when:

1. `org.is_single_mobile_device_enabled` is true, **and**
2. New session `client_type == MOBILE_NATIVE`.

Steps:

1. Upsert `MobileDevice` for `(user, installation_id)`; update metadata; link new `RefreshSession`; set `is_active=True`, `last_seen_at=now()`.
2. Revoke **prior sessions on this same `MobileDevice`** (re-login same install) with `revoked_reason=session_rotated` — **no push**.
3. Find other **active** mobile sessions for same user on **different** `MobileDevice` rows (`installation_id !=` current).
4. For each: set `revoked_at=now()`, `revoked_reason=device_displaced`; mark those `MobileDevice.is_active=False`.
5. Queue push notification only for step 4 displacements (best-effort, async task).

**Grandfathering:** sessions created before `single_mobile_device_enabled_at` are still subject to displacement when the user performs a **new login after the flag was enabled** — but they continue to refresh successfully until that happens. No retroactive sweep on flag enable.

### Revocation & auth errors

Extend `revoke_refresh_session()` to accept optional `reason`.

When refresh or access auth fails because session is revoked, return:

```json
{
  "detail": "Session has been revoked.",
  "code": "session_revoked",
  "reason": "device_displaced"
}
```

Reason codes: `device_displaced`, `session_rotated`, `admin_revoked`, `user_logout`, `password_reset`, `logout_all`.

Mobile maps `session_revoked` + `device_displaced` to the user-facing displacement message.

### Admin APIs

Base path: `/api/v1/mobile-devices/` (tenant-scoped, RBAC on each action).

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| `GET` | `/mobile-devices/` | `mobile_device.view` | Paginated list; filters: `user_id`, `is_active`, `q` (name/email), `stale_days` |
| `GET` | `/mobile-devices/{id}/` | `mobile_device.view` | Device detail + active session metadata |
| `GET` | `/users/{id}/mobile-devices/` | `mobile_device.view` | Per-user device list (for user record drill-down) |
| `POST` | `/mobile-devices/{id}/revoke/` | `mobile_device.revoke` | Revoke active session for one device; push + reason `admin_revoked` |
| `POST` | `/mobile-devices/bulk-revoke/` | `mobile_device.revoke` | Body: `{ "device_ids": [...] }` or `{ "user_id": N }` (revoke all mobile for user) |
| `POST` | `/mobile-devices/revoke-stale/` | `mobile_device.revoke` | Body: `{ "inactive_days": 90 }` — revoke devices with `last_seen_at` older than threshold |

List response shape (device-centric):

```json
{
  "id": 42,
  "user": { "id": 7, "full_name": "...", "email": "..." },
  "display_name": "James's iPhone 15 Pro",
  "device_model": "iPhone15,3",
  "os_name": "iOS",
  "os_version": "18.0",
  "app_version": "2.4.1",
  "is_active": true,
  "first_seen_at": "...",
  "last_seen_at": "...",
  "active_session_id": "uuid-or-null",
  "revoked_at": null
}
```

### Push notification on displacement

Reuse Expo push fanout (`app_utils/push_fanout_tasks.py`). New notification type / data payload:

```json
{
  "type": "session_revoked",
  "reason": "device_displaced",
  "title": "Signed out",
  "body": "Your account signed in on another device."
}
```

Send to the displaced device's active Expo push token(s) for that user where `Device.is_active=True`. Best-effort; displacement still works via 401 even if push fails.

Also send on admin revoke with `reason: admin_revoked`.

### RBAC catalog

Add to `app_rbac/catalog.py` under a new **Security** group (or **Operational**):

| Permission | Label | Description | Sensitive |
|------------|-------|-------------|-----------|
| `mobile_device_policy.configure` | Configure mobile device policy | turn single-device mobile login on or off for the school | yes |
| `mobile_device.view` | View mobile devices | view signed-in mobile devices for users | yes |
| `mobile_device.revoke` | Revoke mobile devices | sign users out of mobile devices | yes |

**Default role assignment (migration seed):**

- School admin / founder roles: all three permissions.
- Dean / HR (if they need monitoring): `mobile_device.view` + `mobile_device.revoke` only — **not** policy configure unless explicitly granted.

Do **not** bundle into `org.configure`; policy configure is its own permission but lives in the org settings UI.

---

## Mobile (`schedjuice-reimagined-mobile`)

### Device identity module

New module: `lib/auth/device-identity.ts`

**`device_installation_id`** — UUID v4 in SecureStore, key `device_installation_id`:

- Generated on first launch when missing.
- Survives normal app restarts.
- **iOS:** may survive reinstall (Keychain behavior with same bundle ID — not guaranteed).
- **Android:** new UUID after uninstall/reinstall.
- **Do not** use `Application.getAndroidId()` or `getIosIdForVendorAsync()` in v1.

Display metadata from `expo-device` + `expo-application` (model name, OS, app version) — for admin UI only, not used as enforcement keys.

```ts
export async function getOrCreateDeviceInstallationId(): Promise<string> {
  const existing = await SecureStore.getItemAsync('device_installation_id');
  if (existing) return existing;
  const id = Crypto.randomUUID();
  await SecureStore.setItemAsync('device_installation_id', id);
  return id;
}

export async function getMobileDeviceMetadata() {
  return {
    client_type: 'mobile_native' as const,
    device_installation_id: await getOrCreateDeviceInstallationId(),
    device_name: Device.deviceName ?? `${Device.modelName ?? 'Mobile device'}`,
    device_model: Device.modelName ?? null,
    os_name: Device.osName ?? null,
    os_version: Device.osVersion ?? null,
    app_version: Application.nativeApplicationVersion ?? null,
  };
}
```

### Login integration

Merge metadata into every login call in `auth-store.tsx`:

- `login()` (email/password)
- `loginWithMicrosoft()`
- `loginWithTelegramBotOtp()`

Also send on `POST /token/refresh` body so `last_seen_at` updates (does **not** trigger enforcement).

### Displacement handling

1. **401 interceptor** (`lib/api.ts`): if response body has `code === 'session_revoked'`, call `logout()` and set a one-shot flag/message in auth store.
2. **Message mapping:**
   - `device_displaced` → i18n: *"You were signed out because your account signed in on another device."*
   - `admin_revoked` → *"Your session was ended by a school administrator."*
3. **Login screen / toast:** show message after redirect.
4. **Push handler:** on `session_revoked` notification, show local alert if app is foregrounded; if backgrounded, tapping opens app → login with message.

### i18n

Add keys to `en.ts` and copy English placeholder to `my.ts` per project rules.

---

## Frontend admin (`schedjuice-reimagined-fe`)

### Org policy toggle

**Location:** `src/config/org-settings-registry.ts` → **Access** group → new subsection **Mobile sign-in**:

- Toggle: `is_single_mobile_device_enabled` — label: *"Allow only one mobile device per account"*
- Helper: *"When on, each person can stay signed in on one phone or tablet app at a time. People already signed in are not signed out until they sign in again on another device."*
- Visible only when viewer has `mobile_device_policy.configure`.
- PATCH uses existing org profile save flow.

### Devices page

**Route:** `/organizations/user-activity/devices`  
**Files:**

- `src/app/(internal)/organizations/user-activity/devices/page.tsx`
- Register tile on `user-activity/page.tsx` hub
- Optional nav child under People → User Activity in `nav-routes.tsx`

**Gate:** `mobile_device.view` (new helper `canViewMobileDevices(user)` in `authorization.ts`).  
**Route permission:** add to `route-permissions.ts`.

**UI (Entra-inspired):**

- Page header: *"Mobile devices"*
- Filters: search (name/email), status (Active / Signed out), stale threshold
- Table columns: User, Device, OS, Last active, Status, Actions
- Row action: **Sign out** (requires `mobile_device.revoke`) — confirm dialog
- Bulk: checkbox selection → **Sign out selected**
- Toolbar: **Sign out inactive devices…** (modal: days threshold, default 90)
- User name links to `/users/{id}?section=access` (or future `devices` pane)

Reuse patterns from `login-activity/page.tsx`: `PageContainer`, `usePageHeader`, TanStack Query, back link to hub.

### Per-user drill-down (v1)

Add a **Mobile devices** card to `record-access.tsx` (or new `record-devices.tsx` section) visible when viewer has `mobile_device.view` and is viewing **another** user (not self-profile).

- Compact table: device name, last active, status
- **Sign out** per row if `mobile_device.revoke`
- Link: *"View all mobile devices"* → filtered devices page with `user_id` query param

---

## Privacy & store compliance (v1)

- **No new OS permission prompts** (camera, tracking, etc.).
- **No platform hardware device IDs** in v1 — intentionally avoids new App Store “Device ID” / Play “Device or other IDs” disclosures.
- `device_installation_id` is an **app-scoped identifier** generated by the app (similar in spirit to existing session IDs).
- Display fields (`device_name`, `device_model`, OS) come from `expo-device` for admin readability only.
- Push notifications for displacement reuse the **existing** notification permission flow.
- Revisit store privacy forms only if/when **hardware IDs** are added later.

---

## Edge cases

| Case | Behavior |
|------|----------|
| Flag enabled while user has 2 phones logged in | Both keep working until one performs a fresh login; that login revokes the other |
| User reinstalls app (same phone, iOS) | Often same `installation_id` (Keychain) → same `MobileDevice`; session rotates only |
| User reinstalls app (same phone, Android) | New `installation_id` → new `MobileDevice` row; displaces any other active mobile session (including a second phone if user had two — **known v1 edge case**) |
| Same phone, biometric re-login | Same `installation_id` → upsert; no cross-device displacement |
| Admin revokes device while app open | Next API call → 401 + message; push if token registered |
| Org flag turned off | No new enforcements; existing mobile sessions unaffected |
| User has no push token | Displacement via 401 only |
| Simulator / Expo Go | Still sends `mobile_native`; policy applies (acceptable for dev) |
| Platform staff / superadmin on mobile | Same policy when flag on — no bypass unless we add one later |
| Password reset / logout-all | Existing behavior revokes all sessions; set `revoked_reason` accordingly |

---

## Testing

### Backend (high-value)

- Flag off: two mobile logins → both sessions active
- Flag on, grandfather: enable flag with two pre-existing sessions → both still refresh
- Flag on, new login: third mobile login revokes prior mobile sessions; web sessions untouched
- Missing `device_installation_id` on mobile login → 400
- Same `installation_id` re-login → `session_rotated`; no `device_displaced` push
- Different `installation_id` login → prior mobile devices get `device_displaced`
- Admin revoke → 401 with `admin_revoked`; displaced push task enqueued (mock)
- Bulk revoke by `user_id` revokes all active mobile sessions for user
- RBAC: view without revoke → 403 on revoke endpoints; configure without view → can PATCH flag but not list
- Unique constraint: same user + installation_id upserts; does not duplicate

### Mobile

- Installation ID persists across restart
- Login payloads include device metadata on all auth paths
- 401 `session_revoked` / `device_displaced` shows message on login screen

### Frontend

- Devices page hidden without `mobile_device.view`
- Revoke button hidden without `mobile_device.revoke`
- Org toggle hidden without `mobile_device_policy.configure`
- Bulk revoke calls correct API; table refetches after mutation

---

## Out of scope (v1)

- Platform hardware IDs (IDFV / ANDROID_ID) — deferred; add later via migration if reinstall accuracy on Android requires it
- Per-role exemptions (e.g. admins unlimited mobile devices)
- User self-service "my devices" screen in mobile app
- Desktop / web session limits
- Automatic stale revoke cron (admin-triggered only in v1)
- Cross-tenant platform-internal device view
- Blocking login on second device instead of displacing first (user chose displace)

---

## Implementation order

1. **BE:** models + migration + RBAC catalog seed + `mobile_device_policy.py` + login metadata + enforcement
2. **BE:** admin list/revoke APIs + tests
3. **BE:** push payload on displacement/revoke
4. **Mobile:** device identity + login/refresh metadata + displacement UX + i18n
5. **FE:** org toggle in Access settings
6. **FE:** Devices page + user record drill-down + route permissions
7. **E2E manual:** enable flag → login device A → login device B → verify A signed out with message

---

## Open questions (resolved)

All brainstorming questions resolved in this document. No TBD items remain.
