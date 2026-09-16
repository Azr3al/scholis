# Import Wizard — Entity-Linking UX Improvements (Propagation & Resolve-by-Value) — Design

**Date:** 2026-06-09
**Status:** Approved design (pending spec review)
**Repos:** `schedjuice-reimagined-fe` (frontend)
**Builds on:** `2026-06-09-import-wizard-data-grid-design.md`

## Summary

Improve the Import Wizard review step so that resolving a repeated value once
applies everywhere. Today, manually picking a course for a cell
(`applyCoursePick`) updates **only that one cell**, even though many rows share the
same raw token (e.g. four rows all containing `TX`). This iteration makes a manual
pick **propagate** to every other exact-match occurrence in the column, adds a
**resolve-by-unique-value panel**, and layers on trust/clarity affordances.

All changes are **client-side only** — no new backend endpoints. The existing
bulk resolve (`resolveCoursesBulk`) and course search APIs are unchanged.

## Scope

In scope (selected during brainstorming):

1. **Propagate a manual pick** across exact-match tokens (the anchor feature).
2. **Needs-attention panel** — resolve each unique unresolved token once.
3. **Progress indicator** + Import gating on remaining unresolved values.
4. **Re-link an already-linked cell** (correct a wrong auto-match / change a pick).
5. **(#6)** Show match confidence / top candidate on `needs_attention`.
6. **(#7)** Conflict surfacing — same raw token linked to different courses.
7. **(#8)** Affected-row count before/while picking.

Out of scope (deferred): full undo/redo history (#5), inline "create new course"
from the picker (#9), keyboard jump-to-next-unresolved (#11), extending linking to
Staff/Room entities (#10), and the actual commit/import (still stubbed upstream).

## Decisions (from brainstorming)

| Topic | Decision |
| --- | --- |
| Propagation target | Overwrite auto-matches and unresolved cells; **respect prior manual picks** |
| Matching | **Exact raw string match** — no case/whitespace normalization, no guessing |
| Feedback | Toast `Linked "TX" across N rows` with one-click **Undo** (single level) |
| "No course" picks | Do **not** propagate — affect the single clicked cell only |
| Re-link | Clicking a linked chip reopens the picker; re-pick re-propagates |
| Conflict | Informational only (warning badge + panel entry), does **not** block import |

## Architecture

The existing per-cell resolution structure is retained (it supports conflict
detection and is the smallest change). We add **origin tracking** to each course
token and a single **fan-out engine** that every feature calls.

### Data model change (`src/lib/imports/resolution.ts`)

```ts
export type TokenOrigin = "auto" | "propagated" | "manual";

export type CourseToken = {
  raw: string;
  status: "resolving" | "linked" | "needs_attention" | "none";
  match: { id: number; title: string } | null;
  candidates: CourseCandidate[];
  origin?: TokenOrigin; // "auto" from bulk match; undefined = unresolved
};
```

- `buildCourseResolutions` tags backend auto-links with `origin: "auto"`.
- A manual pick tags the clicked token `origin: "manual"`.
- Propagation tags affected tokens `origin: "propagated"`.

### The fan-out engine

```ts
propagateCoursePick(
  resolution: Map<string, CellResolution>,
  rows: (string | number | null)[][],
  coursesColIndex: number,
  rowIds: string[],
  sourceRowId: string,
  tokenRaw: string,
  choice: { id: number; title: string } | null,
): {
  next: Map<string, CellResolution>;
  affected: string[];          // rowIds changed (incl. source)
  snapshot: Map<string, CellResolution>; // prior values, for Undo
}
```

Rules:

- **Source cell:** token(`tokenRaw`) → linked/none, `origin: "manual"`.
- **Non-null choice:** every other cell whose token `raw === tokenRaw` (exact)
  becomes linked + `origin: "propagated"`, **unless** that token's
  `origin === "manual"` (prior manual picks are respected).
- **Null choice ("no course"):** only the source cell changes.
- Returns `affected` rowIds and a `snapshot` of prior cell values for Undo.

This one engine powers propagation (#1), the panel's resolve action (#2),
affected-count preview (#8), and feeds conflict detection (#7).

## Components & data flow

### Propagation + toast/undo (#1) — `review-step.tsx`

`ReviewStep.onPick` swaps `applyCoursePick` for `propagateCoursePick`. After
`mergeResolutions(next)`:

- If `affected.length > 1`, show toast `Linked "TX" across N rows · [Undo]`.
- **Undo** restores the `snapshot` (source + propagated cells). Single level,
  tied to the toast; a subsequent pick supersedes the prior undo.
- "No course" → single cell, no toast.
- Uses the FE's existing toast utility (match current `sonner`/toast usage).

### Needs-attention panel + progress (#2, #3)

A panel beside the grid, derived (memoized) from `resolution`:

- **Unique unresolved tokens** grouped by exact raw string with counts
  (`TX × 4`), sorted by count desc.
- Each entry → **Resolve** button opens `CoursePickerPopover` anchored to the
  panel row; picking runs `propagateCoursePick` (resolving once clears all).
- **Progress header:** `12 of 15 course values resolved` + thin bar. Counts
  **unique tokens** (linked or "no course"), matching the panel.
- Empty state: "All course values resolved."
- **Import gating:** Import disabled while unresolved unique tokens remain, with
  message `Resolve N remaining course values`. (Commit/import itself remains
  stubbed upstream; gating logic is wired and ready.)

### Re-link an already-linked cell (#4)

`handleCellActivated` currently opens the picker only for
`needs_attention`/`none` tokens. Change so clicking a **linked** chip reopens the
picker pre-targeted on that token. Re-pick runs `propagateCoursePick` again.

**Known limitation (v1):** Glide reports the clicked cell, not the chip
sub-region, so multi-token cells re-link the **first** actionable token;
remaining tokens are reachable front-to-back. Noted for a future enhancement
(chip-level hit testing).

### Trust features

- **#6 Confidence:** in `course-link-cell.tsx`, when a `needs_attention` token has
  a top candidate, render a faint best-guess hint (`TX → TX Course? choose`).
  Picker already lists candidate scores (`candidates[].score`) — no backend
  change.
- **#8 Affected count:** `CoursePickerPopover` header shows
  `Spreadsheet value: "TX" · will link N rows`, where N = matching non-manual
  tokens. Same count drives the toast.
- **#7 Conflict surfacing:** after each change, group `linked` tokens by exact raw
  string; if one raw maps to ≥2 distinct course ids, flag with an amber `⚠` badge
  on those chips and a panel entry `"TX" linked to 2 different courses`.
  Informational; does not block import.

## Error handling

- Propagation is pure client state — no new network calls, no new failure modes.
- Undo snapshot lives in component state tied to the toast (single-level).
- Panel, progress, and conflicts derive purely from `resolution` (memoized), so
  they stay consistent with the grid automatically.

## Testing

Vitest, matching the existing `resolution.ts` test style:

- `propagateCoursePick`: fans out to exact-match unresolved + `auto` cells; skips
  `manual`; "no course" stays single-cell; correct `affected` + restorable
  `snapshot`.
- Origin transitions: `auto → propagated` on fan-out; clicked cell → `manual`;
  re-pick respects other `manual` cells.
- Derived selectors: unique-unresolved grouping/counts; progress (resolved vs
  total unique); conflict detection (same raw → different ids).
- Component: panel "Resolve" runs the engine; re-link opens picker on a linked
  chip; Import gating reflects remaining count.

## Touchpoints (files)

- `src/lib/imports/resolution.ts` — `TokenOrigin`, `propagateCoursePick`, derived
  selectors (unique unresolved, progress, conflicts).
- `src/components/import-wizard/review-step.tsx` — wire engine, toast/undo,
  re-link activation, Import gating, panel host.
- `src/components/import-grid/` — new needs-attention panel; `course-link-cell.tsx`
  best-guess hint + conflict badge; `course-picker-popover.tsx` affected-count
  header.
- Tests alongside the above.
