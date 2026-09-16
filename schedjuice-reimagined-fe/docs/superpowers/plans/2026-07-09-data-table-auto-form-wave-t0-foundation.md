# Wave T0 — Data Table + Edit-Kit + SDK Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the foundation for Program 1: `src/components/data-table/`, `src/components/edit-kit/`, a minimal `src/sdk/` search-list bootstrap, and one pilot list page (`/campuses`) on `ResourceTable` — with no long-lived legacy shim.

**Architecture:** Render-only `<Table />` + opinionated `<ResourceTable />` consuming a typed SDK list-hook and controlled table state. Edit-kit wraps existing autosave/`FormSaveTick` for opt-in editable cells. Visuals use primitives + DESIGN.md tokens/motion.

**Tech Stack:** React 19, Next.js App Router, `@tanstack/react-table`, TanStack Query, Zod (types only as needed), `motion/react`, Iconoir, Base UI primitives, Vitest.

**Spec:** [`../specs/2026-07-09-data-table-auto-form-program-design.md`](../specs/2026-07-09-data-table-auto-form-program-design.md)  
**Playbook:** [`2026-07-09-data-table-auto-form-playbook.md`](2026-07-09-data-table-auto-form-playbook.md)  
**SDK brief (target shape):** [`../specs/2026-05-17-schedjuice-v2-api-sdk-brief.md`](../specs/2026-05-17-schedjuice-v2-api-sdk-brief.md)  
**Table brief:** [`../specs/2026-05-17-schedjuice-v2-data-table-brief.md`](../specs/2026-05-17-schedjuice-v2-data-table-brief.md)

**Branch:** `migrate/ui-t0-foundation` from latest `dev`  
**Worktree (suggested):** `.worktrees/migrate-ui-t0-foundation`

---

## File structure (create)

```
src/components/data-table/
  index.ts
  types.ts
  columns.ts
  use-table-instance.ts
  use-resource-table-state.ts
  table.tsx
  resource-table.tsx
  parts/
    toolbar.tsx
    search-input.tsx
    sortable-header.tsx
    pagination.tsx
    empty-state.tsx
    loading-state.tsx
    error-state.tsx
  __tests__/
    columns.test.ts
    use-resource-table-state.test.ts

src/components/edit-kit/
  index.ts
  form-save-tick.ts          # re-export FormSaveTick
  use-cell-autosave.ts       # thin adapter for cell blur → optimistic save
  __tests__/
    use-cell-autosave.test.ts

src/sdk/
  core/
    envelope.ts              # unwrap { data: { data, ... } } → typed payload
    search-params.ts         # port makeSearchParams / base64 sorts (from client-api/utils)
    http.ts                  # thin axiosClient wrapper used ONLY inside sdk/
  keys/
    index.ts
    campuses.ts
  resources/
    campuses.ts              # search/list imperative fn
  hooks/
    campuses.ts              # useCampusesList
  index.ts

src/app/(design)/components/mockups/resource-table/page.tsx   # optional showcase
```

**Modify:**
- `src/app/(internal)/campuses/page.tsx` — pilot cutover to `ResourceTable` + `useCampusesList`

**Do not delete in T0:** legacy `ui/data-table*` (still used by other pages).

---

### Task 1: Worktree + failing column type test

**Files:**
- Create: `src/components/data-table/__tests__/columns.test.ts`
- Create: `src/components/data-table/types.ts` (minimal stubs only after fail)
- Create: `src/components/data-table/columns.ts`

- [ ] **Step 1: Create worktree**

```bash
cd /path/to/schedjuice-reimagined-fe
git fetch origin
git worktree add .worktrees/migrate-ui-t0-foundation -b migrate/ui-t0-foundation origin/dev
cd .worktrees/migrate-ui-t0-foundation
```

- [ ] **Step 2: Write failing test for `column.text`**

```ts
// src/components/data-table/__tests__/columns.test.ts
import { describe, expect, it } from "vitest";
import { column } from "../columns";

type Row = { id: number; name: string };

describe("column.text", () => {
  it("builds a typed text column with id and accessor", () => {
    const col = column.text<Row>({
      id: "name",
      header: "Name",
      accessor: (row) => row.name,
    });
    expect(col.id).toBe("name");
    expect(col.header).toBe("Name");
    expect(col.accessor({ id: 1, name: "Main" })).toBe("Main");
  });
});
```

- [ ] **Step 3: Run test — expect FAIL**

```bash
npm run test:unit -- src/components/data-table/__tests__/columns.test.ts
```

Expected: FAIL (module not found / `column` undefined).

- [ ] **Step 4: Implement minimal `types.ts` + `columns.ts`**

```ts
// src/components/data-table/types.ts
import type { ReactNode } from "react";

export type ColumnAlign = "left" | "right" | "center";

export type Column<T> = {
  id: string;
  header: ReactNode;
  accessor: (row: T) => unknown;
  align?: ColumnAlign;
  enableSorting?: boolean;
  cell?: (ctx: { row: T; value: unknown }) => ReactNode;
  /** Opt-in editable — only set by column.editable* builders */
  editable?: {
    kind: "text" | "select" | "switch" | "date";
    options?: { label: string; value: string }[];
    onSave: (row: T, value: unknown) => Promise<void>;
  };
};

export type ResourceTableState = {
  page: number;
  pageSize: number;
  sorts: string[];
  q: string;
  filters: Record<string, unknown>;
};

export type ResourceListResult<T> = {
  rows: T[];
  total: number;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
};
```

```ts
// src/components/data-table/columns.ts
import type { Column } from "./types";

export const column = {
  text<T>(opts: {
    id: string;
    header: Column<T>["header"];
    accessor: (row: T) => string | null | undefined;
    enableSorting?: boolean;
  }): Column<T> {
    return {
      id: opts.id,
      header: opts.header,
      accessor: opts.accessor,
      enableSorting: opts.enableSorting ?? true,
      cell: ({ value }) => (value == null || value === "" ? "—" : String(value)),
    };
  },
  date<T>(opts: {
    id: string;
    header: Column<T>["header"];
    accessor: (row: T) => string | Date | null | undefined;
  }): Column<T> {
    return {
      id: opts.id,
      header: opts.header,
      accessor: opts.accessor,
      enableSorting: true,
      cell: ({ value }) => {
        if (value == null || value === "") return "—";
        const d = value instanceof Date ? value : new Date(String(value));
        return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
      },
    };
  },
  editableText<T>(opts: {
    id: string;
    header: Column<T>["header"];
    accessor: (row: T) => string | null | undefined;
    onSave: (row: T, value: string) => Promise<void>;
  }): Column<T> {
    return {
      id: opts.id,
      header: opts.header,
      accessor: opts.accessor,
      editable: {
        kind: "text",
        onSave: (row, value) => opts.onSave(row, String(value ?? "")),
      },
    };
  },
};
```

- [ ] **Step 5: Re-run test — expect PASS**

```bash
npm run test:unit -- src/components/data-table/__tests__/columns.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/components/data-table
git commit -m "$(cat <<'EOF'
Add data-table column builders and types.

EOF
)"
```

---

### Task 2: `useResourceTableState` (controlled, namespaced)

**Files:**
- Create: `src/components/data-table/use-resource-table-state.ts`
- Create: `src/components/data-table/__tests__/use-resource-table-state.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useResourceTableState } from "../use-resource-table-state";

describe("useResourceTableState", () => {
  it("updates page and q without colliding namespaces", () => {
    const { result } = renderHook(() =>
      useResourceTableState({ namespace: "campuses", syncUrl: false }),
    );
    act(() => result.current.setState({ page: 2, q: "main" }));
    expect(result.current.page).toBe(2);
    expect(result.current.q).toBe("main");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**, then implement local-state version first (`syncUrl: false`). URL sync via `nuqs` can follow in the same task if tests for URL are added — keep keys namespaced (`${namespace}_page`, etc.) so two tables never collide.

Minimal implementation sketch:

```ts
"use client";
import { useCallback, useState } from "react";
import type { ResourceTableState } from "./types";

const defaults: ResourceTableState = {
  page: 1,
  pageSize: 20,
  sorts: [],
  q: "",
  filters: {},
};

export function useResourceTableState(opts: {
  namespace: string;
  syncUrl?: boolean;
  initial?: Partial<ResourceTableState>;
}) {
  const [state, setFull] = useState<ResourceTableState>({
    ...defaults,
    ...opts.initial,
  });
  const setState = useCallback((patch: Partial<ResourceTableState>) => {
    setFull((s) => ({ ...s, ...patch }));
  }, []);
  return { ...state, setState, namespace: opts.namespace };
}
```

If `@testing-library/react` is unavailable in vitest setup, test a pure `createResourceTableState` reducer instead — do not block T0 on RTL; prefer a pure helper + thin hook.

- [ ] **Step 3: Commit**

```bash
git add src/components/data-table
git commit -m "$(cat <<'EOF'
Add controlled resource table state hook.

EOF
)"
```

---

### Task 3: Render-only `<Table />` + parts

**Files:**
- Create: `src/components/data-table/use-table-instance.ts`
- Create: `src/components/data-table/table.tsx`
- Create: `src/components/data-table/parts/*.tsx` (toolbar, search, sortable-header, pagination, empty/loading/error)

- [ ] **Step 1: Implement `<Table />`** using `@tanstack/react-table` internally. Consumers pass `Column<T>[]` + `rows` + sort/page state — **never** import TanStack types from pages.

- [ ] **Step 2: Style with tokens** — `border-border-subtle`, `bg-surface`, `text-text-primary`, row min-height ~52px, no Lucide (Iconoir for sort icons).

- [ ] **Step 3: Loading/empty/error** — reserved min-height; `crossfade` optional; empty via `@/components/primitives/empty` if available.

- [ ] **Step 4: Commit**

```bash
git add src/components/data-table
git commit -m "$(cat <<'EOF'
Add render-only Table and list chrome parts.

EOF
)"
```

---

### Task 4: Edit-kit cell autosave

**Files:**
- Create: `src/components/edit-kit/index.ts`
- Create: `src/components/edit-kit/form-save-tick.ts`
- Create: `src/components/edit-kit/use-cell-autosave.ts`
- Create: `src/components/edit-kit/__tests__/use-cell-autosave.test.ts`

- [ ] **Step 1: Re-export `FormSaveTick`** from `@/components/product-docs/form-save-tick`.

- [ ] **Step 2: Implement `useCellAutosave`** — on commit: optimistic local value, call `onSave`, show tick ~1.2s in reserved space, rollback + error state on failure. Prefer composing patterns from `src/hooks/use-autosave-form.ts` / `src/lib/autosave/autosave-core.ts` rather than forking.

- [ ] **Step 3: Unit test** success + failure rollback with a mock `onSave`.

- [ ] **Step 4: Commit**

```bash
git add src/components/edit-kit
git commit -m "$(cat <<'EOF'
Add edit-kit cell autosave and FormSaveTick re-export.

EOF
)"
```

---

### Task 5: `<ResourceTable />` + editable cell wiring

**Files:**
- Create: `src/components/data-table/resource-table.tsx`
- Create: `src/components/data-table/index.ts`

- [ ] **Step 1: Implement `ResourceTable`** props:

```ts
type ResourceTableProps<T> = {
  list: ResourceListResult<T>;
  columns: Column<T>[];
  tableState: ResourceTableState & { setState: (p: Partial<ResourceTableState>) => void };
  getRowId: (row: T) => string;
  rowHref?: (row: T) => string;
  filterSlot?: React.ReactNode;
};
```

Compose: Toolbar (search) + filterSlot + Table + Pagination. Map `list.isLoading` → loading part; `list.isError` → error part with retry; empty when `!isLoading && rows.length === 0`.

- [ ] **Step 2: When `column.editable` is set**, render edit-kit control in cell (text input on focus/blur). Never for high-risk domains in T0 demos.

- [ ] **Step 3: Export public API from `index.ts`:** `Table`, `ResourceTable`, `useResourceTableState`, `column`, types.

- [ ] **Step 4: Commit**

```bash
git add src/components/data-table
git commit -m "$(cat <<'EOF'
Add ResourceTable composing list hook state and edit-kit cells.

EOF
)"
```

---

### Task 6: Minimal SDK — campuses list hook

**Files:**
- Create: `src/sdk/core/envelope.ts`, `search-params.ts`, `http.ts`
- Create: `src/sdk/keys/campuses.ts`, `src/sdk/keys/index.ts`
- Create: `src/sdk/resources/campuses.ts`
- Create: `src/sdk/hooks/campuses.ts`
- Create: `src/sdk/index.ts`
- Test: `src/sdk/__tests__/envelope.test.ts`

- [ ] **Step 1: Envelope unwrap test**

```ts
import { describe, expect, it } from "vitest";
import { unwrapList } from "../core/envelope";

describe("unwrapList", () => {
  it("reads rows and total from schedjuice envelope", () => {
    const result = unwrapList<{ id: number }>({
      data: { data: [{ id: 1 }], total: 1 },
    });
    expect(result.rows).toEqual([{ id: 1 }]);
    expect(result.total).toBe(1);
  });
});
```

Inspect a real `searchEntities` response in an existing hook/page if the envelope shape differs — match production, cite in a comment.

- [ ] **Step 2: Implement `resources/campuses.ts`** calling `search` via sdk `http` (may wrap `axiosClient` + ported `makeSearchParams`). Path: `campuses/search`.

- [ ] **Step 3: Implement `useCampusesList`** returning `ResourceListResult<Campus>` compatible with ResourceTable. Query key from `queryKeys.campuses.list(args)`.

- [ ] **Step 4: Hand-type a minimal `Campus` in `src/sdk/_types/campuses.ts` citing the Django serializer path if known (`app_org` / campus model — confirm in BE).

- [ ] **Step 5: Commit**

```bash
git add src/sdk
git commit -m "$(cat <<'EOF'
Bootstrap SDK campuses list hook for ResourceTable.

EOF
)"
```

---

### Task 7: Pilot — migrate `/campuses` list

**Files:**
- Modify: `src/app/(internal)/campuses/page.tsx`
- Create: `src/app/(internal)/campuses/campus-columns.tsx` (or colocated columns)

- [ ] **Step 1: Port columns** from artifact defaults for campuses (name + key fields only — YAGNI).

- [ ] **Step 2: Replace `DataTable` with `ResourceTable` + `useCampusesList` + `useResourceTableState({ namespace: "campuses", syncUrl: true })` once URL sync exists; otherwise local state is OK for T0 and T1 upgrades URL.

- [ ] **Step 3: Keep page chrome** (`PageContainer`, `TypographyH1`, Create link) unchanged.

- [ ] **Step 4: Grep gate**

```bash
rg -n "ui/data-table|lucide-react" src/app/\(internal\)/campuses/page.tsx src/components/data-table src/components/edit-kit src/sdk
```

Expected: no Lucide; no `ui/data-table` on campuses page; sdk/data-table clean.

- [ ] **Step 5: Manual smoke** — `/campuses` light + dark: search, paginate, open detail link.

- [ ] **Step 6: Commit**

```bash
git add src/app/(internal)/campuses src/components/data-table src/sdk
git commit -m "$(cat <<'EOF'
Pilot ResourceTable on campuses list with SDK hook.

EOF
)"
```

---

### Task 8: PR + review brief

- [ ] **Step 1: Push and open PR to `dev`**

Title: `migrate(ui): T0 data-table, edit-kit, SDK campuses pilot`

Body must include: playbook checklist, smoke notes, “legacy data-table retained for other pages”.

- [ ] **Step 2: Review agent** uses playbook review checklist; fail on shims, Lucide, `ui/*` inside new packages, or `searchEntities` imported from the campuses page.

---

## Review brief (paste to review sub-agent)

```
Review PR for Wave T0 against:
- docs/superpowers/specs/2026-07-09-data-table-auto-form-program-design.md
- docs/superpowers/plans/2026-07-09-data-table-auto-form-playbook.md
- docs/superpowers/plans/2026-07-09-data-table-auto-form-wave-t0-foundation.md

Pass only if: data-table + edit-kit + sdk campuses exist; campuses page uses ResourceTable + useCampusesList; no dual-API DataTable shim; no Lucide/ui imports in new packages; unit tests for columns + envelope (and cell autosave) pass.
```
