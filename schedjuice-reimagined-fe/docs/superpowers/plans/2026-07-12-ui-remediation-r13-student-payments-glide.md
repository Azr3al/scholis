# R13 — Student-Payments Glide Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remediate the Glide (DataSheet) student-payments view on all report surfaces so measured container height enables internal scrolling, click-to-preview replaces hover-driven preview, preview stays sticky on mouse leave, column widths preserve txn/description floors, and save overlays do not remount or block scroll.

**Architecture:** R13 owns `student-payments-grid.tsx` and the Glide branch of `student-payments-report-shell.tsx` only after R12 Task 0 layout extraction merges. Shell uses `StudentPaymentsSplitPane` from R12 layout module. Preview writes go through `applyScreenshotPreviewHover` on **click** only; `onItemHovered` must not update preview store on report variant. Recent-transactions Glide variant shares grid code — R13 fixes `variant="recent-transactions"` height/scroll in same file.

**Tech Stack:** `@glideapps/glide-data-grid`, `useContainerHeight`, Vitest, Jul 11 specs: `2026-07-11-student-payments-glide-click-preview-scroll-design.md`, `2026-07-11-student-payments-glide-hover-preview-perf-design.md`.

**Program spec:** `docs/superpowers/specs/2026-07-12-ui-migration-remediation-program-design.md`  
**Planning baseline SHA:** `05ac447b10966131d4f37a2ba724110c33d66dd4` on `dev`  
**Dependencies (blocking):** R0–R5 merged; **R12 Task 0 shell layout extraction merged**; R12 must not be actively editing `student-payments-report-shell.tsx`.

---

## Route assignment (Glide view on these URLs)

| Route pattern | Fixture URL | View mode | Personas |
| --- | --- | --- | --- |
| `/finances/student-payments` | `/finances/student-payments?date=2026-07-01T00:00:00.000Z` | Glide (toggle ON) | Admin |
| `/finances/student-payments?courseId=N` | course-scoped | Glide | Admin/teacher |
| `/finances/student-payments/transaction-lookup` | with `transactionId` query | Glide | Admin |
| `/courses/[id]/student-payments` | `/courses/1/student-payments` | Glide | Teacher/admin |
| `/finances/recent-transactions` | `/finances/recent-transactions` | Glide toggle ON | Admin (`variant="recent-transactions"`) |

ResourceTable view on the first four URLs is **R12** — not re-tested as pass criteria here.

---

## Serialized ownership

| File | R12 | R13 |
| --- | --- | --- |
| `student-payments-report-shell-layout.tsx` | created | **read-only consume** |
| `student-payments-report-shell.tsx` Glide branch lines 204–221 | frozen | **owns** refactor to layout module |
| `student-payments-grid.tsx` entire file | **forbidden** | **owns** |
| `student-payments-filter-ui.ts` lines 1–2 `STUDENT_PAYMENT_GLIDE_*` | forbidden | **owns** |
| `screenshot-preview-empty-copy.ts` | owns hover string | uses `"click"` in Glide paths only |

**Blocker:** If R12 Task 0 is not on branch, stop immediately.

---

## Forbidden files (R13)

- `src/components/finances/student-payments-resource-table.tsx`
- `src/app/(internal)/finances/recent-transactions/page.tsx` (R11 owns page shell; grid-only changes allowed in `student-payments-grid.tsx`)
- Upload/verification routes (R14)
- `src/lib/finances/flatten-payment-report-rows.ts` (R12)

---

## Evidence / current behavior (`05ac447b`)

### `student-payments-grid.tsx` (1419 lines)

- Lines 124–134: Props include `onRowSelect` (click) and `onRowHover` (hover) — shell passes `onRowSelect` for Glide, `onRowHover` only for ResourceTable.
- Lines 1019–1035: `handleItemHovered` still calls `onRowHover` when provided — must not receive `onRowHover` on report Glide path.
- Lines 1037–1045: `gridProps` spreads `onItemHovered` when `onRowHover` set — report Glide must omit.
- Lines 1047–1053: `useContainerHeight(gridContainerRef, [effectiveFullscreen, Boolean(sidePanel), rows.length, showSkeleton])` — shipped in `b734715c` / `d95d91f4`; verify scroll still dead when row content exceeds editor.
- Lines 1344–1419: Report shell layout duplicates chrome — should consume R12 `studentPaymentsReportShellClassName` + split pane.
- Column widths: `STUDENT_PAYMENT_GLIDE_TXN_ID_WIDTH = 280`, `STUDENT_PAYMENT_GLIDE_DESCRIPTION_WIDTH = 320` in `student-payments-filter-ui.ts`.

### `student-payments-report-shell.tsx`

- Lines 204–221: Glide path passes `sidePanel={previewColumn}` into grid — Jul 11 spec prefers shell-owned split pane; R13 moves preview to shell using `StudentPaymentsSplitPane`.
- Lines 99–104: `handleRowSelect` applies click preview — correct.
- Lines 116–118: empty copy uses `click` when `useGlideView` — correct for Glide.

### Jul 11 commits

- `02610bbf` wire Glide click preview and ResourceTable hover separately
- `a00ad00c` drive preview from row click not hover
- `d95d91f4` bound grid row height for scroll

---

## File structure

| File | Action |
| --- | --- |
| `src/components/finances/student-payments-grid.tsx` | Modify — click preview, height, hover isolation |
| `src/components/finances/student-payments-report-shell.tsx` | Modify — Glide branch layout only |
| `src/lib/finances/student-payments-filter-ui.ts` | Modify — Glide width constants if R3 requires rem units |
| `src/lib/finances/student-payments-filter-ui.test.ts` | Modify |
| `src/lib/finances/glide-report-preview.ts` | Create — pure click routing helper |
| `src/lib/finances/glide-report-preview.test.ts` | Create |

---

## Stop conditions

1. R12 Task 0 not merged — hard stop.
2. Editing ResourceTable files — stop (R12).
3. Scroll fix requires changing `use-container-height.ts` — escalate to R5/R0 contract owner.
4. `onItemHovered` still drives preview store in manual QA — task incomplete.

## Rollback / data safety

- Click preview only sets URL in zustand store — no API calls.
- Cell edits still use `updateEntity` — preserve existing mutation error handling.

---

### Task 1: Pure click-preview routing helper (TDD)

**Files:**
- Create: `src/lib/finances/glide-report-preview.ts`
- Create: `src/lib/finances/glide-report-preview.test.ts`

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it, vi } from "vitest";
import type { StudentPaymentAdminReportRow } from "@/components/finances/student-payments-report";
import { UserPaymentStatus } from "@/types/finance";
import { applyGlideRowClickPreview } from "./glide-report-preview";

const baseRow: StudentPaymentAdminReportRow = {
  id: 1,
  status: UserPaymentStatus.pending_payment,
  screenshot: "https://cdn.example/a.png",
};

describe("applyGlideRowClickPreview", () => {
  it("calls applyScreenshotPreviewHover when screenshots enabled", () => {
    const apply = vi.fn();
    applyGlideRowClickPreview(baseRow, { enabled: true, apply });
    expect(apply).toHaveBeenCalledWith(baseRow, { enabled: true });
  });

  it("no-ops when screenshots disabled", () => {
    const apply = vi.fn();
    applyGlideRowClickPreview(baseRow, { enabled: false, apply });
    expect(apply).not.toHaveBeenCalled();
  });

  it("passes null row to clear preview", () => {
    const apply = vi.fn();
    applyGlideRowClickPreview(null, { enabled: true, apply });
    expect(apply).toHaveBeenCalledWith(null, { enabled: true });
  });
});
```

- [ ] **Step 2: Run — FAIL**

Run: `npm run test:unit -- src/lib/finances/glide-report-preview.test.ts`

- [ ] **Step 3: Implement**

```ts
import type { StudentPaymentAdminReportRow } from "@/components/finances/student-payments-report";

export type GlidePreviewApply = (
  row: StudentPaymentAdminReportRow | null,
  opts: { enabled: boolean },
) => void;

export function applyGlideRowClickPreview(
  row: StudentPaymentAdminReportRow | null,
  opts: { enabled: boolean; apply: GlidePreviewApply },
): void {
  if (!opts.enabled) return;
  opts.apply(row, { enabled: true });
}
```

- [ ] **Step 4: PASS + commit**

```bash
git add src/lib/finances/glide-report-preview.ts src/lib/finances/glide-report-preview.test.ts
git commit -m "$(cat <<'EOF'
feat(finances): add Glide row click preview routing helper

EOF
)"
```

---

### Task 2: Isolate hover from preview on report Glide path

**Files:**
- Modify: `src/components/finances/student-payments-grid.tsx:1019-1045`, `124-134`

- [ ] **Step 1: Change grid props assembly**

Replace lines 1037–1045:

```ts
const gridProps = useMemo(() => {
  const base = {
    freezeColumns: isReport ? 2 : 1,
    onCellEdited,
    onCellClicked: handleCellClicked,
  };
  // Report Glide uses click preview only — never wire onItemHovered to preview.
  if (!isReport && onRowHover) {
    return { ...base, onItemHovered: handleItemHovered };
  }
  return base;
}, [isReport, onCellEdited, handleCellClicked, onRowHover, handleItemHovered]);
```

- [ ] **Step 2: Ensure handleCellClicked invokes onRowSelect**

In `handleCellClicked` (existing ~line 960), after resolving `record`:

```ts
if (onRowSelect && record) {
  onRowSelect(record);
}
```

- [ ] **Step 3: Run unit tests**

Run: `npm run test:unit -- src/lib/finances/glide-report-preview.test.ts src/lib/finances/apply-screenshot-preview-hover.test.ts`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/finances/student-payments-grid.tsx
git commit -m "$(cat <<'EOF'
fix(finances): stop Glide report hover from driving screenshot preview

EOF
)"
```

---

### Task 3: Measured height + row height bound for scroll

**Files:**
- Modify: `src/components/finances/student-payments-grid.tsx:1047-1077`, `1320-1360` (grid container ref)

- [ ] **Step 1: Attach `gridContainerRef` to the bounded flex child**

Replace the opening grid-container element at baseline lines 1335–1337:

```tsx
<div
  ref={gridContainerRef}
  className="min-h-0 min-w-0 flex-1 overflow-hidden p-2"
>
  {gridWithOverlays}
</div>
```

The existing `DataSheet` remains inside `gridWithOverlays`; do not move the ref onto `DataSheet`.

- [ ] **Step 2: Add explicit rowHeight from DESIGN.md table minimum**

```ts
const GLIDE_PAYMENT_ROW_HEIGHT = 34;
```

Insert this exact prop immediately after `height={gridHeight + repaintNudge}` in the existing `DataSheet` invocation:

```tsx
rowHeight={GLIDE_PAYMENT_ROW_HEIGHT}
```

- [ ] **Step 3: Remove window.innerHeight dependency if any remains**

Search file for `window.innerHeight` — replace with `measuredHeight` only (grep confirms already migrated; re-verify at execution).

- [ ] **Step 4: Manual scroll test**

1. `/finances/student-payments` Glide ON, 15+ rows fixture.
2. Wheel over grid — rows scroll; preview pane sticky.
3. Fewer than 20 rows but tall cells — still scrolls when content exceeds editor.
4. Screenshot: `docs/superpowers/evidence/r13-glide-scroll.png`

- [ ] **Step 5: Commit**

```bash
git add src/components/finances/student-payments-grid.tsx
git commit -m "$(cat <<'EOF'
fix(finances): bound Glide payment grid height for internal scroll

EOF
)"
```

---

### Task 4: Shell-owned split pane for Glide report (no sidePanel thrash)

**Files:**
- Modify: `src/components/finances/student-payments-report-shell.tsx:204-221`
- Modify: `src/components/finances/student-payments-grid.tsx:1344-1419` (remove duplicate outer chrome when `variant="report"`)

- [ ] **Step 1: Glide branch uses layout module**

```tsx
if (useGlideView) {
  return (
    <>
      <div className={studentPaymentsReportShellClassName()}>
        <StudentPaymentsReportHeader
          title="Student payments"
          summaryLine={buildPaymentSummaryLine(
            report.rows,
            report.apiSummary,
            currencySymbol,
            fixedCourseId,
          )}
          actions={headerActions}
        />
        <StudentPaymentsSplitPane
          showSide={Boolean(previewColumn)}
          main={
            <StudentPaymentsGrid
              variant="report"
              fixedCourseId={fixedCourseId}
              courseMeta={courseMeta}
              globalTransactionLookup={globalTransactionLookup}
              onOpenStudent={openStudent}
              onRowSelect={handleRowSelect}
              embedded
            />
          }
          side={previewColumn ?? undefined}
        />
      </div>
      {studentDrawer}
      {screenshotDialog}
      {coverageDialog}
    </>
  );
}
```

- [ ] **Step 2: Add `embedded?: boolean` prop to grid**

When `embedded` true, grid skips outer `min-h-[75dvh]` shell wrapper (lines 1355+) and renders only inner filters + DataSheet.

```ts
export type StudentPaymentsGridProps = StudentPaymentsReportProps & {
  variant?: "report" | "recent-transactions";
  embedded?: boolean;
  sidePanel?: ReactNode;
  onOpenStudent?: (userId: number) => void;
  onRowsChange?: (rows: StudentPaymentAdminReportRow[]) => void;
  headerActions?: ReactNode;
  onRowSelect?: (row: StudentPaymentAdminReportRow) => void;
  onRowHover?: (row: StudentPaymentAdminReportRow | null) => void;
};
```

- [ ] **Step 3: Render complete embedded grid chrome**

Add `embedded = false` to the `StudentPaymentsGridContent` parameter destructuring immediately after `variant = "report"`.

Immediately before the existing `const shell = (` declaration, insert:

```tsx
const embeddedShell = (
  <>
    <div className="shrink-0 border-b border-border bg-muted/20">
      <div className="px-4 py-3">{filterControls}</div>
    </div>
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {gridBody}
    </div>
  </>
);
```

Immediately before the existing final `return (` at baseline line 1376, insert this complete early return:

```tsx
if (embedded && !effectiveFullscreen) {
  return (
    <>
      {embeddedShell}
      <PaymentCoverageEditDialog
        open={coverageEdit !== null}
        onOpenChange={(open) => {
          if (!open) setCoverageEdit(null);
        }}
        paymentIds={coverageEdit?.paymentIds ?? []}
        courseStartDate={coverageEdit?.courseStartDate}
        courseEndDate={coverageEdit?.courseEndDate}
        onSaved={() => {
          void queryClient.invalidateQueries({
            queryKey: ["searchuser-payments", tableUid],
          });
        }}
      />
      <FullScreenImageViewer
        imageUrl={viewImageUrl}
        title="Screenshot"
        onClose={() => setViewImageUrl(null)}
      />
    </>
  );
}
```

- [ ] **Step 4: Do not pass `sidePanel` for report path**

Remove `sidePanel={previewColumn}` from shell Glide branch.

- [ ] **Step 5: Verify click-specific empty copy**

Keep the shared shell expression exactly as follows; it selects click copy for Glide and hover copy for ResourceTable:

```ts
const previewEmptyCopy = screenshotPreviewEmptyCopy(
  useGlideView ? "click" : "hover",
);
```

- [ ] **Step 6: Manual — click row, move mouse out, preview stays.**

Screenshot: `docs/superpowers/evidence/r13-glide-click-preview-sticky.png`

- [ ] **Step 7: Commit**

```bash
git add src/components/finances/student-payments-report-shell.tsx src/components/finances/student-payments-grid.tsx
git commit -m "$(cat <<'EOF'
fix(finances): shell-owned Glide preview split pane and embedded grid mode

EOF
)"
```

---

### Task 5: Glide column width floors (txn 280px, description 320px)

**Files:**
- Modify: `src/lib/finances/student-payments-filter-ui.ts:1-2`
- Modify: `src/components/finances/student-payments-grid.tsx` column builder (~lines 700–850)

- [ ] **Step 1: Test constants**

```ts
it("exposes Glide txn and description width floors", () => {
  expect(STUDENT_PAYMENT_GLIDE_TXN_ID_WIDTH).toBeGreaterThanOrEqual(280);
  expect(STUDENT_PAYMENT_GLIDE_DESCRIPTION_WIDTH).toBeGreaterThanOrEqual(320);
});
```

- [ ] **Step 2: Apply in buildGridColumns**

```ts
{ id: "transaction_id", title: "Transaction ID", width: STUDENT_PAYMENT_GLIDE_TXN_ID_WIDTH },
{ id: "description", title: "Description", width: STUDENT_PAYMENT_GLIDE_DESCRIPTION_WIDTH },
```

- [ ] **Step 3: Manual — txn/description not truncated below floors; horizontal scroll in Glide.**

- [ ] **Step 4: Commit**

```bash
git add src/lib/finances/student-payments-filter-ui.ts src/lib/finances/student-payments-filter-ui.test.ts src/components/finances/student-payments-grid.tsx
git commit -m "$(cat <<'EOF'
fix(finances): restore Glide student payment txn and description column widths

EOF
)"
```

---

### Task 6: Recent-transactions Glide variant scroll + preview

**Files:**
- Modify: `src/components/finances/student-payments-grid.tsx` (`variant === "recent-transactions"` branches)

- [ ] **Step 1: Recent-transactions does not use screenshot preview pane**

Confirm `onRowSelect` not passed from `recent-transactions/page.tsx` — no preview store writes.

- [ ] **Step 2: Height measurement includes recent-transactions fullscreen toggle**

`useContainerHeight` deps must include `effectiveFullscreen` for recent-transactions path.

- [ ] **Step 3: Manual** `/finances/recent-transactions` Glide ON — scroll works; no preview pane.

Screenshot: `docs/superpowers/evidence/r13-recent-transactions-glide.png`

- [ ] **Step 4: Commit**

```bash
git add src/components/finances/student-payments-grid.tsx
git commit -m "$(cat <<'EOF'
fix(finances): recent transactions Glide variant scroll and height

EOF
)"
```

---

## Final verification

```bash
npm run lint && npm run typecheck && npm run test:unit && npm run build
npm run test:browser -- --grep "R13 Glide"
```

**Worker-only (local implementation aid — not QA signoff):** the `--grep "R13 Glide"` subset above narrows browser coverage during development; independent QA must run the full `npm run test:browser` gate.

No `test.skip`, `describe.skip`, `it.skip`, CLI skip flag, test exclusion, or omitted browser project is acceptable.

---

## Independent QA prompt (paste-ready)

```
Independent QA — R13 Student-Payments Glide Path

Repo: schedjuice-reimagined-fe
Plan: docs/superpowers/plans/2026-07-12-ui-remediation-r13-student-payments-glide.md
Do NOT patch code.

Precondition: R12 Task 0 merged; Glide view toggle ON.

Routes (Glide view):
1. /finances/student-payments?date=2026-07-01T00:00:00.000Z
2. /courses/<id>/student-payments
3. /finances/student-payments/transaction-lookup?transactionId=<txn>
4. /finances/recent-transactions (Glide toggle)

Acceptance:
- Wheel scroll moves rows when content exceeds editor (not dead scroll).
- Click row updates screenshot preview; mouse leave does NOT clear preview.
- Hovering without click does NOT change preview on report Glide.
- ResourceTable path (Glide OFF) still uses hover preview — regression is R12 failure.
- Txn column width ≥280px; description ≥320px in Glide.
- Status/method popovers open above grid (R2 layer) and remain clickable.
- Light+dark desktop screenshots required for routes 1–3.

Commands (full gate required — skipped/focused/grep subsets are not acceptable for QA signoff):
npm run lint && npm run typecheck && npm run test:unit && npm run build && npm run test:browser

Report: pass/fail, evidence paths, viewport/theme/role per failure.
```

---

## Spec coverage self-review

| Requirement | Task |
| --- | --- |
| Click-to-preview | 1, 2, 4 |
| Scroll/height | 3 |
| Shell sidePanel isolation | 4 |
| Column widths | 5 |
| recent-transactions Glide | 6 |
| R12 serialization | Task 0 blocker |
