# Data Verification Request Upgrade — Design Spec

**Date:** 2026-07-18  
**Status:** Draft (pending user review)  
**Repos:** `schedjuice-reimagined-fe`, `schedjuice-reimagined-be`  
**Approach:** Evolve existing DVR models (Approach 1)

## 1. Summary

Upgrade Data Verification Requests (DVRs) so admins can create a time-bounded verification campaign with field-level required overrides, snapshotted role targets, and an in-app sticky banner for pending staff. After create, the admin sees a copyable verify URL. Automatic email notifications are removed.

## 2. Context

### Current behavior

| Area | Today |
| --- | --- |
| Model | `DataVerificationRequest`: `name`, `fields` (JSON `string[]`), `requested_user_types`, `created_by` |
| Per-user | `UserDataVerificationRequest`: status `pending` / `awaiting_verification` / `verified` / `rejected` |
| Create | Admin picks fields (none selected by default) + roles; serializer creates Celery/Task rows that create UserDVRs and send email |
| Staff UX | Email link → `/data-verification-requests/{id}/verify`; form updates user then marks UserDVR `verified` |
| Banner | None |
| Expiry | None |
| Required fields | All included fields use normal form schema; no per-DVR mandatory override |

### Gaps vs desired product

- No expiry / “due by” window for the banner.
- No copyable URL success step (email is the primary channel today).
- No intrusive in-app banner while pending and unexpired.
- No way for admin to mark DB-optional fields required for this campaign.
- Defaults are weak (empty field selection; no staff-role default).

## 3. Goals

1. Admin creates DVR with: name, included fields (all selected by default), per-field required flags, expiry (default +7 days), role targets (all staff roles by default).
2. On create: snapshot `UserDataVerificationRequest` for matching users; **no email**.
3. After create: show verify URL for admin to copy.
4. Targeted users with pending UserDVR see a non-dismissible sticky banner until they successfully submit verify (or the DVR expires).
5. After expiry: banner stops; verify URL still works.
6. Verify form shows included fields; only admin-marked required fields must be non-empty.

## 4. Non-goals

- Automatic email (or other push) on create.
- Live role-based enrollment after create (late joiners / role changes).
- Re-snapshoting users when editing a DVR.
- Per-user targeting (individual picker).
- Admin approval gate before banner clears (`awaiting_verification` / `rejected` remain unused by this upgrade).
- Expanding the DVR field catalog beyond current `dvrFieldSchema` paths.
- Mobile-native app changes.

## 5. Locked decisions

| Topic | Choice |
| --- | --- |
| Architecture | Evolve existing DVR models (Approach 1) |
| Discovery | Banner primary; verify URL shown after create for optional copy (no special share flow) |
| Audience | Role types only; default all staff roles (not student) |
| Enrollment | Snapshot at create time only |
| Expiry effect | Banner hides when `expires_on` is past; verify page still works |
| Banner clear | Self-submit success → UserDVR `verified` |
| Field rules | Included fields shown for review; only `required: true` must be non-empty |
| Email | Removed from create path |
| Multiple pending | Banner shows soonest-expiring unexpired pending DVR |

### Staff roles (default selection)

Preselect all of: `superadmin`, `admin`, `manager`, `finance`, `hr`, `teacher`.  
Do **not** preselect `student`.

### DVR field catalog (unchanged list)

From existing `dvrFieldSchema`: `communication_email`, `alternative_name`, `date_of_birth`, `phone_number`, `house_number`, `street`, `township`, `city`, `region`, `country`.

## 6. Data model

### 6.1 `DataVerificationRequest`

Add:

- `expires_on` — `DateField` (required for new DVRs; default today + 7 days at create time in API/UI).

Change `fields` JSON shape from:

```json
["phone_number", "township"]
```

to:

```json
[
  { "name": "phone_number", "required": true },
  { "name": "township", "required": false }
]
```

**Compatibility:** On read, if an element is a string, treat as `{ "name": "<string>", "required": false }`. Prefer a one-shot data migration that rewrites existing rows to the object shape.

### 6.2 `UserDataVerificationRequest`

Unchanged schema. Create path still inserts `pending` rows for the snapshot set. Verify success still sets `verified`.

## 7. Backend behavior

### 7.1 Create (`DataVerificationRequestSerializer.create`)

1. Set `created_by` from the authenticated request user using the existing create hook (do not expand scope into unrelated `created_by` refactors).
2. Validate:
   - `fields` non-empty after include filter (at least one included field).
   - Each field `name` is in the allowed DVR catalog.
   - `requested_user_types` non-empty.
   - `expires_on` present.
3. Persist DVR.
4. Query users whose `roles` overlap `requested_user_types` (same overlap semantics as today).
5. Bulk-create `UserDataVerificationRequest` (`pending`) for those users.
6. **Do not** enqueue `CREATE_DVR_AND_SEND_EMAIL` (or equivalent email tasks).

### 7.2 Verify / mark verified

When a user updates their UserDVR to `verified` (or the FE marks verified after user update):

- Server must ensure every field with `required: true` on the parent DVR is non-empty on the user record.
- Optional included fields may be empty.
- Expiry does **not** block verify.

### 7.3 Banner eligibility query

A UserDVR is banner-eligible when:

- `user` = current user
- `status` = `pending`
- parent DVR `expires_on >=` tenant “today” (date comparison; document timezone as tenant/org local date if available, else server date consistent with other date fields)

If multiple match, pick the one with the earliest `expires_on` (then lowest id as tie-break).

Prefer reusing existing `user-data-verification-requests/search` with filters + expand `data_verification_request`. Add a dedicated `me/pending-dvr` endpoint only if search cannot express expiry/ordering cleanly.

## 8. Frontend behavior

### 8.1 Create page

- Defaults: all catalog fields included; all required toggles off unless product later chooses otherwise (default **required = false** for each included field — admin opts into mandatory).
- Default roles: staff set above.
- Default `expires_on`: today + 7 days.
- Per field: include checkbox + required checkbox (required only meaningful when included).
- On success: surface `/data-verification-requests/{id}/verify` with copy-to-clipboard control; link to DVR detail.

### 8.2 Banner (`AppShell`)

```
┌──────────────────────────────────────────────────────────────┐
│ Please verify your profile data (due <date>)        [Verify] │
└──────────────────────────────────────────────────────────────┘
```

- Sticky, visually intrusive, **not dismissible**.
- App remains fully usable underneath.
- CTA navigates to that DVR’s verify route.
- Hidden when no banner-eligible UserDVR.

### 8.3 Verify page

- Build form from included field names.
- Client schema: required fields non-empty; optional included not required.
- On success: update user → mark UserDVR `verified` → navigate away (existing pattern); banner refetch clears it.
- Expired DVR: page still works; no special hard block.
- Already verified: keep existing “already verified” message.

### 8.4 List / detail

- Show `expires_on`.
- Show completion summary when cheap: counts of pending vs verified among UserDVRs for that DVR.
- Show field config (name + required).

### 8.5 Edit

- Do **not** re-snapshot users on edit.
- If edit already allows changing `fields` / `expires_on`, those changes apply to future verify/banner checks for existing pending UserDVRs.
- Adding new role targets via edit is out of scope.

## 9. Error handling

| Case | Behavior |
| --- | --- |
| Create with no included fields | 400 |
| Create with no roles | 400 |
| Create missing `expires_on` | 400 |
| Unknown field name | 400 |
| Verify without UserDVR | Existing not-found UX |
| Mark verified with required empty | 400 with field errors |
| Expired + pending | No banner; verify allowed |

## 10. Testing

### Backend

- Create snapshots matching roles; creates zero email/DVR-email tasks.
- Defaults/acceptance of `expires_on` and object-shaped `fields`.
- Banner eligibility helpers/filters: pending+unexpired yes; verified no; expired no.
- Required-field enforcement on verify/status transition.
- Legacy string `fields` coercion or migration.

### Frontend

- Create defaults (fields, staff roles, +7d).
- Success copy-URL affordance.
- Banner visibility for pending unexpired; hidden when verified/expired.
- Verify form required vs optional included fields.

## 11. Migration / rollout

1. Add `expires_on` (nullable initially if needed for deploy safety; backfill existing rows to a far-future or created_at+7; then require on new creates).
2. Migrate `fields` string arrays → object arrays.
3. Ship FE create/banner/verify updates with API.
4. Remove email task enqueue from create (leave task worker code harmless if other callers exist; if only DVR used it, can delete in same change set).

## 12. Open implementation notes (non-blocking)

- Exact “today” timezone: follow existing tenant date conventions in the codebase.
- Whether mark-verified validation lives on UserDVR update, a dedicated action, or user-update hook — prefer the path the verify page already uses, with server enforcement added there.
- Completion counts on detail: aggregate query or annotated list — choose cheapest existing pattern.
