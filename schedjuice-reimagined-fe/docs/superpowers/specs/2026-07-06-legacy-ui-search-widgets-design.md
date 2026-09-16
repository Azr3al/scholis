# Legacy UI → Primitives: Shared Loading/Motion + Search/Form Widgets

**Date:** 2026-07-06  
**Status:** Approved (design); implementation pending  
**Author:** brainstorming session  
**Scope:** Shared async-loading infrastructure (Tier-1 primitives) plus migration of search/form combobox widgets to [`DESIGN.md`](../../../DESIGN.md) §12 motion and loading patterns.

## 1. Summary

The frontend still has ~70 shadcn components under `src/components/ui/*` imported across 150+ files. Phase 1 foundation delivered ~22 Base UI primitives under `src/components/primitives/`, but most feature code — especially search/combobox widgets — still uses legacy `ui/command`, `ui/popover`, Lucide loaders, and instant panel swaps (a DESIGN.md §12 violation).

The reference implementation is **`StaffUserSearchCombobox`** (Roles & Permissions assign tab): primitive `Input`, Iconoir icons, structured row skeletons, `AnimatePresence` + `crossfade`/`staggerList` from `@/lib/sj/motion.ts`, and `useReducedMotion()` fallbacks. It still imports legacy `ui/checkbox` and `ui/skeleton`.

This spec adopts **Approach B (extract-from-reference)**: generalize patterns from the staff combobox into shared infrastructure, then migrate search/form widgets in the same phase — not a pure infrastructure sprint followed by a disconnected widget pass.

## 2. Context

| Area | Current | Target |
| --- | --- | --- |
| Skeleton | `ui/skeleton` — `bg-muted-foreground animate-pulse` (137 imports) | `primitives/skeleton` — `bg-surface-skeleton`, token durations, `motion-reduce:animate-none` |
| Async panels | Instant swap or spinner-only (`Loader`, `Loader2`) | `AsyncContentPanel` — state machine + `crossfade` keyed by state |
| Search input chrome | Ad-hoc per widget; Lucide `Search` | `SearchField` — primitive `Input` + Iconoir `Search` + spinning `Refresh` when fetching |
| Entity search | `EntityCombobox` → `ui/combo-box` → `ui/command` (~30 consumers) | `primitives/combobox` + shared async panel |
| Backend search | `BackendSearchableCombobox` — `ui/command` + `ui/popover` + Lucide (4 consumers) | Same target stack |
| Motion adoption | ~30 files use `motion/react` | All migrated search widgets use locked recipes from `motion.ts` |

**Migration philosophy** (from [design-foundation-phase-1](2026-06-21-design-foundation-phase-1.md)): strangler-fig. Legacy `components/ui` remains until consumers are migrated; the §14 “no shadcn” ban applies to **new and migrated code** in this tranche.

## 3. Decisions (from brainstorming)

| Topic | Choice |
| --- | --- |
| Scope boundary | **A + search/form widgets** — shared Tier-1 infra plus combobox/search widget family |
| Approach | **B — extract-from-reference** — co-evolve infra with widget migrations |
| Tier-1 global swaps (this phase) | `skeleton`, `checkbox`, `button` in search widgets + `structured-skeletons.tsx` |
| Out of scope v1 | `MultiSelectPopover`, `ui/card`, `ui/badge`, `ui/form`/`auto-form`, `data-table`, global button migration (384 imports) |
| API stability | Keep existing prop surfaces on `EntityCombobox` and `BackendSearchableCombobox` — visual/behavior upgrade only |
| Showcase | New “Async loading & search” section under `/(design)/components` |

## 4. Goals

- Add `primitives/skeleton` and shared `AsyncContentPanel` + `SearchField` extracted from `StaffUserSearchCombobox`.
- Migrate `StaffUserSearchCombobox`, `BackendSearchableCombobox`, and `EntityCombobox` to primitives + DESIGN.md motion/loading.
- Replace legacy skeleton/checkbox/button imports in those widgets and in `structured-skeletons.tsx`.
- Retire direct `ui/combo-box` usage from `EntityCombobox`; grep and migrate remaining stragglers (~6 files).
- Document motion/loading recipes per surface type so future widgets copy one pattern.

## 5. Non-Goals

- Migrating all 384 `ui/button` imports globally.
- Building `primitives/badge`, `primitives/card`, or greenfield `data-table`.
- Migrating `MultiSelectPopover` (Radix dropdown) — follow-up spec if needed.
- Removing `components/ui` directory or Radix packages (Phase N).
- Changing backend search APIs or React Query cache key shapes for entity combobox.

---

## 6. Shared infrastructure

### 6.1 `primitives/skeleton.tsx`

New primitive at `src/components/primitives/skeleton.tsx`.

| Requirement | Detail |
| --- | --- |
| Element | `div` with `role="presentation"` (decorative) or allow override via props |
| Background | `bg-surface-skeleton` (`.sj-root` token `--surface-skeleton`) |
| Animation | Subtle pulse using CSS token duration, e.g. `animate-pulse` with `motion-reduce:animate-none` |
| API | Same as current `ui/skeleton`: `{ className, ...divProps }` |

**Consumers updated in this phase:**

- `src/components/loading/structured-skeletons.tsx` — swap import to `@/components/primitives/skeleton`
- All search widgets (§7)
- Attendance marking skeletons already use `motion-reduce:animate-none` — swap import only

**Do not** delete `ui/skeleton` in this phase; other legacy surfaces still depend on it.

### 6.2 `AsyncContentPanel`

New component at `src/components/loading/async-content-panel.tsx`.

**Purpose:** Encapsulate the panel state machine and motion from `StaffUserSearchCombobox` so inline and popover lists share one pattern.

**Panel states:**

```ts
type AsyncPanelState =
  | "idle"      // optional: disabled / no context (maps to custom idle slot)
  | "hint"      // e.g. "Type at least 2 characters…"
  | "loading"
  | "empty"
  | "error"
  | "ready";    // renders children (results)
```

**Props (minimum):**

| Prop | Type | Notes |
| --- | --- | --- |
| `state` | `AsyncPanelState` | Drives `AnimatePresence` key |
| `ariaBusy` | `boolean` | Sets `aria-busy` on container |
| `className` | `string` | Outer shell: `rounded-xl border border-border/60 bg-surface overflow-hidden` |
| `hint` | `ReactNode` | Centered muted copy for `hint` state |
| `empty` | `ReactNode` | Centered muted copy for `empty` state |
| `error` | `ReactNode` | Destructive copy, `role="alert"` for `error` state |
| `loading` | `ReactNode` | Structured skeleton — never a lone spinner |
| `idle` | `ReactNode` | Optional; when `state === "idle"` |
| `children` | `ReactNode` | Results when `state === "ready"` |

**Motion (locked):**

- Wrapper: `AnimatePresence mode="wait" initial={false}`
- Child: `motion.div` keyed by `state`, variants from `crossfade` (or `crossfadeInstant` when `useReducedMotion()`)
- Results container inside `ready`: optional outer prop `staggerResults?: boolean` — when true, wrap children in `motion.div` with `staggerList` / map rows with `staggerItem` (or opacity-only variants for heavy lists)

**Helper (optional export):** `deriveAsyncPanelState({ enabled, queryLength, minLength, isError, isFetching, resultCount })` — pure function mirroring staff combobox logic; unit-tested.

### 6.3 `SearchField`

New component at `src/components/form/search-field.tsx`.

Extracted from staff combobox input row:

| Element | Implementation |
| --- | --- |
| Input | `@/components/primitives/input` |
| Search icon | Iconoir `Search`, `absolute left-3`, `text-text-muted` |
| Fetch indicator | Iconoir `Refresh` with `animate-spin motion-reduce:animate-none` when `isFetching` |
| Padding | `pl-9 pr-9` when fetch indicator visible; `pl-9` otherwise |
| a11y | `aria-label` from `placeholder` or explicit `ariaLabel` prop |

Props: `value`, `onChange`, `disabled`, `placeholder`, `isFetching`, `className`, standard input passthrough.

### 6.4 Design showcase

Add to `src/app/(design)/components/` (new demo file or extend `_demos/inputs-demo.tsx`):

- Interactive demo cycling `AsyncContentPanel` through all states
- `SearchField` with simulated `isFetching` toggle
- Note in demo copy: import motion from `@/lib/sj/motion.ts` only

---

## 7. Search/form widget migration

### 7.1 `StaffUserSearchCombobox` (reference — finish migration)

**File:** `src/components/form/staff-user-search-combobox.tsx`  
**Consumers:** 1 (`role-assign-tab.tsx`)

| Change | Detail |
| --- | --- |
| Replace inline panel shell | Use `AsyncContentPanel` + `deriveAsyncPanelState` |
| Replace inline input row | Use `SearchField` |
| Replace `ui/skeleton` | `primitives/skeleton` in `StaffUserSearchRowsSkeleton` |
| Replace `ui/checkbox` | `primitives/checkbox` — map `onCheckedChange` to Base UI checkbox API |
| Keep | `useQuery`, debounce, filter params, `renderUserMeta`, stagger on result rows |

Panel state mapping (unchanged behavior):

| Condition | State |
| --- | --- |
| `!enabled` | `idle` — “Choose a role to start searching…” |
| `debouncedSearch.length < 2` | `hint` |
| `isError` | `error` |
| `isFetching && users.length === 0` | `loading` |
| `users.length === 0` | `empty` |
| else | `ready` |

### 7.2 `BackendSearchableCombobox`

**File:** `src/components/form/backend-searchable-combobox.tsx`  
**Consumers:** 4 (checkin-histories, course-student-add-bar, user-schedule, self)

| Current legacy | Replacement |
| --- | --- |
| `ui/popover`, `ui/command`, Lucide icons | `primitives/popover` + list UI composed on primitive patterns (or extend `primitives/combobox` popup list styling) |
| `ui/button` / `buttonVariants` trigger | `primitives/button` for combobox trigger variant; `SearchField` styling for `variant="search"` |
| `Loader` spinner in list | `AsyncContentPanel` with 3–5 row skeleton inside popover |
| `bg-muted-foreground`, `text-muted-foreground` | Semantic tokens: `text-text-muted`, `border-border`, `bg-surface` |

**Motion:**

- Popover surface: CSS `popIn` already on primitive popover/combobox popups (or match existing primitive popup classes)
- List interior: `crossfade` between loading / empty / results (opacity-only if list is long)
- Remove all Lucide imports

**Behavior preserved:** debounce, client-side cache ref, `fetchOptions` callback, `variant="combobox" | "search"`, request-id stale guard.

### 7.3 `EntityCombobox`

**File:** `src/components/form/entity-combobox.tsx`  
**Consumers:** ~30 files (finances, scheduling, filters, course create, etc.)

| Current legacy | Replacement |
| --- | --- |
| `../ui/combo-box` | Internal implementation using `primitives/combobox` patterns + entity-specific option rendering |
| `ui/dialog`, `ui/input`, `ui/label`, `ui/button` for inline create | `primitives/dialog`, `primitives/input`, `primitives/field`, `primitives/button` |
| `ui/use-toast` | `primitives/toast` hook if available, or keep toast import until toast tranche — prefer primitive if hook exists |
| Lucide `Plus` | Iconoir equivalent |

**Behavior preserved:**

- `useGetAllEntitiesQuery` / `getGetAllEntitiesQueryKey` — **no cache key changes**
- `mergeEntityListQueryParams` — still merges `id` into fields
- Inline entity create flow (dialog + mutation + cache invalidation)
- `disabled`, `isSaving`, placeholder, filter params

**Loading UX:**

- Initial open / search: skeleton rows inside popup via `AsyncContentPanel`, not `Loader2` on trigger only
- Trigger shows `primitives/button` `isLoading` when `isSaving`
- Popover list crossfade on state change

### 7.4 `ui/combo-box` stragglers

After `EntityCombobox` migrates, migrate direct importers (~6 files):

- `student-payments-report.tsx`, `course-header.tsx`, `course-zoom-meeting-edit-section.tsx`, `shortcuts/student-data/page.tsx`, `course-subject-field.tsx`, `screenshots/create/page.tsx`

Each either switches to `EntityCombobox` where appropriate or gets a one-off primitive combobox — no new legacy `ui/combo-box` usage.

### 7.5 Deferred: `MultiSelectPopover`

Still on Radix `dropdown-menu`. Out of scope for v1; document as follow-up if a route tranche needs it.

---

## 8. Motion & loading recipes

All values from `@/lib/sj/motion.ts` — **never hand-type durations or easing arrays**.

| Surface type | Enter/exit | Loading | Reduced motion |
| --- | --- | --- | --- |
| Inline results panel (staff search) | `crossfade` on `AsyncContentPanel` state key | Row skeleton + `SearchField` spinner | `crossfadeInstant`; no stagger |
| Popover list (backend/entity) | Primitive popup CSS scale/fade (`popIn` equivalent) | `crossfade` inside list; 3–5 row skeleton | `crossfadeOpacity` inside list |
| Result rows (≤50 items) | `staggerList` + `staggerItem` on ready state | N/A once loaded | `staggerItem` → opacity-only per row |
| Saving on trigger | None | `Button` `isLoading` | Same |

**Banned in this work:**

- Lucide `Loader` / `Loader2` in migrated widgets
- Bare “Loading…” text with no skeleton for initial fetch
- Instant panel content swaps without `AnimatePresence`
- Hand-typed `transition={{ duration: 0.3 }}` in components

**`async-loading-states.mdc` alignment:**

- `aria-busy` on panel container when fetching
- `isLoading` on primary actions during mutations
- Disable conflicting inputs while save in flight (entity create dialog)

---

## 9. Rollout (4 PRs)

| PR | Contents | Verification |
| --- | --- | --- |
| **1 — Infra** | `primitives/skeleton`, `AsyncContentPanel`, `SearchField`, showcase demo, `structured-skeletons` import swap | Unit test for `deriveAsyncPanelState` if exported; showcase renders all states |
| **2 — Staff combobox** | Refactor `StaffUserSearchCombobox` to shared infra | `rg 'ui/(skeleton\|checkbox)' staff-user-search-combobox` → 0; RBAC assign tab manual check |
| **3 — Backend combobox** | Rewrite `BackendSearchableCombobox` | `rg 'lucide-react\|ui/command\|ui/popover' backend-searchable-combobox` → 0 |
| **4 — Entity combobox** | Rewrite `EntityCombobox` + stragglers | `rg 'ui/combo-box' src/components/form/entity-combobox` → 0; `rg 'ui/combo-box' src` → 0 or documented exceptions |

**Per-PR grep checklist:**

```bash
rg '@/components/ui/(skeleton|checkbox)' src/components/form/
rg 'lucide-react' src/components/form/backend-searchable-combobox.tsx src/components/form/entity-combobox.tsx
rg 'AnimatePresence' src/components/form/staff-user-search-combobox.tsx src/components/form/backend-searchable-combobox.tsx src/components/form/entity-combobox.tsx
```

---

## 10. Testing

| Test | Location |
| --- | --- |
| `deriveAsyncPanelState` unit tests | `src/components/loading/async-content-panel.test.ts` (or colocated) |
| Existing `formatStaffUserSecondaryLine` | Unchanged |
| Manual | RBAC assign tab: role gate → hint → loading skeleton → results stagger → empty/error |
| Manual | One finance filter page using `EntityCombobox` — open, search, select, inline create |
| Manual | `BackendSearchableCombobox` on course-student-add-bar |

No E2E requirement for v1 unless an existing playwright spec covers these flows.

---

## 11. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| `EntityCombobox` regression across 30 consumers | Preserve props and query keys; PR 4 is isolated; smoke-test finances + scheduling |
| Base UI checkbox API differs from Radix | Map in staff combobox first; document checked/onCheckedChange mapping |
| Popover + Motion nesting jank | Prefer opacity-only crossfade inside popovers; avoid stagger >50 rows |
| `.sj-root` not on legacy pages | Search widgets on legacy pages still get token-correct skeleton; full token fidelity requires parent `.sj-root` — document for consumers |

---

## 12. Follow-ups (separate specs)

- Global `ui/button` → `primitives/button` migration
- `MultiSelectPopover` → `primitives/menu`
- `primitives/badge` for status labels
- Greenfield data-table replacing `ui/data-table`
- Delete `ui/skeleton`, `ui/combo-box`, `ui/command` when import count hits zero
