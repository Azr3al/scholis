# Microsoft Bulk Password Reset — Design Spec

**Date:** 2026-07-07  
**Status:** Approved — implementation plan at `docs/superpowers/plans/2026-07-07-ms-bulk-password-reset.md`  
**Repos:** `schedjuice-reimagined-be`, `schedjuice-reimagined-fe`  
**Approach:** Dedicated debug page + preview/commit endpoints (Approach A)

## 1. Summary

Platform operators on Microsoft-enabled tenants need to bulk-reset Entra (Azure AD)
passwords to the known default onboarding password (`Password123$` / `IMPORT_PASSWORD`)
for a pasted list of emails — typically after imports, support tickets, or term rollovers.

Today:

- Import flows set `IMPORT_PASSWORD` locally at user creation and may provision Entra with
  the same value when the local password is still the default.
- `POST /api/v1/password-reset/oauth` resets **one** user via Graph but generates a
  **random** password and does not update Django `User.password`.
- No bulk password reset endpoint or platform-internal UI exists.

Add a platform-internal debug page with a preview-then-confirm flow: paste emails, review
resolution status, confirm reset for eligible users only.

### Locked decisions

| Decision | Choice |
| --- | --- |
| Credential store | **Entra only** — Graph `resetPassword` with `IMPORT_PASSWORD`; Django local password unchanged |
| Default password | `IMPORT_PASSWORD` (`Password123$`) from `acca_spreadsheet_import.py` |
| Unlinked MS accounts | **Skip** — report `no_microsoft_account` |
| Unknown emails | **Skip** — report `not_found` |
| Execution model | **Synchronous** with **50-email cap** per batch |
| UI flow | **Preview then confirm** — resolved table before Graph calls |
| Audit logging | **No** dedicated audit trail for v1 (existing request logging only) |
| Access | **Platform-internal** — `debug.access` on MS-enabled tenants |
| Who runs it | **Superadmin** — same component gate as other `/debug/*` pages |

## 2. Context

- Default password constant: `app_organization/acca_spreadsheet_import.py` → `IMPORT_PASSWORD`
- Single MS reset: `app_auth/views.py` → `OauthPasswordResetView` (`user.update`, random password)
- Graph reset: `app_microsoft/graph_wrapper/user.py` → `MSUser.reset_password`
- MS provisioning uses `IMPORT_PASSWORD` when local password matches:
  `app_microsoft/provisioning.py`
- Platform debug tooling: `/debug/*`, `debug.access`, `tenant.is_microsoft_on` gating
- Email paste parser: `schedjuice-reimagined-fe/src/lib/course/parse-student-email-paste.ts`
- Bulk endpoint precedent: `POST /users/assign-role-bulk` (cap 100, per-item results)
- MS repair precedent: `POST microsoft/repair/dry-run` (preview without side effects)

## 3. Goals

1. Reset Entra passwords to `IMPORT_PASSWORD` for up to 50 emails in one synchronous request.
2. Preview resolution (found / not found / no MS link) before any Graph mutation.
3. Return per-email outcomes so operators can retry failures or follow up on skips.
4. Restrict to platform superadmins on Microsoft-enabled tenants.

## 4. Non-goals

- Updating Django `User.password` or `is_password_change_required`.
- Async job queue (Microsoft Bulk Repair pattern) — deferred unless cap proves insufficient.
- Dedicated audit/event log table for v1.
- School-admin access via `user.update` (existing single-user OAuth reset remains).
- Sending welcome/password emails after reset.
- Resetting passwords for users without `microsoft_id` (report skip only).

## 5. Access control

| Layer | Requirement |
| --- | --- |
| Frontend route | `/debug/microsoft-password-reset` under `(internal)/` |
| Route permissions | `debug.access` (existing `route-permissions.ts` `/debug` prefix rule) |
| Component gate | `user.roles.includes(role.superadmin)` — same as `microsoft-bulk-repair/page.tsx` |
| Nav visibility | Platform → Debug; `canShow: tenant.is_microsoft_on` |
| Backend permission | `debug.access` (`PLATFORM_INTERNAL` tier) |
| Tenant gate | `request.tenant.is_microsoft_on` — 400 if false |

## 6. API

Base path: `/api/v1/microsoft/password-reset/`

### 6.1 `POST microsoft/password-reset/preview`

Resolve emails against the current tenant. **No Graph calls.**

**Request:**

```json
{ "emails": ["alice@school.edu", "bob@school.edu"] }
```

**Server processing:**

1. Reject if `!tenant.is_microsoft_on` → 400 `not_supported`
2. Normalize each email via `normalize_email` (existing helper)
3. Dedupe case-insensitively; preserve first-seen casing for display
4. Reject if `len(emails) > 50` → 400 `too_many_emails`
5. Reject if `emails` missing or empty → 400 `missing_emails`
6. Lookup `User` by email within tenant schema

**Per-email status:**

| Status | Condition |
| --- | --- |
| `eligible` | User exists and `microsoft_id` is non-empty |
| `not_found` | No user with that email in tenant |
| `no_microsoft_account` | User exists but `microsoft_id` is empty |

**Response (200):**

```json
{
  "results": [
    { "email": "alice@school.edu", "status": "eligible", "user_id": 42 },
    { "email": "bob@school.edu", "status": "not_found" },
    { "email": "carol@school.edu", "status": "no_microsoft_account", "user_id": 99 }
  ],
  "summary": {
    "total": 3,
    "eligible": 1,
    "not_found": 1,
    "no_microsoft_account": 1
  }
}
```

### 6.2 `POST microsoft/password-reset/commit`

Re-resolve emails server-side (do not trust client-filtered subset), then reset eligible
users via Graph.

**Request:** Same shape as preview — `{ "emails": string[] }`.

**Server processing:**

1. Same validation/normalization/cap as preview
2. For each email:
   - `not_found` or `no_microsoft_account` → result `skipped` with `reason`
   - `eligible` → call `MSUser.reset_password(microsoft_id, tenant, password=IMPORT_PASSWORD)`
3. Continue on per-email Graph failures (partial success allowed)
4. Return HTTP 200 with full result set regardless of partial failures

**Per-email commit status:**

| Status | Meaning |
| --- | --- |
| `succeeded` | Graph `resetPassword` returned 2xx |
| `skipped` | `not_found` or `no_microsoft_account` |
| `failed` | Graph error — include `reason` (truncated Graph error body or status code) |

**Response (200):**

```json
{
  "results": [
    { "email": "alice@school.edu", "status": "succeeded" },
    { "email": "bob@school.edu", "status": "skipped", "reason": "not_found" },
    { "email": "dave@school.edu", "status": "failed", "reason": "Graph 403: ..." }
  ],
  "summary": {
    "total": 3,
    "succeeded": 1,
    "skipped": 1,
    "failed": 1
  }
}
```

### 6.3 Graph layer change

Extend `MSUser.reset_password`:

```python
def reset_password(self, user_id: str, tenant, *, password: str | None = None):
    new_password = password or self._generate_password()
    ...
```

- Bulk commit passes `password=IMPORT_PASSWORD`.
- Existing `OauthPasswordResetView` behavior unchanged (no `password` arg → random).

**Implementation location:** New module `app_microsoft/password_reset_bulk.py` with
`preview_emails(tenant, emails)` and `commit_emails(tenant, emails)` called from thin
views in `app_microsoft/views.py`. Keeps views small and testable.

**URLs** (`app_microsoft/urls.py`):

```python
path("microsoft/password-reset/preview", ...),
path("microsoft/password-reset/commit", ...),
```

## 7. Frontend UI

**Page:** `src/app/(internal)/debug/microsoft-password-reset/page.tsx`

### 7.1 Layout

1. **Page header** — "Microsoft Password Reset" with brief description: resets Entra
   passwords to the default onboarding password (`Password123$`). Does not change local
   Schedjuice passwords.
2. **Paste textarea** — placeholder: "One email per line (tabs from Excel also work)"
3. **Parse guard** — if `parseStudentEmailPaste(text).length > 50`, show inline error;
   disable Preview (do not call API)
4. **Preview button** — calls preview endpoint; loading state
5. **Preview table** — Email | Status chip (`eligible` / `not found` / `no MS account`)
6. **Summary bar** — e.g. "32 eligible · 5 not found · 2 no MS account"
7. **Confirm button** — enabled when `eligible > 0` and not loading; opens confirmation
   dialog: "Reset Entra passwords to the default onboarding password for {N} users?"
8. **Results** — after commit, update table with `succeeded` / `skipped` / `failed` +
   failure reason column when applicable; toast with summary counts

### 7.2 API client

Add to `src/app/client-api/microsoft.ts` (or adjacent):

- `microsoftPasswordResetPreview(emails: string[])`
- `microsoftPasswordResetCommit(emails: string[])`

### 7.3 Navigation

In `src/config/nav-routes.tsx`, Platform → Debug children:

```typescript
{
  title: "Microsoft Password Reset",
  icon: LockIcon, // or KeyRound
  href: "/debug/microsoft-password-reset",
  requiredPermissions: ["debug.access"],
  canShow: (tenant) => tenant.is_microsoft_on,
}
```

No new `route-permissions.ts` entry needed — `/debug` prefix already requires
`debug.access`.

## 8. Error handling

| Condition | Behavior |
| --- | --- |
| Tenant not MS-enabled | BE 400; FE toast "Only available for Microsoft-enabled tenants" |
| > 50 emails | BE 400 `too_many_emails`; FE inline guard before API call |
| No `debug.access` | BE 403; existing RBAC / route guard |
| Graph transient error | Per-email `failed`; batch continues |
| Graph rate limit | Per-email `failed` with reason; operator splits batch if needed |
| Request timeout (50 Graph calls) | Acceptable for v1; cap bounds worst case |

## 9. Testing

### Backend (`app_microsoft/tests/test_password_reset_bulk.py`)

- Preview: eligible, not_found, no_microsoft_account, dedupe, empty list, cap enforcement
- Preview: MS-disabled tenant → 400
- Commit: mock `MSUser.reset_password`; verify `password=IMPORT_PASSWORD` passed
- Commit: skips ineligible; partial Graph failure returns mixed results
- Permission: non-superadmin / missing `debug.access` → 403

### Frontend (light)

- 50-email cap blocks preview when parser returns 51+
- Preview table renders status chips from mock response
- Confirm disabled when `eligible === 0`

## 10. Security notes

- Resets Entra to a **known shared password** — acceptable for this internal operator tool
  matching import onboarding; operators must communicate credentials out-of-band.
- Server re-resolves on commit to prevent client tampering with eligible subset.
- No password values returned in API responses.
- Platform-internal only; not exposed to school admins.

## 11. Files to touch

| Area | Paths |
| --- | --- |
| Bulk logic | `app_microsoft/password_reset_bulk.py` (new) |
| Views / URLs | `app_microsoft/views.py`, `app_microsoft/urls.py` |
| Graph | `app_microsoft/graph_wrapper/user.py` |
| Tests | `app_microsoft/tests/test_password_reset_bulk.py` (new) |
| FE page | `src/app/(internal)/debug/microsoft-password-reset/page.tsx` (new) |
| FE API | `src/app/client-api/microsoft.ts` |
| Nav | `src/config/nav-routes.tsx` |
