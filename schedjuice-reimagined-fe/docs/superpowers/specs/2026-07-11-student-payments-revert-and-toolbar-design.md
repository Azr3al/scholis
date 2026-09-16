# Student payments: restore “Revert to original” + compact DataSheet toolbar

**Date:** 2026-07-11  
**Status:** Approved (pending spec review)  
**Surfaces:** `/finances/student-payments`, `/courses/[id]/student-payments`, global DataSheet toolbar

## Problem

1. **Broken toggle.** After wave T3, student payments always mounts the Glide `DataSheet` (`StudentPaymentsGrid`). `GridViewToggle` still flips `useGridViewPreference("student-payments")` and its label (“Try the new look” / “Revert to original”), but both preference values render the same sheet. Course student payments has no toggle at all.
2. **Toolbar overflow.** The shared DataSheet toolbar lays out icon + text labels in one flex row (`Columns`, `Density`, `Font`, `Undo`, `Redo`, `Copy`, `Paste`, `Go to row`). On typical student-payments widths this overflows and forces horizontal scrolling.

## Goals

- Restore a **real** alternate “original” view with **full ops parity** to the sheet (filters, summary, status/upload, student drawer, verification upload entry, editable fields under the same permissions).
- Wire the toggle on **both** finance and course student-payments entry points, sharing one preference key.
- Make the DataSheet toolbar **responsive globally**: show labels when there is room; icon-only + tooltip/`aria-label` when narrow — no horizontal scrollbar on the toolbar.

## Non-goals

- Do not revive deleted legacy `ui/data-table` / DataTable modules.
- Do not change recent-transactions dual-path behavior (already switches Glide vs `ResourceTable`).
- Do not redesign payment business logic, OCR, or multipart grouping rules. Both views must still list the same admin-report rows (including group/part rows the sheet already shows).
- Do not force ResourceTable spreadsheet density; the sheet remains the dense ops surface.

## Approach (chosen)

**Shared report shell + dual body**, plus **global responsive toolbar**.

```
Finance page / Course page
        │
        ▼
StudentPaymentsReportShell   ← filters, summary, header, drawer, dialogs
        │
        ├── useGlideView true  → StudentPaymentsGrid (DataSheet body)
        └── useGlideView false → StudentPaymentsResourceTable (ResourceTable body)
```

## Architecture

### Preference

- Keep `useGridViewPreference("student-payments")`.
- `useGlideView === true` → DataSheet body; `false` → ResourceTable body.
- Default remains `false` (original) until the user opts into Glide.
- Same storage key for finance and course pages so the choice stays in sync.
- Wait for `hydrated` before rendering the toggle/body to avoid label flash (existing pattern).

### Shell

Extract chrome currently inside `StudentPaymentsGrid` report mode into a shell (name may vary; intent is one owner):

- Header title + summary line
- `headerActions` including `GridViewToggle` and “Upload Verification File”
- Filter controls (transaction ID, month/year, course when not fixed, status, clear, share link)
- Summary strip (totals / unuploaded / uploaded / verified / students)
- Screenshot dialog, coverage edit dialog, student drawer wiring

Course mode continues to pass `fixedCourseId` / `courseMeta`; finance mode keeps the course combobox.

Both bodies consume the **same** admin-report query results, filter URL state, and mutation/invalidation paths owned by the shell (or a shared hook extracted from today’s grid).

### Glide body

Existing sheet + cell overlays (`PaymentStatusPopover`, actions menu, etc.), without duplicating shell chrome.

### Original body (`StudentPaymentsResourceTable`)

- `ResourceTable` over **page-owned** admin-report rows (not a separate list-search endpoint that diverges from the report).
- Columns mirror the sheet for report mode: No., Student, Amount, Payment Account, Date on Screenshot, Status, Transaction ID, Description; include Course when not course-scoped.
- Ops parity:

| Capability | Original view |
|---|---|
| Filters & summary | Shell (identical) |
| Status / Upload | Same popover / upload flow as sheet, gated by same auth helpers |
| Student name | Opens same student payments drawer |
| Editable fields | edit-kit / inline controls matching sheet `isPaymentFieldEditable` / synthetic-row rules |
| Dropped / exempt rows | Non-editable where the sheet already blocks edits |
| Verification upload CTA | Header link in shell |

### Entry points

- `/finances/student-payments` (`student-payment-page-content.tsx`): use shell + toggle (replace dead toggle that always mounts grid).
- `/courses/[id]/student-payments` via `CourseStudentPaymentsReport`: same shell + toggle.
- `StudentPaymentsReport` wrapper updated to compose shell rather than always forwarding to grid-only.

## Toolbar design (global)

```
Wide:   [Columns] [Density] [Font] [Undo] [Redo] [Copy] [Paste] [Go to row]     [⛶]
Narrow: [⊞] [≡] [Aa] [↶] [↷] [⎘] [📋] [↪]                                      [⛶]
```

- Measure toolbar container width with `ResizeObserver` (same idea as `useContainerHeight`).
- When measured content would overflow: set `compact` — hide text labels; keep icons; set `title` and `aria-label` from the action label.
- Pass `compact` into leading menus (`ColumnsMenu`, `DensityMenu`, `FontSizeMenu`).
- Toolbar container: no horizontal scroll (`overflow-hidden`); actions must fit via compact mode.
- Before first measurement: default to labeled (wide) to avoid a compact flash; switch to compact only when overflow is detected.
- Applies to **all** DataSheet consumers.

## Error handling & edge cases

- Admin-report failure / empty: shell-owned; both bodies show the same empty/error treatment.
- Synthetic unuploaded rows: ResourceTable status cell still offers Upload when `canRecord` and not exempt/dropped.
- Fullscreen: **Glide-only**. Original ResourceTable uses normal page layout (no sheet fullscreen control).
- Preference key collision: intentional sharing between finance and course; do not introduce a second key.

## Testing

- Unit: compact decision — overflow → hide labels; sufficient width → show labels.
- Unit/integration: toggling preference mounts ResourceTable vs DataSheet; shared filter state still drives the active body.
- Smoke: finance + course pages — toggle both ways; status upload + student drawer on original; no toolbar horizontal scroll at a narrow viewport/container width.

## Success criteria

1. Clicking “Revert to original” shows a distinct ResourceTable UI; “Try the new look” returns to DataSheet.
2. Course student-payments exposes the same toggle and shared preference.
3. Filters, summary, upload/status, and student drawer work on the original view.
4. DataSheet toolbar never requires horizontal scrolling; labels appear when space allows.

## Implementation notes (for planning)

- Prefer extracting a shared data/filter hook from `student-payments-grid.tsx` rather than duplicating admin-report fetch logic.
- Reuse payment overlay components where possible instead of reimplementing status/upload UI.
- Keep recent-transactions on its own preference key (`recent-transactions`); out of scope for this change except as a pattern reference.
