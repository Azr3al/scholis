# Schedjuice v2 — Data Table Brief

> **Audience:** the AI agent building the new Schedjuice v2 data-table system.
> **Mode:** primitive-first. No application list pages built on top of this system until the foundation defined here is in place and reviewed.
> **Greenfield rule:** this table ships into a clean FE repo. No legacy `src/components/ui/data-table.tsx`, `data-table-pagination.tsx`, `data-table-search.tsx`, `data-table-view-options.tsx`, or `data-card.tsx` files exist; you are building from scratch. The patterns documented in §2 (Anti-positioning) describe the problems of the predecessor — they are constraints to design against, not code to migrate. You do not have read access to the legacy FE repo; everything you need is in this brief, the Design Brief (`2026-05-16-schedjuice-v2-design-brief.md`), and the SDK Brief (`2026-05-17-schedjuice-v2-api-sdk-brief.md`).

---

## 1. What you're building

A two-layer table system that renders every list-style surface in Schedjuice: courses, students, staff, invoices, payments, attendance, attempts, certificates, audits, and ~30 more. **One opinionated wrapper for the 80% case; one render-only primitive underneath.** Modules with advanced requirements (finance column reordering, admin reports with multi-sort) compose on top of the primitive directly.

The two layers:

1. **`<Table />`** — low-level render primitive. Built on `@tanstack/react-table`, but wrapped so consumers never import TanStack types. Pure render: takes columns + rows + table state, emits markup. No data fetching, no URL state, no toolbar, no pagination. Used directly by the rare module that needs full control.
2. **`<ResourceTable />`** — opinionated wrapper. Takes an SDK list-hook (`useCoursesList`, `useInvoicesList`, …), a typed `query`, a `columns` config, a `tableState` object, and renders the full list-page experience: toolbar with wildcard search and (optional) filter chips, sortable headers, paginated rows, empty/loading/error states. This is what 80% of list pages use.

There is also a companion `<ResourceCardList />` for surfaces where cards read better than rows (showcased course cards, kid-facing dashboards). It shares the same `listHook + query + tableState` contract — see §13.

You are not building application pages in this phase. But every API decision must survive contact with: an invoice table with 8 filter chips, a 500-row quiz-attempts table, a course list embedded inside a dialog, and a finance reconciliation table where the user reorders columns daily.

---

## 2. Anti-positioning — why this redesign exists

The predecessor `DataTable` (in the legacy repo you do not have access to) had six structural problems documented during a teardown. This brief is designed against each of them — they are constraints, not code you need to inspect:

1. **One 825-line component did everything.** Data fetching, URL state, search UI, pagination UI, view-mode toggle, CSV export, column visibility, selection, fullscreen, action column, card-view alternative — all in a single file with ~40 props. Adding a feature meant editing the do-everything component; every consumer paid the cost of every feature.
2. **Tightly coupled to a private fetch helper.** The table itself called `searchEntities(entity, query, filterParams)` and `makePostRequest(url, body, query)` internally. Consumers passed `entity="courses"` as a string and the table did the rest — no way to swap data sources, no way to use the table with an already-fetched list, no way to use it in an RSC.
3. **A per-field search sidebar nobody used.** Every column generated a search input in a collapsible sidebar. Maintained for years; the analytics never showed meaningful usage. Most users want one search box.
4. **Features that should have been per-table were global.** Selection, card-view toggle, CSV export, fullscreen, column visibility toggle — all on by default for every table, all controlled by boolean props. The default surface area was huge; the actual usage was concentrated in ~3 modules.
5. **Untyped column definitions.** `customColumnDef` extended TanStack's `ColumnDef` with `dataType`, `isSearchDisabled`, `isDefaultVisible`, `accessorKey` as a magic string — but the types leaked `any` through the whole stack. `// @ts-ignore` appeared throughout the component.
6. **URL state was inside the component, not the page.** `useQueryState("sort", …)`, `useQueryState("page", …)`, `useQueryState("search", …)` were hardcoded inside `DataTable`. Two tables on the same page collided on query keys; tables inside dialogs polluted the URL.

The new system eliminates each by construction. If a feature in this spec doesn't visibly kill at least one of the six, it doesn't belong in the foundation.

---

## 3. Architectural principles

These principles are not negotiable. Every design decision in §§4–13 follows from them.

1. **Two layers, hard boundary.** `<Table />` is render-only and state-agnostic. `<ResourceTable />` composes `<Table />` with SDK + toolbar + pagination. Nothing in `<Table />` knows about the SDK; nothing in `<ResourceTable />` reaches into TanStack internals.
2. **Controlled state is the default.** `<ResourceTable />` takes `{ tableState, onTableStateChange }` (bundled as one prop pair via the `useResourceTableState` hook). URL persistence is a hook concern, not a component concern. Local state and URL state are swapped by swapping the hook.
3. **The SDK is the data layer.** `<ResourceTable />` accepts a list-hook from `src/sdk/hooks/*` and a typed `query`. It does not fetch by itself, does not import axios, does not know about envelopes. The hook handles fetching, dehydration, abort plumbing, retries, error mapping.
4. **Features are opt-in, not opt-out.** Selection, CSV export, fullscreen, column visibility, card view — none exist as built-in toggleable props on `<ResourceTable />`. Tables that need them either compose at the page level (selection, export) or use a different primitive (cards). The default `<ResourceTable />` has zero props for features 80% of tables don't use.
5. **Typed columns. No `any`.** A single `Column<T>` type with full generic inference from the row type. No `accessorKey` strings that the compiler can't check. No `// @ts-ignore`. Maps to TanStack's `ColumnDef<T>` internally; consumers never import from `@tanstack/react-table`.
6. **Advanced lives elsewhere.** Column reordering, multi-sort, row virtualization, drag-resize — these are an `<AdvancedResourceTable />` extension (§12), not flags on the base. Modules opt in by importing a different component, not by setting `enableReordering={true}` on every table.
7. **Paper-like, not SaaS-like.** Every visual decision routes through the Design Brief (`2026-05-16-schedjuice-v2-design-brief.md`). Specifically: no shadcn, no Radix, no hard 1px borders where rough.js can carry meaning, no card-stacking, no icon-decoration on headers, small-caps Latin-only headers, 52px+ row height, paper-tone zebra striping, handwriting accent for empty/loading text.

---

## 4. File layout

```
src/components/data-table/
  table.tsx                  # <Table /> — render primitive (TanStack-backed, no state)
  resource-table.tsx         # <ResourceTable /> — opinionated wrapper (hook + query + columns + state)
  use-resource-table-state.ts# state hook (URL or local), namespaced
  use-table-instance.ts      # internal: builds the TanStack table from columns + state + data
  columns.ts                 # Column<T> public type + column-builder helpers (column.text, column.date, column.number, …)
  parts/
    toolbar.tsx              # <ResourceTable.Toolbar /> — search + filter chips + custom slot
    search-input.tsx         # wildcard search input
    filter-chips.tsx         # consumer-provided filter chip strip
    sortable-header.tsx      # header with click-to-sort + RoughUnderline
    pagination.tsx           # paper-styled numeric pagination
    empty-state.tsx          # handwriting "Nothing here yet." default; override slot
    loading-state.tsx        # handwriting "Loading…"
    error-state.tsx          # ApiError-aware ("Couldn't load. Try again.")
    row.tsx                  # <TableRow /> — zebra-aware, no hover-scale
    cell.tsx                 # <TableCell /> — alignment, padding, tabular-num opt-in
  advanced/
    advanced-resource-table.tsx# <AdvancedResourceTable /> — column reordering, multi-sort
    use-column-reordering.ts # extension hook (drag handles, persistence)
    use-multi-sort.ts        # multi-column sort state + UI
  card-list/
    resource-card-list.tsx   # <ResourceCardList /> — companion primitive
    card-grid.tsx            # responsive card grid
  index.ts                   # public exports: Table, ResourceTable, useResourceTableState, Column, column.*
```

The folder layout is **shallow on purpose**. Foundation ships everything in this tree. Advanced lives in `advanced/`; card list lives in `card-list/`. The agent does not create per-feature subdirectories.

---

## 5. The two layers

### 5.1 `<Table />` — render primitive

A pure render component. Takes columns, rows, and table state. Emits markup. No fetching, no URL state, no toolbar. Used directly only when a consumer needs full control (e.g., a custom dashboard widget).

```tsx
import { Table, type Column } from "@/components/data-table";

const columns: Column<Course>[] = [
  column.text({ id: "title", header: "Title", accessor: (c) => c.title }),
  column.text({ id: "category", header: "Category", accessor: (c) => c.category?.name ?? "—" }),
  column.date({ id: "start_date", header: "Start date", accessor: (c) => c.start_date }),
];

<Table
  columns={columns}
  rows={courses}
  state={{ sorting: [{ id: "start_date", desc: true }] }}
  onStateChange={setState}
/>;
```

Props:

```ts
type TableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  state?: TableState;                    // sorting; pinning is column-config-only at this layer
  onStateChange?: (state: TableState) => void;
  getRowId?: (row: T, index: number) => string;
  /** Empty/loading/error are render slots — consumer decides what shows.
   *  ResourceTable wires default paper-styled versions. */
  empty?: React.ReactNode;
  loading?: React.ReactNode;
  error?: React.ReactNode;
  /** Renders an opt-in trailing actions column. Receives the row, returns a node (typically a Menu). */
  rowActions?: (row: T) => React.ReactNode;
};

type TableState = {
  sorting: { id: string; desc: boolean }[];
};
```

Behavior:

- Renders nothing in the body when `loading`, `error`, or `empty` is non-null (those slots take over the body area, see §10).
- No data fetching, no URL state, no toolbar, no pagination. Consumer wires those at a layer above.
- Internally builds a `useReactTable` instance and renders it. The TanStack instance is not exposed.
- Honors `column.pinned` from the column config (config-only pinning; no runtime drag-to-pin).

### 5.2 `<ResourceTable />` — opinionated wrapper

The 80% case. Takes an SDK list-hook + query + columns + state, renders the full list-page experience.

```tsx
import { ResourceTable, useResourceTableState, column } from "@/components/data-table";
import { useCoursesList } from "@/sdk/hooks/courses";
import { courseFilters } from "@/sdk/resources/courses";

export default function CoursesListPage() {
  const tableState = useResourceTableState({ namespace: "courses" });

  return (
    <ResourceTable
      listHook={useCoursesList}
      query={{
        where: courseFilters.forUser(currentUser),
        expand: ["category", "subject"],
      }}
      columns={courseColumns}
      tableState={tableState}
      toolbar={{
        wildcardSearch: { fields: ["title", "code"], placeholder: "Search courses" },
        filterChips: [
          { id: "active", label: "Active only", apply: (w) => ({ ...w, is_active: true }) },
          { id: "this-term", label: "This term", apply: (w) => ({ ...w, start_date: { gte: termStart } }) },
        ],
      }}
      rowActions={(course) => <CourseRowMenu courseId={course.id} />}
    />
  );
}
```

Props:

```ts
type ResourceTableProps<T> = {
  /** The SDK list-hook for this resource. Must be a tanstack-query hook that returns
   *  { data, isLoading, isFetching, error, refetch } where data is ListResult<T>. */
  listHook: (query: ListQuery<T>) => UseListResult<T>;

  /** Typed query passed to the list-hook. Merged with sort/pagination from tableState. */
  query: Omit<ListQuery<T>, "page" | "size" | "sort">;

  columns: Column<T>[];

  /** From useResourceTableState(). Owns sort/pagination/search/filter-chip state. */
  tableState: ResourceTableState<T>;

  /** Toolbar content. Pass {} to render an empty toolbar (still reserves vertical rhythm).
   *  Omit entirely to render no toolbar. */
  toolbar?: ToolbarConfig<T>;

  /** Opt-in trailing actions column. Renders a small <Menu /> or a single <Button />. */
  rowActions?: (row: T) => React.ReactNode;

  /** Page size for pagination. Default 20. */
  pageSize?: number;

  /** Override the default empty / loading / error states. */
  emptyState?: React.ReactNode;
  loadingState?: React.ReactNode;
  errorState?: (err: ApiError) => React.ReactNode;

  /** Imperative escape hatch for the rare case (selection, etc.). Receives a small typed api:
   *  { getRows: () => T[], refetch: () => Promise<unknown> }. NOT the TanStack table instance —
   *  that stays internal. If you find yourself reaching for more than these two methods, the
   *  feature probably belongs in a page-level wrapper, not inside ResourceTable. */
  onReady?: (api: ResourceTableApi<T>) => void;
};

type ResourceTableApi<T> = {
  getRows: () => T[];
  refetch: () => Promise<unknown>;
};

type UseListResult<T> = {
  data: ListResult<T> | undefined;
  isLoading: boolean;
  isFetching: boolean;
  error: ApiError | null;
  refetch: () => Promise<unknown>;
};
```

`ResourceTable` is **controlled**. It does not own URL state. It does not own search/sort/pagination state. All state lives in `tableState`; the component reads + writes through it. This is what makes it composable with the SDK's RSC dehydration pattern.

---

## 6. `useResourceTableState`

The state hook. Returns the controlled state object pages pass to `ResourceTable`. Hides whether state is URL-backed or local.

```ts
type UseResourceTableStateOptions = {
  /** Required if persist === "url". Prefixes all URL keys (e.g. ?courses.sort=...). */
  namespace?: string;
  /** Where state lives. Default "url". */
  persist?: "url" | "local";
  /** Initial sort. */
  defaultSort?: { id: string; desc: boolean }[];
  /** Initial wildcard search. */
  defaultSearch?: string;
  /** Initial active filter chip ids. */
  defaultFilters?: string[];
};

export function useResourceTableState<T>(
  options: UseResourceTableStateOptions = {},
): ResourceTableState<T>;

type ResourceTableState<T> = {
  sort: { id: string; desc: boolean }[];
  page: number;          // 1-indexed
  search: string;
  activeFilters: string[];

  setSort: (s: { id: string; desc: boolean }[]) => void;
  setPage: (p: number) => void;
  setSearch: (s: string) => void;
  toggleFilter: (id: string) => void;

  /** Resets sort + page + search + filters to defaults. Used by "Clear filters" empty-state action. */
  reset: () => void;
};
```

Defaults:

- `persist: "url"` is the default. Pages opting into local state pass `persist: "local"` explicitly.
- URL state uses `nuqs`. Keys are `${namespace}.sort`, `${namespace}.page`, `${namespace}.q`, `${namespace}.filters`. Two tables on one page MUST have different namespaces; the hook throws in dev if two `useResourceTableState({ namespace: "courses" })` calls mount in the same tree.
- `defaultSort`, `defaultSearch`, `defaultFilters` are NOT re-applied on URL change — they only seed the initial state.

Internally, `ResourceTable` reads `tableState.sort` + `tableState.page` + `tableState.search` + `tableState.activeFilters`, merges them into the `query` passed to `listHook`, and forwards `setSort` / `setPage` to the appropriate child components (sortable header, pagination). The component is a pure consumer of the state object.

---

## 7. Column definitions

A single `Column<T>` type with generic inference from the row. Column-builder helpers provide the common cell shapes (text, number, date, status, custom). Consumers never import from `@tanstack/react-table`.

```ts
type Column<T> = {
  /** Stable id. Used as the sort key and URL key. */
  id: string;

  /** Header text. Latin-only — see Design Brief §7 on Burmese + small-caps interaction.
   *  Use sentence-case English in the header; small-caps transform is applied by the cell layer. */
  header: string;

  /** Accessor. Receives the typed row, returns the value to display.
   *  For non-display purposes (sorting, exports), see `sortValue`. */
  accessor: (row: T) => React.ReactNode;

  /** Optional separate sort value. If omitted, sorting uses `accessor` output (string-compared). */
  sortValue?: (row: T) => string | number | Date;

  /** Is this column sortable? Default true. */
  sortable?: boolean;

  /** Column pinning. Config-only at the base layer. */
  pinned?: "left" | "right";

  /** Mobile-viewport behavior. See §11.4 on horizontal scroll. */
  mobile?: "show" | "hide";  // default "show"

  /** Render-time width hint. Default auto. Use sparingly. */
  width?: number | string;

  /** Cell-level styling overrides. */
  align?: "left" | "right" | "center";
  tabularNum?: boolean;  // forces Plex Mono tabular numbers; default false (true on number / date / currency columns built via the helpers)
};
```

### 7.1 Column-builder helpers

The 80% of cells are text, numbers, dates, status pills, and links. Helpers produce typed `Column<T>` objects with the right cell shape applied.

```ts
import { column } from "@/components/data-table";

const courseColumns: Column<Course>[] = [
  column.text({
    id: "title",
    header: "Title",
    accessor: (c) => c.title,
  }),
  column.text({
    id: "category",
    header: "Category",
    accessor: (c) => c.category?.name ?? "—",
  }),
  column.date({
    id: "start_date",
    header: "Start date",
    accessor: (c) => c.start_date,
  }),
  column.number({
    id: "student_count",
    header: "Students",
    accessor: (c) => c.student_count,
    align: "right",
  }),
  column.status({
    id: "status",
    header: "Status",
    accessor: (c) => c.is_active ? "active" : "archived",
    palette: { active: "data-green", archived: "circuit-board" },
  }),
  column.custom({
    id: "main_teacher",
    header: "Main teacher",
    accessor: (c) => c.main_teachers?.[0] ?? null,
    cell: (teacher) => teacher ? <TeacherPill teacher={teacher} /> : <span>—</span>,
  }),
];
```

Helpers cover: `column.text`, `column.number`, `column.date`, `column.status`, `column.currency` (Plex Mono + currency formatting), `column.custom` (escape hatch — caller writes the cell render). Each helper sets sensible `tabularNum` / `align` defaults.

### 7.2 Internal mapping to TanStack

`use-table-instance.ts` maps `Column<T>[]` → `ColumnDef<T>[]` and feeds them to `useReactTable`. This is the **only** file that imports from `@tanstack/react-table`. The mapping is one-way; consumers do not pass TanStack column defs through.

---

## 8. Toolbar composition

The toolbar is opt-in via the `toolbar` prop on `<ResourceTable />`. Omit it → no toolbar. Pass `{}` → empty toolbar that still reserves vertical rhythm (useful for consistency across views).

```ts
type ToolbarConfig<T> = {
  /** Wildcard search across one or more fields. Renders as a single input on the toolbar's left. */
  wildcardSearch?: {
    fields: (keyof T & string)[];
    placeholder?: string;
    /** Debounce in ms. Default 250. */
    debounceMs?: number;
  };

  /** Filter chips. Each chip is a toggle that applies/removes a where-clause modifier
   *  on the current query. Consumer defines them per-table. There is no per-field
   *  auto-generated filter sidebar. */
  filterChips?: FilterChip<T>[];

  /** A custom slot for page-specific actions ("Export CSV", "New course"). Rendered
   *  on the toolbar's right. Consumer is responsible for content and layout. */
  customSlot?: React.ReactNode;
};

type FilterChip<T> = {
  id: string;
  label: string;
  /** When the chip is active, this transforms the where-clause before the listHook is called. */
  apply: (where: WhereClause<T>) => WhereClause<T>;
};
```

Visual rules (per Design Brief §9, §11):

- Wildcard search uses the `Input` primitive (Base UI, foundation phase). No icon decoration inside the input.
- Filter chips use the `Toggle` shape (small, text-led, no icons). Active chips show a Terracotta-tinted background; inactive are bare. **No more than 5 chips on a single table** — beyond that, the page needs page-level filter UI, not a chip strip.
- The custom slot accepts arbitrary nodes. Common content: a single `<Button>New course</Button>`, an "Export CSV" button wired to `sdk.courses.exportCsv?.()`, etc. Do not add cleverness here.
- A "search-and-filter is active" pill appears between toolbar and table when `tableState.search || tableState.activeFilters.length > 0`, with a small "Clear" link that calls `tableState.reset()`.

---

## 9. Pagination — paper-styled

Classic numeric pagination, redesigned to feel like a paper margin annotation rather than a SaaS pagination component.

Visual rules:

- Sits below the table. Separated from the table body by a `<RoughDivider />` (one wobble, seed-cached).
- Renders: `[Prev]  1  2  3  …  12  [Next]`. Current page is rendered in Fraunces (serif) at `--text-lg`, with a `<RoughUnderline />` beneath it (single wobble). Non-current pages are in sans at `--text-base`, hover applies a quiet background tint.
- All numbers in `IBM Plex Mono` tabular-num.
- A right-aligned "Showing 1–20 of 247" label. The numbers in this label are also Plex Mono tabular-num. The label uses `--text-sm` and `--text-muted`.
- Page-size selector is **NOT** in the pagination. Default `pageSize=20` is configured at the `<ResourceTable pageSize={...} />` level; consumers who need a different size set it once at the page. Runtime page-size toggling is a banned default (re-fetches confuse users; rarely needed).
- "Prev" / "Next" are text-led. Disabled state uses `--text-muted` and `cursor: not-allowed`.
- When there's only one page, the pagination renders only the "Showing X of Y" label (no buttons, no numbers).

The `<Pagination />` component receives `{ page, totalPages, totalCount, pageSize, onPageChange }` and is reused by `<ResourceTable />` and `<ResourceCardList />`. It is exported, so a module that builds its own list surface on the bare `<Table />` can also use it.

---

## 10. Empty / loading / error states

All three are slot props on `<ResourceTable />`. The defaults are paper-styled:

### 10.1 Empty (default)

```tsx
<div className="py-16 text-center">
  <p className="font-hand text-2xl text-text-secondary">Nothing here yet.</p>
  {hasActiveFiltersOrSearch && (
    <button onClick={tableState.reset} className="mt-3 text-sm underline">
      Clear filters
    </button>
  )}
</div>
```

- "Nothing here yet." uses `Schedjuice Hand` (Caveat + Padauk). This is one of the 3–5 designated handwriting moments per surface (Design Brief §5.3).
- If `tableState.search || tableState.activeFilters.length > 0`, show a "Clear filters" affordance.
- Consumers override via `emptyState` prop when a richer empty state is warranted ("You haven't created any courses yet — [Create one]").

### 10.2 Loading (default)

```tsx
<div className="py-16 text-center">
  <p className="font-hand text-xl text-text-muted">Loading…</p>
</div>
```

- No spinner, no skeleton in foundation. Loading is a moment, and the page-level RSC prefetch (SDK Brief §12) means most first-paint cases don't show this state at all.
- Skeleton rows ship as a follow-up — define a `SkeletonRow` slot in the export but don't implement until a real consumer needs it.

### 10.3 Error (default)

```tsx
<div className="py-16 text-center">
  <p className="font-hand text-xl text-danger">Couldn't load.</p>
  <p className="text-sm text-text-muted mt-2">{err.message}</p>
  <button onClick={refetch} className="mt-3 text-sm underline">
    Try again.
  </button>
</div>
```

- Receives the `ApiError` from the list-hook (SDK Brief §8.3). For `err.code === "unauthorized"`, the SDK has already triggered the auth redirect; this state should never render for 401.
- For `err.code === "network"`, the message is "Couldn't load. Check your connection."
- For `err.code === "validation_error"`, the message uses `err.message` directly (validation on a list query is rare — typically a malformed filter).

---

## 11. Visual design rules (the paper part)

This section operationalizes the Design Brief for the table surface. Every rule here MUST be honored; deviations require approval before they ship.

### 11.1 Row chrome

- **No row borders.** Vertical rhythm comes from row padding (16px vertical inside a 52px-minimum row) and subtle zebra striping.
- **Zebra striping:** alternate rows between `--pixel-white` (`#FCF4E3`) and a 3% darker warm cream (defined as `--pixel-white-zebra` in the theme layer). Header is `--pixel-white`, never striped.
- **No vertical borders between columns.** Ever.
- **Row hover:** background shifts to a 4% Terminal tint (`color-mix(in srgb, var(--terminal) 4%, transparent)`). No scale, no shadow change, no border.
- **No `data-state="selected"` styling in the base.** Selection is composed at the page level; pages that need a selected-row style set it on their own data-attribute.

### 11.2 Header

- **Single header row.** No grouped headers, no spanning columns in foundation.
- **Small-caps Latin-only headers.** Use `font-feature-settings: "smcp"; text-transform: lowercase;` so Latin characters render as small caps while preserving the casing of Burmese (Design Brief §7). Header text is set in `Schedjuice Sans` at `--text-sm` with letter-spacing `0.05em`.
- **No uppercase transform.** Small-caps via OpenType only — never `text-transform: uppercase` (breaks Burmese shaping).
- **`<RoughUnderline />` beneath the header row.** Single wobble, seed-cached per table id. This is what separates header from body — no `border-bottom`.
- **No icons in headers.** Sort affordance is implicit (clicking the header label cycles sort state). Tooltip on hover reveals the sort hint.
- **Tabular-num columns** (number / date / currency / id) get `font-variant-numeric: tabular-nums` from the column helper.

### 11.3 Sort interaction

- Click the header label to cycle: `none → asc → desc → none`.
- Active-sort header label gets a `<RoughUnderline />` (different seed from the header divider so they don't visually merge).
- A tiny `↑` / `↓` glyph (text, not icon) appears after the label when sorted. No icon component, no Lucide.
- Multi-column sort is **not** supported in `<ResourceTable />`. It lives in `<AdvancedResourceTable />` (§12).

### 11.4 Responsive (horizontal scroll)

- On narrow viewports, the table scrolls horizontally inside its container. Outer page does not scroll horizontally.
- If a column is `pinned: "left"`, it stays put during horizontal scroll using sticky positioning.
- A subtle gradient mask on the scroll edges indicates more columns exist off-screen (paper-tone, not a hard shadow).
- Columns marked `mobile: "hide"` are visually hidden below the `sm` breakpoint (640px). They still occupy logical position in the column array, so re-showing them at a wider viewport is consistent.
- For surfaces where the user is primarily on a phone (chat lists, student attendance check-in), build a `<ResourceCardList />` instead of a `<ResourceTable />` (§13). Tables on phones are a fallback, not a target.

### 11.5 Density

- **One default density.** 52px minimum row height (matches Design Brief §9). Cell padding 16px vertical, 20px horizontal.
- Compact / comfortable variants are **not** in foundation. Add when a real consumer needs them.

---

## 12. `<AdvancedResourceTable />` extension

For modules with requirements the base intentionally doesn't carry. Lives in `src/components/data-table/advanced/`. **The base `<ResourceTable />` does not import from `advanced/`.** Modules opt in by importing a different component.

The extension adds, on top of `<ResourceTable />`:

- **Column reordering.** User-draggable column headers (drag handle = the header label itself). Reorder persists into `tableState` (and therefore the URL when `persist: "url"`).
- **Multi-column sort.** Shift-click adds a secondary sort. The active sort columns get numbered `<RoughUnderline />` annotations (1, 2, 3) so users can see the priority.
- **Column resize.** Drag the right edge of a header to resize. Widths persist into `tableState`.

What is NOT in `<AdvancedResourceTable />` in foundation (call out as follow-ups):

- Row virtualization (TanStack Virtual). Add when a consumer hits a real 1000+ row case.
- Column grouping / pivot.
- Inline editing.
- CSV export of reordered/filtered/sorted views (page-level concern even here).

```tsx
// Finance reconciliation example
import { AdvancedResourceTable, useResourceTableState } from "@/components/data-table/advanced";
import { useInvoicesList } from "@/sdk/hooks/invoices";

const tableState = useResourceTableState({
  namespace: "invoices",
  // advanced fields (columnOrder, columnWidths, multiSort) are merged in by AdvancedResourceTable
});

<AdvancedResourceTable
  listHook={useInvoicesList}
  query={{ where: { is_paid: false } }}
  columns={invoiceColumns}
  tableState={tableState}
  toolbar={{ wildcardSearch: { fields: ["invoice_number", "student__name"] } }}
/>;
```

`AdvancedResourceTable` shares 100% of `<ResourceTable />`'s prop surface. The extra capabilities are surfaced via a sibling hook, `useAdvancedResourceTableState`, that returns the base `ResourceTableState<T>` shape **plus** `columnOrder: string[]`, `columnWidths: Record<string, number>`, and `multiSort: { id: string; desc: boolean }[]` — with their own URL keys (`${namespace}.cols`, `${namespace}.widths`, `${namespace}.msort`). The returned object is structurally a superset of the base shape, so `<AdvancedResourceTable />` accepts it through the same `tableState` prop without a type widening. Pages opt in by swapping two imports — the hook and the component — and nothing else changes.

```ts
import { AdvancedResourceTable, useAdvancedResourceTableState } from "@/components/data-table/advanced";

const tableState = useAdvancedResourceTableState({ namespace: "invoices" });
// tableState satisfies ResourceTableState<Invoice> AND has columnOrder / columnWidths / multiSort.
```

`<ResourceTable />` accepts `ResourceTableState<T>` but will type-check fine if the consumer passes an `AdvancedResourceTableState<T>` (the superset). The base just ignores the advanced fields.

---

## 13. `<ResourceCardList />` companion

Same data contract as `<ResourceTable />`, different rendering surface. Used where cards read better than rows: showcased course catalog, kid-facing student dashboards, image-led surfaces.

```ts
type ResourceCardListProps<T> = {
  listHook: (query: ListQuery<T>) => UseListResult<T>;
  query: Omit<ListQuery<T>, "page" | "size" | "sort">;
  tableState: ResourceTableState<T>;
  cardRender: (row: T) => React.ReactNode;
  toolbar?: ToolbarConfig<T>;
  pageSize?: number;
  emptyState?: React.ReactNode;
  loadingState?: React.ReactNode;
  errorState?: (err: ApiError) => React.ReactNode;
  /** Responsive grid columns. Default: { sm: 1, md: 2, lg: 3 }. */
  grid?: { sm?: number; md?: number; lg?: number; xl?: number };
};
```

`<ResourceCardList />` reuses `<Toolbar />`, `<Pagination />`, `<EmptyState />`, `<LoadingState />`, `<ErrorState />` from the table parts. The only thing it doesn't reuse is the row/header rendering — replaced by a grid of consumer-rendered cards.

There is **no `viewMode` toggle** that switches between table and card inside one component. The legacy pattern of `viewMode: "table" | "card"` with a dropdown is gone. Surfaces that genuinely benefit from both render the toggle at the page level and conditionally swap which primitive they mount. In practice, very few surfaces need this.

---

## 14. Foundation deliverables

The agent ships the following before any list page is built on top of the system. Everything here must be reviewed and approved before phase 2 (the FE's application surfaces — courses list, invoices list, students list — start landing).

### 14.1 Components

Everything in §4. Specifically:

- `<Table />` with full prop surface from §5.1, fully typed.
- `<ResourceTable />` with full prop surface from §5.2, fully typed.
- `useResourceTableState` from §6, supporting `persist: "url" | "local"`, namespace collision detection in dev. Plus `useAdvancedResourceTableState` from §12.
- `Column<T>` + the column-builder helpers (`column.text`, `column.number`, `column.date`, `column.status`, `column.currency`, `column.custom`).
- Toolbar + search + filter chips + pagination + sortable header + empty/loading/error states.
- `<AdvancedResourceTable />` with column reordering and multi-sort (column resize can be a follow-up if scope is tight; document explicitly which advanced features ship in foundation vs follow-up).
- `<ResourceCardList />` sharing the parts.

### 14.2 Showcase pages

Mounted under `/_design/data-table/` (not in production routing). The agent ships all four:

1. **`/_design/data-table/basic`** — `<ResourceTable />` with a mocked list-hook (returns fixture courses), wildcard search, no filter chips, no row actions. Demonstrates the 80% case.
2. **`/_design/data-table/full-toolbar`** — same as basic + 3 filter chips + a "New course" custom slot button + `rowActions` returning a `<Menu />`. Demonstrates the full toolbar surface.
3. **`/_design/data-table/advanced`** — `<AdvancedResourceTable />` with column reordering and multi-sort, with an invoices fixture. Demonstrates the advanced layer.
4. **`/_design/data-table/card-list`** — `<ResourceCardList />` with the same courses fixture, using a `cardRender` that produces a paper-styled course card. Demonstrates the cards companion.

Plus a **bilingual stress page** (`/_design/data-table/bilingual`) showing:

- A table with Burmese names in cells (e.g., a students table with `name: "အောင်ဇေယျ"`).
- A table with mixed-script values (`title: "Math 101 — အခြေခံသင်္ချာ"`).
- A header row that includes a Burmese-translated header (verifies small-caps doesn't break Burmese — should fall through to no-transform on Burmese chars).
- A filter chip with a Burmese label.
- An empty state with a Burmese-translated "Nothing here yet." in handwriting.

If any of these renders incorrectly — broken Burmese, layout collapse, contrast failures, focus rings invisible, header underline not rendering — the foundation is not done.

### 14.3 Tests

- **Unit tests (vitest)** for `useResourceTableState`: URL persistence, local persistence, namespace collision detection, reset, default seeding.
- **Unit tests** for the column-builder helpers: each helper produces a typed `Column<T>`, default `tabularNum` / `align` are correct.
- **Integration tests** (vitest + RTL) for `<ResourceTable />`: renders rows from a mocked list-hook; clicking a header cycles sort; typing in the search input updates `tableState` after debounce; clicking a filter chip toggles its active state; pagination updates `tableState.page`; empty / loading / error states render correctly.
- **Integration tests** for `<AdvancedResourceTable />`: drag-to-reorder updates `tableState.columnOrder`; shift-click adds to multi-sort.
- **Integration test** for `<ResourceCardList />`: renders cards from the same list-hook contract.
- **Accessibility tests**: keyboard navigation (Tab/Shift+Tab through headers and rows), header sort triggerable via keyboard, focus ring visible on all interactive elements (honors `--ring`).

### 14.4 Data-table README

`src/components/data-table/README.md` containing the recipes a future engineer (or agent) needs to wire a new list page without consulting this brief:

- **"How to wire a basic list page" recipe.** End-to-end: import the SDK hook + the table, define columns with the helpers, render `<ResourceTable />`. The courses showcase page is the worked example.
- **"How to add filter chips" recipe.** Define `apply: (where) => modifiedWhere`. Common patterns: boolean toggle (`is_active: true`), date range (`start_date: { gte: ... }`), enum filter (`status: { in: [...] }`).
- **"How to opt into advanced features" recipe.** Swap the import: `<ResourceTable>` → `<AdvancedResourceTable>`. Same prop surface; extra capabilities surface through `tableState`.
- **"How to use the table inside a dialog" recipe.** Use `useResourceTableState({ persist: "local" })` to keep URL clean.
- **"How to embed two tables on one page" recipe.** Different namespaces for each `useResourceTableState({ namespace })` call.
- **"How to write a custom empty state" recipe.** Pass `emptyState={...}` with a consumer-defined node, including a CTA when appropriate.
- **"What lives in the page, not the table" callout.** CSV export, selection, "new" buttons, page-level filters — these are consumer concerns. The table doesn't grow new props for them.

---

## 15. Banned list (hard rules)

In rough priority order. **#1 is the architectural anchor; do not negotiate.**

1. **No "do-everything" component.** `<ResourceTable />` does not grow new boolean feature props (`isSelectionEnabled`, `isCardViewEnabled`, `isFullscreenEnabled`, `isCsvExportable`, etc.). Features either compose at the page level or live in a sibling component.
2. **No shadcn UI.** Carries over from Design Brief §14.1. No `components.json`, no `pnpm dlx shadcn add`, no shadcn-derived class patterns. Table primitives compose on Base UI or are hand-written.
3. **No raw `@tanstack/react-table` imports outside `use-table-instance.ts`.** Consumers never see TanStack types. `Column<T>` is the public column type.
4. **No `any` in the table surface.** Including via `as any` casts. `unknown` is acceptable where the shape is genuinely unknown (the `customSlot` ToolbarConfig field is `React.ReactNode`, not `any`).
5. **No URL state inside the table component.** URL persistence is `useResourceTableState`'s job. The component reads + writes via the controlled props.
6. **No data fetching inside `<Table />` or `<ResourceTable />`.** `<ResourceTable />` calls the consumer-provided `listHook`; the hook owns the network. `<Table />` doesn't fetch at all.
7. **No per-field-of-every-column search sidebar.** The legacy pattern is gone. Filter chips are the explicit, per-table alternative; advanced filter UI is a page-level concern.
8. **No `viewMode: "table" | "card"` toggle inside one component.** Cards are a sibling primitive (`<ResourceCardList />`).
9. **No built-in CSV export, no built-in selection, no built-in fullscreen, no built-in column-visibility toggle in `<ResourceTable />`.** Each was in the legacy default; each is dropped. Add at the page level when actually needed.
10. **No row-level click handlers in the base.** No `rowHref`, no `onRowClick`. Row interactions live inside cells (a link cell, the opt-in `rowActions` menu).
11. **No icons in column headers, no icon decoration in toolbar inputs.** Carries over from Design Brief §11.
12. **No `text-transform: uppercase` on headers.** Use OpenType small-caps so Burmese is unaffected.
13. **No hard 1px borders for row separation or header divider.** Zebra striping + `<RoughUnderline />` for header. Carries over from Design Brief §8 / §14.4.
14. **No hover scale / hover shadow effects on rows.** Background tint only.
15. **No runtime page-size toggle.** Page size is a config prop set once per table.
16. **No multi-sort in the base.** Lives in `<AdvancedResourceTable />`.
17. **No `// @ts-ignore` or `// @ts-expect-error` in table code.** Fix the type. This is what killed the predecessor.

---

## 16. How "done" is judged

The foundation phase is **complete** when:

1. The file tree in §4 is fully implemented.
2. `<Table />`, `<ResourceTable />`, `<AdvancedResourceTable />`, and `<ResourceCardList />` are typed, tested, and rendering on the four `/_design/data-table/` showcase pages.
3. The bilingual stress page (`/_design/data-table/bilingual`) renders Burmese names, mixed-script titles, and Burmese headers without layout collapse or shaping defects.
4. A maintainer can pick any resource the agent did NOT wire (e.g., `students`, `payments`, `attendance-records`) and follow the README "How to wire a basic list page" recipe to ship a working list page in under 15 minutes without consulting the agent.
5. A reviewer can screenshot the showcase pages next to a vanilla shadcn admin table and immediately tell which one is Schedjuice — same litmus test as the design foundation.
6. No `<ResourceTable />` prop is a feature toggle. The component has props for *required configuration* (columns, listHook, query, tableState) and *render slots* (toolbar, rowActions, emptyState, loadingState, errorState). Nothing else.
7. The legacy do-everything 825-line shape is gone. Nobody on the team should be able to point at the new system and say "we just rewrote the old DataTable with new tokens."

If the reviewer can't do all seven, the table system has drifted toward the predecessor's shape, and the foundation needs another pass. The discipline of NOT growing the base is the deliverable.
