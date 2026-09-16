# Wave 0 — Dead Code Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete quiz v1/v2 leftovers and any other confirmed-dead modules so later chrome-migration waves never touch them.

**Architecture:** Import-graph-proven deletion only. Remove App Router trees, components, store, and types that are exclusively consumed by quiz v2. No redirects from `/quizzes` or `/qid/*` (404 is intentional). Do not delete quizzes-v3.

**Tech Stack:** Next.js App Router, git worktree, `rg`, `npm run build` / `npm run test:unit` as needed.

**Spec:** [`../specs/2026-07-09-design-md-chrome-migration-program-design.md`](../specs/2026-07-09-design-md-chrome-migration-program-design.md)  
**Playbook:** [`2026-07-09-design-md-chrome-migration-playbook.md`](2026-07-09-design-md-chrome-migration-playbook.md)

**Branch:** `migrate/ui-w0-dead-code` from latest `dev`  
**Worktree (suggested):** `.worktrees/migrate-ui-w0-dead-code`

---

## File Structure

| Path | Action |
| --- | --- |
| `src/app/(internal)/(quizv2)/` | Delete entire tree |
| `src/app/(quizv2)/` | Delete entire tree |
| `src/components/quizv2/` | Delete entire tree |
| `src/store/quizv2.ts` | Delete |
| `src/types/quizv2.ts` | Delete |
| `src/config/nav-routes.tsx` | Verify no `/quizzes` (v2) links — already quizzes-v3; no change if clean |
| `src/config/route-permissions.ts` | Verify no v2 prefixes |

**Do not delete:** `src/app/(internal)/quizzes-v3/**`, `src/app/(quiz-v3)/**`, `src/components/quiz-v3/**`, `src/types/quiz-v3.ts`

---

### Task 1: Create worktree and prove import graph

**Files:** none yet

- [ ] **Step 1: Create worktree from `dev`**

```bash
cd /path/to/schedjuice-reimagined-fe
git fetch origin
git worktree add .worktrees/migrate-ui-w0-dead-code -b migrate/ui-w0-dead-code origin/dev
cd .worktrees/migrate-ui-w0-dead-code
```

- [ ] **Step 2: List all quizv2 references outside the delete trees**

```bash
rg -n 'quizv2|@/components/quizv2|@/store/quizv2|@/types/quizv2|/qid/' src \
  --glob '!**/(quizv2)/**' \
  --glob '!**/quizv2/**' \
  --glob '!**/types/quizv2.ts' \
  --glob '!**/store/quizv2.ts'
```

Expected: **no matches** (or only comments/docs). If a live product file matches, **stop** and escalate — do not delete until that reference is retargeted or confirmed dead.

- [ ] **Step 3: Confirm nav is quizzes-v3 only**

```bash
rg -n 'quizzes|qid' src/config/nav-routes.tsx src/config/route-permissions.ts
```

Expected: `/quizzes-v3` only; no `/quizzes` list route and no `/qid`.

---

### Task 2: Delete quiz v2 trees

**Files:**
- Delete: `src/app/(internal)/(quizv2)/` (all files)
- Delete: `src/app/(quizv2)/` (all files)
- Delete: `src/components/quizv2/` (all files)
- Delete: `src/store/quizv2.ts`
- Delete: `src/types/quizv2.ts`

- [ ] **Step 1: Remove the trees**

```bash
rm -rf "src/app/(internal)/(quizv2)"
rm -rf "src/app/(quizv2)"
rm -rf src/components/quizv2
rm -f src/store/quizv2.ts
rm -f src/types/quizv2.ts
```

- [ ] **Step 2: Re-run import graph**

```bash
rg -n 'quizv2|@/components/quizv2|@/store/quizv2|@/types/quizv2' src
```

Expected: **no matches**.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
Remove quiz v1/v2 routes, components, store, and types.

EOF
)"
```

---

### Task 3: Optional extra dead code (only if proven)

**Files:** only paths that pass both checks below

- [ ] **Step 1: Candidate scan (informational)**

Do **not** delete `debug/**` or demo tooling. Only consider routes with:

1. Zero imports from the rest of `src/`
2. No entry in `src/config/nav-routes.tsx` / shortcuts config

If none found, skip Task 3 entirely (YAGNI).

- [ ] **Step 2: If a candidate exists, document it in the PR body and delete in a separate commit**

```bash
git commit -m "$(cat <<'EOF'
Remove additional confirmed-dead frontend modules.

EOF
)"
```

---

### Task 4: Verify build

- [ ] **Step 1: Install if needed, then typecheck via build**

```bash
npm run build
```

Expected: Next.js build succeeds (or fails only on pre-existing unrelated errors — if unrelated, note in PR; if caused by this deletion, fix).

- [ ] **Step 2: Unit tests smoke**

```bash
npm run test:unit
```

Expected: pass (or same pre-existing failures unrelated to quizv2).

---

### Task 5: Open PR → review → merge to `dev`

- [ ] **Step 1: Push and open PR**

```bash
git push -u origin HEAD
gh pr create --base dev --title "migrate(ui): Wave 0 delete quiz v1/v2 dead code" --body "$(cat <<'EOF'
## Summary
- Delete quiz v2 App Router trees, `components/quizv2`, `store/quizv2`, `types/quizv2`
- No redirects from `/quizzes` or `/qid/*` (intentional 404)
- quizzes-v3 untouched

## Test plan
- [ ] `rg` shows zero `quizv2` imports
- [ ] `npm run build` passes
- [ ] Nav still links to `/quizzes-v3` only

## Review
Wave 0 review checklist from chrome migration playbook + dead-code allowlist only.

EOF
)"
```

- [ ] **Step 2: Dispatch review sub-agent**

Reviewer must confirm:

- Only allowlisted deletions (plus optional proven-dead extras documented in PR)
- quizzes-v3 intact
- Zero remaining `quizv2` imports
- No redirects added

- [ ] **Step 3: On review pass, merge to `dev`**

```bash
gh pr merge --merge
```

(Use repo-standard merge strategy if different; **no** `--force`.)

---

## Review brief (paste to review sub-agent)

```
Review PR for Wave 0 dead-code deletion against
docs/superpowers/specs/2026-07-09-design-md-chrome-migration-program-design.md
and docs/superpowers/plans/2026-07-09-design-md-chrome-migration-playbook.md.

Pass only if:
1. Deleted paths ⊆ quizv2 allowlist (or documented proven-dead extras)
2. quizzes-v3 / quiz-v3 code untouched
3. rg quizv2 across src is empty
4. No redirect routes added
5. Build/typecheck evidence present

Fail closed otherwise. Max 2 fix rounds.
```
