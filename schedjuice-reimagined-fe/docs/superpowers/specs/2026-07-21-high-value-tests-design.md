# High-value tests — Cursor rule + parallel cleanup

**Status:** approved design (planning phase)  
**Date:** 2026-07-21  
**Repos:** `schedjuice-reimagined-be`, `schedjuice-reimagined-fe`  
**Surfaces:** Django test modules under `app_*/tests/` (+ `utilitas/tests/` if present); Vitest files under `src/**`

## Context

Agents and humans often add verbose, low-value tests: happy-path smoke (`status_code == 200`, “renders”, field presence), tautologies that re-test framework/library behavior, or heavy fixture setup for trivial assertions. Existing Cursor rules cover **how to run** backend tests (`--keepdb`, local Docker Postgres), not **what to write**.

This design defines a shared quality rubric as a Cursor rule, and a full-suite cleanup that runs later via directory-owned parallel sub-agents. **No mass deletion happens in this planning phase.**

## Goals

1. Stop new low-value tests (happy-path-only smoke, tautologies, trivial asserts vs heavy setup).
2. Prefer edge cases and unhappy paths: auth/RBAC, wrong tenant, validation, empty/partial data, conflicts, idempotency, cache miss/stale, partial failure.
3. Allow **at most one** thin success path per behavior unit when it unlocks or contrasts meaningful edge/auth/error cases.
4. Plan a full BE+FE audit that is parallelizable by directory.
5. Hybrid safety: delete only **obvious** low-value tests; route **ambiguous** cases to one orchestrator-compiled list for human review.
6. When deleting the **sole** coverage of a **non-trivial** behavior, replace with 1–3 focused edge/unhappy tests; otherwise delete-only.

## Non-goals

- Deleting or rewriting tests during design/spec/plan-writing (execution is a later phase).
- New CI/static lint heuristics in the first pass (revisit after cleanup teaches false-positive patterns).
- Changing how tests are run (existing `--keepdb` / Docker / Vitest conventions stay).
- Editing production code except adding replacement tests inside test modules when the sole-coverage rule applies.
- Scanning git worktrees (`worktrees/`).

## Decisions

| # | Decision |
| --- | --- |
| 1 | **Scope:** both BE and FE |
| 2 | **Low-value definition:** all three classes below, with a clear rubric |
| 3 | **Cleanup breadth:** full audit, but **planning only now**; deletions only after the implementation plan is approved for execution |
| 4 | **Parallelism:** directory-sliced sub-agents; orchestrator merges ambiguous lists |
| 5 | **Safety:** hybrid — auto-delete obvious; ambiguous → proposed list → orchestrator compiles one final list |
| 6 | **Replace:** only when the deleted test was the sole coverage for non-trivial behavior |
| 7 | **Approach:** one shared Cursor rule + cleanup playbook (not dual drifting rules; not CI heuristics first) |
| 8 | **Rule location:** monorepo `.cursor/rules/high-value-tests.mdc` with `alwaysApply: true`; mirror into BE/FE `.cursor/rules/` if needed for git persistence |

## Sequencing (hard gate)

1. Design approved → write/commit this spec.  
2. Invoke **writing-plans** → detailed implementation plan.  
3. **Only after** you approve executing the plan: add the Cursor rule, then run parallel cleanup.  
4. Design/plan writing must **not** delete tests.

---

## Rubric (Cursor rule content)

### Prefer writing

- Auth/RBAC denials, wrong-tenant, missing/invalid input, empty collections, boundary values
- Idempotency, conflict/overlap, partial failure, rollback, cache miss/stale
- Behavioral asserts: status **and** error shape / state change / invariant — not presence-only
- One thin success path **only when** it sets up or contrasts meaningful unhappy/edge cases in the same module

### Low-value (do not write; cleanup candidates)

1. **Happy-path-only smoke** — mainly `status_code == 200` / “renders” / field presence with little behavioral risk  
2. **Tautologies** — re-testing framework/library behavior, or mirroring implementation line-for-line  
3. **Setup theater** — verbose fixtures where the assertion is trivial relative to cost  

### Allowed thin success path

Keep **at most one** minimal happy path per behavior unit if it unlocks edge/auth/error cases. Drop redundant success variants.

### Rule file shape

Concise `.mdc` (< ~50–80 lines preferred): Preferred / Never / Django + Vitest BAD→GOOD examples / pointer to this cleanup playbook. Do not duplicate the `--keepdb` run rules.

---

## Parallel cleanup playbook (execute after plan approval)

### Partitioning

**Backend** — one slice per:

- `schedjuice-reimagined-be/app_*/tests/` (each app that has tests)
- `schedjuice-reimagined-be/utilitas/tests/` if present

Skip `worktrees/` and non-test trees.

**Frontend** — one slice per top-level under `schedjuice-reimagined-fe/src/` that contains tests, e.g.:

- `helpers/`, `lib/`, `hooks/`, `config/`, `types/`, `api/`, …
- `components/` split by first child when large (`components/attendance/`, `components/data-table/`, …)

Exclusive directory ownership: no overlapping slices.

### Sub-agent contract

Each sub-agent, for its slice only:

1. Scan test files in the assigned directory.  
2. **Obvious → delete** (and optionally replace per sole-coverage rule below).  
3. **Ambiguous → do not delete**; emit structured candidates.  
4. Return a report: `deleted[]`, `replaced[]`, `ambiguous[]`, files touched.

**Obvious examples (non-exhaustive):**

- Sole meaningful assert is `status_code == 200`, `toBeTruthy()`, `toBeDefined()`, or “renders without crashing”
- Pure framework/library tautology
- Trivial assertion relative to heavy multi-model / full-migrate fixture cost, with no behavioral risk covered

**Ambiguous examples:**

- Thin success path that might be the intentional contrast anchor for edge cases in the same file
- Unclear whether other tests cover the same non-trivial behavior
- Domain-specific smoke that might encode a subtle contract

### Sole-coverage replace rule

**Non-trivial behavior** means a domain or security contract worth protecting: auth/RBAC, tenant isolation, validation rules, money/attendance/schedule invariants, state transitions, idempotency/conflict handling. It does **not** mean “endpoint returns 200” or “component mounts.”

| Situation | Action |
| --- | --- |
| Other tests still cover the same non-trivial behavior | **Delete only** |
| This was the **only** coverage for a non-trivial behavior | **Replace** with **1–3** focused edge/unhappy tests for that unit |
| Only coverage was trivial plumbing with no real domain risk | **Delete only** — do not invent speculative tests |
| Unclear | **Ambiguous** — do not delete; list it |

Replacement tests stay in the same module/area and assert behavior (status + error shape / state change / invariant).

### Orchestrator

1. Build the slice list from the partitioning rules.  
2. Spawn sub-agents in parallel batches (respect concurrency limits).  
3. Collect reports; fail a slice if post-edit tests fail (fix or revert before accepting).  
4. Merge all `ambiguous[]` into **one** final list (dedupe by path + test name, sort by path):  
   `docs/superpowers/specs/<cleanup-date>-test-cleanup-ambiguous.md`  
   (use the calendar date when cleanup execution starts).  
5. Human reviews the merged ambiguous list before any further deletes from that list.

### Verification

- **BE:** `./scripts/run_backend_tests.sh <affected module>` (always `--keepdb` via script).  
- **FE:** targeted Vitest on touched files/dirs.  
- Slice incomplete / too large → split and re-queue; do not silently skip.

### Failure / conflict handling

- Exclusive dirs prevent double-edits; if duplicate reports appear, keep the first and flag the duplicate.  
- No production-code edits outside adding replacement tests in test files.  
- Never commit secrets.

### Report schema (per slice)

```text
slice: <dir>
deleted:
  - path: ...
    test_name: ...
    reason: obvious-smoke | tautology | setup-theater
replaced:
  - path: ...
    removed_test: ...
    added_tests: [...]
    reason: sole-coverage-nontrivial
ambiguous:
  - path: ...
    test_name: ...
    reason: ...
    notes: ...
```

---

## Implementation phase deliverables (after plan execution starts)

1. Add `.cursor/rules/high-value-tests.mdc` (monorepo; mirror to BE/FE as needed for git).  
2. Run parallel cleanup per this playbook.  
3. Publish merged ambiguous list for review.  
4. PR(s) or commits per batch as the execution plan specifies.

## Testing of this work itself

- After rule addition: no suite run required beyond confirming the rule file is present and scoped correctly.  
- After each cleanup batch: run affected BE/FE targets; do not claim a slice done without green targeted tests.

## Open points resolved

- Deletions happen **only after** the implementation plan is written **and** you approve executing it.  
- Visual Companion not used (lofi/text per workspace brainstorming rule).
