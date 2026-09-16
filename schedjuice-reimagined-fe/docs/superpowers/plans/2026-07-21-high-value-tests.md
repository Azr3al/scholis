# High-Value Tests Rule + Parallel Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Cursor rule that prefers edge/unhappy-path tests over verbose low-value ones, then clean the full BE+FE suites via directory-owned parallel sub-agents with a single merged ambiguous list.

**Architecture:** One shared `high-value-tests.mdc` rule (monorepo + mirrored into BE/FE for git). Cleanup uses exclusive directory slices; each sub-agent deletes obvious low-value tests (replace only for sole non-trivial coverage), emits ambiguous candidates, and the orchestrator merges those into one review doc. No CI heuristics in this pass.

**Tech Stack:** Cursor rules (`.mdc`), Django/`manage.py test` via `./scripts/run_backend_tests.sh` (`--keepdb`), Vitest via `pnpm test:unit`, Python merge script for ambiguous reports.

**Spec:** `docs/superpowers/specs/2026-07-21-high-value-tests-design.md`

## Global Constraints

- Do **not** delete tests until Task 3+ (after the rule and inventory exist).
- Skip `worktrees/` always.
- **Obvious → delete** (or delete+replace per sole-coverage); **ambiguous → never delete** in the first pass.
- Sole-coverage replace: only when the removed test was the **only** coverage of a **non-trivial** behavior (auth/RBAC, tenant isolation, validation, money/attendance/schedule invariants, state transitions, idempotency/conflict). Otherwise delete-only or mark ambiguous.
- Keep at most one thin success path per behavior unit when it unlocks edge cases.
- No production-code edits except adding replacement tests inside test modules.
- BE verification: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh <module>` (always `--keepdb`).
- FE verification: `cd schedjuice-reimagined-fe && pnpm test:unit -- <path>`.
- Sub-agent models: `composer-2.5-fast` or `grok-4.5-fast-xhigh` unless the user names another.
- Parallel batches: recommend **4–6** sub-agents at a time to avoid thrash; exclusive dirs prevent file conflicts.
- Ambiguous merge output: `docs/superpowers/specs/<cleanup-date>-test-cleanup-ambiguous.md` (calendar date when cleanup starts).

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `.cursor/rules/high-value-tests.mdc` | Create (monorepo) | Always-on rubric for agents writing/editing tests |
| `schedjuice-reimagined-be/.cursor/rules/high-value-tests.mdc` | Create | Git-tracked mirror of the rule |
| `schedjuice-reimagined-fe/.cursor/rules/high-value-tests.mdc` | Create | Git-tracked mirror of the rule |
| `docs/superpowers/specs/2026-07-21-test-cleanup-slices.md` | Create | Authoritative slice inventory + IDs |
| `docs/tools/merge_test_cleanup_reports.py` | Create | Merge per-slice YAML/JSON reports → ambiguous markdown |
| `docs/superpowers/specs/test-cleanup-report.schema.md` | Create | Report field contract for sub-agents |
| `docs/superpowers/specs/<cleanup-date>-test-cleanup-ambiguous.md` | Create (Task 7) | Orchestrator-compiled ambiguous list |
| `docs/superpowers/specs/<cleanup-date>-test-cleanup-deleted.md` | Create (Task 7) | Optional rollup of deletes for PR notes |
| Per-slice reports under `docs/superpowers/specs/cleanup-reports/<slice-id>.yaml` | Create during cleanup | Sub-agent outputs |

---

### Task 1: Add the Cursor rule (all three locations)

**Files:**
- Create: `.cursor/rules/high-value-tests.mdc`
- Create: `schedjuice-reimagined-be/.cursor/rules/high-value-tests.mdc`
- Create: `schedjuice-reimagined-fe/.cursor/rules/high-value-tests.mdc`

**Interfaces:**
- Consumes: rubric from the design spec
- Produces: identical rule content in three paths (monorepo for local agents; BE/FE for git)

- [ ] **Step 1: Write the rule file**

Create all three files with **identical** content:

```markdown
---
description: Prefer high-value edge/unhappy-path tests; avoid verbose low-value smoke and tautologies
alwaysApply: true
---

# High-value tests

When writing or editing tests in `schedjuice-reimagined-be` or `schedjuice-reimagined-fe`, prefer tests that protect real risk. Do not add verbose low-value coverage.

## Prefer

- Auth/RBAC denials, wrong-tenant, missing/invalid input, empty collections, boundary values
- Idempotency, conflict/overlap, partial failure, rollback, cache miss/stale
- Asserts on behavior: status **and** error shape / state change / invariant
- At most **one** thin success path per behavior unit, and only when it unlocks or contrasts edge/auth/error cases in the same module

## Never (low-value)

1. Happy-path-only smoke (`status_code == 200`, "renders", field presence) with little behavioral risk
2. Tautologies / re-testing framework or library behavior / mirroring implementation line-for-line
3. Heavy fixture setup for a trivial assertion

## Examples

### Django — BAD

```python
def test_list_ok(self):
    resp = self.client.get(URL)
    self.assertEqual(resp.status_code, 200)
```

### Django — GOOD

```python
def test_list_forbidden_for_teacher(self):
    resp = self._client(self.teacher).get(URL)
    self.assertEqual(resp.status_code, 403)

def test_list_rejects_invalid_month(self):
    resp = self._client(self.hr_user).post(URL, {"month": 13}, format="json")
    self.assertEqual(resp.status_code, 400)
    self.assertIn("month", resp.json().get("details", resp.json()))
```

### Vitest — BAD

```ts
it("renders", () => {
  render(<Widget />);
  expect(screen.getByRole("button")).toBeTruthy();
});
```

### Vitest — GOOD

```ts
it("disables submit when amount is empty", async () => {
  render(<PaymentForm />);
  await userEvent.click(screen.getByRole("button", { name: /submit/i }));
  expect(screen.getByText(/amount is required/i)).toBeInTheDocument();
});
```

## Cleanup

Full-suite cleanup uses directory slices and the playbook in
`docs/superpowers/specs/2026-07-21-high-value-tests-design.md`.
Do not duplicate `--keepdb` / Docker run rules here.
```

- [ ] **Step 2: Verify files exist and match**

```bash
diff -q \
  /Users/jamesthiha/programming/schedjuice/.cursor/rules/high-value-tests.mdc \
  /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-be/.cursor/rules/high-value-tests.mdc
diff -q \
  /Users/jamesthiha/programming/schedjuice/.cursor/rules/high-value-tests.mdc \
  /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-fe/.cursor/rules/high-value-tests.mdc
```

Expected: no output (files identical).

- [ ] **Step 3: Commit in BE and FE**

```bash
cd /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-be
git add .cursor/rules/high-value-tests.mdc
git commit -m "$(cat <<'EOF'
chore(cursor): add high-value tests rule

EOF
)"

cd /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-fe
git add .cursor/rules/high-value-tests.mdc
git commit -m "$(cat <<'EOF'
chore(cursor): add high-value tests rule

EOF
)"
```

---

### Task 2: Slice inventory, report schema, merge script

**Files:**
- Create: `docs/superpowers/specs/2026-07-21-test-cleanup-slices.md` (workspace + copy into BE/FE `docs/superpowers/specs/`)
- Create: `docs/superpowers/specs/test-cleanup-report.schema.md` (same)
- Create: `docs/tools/merge_test_cleanup_reports.py` (workspace; also copy to BE `docs/tools/` or keep workspace-only — **commit under BE** at `docs/tools/merge_test_cleanup_reports.py` and FE mirror optional)

**Interfaces:**
- Consumes: directory layout under BE/FE
- Produces: stable `slice_id` list; YAML report contract; `merge_test_cleanup_reports.py` CLI

- [ ] **Step 1: Write the slice inventory**

Create `docs/superpowers/specs/2026-07-21-test-cleanup-slices.md` with this content (copy to BE and FE specs dirs):

```markdown
# Test cleanup slices (2026-07-21)

Exclusive ownership. Skip `worktrees/`. Paths relative to each repo root unless noted.

## Backend (`schedjuice-reimagined-be`)

| slice_id | path |
|----------|------|
| be-app_ai | app_ai/tests |
| be-app_announcement | app_announcement/tests |
| be-app_attachment | app_attachment/tests |
| be-app_attendance | app_attendance/tests |
| be-app_auth | app_auth/tests |
| be-app_certificates | app_certificates/tests |
| be-app_chat | app_chat/tests |
| be-app_course | app_course/tests |
| be-app_crm | app_crm/tests |
| be-app_custom_fields | app_custom_fields/tests |
| be-app_demo | app_demo/tests |
| be-app_finance | app_finance/tests |
| be-app_grading_reports | app_grading_reports/tests |
| be-app_hr | app_hr/tests |
| be-app_microsoft | app_microsoft/tests |
| be-app_organization | app_organization/tests |
| be-app_points | app_points/tests |
| be-app_product_docs | app_product_docs/tests |
| be-app_quiz | app_quiz/tests |
| be-app_quiz_v3 | app_quiz_v3/tests |
| be-app_rbac | app_rbac/tests |
| be-app_reports | app_reports/tests |
| be-app_tasks | app_tasks/tests |
| be-app_telegram | app_telegram/tests |
| be-app_userlog | app_userlog/tests |
| be-app_utility_notifications | app_utility_notifications/tests |
| be-app_utils | app_utils/tests |
| be-app_zoom | app_zoom/tests |
| be-utilitas | utilitas/tests |

## Frontend (`schedjuice-reimagined-fe`)

| slice_id | path (under `src/`) | notes |
|----------|---------------------|-------|
| fe-helpers | helpers | |
| fe-hooks | hooks | |
| fe-config | config | |
| fe-types | types | |
| fe-sdk | sdk | |
| fe-lib-root | lib | **only** `src/lib/*.test.ts(x)` (maxdepth 1), not subdirs |
| fe-lib-__tests__ | lib/__tests__ | |
| fe-lib-ai | lib/ai | |
| fe-lib-attachment | lib/attachment | skip if no tests |
| fe-lib-autosave | lib/autosave | skip if no tests |
| fe-lib-changelog | lib/changelog | |
| fe-lib-chat | lib/chat | |
| fe-lib-chat-threads | lib/chat-threads | |
| fe-lib-course | lib/course | |
| fe-lib-custom-fields | lib/custom-fields | |
| fe-lib-data-sheets | lib/data-sheets | |
| fe-lib-finances | lib/finances | |
| fe-lib-fullscreen | lib/fullscreen | |
| fe-lib-grading | lib/grading | |
| fe-lib-id-card | lib/id-card | |
| fe-lib-imports | lib/imports | |
| fe-lib-layout | lib/layout | |
| fe-lib-linking | lib/linking | |
| fe-lib-microsoft | lib/microsoft | |
| fe-lib-org | lib/org | |
| fe-lib-payroll | lib/payroll | |
| fe-lib-points | lib/points | |
| fe-lib-product-docs | lib/product-docs | |
| fe-lib-rbac | lib/rbac | |
| fe-lib-sj | lib/sj | |
| fe-lib-sound | lib/sound | |
| fe-lib-subjects | lib/subjects | |
| fe-lib-ui | lib/ui | |
| fe-lib-ui-remediation | lib/ui-remediation | |
| fe-lib-user | lib/user | |
| fe-lib-user-logs | lib/user-logs | |
| fe-lib-users | lib/users | |
| fe-lib-web-push | lib/web-push | |
| fe-components-attachment-uploader | components/attachment-uploader | |
| fe-components-attendance | components/attendance | |
| fe-components-auth | components/auth | |
| fe-components-auto-form | components/auto-form | |
| fe-components-camera | components/camera | |
| fe-components-course | components/course | |
| fe-components-data-sheet | components/data-sheet | |
| fe-components-data-table | components/data-table | |
| fe-components-date | components/date | |
| fe-components-edit-kit | components/edit-kit | |
| fe-components-filters | components/filters | |
| fe-components-form | components/form | |
| fe-components-home | components/home | |
| fe-components-images | components/images | |
| fe-components-import-grid | components/import-grid | |
| fe-components-import-wizard | components/import-wizard | |
| fe-components-internal | components/internal | |
| fe-components-layout | components/layout | |
| fe-components-loading | components/loading | |
| fe-components-microsoft | components/microsoft | |
| fe-components-nav | components/nav | |
| fe-components-organization | components/organization | |
| fe-components-points | components/points | |
| fe-components-primitives | components/primitives | |
| fe-components-quiz-v3 | components/quiz-v3 | |
| fe-components-rbac | components/rbac | |
| fe-components-record | components/record | |
| fe-components-scheduling | components/scheduling | |
| fe-components-shell | components/shell | |
| fe-components-users | components/users | |

If a slice path has zero test files at dispatch time, mark the report `deleted: []`, `ambiguous: []`, `skipped: true` and move on.
If a slice is too large and the agent stalls, split alphabetically (e.g. `fe-helpers-a-m` / `fe-helpers-n-z`) and re-queue — never silently skip work.
```

- [ ] **Step 2: Write the report schema doc**

Create `docs/superpowers/specs/test-cleanup-report.schema.md` with:

- Title: `# Test cleanup slice report schema`
- Instruction: each sub-agent writes `docs/superpowers/specs/cleanup-reports/<slice_id>.yaml`
- Example YAML body (exact fields):

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

Also document: `deleted[].reason` ∈ `obvious-smoke` | `tautology` | `setup-theater`; `ambiguous[].reason` is a short slug plus `notes`.

- [ ] **Step 3: Write the merge script**

Create `schedjuice-reimagined-be/docs/tools/merge_test_cleanup_reports.py` (and copy to workspace `docs/tools/`):

```python
#!/usr/bin/env python3
"""Merge per-slice cleanup YAML reports into one ambiguous markdown list."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    print("PyYAML required: pip install pyyaml", file=sys.stderr)
    sys.exit(1)


def load_reports(directory: Path) -> list[dict]:
    reports = []
    for path in sorted(directory.glob("*.yaml")):
        data = yaml.safe_load(path.read_text()) or {}
        data["_report_file"] = str(path)
        reports.append(data)
    return reports


def merge_ambiguous(reports: list[dict]) -> list[dict]:
    seen: set[tuple[str, str, str]] = set()
    rows: list[dict] = []
    for report in reports:
        repo = report.get("repo", "")
        for item in report.get("ambiguous") or []:
            key = (repo, item.get("path", ""), item.get("test_name", ""))
            if key in seen:
                continue
            seen.add(key)
            rows.append(
                {
                    "repo": repo,
                    "slice_id": report.get("slice_id", ""),
                    "path": item.get("path", ""),
                    "test_name": item.get("test_name", ""),
                    "reason": item.get("reason", ""),
                    "notes": item.get("notes", ""),
                }
            )
    rows.sort(key=lambda r: (r["repo"], r["path"], r["test_name"]))
    return rows


def merge_deleted(reports: list[dict]) -> list[dict]:
    rows: list[dict] = []
    for report in reports:
        repo = report.get("repo", "")
        for item in report.get("deleted") or []:
            rows.append(
                {
                    "repo": repo,
                    "slice_id": report.get("slice_id", ""),
                    "path": item.get("path", ""),
                    "test_name": item.get("test_name", ""),
                    "reason": item.get("reason", ""),
                }
            )
    rows.sort(key=lambda r: (r["repo"], r["path"], r["test_name"]))
    return rows


def to_ambiguous_md(rows: list[dict], cleanup_date: str) -> str:
    lines = [
        f"# Test cleanup — ambiguous candidates ({cleanup_date})",
        "",
        "Review before any further deletes. Generated by `merge_test_cleanup_reports.py`.",
        "",
        "| repo | slice_id | path | test_name | reason | notes |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for r in rows:
        notes = (r.get("notes") or "").replace("|", "\\|").replace("\n", " ")
        lines.append(
            f"| {r['repo']} | {r['slice_id']} | {r['path']} | `{r['test_name']}` | {r['reason']} | {notes} |"
        )
    lines.append("")
    return "\n".join(lines)


def to_deleted_md(rows: list[dict], cleanup_date: str) -> str:
    lines = [
        f"# Test cleanup — deleted (obvious) ({cleanup_date})",
        "",
        "| repo | slice_id | path | test_name | reason |",
        "| --- | --- | --- | --- | --- |",
    ]
    for r in rows:
        lines.append(
            f"| {r['repo']} | {r['slice_id']} | {r['path']} | `{r['test_name']}` | {r['reason']} |"
        )
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--reports-dir",
        type=Path,
        required=True,
        help="Directory of per-slice YAML reports",
    )
    parser.add_argument("--cleanup-date", required=True, help="YYYY-MM-DD")
    parser.add_argument(
        "--out-ambiguous",
        type=Path,
        required=True,
        help="Output markdown for ambiguous list",
    )
    parser.add_argument(
        "--out-deleted",
        type=Path,
        required=True,
        help="Output markdown for deleted rollup",
    )
    args = parser.parse_args()

    reports = load_reports(args.reports_dir)
    if not reports:
        print(f"No YAML reports in {args.reports_dir}", file=sys.stderr)
        return 1

    args.out_ambiguous.write_text(
        to_ambiguous_md(merge_ambiguous(reports), args.cleanup_date)
    )
    args.out_deleted.write_text(
        to_deleted_md(merge_deleted(reports), args.cleanup_date)
    )
    print(f"Wrote {args.out_ambiguous}")
    print(f"Wrote {args.out_deleted}")
    print(f"Reports merged: {len(reports)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: Smoke-test the merge script**

```bash
mkdir -p /tmp/cleanup-reports-smoke
cat > /tmp/cleanup-reports-smoke/be-app_hr.yaml <<'EOF'
slice_id: be-app_hr
repo: schedjuice-reimagined-be
path: app_hr/tests
ambiguous:
  - path: app_hr/tests/test_x.py
    test_name: T.test_a
    reason: unclear
    notes: n1
deleted:
  - path: app_hr/tests/test_x.py
    test_name: T.test_b
    reason: obvious-smoke
EOF
cd /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-be
./env/bin/python docs/tools/merge_test_cleanup_reports.py \
  --reports-dir /tmp/cleanup-reports-smoke \
  --cleanup-date 2026-07-21 \
  --out-ambiguous /tmp/ambiguous-smoke.md \
  --out-deleted /tmp/deleted-smoke.md
head -20 /tmp/ambiguous-smoke.md
```

Expected: script exits 0; markdown table includes `T.test_a`.

If `yaml` missing in venv: `./env/bin/pip install pyyaml` then retry (or use system python with pyyaml).

- [ ] **Step 5: Commit inventory + schema + script**

```bash
# workspace copies under docs/ — also commit in BE (and FE for markdown copies)
cd /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-be
mkdir -p docs/superpowers/specs/cleanup-reports docs/tools
# ensure files from steps 1–3 are in place
git add \
  docs/superpowers/specs/2026-07-21-test-cleanup-slices.md \
  docs/superpowers/specs/test-cleanup-report.schema.md \
  docs/tools/merge_test_cleanup_reports.py \
  docs/superpowers/specs/cleanup-reports/.gitkeep
# create empty .gitkeep if needed
touch docs/superpowers/specs/cleanup-reports/.gitkeep
git add docs/superpowers/specs/cleanup-reports/.gitkeep
git commit -m "$(cat <<'EOF'
docs: test cleanup slice inventory and merge tooling

EOF
)"

cd /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-fe
mkdir -p docs/superpowers/specs
# copy the two markdown files from BE/workspace
git add \
  docs/superpowers/specs/2026-07-21-test-cleanup-slices.md \
  docs/superpowers/specs/test-cleanup-report.schema.md
git commit -m "$(cat <<'EOF'
docs: test cleanup slice inventory and report schema

EOF
)"
```

---

### Task 3: Pilot BE slice `be-app_hr`

**Files:**
- Modify: only under `schedjuice-reimagined-be/app_hr/tests/`
- Create: `docs/superpowers/specs/cleanup-reports/be-app_hr.yaml`

**Interfaces:**
- Consumes: rubric + sub-agent prompt below
- Produces: edits in `app_hr/tests`, YAML report, green `./scripts/run_backend_tests.sh app_hr.tests`

- [ ] **Step 1: Dispatch one sub-agent with this exact prompt**

```text
You are cleaning low-value tests in ONE directory slice only.

slice_id: be-app_hr
repo: schedjuice-reimagined-be
path: app_hr/tests
workspace root: /Users/jamesthiha/programming/schedjuice

Read and follow:
- docs/superpowers/specs/2026-07-21-high-value-tests-design.md
- docs/superpowers/specs/test-cleanup-report.schema.md
- .cursor/rules/high-value-tests.mdc

Rules:
1. Only edit files under app_hr/tests/ (plus write the YAML report).
2. Delete OBVIOUS low-value tests (obvious-smoke / tautology / setup-theater).
3. Do NOT delete ambiguous tests — list them in ambiguous[].
4. If a deleted test was the ONLY coverage of non-trivial behavior, replace with 1–3 edge/unhappy tests in the same module. Otherwise delete-only.
5. Keep at most one thin success path per behavior unit when it unlocks edge cases.
6. After edits, run: cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_hr.tests
7. Write report to: schedjuice-reimagined-be/docs/superpowers/specs/cleanup-reports/be-app_hr.yaml
8. Return a short summary of deleted / replaced / ambiguous counts.

Model: composer-2.5-fast or grok-4.5-fast-xhigh.
```

- [ ] **Step 2: Review the pilot report and diff**

Confirm:
- No edits outside `app_hr/tests/`
- Every `deleted` entry has a clear reason
- Ambiguous items were not deleted
- `verification.passed: true`

- [ ] **Step 3: Commit the pilot**

```bash
cd /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-be
git add app_hr/tests docs/superpowers/specs/cleanup-reports/be-app_hr.yaml
git commit -m "$(cat <<'EOF'
test(hr): remove low-value tests; keep edge coverage

EOF
)"
```

---

### Task 4: Pilot FE slice `fe-hooks`

**Files:**
- Modify: only under `schedjuice-reimagined-fe/src/hooks/`
- Create: `schedjuice-reimagined-be/docs/superpowers/specs/cleanup-reports/fe-hooks.yaml`  
  (store **all** slice reports in the BE reports dir for one merge input; also acceptable: workspace `docs/superpowers/specs/cleanup-reports/`)

**Interfaces:**
- Consumes: same rubric
- Produces: FE test edits + YAML report + green Vitest

- [ ] **Step 1: Dispatch sub-agent**

```text
You are cleaning low-value tests in ONE directory slice only.

slice_id: fe-hooks
repo: schedjuice-reimagined-fe
path: src/hooks
workspace root: /Users/jamesthiha/programming/schedjuice

Read and follow:
- docs/superpowers/specs/2026-07-21-high-value-tests-design.md
- docs/superpowers/specs/test-cleanup-report.schema.md
- .cursor/rules/high-value-tests.mdc

Rules:
1. Only edit test files under src/hooks/ (plus write the YAML report).
2. Delete OBVIOUS low-value tests; list ambiguous; do not delete ambiguous.
3. Sole-coverage replace rule applies (1–3 edge/unhappy tests max when needed).
4. After edits, run: cd schedjuice-reimagined-fe && pnpm test:unit -- src/hooks
5. Write report to: schedjuice-reimagined-be/docs/superpowers/specs/cleanup-reports/fe-hooks.yaml
6. Return deleted / replaced / ambiguous counts.

Model: composer-2.5-fast or grok-4.5-fast-xhigh.
```

- [ ] **Step 2: Review + commit**

```bash
cd /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-fe
git add src/hooks
git commit -m "$(cat <<'EOF'
test(hooks): remove low-value tests; keep edge coverage

EOF
)"

cd /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-be
git add docs/superpowers/specs/cleanup-reports/fe-hooks.yaml
git commit -m "$(cat <<'EOF'
docs: fe-hooks test cleanup report

EOF
)"
```

---

### Task 5: Parallel BE cleanup (remaining slices)

**Files:**
- Modify: each remaining `app_*/tests` and `utilitas/tests` (exclusive per sub-agent)
- Create: `docs/superpowers/specs/cleanup-reports/<slice_id>.yaml` per slice

**Interfaces:**
- Consumes: prompt template below with `SLICE_ID` / `PATH` substituted
- Produces: one report per slice; green targeted tests per slice

**Remaining BE slices (skip `be-app_hr` already done):**  
`be-app_ai`, `be-app_announcement`, `be-app_attachment`, `be-app_attendance`, `be-app_auth`, `be-app_certificates`, `be-app_chat`, `be-app_course`, `be-app_crm`, `be-app_custom_fields`, `be-app_demo`, `be-app_finance`, `be-app_grading_reports`, `be-app_microsoft`, `be-app_organization`, `be-app_points`, `be-app_product_docs`, `be-app_quiz`, `be-app_quiz_v3`, `be-app_rbac`, `be-app_reports`, `be-app_tasks`, `be-app_telegram`, `be-app_userlog`, `be-app_utility_notifications`, `be-app_utils`, `be-app_zoom`, `be-utilitas`

- [ ] **Step 1: Use this prompt template for every BE slice**

```text
You are cleaning low-value tests in ONE directory slice only.

slice_id: {{SLICE_ID}}
repo: schedjuice-reimagined-be
path: {{PATH}}
workspace root: /Users/jamesthiha/programming/schedjuice

Read and follow:
- docs/superpowers/specs/2026-07-21-high-value-tests-design.md
- docs/superpowers/specs/test-cleanup-report.schema.md
- .cursor/rules/high-value-tests.mdc

Rules:
1. Only edit files under {{PATH}}/ (plus write the YAML report).
2. Delete OBVIOUS low-value tests (obvious-smoke | tautology | setup-theater).
3. Do NOT delete ambiguous tests — list them in ambiguous[].
4. Sole-coverage replace: if deleted test was only coverage of non-trivial behavior, add 1–3 edge/unhappy tests; else delete-only.
5. Keep at most one thin success path per behavior unit when it unlocks edge cases.
6. Verify: cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh {{DOTTED_MODULE}}
   where {{DOTTED_MODULE}} is path with / → . (e.g. app_finance/tests → app_finance.tests; utilitas/tests → utilitas.tests)
7. Write: schedjuice-reimagined-be/docs/superpowers/specs/cleanup-reports/{{SLICE_ID}}.yaml
8. If zero test files: skipped: true and empty lists.
9. Return deleted / replaced / ambiguous counts.

Model: composer-2.5-fast or grok-4.5-fast-xhigh.
```

- [ ] **Step 2: Dispatch in parallel batches of 4–6**

Suggested batch order (independent):

1. `be-app_ai`, `be-app_announcement`, `be-app_attachment`, `be-app_attendance`, `be-app_auth`, `be-app_certificates`
2. `be-app_chat`, `be-app_course`, `be-app_crm`, `be-app_custom_fields`, `be-app_demo`, `be-app_finance`
3. `be-app_grading_reports`, `be-app_microsoft`, `be-app_organization`, `be-app_points`, `be-app_product_docs`, `be-app_quiz`
4. `be-app_quiz_v3`, `be-app_rbac`, `be-app_reports`, `be-app_tasks`, `be-app_telegram`, `be-app_userlog`
5. `be-app_utility_notifications`, `be-app_utils`, `be-app_zoom`, `be-utilitas`

For each finished slice: review report + diff; if verification failed, fix or revert that slice before accepting.

- [ ] **Step 3: Commit after each successful batch**

```bash
cd /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-be
git add app_*/tests utilitas/tests docs/superpowers/specs/cleanup-reports/
git status
# stage only files from the completed batch, then:
git commit -m "$(cat <<'EOF'
test: remove low-value tests in batch N (BE slices)

EOF
)"
```

(Replace commit message batch number / slice names with the actual batch.)

---

### Task 6: Parallel FE cleanup (remaining slices)

**Files:**
- Modify: only under each assigned `src/...` path
- Create: `cleanup-reports/<slice_id>.yaml` for each

**Remaining FE slices (skip `fe-hooks`):** all other `fe-*` rows from the inventory.

- [ ] **Step 1: Prompt template**

```text
You are cleaning low-value tests in ONE directory slice only.

slice_id: {{SLICE_ID}}
repo: schedjuice-reimagined-fe
path: src/{{REL_PATH}}
workspace root: /Users/jamesthiha/programming/schedjuice

Special case fe-lib-root: only edit src/lib/*.test.ts and src/lib/*.test.tsx (maxdepth 1). Do not touch lib subdirectories.

Read and follow:
- docs/superpowers/specs/2026-07-21-high-value-tests-design.md
- docs/superpowers/specs/test-cleanup-report.schema.md
- .cursor/rules/high-value-tests.mdc

Rules:
1. Only edit test files under your path (plus YAML report).
2. Delete obvious low-value tests; list ambiguous; never delete ambiguous.
3. Sole-coverage replace rule (1–3 edge/unhappy tests when needed).
4. Verify: cd schedjuice-reimagined-fe && pnpm test:unit -- src/{{REL_PATH}}
   For fe-lib-root: pnpm test:unit -- src/lib/*.test.ts src/lib/*.test.tsx
5. Write: schedjuice-reimagined-be/docs/superpowers/specs/cleanup-reports/{{SLICE_ID}}.yaml
6. If zero tests: skipped: true.
7. Return counts.

Model: composer-2.5-fast or grok-4.5-fast-xhigh.
```

- [ ] **Step 2: Dispatch batches of 4–6**

Suggested order:

1. `fe-helpers`, `fe-config`, `fe-types`, `fe-sdk`, `fe-lib-root`, `fe-lib-__tests__`
2. Large lib dirs: `fe-lib-finances`, `fe-lib-custom-fields`, `fe-lib-imports`, `fe-lib-ui-remediation`, `fe-lib-id-card`, `fe-lib-ui`
3. Remaining `fe-lib-*`
4. Large components: `fe-components-data-table`, `fe-components-attendance`, `fe-components-data-sheet`, `fe-components-auto-form`, `fe-components-scheduling`, `fe-components-form`
5. Remaining `fe-components-*`

- [ ] **Step 3: Commit FE changes per batch; commit YAML reports in BE**

```bash
cd /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-fe
git add src/
git commit -m "$(cat <<'EOF'
test: remove low-value tests in FE batch N

EOF
)"

cd /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-be
git add docs/superpowers/specs/cleanup-reports/
git commit -m "$(cat <<'EOF'
docs: FE test cleanup reports batch N

EOF
)"
```

---

### Task 7: Orchestrator merge — one ambiguous list

**Files:**
- Create: `docs/superpowers/specs/<CLEANUP_DATE>-test-cleanup-ambiguous.md`
- Create: `docs/superpowers/specs/<CLEANUP_DATE>-test-cleanup-deleted.md`
- Copy into BE (and FE optional) `docs/superpowers/specs/`

**Interfaces:**
- Consumes: all `cleanup-reports/*.yaml`
- Produces: single deduped ambiguous markdown + deleted rollup

- [ ] **Step 1: Confirm every slice has a report**

```bash
# Expected: one yaml per non-skipped slice from inventory
ls /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-be/docs/superpowers/specs/cleanup-reports/*.yaml | wc -l
```

Compare against inventory; re-dispatch any missing `slice_id`.

- [ ] **Step 2: Run merge**

```bash
CLEANUP_DATE=$(date +%Y-%m-%d)   # or the date cleanup started, e.g. 2026-07-21
cd /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-be
./env/bin/python docs/tools/merge_test_cleanup_reports.py \
  --reports-dir docs/superpowers/specs/cleanup-reports \
  --cleanup-date "$CLEANUP_DATE" \
  --out-ambiguous "docs/superpowers/specs/${CLEANUP_DATE}-test-cleanup-ambiguous.md" \
  --out-deleted "docs/superpowers/specs/${CLEANUP_DATE}-test-cleanup-deleted.md"
```

Expected: both files written; ambiguous table sorted by repo/path/test_name.

- [ ] **Step 3: Copy to workspace + FE docs; commit**

```bash
cp "docs/superpowers/specs/${CLEANUP_DATE}-test-cleanup-ambiguous.md" \
   /Users/jamesthiha/programming/schedjuice/docs/superpowers/specs/
cp "docs/superpowers/specs/${CLEANUP_DATE}-test-cleanup-deleted.md" \
   /Users/jamesthiha/programming/schedjuice/docs/superpowers/specs/

git add "docs/superpowers/specs/${CLEANUP_DATE}-test-cleanup-ambiguous.md" \
        "docs/superpowers/specs/${CLEANUP_DATE}-test-cleanup-deleted.md" \
        docs/superpowers/specs/cleanup-reports/
git commit -m "$(cat <<'EOF'
docs: compile test cleanup ambiguous and deleted rollups

EOF
)"

# FE copy of ambiguous list for discoverability
cp "docs/superpowers/specs/${CLEANUP_DATE}-test-cleanup-ambiguous.md" \
   /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-fe/docs/superpowers/specs/
cd /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-fe
git add "docs/superpowers/specs/${CLEANUP_DATE}-test-cleanup-ambiguous.md"
git commit -m "$(cat <<'EOF'
docs: test cleanup ambiguous list

EOF
)"
```

- [ ] **Step 4: Stop for human review**

Do **not** delete items from the ambiguous list until the user reviews  
`docs/superpowers/specs/<CLEANUP_DATE>-test-cleanup-ambiguous.md` and explicitly asks for a second pass.

---

### Task 8: Final sanity (optional same session)

**Files:** none required beyond fixing any red tests found

- [ ] **Step 1: Spot-check a few hot modules still green**

```bash
cd /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_hr.tests
./scripts/run_backend_tests.sh app_finance.tests

cd /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-fe
pnpm test:unit -- src/helpers
pnpm test:unit -- src/hooks
```

Expected: PASS (or known pre-existing failures unrelated to cleanup — do not “fix” unrelated failures by deleting more tests).

- [ ] **Step 2: Confirm rule still present**

```bash
test -f /Users/jamesthiha/programming/schedjuice/.cursor/rules/high-value-tests.mdc && echo OK
```

---

## Sub-agent routing cheat sheet (orchestrator)

| Wave | Action |
|------|--------|
| 0 | Tasks 1–2 (rule + inventory + merge tool) — sequential, no cleanup |
| 1 | Task 3 pilot BE + Task 4 pilot FE — sequential or 2 parallel |
| 2 | Task 5 BE batches — parallel 4–6 |
| 3 | Task 6 FE batches — parallel 4–6 |
| 4 | Task 7 merge + human gate |
| 5 | Task 8 sanity |

Each cleanup sub-agent gets **exactly one** `slice_id` and must not touch other slices.

---

## Plan self-review

| Spec requirement | Task |
|------------------|------|
| Cursor rule with rubric + examples | Task 1 |
| Full BE+FE audit, parallel by directory | Tasks 3–6 + cheat sheet |
| Obvious delete / ambiguous list / orchestrator merge | Tasks 3–7 |
| Sole-coverage replace | Prompt in Tasks 3–6 |
| Planning gate before delete | Tasks 1–2 before 3; execution only after user starts plan |
| No CI heuristics | Not in any task |
| `--keepdb` / Vitest verify | Prompt verification steps |
| One final ambiguous list | Task 7 |
| Skip worktrees | Inventory + prompts |

No TBD/placeholder steps remain; slice IDs and prompts are concrete.
