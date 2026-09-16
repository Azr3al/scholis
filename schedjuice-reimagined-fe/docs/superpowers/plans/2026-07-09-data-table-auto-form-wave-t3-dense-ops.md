# Wave T3 — Dense Ops, Inline Edit, UnManagedDataTable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans.

**Goal:** Migrate dense/ops tables and `UnManagedDataTable` consumers onto `Table` / `ResourceTable` with **edit-kit** editable columns where the product already inline-edits; keep Glide `DataSheet` surfaces untouched.

**Depends on:** T0 edit-kit stable; prefer after T2.  
**Branch:** `migrate/ui-t3-dense-ops`  
**Playbook:** [`2026-07-09-data-table-auto-form-playbook.md`](2026-07-09-data-table-auto-form-playbook.md)

---

## Inventory

| File | Component today | Approach |
| --- | --- | --- |
| `src/app/(internal)/finances/checkin-histories/page.tsx` | DataTable + edit controls | ResourceTable + `column.editable*` / existing row autosave → edit-kit |
| `src/app/(internal)/finances/user-attendance/page.tsx` | DataTable + edit controls | Same |
| `src/app/(internal)/courses/[id]/checkin-history/[eventIndex]/page.tsx` | DataTable ×2 + edit controls | Same |
| `src/app/(internal)/finances/recent-transactions/page.tsx` | DataTable + inline forms | Editable columns for safe fields; status may stay explicit control |
| `src/components/finances/student-payments-report.tsx` | DataTable + heavy inline | Prefer editable columns; if sheet-like density wins, **keep/route to DataSheet** — do not force ResourceTable spreadsheet |
| `src/app/(internal)/finances/school-overview/page.tsx` | UnManagedDataTable | `<Table />` render-only + page-owned data fetch via SDK |
| `src/app/(internal)/finances/cash-flow/page.tsx` | UnManagedDataTable | Same |
| `src/app/(internal)/finances/payroll/page.tsx` | UnManagedDataTable | Same |
| `src/app/(internal)/courses/[id]/grading/page.tsx` | DataTable | ResourceTable read-mostly |
| `src/components/quiz-v3/results/attempts-table.tsx` | DataTable | ResourceTable; preserve selection bar |

**Transitive hosts** (verify after parent component migrates): student-payments pages, quiz responses page.

**High-risk policy:** payment status / money fields — no silent autosave; confirm or explicit control.

**Do not modify:** `src/components/data-sheet/**` feature behavior (theme tokens OK only if required for consistency — prefer leave alone).

---

### Tasks

- [ ] **Task 1:** Worktree; confirm edit-kit API from T0.
- [ ] **Task 2:** Migrate UnManagedDataTable trio to `<Table />` + SDK/page data (no fake ResourceTable URL state if page already owns state).
- [ ] **Task 3:** Migrate checkin/attendance edit surfaces onto editable columns + `FormSaveTick` reserved space; reuse `useCheckinHistoryRowAutosave` patterns by adapting to edit-kit rather than duplicating.
- [ ] **Task 4:** Migrate grading + attempts-table; preserve selection/bulk actions as page composition.
- [ ] **Task 5:** Student payments — if ResourceTable cannot meet density without spreadsheet UX, document in PR and keep DataSheet path; still remove legacy DataTable import.
- [ ] **Task 6:** Grep — zero `UnManagedDataTable` imports in `src/`; zero `ui/data-table` on inventory files.
- [ ] **Task 7:** Smoke checkin-histories editable save + tick; payroll table; attempts selection. PR.

## Review brief

```
T3: unmanaged tables gone; editable surfaces use edit-kit; high-risk fields not autosaved; DataSheet not rewritten; no legacy DataTable on inventory paths.
```
