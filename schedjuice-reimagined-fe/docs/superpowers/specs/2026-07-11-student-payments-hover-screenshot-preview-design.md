# Student payments: hover screenshot preview pane

**Date:** 2026-07-11  
**Status:** Approved  
**Surfaces:** `/finances/student-payments`, `/courses/[id]/student-payments` (original ResourceTable + Glide)

## Problem

1. **Click-to-view is slow for ops.** Staff verifying payments need to scan many screenshots. Opening a dialog (or digging into a row action menu) per row is not ergonomic on a desktop-heavy workflow.
2. **“View image” affordance feels missing / buried.** ResourceTable has a short “View” action; Glide hides View in the row actions menu. Users want a clear View control back, plus a faster scan path.

## Goals

- Show a **persistent right-side screenshot preview** that updates when hovering a payment row (both original and Glide views).
- **Clear** the preview when the pointer leaves the table or hovers a row with no screenshot (empty state: “Hover a row to preview”).
- Keep per-row **View** → large dialog as a fallback (both views).
- Gate preview + View with existing `canViewPaymentScreenshots`.

## Non-goals

- No mobile-first redesign (desktop ops surface).
- No changes to upload, OCR, verification, coverage, or student drawer flows.
- Preview pane is display-only (not an editor).
- Do not revive the old recent-transactions student detail `sidePanel` content; this pane is screenshot-only.

## Approach

**Shell-owned hover state + shared preview component.** Layout split differs slightly by body so we reuse existing Glide chrome:

```
StudentPaymentsReportShell
  ├── previewUrl state + ScreenshotPreviewPane
  ├── Original: shell split [ ResourceTable | pane ]
  └── Glide: pass pane as existing `sidePanel` + onRowHover into StudentPaymentsGrid
```

Dialog for explicit View remains shell-owned (existing `viewImageUrl` pattern).

## Design

### Layout

```
┌─ filters / summary / header ─────────────────────────────┐
│                                                          │
│  ┌─ table (flex) ──────────────────┐ ┌─ preview (~20rem)┐│
│  │ rows…                           │ │ Screenshot       ││
│  │  ▸ hovered row                  │ │ ┌──────────────┐ ││
│  │                                 │ │ │   image      │ ││
│  │                                 │ │ └──────────────┘ ││
│  │                                 │ │ or empty copy    ││
│  └─────────────────────────────────┘ └──────────────────┘│
└──────────────────────────────────────────────────────────┘
```

- Right pane width ≈ **20rem** (wider than the old 16rem student side column).
- Table column: `minmax(0, 1fr)`.
- Pane visible only when the user can view screenshots.
- Applies on finance and course student-payments (same shell).

### Hover behavior

| Event | Preview |
| --- | --- |
| Hover row with screenshot | Show that image (`getPaymentScreenshotUrl`) |
| Hover row without screenshot | Empty state |
| Pointer leaves table/grid | Empty state |
| Multipart / group row | First available part screenshot (existing helper) |

Bodies call `onRowHover(url: string | null)` only; shell owns state.

**ResourceTable:** row `onMouseEnter` / table `onMouseLeave`.  
**Glide:** `onItemHovered` → resolve row index → URL or `null` when leaving.

### View button (fallback)

- **Original:** keep Actions **View** (label may read “View image” for clarity) → opens existing screenshot dialog.
- **Glide:** keep row-action **View** → same dialog.
- Hover preview and dialog are independent; View does not require a prior hover.

### Empty & error states

- Default / cleared: “Hover a row to preview”.
- Image load failure: “Couldn’t load image” in the pane (dialog can still be tried via View if URL exists).

### Permissions

- Without `canViewPaymentScreenshots`: no preview pane, no View actions (unchanged auth helpers).

## Architecture notes

- Prefer a small presentational `ScreenshotPreviewPane` (url + empty/error) owned/rendered by the shell (or passed into Glide as `sidePanel`).
- Do not mount a second screenshot pane: original uses the shell split; Glide uses one `sidePanel` slot for this pane only (recent-transactions may still use `sidePanel` for other content on its own page).
- Avoid duplicating dialog state: one shell dialog for View from either body.
- `getPaymentScreenshotUrl` lives in payment-group / grid helpers — reuse it; do not fork URL resolution.

## Testing

- Unit (optional helper): map row → hover URL (`null` vs string), including group/part rows via `getPaymentScreenshotUrl`.
- Manual: both views — hover updates image; leave clears; no-screenshot row shows empty; View opens dialog; permission-denied user sees neither pane nor View.

## Success criteria

1. Desktop users can scan screenshots by moving across rows without opening a dialog each time.
2. Leaving the table or hovering a no-image row clears the preview.
3. View / View image still opens a large dialog in both views.
4. Original and Glide share the same preview UX via the shell.

## Implementation notes

- Primary touch: `student-payments-report-shell.tsx`, `student-payments-resource-table.tsx`, `student-payments-grid.tsx`; new small preview component under `src/components/finances/`.
- Reuse `getPaymentScreenshotUrl` (already in grid / payment-group utils).
- Debouncing hover is optional; prefer immediate updates unless Glide fires excessively.
