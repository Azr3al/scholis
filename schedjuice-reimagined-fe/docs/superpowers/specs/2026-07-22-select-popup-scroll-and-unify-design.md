# Select popup scroll + unified primitive styling

**Date:** 2026-07-22  
**Status:** Approved design (Approach 1)  
**Scope:** Frontend (`schedjuice-reimagined-fe`)

## Problem

Long option lists in Select open menus that grow nearly as tall as the viewport (`max-h-[var(--available-height)]`) and can grow very wide because item labels use `whitespace-nowrap`. That makes menus feel like full-page panels instead of compact scrollable popovers.

Product Selects already funnel through one Base UI primitive (`components/primitives/select.tsx`) and wrappers (`Selector`, `EntitySelect`, `TimeSelect`, month/year/timezone selectors). Combobox already caps height at `20rem` but Select does not share that contract.

## Goals

- Open Select menus scroll instead of becoming very tall.
- Open Select menus do not become very wide; width stays within available space.
- One Select primitive remains the stylistic source for all Select UIs; wrappers keep deriving from it.
- Combobox popup height aligns with the same shared sizing tokens (slightly taller than today).

## Non-goals

- Compound shadcn-style `Select` / `SelectContent` API refactor.
- Merging Combobox into Select (search UX stays separate).
- Restyling near-misses: `multi-select-popover`, payment `CommandList` popovers, native calendar `<select>`.
- Call-site one-off `max-h` / `max-w` patches for individual long lists.
- Changing trigger sizing, payment-status min-width floors, or Select controlled-value behavior.

## Decisions

| Topic | Choice |
|-------|--------|
| Approach | Shared popup layout helpers in `select-layout.ts`; Select + Combobox consume them |
| Max height | `min(24rem, var(--available-height))` for Select and Combobox |
| Max width | Cap at available width; grow for full labels up to that cap; truncate only if still overflowing |
| Scope | Select primitive + wrapper audit; Combobox shares popup tokens only |

## Architecture

```
select-layout.ts
  ├── selectTriggerClassName / selectValueClassName (existing)
  └── select popup helpers (new) — max-height, max-width, overflow
         ↓
primitives/select.tsx     ← only Select chrome
primitives/combobox.tsx   ← same height/width tokens; not a Select
         ↓
Selector / EntitySelect / TimeSelect / Month|Year|Timezone selectors
```

## Popup sizing

### Select

| Rule | Behavior |
|------|----------|
| Height | `max-h-[min(24rem,var(--available-height))]` + `overflow-y-auto` |
| Min width | ≥ trigger (`min-w-[var(--anchor-width)]`) |
| Max width | ≤ `var(--available-width)`; content may grow between min and max so full labels show when space allows |
| Item text | Do not force unbounded horizontal growth; within the max-width cap prefer full labels; truncate only past the cap |

### Combobox

| Rule | Behavior |
|------|----------|
| Height | Same `24rem` / available-height token as Select (replace current `20rem`) |
| Width | Keep trigger-matched width + `max-w-[var(--available-width)]`; prefer expressing via shared helpers |

### Unchanged

- Closed trigger: truncate / single-line value behavior from existing select-layout work.
- Payment status cell floor (`PAYMENT_STATUS_SELECT_MIN_WIDTH_CLASS`) and table `fullWidth` trigger rules.
- Positioner alignment (`align="start"`, modal overlay z-index helpers).

## Lofi

```
┌─ trigger ───────────────────────┐
│  Selected label…            ▾  │
└────────────────────────────────┘
         │
         ▼
┌─ popup ────────────────────────┐  width: ≥ trigger, ≤ available
│  Option A                      │  height: min(24rem, available)
│  Option B                      │  overflow-y when list is long
│  …                             │
│  (scroll)                      │
└────────────────────────────────┘
```

## File changes

1. **`src/lib/ui/select-layout.ts`**  
   Export shared popup class helpers (max-height `24rem` + available height; max-width / overflow contract used by Select and Combobox).

2. **`src/components/primitives/select.tsx`**  
   Apply popup helpers on `BaseSelect.Popup`; adjust item text classes so long labels respect the width cap (truncate only past the cap).

3. **`src/components/primitives/combobox.tsx`**  
   Use the same max-height helper (and max-width helper where it replaces duplicated classes).

4. **`src/lib/ui/select-layout.test.ts`**  
   Assert shared tokens: `24rem`, available-height, and max-width / overflow pieces of the contract.

5. **Audit only (no restyle forks)**  
   Confirm product Selects import `@/components/primitives` `Select` or a wrapper that does. Document any stray usage found; do not expand scope to CommandList / native calendar selects in this pass.

## Testing

Prefer high-value checks:

- Unit: popup helpers include `24rem` and available-height / available-width caps.
- Manual: long list (e.g. EntitySelect / many options) scrolls inside ~24rem; narrow viewport does not produce a page-tall or page-wide menu; Combobox list height matches Select.

No happy-path-only “renders Select” smoke tests.

## Success criteria

- Opening a Select with many options scrolls within a capped height (~24rem or less if viewport is smaller).
- Opening a Select with long labels does not stretch the menu past available width; labels stay readable up to the cap, then truncate.
- Combobox open list uses the same height ceiling.
- No second Select styling implementation introduced; wrappers continue to derive from the one primitive.
