# Wave 1 — List / Index Chrome Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin list/index page chrome to DESIGN.md primitives while leaving embedded `DataTable` bodies untouched.

**Architecture:** Page-by-page Approach B chrome swap per the shared playbook. Parallel-safe vs Waves 2–4 as long as this inventory is not edited by other waves. Work from latest `dev` **after Wave 0 merges**.

**Tech Stack:** Next.js App Router, `@/components/primitives`, Iconoir, `motion/react` + `@/lib/sj/motion.ts`, Vitest only if touching helpers.

**Spec:** [`../specs/2026-07-09-design-md-chrome-migration-program-design.md`](../specs/2026-07-09-design-md-chrome-migration-program-design.md)  
**Playbook:** [`2026-07-09-design-md-chrome-migration-playbook.md`](2026-07-09-design-md-chrome-migration-playbook.md)

**Branch:** `migrate/ui-w1-list-chrome`  
**Worktree (suggested):** `.worktrees/migrate-ui-w1-list-chrome`  
**Depends on:** Wave 0 merged to `dev`

**Wave 0.5:** Not required — `PageContainer` has no legacy `ui/*` imports.

---

## File Structure

Primary inventory = `page.tsx` files that import `@/components/ui/*` and classify as list/index. Also migrate **page-local chrome components** only when required to finish that page’s header/actions/empty state (list them in the PR).

### Primary inventory (must migrate chrome)

```
src/app/(docs)/help/page.tsx
src/app/(internal)/(department)/departments/page.tsx
src/app/(internal)/administration/roles/page.tsx
src/app/(internal)/ai-detector/page.tsx
src/app/(internal)/announcements/page.tsx
src/app/(internal)/campuses/page.tsx
src/app/(internal)/categories/page.tsx
src/app/(internal)/categories/sort-order/page.tsx
src/app/(internal)/certificates/categories/page.tsx
src/app/(internal)/certificates/documentation/page.tsx
src/app/(internal)/certificates/page.tsx
src/app/(internal)/course-roles/page.tsx
src/app/(internal)/data-verification-requests/page.tsx
src/app/(internal)/discounts/page.tsx
src/app/(internal)/forms/page.tsx
src/app/(internal)/id-card/bulk/page.tsx
src/app/(internal)/id-card/page.tsx
src/app/(internal)/id-card/settings/page.tsx
src/app/(internal)/imports/page.tsx
src/app/(internal)/intakes/page.tsx
src/app/(internal)/leads/settings/page.tsx
src/app/(internal)/library/page.tsx
src/app/(internal)/logs/page.tsx
src/app/(internal)/logs/settings/page.tsx
src/app/(internal)/management/reports/classes-data/page.tsx
src/app/(internal)/management/reports/page.tsx
src/app/(internal)/news/page.tsx
src/app/(internal)/organizations/page.tsx
src/app/(internal)/payment-infos/page.tsx
src/app/(internal)/payment-methods/page.tsx
src/app/(internal)/payment-plans/page.tsx
src/app/(internal)/points/page.tsx
src/app/(internal)/points/settings/page.tsx
src/app/(internal)/programs/page.tsx
src/app/(internal)/quizzes-v3/page.tsx
src/app/(internal)/quizzes-v3/question-bank/page.tsx
src/app/(internal)/services/bulk-emails/page.tsx
src/app/(internal)/services/org-wide-announcements/page.tsx
src/app/(internal)/services/password-change-request/page.tsx
src/app/(internal)/services/upload-access-log/page.tsx
src/app/(internal)/shortcuts/analytics/page.tsx
src/app/(internal)/shortcuts/available-teachers/page.tsx
src/app/(internal)/shortcuts/course-data/page.tsx
src/app/(internal)/shortcuts/course-insights/page.tsx
src/app/(internal)/shortcuts/meeting-link-sheet/page.tsx
src/app/(internal)/shortcuts/page.tsx
src/app/(internal)/shortcuts/school-welcome/page.tsx
src/app/(internal)/shortcuts/staff-data/page.tsx
src/app/(internal)/shortcuts/starting-courses/page.tsx
src/app/(internal)/shortcuts/student-data/page.tsx
src/app/(internal)/shortcuts/todays-classes/page.tsx
src/app/(internal)/shortcuts/user-insights/page.tsx
src/app/(internal)/shortcuts/user-schedule/page.tsx
src/app/(internal)/storage/page.tsx
src/app/(internal)/student-registration/page.tsx
src/app/(internal)/subjects/page.tsx
src/app/(internal)/visibilities/page.tsx
src/app/(public)/(auth)/forgot-password/page.tsx
src/app/(public)/(auth)/reset-password/page.tsx
src/app/(public)/dummy/page.tsx
src/app/(public)/notfound/page.tsx
```

**Do not touch:** `DataTable` internals; Wave 2–4 inventories; `debug/**`; already-migrated `/courses` Academic Hub.

---

### Task 1: Worktree

- [ ] **Step 1: Branch from post–Wave 0 `dev`**

```bash
cd /path/to/schedjuice-reimagined-fe
git fetch origin
git worktree add .worktrees/migrate-ui-w1-list-chrome -b migrate/ui-w1-list-chrome origin/dev
cd .worktrees/migrate-ui-w1-list-chrome
```

Confirm Wave 0 is present (`src/components/quizv2` must not exist). If it still exists, stop and wait for Wave 0.

---

### Task 2: Reference migration — `campuses/page.tsx`

**Files:**
- Modify: `src/app/(internal)/campuses/page.tsx`

- [ ] **Step 1: Replace legacy Button with primitives + Link pattern**

Current pattern uses `Button` wrapping/near `Link`. Target:

```tsx
"use client";

import { PageContainer } from "@/components/layout/page-container";
import { buttonVariants } from "@/components/primitives";
import { TypographyH1 } from "@/components/typography/h1";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DataTable } from "@/components/ui/data-table";

const CampusListPage = () => {
  const pathname = usePathname();
  return (
    <PageContainer width="wide" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <TypographyH1>Campuses</TypographyH1>
        <Link
          href={`${pathname}/create`}
          className={cn(buttonVariants({ variant: "primary", size: "md" }))}
        >
          Create a campus
        </Link>
      </div>
      <DataTable
        baseDetailsPath="/campuses"
        entity="campuses"
        uid="campuses"
        queryParams={{}}
      />
    </PageContainer>
  );
};
export default CampusListPage;
```

Notes:
- Keep `DataTable` import exactly.
- Prefer `gap-*` over `space-y-*` in new chrome.
- Do not restyle the table.

- [ ] **Step 2: Grep gate on this file**

```bash
rg -n "from [\"']@/components/ui/" src/app/\(internal\)/campuses/page.tsx
```

Expected: only `data-table`.

```bash
rg -n "lucide-react" src/app/\(internal\)/campuses/page.tsx
```

Expected: no matches.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(internal\)/campuses/page.tsx
git commit -m "$(cat <<'EOF'
migrate(ui): reskin campuses list chrome to primitives.

EOF
)"
```

---

### Task 3: Migrate remaining list pages in batches

**Files:** remaining paths in the primary inventory

For **each** page, apply the same recipe:

1. Swap chrome `ui/*` → primitives per playbook.
2. Replace Lucide → Iconoir in that file.
3. Keep `DataTable` / deferred widgets.
4. Replace card stacks with type-led layout when the page only uses `Card` as a dumb wrapper.
5. Add a subtle `crossfade` wrapper only when introducing a new section container (not required for one-line header swaps).
6. Commit every **5–10** pages (or every logical domain: certificates, shortcuts, payments, …).

- [ ] **Step 1: Batch — admin CRUD lists** (`departments`, `campuses` done, `categories`, `subjects`, `programs`, `intakes`, `course-roles`, `visibilities`, `organizations`, `news`, `announcements`, `discounts`, `payment-*`, `forms`, `data-verification-requests`)

Commit message pattern:

```bash
git commit -m "$(cat <<'EOF'
migrate(ui): reskin admin CRUD list chrome (batch).

EOF
)"
```

- [ ] **Step 2: Batch — certificates / id-card / library / storage / imports / logs / points / leads settings / student-registration / ai-detector / administration/roles**

- [ ] **Step 3: Batch — shortcuts/** (all inventory paths under `shortcuts/`)

- [ ] **Step 4: Batch — services list pages + management reports + quizzes-v3 list/question-bank**

- [ ] **Step 5: Batch — docs help index + public auth forgot/reset + dummy/notfound**

After each batch:

```bash
# Example — replace with the batch's files
rg -n "from [\"']lucide-react[\"']" <batch-files>
rg -n "from [\"']@/components/ui/" <batch-files>
```

---

### Task 4: Acceptance + PR

- [ ] **Step 1: Inventory completion check**

```bash
# Every inventory page should either have no ui imports except data-table/auto-form,
# or only deferred leftovers called out in the PR.
for f in \
  src/app/\(internal\)/campuses/page.tsx \
  src/app/\(internal\)/programs/page.tsx \
  src/app/\(internal\)/shortcuts/page.tsx
 do
  echo "==== $f"
  rg -n "from [\"']@/components/ui/" "$f" || true
done
```

- [ ] **Step 2: Lint**

```bash
npm run lint
```

- [ ] **Step 3: Open PR**

```bash
git push -u origin HEAD
gh pr create --base dev --title "migrate(ui): Wave 1 list/index chrome" --body "$(cat <<'EOF'
## Summary
- Reskin list/index page chrome to primitives (Approach B)
- DataTable bodies left untouched
- Follows chrome migration playbook

## Test plan
- [ ] Grep gates on touched files
- [ ] Smoke 2 list pages light+dark (e.g. Campuses, Shortcuts)
- [ ] Create buttons still navigate

## Review
Wave 1 inventory + playbook checklist

EOF
)"
```

- [ ] **Step 4: Review sub-agent → merge on pass**

---

## Review brief

```
Review Wave 1 PR against the chrome migration program spec + playbook.
Inventory: list/index pages only (see plan).
Pass only if DataTable/auto-form internals untouched, no Lucide in migrated chrome,
no files from Waves 2–4, and behavior unchanged.
Fail closed. Max 2 fix rounds.
```
