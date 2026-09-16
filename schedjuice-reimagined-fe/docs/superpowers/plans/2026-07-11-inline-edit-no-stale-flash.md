# Inline edit no stale flash / status layout shift — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop student-payments inline text/status from snapping back to the pre-edit value after save, and stop the status select from layout-shifting (Select ↔ Loader swap) during save.

**Architecture:** Keep existing `useCellAutosave` + cache patch optimism. Replace post-save `invalidateQueries` with a shared soft `refetchQueries` helper (preserves patched cache data while fetching). Remove save-time `isLoading` on the status `Selector` so the control stays mounted; feedback stays in `CellSaveFeedback`.

**Tech Stack:** React, TanStack Query, Vitest (`npm run test:unit`), existing edit-kit + `patchPaymentRowInQueryCaches`

**Spec:** `docs/superpowers/specs/2026-07-11-inline-edit-no-stale-flash-design.md`

All commands run from `schedjuice-reimagined-fe/`.

---

## File Structure

| File | Action | Responsibility |
| --- | --- | --- |
| `src/lib/finances/soft-refetch-student-payments-report.ts` | Create | Soft refetch helper for payment list/report queries after optimistic save |
| `src/lib/finances/soft-refetch-student-payments-report.test.ts` | Create | Unit tests for helper query keys / call shape |
| `src/components/datatable/user-payment-status-inline-form.tsx` | Modify | Drop save-time Selector loading; accept optional `tableUid`; soft refetch on success |
| `src/components/finances/student-payments-resource-table.tsx` | Modify | Text cells use soft refetch; pass `tableUid` into status form |
| `src/app/(internal)/finances/recent-transactions/page.tsx` | Modify (minimal) | Status form still compiles (optional `tableUid`); no broader recent-transactions flash work |

---

### Task 1: Soft refetch helper (TDD)

**Files:**
- Create: `src/lib/finances/soft-refetch-student-payments-report.ts`
- Test: `src/lib/finances/soft-refetch-student-payments-report.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";

import { softRefetchStudentPaymentsReport } from "./soft-refetch-student-payments-report";

function mockQueryClient() {
  return {
    refetchQueries: vi.fn().mockResolvedValue(undefined),
  };
}

describe("softRefetchStudentPaymentsReport", () => {
  it("refetches searchuser-payments scoped by tableUid and user-payments", async () => {
    const queryClient = mockQueryClient();
    await softRefetchStudentPaymentsReport(queryClient as any, {
      tableUid: "student-payments",
    });
    expect(queryClient.refetchQueries).toHaveBeenCalledWith({
      queryKey: ["searchuser-payments", "student-payments"],
    });
    expect(queryClient.refetchQueries).toHaveBeenCalledWith({
      queryKey: ["user-payments"],
    });
    expect(queryClient.refetchQueries).toHaveBeenCalledTimes(2);
  });

  it("refetches unscoped searchuser-payments when tableUid omitted", async () => {
    const queryClient = mockQueryClient();
    await softRefetchStudentPaymentsReport(queryClient as any);
    expect(queryClient.refetchQueries).toHaveBeenCalledWith({
      queryKey: ["searchuser-payments"],
    });
    expect(queryClient.refetchQueries).toHaveBeenCalledWith({
      queryKey: ["user-payments"],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- src/lib/finances/soft-refetch-student-payments-report.test.ts`

Expected: FAIL (module / export not found)

- [ ] **Step 3: Write minimal implementation**

```ts
import type { QueryClient } from "@tanstack/react-query";

export type SoftRefetchStudentPaymentsOptions = {
  tableUid?: string;
};

/**
 * Soft-reconcile payment list/report caches after an optimistic row patch.
 * Uses refetchQueries (keeps current data visible) — never invalidateQueries.
 */
export async function softRefetchStudentPaymentsReport(
  queryClient: QueryClient,
  options?: SoftRefetchStudentPaymentsOptions,
): Promise<void> {
  const searchKey = options?.tableUid
    ? (["searchuser-payments", options.tableUid] as const)
    : (["searchuser-payments"] as const);

  await Promise.all([
    queryClient.refetchQueries({ queryKey: [...searchKey] }),
    queryClient.refetchQueries({ queryKey: ["user-payments"] }),
  ]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- src/lib/finances/soft-refetch-student-payments-report.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/finances/soft-refetch-student-payments-report.ts \
  src/lib/finances/soft-refetch-student-payments-report.test.ts
git commit -m "$(cat <<'EOF'
feat(finances): soft refetch helper for payment report after optimistic save

EOF
)"
```

---

### Task 2: Status inline form — no loader swap + soft refetch

**Files:**
- Modify: `src/components/datatable/user-payment-status-inline-form.tsx`
- (Call sites updated in Task 3; recent-transactions keeps working with optional `tableUid`)

- [ ] **Step 1: Update props and save path**

In `src/components/datatable/user-payment-status-inline-form.tsx`:

1. Import the helper:

```ts
import { softRefetchStudentPaymentsReport } from "@/lib/finances/soft-refetch-student-payments-report";
```

2. Add optional `tableUid` to props:

```ts
interface StatusInlineFormProps {
  status: UserPaymentStatus;
  userPaymentId: number | string;
  isDisabled?: boolean;
  userId: string;
  /** When set, soft-refetch scopes to this admin-report / search uid. */
  tableUid?: string;
}
```

3. Destructure `tableUid` in the component.

4. Replace `onSave` invalidate calls with soft refetch:

```ts
onSave: async (next) => {
  await updateEntity("user-payments", userPaymentId, { status: next });
  await softRefetchStudentPaymentsReport(queryClient, { tableUid });
},
```

5. **Remove** this prop from `Selector` entirely (do not pass `false` via a loading flag tied to save):

```ts
isLoading={saveStatus === "saving"}
```

Keep `CellSaveFeedback`, `fullWidth`, borders, and `isDisabled` as they are. `saveStatus` remains used only for `CellSaveFeedback`.

Full `Selector` block after change:

```tsx
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
  options={statusOptions}
  value={displayValue}
  onChange={(v) => {
    setLocalValue(v as UserPaymentStatus);
    void commit();
  }}
/>
```

- [ ] **Step 2: Typecheck / unit sanity**

Run: `npm run test:unit -- src/lib/finances/soft-refetch-student-payments-report.test.ts`

Expected: PASS (helper unchanged)

Also confirm the file has **no** `isLoading=` related to `saveStatus` (search the file).

- [ ] **Step 3: Commit**

```bash
git add src/components/datatable/user-payment-status-inline-form.tsx
git commit -m "$(cat <<'EOF'
fix(finances): keep payment status select mounted during save

EOF
)"
```

---

### Task 3: Wire student-payments table — text soft refetch + status `tableUid`

**Files:**
- Modify: `src/components/finances/student-payments-resource-table.tsx`

- [ ] **Step 1: Soft refetch in `PaymentEditableFieldCell`**

Add import:

```ts
import { softRefetchStudentPaymentsReport } from "@/lib/finances/soft-refetch-student-payments-report";
```

Replace the `onSave` invalidate block:

```ts
onSave: async (next) => {
  await updateEntity("user-payments", row.id, { [field]: next || null });
  await softRefetchStudentPaymentsReport(queryClient, { tableUid });
},
```

Do **not** call `invalidateQueries` here.

- [ ] **Step 2: Pass `tableUid` into status form**

Where `UserPaymentStatusInlineForm` is rendered in the status column, add `tableUid={tableUid}`:

```tsx
<UserPaymentStatusInlineForm
  userId={row.user?.id != null ? String(row.user.id) : ""}
  isDisabled={Boolean(user && !canVerifyPayments(user))}
  status={row.status as UserPaymentStatus}
  userPaymentId={row.id}
  tableUid={tableUid}
/>
```

(`tableUid` is already a prop on `StudentPaymentsResourceTable`.)

- [ ] **Step 3: Confirm no remaining invalidate on these save paths**

In `student-payments-resource-table.tsx`, `PaymentEditableFieldCell` must not call `invalidateQueries`.  
In `user-payment-status-inline-form.tsx`, `onSave` must not call `invalidateQueries`.

- [ ] **Step 4: Run unit tests**

Run: `npm run test:unit -- src/lib/finances/soft-refetch-student-payments-report.test.ts src/lib/finances/patch-payment-row-cache.test.ts src/components/edit-kit/__tests__/use-cell-autosave.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/finances/student-payments-resource-table.tsx
git commit -m "$(cat <<'EOF'
fix(finances): soft-refetch student payment cells after optimistic save

EOF
)"
```

---

### Task 4: Manual verification

**Files:** none (manual)

- [ ] **Step 1: Manual checklist on student payments original table**

1. Open student payments (non-Glide / original table).
2. Edit **Transaction ID**, blur — value must stay on the new text; no snap to old; Saving… → tick OK.
3. Edit **Description**, blur — same.
4. Change **Status** — select must stay visible (no Loader box); column width must not jump; value must not snap to old; Saving… → tick OK.
5. Force a failed save if easy (offline) — value rolls back + error toast.

- [ ] **Step 2: Commit only if any small follow-up fixes were needed**

If no code changes from manual QA, skip commit.

---

## Spec coverage (self-review)

| Spec requirement | Task |
| --- | --- |
| No snap-to-old on text | Task 3 soft refetch |
| No snap-to-old on status | Task 2 soft refetch + Task 3 `tableUid` |
| No status layout shift / Select remount | Task 2 remove `isLoading` |
| Keep CellSaveFeedback | Task 2 (unchanged feedback) |
| Shared post-save policy | Task 1 helper + Tasks 2–3 |
| Errors unchanged | No change to rollback/toast paths |
| Soft refetch not invalidate | Task 1–3 |
| Out of scope: Glide, global Selector redesign | Not in plan |

**Placeholder scan:** none.  
**Type consistency:** `softRefetchStudentPaymentsReport(queryClient, { tableUid? })` used the same way in text + status.
