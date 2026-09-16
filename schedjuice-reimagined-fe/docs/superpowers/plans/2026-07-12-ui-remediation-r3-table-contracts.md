# R3 — ResourceTable Column Sizing, Overflow, Editor, and Alignment Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add semantic column sizing metadata to the data-table stack, propagate width/wrap/alignment through the TanStack render model, and enforce horizontal scroll before control or text crushing — with representative column migrations only and no product-behavior changes.

**Architecture:** Introduce pure layout helpers (`column-layout.ts`) that map `ColumnContentRole` + optional width overrides to `<colgroup>` styles and cell class names. Extend `Column<T>` and column builders; thread resolved layout through `use-table-instance` meta into `table.tsx` rendering. Replace ad-hoc local `min-w-*` hacks on representative tables with declarative sizing. Keep Glide and finance-specific business logic untouched.

**Tech Stack:** React 19, `@tanstack/react-table`, Vitest, Tailwind v4 semantic tokens, DESIGN.md §8.6 / §9 table rules.

**Spec:** [`../specs/2026-07-12-ui-migration-remediation-program-design.md`](../specs/2026-07-12-ui-migration-remediation-program-design.md) §8.6  
**Design authority:** [`DESIGN.md`](../../../DESIGN.md) §9 (52px row minimum, typography-first tables)

**Planning base SHA:** `05ac447b10966131d4f37a2ba724110c33d66dd4` on `dev`  
**Branch:** `remediate/ui-r3-tables` from current `dev`  
**Worktree:** `../worktrees/ui-r3-tables`

**Dependencies (must be merged before execution):**
- **R0** — verification baseline (`npm run test:unit`, `npm run typecheck`, `npm run test:browser` all green); component tests using `@testing-library/react` require R0's happy-dom `environmentMatchGlobs` and testing-library devDependencies
- **R1** — token vocabulary converged (no new legacy token classes in owned files)

**May overlap with:** R4 and R5 when owned file sets are disjoint. **Do not overlap** with R2 on overlay primitives or R12 on exhaustive student-payments migration.

---

## Current-state evidence (base `05ac447b`)

| Location | Problem |
| --- | --- |
| `src/components/data-table/types.ts:5-18` | `Column<T>` has `align` only — no content role, min/preferred/max width, wrap policy, or editor sizing |
| `src/components/data-table/use-table-instance.ts:61-66` | TanStack `meta` carries `alignClass` only |
| `src/components/data-table/table.tsx:69-76` | Cells get fixed `h-[52px] px-3 py-3 align-middle` + align class; no width or wrap from column contract |
| `src/components/data-table/table.tsx:91-98` | Wrapper has `overflow-x-auto` but columns lack min widths, so editable cells crush via `min-w-0` |
| `src/components/data-table/resource-table.tsx:51-64` | Editable text cells use `min-w-0 flex-1` — violates overflow-before-crushing |
| `src/lib/ui/select-layout.ts:1-16` | Payment-specific width floor lives outside table contract |
| `src/lib/finances/student-payments-filter-ui.ts:4-5,28-33` | Local `min-w-[12rem]` / `min-w-[18rem]` constants duplicate per-table hacks |
| `src/app/(internal)/campuses/campus-columns.tsx:4-30` | Columns have no sizing metadata |
| `src/app/(internal)/programs/program-columns.tsx:4-25` | Same |

**Behavior preservation rule:** This wave changes layout geometry only. Sorting, pagination, save handlers, row expansion, and API payloads must remain identical.

---

## File structure

**Create:**
```
src/components/data-table/column-layout.ts
src/components/data-table/__tests__/column-layout.test.ts
src/components/data-table/__tests__/table-layout.test.tsx
docs/ui-contracts/table-column-sizing.md
```

**Modify:**
```
src/components/data-table/types.ts
src/components/data-table/columns.ts
src/components/data-table/use-table-instance.ts
src/components/data-table/table.tsx
src/components/data-table/resource-table.tsx
src/components/data-table/index.ts
src/app/(internal)/campuses/campus-columns.tsx
src/app/(internal)/programs/program-columns.tsx
src/components/finances/student-payments-resource-table.tsx   (student + status columns only)
src/lib/finances/student-payments-filter-ui.ts                (remove superseded constant)
```

**Forbidden (do not edit):**
- `src/components/finances/student-payments-grid.tsx` (Glide — separate interaction class)
- `src/components/data-sheet/**`
- Any `page.tsx` route file except column definition files listed above
- Overlay / z-index files owned by R2
- AutoForm / Select / Combobox files owned by R4
- Exhaustive student-payments column migration (owned by **R12**)

---

## Contract summary (locked for this plan)

### `ColumnContentRole` defaults

| Role | min | preferred | max | wrap | align | tabular |
| --- | --- | --- | --- | --- | --- | --- |
| `identifier` | 8rem | 10rem | 14rem | truncate | left | no |
| `person` | 12rem | 14rem | 18rem | wrap | left | no |
| `prose` | 14rem | 20rem | 28rem | wrap | left | no |
| `date` | 9rem | 11rem | 14rem | nowrap | left | no |
| `numeric` | 7rem | 9rem | 12rem | nowrap | right | yes |
| `status` | 9rem | 11rem | 14rem | nowrap | left | no |
| `action` | 5rem | 6rem | 8rem | nowrap | center | no |
| `control` | 10rem | 12rem | none | nowrap | left | no |

Rules:
1. Table wrapper scrolls horizontally before any column shrinks below its `min`.
2. `control` role reserves space for inline editors + `CellSaveFeedback` (min height unchanged).
3. Numeric columns use `tabular-nums`.
4. Row height stays `h-[52px]` minimum (DESIGN.md §9).
5. Column-level `sizing` overrides merge on top of role defaults (explicit beats default).

---

### Task 1: Column layout pure helpers (TDD)

**Files:**
- Create: `src/components/data-table/__tests__/column-layout.test.ts`
- Create: `src/components/data-table/column-layout.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/components/data-table/__tests__/column-layout.test.ts
import { describe, expect, it } from "vitest";

import {
  resolveColumnLayout,
  mergeColumnSizing,
  type ColumnLayoutModel,
} from "../column-layout";
import type { ColumnSizing } from "../types";

describe("mergeColumnSizing", () => {
  it("applies explicit width overrides on top of role defaults", () => {
    const merged = mergeColumnSizing({
      role: "person",
      width: { min: "14rem" },
    });
    expect(merged.width.min).toBe("14rem");
    expect(merged.width.preferred).toBe("14rem");
    expect(merged.wrap).toBe("wrap");
  });
});

describe("resolveColumnLayout", () => {
  it("returns col style with min and preferred width for numeric role", () => {
    const layout: ColumnLayoutModel = resolveColumnLayout({
      role: "numeric",
    });
    expect(layout.colStyle).toEqual({
      minWidth: "7rem",
      width: "9rem",
    });
    expect(layout.thClass).toContain("text-right");
    expect(layout.tdClass).toContain("tabular-nums");
    expect(layout.wrapClass).toContain("whitespace-nowrap");
  });

  it("caps max width when role defines max", () => {
    const layout = resolveColumnLayout({ role: "person" });
    expect(layout.colStyle.maxWidth).toBe("18rem");
    expect(layout.wrapClass).toContain("break-words");
  });

  it("control role never sets maxWidth so selects can grow in wide tables", () => {
    const layout = resolveColumnLayout({ role: "control" });
    expect(layout.colStyle.maxWidth).toBeUndefined();
    expect(layout.colStyle.minWidth).toBe("10rem");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-fe
npm run test:unit -- src/components/data-table/__tests__/column-layout.test.ts
```

Expected: FAIL — `Cannot find module '../column-layout'`.

- [ ] **Step 3: Implement `column-layout.ts`**

```typescript
// src/components/data-table/column-layout.ts
import type { ColumnAlign, ColumnContentRole, ColumnSizing, ColumnWrapPolicy } from "./types";

export type ResolvedColumnSizing = {
  role: ColumnContentRole;
  width: { min: string; preferred: string; max?: string };
  wrap: ColumnWrapPolicy;
  align: ColumnAlign;
  tabular: boolean;
};

export type ColumnLayoutModel = {
  colStyle: { minWidth: string; width: string; maxWidth?: string };
  thClass: string;
  tdClass: string;
  wrapClass: string;
};

const ROLE_DEFAULTS: Record<
  ColumnContentRole,
  Omit<ResolvedColumnSizing, "role">
> = {
  identifier: {
    width: { min: "8rem", preferred: "10rem", max: "14rem" },
    wrap: "truncate",
    align: "left",
    tabular: false,
  },
  person: {
    width: { min: "12rem", preferred: "14rem", max: "18rem" },
    wrap: "wrap",
    align: "left",
    tabular: false,
  },
  prose: {
    width: { min: "14rem", preferred: "20rem", max: "28rem" },
    wrap: "wrap",
    align: "left",
    tabular: false,
  },
  date: {
    width: { min: "9rem", preferred: "11rem", max: "14rem" },
    wrap: "nowrap",
    align: "left",
    tabular: false,
  },
  numeric: {
    width: { min: "7rem", preferred: "9rem", max: "12rem" },
    wrap: "nowrap",
    align: "right",
    tabular: true,
  },
  status: {
    width: { min: "9rem", preferred: "11rem", max: "14rem" },
    wrap: "nowrap",
    align: "left",
    tabular: false,
  },
  action: {
    width: { min: "5rem", preferred: "6rem", max: "8rem" },
    wrap: "nowrap",
    align: "center",
    tabular: false,
  },
  control: {
    width: { min: "10rem", preferred: "12rem" },
    wrap: "nowrap",
    align: "left",
    tabular: false,
  },
};

function alignClass(align: ColumnAlign): string {
  if (align === "right") return "text-right";
  if (align === "center") return "text-center";
  return "text-left";
}

function wrapClassFor(policy: ColumnWrapPolicy): string {
  if (policy === "wrap") return "whitespace-normal break-words";
  if (policy === "truncate") return "truncate whitespace-nowrap";
  return "whitespace-nowrap";
}

export function mergeColumnSizing(
  sizing: ColumnSizing | undefined,
  alignOverride?: ColumnAlign,
): ResolvedColumnSizing {
  const role = sizing?.role ?? "prose";
  const base = ROLE_DEFAULTS[role];
  const width = {
    min: sizing?.width?.min ?? base.width.min,
    preferred: sizing?.width?.preferred ?? base.width.preferred,
    max: sizing?.width?.max ?? base.width.max,
  };
  return {
    role,
    width,
    wrap: sizing?.wrap ?? base.wrap,
    align: alignOverride ?? sizing?.align ?? base.align,
    tabular: sizing?.tabular ?? base.tabular,
  };
}

export function resolveColumnLayout(
  sizing: ColumnSizing | undefined,
  alignOverride?: ColumnAlign,
): ColumnLayoutModel {
  const resolved = mergeColumnSizing(sizing, alignOverride);
  const colStyle: ColumnLayoutModel["colStyle"] = {
    minWidth: resolved.width.min,
    width: resolved.width.preferred,
  };
  if (resolved.width.max) {
    colStyle.maxWidth = resolved.width.max;
  }
  const align = alignClass(resolved.align);
  const wrap = wrapClassFor(resolved.wrap);
  const tabular = resolved.tabular ? "tabular-nums" : "";
  return {
    colStyle,
    thClass: align,
    tdClass: [align, tabular].filter(Boolean).join(" "),
    wrapClass: wrap,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npm run test:unit -- src/components/data-table/__tests__/column-layout.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/data-table/column-layout.ts src/components/data-table/__tests__/column-layout.test.ts
git commit -m "feat(data-table): add column layout contract helpers"
```

---

### Task 2: Extend `Column<T>` type and column builders

**Files:**
- Modify: `src/components/data-table/types.ts:5-18`
- Modify: `src/components/data-table/columns.ts:1-51`
- Modify: `src/components/data-table/__tests__/columns.test.ts`
- Modify: `src/components/data-table/index.ts`

- [ ] **Step 1: Write failing test for role-aware builder**

```typescript
// Append to src/components/data-table/__tests__/columns.test.ts
import type { ColumnSizing } from "../types";

describe("column.text with sizing", () => {
  it("preserves sizing metadata on the column", () => {
    const sizing: ColumnSizing = { role: "identifier" };
    const col = column.text<Row>({
      id: "code",
      header: "Code",
      accessor: (row) => row.name,
      sizing,
    });
    expect(col.sizing).toEqual(sizing);
  });
});

describe("column.numeric", () => {
  it("defaults to numeric role and right alignment", () => {
    const col = column.numeric<{ amount: number }>({
      id: "amount",
      header: "Amount",
      accessor: (row) => row.amount,
    });
    expect(col.sizing?.role).toBe("numeric");
    expect(col.align).toBe("right");
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run:
```bash
npm run test:unit -- src/components/data-table/__tests__/columns.test.ts
```

Expected: FAIL — `column.numeric is not a function`.

- [ ] **Step 3: Extend types**

Replace `src/components/data-table/types.ts` lines 3-18 with:

```typescript
export type ColumnAlign = "left" | "right" | "center";

export type ColumnContentRole =
  | "identifier"
  | "person"
  | "prose"
  | "date"
  | "numeric"
  | "status"
  | "action"
  | "control";

export type ColumnWrapPolicy = "truncate" | "wrap" | "nowrap";

export type ColumnWidthSpec = {
  min?: string;
  preferred?: string;
  max?: string;
};

/** Semantic sizing metadata — see docs/ui-contracts/table-column-sizing.md */
export type ColumnSizing = {
  role?: ColumnContentRole;
  width?: ColumnWidthSpec;
  wrap?: ColumnWrapPolicy;
  align?: ColumnAlign;
  tabular?: boolean;
};

export type Column<T> = {
  id: string;
  header: ReactNode;
  accessor: (row: T) => unknown;
  align?: ColumnAlign;
  sizing?: ColumnSizing;
  enableSorting?: boolean;
  cell?: (ctx: { row: T; value: unknown }) => ReactNode;
  /** Opt-in editable — only set by column.editable* builders */
  editable?: {
    kind: "text" | "select" | "switch" | "date";
    options?: { label: string; value: string }[];
    onSave: (row: T, value: unknown) => Promise<void>;
  };
};
```

- [ ] **Step 4: Extend builders in `columns.ts`**

Replace entire file with:

```typescript
import type { Column, ColumnSizing } from "./types";

type BuilderOpts<T, V> = {
  id: string;
  header: Column<T>["header"];
  accessor: (row: T) => V;
  enableSorting?: boolean;
  sizing?: ColumnSizing;
  align?: Column<T>["align"];
};

export const column = {
  text<T>(opts: BuilderOpts<T, string | null | undefined>): Column<T> {
    return {
      id: opts.id,
      header: opts.header,
      accessor: opts.accessor,
      align: opts.align,
      sizing: opts.sizing ?? { role: "prose" },
      enableSorting: opts.enableSorting ?? true,
      cell: ({ value }) => (value == null || value === "" ? "—" : String(value)),
    };
  },
  date<T>(opts: BuilderOpts<T, string | Date | null | undefined>): Column<T> {
    return {
      id: opts.id,
      header: opts.header,
      accessor: opts.accessor,
      sizing: opts.sizing ?? { role: "date" },
      enableSorting: true,
      cell: ({ value }) => {
        if (value == null || value === "") return "—";
        const d = value instanceof Date ? value : new Date(String(value));
        return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
      },
    };
  },
  numeric<T>(opts: BuilderOpts<T, number | string | null | undefined>): Column<T> {
    return {
      id: opts.id,
      header: opts.header,
      accessor: opts.accessor,
      align: "right",
      sizing: opts.sizing ?? { role: "numeric", tabular: true },
      enableSorting: opts.enableSorting ?? true,
      cell: ({ value }) => (value == null || value === "" ? "—" : String(value)),
    };
  },
  status<T>(opts: BuilderOpts<T, string | null | undefined>): Column<T> {
    return {
      id: opts.id,
      header: opts.header,
      accessor: opts.accessor,
      sizing: opts.sizing ?? { role: "status" },
      enableSorting: opts.enableSorting ?? false,
      cell: ({ value }) => (value == null || value === "" ? "—" : String(value)),
    };
  },
  editableText<T>(opts: {
    id: string;
    header: Column<T>["header"];
    accessor: (row: T) => string | null | undefined;
    onSave: (row: T, value: string) => Promise<void>;
    sizing?: ColumnSizing;
  }): Column<T> {
    return {
      id: opts.id,
      header: opts.header,
      accessor: opts.accessor,
      sizing: opts.sizing ?? { role: "control" },
      editable: {
        kind: "text",
        onSave: (row, value) => opts.onSave(row, String(value ?? "")),
      },
    };
  },
};
```

- [ ] **Step 5: Export new types from `index.ts`**

Add to exports in `src/components/data-table/index.ts`:

```typescript
export type {
  Column,
  ColumnAlign,
  ColumnContentRole,
  ColumnSizing,
  ColumnWrapPolicy,
  ColumnWidthSpec,
  ResourceListResult,
  ResourceTableState,
} from "./types";
export { resolveColumnLayout, mergeColumnSizing } from "./column-layout";
export type { ColumnLayoutModel, ResolvedColumnSizing } from "./column-layout";
```

- [ ] **Step 6: Run tests**

Run:
```bash
npm run test:unit -- src/components/data-table/__tests__/columns.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/data-table/types.ts src/components/data-table/columns.ts src/components/data-table/index.ts src/components/data-table/__tests__/columns.test.ts
git commit -m "feat(data-table): extend Column type and builders with sizing roles"
```

---

### Task 3: Propagate layout through TanStack meta

**Files:**
- Modify: `src/components/data-table/use-table-instance.ts:48-67,69-82,128-154`

- [ ] **Step 1: Write failing test**

```typescript
// src/components/data-table/__tests__/use-table-instance.test.ts
import { renderHook } from "@testing-library/react";
import { useTableInstance } from "../use-table-instance";

type Row = { id: string; name: string };

describe("useTableInstance layout meta", () => {
  it("threads resolved layout classes into header and body cells", () => {
    const { result } = renderHook(() =>
      useTableInstance({
        columns: [
          {
            id: "name",
            header: "Name",
            accessor: (row: Row) => row.name,
            sizing: { role: "person" },
          },
        ],
        rows: [{ id: "1", name: "Ada" }],
        getRowId: (row) => row.id,
      }),
    );
    expect(result.current.headerGroups[0].headers[0].layoutClass).toContain(
      "text-left",
    );
    expect(result.current.bodyRows[0].cells[0].layoutClass).toContain(
      "break-words",
    );
    expect(result.current.columnLayouts[0].colStyle.minWidth).toBe("12rem");
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run:
```bash
npm run test:unit -- src/components/data-table/__tests__/use-table-instance.test.ts
```

Expected: FAIL — `layoutClass` undefined.

- [ ] **Step 3: Update `use-table-instance.ts`**

Add import at top:
```typescript
import { resolveColumnLayout, type ColumnLayoutModel } from "./column-layout";
```

Replace `toColumnDef` function (lines 48-67):

```typescript
function toColumnDef<T>(column: Column<T>): ColumnDef<T> {
  const layout = resolveColumnLayout(column.sizing, column.align);
  return {
    id: column.id,
    accessorFn: (row) => column.accessor(row),
    enableSorting: column.enableSorting ?? false,
    header: () => column.header,
    cell: (info) => {
      const row = info.row.original;
      const value = info.getValue();
      if (column.cell) return column.cell({ row, value });
      if (value == null || value === "") return "—";
      return String(value);
    },
    meta: {
      align: column.align,
      alignClass: layout.thClass,
      enableSorting: column.enableSorting ?? false,
      layout,
    },
  };
}
```

Extend `TableHeaderCellModel` (lines 69-76):

```typescript
export type TableHeaderCellModel = {
  id: string;
  columnId: string;
  content: ReactNode;
  alignClass: string;
  layoutClass: string;
  enableSorting: boolean;
  sorted: false | "asc" | "desc";
};
```

Extend `TableBodyCellModel` (lines 78-82):

```typescript
export type TableBodyCellModel = {
  id: string;
  content: ReactNode;
  alignClass: string;
  layoutClass: string;
};
```

In `useTableInstance`, add before return (after `bodyRows`):

```typescript
  const columnLayouts: ColumnLayoutModel[] = columnDefs.map((def) => {
    const meta = def.meta as { layout?: ColumnLayoutModel } | undefined;
    return meta?.layout ?? resolveColumnLayout(undefined);
  });
```

Update header mapping (lines 128-139) to set `layoutClass`:

```typescript
      const meta = header.column.columnDef.meta as
        | { alignClass?: string; enableSorting?: boolean; layout?: ColumnLayoutModel }
        | undefined;
      const layoutClass = [
        meta?.alignClass ?? "text-left",
        meta?.layout?.wrapClass ?? "",
      ]
        .filter(Boolean)
        .join(" ");
      return {
        id: header.id,
        columnId: header.column.id,
        content: flexRender(header.column.columnDef.header, header.getContext()),
        alignClass: meta?.alignClass ?? "text-left",
        layoutClass,
        enableSorting: meta?.enableSorting ?? false,
        sorted: header.column.getIsSorted(),
      };
```

Update body cell mapping (lines 145-153):

```typescript
      const meta = cell.column.columnDef.meta as
        | { alignClass?: string; layout?: ColumnLayoutModel }
        | undefined;
      const layoutClass = [
        meta?.alignClass ?? "text-left",
        meta?.layout?.wrapClass ?? "",
        meta?.layout?.tdClass ?? "",
      ]
        .filter(Boolean)
        .join(" ");
      return {
        id: cell.id,
        content: flexRender(cell.column.columnDef.cell, cell.getContext()),
        alignClass: meta?.alignClass ?? "text-left",
        layoutClass,
      };
```

Change return to:

```typescript
  return { headerGroups, bodyRows, columnCount, columnLayouts };
```

- [ ] **Step 4: Run test — expect PASS**

Run:
```bash
npm run test:unit -- src/components/data-table/__tests__/use-table-instance.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/components/data-table/use-table-instance.ts src/components/data-table/__tests__/use-table-instance.test.ts
git commit -m "feat(data-table): propagate column layout through table instance meta"
```

---

### Task 4: Render `<colgroup>` and apply cell layout in `table.tsx`

**Files:**
- Modify: `src/components/data-table/table.tsx:47-53,69-76,102-162`
- Create: `src/components/data-table/__tests__/table-layout.test.tsx`

- [ ] **Step 1: Write failing render test**

```tsx
// src/components/data-table/__tests__/table-layout.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Table } from "../table";

type Row = { id: string; amount: number };

describe("Table column layout rendering", () => {
  it("renders colgroup with minWidth from column sizing", () => {
    const { container } = render(
      <Table
        columns={[
          {
            id: "amount",
            header: "Amount",
            accessor: (row: Row) => row.amount,
            align: "right",
            sizing: { role: "numeric" },
          },
        ]}
        rows={[{ id: "1", amount: 42 }]}
        getRowId={(row) => row.id}
      />,
    );
    const col = container.querySelector("colgroup col");
    expect(col).toBeTruthy();
    expect(col?.getAttribute("style")).toContain("min-width: 7rem");
    expect(screen.getByText("42").closest("td")?.className).toContain(
      "tabular-nums",
    );
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run:
```bash
npm run test:unit -- src/components/data-table/__tests__/table-layout.test.tsx
```

Expected: FAIL — no `colgroup`.

- [ ] **Step 3: Update `table.tsx`**

Change destructuring from `useTableInstance` (line 48):

```typescript
  const { headerGroups, bodyRows, columnCount, columnLayouts } = useTableInstance({
    columns,
    rows,
    getRowId,
    sorts,
  });
```

Update `<td>` (lines 69-76):

```typescript
      {row.cells.map((cell) => (
        <td
          key={cell.id}
          className={cn(
            "h-[52px] px-3 py-3 align-middle",
            cell.layoutClass,
          )}
        >
          {cell.content}
        </td>
      ))}
```

Update `<th>` className (lines 121-124):

```typescript
                      className={cn(
                        "px-3 py-3 font-sans text-sm font-medium text-text-secondary",
                        headerCell.layoutClass,
                      )}
```

Inside `<table>` before `<thead>` (after line 102):

```typescript
          {columnLayouts.length > 0 ? (
            <colgroup>
              {columnLayouts.map((layout, index) => (
                <col
                  key={headerGroups[0]?.headers[index]?.columnId ?? index}
                  style={layout.colStyle}
                />
              ))}
            </colgroup>
          ) : null}
```

Add `style={{ tableLayout: "auto", width: "100%", minWidth: "max-content" }}` on `<table>`:

```typescript
        <table
          className="w-full border-collapse text-sm"
          style={{ tableLayout: "auto", width: "100%", minWidth: "max-content" }}
        >
```

- [ ] **Step 4: Run test — expect PASS**

Run:
```bash
npm run test:unit -- src/components/data-table/__tests__/table-layout.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add src/components/data-table/table.tsx src/components/data-table/__tests__/table-layout.test.tsx
git commit -m "feat(data-table): render colgroup and cell layout classes"
```

---

### Task 5: Editable cell editor sizing (no behavior change)

**Files:**
- Modify: `src/components/data-table/resource-table.tsx:34-65`

- [ ] **Step 1: Update `EditableTextCell` wrapper**

Replace lines 50-64 with:

```typescript
  return (
    <div className="flex min-w-[10rem] items-center gap-2">
      <Input
        value={displayValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={() => {
          void commit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
        }}
        className="h-8 w-full min-w-[8rem] flex-1 text-sm"
      />
      <CellSaveFeedback status={status} showSavedTick={showSavedTick} />
    </div>
  );
```

- [ ] **Step 2: Run unit suite for data-table**

Run:
```bash
npm run test:unit -- src/components/data-table
```

Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/data-table/resource-table.tsx
git commit -m "fix(data-table): reserve min width for editable text cells"
```

---

### Task 6: Representative column migrations

**Files:**
- Modify: `src/app/(internal)/campuses/campus-columns.tsx:4-30`
- Modify: `src/app/(internal)/programs/program-columns.tsx:4-25`
- Modify: `src/components/finances/student-payments-resource-table.tsx:556-623,721-730`
- Modify: `src/lib/finances/student-payments-filter-ui.ts:4-5`

- [ ] **Step 1: Campuses columns**

Replace `src/app/(internal)/campuses/campus-columns.tsx` with:

```typescript
import { column, type Column } from "@/components/data-table";
import type { Campus } from "@/sdk";

export const campusColumns: Column<Campus>[] = [
  column.text<Campus>({
    id: "name",
    header: "Name",
    accessor: (row) => row.name,
    sizing: { role: "person" },
  }),
  column.text<Campus>({
    id: "description",
    header: "Description",
    accessor: (row) => row.description,
    sizing: { role: "prose" },
  }),
  column.text<Campus>({
    id: "location",
    header: "Location",
    accessor: (row) => row.location,
    sizing: { role: "identifier" },
  }),
  column.status<Campus>({
    id: "is_online",
    header: "Online",
    accessor: (row) => (row.is_online ? "Yes" : "No"),
  }),
  column.status<Campus>({
    id: "is_default",
    header: "Default",
    accessor: (row) => (row.is_default ? "Yes" : "No"),
  }),
];
```

- [ ] **Step 2: Programs columns**

Replace `src/app/(internal)/programs/program-columns.tsx` with:

```typescript
import { column, type Column } from "@/components/data-table";
import type { Program } from "@/sdk";

export const programColumns: Column<Program>[] = [
  column.text<Program>({
    id: "name",
    header: "Name",
    accessor: (row) => row.name,
    sizing: { role: "person" },
  }),
  column.status<Program>({
    id: "course_creation_method",
    header: "Creation",
    accessor: (row) =>
      row.course_creation_method === "intake_based" ? "Intake-based" : "Manual",
  }),
  column.text<Program>({
    id: "subject_strategy",
    header: "Subjects",
    accessor: (row) => row.subject_strategy,
    sizing: { role: "prose", wrap: "truncate" },
  }),
  column.status<Program>({
    id: "is_active",
    header: "Active",
    accessor: (row) => (row.is_active ? "Yes" : "No"),
  }),
];
```

- [ ] **Step 3: Student payments — student column only (representative)**

In `student-payments-resource-table.tsx`, add `sizing` to the student column object (after `enableSorting: false,` at line 560):

```typescript
        sizing: { role: "person" },
```

Remove `STUDENT_PAYMENT_RESOURCE_STUDENT_CELL_CLASS` from the two `className` usages at lines 579 and 586; replace with:

```typescript
                className="font-medium text-primary hover:underline"
```

and for non-button span:

```typescript
              <span>{name}</span>
```

On the payment method `Select` at line 721, replace `className="w-full min-w-[10rem] text-left"` with:

```typescript
                className="w-full text-left"
                fullWidth
```

Add `sizing: { role: "control" }` to that column definition object (after `enableSorting: false,`).

- [ ] **Step 4: Remove superseded constant**

In `src/lib/finances/student-payments-filter-ui.ts`, delete lines 4-5:

```typescript
export const STUDENT_PAYMENT_RESOURCE_STUDENT_CELL_CLASS =
  "min-w-[12rem] max-w-[18rem] text-left whitespace-normal break-words";
```

Remove the import of `STUDENT_PAYMENT_RESOURCE_STUDENT_CELL_CLASS` from `student-payments-resource-table.tsx` line 56.

- [ ] **Step 5: Run unit tests**

Run:
```bash
npm run test:unit -- src/components/data-table src/app/(internal)/campuses src/app/(internal)/programs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/(internal)/campuses/campus-columns.tsx src/app/(internal)/programs/program-columns.tsx src/components/finances/student-payments-resource-table.tsx src/lib/finances/student-payments-filter-ui.ts
git commit -m "refactor(tables): adopt column sizing contract on representative lists"
```

---

### Task 7: Contract documentation and static gate

**Files:**
- Create: `docs/ui-contracts/table-column-sizing.md`

- [ ] **Step 1: Write contract doc**

Create `docs/ui-contracts/table-column-sizing.md` with this complete content:

````markdown
# Table Column Sizing Contract

`ResourceTable` columns declare semantic sizing through `Column.sizing`. Route
code supplies content intent; the shared table stack owns width, wrapping,
alignment, and overflow behavior.

## Roles

| Role | Minimum | Preferred | Maximum | Wrap | Alignment | Tabular |
| --- | --- | --- | --- | --- | --- | --- |
| `identifier` | `8rem` | `10rem` | `14rem` | truncate | left | no |
| `person` | `12rem` | `14rem` | `18rem` | wrap | left | no |
| `prose` | `14rem` | `20rem` | `28rem` | wrap | left | no |
| `date` | `9rem` | `11rem` | `14rem` | nowrap | left | no |
| `numeric` | `7rem` | `9rem` | `12rem` | nowrap | right | yes |
| `status` | `9rem` | `11rem` | `14rem` | nowrap | left | no |
| `action` | `5rem` | `6rem` | `8rem` | nowrap | center | no |
| `control` | `10rem` | `12rem` | none | nowrap | left | no |

## Declaration

Use a builder role when a shared default fits:

```typescript
column.text<Person>({
  id: "name",
  header: "Name",
  accessor: (row) => row.name,
  sizing: { role: "person" },
});
```

Use an explicit override only when observed content requires it:

```typescript
column.text<Campus>({
  id: "description",
  header: "Description",
  accessor: (row) => row.description,
  sizing: {
    role: "prose",
    width: { min: "16rem", preferred: "22rem", max: "30rem" },
    wrap: "wrap",
  },
});
```

Explicit `width`, `wrap`, `align`, and `tabular` values override role defaults.
Unspecified values continue to come from the role.

## Rendering rules

1. `useTableInstance` resolves semantic metadata once and passes it through
   TanStack column meta.
2. `Table` renders a `<colgroup>` with minimum, preferred, and optional maximum
   widths.
3. The table scroll container must overflow horizontally before any column
   shrinks below its minimum.
4. Numeric columns use right alignment and `tabular-nums`.
5. Person and prose columns may wrap; status, date, action, and control columns
   remain on one line.
6. Editable controls reserve at least `10rem` for the editor and feedback.
7. Table rows retain the DESIGN.md minimum height of `52px`.

## Consumer restrictions

Route cohorts must not add local `min-w-*`, `max-w-*`, wrapping, or alignment
classes to table cells when `Column.sizing` can express the requirement.
Escalate a missing semantic role or shared default to the R3 owner.

Glide remains a separate spreadsheet interaction class. This contract applies
to `Table` and `ResourceTable`; it does not change Glide sizing behavior.
````

- [ ] **Step 2: Add static gate test**

Append to `src/components/data-table/__tests__/column-layout.test.ts`:

```typescript
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

describe("column contract static gate", () => {
  it("data-table column builders set a default sizing role", () => {
    const src = readFileSync(
      resolve(__dirname, "../columns.ts"),
      "utf8",
    );
    expect(src).toMatch(/sizing: opts\.sizing \?\? \{ role:/);
  });
});
```

- [ ] **Step 3: Run gate**

Run:
```bash
npm run test:unit -- src/components/data-table/__tests__/column-layout.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add docs/ui-contracts/table-column-sizing.md src/components/data-table/__tests__/column-layout.test.ts
git commit -m "docs: add table column sizing contract and static gate"
```

---

### Task 8: Browser smoke — table horizontal scroll before crush

**Files:**
- Create: `e2e/smoke/table-column-layout.spec.ts`

- [ ] **Step 1: Create Playwright spec using R0 auth fixture**

```typescript
// e2e/smoke/table-column-layout.spec.ts
import { test, expect } from "../fixtures/auth";

const TABLE_ROUTES = ["/campuses", "/programs"] as const;

for (const route of TABLE_ROUTES) {
  test(`${route} scrolls horizontally before column crushing at 960px`, async ({ page }) => {
    await page.setViewportSize({ width: 960, height: 800 });
    await page.goto(route);
    await page.waitForLoadState("networkidle");

    const tableWrapper = page.locator(".overflow-x-auto").first();
    await expect(tableWrapper).toBeVisible();

    const scrollBeforeCrush = await tableWrapper.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    expect(scrollBeforeCrush.scrollWidth).toBeGreaterThan(scrollBeforeCrush.clientWidth);

    const firstColMinWidth = await page.evaluate(() => {
      const col = document.querySelector("colgroup col");
      if (!col) return null;
      const style = col.getAttribute("style") ?? window.getComputedStyle(col).minWidth;
      const match = String(style).match(/min-width:\s*([^;]+)/i);
      return match ? match[1].trim() : window.getComputedStyle(col).minWidth;
    });
    expect(firstColMinWidth).toBeTruthy();
    expect(firstColMinWidth).not.toBe("0px");
  });
}
```

- [ ] **Step 2: Run browser spec (backend + auth required)**

```bash
export PLAYWRIGHT_TEST_EMAIL=james@schedjuice.com
export PLAYWRIGHT_TEST_PASSWORD=password123
export NEXT_PUBLIC_BASE_API_URL=http://localhost:8000/api/v1
: "${PLAYWRIGHT_PAYMENT_FIXTURE_TEXT:?Set this to unique text from a seeded editable payment row}"
npm run test:browser -- e2e/smoke/table-column-layout.spec.ts
```

Expected: PASS with zero skipped tests; horizontal scroll appears before name/person columns crush below role min widths.

- [ ] **Step 3: Commit**

```bash
git add e2e/smoke/table-column-layout.spec.ts
git commit -m "test(r3): add table column layout browser smoke spec"
```

---

## Verification (full wave)

Run in order:

```bash
cd /Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-fe
npm run lint
npm run typecheck
npm run test:unit
npm run build
npm run test:browser -- e2e/smoke/table-column-layout.spec.ts
```

Expected:
- lint: 0 errors
- typecheck: 0 errors
- test:unit: all pass (including new column-layout and table-layout tests)
- build: succeeds
- browser spec (from R0 harness): table scrolls horizontally before numeric column shrinks below 7rem; person column wraps long names

**If `npm run typecheck` or `npm run test:browser` is missing:** STOP — R0 not complete. Report blocker; do not weaken checks.

The browser command is always `npm run test:browser`. Skipped, excluded, quarantined, or conditionally bypassed browser cases are not accepted; any skip is a blocking failure returned to R0 or the owning plan.

---

## Browser / manual checks

| Route | Role | Viewport | Theme | Check |
| --- | --- | --- | --- | --- |
| `/campuses` | admin | 1280×800 | light | Narrow viewport to 960px; table scrolls horizontally; Description column wraps; Name column does not crush below 12rem |
| `/programs` | admin | 1280×800 | dark | Active/Creation columns stay nowrap; horizontal scroll appears before numeric crushing |
| `/finances/student-payments` | finance admin | 1440×900 | light | Student names wrap; payment account Select fills cell width; no regression in inline save |

Screenshot each route at 960px and 1280px widths; attach to PR.

---

## Stop conditions

1. **Base drift:** `git merge-base HEAD 05ac447b` is not `05ac447b` and any owned file under `src/components/data-table/**` changed on `dev` since plan authorship — stop and request plan refresh.
2. **R0/R1 gate failure:** verification commands fail — stop; do not skip tests.
3. **Behavior change detected:** sort order, save payload, or row visibility differs — stop; layout-only scope violated.
4. **R12 conflict:** another branch modifies `student-payments-resource-table.tsx` beyond the two representative columns — stop and serialize with R12 owner.
5. **Forbidden file touched:** revert immediately and report.

---

## Independent QA handoff prompt

Copy verbatim to a fresh QA subagent (read-only — do not patch):

```
You are independent QA for R3 table column sizing contracts.
Base SHA target: merge commit of branch remediate/ui-r3-tables into dev.

Acceptance criteria:
1. Column<T> supports sizing metadata; column builders default roles.
2. Table renders colgroup min/preferred widths; horizontal scroll occurs before min-width violation.
3. Numeric columns are right-aligned with tabular-nums.
4. Editable text cells reserve min width; save feedback still visible.
5. Representative routes /campuses, /programs, /finances/student-payments show no behavior regression.
6. npm run test:unit, typecheck, lint, build, and e2e/smoke/table-column-layout.spec.ts all pass.

Verify:
- Commands: npm run lint && npm run typecheck && npm run test:unit && npm run build && npm run test:browser -- e2e/smoke/table-column-layout.spec.ts
- Manual: admin @ 960px and 1280px on the three routes above, light + dark on /programs.
- Evidence: screenshots + note whether horizontal scroll precedes column crushing.

Return PASS/FAIL per criterion with DOM/screenshot evidence. Do not modify source. On FAIL, name likely owner plan (R3 vs R12).
```

---

## Self-review (spec §8.6 coverage)

| Spec requirement | Task |
| --- | --- |
| Semantic content role | Task 2 types + Task 1 defaults |
| min/preferred/max width | Task 1 + Task 4 colgroup |
| wrap/truncation policy | Task 1 wrapClass + Task 4 cells |
| alignment | Task 1 align + Task 3 meta |
| editable control type sizing | Task 5 + control role |
| overflow before crushing | Task 4 table minWidth + wrapper overflow-x-auto |
| representative migrations | Task 6 |
| browser horizontal scroll smoke | Task 8 |
| no behavior changes | Stop condition 3 |

**Placeholder scan:** none.
