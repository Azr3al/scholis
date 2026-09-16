# Copy student name / email columns

**Date:** 2026-07-22  
**Status:** Approved (pending implementation plan)  
**Repos:** `schedjuice-reimagined-fe` (primary), `schedjuice-reimagined-be` (admin-report `user.email`)  
**Approach:** Shared `ResourceTable` column overflow menu (Approach 1) with Excel-style column copy

## 1. Summary

Add Excel-style **copy column** for student **names** and **emails** on:

1. Course details → Students roster (`/courses/[id]/students`)
2. Student payments (org `/finances/student-payments` and course-scoped `/courses/[id]/student-payments`), including both ResourceTable and Glide grid views

Copy is a **column action** alongside sort, both reached via a **⋯ overflow menu** on opted-in columns (not a sibling icon next to the label, and not label-click sort for those columns).

Student payments gains a visible **Email** column; the admin-report API must include `user.email`.

## 2. Goals

1. Copy only names, or only emails, as a single Excel column (one value per line, `\n`-joined).
2. Copy **visible page rows only** (current filters / search / page).
3. On payments, **dedupe by `user.id`** (first visible occurrence wins) so multi-payment rows do not repeat students.
4. Keep sort and copy as peer column actions without fighting each other (menu, not nested hit targets).
5. Same affordance in payments ResourceTable and Glide views.

## 3. Non-goals

- Multi-column range select / TSV of name+email in one gesture (users copy each column separately).
- Copying all pages / full filtered set beyond the current page.
- CSV export download, unpaid-students page, course students **history** tab.
- Changing permissions (if the user can see the column, they can copy it).
- Migrating every sortable column to the overflow menu — only opt-in columns (Name / Email here).

## 4. Locked decisions

| Topic | Choice |
| --- | --- |
| Clipboard format | Excel column: values joined by `\n`; empty cells → empty lines |
| Row scope | Current visible page only |
| Name vs email | Separate copy actions (one column at a time) |
| Header UX | ⋯ column menu: Sort ascending / Sort descending / Clear sort (when sorted) / Copy column |
| Sort on menu columns | Label is **not** the sort click target; sort only via menu |
| Other columns | Unchanged (label-click `SortableHeader` as today) |
| Payments email UI | Add Email column after Student (`user__name`) |
| Payments email data | Backend `admin_report_payment_row` adds `user.email` |
| Payments copy dedupe | By `user.id`; preserve first-seen order |
| Course students dedupe | None (one row per student) |
| Empty / failure | Toast “Nothing to copy” if no visible rows; error toast if clipboard write fails. Rows with blank values still copy as empty lines. |
| Grouped payment rows | Copy from flattened visible student cells; still dedupe by `user.id` |

## 5. UX

Course students:

```
┌────────────────────────────────────┐
│  Name                         [⋯]  │
│  Email                        [⋯]  │
└────────────────────────────────────┘
```

Student payments:

```
┌────────────────────────────────────┐
│  Student                      [⋯]  │
│  Email                        [⋯]  │
└────────────────────────────────────┘
```

⋯ menu (both):

```
  • Sort ascending
  • Sort descending
  • Clear sort          (when column is currently sorted)
  • Copy column
```

Success toast examples: “Copied 12 names”, “Copied 12 emails” (payments Student column still says “names”).

## 6. Architecture

### Shared frontend

1. **Column header-actions API** on `ResourceTable` / table header rendering — opt-in per column (e.g. `headerMenu: { copy: true }` plus existing `enableSorting`). When set, render ⋯ instead of wrapping the label in `SortableHeader`.
2. **`copyVisibleColumnValues` helper** — pure function: `(values: string[], options?: { dedupeKeys?: Array<string | number | null> }) => string`. Dedupe keeps first occurrence; supersedes unused TanStack `helpers/copy-column.ts` (remove or thin-wrap).
3. **Clipboard + toast** — `navigator.clipboard.writeText` + existing toast pattern (`CopyInput` / finance pages).

### Course students

- Files: `src/app/(internal)/courses/[id]/students/page.tsx`
- Enable header menu on `name` and `email` only.
- Values from existing accessors; no API change.

### Student payments

- **Backend:** `app_finance/payment_group.py` → `admin_report_payment_row` `user` object gains `"email": payment.user.email` (group rows inherit via existing composition).
- **FE types:** `StudentPaymentAdminReportRow.user` includes optional `email`.
- **ResourceTable:** `student-payments-resource-table.tsx` — Email column; Name/Email header menus; copy with dedupe.
- **Glide grid:** `student-payments-grid.tsx` — Email column + column-header ⋯ with same actions; reuse helper.
- **Column meta:** update `student-payments-resource-column-meta` / layout as needed for the new column.

### Data flow (copy)

```
visible rows
  → map to { key: user.id, value: name|email }
  → dedupe by key (payments only)
  → join("\n")
  → clipboard.writeText
  → toast
```

## 7. Edge cases

| Case | Behavior |
| --- | --- |
| Empty page | Toast “Nothing to copy”; do not clear clipboard |
| Missing name/email | Empty string for that student slot |
| Missing `user.id` (payments dedupe) | Include row once using stable row index as fallback key |
| Clipboard rejection | Error toast; no crash |
| Clear sort | Sets sorts to remove this column’s sort entry via existing `onSortsChange` / cycle helpers |

## 8. Testing (high-value)

- **BE:** admin-report (or `admin_report_payment_row` unit) asserts `user.email` present.
- **Helper:** dedupe preserves first-seen order; empty input → `""`; no dedupe keys → all values.
- **Header menu:** choosing Copy does not change sorts; Sort items still update sorts.
- **Thin wiring:** Name/Email expose the menu on the two surfaces (mock clipboard for copy invocation). Avoid happy-path-only full-page smoke.

## 9. Implementation notes

- Prefer extending `Column` / header rendering in `@/components/data-table` over page-local header hacks.
- Glide affordance should match menu semantics even if chrome differs slightly from HTML table headers.
- Do not broaden the overflow menu to all payment columns in this change.
