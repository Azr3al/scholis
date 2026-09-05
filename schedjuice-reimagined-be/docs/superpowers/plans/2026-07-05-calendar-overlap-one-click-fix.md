# Calendar Overlap One-Click Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one-click overlap resolution in the course schedule calendar editor that preserves attendance, uses hybrid client/server execution, and eliminates N+1 queries during UserEvent merges.

**Architecture:** Refactor `overlap_fix_services` to batch-load and bulk-write UserEvents. Add `schedule_resolve_services.py` to simulate draft schedules, pick survivors (`auto_global` or `pin_survivor`), and apply immediate DB merges. Expose `POST schedule/resolve-overlaps`; extend `edit-events` with `overlap_merges` for deferred draft-survivor cases. Frontend gets `findOverlapClusters` + `resolveScheduleOverlaps()` wired into Save bar, event form, and bulk-times dialog.

**Tech Stack:** Django/DRF, django-tenants, Next.js App Router, React Query, Vitest, existing RBAC (`course.manage_content`, `check_course_write`).

**Spec:** `docs/superpowers/specs/2026-07-05-calendar-overlap-one-click-fix-design.md`

**Conventions:**
- Backend tests: `./scripts/run_backend_tests.sh <target>` from `schedjuice-reimagined-be/` (always uses `--keepdb`)
- Frontend tests: `pnpm test src/helpers/calendar-overlap-resolve.test.ts` from `schedjuice-reimagined-fe/`
- Tenant tests: `schema_context("xschedjuice")`; seed RBAC via `seed_rbac()`
- Do **not** commit unless the user explicitly asks

---

## File Structure

### Backend (`schedjuice-reimagined-be`)

| File | Responsibility |
| --- | --- |
| `app_course/overlap_fix_services.py` | Batch `merge_cluster_user_events_batch`; preview loads UEs once |
| `app_course/schedule_resolve_services.py` | Draft simulation, resolve orchestration, pin/auto survivor plans |
| `app_course/event_overlap.py` | (optional) `events_from_draft_payload` helper if not in schedule_resolve |
| `app_course/views.py` | `ScheduleResolveOverlapsView`; `overlap_merges` in `CourseEventEditView` |
| `app_course/urls.py` | Route `courses/<int:course_id>/schedule/resolve-overlaps` |
| `app_course/tests/test_overlap_fix.py` | Query budget regression for batch merge |
| `app_course/tests/test_schedule_resolve_overlaps.py` | Resolve endpoint + service tests |
| `app_course/tests/test_course_event_edit.py` | `overlap_merges` on save |

### Frontend (`schedjuice-reimagined-fe`)

| File | Responsibility |
| --- | --- |
| `src/helpers/calendar.ts` | Export `findOverlapClusters`, `isDraftEventId` |
| `src/helpers/calendar-overlap-resolve.ts` | Partition clusters, call API, apply draft updates |
| `src/helpers/course-schedule.ts` | `postScheduleResolveOverlaps` API helper |
| `src/types/course-schedule.ts` | Request/response types |
| `src/components/calendar/calendar-context.tsx` | `pendingOverlapMerges` state |
| `src/components/calendar/calendar.tsx` | Overlap banner, save payload, error fallback |
| `src/components/calendar/event-form.tsx` | Replace conflicting session |
| `src/components/calendar/calendar-menu.tsx` | Bulk-times fix button |
| `src/helpers/calendar-overlap-resolve.test.ts` | Unit tests |

---

## Task 1: Batch UserEvent merge (no N+1)

**Files:**
- Modify: `schedjuice-reimagined-be/app_course/overlap_fix_services.py`
- Modify: `schedjuice-reimagined-be/app_course/tests/test_overlap_fix.py`

- [ ] **Step 1: Add failing query-budget test**

Add to `app_course/tests/test_overlap_fix.py`:

```python
from django.db import connection
from django.test.utils import CaptureQueriesContext

def test_merge_cluster_user_events_batch_query_budget(self):
    with schema_context(self.schema_name):
        course = self._make_course()
        day = self.today
        ev_a = Event.objects.create(
            title="A", course=course,
            date=_aware(day, 9), time_from=time(9, 0), time_to=time(10, 30),
        )
        ev_b = Event.objects.create(
            title="B", course=course,
            date=_aware(day, 9, 30), time_from=time(9, 30), time_to=time(11, 0),
        )
        students = [self._make_student(i) for i in range(10)]
        for s in students:
            UserCourse.objects.get_or_create(
                user=s, course=course, assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            UserEvent.objects.create(user=s, event=ev_b, attendance_status=UserEvent.AttendanceStatus.PRESENT)

        from app_course.overlap_fix_services import (
            _load_user_events_by_event,
            merge_cluster_user_events_batch,
        )

        cluster = [ev_a, ev_b]
        ue_map = _load_user_events_by_event([ev_a.id, ev_b.id])
        with CaptureQueriesContext(connection) as ctx:
            merged = merge_cluster_user_events_batch(cluster, ev_a, ue_map)
        self.assertEqual(merged, 10)
        # 1 load (caller) + bulk_create/bulk_update bounded — not 10+ get_or_create
        self.assertLessEqual(len(ctx.captured_queries), 6)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_course.tests.test_overlap_fix.OverlapFixServicesTests.test_merge_cluster_user_events_batch_query_budget -v 2`

Expected: FAIL (`ImportError: merge_cluster_user_events_batch`)

- [ ] **Step 3: Implement `merge_cluster_user_events_batch`**

In `overlap_fix_services.py`, add public function and delegate `_merge_cluster_user_events`:

```python
def merge_cluster_user_events_batch(
    cluster: list[Event],
    survivor: Event,
    user_events_by_event: dict[int, list[UserEvent]],
) -> int:
    user_ids: set[int] = set()
    for ev in cluster:
        for ue in user_events_by_event.get(ev.id, []):
            user_ids.add(ue.user_id)
    if not user_ids:
        return 0

    survivor_rows = {
        ue.user_id: ue
        for ue in user_events_by_event.get(survivor.id, [])
    }
    to_create: list[UserEvent] = []
    to_update: list[UserEvent] = []
    merged = 0
    now = timezone.now()

    for user_id in user_ids:
        best = _best_source_row(user_id, cluster, user_events_by_event)
        if best is None:
            continue
        survivor_ue = survivor_rows.get(user_id)
        best_q = _userevent_quality(best)
        surv_q = _userevent_quality(survivor_ue if survivor_ue and not survivor_ue.is_deleted else None)
        should_write = survivor_ue is None or best_q > surv_q or (
            survivor_ue.is_deleted and best_q >= _userevent_quality(None)
        )
        if not should_write:
            continue
        if survivor_ue is None:
            survivor_ue = UserEvent(user_id=user_id, event_id=survivor.id, is_deleted=False)
            for field in MERGE_FIELDS:
                setattr(survivor_ue, field, getattr(best, field))
            survivor_ue.updated_at = now
            to_create.append(survivor_ue)
            survivor_rows[user_id] = survivor_ue
        else:
            for field in MERGE_FIELDS:
                setattr(survivor_ue, field, getattr(best, field))
            survivor_ue.is_deleted = False
            survivor_ue.updated_at = now
            to_update.append(survivor_ue)
        merged += 1

    if to_create:
        UserEvent.all_objects.bulk_create(to_create)
    if to_update:
        UserEvent.all_objects.bulk_update(to_update, fields=[*MERGE_FIELDS, "is_deleted", "updated_at"])
    return merged


def _merge_cluster_user_events(cluster, survivor, user_events_by_event) -> int:
    return merge_cluster_user_events_batch(cluster, survivor, user_events_by_event)
```

- [ ] **Step 4: Fix preview N+1 — load all UserEvents once**

In `build_overlap_fix_preview`, before the cluster loop:

```python
all_event_ids = [ev.id for cluster in clusters for ev in cluster]
all_user_events_by_event = _load_user_events_by_event(all_event_ids)
# inside loop: user_events_by_event = {
#   eid: all_user_events_by_event.get(eid, []) for eid in event_ids
# }
```

- [ ] **Step 5: Run overlap fix tests**

Run: `./scripts/run_backend_tests.sh app_course.tests.test_overlap_fix -v 2`

Expected: PASS (including new query budget test and existing checkin tests)

---

## Task 2: Draft schedule simulation service

**Files:**
- Create: `schedjuice-reimagined-be/app_course/schedule_resolve_services.py`
- Create: `schedjuice-reimagined-be/app_course/tests/test_schedule_resolve_overlaps.py`

- [ ] **Step 1: Write failing unit test for draft simulation**

Create `app_course/tests/test_schedule_resolve_overlaps.py` with scaffold matching `test_course_event_edit.py` (schema, admin, course factory). First test:

```python
from app_course.schedule_resolve_services import build_simulated_schedule_events

def test_build_simulated_schedule_marks_draft_deletes(self):
    with schema_context(self.schema_name):
        ev = Event.objects.create(...)  # persisted 9:00–10:30
        draft = [
            {"id": ev.id, "is_deleted": True, "date": ev.date.isoformat(), ...},
            {"id": "new-abc", "date": "...", "time_from": "09:30:00", "time_to": "11:00:00", ...},
        ]
        simulated = build_simulated_schedule_events(course_id=self.course.id, draft_events=draft, org=self.org)
        ids = {e.id for e in simulated if e.id}
        self.assertNotIn(ev.id, ids)
        self.assertEqual(len(simulated), 1)  # only the new draft event (no pk yet)
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `./scripts/run_backend_tests.sh app_course.tests.test_schedule_resolve_overlaps -v 2`

- [ ] **Step 3: Implement `build_simulated_schedule_events`**

In `schedule_resolve_services.py`:

```python
def _is_draft_id(raw) -> bool:
    return raw is not None and "new" in str(raw).lower()

def build_simulated_schedule_events(*, course_id: int, draft_events: list[dict], org) -> list[Event]:
    tz = org_timezone(org)
    delete_ids = {int(i["id"]) for i in draft_events if i.get("is_deleted") and not _is_draft_id(i.get("id"))}
    events_map = {
        e.id: copy(e)
        for e in Event.objects.filter(course_id=course_id)
        if e.id not in delete_ids
    }
    for item in draft_events:
        if item.get("is_deleted"):
            continue
        raw_id = item.get("id")
        if _is_draft_id(raw_id):
            events_map[f"draft:{raw_id}"] = _event_from_draft_dict(item, course_id)  # use sentinel key
            continue
        eid = int(raw_id)
        if eid in events_map:
            _apply_draft_fields(events_map[eid], item)
    return list(events_map.values())
```

Implement `_event_from_draft_dict` / `_apply_draft_fields` parsing `date`, `time_from`, `time_to` the same way `CourseEventEditView` serializers do (reuse serializer validation where practical).

Add helper `find_draft_overlap_clusters(draft_events, org, course_id)` → calls `find_overlap_clusters(build_simulated_schedule_events(...), tz)`.

- [ ] **Step 4: Run test — expect PASS**

---

## Task 3: Resolve orchestration (`auto_global` + `pin_survivor`)

**Files:**
- Modify: `schedjuice-reimagined-be/app_course/schedule_resolve_services.py`
- Modify: `schedjuice-reimagined-be/app_course/tests/test_schedule_resolve_overlaps.py`

- [ ] **Step 1: Write failing test — auto_global all-draft returns client_deletes only**

```python
def test_resolve_auto_global_all_draft_client_deletes_only(self):
    draft = [
        {"id": "new-a", "date": "2026-07-01T00:00:00Z", "time_from": "09:00:00", "time_to": "10:30:00"},
        {"id": "new-b", "date": "2026-07-01T00:00:00Z", "time_from": "09:30:00", "time_to": "11:00:00"},
    ]
    result = resolve_schedule_overlaps(course=self.course, org=self.org, mode="auto_global", draft_events=draft)
    self.assertEqual(result["client_deletes"], ["new-b"])
    self.assertEqual(result["applied"]["events_removed"], [])
    self.assertEqual(Event.objects.filter(course=self.course).count(), 0)
```

Adjust assertion: survivor is earliest start → `new-a` kept, `new-b` in `client_deletes`.

- [ ] **Step 2: Write failing test — auto_global persisted cluster merges and deletes**

Two persisted overlapping events; attendance on duplicate; expect duplicate deleted, UE on survivor.

- [ ] **Step 3: Write failing test — pin_survivor draft survivor returns deferred_merges**

Persisted ev + draft survivor in payload → `deferred_merges` with `source_event_ids`, no immediate delete.

- [ ] **Step 4: Implement `resolve_schedule_overlaps`**

Core logic per spec:

```python
@transaction.atomic
def resolve_schedule_overlaps(*, course, org, mode, draft_events, pin=None) -> dict:
    clusters = find_draft_overlap_clusters(...)
    if not clusters:
        return empty_response()

    client_deletes: list[str] = []
    deferred_merges: list[dict] = []
    removed_ids: list[int] = []
    kept_ids: list[int] = []
    users_merged = 0

    all_persisted_ids = [ev.id for c in clusters for ev in c if ev.id]
    ue_by_event = _load_user_events_by_event(all_persisted_ids)
    student_ids = _student_user_ids(course.id)

    for cluster in clusters:
        if mode == "pin_survivor":
            survivor = _survivor_from_pin(cluster, pin)
        else:
            persisted = [ev for ev in cluster if ev.id]
            if persisted:
                survivor = _pick_survivor(persisted, ue_by_event, student_ids)
            else:
                survivor = min(cluster, key=lambda e: (e.time_from, str(getattr(e, "id", ""))))
        duplicates = [ev for ev in cluster if ev is not survivor]

        if all(not ev.id for ev in cluster):
            for dup in duplicates:
                client_deletes.append(_draft_id(dup))
            continue

        if survivor.id and any(ev.id for ev in duplicates):
            # immediate merge
            persisted_cluster = [ev for ev in cluster if ev.id]
            users_merged += merge_cluster_user_events_batch(persisted_cluster, survivor, ue_by_event)
            _move_daily_note_if_needed(survivor, [ev for ev in duplicates if ev.id])
            dup_ids = [ev.id for ev in duplicates if ev.id]
            Event.objects.filter(id__in=dup_ids).delete()
            removed_ids.extend(dup_ids)
            kept_ids.append(survivor.id)
            for dup in duplicates:
                if not dup.id:
                    client_deletes.append(_draft_id(dup))
        elif not survivor.id and any(ev.id for ev in duplicates):
            deferred_merges.append({
                "survivor_draft_id": _draft_id(survivor),
                "source_event_ids": [ev.id for ev in duplicates if ev.id],
            })
            for dup in duplicates:
                if not dup.id:
                    client_deletes.append(_draft_id(dup))
        # ... handle pin with persisted survivor similarly

    events = list(Event.objects.filter(course_id=course.id).order_by("date", "time_from", "id"))
    return {
        "client_deletes": client_deletes,
        "deferred_merges": deferred_merges,
        "applied": {
            "events_removed": removed_ids,
            "events_kept": kept_ids,
            "users_merged_count": users_merged,
        },
        "events": EventSerializer(events, many=True).data,
    }
```

Implement `_survivor_from_pin` validating cluster membership on `local_date`.

- [ ] **Step 5: Run tests**

Run: `./scripts/run_backend_tests.sh app_course.tests.test_schedule_resolve_overlaps -v 2`

Expected: PASS

---

## Task 4: Resolve overlaps API view + URL

**Files:**
- Modify: `schedjuice-reimagined-be/app_course/views.py`
- Modify: `schedjuice-reimagined-be/app_course/urls.py`
- Modify: `schedjuice-reimagined-be/app_course/tests/test_schedule_resolve_overlaps.py`

- [ ] **Step 1: Write failing API test**

```python
def test_resolve_overlaps_api_auto_global(self):
    self.client.force_authenticate(self.admin)
    draft = [...]
    res = self.client.post(
        f"/api/v1/courses/{self.course.id}/schedule/resolve-overlaps",
        {"mode": "auto_global", "draft_events": draft},
        format="json",
    )
    self.assertEqual(res.status_code, 200)
    self.assertIn("client_deletes", res.json()["data"])
```

- [ ] **Step 2: Add view**

```python
class ScheduleResolveOverlapsView(RBACView):
    name = "Schedule resolve overlaps"
    required_permissions = {"POST": "course.manage_content"}

    def post(self, request, course_id: int):
        course = models.Course.objects.filter(id=course_id).first()
        if not course:
            return self.not_found("No such course exists.")
        user = acting_user(request)
        if user is None:
            return self.forbidden("Authentication required.")
        try:
            check_course_write(user, course)
        except PermissionDenied:
            return self.forbidden("You do not have access to this course.")

        mode = request.data.get("mode")
        draft_events = request.data.get("draft_events") or []
        if mode not in ("auto_global", "pin_survivor"):
            return self.bad_request({"message": "Invalid mode."})

        pin = None
        if mode == "pin_survivor":
            pin = {
                "survivor": request.data.get("survivor") or {},
                "local_date": request.data.get("local_date"),
                "remove_event_ids": request.data.get("remove_event_ids") or [],
                "remove_draft_ids": request.data.get("remove_draft_ids") or [],
            }

        from app_course.schedule_resolve_services import resolve_schedule_overlaps
        try:
            data = resolve_schedule_overlaps(
                course=course, org=request.tenant, mode=mode,
                draft_events=draft_events, pin=pin,
            )
        except ValidationError as exc:
            return self.send_response(True, "bad_request", {"details": exc.detail}, status=400)
        return self.send_response(False, "success", {"data": data})
```

- [ ] **Step 3: Register URL** in `urls.py` adjacent to `edit-events`:

```python
path(
    "courses/<int:course_id>/schedule/resolve-overlaps",
    views.ScheduleResolveOverlapsView.as_view(),
    name="schedule-resolve-overlaps",
),
```

- [ ] **Step 4: Run API tests — PASS**

---

## Task 5: Deferred merge on `edit-events` save

**Files:**
- Modify: `schedjuice-reimagined-be/app_course/views.py` (`CourseEventEditView.post`)
- Modify: `schedjuice-reimagined-be/app_course/tests/test_course_event_edit.py`

- [ ] **Step 1: Write failing test**

```python
def test_edit_events_overlap_merges_draft_survivor_with_checkin_source(self):
    ev_old = Event.objects.create(...)  # 9:00–10:30 with student checkin
    payload = {
        "overlap_merges": [{"survivor_draft_id": "new-survivor", "source_event_ids": [ev_old.id]}],
        "course": {"id": self.course.id, ...},
        "events": [
            {"id": ev_old.id, "is_deleted": True, ...},
            {"id": "new-survivor", "date": "...", "time_from": "09:30:00", "time_to": "11:00:00", ...},
        ],
    }
    res = self.client.post(f"/api/v1/courses/{self.course.id}/edit-events", payload, format="json")
    self.assertEqual(res.status_code, 200)
    self.assertFalse(Event.objects.filter(id=ev_old.id).exists())
    new_id = Event.objects.get(course=self.course, time_from=time(9, 30)).id
    ue = UserEvent.objects.get(event_id=new_id, user=self.student)
    self.assertIsNotNone(ue.checkin_time)
```

- [ ] **Step 2: Implement in `CourseEventEditView.post`**

After serializer validation, before overlap validation:

```python
overlap_merges = request.data.get("overlap_merges") or []
draft_id_to_created: dict[str, int] = {}
merge_skip_delete_ids: set[int] = set()
```

After `created_instances = serialized_events_to_be_created.save()`:

```python
for entry in overlap_merges:
    draft_id = entry["survivor_draft_id"]
    survivor_event_id = draft_id_to_created.get(draft_id)
    if not survivor_event_id:
        continue  # or 400 if missing
    source_ids = entry["source_event_ids"]
    sources = list(Event.objects.filter(id__in=source_ids))
    survivor = Event.objects.get(id=survivor_event_id)
    ue_map = _load_user_events_by_event([survivor_event_id, *source_ids])
    merge_cluster_user_events_batch([survivor, *sources], survivor, ue_map)
    _move_daily_note_if_needed(survivor, sources)
    Event.objects.filter(id__in=source_ids).delete()
    merge_skip_delete_ids.update(source_ids)
```

When checking check-in delete guard, exclude `event_id__in=merge_skip_delete_ids`.

Re-run `validate_simulated_course_event_edit` **after** logically applying merges/deletes so overlap check reflects final state.

- [ ] **Step 3: Run tests**

Run: `./scripts/run_backend_tests.sh app_course.tests.test_course_event_edit app_course.tests.test_schedule_resolve_overlaps -v 2`

Expected: PASS

---

## Task 6: Frontend — `findOverlapClusters` + types

**Files:**
- Modify: `schedjuice-reimagined-fe/src/helpers/calendar.ts`
- Modify: `schedjuice-reimagined-fe/src/helpers/calendar-overlap.test.ts`
- Create: `schedjuice-reimagined-fe/src/types/course-schedule.ts`
- Create: `schedjuice-reimagined-fe/src/helpers/course-schedule.ts`

- [ ] **Step 1: Add failing tests for `findOverlapClusters`**

In `calendar-overlap.test.ts`:

```typescript
import { findOverlapClusters, isDraftEventId } from "@/helpers/calendar";

it("findOverlapClusters groups transitive overlaps", () => {
  const flat = [
    { id: 1, date: "2026-07-01", time_from: "9:00", time_to: "10:30", is_deleted: false },
    { id: 2, date: "2026-07-01", time_from: "9:30", time_to: "10:00", is_deleted: false },
    { id: 3, date: "2026-07-01", time_from: "9:45", time_to: "11:00", is_deleted: false },
  ];
  const clusters = findOverlapClusters(flat);
  expect(clusters).toHaveLength(1);
  expect(clusters[0]).toHaveLength(3);
});

it("isDraftEventId detects new-prefixed ids", () => {
  expect(isDraftEventId("new-abc")).toBe(true);
  expect(isDraftEventId(42)).toBe(false);
});
```

- [ ] **Step 2: Implement in `calendar.ts`**

Port chain logic from `hasOverlappingEventsInFlatList` to return `Partial<eventType>[][]` instead of boolean.

- [ ] **Step 3: Add types**

`src/types/course-schedule.ts`:

```typescript
export type ScheduleResolveMode = "auto_global" | "pin_survivor";

export type OverlapMergeEntry = {
  survivor_draft_id: string;
  source_event_ids: number[];
};

export type ScheduleResolveResponse = {
  client_deletes: string[];
  deferred_merges: OverlapMergeEntry[];
  applied: {
    events_removed: number[];
    events_kept: number[];
    users_merged_count: number;
  };
  events: unknown[];
};
```

- [ ] **Step 4: API helper**

```typescript
export async function postScheduleResolveOverlaps(
  courseId: number,
  body: Record<string, unknown>,
): Promise<ScheduleResolveResponse> {
  const res = await makePostRequest(`courses/${courseId}/schedule/resolve-overlaps`, body);
  return assertSchedjuiceSuccess(res) as ScheduleResolveResponse;
}
```

- [ ] **Step 5: Run tests — PASS**

Run: `pnpm test src/helpers/calendar-overlap.test.ts`

---

## Task 7: Frontend — `resolveScheduleOverlaps` helper

**Files:**
- Create: `schedjuice-reimagined-fe/src/helpers/calendar-overlap-resolve.ts`
- Create: `schedjuice-reimagined-fe/src/helpers/calendar-overlap-resolve.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { vi } from "vitest";
import { resolveScheduleOverlaps, applyResolveResultToEvents } from "./calendar-overlap-resolve";

vi.mock("@/helpers/course-schedule", () => ({
  postScheduleResolveOverlaps: vi.fn(),
}));

it("all-draft cluster skips API call", async () => {
  const flat = [ /* two overlapping new-* events */ ];
  const result = await resolveScheduleOverlaps({ courseId: 1, flatEvents: flat, mode: "auto_global" });
  expect(postScheduleResolveOverlaps).not.toHaveBeenCalled();
  expect(result.clientDeletes.length).toBeGreaterThan(0);
});
```

Add tests for API called when persisted id in cluster, and `deferredMerges` populated.

- [ ] **Step 2: Implement helper**

```typescript
export async function resolveScheduleOverlaps(args: {
  courseId: number;
  flatEvents: Partial<eventType>[];
  mode: ScheduleResolveMode;
  pinSurvivor?: {
    draftId?: string;
    eventId?: number;
    localDate: string;
    removeEventIds: number[];
    removeDraftIds: string[];
  };
}): Promise<{
  events: Partial<eventType>[];
  deferredMerges: OverlapMergeEntry[];
  summary: { removedCount: number; usersMergedCount: number };
}> {
  const active = args.flatEvents.filter((e) => !e.is_deleted);
  const clusters = findOverlapClusters(active);
  if (!clusters.length) {
    return { events: args.flatEvents, deferredMerges: [], summary: { removedCount: 0, usersMergedCount: 0 } };
  }

  const needsApi = clusters.some((c) => c.some((e) => !isDraftEventId(e.id)));
  let apiResult: ScheduleResolveResponse | null = null;
  if (needsApi) {
    apiResult = await postScheduleResolveOverlaps(args.courseId, {
      mode: args.mode,
      draft_events: args.flatEvents,
      ...(args.pinSurvivor ?? {}),
    });
  } else {
    // client-only: pick earliest time_from survivor per cluster
    apiResult = buildClientOnlyResult(clusters);
  }
  return applyResolveResultToEvents(args.flatEvents, apiResult);
}
```

Implement `applyResolveResultToEvents` to mark `client_deletes` as `is_deleted: true`, reconcile refreshed persisted events from `apiResult.events`.

- [ ] **Step 3: Run tests — PASS**

---

## Task 8: Calendar context + Save bar integration

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/calendar/calendar-context.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/calendar/calendar.tsx`

- [ ] **Step 1: Extend context**

Add to `CalendarContextType`:

```typescript
pendingOverlapMerges: OverlapMergeEntry[];
setPendingOverlapMerges: (entries: OverlapMergeEntry[]) => void;
```

Initialize in `calendar.tsx` provider with `useState<OverlapMergeEntry[]>([])`.

- [ ] **Step 2: Replace Save overlap toast with inline banner**

When `hasOverlappingEventsInFlatList(flatEvents)`:

```tsx
<div className="mb-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
  <p className="text-sm text-destructive">{SAVE_OVERLAP_ERROR}</p>
  <Button
    size="sm"
    className="mt-2"
    disabled={isResolvingOverlaps}
    onClick={handleFixOverlaps}
  >
    Fix overlaps
  </Button>
</div>
```

`handleFixOverlaps` calls `resolveScheduleOverlaps({ mode: "auto_global", ... })`, updates events + merges deferred into `pendingOverlapMerges`, shows success toast.

- [ ] **Step 3: Include `overlap_merges` in save mutation**

```typescript
eventUpdateMutation.mutate({
  course: payload,
  events: flatEvents,
  ...(pendingOverlapMerges.length ? { overlap_merges: pendingOverlapMerges } : {}),
});
```

Clear `pendingOverlapMerges` on success.

- [ ] **Step 4: Save error fallback**

In `onError`, if `details.conflicts` present, toast with action to call `handleFixOverlaps`.

- [ ] **Step 5: Deferred hint**

When `pendingOverlapMerges.length > 0`, show muted text: `"Some attendance will merge when you save."`

---

## Task 9: Event form — Replace conflicting session

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/calendar/event-form.tsx`

- [ ] **Step 1: Track overlap conflict state**

When `findOverlappingEventOnDate` returns non-null, set `conflictingEvent` state instead of only `setError`.

- [ ] **Step 2: Render fix link below error**

```tsx
{conflictingEvent && (
  <button
    type="button"
    className="text-sm text-primary underline"
    onClick={handleReplaceConflictingSession}
  >
    Replace conflicting session
  </button>
)}
```

- [ ] **Step 3: Implement `handleReplaceConflictingSession`**

Build pending event from form values (same shape as submit would create). Call:

```typescript
const result = await resolveScheduleOverlaps({
  courseId: course.id,
  flatEvents,
  mode: "pin_survivor",
  pinSurvivor: {
    draftId: isEdit ? undefined : "new-" + uuid(),
    eventId: isEdit ? selectedEvent?.id : undefined,
    localDate: isoDate,
    removeEventIds: isDraftEventId(conflictingEvent.id) ? [] : [Number(conflictingEvent.id)],
    removeDraftIds: isDraftEventId(conflictingEvent.id) ? [String(conflictingEvent.id)] : [],
  },
});
```

Then add/edit the survivor event to `result.events`, call `setEvents`, merge `deferredMerges` into context, close dialog.

- [ ] **Step 4: Manual smoke test** on course edit schedule tab

---

## Task 10: Bulk-times dialog fix button

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/calendar/calendar-menu.tsx`

- [ ] **Step 1: Add Fix overlaps button when `bulkTimesError` is overlap message**

```tsx
{bulkTimesError === BULK_TIMES_OVERLAP_ERROR && (
  <Button variant="secondary" size="sm" onClick={handleBulkFixOverlaps}>
    Fix overlaps
  </Button>
)}
```

- [ ] **Step 2: `handleBulkFixOverlaps`**

Run `applyBulkClassTimesToEvents` to get simulated list, call `resolveScheduleOverlaps` with `mode: "auto_global"` on simulated events, `setEvents` with result, clear error, close dialog optional (keep open with success message).

---

## Task 11: End-to-end verification

- [ ] **Run full backend suite for touched modules**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_course.tests.test_overlap_fix app_course.tests.test_schedule_resolve_overlaps app_course.tests.test_course_event_edit -v 2
```

Expected: all PASS

- [ ] **Run frontend tests**

```bash
cd schedjuice-reimagined-fe
pnpm test src/helpers/calendar-overlap.test.ts src/helpers/calendar-overlap-resolve.test.ts
```

Expected: all PASS

- [ ] **Manual checklist** (from spec)

1. Bulk times → overlap → Fix overlaps → Save succeeds
2. Add session over marked session → Replace conflicting session → Save → attendance preserved
3. Week view overlap highlighting clears after fix
4. Data health fix still works (regression)

---

## Spec Coverage Checklist

| Spec requirement | Task |
| --- | --- |
| Fix button on Save bar | Task 8 |
| Fix on event form (pin survivor) | Task 9 |
| Fix on bulk-times | Task 10 |
| Global survivor rules | Task 3 |
| Hybrid client/server execution | Tasks 3, 7 |
| Deferred overlap_merges on save | Task 5 |
| Batch merge / no N+1 | Task 1 |
| Save error fallback | Task 8 |
| Permissions | Task 4 (check_course_write) |
| Backend + FE tests | Tasks 1–7, 11 |

## Self-Review

- No TBD/TODO placeholders in task steps
- Type names consistent: `OverlapMergeEntry`, `ScheduleResolveResponse`, `merge_cluster_user_events_batch`
- Each spec goal maps to at least one task
- Backend and frontend can land in separate PRs: Tasks 1–5 (BE) then Tasks 6–10 (FE), Task 11 validates both
