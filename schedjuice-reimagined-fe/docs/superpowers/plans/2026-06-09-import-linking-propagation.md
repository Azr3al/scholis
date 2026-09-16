# Import Linking — Propagation & Resolve-by-Value Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a manual course pick in the Import Wizard propagate to every exact-match occurrence in the column, add a resolve-by-unique-value panel with progress + import gating, allow re-linking, and surface match confidence, affected-row counts, and conflicts.

**Architecture:** Pure client-side. Keep the per-cell `resolution` map but add `origin` tracking to each course token and a single `propagateCoursePick` fan-out engine plus derived selectors in `resolution.ts`. UI (`review-step.tsx`, grid cells, picker, new panel) consumes these pure functions.

**Tech Stack:** Next.js 15 + React 19, Zustand, Glide Data Grid, shadcn `toast()` (`@/components/ui/use-toast`), Vitest (`npm run test:unit`).

> **Git note:** This repo has `.cursor/rules/no-git-commits.mdc`. Do **not** run `git commit`. Each task ends with a **Checkpoint** (run tests + lint) instead of a commit. The user will handle commits.

> **Testing note:** The FE has Vitest but **no** React component testing library. Pure logic in `resolution.ts` is unit-tested. UI tasks are verified with `npm run test:unit` (regression), `npm run lint`, and manual checks in `npm run dev` at `/imports`.

---

## File Structure

- `src/lib/imports/resolution.ts` — add `TokenOrigin`, `origin` on `CourseToken`, extract `cellStatusFromTokens`, add `propagateCoursePick`, `isCourseTokenResolved`, `collectUnresolvedCourseTokens`, `computeCourseProgress`, `detectCourseConflicts`. (Pure, fully tested.)
- `src/lib/imports/resolution.test.ts` — extend with tests for all new pure functions.
- `src/components/import-wizard/review-step.tsx` — swap to `propagateCoursePick`, toast + undo, re-link activation, panel host, import gating.
- `src/components/import-grid/course-picker-popover.tsx` — affected-row count in header.
- `src/components/import-grid/cells/course-link-cell.tsx` — best-guess hint (#6) + conflict badge (#7).
- `src/components/import-grid/needs-attention-panel.tsx` — **new** panel (unique unresolved + progress + conflicts).

---

## Task 1: Add origin tracking + extract shared cell-status helper

**Files:**
- Modify: `src/lib/imports/resolution.ts`
- Test: `src/lib/imports/resolution.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `resolution.test.ts`:

```ts
import {
  applyCoursePick,
  buildCourseResolutions,
  buildUserResolutions,
  cellKey,
  cellStatusFromTokens,
} from "@/lib/imports/resolution";

describe("buildCourseResolutions origin", () => {
  it("tags backend auto-links with origin 'auto'", () => {
    const rows = [["Y2 R1"]];
    const map = {
      "Y2 R1": {
        status: "linked" as const,
        match: { id: 5, title: "Year 2 R1", code: null, academic_year: null, student_count: null, score: 95 },
        candidates: [],
      },
    };
    const out = buildCourseResolutions(rows, 0, ["r0"], map);
    expect(out.get("r0:courses")?.tokens?.[0].origin).toBe("auto");
  });
});

describe("cellStatusFromTokens", () => {
  it("returns linked when all tokens linked", () => {
    expect(
      cellStatusFromTokens([
        { raw: "a", status: "linked", match: { id: 1, title: "A" }, candidates: [] },
      ]),
    ).toBe("linked");
  });
  it("returns needs_attention when any token needs attention", () => {
    expect(
      cellStatusFromTokens([
        { raw: "a", status: "linked", match: { id: 1, title: "A" }, candidates: [] },
        { raw: "b", status: "needs_attention", match: null, candidates: [] },
      ]),
    ).toBe("needs_attention");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- resolution`
Expected: FAIL — `cellStatusFromTokens` is not exported; `origin` is undefined.

- [ ] **Step 3: Write minimal implementation**

In `resolution.ts`, add the `TokenOrigin` type and `origin` field, and export a shared status helper (replacing the duplicated logic):

```ts
export type TokenOrigin = "auto" | "propagated" | "manual";

export type CourseToken = {
  raw: string;
  status: "resolving" | "linked" | "needs_attention" | "none";
  match: { id: number; title: string } | null;
  candidates: CourseCandidate[];
  origin?: TokenOrigin;
};

export function cellStatusFromTokens(tokens: CourseToken[]): CellStatus {
  let worst: CourseToken["status"] = "linked";
  for (const t of tokens) {
    if ((WORST_ORDER[t.status] ?? 0) > (WORST_ORDER[worst] ?? 0)) worst = t.status;
  }
  if (worst === "needs_attention" || worst === "none") return "needs_attention";
  if (worst === "resolving") return "resolving";
  return "linked";
}
```

In `buildCourseResolutions`, set `origin` and reuse the helper:

```ts
const tokens: CourseToken[] = tokensRaw.map((raw) => {
  const r = courseMap[raw];
  if (!r) return { raw, status: "resolving", match: null, candidates: [] };
  return {
    raw,
    status: r.status,
    match: r.match ? { id: r.match.id, title: r.match.title } : null,
    candidates: r.candidates,
    origin: r.status === "linked" ? "auto" : undefined,
  };
});
out.set(key, { status: cellStatusFromTokens(tokens), tokens });
```

In `applyCoursePick`, replace the inline worst-of block with `return { status: cellStatusFromTokens(tokens), tokens };`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- resolution`
Expected: PASS (all existing + new tests).

- [ ] **Step 5: Checkpoint**

Run: `npm run test:unit && npm run lint`
Expected: tests pass, no new lint errors.

---

## Task 2: The propagateCoursePick fan-out engine (#1 core)

**Files:**
- Modify: `src/lib/imports/resolution.ts`
- Test: `src/lib/imports/resolution.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { propagateCoursePick } from "@/lib/imports/resolution";

describe("propagateCoursePick", () => {
  const rows = [["TX"], ["TX"], ["TX"], ["AA"]];
  const rowIds = ["r0", "r1", "r2", "r3"];
  function baseResolution() {
    return buildCourseResolutions(
      rows,
      0,
      rowIds,
      {
        TX: { status: "needs_attention", match: null, candidates: [] },
        AA: { status: "needs_attention", match: null, candidates: [] },
      },
    );
  }

  it("fans a pick out to all exact-match cells", () => {
    const { next, affected } = propagateCoursePick(
      baseResolution(), rows, 0, rowIds, "r0", "TX", { id: 9, title: "TX Course" },
    );
    expect(next.get("r0:courses")?.tokens?.[0].origin).toBe("manual");
    expect(next.get("r1:courses")?.tokens?.[0].status).toBe("linked");
    expect(next.get("r1:courses")?.tokens?.[0].origin).toBe("propagated");
    expect(next.get("r2:courses")?.tokens?.[0].match?.id).toBe(9);
    expect(next.get("r3:courses")?.tokens?.[0].status).toBe("needs_attention");
    expect(affected.sort()).toEqual(["r0", "r1", "r2"]);
  });

  it("respects prior manual picks", () => {
    let res = baseResolution();
    res = propagateCoursePick(res, rows, 0, rowIds, "r1", "TX", { id: 1, title: "Manual" }).next;
    const { next } = propagateCoursePick(res, rows, 0, rowIds, "r0", "TX", { id: 9, title: "TX Course" });
    expect(next.get("r1:courses")?.tokens?.[0].match?.id).toBe(1);
    expect(next.get("r2:courses")?.tokens?.[0].match?.id).toBe(9);
  });

  it("does not propagate a 'no course' pick", () => {
    const { next, affected } = propagateCoursePick(
      baseResolution(), rows, 0, rowIds, "r0", "TX", null,
    );
    expect(next.get("r0:courses")?.tokens?.[0].status).toBe("none");
    expect(next.get("r0:courses")?.tokens?.[0].origin).toBe("manual");
    expect(next.get("r1:courses")?.tokens?.[0].status).toBe("needs_attention");
    expect(affected).toEqual(["r0"]);
  });

  it("snapshot restores prior values", () => {
    const before = baseResolution();
    const { next, snapshot } = propagateCoursePick(
      before, rows, 0, rowIds, "r0", "TX", { id: 9, title: "TX Course" },
    );
    const restored = new Map(next);
    snapshot.forEach((v, k) => restored.set(k, v));
    expect(restored.get("r1:courses")?.tokens?.[0].status).toBe("needs_attention");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- resolution`
Expected: FAIL — `propagateCoursePick` not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `resolution.ts`:

```ts
export function propagateCoursePick(
  resolution: Map<string, CellResolution>,
  rows: (string | number | null)[][],
  coursesColIndex: number,
  rowIds: string[],
  sourceRowId: string,
  tokenRaw: string,
  choice: { id: number; title: string } | null,
): {
  next: Map<string, CellResolution>;
  affected: string[];
  snapshot: Map<string, CellResolution>;
} {
  const next = new Map(resolution);
  const snapshot = new Map<string, CellResolution>();
  const affected: string[] = [];

  const applyToCell = (rowId: string, origin: TokenOrigin) => {
    const key = cellKey(rowId, "courses");
    const cell = next.get(key);
    if (!cell?.tokens?.length) return;
    let changed = false;
    const tokens = cell.tokens.map((t) => {
      if (t.raw !== tokenRaw) return t;
      if (origin === "propagated" && t.origin === "manual") return t;
      changed = true;
      if (!choice) return { ...t, status: "none" as const, match: null, origin };
      return { ...t, status: "linked" as const, match: choice, candidates: [], origin };
    });
    if (!changed) return;
    snapshot.set(key, cell);
    next.set(key, { status: cellStatusFromTokens(tokens), tokens });
    affected.push(rowId);
  };

  applyToCell(sourceRowId, "manual");

  if (choice) {
    for (const rowId of rowIds) {
      if (rowId === sourceRowId) continue;
      applyToCell(rowId, "propagated");
    }
  }

  return { next, affected, snapshot };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- resolution`
Expected: PASS.

- [ ] **Step 5: Checkpoint**

Run: `npm run test:unit && npm run lint`
Expected: pass, no new lint errors.

---

## Task 3: Derived selectors — resolved check, unresolved groups, progress, conflicts

**Files:**
- Modify: `src/lib/imports/resolution.ts`
- Test: `src/lib/imports/resolution.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import {
  collectUnresolvedCourseTokens,
  computeCourseProgress,
  detectCourseConflicts,
  isCourseTokenResolved,
} from "@/lib/imports/resolution";

describe("isCourseTokenResolved", () => {
  it("linked is resolved; backend none is not; manual none is", () => {
    expect(isCourseTokenResolved({ raw: "a", status: "linked", match: { id: 1, title: "A" }, candidates: [] })).toBe(true);
    expect(isCourseTokenResolved({ raw: "a", status: "none", match: null, candidates: [] })).toBe(false);
    expect(isCourseTokenResolved({ raw: "a", status: "none", match: null, candidates: [], origin: "manual" })).toBe(true);
  });
});

describe("collectUnresolvedCourseTokens", () => {
  it("groups unresolved tokens by raw with counts", () => {
    const res = buildCourseResolutions(
      [["TX"], ["TX"], ["AA"]], 0, ["r0", "r1", "r2"],
      { TX: { status: "needs_attention", match: null, candidates: [] }, AA: { status: "needs_attention", match: null, candidates: [] } },
    );
    const groups = collectUnresolvedCourseTokens(res, ["r0", "r1", "r2"]);
    expect(groups.find((g) => g.raw === "TX")?.count).toBe(2);
    expect(groups.find((g) => g.raw === "AA")?.count).toBe(1);
  });
});

describe("computeCourseProgress", () => {
  it("counts resolved vs total unique raw values", () => {
    let res = buildCourseResolutions(
      [["TX"], ["TX"], ["AA"]], 0, ["r0", "r1", "r2"],
      { TX: { status: "needs_attention", match: null, candidates: [] }, AA: { status: "needs_attention", match: null, candidates: [] } },
    );
    res = propagateCoursePick(res, [["TX"], ["TX"], ["AA"]], 0, ["r0", "r1", "r2"], "r0", "TX", { id: 9, title: "TX" }).next;
    expect(computeCourseProgress(res, ["r0", "r1", "r2"])).toEqual({ resolved: 1, total: 2 });
  });
});

describe("detectCourseConflicts", () => {
  it("flags a raw linked to two different course ids", () => {
    let res = buildCourseResolutions(
      [["TX"], ["TX"]], 0, ["r0", "r1"],
      { TX: { status: "needs_attention", match: null, candidates: [] } },
    );
    res = propagateCoursePick(res, [["TX"], ["TX"]], 0, ["r0", "r1"], "r0", "TX", { id: 1, title: "One" }).next;
    res = propagateCoursePick(res, [["TX"], ["TX"]], 0, ["r0", "r1"], "r1", "TX", { id: 2, title: "Two" }).next;
    const conflicts = detectCourseConflicts(res, ["r0", "r1"]);
    expect(conflicts.find((c) => c.raw === "TX")?.titles.sort()).toEqual(["One", "Two"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- resolution`
Expected: FAIL — selectors not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `resolution.ts`:

```ts
export type UnresolvedTokenGroup = {
  raw: string;
  count: number;
  candidates: CourseCandidate[];
};

export type CourseConflict = { raw: string; titles: string[]; rowIds: string[] };

export function isCourseTokenResolved(t: CourseToken): boolean {
  if (t.status === "linked") return true;
  if (t.status === "none" && t.origin === "manual") return true;
  return false;
}

function eachCourseToken(
  resolution: Map<string, CellResolution>,
  rowIds: string[],
  fn: (token: CourseToken, rowId: string) => void,
) {
  for (const rowId of rowIds) {
    const cell = resolution.get(cellKey(rowId, "courses"));
    cell?.tokens?.forEach((t) => fn(t, rowId));
  }
}

export function collectUnresolvedCourseTokens(
  resolution: Map<string, CellResolution>,
  rowIds: string[],
): UnresolvedTokenGroup[] {
  const groups = new Map<string, UnresolvedTokenGroup>();
  eachCourseToken(resolution, rowIds, (t) => {
    if (t.status === "resolving" || isCourseTokenResolved(t)) return;
    const g = groups.get(t.raw);
    if (g) g.count += 1;
    else groups.set(t.raw, { raw: t.raw, count: 1, candidates: t.candidates });
  });
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

export function computeCourseProgress(
  resolution: Map<string, CellResolution>,
  rowIds: string[],
): { resolved: number; total: number } {
  const resolvedByRaw = new Map<string, boolean>();
  eachCourseToken(resolution, rowIds, (t) => {
    if (t.status === "resolving") return;
    const prev = resolvedByRaw.get(t.raw);
    const ok = isCourseTokenResolved(t);
    resolvedByRaw.set(t.raw, prev === undefined ? ok : prev && ok);
  });
  let resolved = 0;
  resolvedByRaw.forEach((ok) => { if (ok) resolved += 1; });
  return { resolved, total: resolvedByRaw.size };
}

export function detectCourseConflicts(
  resolution: Map<string, CellResolution>,
  rowIds: string[],
): CourseConflict[] {
  const byRaw = new Map<string, Map<number, { title: string; rowIds: string[] }>>();
  eachCourseToken(resolution, rowIds, (t, rowId) => {
    if (t.status !== "linked" || !t.match) return;
    let ids = byRaw.get(t.raw);
    if (!ids) { ids = new Map(); byRaw.set(t.raw, ids); }
    const entry = ids.get(t.match.id);
    if (entry) entry.rowIds.push(rowId);
    else ids.set(t.match.id, { title: t.match.title, rowIds: [rowId] });
  });
  const out: CourseConflict[] = [];
  byRaw.forEach((ids, raw) => {
    if (ids.size < 2) return;
    const titles: string[] = [];
    const rows: string[] = [];
    ids.forEach((v) => { titles.push(v.title); rows.push(...v.rowIds); });
    out.push({ raw, titles, rowIds: rows });
  });
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- resolution`
Expected: PASS.

- [ ] **Step 5: Checkpoint**

Run: `npm run test:unit && npm run lint`
Expected: pass.

---

## Task 4: Wire propagation + toast/undo into the review step (#1)

**Files:**
- Modify: `src/components/import-wizard/review-step.tsx`

- [ ] **Step 1: Implement propagation + toast + undo**

Replace the imports and `onPick` handler. Add `toast` import and `ToastAction`:

```ts
import {
  cellKey,
  propagateCoursePick,
} from "@/lib/imports/resolution";
import { toast } from "@/components/ui/use-toast";
import { ToastAction } from "@/components/ui/toast";
```

Add a helper to find the courses column index inside the component (reuse the existing `mapping` lookup pattern from `handleCellActivated`):

```ts
const coursesColIndex = useMemo(() => {
  const entry = Object.entries(useImportStore.getState().mapping).find(
    ([, f]) => f === "courses",
  );
  return entry ? Number(entry[0]) : -1;
}, []);
```

Replace the `onPick` prop on `CoursePickerPopover`:

```tsx
onPick={(tokenRaw, rowId, choice) => {
  if (coursesColIndex < 0) return;
  const { next, affected, snapshot } = propagateCoursePick(
    resolution,
    parse.rows,
    coursesColIndex,
    rowIds,
    rowId,
    tokenRaw,
    choice,
  );
  useImportStore.getState().mergeResolutions(next);
  if (choice && affected.length > 1) {
    toast({
      title: `Linked “${tokenRaw}” across ${affected.length} rows`,
      action: (
        <ToastAction
          altText="Undo"
          onClick={() => {
            const current = useImportStore.getState().resolution;
            const restored = new Map(current);
            snapshot.forEach((v, k) => restored.set(k, v));
            useImportStore.setState({ resolution: restored });
          }}
        >
          Undo
        </ToastAction>
      ),
    });
  }
  setPickerTarget(null);
}}
```

> Note: `mergeResolutions` already replaces matching keys; `next` is a full map derived from the current `resolution`, so merging it in is correct and preserves non-course cells.

- [ ] **Step 2: Verify regression tests still pass**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 3: Lint + typecheck**

Run: `npm run lint`
Expected: no new errors. (`.tsx` toast action requires the file already be a client component — it is, `"use client"` at top.)

- [ ] **Step 4: Manual verification**

Run `npm run dev`, go to `/imports`, upload a file with a repeated course token, reach review, pick a course for one `TX` cell. Expected: all other `TX` cells flip to the linked chip; a toast `Linked “TX” across N rows` appears with an Undo that reverts them. A `Mark as “no course”` pick changes only the clicked cell with no toast.

- [ ] **Step 5: Checkpoint**

Run: `npm run test:unit && npm run lint`
Expected: pass.

---

## Task 5: Affected-row count in picker (#8) + best-guess hint on chip (#6)

**Files:**
- Modify: `src/components/import-grid/course-picker-popover.tsx`
- Modify: `src/components/import-grid/cells/course-link-cell.tsx`
- Modify: `src/components/import-wizard/review-step.tsx` (pass count into target)

- [ ] **Step 1: Add affectedRows to the picker target and header**

In `course-picker-popover.tsx`, extend `CoursePickerTarget`:

```ts
export type CoursePickerTarget = {
  rowId: string;
  tokenRaw: string;
  rect: { x: number; y: number; width: number; height: number };
  candidates: CourseCandidate[];
  affectedRows: number;
};
```

Update the header line:

```tsx
<div className="border-b bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
  Spreadsheet value: <b>“{target.tokenRaw}”</b>
  {target.affectedRows > 1 ? ` · will link ${target.affectedRows} rows` : null}
</div>
```

- [ ] **Step 2: Compute affectedRows when opening the picker**

In `review-step.tsx` `handleCellActivated`, before `setPickerTarget`, count matching non-manual unresolved/auto tokens for the chosen `unresolved.raw`:

```ts
let affectedRows = 0;
rowIds.forEach((rid) => {
  const c = resolution.get(cellKey(rid, "courses"));
  if (c?.tokens?.some((t) => t.raw === unresolved.raw && t.origin !== "manual")) {
    affectedRows += 1;
  }
});

setPickerTarget({
  rowId: rowIds[sourceRow],
  tokenRaw: unresolved.raw,
  rect: bounds,
  candidates: unresolved.candidates,
  affectedRows,
});
```

- [ ] **Step 3: Add best-guess hint on needs_attention chips**

In `cells/course-link-cell.tsx`, the cell `data` already carries `tokens`. For a `needs_attention` token with a top candidate, render the candidate title as a faint hint before `choose`. Update the draw loop:

```ts
} else {
  const hint = t.candidates?.[0]?.title;
  const label = hint ? `${t.raw} → ${hint}?` : t.raw;
  x += drawChip(ctx, x, cy - 10, `${label} choose`, { attn: true });
}
```

> `candidates` already lives on `CourseToken` (which `CourseLinkCellData.tokens` uses directly), so no type change is needed for this step.

- [ ] **Step 4: Verify tests + lint**

Run: `npm run test:unit && npm run lint`
Expected: pass. Manual: open picker → header shows `will link N rows`; an ambiguous chip shows `TX → TX Course? choose`.

- [ ] **Step 5: Checkpoint**

Run: `npm run test:unit && npm run lint`
Expected: pass.

---

## Task 6: Needs-attention panel + progress + import gating (#2, #3)

**Files:**
- Create: `src/components/import-grid/needs-attention-panel.tsx`
- Modify: `src/components/import-wizard/review-step.tsx`

- [ ] **Step 1: Create the panel component**

```tsx
"use client";

import type { UnresolvedTokenGroup, CourseConflict } from "@/lib/imports/resolution";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export function NeedsAttentionPanel({
  groups,
  conflicts,
  progress,
  onResolve,
}: {
  groups: UnresolvedTokenGroup[];
  conflicts: CourseConflict[];
  progress: { resolved: number; total: number };
  onResolve: (
    group: UnresolvedTokenGroup,
    rect: { x: number; y: number; width: number; height: number },
  ) => void;
}) {
  const pct = progress.total ? (progress.resolved / progress.total) * 100 : 100;
  return (
    <aside className="w-72 shrink-0 space-y-3 rounded-md border border-border p-3">
      <div className="space-y-1">
        <p className="text-sm font-medium">
          {progress.resolved} of {progress.total} course values resolved
        </p>
        <Progress value={pct} className="h-1.5" />
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">All course values resolved.</p>
      ) : (
        <ul className="space-y-1">
          {groups.map((g) => (
            <li key={g.raw}>
              <Button
                type="button"
                variant="ghost"
                className="w-full justify-between"
                onClick={(e) => {
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  onResolve(g, { x: r.left, y: r.top, width: r.width, height: r.height });
                }}
              >
                <span className="truncate text-amber-800 dark:text-amber-200">{g.raw}</span>
                <span className="ml-2 text-xs text-muted-foreground">× {g.count}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}

      {conflicts.length > 0 && (
        <div className="space-y-1 border-t pt-2">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-300">Conflicts</p>
          {conflicts.map((c) => (
            <p key={c.raw} className="text-xs text-muted-foreground">
              ⚠ “{c.raw}” linked to {c.titles.length} different courses
            </p>
          ))}
        </div>
      )}
    </aside>
  );
}
```

> Confirm `@/components/ui/progress` exists (it is in `package.json` via `@radix-ui/react-progress`). If the wrapper component is missing, fall back to a plain `<div>` bar; do not add new deps.

- [ ] **Step 2: Wire the panel into review-step and gate Import**

In `review-step.tsx`, compute derived data and lay out grid + panel side by side:

```tsx
import {
  collectUnresolvedCourseTokens,
  computeCourseProgress,
  detectCourseConflicts,
} from "@/lib/imports/resolution";
import { NeedsAttentionPanel } from "@/components/import-grid/needs-attention-panel";

const unresolvedGroups = useMemo(
  () => collectUnresolvedCourseTokens(resolution, rowIds),
  [resolution, rowIds],
);
const courseProgress = useMemo(
  () => computeCourseProgress(resolution, rowIds),
  [resolution, rowIds],
);
const conflicts = useMemo(
  () => detectCourseConflicts(resolution, rowIds),
  [resolution, rowIds],
);
```

Replace the grid block with a flex row, and update the Import button to gate on remaining:

```tsx
<div className="flex gap-4">
  <div className="min-w-0 flex-1">
    <ImportDataGrid onCellActivated={handleCellActivated} />
  </div>
  <NeedsAttentionPanel
    groups={unresolvedGroups}
    conflicts={conflicts}
    progress={courseProgress}
    onResolve={(group, rect) => {
      const firstRow = rowIds.find((rid) =>
        resolution
          .get(cellKey(rid, "courses"))
          ?.tokens?.some((t) => t.raw === group.raw && t.origin !== "manual"),
      );
      if (!firstRow) return;
      setPickerTarget({
        rowId: firstRow,
        tokenRaw: group.raw,
        rect,
        candidates: group.candidates,
        affectedRows: group.count,
      });
    }}
  />
</div>
```

Update the Import button (it remains disabled because commit is still stubbed, but the message becomes meaningful):

```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <span>
      <Button type="button" disabled>
        Import
      </Button>
    </span>
  </TooltipTrigger>
  <TooltipContent>
    {unresolvedGroups.length > 0
      ? `Resolve ${unresolvedGroups.length} remaining course value${unresolvedGroups.length === 1 ? "" : "s"}`
      : "Commit/import coming in a later iteration."}
  </TooltipContent>
</Tooltip>
```

- [ ] **Step 3: Verify**

Run: `npm run test:unit && npm run lint`
Expected: pass. Manual at `/imports`: panel lists `TX × 4`; clicking Resolve opens the picker anchored near the panel; picking clears the whole group and updates the progress bar.

- [ ] **Step 4: Checkpoint**

Run: `npm run test:unit && npm run lint`
Expected: pass.

---

## Task 7: Re-link an already-linked cell (#4)

**Files:**
- Modify: `src/components/import-wizard/review-step.tsx`

- [ ] **Step 1: Allow the picker to open on a linked token**

In `handleCellActivated`, change the unresolved-only selection so that if there is no unresolved token, fall back to the first linked token (re-link). Replace the `unresolved` block:

```ts
const actionable =
  tokens.find((t) => t.status === "needs_attention" || t.status === "none") ??
  tokens.find((t) => t.status === "linked");
if (!actionable) return;

let affectedRows = 0;
rowIds.forEach((rid) => {
  const c = resolution.get(cellKey(rid, "courses"));
  if (c?.tokens?.some((t) => t.raw === actionable.raw && t.origin !== "manual")) {
    affectedRows += 1;
  }
});

setPickerTarget({
  rowId: rowIds[sourceRow],
  tokenRaw: actionable.raw,
  rect: bounds,
  candidates: actionable.candidates,
  affectedRows,
});
```

> Known v1 limitation (documented in spec): for multi-token cells, re-link targets the first unresolved token, else the first linked token. Chip-level hit testing is deferred.

- [ ] **Step 2: Verify**

Run: `npm run test:unit && npm run lint`
Expected: pass. Manual: click a linked `✓` course chip → picker reopens; choosing a different course re-propagates to non-manual matches and shows the toast.

- [ ] **Step 3: Checkpoint**

Run: `npm run test:unit && npm run lint`
Expected: pass.

---

## Task 8: Conflict badge on chips (#7)

**Files:**
- Modify: `src/components/import-grid/cells/types.ts`
- Modify: `src/components/import-grid/import-data-grid.tsx`
- Modify: `src/components/import-grid/cells/course-link-cell.tsx`

- [ ] **Step 0: Allow a display-only conflict flag on cell tokens**

In `cells/types.ts`, change the course token type to carry an optional conflict flag (keeps the domain `CourseToken` clean):

```ts
import type { CourseToken } from "@/lib/imports/resolution";

export type CourseLinkCellData = {
  kind: "course-link-cell";
  raw: string;
  status: "idle" | "resolving" | "linked" | "needs_attention";
  tokens: (CourseToken & { conflict?: boolean })[];
};
```

- [ ] **Step 1: Pass conflict raw-set into the course cell data**

In `import-data-grid.tsx`, compute a set of conflicted raw strings and include a per-token `conflict` flag when building the `course-link-cell` data. Add near the top of the component:

```ts
import { detectCourseConflicts } from "@/lib/imports/resolution";

const conflictRaws = useMemo(() => {
  const set = new Set<string>();
  detectCourseConflicts(resolution, rowIds).forEach((c) => set.add(c.raw));
  return set;
}, [resolution, rowIds]);
```

In `getCellContent` for the `courses` branch, map tokens to include a conflict flag (do not mutate stored tokens):

```ts
if (field === "courses") {
  const tokens = (res?.tokens ?? []).map((t) => ({
    ...t,
    conflict: t.status === "linked" && conflictRaws.has(t.raw),
  }));
  return {
    kind: GridCellKind.Custom,
    allowOverlay: true,
    readonly: true,
    copyData: value,
    data: { kind: "course-link-cell", raw: value, status: res?.status ?? "idle", tokens },
  } as GridCell;
}
```

Add `conflictRaws` to the `getCellContent` dependency array.

- [ ] **Step 2: Render the conflict badge in the cell**

In `cells/course-link-cell.tsx`, in the `linked` branch, append a `⚠` when `t.conflict` is set:

```ts
} else if (t.status === "linked") {
  const title = t.match?.title ?? t.raw;
  x += drawChip(ctx, x, cy - 10, t.conflict ? `${title} ⚠` : title, { check: true });
}
```

> The `conflict` field is already typed via `CourseLinkCellData` (Step 0), so `t.conflict` is available here.

- [ ] **Step 3: Verify**

Run: `npm run test:unit && npm run lint`
Expected: pass. Manual: manually link the same raw token to two different courses in different rows (re-link one) → both linked chips show `⚠` and the panel lists the conflict.

- [ ] **Step 4: Checkpoint**

Run: `npm run test:unit && npm run lint`
Expected: pass.

---

## Final verification

- [ ] Run full unit suite: `npm run test:unit` → all pass.
- [ ] Run lint: `npm run lint` → no new errors.
- [ ] Manual smoke at `/imports`: propagation + toast/undo, panel resolve, progress, re-link, affected-count, best-guess hint, conflict badge all behave per spec.

## Spec coverage map

| Spec item | Task |
| --- | --- |
| #1 Propagation + toast/undo | 1, 2, 4 |
| #2 Needs-attention panel | 3, 6 |
| #3 Progress + import gating | 3, 6 |
| #4 Re-link linked cell | 7 |
| #6 Confidence / best-guess | 5 |
| #7 Conflict surfacing | 3, 6, 8 |
| #8 Affected-row count | 5 |
| Origin model + engine + selectors | 1, 2, 3 |
