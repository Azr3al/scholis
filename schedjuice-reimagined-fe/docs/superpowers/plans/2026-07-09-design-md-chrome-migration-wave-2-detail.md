# Wave 2 — Detail / Record Body Chrome Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin detail and in-shell record **body** chrome to DESIGN.md primitives without reworking already-migrated record shells or deferred tables.

**Architecture:** Approach B on detail `page.tsx` files and the page-local presentational components they need for chrome. Do not redesign course/user/org **shells** (rails, identity strips already on primitives). Leave `DataTable` / `AutoForm` as black boxes.

**Tech Stack:** Next.js App Router, `@/components/primitives`, Iconoir, `motion/react` + `@/lib/sj/motion.ts`.

**Spec:** [`../specs/2026-07-09-design-md-chrome-migration-program-design.md`](../specs/2026-07-09-design-md-chrome-migration-program-design.md)  
**Playbook:** [`2026-07-09-design-md-chrome-migration-playbook.md`](2026-07-09-design-md-chrome-migration-playbook.md)

**Branch:** `migrate/ui-w2-detail-chrome`  
**Worktree (suggested):** `.worktrees/migrate-ui-w2-detail-chrome`  
**Depends on:** Wave 0 merged to `dev`  
**Parallel with:** Waves 1, 3, 4 if inventories stay disjoint

---

## File Structure

### Primary inventory

```
src/app/(docs)/platform/docs/[id]/page.tsx
src/app/(internal)/(department)/departments/[id]/page.tsx
src/app/(internal)/announcements/[id]/page.tsx
src/app/(internal)/assignments/[id]/grading/[submissionId]/page.tsx
src/app/(internal)/assignments/[id]/page.tsx
src/app/(internal)/campuses/[id]/page.tsx
src/app/(internal)/categories/[id]/page.tsx
src/app/(internal)/certificates/[templateId]/generate/page.tsx
src/app/(internal)/course-roles/[id]/page.tsx
src/app/(internal)/courses/[id]/assessments/page.tsx
src/app/(internal)/courses/[id]/availability/page.tsx
src/app/(internal)/courses/[id]/daily-notes/[eventId]/page.tsx
src/app/(internal)/courses/[id]/daily-notes/page.tsx
src/app/(internal)/courses/[id]/email-templates/[templateId]/page.tsx
src/app/(internal)/courses/[id]/email-templates/[templateId]/user-emails/[emailId]/page.tsx
src/app/(internal)/courses/[id]/email-templates/[templateId]/user-emails/page.tsx
src/app/(internal)/courses/[id]/email-templates/page.tsx
src/app/(internal)/courses/[id]/grading/page.tsx
src/app/(internal)/courses/[id]/grading/reports/[batchId]/[studentId]/page.tsx
src/app/(internal)/courses/[id]/grading/reports/[batchId]/page.tsx
src/app/(internal)/courses/[id]/grading/reports/page.tsx
src/app/(internal)/courses/[id]/grading/results/[yearMonth]/page.tsx
src/app/(internal)/courses/[id]/grading/results/page.tsx
src/app/(internal)/courses/[id]/join-requests/page.tsx
src/app/(internal)/courses/[id]/locked/page.tsx
src/app/(internal)/courses/[id]/materials/page.tsx
src/app/(internal)/courses/[id]/members/page.tsx
src/app/(internal)/courses/[id]/page.tsx
src/app/(internal)/courses/[id]/recordings/page.tsx
src/app/(internal)/courses/[id]/schedule/page.tsx
src/app/(internal)/courses/[id]/students/history/page.tsx
src/app/(internal)/courses/[id]/students/page.tsx
src/app/(internal)/data-verification-requests/[id]/page.tsx
src/app/(internal)/data-verification-requests/[id]/verify/page.tsx
src/app/(internal)/discounts/[id]/page.tsx
src/app/(internal)/intakes/[id]/page.tsx
src/app/(internal)/news/[id]/page.tsx
src/app/(internal)/payment-infos/[id]/page.tsx
src/app/(internal)/payment-methods/[id]/page.tsx
src/app/(internal)/payment-plans/[id]/page.tsx
src/app/(internal)/programs/[id]/page.tsx
src/app/(internal)/programs/[id]/settings/page.tsx
src/app/(internal)/quizzes-v3/[id]/attempts/[attemptId]/page.tsx
src/app/(internal)/quizzes-v3/[id]/page.tsx
src/app/(internal)/quizzes-v3/[id]/responses/page.tsx
src/app/(internal)/subjects/[id]/page.tsx
src/app/(internal)/submissions/[id]/page.tsx
src/app/(internal)/users/[id]/assign-courses/page.tsx
src/app/(internal)/visibilities/[id]/page.tsx
src/app/(public)/join-course/[code]/page.tsx
src/app/(public)/verify/[token]/page.tsx
src/app/(quiz-v3)/take/[code]/attempt/[attemptId]/page.tsx
src/app/(quiz-v3)/take/[code]/done/page.tsx
src/app/(quiz-v3)/take/[code]/page.tsx
```

### Explicitly out of inventory

- `src/app/(internal)/courses/[id]/attendance/page.tsx` (already migrated)
- `src/app/(internal)/users/[id]/page.tsx` (user record shell)
- `src/components/course/record/**` shell files (identity strip, section rail) — only touch if a page forces a one-line import fix; prefer not
- `src/components/record/**` shell
- Attendance marking (Wave 4 / already mostly migrated)

---

### Task 1: Worktree

- [ ] **Step 1: Create from post–Wave 0 `dev`**

```bash
git fetch origin
git worktree add .worktrees/migrate-ui-w2-detail-chrome -b migrate/ui-w2-detail-chrome origin/dev
cd .worktrees/migrate-ui-w2-detail-chrome
```

---

### Task 2: Reference — course members chrome only

**Files:**
- Modify: `src/app/(internal)/courses/[id]/members/page.tsx`
- Optionally modify page-local chrome only (e.g. `CourseTabEditBar` if it is pure chrome and required) — **do not** edit `DataTable` column modules unless they only export button chrome and you limit the diff to imports/classes

- [ ] **Step 1: Swap Skeleton / non-table chrome to primitives**

In `members/page.tsx`:

- Replace `import { Skeleton } from "@/components/ui/skeleton"` with `import { Skeleton } from "@/components/primitives"`.
- Keep `import { DataTable } from "@/components/ui/data-table"`.
- Replace any Lucide icons in this file with Iconoir.
- Keep loading/empty behavior identical.

Example loading branch:

```tsx
import { Skeleton } from "@/components/primitives";

if (isCourseLoading) {
  return <Skeleton className="min-h-[200px] w-full rounded-xl" aria-busy />;
}
```

- [ ] **Step 2: Grep gate**

```bash
rg -n "from [\"']@/components/ui/" src/app/\(internal\)/courses/\[id\]/members/page.tsx
```

Expected: `data-table` only (plus any deferred leftovers noted).

- [ ] **Step 3: Commit**

```bash
git add src/app/\(internal\)/courses/\[id\]/members/page.tsx
git commit -m "$(cat <<'EOF'
migrate(ui): reskin course members page chrome to primitives.

EOF
)"
```

---

### Task 3: Course hub sub-routes batch

**Files:** all `src/app/(internal)/courses/[id]/**` paths in the inventory

- [ ] **Step 1: Migrate each page’s chrome** (Skeleton, Button, Card wrappers, Sheet/Dialog chrome, Tabs chrome)

Commit every logical group:

```bash
git commit -m "$(cat <<'EOF'
migrate(ui): reskin course hub detail chrome (schedule/materials/…).

EOF
)"
```

Special cases:

- `courses/[id]/page.tsx` — overview already uses `CourseRecordOverview`; only swap remaining `ui/skeleton` (or similar) on the page; do not rewrite overview internals beyond chrome imports if already tokenized.
- Grading / students / join-requests / email-templates — keep `DataTable` intact.

---

### Task 4: Admin entity detail + assignments + quizzes-v3 detail + public/quiz-take

- [ ] **Step 1: Admin `[id]` detail pages** (departments, campuses, categories, …)

- [ ] **Step 2: Assignments detail/grading submission pages**

- [ ] **Step 3: quizzes-v3 detail/responses/attempts** (not create/edit — those are Wave 3)

- [ ] **Step 4: Public join-course / verify + quiz-v3 take landing/done/attempt pages**

Commit per batch with clear messages.

---

### Task 5: Acceptance + PR

- [ ] **Step 1: Ensure no shell regressions**

```bash
# Shell files should be untouched unless documented
git diff origin/dev --stat -- src/components/course/record src/components/record src/components/shell
```

Expected: empty or only documented one-line fixes.

- [ ] **Step 2: Lint + push PR**

```bash
npm run lint
git push -u origin HEAD
gh pr create --base dev --title "migrate(ui): Wave 2 detail/record body chrome" --body "$(cat <<'EOF'
## Summary
- Reskin detail page chrome to primitives
- Course/user/org shells left intact
- DataTable/AutoForm untouched

## Test plan
- [ ] Course members + schedule smoke light+dark
- [ ] One admin detail page smoke
- [ ] Quiz take landing still works

## Review
Wave 2 inventory + playbook

EOF
)"
```

- [ ] **Step 3: Review → merge**

---

## Review brief

```
Review Wave 2 PR. Confirm inventory-only files, shells not redesigned,
DataTable/AutoForm internals untouched, no Lucide in migrated chrome,
behavior unchanged. Fail closed. Max 2 fix rounds.
```
