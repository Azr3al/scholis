# Calendar overlap one-click fix — design

**Status:** agreed (2026-07-05)  
**Repos:** `schedjuice-reimagined-be`, `schedjuice-reimagined-fe`  
**Route:** Course schedule calendar (edit page, create flow with calendar)  
**Builds on:** `docs/superpowers/specs/2026-07-04-overlapping-sessions-fix-design.md`

## Context

Overlap **prevention** and a **data-health fix** (preview → apply) already exist. The calendar editor also blocks overlaps client-side and on save, but only shows an error — users must manually find and remove duplicate sessions.

Deleting persisted sessions that have check-in records is blocked by `CourseEventEditView` unless attendance is merged first (the data-health fix does this via `overlap_fix_services`). A naive client-side “mark deleted in draft” fix still fails on Save for those sessions.

This spec adds a **one-click fix** at every overlap detection point in the calendar editor, with attendance-safe merging and no N+1 queries.

## Goals

1. **Fix overlaps** button wherever the calendar editor detects overlaps: Save bar, event add/edit form, bulk-times dialog.
2. **Context-dependent survivor rules:**
   - Form add/edit: the session being added or edited wins.
   - Save / bulk-times: global attendance-aware rules (same as data-health fix).
3. **Never lose attendance** — merge all `UserEvent` fields and move `DailyNote` when needed (reuse existing merge semantics).
4. **Hybrid execution:**
   - All-draft clusters → client-only (remove duplicates from draft).
   - Any persisted event in cluster → immediate backend merge + delete in one transaction.
   - New draft survivor + persisted duplicates → defer merge via `overlap_merges` on next Save.
5. **Batch merge refactor** — eliminate per-user `get_or_create` N+1 in `overlap_fix_services` (benefits data-health fix too).
6. Backend and frontend tests for resolve endpoint, deferred merge on save, and calendar helper.

## Non-goals

- Intake wizard / intake slot overlap fix (separate surface).
- Time-nudging overlaps apart instead of removing duplicates.
- Per-cluster manual survivor picker.
- Auto-save after fix (user still clicks Save for remaining draft changes).
- Bulk fix across multiple courses.
- Changing overlap detection heuristics.

## Decisions

| # | Decision |
| --- | --- |
| 1 | **Approach:** dedicated `resolve-overlaps` endpoint + shared FE helper (not data-health endpoints) |
| 2 | **Scope:** calendar editor only — Save bar, event form, bulk-times dialog |
| 3 | **Fix outcome:** remove duplicates, keep one survivor per cluster; user Saves separately |
| 4 | **Form survivor:** session being added/edited wins (`pin_survivor`) |
| 5 | **Save/bulk survivor:** global rules — marked students → check-ins → earliest `time_from` → lowest id |
| 6 | **Hybrid timing:** all-draft → client-only; persisted involved → immediate API merge |
| 7 | **Deferred merge:** new draft survivor + persisted sources → `overlap_merges` on `edit-events` Save |
| 8 | **Merge queries:** batch load UserEvents; `bulk_create` / `bulk_update`; no per-user loops |
| 9 | **Permissions:** `course.manage_content` + `check_course_write` (same as schedule edit) |

---

## Part A — Resolution algorithm

### Cluster detection

Reuse existing half-open interval logic (`[time_from, time_to)`), connected components per org-local calendar day:

- **Backend:** `app_course/event_overlap.find_overlap_clusters`
- **Frontend:** extract shared `findOverlapClusters(flatEvents)` into `src/helpers/calendar.ts` (mirror backend; week-view already has equivalent logic)

### Survivor selection

| Mode | When | Rule |
| --- | --- | --- |
| `auto_global` | Save blocked, bulk-times error, backend save overlap fallback | Server picks survivor per cluster using `_pick_survivor` (attendance-aware) |
| `pin_survivor` | Event form add/edit overlap | Client sends the session being added/edited as survivor; all other cluster members are removed |

For `auto_global`, the server simulates the full draft schedule (same approach as `validate_simulated_course_event_edit`) so unsaved time changes participate in cluster detection.

### Execution path per cluster

```
Cluster detected
├── All members are draft (id contains "new")
│   └── Client-only: mark non-survivors is_deleted or remove from draft list
├── Survivor is persisted AND at least one removed event is persisted
│   └── Immediate API: merge UserEvents → survivor, move DailyNote, delete duplicates (one transaction)
└── Survivor is draft AND removed include persisted
    └── Client: mark persisted removed as is_deleted, keep survivor in draft
        └── On Save: edit-events overlap_merges → create survivor → merge sources → delete sources
```

### Merge semantics (unchanged from data-health fix)

- **Per-user:** best record wins — `checkin_time` set > present/late > absent > unregistered; copy all fields in `MERGE_FIELDS`.
- **DailyNote:** if survivor has none, reassign duplicate’s note; if both exist, keep survivor’s.

---

## Part B — Backend

### New endpoint

`POST /api/v1/courses/{course_id}/schedule/resolve-overlaps`

**Permissions:** `course.manage_content`; `check_course_write(user, course)`.

#### Request — auto_global

```json
{
  "mode": "auto_global",
  "draft_events": []
}
```

`draft_events` is the current flat draft list (same event shape as `edit-events`). Server simulates schedule, finds clusters, picks survivors, applies immediate merges for clusters touching persisted events, returns client-side deletes for all-draft clusters.

#### Request — pin_survivor

```json
{
  "mode": "pin_survivor",
  "draft_events": [],
  "survivor": { "draft_id": "new-abc" },
  "local_date": "2026-07-01",
  "remove_event_ids": [101],
  "remove_draft_ids": ["new-xyz"]
}
```

Server validates that survivor + removals form a valid overlap cluster on `local_date`. Reject with 400 if plan does not match an actual cluster.

#### Response

```json
{
  "data": {
    "client_deletes": ["new-xyz"],
    "deferred_merges": [
      { "survivor_draft_id": "new-abc", "source_event_ids": [101] }
    ],
    "applied": {
      "events_removed": [102],
      "events_kept": [103],
      "users_merged_count": 5
    },
    "events": []
  }
}
```

- `client_deletes`: draft ids the FE should remove/mark deleted locally.
- `deferred_merges`: persisted sources that cannot merge until draft survivor is created on Save.
- `applied`: summary of DB work done immediately (empty when none).
- `events`: refreshed serialized persisted events for the course (FE reconciles draft state).

When no overlaps remain: return success with empty arrays and `applied.events_removed: []`.

### Extend CourseEventEditView

Optional top-level field on the existing save payload:

```json
{
  "overlap_merges": [
    { "survivor_draft_id": "new-abc", "source_event_ids": [101, 102] }
  ],
  "course": {},
  "events": []
}
```

**Order of operations** (within existing transaction, after validation):

1. Run `validate_simulated_course_event_edit` on the post-merge simulated schedule (must have zero overlaps).
2. Create new events (including survivors referenced by `overlap_merges`).
3. For each merge entry: resolve `survivor_draft_id` → created event id; call batch merge; delete source events (skip check-in delete guard — merge already ran).
4. Continue normal update/delete/create flow for remaining events.

### Merge refactor (no N+1)

Refactor `overlap_fix_services` so `_merge_cluster_user_events` and `build_overlap_fix_preview` use batched queries:

| Step | Queries |
| --- | --- |
| Load UserEvents for all cluster event ids | 1× `filter(event_id__in=...)` |
| Compute best row per user in memory | 0 |
| Create missing survivor UserEvents | 1× `bulk_create` |
| Update changed survivor UserEvents | 1× `bulk_update` |
| Delete duplicate events | 1× `filter(id__in=...).delete()` |

Extract `merge_cluster_user_events_batch(cluster, survivor, user_events_by_event) -> int` and use it from:

- `apply_overlap_fix` (data-health)
- `resolve-overlaps` view
- `CourseEventEditView` deferred merge handler

**Preview fix:** in `build_overlap_fix_preview`, load UserEvents for all event ids across all clusters in one query before the cluster loop (eliminates per-cluster reload).

### URL registration

Add route under `app_course/urls.py` course-scoped paths, adjacent to `edit-events`.

---

## Part C — Frontend

### Shared helper

`src/helpers/calendar-overlap-resolve.ts`:

```typescript
resolveScheduleOverlaps({
  courseId,
  flatEvents,
  mode: "auto_global" | "pin_survivor",
  pinSurvivor?: { draftId?: string; eventId?: number; localDate: string; ... },
}): Promise<ResolveResult>
```

Steps:

1. Detect clusters locally (instant validation).
2. Partition into client-only / immediate-backend / deferred-merge.
3. `POST schedule/resolve-overlaps` for backend work.
4. Apply `client_deletes` to calendar state; store `deferred_merges` in calendar context.
5. Return summary for toast.

Types in `src/types/course-schedule.ts` (or extend `course.ts`).

API helper in `src/helpers/course-schedule.ts`.

### Detection points

| Location | File | Trigger | Fix call |
| --- | --- | --- | --- |
| Save bar | `calendar.tsx` | `hasOverlappingEventsInFlatList` | `auto_global` |
| Event form | `event-form.tsx` | `findOverlappingEventOnDate` / recurring | `pin_survivor` with pending form values |
| Bulk times | `calendar-menu.tsx` | simulated list overlaps | `auto_global` on simulated list |
| Save error fallback | `calendar.tsx` `onError` | 400 with `details.conflicts` | `auto_global` retry |

### UX

- **Save bar:** inline banner above Save when overlaps exist — message + primary **Fix overlaps** button (replace destructive-only toast).
- **Event form:** below overlap error — link **Replace conflicting session** (calls `pin_survivor`, then adds/edits the session on success).
- **Bulk times:** **Fix overlaps** button beside error text.
- **Loading:** disable fix button while request in flight.
- **Success toast:** `"Removed N duplicate session(s)."` Append `"M attendance records preserved."` when `users_merged_count > 0`.
- **Deferred hint:** when `deferred_merges` pending, Save bar note: `"Some attendance will merge when you save."`
- **Permissions:** hide fix actions when user lacks schedule write (same check as calendar edit mode).

### Calendar context

Add to `calendar-context`:

- `pendingOverlapMerges: OverlapMergeEntry[]`
- `setPendingOverlapMerges`
- Include `overlap_merges` in Save mutation payload when non-empty; clear after successful save.

---

## Part D — Error handling

| Case | Behavior |
| --- | --- |
| Fix clicked, no overlaps | Toast: `"No overlapping sessions."` |
| API failure | Error toast; draft unchanged |
| Invalid pin_survivor plan | 400 from server; show message |
| Recurring add overlaps multiple dates | Form fix handles first conflict date; user may need Save-bar global fix for remainder |
| 3+ events in one cluster | One survivor, rest removed (transitive clusters) |
| Race: Save returns overlap 400 | Parse conflicts; offer Fix in error toast |

---

## Part E — Testing

### Backend — `app_course/tests/test_schedule_resolve_overlaps.py`

| Case | Expect |
| --- | --- |
| auto_global, all-draft clusters | `client_deletes` populated; no DB deletes |
| auto_global, persisted cluster with attendance on duplicate | survivor has merged UserEvents; duplicate deleted |
| pin_survivor, persisted survivor | merge removed → survivor; delete removed |
| pin_survivor, draft survivor + persisted removed | `deferred_merges` returned; no immediate delete of sources |
| edit-events with overlap_merges | creates draft survivor, merges check-in from source, deletes source |
| Invalid cluster plan | 400 |

### Backend — merge batch refactor

| Case | Expect |
| --- | --- |
| assertNumQueries budget on merge 10 users × 2 events | ≤ fixed query count (no N+1) |
| checkin copied to survivor | same as existing overlap_fix tests |

### Frontend — `src/helpers/calendar-overlap-resolve.test.ts`

| Case | Expect |
| --- | --- |
| all-draft cluster partition | client-only, no API call |
| persisted cluster | API called |
| draft survivor + persisted removed | deferred merge stored |

### Manual checklist

1. Course edit → create overlapping sessions via bulk times → Fix overlaps → Save succeeds.
2. Add session overlapping existing marked session → Replace conflicting session → attendance on saved session after Save.
3. Week view overlap highlighting clears after fix.
4. Data-health fix still works (regression on refactored merge).

---

## Files (expected)

### Backend

| File | Change |
| --- | --- |
| `app_course/overlap_fix_services.py` | Batch merge; shared `merge_cluster_user_events_batch` |
| `app_course/views.py` | `ScheduleResolveOverlapsView`; `overlap_merges` in `CourseEventEditView` |
| `app_course/urls.py` | Route registration |
| `app_course/tests/test_schedule_resolve_overlaps.py` | New |
| `app_course/tests/test_overlap_fix.py` | Query budget / regression |

### Frontend

| File | Change |
| --- | --- |
| `src/helpers/calendar.ts` | Export `findOverlapClusters` |
| `src/helpers/calendar-overlap-resolve.ts` | New resolve helper |
| `src/helpers/course-schedule.ts` | API helper |
| `src/types/course-schedule.ts` | Request/response types |
| `src/components/calendar/calendar.tsx` | Save banner, overlap_merges on save |
| `src/components/calendar/calendar-context.tsx` | pendingOverlapMerges state |
| `src/components/calendar/event-form.tsx` | Replace conflicting session |
| `src/components/calendar/calendar-menu.tsx` | Bulk-times fix button |
| `src/helpers/calendar-overlap-resolve.test.ts` | New |

---

## Related docs

- Overlap fix + prevention: `docs/superpowers/specs/2026-07-04-overlapping-sessions-fix-design.md`
- Implementation plan (prior): `docs/superpowers/plans/2026-07-04-overlapping-sessions-fix.md`
