# Category select and date picker styling

**Date:** 2026-07-13  
**Status:** Approved design (Approach A)  
**Scope:** Frontend (`schedjuice-reimagined-fe`)

## Problem

1. **Category** fields use `EntityCombobox` (search header + “Type to filter the list”) where a normal scrollable select is expected.
2. **Date** fields use native `<input type="date">` (or the users shim that re-exports `NativeDatePicker`), so the calendar popup is unthemed browser chrome.

## Goals

- Category pickers for `entity="categories"` are a scrollable `Select` with no search UI.
- Date fields use the themed popover `DatePicker` + design-system `Calendar`.
- Same treatment app-wide for both patterns (not only the manual course form).

## Non-goals

- Other combobox entities (people search, levels with `onCreateNew`, payment-plan comboboxes still on `EntityCombobox`).
- `quiz-categories` (different entity; leave as combobox unless follow-up).
- `YearMonthSelector` (month/year only).
- Attempting to style native OS/browser date chrome.
- Redesigning Calendar beyond using the existing themed component.

## Approach

**Approach A — Shared components, swap call sites.**

Extend `EntitySelect` for filter/optional cases, replace every `entity="categories"` combobox with it. Point all product date UIs at the existing popover `DatePicker`; flip the users re-export off native.

## Category

### Shared component

Extend [`src/components/form/entity-select.tsx`](../../src/components/form/entity-select.tsx):

- Keep loading via `searchEntities` (`size: -1`) and the primitives `Select` popup (`max-h` + `overflow-y-auto`).
- Add support needed by current category call sites:
  - `emptyOption` (e.g. `{ value: "", label: "All" }`)
  - clearable / empty selection (empty value → placeholder)
  - `placeholder`
  - label hiding / composition when a parent owns `Field.Label`
  - existing `queryParams` / `filterParams` / missing-id fallback label

Course edit already uses `EntitySelect` for categories; create/edit and filters should match that UX.

### Call-site swaps

Replace `EntityCombobox` with `EntitySelect` only where `entity="categories"`:

| Area | Files |
|------|--------|
| Create/edit course | `manual-course-form.tsx`, `course-program-field-config.tsx` |
| Intake | `dates-step.tsx`, `course-preview-step.tsx`, `existing-intake-add-form.tsx`, `existing-intake-add-form-multi.tsx` |
| Filters | `attendance-god-view-filters.tsx`, `course-insights-filters.tsx` |

### UX

- Trigger shows selected name (or placeholder / “All”).
- Open list scrolls; selected row keeps checkmark.
- No filter/search input in the popup.

## Dates

### Canonical path

- Default UX: [`src/components/date/date-picker.tsx`](../../src/components/date/date-picker.tsx) popover variant.
- Flip [`src/components/users/date-picker.tsx`](../../src/components/users/date-picker.tsx) to re-export the **popover** `DatePicker` (same `date` / `setDate` API). That updates resign, user form fields, certifications, user-logs, and record resign together.
- Keep `NativeDatePicker` / `variant="native"` exported for explicit opt-in only; no product UI should use it after this pass.

### Replace raw `type="date"`

| Area | Files |
|------|--------|
| Scheduling | `manual-course-form.tsx`, `dates-step.tsx`, `course-preview-step.tsx` |
| Auto-form | `auto-form/field-map.tsx` date field |
| Course / grading | `feed-announcement-date-field.tsx`, `course-record-status-actions.tsx`, `create-result-sheet-dialog.tsx` |

Preserve:

- Range constraints (`min`/`max` → `fromDate`/`toDate`)
- Null/clear where forms allow empty dates
- Local midnight parsing (`T00:00:00`) to avoid timezone day-shifts
- Auto-form label / description / error layout (control only changes)

When touching course-local date imports under `courses/ui/date-picker`, prefer the canonical `@/components/date/date-picker` module.

### UX

- Themed trigger; popover calendar with month/year dropdowns.
- Selection uses app primary tokens, not browser blue.

## Testing

- Update `date-picker-consolidation` expectations if the users re-export comment changes (shim still must not contain `type="date"`).
- Smoke: Category on manual course form → scrollable select, no search header.
- Smoke: Start date → themed popover, not browser chrome.
- Spot-check one filter (insights or attendance) for “All” + selection.
- Spot-check one user date field after the re-export flip.

## Success criteria

1. No `entity="categories"` `EntityCombobox` remains in product UI.
2. No product date fields open native browser calendar chrome for the listed surfaces.
3. Required Category and date validation behavior unchanged.
4. Filter Category “All” / deselect still works.
