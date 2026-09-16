# Combobox Search-First Presentation

**Date:** 2026-07-11  
**Status:** Approved (design); implementation pending  
**Author:** brainstorming session  
**Scope:** Open-state presentation of shared popover comboboxes so search is the primary affordance users notice.

## 1. Summary

Users open Course (and sibling) comboboxes, miss the in-popup `SearchField`, try to scroll a dense option list, and feel stuck. The closed trigger and filtering behavior are fine; the open popup’s search chrome blends into the list.

This change keeps full filtered results under search (Approach C) but makes the search band visually primary (Approach 1), applied across both shared popover comboboxes.

## 2. Context

| Piece | Role today |
| --- | --- |
| `EntityComboboxList` | Client-filtered options; `SearchField` in popup header; `AsyncContentPanel` `stableHeight="popover"` |
| `BackendSearchableCombobox` | Debounced backend fetch; same popup chrome pattern |
| `SearchField` | Shared input + search icon + optional fetching spinner |

Observed failure mode: search row shares surface color with list rows; placeholder often equals the field label (`Course`), so the focused input reads as another list header rather than “type to find.”

## 3. Decisions

| Topic | Choice |
| --- | --- |
| Open intent | **A — type to search**; list is secondary |
| Empty query | **C — still show full filtered results**; elevate search UI |
| Scope | **A — `EntityComboboxList` + `BackendSearchableCombobox` only** |
| Approach | **1 — emphasize search in the popup** (not trigger-morph, not list-first) |
| Closed trigger | Unchanged |
| Fetch / filter / panel states | Unchanged |

## 4. Goals

- On open, users immediately recognize they can type to filter.
- Search is focused on open; copy and layout reinforce that.
- Both shared comboboxes stay visually aligned via one header fragment.
- No change to selection, deselect, debounce, cache, or loading/empty/error semantics.

## 5. Non-goals

- Morphing the closed trigger into the search field while open (Approach 2).
- Requiring a non-empty query before showing results (strict search-first empty state).
- Changing Command-based pickers, import grids, or other popovers.
- Changing list height / scroll policy (`max-h-48` popover panel stays).
- New keyboard shortcuts.

## 6. Open-state presentation

```
┌──────────────────────────────┐
│ 🔍 Search Course…            │  taller hero SearchField
│ Type to filter the list      │  empty-query hint only
├──────────────────────────────┤
│   April 2026 Level 3         │
│ ✓ CAE 31 WE// 12-1:30 PM     │
│   …                          │
└──────────────────────────────┘
```

Rules:

1. **Hero search row** — taller field, clearer search icon, more padding so it does not read as a list row.
2. **Placeholder** — default `Search {label}…` (e.g. `Search Course…`). Explicit `placeholder` prop wins when passed.
3. **Separation** — search sits in its own chrome band above the scrollable list (keep/strengthen header divider).
4. **Hint** — when the query is empty (trim length 0): muted line `Type to filter the list`. Hide once the user types any non-empty text.
5. **Focus** — ensure the search input receives focus when the popup opens (add `autoFocus` if not already wired).

## 7. Components

| Unit | Responsibility |
| --- | --- |
| `ComboboxSearchHeader` (new, small) | Shared popup header: hero `SearchField` + optional empty-query hint + band chrome. Used by both comboboxes. |
| `SearchField` | Support taller hero styling via className or a small size variant if needed. |
| `EntityComboboxList` | Swap inline search header for `ComboboxSearchHeader`; wire filter state + placeholder rules. |
| `BackendSearchableCombobox` | Same header swap for the popup search band (including `variant="search"` popup — trigger chrome stays as today). |

Out of scope files: closed-trigger styling, `AsyncContentPanel` height constants, Command pickers.

## 8. Copy & a11y

- Visible placeholder: `Search {label}…` unless overridden.
- `aria-label`: default to `Search {label}` (same wording as the placeholder, without requiring the ellipsis) — do not rely on placeholder alone. Explicit `ariaLabel` on `SearchField` still wins when passed.
- Hint is visible helper text; not the control’s accessible name (decorative/`aria-hidden` is fine if it would otherwise confuse SRs).
- Focus order unchanged: search → list items.
- Keyboard behavior unchanged.

## 9. Edge cases

- Explicit `placeholder` prop overrides the `Search {label}…` default.
- Spaces-only query counts as empty → keep hint.
- Long option labels: continue truncating list rows; input uses normal placeholder ellipsis.
- Loading / empty / error content remains below the search band, unchanged.
- Selection, deselect, and close-on-pick unchanged.

## 10. Verification

- Manual: open a Course `EntityCombobox` filter; confirm hero search + hint show/hide; filter still works.
- Manual: open one `BackendSearchableCombobox`; same presentation; fetch-on-type still works.
- Optional: lightweight unit/render check for default placeholder and empty-query hint if easy; no new suite required (none exist for these widgets today).

## 11. Success criteria

- Spot-check users (or internal dogfood) no longer report “I couldn’t scroll / didn’t see search” as the first reaction.
- Both shared combobox open states look like the same search-primary pattern.
- No regressions in select / clear / loading / empty / error paths.
