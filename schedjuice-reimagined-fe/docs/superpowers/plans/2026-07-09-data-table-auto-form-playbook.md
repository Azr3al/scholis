# Data Table & AutoForm — Shared Playbook

> Copied into / referenced by every wave plan. Agents must follow this exactly.  
> **Spec:** [`../specs/2026-07-09-data-table-auto-form-program-design.md`](../specs/2026-07-09-data-table-auto-form-program-design.md)

## Depth

**Rebuild and cut over** — not a chrome-only reskin.

| Surface | Target |
| --- | --- |
| Lists | `src/components/data-table/` (`Table`, `ResourceTable`, `column.*`) |
| Inline cell / form save UX | `src/components/edit-kit/` + existing `useAutosaveForm` / `FormSaveTick` |
| Admin CRUD forms | `src/components/auto-form/` + GenericForm successor |
| Data fetching for lists | `src/sdk/` list-hooks (bootstrap in T0; expand per wave) |
| Sheet-like grids | Keep **`DataSheet`** (`src/components/data-sheet/`) — do not rebuild in ResourceTable |

## Hard rules

1. **No long-lived shims.** Do not keep a `DataTable` wrapper that maps old props forever. Migrate the page or leave it on legacy until its wave — then delete legacy.
2. **Delete when last consumer dies.** Same PR that migrates the last importer deletes the dead module.
3. **No new Lucide** in new code — use `iconoir-react`.
4. **No new `@/components/ui/*`** inside `data-table/`, `edit-kit/`, `auto-form/`, or `sdk/` — primitives + tokens only.
5. **High-risk fields never autosave inline** (money, roles, destructive) — confirm / explicit save.
6. **No layout shift** on search, save ticks, or skeleton→form (DESIGN.md §12). Reserve space for `FormSaveTick`.
7. **Forms:** no unnecessary re-renders — do not `watch()` the whole form at the root; isolate field subscriptions. Skeletons must mirror group/field layout.
8. **Do not invent spreadsheet mode** in ResourceTable — use Glide `DataSheet` for that class of UI.
9. **Do not rewrite unrelated business logic** (permissions, payment rules, quiz grading math) while migrating.

## Import swaps (new code)

| Concern | Use |
| --- | --- |
| Buttons / inputs / selects / dialogs | `@/components/primitives` |
| Field chrome | `@/components/primitives` → `Field` |
| Motion | `@/lib/sj/motion` (`crossfade`, `staggerList`, `savedTick`) + `useReducedMotion()` |
| Saved confirmation | `@/components/product-docs/form-save-tick` → `FormSaveTick` (or edit-kit re-export) |
| Icons | `iconoir-react` |
| Tokens | `bg-surface`, `text-text-primary`, `border-border`, `text-accent`, … |

## SDK list-hook contract (minimum)

Every migrated list page must use a typed hook, e.g. `useCampusesList({ query, filters })`, that:

- Lives under `src/sdk/hooks/<resource>.ts` (or `src/sdk/hooks/` as bootstrapped in T0)
- Owns TanStack query key via a factory (no `` [`get${entity}`] `` string templates)
- Unwraps the API envelope at the SDK boundary
- Does **not** live inside `ResourceTable`

Until the full SDK brief is implemented, T0 may bootstrap a **minimal** `defineSearchResource` + hooks that still call `axiosClient` / `searchEntities` **inside `src/sdk/` only**. Pages and `ResourceTable` must not import `@/app/client-api/utils` for list fetch after cutover.

## ResourceTable cutover recipe (pages)

Replace:

```tsx
<DataTable
  baseDetailsPath="/campuses"
  entity="campuses"
  uid="campuses"
  queryParams={{}}
/>
```

With (shape locked in T0 — adjust import paths to match T0 exports):

```tsx
import { ResourceTable, column, useResourceTableState } from "@/components/data-table";
import { useCampusesList } from "@/sdk/hooks/campuses";

const tableState = useResourceTableState({ namespace: "campuses" });
const list = useCampusesList({
  page: tableState.page,
  size: tableState.pageSize,
  sorts: tableState.sorts,
  q: tableState.q,
  filters: tableState.filters,
});

<ResourceTable
  list={list}
  tableState={tableState}
  onTableStateChange={tableState.setState}
  columns={campusColumns}
  getRowId={(row) => String(row.id)}
  rowHref={(row) => `/campuses/${row.id}`}
/>
```

Column defs move from artifact magic strings to typed `column.text` / `column.date` / etc. Port visible columns from `src/app/artifacts/columns/` for that entity; drop unused search-sidebar fields.

## Editable column recipe

```tsx
column.editableText({
  id: "note",
  header: "Note",
  accessor: (row) => row.note ?? "",
  onSave: (row, value) => updateNote(row.id, value), // optimistic via edit-kit inside ResourceTable cell
})
```

Only for safe scalars. Finance status / roles → existing confirm flows or `DataSheet`.

## AutoForm cutover recipe

- Create pages: `saveMode="create"`, sticky submit, group config, fidelity skeleton while schema/entity loads.
- Edit pages: `saveMode="edit"`, wire `useAutosaveForm` / edit-kit, `FormSaveTick`, high-risk opt-outs.
- Replace `AutoFormFieldsSkeleton rows={N}` with group-aware skeleton from the same `groups` config.

## Grep gates (before PR)

```bash
# New packages must stay clean
rg -n "from [\"']lucide-react[\"']" src/components/data-table src/components/edit-kit src/components/auto-form src/sdk
rg -n "from [\"']@/components/ui/" src/components/data-table src/components/edit-kit src/components/auto-form src/sdk

# After a consumer wave, legacy imports on migrated files must be gone
rg -n "from [\"']@/components/ui/data-table[\"']" <touched-pages>
rg -n "from [\"']@/components/ui/auto-form[\"']" <touched-pages>

# After T4
rg -n "ui/data-table|UnManagedDataTable|data-table-pagination|data-table-search|data-table-view-options" src

# After F3
rg -n "components/ui/auto-form" src
```

## Review agent checklist

- Spec + this playbook followed
- Inventory boundaries respected (no out-of-wave files)
- No dual-API shim introduced
- High-risk edit policy respected
- SDK hooks used for migrated lists (no `searchEntities` in page/table)
- Forms: no whole-form `watch()`; skeletons match groups
- DESIGN.md §14 bans not violated in new code
- Fail closed; max **2** fix rounds, then escalate

## Acceptance commands (typical)

```bash
npm run test:unit -- <relevant>
npx tsc --noEmit -p tsconfig.json   # or repo’s usual typecheck if different
npm run lint                        # on touched scope when practical
```

Smoke: light + dark on 1–2 inventory pages per wave.
