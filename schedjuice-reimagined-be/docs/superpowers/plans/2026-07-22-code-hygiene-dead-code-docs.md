# Code Hygiene (Dead Code / Docs / Worktrees) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prune idle clean git worktrees (≥7 days), then remove obvious dead code and outdated source-adjacent docs/comments in BE+FE via directory-owned parallel sub-agents, merge ambiguous findings, and add a thin Cursor prevention rule.

**Architecture:** Worktree prune is a scripted pass first (inventory → remove eligible → report). Code/docs hygiene mirrors the high-value-tests playbook: exclusive slices, obvious auto-fix/fix, ambiguous YAML reports, orchestrator merge. Optional Knip/vulture are hints only. Cursor rule lands after cleanup.

**Tech Stack:** Git worktrees, Bash/Python prune + merge scripts, Cursor `.mdc` rules, Django tests via `./scripts/run_backend_tests.sh` (`--keepdb`), Vitest via `pnpm test:unit`.

**Spec:** `docs/superpowers/specs/2026-07-22-code-hygiene-dead-code-docs-design.md`

## Global Constraints

- Do **not** delete production code or worktrees until the matching task says so (Task 2+ for worktrees; Task 3+ for code).
- Skip scanning code inside `worktrees/` / `.worktrees/` — those paths are prune targets only.
- **Obvious → delete/fix**; **ambiguous → never delete** in the first pass.
- Anti-patterns: only high-confidence / severe / local low-risk.
- Never delete migrations, permission codenames, or schema fields.
- Docs scope: source-adjacent only (inline comments, module READMEs, AGENTS.md / Cursor rules). Skip historical `docs/superpowers/specs/` design archives.
- BE verification: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh <module>` (always `--keepdb`).
- FE verification: `cd schedjuice-reimagined-fe && pnpm test:unit -- <path>` when tests exist; otherwise note `verification.skipped` with reason.
- Sub-agent models: `composer-2.5-fast` or `grok-4.5-fast-xhigh` unless the user names another.
- Parallel batches: **4–6** sub-agents at a time; exclusive dirs prevent file conflicts.
- Reports directory (single merge input): `schedjuice-reimagined-be/docs/superpowers/specs/hygiene-reports/` (also mirror markdown rollups to FE/workspace).
- Cleanup date for rollup filenames: calendar date when cleanup **execution** starts (expected `2026-07-22` if run same day).

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `docs/superpowers/specs/2026-07-22-hygiene-slices.md` | Create (exists in workspace; copy to BE/FE) | Authoritative slice inventory |
| `docs/superpowers/specs/hygiene-report.schema.md` | Already created | Report field contract |
| `docs/tools/merge_hygiene_reports.py` | Create; commit under BE `docs/tools/` | Merge slice YAML → ambiguous/deleted markdown |
| `docs/tools/prune_idle_worktrees.py` | Create; commit under BE `docs/tools/` | Inventory + prune clean worktrees idle ≥7d |
| `.cursor/rules/code-hygiene.mdc` | Create after cleanup (Task 8) | Prevention rule; mirror BE/FE |
| `docs/superpowers/specs/<date>-hygiene-ambiguous.md` | Create (Task 8) | Merged ambiguous list |
| `docs/superpowers/specs/<date>-hygiene-deleted.md` | Create (Task 8) | Deleted/fixed rollup |
| `docs/superpowers/specs/<date>-worktree-prune.md` | Create (Task 2) | Worktree prune report |
| `docs/superpowers/specs/hygiene-reports/<slice_id>.yaml` | Create per slice | Sub-agent outputs |

---

### Task 1: Slice inventory + merge script

**Files:**
- Create/ensure: `docs/superpowers/specs/2026-07-22-hygiene-slices.md` (workspace + BE + FE copies)
- Ensure: `docs/superpowers/specs/hygiene-report.schema.md` (already present; copy if missing in a repo)
- Create: `schedjuice-reimagined-be/docs/tools/merge_hygiene_reports.py`
- Copy: `docs/tools/merge_hygiene_reports.py` (workspace mirror)

**Interfaces:**
- Consumes: slice layout; hygiene YAML schema (`deleted`, `fixed_docs`, `anti_pattern_fixes`, `ambiguous`)
- Produces: CLI `merge_hygiene_reports.py --reports-dir … --cleanup-date … --out-ambiguous … --out-deleted …`

- [ ] **Step 1: Confirm slices file exists and copy to BE/FE**

```bash
SRC=/Users/jamesthiha/programming/schedjuice/docs/superpowers/specs
test -f "$SRC/2026-07-22-hygiene-slices.md"
test -f "$SRC/hygiene-report.schema.md"
cp "$SRC/2026-07-22-hygiene-slices.md" \
  /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-be/docs/superpowers/specs/
cp "$SRC/2026-07-22-hygiene-slices.md" \
  /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-fe/docs/superpowers/specs/
cp "$SRC/hygiene-report.schema.md" \
  /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-be/docs/superpowers/specs/
cp "$SRC/hygiene-report.schema.md" \
  /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-fe/docs/superpowers/specs/
mkdir -p \
  /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-be/docs/superpowers/specs/hygiene-reports \
  /Users/jamesthiha/programming/schedjuice/docs/tools \
  /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-be/docs/tools
```

Expected: copies succeed; slices file lists `be-app_*`, `fe-lib-*`, `fe-components-*`, `fe-app-*`, and `meta-*`.

- [ ] **Step 2: Write `merge_hygiene_reports.py`**

Create identical content at:
- `/Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-be/docs/tools/merge_hygiene_reports.py`
- `/Users/jamesthiha/programming/schedjuice/docs/tools/merge_hygiene_reports.py`

```python
#!/usr/bin/env python3
"""Merge per-slice hygiene YAML reports into ambiguous + deleted markdown."""

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


def _rows_from(reports: list[dict], key: str) -> list[dict]:
    rows: list[dict] = []
    seen: set[tuple[str, str, str, str]] = set()
    for report in reports:
        repo = report.get("repo", "")
        slice_id = report.get("slice_id", "")
        for item in report.get(key) or []:
            path = item.get("path", "")
            symbol = item.get("symbol", "") or item.get("test_name", "")
            reason = item.get("reason", "")
            dedupe = (repo, path, symbol, reason)
            if dedupe in seen:
                continue
            seen.add(dedupe)
            rows.append(
                {
                    "repo": repo,
                    "slice_id": slice_id,
                    "path": path,
                    "symbol": symbol,
                    "reason": reason,
                    "notes": item.get("notes", ""),
                    "kind": key,
                }
            )
    rows.sort(key=lambda r: (r["repo"], r["path"], r["symbol"]))
    return rows


def to_ambiguous_md(rows: list[dict], cleanup_date: str) -> str:
    lines = [
        f"# Hygiene — ambiguous candidates ({cleanup_date})",
        "",
        "Review before any further deletes. Generated by `merge_hygiene_reports.py`.",
        "",
        "| repo | slice_id | path | symbol | reason | notes |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for r in rows:
        notes = (r.get("notes") or "").replace("|", "\\|").replace("\n", " ")
        sym = (r.get("symbol") or "").replace("|", "\\|")
        lines.append(
            f"| {r['repo']} | {r['slice_id']} | {r['path']} | `{sym}` | {r['reason']} | {notes} |"
        )
    lines.append("")
    return "\n".join(lines)


def to_deleted_md(deleted: list[dict], fixed_docs: list[dict], antifixes: list[dict], cleanup_date: str) -> str:
    lines = [
        f"# Hygiene — deleted / fixed (obvious) ({cleanup_date})",
        "",
        "## Deleted dead code",
        "",
        "| repo | slice_id | path | symbol | reason |",
        "| --- | --- | --- | --- | --- |",
    ]
    for r in deleted:
        sym = (r.get("symbol") or "").replace("|", "\\|")
        lines.append(
            f"| {r['repo']} | {r['slice_id']} | {r['path']} | `{sym}` | {r['reason']} |"
        )
    lines.extend(
        [
            "",
            "## Fixed docs/comments",
            "",
            "| repo | slice_id | path | reason |",
            "| --- | --- | --- | --- |",
        ]
    )
    for r in fixed_docs:
        lines.append(
            f"| {r['repo']} | {r['slice_id']} | {r['path']} | {r['reason']} |"
        )
    lines.extend(
        [
            "",
            "## Anti-pattern fixes",
            "",
            "| repo | slice_id | path | reason | notes |",
            "| --- | --- | --- | --- | --- |",
        ]
    )
    for r in antifixes:
        notes = (r.get("notes") or "").replace("|", "\\|").replace("\n", " ")
        lines.append(
            f"| {r['repo']} | {r['slice_id']} | {r['path']} | {r['reason']} | {notes} |"
        )
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reports-dir", type=Path, required=True)
    parser.add_argument("--cleanup-date", required=True)
    parser.add_argument("--out-ambiguous", type=Path, required=True)
    parser.add_argument("--out-deleted", type=Path, required=True)
    args = parser.parse_args()

    reports = load_reports(args.reports_dir)
    if not reports:
        print(f"No YAML reports in {args.reports_dir}", file=sys.stderr)
        return 1

    args.out_ambiguous.write_text(
        to_ambiguous_md(_rows_from(reports, "ambiguous"), args.cleanup_date)
    )
    args.out_deleted.write_text(
        to_deleted_md(
            _rows_from(reports, "deleted"),
            _rows_from(reports, "fixed_docs"),
            _rows_from(reports, "anti_pattern_fixes"),
            args.cleanup_date,
        )
    )
    print(f"Wrote {args.out_ambiguous}")
    print(f"Wrote {args.out_deleted}")
    print(f"Reports merged: {len(reports)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 3: Smoke-test the merge script**

```bash
mkdir -p /tmp/hygiene-reports-smoke
cat > /tmp/hygiene-reports-smoke/be-app_hr.yaml <<'EOF'
slice_id: be-app_hr
repo: schedjuice-reimagined-be
path: app_hr
deleted:
  - path: app_hr/services/legacy.py
    symbol: Legacy
    reason: unreferenced-module
    confidence: obvious
fixed_docs:
  - path: app_hr/README.md
    reason: described-removed-endpoint
    confidence: obvious
ambiguous:
  - path: app_hr/tasks.py
    symbol: refresh_cache
    reason: string-referenced-celery-name
    confidence: ambiguous
    notes: beat schedule string
EOF
cd /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-be
./env/bin/python docs/tools/merge_hygiene_reports.py \
  --reports-dir /tmp/hygiene-reports-smoke \
  --cleanup-date 2026-07-22 \
  --out-ambiguous /tmp/hygiene-ambiguous-smoke.md \
  --out-deleted /tmp/hygiene-deleted-smoke.md
grep -F 'refresh_cache' /tmp/hygiene-ambiguous-smoke.md
grep -F 'Legacy' /tmp/hygiene-deleted-smoke.md
```

Expected: exit 0; both greps match.

- [ ] **Step 4: Commit inventory + script**

```bash
cd /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-be
git add \
  docs/superpowers/specs/2026-07-22-hygiene-slices.md \
  docs/superpowers/specs/hygiene-report.schema.md \
  docs/tools/merge_hygiene_reports.py \
  docs/superpowers/specs/hygiene-reports/.gitkeep
git commit -m "$(cat <<'EOF'
docs: hygiene slice inventory and merge tooling

EOF
)"

cd /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-fe
git add \
  docs/superpowers/specs/2026-07-22-hygiene-slices.md \
  docs/superpowers/specs/hygiene-report.schema.md
git commit -m "$(cat <<'EOF'
docs: hygiene slice inventory and report schema

EOF
)"
```

---

### Task 2: Worktree prune (idle ≥ 7 days, clean only)

**Files:**
- Create: `schedjuice-reimagined-be/docs/tools/prune_idle_worktrees.py`
- Copy: `docs/tools/prune_idle_worktrees.py`
- Create: `docs/superpowers/specs/2026-07-22-worktree-prune.md` (+ BE/FE copies)

**Interfaces:**
- Consumes: `git worktree list --porcelain` from BE and FE repos
- Produces: removals for eligible worktrees; markdown prune report
- Eligibility: working tree clean **and** `max(branch_tip_commit_date, path_mtime) <= today - 7 days`
- After remove: delete local branch only if `git merge-base --is-ancestor <branch> origin/dev` (or local `dev`) succeeds

- [ ] **Step 1: Write `prune_idle_worktrees.py`**

Create at BE `docs/tools/prune_idle_worktrees.py` and workspace `docs/tools/`:

```python
#!/usr/bin/env python3
"""Inventory and prune clean git worktrees idle for N days."""

from __future__ import annotations

import argparse
import datetime as dt
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path


@dataclass
class Worktree:
    path: Path
    branch: str
    head: str


def run(cmd: list[str], cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        cwd=cwd,
        text=True,
        capture_output=True,
        check=False,
    )


def parse_worktrees(repo: Path) -> list[Worktree]:
    proc = run(["git", "worktree", "list", "--porcelain"], cwd=repo)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr)
    items: list[Worktree] = []
    path: Path | None = None
    head = ""
    branch = ""
    for line in proc.stdout.splitlines():
        if line.startswith("worktree "):
            if path is not None:
                items.append(Worktree(path=path, branch=branch, head=head))
            path = Path(line[len("worktree ") :])
            head = ""
            branch = ""
        elif line.startswith("HEAD "):
            head = line[len("HEAD ") :]
        elif line.startswith("branch "):
            ref = line[len("branch ") :]
            branch = ref.split("/")[-1] if ref else ""
        elif line == "detached":
            branch = "(detached)"
    if path is not None:
        items.append(Worktree(path=path, branch=branch, head=head))
    # Skip primary worktree (repo root)
    return [w for w in items if w.path.resolve() != repo.resolve()]


def is_dirty(path: Path) -> bool:
    proc = run(["git", "status", "--porcelain"], cwd=path)
    return bool(proc.stdout.strip())


def commit_date(repo: Path, head: str) -> dt.datetime | None:
    if not head:
        return None
    proc = run(["git", "show", "-s", "--format=%cI", head], cwd=repo)
    if proc.returncode != 0 or not proc.stdout.strip():
        return None
    return dt.datetime.fromisoformat(proc.stdout.strip())


def path_mtime(path: Path) -> dt.datetime:
    ts = path.stat().st_mtime
    return dt.datetime.fromtimestamp(ts, tz=dt.timezone.utc)


def activity(repo: Path, wt: Worktree) -> dt.datetime:
    dates = [path_mtime(wt.path)]
    cd = commit_date(repo, wt.head)
    if cd is not None:
        if cd.tzinfo is None:
            cd = cd.replace(tzinfo=dt.timezone.utc)
        dates.append(cd.astimezone(dt.timezone.utc))
    return max(dates)


def branch_merged_into_dev(repo: Path, branch: str) -> bool:
    if not branch or branch == "(detached)":
        return False
    for tip in ("origin/dev", "dev"):
        proc = run(["git", "merge-base", "--is-ancestor", branch, tip], cwd=repo)
        if proc.returncode == 0:
            return True
    return False


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--be-repo", type=Path, required=True)
    parser.add_argument("--fe-repo", type=Path, required=True)
    parser.add_argument("--days", type=int, default=7)
    parser.add_argument("--apply", action="store_true", help="Actually remove; default dry-run")
    parser.add_argument("--out-md", type=Path, required=True)
    args = parser.parse_args()

    now = dt.datetime.now(tz=dt.timezone.utc)
    cutoff = now - dt.timedelta(days=args.days)
    rows: list[dict] = []

    for label, repo in (("be", args.be_repo), ("fe", args.fe_repo)):
        for wt in parse_worktrees(repo):
            dirty = is_dirty(wt.path)
            act = activity(repo, wt)
            action = "skipped_recent"
            branch_deleted = False
            notes = ""
            if dirty:
                action = "skipped_dirty"
            elif act <= cutoff:
                if args.apply:
                    rem = run(["git", "worktree", "remove", "--force", str(wt.path)], cwd=repo)
                    if rem.returncode != 0:
                        # retry without --force if path already gone issues; record failure
                        rem = run(["git", "worktree", "remove", str(wt.path)], cwd=repo)
                    if rem.returncode != 0:
                        action = "failed"
                        notes = (rem.stderr or rem.stdout).strip()
                    else:
                        action = "removed"
                        if branch_merged_into_dev(repo, wt.branch):
                            br = run(["git", "branch", "-d", wt.branch], cwd=repo)
                            branch_deleted = br.returncode == 0
                            if not branch_deleted:
                                notes = f"branch left: {(br.stderr or br.stdout).strip()}"
                        else:
                            notes = "branch left (not merged into dev)"
                else:
                    action = "would_remove"
                    notes = "dry-run"
            rows.append(
                {
                    "repo": label,
                    "path": str(wt.path),
                    "branch": wt.branch,
                    "last_activity": act.date().isoformat(),
                    "dirty": dirty,
                    "action": action,
                    "branch_deleted": branch_deleted,
                    "notes": notes,
                }
            )

    lines = [
        f"# Worktree prune ({now.date().isoformat()})",
        "",
        f"Cutoff: idle ≥ {args.days} days (activity ≤ {cutoff.date().isoformat()}). Apply={args.apply}.",
        "",
        "| repo | path | branch | last_activity | dirty | action | branch_deleted | notes |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for r in rows:
        notes = (r["notes"] or "").replace("|", "\\|").replace("\n", " ")
        lines.append(
            f"| {r['repo']} | `{r['path']}` | `{r['branch']}` | {r['last_activity']} | {r['dirty']} | {r['action']} | {r['branch_deleted']} | {notes} |"
        )
    lines.append("")
    args.out_md.write_text("\n".join(lines))
    print(f"Wrote {args.out_md} ({len(rows)} worktrees)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 2: Dry-run inventory (no removals)**

```bash
cd /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-be
./env/bin/python docs/tools/prune_idle_worktrees.py \
  --be-repo /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-be \
  --fe-repo /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-fe \
  --days 7 \
  --out-md /Users/jamesthiha/programming/schedjuice/docs/superpowers/specs/2026-07-22-worktree-prune.md
head -40 /Users/jamesthiha/programming/schedjuice/docs/superpowers/specs/2026-07-22-worktree-prune.md
```

Expected: markdown lists worktrees with `would_remove` / `skipped_dirty` / `skipped_recent`; **no** paths removed yet (`git worktree list` unchanged).

- [ ] **Step 3: Apply prune**

```bash
cd /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-be
./env/bin/python docs/tools/prune_idle_worktrees.py \
  --be-repo /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-be \
  --fe-repo /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-fe \
  --days 7 \
  --apply \
  --out-md /Users/jamesthiha/programming/schedjuice/docs/superpowers/specs/2026-07-22-worktree-prune.md
cp /Users/jamesthiha/programming/schedjuice/docs/superpowers/specs/2026-07-22-worktree-prune.md \
  docs/superpowers/specs/
cp /Users/jamesthiha/programming/schedjuice/docs/superpowers/specs/2026-07-22-worktree-prune.md \
  /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-fe/docs/superpowers/specs/
git -C /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-be worktree list
git -C /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-fe worktree list
```

Expected: eligible rows show `action=removed`; dirty/recent remain; primary `dev` worktrees still listed.

- [ ] **Step 4: Commit script + prune report**

```bash
cd /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-be
git add docs/tools/prune_idle_worktrees.py docs/superpowers/specs/2026-07-22-worktree-prune.md
git commit -m "$(cat <<'EOF'
chore: prune idle clean worktrees (≥7d) and add prune tool

EOF
)"

cd /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-fe
git add docs/superpowers/specs/2026-07-22-worktree-prune.md
git commit -m "$(cat <<'EOF'
docs: record worktree prune report

EOF
)"
```

Also copy script to workspace `docs/tools/prune_idle_worktrees.py` (untracked at workspace root is fine).

---

### Task 3: Pilot BE slice `be-app_utils`

**Files:**
- Modify: only under `schedjuice-reimagined-be/app_utils/`
- Create: `schedjuice-reimagined-be/docs/superpowers/specs/hygiene-reports/be-app_utils.yaml`

**Interfaces:**
- Consumes: design rubric + schema + slice ownership
- Produces: obvious deletes/doc fixes; YAML report; green tests if present

- [ ] **Step 1: Dispatch one sub-agent with this exact prompt**

```text
You are running code/docs hygiene on ONE directory slice only.

slice_id: be-app_utils
repo: schedjuice-reimagined-be
path: app_utils
workspace root: /Users/jamesthiha/programming/schedjuice

Read and follow:
- docs/superpowers/specs/2026-07-22-code-hygiene-dead-code-docs-design.md
- docs/superpowers/specs/hygiene-report.schema.md
- docs/superpowers/specs/2026-07-22-hygiene-slices.md

Rules:
1. Only edit files under app_utils/ (plus write the YAML report). Do NOT edit AGENTS.md or .cursor/rules.
2. Delete OBVIOUS dead code (unreferenced-module / dead-export / commented-out-block / orphan-route).
3. Fix OBVIOUS outdated inline comments / app README that contradict current code.
4. Anti-patterns: only high-confidence severe local fixes.
5. Do NOT delete ambiguous items — list them in ambiguous[].
6. Never delete migrations, permission codenames, or schema fields.
7. Optional: use ripgrep; Knip/vulture hints only — never sole delete authority.
8. After edits, if tests exist run:
   cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_utils.tests
   Otherwise set verification.passed false and verification.command to skipped reason.
9. Write report to:
   schedjuice-reimagined-be/docs/superpowers/specs/hygiene-reports/be-app_utils.yaml
10. Return short counts: deleted / fixed_docs / anti_pattern_fixes / ambiguous.

Model: composer-2.5-fast or grok-4.5-fast-xhigh.
```

- [ ] **Step 2: Review pilot report and diff**

Confirm:
- No edits outside `app_utils/`
- Every deleted/fixed entry has `confidence: obvious` equivalent reason
- Ambiguous items were not deleted
- Verification recorded

- [ ] **Step 3: Commit the pilot**

```bash
cd /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-be
git add app_utils docs/superpowers/specs/hygiene-reports/be-app_utils.yaml
git commit -m "$(cat <<'EOF'
chore(utils): hygiene pass — remove obvious dead code/docs

EOF
)"
```

---

### Task 4: Pilot FE slice `fe-helpers`

**Files:**
- Modify: only under `schedjuice-reimagined-fe/src/helpers/`
- Create: `schedjuice-reimagined-be/docs/superpowers/specs/hygiene-reports/fe-helpers.yaml`

**Interfaces:**
- Consumes: same rubric
- Produces: FE edits + YAML + Vitest when applicable

- [ ] **Step 1: Dispatch sub-agent**

```text
You are running code/docs hygiene on ONE directory slice only.

slice_id: fe-helpers
repo: schedjuice-reimagined-fe
path: src/helpers
workspace root: /Users/jamesthiha/programming/schedjuice

Read and follow:
- docs/superpowers/specs/2026-07-22-code-hygiene-dead-code-docs-design.md
- docs/superpowers/specs/hygiene-report.schema.md
- docs/superpowers/specs/2026-07-22-hygiene-slices.md

Rules:
1. Only edit files under src/helpers/ (plus write the YAML report).
2. Delete OBVIOUS dead code; fix OBVIOUS stale comments; severe anti-patterns only if local/low-risk.
3. Ambiguous → list only (dynamic imports, public helpers used by string, etc.).
4. After edits, run: cd schedjuice-reimagined-fe && pnpm test:unit -- src/helpers
   If no tests, note skipped in verification.
5. Write report to:
   schedjuice-reimagined-be/docs/superpowers/specs/hygiene-reports/fe-helpers.yaml
6. Return deleted / fixed_docs / anti_pattern_fixes / ambiguous counts.

Model: composer-2.5-fast or grok-4.5-fast-xhigh.
```

- [ ] **Step 2: Review + commit**

```bash
cd /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-fe
git add src/helpers
git commit -m "$(cat <<'EOF'
chore(helpers): hygiene pass — remove obvious dead code/docs

EOF
)"

cd /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-be
git add docs/superpowers/specs/hygiene-reports/fe-helpers.yaml
git commit -m "$(cat <<'EOF'
docs: hygiene report for fe-helpers pilot

EOF
)"
```

---

### Task 5: Parallel remaining BE slices

**Files:**
- Modify: only each assigned `app_*/` or `utilitas/`
- Create: `hygiene-reports/<slice_id>.yaml` per slice

**Interfaces:**
- Consumes: prompt template below + slice table from `2026-07-22-hygiene-slices.md`
- Produces: per-slice commits preferred (or batched commit per wave of 4–6)

- [ ] **Step 1: Build remaining BE slice queue**

All `be-*` rows from `2026-07-22-hygiene-slices.md` **except** `be-app_utils` (done in Task 3).

- [ ] **Step 2: Dispatch in waves of 4–6** using this template (fill `SLICE_ID` and `PATH`)

```text
You are running code/docs hygiene on ONE directory slice only.

slice_id: SLICE_ID
repo: schedjuice-reimagined-be
path: PATH
workspace root: /Users/jamesthiha/programming/schedjuice

Read and follow:
- docs/superpowers/specs/2026-07-22-code-hygiene-dead-code-docs-design.md
- docs/superpowers/specs/hygiene-report.schema.md
- docs/superpowers/specs/2026-07-22-hygiene-slices.md

Rules:
1. Only edit files under PATH/ (plus YAML report). No AGENTS.md / .cursor/rules.
2. Obvious dead code → delete; obvious stale comments/README → fix; severe anti-patterns only if local.
3. Ambiguous → list only. Never delete migrations / permission codenames / schema fields.
4. Verify with: cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh PATH.tests
   (If no tests package, record skipped.)
5. Write: schedjuice-reimagined-be/docs/superpowers/specs/hygiene-reports/SLICE_ID.yaml
6. Return counts only.

Model: composer-2.5-fast or grok-4.5-fast-xhigh.
```

- [ ] **Step 3: After each wave — orchestrator review gate**

For each finished slice:
- Diff stays inside owned path
- `verification` present
- Commit:

```bash
cd /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-be
git add PATH docs/superpowers/specs/hygiene-reports/SLICE_ID.yaml
git commit -m "$(cat <<'EOF'
chore(SLICE_ID): hygiene pass — obvious dead code/docs

EOF
)"
```

If a slice finds nothing: still write YAML with empty arrays and `skipped: false` (or `skipped: true` + reason if directory empty/irrelevant), then commit the report only.

---

### Task 6: Parallel remaining FE slices

**Files:**
- Modify: only assigned `src/...` path
- Create: `hygiene-reports/<slice_id>.yaml`

**Interfaces:**
- Same as Task 5; FE Vitest path = slice path

- [ ] **Step 1: Build remaining FE queue**

All `fe-*` rows from slices file **except** `fe-helpers`. Include `fe-lib-*`, `fe-components-*`, `fe-app-*`, and other top-level FE slices. Skip empty dirs with a skipped report.

- [ ] **Step 2: Dispatch waves of 4–6** with template:

```text
You are running code/docs hygiene on ONE directory slice only.

slice_id: SLICE_ID
repo: schedjuice-reimagined-fe
path: PATH
workspace root: /Users/jamesthiha/programming/schedjuice

Read and follow:
- docs/superpowers/specs/2026-07-22-code-hygiene-dead-code-docs-design.md
- docs/superpowers/specs/hygiene-report.schema.md
- docs/superpowers/specs/2026-07-22-hygiene-slices.md

Rules:
1. Only edit under PATH (plus YAML report). Respect root-only slices (fe-lib-root, fe-components-root, fe-app-root).
2. Obvious dead code/docs only; ambiguous listed; severe anti-patterns only if local.
3. Watch for Next.js dynamic imports / app-router reachability — prefer ambiguous when unsure.
4. Verify: cd schedjuice-reimagined-fe && pnpm test:unit -- PATH
   (Skip with reason if no tests.)
5. Write report to:
   schedjuice-reimagined-be/docs/superpowers/specs/hygiene-reports/SLICE_ID.yaml
6. Return counts.

Model: composer-2.5-fast or grok-4.5-fast-xhigh.
```

- [ ] **Step 3: Commit FE code in FE repo; commit YAML reports in BE repo** (same pattern as Task 4).

---

### Task 7: Meta slices (AGENTS.md / existing Cursor rules)

**Files:**
- Modify: only paths listed for `meta-be-agents` / `meta-fe-agents`
- Create: `hygiene-reports/meta-be-agents.yaml`, `hygiene-reports/meta-fe-agents.yaml`
- Do **not** create the new prevention rule here (Task 8)

**Interfaces:**
- Consumes: current scripts/conventions vs AGENTS.md / rules text
- Produces: doc-only fixes that contradict current code

- [ ] **Step 1: Dispatch `meta-be-agents`**

```text
slice_id: meta-be-agents
Only edit schedjuice-reimagined-be/AGENTS.md and schedjuice-reimagined-be/.cursor/rules/
Fix OBVIOUS contradictions with current scripts/conventions (e.g. wrong test command).
Do not invent new policy. List ambiguous notes. Write hygiene-reports/meta-be-agents.yaml under BE docs.
```

- [ ] **Step 2: Dispatch `meta-fe-agents`** (same for FE AGENTS.md + `.cursor/rules/`)

- [ ] **Step 3: Commit each meta slice in its repo + YAML in BE**

---

### Task 8: Merge reports + Cursor prevention rule

**Files:**
- Create: `docs/superpowers/specs/2026-07-22-hygiene-ambiguous.md` (+ BE/FE copies)
- Create: `docs/superpowers/specs/2026-07-22-hygiene-deleted.md` (+ BE/FE copies)
- Create: `.cursor/rules/code-hygiene.mdc`
- Create: `schedjuice-reimagined-be/.cursor/rules/code-hygiene.mdc`
- Create: `schedjuice-reimagined-fe/.cursor/rules/code-hygiene.mdc`

**Interfaces:**
- Consumes: all `hygiene-reports/*.yaml`
- Produces: rollup markdown + identical prevention rule in three places

- [ ] **Step 1: Run merge**

```bash
cd /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-be
./env/bin/python docs/tools/merge_hygiene_reports.py \
  --reports-dir docs/superpowers/specs/hygiene-reports \
  --cleanup-date 2026-07-22 \
  --out-ambiguous docs/superpowers/specs/2026-07-22-hygiene-ambiguous.md \
  --out-deleted docs/superpowers/specs/2026-07-22-hygiene-deleted.md
cp docs/superpowers/specs/2026-07-22-hygiene-ambiguous.md \
  docs/superpowers/specs/2026-07-22-hygiene-deleted.md \
  /Users/jamesthiha/programming/schedjuice/docs/superpowers/specs/
cp docs/superpowers/specs/2026-07-22-hygiene-ambiguous.md \
  docs/superpowers/specs/2026-07-22-hygiene-deleted.md \
  /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-fe/docs/superpowers/specs/
```

Expected: both markdown files exist; ambiguous table has rows or empty table header only.

- [ ] **Step 2: Write Cursor rule (identical in three paths)**

```markdown
---
description: Prefer deleting unused code over comment-out; keep source-adjacent docs truthful
alwaysApply: true
---

# Code hygiene

When editing `schedjuice-reimagined-be` or `schedjuice-reimagined-fe`:

## Prefer

- Delete unused exports/modules instead of commenting them out "for later"
- Keep inline comments, module READMEs, and AGENTS.md aligned with current behavior
- If unsure a symbol is unused (Celery names, URLconf strings, dynamic import), leave it and note it — do not guess-delete

## Never

1. Delete Django migrations, permission codenames, or schema fields in a hygiene pass
2. Mass-refactor style/architecture under the guise of dead-code cleanup
3. Trust unused-code tools (Knip/vulture) as sole delete authority

## Playbook

Full hygiene cleanup uses directory slices in
`docs/superpowers/specs/2026-07-22-code-hygiene-dead-code-docs-design.md`.
```

- [ ] **Step 3: Verify rule files match**

```bash
diff -q \
  /Users/jamesthiha/programming/schedjuice/.cursor/rules/code-hygiene.mdc \
  /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-be/.cursor/rules/code-hygiene.mdc
diff -q \
  /Users/jamesthiha/programming/schedjuice/.cursor/rules/code-hygiene.mdc \
  /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-fe/.cursor/rules/code-hygiene.mdc
```

Expected: no output.

- [ ] **Step 4: Commit rollups + rule**

```bash
cd /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-be
git add \
  docs/superpowers/specs/2026-07-22-hygiene-ambiguous.md \
  docs/superpowers/specs/2026-07-22-hygiene-deleted.md \
  docs/superpowers/specs/hygiene-reports \
  .cursor/rules/code-hygiene.mdc
git commit -m "$(cat <<'EOF'
chore(cursor): add code-hygiene rule; merge hygiene reports

EOF
)"

cd /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-fe
git add \
  docs/superpowers/specs/2026-07-22-hygiene-ambiguous.md \
  docs/superpowers/specs/2026-07-22-hygiene-deleted.md \
  .cursor/rules/code-hygiene.mdc
git commit -m "$(cat <<'EOF'
chore(cursor): add code-hygiene rule; mirror hygiene rollups

EOF
)"
```

---

### Task 9: Final verification

**Files:** none new

- [ ] **Step 1: Confirm worktree list is only intended leftovers**

```bash
git -C /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-be worktree list
git -C /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-fe worktree list
```

- [ ] **Step 2: Confirm report coverage**

```bash
# Every slice_id from 2026-07-22-hygiene-slices.md (except meta-monorepo-rules) should have a YAML
# or an explicit skipped report.
python3 - <<'PY'
from pathlib import Path
slices = Path("/Users/jamesthiha/programming/schedjuice/docs/superpowers/specs/2026-07-22-hygiene-slices.md").read_text()
ids = []
for line in slices.splitlines():
    if line.startswith("| ") and "slice_id" not in line and not line.startswith("|---"):
        parts = [p.strip() for p in line.strip("|").split("|")]
        if parts and parts[0] and parts[0] != "meta-monorepo-rules":
            if parts[0].startswith("`"):
                continue
            ids.append(parts[0].strip("`"))
reports = {p.stem for p in Path("/Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-be/docs/superpowers/specs/hygiene-reports").glob("*.yaml")}
missing = sorted(set(ids) - reports)
print("slices", len(ids), "reports", len(reports), "missing", len(missing))
print("\n".join(missing[:50]))
PY
```

Expected: `missing` is 0 (or only intentionally deferred slices listed in the ambiguous/deleted notes).

- [ ] **Step 3: Spot-check BE/FE still bootable (lightweight)**

```bash
cd /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-be
./env/bin/python -c "import django; print('ok')"
cd /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-fe
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | tail -20
```

Expected: Django import ok; tsc either clean or only pre-existing errors unrelated to this pass (do not expand scope to fix unrelated type debt).

---

## Spec coverage self-check

| Spec requirement | Task |
|------------------|------|
| Hybrid obvious/ambiguous cleanup | 3–6 |
| Source-adjacent docs only | 3–7 |
| Severe anti-patterns only | 3–6 rubric in prompts |
| Worktree prune clean + ≥7d | 2 |
| Branch delete only if merged to `dev` | 2 script |
| Slice partitioning exclusive | 1 slices file |
| Merge ambiguous/deleted rollups | 8 |
| Cursor prevention rule after cleanup | 8 |
| No CI unused gates | omitted intentionally |
| `--keepdb` BE tests | prompts Tasks 3/5 |
| Skip scanning worktree code | Global Constraints |

## Placeholder scan

No TBD/TODO implement-later steps; scripts and prompts are fully inlined.
