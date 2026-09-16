# Inline edit optimistic save + feedback — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop inline-edit flash (value disappearing then reappearing), show saving → saved tick feedback, and roll back with a toast on failure — via cache-first optimism in edit-kit for text cells and payment status selects.

**Architecture:** Extend `useCellAutosave` with optional cache optimistic/rollback/error callbacks; add `CellSaveFeedback` (saving spinner → `FormSaveTick`); add pure helpers to patch `{ rows: [...] }` React Query caches for user payments; migrate student-payments text + status, `ResourceTable` editable text, and recent-transactions transaction id cells.

**Tech Stack:** React, TanStack Query v4, Vitest (`npm run test:unit`), existing `FormSaveTick` / `Spinner` / `useToast`

**Spec:** `docs/superpowers/specs/2026-07-11-inline-edit-optimistic-save-feedback-design.md`

All commands run from `schedjuice-reimagined-fe/`.

---

## File Structure

| File | Action | Responsibility |
| --- | --- | --- |
| `src/lib/finances/patch-payment-row-cache.ts` | Create | Pure helpers to patch/restore payment rows inside `{ rows: [...] }` cache payloads |
| `src/lib/finances/patch-payment-row-cache.test.ts` | Create | Unit tests for pure patch helpers |
| `src/components/edit-kit/use-cell-autosave.ts` | Modify | `onOptimisticUpdate` / `onRollback` / `onError`; call them in commit; on failure → idle (no Retry UI) |
| `src/components/edit-kit/__tests__/use-cell-autosave.test.ts` | Modify | Callback order + error → idle coverage |
| `src/components/edit-kit/cell-save-feedback.tsx` | Create | Reserved slot: saving → tick → empty |
| `src/components/edit-kit/index.ts` | Modify | Export `CellSaveFeedback` + new option types |
| `src/components/finances/student-payments-resource-table.tsx` | Modify | Cache patch + `CellSaveFeedback` + error toast on text cells |
| `src/components/datatable/user-payment-status-inline-form.tsx` | Modify | Same kit; optimistic status; feedback; error toast; drop success toast |
| `src/components/data-table/resource-table.tsx` | Modify | `EditableTextCell` uses `CellSaveFeedback` (callers own cache/toast in `onSave`) |
| `src/app/(internal)/finances/recent-transactions/page.tsx` | Modify | `TransactionIdCell`: cache patch + feedback + error toast |

---

### Task 1: Pure payment-row cache patch helpers (TDD)

**Files:**
- Create: `src/lib/finances/patch-payment-row-cache.ts`
- Test: `src/lib/finances/patch-payment-row-cache.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import {
  applyPaymentRowPatchToCacheData,
  type QueryCacheSnapshot,
} from "./patch-payment-row-cache";

describe("applyPaymentRowPatchToCacheData", () => {
  it("returns null when data has no rows array", () => {
    expect(
      applyPaymentRowPatchToCacheData({ total: 0 }, 1, { description: "x" }),
    ).toBeNull();
    expect(applyPaymentRowPatchToCacheData(null, 1, { description: "x" })).toBeNull();
  });

  it("returns null when no row matches id", () => {
    const data = { rows: [{ id: 2, description: "a" }], summary: { n: 1 } };
    expect(
      applyPaymentRowPatchToCacheData(data, 1, { description: "b" }),
    ).toBeNull();
  });

  it("patches the matching row and preserves sibling fields / summary", () => {
    const data = {
      rows: [
        { id: 1, description: "old", status: "pending_payment" },
        { id: 2, description: "other" },
      ],
      summary: { total: 2 },
    };
    const next = applyPaymentRowPatchToCacheData(data, 1, {
      description: "new",
    });
    expect(next).toEqual({
      rows: [
        { id: 1, description: "new", status: "pending_payment" },
        { id: 2, description: "other" },
      ],
      summary: { total: 2 },
    });
    // Original untouched
    expect(data.rows[0]!.description).toBe("old");
  });

  it("matches string/number ids loosely", () => {
    const data = { rows: [{ id: 10, transaction_id: "a" }], total: 1 };
    const next = applyPaymentRowPatchToCacheData(data, "10", {
      transaction_id: "b",
    });
    expect(next?.rows[0]).toMatchObject({ id: 10, transaction_id: "b" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/finances/patch-payment-row-cache.test.ts`

Expected: FAIL (module / export not found)

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/finances/patch-payment-row-cache.ts
import type { QueryClient, QueryKey } from "@tanstack/react-query";

export type QueryCacheSnapshot = {
  queryKey: QueryKey;
  data: unknown;
};

type RowsCache = {
  rows: Array<Record<string, unknown> & { id?: number | string }>;
};

function isRowsCache(data: unknown): data is RowsCache {
  return (
    !!data &&
    typeof data === "object" &&
    Array.isArray((data as RowsCache).rows)
  );
}

/** Pure: return patched cache payload, or null if nothing to change. */
export function applyPaymentRowPatchToCacheData(
  data: unknown,
  paymentId: number | string,
  patch: Record<string, unknown>,
): RowsCache | null {
  if (!isRowsCache(data)) return null;
  const idNorm = String(paymentId);
  let hit = false;
  const rows = data.rows.map((row) => {
    if (row?.id == null || String(row.id) !== idNorm) return row;
    hit = true;
    return { ...row, ...patch };
  });
  if (!hit) return null;
  return { ...data, rows };
}

/**
 * Patch every cached query whose data is `{ rows: [...] }` and contains the payment.
 * Returns snapshots for exact rollback via `restoreQueryCacheSnapshots`.
 */
export function patchPaymentRowInQueryCaches(
  queryClient: QueryClient,
  paymentId: number | string,
  patch: Record<string, unknown>,
): QueryCacheSnapshot[] {
  const snapshots: QueryCacheSnapshot[] = [];
  for (const query of queryClient.getQueryCache().getAll()) {
    const prev = query.state.data;
    const next = applyPaymentRowPatchToCacheData(prev, paymentId, patch);
    if (!next) continue;
    snapshots.push({ queryKey: query.queryKey, data: prev });
    queryClient.setQueryData(query.queryKey, next);
  }
  return snapshots;
}

export function restoreQueryCacheSnapshots(
  queryClient: QueryClient,
  snapshots: QueryCacheSnapshot[],
): void {
  for (const { queryKey, data } of snapshots) {
    queryClient.setQueryData(queryKey, data);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/lib/finances/patch-payment-row-cache.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/finances/patch-payment-row-cache.ts src/lib/finances/patch-payment-row-cache.test.ts
git commit -m "$(cat <<'EOF'
feat(finances): add payment row query-cache patch helpers

EOF
)"
```

---

### Task 2: Extend `useCellAutosave` commit callbacks (TDD)

**Files:**
- Modify: `src/components/edit-kit/use-cell-autosave.ts`
- Modify: `src/components/edit-kit/__tests__/use-cell-autosave.test.ts`

- [ ] **Step 1: Write the failing tests** (append to existing describe for `executeCellAutosaveCommit`)

```ts
  it("calls onOptimisticUpdate before onSave, then skips onRollback on success", async () => {
    const h = createHarness("old");
    const onSave = vi.fn(async () => undefined);
    const onOptimisticUpdate = vi.fn();
    const onRollback = vi.fn();
    const onError = vi.fn();

    await executeCellAutosaveCommit({
      previousValue: "old",
      nextValue: "new",
      onSave,
      onOptimisticUpdate,
      onRollback,
      onError,
      setDisplayValue: h.setDisplayValue,
      setStatus: h.setStatus,
      setError: h.setError,
      setShowSavedTick: h.setShowSavedTick,
      clearTickTimer: h.clearTickTimer,
      scheduleTickClear: h.scheduleTickClear,
      tickMs: DEFAULT_CELL_AUTOSAVE_TICK_MS,
    });

    expect(onOptimisticUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      onSave.mock.invocationCallOrder[0]!,
    );
    expect(onOptimisticUpdate).toHaveBeenCalledWith("new");
    expect(onRollback).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(h.status).toBe("saved");
  });

  it("on failure rolls back, calls onRollback + onError, and returns to idle", async () => {
    const h = createHarness("old");
    const failure = new Error("save failed");
    const onSave = vi.fn(async () => {
      throw failure;
    });
    const onOptimisticUpdate = vi.fn();
    const onRollback = vi.fn();
    const onError = vi.fn();

    await executeCellAutosaveCommit({
      previousValue: "old",
      nextValue: "new",
      onSave,
      onOptimisticUpdate,
      onRollback,
      onError,
      setDisplayValue: h.setDisplayValue,
      setStatus: h.setStatus,
      setError: h.setError,
      setShowSavedTick: h.setShowSavedTick,
      clearTickTimer: h.clearTickTimer,
      scheduleTickClear: h.scheduleTickClear,
      tickMs: DEFAULT_CELL_AUTOSAVE_TICK_MS,
    });

    expect(h.displayValue).toBe("old");
    expect(h.status).toBe("idle");
    expect(h.error).toBeNull();
    expect(h.showSavedTick).toBe(false);
    expect(onOptimisticUpdate).toHaveBeenCalledWith("new");
    expect(onRollback).toHaveBeenCalledWith("old");
    expect(onError).toHaveBeenCalledWith(failure);
  });
```

Also update the existing failure test that expects `status === "error"` — change it to expect `idle` and `error === null` (spec: toast-only, no Retry).

- [ ] **Step 2: Run tests to verify new ones fail**

Run: `npm run test:unit -- src/components/edit-kit/__tests__/use-cell-autosave.test.ts`

Expected: FAIL on missing callback args / wrong error status

- [ ] **Step 3: Implement callback wiring in `executeCellAutosaveCommit` + hook options**

Update types and commit body in `use-cell-autosave.ts`:

```ts
export type CellAutosaveCommitArgs<T> = {
  previousValue: T;
  nextValue: T;
  onSave: (next: T) => Promise<void>;
  onOptimisticUpdate?: (next: T) => void;
  onRollback?: (previous: T) => void;
  onError?: (error: Error) => void;
  setDisplayValue: (next: T) => void;
  setStatus: (status: CellAutosaveStatus) => void;
  setError: (error: Error | null) => void;
  setShowSavedTick: (visible: boolean) => void;
  clearTickTimer: () => void;
  scheduleTickClear: (cb: () => void, ms: number) => void;
  tickMs: number;
};

export type UseCellAutosaveOptions<T> = {
  value: T;
  onSave: (next: T) => Promise<void>;
  tickMs?: number;
  onOptimisticUpdate?: (next: T) => void;
  onRollback?: (previous: T) => void;
  onError?: (error: Error) => void;
};
```

Inside `executeCellAutosaveCommit`, after `setStatus("saving")` / clear tick:

```ts
  args.onOptimisticUpdate?.(nextValue);

  try {
    await onSave(nextValue);
    setStatus("saved");
    setShowSavedTick(true);
    scheduleTickClear(() => {
      setShowSavedTick(false);
      setStatus("idle");
    }, tickMs);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    setDisplayValue(previousValue);
    args.onRollback?.(previousValue);
    args.onError?.(error);
    setStatus("idle");
    setError(null);
    setShowSavedTick(false);
  }
```

In `useCellAutosave`, keep refs for the three optional callbacks (same pattern as `onSaveRef`) and pass them into `executeCellAutosaveCommit`.

Note: `retry` can remain exported but unused by migrated UIs; it still works if `pendingRetryRef` is set — on failure clear `pendingRetryRef` since we return to idle without Retry UI:

```ts
      } catch {
        // executeCellAutosaveCommit already rolled back
      } finally {
        inflightRef.current = false;
      }
```

After failed commit inside `runCommit`, set `pendingRetryRef.current = null` when status ends idle after error (in the catch path of execute, or after await when display rolled back).

Simplest: in `executeCellAutosaveCommit` failure path only — callers of `runCommit` should null `pendingRetryRef` when `displayRef` was rolled back. After `await executeCellAutosaveCommit(...)`:

```ts
        if (Object.is(displayRef.current, nextValue)) {
          baselineRef.current = nextValue;
          pendingRetryRef.current = null;
        } else {
          pendingRetryRef.current = null;
        }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- src/components/edit-kit/__tests__/use-cell-autosave.test.ts`

Expected: PASS (all cases)

- [ ] **Step 5: Commit**

```bash
git add src/components/edit-kit/use-cell-autosave.ts src/components/edit-kit/__tests__/use-cell-autosave.test.ts
git commit -m "$(cat <<'EOF'
feat(edit-kit): optimistic cache callbacks and idle-on-error for cell autosave

EOF
)"
```

---

### Task 3: Add `CellSaveFeedback`

**Files:**
- Create: `src/components/edit-kit/cell-save-feedback.tsx`
- Modify: `src/components/edit-kit/index.ts`

- [ ] **Step 1: Implement component**

```tsx
"use client";

import { Spinner } from "@/components/primitives/spinner";
import { FormSaveTick } from "@/components/edit-kit/form-save-tick";
import type { CellAutosaveStatus } from "@/components/edit-kit/use-cell-autosave";
import { cn } from "@/lib/utils";

export function CellSaveFeedback({
  status,
  showSavedTick,
  className,
}: {
  status: CellAutosaveStatus;
  showSavedTick: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-[1.25rem] min-w-[4.5rem] shrink-0 items-center",
        className,
      )}
      aria-live="polite"
    >
      {status === "saving" ? (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Spinner className="size-3.5" />
          <span>Saving…</span>
        </span>
      ) : (
        <FormSaveTick visible={showSavedTick} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Export from `index.ts`**

```ts
export { CellSaveFeedback } from "./cell-save-feedback";
```

- [ ] **Step 3: Commit**

```bash
git add src/components/edit-kit/cell-save-feedback.tsx src/components/edit-kit/index.ts
git commit -m "$(cat <<'EOF'
feat(edit-kit): add CellSaveFeedback saving-to-tick slot

EOF
)"
```

---

### Task 4: Student payments text cells

**Files:**
- Modify: `src/components/finances/student-payments-resource-table.tsx`

- [ ] **Step 1: Wire cache + feedback + toast in `PaymentEditableFieldCell`**

Replace the cell body roughly as:

```tsx
import { CellSaveFeedback, useCellAutosave } from "@/components/edit-kit";
import { useToast } from "@/components/primitives";
import {
  patchPaymentRowInQueryCaches,
  restoreQueryCacheSnapshots,
  type QueryCacheSnapshot,
} from "@/lib/finances/patch-payment-row-cache";
import { useRef } from "react";

function PaymentEditableFieldCell(...) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const cacheSnapRef = useRef<QueryCacheSnapshot[]>([]);
  const rawValue = paymentFieldDisplayValue(row, field);

  const { displayValue, setLocalValue, commit, showSavedTick, status: saveStatus } =
    useCellAutosave({
      value: rawValue,
      onOptimisticUpdate: (next) => {
        cacheSnapRef.current = patchPaymentRowInQueryCaches(
          queryClient,
          row.id,
          { [field]: next || null },
        );
      },
      onRollback: () => {
        restoreQueryCacheSnapshots(queryClient, cacheSnapRef.current);
        cacheSnapRef.current = [];
      },
      onError: () => {
        toast.add({
          type: "error",
          description: "Could not save change.",
        });
      },
      onSave: async (next) => {
        await updateEntity("user-payments", row.id, { [field]: next || null });
        void queryClient.invalidateQueries({
          queryKey: ["searchuser-payments", tableUid],
        });
      },
    });

  // ... group / non-editable early returns unchanged ...

  return (
    <div className="flex min-w-min items-center gap-2">
      <Input
        value={displayValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={() => {
          void commit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
        }}
        className={paymentEditableFieldInputClassName(field)}
      />
      <CellSaveFeedback status={saveStatus} showSavedTick={showSavedTick} />
    </div>
  );
}
```

Remove `FormSaveTick` import and the Retry button branch. Remove `aria-invalid` tied to error status (no longer used for Retry).

- [ ] **Step 2: Manual smoke (or skip if no local server)**

Edit a Description / Transaction ID on student payments: value must not blank; see Saving… then ✓ Saved. (Optional in CI.)

- [ ] **Step 3: Commit**

```bash
git add src/components/finances/student-payments-resource-table.tsx
git commit -m "$(cat <<'EOF'
fix(finances): optimistic inline payment field saves with save feedback

EOF
)"
```

---

### Task 5: Payment status inline form

**Files:**
- Modify: `src/components/datatable/user-payment-status-inline-form.tsx`

- [ ] **Step 1: Rewrite to `useCellAutosave` + `CellSaveFeedback`**

Full replacement shape:

```tsx
"use client";

import { useToast } from "@/components/primitives";
import { CellSaveFeedback, useCellAutosave } from "@/components/edit-kit";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef } from "react";

import { updateEntity } from "@/app/client-api/utils";
import {
  patchPaymentRowInQueryCaches,
  restoreQueryCacheSnapshots,
  type QueryCacheSnapshot,
} from "@/lib/finances/patch-payment-row-cache";
import {
  isSystemOnlyUserPaymentStatus,
  isUserPaymentStatusManuallyEditable,
  MANUAL_USER_PAYMENT_STATUSES,
  UserPaymentStatus,
} from "@/types/finance";
import Selector from "../form/selectors/selector";
import { snakeToTitle } from "@/helpers/formatters";
import { PAYMENT_STATUS_SELECT_MIN_WIDTH_CLASS } from "@/lib/ui/select-layout";
import { cn } from "@/lib/utils";

interface StatusInlineFormProps {
  status: UserPaymentStatus;
  userPaymentId: number | string;
  isDisabled?: boolean;
  userId: string;
}

const UserPaymentStatusInlineForm: React.FC<StatusInlineFormProps> = ({
  status,
  userPaymentId,
  isDisabled = false,
}) => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const cacheSnapRef = useRef<QueryCacheSnapshot[]>([]);

  const statusOptions = useMemo(() => {
    const manual = MANUAL_USER_PAYMENT_STATUSES.map((value) => ({
      label: snakeToTitle(value),
      value,
    }));
    if (isSystemOnlyUserPaymentStatus(status)) {
      return [{ label: snakeToTitle(status), value: status }, ...manual];
    }
    return manual;
  }, [status]);

  const {
    displayValue,
    setLocalValue,
    commit,
    status: saveStatus,
    showSavedTick,
  } = useCellAutosave({
    value: status,
    onOptimisticUpdate: (next) => {
      cacheSnapRef.current = patchPaymentRowInQueryCaches(
        queryClient,
        userPaymentId,
        { status: next },
      );
    },
    onRollback: () => {
      restoreQueryCacheSnapshots(queryClient, cacheSnapRef.current);
      cacheSnapRef.current = [];
    },
    onError: () => {
      toast.add({
        type: "error",
        description: "Could not update status.",
      });
    },
    onSave: async (next) => {
      await updateEntity("user-payments", userPaymentId, { status: next });
      void queryClient.invalidateQueries({ queryKey: ["searchuser-payments"] });
      void queryClient.invalidateQueries({ queryKey: ["user-payments"] });
    },
  });

  return (
    <div
      className={cn(
        PAYMENT_STATUS_SELECT_MIN_WIDTH_CLASS,
        "flex w-full max-w-full items-center gap-2",
      )}
    >
      <div className="min-w-0 flex-1">
        <Selector
          fullWidth
          containerClassName={cn("min-w-0", {
            "border border-success":
              displayValue === UserPaymentStatus.verified,
            "border border-warning":
              displayValue === UserPaymentStatus.pending_verification,
          })}
          isDisabled={
            isDisabled || !isUserPaymentStatusManuallyEditable(status)
          }
          isLoading={saveStatus === "saving"}
          options={statusOptions}
          value={displayValue}
          onChange={(v) => {
            setLocalValue(v as UserPaymentStatus);
            void commit();
          }}
        />
      </div>
      <CellSaveFeedback status={saveStatus} showSavedTick={showSavedTick} />
    </div>
  );
};

export default UserPaymentStatusInlineForm;
```

Important: `setLocalValue` then `commit()` same tick is supported via `displayRef` in the hook.

Drop success toast. Keep `userId` in props for call-site compatibility even if unused (or leave unused with existing signature).

- [ ] **Step 2: Commit**

```bash
git add src/components/datatable/user-payment-status-inline-form.tsx
git commit -m "$(cat <<'EOF'
feat(finances): optimistic payment status inline save with feedback

EOF
)"
```

---

### Task 6: `ResourceTable` editable text + recent-transactions cell

**Files:**
- Modify: `src/components/data-table/resource-table.tsx`
- Modify: `src/app/(internal)/finances/recent-transactions/page.tsx`

- [ ] **Step 1: Update `EditableTextCell` in resource-table**

Replace Retry/`FormSaveTick` with:

```tsx
import { CellSaveFeedback, useCellAutosave } from "@/components/edit-kit";

// inside EditableTextCell — drop error/retry from destructure if unused:
const { displayValue, setLocalValue, commit, showSavedTick, status } =
  useCellAutosave({
    value: stringValue,
    onSave: (next) => onSave(row, next),
  });

// ...
<CellSaveFeedback status={status} showSavedTick={showSavedTick} />
```

Callers that need cache/toast must pass them inside their `editable.onSave` (or extend later). This task only unifies feedback UI for the shared cell.

- [ ] **Step 2: Update `TransactionIdCell` on recent-transactions**

```tsx
import { CellSaveFeedback, useCellAutosave } from "@/components/edit-kit";
import { useToast } from "@/components/primitives";
import {
  patchPaymentRowInQueryCaches,
  restoreQueryCacheSnapshots,
  type QueryCacheSnapshot,
} from "@/lib/finances/patch-payment-row-cache";
import { useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";

function TransactionIdCell({ row }: { row: UserPayment }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const cacheSnapRef = useRef<QueryCacheSnapshot[]>([]);
  const stringValue = row.transaction_id ?? "";

  const { displayValue, setLocalValue, commit, showSavedTick, status: saveStatus } =
    useCellAutosave({
      value: stringValue,
      onOptimisticUpdate: (next) => {
        cacheSnapRef.current = patchPaymentRowInQueryCaches(
          queryClient,
          row.id,
          { transaction_id: next },
        );
      },
      onRollback: () => {
        restoreQueryCacheSnapshots(queryClient, cacheSnapRef.current);
        cacheSnapRef.current = [];
      },
      onError: () => {
        toast.add({
          type: "error",
          description: "Could not save change.",
        });
      },
      onSave: async (next) => {
        await updateEntity("user-payments", row.id, {
          transaction_id: next,
        });
        void queryClient.invalidateQueries({ queryKey: ["user-payments"] });
      },
    });

  return (
    <div className="flex min-w-0 items-center gap-2">
      <Input
        value={displayValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={() => {
          void commit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
        }}
        className="h-8 min-w-0 flex-1 text-sm"
      />
      <CellSaveFeedback status={saveStatus} showSavedTick={showSavedTick} />
    </div>
  );
}
```

- [ ] **Step 3: Run unit tests**

Run: `npm run test:unit -- src/lib/finances/patch-payment-row-cache.test.ts src/components/edit-kit/__tests__/use-cell-autosave.test.ts`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/data-table/resource-table.tsx src/app/\(internal\)/finances/recent-transactions/page.tsx
git commit -m "$(cat <<'EOF'
feat: wire CellSaveFeedback on resource table and recent transactions

EOF
)"
```

---

### Task 7: Final verification

- [ ] **Step 1: Run full related unit suite**

Run: `npm run test:unit -- src/lib/finances/patch-payment-row-cache.test.ts src/components/edit-kit/__tests__/use-cell-autosave.test.ts`

Expected: PASS

- [ ] **Step 2: Manual checklist (local app)**

1. Student payments: edit Description — text stays; Saving… → ✓ Saved; no blank flash.
2. Student payments: change Status — selector shows new value immediately; Saving… → ✓ Saved; no success toast.
3. Force API failure (offline / bad id): value/status reverts; error toast appears.
4. Recent transactions: edit Transaction ID — same feedback; no flash.

- [ ] **Step 3: No further commit unless fixes were needed**

If fixes were needed, commit them with a clear message, e.g. `fix(edit-kit): …`.

---

## Spec coverage (self-review)

| Spec requirement | Task |
| --- | --- |
| Optimistic local display | Task 2 (existing) + Tasks 4–6 |
| Cache-first `setQueryData` before API | Tasks 1, 4, 5, 6 |
| Soft invalidate after success | Tasks 4, 5, 6 |
| Saving → saved tick feedback | Tasks 3–6 |
| Rollback + destructive toast; no Retry | Tasks 2, 4–6 |
| Status select same pattern | Task 5 |
| ResourceTable + recent-transactions | Task 6 |
| Unit tests for hook + cache helper | Tasks 1–2, 7 |
| Non-goals (checkin/quiz/glide rewrite) | Not in plan |

**Placeholder scan:** none. **Type consistency:** `QueryCacheSnapshot`, `onOptimisticUpdate` / `onRollback` / `onError`, `CellSaveFeedback` props aligned across tasks.
