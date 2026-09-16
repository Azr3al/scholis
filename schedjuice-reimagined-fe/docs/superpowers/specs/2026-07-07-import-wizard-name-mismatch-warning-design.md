# Import Wizard — Name Mismatch Warning for Secondary-Field Matches

**Date:** 2026-07-07  
**Status:** Design approved, pending spec review  
**Scope:** `schedjuice-reimagined-fe` (import wizard review step only)

## Problem

When the import wizard matches an existing user via a **non-primary** field (`communication_email`, `phone_number`, or `emergency_contact_phone_number`), the match may be a **sibling** who shares a family phone or secondary email — not the student being imported.

Example from production imports:

| Imported name | Matched user | Likely match field |
|---|---|---|
| Mi Pakao Htaw | Mehm Samoi Htaw | shared phone |
| Poe Yati Thant | Poe Theingi Kyaw | shared phone/email |

Today these appear as normal exact matches (amber `confirm?` chip). Admins can bulk-confirm them without noticing the name discrepancy, incorrectly linking a sibling's account.

## Goals / Non-Goals

**Goals**

- When an exact match comes from a non-primary DB field **and** the imported name differs from the matched user's name, show a **yellow warning chip** instead of the normal amber pending chip.
- Require **individual review** — exclude these rows from "Confirm all exact matches."
- Let the admin **unmatch** via the existing "Create new" action in the match popover.
- Use a **strict but normalized** name comparison (lowercase, trim, collapse whitespace) — not fuzzy, because siblings often share surnames.

**Non-Goals**

- No backend changes (match `field` is already returned by `POST /users/match-bulk`).
- No warning for primary-email matches (`field === "email"`), even when names differ.
- No post-confirm unmatch (mismatches stay pending until explicitly confirmed or rejected).
- No fuzzy name matching or partial-name similarity checks.
- No use of `alternative_name` column for comparison (only mapped `name` field).

## Decisions Captured (from brainstorming)

| Question | Decision |
|---|---|
| When to show yellow? | Only when names **differ** after normalization on non-primary-field matches |
| Missing/empty imported name? | Skip name check → normal exact-match flow |
| Bulk "Confirm all exact"? | **Exclude** name-mismatch rows |
| Implementation approach | **Approach 1** — `nameMismatch` flag on existing `pending_match` status |

## Current State

- `buildUserMatches()` in `resolution.ts` sets `pending_match` for exact hits but **drops** the backend `field` value.
- Spreadsheet `name` column is never compared to matched user names.
- Chip colors: blue (`confirmed`), amber (`pending_match` via `attn`), no yellow variant.
- `confirmAllExactMatches()` confirms every `pending_match` row with no filtering.
- Unmatch before confirm: `rejectUserMatch()` → `new` ("Create new" in popover). No unmatch after confirm.

## Design

### 1. Trigger conditions

Yellow warning applies when **all** of the following are true:

1. Exact match found (`kind === "exact"`)
2. Backend match field is **not** primary email: `field !== "email"`  
   (i.e. `communication_email`, `phone_number`, or `emergency_contact_phone_number`)
3. Spreadsheet `name` column is mapped **and** the row's name cell is non-empty
4. Normalized imported name ≠ normalized matched user name

If any condition is false → normal amber `pending_match` flow (eligible for bulk confirm when other conditions met).

Primary email matches never receive the yellow warning regardless of name difference.

### 2. Name comparison

```typescript
function normalizeImportName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}
```

Compare:

- `normalizeImportName(importedName)` from the mapped `name` column
- `normalizeImportName(matchedUser.name)` from the backend user ref

**Match** → no warning. **Mismatch** → `nameMismatch: true`.

No Levenshtein or token-overlap fuzzy logic. Siblings frequently share surnames (e.g. both end in "Htaw"); partial similarity must not suppress the warning. Minor typos ("Jon" vs "John") will also warn — acceptable for this conservative fallback.

### 3. Data model

Extend `CellResolution` in `resolution.ts`:

```typescript
type CellResolution = {
  status: CellStatus;
  entityRef?: { id: number; label: string };
  candidates?: UserMatchCandidate[];
  confirmedUserId?: number;
  matchField?: string | null;   // NEW — backend field from exact match
  nameMismatch?: boolean;       // NEW — true when yellow warning applies
};
```

Extend `UserLinkCellData` in `cells/types.ts`:

```typescript
nameMismatch?: boolean;  // passed to canvas renderer
```

### 4. Match building (`buildUserMatches`)

Changes in `resolution.ts`:

1. When an exact match is selected, persist `exact.field` as `matchField`.
2. Resolve the name column index from the row mapping (`field_key === "name"`).
3. If name column exists and row name is non-empty:
   - Compute `nameMismatch = (matchField !== "email") && (normalizeImportName(imported) !== normalizeImportName(matchedUser.name))`
4. Otherwise leave `nameMismatch` undefined/false.

Export `normalizeImportName` for unit testing.

**Call-site update:** `buildUserMatches` gains parameters for name column index (or mapping + rows already available). Update callers in `use-resolution.ts` and `resolve-import-rows.ts`.

### 5. UI / visual

#### Chip colors

Add to `LinkColors` in `glide-theme.ts`:

| Token | Light | Dark |
|---|---|---|
| `warnBg` | `#fefce8` | `#3d3818` |
| `warnBorder` | `#fde047` | `#6b6020` |
| `warnText` | `#854d0e` | `#f0d878` |

Extend `drawChip()` with `opts.warn?: boolean` — uses warn palette (same layout as `attn` / default).

#### Grid cell (`user-link-cell.tsx`)

For `pending_match`:

| `nameMismatch` | Chip text | Color |
|---|---|---|
| `false` / undefined | `{name} confirm?` | Amber (`attn`) |
| `true` | `{name} confirm?` | **Yellow (`warn`)** |

Confirmed and other states unchanged.

#### Popover (`user-match-popover.tsx`)

When `cell.nameMismatch === true`:

- Show warning banner: **"Possible sibling — matched via {field label}"**
  - Field labels: `communication_email` → "communication email", `phone_number` → "phone number", `emergency_contact_phone_number` → "emergency contact phone"
- Show imported name vs matched user name:
  - `Import: {importedName}`
  - `Matched: {entityRef.label}`
- Actions unchanged: **Create new** (unmatch) | **Confirm**

Imported name is passed into the popover target from the review step (already has row data).

#### Side panel (`user-matches-panel.tsx`)

- "Confirm all exact matches (N)" count excludes `nameMismatch === true` rows.
- Optional: show secondary line when count > 0 — e.g. "2 possible sibling matches need review" (counts `nameMismatch` pending rows).

### 6. Bulk confirm & import gating

**`confirmAllExactMatches()`** — skip cells where `nameMismatch === true`.

**`countPendingExactMatches()`** — exclude `nameMismatch === true` from the bulk-action count.

**Import gating** — unchanged. Yellow rows remain `pending_match`; import stays blocked until admin confirms or rejects each one individually.

### 7. File-level change map

**Frontend only (`schedjuice-reimagined-fe`)**

| File | Change |
|---|---|
| `src/lib/imports/resolution.ts` | `normalizeImportName`, extend `CellResolution`, update `buildUserMatches`, filter bulk confirm/count helpers |
| `src/lib/imports/resolution.test.ts` | Unit tests for name mismatch logic and bulk-exclude |
| `src/hooks/imports/use-resolution.ts` | Pass name column index to `buildUserMatches` |
| `src/lib/imports/resolve-import-rows.ts` | Same name column pass-through on re-resolve |
| `src/components/import-grid/cells/types.ts` | Add `nameMismatch` to `UserLinkCellData` |
| `src/components/import-grid/cells/draw-helpers.ts` | Add `warn` option to `drawChip` |
| `src/components/data-sheet/lib/glide-theme.ts` | Add warn color tokens |
| `src/components/import-grid/cells/user-link-cell.tsx` | Yellow chip when `nameMismatch` |
| `src/components/import-grid/import-data-grid.tsx` | Pass `nameMismatch` into cell data |
| `src/components/import-grid/user-match-popover.tsx` | Warning banner + name comparison display |
| `src/components/import-grid/user-matches-panel.tsx` | Exclude mismatch from bulk count; optional sibling count |

**Backend:** no changes.

### 8. Testing

**Unit tests (`resolution.test.ts`):**

- Phone match + different names → `nameMismatch: true`, `matchField: "phone_number"`
- Communication email match + same name (case/whitespace diff) → `nameMismatch: false`
- Primary email match + different names → `nameMismatch: false`
- No name column mapped → `nameMismatch: false`
- Empty name cell → `nameMismatch: false`
- `confirmAllExactMatches` skips mismatch rows; confirms non-mismatch rows
- `countPendingExactMatches` excludes mismatch rows

**Manual QA:**

- Import sheet with siblings sharing phone → yellow chips on name mismatch
- Bulk confirm does not touch yellow rows
- "Create new" on yellow row → `new` status
- Confirm on yellow row → `confirmed` (admin override)
- Row with matching names via phone → normal amber chip, bulk-confirmable

## Risks

- Strict name equality may warn on legitimate name changes (married name, preferred name). Acceptable — admin can still confirm manually.
- Re-resolve after editing a name cell should re-run `buildUserMatches` (existing paste/edit flow already re-resolves); `nameMismatch` recomputed fresh.
