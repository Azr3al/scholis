# Data Table & AutoForm Program — Design Spec

**Date:** 2026-07-09  
**Status:** Approved (brainstorming 2026-07-09)  
**Authority:** [`DESIGN.md`](../../../DESIGN.md) — palette, type, layout §9, motion §12 (`savedTick`, no layout shift), banned list §14  
**Predecessors:**
- Data table brief — [`2026-05-17-schedjuice-v2-data-table-brief.md`](2026-05-17-schedjuice-v2-data-table-brief.md)
- Forms strategy — [`2026-05-17-schedjuice-v2-forms-strategy.md`](2026-05-17-schedjuice-v2-forms-strategy.md)
- Chrome migration program — [`2026-07-09-design-md-chrome-migration-program-design.md`](2026-07-09-design-md-chrome-migration-program-design.md) (deferred these widgets)
- User-record inline / autosave — `useAutosaveForm`, `InlineField`, `FormSaveTick`

---

## 1. Summary

Replace legacy **`DataTable` / `UnManagedDataTable`** and **`AutoForm` / `GenericForm`** with DESIGN.md-native systems, in **two sequential programs**:

1. **Program 1 — Data table:** brief-faithful `<Table />` + `<ResourceTable />`, shared **edit-kit**, opt-in editable columns, **SDK list-hooks**, full consumer cutover, delete legacy table modules (no shims).
2. **Program 2 — AutoForm:** new auto-form on primitives/`Field` + edit-kit, **logical field groups**, hybrid **create vs edit** save modes, **perf + fidelity skeletons**, migrate CRUD consumers, delete legacy auto-form.
3. **Closing PN:** remove shadcn / Radix / Lucide once chrome + this program leave zero consumers.

Sheet-class UX stays on existing Glide **`DataSheet`**. Orchestration matches the chrome program: per-wave plan → worktree → migrate agent → review agent → merge **`dev`**.

---

## 2. Locked decisions

| Topic | Decision |
| --- | --- |
| Depth | **Rebuild** (not in-place reskin, not long-lived shims) |
| Shipping | **Sequential:** tables first, then AutoForm |
| Table cutover | **Full** — all `DataTable` / `UnManagedDataTable` consumers, then delete legacy |
| Editable tables | **First-class opt-in** editable column types on `ResourceTable` |
| Shared save UX | **`edit-kit`** — reuse/adapt `useAutosaveForm`, `FormSaveTick` / `savedTick`, inline-field patterns |
| Form save default | **Hybrid:** create = explicit submit; edit = autosave + optimistic + `savedTick` for safe fields; high-risk = explicit confirm |
| Form layout | **Logical field groups** (title + short helper) as first-class |
| Architecture | **Approach 1** — brief-faithful layers + shared edit-kit |
| Program 2 start gate | **Default: after T4.** May start after T0 only if edit-kit is API-frozen and Program 1 is unblocked; if T3 is still reshaping editable-cell APIs, wait until that settles |
| SDK list-hooks | **Rewrite / add** typed SDK list-hooks as part of Program 1 — `ResourceTable` consumes them; no long-lived `searchEntities` adapters |
| Legacy / shims | **Delete legacy at wave end** whenever possible — no long-lived dual API or compatibility shims |
| Dense spreadsheet UX | **Out of scope** — use existing Glide **`DataSheet`** (`src/components/data-sheet/`) for sheet-like surfaces |
| Package cleanup | **In scope (closing wave):** remove shadcn / Radix / Lucide (and related dead packages) once this program + chrome migration leave zero consumers |

---

## 3. Relationship to prior briefs

### Data table brief

Program 1 **implements** the May data-table brief’s two-layer model and anti-patterns (no do-everything component, no fetch-inside-table, no URL state inside the widget, typed columns, features opt-in). Visual language follows current **DESIGN.md** (tokens, primitives, Iconoir, motion) rather than any superseded paper-only notes that conflict with shipped foundation.

### Forms strategy brief

The May forms strategy’s headline rule is **schemas validate; forms compose** — no greenfield Zod→JSX AutoForm walker, prefer hand-composed entity forms on a Field layer.

This program does **not** reopen that north star for complex product forms (course create, multi-step flows). Those stay hand-composed.

Program 2 is a **pragmatic strangler** of the **live** legacy AutoForm / `GenericForm` estate (admin CRUD create/edit/settings). It ships a DESIGN.md-native auto-form that:

1. Renders through **Field / edit-kit** primitives (same save/feedback language as tables and user-record).
2. Uses schema + **group config** for repetitive admin CRUD only.
3. Must not block or replace existing hand-composed / `InlineField` record editors.

If a form is complex enough that grouping config becomes a second programming language, hand-compose it instead.

---

## 4. Goals & non-goals

### Goals

1. New `src/components/data-table/` and shared `src/components/edit-kit/`.
2. **Rewrite / add SDK list-hooks** for resources that `ResourceTable` lists; cut consumers over to those hooks (no permanent adapter layer over `searchEntities`).
3. Migrate all table consumers; **delete** `ui/data-table*`, related pagination/search/view-options, and unused legacy card path as soon as each wave makes them unreachable — prefer delete over shim.
4. Opt-in editable columns with optimistic save + `savedTick` (reserved space, no layout shift). Dense sheet-like editing stays on existing **Glide `DataSheet`**, not on `ResourceTable`.
5. New `src/components/auto-form/` with `saveMode`, logical groups, optimistic edit autosave; **high form performance** (no unnecessary re-renders); **loading skeletons that mirror the real field/group layout**.
6. Migrate GenericForm / AutoForm CRUD consumers; **delete** legacy `ui/auto-form` (and dead form helpers) as soon as unreachable.
7. **Closing package cleanup:** once chrome migration + this program leave zero consumers, delete shadcn / Radix / Lucide (and related dead deps / `components.json` / `components/ui` leftovers).
8. Agent-ready wave plans + review checklists; merge to `dev`.

### Non-goals

- **Chrome pattern waves** — the separate DESIGN.md program that reskins unfinished *page chrome* (list/detail/create-edit/dashboard shells) while leaving table/form widgets alone. Spec: [`2026-07-09-design-md-chrome-migration-program-design.md`](2026-07-09-design-md-chrome-migration-program-design.md). This data-table/AutoForm program does not re-do that page-chrome work.
- Rebuilding spreadsheet / Glide sheet UX inside `ResourceTable` — **`DataSheet` already exists** for that class of surface.
- Forcing record overview `InlineField` UIs through AutoForm.
- Multi-step wizards / form builders.
- Backend schema changes.
- Long-lived compatibility shims that keep old `DataTable` / `AutoForm` prop surfaces alive “for later.”

---

## 5. Program 1 — Data table

### 5.1 Architecture

```
src/components/data-table/
  table.tsx                  # <Table /> — render-only
  resource-table.tsx         # <ResourceTable /> — SDK list-hook + toolbar + pagination
  use-resource-table-state.ts
  columns.ts                 # Column<T> + column.* builders
  parts/                     # toolbar, search, filter chips, sort header, pagination, empty/loading/error
  advanced/                  # optional: sticky col, multi-sort, reordering — only when a consumer needs it
  index.ts

src/sdk/hooks/…              # typed list-hooks rewritten/added per resource as consumers migrate

src/components/edit-kit/     # shared with Program 2
  # bind helpers around useAutosaveForm, FormSaveTick, cell/field APIs
```

**`<Table />`** — columns + rows + table state → markup. No fetch, no URL, no toolbar.

**`<ResourceTable />`** — **SDK list-hook** + typed `query` + `columns` + controlled `{ tableState, onTableStateChange }`. Renders search, optional filter-chip slot, sort, pagination, empty/loading/error. Does not call `searchEntities` itself.

**URL state** lives in the page/hook (`useResourceTableState`), never hardcoded inside the table with colliding global keys.

**Sheet-like grids** continue to use existing Glide **`DataSheet`** (`src/components/data-sheet/`). Do not reinvent that inside `ResourceTable`.

### 5.2 Default list UX

- One search box + optional **filter chips** (page-composed). No per-column search sidebar.
- Sortable headers; bilingual-safe (no forced uppercase on Burmese).
- Comfortable row height (~52px+); compact density only if a later consumer proves need.
- Loading / empty / error: **reserved height**, `crossfade` / DESIGN.md empty copy.
- Sticky toolbar; sticky first column only via Advanced / page opt-in (wide finance).
- Row actions: trailing control — must not fight sort/select hit targets.
- Selection, CSV, fullscreen, column visibility: **opt-in / page-composed**, not defaults.

### 5.3 Editable columns (opt-in)

- Builders: `column.editableText`, `editableSelect`, `editableSwitch`, `editableDate` (extend only for real consumers).
- Blur/change → optimistic patch via edit-kit; **`FormSaveTick` / `savedTick`** in reserved space; rollback + per-cell retry on failure.
- Optional ~5s undo toast for reversible scalar edits (user-record spirit).
- **Never** editable-inline for money, roles, destructive, or other high-risk fields — confirm / sheet / explicit save.
- Keyboard: Tab between editable cells in a row where practical. Sheet-class UX → **`DataSheet`**, not `ResourceTable`.

### 5.4 Waves

| Wave | Scope |
| --- | --- |
| **T0** | Foundation: `data-table/` + `edit-kit/` + pilot SDK list-hook + design showcase / 1 pilot list |
| **T1** | Index / admin lists: migrate consumers + **add/rewrite SDK list-hooks**; delete unreachable legacy helpers as you go |
| **T2** | Embedded tables on record/detail pages (+ hooks); delete dead paths when unused |
| **T3** | Dense ops + known inline-edit tables + `UnManagedDataTable` (+ hooks) |
| **T4** | Delete remaining legacy `ui/data-table*`, pagination/search/view-options, superseded card path; grep-clean |

Inventories must be file-disjoint for parallel work; shared toolbar bits land in T0. **Prefer deleting legacy code in the same PR that removes its last consumer** — do not leave dual APIs.

---

## 6. Program 2 — AutoForm

### 6.1 Architecture

```
src/components/auto-form/    # Zod + group config → Field/edit-kit layout
                             # saveMode: "create" | "edit"
```

Primary product wrapper remains a successor to **`GenericForm`** (fetch entity, create/update mutations, error mapping) that hosts the new auto-form.

### 6.2 Save model

| Mode | Behavior |
| --- | --- |
| **`create`** | Explicit primary Submit; validation + scroll-to-first-error; sticky footer actions |
| **`edit`** | Autosave on blur/change for safe scalars via edit-kit; `savedTick` reserved space; per-field retry; atomic `units` for fields that must save together |
| **High-risk** | Opt out via `shouldAutosaveField` / field policy — roles, money, destructive, cross-field drivers → explicit Save / confirm |

### 6.3 Logical groups & UX

- First-class **sections**: title + one short helper; calm grid layout (not a flat accordion of every key).
- Grouping from config (and/or light schema metadata).
- Progressive disclosure: rare fields in collapsed “More” within a group.
- Section-level dirty/error whisper when a group has failed autosaves.
- Prefer in-flow page / `revealBar` composer over centered modals (DESIGN.md §12).
- Field types via primitives: text, textarea, number, select, combobox, switch, checkbox, date/datetime, radio, arrays where needed.

### 6.4 Performance & loading skeletons

**Performance (non-negotiable for Program 2):**

- Avoid unnecessary re-renders: isolate field subscriptions (RHF `control` + per-field watch / `useWatch` only where needed); do not `watch()` the entire form at the root.
- Stable field/group component boundaries so typing in one field does not re-render unrelated groups.
- Autosave status updates must not remount the field tree; tick/status live in reserved slots.
- Prefer uncontrolled-by-default Field primitives; memoize column/group configs at the page boundary when they are static.

**Skeletons:**

- Loading skeletons must **mirror the rendered counterpart**: same group structure, approximate field count/heights, sticky footer reserved when create mode has one — not a generic N-row bar stack.
- Crossfade skeleton → form with **no layout jump** (DESIGN.md §12).
- Replace coarse `AutoFormFieldsSkeleton` rows with group-aware skeletons driven by the same group config the live form uses.

### 6.5 Waves

| Wave | Scope |
| --- | --- |
| **F0** | New `auto-form/` + groups + `saveMode` + perf/skeleton contracts; migrate GenericForm wrapper; delete dead legacy form bits when unused |
| **F1** | Create pages → `saveMode: "create"` + fidelity skeletons |
| **F2** | Edit / settings → autosave + groups + `savedTick` |
| **F3** | Custom field overrides / remaining complex CRUD; **delete** legacy `ui/auto-form` |
| **PN** | Closing package cleanup: remove shadcn / Radix / Lucide / dead `components/ui` once chrome program + T/F waves leave zero consumers |

**Start gate:** **Default after T4.** Early start after T0 only if edit-kit is API-frozen and Program 1 is unblocked. If T3 is still reshaping editable-cell APIs, wait until that settles before F0.

### 6.6 Out of Program 2

- Record overview editors already on `InlineField` — align APIs with edit-kit; do not force through AutoForm.
- Hand-composed complex entity forms (forms strategy north star).
- Glide **`DataSheet`** surfaces (already owned elsewhere).

---

## 7. Shared edit-kit

Extract/adapt (do not fork behavior):

- `useAutosaveForm` / autosave-core (optimistic query write + rollback, units, field status).
- `FormSaveTick` + `savedTick` motion recipe.
- Bind helpers usable from **table cells** and **form fields**.

Rules:

- Animate only via motion recipes; **reserve space** for ticks (DESIGN.md §12 — no layout shift).
- Gate motion with `useReducedMotion()`.
- High-risk policy is shared: tables and forms must not silently autosave dangerous fields.

---

## 8. Orchestration pipeline

**Repo:** `schedjuice-reimagined-fe`  
**Base branch:** latest `dev`

Per wave:

1. Implementation plan (inventory, playbook, don’t-touch, acceptance, PR template).
2. Worktree branch `migrate/ui-t<N>-…` or `migrate/ui-f<N>-…`.
3. Migrate sub-agent → PR to `dev`.
4. Review sub-agent — fail closed on DESIGN.md §14, playbook, inventory boundaries, high-risk edit policy.
5. Merge on pass; later waves rebase from post-merge `dev`.

**Conflict policy:** shared modules in T0 / F0 first; **delete legacy when last consumer migrates** (no dual-API shims); accidental unrelated business-logic rewrites → review reject.

---

## 9. Verification

| Gate | Requirement |
| --- | --- |
| Typecheck / lint | Repo FE commands on touched scope |
| Grep | No new Lucide / new `ui/*` inside `data-table/`, `edit-kit/`, `auto-form/`; after PN, zero shadcn/Radix/Lucide consumers |
| SDK | Migrated lists use SDK list-hooks — no new `searchEntities`-inside-table patterns |
| Motion / a11y | Reserved-space `savedTick`; reduced motion; no jump on search/save/skeleton→form |
| Form perf | Field isolation: editing one field does not re-render unrelated groups (spot-check / React Profiler in F0 acceptance) |
| Skeletons | Loading UI matches group/field layout of the live form |
| Smoke | Light + dark: read-only list, editable list, create form, edit form (as applicable per wave) |
| Cutover | After T4 / F3 / PN: zero imports of deleted legacy modules; build passes |

---

## 10. Risks

| Risk | Mitigation |
| --- | --- |
| SDK list-hook rewrite slows cutover | Ship hooks **with** each consumer wave (T0 pilot, then per T1–T3 inventory); do not invent permanent adapters |
| Editable columns on high-risk data | Policy + review checklist; sheet-class → `DataSheet` |
| Shared chrome collisions across waves | Disjoint inventories; T0 foundation |
| Forms before edit-kit stable | F0 gated (default after T4) |
| Shim / dual-API creep | **Delete legacy when last consumer migrates**; review rejects new shims |
| Form re-render / janky skeletons | F0 perf + skeleton contracts; Profiler gate; group-aware skeletons |
| Package delete too early | PN only after chrome program + T/F leave zero consumers |
| Tension with forms-strategy “no AutoForm” | Program 2 scoped to CRUD strangler; complex forms stay hand-composed |
| Agent rewrites unrelated page business logic | Playbook: cutover + UX + SDK hooks only |

---

## 11. UX ideas carried into the design

**Tables:** filter chips over unused per-column search; reserved-height loading; sticky toolbar; trailing row actions; optional undo after optimistic cell save; density only if proven.

**Forms:** section headers + helper copy; sticky create footer; dirty/error per section; retry-per-field; progressive disclosure; in-flow / `revealBar` over modal CRUD; field-isolated renders; skeletons that match live groups.

---

## 12. Deliverables

1. **This spec** (committed).
2. **Implementation plans** via writing-plans: **T0–T4**, then **F0–F3**, then **PN** package cleanup — each with migrate + review briefs.

**Not deliverables of this program:** the separate chrome pattern-wave page reskins (already specified elsewhere). Spreadsheet/Glide work stays on existing `DataSheet`.

---

## 13. Approach record

Brainstorming compared:

1. **Chosen:** Brief-faithful layers + shared edit-kit; tables then forms; full cutover; editable columns.
2. Rejected: Compatibility shims first (dual API rot).
3. Rejected: Page-driven strangler without foundation (inconsistent, weak cutover).

Depth forks locked with the user: rebuild (B), hybrid save (C), sequential programs (B), full table cutover (B), first-class editable columns (B).

**Spec amendments (2026-07-09 review):** clarify chrome waves; SDK list-hook rewrite in scope; delete shadcn/Radix/Lucide in closing PN; no ResourceTable spreadsheet mode (`DataSheet` exists); prefer delete-legacy over shims; form perf + fidelity skeletons.
