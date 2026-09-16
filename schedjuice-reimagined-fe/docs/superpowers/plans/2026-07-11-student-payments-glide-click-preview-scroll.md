# Student payments Glide click-to-preview + scroll fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop Glide hover-driven screenshot preview, switch to click-to-preview, and size the DataEditor from the measured container so scrolling works again.

**Architecture:** Reuse `screenshot-preview-store` + `applyScreenshotPreviewHover`. Glide report path calls the store only from cell click (`onRowSelect`), never from `onItemHovered` or mouse leave. Always set `DataSheet` height from `useContainerHeight` (drop `window.innerHeight - offset`). Memoize the shell’s connected preview column; keep ResourceTable on hover + leave-to-clear.

**Tech Stack:** React, Glide Data Grid, existing preview store, Vitest (`npm run test:unit`)

**Spec:** `docs/superpowers/specs/2026-07-11-student-payments-glide-click-preview-scroll-design.md`

All commands run from `schedjuice-reimagined-fe/`.

---

## File Structure

| File | Action | Responsibility |
| --- | --- | --- |
| `src/lib/finances/screenshot-preview-empty-copy.ts` | Create | Empty-state copy string(s) for click vs hover |
| `src/lib/finances/screenshot-preview-empty-copy.test.ts` | Create | Unit tests for copy helper |
| `src/components/finances/screenshot-preview-pane.tsx` | Modify | Accept optional empty copy; default click wording |
| `src/components/finances/screenshot-preview-column.tsx` | Modify | Pass empty copy through |
| `src/components/finances/screenshot-preview-column-connected.tsx` | Modify | Accept `emptyCopy` prop |
| `src/components/finances/student-payments-grid.tsx` | Modify | `onRowSelect` on click; remove preview hover/leave; measured height only |
| `src/components/finances/student-payments-report-shell.tsx` | Modify | Glide: `onRowSelect` only; memoized preview column; ResourceTable keeps hover |

---

### Task 1: Empty-state copy helper (TDD)

**Files:**
- Create: `src/lib/finances/screenshot-preview-empty-copy.ts`
- Test: `src/lib/finances/screenshot-preview-empty-copy.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/finances/screenshot-preview-empty-copy.test.ts
import { describe, expect, it } from "vitest";
import { screenshotPreviewEmptyCopy } from "./screenshot-preview-empty-copy";

describe("screenshotPreviewEmptyCopy", () => {
  it("returns click copy for click mode", () => {
    expect(screenshotPreviewEmptyCopy("click")).toBe("Click a row to preview");
  });

  it("returns hover copy for hover mode", () => {
    expect(screenshotPreviewEmptyCopy("hover")).toBe("Hover a row to preview");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/finances/screenshot-preview-empty-copy.test.ts`

Expected: FAIL (module not found)

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/finances/screenshot-preview-empty-copy.ts
export type ScreenshotPreviewInteraction = "click" | "hover";

export function screenshotPreviewEmptyCopy(
  interaction: ScreenshotPreviewInteraction,
): string {
  return interaction === "hover"
    ? "Hover a row to preview"
    : "Click a row to preview";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/lib/finances/screenshot-preview-empty-copy.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/finances/screenshot-preview-empty-copy.ts src/lib/finances/screenshot-preview-empty-copy.test.ts
git commit -m "$(cat <<'EOF'
feat(finances): add screenshot preview empty-state copy helper

EOF
)"
```

---

### Task 2: Wire empty copy through the preview pane

**Files:**
- Modify: `src/components/finances/screenshot-preview-pane.tsx`
- Modify: `src/components/finances/screenshot-preview-column.tsx`
- Modify: `src/components/finances/screenshot-preview-column-connected.tsx`

- [ ] **Step 1: Update `ScreenshotPreviewPane` to take `emptyCopy`**

In `screenshot-preview-pane.tsx`:

- Import `screenshotPreviewEmptyCopy`.
- Add prop `emptyCopy?: string` (default `screenshotPreviewEmptyCopy("click")`).
- Replace the hard-coded `"Hover a row to preview"` with `{emptyCopy}`.

```tsx
import { screenshotPreviewEmptyCopy } from "@/lib/finances/screenshot-preview-empty-copy";

export function ScreenshotPreviewPane({
  url,
  className,
  hideTitle = false,
  onImageClick,
  emptyCopy = screenshotPreviewEmptyCopy("click"),
}: {
  url: string | null;
  className?: string;
  hideTitle?: boolean;
  onImageClick?: () => void;
  emptyCopy?: string;
}) {
  // ...
  {status.kind === "empty" ? (
    <p className="text-sm text-muted-foreground">{emptyCopy}</p>
  ) : null}
```

- [ ] **Step 2: Thread `emptyCopy` through column + connected column**

In `screenshot-preview-column.tsx`, add optional `emptyCopy?: string` and pass it to `ScreenshotPreviewPane`.

In `screenshot-preview-column-connected.tsx`, add optional `emptyCopy?: string` and pass it to `ScreenshotPreviewColumn`.

- [ ] **Step 3: Commit**

```bash
git add src/components/finances/screenshot-preview-pane.tsx \
  src/components/finances/screenshot-preview-column.tsx \
  src/components/finances/screenshot-preview-column-connected.tsx
git commit -m "$(cat <<'EOF'
feat(finances): support click empty copy on screenshot preview pane

EOF
)"
```

---

### Task 3: Measured container height for Glide DataSheet

**Files:**
- Modify: `src/components/finances/student-payments-grid.tsx` (height effect ~1040–1060)

- [ ] **Step 1: Always use measured container height**

Replace the height state/effect block that uses `window.innerHeight - offset` with measured height only.

Find:

```tsx
  const [gridHeight, setGridHeight] = useState(520);
  const measuredHeight = useContainerHeight(gridContainerRef, [
    effectiveFullscreen,
    sidePanel,
    rows.length,
    showSkeleton,
  ]);

  useEffect(() => {
    if (effectiveFullscreen) {
      setGridHeight(measuredHeight);
      return;
    }
    const update = () => {
      const offset = sidePanel ? 380 : 340;
      setGridHeight(Math.max(360, window.innerHeight - offset));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [effectiveFullscreen, sidePanel, measuredHeight]);
```

Replace with:

```tsx
  const measuredHeight = useContainerHeight(gridContainerRef, [
    effectiveFullscreen,
    Boolean(sidePanel),
    rows.length,
    showSkeleton,
  ]);
  const gridHeight = measuredHeight;
```

Remove the unused `useState` / `useEffect` for `gridHeight` if nothing else needs them. Keep the existing `repaintNudge` logic that adds `+ repaintNudge` to `height={gridHeight + repaintNudge}`.

Rationale: `window.innerHeight - 340/380` can exceed the flex child’s real height (header + filters + summary inside the card). Glide then thinks all rows fit, parent `overflow-hidden` clips content, and scroll feels dead.

- [ ] **Step 2: Sanity-check TypeScript on the file**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | head -n 40`

Expected: no new errors in `student-payments-grid.tsx` (existing project errors unrelated to this file may appear — ignore those).

- [ ] **Step 3: Commit**

```bash
git add src/components/finances/student-payments-grid.tsx
git commit -m "$(cat <<'EOF'
fix(finances): size student payments Glide from measured container height

EOF
)"
```

---

### Task 4: Click-to-preview on Glide; stop hover preview writes

**Files:**
- Modify: `src/components/finances/student-payments-grid.tsx`

- [ ] **Step 1: Add `onRowSelect` prop**

In `StudentPaymentsGridProps` (near `onRowHover`):

```tsx
  /** Click/select a row for screenshot preview (Glide). Does not clear on mouse leave. */
  onRowSelect?: (row: StudentPaymentAdminReportRow) => void;
  /** Hover preview (ResourceTable / legacy). Null clears. */
  onRowHover?: (row: StudentPaymentAdminReportRow | null) => void;
```

Destructure `onRowSelect` in `StudentPaymentsGridContent` alongside `onRowHover`.

- [ ] **Step 2: Call `onRowSelect` at the start of `handleCellClicked`**

Inside `handleCellClicked`, after resolving `record`, before field-specific early returns:

```tsx
      const record = rows[row];
      if (!field || !record) return;

      onRowSelect?.(record);

      const target: CellAnchorTarget = {
        rowIndex: row,
        rect: event.bounds,
      };
      // ... existing field handlers unchanged
```

Add `onRowSelect` to the `handleCellClicked` dependency array.

- [ ] **Step 3: Gate hover preview on `onRowHover` only; remove leave-clear when using select**

Keep `handleItemHovered` only when `onRowHover` is provided (current body is fine).

In `gridProps`:

```tsx
  const gridProps = useMemo(
    () => ({
      freezeColumns: isReport ? 2 : 1,
      onCellEdited,
      onCellClicked: handleCellClicked,
      ...(onRowHover ? { onItemHovered: handleItemHovered } : {}),
    }),
    [isReport, onCellEdited, handleCellClicked, onRowHover, handleItemHovered],
  );
```

Update `gridPane` mouse leave:

```tsx
  const gridPane = (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      onMouseLeave={() => {
        // Hover mode clears; click-to-select stays sticky.
        if (onRowHover) onRowHover(null);
      }}
    >
```

Do **not** clear preview on mouse leave when only `onRowSelect` is set.

- [ ] **Step 4: Commit**

```bash
git add src/components/finances/student-payments-grid.tsx
git commit -m "$(cat <<'EOF'
feat(finances): drive Glide payment preview from row click, not hover

EOF
)"
```

---

### Task 5: Shell wiring — Glide select vs ResourceTable hover

**Files:**
- Modify: `src/components/finances/student-payments-report-shell.tsx`

- [ ] **Step 1: Stabilize preview column + empty copy per view**

Replace the inline `previewColumn` JSX with `useMemo`, and pass interaction-specific empty copy.

```tsx
import { screenshotPreviewEmptyCopy } from "@/lib/finances/screenshot-preview-empty-copy";

  const openViewImage = useCallback((url: string) => {
    setViewImageUrl(url);
  }, []);

  const previewEmptyCopy = screenshotPreviewEmptyCopy(
    useGlideView ? "click" : "hover",
  );

  const previewColumn = useMemo(() => {
    if (!canViewScreenshots) return null;
    return (
      <ScreenshotPreviewColumnConnected
        collapsed={previewCollapsed}
        onToggle={togglePreviewCollapsed}
        onImageClick={openViewImage}
        emptyCopy={previewEmptyCopy}
        className="sticky top-0 max-h-[min(100%,75dvh)] self-start"
      />
    );
  }, [
    canViewScreenshots,
    previewCollapsed,
    togglePreviewCollapsed,
    openViewImage,
    previewEmptyCopy,
  ]);
```

Note: `useGlideView` is only safe after hydration gate — keep `previewColumn` construction **after** the `if (!gridViewHydrated || !previewCollapsedHydrated)` early return, **or** compute empty copy inside each branch to avoid calling hooks conditionally. Preferred: keep hooks unconditional:

```tsx
  const previewEmptyCopy = screenshotPreviewEmptyCopy(
    useGlideView ? "click" : "hover",
  );
```

above the hydration return is fine (`useGlideView` already exists before that return).

Move `useMemo` for `previewColumn` above the hydration return as well (hooks must stay unconditional).

- [ ] **Step 2: Glide path — `onRowSelect`, no `onRowHover`**

```tsx
  if (useGlideView) {
    return (
      <>
        <StudentPaymentsGrid
          variant="report"
          fixedCourseId={fixedCourseId}
          courseMeta={courseMeta}
          globalTransactionLookup={globalTransactionLookup}
          headerActions={headerActions}
          onOpenStudent={openStudent}
          sidePanel={previewColumn ?? undefined}
          onRowSelect={handleRowHover}
        />
        {studentDrawer}
        {screenshotDialog}
        {coverageDialog}
      </>
    );
  }
```

`handleRowHover` already calls `applyScreenshotPreviewHover(row, { enabled })`. For `onRowSelect`, the signature is `(row) => void` (non-null). Wrap if needed:

```tsx
  const handleRowSelect = useCallback(
    (row: StudentPaymentAdminReportRow) => {
      applyScreenshotPreviewHover(row, { enabled: canViewScreenshots });
    },
    [canViewScreenshots],
  );
```

Pass `onRowSelect={handleRowSelect}` on Glide. Keep `onRowHover={handleRowHover}` on ResourceTable (null clears).

Keep existing unmount cleanup:

```tsx
  useEffect(() => {
    return () => {
      setScreenshotPreviewUrl(null);
    };
  }, []);
```

- [ ] **Step 3: ResourceTable path — hover empty copy**

Ensure ResourceTable’s `previewColumn` uses hover empty copy (from Step 1 `previewEmptyCopy` when `!useGlideView`).

- [ ] **Step 4: Commit**

```bash
git add src/components/finances/student-payments-report-shell.tsx
git commit -m "$(cat <<'EOF'
feat(finances): wire Glide click preview and ResourceTable hover separately

EOF
)"
```

---

### Task 6: Manual verification + unit regression

- [ ] **Step 1: Run unit tests for preview helpers**

Run:

```bash
npm run test:unit -- \
  src/lib/finances/screenshot-preview-empty-copy.test.ts \
  src/lib/finances/screenshot-preview-store.test.ts \
  src/lib/finances/apply-screenshot-preview-hover.test.ts \
  src/lib/finances/screenshot-preview-status.test.ts
```

Expected: all PASS

- [ ] **Step 2: Manual checklist (Glide — finance + course)**

1. Pane open, enough rows to overflow editor → wheel/trackpad moves rows.
2. Click rows → preview updates; scroll still works.
3. Move mouse out of grid → preview stays on last clicked row.
4. Hover without clicking → preview does not change.
5. Collapse/expand pane + View lightbox still work.
6. Toggle to Original table → hover preview + leave-to-clear still work; empty copy says “Hover a row…”.

- [ ] **Step 3: Final commit only if Step 2 found copy/typo fixes**

If no code changes, skip. Otherwise commit the fix with a clear message.

---

## Spec coverage (self-review)

| Spec requirement | Task |
| --- | --- |
| Click/select preview on Glide | Task 4–5 |
| No hover preview writes on Glide | Task 4–5 |
| Sticky preview on mouse leave (Glide) | Task 4 |
| Measured container height | Task 3 |
| Shell memoized / stable preview column | Task 5 |
| ResourceTable hover unchanged | Task 5 |
| Empty copy “Click a row…” | Task 1–2, 5 |
| Unmount clears store | Task 5 (existing) |
| Overlay cell clicks set preview | Task 4 (`onRowSelect` before early returns) |

No placeholders. Types: `onRowSelect: (row: StudentPaymentAdminReportRow) => void`; hover remains `(row | null) => void`.
