# Wave T2 — Embedded Record/Detail Tables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans.

**Goal:** Migrate embedded `DataTable` instances on record/detail routes and section components to `ResourceTable` + SDK list-hooks (scoped filters preserved).

**Depends on:** T0 (required), T1 preferred.  
**Branch:** `migrate/ui-t2-embedded`  
**Playbook:** [`2026-07-09-data-table-auto-form-playbook.md`](2026-07-09-data-table-auto-form-playbook.md)

---

## Inventory

| File | Entity | Notes |
| --- | --- | --- |
| `src/app/(internal)/programs/[id]/page.tsx` | `intakes`, `courses` | Two tables — distinct `namespace` |
| `src/app/(internal)/intakes/[id]/page.tsx` | `courses` | |
| `src/app/(internal)/categories/[id]/page.tsx` | `courses`, `quizes` | Two tabs |
| `src/app/(internal)/(department)/departments/[id]/page.tsx` | `user-departments` | |
| `src/app/(internal)/(department)/departments/[id]/edit/page.tsx` | `jobs` | Jobs tab only — do not rewrite AutoForm in this wave |
| `src/app/(internal)/courses/[id]/students/page.tsx` | `user-courses` | |
| `src/app/(internal)/courses/[id]/members/page.tsx` | `user-courses` | |
| `src/app/(internal)/courses/[id]/join-requests/page.tsx` | `course-join-requests` | |
| `src/app/(internal)/courses/[id]/email-templates/page.tsx` | `email-templates` | |
| `src/app/(internal)/courses/[id]/email-templates/[templateId]/page.tsx` | `user-emails` | |
| `src/app/(internal)/users/[id]/assign-courses/page.tsx` | `user-courses`, `courses` | Two tables — namespaces |
| `src/components/org/record/sections/org-admins-section.tsx` | `organizations/admins` | Nested path |
| `src/components/users/profile/user-payment-info-tab.tsx` | `payment-infos` | |

**Do not migrate (T3):** checkin-histories, grading, unmanaged finance grids, attempts-table, student-payments-report, recent-transactions inline edits.

---

### Tasks

- [ ] **Task 1:** Worktree from latest `dev` after T1.
- [ ] **Task 2:** For each inventory row — SDK hook (reuse T1 hook if same entity; add filter args for parent id), columns, replace `DataTable`, unique `namespace` per table on the page.
- [ ] **Task 3:** Preserve `getDataFilterParams` / parent-id filters by passing them into the SDK hook args (not by hardcoding fetch inside ResourceTable).
- [ ] **Task 4:** Grep inventory paths — zero `ui/data-table` imports.
- [ ] **Task 5:** Smoke program detail + course members + org admins; commit in logical batches; open PR.

## Review brief

```
T2: all embedded inventory tables on ResourceTable; parent filters preserved; dual tables use distinct namespaces; no T3 files modified; no DataTable shim.
```
