# Schedule overlap — ignore past slots & Fix (reschedule) vs Replace (merge)

**Status:** draft (awaiting user review)  
**Date:** 2026-07-21  
**Repos:** `schedjuice-reimagined-be`, `schedjuice-reimagined-fe`  
**Surfaces:** Course schedule calendar editor (add/edit event, save bar, bulk times), Course Data Health overlapping-events  
**Builds on:**
- `docs/superpowers/specs/2026-07-05-calendar-overlap-one-click-fix-design.md`
- `docs/superpowers/specs/2026-07-04-overlapping-sessions-fix-design.md`

## Context

Overlap detection currently treats all same-day sessions equally: finished (past) slots still block adds and saves. Recovery today is merge-oriented (“Replace conflicting session” / “Fix overlaps”), which removes duplicate events after attendance-safe merges. Users also need to **keep** conflicting future sessions and quickly change their times, with clear, unified copy.

## Goals

1. **Ignore past overlaps** — sessions with `time_to` strictly before **now** (organization timezone) are excluded from overlap clustering and validation on client and backend.
2. **Two recovery actions** everywhere future overlaps are shown:
   - **Fix** — reschedule: one shared `time_from` / `time_to` applied to all listed conflicting **future** sessions; keep those sessions.
   - **Replace** — existing merge/remove path (survivor rules unchanged).
3. **Unified copy** — same labels on Add Event, save bar, bulk times, and Data Health.
4. **Never lose attendance** — check-in/out, marked status, and related UserEvent/DailyNote data must be preserved on both paths.
5. **Atomic backend writes** — every persisted Fix or Replace apply runs inside `transaction.atomic()`; no partial updates.

## Non-goals

- Changing half-open interval semantics (`[time_from, time_to)`; back-to-back allowed).
- Changing Replace survivor selection (`pin_survivor` vs `auto_global`).
- Auto-save after Fix (except completing an in-progress add into the **draft**).
- Automatically nudging times apart without user input.
- Intake wizard / simple-schedule picker overlap rules (remain out of scope).
- Soft-warning past overlaps (past is fully ignored, not warned).

## Decisions

| # | Decision |
| --- | --- |
| 1 | **Approach:** filter past in shared overlap helpers + reusable Reschedule dialog; keep existing resolve/merge for Replace |
| 2 | **Past definition:** `time_to < now` in **organization timezone** (not browser-local) |
| 3 | **Scope of past-ignore:** FE + BE (form, save, bulk times, `edit-events`, data-health overlap detection) |
| 4 | **Fix UX:** one start/end time applied to **all** listed conflicting future sessions; then continue interrupted flow |
| 5 | **Add Event after Fix:** apply times → re-check → auto-add pending session if clear (“Apply & add”) |
| 6 | **Copy:** **Fix** = reschedule; **Replace** = merge. Drop mixed phrases (“Fix overlaps”, “Replace conflicting session”) |
| 7 | **Attendance:** Fix only updates times on same event IDs; Replace uses existing attendance-safe merge only |
| 8 | **Atomicity:** backend Fix/Replace apply (and any batch time update) wrapped in `transaction.atomic()` |
| 9 | **Permissions:** same as schedule edit / existing data-health fix (`course.manage_content` / `course.manage_all` as today) |

---

## Part A — Past exclusion

### Predicate

A session is **past** when its end datetime is strictly before current time in the org timezone:

```text
event_end_org < now_org
```

- `time_to == now` is **not** past (still validated).
- Day-bucketing for overlap clusters remains org-local calendar day (unchanged).
- Frontend classifies past using tenant/org timezone (same source as schedule time labels), not `Date` browser-local midnight.

### Where to apply

| Layer | Change |
| --- | --- |
| FE `calendar.ts` helpers | Overlap finders / cluster builders ignore past members (or accept `now` + filter before cluster) |
| FE save / bulk / form gates | Use filtered helpers so past-only “overlaps” do not block |
| BE `event_overlap.py` | Filter past before `find_overlap_clusters` / validation used by save, create, resolve, data-health |
| API `conflicts` payload | List **future** clusters only |

### Recurring add

When scanning proposed recurring occurrences, skip overlap checks against past existing sessions and against proposed occurrences that are themselves already past.

---

## Part B — Unified recovery actions

### Copy (everywhere)

| Action | Link / button | Meaning |
| --- | --- | --- |
| Reschedule | **Fix** | Set one shared start/end on all listed conflicting future sessions; keep them |
| Merge | **Replace** | Keep one survivor; remove duplicate sessions via attendance-safe merge |

| Context | Loading | Dialog primary |
| --- | --- | --- |
| Add Event | Fixing… / Replacing… | **Apply & add** |
| Save / bulk / Data Health | Fixing… / Replacing… | **Apply** |

Dialog title: **Reschedule conflicting sessions**.  
Helper text example: “N future sessions will use these times.”

### Add Event form

Under the overlap field error, show both underlined text buttons:

```text
This session overlaps with another session on the same day.
Fix          Replace
```

**Fix** opens the reschedule dialog (not the full event editor). On **Apply & add**:

1. Validate `time_to > time_from`.
2. Apply the same times to all listed conflicting **future** sessions in the draft.
3. Re-run overlap check (past still ignored).
4. If clear → add the pending session to the draft and close the add form.
5. If still overlapping (including conflicts overlapping each other at the new times) → keep dialog open with error; do not add.

**Replace** keeps today’s `pin_survivor` resolve path (new/edited session wins), with attendance-safe merge semantics.

### Save bar & bulk times

Same two actions. **Fix** applies times to draft conflicts and clears the blocker if validation passes. **Replace** uses existing `auto_global` resolve.

### Course Data Health

Overlapping-events issue exposes **Fix** and **Replace**:

- **Fix:** preview + apply that batch-updates `time_from` / `time_to` on the conflict set (same times for all selected future conflicts). No event deletes; UserEvent rows unchanged.
- **Replace:** existing merge preview/apply.

---

## Part C — Attendance & atomicity

### Hard rules

1. **Fix (reschedule)**  
   - Updates only `time_from` and `time_to` on existing event rows (or draft objects).  
   - Same event IDs — no deletes, no UserEvent/DailyNote moves.  
   - Check-in/out and marking data remain on those events.

2. **Replace (merge)**  
   - Must use the existing attendance-safe merge path (merge UserEvents onto survivor, move DailyNote, then delete duplicate **events** only).  
   - Never drop check-in/out or marked-student data.  
   - If merge cannot preserve attendance, fail the action; leave data unchanged.

3. **Backend atomicity**  
   - Persisted **Fix** apply (data-health reschedule, and any server-side batch time update): entire batch inside `transaction.atomic()`.  
   - Persisted **Replace** apply / `resolve-overlaps` / deferred `overlap_merges` on save: already merge-oriented; ensure the full apply path remains a single `transaction.atomic()` (no commits between merge and delete).  
   - On any error, roll back completely — no partial time updates and no orphaned attendance.

---

## Part D — Architecture (Approach 1)

```text
Add / save / bulk / data-health
        │
        ▼
Filter out past events (time_to < now, org TZ)
        │
        ▼
Overlap clusters (existing half-open logic)
        │
   ┌────┴────┐
   │         │
 Fix       Replace
   │         │
   ▼         ▼
Reschedule   Existing resolve / merge
dialog       (pin_survivor or auto_global)
   │         │
   ▼         ▼
Update times  Merge UserEvents → survivor,
on conflict   move DailyNote, delete
event IDs     duplicate events only
(atomic if     (atomic)
 persisted)
   │         │
   └────┬────┘
        ▼
Re-validate (past still ignored) → continue flow
```

### Shared FE pieces

- `isPastEvent(event, nowOrg)` (or equivalent) in calendar helpers.
- Overlap APIs default to ignoring past for schedule editing.
- Reusable **Reschedule conflicting sessions** dialog component (two time fields + count).

### Shared BE pieces

- Past filter in `app_course/event_overlap.py` (single place preferred).
- Data-health (or schedule) reschedule preview/apply service for Fix on persisted events, wrapped in `transaction.atomic()`.

### Explicit non-changes

- Week-view visual stacking may still show past overlaps for layout; validation/gates are what change.
- Simple course scheduling path remains without this overlap system.

---

## Part E — Errors

| Case | Behavior |
| --- | --- |
| Invalid range (`time_to <= time_from`) | Block Apply in dialog |
| Fix leaves future overlaps | Keep dialog open; inline error; no add / no clear save blocker |
| Replace fails (API / cannot preserve attendance) | Toast; draft/DB unchanged |
| Save with only past “overlaps” | Allow (client + backend) |
| Save with any future overlap | HTTP 400; `conflicts` = future clusters only |

---

## Part F — Testing

### Backend

- Past session overlapping a new/edited slot on the same org-local day → validation passes.
- Two future overlapping sessions → still 400 / flagged as overlapping.
- Boundary: `time_to == now` still participates in overlap checks.
- Data-health Fix apply: times updated; UserEvent count and check-in fields unchanged; failure mid-batch rolls back (atomic).
- Replace path regression: attendance merged onto survivor; no UserEvent loss; still atomic.

### Frontend

- Add form ignores past conflict; shows **Fix** and **Replace** for future conflict.
- Apply & add updates conflict times then appends the new draft event.
- Unified labels on save bar, bulk times, and Data Health.
- Fix never calls delete/merge endpoints; Replace still uses resolve/merge.

---

## Implementation sketch (for planning)

1. BE: past filter in `event_overlap` + tests; ensure validate/save/data-health use it.  
2. BE: reschedule apply service + endpoint (or extend data-health fix) under `transaction.atomic()`.  
3. FE: past filter in `calendar.ts` + unit tests.  
4. FE: Reschedule dialog + wire **Fix** / rename **Replace** on form, save bar, bulk, Data Health.  
5. FE: Add Event Apply & add orchestration.  
6. Copy sweep for old “Fix overlaps” / “Replace conflicting session” strings.  
7. Regression tests for attendance preservation on Replace.

## Open questions

None — resolved in brainstorming (2026-07-21).
`}