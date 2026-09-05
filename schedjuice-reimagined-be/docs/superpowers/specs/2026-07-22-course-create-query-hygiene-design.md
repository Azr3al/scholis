# Course create query hygiene

**Status:** draft (awaiting user review)  
**Date:** 2026-07-22  
**Repos:** `schedjuice-reimagined-be`  
**Surfaces:** `POST /api/v1/courses` (`CourseListView` create → `CourseSerializer.create` / `to_representation`)

## Context

A scoped-role `POST /api/v1/courses` (201 create) was measured at **~21 SQL queries** and ~1.1s SQL time via django-debug-toolbar Server-Timing (`SQLPanel_sql_time` / `SQL 21 queries`). Microsoft Teams was **off** for that request, so Graph is not in play.

Initial investigation mistook list-style query params (`page`, `size`, `expand`) on the URL for a list call; the method was **POST** and the response was **201** with the created course. Those list params are irrelevant on create.

Serializer-level recreate (validate → save → re-serialize, MS mocked/off, no auth middleware) lands around **~17 queries**. The gap to ~21 is tenant/auth/RBAC overhead outside the serializer.

Observed redundant / avoidable clusters on the create path:

| Cluster | What happens today |
| --- | --- |
| `search_text` post_save | After `INSERT`, `course_saved_refresh_search_text` re-`SELECT`s the course (with `select_related`), loads `course_subjects`, then often `UPDATE search_text` — even though create already has FK ids/instances available (intake bulk create already avoids this by setting `search_text` on the payload). |
| 201 re-serialize | Full `CourseSerializer` runs `primary_teacher` / Teams organizer method fields and first-event time fields without list annotations/prefetches, plus custom-field definition lookup if the request cache was not primed. |
| Necessary work (keep) | Title uniqueness, FK validation fetches, `INSERT`, join_code uniqueness, auto-MT roster side effects when applicable, transaction begin/commit. |

`User.get_user_from_request` is already memoized on the request; do not treat “call twice in `create`” as a separate bug unless measurement shows cache misses.

## Goals

1. Remove redundant SQL on course **create** when Teams is off, without changing create semantics or 201 response shape.
2. Set `search_text` correctly on insert (same FTS outcome as today’s post_save refresh).
3. Make 201 serialization avoid empty-course method-field round-trips.
4. Lock the win with a high-value query-budget test (upper bound + no redundant `search_text` refresh cluster), not happy-path-only smoke.

## Non-goals

- Slimming the 201 payload (Approach 2).
- Deferring `search_text` / member-count refresh to async `on_commit` (Approach 3).
- Microsoft Teams / Graph provisioning performance.
- Courses **list** or **search** query counts.
- Fixing `CourseListView.get` calling `super().post` for read-breadth users (separate bug; lists via create for admins today).

## Decisions

| # | Decision |
| --- | --- |
| 1 | **Approach:** surgical create-path hygiene (Approach 1) — same API contract |
| 2 | **`search_text`:** compute once before insert from validated FK instances / ids (mirror intake `_compute_intake_course_search_text` idea). On that create path, **skip** `refresh_course_search_text` entirely (e.g. instance flag set by `CourseSerializer.create`, checked in the `post_save` receiver) so create does not pay the refresh `SELECT` + optional `UPDATE`. Leave the signal fully active for updates and `CourseSubject` changes |
| 3 | **Fallback:** if pre-insert computation cannot resolve names safely, do **not** set the skip flag — keep today’s post_save refresh path (correctness over skip) |
| 4 | **201 serialize:** prime custom-field representation cache once; ensure method fields see empty teacher prefetch cache and/or annotated first-event attrs so they do not query; single-row re-fetch via `optimized_course_queryset_for_serializer()` only if cheaper/clearer than setting attrs on the saved instance |
| 5 | **MS / auto-MT:** unchanged branches and eligibility |
| 6 | **Success metric:** lower query count vs ~21 baseline on scoped create (MS off, no events); test asserts an upper bound and absence of the redundant post-insert `search_text` `UPDATE` when text was set on create |

## Architecture

```text
POST /api/v1/courses
  → validate (unchanged rules)
  → compute search_text from resolved FKs
  → INSERT (search_text set; skip-refresh flag set)
  → post_save: skip refresh_course_search_text when flag set
  → assign_creator_as_teacher_if_applicable (unchanged)
  → 201 CourseSerializer.to_representation
       with create-safe short-circuits / priming
```

### Touch points

| Unit | Responsibility |
| --- | --- |
| `CourseSerializer.create` | Compute and set `search_text` on `validated_data` before `super().create`; unchanged MS/auto-MT orchestration |
| `app_course/search_signals.py` (and/or small helper shared with intake) | Shared compute helper if needed; refresh remains correct for update/`CourseSubject`; create path must not pay SELECT+UPDATE when text already correct |
| `CourseSerializer.to_representation` / create response path | Method fields honor annotations / `_prefetched_teacher_user_courses`; custom fields use primed request cache |
| `CourseListView` POST create response | Ensure priming / create-safe instance before returning serializer data if not already handled inside serializer context |

### Data flow (create, MS off)

1. DRF validates body → FK objects available on serializer / validated_data.
2. Build `search_text` string from program/category/subject/level/section/campus/intake (+ course_subjects if any at create time — usually none).
3. Persist course row including `search_text`.
4. `post_save` sees skip flag → no refresh `SELECT`/`UPDATE`.
5. Auto-MT may insert `UserCourse` + refresh member counts (existing).
6. Response serialization reads annotated/cached fields; no first-event query when none exist if annotation present; no teacher roster queries when prefetch cache is an empty list.

## Error handling

- Validation errors: unchanged status and shape.
- Auto-MT `MissingMainTeacherRole`: unchanged.
- If FK name resolution for `search_text` is incomplete at create time, fall back to existing `refresh_course_search_text` rather than writing a wrong empty string when FKs were set.
- Inline events on create (if present in the same request flow): first-event fields on 201 must still be correct (annotation or single cached fetch).

## Testing

Add to `app_course/tests/test_query_perf.py` (or a focused sibling), DB-backed with `--keepdb`:

1. **Query budget (MS off):** `CourseSerializer` create + represent under `CaptureQueriesContext`; `assertLessEqual` to a tight upper bound calibrated after the fix (document the bound in the test). Baseline fixture: manual program, no events, Teams flow not invoked.
2. **No redundant search_text write:** after create with FKs set, assert `search_text` is populated **and** the captured SQL does not include a post-insert `UPDATE ... search_text` (or equivalent invariant that forbids the old refresh cluster).
3. Rely on existing `test_search_fts` / `test_auto_assign_creator_mt` for behavioral regression; do not add happy-path-only “returns 201” smoke.

## Success criteria

- Scoped create (MS off) shows fewer than ~21 SQL queries in DDT Server-Timing vs pre-change baseline on the same payload shape.
- Query-budget test passes under `./scripts/run_backend_tests.sh`.
- `search_text` / FTS behavior and auto-MT behavior unchanged.

## Follow-ups (explicitly not this spec)

- `CourseListView.get` → should list via `BaseListView.get`, not `super().post` (create), for read-breadth users.
- List/search absolute query latency.
- Approach 3 async deferral if create latency remains dominated by unavoidable writes.
