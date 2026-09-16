# Import Wizard Name Mismatch Warning — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Warn admins when an import row matches an existing user via a secondary field (communication email / phone) but the imported name differs — yellow chip, excluded from bulk confirm, individual review via popover.

**Architecture:** Extend `buildUserMatches` to persist backend `matchField` and compute a `nameMismatch` flag using strict normalized name equality. Thread the flag through resolution → grid canvas → popover. Add yellow warn palette to chip renderer. Filter bulk-confirm helpers to skip mismatch rows.

**Tech Stack:** Next.js / React, Glide Data Grid (canvas cells), Zustand, vitest.

**Repo:** `/Users/jamesthiha/programming/schedjuice/schedjuice-reimagined-fe` (branch `dev`)

**Spec:** `docs/superpowers/specs/2026-07-07-import-wizard-name-mismatch-warning-design.md`

---

## File map

| File | Responsibility |
| --- | --- |
| `src/lib/imports/wizard-logic.ts` | Add `nameMappedColumn()` helper |
| `src/lib/imports/resolution.ts` | `normalizeImportName`, `computeNameMismatch`, extend `CellResolution`, update `buildUserMatches` + bulk helpers |
| `src/lib/imports/resolution.test.ts` | Unit tests for name mismatch + bulk exclude |
| `src/hooks/imports/use-resolution.ts` | Pass `nameColIndex` into `buildUserMatches` |
| `src/lib/imports/resolve-import-rows.ts` | Same pass-through on re-resolve |
| `src/components/data-sheet/lib/glide-theme.ts` | Warn color tokens |
| `src/components/import-grid/cells/draw-helpers.ts` | `drawChip` `warn` option |
| `src/components/import-grid/cells/types.ts` | `nameMismatch` on `UserLinkCellData` |
| `src/components/import-grid/cells/user-link-cell.tsx` | Yellow chip when `nameMismatch` |
| `src/components/import-grid/import-data-grid.tsx` | Pass `nameMismatch` into cell data |
| `src/components/import-grid/user-match-popover.tsx` | Warning banner + name comparison |
| `src/components/import-grid/user-matches-panel.tsx` | Sibling mismatch count line |
| `src/components/import-wizard/review-step.tsx` | Pass `importedName` + sibling count to panel/popover |

**Unchanged:** Backend, `import-store.ts`, commit payload.

---

### Task 1: Name normalization helpers

**Files:**
- Modify: `src/lib/imports/resolution.ts`
- Test: `src/lib/imports/resolution.test.ts`

- [ ] **Step 1: Write failing tests**

Add near the top of `resolution.test.ts` imports:

```typescript
import {
  buildUserMatches,
  computeNameMismatch,
  confirmAllExactMatches,
  countPendingExactMatches,
  countPendingNameMismatches,
  normalizeImportName,
  // ...existing imports
} from "@/lib/imports/resolution";
```

Add a new describe block before `describe("buildUserMatches")`:

```typescript
describe("normalizeImportName", () => {
  it("lowercases, trims, and collapses whitespace", () => {
    expect(normalizeImportName("  Poe  Yati   Hlaing  ")).toBe("poe yati hlaing");
  });
});

describe("computeNameMismatch", () => {
  it("returns false for primary email field even when names differ", () => {
    expect(computeNameMismatch("email", "Mi Pakao Htaw", "Mehm Samoi Htaw")).toBe(false);
  });

  it("returns false when imported name is empty", () => {
    expect(computeNameMismatch("phone_number", "", "Mehm Samoi Htaw")).toBe(false);
    expect(computeNameMismatch("phone_number", "   ", "Mehm Samoi Htaw")).toBe(false);
  });

  it("returns false when names match after normalization", () => {
    expect(
      computeNameMismatch("phone_number", "  POE Yati Hlaing ", "Poe Yati Hlaing"),
    ).toBe(false);
  });

  it("returns true for secondary field with different names", () => {
    expect(
      computeNameMismatch("phone_number", "Mi Pakao Htaw", "Mehm Samoi Htaw"),
    ).toBe(true);
    expect(
      computeNameMismatch("communication_email", "Poe Yati Thant", "Poe Theingi Kyaw"),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/lib/imports/resolution.test.ts -t "normalizeImportName|computeNameMismatch"
```

Expected: FAIL — `normalizeImportName is not exported` (or similar).

- [ ] **Step 3: Write minimal implementation**

Add to `resolution.ts` (before `buildUserMatches`):

```typescript
export function normalizeImportName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function computeNameMismatch(
  matchField: string | null | undefined,
  importedName: string | null | undefined,
  matchedUserName: string,
): boolean {
  if (!matchField || matchField === "email") return false;
  if (!importedName?.trim()) return false;
  return normalizeImportName(importedName) !== normalizeImportName(matchedUserName);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run the same vitest command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/imports/resolution.ts src/lib/imports/resolution.test.ts
git commit -m "feat(imports): add name normalization helpers for match warnings"
```

---

### Task 2: Extend `buildUserMatches` with `matchField` and `nameMismatch`

**Files:**
- Modify: `src/lib/imports/wizard-logic.ts`
- Modify: `src/lib/imports/resolution.ts`
- Test: `src/lib/imports/resolution.test.ts`

- [ ] **Step 1: Write failing tests**

Add `nameMappedColumn` test in `wizard-logic.test.ts` (optional small test) — skip if time-constrained; resolution tests are sufficient.

Extend `describe("buildUserMatches")` in `resolution.test.ts`:

```typescript
const nameSpecs: MatchSpecResolved[] = [
  { fieldKey: "email", colIndex: 0, type: "email", fuzzy: false },
  { fieldKey: "phone_number", colIndex: 1, type: "phone", fuzzy: false },
];

it("sets nameMismatch when phone match names differ", () => {
  const rows = [["new@x.com", "09123456789", "Mi Pakao Htaw"]];
  const specs: MatchSpecResolved[] = [
    { fieldKey: "email", colIndex: 0, type: "email", fuzzy: false },
    { fieldKey: "phone_number", colIndex: 1, type: "phone", fuzzy: false },
  ];
  const results: Record<string, Record<string, UserMatchResult>> = {
    email: {
      "new@x.com": { kind: "none", user: null, field: null, score: null, candidates: [] },
    },
    phone_number: {
      "09123456789": {
        kind: "exact",
        user: ref(10, "Mehm Samoi Htaw"),
        field: "phone_number",
        score: 100,
        candidates: [],
      },
    },
  };
  const out = buildUserMatches(
    rows,
    specs,
    ["email", "phone_number"],
    ["row-0"],
    results,
    2, // nameColIndex
  );
  const cell = out.get("row-0:email");
  expect(cell?.status).toBe("pending_match");
  expect(cell?.matchField).toBe("phone_number");
  expect(cell?.nameMismatch).toBe(true);
});

it("does not set nameMismatch when names match via phone", () => {
  const rows = [["new@x.com", "09123456789", "Poe Yati Hlaing"]];
  const specs: MatchSpecResolved[] = [
    { fieldKey: "email", colIndex: 0, type: "email", fuzzy: false },
    { fieldKey: "phone_number", colIndex: 1, type: "phone", fuzzy: false },
  ];
  const results: Record<string, Record<string, UserMatchResult>> = {
    email: {
      "new@x.com": { kind: "none", user: null, field: null, score: null, candidates: [] },
    },
    phone_number: {
      "09123456789": {
        kind: "exact",
        user: ref(11, "Poe Yati Hlaing"),
        field: "phone_number",
        score: 100,
        candidates: [],
      },
    },
  };
  const out = buildUserMatches(rows, specs, ["email", "phone_number"], ["row-0"], results, 2);
  expect(out.get("row-0:email")?.nameMismatch).toBeFalsy();
});

it("does not set nameMismatch for primary email match with different names", () => {
  const rows = [["sibling@x.com", "", "Mi Pakao Htaw"]];
  const results: Record<string, Record<string, UserMatchResult>> = {
    email: {
      "sibling@x.com": {
        kind: "exact",
        user: ref(12, "Mehm Samoi Htaw"),
        field: "email",
        score: 100,
        candidates: [],
      },
    },
    phone_number: {},
  };
  const out = buildUserMatches(
    rows,
    [{ fieldKey: "email", colIndex: 0, type: "email", fuzzy: false }],
    ["email"],
    ["row-0"],
    results,
    2,
  );
  expect(out.get("row-0:email")?.nameMismatch).toBeFalsy();
});

it("skips name check when nameColIndex is null", () => {
  const rows = [["new@x.com", "09123456789", "Mi Pakao Htaw"]];
  const specs: MatchSpecResolved[] = [
    { fieldKey: "email", colIndex: 0, type: "email", fuzzy: false },
    { fieldKey: "phone_number", colIndex: 1, type: "phone", fuzzy: false },
  ];
  const results: Record<string, Record<string, UserMatchResult>> = {
    email: {
      "new@x.com": { kind: "none", user: null, field: null, score: null, candidates: [] },
    },
    phone_number: {
      "09123456789": {
        kind: "exact",
        user: ref(10, "Mehm Samoi Htaw"),
        field: "phone_number",
        score: 100,
        candidates: [],
      },
    },
  };
  const out = buildUserMatches(rows, specs, ["email", "phone_number"], ["row-0"], results, null);
  expect(out.get("row-0:email")?.nameMismatch).toBeFalsy();
});
```

Update existing `buildUserMatches` calls in tests to pass `null` as the 6th argument (nameColIndex).

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:unit -- src/lib/imports/resolution.test.ts -t "buildUserMatches"
```

Expected: FAIL — wrong arity or missing properties.

- [ ] **Step 3: Write minimal implementation**

Add to `wizard-logic.ts` after `coursesMappedColumn`:

```typescript
export function nameMappedColumn(mapping: Record<number, string | null>): number | null {
  for (const [idx, field] of Object.entries(mapping)) {
    if (field === "name") return Number(idx);
  }
  return null;
}
```

Extend `CellResolution` in `resolution.ts`:

```typescript
export type CellResolution = {
  status: CellStatus;
  entityRef?: { id: number; label: string };
  tokens?: CourseToken[];
  candidates?: UserMatchCandidate[];
  confirmedUserId?: number;
  matchField?: string | null;
  nameMismatch?: boolean;
};
```

Update `buildUserMatches` signature and exact-match block:

```typescript
export function buildUserMatches(
  rows: (string | number | null)[][],
  specs: MatchSpecResolved[],
  priority: string[],
  rowIds: string[],
  results: Record<string, Record<string, UserMatchResult>>,
  nameColIndex: number | null = null,
): Map<string, CellResolution> {
  // ...existing loop body...
  if (exact?.user) {
    const extra = candidates.filter((c) => c.user.id !== exact!.user!.id);
    const importedNameRaw =
      nameColIndex != null ? row[nameColIndex] : null;
    const importedName =
      importedNameRaw === null || importedNameRaw === undefined
        ? ""
        : String(importedNameRaw);
    const nameMismatch = computeNameMismatch(
      exact.field,
      importedName,
      exact.user.name,
    );
    out.set(key, {
      status: "pending_match",
      entityRef: { id: exact.user.id, label: exact.user.name },
      candidates: extra,
      matchField: exact.field,
      ...(nameMismatch ? { nameMismatch: true } : {}),
    });
    return;
  }
  // ...
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test:unit -- src/lib/imports/resolution.test.ts -t "buildUserMatches|normalizeImportName|computeNameMismatch"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/imports/wizard-logic.ts src/lib/imports/resolution.ts src/lib/imports/resolution.test.ts
git commit -m "feat(imports): flag name mismatch on secondary-field user matches"
```

---

### Task 3: Bulk confirm excludes name-mismatch rows

**Files:**
- Modify: `src/lib/imports/resolution.ts`
- Test: `src/lib/imports/resolution.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `describe("user match reducers")`:

```typescript
it("confirmAllExactMatches skips nameMismatch rows", () => {
  const map = new Map<string, CellResolution>([
    [
      "row-0:email",
      {
        status: "pending_match",
        entityRef: { id: 1, label: "A" },
      },
    ],
    [
      "row-1:email",
      {
        status: "pending_match",
        entityRef: { id: 2, label: "B" },
        nameMismatch: true,
        matchField: "phone_number",
      },
    ],
  ]);
  const next = confirmAllExactMatches(map);
  expect(next.get("row-0:email")?.status).toBe("confirmed");
  expect(next.get("row-1:email")?.status).toBe("pending_match");
});

it("countPendingExactMatches excludes nameMismatch rows", () => {
  const map = new Map<string, CellResolution>([
    ["row-0:email", { status: "pending_match", entityRef: { id: 1, label: "A" } }],
    [
      "row-1:email",
      {
        status: "pending_match",
        entityRef: { id: 2, label: "B" },
        nameMismatch: true,
      },
    ],
  ]);
  expect(countPendingExactMatches(map, ["row-0", "row-1"])).toBe(1);
});

it("countPendingNameMismatches counts only nameMismatch pending rows", () => {
  const map = new Map<string, CellResolution>([
    ["row-0:email", { status: "pending_match", entityRef: { id: 1, label: "A" } }],
    [
      "row-1:email",
      {
        status: "pending_match",
        entityRef: { id: 2, label: "B" },
        nameMismatch: true,
      },
    ],
    ["row-2:email", { status: "pending_candidates", candidates: [] }],
  ]);
  expect(countPendingNameMismatches(map, ["row-0", "row-1", "row-2"])).toBe(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:unit -- src/lib/imports/resolution.test.ts -t "confirmAllExactMatches skips|countPendingExactMatches excludes|countPendingNameMismatches"
```

Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Update helpers in `resolution.ts`:

```typescript
export function confirmAllExactMatches(
  resolution: Map<string, CellResolution>,
): Map<string, CellResolution> {
  const next = new Map(resolution);
  next.forEach((cell, key) => {
    if (cell.status === "pending_match" && !cell.nameMismatch) {
      next.set(key, confirmUserMatch(cell));
    }
  });
  return next;
}

export function countPendingExactMatches(
  resolution: Map<string, CellResolution>,
  rowIds: string[],
): number {
  let n = 0;
  for (const rowId of rowIds) {
    const cell = resolution.get(cellKey(rowId, "email"));
    if (cell?.status === "pending_match" && !cell.nameMismatch) n += 1;
  }
  return n;
}

export function countPendingNameMismatches(
  resolution: Map<string, CellResolution>,
  rowIds: string[],
): number {
  let n = 0;
  for (const rowId of rowIds) {
    const cell = resolution.get(cellKey(rowId, "email"));
    if (cell?.status === "pending_match" && cell.nameMismatch) n += 1;
  }
  return n;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test:unit -- src/lib/imports/resolution.test.ts
```

Expected: all resolution tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/imports/resolution.ts src/lib/imports/resolution.test.ts
git commit -m "feat(imports): exclude name-mismatch rows from bulk confirm"
```

---

### Task 4: Wire `nameColIndex` through resolution callers

**Files:**
- Modify: `src/hooks/imports/use-resolution.ts`
- Modify: `src/lib/imports/resolve-import-rows.ts`

- [ ] **Step 1: Update `use-resolution.ts`**

Add import:

```typescript
import {
  collectUniqueColumnValues,
  collectUniqueCourseTokens,
  coursesMappedColumn,
  matchableMappedColumns,
  nameMappedColumn,
} from "@/lib/imports/wizard-logic";
```

Add memo:

```typescript
const nameColIndex = useMemo(() => nameMappedColumn(mapping), [mapping]);
```

Update the `buildUserMatches` call:

```typescript
buildUserMatches(
  parse.rows,
  activeSpecs,
  matchPriority,
  rowIds,
  results,
  nameColIndex,
),
```

Add `nameColIndex` to the effect dependency array.

- [ ] **Step 2: Update `resolve-import-rows.ts`**

Add `nameMappedColumn` import. Before `buildUserMatches` call:

```typescript
const nameColIndex = nameMappedColumn(mapping);
```

Pass `nameColIndex` as 6th argument to `buildUserMatches`.

- [ ] **Step 3: Run unit tests**

```bash
npm run test:unit -- src/lib/imports/resolution.test.ts
```

Expected: PASS (no new tests needed — wiring only).

- [ ] **Step 4: Commit**

```bash
git add src/hooks/imports/use-resolution.ts src/lib/imports/resolve-import-rows.ts
git commit -m "feat(imports): pass name column into user match builder"
```

---

### Task 5: Yellow warn chip palette

**Files:**
- Modify: `src/components/data-sheet/lib/glide-theme.ts`
- Modify: `src/components/import-grid/cells/draw-helpers.ts`

- [ ] **Step 1: Add warn tokens to `LinkColors`**

In `glide-theme.ts`, extend the type and both palettes:

```typescript
export type LinkColors = {
  chipBg: string;
  chipBorder: string;
  chipText: string;
  check: string;
  attnBg: string;
  attnBorder: string;
  attnText: string;
  warnBg: string;
  warnBorder: string;
  warnText: string;
  newTag: string;
  shimmerBase: string;
  shimmerHighlight: string;
  error: string;
};

export const LIGHT_LINK_COLORS: LinkColors = {
  // ...existing...
  warnBg: "#fefce8",
  warnBorder: "#fde047",
  warnText: "#854d0e",
};

export const DARK_LINK_COLORS: LinkColors = {
  // ...existing...
  warnBg: "#3d3818",
  warnBorder: "#6b6020",
  warnText: "#f0d878",
};
```

- [ ] **Step 2: Extend `drawChip`**

Update signature and styling branch in `draw-helpers.ts`:

```typescript
export function drawChip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  opts: { attn?: boolean; warn?: boolean; check?: boolean } = {},
): number {
  const colors = getActiveLinkColors();
  // ...
  const bg = opts.warn ? colors.warnBg : opts.attn ? colors.attnBg : colors.chipBg;
  const border = opts.warn ? colors.warnBorder : opts.attn ? colors.attnBorder : colors.chipBorder;
  const textColor = opts.warn ? colors.warnText : opts.attn ? colors.attnText : colors.chipText;
  ctx.fillStyle = bg;
  // use textColor for fillText
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/data-sheet/lib/glide-theme.ts src/components/import-grid/cells/draw-helpers.ts
git commit -m "feat(imports): add yellow warn palette for match chips"
```

---

### Task 6: Grid cell renders yellow chip

**Files:**
- Modify: `src/components/import-grid/cells/types.ts`
- Modify: `src/components/import-grid/cells/user-link-cell.tsx`
- Modify: `src/components/import-grid/import-data-grid.tsx`

- [ ] **Step 1: Extend cell types**

In `types.ts`, add to `UserLinkCellData`:

```typescript
nameMismatch?: boolean;
```

- [ ] **Step 2: Render yellow chip in `user-link-cell.tsx`**

Update the `pending_match` branch:

```typescript
if (d.status === "pending_match") {
  const chipW = drawChip(ctx, x, cy - 10, `${d.label ?? d.raw} confirm?`, {
    attn: !d.nameMismatch,
    warn: Boolean(d.nameMismatch),
  });
  // ...duplicateRole unchanged
  return;
}
```

- [ ] **Step 3: Pass flag from grid**

In `import-data-grid.tsx`, inside the email cell `data` object:

```typescript
nameMismatch: res?.nameMismatch,
```

- [ ] **Step 4: Commit**

```bash
git add src/components/import-grid/cells/types.ts src/components/import-grid/cells/user-link-cell.tsx src/components/import-grid/import-data-grid.tsx
git commit -m "feat(imports): render yellow chip for name-mismatch matches"
```

---

### Task 7: Popover warning + imported name display

**Files:**
- Modify: `src/components/import-grid/user-match-popover.tsx`
- Modify: `src/components/import-wizard/review-step.tsx`

- [ ] **Step 1: Extend `UserMatchTarget`**

In `user-match-popover.tsx`:

```typescript
export type UserMatchTarget = {
  sourceRow: number;
  rawEmail: string;
  importedName?: string;
  rect: { x: number; y: number; width: number; height: number };
  cell: CellResolution;
};

const MATCH_FIELD_LABELS: Record<string, string> = {
  communication_email: "communication email",
  phone_number: "phone number",
  emergency_contact_phone_number: "emergency contact phone",
};

function matchFieldLabel(field: string | null | undefined): string {
  if (!field) return "secondary field";
  return MATCH_FIELD_LABELS[field] ?? field.replace(/_/g, " ");
}
```

- [ ] **Step 2: Render warning banner when `nameMismatch`**

Inside the popover, before the suggested block:

```typescript
{cell.nameMismatch ? (
  <div className="mb-2 rounded-md border border-yellow-300 bg-yellow-50 px-2 py-1.5 text-xs text-yellow-900 dark:border-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-100">
    <p className="font-medium">
      Possible sibling — matched via {matchFieldLabel(cell.matchField)}
    </p>
    {importedName ? (
      <p className="mt-1 text-yellow-800/90 dark:text-yellow-100/90">
        Import: <span className="font-medium">{importedName}</span>
      </p>
    ) : null}
    {cell.entityRef ? (
      <p className="text-yellow-800/90 dark:text-yellow-100/90">
        Matched: <span className="font-medium">{cell.entityRef.label}</span>
      </p>
    ) : null}
  </div>
) : null}
```

Destructure `importedName` from target: `const { cell, rawEmail, importedName } = target;`

- [ ] **Step 3: Pass imported name from review step**

In `review-step.tsx`:

Import `nameMappedColumn` from wizard-logic.

Add memo:

```typescript
const nameColIndex = useMemo(() => nameMappedColumn(mapping), [mapping]);
```

In `handleCellActivated`, when setting `userMatchTarget`:

```typescript
const rawName =
  nameColIndex != null ? parse?.rows[sourceRow]?.[nameColIndex] : null;
const importedName =
  rawName === null || rawName === undefined ? undefined : String(rawName).trim() || undefined;

setUserMatchTarget({
  sourceRow,
  rawEmail,
  importedName,
  rect: bounds,
  cell,
});
```

- [ ] **Step 4: Commit**

```bash
git add src/components/import-grid/user-match-popover.tsx src/components/import-wizard/review-step.tsx
git commit -m "feat(imports): show sibling warning in user match popover"
```

---

### Task 8: Side panel sibling count

**Files:**
- Modify: `src/components/import-grid/user-matches-panel.tsx`
- Modify: `src/components/import-wizard/review-step.tsx`

- [ ] **Step 1: Extend panel props**

In `user-matches-panel.tsx`:

```typescript
export function UserMatchesPanel({
  pendingExactCount,
  pendingFuzzyCount,
  pendingNameMismatchCount = 0,
  onConfirmAllExact,
  className,
}: {
  pendingExactCount: number;
  pendingFuzzyCount: number;
  pendingNameMismatchCount?: number;
  onConfirmAllExact: () => void;
  className?: string;
}) {
```

After the exact-match helper text block, add:

```typescript
{pendingNameMismatchCount > 0 ? (
  <p className="text-xs text-amber-800 dark:text-amber-200/90">
    {pendingNameMismatchCount} possible sibling match
    {pendingNameMismatchCount === 1 ? "" : "es"} need review — names differ from
    the matched user. Click the yellow email cell to confirm or create new.
  </p>
) : null}
```

- [ ] **Step 2: Wire count in review step**

Import `countPendingNameMismatches` from resolution.

Add:

```typescript
const pendingNameMismatchCount = countPendingNameMismatches(resolution, activeRowIds);
```

Pass to panel:

```typescript
<UserMatchesPanel
  pendingExactCount={pendingExactCount}
  pendingFuzzyCount={pendingFuzzyCount}
  pendingNameMismatchCount={pendingNameMismatchCount}
  onConfirmAllExact={handleConfirmAllExact}
/>
```

- [ ] **Step 3: Run full unit tests**

```bash
npm run test:unit -- src/lib/imports/resolution.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/import-grid/user-matches-panel.tsx src/components/import-wizard/review-step.tsx
git commit -m "feat(imports): surface sibling mismatch count in matches panel"
```

---

### Task 9: Manual QA checklist

- [ ] **Step 1: Run full frontend unit tests**

```bash
cd schedjuice-reimagined-fe
npm run test:unit
```

Expected: all tests PASS.

- [ ] **Step 2: Manual verification in Import wizard Review step**

1. Import a sheet where two siblings share a phone number but have different names and different primary emails.
2. Enable phone matching in Map step.
3. Confirm mismatch rows show **yellow** `{matched name} confirm?` chips.
4. Confirm "Confirm all exact matches" does **not** confirm yellow rows.
5. Click a yellow cell → popover shows sibling warning with import vs matched names.
6. Click **Create new** → cell becomes `new user`.
7. Repeat with matching names via phone → amber chip, bulk-confirmable.

---

## Spec coverage checklist

| Spec requirement | Task |
|---|---|
| Yellow chip on secondary-field + name mismatch | Tasks 2, 5, 6 |
| Strict normalized name compare | Task 1 |
| Skip when name unmapped/empty | Task 2 |
| Exclude from bulk confirm | Task 3 |
| Unmatch via Create new | Task 7 (existing reducer, no change) |
| Popover shows field + names | Task 7 |
| Side panel sibling count | Task 8 |
| No backend changes | — |
| Re-resolve on paste/edit | Task 4 (`resolve-import-rows.ts`) |

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-07-import-wizard-name-mismatch-warning.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — implement tasks in this session with checkpoints

Which approach?
