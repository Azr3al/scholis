# DataSheet Component Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable `<DataSheet>` component that standardizes Excel-like behavior (role-driven menu-bar, undo/redo, smart copy/paste, status bar, context menu, column show/hide + fit, go-to-row, density) and migrate both the import grid and the rates grid onto it.

**Architecture:** `<DataSheet>` is a thin controller wrapping Glide `DataEditor`. It owns cross-cutting chrome/behavior and reaches consumer data through a small `SheetAdapter` interface (`getCellValue`/`setCellValue`/`isCellEditable` + optional `appendRows`/`removeRows`/`getNumericValue`). All mutations funnel through one recorded path so undo/redo, paste, and fill are captured centrally. Pure logic (history, TSV clipboard, smart-paste planning, selection stats) lives in unit-tested modules.

**Tech Stack:** Next.js 15, React 19 client components, Glide Data Grid v6, Tailwind CSS v4, Radix DropdownMenu (shadcn), zustand, TanStack Query, nuqs, Vitest, lucide-react icons.

**Important repo rules:** Do not create branches, worktrees, or git commits unless the user explicitly asks. Treat each task's "Checkpoint" as a `git diff`/`status` review, not a commit. The spec for this plan is `docs/superpowers/specs/2026-06-17-data-sheet-component-design.md`.

**Test command:** `npm run test:unit -- <path>` (Vitest). Run from `schedjuice-reimagined-fe/`.

---

## File Structure

New module `src/components/data-sheet/`:

- `lib/glide-theme.ts` — MOVED from `import-grid/glide-theme.ts` (shared theme tokens + link colors).
- `lib/use-glide-theme.ts` — MOVED from `import-grid/use-glide-theme.ts`.
- `lib/history-core.ts` — pure transaction apply/invert + stack reducer.
- `lib/clipboard-tsv.ts` — pure TSV/HTML serialize + TSV parse.
- `lib/smart-paste.ts` — pure paste planner (cells to write + rows to append).
- `lib/selection-stats.ts` — pure stats over a selection.
- `lib/measure-column.ts` — pure column fit-width estimator.
- `types.ts` — `SheetAdapter`, `SheetMenuConfig`, `SheetMenu`, `SheetMenuItem`, `SheetCapabilities`, `SheetDensity`, shared types.
- `hooks/use-grid-history.ts` — history hook around `history-core` + a recorder wrapper for `setCellValue`.
- `hooks/use-grid-clipboard.ts` — copy/cut/paste handlers using `clipboard-tsv` + `smart-paste`.
- `hooks/use-column-visibility.ts` — hidden columns + fit + density (extends layout persistence).
- `hooks/use-goto-row.ts` — go-to-row scroll helper.
- `menu-bar/build-standard-menus.ts` — pure builder of Edit/View/Data menus from capabilities + handlers.
- `menu-bar/sheet-menu.tsx` — one Radix dropdown menu.
- `menu-bar/sheet-toolbar.tsx` — icon toolbar strip.
- `menu-bar/sheet-menu-bar.tsx` — composes menus row + toolbar row.
- `status-bar/sheet-status-bar.tsx` — renders selection stats.
- `context-menu/sheet-context-menu.tsx` — pointer-anchored right-click menu.
- `data-sheet.tsx` — the `<DataSheet>` component.

Modified:

- `src/store/import-store.ts` — add `appendParsedRowsAtEnd` returning end indices (smart-paste appends at bottom).
- `src/components/import-grid/import-data-grid.tsx` — build `ImportSheetAdapter`, render via `<DataSheet>`.
- `src/components/import-grid/use-column-layout.ts` — add `hidden` field + migration + `setHidden`/`resetLayout`.
- `src/components/import-grid/use-glide-theme.ts` + `glide-theme.ts` — re-export shims from new location (avoid breaking other imports), OR update imports. (Task 1 handles this.)
- `src/components/finances/employee-rates-grid.tsx` — build `RatesSheetAdapter`, render via `<DataSheet>`.
- `src/components/import-wizard/review-step.tsx` — pass import menu config (course scope / welcome emails / remove) into `<DataSheet>`.

---

## Task 1: Relocate shared theme into data-sheet/lib

**Files:**
- Create: `src/components/data-sheet/lib/glide-theme.ts`
- Create: `src/components/data-sheet/lib/use-glide-theme.ts`
- Modify: `src/components/import-grid/glide-theme.ts` (re-export shim)
- Modify: `src/components/import-grid/use-glide-theme.ts` (re-export shim)

- [ ] **Step 1: Create the moved theme module**

Copy the full current contents of `src/components/import-grid/glide-theme.ts` into `src/components/data-sheet/lib/glide-theme.ts` verbatim (it has no relative imports, so no path edits are needed).

- [ ] **Step 2: Create the moved hook module**

Create `src/components/data-sheet/lib/use-glide-theme.ts`:

```ts
"use client";

import { useTheme } from "next-themes";
import { useMemo } from "react";
import type { Theme } from "@glideapps/glide-data-grid";

import {
  DARK_GLIDE_THEME,
  DARK_LINK_COLORS,
  LIGHT_GLIDE_THEME,
  LIGHT_LINK_COLORS,
  setActiveLinkColors,
} from "./glide-theme";

export function useGlideTheme(): Partial<Theme> {
  const { resolvedTheme } = useTheme();

  return useMemo(() => {
    const isDark = resolvedTheme === "dark";
    setActiveLinkColors(isDark ? DARK_LINK_COLORS : LIGHT_LINK_COLORS);
    return isDark ? DARK_GLIDE_THEME : LIGHT_GLIDE_THEME;
  }, [resolvedTheme]);
}
```

- [ ] **Step 3: Replace the old files with re-export shims**

Replace the entire contents of `src/components/import-grid/glide-theme.ts` with:

```ts
export * from "@/components/data-sheet/lib/glide-theme";
```

Replace the entire contents of `src/components/import-grid/use-glide-theme.ts` with:

```ts
export * from "@/components/data-sheet/lib/use-glide-theme";
```

This keeps all existing importers (`import-data-grid.tsx`, `employee-rates-grid.tsx`, cells) working unchanged.

- [ ] **Step 4: Verify the app still type-checks the touched files**

Use `ReadLints` on:
- `src/components/data-sheet/lib/glide-theme.ts`
- `src/components/data-sheet/lib/use-glide-theme.ts`
- `src/components/import-grid/glide-theme.ts`
- `src/components/import-grid/use-glide-theme.ts`
- `src/components/finances/employee-rates-grid.tsx`

Expected: no new errors.

- [ ] **Step 5: Checkpoint**

Run: `git diff --stat`
Expected: two new files under `data-sheet/lib`, two shrunk shims under `import-grid`.

---

## Task 2: Shared types

**Files:**
- Create: `src/components/data-sheet/types.ts`

- [ ] **Step 1: Create the types module**

Create `src/components/data-sheet/types.ts`:

```ts
import type { ReactNode } from "react";

export type SheetDensity = "compact" | "comfortable" | "spacious";

export interface SheetAdapter {
  rowCount: number;
  getCellValue(row: number, field: string): string;
  setCellValue(row: number, field: string, value: string): void;
  isCellEditable(row: number, field: string): boolean;
  appendRows?(count: number): number[];
  removeRows?(rows: number[]): void;
  getNumericValue?(row: number, field: string): number | null;
}

export interface SheetCapabilities {
  undo?: boolean;
  copyPaste?: boolean;
  statusBar?: boolean;
  density?: boolean;
  columnVisibility?: boolean;
  contextMenu?: boolean;
  gotoRow?: boolean;
}

export interface SheetMenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  shortcut?: string;
  disabled?: boolean;
  onSelect: () => void;
}

export interface SheetMenu {
  id: string;
  label: string;
  items: SheetMenuItem[];
}

export interface SheetMenuConfig {
  roleLabel: string;
  menus?: SheetMenu[];
  extendStandardMenu?: Partial<Record<"edit" | "view" | "data", SheetMenuItem[]>>;
  toolbarRight?: ReactNode;
  statusSlot?: ReactNode;
}

export const DENSITY_ROW_HEIGHT: Record<SheetDensity, number> = {
  compact: 28,
  comfortable: 36,
  spacious: 44,
};

export const DENSITY_HEADER_HEIGHT: Record<SheetDensity, number> = {
  compact: 30,
  comfortable: 36,
  spacious: 40,
};
```

- [ ] **Step 2: Verify**

Use `ReadLints` on `src/components/data-sheet/types.ts`. Expected: no errors.

- [ ] **Step 3: Checkpoint**

Run: `git diff -- src/components/data-sheet/types.ts`
Expected: only the new types file.

---

## Task 3: TSV clipboard (pure, TDD)

**Files:**
- Create: `src/components/data-sheet/lib/clipboard-tsv.ts`
- Test: `src/components/data-sheet/lib/clipboard-tsv.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/components/data-sheet/lib/clipboard-tsv.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { parseTsv, serializeTsv, serializeHtmlTable } from "./clipboard-tsv";

describe("serializeTsv", () => {
  it("joins cells with tabs and rows with newlines", () => {
    expect(serializeTsv([["a", "b"], ["c", "d"]])).toBe("a\tb\nc\td");
  });

  it("quotes cells containing tabs, newlines, or quotes", () => {
    expect(serializeTsv([["a\tb"]])).toBe('"a\tb"');
    expect(serializeTsv([["a\nb"]])).toBe('"a\nb"');
    expect(serializeTsv([['he said "hi"']])).toBe('"he said ""hi"""');
  });
});

describe("parseTsv", () => {
  it("splits a simple grid", () => {
    expect(parseTsv("a\tb\nc\td")).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("normalizes CRLF to LF", () => {
    expect(parseTsv("a\tb\r\nc\td")).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("respects quoted cells with embedded tabs and newlines", () => {
    expect(parseTsv('"a\tb"\tc')).toEqual([["a\tb", "c"]]);
    expect(parseTsv('"a\nb"\tc')).toEqual([["a\nb", "c"]]);
  });

  it("unescapes doubled quotes", () => {
    expect(parseTsv('"he said ""hi"""')).toEqual([['he said "hi"']]);
  });

  it("drops a single trailing newline", () => {
    expect(parseTsv("a\tb\n")).toEqual([["a", "b"]]);
  });
});

describe("serializeHtmlTable", () => {
  it("wraps cells in table markup and escapes html", () => {
    expect(serializeHtmlTable([["a<b", "c"]])).toBe(
      "<table><tr><td>a&lt;b</td><td>c</td></tr></table>",
    );
  });
});
```

- [ ] **Step 2: Run and verify it fails**

Run: `npm run test:unit -- src/components/data-sheet/lib/clipboard-tsv.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/components/data-sheet/lib/clipboard-tsv.ts`:

```ts
function needsQuoting(cell: string): boolean {
  return cell.includes("\t") || cell.includes("\n") || cell.includes('"');
}

function quote(cell: string): string {
  return `"${cell.replace(/"/g, '""')}"`;
}

export function serializeTsv(rows: readonly (readonly string[])[]): string {
  return rows
    .map((row) => row.map((c) => (needsQuoting(c) ? quote(c) : c)).join("\t"))
    .join("\n");
}

function escapeHtml(cell: string): string {
  return cell
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function serializeHtmlTable(rows: readonly (readonly string[])[]): string {
  const body = rows
    .map(
      (row) =>
        `<tr>${row.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`,
    )
    .join("");
  return `<table>${body}</table>`;
}

export function parseTsv(text: string): string[][] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];

    if (inQuotes) {
      if (ch === '"') {
        if (normalized[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === "\t") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }

  // flush the final cell/row unless the input ended exactly on a newline
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}
```

- [ ] **Step 4: Run and verify pass**

Run: `npm run test:unit -- src/components/data-sheet/lib/clipboard-tsv.test.ts`
Expected: PASS.

- [ ] **Step 5: Checkpoint**

Run: `git diff --stat -- src/components/data-sheet/lib`
Expected: clipboard module + test added.

---

## Task 4: Smart-paste planner (pure, TDD)

**Files:**
- Create: `src/components/data-sheet/lib/smart-paste.ts`
- Test: `src/components/data-sheet/lib/smart-paste.test.ts`

The planner works in **display coordinates** and field ids. It does not touch the adapter; it returns a plan the caller applies. The caller supplies: visible field list (display order, excludes hidden), an `isEditable(displayRow, field)` predicate, current row count, whether row-growth is allowed, the anchor, and the selection size for single→range fill.

- [ ] **Step 1: Write the failing tests**

Create `src/components/data-sheet/lib/smart-paste.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { planPaste } from "./smart-paste";

const fields = ["a", "b", "c"];

function editableAll() {
  return () => true;
}

describe("planPaste", () => {
  it("writes a block from the anchor", () => {
    const plan = planPaste({
      block: [["1", "2"], ["3", "4"]],
      fields,
      anchor: { row: 0, col: 0 },
      selection: { rows: 1, cols: 1 },
      rowCount: 5,
      canGrow: false,
      isEditable: editableAll(),
    });
    expect(plan.writes).toEqual([
      { row: 0, field: "a", value: "1" },
      { row: 0, field: "b", value: "2" },
      { row: 1, field: "a", value: "3" },
      { row: 1, field: "b", value: "4" },
    ]);
    expect(plan.appendCount).toBe(0);
  });

  it("skips read-only columns without aborting", () => {
    const plan = planPaste({
      block: [["1", "2", "3"]],
      fields,
      anchor: { row: 0, col: 0 },
      selection: { rows: 1, cols: 1 },
      rowCount: 1,
      canGrow: false,
      isEditable: (_row, field) => field !== "b",
    });
    expect(plan.writes).toEqual([
      { row: 0, field: "a", value: "1" },
      { row: 0, field: "c", value: "3" },
    ]);
  });

  it("clips overflow when growth is not allowed", () => {
    const plan = planPaste({
      block: [["1"], ["2"], ["3"]],
      fields,
      anchor: { row: 1, col: 0 },
      selection: { rows: 1, cols: 1 },
      rowCount: 2,
      canGrow: false,
      isEditable: editableAll(),
    });
    expect(plan.writes).toEqual([{ row: 1, field: "a", value: "1" }]);
    expect(plan.appendCount).toBe(0);
  });

  it("appends rows for overflow when growth is allowed", () => {
    const plan = planPaste({
      block: [["1"], ["2"], ["3"]],
      fields,
      anchor: { row: 1, col: 0 },
      selection: { rows: 1, cols: 1 },
      rowCount: 2,
      canGrow: true,
      isEditable: editableAll(),
    });
    expect(plan.appendCount).toBe(2);
    expect(plan.writes).toEqual([
      { row: 1, field: "a", value: "1" },
      { row: 2, field: "a", value: "2" },
      { row: 3, field: "a", value: "3" },
    ]);
  });

  it("fills a selection range from a single source cell", () => {
    const plan = planPaste({
      block: [["x"]],
      fields,
      anchor: { row: 0, col: 0 },
      selection: { rows: 2, cols: 2 },
      rowCount: 5,
      canGrow: false,
      isEditable: editableAll(),
    });
    expect(plan.writes).toEqual([
      { row: 0, field: "a", value: "x" },
      { row: 0, field: "b", value: "x" },
      { row: 1, field: "a", value: "x" },
      { row: 1, field: "b", value: "x" },
    ]);
  });
});
```

- [ ] **Step 2: Run and verify it fails**

Run: `npm run test:unit -- src/components/data-sheet/lib/smart-paste.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/components/data-sheet/lib/smart-paste.ts`:

```ts
export interface PasteWrite {
  row: number; // display row
  field: string;
  value: string;
}

export interface PastePlan {
  writes: PasteWrite[];
  appendCount: number; // number of rows to append at the end before applying writes beyond rowCount
}

export interface PlanPasteInput {
  block: string[][];
  fields: string[]; // visible fields in display order
  anchor: { row: number; col: number }; // col = index into fields
  selection: { rows: number; cols: number };
  rowCount: number;
  canGrow: boolean;
  isEditable: (displayRow: number, field: string) => boolean;
}

export function planPaste(input: PlanPasteInput): PastePlan {
  const { block, fields, anchor, selection, rowCount, canGrow, isEditable } =
    input;

  if (block.length === 0) return { writes: [], appendCount: 0 };

  const isSingle = block.length === 1 && block[0].length === 1;
  const targetRows = isSingle ? Math.max(1, selection.rows) : block.length;
  const targetCols = isSingle
    ? Math.max(1, selection.cols)
    : Math.max(...block.map((r) => r.length));

  const maxDisplayRow = anchor.row + targetRows - 1;
  const overflow = Math.max(0, maxDisplayRow - (rowCount - 1));
  const appendCount = canGrow ? overflow : 0;
  const lastWritableRow = canGrow ? maxDisplayRow : rowCount - 1;

  const writes: PasteWrite[] = [];

  for (let r = 0; r < targetRows; r++) {
    const displayRow = anchor.row + r;
    if (displayRow > lastWritableRow) break;

    for (let c = 0; c < targetCols; c++) {
      const colIndex = anchor.col + c;
      const field = fields[colIndex];
      if (field === undefined) continue;
      if (!isEditable(displayRow, field)) continue;

      const value = isSingle
        ? block[0][0]
        : block[r % block.length][c % block[r % block.length].length] ?? "";

      writes.push({ row: displayRow, field, value });
    }
  }

  return { writes, appendCount };
}
```

- [ ] **Step 4: Run and verify pass**

Run: `npm run test:unit -- src/components/data-sheet/lib/smart-paste.test.ts`
Expected: PASS.

- [ ] **Step 5: Checkpoint**

Run: `git diff --stat -- src/components/data-sheet/lib`
Expected: smart-paste module + test added.

---

## Task 5: History core (pure, TDD)

**Files:**
- Create: `src/components/data-sheet/lib/history-core.ts`
- Test: `src/components/data-sheet/lib/history-core.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/components/data-sheet/lib/history-core.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  invertTransaction,
  pushTransaction,
  type HistoryState,
  type Transaction,
} from "./history-core";

const tx = (after: string): Transaction => ({
  label: "edit",
  cells: [{ row: 0, field: "a", before: "old", after }],
});

const empty: HistoryState = { undo: [], redo: [], limit: 3 };

describe("pushTransaction", () => {
  it("adds to the undo stack and clears redo", () => {
    const withRedo: HistoryState = { ...empty, redo: [tx("z")] };
    const next = pushTransaction(withRedo, tx("new"));
    expect(next.undo).toHaveLength(1);
    expect(next.redo).toHaveLength(0);
  });

  it("caps the undo stack at the limit", () => {
    let state = empty;
    state = pushTransaction(state, tx("1"));
    state = pushTransaction(state, tx("2"));
    state = pushTransaction(state, tx("3"));
    state = pushTransaction(state, tx("4"));
    expect(state.undo).toHaveLength(3);
    expect(state.undo[0].cells[0].after).toBe("2");
  });
});

describe("invertTransaction", () => {
  it("swaps before/after for cell changes", () => {
    const inverted = invertTransaction(tx("new"));
    expect(inverted.cells[0]).toEqual({ row: 0, field: "a", before: "new", after: "old" });
  });

  it("inverts append into remove and vice versa", () => {
    const append: Transaction = {
      label: "insert",
      cells: [],
      structural: [{ kind: "append", rows: [5] }],
    };
    const inverted = invertTransaction(append);
    expect(inverted.structural?.[0]).toEqual({ kind: "remove", rows: [5] });
  });
});
```

Note: `remove` inversion only needs row indices for this core test; row-value restoration is handled by the hook via snapshots (covered in Task 6's adapter usage). Keep `RowSnapshot` minimal here.

- [ ] **Step 2: Run and verify it fails**

Run: `npm run test:unit -- src/components/data-sheet/lib/history-core.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/components/data-sheet/lib/history-core.ts`:

```ts
export interface CellChange {
  row: number;
  field: string;
  before: string;
  after: string;
}

export interface RowSnapshot {
  row: number;
  values: Record<string, string>;
}

export type StructuralChange =
  | { kind: "append"; rows: number[] }
  | { kind: "remove"; rows: number[]; snapshots?: RowSnapshot[] };

export interface Transaction {
  label: string;
  cells: CellChange[];
  structural?: StructuralChange[];
}

export interface HistoryState {
  undo: Transaction[];
  redo: Transaction[];
  limit: number;
}

export function createHistoryState(limit = 100): HistoryState {
  return { undo: [], redo: [], limit };
}

export function pushTransaction(
  state: HistoryState,
  tx: Transaction,
): HistoryState {
  const undo = [...state.undo, tx];
  while (undo.length > state.limit) undo.shift();
  return { ...state, undo, redo: [] };
}

function invertStructural(change: StructuralChange): StructuralChange {
  if (change.kind === "append") {
    return { kind: "remove", rows: change.rows };
  }
  return { kind: "append", rows: change.rows };
}

export function invertTransaction(tx: Transaction): Transaction {
  return {
    label: tx.label,
    cells: tx.cells.map((c) => ({
      row: c.row,
      field: c.field,
      before: c.after,
      after: c.before,
    })),
    structural: tx.structural?.map(invertStructural),
  };
}
```

- [ ] **Step 4: Run and verify pass**

Run: `npm run test:unit -- src/components/data-sheet/lib/history-core.test.ts`
Expected: PASS.

- [ ] **Step 5: Checkpoint**

Run: `git diff --stat -- src/components/data-sheet/lib`
Expected: history-core module + test added.

---

## Task 6: Selection stats (pure, TDD)

**Files:**
- Create: `src/components/data-sheet/lib/selection-stats.ts`
- Test: `src/components/data-sheet/lib/selection-stats.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/components/data-sheet/lib/selection-stats.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { computeSelectionStats } from "./selection-stats";

describe("computeSelectionStats", () => {
  it("counts non-empty values", () => {
    const stats = computeSelectionStats({ values: ["a", "", "b"], numbers: [] });
    expect(stats.count).toBe(2);
    expect(stats.sum).toBeNull();
  });

  it("computes numeric aggregates when numbers exist", () => {
    const stats = computeSelectionStats({
      values: ["1", "2", "3"],
      numbers: [1, 2, 3],
    });
    expect(stats.count).toBe(3);
    expect(stats.sum).toBe(6);
    expect(stats.avg).toBe(2);
    expect(stats.min).toBe(1);
    expect(stats.max).toBe(3);
  });

  it("ignores null numbers in aggregates", () => {
    const stats = computeSelectionStats({
      values: ["1", "x", "3"],
      numbers: [1, null, 3],
    });
    expect(stats.sum).toBe(4);
    expect(stats.avg).toBe(2);
  });
});
```

- [ ] **Step 2: Run and verify it fails**

Run: `npm run test:unit -- src/components/data-sheet/lib/selection-stats.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/components/data-sheet/lib/selection-stats.ts`:

```ts
export interface SelectionStats {
  count: number;
  sum: number | null;
  avg: number | null;
  min: number | null;
  max: number | null;
}

export interface SelectionStatsInput {
  values: string[];
  numbers: (number | null)[];
}

export function computeSelectionStats({
  values,
  numbers,
}: SelectionStatsInput): SelectionStats {
  const count = values.filter((v) => v.trim() !== "").length;
  const nums = numbers.filter((n): n is number => n !== null);

  if (nums.length === 0) {
    return { count, sum: null, avg: null, min: null, max: null };
  }

  const sum = nums.reduce((a, b) => a + b, 0);
  return {
    count,
    sum,
    avg: sum / nums.length,
    min: Math.min(...nums),
    max: Math.max(...nums),
  };
}
```

- [ ] **Step 4: Run and verify pass**

Run: `npm run test:unit -- src/components/data-sheet/lib/selection-stats.test.ts`
Expected: PASS.

- [ ] **Step 5: Checkpoint**

Run: `git diff --stat -- src/components/data-sheet/lib`
Expected: selection-stats module + test added.

---

## Task 7: Column-width measurement (pure, TDD)

**Files:**
- Create: `src/components/data-sheet/lib/measure-column.ts`
- Test: `src/components/data-sheet/lib/measure-column.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/components/data-sheet/lib/measure-column.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { estimateColumnWidth } from "./measure-column";

describe("estimateColumnWidth", () => {
  it("sizes to the longest value plus padding", () => {
    const width = estimateColumnWidth(["a", "abcd", "ab"], "X", {
      charWidth: 8,
      padding: 16,
      min: 40,
      max: 400,
    });
    // longest is "abcd" (4) -> 4*8 + 16 = 48
    expect(width).toBe(48);
  });

  it("never goes below min", () => {
    expect(
      estimateColumnWidth([""], "", { charWidth: 8, padding: 16, min: 60, max: 400 }),
    ).toBe(60);
  });

  it("never exceeds max", () => {
    const long = "x".repeat(200);
    expect(
      estimateColumnWidth([long], "h", { charWidth: 8, padding: 16, min: 40, max: 300 }),
    ).toBe(300);
  });

  it("includes the header text in the measurement", () => {
    expect(
      estimateColumnWidth(["a"], "longheader", {
        charWidth: 8,
        padding: 16,
        min: 40,
        max: 400,
      }),
    ).toBe("longheader".length * 8 + 16);
  });
});
```

- [ ] **Step 2: Run and verify it fails**

Run: `npm run test:unit -- src/components/data-sheet/lib/measure-column.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/components/data-sheet/lib/measure-column.ts`:

```ts
export interface MeasureOptions {
  charWidth: number;
  padding: number;
  min: number;
  max: number;
}

export function estimateColumnWidth(
  values: readonly string[],
  header: string,
  { charWidth, padding, min, max }: MeasureOptions,
): number {
  const longest = [header, ...values].reduce(
    (acc, v) => Math.max(acc, v.length),
    0,
  );
  const raw = longest * charWidth + padding;
  return Math.min(max, Math.max(min, raw));
}
```

- [ ] **Step 4: Run and verify pass**

Run: `npm run test:unit -- src/components/data-sheet/lib/measure-column.test.ts`
Expected: PASS.

- [ ] **Step 5: Checkpoint**

Run: `git diff --stat -- src/components/data-sheet/lib`
Expected: measure-column module + test added.

---

## Task 8: Extend column-layout persistence with hidden + reset

**Files:**
- Modify: `src/components/import-grid/use-column-layout.ts`
- Test: `src/components/import-grid/use-column-layout.test.ts`

The existing `useColumnLayout` is used by the import grid and stores `{ order, widths }` in localStorage. Add `hidden: string[]`, a `setHidden`, a `resetLayout`, and safe migration from the old shape.

- [ ] **Step 1: Write the failing tests**

Create `src/components/import-grid/use-column-layout.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { mergeColumnLayout } from "./use-column-layout";

describe("mergeColumnLayout", () => {
  it("defaults hidden to empty when missing (old shape migration)", () => {
    const merged = mergeColumnLayout(["a", "b"], {
      order: ["a", "b"],
      widths: { a: 100, b: 100 },
    } as never);
    expect(merged.hidden).toEqual([]);
  });

  it("keeps only hidden fields that still exist", () => {
    const merged = mergeColumnLayout(["a", "b"], {
      order: ["a", "b"],
      widths: { a: 100, b: 100 },
      hidden: ["b", "gone"],
    });
    expect(merged.hidden).toEqual(["b"]);
  });

  it("appends new fields to order and gives them default widths", () => {
    const merged = mergeColumnLayout(["a", "b", "c"], {
      order: ["a", "b"],
      widths: { a: 100, b: 100 },
      hidden: [],
    });
    expect(merged.order).toEqual(["a", "b", "c"]);
    expect(merged.widths.c).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run and verify it fails**

Run: `npm run test:unit -- src/components/import-grid/use-column-layout.test.ts`
Expected: FAIL (`hidden` undefined).

- [ ] **Step 3: Implement the changes**

In `src/components/import-grid/use-column-layout.ts`:

Change the type:

```ts
export type ColumnLayout = {
  order: string[];
  widths: Record<string, number>;
  hidden: string[];
};
```

Replace `mergeColumnLayout` with:

```ts
export function mergeColumnLayout(
  fieldIds: readonly string[],
  stored: ColumnLayout | null,
): ColumnLayout {
  const order = stored?.order?.filter((f) => fieldIds.includes(f)) ?? [];
  for (const field of fieldIds) {
    if (!order.includes(field)) order.push(field);
  }
  const widths: Record<string, number> = {};
  for (const field of fieldIds) {
    widths[field] = stored?.widths?.[field] ?? defaultColumnWidth(field);
  }
  const hidden = (stored?.hidden ?? []).filter((f) => fieldIds.includes(f));
  return { order, widths, hidden };
}
```

Update the initial state and add `setHidden` + `resetLayout` to `useColumnLayout`:

```ts
export function useColumnLayout(fieldIds: readonly string[]) {
  const fieldsKey = [...fieldIds].sort().join("|");
  const key = `import-grid:layout:${fieldsKey}`;
  const stableFieldIds = fieldsKey ? fieldsKey.split("|") : [];

  const [layout, setLayout] = useState<ColumnLayout>(() =>
    mergeColumnLayout(stableFieldIds, null),
  );

  useEffect(() => {
    const ids = fieldsKey ? fieldsKey.split("|") : [];
    setLayout(mergeColumnLayout(ids, readLayout(key)));
  }, [key, fieldsKey]);

  const persist = useCallback(
    (next: ColumnLayout) => {
      setLayout(next);
      writeLayout(key, next);
    },
    [key],
  );

  const moveColumn = useCallback(
    (from: number, to: number) => {
      const nextOrder = [...layout.order];
      const [removed] = nextOrder.splice(from, 1);
      nextOrder.splice(to, 0, removed);
      persist({ ...layout, order: nextOrder });
    },
    [layout, persist],
  );

  const resizeColumn = useCallback(
    (field: string, width: number) => {
      persist({ ...layout, widths: { ...layout.widths, [field]: width } });
    },
    [layout, persist],
  );

  const setHidden = useCallback(
    (field: string, hidden: boolean) => {
      const set = new Set(layout.hidden);
      if (hidden) set.add(field);
      else set.delete(field);
      persist({ ...layout, hidden: Array.from(set) });
    },
    [layout, persist],
  );

  const setColumnWidths = useCallback(
    (widths: Record<string, number>) => {
      persist({ ...layout, widths: { ...layout.widths, ...widths } });
    },
    [layout, persist],
  );

  const resetLayout = useCallback(() => {
    const ids = fieldsKey ? fieldsKey.split("|") : [];
    persist(mergeColumnLayout(ids, null));
  }, [fieldsKey, persist]);

  return {
    layout,
    moveColumn,
    resizeColumn,
    setHidden,
    setColumnWidths,
    resetLayout,
  };
}
```

- [ ] **Step 4: Run and verify pass**

Run: `npm run test:unit -- src/components/import-grid/use-column-layout.test.ts`
Expected: PASS.

- [ ] **Step 5: Checkpoint**

Run: `git diff -- src/components/import-grid/use-column-layout.ts`
Expected: `hidden` added, plus `setHidden`/`setColumnWidths`/`resetLayout`. `import-data-grid.tsx` still compiles (it only reads `layout.order`/`layout.widths` and calls `moveColumn`/`resizeColumn`).

---

## Task 9: History hook with recorder

**Files:**
- Create: `src/components/data-sheet/hooks/use-grid-history.ts`

This hook wraps an adapter and exposes a recorded `write(field-changes)` plus `undo`/`redo`. The recorder reads `before` from the adapter, applies `after`, and accumulates a transaction.

- [ ] **Step 1: Implement the hook**

Create `src/components/data-sheet/hooks/use-grid-history.ts`:

```ts
"use client";

import { useCallback, useRef, useState } from "react";

import type { SheetAdapter } from "../types";
import {
  createHistoryState,
  invertTransaction,
  pushTransaction,
  type CellChange,
  type StructuralChange,
  type Transaction,
} from "../lib/history-core";

export interface PendingWrite {
  row: number;
  field: string;
  value: string;
}

export function useGridHistory(adapter: SheetAdapter) {
  const [state, setState] = useState(() => createHistoryState(100));
  // keep a live ref so callbacks always see the latest stacks
  const stateRef = useRef(state);
  stateRef.current = state;

  const applyTransaction = useCallback(
    (tx: Transaction) => {
      tx.structural?.forEach((s) => {
        if (s.kind === "append" && adapter.appendRows) {
          adapter.appendRows(s.rows.length);
        } else if (s.kind === "remove" && adapter.removeRows) {
          adapter.removeRows(s.rows);
        }
      });
      tx.cells.forEach((c) => adapter.setCellValue(c.row, c.field, c.after));
    },
    [adapter],
  );

  // Records writes (capturing before values) and pushes a single transaction.
  const commitWrites = useCallback(
    (writes: PendingWrite[], label: string, appendRows?: number[]) => {
      if (writes.length === 0 && !appendRows?.length) return;

      const structural: StructuralChange[] | undefined = appendRows?.length
        ? [{ kind: "append", rows: appendRows }]
        : undefined;

      const cells: CellChange[] = writes.map((w) => {
        const before = adapter.getCellValue(w.row, w.field);
        return { row: w.row, field: w.field, before, after: w.value };
      });

      cells.forEach((c) => adapter.setCellValue(c.row, c.field, c.after));

      setState((prev) => pushTransaction(prev, { label, cells, structural }));
    },
    [adapter],
  );

  const undo = useCallback(() => {
    const prev = stateRef.current;
    const tx = prev.undo[prev.undo.length - 1];
    if (!tx) return;
    const inverted = invertTransaction(tx);
    applyTransaction(inverted);
    setState({
      ...prev,
      undo: prev.undo.slice(0, -1),
      redo: [...prev.redo, tx],
    });
  }, [applyTransaction]);

  const redo = useCallback(() => {
    const prev = stateRef.current;
    const tx = prev.redo[prev.redo.length - 1];
    if (!tx) return;
    applyTransaction(tx);
    setState({
      ...prev,
      redo: prev.redo.slice(0, -1),
      undo: [...prev.undo, tx],
    });
  }, [applyTransaction]);

  const reset = useCallback(() => setState(createHistoryState(100)), []);

  return {
    commitWrites,
    undo,
    redo,
    reset,
    canUndo: state.undo.length > 0,
    canRedo: state.redo.length > 0,
  };
}
```

Note: structural append/remove undo here recreates count, not exact source-row positions; for the import adapter that is acceptable because pasted overflow rows are appended at the end and undo removes that same trailing count (the adapter's `removeRows` receives the row indices recorded at append time). Row-content restoration for explicit deletes is out of scope for this iteration (delete is destructive; the context-menu "Delete row(s)" is not undoable and is labeled accordingly in Task 13).

- [ ] **Step 2: Verify**

Use `ReadLints` on `src/components/data-sheet/hooks/use-grid-history.ts`. Expected: no errors.

- [ ] **Step 3: Checkpoint**

Run: `git diff -- src/components/data-sheet/hooks/use-grid-history.ts`
Expected: only the hook.

---

## Task 10: Clipboard hook

**Files:**
- Create: `src/components/data-sheet/hooks/use-grid-clipboard.ts`

Provides `copySelection`, `cutSelection`, and `paste` working against the adapter + visible fields + history recorder. Copy/cut operate on a rectangular range derived from the active Glide selection; the consumer passes a `getSelectionRange()` that returns display rows/cols + the active anchor.

- [ ] **Step 1: Implement the hook**

Create `src/components/data-sheet/hooks/use-grid-clipboard.ts`:

```ts
"use client";

import { useCallback } from "react";

import type { SheetAdapter } from "../types";
import { parseTsv, serializeHtmlTable, serializeTsv } from "../lib/clipboard-tsv";
import { planPaste } from "../lib/smart-paste";
import type { PendingWrite } from "./use-grid-history";

export interface SelectionRange {
  // display coordinates
  rowStart: number;
  rowEnd: number; // inclusive
  colStart: number;
  colEnd: number; // inclusive
  anchor: { row: number; col: number };
}

export interface ClipboardDeps {
  adapter: SheetAdapter;
  visibleFields: string[]; // display order, excludes hidden
  displayToSource: (displayRow: number) => number;
  getSelectionRange: () => SelectionRange | null;
  commitWrites: (
    writes: PendingWrite[],
    label: string,
    appendRows?: number[],
  ) => void;
  canGrow: boolean;
}

const MAX_PASTE_CELLS = 100_000;

export function useGridClipboard({
  adapter,
  visibleFields,
  displayToSource,
  getSelectionRange,
  commitWrites,
  canGrow,
}: ClipboardDeps) {
  const buildMatrix = useCallback(
    (range: SelectionRange) => {
      const out: string[][] = [];
      for (let r = range.rowStart; r <= range.rowEnd; r++) {
        const row: string[] = [];
        for (let c = range.colStart; c <= range.colEnd; c++) {
          const field = visibleFields[c];
          row.push(
            field ? adapter.getCellValue(displayToSource(r), field) : "",
          );
        }
        out.push(row);
      }
      return out;
    },
    [adapter, visibleFields, displayToSource],
  );

  const writeClipboard = useCallback(async (matrix: string[][]) => {
    const tsv = serializeTsv(matrix);
    if (navigator.clipboard && "write" in navigator.clipboard) {
      const item = new ClipboardItem({
        "text/plain": new Blob([tsv], { type: "text/plain" }),
        "text/html": new Blob([serializeHtmlTable(matrix)], {
          type: "text/html",
        }),
      });
      await navigator.clipboard.write([item]);
    } else {
      await navigator.clipboard.writeText(tsv);
    }
  }, []);

  const copySelection = useCallback(async () => {
    const range = getSelectionRange();
    if (!range) return;
    await writeClipboard(buildMatrix(range));
  }, [getSelectionRange, buildMatrix, writeClipboard]);

  const cutSelection = useCallback(async () => {
    const range = getSelectionRange();
    if (!range) return;
    await writeClipboard(buildMatrix(range));

    const writes: PendingWrite[] = [];
    for (let r = range.rowStart; r <= range.rowEnd; r++) {
      const source = displayToSource(r);
      for (let c = range.colStart; c <= range.colEnd; c++) {
        const field = visibleFields[c];
        if (field && adapter.isCellEditable(source, field)) {
          writes.push({ row: source, field, value: "" });
        }
      }
    }
    commitWrites(writes, "Cut");
  }, [
    getSelectionRange,
    buildMatrix,
    writeClipboard,
    visibleFields,
    adapter,
    displayToSource,
    commitWrites,
  ]);

  const paste = useCallback(async () => {
    const range = getSelectionRange();
    if (!range) return;

    const text = await navigator.clipboard.readText();
    if (!text) return;

    const block = parseTsv(text);
    if (block.length * (block[0]?.length ?? 0) > MAX_PASTE_CELLS) return;

    const plan = planPaste({
      block,
      fields: visibleFields,
      anchor: range.anchor,
      selection: {
        rows: range.rowEnd - range.rowStart + 1,
        cols: range.colEnd - range.colStart + 1,
      },
      rowCount: adapter.rowCount,
      canGrow: canGrow && Boolean(adapter.appendRows),
      isEditable: (displayRow, field) =>
        adapter.isCellEditable(displayToSource(displayRow), field),
    });

    const appendRows =
      plan.appendCount > 0 && adapter.appendRows
        ? Array.from(
            { length: plan.appendCount },
            (_, i) => adapter.rowCount + i,
          )
        : undefined;

    const writes: PendingWrite[] = plan.writes.map((w) => ({
      row: displayToSource(w.row),
      field: w.field,
      value: w.value,
    }));

    commitWrites(writes, "Paste", appendRows);
  }, [
    getSelectionRange,
    visibleFields,
    adapter,
    canGrow,
    displayToSource,
    commitWrites,
  ]);

  return { copySelection, cutSelection, paste };
}
```

Note: for append-on-paste, the new rows are appended at the end and their source index equals display index (new rows are unsorted, appended last). `displayToSource` for those freshly appended rows resolves to the same trailing indices because the consumer appends in source order; the import adapter's `appendRows` (Task 14) appends at the end to match.

- [ ] **Step 2: Verify**

Use `ReadLints` on `src/components/data-sheet/hooks/use-grid-clipboard.ts`. Expected: no errors (DOM `ClipboardItem` is available in the lib.dom types used by Next).

- [ ] **Step 3: Checkpoint**

Run: `git diff -- src/components/data-sheet/hooks/use-grid-clipboard.ts`
Expected: only the hook.

---

## Task 11: Standard-menus builder + menu/toolbar components

**Files:**
- Create: `src/components/data-sheet/menu-bar/build-standard-menus.ts`
- Create: `src/components/data-sheet/menu-bar/sheet-menu.tsx`
- Create: `src/components/data-sheet/menu-bar/sheet-toolbar.tsx`
- Create: `src/components/data-sheet/menu-bar/sheet-menu-bar.tsx`
- Test: `src/components/data-sheet/menu-bar/build-standard-menus.test.ts`

- [ ] **Step 1: Write the failing test for the builder**

Create `src/components/data-sheet/menu-bar/build-standard-menus.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { buildStandardMenus } from "./build-standard-menus";

const handlers = {
  undo: vi.fn(),
  redo: vi.fn(),
  cut: vi.fn(),
  copy: vi.fn(),
  paste: vi.fn(),
  clear: vi.fn(),
  openColumns: vi.fn(),
  setDensity: vi.fn(),
  gotoRow: vi.fn(),
};

describe("buildStandardMenus", () => {
  it("builds edit + view menus when capabilities are enabled", () => {
    const menus = buildStandardMenus({
      capabilities: { undo: true, copyPaste: true, columnVisibility: true, gotoRow: true, density: true },
      handlers,
      canUndo: true,
      canRedo: false,
    });
    const edit = menus.find((m) => m.id === "edit");
    expect(edit?.items.map((i) => i.id)).toEqual([
      "undo",
      "redo",
      "cut",
      "copy",
      "paste",
      "clear",
    ]);
    expect(edit?.items.find((i) => i.id === "redo")?.disabled).toBe(true);
    expect(menus.find((m) => m.id === "view")).toBeTruthy();
  });

  it("omits edit menu when neither undo nor copyPaste enabled", () => {
    const menus = buildStandardMenus({
      capabilities: {},
      handlers,
      canUndo: false,
      canRedo: false,
    });
    expect(menus.find((m) => m.id === "edit")).toBeUndefined();
  });

  it("merges extendStandardMenu items into the matching menu", () => {
    const menus = buildStandardMenus({
      capabilities: { undo: true },
      handlers,
      canUndo: false,
      canRedo: false,
      extend: { edit: [{ id: "x", label: "X", onSelect: vi.fn() }] },
    });
    expect(menus.find((m) => m.id === "edit")?.items.some((i) => i.id === "x")).toBe(true);
  });
});
```

- [ ] **Step 2: Run and verify it fails**

Run: `npm run test:unit -- src/components/data-sheet/menu-bar/build-standard-menus.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the builder**

Create `src/components/data-sheet/menu-bar/build-standard-menus.ts`:

```ts
import type { SheetCapabilities, SheetMenu, SheetMenuItem } from "../types";

export interface StandardMenuHandlers {
  undo: () => void;
  redo: () => void;
  cut: () => void;
  copy: () => void;
  paste: () => void;
  clear: () => void;
  openColumns: () => void;
  setDensity: () => void;
  gotoRow: () => void;
}

export interface BuildStandardMenusInput {
  capabilities: SheetCapabilities;
  handlers: StandardMenuHandlers;
  canUndo: boolean;
  canRedo: boolean;
  extend?: Partial<Record<"edit" | "view" | "data", SheetMenuItem[]>>;
}

export function buildStandardMenus({
  capabilities,
  handlers,
  canUndo,
  canRedo,
  extend,
}: BuildStandardMenusInput): SheetMenu[] {
  const menus: SheetMenu[] = [];

  if (capabilities.undo || capabilities.copyPaste) {
    const items: SheetMenuItem[] = [];
    if (capabilities.undo) {
      items.push(
        { id: "undo", label: "Undo", shortcut: "⌘Z", disabled: !canUndo, onSelect: handlers.undo },
        { id: "redo", label: "Redo", shortcut: "⌘⇧Z", disabled: !canRedo, onSelect: handlers.redo },
      );
    }
    if (capabilities.copyPaste) {
      items.push(
        { id: "cut", label: "Cut", shortcut: "⌘X", onSelect: handlers.cut },
        { id: "copy", label: "Copy", shortcut: "⌘C", onSelect: handlers.copy },
        { id: "paste", label: "Paste", shortcut: "⌘V", onSelect: handlers.paste },
        { id: "clear", label: "Clear contents", shortcut: "⌫", onSelect: handlers.clear },
      );
    }
    if (extend?.edit) items.push(...extend.edit);
    menus.push({ id: "edit", label: "Edit", items });
  }

  if (capabilities.columnVisibility || capabilities.density || capabilities.gotoRow) {
    const items: SheetMenuItem[] = [];
    if (capabilities.columnVisibility) {
      items.push({ id: "columns", label: "Columns…", onSelect: handlers.openColumns });
    }
    if (capabilities.density) {
      items.push({ id: "density", label: "Density…", onSelect: handlers.setDensity });
    }
    if (capabilities.gotoRow) {
      items.push({ id: "goto", label: "Go to row…", shortcut: "⌘G", onSelect: handlers.gotoRow });
    }
    if (extend?.view) items.push(...extend.view);
    menus.push({ id: "view", label: "View", items });
  }

  if (extend?.data && extend.data.length > 0) {
    menus.push({ id: "data", label: "Data", items: extend.data });
  }

  return menus;
}
```

- [ ] **Step 4: Run and verify pass**

Run: `npm run test:unit -- src/components/data-sheet/menu-bar/build-standard-menus.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement the dropdown menu component**

Create `src/components/data-sheet/menu-bar/sheet-menu.tsx`:

```tsx
"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { SheetMenu as SheetMenuModel } from "../types";

export function SheetMenu({ menu }: { menu: SheetMenuModel }) {
  if (menu.items.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "rounded px-2 py-1 text-sm text-foreground/80 outline-none",
          "hover:bg-muted focus-visible:bg-muted",
        )}
      >
        {menu.label}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-44">
        {menu.items.map((item) => (
          <DropdownMenuItem
            key={item.id}
            disabled={item.disabled}
            onSelect={(e) => {
              e.preventDefault();
              item.onSelect();
            }}
            className="flex items-center justify-between gap-6"
          >
            <span className="flex items-center gap-2">
              {item.icon}
              {item.label}
            </span>
            {item.shortcut ? (
              <span className="text-xs text-muted-foreground">{item.shortcut}</span>
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

Verify `src/components/ui/dropdown-menu.tsx` exists first with `glob` for `**/ui/dropdown-menu.tsx`; if absent, install via `npx shadcn@latest add dropdown-menu` (it is a standard shadcn component and the repo already uses shadcn `dialog`).

- [ ] **Step 6: Implement the toolbar**

Create `src/components/data-sheet/menu-bar/sheet-toolbar.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";

import {
  Undo2,
  Redo2,
  Copy,
  ClipboardPaste,
  Search,
  Columns3,
  Maximize2,
  Rows3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ToolbarAction {
  id: string;
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}

export function SheetToolbar({
  actions,
  right,
}: {
  actions: ToolbarAction[];
  right?: ReactNode;
}) {
  if (actions.length === 0 && !right) return null;
  return (
    <div className="flex min-h-9 shrink-0 items-center gap-1 border-b border-border bg-muted/30 px-2">
      {actions.map((a) => (
        <Button
          key={a.id}
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 text-foreground/70 active:scale-[0.96]"
          disabled={a.disabled}
          aria-label={a.label}
          title={a.label}
          onClick={a.onClick}
        >
          {a.icon}
        </Button>
      ))}
      {right ? <div className={cn("ml-auto flex items-center gap-2")}>{right}</div> : null}
    </div>
  );
}

export const TOOLBAR_ICONS = {
  undo: <Undo2 className="size-4" aria-hidden />,
  redo: <Redo2 className="size-4" aria-hidden />,
  copy: <Copy className="size-4" aria-hidden />,
  paste: <ClipboardPaste className="size-4" aria-hidden />,
  find: <Search className="size-4" aria-hidden />,
  columns: <Columns3 className="size-4" aria-hidden />,
  fit: <Maximize2 className="size-4" aria-hidden />,
  density: <Rows3 className="size-4" aria-hidden />,
};
```

- [ ] **Step 7: Implement the menu bar**

Create `src/components/data-sheet/menu-bar/sheet-menu-bar.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { SheetMenu as SheetMenuModel } from "../types";
import { SheetMenu } from "./sheet-menu";

export function SheetMenuBar({
  roleLabel,
  roleMenus,
  standardMenus,
  statusSlot,
  rightSlot,
  toolbar,
  className,
}: {
  roleLabel: string;
  roleMenus: SheetMenuModel[];
  standardMenus: SheetMenuModel[];
  statusSlot?: ReactNode;
  rightSlot?: ReactNode;
  toolbar?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex shrink-0 flex-col", className)}>
      <div className="flex min-h-9 items-center gap-1 border-b border-border bg-background px-2">
        <span className="px-1 text-sm font-semibold tracking-tight">{roleLabel}</span>
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        {roleMenus.map((m) => (
          <SheetMenu key={m.id} menu={m} />
        ))}
        {standardMenus.map((m) => (
          <SheetMenu key={m.id} menu={m} />
        ))}
        <div className="ml-auto flex items-center gap-2">
          {statusSlot}
          {rightSlot}
        </div>
      </div>
      {toolbar}
    </div>
  );
}
```

- [ ] **Step 8: Verify**

Use `ReadLints` on all four new menu-bar files. Expected: no errors.

- [ ] **Step 9: Checkpoint**

Run: `git diff --stat -- src/components/data-sheet/menu-bar`
Expected: builder + test + three components.

---

## Task 12: Status bar component

**Files:**
- Create: `src/components/data-sheet/status-bar/sheet-status-bar.tsx`

- [ ] **Step 1: Implement**

Create `src/components/data-sheet/status-bar/sheet-status-bar.tsx`:

```tsx
"use client";

import type { SelectionStats } from "../lib/selection-stats";

export interface StatusBarProps {
  rowCount: number;
  selectionDims: { rows: number; cols: number } | null;
  stats: SelectionStats | null;
  formatNumber?: (value: number) => string;
}

export function SheetStatusBar({
  rowCount,
  selectionDims,
  stats,
  formatNumber = (v) => v.toLocaleString(undefined, { maximumFractionDigits: 2 }),
}: StatusBarProps) {
  return (
    <div className="flex min-h-7 shrink-0 items-center gap-3 border-t border-border bg-muted/30 px-3 font-mono text-[11px] text-muted-foreground">
      {selectionDims ? (
        <span>
          {selectionDims.rows} × {selectionDims.cols} selected
        </span>
      ) : (
        <span>{rowCount.toLocaleString()} rows</span>
      )}
      {stats ? (
        <>
          <span className="text-foreground/40">·</span>
          <span>Count {stats.count}</span>
          {stats.sum !== null ? (
            <>
              <span>Sum {formatNumber(stats.sum)}</span>
              <span>Avg {formatNumber(stats.avg ?? 0)}</span>
              <span>Min {formatNumber(stats.min ?? 0)}</span>
              <span>Max {formatNumber(stats.max ?? 0)}</span>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Use `ReadLints` on the file. Expected: no errors.

- [ ] **Step 3: Checkpoint**

Run: `git diff -- src/components/data-sheet/status-bar/sheet-status-bar.tsx`
Expected: only the status bar.

---

## Task 13: Context menu component

**Files:**
- Create: `src/components/data-sheet/context-menu/sheet-context-menu.tsx`

Renders a Radix `DropdownMenu` positioned at a screen point. Items are capability-gated by the presence of the callbacks passed in.

- [ ] **Step 1: Implement**

Create `src/components/data-sheet/context-menu/sheet-context-menu.tsx`:

```tsx
"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface ContextMenuTarget {
  x: number;
  y: number;
}

export interface SheetContextMenuProps {
  target: ContextMenuTarget | null;
  onClose: () => void;
  onCut?: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
  onClear?: () => void;
  onInsertAbove?: () => void;
  onInsertBelow?: () => void;
  onDuplicate?: () => void;
  onDeleteRows?: () => void;
}

export function SheetContextMenu({
  target,
  onClose,
  onCut,
  onCopy,
  onPaste,
  onClear,
  onInsertAbove,
  onInsertBelow,
  onDuplicate,
  onDeleteRows,
}: SheetContextMenuProps) {
  const open = target !== null;
  const hasRowOps =
    onInsertAbove || onInsertBelow || onDuplicate || onDeleteRows;

  return (
    <DropdownMenu open={open} onOpenChange={(o) => !o && onClose()}>
      <DropdownMenuTrigger asChild>
        <span
          aria-hidden
          style={{
            position: "fixed",
            left: target?.x ?? 0,
            top: target?.y ?? 0,
            width: 0,
            height: 0,
          }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-44">
        {onCut ? <DropdownMenuItem onSelect={() => { onCut(); onClose(); }}>Cut</DropdownMenuItem> : null}
        {onCopy ? <DropdownMenuItem onSelect={() => { onCopy(); onClose(); }}>Copy</DropdownMenuItem> : null}
        {onPaste ? <DropdownMenuItem onSelect={() => { onPaste(); onClose(); }}>Paste</DropdownMenuItem> : null}
        {onClear ? <DropdownMenuItem onSelect={() => { onClear(); onClose(); }}>Clear contents</DropdownMenuItem> : null}
        {hasRowOps ? <DropdownMenuSeparator /> : null}
        {onInsertAbove ? <DropdownMenuItem onSelect={() => { onInsertAbove(); onClose(); }}>Insert row above</DropdownMenuItem> : null}
        {onInsertBelow ? <DropdownMenuItem onSelect={() => { onInsertBelow(); onClose(); }}>Insert row below</DropdownMenuItem> : null}
        {onDuplicate ? <DropdownMenuItem onSelect={() => { onDuplicate(); onClose(); }}>Duplicate row</DropdownMenuItem> : null}
        {onDeleteRows ? <DropdownMenuItem className="text-destructive" onSelect={() => { onDeleteRows(); onClose(); }}>Delete row(s)</DropdownMenuItem> : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: Verify**

Use `ReadLints` on the file. Expected: no errors.

- [ ] **Step 3: Checkpoint**

Run: `git diff -- src/components/data-sheet/context-menu/sheet-context-menu.tsx`
Expected: only the context menu.

---

## Task 14: The `<DataSheet>` component

**Files:**
- Create: `src/components/data-sheet/data-sheet.tsx`

This wires everything together. It renders the menu bar, the Glide `DataEditor`, the status bar, and the context menu. It computes the selection range from Glide's `gridSelection` and feeds the clipboard + stats. It handles keyboard shortcuts via `onKeyDown`.

- [ ] **Step 1: Implement the component**

Create `src/components/data-sheet/data-sheet.tsx`:

```tsx
"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  CompactSelection,
  DataEditor,
  GridCellKind,
  type DataEditorProps,
  type DataEditorRef,
  type GridColumn,
  type GridSelection,
} from "@glideapps/glide-data-grid";

import { cn } from "@/lib/utils";
import { useGlideTheme } from "./lib/use-glide-theme";
import {
  DENSITY_HEADER_HEIGHT,
  DENSITY_ROW_HEIGHT,
  type SheetAdapter,
  type SheetCapabilities,
  type SheetDensity,
  type SheetMenuConfig,
} from "./types";
import { useGridHistory } from "./hooks/use-grid-history";
import {
  useGridClipboard,
  type SelectionRange,
} from "./hooks/use-grid-clipboard";
import { computeSelectionStats } from "./lib/selection-stats";
import { buildStandardMenus } from "./menu-bar/build-standard-menus";
import { SheetMenuBar } from "./menu-bar/sheet-menu-bar";
import { SheetToolbar, TOOLBAR_ICONS } from "./menu-bar/sheet-toolbar";
import { SheetStatusBar } from "./status-bar/sheet-status-bar";
import {
  SheetContextMenu,
  type ContextMenuTarget,
} from "./context-menu/sheet-context-menu";

export interface DataSheetProps {
  adapter: SheetAdapter;
  columns: GridColumn[];
  visibleFields: string[]; // display order, EXCLUDING the row-marker column, matching `columns` order
  getCellContent: DataEditorProps["getCellContent"];
  customRenderers?: DataEditorProps["customRenderers"];
  displayToSource?: (displayRow: number) => number;
  numericFields?: string[];
  menus: SheetMenuConfig;
  capabilities?: SheetCapabilities;
  density?: SheetDensity;
  onDensityChange?: (d: SheetDensity) => void;
  height: number;
  className?: string;
  fullscreenSlot?: ReactNode; // e.g. the fullscreen toggle, rendered in the right slot
  formatNumber?: (value: number) => string;
  // raw Glide passthroughs the consumer still controls
  gridProps?: Partial<DataEditorProps>;
}

const DEFAULT_CAPS: SheetCapabilities = {
  undo: true,
  copyPaste: true,
  statusBar: true,
  density: true,
  columnVisibility: false,
  contextMenu: true,
  gotoRow: true,
};

export function DataSheet({
  adapter,
  columns,
  visibleFields,
  getCellContent,
  customRenderers,
  displayToSource = (r) => r,
  numericFields = [],
  menus,
  capabilities,
  density = "comfortable",
  onDensityChange,
  height,
  className,
  fullscreenSlot,
  formatNumber,
  gridProps,
}: DataSheetProps) {
  const caps = { ...DEFAULT_CAPS, ...capabilities };
  const theme = useGlideTheme();
  const gridRef = useRef<DataEditorRef>(null);

  const [selection, setSelection] = useState<GridSelection>({
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty(),
  });
  const [ctxTarget, setCtxTarget] = useState<ContextMenuTarget | null>(null);

  const history = useGridHistory(adapter);

  // Translate Glide's selection to our display-coordinate range.
  // Glide columns include a row-marker at index 0; visibleFields excludes it,
  // so subtract 1 when mapping a Glide column to a field index.
  const getSelectionRange = useCallback((): SelectionRange | null => {
    const cur = selection.current;
    if (!cur) return null;
    const { x, y, width, height: h } = cur.range;
    const colStart = Math.max(0, x - 1);
    const colEnd = Math.max(0, x + width - 1 - 1);
    return {
      rowStart: y,
      rowEnd: y + h - 1,
      colStart,
      colEnd,
      anchor: { row: cur.cell[1], col: Math.max(0, cur.cell[0] - 1) },
    };
  }, [selection]);

  const canGrow = Boolean(adapter.appendRows);

  const clipboard = useGridClipboard({
    adapter,
    visibleFields,
    displayToSource,
    getSelectionRange,
    commitWrites: history.commitWrites,
    canGrow,
  });

  const clearSelection = useCallback(() => {
    const range = getSelectionRange();
    if (!range) return;
    const writes = [];
    for (let r = range.rowStart; r <= range.rowEnd; r++) {
      const source = displayToSource(r);
      for (let c = range.colStart; c <= range.colEnd; c++) {
        const field = visibleFields[c];
        if (field && adapter.isCellEditable(source, field)) {
          writes.push({ row: source, field, value: "" });
        }
      }
    }
    history.commitWrites(writes, "Clear");
  }, [getSelectionRange, displayToSource, visibleFields, adapter, history]);

  const gotoRow = useCallback(() => {
    const input = window.prompt(`Go to row (1–${adapter.rowCount})`);
    if (!input) return;
    const n = Number(input);
    if (!Number.isInteger(n) || n < 1 || n > adapter.rowCount) return;
    gridRef.current?.scrollTo(0, n - 1, "vertical", 0, 0, { vAlign: "center" });
  }, [adapter.rowCount]);

  const cycleDensity = useCallback(() => {
    const order: SheetDensity[] = ["compact", "comfortable", "spacious"];
    const next = order[(order.indexOf(density) + 1) % order.length];
    onDensityChange?.(next);
  }, [density, onDensityChange]);

  // Selection stats
  const stats = useMemo(() => {
    if (!caps.statusBar) return null;
    const range = getSelectionRange();
    if (!range) return null;
    const values: string[] = [];
    const numbers: (number | null)[] = [];
    for (let r = range.rowStart; r <= range.rowEnd; r++) {
      const source = displayToSource(r);
      for (let c = range.colStart; c <= range.colEnd; c++) {
        const field = visibleFields[c];
        if (!field) continue;
        values.push(adapter.getCellValue(source, field));
        if (numericFields.includes(field) && adapter.getNumericValue) {
          numbers.push(adapter.getNumericValue(source, field));
        }
      }
    }
    return computeSelectionStats({ values, numbers });
  }, [caps.statusBar, getSelectionRange, displayToSource, visibleFields, adapter, numericFields]);

  const selectionDims = useMemo(() => {
    const range = getSelectionRange();
    if (!range) return null;
    return {
      rows: range.rowEnd - range.rowStart + 1,
      cols: range.colEnd - range.colStart + 1,
    };
  }, [getSelectionRange]);

  const standardMenus = useMemo(
    () =>
      buildStandardMenus({
        capabilities: caps,
        canUndo: history.canUndo,
        canRedo: history.canRedo,
        extend: menus.extendStandardMenu,
        handlers: {
          undo: history.undo,
          redo: history.redo,
          cut: clipboard.cutSelection,
          copy: clipboard.copySelection,
          paste: clipboard.paste,
          clear: clearSelection,
          openColumns: () => {}, // wired by consumer-provided menu in this iteration
          setDensity: cycleDensity,
          gotoRow,
        },
      }),
    [caps, history, clipboard, clearSelection, cycleDensity, gotoRow, menus.extendStandardMenu],
  );

  const toolbarActions = useMemo(() => {
    const actions = [];
    if (caps.undo) {
      actions.push(
        { id: "undo", label: "Undo", icon: TOOLBAR_ICONS.undo, disabled: !history.canUndo, onClick: history.undo },
        { id: "redo", label: "Redo", icon: TOOLBAR_ICONS.redo, disabled: !history.canRedo, onClick: history.redo },
      );
    }
    if (caps.copyPaste) {
      actions.push(
        { id: "copy", label: "Copy", icon: TOOLBAR_ICONS.copy, onClick: clipboard.copySelection },
        { id: "paste", label: "Paste", icon: TOOLBAR_ICONS.paste, onClick: clipboard.paste },
      );
    }
    if (caps.density) {
      actions.push({ id: "density", label: "Density", icon: TOOLBAR_ICONS.density, onClick: cycleDensity });
    }
    return actions;
  }, [caps, history, clipboard, cycleDensity]);

  const onKeyDown = useCallback<NonNullable<DataEditorProps["onKeyDown"]>>(
    (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === "z" && caps.undo) {
        e.preventDefault();
        if (e.shiftKey) history.redo();
        else history.undo();
      } else if (key === "y" && caps.undo) {
        e.preventDefault();
        history.redo();
      } else if (key === "c" && caps.copyPaste) {
        e.preventDefault();
        void clipboard.copySelection();
      } else if (key === "x" && caps.copyPaste) {
        e.preventDefault();
        void clipboard.cutSelection();
      } else if (key === "v" && caps.copyPaste) {
        e.preventDefault();
        void clipboard.paste();
      } else if (key === "g" && caps.gotoRow) {
        e.preventDefault();
        gotoRow();
      }
    },
    [caps, history, clipboard, gotoRow],
  );

  const rowHeight = DENSITY_ROW_HEIGHT[density];
  const headerHeight = DENSITY_HEADER_HEIGHT[density];
  const MENU_BAR = 36;
  const TOOLBAR = toolbarActions.length || menus.toolbarRight ? 36 : 0;
  const STATUS = caps.statusBar ? 28 : 0;
  const editorHeight = height - MENU_BAR - TOOLBAR - STATUS;

  return (
    <div
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-md border border-border",
        className,
      )}
      style={{ height }}
    >
      <SheetMenuBar
        roleLabel={menus.roleLabel}
        roleMenus={menus.menus ?? []}
        standardMenus={standardMenus}
        statusSlot={menus.statusSlot}
        rightSlot={fullscreenSlot}
        toolbar={
          TOOLBAR ? (
            <SheetToolbar actions={toolbarActions} right={menus.toolbarRight} />
          ) : null
        }
      />

      <div className="min-h-0 flex-1 overflow-hidden">
        <DataEditor
          ref={gridRef}
          theme={theme}
          width="100%"
          height={editorHeight}
          columns={columns}
          rowHeight={rowHeight}
          headerHeight={headerHeight}
          smoothScrollX
          smoothScrollY
          getCellContent={getCellContent}
          customRenderers={customRenderers}
          gridSelection={selection}
          onGridSelectionChange={setSelection}
          getCellsForSelection
          keybindings={{ search: true }}
          onKeyDown={onKeyDown}
          onCellContextMenu={(_cell, e) => {
            if (!caps.contextMenu) return;
            e.preventDefault();
            setCtxTarget({ x: e.bounds.x + e.localEventX, y: e.bounds.y + e.localEventY });
          }}
          onPaste={false}
          {...gridProps}
        />
      </div>

      {caps.statusBar ? (
        <SheetStatusBar
          rowCount={adapter.rowCount}
          selectionDims={selectionDims}
          stats={stats}
          formatNumber={formatNumber}
        />
      ) : null}

      {caps.contextMenu ? (
        <SheetContextMenu
          target={ctxTarget}
          onClose={() => setCtxTarget(null)}
          onCut={caps.copyPaste ? clipboard.cutSelection : undefined}
          onCopy={caps.copyPaste ? clipboard.copySelection : undefined}
          onPaste={caps.copyPaste ? clipboard.paste : undefined}
          onClear={clearSelection}
          onInsertBelow={
            adapter.appendRows
              ? () => {
                  const [newIndex] = adapter.appendRows!(1);
                  void newIndex;
                }
              : undefined
          }
          onDeleteRows={
            adapter.removeRows
              ? () => {
                  const range = getSelectionRange();
                  if (!range) return;
                  const rows = [];
                  for (let r = range.rowStart; r <= range.rowEnd; r++) {
                    rows.push(displayToSource(r));
                  }
                  adapter.removeRows!(rows);
                }
              : undefined
          }
        />
      ) : null}
    </div>
  );
}
```

Notes for the implementer:
- `onGridSelectionChange={setSelection}` replaces consumer selection handling; if a consumer needs selection (import's row-remove), it can pass `gridProps.onGridSelectionChange` — but because we own `gridSelection`, expose selection via a callback prop instead. For this iteration the import grid's "remove selected" uses its own checkbox row selection through `gridProps` (rowMarkers + onGridSelectionChange) — see Task 15 Step 3 for the reconciliation: the import grid passes `rowMarkers`/`freezeColumns` via `gridProps`, and reads selection through a `onSelectionChange` callback we add. To keep this task self-contained, add an optional `onSelectionChange?: (s: GridSelection) => void` prop and call it inside `setSelection`.
- Add that prop now:

```tsx
  onSelectionChange?: (selection: GridSelection) => void;
```

and change the selection setter to:

```tsx
  const handleSelectionChange = useCallback(
    (s: GridSelection) => {
      setSelection(s);
      onSelectionChange?.(s);
    },
    [onSelectionChange],
  );
```

and use `onGridSelectionChange={handleSelectionChange}`.

- `onPaste={false}` disables Glide's built-in paste so ours is the only path. (`onCellContextMenu` bounds: Glide provides `bounds`, `localEventX/Y`.)

- [ ] **Step 2: Verify**

Use `ReadLints` on `src/components/data-sheet/data-sheet.tsx`. Fix any type mismatches against the installed Glide v6 types (e.g. `onCellContextMenu` signature, `scrollTo` arity) using the editor's reported types. Expected: no errors when done.

- [ ] **Step 3: Checkpoint**

Run: `git diff -- src/components/data-sheet/data-sheet.tsx`
Expected: only the component.

---

## Task 15: Migrate the import grid onto `<DataSheet>`

**Files:**
- Modify: `src/store/import-store.ts` (append-at-end action)
- Modify: `src/components/import-grid/import-data-grid.tsx`

- [ ] **Step 1: Add an append-at-end store action**

In `src/store/import-store.ts`, add to the interface (near `appendParsedRows`):

```ts
  appendBlankRowsAtEnd: (count: number) => number[];
```

And implement inside the store:

```ts
  appendBlankRowsAtEnd: (count) => {
    const current = get().parse;
    const existingRowIds = get().rowIds;
    if (!current || count <= 0) return [];
    const width = current.headers.length;
    const blank = Array.from({ length: count }, () =>
      Array.from({ length: width }, () => "" as string | number | null),
    );
    const newRowIds = allocateRowIds(count, existingRowIds);
    const startIndex = current.rows.length;
    set({
      parse: {
        ...current,
        rows: [...current.rows, ...blank],
        rowCount: current.rowCount + count,
      },
      rowIds: [...existingRowIds, ...newRowIds],
    });
    return Array.from({ length: count }, (_, i) => startIndex + i);
  },
```

(Reuses the existing `allocateRowIds` helper. Confirm `current.headers` exists on `ParseResult`; if the width source differs, use `current.rows[0]?.length ?? 0`.)

- [ ] **Step 2: Build the adapter and render `<DataSheet>` in the import grid**

In `src/components/import-grid/import-data-grid.tsx`, after the existing memos that produce `gridCols`, `sortedRowIndices`, and `columns`, construct an adapter and replace the returned JSX's `DataEditor` block with `<DataSheet>`.

Add imports:

```tsx
import { DataSheet } from "@/components/data-sheet/data-sheet";
import type { SheetAdapter } from "@/components/data-sheet/types";
```

Build the adapter (place near other memos; it operates in **source** coordinates):

```tsx
const adapter = useMemo<SheetAdapter>(() => {
  const store = useImportStore.getState;
  const fieldToSourceIdx = new Map(mappedCols.map((c) => [c.field, c.idx]));
  return {
    rowCount: parse?.rows.length ?? 0,
    getCellValue: (row, field) => {
      const idx = fieldToSourceIdx.get(field);
      if (idx === undefined) return "";
      const raw = store().parse?.rows[row]?.[idx];
      return raw === null || raw === undefined ? "" : String(raw);
    },
    setCellValue: (row, field, value) => {
      const idx = fieldToSourceIdx.get(field);
      if (idx === undefined) return;
      setRowCellValue(row, idx, value);
      onCellEditedExternal?.(row, field, value);
    },
    isCellEditable: (_row, field) => isEditableField(field),
    appendRows: (count) =>
      useImportStore.getState().appendBlankRowsAtEnd(count),
    removeRows: (rows) => {
      if (!onRowsRemove) return;
      onRowsRemove(rows);
    },
  };
}, [mappedCols, parse?.rows.length, setRowCellValue, onCellEditedExternal, onRowsRemove]);
```

`visibleFields` must match the non-row-marker columns in display order:

```tsx
const visibleFields = useMemo(() => mappedCols.map((c) => c.field), [mappedCols]);
```

`displayToSource` reuses the existing sorted mapping:

```tsx
const displayToSource = useCallback(
  (displayRow: number) => sortedRowIndices[displayRow] ?? displayRow,
  [sortedRowIndices],
);
```

Replace the entire returned wrapper + `DataEditor` (the `return (<div ...> ... </div>)` block, including the old remove-toolbar `<div>`) with:

```tsx
return (
  <DataSheet
    adapter={adapter}
    columns={columns}
    visibleFields={visibleFields}
    getCellContent={getCellContent}
    customRenderers={[userLinkRenderer, courseLinkRenderer]}
    displayToSource={displayToSource}
    menus={{
      roleLabel: "Import",
      extendStandardMenu: {
        data: [
          // existing per-column sort is via header click; expose a hint item only if needed
        ],
      },
      toolbarRight: showRemoveToolbar ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={removeToolbarDisabled}
          className="active:scale-[0.98] text-destructive hover:text-destructive"
          onClick={() => performRemove(selectedSourceRows)}
        >
          <Trash2 className="size-4 shrink-0" aria-hidden />
          Remove
          {selectedSourceRows.length > 0 ? ` (${selectedSourceRows.length})` : ""}
        </Button>
      ) : undefined,
    }}
    capabilities={{
      undo: true,
      copyPaste: true,
      statusBar: true,
      density: true,
      columnVisibility: false,
      contextMenu: true,
      gotoRow: true,
    }}
    height={resolvedGridHeight}
    className={className}
    onSelectionChange={handleGridSelectionChange}
    gridProps={{
      rowMarkers: "checkbox-visible",
      rowSelect: "multi",
      rowSelectionMode: "multi",
      freezeColumns: 2,
      gridSelection,
      getRowThemeOverride,
      onHeaderClicked,
      onColumnMoved,
      onColumnResize,
      onCellEdited,
      onDelete: handleDelete,
      onFillPattern,
      fillHandle: true,
      onCellActivated: (cell) => {
        const field = gridCols[cell[0]]?.field ?? "";
        const sourceRow = sortedRowIndices[cell[1]] ?? cell[1];
        const bounds = null;
        onCellActivated?.(cell, bounds, field, sourceRow);
      },
    }}
  />
);
```

Note: because `<DataSheet>` owns `gridSelection`, pass the import grid's existing selection state via `gridProps.gridSelection` AND let `onSelectionChange` keep the import grid's `gridSelection` state in sync. Reconcile by having `<DataSheet>` prefer `gridProps.gridSelection` when provided. If type friction appears, the simpler path is: keep `<DataSheet>` as the single owner of selection and drop the local `gridSelection` state in the import grid, deriving `selectedSourceRows` from the `onSelectionChange` callback (which already calls `handleGridSelectionChange`). Prefer this simpler path.

The shimmer loop (`useShimmerLoop(gridRef, resolvingCells)`) needs the grid ref. Expose a ref from `<DataSheet>` via `forwardRef` returning the internal `DataEditorRef`, OR move the shimmer to use `gridProps` damage. For this iteration: add `forwardRef<DataEditorRef, DataSheetProps>` to `<DataSheet>` and forward `gridRef`, then pass it through in the import grid for `useShimmerLoop` and `focusTarget` scrolling. Update Task 14's component signature to `forwardRef` accordingly.

- [ ] **Step 3: Run import-related tests**

Run: `npm run test:unit -- src/lib/imports/resolution.test.ts src/lib/imports/validation-errors.test.ts`
Expected: PASS (logic untouched).

Manual checks (`npm run dev`, `/imports` → review):
- Grid renders with menu bar (Import | Edit | View) + toolbar.
- Edit a cell, `⌘Z` undoes, `⌘⇧Z` redoes.
- Copy a block, paste into Excel/Sheets — values match.
- Copy from Excel, paste into the grid — fills, skips email/courses, appends rows on overflow.
- Status bar shows selection dimensions + count.
- Right-click shows context menu; "Remove" button still works.
- Shimmer + course picker + validation still work.

- [ ] **Step 4: Verify lints**

Use `ReadLints` on `src/components/import-grid/import-data-grid.tsx` and `src/store/import-store.ts`. Expected: no errors.

- [ ] **Step 5: Checkpoint**

Run: `git diff -- src/components/import-grid/import-data-grid.tsx src/store/import-store.ts`
Expected: adapter + `<DataSheet>` render; store gains `appendBlankRowsAtEnd`.

---

## Task 16: Migrate the rates grid onto `<DataSheet>`

**Files:**
- Modify: `src/components/finances/employee-rates-grid.tsx`

- [ ] **Step 1: Build the adapter and render `<DataSheet>`**

Add imports:

```tsx
import { DataSheet } from "@/components/data-sheet/data-sheet";
import type { SheetAdapter } from "@/components/data-sheet/types";
```

Build the adapter (operates on `rows` in source coordinates; rates has no row-growth):

```tsx
const adapter = useMemo<SheetAdapter>(() => ({
  rowCount: rows.length,
  getCellValue: (row, field) => {
    const raw = rows[row]?.[field];
    return raw === null || raw === undefined ? "" : String(raw);
  },
  setCellValue: (row, field, value) => {
    if (!rateFields.includes(field)) return;
    const record = rows[row];
    if (!record) return;
    const next = value.trim();
    setRows((prev) => {
      const copy = [...prev];
      copy[row] = { ...copy[row], [field]: next === "" ? null : next };
      return copy;
    });
    saveMutation.mutate({ id: record.id, field, value: next });
  },
  isCellEditable: (_row, field) => rateFields.includes(field),
  getNumericValue: (row, field) => {
    if (!rateFields.includes(field)) return null;
    const raw = rows[row]?.[field];
    if (raw === null || raw === undefined || raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  },
}), [rows, rateFields, saveMutation]);

const visibleFields = useMemo(
  () => ["name", "email", ...rateFields],
  [rateFields],
);
```

Replace the `gridEditor` JSX (the `<div ...><DataEditor .../></div>`) with a `<DataSheet>`:

```tsx
const gridEditor = (
  <DataSheet
    adapter={adapter}
    columns={columns}
    visibleFields={visibleFields}
    getCellContent={getCellContent}
    displayToSource={(r) => r}
    numericFields={rateFields}
    menus={{
      roleLabel: "Staff rates",
      statusSlot: showSaveStatus ? (
        <AttendanceAutosaveStatusBar
          status={saveStatus}
          lastSavedAt={lastSavedAt}
          onRetry={handleRetry}
        />
      ) : undefined,
    }}
    capabilities={{
      undo: true,
      copyPaste: true,
      statusBar: true,
      density: true,
      columnVisibility: false,
      contextMenu: true,
      gotoRow: true,
    }}
    height={gridHeight}
    className={className}
    formatNumber={(v) => formatMoney(String(v), currencySymbol)}
    gridProps={{ freezeColumns: 1 }}
  />
);
```

Because autosave status now lives in the menu bar's `statusSlot`, the outer wrapper that previously rendered `AttendanceAutosaveStatusBar` above the grid can be removed; return `gridEditor` directly.

- [ ] **Step 2: Verify the autosave + stats**

Manual checks (`/finances/rates`):
- Menu bar shows "Staff rates | Edit | View" + autosave status on the right.
- Editing a rate autosaves (status flips saving → saved).
- `⌘Z` reverts a rate AND re-saves the previous value (status flips again).
- Selecting a numeric block shows Sum/Avg/Min/Max formatted as money.
- Copy out to Excel works; paste in fills only rate columns, clips overflow (no new rows).

- [ ] **Step 3: Verify lints**

Use `ReadLints` on `src/components/finances/employee-rates-grid.tsx`. Expected: no errors. Remove now-unused imports (e.g. `GridCellKind` stays for `getCellContent`; drop `DataEditor`, `Item` only if unused).

- [ ] **Step 4: Checkpoint**

Run: `git diff -- src/components/finances/employee-rates-grid.tsx`
Expected: adapter + `<DataSheet>` render; autosave moved to status slot.

---

## Task 17: Wire fullscreen toggle into the menu bar

**Files:**
- Modify: `src/components/import-wizard/review-step.tsx`

The fullscreen workspace already exists. In non-fullscreen, the menu-bar's right slot should host the fullscreen toggle so it lives with the grid chrome (per spec, the menu-bar is one consistent surface). In fullscreen, the existing sheet shell continues to host the grid; pass the same `<DataSheet>` as `main`.

- [ ] **Step 1: Pass the fullscreen toggle into the grid**

In `review-step.tsx`, where `<ImportDataGrid>` is rendered in normal mode, the grid already wraps `<DataSheet>`; thread a `fullscreenSlot` prop through `ImportDataGrid` to `<DataSheet>`:
- Add `fullscreenSlot?: ReactNode` to `ImportDataGrid`'s props and forward it to `<DataSheet fullscreenSlot={fullscreenSlot} />`.
- In `review-step.tsx`, pass `fullscreenSlot={<FullscreenToggle />}` (import from `@/components/layout/fullscreen-toggle`).

- [ ] **Step 2: Verify**

Manual: in `/imports` review, the fullscreen toggle appears at the right of the menu bar; clicking it enters fullscreen; the grid (with its menu bar) renders inside the sheet shell.

- [ ] **Step 3: Checkpoint**

Run: `git diff -- src/components/import-wizard/review-step.tsx src/components/import-grid/import-data-grid.tsx`
Expected: `fullscreenSlot` threaded through.

---

## Task 18: Surface column show/hide + fit-to-content UI

**Files:**
- Create: `src/components/data-sheet/menu-bar/columns-menu.tsx`
- Modify: `src/components/data-sheet/data-sheet.tsx`
- Modify: `src/components/import-grid/import-data-grid.tsx`

The persistence (`hidden` in `use-column-layout`) and measurement (`estimateColumnWidth`) primitives already exist (Tasks 7, 8). This task surfaces them as a "Columns ▾" dropdown and a "Fit all" action, gated by `capabilities.columnVisibility`.

- [ ] **Step 1: Create the columns dropdown**

Create `src/components/data-sheet/menu-bar/columns-menu.tsx`:

```tsx
"use client";

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ColumnsMenuColumn {
  field: string;
  title: string;
  hidden: boolean;
}

export function ColumnsMenu({
  columns,
  onToggle,
  onFitAll,
  onReset,
}: {
  columns: ColumnsMenuColumn[];
  onToggle: (field: string, visible: boolean) => void;
  onFitAll: () => void;
  onReset: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 text-xs">
          <Columns3 className="size-4" aria-hidden />
          Columns
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-48">
        {columns.map((c) => (
          <DropdownMenuCheckboxItem
            key={c.field}
            checked={!c.hidden}
            onCheckedChange={(checked) => onToggle(c.field, Boolean(checked))}
            onSelect={(e) => e.preventDefault()}
          >
            {c.title}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onFitAll()}>Fit all to content</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onReset()}>Reset layout</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

If `DropdownMenuCheckboxItem` is not exported by the repo's `dropdown-menu.tsx`, add it (it is part of the standard shadcn dropdown-menu; re-run `npx shadcn@latest add dropdown-menu` or add the Radix `CheckboxItem` wrapper).

- [ ] **Step 2: Accept column-visibility props in `<DataSheet>`**

Add to `DataSheetProps`:

```tsx
  columnControls?: {
    columns: { field: string; title: string; hidden: boolean }[];
    onToggle: (field: string, visible: boolean) => void;
    onFitAll: () => void;
    onReset: () => void;
  };
```

In the menu-bar render, when `caps.columnVisibility && columnControls`, render `<ColumnsMenu {...columnControls} />` inside the toolbar's left action area (add it as a leading element before the icon actions, or pass it as an extra node). Import `ColumnsMenu`.

- [ ] **Step 3: Provide column controls from the import grid**

In `import-data-grid.tsx`, use the extended `useColumnLayout` (`setHidden`, `setColumnWidths`, `resetLayout`) to:
- filter `columns` and `visibleFields` to exclude `layout.hidden`,
- build `columnControls` with `onToggle: (field, visible) => setHidden(field, !visible)`,
- `onFitAll` computes widths via `estimateColumnWidth` over each visible field's display values (cap min 60, max 400, charWidth 7, padding 24) and calls `setColumnWidths`,
- `onReset: resetLayout`.

Set `capabilities.columnVisibility: true` for the import grid.

```tsx
import { estimateColumnWidth } from "@/components/data-sheet/lib/measure-column";

const visibleColumns = useMemo(
  () => columns.filter((c) => c.id === ROW_NUM_FIELD || !layout.hidden.includes(String(c.id))),
  [columns, layout.hidden],
);

const onFitAll = useCallback(() => {
  if (!parse) return;
  const widths: Record<string, number> = {};
  mappedCols.forEach(({ field, idx }) => {
    if (layout.hidden.includes(field)) return;
    const values = parse.rows.map((r) => {
      const raw = r[idx];
      return raw === null || raw === undefined ? "" : String(raw);
    });
    widths[field] = estimateColumnWidth(values, importFieldLabel(fields, field), {
      charWidth: 7,
      padding: 24,
      min: 60,
      max: 400,
    });
  });
  setColumnWidths(widths);
}, [parse, mappedCols, layout.hidden, fields, setColumnWidths]);
```

Pass `columns={visibleColumns}`, filter `visibleFields` to exclude hidden, and pass `columnControls`.

- [ ] **Step 4: Verify**

Manual (`/imports` review): "Columns" dropdown toggles column visibility (persists across reload); "Fit all to content" resizes columns to fit; "Reset layout" restores defaults.

- [ ] **Step 5: Checkpoint**

Run: `git diff --stat -- src/components/data-sheet/menu-bar/columns-menu.tsx src/components/data-sheet/data-sheet.tsx src/components/import-grid/import-data-grid.tsx`
Expected: columns menu added + wired.

---

## Task 19: Final verification

**Files:**
- Verify all changed/created files.

- [ ] **Step 1: Run the full new test suite**

Run:

```bash
npm run test:unit -- src/components/data-sheet src/components/import-grid/use-column-layout.test.ts src/lib/imports/resolution.test.ts src/lib/imports/validation-errors.test.ts
```

Expected: all pass.

- [ ] **Step 2: Lints across the module**

Use `ReadLints` on:

```
src/components/data-sheet/**
src/components/import-grid/import-data-grid.tsx
src/components/import-grid/use-column-layout.ts
src/components/finances/employee-rates-grid.tsx
src/components/import-wizard/review-step.tsx
src/store/import-store.ts
```

Expected: no new errors.

- [ ] **Step 3: Manual acceptance**

- Import review: menu bar + toolbar + status bar; undo/redo; copy/paste with Excel & Sheets; row-growth paste; context menu; remove; fullscreen toggle; shimmer/picker/validation intact.
- Rates: menu bar + autosave status slot; undo re-saves; money stats; paste clips (no row growth).
- Both: density cycling changes row height; `⌘G` go-to-row scrolls; `⌘F` search still opens.

- [ ] **Step 4: Review working tree**

Run:

```bash
git status --short
git diff --stat
```

Expected: changes limited to the files in this plan plus the spec and this plan. Do not commit unless the user explicitly asks.

---

## Self-Review Notes (for the executor)

- **Spec coverage:** menu-bar (Tasks 11, 14), role-driven declarative config (Tasks 2, 14, 15, 16), undo/redo unified (Tasks 5, 9, 15, 16), smart copy/paste (Tasks 3, 4, 10, 14), status bar (Tasks 6, 12, 14), context menu (Tasks 13, 14), column show/hide + fit (Tasks 7, 8 primitives; Task 18 UI), go-to-row + density (Task 14), migrations (Tasks 15, 16), fullscreen integration (Task 17), shortcuts (Task 14). Final verification (Task 19).
- **Deferred (per spec "Out of scope"):** per-column filters, multi-column sort, find-&-replace, CSV/Excel export, bulk-fill dialog. Explicit row "Delete" via context menu is destructive/non-undoable this iteration (labeled accordingly); full row-snapshot undo is a future enhancement.
- **Type consistency:** `SheetAdapter`, `commitWrites(writes,label,appendRows)`, `planPaste`, `computeSelectionStats`, `buildStandardMenus` signatures are used identically across tasks.
