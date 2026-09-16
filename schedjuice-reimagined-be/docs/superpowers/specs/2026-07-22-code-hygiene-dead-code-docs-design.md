# Code hygiene — dead code, outdated docs/comments, worktree prune

**Status:** approved design (planning phase)  
**Date:** 2026-07-22  
**Repos:** `schedjuice-reimagined-be`, `schedjuice-reimagined-fe`  
**Surfaces:** BE `app_*/` (+ `utilitas/` if present); FE `src/` (+ source-adjacent `AGENTS.md` / `.cursor/rules`); git worktrees under monorepo `worktrees/` and FE `.worktrees/`

## Context

The monorepo already ran a parallel **high-value tests** cleanup (rubric + directory slices + obvious-delete / ambiguous-review). Production code and source-adjacent docs still accumulate unused modules, stale comments, and idle git worktrees. This design extends that playbook to **code/docs hygiene** (not test quality), plus a separate **worktree prune** pass.

**No mass deletion happens in this planning phase.**

## Goals

1. Find and remove **obvious** dead code in BE and FE.
2. Fix or delete **obviously outdated** source-adjacent docs/comments (inline comments, module READMEs, `AGENTS.md` / Cursor rules that contradict current code).
3. Fix **high-confidence / severe** anti-patterns only when found during the same pass (not a full style rewrite).
4. Hybrid safety: auto-act on obvious; route ambiguous to one orchestrator-compiled review list.
5. Remove **clean** git worktrees with no activity in **7 days** (monorepo `worktrees/` and FE `.worktrees/`).
6. After cleanup, add a thin Cursor rule so agents do not reintroduce the same cruft.

## Non-goals

- Deleting or rewriting production code during design/spec/plan-writing (execution only after the implementation plan is approved).
- Scanning code **inside** worktrees for dead code (worktrees are prune targets, not audit targets).
- Historical `docs/superpowers/specs/`, marketing sites, `juice-box`, `schedjuiceweb`.
- Broad refactor or “make everything idiomatic.”
- New CI unused-code gates in v1 (revisit after this pass teaches false-positive patterns).
- Changing how tests are run (existing `--keepdb` / Vitest conventions stay).
- Deleting migrations, permission codenames, or schema fields in this pass.

## Decisions

| # | Decision |
| --- | --- |
| 1 | **Outcome:** audit + hybrid cleanup (obvious act; ambiguous → review list) |
| 2 | **Code scope:** BE + FE only; skip worktrees as scan targets |
| 3 | **Docs scope:** source-adjacent only (inline comments, module READMEs, AGENTS.md / Cursor rules) |
| 4 | **Anti-patterns:** only high-confidence / severe, local low-risk fixes |
| 5 | **Approach:** parallel directory-sliced sub-agents (mirror test cleanup); optional Knip/vulture as **hints only** |
| 6 | **Worktrees:** remove if clean **and** last activity ≥ **7 days**; dirty or recent → list only |
| 7 | **Activity timestamp:** newer of (latest commit on worktree branch, worktree path mtime) |
| 8 | **Branch after remove:** remove worktree; delete local branch only if already merged into the repo’s default integration branch (`dev`); otherwise leave branch and record in prune report |
| 9 | **Prevention:** thin Cursor rule after cleanup (not CI heuristics first) |
| 10 | **Rule location:** monorepo `.cursor/rules/` with mirror into BE/FE `.cursor/rules/` if needed for git persistence |

## Sequencing (hard gate)

1. Design approved → write/commit this spec.  
2. Invoke **writing-plans** → detailed implementation plan.  
3. **Only after** you approve executing the plan:  
   a. Worktree prune pass (report + remove eligible).  
   b. Parallel BE+FE slice cleanup.  
   c. Orchestrator merges ambiguous lists; add Cursor rule.  
4. Design/plan writing must **not** delete code or worktrees.

---

## Rubric

### Dead code — obvious (auto-fix/delete)

- Unreferenced helper/module/export with no dynamic/string import, URL route, or settings registration
- Dead feature flags / commented-out blocks left “for later” with no ticket/spec pointer
- Duplicate unused wrappers after a migration (old import path empty)
- Orphaned FE components/pages not reachable from the app router or any import graph

### Dead code — ambiguous (list only)

- Anything possibly reached via Django URLconf string paths, `getattr`/importlib, Celery task names, Next dynamic `import()`, feature-flagged routes, admin/register hooks
- “Unused” public API that other packages or scripts may call
- Test-only helpers that look unused from prod graphs

### Outdated docs/comments — obvious

- Comment/README describes behavior the code no longer does (wrong endpoint, removed flag, obsolete command)
- `AGENTS.md` / `.cursor/rules` instructions that contradict current scripts or conventions
- Stale “TODO: remove after X” where X already shipped

### Outdated docs/comments — ambiguous

- Intentional historical notes (“was X until 2026-06”)
- Speculative TODOs still open and plausible

### Anti-patterns — only high-confidence / severe

- Act only when the fix is local and low-risk (e.g. clearly wrong auth check left behind, copy-pasted secrets pattern, unbounded query in a hot path already touched by a dead-code edit)
- Do **not** chase style nits, aesthetic renames, or broad architecture opinions

### Safety

- Prefer delete unused over “refactor to use”
- Never delete migrations, permission codenames, or schema fields in this pass
- Dirty worktrees / ambiguous code → report, don’t force

---

## Parallel cleanup playbook (execute after plan approval)

### Partitioning

**Backend** — one slice per:

- `schedjuice-reimagined-be/app_*/` (each Django app: source + tests + app README/comments)
- `schedjuice-reimagined-be/utilitas/` if present

Skip `worktrees/` and non-product trees.

**Frontend** — one slice per top-level under `schedjuice-reimagined-fe/src/` that contains production code, e.g.:

- `helpers/`, `lib/`, `hooks/`, `config/`, `types/`, `api/`, `sdk/`, …
- `components/` / `app/` split by first child when large

Exclusive directory ownership: no overlapping slices.

**Meta slice** — shared root guidance files only:

- `schedjuice-reimagined-be/AGENTS.md`, `schedjuice-reimagined-be/.cursor/rules/`
- `schedjuice-reimagined-fe/AGENTS.md`, `schedjuice-reimagined-fe/.cursor/rules/`
- monorepo `.cursor/rules/` when editing prevention rule

Do not let app/src slices edit those files.

### Sub-agent contract

Each sub-agent, for its slice only:

1. Scan for dead code + stale source-adjacent docs/comments; note severe anti-patterns only if high-confidence.  
2. **Obvious → delete/fix** in-slice.  
3. **Ambiguous → do not delete**; emit structured candidates.  
4. Optional helper: Knip / vulture / similar as **hints only** — never sole delete authority.  
5. Return a report: `deleted[]`, `fixed_docs[]`, `anti_pattern_fixes[]`, `ambiguous[]`, files touched, verification.

**Obvious examples (non-exhaustive):**

- File/export with zero static references and no registration hook
- Comment documenting a removed API or flag
- Commented-out function body with no ticket reference

**Ambiguous examples:**

- Symbol only referenced via string name (Celery, URLconf, dynamic import)
- README that might be aspirational for an in-flight feature
- “Unused” export that looks like a public SDK surface

### Worktree prune

1. Inventory via `git worktree list` for BE and FE (includes monorepo `worktrees/*` and FE `.worktrees/*`).  
2. **Eligible:** clean working tree **and** last activity ≥ **7 days**, where activity is the newer of:
   - latest commit timestamp on the worktree’s branch
   - worktree directory mtime  
3. **Action:** `git worktree remove <path>`; if the branch is already merged into `dev`, also delete the local branch; otherwise leave the branch and record it.  
4. **Ineligible (list only):** dirty working tree, or activity < 7 days.  
5. Write `docs/superpowers/specs/<date>-worktree-prune.md`.

### Orchestrator merge

After all slices finish:

1. Concatenate slice reports under `docs/superpowers/specs/hygiene-reports/`.  
2. Write:
   - `docs/superpowers/specs/<cleanup-date>-hygiene-ambiguous.md`
   - `docs/superpowers/specs/<cleanup-date>-hygiene-deleted.md`
   - `docs/superpowers/specs/<cleanup-date>-worktree-prune.md`  
3. Add the thin Cursor rule (see below).  
4. Human reviews the ambiguous list in a later pass (out of scope for auto-delete).

### Report schema

Each sub-agent writes `docs/superpowers/specs/hygiene-reports/<slice_id>.yaml`.

See companion schema: `hygiene-report.schema.md` (same directory).

### Cursor rule (after cleanup)

Concise `.mdc` (< ~50–80 lines preferred):

- Prefer: don’t leave dead exports, “commented for later,” or AGENTS notes that contradict code
- Prefer: delete unused over comment-out
- Never: delete migrations / permission codenames in hygiene passes
- Pointer to this playbook

Do not turn the rule into a second style guide.

---

## Error handling

- Ambiguous or tool false-positive → list, don’t delete  
- Slice test/typecheck fails after edit → revert that slice’s changes or fix before marking done  
- Worktree remove fails → leave in place, log reason in prune report  

## Risks

| Risk | Mitigation |
|------|------------|
| Dynamic Django/Next refs look unused | Ambiguous bucket; no tool-only deletes |
| Over-eager anti-pattern “fixes” | Severe + local only |
| Losing uncommitted worktree work | Dirty = skip; age gate 7d |
| Duplicate edits on shared files | Exclusive slices + meta slice for AGENTS/rules |

## Success criteria

- Measurable removals + stale-doc fixes recorded in deleted/report docs  
- One merged ambiguous list for human review  
- Idle clean worktrees (≥7d) gone; dirty/recent listed  
- Thin Cursor rule landed  
- No intentional CI unused-code gate in v1  

## Verification

- After each BE slice: run affected tests via `./scripts/run_backend_tests.sh` (always `--keepdb`) when tests exist for touched apps  
- After each FE slice: run targeted Vitest / typecheck where cheap for touched packages  
- After worktree prune: `git worktree list` shows only remaining worktrees  
- Do not claim a slice done without green targeted verification (or explicit `skipped: true` with reason if no tests apply)

## Out of scope follow-ups

- CI unused-export gates (Knip/vulture in CI)  
- Pruning historical design specs under `docs/superpowers/specs/`  
- Hygiene for `juice-box` / `schedjuiceweb` / marketing sites  
- Human resolution of the ambiguous list (separate session)
