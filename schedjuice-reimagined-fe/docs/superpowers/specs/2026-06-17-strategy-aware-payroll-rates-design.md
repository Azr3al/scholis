# Strategy-aware payroll: earnings widget + rates Glide grid

Date: 2026-06-17

## Background

Schedjuice now supports two payroll calculation strategies per tenant, selected by
`Organization.payroll_calculation_strategy`:

- `tr_phillips` (default) — hourly, uses `User.per_hour_rate` (+ `student_bonus_hourly_rate`).
- `session_based` — per-session, uses `User.per_session_rate`; total = rate x session count.

The payroll page (`/finances/payroll`) already dispatches to the correct endpoint
(`payroll/trphillips` vs `payroll/session-based`). Two surfaces still assume the
hourly strategy:

1. The "My earnings" dashboard widget hardcodes `payroll/trphillips`.
2. The rates editor (`/finances/rates`) flat table only exposes `per_hour_rate` and
   `student_bonus_hourly_rate`, with no way to edit `per_session_rate`.

This change makes both surfaces strategy-aware and upgrades the flat rates table from
the simple `DataTable` to Glide Data Grid (already used by the import wizard).

## Goals

- "My earnings" widget calls the tenant's payroll endpoint based on strategy.
- The flat rates table shows the correct editable rate column(s) per strategy.
- Replace the flat rates `DataTable` with a Glide Data Grid, with immediate per-cell save.

## Non-goals

- No backend changes. `per_session_rate`, `payroll_calculation_strategy`, and the
  `updateEntity` PUT already exist.
- `CourseRatesEditor` (the `supports_course_specific_rates` branch) is untouched.
- Microsoft payroll path is out of scope.

## Design

### 1. "My earnings" widget — strategy dispatch

File: `src/components/home/widgets/my-earnings-widget.tsx`

- Read `tenant.payroll_calculation_strategy` via `useTenant()`.
- Endpoint = `session_based` ? `payroll/session-based` : `payroll/trphillips`.
- Include the endpoint in the react-query `queryKey` so it refetches when strategy differs.
- Both endpoints return `aggregate.total_earnings`, so the rendered card is unchanged.

### 2. Rates page — column selection by strategy

File: `src/app/(internal)/finances/rates/page.tsx`

The flat `EmployeeRatesTable` branch computes the editable rate columns from the strategy:

- `session_based` -> `[{ field: "per_session_rate", title: "Per Session Rate" }]`
- otherwise (hourly/default) -> `[{ field: "per_hour_rate", title: "Hourly Rate" }]`,
  plus `{ field: "student_bonus_hourly_rate", title: "Student Bonus Hourly Rate" }`
  when `!tenant.is_microsoft_on` (preserves current behavior).

The `supports_course_specific_rates` branch (renders `CourseRatesEditor`) is unchanged.
If a tenant has both `supports_course_specific_rates` and `session_based`, the
course-specific editor still wins (existing precedence); revisit only if required.

### 3. `EmployeeRatesGrid` (new Glide component)

File: `src/components/finances/employee-rates-grid.tsx` (`"use client"`)

- Props: `rateColumns: { field: string; title: string }[]`, `includeInactive: boolean`.
- Fetch: `useQuery` -> `fetchEntities("users", { size: -1, sorts: ["name"], fields: ["id","name","email", ...rateFields], filter roles in (admin, manager, teacher), include_inactive when set })`.
- Columns: `Name` (readonly), `Email` (readonly), then the strategy rate column(s) —
  editable, `font-mono tabular-nums`.
- Edit/save (`onCellEdited`): optimistically update the local row, call
  `updateEntity("users", id, { [field]: value })`; success toast; on error revert the
  cell and show a destructive toast. Empty input clears the field to null.
- States: loader while fetching; composed empty state ("No staff match the current
  filter"); inline error state.
- Glide built-in search (Cmd/Ctrl+F), click-to-sort headers, dynamic height capped to
  viewport (mirrors `ImportDataGrid`).
- Reuses `useGlideTheme` from `src/components/import-grid/use-glide-theme.ts`.

### 4. Styling (design-taste-frontend)

- Reuse the existing Glide theme; clean rounded-border container.
- Rate columns: mono tabular numbers.
- No emojis; neutral palette consistent with the app. No new dependencies.

## Files touched

- `src/components/home/widgets/my-earnings-widget.tsx` (edit)
- `src/app/(internal)/finances/rates/page.tsx` (edit)
- `src/components/finances/employee-rates-grid.tsx` (new)

## Testing

- Manual: hourly tenant shows Hourly Rate (+ Student Bonus when not Microsoft);
  session_based tenant shows Per Session Rate; edits persist (PUT) and survive refetch;
  widget shows correct earnings per strategy.
