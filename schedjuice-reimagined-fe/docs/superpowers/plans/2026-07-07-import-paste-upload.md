# Import Paste Upload — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Paste from Excel" tab on the Import wizard upload step so users can paste tab-separated rows (first row = headers) with live preview, then continue through the existing map → review → commit flow without a backend parse call.

**Architecture:** Extend `parse-excel-paste.ts` with a header-aware parser (`parseExcelPasteWithHeaders`). Refactor `upload-step.tsx` to use shadcn Tabs — the Upload file tab keeps the existing dropzone; the Paste tab parses client-side, previews in a table, and on Continue builds a `ParseResult` and applies it via a shared store helper (same path as file upload, minus `setLastFile`).

**Tech Stack:** Next.js / React, shadcn Tabs + Textarea + Table, Zustand (`useImportStore`), vitest, TanStack Query (file upload only).

**Repo:** `/Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-fe` (branch `dev`)

**Spec:** `docs/superpowers/specs/2026-07-07-import-paste-upload-design.md`

---

## File map

| File | Responsibility |
| --- | --- |
| `src/lib/imports/parse-excel-paste.ts` | Add `parseExcelPasteWithHeaders`, export `PASTE_MAX_ROWS` |
| `src/lib/imports/parse-excel-paste.test.ts` | Unit tests for new parser |
| `src/components/import-wizard/upload-step.tsx` | Tabs UI, paste preview, shared `applyParseResultToStore` |
| `src/app/(internal)/imports/page.tsx` | Updated page description + discard button label |

**Unchanged:** `paste-import-row-panel.tsx`, backend, `import-store.ts`, map/review steps.

---

### Task 1: `parseExcelPasteWithHeaders` parser

**Files:**
- Modify: `src/lib/imports/parse-excel-paste.ts`
- Test: `src/lib/imports/parse-excel-paste.test.ts`

- [ ] **Step 1: Write failing tests**

Add a new `describe("parseExcelPasteWithHeaders", …)` block to `parse-excel-paste.test.ts`:

```typescript
import {
  PASTE_MAX_ROWS,
  parseExcelPaste,
  parseExcelPasteWithHeaders,
} from "@/lib/imports/parse-excel-paste";

describe("parseExcelPasteWithHeaders", () => {
  it("returns empty result for blank input", () => {
    expect(parseExcelPasteWithHeaders("")).toEqual({
      headers: [],
      rows: [],
      warnings: [],
      error: null,
    });
    expect(parseExcelPasteWithHeaders("   \n\n  ")).toEqual({
      headers: [],
      rows: [],
      warnings: [],
      error: null,
    });
  });

  it("parses header row and one data row", () => {
    const result = parseExcelPasteWithHeaders(
      "email\tname\na@x.com\tAlice",
    );
    expect(result.error).toBeNull();
    expect(result.headers).toEqual(["email", "name"]);
    expect(result.rows).toEqual([["a@x.com", "Alice"]]);
    expect(result.warnings).toEqual([]);
  });

  it("parses multiple data rows", () => {
    const result = parseExcelPasteWithHeaders(
      "email\tname\na@x.com\tAlice\nb@x.com\tBob",
    );
    expect(result.rows).toEqual([
      ["a@x.com", "Alice"],
      ["b@x.com", "Bob"],
    ]);
  });

  it("preserves empty header cells as empty strings", () => {
    const result = parseExcelPasteWithHeaders("email\t\tname\na@x.com\tx\tBob");
    expect(result.headers).toEqual(["email", "", "name"]);
  });

  it("pads narrow data rows with null", () => {
    const result = parseExcelPasteWithHeaders("a\tb\tc\n1\t2");
    expect(result.rows).toEqual([["1", "2", null]]);
  });

  it("truncates wide data rows with a warning", () => {
    const result = parseExcelPasteWithHeaders("a\tb\n1\t2\t3\t4");
    expect(result.rows).toEqual([["1", "2"]]);
    expect(result.warnings).toEqual([
      "Row 1 had 4 columns; using first 2",
    ]);
  });

  it("returns error when only header row is present", () => {
    const result = parseExcelPasteWithHeaders("email\tname");
    expect(result.headers).toEqual(["email", "name"]);
    expect(result.rows).toEqual([]);
    expect(result.error).toBe("No data rows found");
  });

  it("returns error when row count exceeds max", () => {
    const header = "email";
    const dataLines = Array.from(
      { length: PASTE_MAX_ROWS + 1 },
      (_, i) => `user${i}@x.com`,
    ).join("\n");
    const result = parseExcelPasteWithHeaders(`${header}\n${dataLines}`);
    expect(result.error).toBe(
      `Exceeds maximum of ${PASTE_MAX_ROWS} rows`,
    );
  });

  it("handles CRLF line endings", () => {
    const result = parseExcelPasteWithHeaders(
      "email\tname\r\na@x.com\tAlice\r\nb@x.com\tBob",
    );
    expect(result.rows).toHaveLength(2);
  });

  it("trims cell whitespace in headers and rows", () => {
    const result = parseExcelPasteWithHeaders(
      " email \t name \n a@x.com \t Alice ",
    );
    expect(result.headers).toEqual(["email", "name"]);
    expect(result.rows).toEqual([["a@x.com", "Alice"]]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/lib/imports/parse-excel-paste.test.ts
```

Expected: FAIL — `parseExcelPasteWithHeaders is not exported` or `PASTE_MAX_ROWS is not exported`.

- [ ] **Step 3: Implement parser**

Add to `parse-excel-paste.ts`:

```typescript
export const PASTE_MAX_ROWS = 5000;

export type ParseExcelPasteWithHeadersResult = {
  headers: string[];
  rows: (string | null)[][];
  warnings: string[];
  error: string | null;
};

function splitNonEmptyLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
}

export function parseExcelPasteWithHeaders(
  text: string,
  maxRows: number = PASTE_MAX_ROWS,
): ParseExcelPasteWithHeadersResult {
  const lines = splitNonEmptyLines(text);

  if (lines.length === 0) {
    return { headers: [], rows: [], warnings: [], error: null };
  }

  const headerCells = normalizeLineCells(lines[0]!);
  const headers = headerCells.map((cell) => cell);

  if (lines.length === 1) {
    return {
      headers,
      rows: [],
      warnings: [],
      error: "No data rows found",
    };
  }

  const dataLines = lines.slice(1);
  if (dataLines.length > maxRows) {
    return {
      headers,
      rows: [],
      warnings: [],
      error: `Exceeds maximum of ${maxRows} rows`,
    };
  }

  const rows: (string | null)[][] = [];
  const warnings: string[] = [];
  const columnCount = headers.length;

  dataLines.forEach((line, index) => {
    const cells = normalizeLineCells(line);
    const { row, warnings: rowWarnings } = normalizeRowWidth(
      cells,
      columnCount,
      index + 1,
    );
    rows.push(row);
    warnings.push(...rowWarnings);
  });

  return { headers, rows, warnings, error: null };
}
```

Refactor `parseExcelPaste` to reuse `splitNonEmptyLines`:

```typescript
export function parseExcelPaste(
  text: string,
  columnCount: number,
): ParseExcelPasteResult {
  if (columnCount <= 0) {
    return { rows: [], warnings: [], error: "No columns in uploaded file" };
  }

  const lines = splitNonEmptyLines(text);

  if (lines.length === 0) {
    return { rows: [], warnings: [], error: null };
  }

  const rows: (string | null)[][] = [];
  const warnings: string[] = [];

  lines.forEach((line, index) => {
    const cells = normalizeLineCells(line);
    const { row, warnings: rowWarnings } = normalizeRowWidth(
      cells,
      columnCount,
      index + 1,
    );
    rows.push(row);
    warnings.push(...rowWarnings);
  });

  return { rows, warnings, error: null };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/lib/imports/parse-excel-paste.test.ts
```

Expected: all tests PASS (both `parseExcelPaste` and `parseExcelPasteWithHeaders`).

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/lib/imports/parse-excel-paste.ts src/lib/imports/parse-excel-paste.test.ts
git commit -m "feat(imports): add parseExcelPasteWithHeaders for upload-step paste"
```

---

### Task 2: Shared store helper + paste tab UI in UploadStep

**Files:**
- Modify: `src/components/import-wizard/upload-step.tsx`

- [ ] **Step 1: Refactor file-upload success into `applyParseResultToStore`**

At the top of `upload-step.tsx` (after imports), add:

```typescript
import { useMemo, useState } from "react";
import type { ParseResult } from "@/app/client-api/imports";
import {
  parseExcelPasteWithHeaders,
} from "@/lib/imports/parse-excel-paste";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function applyParseResultToStore(result: ParseResult) {
  const {
    setParse,
    setStep,
    setRole,
    setMapping,
    setFieldDefaults,
    setRememberedImportApplied,
  } = useImportStore.getState();

  setParse(result);
  const remembered = findRememberedImport(result.headers);
  if (remembered) {
    setRole(remembered.role);
    setMapping(remembered.mapping);
    setFieldDefaults(remembered.fieldDefaults);
    if (remembered.matchConfig) {
      useImportStore.getState().setMatchPriority(
        remembered.matchPriority ?? [
          "email",
          "communication_email",
          "phone_number",
        ],
      );
      for (const [k, v] of Object.entries(remembered.matchConfig)) {
        useImportStore.getState().setMatchColumn(k, v);
      }
    }
    setRememberedImportApplied(true);
  } else {
    setMapping({});
    setFieldDefaults({});
    setRememberedImportApplied(false);
  }
  setStep("map");
}
```

Update the mutation `onSuccess` to use the helper:

```typescript
onSuccess: (result, file) => {
  setLastFile(file);
  applyParseResultToStore(result);
},
```

Remove the now-unused individual store setter hooks that were only used in `onSuccess` (`setParse`, `setStep`, `setRole`, `setMapping`, `setFieldDefaults`, `setRememberedImportApplied`) — keep only `setLastFile` from the store.

- [ ] **Step 2: Add paste tab state and handler**

Inside `UploadStep`, add:

```typescript
const [pasteText, setPasteText] = useState("");

const parsedPaste = useMemo(
  () => parseExcelPasteWithHeaders(pasteText),
  [pasteText],
);

const canContinuePaste =
  parsedPaste.headers.length > 0 &&
  parsedPaste.rows.length > 0 &&
  parsedPaste.error === null;

function handlePasteContinue() {
  if (!canContinuePaste) return;

  const parseResult: ParseResult = {
    sheetNames: ["Pasted"],
    activeSheet: "Pasted",
    headers: parsedPaste.headers,
    rows: parsedPaste.rows,
    rowCount: parsedPaste.rows.length,
  };

  applyParseResultToStore(parseResult);
}
```

- [ ] **Step 3: Wrap existing dropzone in Tabs**

Replace the return JSX in `UploadStep` with:

```tsx
return (
  <div className="space-y-4">
    <div className="w-64">
      <Select defaultValue="users">
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="users">Users</SelectItem>
          <SelectItem value="courses" disabled>
            Courses (coming soon)
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <Tabs defaultValue="upload">
      <TabsList>
        <TabsTrigger value="upload">Upload file</TabsTrigger>
        <TabsTrigger value="paste">Paste from Excel</TabsTrigger>
      </TabsList>

      <TabsContent value="upload" className="mt-4">
        <div
          {...getRootProps()}
          className="rounded-lg border border-dashed bg-muted/20 p-10 text-center"
        >
          <input {...getInputProps()} />
          {mutation.isLoading ? (
            <TextShimmer>Parsing file…</TextShimmer>
          ) : (
            <p className="text-sm text-muted-foreground">
              {isDragActive
                ? "Drop the file…"
                : "Drag an Excel or CSV file here"}
            </p>
          )}
          <Button
            className="mt-3"
            type="button"
            onClick={open}
            disabled={mutation.isLoading}
          >
            {mutation.isLoading ? "Parsing…" : "Choose file"}
          </Button>
        </div>
      </TabsContent>

      <TabsContent value="paste" className="mt-4 space-y-3">
        <p className="text-sm text-muted-foreground">
          Copy rows from Excel and paste below. The first row should be column
          headers.
        </p>

        <Textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          placeholder="Paste tab-separated values from Excel…"
          className="min-h-[160px] font-mono text-xs"
          aria-label="Paste Excel rows"
        />

        {parsedPaste.rows.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Preview — {parsedPaste.rows.length} row
              {parsedPaste.rows.length === 1 ? "" : "s"} ready
            </p>
            <div className="max-h-[240px] overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 shrink-0 text-xs">#</TableHead>
                    {parsedPaste.headers.map((header, colIndex) => (
                      <TableHead
                        key={`${header}-${colIndex}`}
                        className="min-w-[100px] text-xs whitespace-nowrap"
                      >
                        {header || "(blank)"}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedPaste.rows.map((row, rowIndex) => (
                    <TableRow key={rowIndex}>
                      <TableCell className="text-xs text-muted-foreground">
                        {rowIndex + 1}
                      </TableCell>
                      {row.map((cell, colIndex) => (
                        <TableCell
                          key={colIndex}
                          className="max-w-[200px] truncate font-mono text-xs"
                          title={cell ?? undefined}
                        >
                          {cell ?? (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : parsedPaste.headers.length > 0 &&
          parsedPaste.error === "No data rows found" ? (
          <p className="text-sm text-muted-foreground">
            Add at least one data row below the header.
          </p>
        ) : pasteText.trim().length > 0 ? (
          <p className="text-sm text-muted-foreground">
            Paste tab-separated values copied from Excel.
          </p>
        ) : null}

        {parsedPaste.warnings.map((warning) => (
          <p key={warning} className="text-sm text-amber-600">
            {warning}
          </p>
        ))}

        {parsedPaste.error &&
        parsedPaste.error !== "No data rows found" ? (
          <p className="text-sm text-destructive">{parsedPaste.error}</p>
        ) : null}

        <div className="flex justify-end">
          <Button
            type="button"
            disabled={!canContinuePaste}
            onClick={handlePasteContinue}
          >
            Continue
          </Button>
        </div>
      </TabsContent>
    </Tabs>
  </div>
);
```

- [ ] **Step 4: Verify TypeScript compiles**

Run:
```bash
cd schedjuice-reimagined-fe
npm run lint
```

Expected: no errors in `upload-step.tsx`.

- [ ] **Step 5: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/components/import-wizard/upload-step.tsx
git commit -m "feat(imports): add paste-from-Excel tab on upload step"
```

---

### Task 3: Page copy updates

**Files:**
- Modify: `src/app/(internal)/imports/page.tsx`

- [ ] **Step 1: Update header description and discard button**

In `page.tsx`, change:

```tsx
description="Upload an Excel or CSV file to import users. Email and course cells link automatically."
```

To:

```tsx
description="Upload a file or paste rows from Excel to import users. Email and course cells link automatically."
```

Change:

```tsx
Discard &amp; choose another file
```

To:

```tsx
Discard import
```

- [ ] **Step 2: Commit**

```bash
cd schedjuice-reimagined-fe
git add src/app/(internal)/imports/page.tsx
git commit -m "docs(imports): update page copy for paste upload option"
```

---

### Task 4: Manual verification

- [ ] **Step 1: Run full unit test suite for paste module**

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/lib/imports/parse-excel-paste.test.ts
```

Expected: all PASS.

- [ ] **Step 2: Manual smoke test**

1. Start dev server: `npm run dev`
2. Open `/imports` — **Upload file** tab is default; dropzone unchanged
3. Switch to **Paste from Excel** — paste:
   ```
   email	name
   a@x.com	Alice
   b@x.com	Bob
   ```
4. Preview shows 2 rows; click **Continue** → map step with `email`, `name` headers
5. Paste header only (`email\tname`) → Continue disabled, hint shown
6. Complete a full import end-to-end if backend is available

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| Two tabs, Upload default | Task 2 Step 3 |
| Paste tab: textarea + preview + Continue | Task 2 Step 3 |
| First row = headers | Task 1 |
| Live preview table | Task 2 Step 3 |
| 5000 row limit | Task 1 |
| `ParseResult` with `Pasted` sheet | Task 2 Step 2 |
| No `setLastFile` on paste | Task 2 Step 2 |
| Remembered import mapping | Task 2 Step 1 (`applyParseResultToStore`) |
| Page copy updates | Task 3 |
| Review-step paste panel unchanged | No task (intentionally untouched) |
| No backend changes | No task (intentionally untouched) |

---

## Self-review notes

- All test cases from spec §9.1 are covered in Task 1.
- `parseExcelPaste` existing tests must still pass after `splitNonEmptyLines` refactor.
- `applyParseResultToStore` uses `useImportStore.getState()` so it works outside React hooks (mutation callback + paste handler).
- Paste path does not call `setLastFile`; file path still does.
