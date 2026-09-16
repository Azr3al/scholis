# Wave 4 — Dashboard / Dense Ops Chrome Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin dashboard and dense operational page chrome (toolbars, status strips, panels, motion entrances) while leaving deferred table/matrix cores and AutoForm alone.

**Architecture:** Approach B on finance, attendance-adjacent ops, management dashboard, and similar dense surfaces. Course attendance **dashboard** is already migrated — skip it. Course attendance **marking** may still have residual `ui/use-toast` (or similar) — chrome-only cleanup allowed; do not regress the marking table.

**Tech Stack:** Next.js App Router, `@/components/primitives`, Iconoir, `motion/react` + `@/lib/sj/motion.ts`.

**Spec:** [`../specs/2026-07-09-design-md-chrome-migration-program-design.md`](../specs/2026-07-09-design-md-chrome-migration-program-design.md)  
**Playbook:** [`2026-07-09-design-md-chrome-migration-playbook.md`](2026-07-09-design-md-chrome-migration-playbook.md)

**Branch:** `migrate/ui-w4-dashboard-chrome`  
**Worktree (suggested):** `.worktrees/migrate-ui-w4-dashboard-chrome`  
**Depends on:** Wave 0 merged to `dev`

---

## File Structure

### Primary inventory

```
src/app/(internal)/assessments/submission-tracker/page.tsx
src/app/(internal)/attendances/god-view/page.tsx
src/app/(internal)/courses/[id]/attendance/marking/[eventIndex]/page.tsx
src/app/(internal)/courses/[id]/checkin-history/[eventIndex]/page.tsx
src/app/(internal)/courses/[id]/meeting-attendance/page.tsx
src/app/(internal)/finances/cash-flow/page.tsx
src/app/(internal)/finances/checkin-histories/page.tsx
src/app/(internal)/finances/make-payment/page.tsx
src/app/(internal)/finances/microsoft-payroll/page.tsx
src/app/(internal)/finances/payment-history/page.tsx
src/app/(internal)/finances/payroll/page.tsx
src/app/(internal)/finances/rates/page.tsx
src/app/(internal)/finances/receiver-transactions/page.tsx
src/app/(internal)/finances/recent-transactions/page.tsx
src/app/(internal)/finances/school-overview/page.tsx
src/app/(internal)/finances/student-payments/coverage-review/page.tsx
src/app/(internal)/finances/student-payments/transaction-lookup/page.tsx
src/app/(internal)/finances/student-payments/upload/page.tsx
src/app/(internal)/finances/student-payments/verification-upload/page.tsx
src/app/(internal)/finances/unpaid-students/page.tsx
src/app/(internal)/finances/user-attendance/page.tsx
src/app/(internal)/management/dashboard/page.tsx
src/app/(internal)/organizations/user-activity/login-activity/page.tsx
src/app/(internal)/organizations/user-activity/page.tsx
src/app/(internal)/services/campus-checkins/page.tsx
src/app/(internal)/shortcuts/unpaid-course-counts/page.tsx
```

### Skip (already migrated / other wave)

- `src/app/(internal)/courses/[id]/attendance/page.tsx` — dashboard done
- Finance pages with **no** direct `ui/*` at inventory time (e.g. some student-payments index) — only add if chrome still legacy via required wrappers

### Don’t-touch cores

- `src/components/ui/data-table/**`
- Attendance marking table logic in `src/components/attendance/attendance-marking-table.tsx` **internals** (chrome imports at edges OK if already mostly primitive)
- God-view / finance chart math

---

### Task 1: Worktree

- [ ] **Step 1: Create from post–Wave 0 `dev`**

```bash
git fetch origin
git worktree add .worktrees/migrate-ui-w4-dashboard-chrome -b migrate/ui-w4-dashboard-chrome origin/dev
cd .worktrees/migrate-ui-w4-dashboard-chrome
```

---

### Task 2: Reference — finance school-overview chrome

**Files:**
- Modify: `src/app/(internal)/finances/school-overview/page.tsx`
- Plus page-local chrome components under `src/components/finances/**` **only if** required for that page’s toolbar/cards and listed in the PR

- [ ] **Step 1: Inventory ui imports on the page**

```bash
rg -n "from [\"']@/components/ui/|lucide-react" \
  src/app/\(internal\)/finances/school-overview/page.tsx
```

- [ ] **Step 2: Swap chrome to primitives; keep DataTable/charts**

- Buttons/selects/skeletons/dialogs → primitives  
- Lucide → Iconoir  
- Wrap top-level dashboard sections with `crossfade` if they currently pop in with no motion  
- Leave chart libraries and table widgets

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
migrate(ui): reskin finance school-overview chrome to primitives.

EOF
)"
```

---

### Task 3: Finance batch

- [ ] **Step 1: Migrate all remaining `finances/**` inventory pages** (chrome only)

Commit message:

```bash
git commit -m "$(cat <<'EOF'
migrate(ui): reskin finance dashboard chrome batch.

EOF
)"
```

---

### Task 4: Attendance-adjacent + management + org activity + services + shortcuts unpaid

- [ ] **Step 1: God-view, check-in history, meeting attendance, submission-tracker**

Keep `DataTable` on check-in history.

- [ ] **Step 2: Marking page residual chrome**

In `courses/[id]/attendance/marking/[eventIndex]/page.tsx`:

- Swap `useToast` from `ui/use-toast` → primitives `useToast` if API-compatible.
- Do **not** change autosave, roster merge, or marking table behavior.

```tsx
// Prefer:
import { useToast } from "@/components/primitives";
```

If the primitive toast API differs, keep legacy toast and note in PR as follow-up — do not break marking.

- [ ] **Step 3: management/dashboard, org user-activity, campus-checkins, unpaid-course-counts**

- [ ] **Step 4: Commits per batch**

---

### Task 5: Acceptance + PR

- [ ] **Step 1: Grep gates on finance + marking**

```bash
rg -n "from [\"']lucide-react[\"']" \
  src/app/\(internal\)/finances/school-overview/page.tsx \
  src/app/\(internal\)/courses/\[id\]/attendance/marking/\[eventIndex\]/page.tsx
```

- [ ] **Step 2: Lint, PR, review, merge**

```bash
npm run lint
git push -u origin HEAD
gh pr create --base dev --title "migrate(ui): Wave 4 dashboard/dense ops chrome" --body "$(cat <<'EOF'
## Summary
- Reskin finance and dense ops page chrome to primitives
- Deferred tables/matrices untouched
- Marking behavior preserved

## Test plan
- [ ] School overview smoke light+dark
- [ ] Marking page still autosaves (smoke)
- [ ] God-view loads

## Review
Wave 4 inventory + playbook; reject table/autosave logic changes

EOF
)"
```

---

## Review brief

```
Review Wave 4 PR. Pass only for chrome-level primitives/Iconoir/tokens/motion.
Fail on DataTable/auto-form internal edits, marking autosave/roster logic changes,
or out-of-inventory files. Max 2 fix rounds.
```
