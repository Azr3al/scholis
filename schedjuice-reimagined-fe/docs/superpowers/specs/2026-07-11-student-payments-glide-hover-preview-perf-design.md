# Student payments Glide: hover preview render isolation

**Date:** 2026-07-11  
**Status:** Approved  
**Surfaces:** `/finances/student-payments`, `/courses/[id]/student-payments` (Glide view primary; ResourceTable keeps preview via same store)

## Problem

After the hover screenshot preview shipped, the student-payments **Glide** DataSheet became laggy and sometimes unscrollable (reproduced at ~30 rows). Hover and scroll both feel bad. Collapsing the pane is often impossible because the UI is already stuck.

**Root cause:** Every `onItemHovered` updates `previewUrl` in `StudentPaymentsReportShell`. That re-renders the shell, rebuilds `sidePanel` (`ScreenshotPreviewColumn`), and passes it into `StudentPaymentsGrid`, which re-renders the entire Glide `DataSheet` / `DataEditor` on each cell hover.

Secondary bug: `handleRowHover(null)` currently returns early without clearing `previewUrl`, so leave-grid does not clear the preview.

## Goals

- Keep **hover-to-preview** UX (immediate; not click-to-select).
- Hover URL changes must **not** re-render `StudentPaymentsGrid` / Glide `DataEditor`.
- Restore usable scrolling with the screenshot pane open.
- Clear preview on leave / non-cell hover / no-screenshot row.
- Skip store updates when the resolved URL is unchanged.

## Non-goals

- Motion / image-decode hygiene (Approach 2) — only if isolation alone is insufficient.
- Broad Glide cell/renderer / DataSheet audit (Approach 3).
- Changes to other DataSheets (leads, student data, import).
- Changing View dialog, upload, OCR, verification, or student drawer flows.
- Replacing hover with click-to-preview.

## Approach

**Approach 1 — Isolate preview updates from the Glide React tree.**

Preview URL lives in a tiny store (module + `useSyncExternalStore`, or equivalent). Only `ScreenshotPreviewColumn` (or a thin wrapper) subscribes. The grid calls a stable setter; it never receives props derived from the current preview URL.

## Architecture

```
StudentPaymentsReportShell
  ├── screenshotPreviewStore (url + setUrl)
  ├── layout: [ GridColumn | PreviewColumn ]
  │     ├── StudentPaymentsGrid          ← memoized; not under previewUrl React state
  │     │     └── onItemHovered → setUrl(url|null) if changed
  │     └── ScreenshotPreviewColumn      ← only subscriber to store.url
  └── View dialog / drawer (unchanged)
```

### Layout ownership

For the **report Glide path**, prefer **shell-owned** two-column layout:

- Do **not** pass a URL-dependent `sidePanel` into `StudentPaymentsGrid`.
- Grid fills the left column; preview mounts as a sibling in the right column.
- Collapse/expand may reflow grid width once — acceptable. URL changes must not remount or re-prop the grid.

`StudentPaymentsGrid` may keep a generic `sidePanel` slot for other callers (e.g. recent-transactions); student-payments report Glide must not use it for the hover preview.

### Original ResourceTable

Keep hover preview via the same store setter helper so both views share clearance / equality behavior. ResourceTable is not the regression surface; no Glide isolation work required there beyond sharing the store.

## Hover API & clearance

### Notify shape

- Prefer `setPreviewUrl(url: string | null)` after resolving with `getPaymentScreenshotUrl(row)`.
- Grid may still expose `onRowHover(row | null)` internally; the shell/store adapter resolves to URL.

### Update rules

| Event | Store value |
| --- | --- |
| Hover cell with screenshot | that URL |
| Hover cell without screenshot | `null` |
| Hover non-cell (header / out) | `null` |
| `mouseLeave` grid pane | `null` |
| Same URL as current | no-op (no subscriber notify) |

### Stability

- `onItemHovered` is a stable `useCallback` (or equivalent).
- Row lookup may use a ref to the latest `rows` array so the callback identity does not churn.
- Optional: coalesce multiple hover events into one `requestAnimationFrame` tick (not a multi-frame debounce that feels laggy).

## Error / empty states

Unchanged from the hover-preview design:

- `null` → “Hover a row to preview” (or existing empty copy).
- Image load failure → existing pane error copy.
- Permissions: without `canViewPaymentScreenshots`, no pane and no hover writes.

## Testing

### Automated

- Unit: store setter — same URL → no notify; different URL → one notify; `null` clears.
- Optional unit: row → URL helper wrapping `getPaymentScreenshotUrl`.

### Manual (finance + course student-payments, Glide)

1. Scroll with pane open — continuous, not sticky.
2. Move across rows — pane updates; scroll remains usable.
3. Leave grid — preview clears.
4. Hover no-screenshot row — empty state.
5. Collapse/expand pane — works; View dialog still works.
6. Original ResourceTable — hover preview still works via same store.

### Success criteria

1. Hover-to-preview UX preserved.
2. Hovering does not re-render Glide `DataEditor` (React DevTools: grid stays quiet while pane updates).
3. Scroll usable again on the previously stuck ~30-row course payments case.
4. Leave-grid clears preview.

## Implementation notes

- Primary touch: `student-payments-report-shell.tsx`, `student-payments-grid.tsx`, new small store (e.g. under `src/lib/finances/` or `src/hooks/finances/`).
- Reuse `getPaymentScreenshotUrl`; do not fork URL resolution.
- Fix the early-return on `row === null` that skips clearing.
- `React.memo` on the grid (or structural split) so shell collapse toggles / unrelated shell state do not thrash Glide either, where practical without large refactors.

## Out of scope follow-ups

If scroll is still janky after isolation: Approach 2 (Motion only on collapse; softer image swaps). If still bad with preview disabled in isolation tests: Approach 3 (broader Glide audit).
