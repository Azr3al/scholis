# Import Wizard — Paste from Excel on Upload Step

> Add a "Paste from Excel" tab alongside file upload on the Import wizard upload step, with live preview and client-side parsing.

**Status:** Design approved (brainstorming 2026-07-07).
**Related:**
- `upload-step.tsx` — current file-only upload UI
- `paste-import-row-panel.tsx` — existing review-step row append (unchanged)
- `parse-excel-paste.ts` — existing TSV parser (extended for this feature)

---

## 1. Context

The Import wizard (`/imports`) is a three-step flow: **upload → map → review**. The upload step currently accepts only file drop/choose; pasted data is sent to `POST imports/parse` for server-side parsing via openpyxl/csv.

Paste support already exists on the **review** step via `PasteImportRowPanel`, but only to append rows after a file has been uploaded and columns mapped. Users who copy rows directly from Excel must save to a file first — an unnecessary step for small imports.

---

## 2. Goals

1. **Paste tab on upload step** — users can paste tab-separated Excel data directly, alongside the existing file upload option.
2. **Live preview** — show parsed headers and data rows before continuing to mapping.
3. **Same wizard flow** — pasted data produces the same `ParseResult` shape as file upload and proceeds through map → review → commit unchanged.

## 3. Non-Goals

- Removing or replacing file upload (both tabs remain)
- Backend changes or new API endpoints
- Consolidating upload-step paste with review-step `PasteImportRowPanel` into one component
- CSV file paste (clipboard is always TSV from Excel; file upload still handles `.csv`)
- Multi-sheet support for pasted data

---

## 4. Locked Decisions

| # | Decision | Choice |
| --- | --- | --- |
| 1 | Approach | Client-side paste tab in `UploadStep` (Approach A) |
| 2 | Tab layout | Two tabs: **Upload file** (default) \| **Paste from Excel** |
| 3 | Header row | First pasted row becomes column headers |
| 4 | Preview | Live preview table + Continue button on paste tab |
| 5 | Default tab | Upload file |
| 6 | Review-step paste panel | Keep unchanged (append rows mid-review) |
| 7 | Row limit | 5000 data rows (matches backend `IMPORT_PARSE_MAX_ROWS`) |
| 8 | Sheet metadata | `sheetNames: ["Pasted"]`, `activeSheet: "Pasted"` |

---

## 5. UI — Upload Step

### 5.1 Tab structure

Use existing shadcn `Tabs` (`@/components/ui/tabs`). Default tab: `upload`.

```
┌─────────────────────────────────────────┐
│  [Users ▼]                              │
│                                         │
│  ┌──────────────┬───────────────────┐ │
│  │ Upload file  │ Paste from Excel  │   │
│  └──────────────┴───────────────────┘ │
│  (tab content)                          │
└─────────────────────────────────────────┘
```

### 5.2 Upload file tab

No changes to current behavior:
- `react-dropzone` dropzone with "Drag an Excel or CSV file here"
- "Choose file" button
- Parses via `parseImport(file)` → backend

### 5.3 Paste from Excel tab

| Element | Details |
| --- | --- |
| Instruction | "Copy rows from Excel and paste below. The first row should be column headers." |
| Textarea | Monospace, `min-h-[160px]`, placeholder: "Paste tab-separated values from Excel…" |
| Preview table | Headers + data rows, scrollable (`max-h-[240px]`), same table styling as `PasteImportRowPanel` |
| Row count | "N rows ready" when N ≥ 1 data row |
| Warnings | Amber text for column width mismatches |
| Continue button | Bottom-right; disabled until valid paste (≥1 header row + ≥1 data row, no blocking errors) |

### 5.4 Page copy updates

Update `imports/page.tsx` header description from:

> Upload an Excel or CSV file to import users.

To:

> Upload a file or paste rows from Excel to import users. Email and course cells link automatically.

Update "Discard & choose another file" button to "Discard import" (works for both paste and file paths; no file may exist).

---

## 6. Parsing Logic

### 6.1 New function

Add `parseExcelPasteWithHeaders(text, maxRows?)` to `parse-excel-paste.ts`:

```typescript
export type ParseExcelPasteWithHeadersResult = {
  headers: string[];
  rows: (string | null)[][];
  warnings: string[];
  error: string | null;
};
```

**Algorithm:**

1. Split on `\r?\n`, trim trailing whitespace per line, filter empty lines.
2. If no lines → `{ headers: [], rows: [], warnings: [], error: null }` (Continue disabled).
3. Line 1 → headers (tab-split, trim each cell; empty cells become `""`).
4. Lines 2+ → data rows (tab-split, trim; pad narrow rows with `null`, truncate wide rows with warning).
5. If headers exist but zero data rows → `error: "No data rows found"`.
6. If data rows exceed `maxRows` (default 5000) → `error: "Exceeds maximum of 5000 rows"`.

Reuse existing helpers `normalizeLineCells` and `normalizeRowWidth` where applicable.

### 6.2 Build ParseResult on Continue

```typescript
const parseResult: ParseResult = {
  sheetNames: ["Pasted"],
  activeSheet: "Pasted",
  headers: parsed.headers,
  rows: parsed.rows,
  rowCount: parsed.rows.length,
};
```

### 6.3 Post-parse store actions

Mirror file upload success path in `upload-step.tsx`:

1. `setParse(parseResult)` — do **not** call `setLastFile` (no file)
2. `findRememberedImport(parseResult.headers)` — apply remembered mapping/role if match
3. `setStep("map")`

Extract shared "apply parse result to store" logic into a small helper within `upload-step.tsx` to avoid duplication between file and paste paths.

---

## 7. Error Handling

| Case | Behavior |
| --- | --- |
| Empty textarea | Continue disabled, no error |
| Header row only | Continue disabled; hint: "Add at least one data row below the header" |
| Row wider than headers | Warning per row; truncate to header width |
| Row narrower than headers | Pad with `null` |
| > 5000 data rows | Error message; Continue disabled |
| Duplicate/blank headers | Allowed (same as file upload) |
| Non-TSV text (no tabs) | Still parse as single-column; no special error |

---

## 8. Files to Change

| File | Change |
| --- | --- |
| `src/components/import-wizard/upload-step.tsx` | Add tabs, paste tab UI, Continue handler |
| `src/lib/imports/parse-excel-paste.ts` | Add `parseExcelPasteWithHeaders` |
| `src/lib/imports/parse-excel-paste.test.ts` | Tests for new function |
| `src/app/(internal)/imports/page.tsx` | Update header description and discard button label |

**Unchanged:** `paste-import-row-panel.tsx`, backend, `import-store.ts`, map/review steps.

---

## 9. Testing

### 9.1 Unit tests (`parse-excel-paste.test.ts`)

| Case | Expected |
| --- | --- |
| Empty input | Empty headers/rows, no error |
| Header + 1 data row | Correct headers and row |
| Header + multiple rows | All rows parsed |
| Wide row | Warning + truncated |
| Narrow row | Padded with null |
| Header only | Error: no data rows |
| 5001 data rows | Error: exceeds max |
| CRLF line endings | Parsed correctly |
| Empty header cells | Preserved as `""` |

### 9.2 Manual test plan

1. Open `/imports` — Upload file tab is default, dropzone works as before
2. Switch to Paste tab — paste header + rows from Excel → preview appears
3. Click Continue → map step shows correct headers
4. Complete import → users created as expected
5. Paste tab with header only → Continue stays disabled
6. Paste 5001+ rows → error shown, Continue disabled
7. Remembered import mapping applies when pasted headers match a saved layout

---

## 10. Architecture Diagram

```
UploadStep
├── Tab: Upload file
│   └── dropzone → parseImport(file) → backend → ParseResult → store → map
└── Tab: Paste from Excel
    └── textarea → parseExcelPasteWithHeaders(text) → ParseResult → store → map
                                                      (client-side)

MapStep → ReviewStep → commitImport (unchanged)
ReviewStep → PasteImportRowPanel (unchanged, append rows)
```
