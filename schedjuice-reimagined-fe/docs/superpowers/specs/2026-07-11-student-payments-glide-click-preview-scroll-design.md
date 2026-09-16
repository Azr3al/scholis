# Student payments Glide: click-to-preview and scroll fix

**Date:** 2026-07-11  
**Status:** Approved  
**Surfaces:** `/finances/student-payments`, `/courses/[id]/student-payments` (Glide view)  
**Related:** `2026-07-11-student-payments-glide-hover-preview-perf-design.md` (hover isolation — insufficient alone)

## Problem

The Glide student-payments DataSheet remains laggy on hover and **scroll is dead** (wheel/trackpad does not move rows), including cases with fewer than ~20 rows. Hover isolation via an external screenshot preview store already shipped; symptoms persist. Continuous `onItemHovered` → preview is still the wrong interaction for this surface.

## Goals

- Restore usable Glide scrolling when row content exceeds the editor pane.
- Stop hover-driven preview work from freezing or blocking the grid.
- Keep screenshot preview via **click/select a row** (sticky until another selection or teardown).
- Clear preview on no-screenshot selection, shell unmount, and existing empty states — **not** on mouse leave (leave-clear was for hover UX).
- Leave Original ResourceTable hover preview unchanged (including leave-to-clear).

## Non-goals

- Keeping continuous hover-to-preview on Glide.
- Broad DataSheet / custom-renderer / other-grids performance audit.
- Changes to upload, OCR, verification, or student drawer flows.
- Redesigning screenshot pane chrome.
- Motion / image-decode hygiene unless click + height fixes are still insufficient.

## Approach

**Click/select-to-preview + measured container height.**

1. Glide no longer updates the preview store from `onItemHovered`.
2. Cell/row click (including status/method/actions cell clicks that open overlays) sets preview from that row via existing `applyScreenshotPreviewHover` / `getPaymentScreenshotUrl`.
3. Size the DataEditor from the **measured grid container**, not `window.innerHeight - fixedOffset`.
4. Prefer shell-owned preview column for the Glide report path so the grid does not receive a thrashy `sidePanel` prop tree.

## Architecture

```
StudentPaymentsReportShell
  ├── screenshot-preview-store (existing)
  ├── Glide report layout: [ GridColumn | PreviewColumn ]
  │     ├── StudentPaymentsGrid
  │     │     ├── onCellClicked → applyScreenshotPreviewHover(row)
  │     │     ├── onItemHovered → not used for preview
  │     │     └── onMouseLeave → do not clear preview (sticky click selection)
  │     └── ScreenshotPreviewColumnConnected  ← only URL subscriber
  └── ResourceTable path: hover preview + leave-to-clear unchanged
```

### Layout ownership

For the Glide report path:

- Prefer shell-owned two-column layout (grid left, connected preview right).
- Avoid passing a freshly recreated, layout-sensitive `sidePanel` into `StudentPaymentsGrid` for hover/URL concerns.
- Collapse/expand may reflow grid width once — acceptable.

`StudentPaymentsGrid` may keep a generic `sidePanel` slot for other callers (e.g. recent-transactions); student-payments report Glide should not rely on it for the screenshot preview.

## Preview API (Glide)

| Event | Store value |
| --- | --- |
| Click cell with screenshot | that URL |
| Click cell without screenshot | `null` |
| Mouse leave grid pane | **no change** (sticky) |
| Shell unmount / leave Glide report | `null` |
| Same URL as current | no-op (existing store equality) |
| Header / non-cell click | no preview change |

Reuse `applyScreenshotPreviewHover` and `getPaymentScreenshotUrl`. Do not fork URL resolution. Respect `canViewPaymentScreenshots` (no pane, no writes).

Glide report path should **not** call preview-clear from `onMouseLeave`. ResourceTable may keep leave-to-clear.

### Overlay clicks

Clicks that open status / method / actions overlays still set preview from that row (same as selecting it).

## Scroll / height

- Drive DataEditor height from `useContainerHeight` on the flex grid container (including fullscreen).
- Remove (or stop relying on) `window.innerHeight - 340/380` as the primary non-fullscreen height source.
- Shell keeps `overflow-hidden`; scrolling is Glide-internal when content exceeds editor height.
- Existing blank-canvas repaint nudge may remain if still needed; it must not fight measured height.

## Error / empty states

- `null` → update empty copy from “Hover a row to preview” to “Click a row to preview” (shared pane string; acceptable for ResourceTable too, or gate by view if trivial).
- Image load failure → existing error copy.
- Permissions: without screenshot permission, no pane and no preview writes.

## Testing

### Automated

- Existing store / `applyScreenshotPreviewHover` unit tests remain the contract.
- Add or adjust a small unit/UI helper test only if click wiring introduces new pure helpers; no need to retest the store for this UX change alone.

### Manual (finance + course student-payments, Glide)

1. With pane open, scroll — rows move when content overflows the editor.
2. Click rows — preview updates; scroll stays usable.
3. Move mouse out of grid — preview **stays** on last clicked row.
4. Hover across rows without clicking — preview does **not** change.
5. Collapse/expand pane and View dialog still work.
6. Original ResourceTable — hover preview (and leave-to-clear) still works.

### Success criteria

1. Scroll is no longer dead on the reported Glide case.
2. Hovering does not drive preview or freeze the grid.
3. Click-to-preview works and stays sticky on mouse leave.
4. ResourceTable hover behavior unchanged.

## Implementation notes

- Primary touch: `student-payments-grid.tsx`, `student-payments-report-shell.tsx`.
- Optional copy: `screenshot-preview-column` / pane empty state string.
- No new store module.
- Out of scope follow-up: broader Glide cell/renderer audit if jank remains after click + height.

## Confirmed decisions

| Topic | Decision |
| --- | --- |
| Preview interaction (Glide) | Click/select row — not hover |
| Sticky preview on mouse leave (Glide) | Yes — clear on unmount / no-screenshot click only |
| ResourceTable | Keep hover preview + leave-to-clear |
| Height | Measured container, not window offset heuristic |
| Layout | Shell-owned preview column preferred for Glide report |
| Prior hover-isolation store | Keep; still used by click path |
| Empty copy | “Click a row to preview” |
