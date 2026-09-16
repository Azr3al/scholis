# DataSheet — Standardized Excel-like Grid Component — Design

**Date:** 2026-06-17
**Status:** Approved design (pending spec review)
**Repo:** `schedjuice-reimagined-fe` (frontend)

## Summary

Consolidate the two independent Glide Data Grid implementations
(`import-grid/import-data-grid.tsx` and `finances/employee-rates-grid.tsx`) into a
single reusable **`<DataSheet>`** component that standardizes Excel-like behavior:

- A Google Sheets-style **menu-bar** (text menus + icon toolbar) whose items change
  based on the grid's role (import wizard, rates editor, …), defined declaratively
  by each consumer.
- Unified **undo/redo** history.
- Seamless **copy / cut / smart paste** that interoperates with Excel, Google Sheets,
  and Numbers (TSV-based).
- Standard keyboard **shortcuts** scoped to grid focus.
- QoL features: **status bar** (selection stats), **right-click context menu**,
  **column show/hide + fit-to-content**, **go-to-row + density toggle**.

`<DataSheet>` is a thin "controller" wrapper: it owns all cross-cutting chrome and
behavior but delegates cell rendering to the consumer through Glide's existing API,
and reaches consumer data through a small **adapter interface**. The menu-bar is
intrinsic to `<DataSheet>` and renders in both normal and fullscreen modes.

## Decisions (from brainstorming)

| Topic | Decision |
|---|---|
| Target architecture | One reusable `<DataSheet>`; migrate BOTH import grid and rates grid |
| Abstraction shape | Approach 1 — thin controller wrapper + small adapter interface (consumer keeps `columns`/`getCellContent`/custom renderers) |
| Menu-bar form factor | Text menus (top) + icon toolbar (bottom), closest to Google Sheets |
| Menu config | Declarative config passed as a prop; `<DataSheet>` renders standard items and merges consumer role-specific ones |
| Undo/redo | Unified history in `<DataSheet>`; reverts via the adapter's single mutation path (import = local store revert; rates = revert + re-save to server) |
| Copy/paste | Smart paste: fill from active cell, skip read-only/linked columns, auto-append rows on overflow when the adapter supports row-growth |
| Menu-bar vs fullscreen | Menu-bar is intrinsic to `<DataSheet>`; in fullscreen it becomes the top strip of the sheet shell (replaces ad-hoc controls row) |
| In-scope QoL | Status bar, right-click context menu, column show/hide + fit-to-content, go-to-row + density toggle |
| Deferred QoL | Per-column filters, multi-column sort, find-&-replace, CSV/Excel export, bulk-fill dialog |
| Icons | Stay with existing `lucide-react` (repo standard); do not introduce Phosphor |

## Tech stack

Next.js 15, React 19 client components, Glide Data Grid v6
(`@glideapps/glide-data-grid`), Tailwind CSS v4, Radix `DropdownMenu` (via shadcn),
`zustand` (import store), TanStack Query (rates autosave), `nuqs` (fullscreen state),
Vitest.

## Frontend architecture

### Module layout (new `src/components/data-sheet/`)

```
data-sheet/
  data-sheet.tsx            # <DataSheet> — owns chrome + wires Glide DataEditor
  types.ts                  # SheetAdapter, menu config types, capability flags
  menu-bar/
    sheet-menu-bar.tsx      # text menus (top) + icon toolbar (bottom)
    sheet-menu.tsx          # one dropdown menu (Radix DropdownMenu)
    sheet-toolbar.tsx       # icon/action strip
    build-standard-menus.ts # pure: builds Edit/View/Data menus from capabilities
  status-bar/
    sheet-status-bar.tsx    # count / sum / avg / min / max of selection
    selection-stats.ts      # pure stats math (unit-tested)
  context-menu/
    sheet-context-menu.tsx  # right-click menu (Radix, pointer-anchored)
  hooks/
    use-grid-history.ts     # unified undo/redo stack (pure core + hook)
    use-grid-clipboard.ts   # copy (TSV+HTML) + smart paste
    use-column-visibility.ts# show/hide + fit-to-content + density
    use-goto-row.ts
  lib/
    history-core.ts         # pure apply/invert of changes (unit-tested)
    clipboard-tsv.ts        # parse/serialize TSV (unit-tested)
    smart-paste.ts          # pure paste-planning (unit-tested)
    use-glide-theme.ts      # MOVED from import-grid (shared)
    glide-theme.ts          # MOVED from import-grid (shared)
```

The theme/shimmer helpers currently under `import-grid/` are promoted to
`data-sheet/lib` because they are genuinely shared (the rates grid already imports the
theme from `import-grid`). Existing imports are updated to the new path.

### The adapter interface (the seam)

Cross-cutting features (undo, paste, fill, stats, structural ops) operate on consumer
data only through this contract. They never know about resolution chips, money
formatting, or display↔source mapping.

```ts
export interface SheetAdapter {
  rowCount: number;

  // value access in *source* coordinates (consumer maps display↔source)
  getCellValue(row: number, field: string): string;
  setCellValue(row: number, field: string, value: string): void; // single mutation path
  isCellEditable(row: number, field: string): boolean;

  // optional capabilities — presence enables features
  appendRows?(count: number): number[];   // returns new row indices; enables row-growth paste & insert
  removeRows?(rows: number[]): void;       // enables delete/remove + insert undo
  getNumericValue?(row: number, field: string): number | null; // enables sum/avg/min/max
}
```

- `setCellValue` is the **single mutation path**. Undo/redo, paste, fill, and clear all
  funnel through it, so history is captured in exactly one place: `<DataSheet>` wraps it
  in a recorder that reads `before` via `getCellValue` immediately prior to each write.
- Capabilities are **opt-in by presence**. Import provides `appendRows`/`removeRows`
  (row-growth + remove); rates omits them (paste clips, no insert/delete). Status-bar
  Sum/Avg appears only when `getNumericValue` is provided.
- The consumer keeps owning `columns`, `getCellContent`, `customRenderers` — Glide's
  existing API is untouched.

### `<DataSheet>` props (sketch)

```ts
<DataSheet
  adapter={adapter}
  columns={columns}
  getCellContent={getCellContent}
  customRenderers={[...]}
  menus={menuConfig}            // declarative role-specific menus
  capabilities={{ undo: true, copyPaste: true, statusBar: true, density: true,
                  columnVisibility: true, contextMenu: true, gotoRow: true }}
  fullscreenTitle="Import"
  height={...}
  className={...}
  // passthroughs the consumer still controls:
  gridSelection, onGridSelectionChange, getRowThemeOverride, onHeaderClicked,
  onColumnMoved, onColumnResize, onCellActivated, freezeColumns, rowMarkers, ...
/>
```

## Menu-bar

### Layout (non-fullscreen)

```
┌─ row 1: text menu bar ───────────────────────────────────────────────┐
│ Import  │  Edit   View   Data        [⟳ saved 2s ago]   [⤢ Fullscreen]│
├─ row 2: icon toolbar ────────────────────────────────────────────────┤
│ ↶  ↷ │ ⧉ ⎘ │ ⌕ │ Columns ▾ │ ⤢ Fit │ ☰ Density ▾ │   🗑 Remove (2)  │
└──────────────────────────────────────────────────────────────────────┘
```

- **Row 1 — text menus.** Left slot = role label + role-specific menus. Right slot =
  status (e.g. autosave) + fullscreen toggle. `<DataSheet>` always injects standard
  menus from capabilities: **Edit** (Undo, Redo, Cut, Copy, Paste, Clear) and **View**
  (Columns…, Density, Go to row…). A **Data** menu is rendered only when the consumer
  supplies Data items via `extendStandardMenu.data` (e.g. import's sort), so it does not
  appear empty for grids like rates.
- **Row 2 — icon toolbar.** Quick-access subset: undo/redo, copy/paste, find, Columns,
  Fit, Density, then a right-aligned slot for the consumer's primary actions.
- In **fullscreen**, the same menu-bar becomes the top strip of the sheet shell,
  replacing the current ad-hoc controls row.

### Declarative config

```ts
export interface SheetMenuConfig {
  roleLabel: string;                 // "Import", "Staff rates"
  menus?: SheetMenu[];               // extra top-level menus (e.g. "Import")
  extendStandardMenu?: Partial<Record<"edit" | "view" | "data", SheetMenuItem[]>>;
  toolbarRight?: ReactNode;          // consumer primary actions (Remove, etc.)
  statusSlot?: ReactNode;            // e.g. autosave status for rates
}

export interface SheetMenuItem {
  id: string;
  label: string;
  icon?: ReactNode;                  // lucide-react icon (no emojis)
  shortcut?: string;                 // "⌘Z" display hint
  disabled?: boolean;
  onSelect: () => void;
}
export interface SheetMenu { id: string; label: string; items: SheetMenuItem[]; }
```

### Per-role result

- **Import wizard** — menus `Import | Edit | View | Data`; the **Import** menu holds
  {Course scope…, Send welcome emails toggle, Import now}; `toolbarRight` = "Remove (n)".
  Today's `ImportCourseScopeBar`, welcome-email toggle, and remove button move here.
  Side panels (validation / needs-attention) stay where they are.
- **Rates editor** — menus `Staff rates | Edit | View | Data`; the **Staff rates** menu
  holds {Include inactive toggle, Add rate column…}; `statusSlot` = autosave indicator;
  `toolbarRight` = none.

### Built with

Radix `DropdownMenu` (via shadcn) for text menus, shadcn `Button` for toolbar icons,
`lucide-react` icons (repo standard). No emojis anywhere in code/markup.

## Undo / redo

### Model

History is a stack of **transactions**; one user action = one transaction (a 5×3 paste
undoes in a single `⌘Z`).

```ts
type CellChange = { row: number; field: string; before: string; after: string };
type StructuralChange =
  | { kind: "append"; rows: number[] }      // invert → removeRows(rows)
  | { kind: "remove"; rows: RowSnapshot[] }; // invert → re-insert with values

interface Transaction { cells: CellChange[]; structural?: StructuralChange[]; label: string; }
```

### Capture

`<DataSheet>` wraps the adapter's `setCellValue` in a recorder. Any mutating feature
(manual edit, paste, fill, clear, context-menu action) opens a transaction, funnels
writes through the recorder (which captures `before` via `getCellValue`), then commits.

### Apply / invert (`history-core.ts`, pure, unit-tested)

- `undo`: pop undo stack → invert each change → write back via `setCellValue` /
  `removeRows` / `appendRows` → push to redo stack.
- `redo`: reverse.
- Any **new edit clears the redo stack**.

### Persistence models via adapter

- **Import** — `setCellValue` writes the Zustand store; undo is instant and local;
  structural changes reverted via `removeRows`/`appendRows`.
- **Rates** — `setCellValue` updates local row state **and** triggers the existing
  autosave mutation. Undo therefore re-saves the previous value to the server through
  the same single path. Failed undo-saves surface through the existing autosave
  error/retry UI.

### Bounds & safety

- Stack capped (~100 transactions) to bound memory.
- History is scoped to the grid instance and cleared when the dataset identity changes
  (import: new parsed file; rates: new column-set/filter query).
- For rates, the transaction records intended before/after even if an autosave is still
  in flight, keeping the stack consistent.

### Shortcuts

`⌘Z`/`Ctrl+Z` undo, `⌘⇧Z`/`Ctrl+Y` redo, wired via Glide's `onKeyDown` (grid-focus
scoped, not global).

## Copy / paste

### Format

**TSV** (tab-separated rows, newline-separated records) — read/written by Excel, Google
Sheets, Numbers. On copy we also set `text/html` (a `<table>`) for richer targets, but
TSV is the contract for paste parsing. `clipboard-tsv.ts` is a pure, unit-tested module
(handles quoted cells with tabs/newlines, CRLF normalization).

### Copy / cut (out)

- Copy current selection (range / full rows / full columns) as TSV + HTML in display
  order; read-only/linked cells export their text value (Glide `copyData`).
- Cut = copy then clear editable cells in the selection (one transaction; read-only
  cells untouched).
- Uses Glide `getCellsForSelection` + the browser Clipboard API.

### Smart paste (in)

`smart-paste.ts` plans the paste (pure, unit-tested); `<DataSheet>` applies it as one
transaction:

1. Parse clipboard TSV into a 2D block `[r][c]`.
2. Anchor at the active cell; walk the block over the target region in **display
   coordinates**, translating each target to source coords via the consumer mapping.
3. **Skip read-only/linked columns** (`!isCellEditable`) — leave unchanged, do not abort.
4. **Row overflow:** adapter has `appendRows` (import) → append exactly enough rows and
   fill them (part of the same undo transaction); adapter lacks it (rates) → clip.
5. **Single-cell source → multi-cell selection:** fill the whole selected range.
6. Entire paste is **one transaction** (single undo).

### Normalization

Pasted values pass through the consumer's existing normalization on commit (import:
`normalizeCell`; rates: trim + `""`→null), so pasted data is validated/coerced like
typed data and flows into the existing validation-error surfacing.

### Edge cases

Paste with nothing focused (no-op); paste into a fully read-only selection (no-op, no
rows added); oversized paste beyond a sane cap (cap + toast); mixed editable/read-only
columns (per-cell skip). Replaces today's `onPaste={() => false}` in both grids.

## QoL features

### Status bar (bottom strip)

```
3 rows × 2 cols selected   ·   Count 6   Sum 1,250   Avg 208.3   Min 0   Max 600
```

- `selection-stats.ts` (pure) computes Count (non-empty); when the adapter exposes
  `getNumericValue`, also Sum/Avg/Min/Max.
- Numeric stats render only when the selection has numeric-capable cells (rates yes;
  import shows Count + dimensions).
- Money formatting reuses the consumer formatter where given (rates: `formatMoney` +
  currency symbol).
- Shows selection dimensions and total row count when nothing is selected.

### Right-click context menu (Radix, pointer-anchored)

```
Cut            ⌘X
Copy           ⌘C
Paste          ⌘V
Clear contents  ⌫
─────────────
Insert row above        (only if adapter.appendRows)
Insert row below        (only if adapter.appendRows)
Duplicate row           (only if adapter.appendRows)
Delete row(s)           (only if adapter.removeRows)
```

- Items are **capability-gated**: rates shows only clipboard + clear; import shows all.
- Actions funnel through the recorder → single undo each. Insert uses `appendRows` then
  positions the new row (structural transaction).

### Column show/hide + fit-to-content ("Columns ▾")

```
Columns ▾
  ☑ Name
  ☑ Email
  ☐ Courses        ← unchecked = hidden
  ───────────
  Fit all to content
  Reset layout
```

- Hidden columns persist via the existing `useColumnLayout` localStorage mechanism,
  extended with a `hidden: string[]` field (safe migration from the current shape).
- **Fit to content:** double-click a column border (Glide `onColumnResize` + measuring)
  or "Fit all"; a pure `measure` helper estimates width from the longest display value
  with a max cap.
- "Reset layout" clears order/width/hidden to defaults.

### Go-to-row + density

- **Go to row** (View menu / `⌘G`): input → scroll to + select row via `gridRef.scrollTo`;
  validated against row count.
- **Density** (View menu / toolbar): Comfortable (36px, current) / Compact (28px) /
  Spacious (44px); drives `rowHeight` + `headerHeight`; persisted per-grid in localStorage.

All four are capability-flag-gated and respect the shared theme.

## Migration

### Import grid (`import-data-grid.tsx`)

- `ImportSheetAdapter` over the Zustand store: `getCellValue`/`setCellValue` →
  `setRowCellValue`; `isCellEditable` → existing `isEditableField` (`#`/email/courses
  read-only); `appendRows` (add blank source rows + `rowIds`); `removeRows` → existing
  remove path (keep the "≥1 row" guard).
- Keep all custom rendering: link cells, shimmer loop, validation/error themes, sort,
  display→source mapping.
- "Remove selected" bar → `toolbarRight`; course-scope + welcome-email + course-picker
  controls → the **Import** menu. Side panels unchanged.

### Rates grid (`employee-rates-grid.tsx`)

- `RatesSheetAdapter`: `setCellValue` → local row update + `saveMutation`;
  `isCellEditable` → rate columns only; `getNumericValue` → parse money for stats; no
  `appendRows`/`removeRows`.
- Autosave indicator → `statusSlot`; "include inactive" + "add rate column" → the
  **Staff rates** menu.

Both migrations are behavior-preserving: same data flow, validation, and autosave,
routed through the adapter and wrapped in standardized chrome.

## Keyboard shortcuts (grid-focus scoped via Glide `onKeyDown`)

| Shortcut | Action |
|---|---|
| ⌘/Ctrl+Z / ⌘⇧Z (Ctrl+Y) | Undo / Redo |
| ⌘/Ctrl+C / X / V | Copy / Cut / Smart paste |
| Delete / Backspace | Clear contents of selection |
| ⌘/Ctrl+A | Select all |
| ⌘/Ctrl+F | Find (existing search) |
| ⌘/Ctrl+G | Go to row |
| Arrows / Shift+Arrows / ⌘+Arrows | Move / extend / jump (Glide built-in) |
| Tab / Enter | Next cell / commit + down (Glide built-in) |

## Testing (Vitest; pure logic + light canvas smoke)

- `history-core.test.ts` — apply/invert for cell + structural changes, redo-clear-on-edit,
  stack cap.
- `clipboard-tsv.test.ts` — serialize/parse incl. quoted tabs/newlines, CRLF.
- `selection-stats.test.ts` — count/sum/avg/min/max, empty/non-numeric handling.
- `smart-paste.test.ts` — read-only skip, row-overflow with/without `appendRows`,
  single→range fill, clipping.
- `use-column-layout` extension — hidden-columns migration from the old stored shape.
- Adapter unit tests for import + rates (editable rules, numeric parsing).

## Rollout

Build `<DataSheet>` + pure libs (TDD) → migrate import grid → migrate rates grid →
polish menu-bar/status-bar visuals. Each grid migration is independently shippable.

## Out of scope (deferred)

Per-column filters, multi-column sort, find-&-replace, CSV/Excel export, bulk-fill
dialog. The menu + capability architecture leaves room to add these later without
structural change.

## Repo rules

No branches, worktrees, or commits unless the user explicitly asks. Treat each task
checkpoint as a `git diff`/`status` review.
