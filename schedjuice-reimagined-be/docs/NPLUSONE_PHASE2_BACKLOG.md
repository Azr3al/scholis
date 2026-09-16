# N+1 Query Refactoring — Phase 2 + Phase 3 (Completed)

Phase 2 fixes and Phase 3 OOP refactor are implemented. Use this document for verification and any follow-up sweeps.

## How to verify

1. Set `DEBUG=true` and `NPLUSONE_ENABLED=true` in `.env`.
2. Run `python3 manage.py runserver`.
3. Exercise endpoints from the frontend or Postman.
4. Watch console for `Potential n+1 query detected on Model.field`.
5. Optionally enable `SILKY_ENABLED=true` for SQL counts at `/silk/`.

## Log capture (JSONL)

Structured captures for AI analysis:

1. Optional: `NPLUSONE_RUN_ID=smoke-001` or header `X-NPlusOne-Run-Id`
2. Events append to `logs/nplusone/YYYY-MM-DD.jsonl`
3. Summarize:

```bash
./env/bin/python scripts/nplusone/summarize.py logs/nplusone/*.jsonl \
  --output logs/nplusone/reports/summary.json
```

- Scripts: [`scripts/nplusone/README.md`](../scripts/nplusone/README.md)
- Agent workflow: [`NPLUSONE_AGENT_WORKFLOW.md`](NPLUSONE_AGENT_WORKFLOW.md)
- Cursor rule: [`.cursor/rules/nplusone-log-analysis-and-fixes.mdc`](../.cursor/rules/nplusone-log-analysis-and-fixes.mdc)

## Phase 3 — OOP / DRY refactor

Declarative mixins in [`utilitas/queryset_mixins.py`](../utilitas/queryset_mixins.py):

| Class | Purpose |
|-------|---------|
| `ExpandPrefetchSpec` | When a client expand path matches, strip the parent lookup from default prefetches and apply an optimized `Prefetch(queryset=...)` |
| `OptimizedSearchMixin` | Declarative `expand_prefetch_specs`, `base_select_related`, `base_prefetch_related` for list/search views |
| `OptimizedDetailMixin` | Override `annotate_detail_queryset()` instead of duplicating `get_object()` |

Queryset factories in [`app_course/course_search_queryset.py`](../app_course/course_search_queryset.py):

- `optimized_course_queryset_for_serializer()`
- `build_user_course_queryset_with_optimized_course()`
- `build_user_course_queryset_for_roster_user_expand()`
- `build_assignment_queryset_with_optimized_course()`
- `build_event_queryset_with_optimized_course()`

**Bug fix:** `AttendanceSearchView` and `SubmissionSearchView` previously stripped child expand paths (`event__course`, `assignment__course`) while replacing the parent lookup, causing Django `ValueError: 'event'/'assignment' lookup was already seen with a different queryset`. The mixin always strips `replace_lookup` (the parent).

| View | Mixin | Specs / hooks |
|------|-------|---------------|
| `UserSearchView` | `OptimizedSearchMixin` | `user_courses` → optimized nested course prefetch |
| `UserPaymentSearchView` | `OptimizedSearchMixin` | `base_select_related` + `covered_months` prefetch |
| `SubmissionSearchView` | `OptimizedSearchMixin` | `assignment__course` → optimized assignment prefetch |
| `UserAttendanceSearchView` | `OptimizedSearchMixin` | `course` expand + `select_related("user")` |
| `AttendanceSearchView` | `OptimizedSearchMixin` | `event__course` → optimized event prefetch |
| `UserCourseSearchView` | `OptimizedSearchMixin` + roster serialize mixin | `user` expand prefetch + id_card/custom-field cache priming + roster ordering |
| `CourseDetailsView` | `OptimizedDetailMixin` | Hub expand: roster user prefetch, id_card batch cache, single fetch |
| `CourseListView` | `OptimizedSearchMixin` | `user_courses` → roster user prefetch + id_card batch cache |
| `CourseSearchView` | `OptimizedSearchMixin` | `user_courses` → roster user prefetch + id_card batch cache |
| `ProgramDetailsView` | `OptimizedDetailMixin` | `annotate_detail_queryset` with `_intake_count` |

Regression tests: [`app_course/tests/test_queryset_mixins.py`](../app_course/tests/test_queryset_mixins.py) (parent-strip collision).

## Phase 2 fixes (reference)

| View | Fix |
|------|-----|
| `UserSearchView` | Optimized `user_courses` expand prefetch |
| `UserPaymentSearchView` | FK `select_related` + `covered_months` prefetch |
| `ProgramDetailsView` | `_intake_count` annotation on detail |
| `SubmissionSearchView` | Optimized assignment→course prefetch on expand |
| `UserAttendanceSearchView` | Optimized course prefetch on expand |
| `AttendanceSearchView` | Optimized event→course prefetch on expand |

## Phase 1 fixes (reference)

- `ProgramListView` / `ProgramSearchView` — `_intake_count` annotation
- `CourseListView` / `CourseSearchView` — first-event annotation + teacher-roster prefetch + roster user expand
- `UserCourseSearchView` — user expand prefetch + id_card/custom-field cache priming

## Already optimized (reference)

- `UserDetailsView` — nested course prefetch on expand (bespoke; not yet migrated to mixin)
- `app_quiz_v3` search views — heavy `Prefetch` / `select_related` usage
- `app_finance` admin report views — explicit `select_related`

## Perf test coverage

- [`app_course/tests/test_query_perf.py`](../app_course/tests/test_query_perf.py) — query budget tests
- [`app_course/tests/test_queryset_mixins.py`](../app_course/tests/test_queryset_mixins.py) — expand parent-strip regression

Run:

```bash
./env/bin/python manage.py test app_course.tests.test_query_perf app_course.tests.test_queryset_mixins -v 2
```

## Optional follow-ups

- `UserPaymentDetailsView` — same covered_months prefetch in `get_object`
- `UserDetailsView` — migrate to `OptimizedDetailMixin` + expand spec when a second view needs the same pattern
- `UserSerializer` `courses` expand — map to `user_courses__course` if used in production

## Resolved captures (2026-05-21)

Capture archived to `logs/nplusone/resolved/2026-05-21-quiz-v3-detail-editor-sync.jsonl` (15 events, 5 groups). Do not re-triage — fixed in code.

| View | Model.field | Fix |
|------|-------------|-----|
| `QuizDetailsView` | `Question.fill_blank_slots` | `OptimizedDetailMixin` + replace `questions*` expand with `_questions_for_quiz_prefetch_qs()` (nested slot prefetches) |
| `QuizDetailsView` | `Question.short_answer_acceptables` | Same optimized questions prefetch |
| `QuizDetailsView` | `QuestionFillBlankSlot.acceptable_answers` | Nested prefetch via `_fib_slots_prefetch_qs()` |
| `QuizDetailsView` | `QuestionFillBlankSlot.choice_options` | Nested prefetch via `_fib_slots_prefetch_qs()` |
| `QuizEditorSyncView` | `Question.short_answer_acceptables` | Prefetch `short_answer_acceptables` on existing/response question querysets; serializer sync uses prefetched rows |

Shared helpers in [`app_quiz_v3/views.py`](../app_quiz_v3/views.py): `_fib_slots_prefetch_qs()`, `_questions_for_quiz_prefetch_qs()`.
