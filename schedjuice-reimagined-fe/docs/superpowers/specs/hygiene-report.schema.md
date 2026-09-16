# Hygiene slice report schema

Each sub-agent writes `docs/superpowers/specs/hygiene-reports/<slice_id>.yaml`.

Example:

```yaml
slice_id: be-app_hr
repo: schedjuice-reimagined-be   # or schedjuice-reimagined-fe
path: app_hr
skipped: false
deleted:
  - path: app_hr/services/legacy_overview.py
    symbol: LegacyOverviewService
    reason: unreferenced-module   # unreferenced-module | dead-export | commented-out-block | orphan-route
    confidence: obvious
fixed_docs:
  - path: app_hr/README.md
    reason: described-removed-endpoint
    confidence: obvious
anti_pattern_fixes:
  - path: app_hr/views.py
    reason: leftover-unauthenticated-debug-branch
    confidence: obvious
ambiguous:
  - path: app_hr/tasks.py
    symbol: refresh_overview_cache
    reason: string-referenced-celery-name
    confidence: ambiguous
    notes: task name appears in beat schedule as string; do not delete without confirm
files_touched:
  - app_hr/services/legacy_overview.py
  - app_hr/README.md
verification:
  command: ./scripts/run_backend_tests.sh app_hr.tests
  passed: true
```

## Field notes

- `deleted[].reason` should be one of: `unreferenced-module` | `dead-export` | `commented-out-block` | `orphan-route`
- `fixed_docs[].reason` / `anti_pattern_fixes[].reason` / `ambiguous[].reason` are short slugs; use `notes` for context
- `confidence` must be `obvious` or `ambiguous`
- Only `confidence: obvious` items may be auto-deleted/fixed in-slice

## Worktree prune report

Orchestrator writes `docs/superpowers/specs/<date>-worktree-prune.md` (and optionally YAML siblings). Each row:

| Field | Meaning |
|-------|---------|
| path | Worktree absolute or repo-relative path |
| branch | Checked-out branch |
| last_activity | ISO date used for the 7-day gate |
| dirty | true/false |
| action | `removed` \| `skipped_dirty` \| `skipped_recent` \| `failed` |
| branch_deleted | true only if local branch removed after merge into `dev` |
| notes | Failure reason or leave-branch note |
