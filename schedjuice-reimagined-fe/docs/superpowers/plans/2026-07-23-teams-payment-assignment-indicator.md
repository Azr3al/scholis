# Teams Payment Assignment Indicator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the Teams payment assignment status line in the student payments course summary strip for Microsoft-enabled tenants when a course is selected.

**Architecture:** Add pure label/predicate helpers, a React Query hook against the existing month-status endpoint, a small presentational line component, and wire it into `PaymentGridSummaryStrip` under course meta. Both Glide and ResourceTable views pick it up automatically.

**Tech Stack:** Next.js App Router, React, TanStack Query, Vitest (`npm run test:unit`), `axiosClient`, existing `PaymentAssignmentMonthUiStatus` enum.

**Spec:** `docs/superpowers/specs/2026-07-23-teams-payment-assignment-indicator-design.md`

## Global Constraints

- Surface: `PaymentGridSummaryStrip` only (not a table column).
- Gating: `tenant.is_microsoft_on`, valid course id in context; hide on global transaction lookup (strip has no course context there anyway).
- Restore prior label copy verbatim (see spec status table).
- `expected_but_missing` uses amber/warning styling; other statuses muted.
- High-value tests only — no “component renders” smoke.
- No backend changes for v1.
- All FE commands run from `schedjuice-reimagined-fe/`.

---

## File Structure

| File | Action | Responsibility |
| --- | --- | --- |
| `src/lib/finances/teams-payment-assignment-status.ts` | Create | Label mapping + `shouldShowTeamsPaymentAssignmentStatus` |
| `src/lib/finances/teams-payment-assignment-status.test.ts` | Create | Unit tests for labels and predicate |
| `src/hooks/finances/use-payment-assignment-month-status.ts` | Create | React Query GET hook |
| `src/components/finances/payments-grid/teams-payment-assignment-status-line.tsx` | Create | Loading / error / label UI |
| `src/components/finances/payments-grid/payment-grid-summary-strip.tsx` | Modify | Render status line under course meta |

---

### Task 1: Pure helpers — labels and visibility predicate

**Files:**
- Create: `src/lib/finances/teams-payment-assignment-status.ts`
- Create: `src/lib/finances/teams-payment-assignment-status.test.ts`

**Interfaces:**
- Consumes: `PaymentAssignmentMonthUiStatus` from `@/components/finances/student-payments-report`
- Produces:
  - `teamsPaymentHandInLabel(status: string): string`
  - `shouldShowTeamsPaymentAssignmentStatus(opts: { isMicrosoftOn: boolean; courseId: string | number | null | undefined }): boolean`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/finances/teams-payment-assignment-status.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PaymentAssignmentMonthUiStatus } from "@/components/finances/student-payments-report";
import {
  shouldShowTeamsPaymentAssignmentStatus,
  teamsPaymentHandInLabel,
} from "./teams-payment-assignment-status";

describe("teamsPaymentHandInLabel", () => {
  it("maps all known statuses to prior copy", () => {
    expect(teamsPaymentHandInLabel(PaymentAssignmentMonthUiStatus.Created)).toBe(
      "Teams payment: CREATED",
    );
    expect(
      teamsPaymentHandInLabel(PaymentAssignmentMonthUiStatus.ExpectedButMissing),
    ).toBe("Teams payment: EXPECTED BUT MISSING");
    expect(teamsPaymentHandInLabel(PaymentAssignmentMonthUiStatus.Skipped)).toBe(
      "Teams payment: NOT YET",
    );
    expect(
      teamsPaymentHandInLabel(PaymentAssignmentMonthUiStatus.NotApplicable),
    ).toBe("Teams payment hand-in does not apply to this class.");
  });

  it("returns fallback for unknown status", () => {
    expect(teamsPaymentHandInLabel("bogus")).toBe(
      "Could not determine Teams payment hand-in status.",
    );
  });
});

describe("shouldShowTeamsPaymentAssignmentStatus", () => {
  it("is false when Microsoft is off", () => {
    expect(
      shouldShowTeamsPaymentAssignmentStatus({
        isMicrosoftOn: false,
        courseId: "42",
      }),
    ).toBe(false);
  });

  it("is false when course id is missing or invalid", () => {
    expect(
      shouldShowTeamsPaymentAssignmentStatus({
        isMicrosoftOn: true,
        courseId: "",
      }),
    ).toBe(false);
    expect(
      shouldShowTeamsPaymentAssignmentStatus({
        isMicrosoftOn: true,
        courseId: "abc",
      }),
    ).toBe(false);
  });

  it("is true when Microsoft is on and course id is valid", () => {
    expect(
      shouldShowTeamsPaymentAssignmentStatus({
        isMicrosoftOn: true,
        courseId: "42",
      }),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/lib/finances/teams-payment-assignment-status.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement helpers**

Create `src/lib/finances/teams-payment-assignment-status.ts`:

```ts
import { PaymentAssignmentMonthUiStatus } from "@/components/finances/student-payments-report";
import { isValidApiEntityIdParam } from "@/helpers/relation-fk";

export function teamsPaymentHandInLabel(status: string): string {
  switch (status) {
    case PaymentAssignmentMonthUiStatus.Created:
      return "Teams payment: CREATED";
    case PaymentAssignmentMonthUiStatus.ExpectedButMissing:
      return "Teams payment: EXPECTED BUT MISSING";
    case PaymentAssignmentMonthUiStatus.NotApplicable:
      return "Teams payment hand-in does not apply to this class.";
    case PaymentAssignmentMonthUiStatus.Skipped:
      return "Teams payment: NOT YET";
    default:
      return "Could not determine Teams payment hand-in status.";
  }
}

export function shouldShowTeamsPaymentAssignmentStatus(opts: {
  isMicrosoftOn: boolean;
  courseId: string | number | null | undefined;
}): boolean {
  if (!opts.isMicrosoftOn) return false;
  const cid = String(opts.courseId ?? "").trim();
  return isValidApiEntityIdParam(cid);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm run test:unit -- src/lib/finances/teams-payment-assignment-status.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add \
  src/lib/finances/teams-payment-assignment-status.ts \
  src/lib/finances/teams-payment-assignment-status.test.ts
git commit -m "$(cat <<'EOF'
feat(finances): add Teams payment assignment status label helpers

EOF
)"
```

---

### Task 2: React Query hook for month-status endpoint

**Files:**
- Create: `src/hooks/finances/use-payment-assignment-month-status.ts`

**Interfaces:**
- Consumes: `shouldShowTeamsPaymentAssignmentStatus`, `teamsPaymentHandInLabel` (hook returns raw status; label used by UI component)
- Produces:

```ts
export type PaymentAssignmentMonthStatusData = {
  assignment_exists: boolean;
  payment_assignment_id: number | null;
  status: string;
  precheck_failure: string | null;
};

export function usePaymentAssignmentMonthStatus(opts: {
  courseId: string | number | null | undefined;
  monthDate: Date;
  isMicrosoftOn: boolean;
}): {
  enabled: boolean;
  isLoading: boolean;
  isError: boolean;
  data: PaymentAssignmentMonthStatusData | undefined;
};
```

- [ ] **Step 1: Create the hook**

Create `src/hooks/finances/use-payment-assignment-month-status.ts`:

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { axiosClient } from "@/lib/api";
import { shouldShowTeamsPaymentAssignmentStatus } from "@/lib/finances/teams-payment-assignment-status";

export type PaymentAssignmentMonthStatusData = {
  assignment_exists: boolean;
  payment_assignment_id: number | null;
  status: string;
  precheck_failure: string | null;
};

export function usePaymentAssignmentMonthStatus(opts: {
  courseId: string | number | null | undefined;
  monthDate: Date;
  isMicrosoftOn: boolean;
}) {
  const year = opts.monthDate.getFullYear();
  const month = opts.monthDate.getMonth() + 1;
  const courseId = String(opts.courseId ?? "").trim();

  const enabled = shouldShowTeamsPaymentAssignmentStatus({
    isMicrosoftOn: opts.isMicrosoftOn,
    courseId,
  });

  const query = useQuery({
    queryKey: ["payment-assignment-month-status", courseId, year, month],
    enabled,
    queryFn: async () => {
      const res = await axiosClient.get<{
        isError?: boolean;
        message?: string;
        data?: PaymentAssignmentMonthStatusData;
      }>(`courses/${courseId}/payment-assignment-month-status`, {
        params: { year, month },
      });
      const inner = res.data?.data;
      if (res.data?.isError || !inner) {
        throw new Error(
          typeof res.data?.message === "string"
            ? res.data.message
            : "Could not load Teams payment hand-in status.",
        );
      }
      return inner;
    },
  });

  return { enabled, ...query };
}
```

- [ ] **Step 2: Typecheck**

Run:

```bash
cd schedjuice-reimagined-fe
npx tsc --noEmit
```

Expected: no errors related to the new hook file.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/finances/use-payment-assignment-month-status.ts
git commit -m "$(cat <<'EOF'
feat(finances): add hook for Teams payment assignment month status

EOF
)"
```

---

### Task 3: Presentational status line component

**Files:**
- Create: `src/components/finances/payments-grid/teams-payment-assignment-status-line.tsx`

**Interfaces:**
- Consumes: `usePaymentAssignmentMonthStatus`, `teamsPaymentHandInLabel`, `PaymentAssignmentMonthUiStatus`
- Produces: `TeamsPaymentAssignmentStatusLine` component

- [ ] **Step 1: Create the component**

Create `src/components/finances/payments-grid/teams-payment-assignment-status-line.tsx`:

```tsx
"use client";

import { PaymentAssignmentMonthUiStatus } from "@/components/finances/student-payments-report";
import { Skeleton } from "@/components/primitives";
import { usePaymentAssignmentMonthStatus } from "@/hooks/finances/use-payment-assignment-month-status";
import { useTenant } from "@/hooks/useTenant";
import { teamsPaymentHandInLabel } from "@/lib/finances/teams-payment-assignment-status";
import { cn } from "@/lib/utils";

export function TeamsPaymentAssignmentStatusLine({
  courseId,
  monthAnchor,
}: {
  courseId: number | string;
  monthAnchor: Date;
}) {
  const { tenant } = useTenant();
  const { enabled, isLoading, isError, data } = usePaymentAssignmentMonthStatus({
    courseId,
    monthDate: monthAnchor,
    isMicrosoftOn: Boolean(tenant?.is_microsoft_on),
  });

  if (!enabled) return null;

  if (isLoading) {
    return (
      <Skeleton
        className="mt-1 h-4 w-full max-w-md"
        aria-busy="true"
        aria-label="Loading Teams payment assignment status"
      />
    );
  }

  if (isError) {
    return (
      <p className="mt-1 text-xs text-destructive" role="alert">
        Could not load Teams payment hand-in status.
      </p>
    );
  }

  if (!data) return null;

  const isMissing =
    data.status === PaymentAssignmentMonthUiStatus.ExpectedButMissing;

  return (
    <p
      className={cn(
        "mt-1 text-xs",
        isMissing
          ? "font-medium text-amber-800 dark:text-amber-200"
          : "text-muted-foreground",
      )}
    >
      {teamsPaymentHandInLabel(data.status)}
    </p>
  );
}
```

- [ ] **Step 2: Typecheck**

Run:

```bash
cd schedjuice-reimagined-fe
npx tsc --noEmit
```

Expected: PASS (no new type errors).

- [ ] **Step 3: Commit**

```bash
git add src/components/finances/payments-grid/teams-payment-assignment-status-line.tsx
git commit -m "$(cat <<'EOF'
feat(finances): add Teams payment assignment status line component

EOF
)"
```

---

### Task 4: Wire into PaymentGridSummaryStrip

**Files:**
- Modify: `src/components/finances/payments-grid/payment-grid-summary-strip.tsx`

**Interfaces:**
- Consumes: `TeamsPaymentAssignmentStatusLine`, existing `courseContext` + `monthAnchor` props

- [ ] **Step 1: Import and render under CourseMetaInline**

In `payment-grid-summary-strip.tsx`:

1. Add import:

```ts
import { TeamsPaymentAssignmentStatusLine } from "@/components/finances/payments-grid/teams-payment-assignment-status-line";
```

2. Inside `CourseMetaInline`, after the month type / duration block (before closing `</div>`), add:

```tsx
<TeamsPaymentAssignmentStatusLine
  courseId={course.id}
  monthAnchor={monthAnchor}
/>
```

`CourseMetaInline` already receives `monthAnchor`; pass it through if not already in scope (it is — parameter on line 82).

3. Guard: only render when `course.id` is truthy (TypeScript may require `course.id != null` check wrapping the line).

- [ ] **Step 2: Run unit tests**

Run:

```bash
cd schedjuice-reimagined-fe
npm run test:unit -- src/lib/finances/teams-payment-assignment-status.test.ts
```

Expected: PASS

- [ ] **Step 3: Manual smoke (MS tenant with course selected)**

1. Open `/finances/student-payments`, pick a course, confirm status line appears under course meta.  
2. Change month — line should refetch (watch network tab for `payment-assignment-month-status`).  
3. Toggle Glide vs original table — indicator present in both (shared strip).  
4. Non-MS tenant or no course selected — no line.

- [ ] **Step 4: Commit**

```bash
git add src/components/finances/payments-grid/payment-grid-summary-strip.tsx
git commit -m "$(cat <<'EOF'
feat(finances): restore Teams payment assignment indicator in summary strip

EOF
)"
```

---

## Plan self-review (spec coverage)

| Spec requirement | Task |
|------------------|------|
| Summary strip placement under course meta | Task 4 |
| Both Glide + ResourceTable via shared strip | Task 4 (no separate grid work) |
| MS gating + valid course id | Tasks 1–3 |
| Prior label copy | Task 1 |
| Amber styling for expected_but_missing | Task 3 |
| Loading skeleton + non-blocking error | Task 3 |
| Existing GET endpoint, no backend change | Task 2 |
| High-value unit tests only | Task 1 |

No placeholders; all tasks have concrete file paths and code.
