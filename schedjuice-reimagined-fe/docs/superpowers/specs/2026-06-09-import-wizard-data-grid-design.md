# Import Wizard & Linkable Data Grid — Design

**Date:** 2026-06-09
**Status:** Approved design (pending spec review)
**Repos:** `schedjuice-reimagined-fe` (frontend), `schedjuice-reimagined-be` (backend)

## Summary

Introduce a reusable, Excel-like data grid (Glide Data Grid) and build its first
consumer: an **Import Wizard** page where a school admin uploads an Excel file to
import entities. The first supported entity is **Users**.

Certain columns are "special" and auto-**link** to existing records:

- **Email** → resolves to an existing user (exact match). Found = linked (this row
  would later update that user); not found = a brand-new user (valid, unlinked).
- **Courses** → each row's course cell may contain one or more course references
  (comma-separated). Each is fuzzy-resolved to a course; confident matches auto-link,
  ambiguous ones enter a **needs-attention** state where the admin picks from a
  narrowed candidate list.

While resolving, special cells show a **text shimmer** over their real value
(mimicking the AI "thinking" effect). On resolve they snap to a **linked chip**
(avatar + check) or an **amber "choose" chip**.

All user/course lookups are performed in **bulk** to avoid N+1 queries.

### Scope of this iteration

In scope: upload → server-side parse → column mapping → grid render → bulk
resolution + linking UX (shimmer / linked / needs-attention / new) → course
disambiguation popover.

**Out of scope (next iteration):** the final "commit/import" that creates/updates
users and enrollments. The page ends at a fully-linked, reviewed grid. A disabled
"Import" button + a documented `commit()` seam mark the extension point.

## Decisions (from brainstorming)

| Topic | Decision |
|---|---|
| Finish line | Up to linking only; no DB commit this iteration |
| Column identification | Explicit mapping step, auto-guessed by header name, admin-adjustable |
| Email link meaning | Existing-user detection; found → linked (future update), not-found → new |
| Course column | Multiple courses per row possible (comma-separated tokens), each resolved |
| Backend scope | New bulk-resolution endpoints (BE) + wizard (FE) |
| Excel parsing | Server-side via `openpyxl`, returns structured headers/rows |
| Scale | Small (~1k rows, ~dozen columns); snappy UX, don't over-engineer |
| Cell visual language | "Chips & badges" (Direction A) |
| Shimmer | Text-only shimmer over the real cell value (canvas-drawn) |
| Course matching | Approach 1 — in-memory match vs tenant catalog (one query/tier) |
| Matching heuristics | Two-tier recency fallback (≤2yr → older); exclude `ended` from Tier 1; strip year-suffix when matching (recommended). Intake-priority, token-prefilter, campus = future toggles |
| Multi-sheet files | Sheet selector in the Map step when >1 sheet |
| Fuzzy lib | `rapidfuzz` (fallback: stdlib `difflib`) |

## User flow

Single page with progressive steps (not multi-route):

1. **Select entity** — dropdown top-left. `Users` enabled; other entities visible but
   disabled ("coming soon"). Drives field schema + which columns are special.
2. **Upload** — `react-dropzone` accepting `.xlsx`/`.xls`. On drop, POST to the parse
   endpoint; show a "Parsing…" state (DOM `TextShimmer`).
3. **Map columns** — show detected headers + ~5 preview rows; if multiple sheets,
   show a sheet selector. Each uploaded column maps → a known Users field, auto-guessed
   by header-name similarity. Email + Courses are tagged "special (auto-links)".
   Required field (email) must be mapped to proceed.
4. **Review & link** — Glide grid renders the full dataset. Special cells enter the
   resolving (shimmer) state; bulk resolution fires; cells settle into
   linked / needs-attention / new. Admin resolves amber course chips via the popover.
   A summary header shows counts. "Import" button present but **disabled** this
   iteration.

## Frontend architecture (`schedjuice-reimagined-fe`)

### Packages

- `@glideapps/glide-data-grid` + `@glideapps/glide-data-grid-cells`
  (`npm install --legacy-peer-deps`). Import Glide CSS once; grid needs a sized parent.
- **Risk / first task:** verify Glide renders on React 19. Spike with a static dataset
  before building anything else; if there's friction, pin/patch or add a compat shim.

### Modules

- `src/app/(internal)/imports/page.tsx` — wizard page in the internal app shell.
- `src/components/import-grid/`
  - `ImportDataGrid.tsx` — wraps Glide `DataEditor`. Column defs from the confirmed
    mapping. `getCellContent(col,row)` combines the raw parsed value with the per-cell
    resolution state to emit a normal or custom cell.
  - `cells/user-link-cell.tsx` — custom canvas cell for the email column: shimmer /
    linked chip (avatar + check) / "new user" tag.
  - `cells/course-link-cell.tsx` — custom canvas cell for the courses column
    (multi-value): splits raw value into tokens, each with its own sub-state; draws one
    chip per token; aggregate state is "worst-of" (any unresolved → amber).
  - `course-picker-popover.tsx` — Radix `Popover` anchored to the cell rect; shows the
    raw value, an editable search box, ranked candidates (code, academic year,
    enrollment count, match %), a "no course" clear, and `↵`-accepts-top.
- `src/components/import-wizard/` — entity dropdown, dropzone, mapping step UI.
- `src/store/import-store.ts` — Zustand store (source of truth for per-cell state).
- `src/app/client-api/imports.ts` — `parseImport`, `resolveUsersBulk`,
  `resolveCoursesBulk` wrappers (axios, matching existing client-api conventions).

### State model (`import-store.ts`)

```ts
type CellResolution = {
  status: 'idle' | 'resolving' | 'linked' | 'needs_attention' | 'new' | 'error';
  entityRef?: { id: number; label: string };          // user or chosen course
  tokens?: CourseToken[];                              // course cells (multi)
};
type CourseToken = {
  raw: string;
  status: 'resolving' | 'linked' | 'needs_attention' | 'none';
  match?: { id: number; title: string };
  candidates?: { id: number; title: string; code?: string; score: number }[];
};

interface ImportState {
  entity: 'users';
  parse?: { sheetNames: string[]; activeSheet: string; headers: string[];
            rows: (string | number | null)[][]; rowIds: string[]; rowCount: number };
  mapping: Record<string /*uploadedColumn*/, string /*fieldKey*/ | null>;
  resolution: Map<string /*`${rowId}:${field}`*/, CellResolution>;
}
```

### Resolution orchestration (N+1-safe)

- On entering Review:
  - Collect **all unique, valid emails** across rows → one `resolveUsersBulk` call.
  - Collect **all unique course tokens** (split + deduped across rows) → one
    `resolveCoursesBulk` call.
  - We never request the same value twice; a result fans out to every cell sharing it.
- Set affected cells to `resolving` immediately (shimmer starts). On response, write
  resolutions into the store; the grid re-renders.
- Wrapped in TanStack Query mutations. Errors flip affected cells to `error` with retry.

### Shimmer on canvas

A `requestAnimationFrame` loop calls `gridRef.current.damage([...resolvingCells])`
with a time-based offset; the custom draw uses `ctx.createLinearGradient` over the
text bounds (transparent → highlight → transparent over a muted base) to replicate the
provided `TextShimmer`. The loop starts when any cell is `resolving` and stops when
none are (no idle repaint). The DOM `TextShimmer` is reused for the parse/loading state
outside the grid.

### Theme

Map Glide's theme object to the app's existing CSS variables (light/dark parity).

## Backend architecture (`schedjuice-reimagined-be`)

All endpoints are **admin-only** and tenant-scoped via the existing `X-Tenant`
middleware. Versioned under `/api/v1/`.

### 1. Parse — `POST /imports/parse`

- Input: multipart `file` + `entity`.
- Output: `{ sheet_names, active_sheet, headers, rows, row_count }`.
- `openpyxl.load_workbook(data_only=True)`. **Stateless** (no persistence this
  iteration). Guards: max upload size, max-row cap (~5k). When `len(sheet_names) > 1`,
  the client shows a sheet selector and may re-request a specific sheet.

### 2. Bulk user resolution — `POST /users/resolve-bulk`

- Input: `{ emails: string[] }`.
- Output: `{ results: { [email]: UserRef | null } }`, where
  `UserRef = { id, name, email, code, profile_image, roles }`.
- One query: `User.objects.filter(email__in=normalized)` (emails normalized via the
  existing `normalize_email`). N+1-free; asserted with `assertNumQueries`.

### 3. Bulk course resolution — `POST /courses/resolve-bulk`

- Input: `{ names: string[] }`.
- Output: `{ results: { [rawName]: { status, match?, candidates } } }` where
  `status ∈ 'linked' | 'needs_attention' | 'none'` and
  `candidates = [{ id, title, code, academic_year, student_count, score }]`.
- Algorithm (Approach 1):
  1. Load Tier-1 catalog **once**: exclude `ended` / `status_override = ended`;
     `end_date ≥ today − 2yr`. Select only fields needed for matching/display.
  2. Normalize titles (strip `- Academic Year YYYY-YYYY` suffix; light abbreviation
     expansion) and normalize input names.
  3. Fuzzy-rank all deduped names against the in-memory set (`rapidfuzz`).
  4. Per name: top ≥ `HIGH` and clear margin over 2nd → `linked`; else top ≥ `LOW` →
     `needs_attention` + top-K candidates; else widen to **Tier 2** (older/ended,
     one more query) and repeat; else `none`.
- One catalog query per tier regardless of name count. Thresholds in settings.
- Future toggles (not built now): current-intake priority, token/trigram prefilter,
  campus scoping.

### Dependency

Add `rapidfuzz` to backend requirements (small, fast, high-quality). Fallback if
rejected: stdlib `difflib.SequenceMatcher` (no new dep, lower quality).

## Error handling & edge cases

- **Parse:** corrupt/unsupported file → 400 with clear message; duplicate/blank header
  cells surfaced in the mapping step; over row cap → 400.
- **Mapping:** email unmapped → block "Review"; two columns → same field → warn.
- **Resolution:** invalid email format → `error` cell (excluded from the bulk call);
  blank email/course cell → neutral/inert; duplicate emails in-file → share one
  resolution (visible dupe-flagging deferred); backend failure → `error` + retry.
- **Course:** no match even in Tier 2 → `needs_attention` with empty candidate list but
  a working manual search box (reuses the existing course search).

## Testing

- **Backend (pytest):**
  - `imports/parse`: fixture xlsx incl. a trimmed SDEC-style multi-sheet sample;
    header/row extraction; multi-sheet listing; guard limits.
  - `users/resolve-bulk`: normalization, found/not-found mapping, and `assertNumQueries`
    to prove no N+1.
  - `courses/resolve-bulk`: tiering + fallback, thresholds, year-suffix normalization,
    ranking/candidate ordering — deterministic.
- **Frontend (vitest):** store logic — resolution fan-out + dedupe, mapping auto-guess,
  course-token splitting, aggregate "worst-of" cell state. Canvas rendering gets a light
  smoke test only.

## Reference

- Offline analogue already in the codebase:
  `schedjuice-reimagined-be/app_auth/management/commands/import_sdec_students.py`
  (bulk `email__in` lookups, ambiguous/no-match handling, bulk_create/bulk_update).
- Existing search infra: `app_auth/user_search.py`, `app_course/course_search.py`,
  `users/suggest`, `useCourseSearch`, `searchEntities`.
- Visual language mockups: `.superpowers/brainstorm/.../content/` (cell states, picker).
