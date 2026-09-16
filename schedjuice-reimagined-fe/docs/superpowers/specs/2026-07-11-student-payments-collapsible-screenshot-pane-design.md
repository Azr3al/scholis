# Student payments: collapsible screenshot preview pane + wider columns

**Date:** 2026-07-11  
**Status:** Approved  
**Surfaces:** `/finances/student-payments`, `/courses/[id]/student-payments` (original ResourceTable + Glide)  
**Authority:** [`DESIGN.md`](../../../DESIGN.md) §12 (motion & sound); builds on [hover screenshot preview](./2026-07-11-student-payments-hover-screenshot-preview-design.md) and [column width floors](./2026-07-11-course-student-payments-month-and-column-widths-design.md)

## Problem

1. **Horizontal space is premium.** The persistent ~20rem screenshot preview pane crowds Transaction ID, Description, and other editable columns even when the operator is not scanning images.
2. **No way to reclaim that space.** The pane is always on when `canViewPaymentScreenshots` is true; there is no collapse control.
3. **Columns still feel tight** at the current floors (Glide 240/280; ResourceTable `min-w` 12rem/14rem), especially with the pane open.

## Goals

- Make the screenshot preview pane **collapsible** (header Hide + edge chevron; collapsed rail + Show control).
- **Default expanded** on first visit; **remember** collapsed/expanded in `localStorage`.
- Keep the open pane at **~20rem**; **bump column floors** so the table is less cramped.
- Animate collapse/expand with DESIGN.md §12 **rail / panel morph** tokens from `@/lib/sj/motion` (plus brown-switch click on toggle).

## Non-goals

- No mobile-first redesign.
- No changes to upload, OCR, verification, coverage, or student drawer flows.
- No drag-to-resize pane.
- No generic `SheetFullscreenShell` collapse API for other consumers.
- Do not narrow the open pane below ~20rem.
- Do not change hover URL resolution or View-image dialog behavior beyond “preview chrome hidden while collapsed.”

## Approach

**Shell-owned collapse** in `StudentPaymentsReportShell` (same place as `previewUrl`). Layout switches between full ~20rem pane and a thin reopen rail; Glide receives the expanded pane or collapsed rail via the existing `sidePanel` slot. Column width constants stay in `student-payments-filter-ui.ts`.

## Design

### Layout — expanded (default / remembered open)

```
┌─ table (flex) ─────────────────────────┐┌─ preview ~20rem ─┐
│ … columns …                            ││ Screenshot  [Hide]│
│                                        ││ [◀]              │
│                                        ││ image / empty    │
└────────────────────────────────────────┘└──────────────────┘
```

- Grid: `lg:grid-cols-[minmax(0,1fr)_20rem]` (unchanged open width).
- Pane header: title + **Hide**.
- Edge control: **◀** (chevron) on the pane’s left edge — same action as Hide.
- Hover preview and empty/error copy behave as today.

### Layout — collapsed

```
┌─ table (full width) ──────────────────────────────┐┌▶┐
│ … more room for Transaction ID / Description …    ││ │
└───────────────────────────────────────────────────┘└─┘
```

- Thin right rail (~2rem) with **▶** to expand.
- Matching **Show screenshot** control in the table header/toolbar chrome.
- Hover may still update `previewUrl`, but the image is not shown until expanded (expanding reveals current hover URL or empty copy).
- **View image** dialog remains available while collapsed.
- Without `canViewPaymentScreenshots`: no pane, no rail, no Show control (unchanged).

### State & persistence

| Item | Value |
| --- | --- |
| Owner | `StudentPaymentsReportShell` |
| Storage key | `student-payments:screenshot-preview-collapsed` (`"1"` / `"0"`) |
| First visit / missing / invalid | **Expanded** |
| Scope | Shared across finance and course student-payments pages |
| Pattern | Same localStorage preference style as `use-grid-view-preference` |

Toggle updates React state and writes `localStorage` immediately.

### Wider columns

Open pane stays ~20rem. Bump floors in both views via existing constants/helpers in `student-payments-filter-ui.ts`:

| | Today | Target |
| --- | --- | --- |
| Glide Transaction ID | 240 | **280** |
| Glide Description | 280 | **320** |
| ResourceTable txn input `min-w` | 12rem | **14rem** |
| ResourceTable description `min-w` | 14rem | **16rem** |

Prefer horizontal scroll over clipping mid-value (same principle as the prior column-width spec).

### Motion (DESIGN.md §12)

Import tokens/recipes from `@/lib/sj/motion` only — **never** hand-type durations or easings.

| Action | Recipe |
| --- | --- |
| Collapse (20rem → ~2rem rail) | Animate `width` with `transition.railMorph` (`DURATION.slow` + `EASE.outSoft`) |
| Expand (rail → 20rem) | Animate `width` with `transition.panelWipe` (`DURATION.slow` + `EASE.paper`) |
| Labels / image / empty copy during morph | Fade with `transition.fadeFast` / `DURATION.fast` |
| Inner pane content | Hold a **fixed inner width (~20rem)** during morph so content does not reflow mid-wipe |
| Collapsed rail / Show control enter-exit | `AnimatePresence` + quiet opacity (≤8px slide only when motion is allowed) |
| First mount of preview chrome | Locked subtle entrance (`crossfade` or opacity enter) — never instant |

**Reduced motion:** `useReducedMotion()` → skip width morph and slides; snap width; opacity-only (`crossfadeInstant` pattern). CSS tokens under `.sj-root` already collapse durations when preferred.

**Sound:** On collapse/expand toggle, play the existing brown-switch click (`src/lib/sound/click-sound.ts`), gated by Interface sounds preference — same pattern as sidebar rail collapse/expand. No new assets.

```
Expanded ──railMorph──▶ Collapsed rail
  [==== pane 20rem ====][◀]  →  [▶]
Collapsed ──panelWipe──▶ Expanded
  [▶]  →  [==== pane 20rem ====][Hide][◀]
```

## Architecture

```
StudentPaymentsReportShell
  ├── previewCollapsed (localStorage) + toggle handlers (+ click sound)
  ├── previewUrl (existing hover)
  ├── Expanded: ScreenshotPreviewPane + Hide + edge ◀ (width morph)
  ├── Collapsed: thin ▶ rail + “Show screenshot” in chrome
  ├── Original: shell grid morphs 20rem ↔ rail
  └── Glide: pass expanded pane or collapsed rail as sidePanel
```

**Touch points**

- `student-payments-report-shell.tsx` — collapse state, layout, toolbar Show control
- `screenshot-preview-pane.tsx` — header Hide / edge chevron props (or thin shell wrapper)
- `student-payments-filter-ui.ts` (+ unit tests) — width constants / `min-w` helpers
- Glide path via existing `sidePanel` — do not change default behavior for other `SheetFullscreenShell` consumers

**Optional small helper:** read/write collapsed preference (mirrors grid-view preference helpers) for unit tests without mounting the shell.

## Error handling & edge cases

| Case | Behavior |
| --- | --- |
| `localStorage` unavailable / throws | Stay in-memory; default expanded; do not crash |
| Permission denied | No pane / rail / Show |
| Collapsed + hover | Update `previewUrl` only; no visible preview until expand |
| Image load failure | Existing pane error copy when expanded |
| Reduced motion | Snap + opacity-only |

## Testing

- Unit: storage helper default-expanded + read/write; width constant / `min-w` assertions updated.
- Manual: Hide and edge ◀ collapse with railMorph; ▶ and Show expand with panelWipe; refresh keeps preference; original + Glide; no-permission user; View dialog while collapsed; reduced-motion if easy to toggle; Interface sounds on/off for click.

## Success criteria

1. Expanded by default; preference remembered across visits and both student-payments surfaces.
2. Collapse frees ~20rem for the table via header Hide or edge chevron; reopen via rail or Show.
3. Column floors match the target table above.
4. Collapse/expand uses §12 rail/panel morph (+ fadeFast labels, fixed inner width); reduced-motion path is opacity/snap only.
5. Toggle plays brown-switch click when Interface sounds are on.
6. Hover preview only visible when expanded; View image works either way.

## Implementation notes

- Prefer extending `ScreenshotPreviewPane` with optional collapse controls rather than forking a second pane.
- Keep Glide and original in sync by owning collapse only in the shell.
- Do not invent new motion tokens; import from `@/lib/sj/motion`.
