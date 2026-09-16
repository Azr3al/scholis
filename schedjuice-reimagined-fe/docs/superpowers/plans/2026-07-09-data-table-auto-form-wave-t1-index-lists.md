# Wave T1 — Index / Admin List Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all top-level admin/index `DataTable` list pages to `ResourceTable` + per-entity SDK list-hooks; delete unreachable legacy helpers as consumers disappear (campuses already done in T0).

**Architecture:** For each entity: add `src/sdk/resources/<entity>.ts` + `hooks/<entity>.ts` + `keys/<entity>.ts` (mirror T0 campuses), typed columns via `column.*`, page uses `useResourceTableState({ namespace })`. No `DataTable` shim.

**Tech Stack:** Same as T0.  
**Spec / Playbook:** parent program spec + [`2026-07-09-data-table-auto-form-playbook.md`](2026-07-09-data-table-auto-form-playbook.md)  
**Depends on:** T0 merged to `dev`  
**Branch:** `migrate/ui-t1-index-lists`  
**Worktree:** `.worktrees/migrate-ui-t1-index-lists`

---

## Inventory (migrate all)

| Page | Entity / search path | Notes |
| --- | --- | --- |
| `src/app/(internal)/categories/page.tsx` | `categories` | |
| `src/app/(internal)/course-roles/page.tsx` | `assigned-as-roles` | Confirm API path |
| `src/app/(internal)/data-verification-requests/page.tsx` | `data-verification-requests` | |
| `src/app/(internal)/(department)/departments/page.tsx` | `departments` | |
| `src/app/(internal)/discounts/page.tsx` | `discounts` | |
| `src/app/(internal)/intakes/page.tsx` | `intakes` | |
| `src/app/(internal)/logs/page.tsx` | `users` | User picker for logs |
| `src/app/(internal)/news/page.tsx` | `news` | |
| `src/app/(internal)/organizations/page.tsx` | `organizations` | |
| `src/app/(internal)/payment-infos/page.tsx` | `payment-infos` | |
| `src/app/(internal)/payment-methods/page.tsx` | `payment-methods` | |
| `src/app/(internal)/payment-plans/page.tsx` | `payment-plans` | |
| `src/app/(internal)/programs/page.tsx` | `programs` | |
| `src/app/(internal)/quizzes-v3/page.tsx` | `quizzes` | |
| `src/app/(internal)/quizzes-v3/question-bank/page.tsx` | `quiz-questions` | |
| `src/app/(internal)/visibilities/page.tsx` | `visibilities` | |
| `src/app/(internal)/finances/unpaid-students/page.tsx` | `users` | Custom filters — preserve |
| `src/app/(internal)/finances/payment-history/page.tsx` | `user-payments` | |
| `src/app/(internal)/finances/receiver-transactions/page.tsx` | `receiver-side-screenshots` | |
| `src/app/(internal)/services/campus-checkins/page.tsx` | `building-checkins` | Read-only ops list |
| `src/app/(internal)/student-registration/page.tsx` | `users` | Approve/decline — preserve mutations; table body only |

**Also update:** `create-entity.ts` scaffold template to emit `ResourceTable` + SDK hook stub (not `DataTable`).

**Skip:** `campuses/page.tsx` (T0). `CrudViewPage.tsx` commented import — delete dead import if present.

**Do not touch:** T2/T3 pages, `ui/data-table.tsx` internals (except if extracting a shared helper into sdk — prefer sdk).

---

### Task 1: Worktree from post-T0 `dev`

- [ ] **Step 1:**

```bash
git fetch origin
git worktree add .worktrees/migrate-ui-t1-index-lists -b migrate/ui-t1-index-lists origin/dev
cd .worktrees/migrate-ui-t1-index-lists
test -f src/components/data-table/resource-table.tsx
test -f src/sdk/hooks/campuses.ts
```

---

### Task 2: Per-entity cutover loop (repeat for each inventory row)

For entity `E` with page `P`:

- [ ] **Step 1: Add SDK** `resources/E.ts`, `hooks/E.ts`, `keys/E.ts` — copy campuses pattern; adjust path string to match current `entity=` prop.
- [ ] **Step 2: Add columns module** next to page or under `src/app/(internal)/…/columns.tsx` using `column.text` / `column.date`; port from `src/app/artifacts/columns/` only fields that were visible by default.
- [ ] **Step 3: Rewrite page** per playbook ResourceTable recipe; preserve filters/actions already on the page (approve buttons, finance filters) as `filterSlot` or siblings — do not drop product behavior.
- [ ] **Step 4: Grep page** for `ui/data-table` — must be gone.
- [ ] **Step 5: Commit per entity or small batch** (e.g. academic admin batch, finance batch):

```bash
git add src/sdk src/app/(internal)/<paths>
git commit -m "$(cat <<'EOF'
Migrate <entity> list to ResourceTable and SDK hook.

EOF
)"
```

---

### Task 3: Update `create-entity.ts` template

- [ ] Replace generated `DataTable` import/usage with `ResourceTable` + TODO hook name pattern documented in a comment.
- [ ] Commit.

---

### Task 4: Acceptance

```bash
rg -n "from [\"']@/components/ui/data-table[\"']" \
  src/app/(internal)/categories/page.tsx \
  src/app/(internal)/programs/page.tsx \
  src/app/(internal)/organizations/page.tsx \
  src/app/(internal)/finances/payment-history/page.tsx \
  src/app/(internal)/student-registration/page.tsx
# Expect: no matches on all T1 pages

rg -n "from [\"']lucide-react[\"']" src/sdk src/components/data-table
npm run test:unit -- src/sdk src/components/data-table
```

Smoke: categories, programs, one finance list — light + dark.

---

### Task 5: PR

Title: `migrate(ui): T1 index lists to ResourceTable + SDK hooks`  
Review: playbook checklist; every inventory file migrated; no shim; SDK hooks present per entity.

## Review brief

```
Review T1 PR: all inventory list pages use ResourceTable + sdk hooks; no DataTable on those pages; create-entity template updated; no Lucide in sdk/data-table; product filters/actions preserved.
```
