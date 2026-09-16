# Wave 3 — Create / Edit Chrome Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin create/edit page chrome (layout, sticky actions, skeletons, non-AutoForm controls) while leaving `AutoForm` field trees and schemas untouched.

**Architecture:** Approach B. Pages may keep `import { AutoForm… } from "@/components/ui/auto-form"` forever in this program. Only swap surrounding chrome and any hand-written controls outside AutoForm.

**Tech Stack:** Next.js App Router, `@/components/primitives`, Iconoir, `motion/react` + `@/lib/sj/motion.ts`.

**Spec:** [`../specs/2026-07-09-design-md-chrome-migration-program-design.md`](../specs/2026-07-09-design-md-chrome-migration-program-design.md)  
**Playbook:** [`2026-07-09-design-md-chrome-migration-playbook.md`](2026-07-09-design-md-chrome-migration-playbook.md)

**Branch:** `migrate/ui-w3-create-edit-chrome`  
**Worktree (suggested):** `.worktrees/migrate-ui-w3-create-edit-chrome`  
**Depends on:** Wave 0 merged to `dev`

---

## File Structure

### Primary inventory (pages that currently import `ui/*`)

```
src/app/(docs)/platform/docs/new/page.tsx
src/app/(internal)/(department)/departments/[id]/edit/page.tsx
src/app/(internal)/(department)/departments/create/page.tsx
src/app/(internal)/assignments/[id]/edit/page.tsx
src/app/(internal)/categories/[id]/edit/page.tsx
src/app/(internal)/certificates/create/page.tsx
src/app/(internal)/course-roles/[id]/edit/page.tsx
src/app/(internal)/course-roles/create/page.tsx
src/app/(internal)/courses/[id]/edit/page.tsx
src/app/(internal)/courses/[id]/email-templates/create/page.tsx
src/app/(internal)/courses/[id]/grading/reports/create/page.tsx
src/app/(internal)/data-verification-requests/create/page.tsx
src/app/(internal)/forms/edit/page.tsx
src/app/(internal)/intakes/[id]/edit/page.tsx
src/app/(internal)/news/[id]/edit/page.tsx
src/app/(internal)/news/create/page.tsx
src/app/(internal)/organizations/[id]/admins/create/page.tsx
src/app/(internal)/organizations/create/page.tsx
src/app/(internal)/payment-infos/[id]/edit/page.tsx
src/app/(internal)/payment-infos/create/page.tsx
src/app/(internal)/payment-methods/[id]/edit/page.tsx
src/app/(internal)/programs/[id]/edit/page.tsx
src/app/(internal)/quizzes-v3/[id]/edit/page.tsx
src/app/(internal)/quizzes-v3/create/page.tsx
src/app/(internal)/screenshots/create/page.tsx
src/app/(internal)/subjects/[id]/edit/page.tsx
src/app/(internal)/users/create/page.tsx
src/app/(internal)/visibilities/[id]/edit/page.tsx
src/app/(internal)/visibilities/create/page.tsx
```

### Secondary (no direct `ui/*` on page — migrate only if chrome lives in imported wrappers you must touch)

These pages had **no** direct `ui/*` import at inventory time. **Do not** expand scope into them unless a primary page forces a shared wrapper change. If you discover they still render legacy chrome via a thin page wrapper, add the file to the PR with justification:

- Course create wizard under `src/app/(internal)/courses/create/**`
- Various `*/create/page.tsx` / `*/edit/page.tsx` that only compose already-tokenized forms

**Hard don’t-touch:** `src/components/ui/auto-form/**`, zod schemas, default values, submit handlers (behavior).

---

### Task 1: Worktree

- [ ] **Step 1: Create from post–Wave 0 `dev`**

```bash
git fetch origin
git worktree add .worktrees/migrate-ui-w3-create-edit-chrome -b migrate/ui-w3-create-edit-chrome origin/dev
cd .worktrees/migrate-ui-w3-create-edit-chrome
```

---

### Task 2: Reference — departments create chrome

**Files:**
- Modify: `src/app/(internal)/(department)/departments/create/page.tsx`

- [ ] **Step 1: Read the page and identify chrome vs AutoForm**

```bash
rg -n "from [\"']@/components/ui/|AutoForm|Button|Skeleton|Card" \
  src/app/\(internal\)/\(department\)/departments/create/page.tsx
```

- [ ] **Step 2: Swap only non-AutoForm chrome**

Rules for this file (and all Wave 3 pages):

1. Keep every `AutoForm*` import and JSX tree.
2. Swap page-level `Button` / `Skeleton` / `Dialog` / `Sheet` used **outside** AutoForm to primitives.
3. If AutoForm renders submit via its own API, do not replace internal field components.
4. Sticky footer / back link / title row → primitives + tokens.
5. Lucide in chrome → Iconoir.

Illustrative sticky action (adapt to actual markup):

```tsx
import Link from "next/link";
import { Button, buttonVariants } from "@/components/primitives";
import { cn } from "@/lib/utils";

// Back link
<Link href="/departments" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
  Back
</Link>

// Standalone save button outside AutoForm (only if the page already has one)
<Button type="submit" form="department-create-form" variant="primary">
  Save
</Button>
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\(internal\)/\(department\)/departments/create/page.tsx
git commit -m "$(cat <<'EOF'
migrate(ui): reskin departments create page chrome around AutoForm.

EOF
)"
```

---

### Task 3: Course edit + quizzes-v3 create/edit

**Files:**
- `src/app/(internal)/courses/[id]/edit/page.tsx` — heavy AutoForm; chrome only
- `src/app/(internal)/quizzes-v3/create/page.tsx`
- `src/app/(internal)/quizzes-v3/[id]/edit/page.tsx`

- [ ] **Step 1: Migrate chrome; leave AutoForm / quiz editor field trees**

For course edit, expect many `AutoFormInputComponentProps` — **do not** rewrite those render props’ field logic; only swap outer layout chrome and any non-AutoForm controls.

- [ ] **Step 2: Commit**

```bash
git commit -m "$(cat <<'EOF'
migrate(ui): reskin course edit and quizzes-v3 create/edit chrome.

EOF
)"
```

---

### Task 4: Remaining create/edit inventory

- [ ] **Step 1: Batch admin entity create/edit pages**

- [ ] **Step 2: Batch news, orgs, payments, certificates, assignments, forms, screenshots, docs/new**

After each batch run grep gates on touched files. `auto-form` imports must remain.

```bash
rg -n "from [\"']@/components/ui/auto-form" <touched-create-edit-files>
# Expected: still present where it was before
```

---

### Task 5: Acceptance + PR

- [ ] **Step 1: Prove AutoForm package untouched**

```bash
git diff origin/dev --stat -- src/components/ui/auto-form
```

Expected: empty.

- [ ] **Step 2: Lint, PR, review, merge**

```bash
npm run lint
git push -u origin HEAD
gh pr create --base dev --title "migrate(ui): Wave 3 create/edit chrome" --body "$(cat <<'EOF'
## Summary
- Reskin create/edit page chrome to primitives
- AutoForm field trees and schemas untouched

## Test plan
- [ ] Departments create still submits
- [ ] Course edit loads and saves (smoke)
- [ ] Grep: auto-form package diff empty

## Review
Wave 3 inventory + playbook; reject any auto-form internal edits

EOF
)"
```

---

## Review brief

```
Review Wave 3 PR. Fail if src/components/ui/auto-form/** changed, if form
schemas/submit behavior changed, or if inventory boundaries violated.
Chrome-only primitives/Iconoir/tokens/motion OK. Max 2 fix rounds.
```
