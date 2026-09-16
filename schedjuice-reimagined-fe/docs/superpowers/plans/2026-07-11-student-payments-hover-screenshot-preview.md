# Student payments hover screenshot preview — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a right-side screenshot preview that updates on row hover (clears on leave / no image) for both original ResourceTable and Glide student-payments views, while keeping per-row View image → dialog.

**Architecture:** Shell owns `previewUrl` + `ScreenshotPreviewPane`. Original view: shell split layout wraps ResourceTable + pane. Glide: shell passes the same pane as `sidePanel` and an `onRowHover` callback; grid wires Glide `onItemHovered` via `gridProps`. Reuse `getPaymentScreenshotUrl` from `payment-row-utils`. Optional `onRowHover` on shared `Table` / `ResourceTable` for original-view hover.

**Tech Stack:** Next.js App Router, React, Next/Image, Vitest (`npm run test:unit`), Glide Data Grid (`onItemHovered`), existing shell / ResourceTable / DataSheet.

**Spec:** `docs/superpowers/specs/2026-07-11-student-payments-hover-screenshot-preview-design.md`

All commands run from `schedjuice-reimagined-fe/`.

---

## File Structure

| File | Action | Responsibility |
| --- | --- | --- |
| `src/lib/finances/screenshot-preview-status.ts` | Create | Pure empty / image / error status helper |
| `src/lib/finances/screenshot-preview-status.test.ts` | Create | Unit tests for status helper |
| `src/lib/data-sheets/payment-row-utils.test.ts` | Modify | Cover `getPaymentScreenshotUrl` (row + parts) |
| `src/components/finances/screenshot-preview-pane.tsx` | Create | Presentational right-pane UI |
| `src/components/data-table/table.tsx` | Modify | Optional `onRowHover(row \| null)` |
| `src/components/data-table/resource-table.tsx` | Modify | Pass through `onRowHover` |
| `src/components/finances/student-payments-resource-table.tsx` | Modify | Accept `onRowHover`; label “View image” |
| `src/components/finances/student-payments-report-shell.tsx` | Modify | preview state, pane, original split, Glide wiring |
| `src/components/finances/student-payments-grid.tsx` | Modify | `onRowHover` + `onItemHovered`; widen side panel to 20rem; use shared `getPaymentScreenshotUrl` |

---

### Task 1: Preview status helper + screenshot URL tests (TDD)

**Files:**
- Create: `src/lib/finances/screenshot-preview-status.ts`
- Test: `src/lib/finances/screenshot-preview-status.test.ts`
- Modify: `src/lib/data-sheets/payment-row-utils.test.ts`

- [ ] **Step 1: Write failing tests for status helper**

```ts
// src/lib/finances/screenshot-preview-status.test.ts
import { describe, expect, it } from "vitest";
import { screenshotPreviewStatus } from "./screenshot-preview-status";

describe("screenshotPreviewStatus", () => {
  it("is empty when url is null", () => {
    expect(screenshotPreviewStatus(null, false)).toEqual({ kind: "empty" });
  });

  it("is image when url is set and load has not failed", () => {
    expect(screenshotPreviewStatus("https://cdn.example/a.png", false)).toEqual({
      kind: "image",
      url: "https://cdn.example/a.png",
    });
  });

  it("is error when url is set but load failed", () => {
    expect(screenshotPreviewStatus("https://cdn.example/a.png", true)).toEqual({
      kind: "error",
      url: "https://cdn.example/a.png",
    });
  });
});
```

- [ ] **Step 2: Add getPaymentScreenshotUrl cases to payment-row-utils.test.ts**

Append (import `getPaymentScreenshotUrl` from `./payment-row-utils`):

```ts
describe("getPaymentScreenshotUrl", () => {
  it("returns row.screenshot when present", () => {
    expect(
      getPaymentScreenshotUrl({
        id: 1,
        screenshot: "https://cdn.example/row.png",
      } as never),
    ).toBe("https://cdn.example/row.png");
  });

  it("falls back to first part screenshot", () => {
    expect(
      getPaymentScreenshotUrl({
        id: 2,
        screenshot: null,
        parts: [
          { screenshot: null },
          { screenshot: "https://cdn.example/part.png" },
        ],
      } as never),
    ).toBe("https://cdn.example/part.png");
  });

  it("returns null when neither row nor parts have a screenshot", () => {
    expect(
      getPaymentScreenshotUrl({
        id: 3,
        screenshot: null,
        parts: [{ screenshot: null }],
      } as never),
    ).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests to verify status helper fails**

Run: `npm run test:unit -- src/lib/finances/screenshot-preview-status.test.ts`

Expected: FAIL (module not found)

- [ ] **Step 4: Implement status helper**

```ts
// src/lib/finances/screenshot-preview-status.ts
export type ScreenshotPreviewStatus =
  | { kind: "empty" }
  | { kind: "image"; url: string }
  | { kind: "error"; url: string };

export function screenshotPreviewStatus(
  url: string | null,
  loadFailed: boolean,
): ScreenshotPreviewStatus {
  if (!url) return { kind: "empty" };
  if (loadFailed) return { kind: "error", url };
  return { kind: "image", url };
}
```

- [ ] **Step 5: Run all Task 1 tests**

Run: `npm run test:unit -- src/lib/finances/screenshot-preview-status.test.ts src/lib/data-sheets/payment-row-utils.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/finances/screenshot-preview-status.ts src/lib/finances/screenshot-preview-status.test.ts src/lib/data-sheets/payment-row-utils.test.ts
git commit -m "$(cat <<'EOF'
feat(finances): add screenshot preview status helper and URL tests

EOF
)"
```

---

### Task 2: ScreenshotPreviewPane component

**Files:**
- Create: `src/components/finances/screenshot-preview-pane.tsx`

- [ ] **Step 1: Implement the pane**

```tsx
"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import { screenshotPreviewStatus } from "@/lib/finances/screenshot-preview-status";
import { cn } from "@/lib/utils";

export function ScreenshotPreviewPane({
  url,
  className,
}: {
  url: string | null;
  className?: string;
}) {
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    setLoadFailed(false);
  }, [url]);

  const status = screenshotPreviewStatus(url, loadFailed);

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 w-full flex-col gap-2 p-3",
        className,
      )}
      aria-label="Payment screenshot preview"
    >
      <p className="text-xs font-medium text-muted-foreground">Screenshot</p>
      {status.kind === "empty" ? (
        <p className="text-sm text-muted-foreground">Hover a row to preview</p>
      ) : null}
      {status.kind === "error" ? (
        <p className="text-sm text-muted-foreground" role="status">
          Couldn’t load image
        </p>
      ) : null}
      {status.kind === "image" ? (
        <div className="relative min-h-0 flex-1 overflow-auto">
          <Image
            src={status.url}
            alt="Payment screenshot preview"
            width={640}
            height={800}
            className="h-auto w-full rounded-md object-contain"
            unoptimized
            onError={() => setLoadFailed(true)}
          />
        </div>
      ) : null}
    </aside>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/finances/screenshot-preview-pane.tsx
git commit -m "$(cat <<'EOF'
feat(finances): add ScreenshotPreviewPane for student payments

EOF
)"
```

---

### Task 3: Table / ResourceTable row hover plumbing

**Files:**
- Modify: `src/components/data-table/table.tsx`
- Modify: `src/components/data-table/resource-table.tsx`

- [ ] **Step 1: Extend TableProps and row handlers**

In `table.tsx`, add to `TableProps<T>`:

```ts
  /** Fires with the row on enter; `null` when the pointer leaves the table body. */
  onRowHover?: (row: T | null) => void;
```

Destructure `onRowHover` in `Table`. On each data `<tr>`:

```tsx
onMouseEnter={() => {
  if (!onRowHover) return;
  const source = rows.find((r) => getRowId(r) === row.id);
  onRowHover(source ?? null);
}}
```

On the outer wrapper `<div>` (the one with `overflow-hidden rounded-md…`):

```tsx
onMouseLeave={() => {
  onRowHover?.(null);
}}
```

- [ ] **Step 2: Pass through ResourceTable**

In `resource-table.tsx` `ResourceTableProps<T>` add `onRowHover?: (row: T | null) => void` and pass it to `<Table … onRowHover={onRowHover} />`.

- [ ] **Step 3: Commit**

```bash
git add src/components/data-table/table.tsx src/components/data-table/resource-table.tsx
git commit -m "$(cat <<'EOF'
feat(data-table): support optional onRowHover for ResourceTable

EOF
)"
```

---

### Task 4: Wire original view (ResourceTable + shell split)

**Files:**
- Modify: `src/components/finances/student-payments-resource-table.tsx`
- Modify: `src/components/finances/student-payments-report-shell.tsx`

- [ ] **Step 1: ResourceTable body props**

Add `onRowHover?: (row: StudentPaymentAdminReportRow | null) => void` to props; pass to `<ResourceTable onRowHover={onRowHover} … />`. Rename Actions button label from `View` to `View image`.

- [ ] **Step 2: Shell preview state + permission gate**

Import `ScreenshotPreviewPane`, `canViewPaymentScreenshots`, `getPaymentScreenshotUrl`.

```ts
const [previewUrl, setPreviewUrl] = useState<string | null>(null);
const canViewScreenshots = Boolean(user && canViewPaymentScreenshots(user));

const handleRowHover = useCallback(
  (row: StudentPaymentAdminReportRow | null) => {
    if (!canViewScreenshots) {
      setPreviewUrl(null);
      return;
    }
    setPreviewUrl(row ? getPaymentScreenshotUrl(row) : null);
  },
  [canViewScreenshots],
);

const previewPane = canViewScreenshots ? (
  <ScreenshotPreviewPane url={previewUrl} />
) : null;
```

Define these **above** the `useGlideView` early return.

- [ ] **Step 3: Original-view split layout**

Replace the single table wrapper with:

```tsx
<div
  className={cn(
    "grid min-h-0 flex-1 overflow-hidden",
    previewPane
      ? "grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem]"
      : "grid-cols-1",
  )}
>
  <div className="min-h-0 min-w-0 overflow-auto p-3">
    <StudentPaymentsResourceTable
      …
      onRowHover={handleRowHover}
      onViewScreenshot={(url) => setViewImageUrl(url)}
    />
  </div>
  {previewPane ? (
    <div className="min-h-0 overflow-hidden border-t border-border bg-muted/10 lg:border-l lg:border-t-0">
      {previewPane}
    </div>
  ) : null}
</div>
```

- [ ] **Step 4: Commit**

```bash
git add src/components/finances/student-payments-resource-table.tsx src/components/finances/student-payments-report-shell.tsx
git commit -m "$(cat <<'EOF'
feat(finances): hover screenshot preview on original student payments

EOF
)"
```

---

### Task 5: Wire Glide view (sidePanel + onItemHovered)

**Files:**
- Modify: `src/components/finances/student-payments-grid.tsx`
- Modify: `src/components/finances/student-payments-report-shell.tsx` (Glide branch)

- [ ] **Step 1: Grid props**

Add `onRowHover?: (row: StudentPaymentAdminReportRow | null) => void` to grid content props; destructure it.

- [ ] **Step 2: Use shared getPaymentScreenshotUrl**

Remove the local `function getPaymentScreenshotUrl` in `student-payments-grid.tsx`. Import from `@/lib/data-sheets/payment-row-utils`.

- [ ] **Step 3: onItemHovered via gridProps**

Extend existing `gridProps` with `onItemHovered`. When `args.kind === "out"` or invalid location, call `onRowHover(null)`. Otherwise map display row → source row using the same `displayToSource` / sorted-index helper this grid already uses for clicks (inspect `student-payments-grid.tsx` at implement time). Also add container `onMouseLeave` → `onRowHover(null)` as a safety net.

- [ ] **Step 4: Widen side panel column**

Change `lg:grid-cols-[minmax(0,1fr)_16rem]` to `lg:grid-cols-[minmax(0,1fr)_20rem]`.

- [ ] **Step 5: Shell Glide branch**

```tsx
<StudentPaymentsGrid
  variant="report"
  fixedCourseId={fixedCourseId}
  courseMeta={courseMeta}
  globalTransactionLookup={globalTransactionLookup}
  headerActions={headerActions}
  onOpenStudent={openStudent}
  sidePanel={previewPane ?? undefined}
  onRowHover={handleRowHover}
/>
```

Rename Glide action label from `View` to `View image` and update the matching `case` / action-id mapping.

- [ ] **Step 6: Re-run unit tests**

Run: `npm run test:unit -- src/lib/finances/screenshot-preview-status.test.ts src/lib/data-sheets/payment-row-utils.test.ts`

Expected: PASS

- [ ] **Step 7: Manual smoke**

- Original + Glide: hover updates; leave clears; no-screenshot → empty; View image opens dialog; no-permission user sees neither pane nor View image.

- [ ] **Step 8: Commit**

```bash
git add src/components/finances/student-payments-grid.tsx src/components/finances/student-payments-report-shell.tsx
git commit -m "$(cat <<'EOF'
feat(finances): hover screenshot preview on Glide student payments

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| Right-side ~20rem preview pane | Tasks 2, 4, 5 |
| Hover updates image | Tasks 3–5 |
| Clear on leave / no screenshot | Tasks 3–5 |
| Empty copy “Hover a row to preview” | Task 2 |
| Load error copy | Tasks 1–2 |
| Keep View → dialog | Tasks 4–5 |
| Label “View image” | Tasks 4–5 |
| Both original + Glide | Tasks 4–5 |
| `canViewPaymentScreenshots` gate | Task 4 |
| Reuse `getPaymentScreenshotUrl` | Tasks 1, 5 |
| Shell-owned state; Glide via `sidePanel` | Tasks 4–5 |

## Self-review notes

- No TBD placeholders; Glide display→source mapping called out to inspect at implement time.
- `onRowHover` / `ScreenshotPreviewPane` / `screenshotPreviewStatus` names are consistent.
- Dialog remains shell `viewImageUrl`.
