# Test cleanup slice report schema

Each sub-agent writes `docs/superpowers/specs/cleanup-reports/<slice_id>.yaml`.

Example:

```yaml
slice_id: be-app_hr
repo: schedjuice-reimagined-be   # or schedjuice-reimagined-fe
path: app_hr/tests
skipped: false
deleted:
  - path: app_hr/tests/test_school_overview_api.py
    test_name: SchoolOverviewAPITests.test_returns_count_and_enriched_fields
    reason: obvious-smoke   # obvious-smoke | tautology | setup-theater
replaced:
  - path: app_hr/tests/test_school_overview_api.py
    removed_test: SchoolOverviewAPITests.test_only_coverage_example
    added_tests:
      - SchoolOverviewAPITests.test_forbidden_for_teacher
    reason: sole-coverage-nontrivial
ambiguous:
  - path: app_hr/tests/test_school_overview_cache.py
    test_name: SchoolOverviewCacheTests.test_hit_returns_snapshot
    reason: may-be-contrast-anchor
    notes: file also has invalidation tests; unclear if this success path is intentional
files_touched:
  - app_hr/tests/test_school_overview_api.py
verification:
  command: ./scripts/run_backend_tests.sh app_hr.tests
  passed: true
```

## Field notes

- `deleted[].reason` must be one of: `obvious-smoke` | `tautology` | `setup-theater`
- `ambiguous[].reason` is a short slug; use `notes` for context when needed
