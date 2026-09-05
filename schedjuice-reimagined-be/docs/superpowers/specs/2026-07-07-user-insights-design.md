# User Insights + Course Insights Rename

**Date:** 2026-07-07  
**Status:** Design approved, pending spec review  
**Scope:** `schedjuice-reimagined-fe`, `schedjuice-reimagined-be`

## Problem

1. **Naming:** The "Course data health" shortcut name no longer fits its broader purpose. It should be **Course insights**.

2. **Duplicate student accounts:** Students sometimes end up with multiple Schedjuice accounts because imports or manual entry linked the wrong person — especially when siblings share a family phone or secondary email (see [import wizard name-mismatch spec](./2026-07-07-import-wizard-name-mismatch-warning-design.md)). Admins have no school-wide view to find these clusters, understand *why* they were flagged, or merge accounts without losing data.

## Goals / Non-Goals

### Goals

- Rename **Course data health** → **Course insights** (title + URL). Delete the old route entirely (no redirect).
- Add **User insights** shortcut at `/shortcuts/user-insights` with a tabbed shell; v1 ships **Potential duplicates** tab only.
- Detect **transitive clusters** of students sharing contact identifiers (phone, communication email, emergency contact phone).
- Show **match reasons** per cluster and a **possible siblings** flag when names differ on a secondary-field link.
- Batch-fetch **Microsoft last sign-in** (Graph `signInActivity`, not Schedjuice `last_login`) for users in visible clusters on page load.
- Let admins **merge** cluster members: choose survivor, primary email, and which `microsoft_id` to keep; default recommendation = most recently MS-active account.
- **No data loss** on merge — reassign all related records; fill blank survivor fields from absorbed users.

### Non-Goals

- No redirect from `/shortcuts/course-data-health` to the new URL.
- No staff users in duplicate scan (students only).
- No dismiss/ignore cluster (merged clusters disappear naturally).
- No fuzzy name matching for sibling detection (strict normalized equality, same as import wizard).
- No MS sign-in caching/TTL in v1 (live batch fetch on page load).
- No additional User Insights tabs in v1 (shell only).

## Decisions Captured (from brainstorming)

| Question | Decision |
|---|---|
| Course rename scope | Title **and** URL → `/shortcuts/course-insights`; delete old page; **no redirect** |
| Duplicate tab audience | **Students only** |
| Cluster grouping | **Transitive** connected components (union-find) |
| Actions | **Merge** with admin-chosen primary email + `microsoft_id` |
| Default merge recommendation | Keep account with most recent **MS** last sign-in |
| Data on merge | **No data loss** — full reassignment + scalar backfill |
| Access gate | Same as Course Insights (`course.view_all` / `course.manage_all`) |
| MS sign-in fetch | **On page load**, batch for all users in visible clusters |
| Student filter | **Active only** by default; toggle to include inactive |
| Implementation approach | **Approach 1** — live scan + merge service (no precomputed cache) |

## Part A — Course Insights Rename

### Route & naming

| Before | After |
|---|---|
| Title: "Course data health" | **"Course insights"** |
| URL: `/shortcuts/course-data-health` | **`/shortcuts/course-insights`** |
| FE folder: `course-data-health/` | **`course-insights/`** |
| Query key: `courseDataHealth` | **`courseInsights`** |
| Types/helpers: `course-data-health.ts` | **`course-insights.ts`** |

### Delete old route

- Remove `src/app/(internal)/shortcuts/course-data-health/page.tsx` (do not leave a redirect).
- Remove `COURSE_DATA_HEALTH_SHORTCUT_HREF` references; replace with `COURSE_INSIGHTS_SHORTCUT_HREF`.
- Update `shortcuts-tools.ts`, `route-permissions.ts`, changelog `entries.ts`, screenshot scripts.
- Backend: rename URL `course-data-health-search` → `course-insights-search` and view/service module names for consistency.

### Behavior

Unchanged functionally — only naming, paths, and copy ("data health" → "insights" in user-visible strings).

---

## Part B — User Insights Shortcut

### Shell

- **URL:** `/shortcuts/user-insights`
- **Shortcut tile:** title "User insights", description e.g. "Find duplicate student accounts and review user data quality."
- **Icon:** `UserSearch` (distinct from Course Insights `ClipboardList`)
- **Tabs:** URL-driven via `nuqs` — `?tab=duplicates` (default). Tab bar renders even with one tab so future tabs drop in without layout changes.
- **Access:** `hasSchoolWideCourseAccess` on FE; `course.view_all` on search endpoints. Merge requires `course.manage_all`.

### Tab: Potential duplicates

#### Detection scope

- **Role filter:** `student` in `roles` array.
- **Active filter:** `is_active=True` by default. Query param `include_inactive=true` includes deactivated students.
- **Matching keys** (reuse normalization from `app_auth/import_user_match.py`):

| Key | DB field |
|---|---|
| `phone` | `phone_number_digits` (non-empty) |
| `communication_email` | normalized `communication_email` (non-empty, distinct from primary when applicable) |
| `emergency_phone` | `emergency_contact_phone_number_digits` (non-empty) |

Primary `email` is excluded — unique constraint prevents duplicate-email clusters.

Empty normalized keys are skipped (no clustering on blank phones/emails).

#### Clustering algorithm

1. Load candidate students matching scope filters.
2. Build edges: for each matching key value shared by 2+ students, connect all pairs (or use union-find keyed by `(key_type, normalized_value)`).
3. Output **connected components** with ≥ 2 members.
4. Stable `cluster_id`: hash of sorted member user IDs (e.g. SHA256 truncated).

Implementation lives in `app_auth/user_insights_services.py` — `build_duplicate_clusters(filters)`.

#### Match reasons

Each cluster includes `match_reasons[]`:

```json
{
  "field": "phone",
  "label": "Shared phone",
  "normalized_value": "959123456789",
  "user_ids": [101, 102]
}
```

A cluster may have multiple reasons (e.g. shared phone *and* shared comm email).

#### Sibling flag

For each edge between two users linked by a **secondary** key (`phone`, `communication_email`, `emergency_phone`):

```python
def normalize_name(name: str) -> str:
    return " ".join(name.strip().lower().split())
```

- If `normalize_name(user_a.name) != normalize_name(user_b.name)` → edge is `possible_sibling: true`.
- Cluster `possible_siblings: true` if **any** edge in the cluster is sibling-flagged.
- Same-name + shared phone → duplicate signal only, **no** sibling badge.

Aligns with [import wizard name-mismatch spec](./2026-07-07-import-wizard-name-mismatch-warning-design.md).

#### Search API

`POST /users/insights/duplicates/search`

**Permission:** `course.view_all`

**Body:**

```json
{
  "q": "optional name/email search",
  "include_inactive": false,
  "page": 1,
  "size": 25
}
```

**Response:**

```json
{
  "data": {
    "summary": {
      "cluster_count": 12,
      "sibling_flagged_count": 4,
      "student_count": 28
    },
    "results": [
      {
        "cluster_id": "abc123",
        "possible_siblings": true,
        "users": [
          {
            "id": 101,
            "name": "Mi Pakao Htaw",
            "email": "mi@school.edu",
            "communication_email": "family@gmail.com",
            "phone_number": "+959...",
            "microsoft_id": "uuid-1",
            "is_active": true
          }
        ],
        "match_reasons": [
          {
            "field": "phone",
            "label": "Shared phone",
            "normalized_value": "959123456789",
            "user_ids": [101, 102],
            "possible_sibling": true
          }
        ]
      }
    ]
  },
  "page": 1,
  "size": 25,
  "count": 12
}
```

`q` filters clusters where any member's name, email, or communication_email contains the query (case-insensitive).

---

## Part C — Microsoft Last Sign-In API

`POST /users/microsoft-sign-in-activity`

**Permission:** `course.view_all`

**Body:** `{ "user_ids": [101, 102, ...] }` (max 50 per request; FE batches if needed)

**Behavior:**

- No-op / empty map when `tenant.is_microsoft_on` is false.
- For users with non-null `microsoft_id`, batch Graph calls:
  - `GET https://graph.microsoft.com/v1.0/users/{microsoft_id}?$select=signInActivity`
  - Read `signInActivity.lastSignInDateTime` (nullable).
- Verify required Graph permission at implementation (`AuditLog.Read.All` or equivalent for `signInActivity`).
- Transient Graph errors: return partial results + per-user error entries; do not fail the whole batch.

**Response:**

```json
{
  "data": {
    "101": { "last_sign_in": "2026-07-01T10:30:00Z" },
    "102": { "last_sign_in": null, "error": "not_linked" }
  }
}
```

**FE:** Called in parallel with duplicate search on page load for all user IDs in the current page of results. Column hidden when MS integration is off.

**Default survivor recommendation:** user with latest non-null `last_sign_in`; tie-break by enrollment count desc, then lower user id.

---

## Part D — Merge Flow

### Endpoints

| Endpoint | Permission | Purpose |
|---|---|---|
| `POST /users/insights/merge/preview` | `course.manage_all` | Dry-run reassignment plan |
| `POST /users/insights/merge/apply` | `course.manage_all` | Execute merge in one transaction |

### Request shape (preview & apply)

```json
{
  "cluster_id": "abc123",
  "survivor_user_id": 101,
  "primary_email": "mi@school.edu",
  "microsoft_id": "uuid-1",
  "absorbed_user_ids": [102, 103]
}
```

Validation:

- All IDs are members of the cluster and students.
- `survivor_user_id` not in `absorbed_user_ids`.
- `primary_email` is one of the distinct emails across cluster members and unique in tenant (excluding absorbed users).
- `microsoft_id` is one of the non-null `microsoft_id` values in the cluster, or `null` if none chosen.
- `absorbed_user_ids` must cover all other cluster members (full cluster merge in v1 — no partial merge).

### UI — merge sheet

Opened from cluster row **Review merge** action.

1. Member table with MS last sign-in, enrollment count, payment count.
2. Pre-filled from recommendation (most recent MS sign-in).
3. Admin overrides: survivor radio, primary email select, Microsoft account select.
4. **Preview** → shows reassignment summary.
5. **Confirm merge** → apply; toast success; invalidate duplicate search query.

Destructive confirmation dialog required before apply.

### Preview response

```json
{
  "data": {
    "survivor_user_id": 101,
    "absorbed_user_ids": [102],
    "reassignments": {
      "user_courses": 3,
      "user_events": 45,
      "user_payments": 2,
      "join_requests": 0
    },
    "enrollment_conflicts": [
      { "course_id": 55, "course_title": "Math 101", "resolution": "keep_survivor_roster" }
    ],
    "scalar_backfills": ["phone_number", "communication_email"],
    "warnings": [
      "MS account for user 102 will be unlinked from Schedjuice."
    ]
  }
}
```

### Apply rules (no data loss)

Execute in a **single database transaction**. Order:

1. **Set survivor scalars** — apply chosen `email` and `microsoft_id`; backfill empty survivor fields from absorbed users (phone, communication_email, emergency contact, custom data, profile text fields, etc.).
2. **Enrollment conflicts** — when both survivor and absorbed have `UserCourse` on same course: keep survivor's row; reassign `UserEvent` rows from absorbed enrollment to survivor's enrollment; merge attendance without deleting history.
3. **Reassign FKs** — update all models referencing absorbed user ids. Minimum set (extend via audit at implementation):

   - `UserCourse`, `UserEvent` (attendance)
   - `UserPayment`, `EnrollmentDiscount`
   - `CourseJoinRequest`
   - `QuizAttempt` / quiz v3 attempts, grading report students
   - `ChatThreadParticipant`, announcement authors where applicable
   - Telegram link rows, building checkins
   - Any other `ForeignKey` to `User` discovered via model audit

4. **Unique constraints** — before reassign, handle conflicts (e.g. duplicate `UserCourse`): merge rows, don't insert duplicates.
5. **Audit log** — record merge: actor, survivor id, absorbed ids, chosen email/ms id, timestamp.
6. **Delete absorbed users** — hard delete after all FKs moved; trigger existing MS cleanup task (`DELETE_USER`) for unlinked `microsoft_id` values.

If any step would cause data loss or unhandled conflict, preview must surface it and apply must abort with 400.

### Microsoft account selection

- Admin explicitly picks which `microsoft_id` the survivor keeps.
- Non-selected MS accounts are unlinked from Schedjuice (absorbed users deleted); preview warns that Entra cleanup may be manual.
- If only one linked MS account exists, pre-select it.

---

## Part E — Frontend Structure

```
src/
  app/(internal)/shortcuts/
    course-insights/page.tsx          # renamed from course-data-health
    user-insights/page.tsx            # new tabbed shell
  components/
    course-insights/                  # renamed from course-data-health/
    user-insights/
      user-insights-tabs.tsx
      duplicate-clusters-table.tsx
      duplicate-cluster-expand.tsx
      user-merge-sheet.tsx
  types/user-insights.ts
  helpers/user-insights.ts            # labels, normalizeName (shared w/ import wizard pattern)
```

### Duplicate clusters table

| Column | Content |
|---|---|
| Students | Count + names (collapsed); full list when expanded |
| Reasons | Badges per `match_reasons` |
| Siblings | Amber "Possible siblings" when `possible_siblings` |
| MS activity | Per-user in expanded section |
| Actions | Review merge |

**Filters:** search (`q`), include inactive toggle.

### Route permissions

```typescript
{ prefix: "/shortcuts/course-insights", anyOf: ["course.view_all", "course.manage_all"] },
{ prefix: "/shortcuts/user-insights", anyOf: ["course.view_all", "course.manage_all"] },
```

---

## Part F — Testing

### Backend (`app_auth/tests/test_user_insights.py`)

- Union-find: three users transitive cluster; two isolated pairs.
- Sibling flag: different names on shared phone → true; same names → false.
- `include_inactive` filter.
- `q` search narrows clusters.
- Merge preview: enrollment conflict resolution, reassignment counts.
- Merge apply integration: two students, shared phone, enrollments on different courses → single survivor with all `UserCourse` rows.
- MS sign-in batch: mock Graph, partial failure handling.

### Frontend

- Course insights rename: shortcut tile, new URL loads, old URL 404.
- User insights: tab default, expand cluster, merge sheet defaults from MS activity.
- MS column hidden when tenant MS off.

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Graph rate limits on batch sign-in | Cap batch size 50; parallel only for current page |
| Merge misses a FK relation | Model audit checklist in implementation plan; integration test with factory graph |
| Large tenant scan slow | Paginate clusters; index on `phone_number_digits`, `communication_email` already present |
| Wrong survivor chosen | Preview step + MS activity recommendation + confirmation dialog |

## Related Specs

- [Import wizard name-mismatch warning](./2026-07-07-import-wizard-name-mismatch-warning-design.md) — sibling name comparison rules
- Course data health UX spec (existing) — table/filter patterns to mirror for Course Insights rename
