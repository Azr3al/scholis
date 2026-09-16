# Payment status select layout

**Date:** 2026-07-11  
**Status:** Approved  
**Surfaces:** Student payments ResourceTable (finance + course); recent-transactions status column (shared `UserPaymentStatusInlineForm`)

## Problem

The inline Status select in payment HTML tables looks broken:

1. **Wrapped trigger label** — “Pending Payment” wraps onto two lines inside a cramped trigger.
2. **Detached menu** — the open list is wider than the trigger and does not sit cleanly under it.
3. **Column too narrow** — Status cells shrink under `fullWidth` + `min-w-0`, fighting the select’s default `min-w-44`.

## Goals

- Single-line trigger labels (no wrap); truncate with ellipsis only if the column is still too narrow.
- Status column wide enough that common labels (“Pending Payment”, “Pending Verification”, “Amount Mismatch”) usually fit in full.
- Open menu left-aligned to the trigger, at least as wide as the trigger, with full untruncated option labels.

## Non-goals

- Do not change status options, mutation behavior, or permission/disabled rules.
- Do not add a ResourceTable `size` / `minSize` column API.
- Do not redesign the Glide grid `PaymentStatusPopover` in this change (canvas cell + popover path is separate).
- Do not restyle unrelated Selects outside table/status usage beyond shared primitive fixes needed for nowrap/truncate.

## Approach

**A — Full label, single line (chosen):** widen the Status cell floor and fix trigger/value CSS so labels stay on one line; keep menu anchored and at least trigger-width.

## Design

### Trigger

In [`select.tsx`](../../../src/components/primitives/select.tsx):

- Keep fixed height (`h-10`) and horizontal padding.
- Selected value: `min-w-0 flex-1 truncate whitespace-nowrap` so long labels never wrap; ellipsis only when constrained.
- Chevron stays `shrink-0`.
- When used with `fullWidth` (table cells), do not force a hard `min-w-44` that fights the cell — width comes from the column floor + `w-full`. Non-`fullWidth` Selector keeps its existing `w-[180px]` behavior.

### Status cell width

In [`user-payment-status-inline-form.tsx`](../../../src/components/datatable/user-payment-status-inline-form.tsx):

- Give the wrapper a real floor (~`min-w-[13.5rem]` / ~216px, ±0.5rem OK) so the Status column does not collapse.
- Prefer horizontal table scroll on narrow viewports over wrapped status text.

Applies automatically to finance student-payments, course student-payments, and recent-transactions (shared component).

### Menu

- Left-align to the trigger (`align="start"` on the positioner if not already).
- Keep `min-w-[var(--anchor-width)]` so the popup is never narrower than the trigger.
- Option rows stay full labels (no truncate in the list).

### Lofi — before / after

```
Before:
| Status     |
| [Pending  |   ← wrapped
|  Payment v]|
|   ┌──────────────────┐  ← wider, misaligned
|   | ✓ Pending Payment|

After:
| Status                |
| [Pending Payment   v] |
| ┌─────────────────────┐
| | ✓ Pending Payment   |
| |   Pending Verification|
| |   Amount Mismatch   |
| └─────────────────────┘
```

## Error handling & edge cases

- System-only statuses shown as current value: same single-line / truncate rules.
- Disabled / loading states: same width floor; loading placeholder matches trigger width.
- Very long custom labels: truncate in trigger; full text in menu.

## Testing

- Visually open Status on a row with “Pending Payment” / “Pending Verification”: one line, menu under trigger.
- Narrow the viewport: table scrolls horizontally; label truncates rather than wraps.
- Confirm recent-transactions and student-payments ResourceTable both pick up the shared form fix.
