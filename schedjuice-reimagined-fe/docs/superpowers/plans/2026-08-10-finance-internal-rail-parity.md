# Finance Internal Rail Parity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Payment Plans, Discounts, Payment Methods, Payment Info, and Scan Transaction Screenshots to the finance internal rail (with a new Configuration group) and keep the rail visible on all related routes outside `/finances/**`.

**Architecture:** Extend `finance-record-nav.ts` with five entries and a `configuration` group mirroring `nav-routes.tsx` permissions. Extract `FinanceRecordRailProvider` from `finances/layout.tsx` and mount it via thin layouts on config/screenshot route segments. Expand `isFinanceRecordRoute` for find-page record-mode detection.

**Tech Stack:** Next.js App Router, React client layouts, Vitest (`npm run test:unit`).

**Spec:** `docs/superpowers/specs/2026-08-10-finance-internal-rail-parity-design.md`

## Global Constraints

- Preserve existing URLs — no route moves or redirects.
- Do **not** change `nav-routes.tsx` or backend/middleware permissions.
- Config page headers stay as-is — do **not** add `FinanceLayoutHeader` to config layouts.
- Mirror `nav-routes.tsx` labels, hrefs, `requiredPermissions`, and `canShow` gates exactly.
- Group order: Payments → **Configuration** → Analytics → Operations.
- Scan Transaction Screenshots stays in **Payments** (after Unpaid Students).
- FE unit tests: `npm run test:unit -- <path>` from `schedjuice-reimagined-fe/`.
- High-value tests only — permission gates, tenant strategy gates, active-state on nested routes.

---

## File Structure

| File | Action | Responsibility |
| --- | --- | --- |
| `src/config/finance-record-nav.ts` | Modify | New group, five entries, active-state for `/screenshots/**` |
| `src/config/__tests__/finance-record-nav.test.ts` | Modify | Visibility, grouping, active-state tests |
| `src/lib/is-finance-record-route.ts` | Modify | Expanded finance workspace prefixes |
| `src/lib/is-finance-record-route.test.ts` | Create | Prefix true/false coverage |
| `src/components/finances/record/finance-record-rail-provider.tsx` | Create | Shared context rail + mobile sections |
| `src/app/(internal)/finances/layout.tsx` | Modify | Use provider; keep `FinanceLayoutHeader` |
| `src/app/(internal)/payment-plans/layout.tsx` | Create | Rail provider only |
| `src/app/(internal)/discounts/layout.tsx` | Create | Rail provider only |
| `src/app/(internal)/payment-methods/layout.tsx` | Create | Rail provider only |
| `src/app/(internal)/payment-infos/layout.tsx` | Create | Rail provider only |
| `src/app/(internal)/screenshots/layout.tsx` | Create | Rail provider only |

---

### Task 1: Finance nav config — Configuration group + five entries

**Files:**
- Modify: `src/config/finance-record-nav.ts`
- Modify: `src/config/__tests__/finance-record-nav.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // finance-record-nav.ts
  type FinanceRecordNavGroupId = "payments" | "configuration" | "analytics" | "operations";
  type FinanceRecordNavId =
    | /* existing ids */
    | "payment_plans"
    | "discounts"
    | "payment_methods"
    | "payment_infos"
    | "scan_screenshots";

  export const FINANCE_RECORD_NAV_GROUPS: FinanceRecordNavGroup[];
  export const FINANCE_RECORD_NAV_ENTRIES: FinanceRecordNavEntry[];
  export function financeRecordNavActive(entry: FinanceRecordNavEntry, pathname: string): boolean;
  export function visibleFinanceRecordNavSections(...): FinanceRecordNavSections;
  ```

- [ ] **Step 1: Write failing tests**

Add to `src/config/__tests__/finance-record-nav.test.ts`:

```ts
import {
  FINANCE_RECORD_NAV_ENTRIES,
  financeRecordNavActive,
  financeRecordSubRouteLabel,
  visibleFinanceRecordEntries,
  visibleFinanceRecordNavSections,
} from "../finance-record-nav";
import { TransactionScreenshotStrategy } from "@/types/organization";
import type { organizationType } from "@/types/organization";
import { role, type accountType } from "@/types/user";

const adminTenant = {
  transaction_screenshot_strategy: TransactionScreenshotStrategy.admin_upload,
  is_payroll_calculation_enabled: true,
  is_microsoft_on: false,
} as organizationType;

const adminUser = {
  roles: [{ permissions: [{ code: "payment.view_all" }, { code: "analytics.view" }] }],
} as unknown as accountType;

const configureUser = {
  roles: [
    {
      permissions: [
        { code: "payment.view_all" },
        { code: "payment.configure" },
        { code: "payment.record" },
        { code: "analytics.view" },
        { code: "payroll.view_all" },
        { code: "rate.manage" },
        { code: "checkin.view_all" },
      ],
    },
  ],
} as unknown as accountType;

const studentUser = {
  roles: [role.student],
  permissions: ["payment.make", "payment.view"],
} as unknown as accountType;

const canAnyAdmin = (codes: string[]) =>
  codes.some((code) => code === "payment.view_all" || code === "analytics.view");

const canAnyConfigure = (codes: string[]) =>
  codes.some((code) =>
    [
      "payment.view_all",
      "payment.configure",
      "payment.record",
      "analytics.view",
      "payroll.view_all",
      "rate.manage",
      "checkin.view_all",
    ].includes(code),
  );

const canAnyStudent = (codes: string[]) =>
  codes.some((code) => code === "payment.make" || code === "payment.view");

describe("financeRecordNavActive", () => {
  it("highlights overview only on exact /finances", () => {
    const overview = FINANCE_RECORD_NAV_ENTRIES.find((e) => e.id === "overview")!;
    expect(financeRecordNavActive(overview, "/finances")).toBe(true);
    expect(financeRecordNavActive(overview, "/finances/student-payments")).toBe(false);
    expect(financeRecordNavActive(overview, "/discounts")).toBe(false);
  });

  it("highlights student payments on nested upload routes", () => {
    const entry = FINANCE_RECORD_NAV_ENTRIES.find((e) => e.id === "student_payments")!;
    expect(financeRecordNavActive(entry, "/finances/student-payments")).toBe(true);
    expect(financeRecordNavActive(entry, "/finances/student-payments/upload")).toBe(true);
    expect(financeRecordNavActive(entry, "/finances/unpaid-students")).toBe(false);
  });

  it("highlights configuration entries on nested CRUD routes", () => {
    const discounts = FINANCE_RECORD_NAV_ENTRIES.find((e) => e.id === "discounts")!;
    expect(financeRecordNavActive(discounts, "/discounts")).toBe(true);
    expect(financeRecordNavActive(discounts, "/discounts/create")).toBe(true);
    expect(financeRecordNavActive(discounts, "/discounts/abc/edit")).toBe(true);

    const plans = FINANCE_RECORD_NAV_ENTRIES.find((e) => e.id === "payment_plans")!;
    expect(financeRecordNavActive(plans, "/payment-plans/abc/edit")).toBe(true);
  });

  it("highlights scan screenshots on /screenshots/create and nested paths", () => {
    const scan = FINANCE_RECORD_NAV_ENTRIES.find((e) => e.id === "scan_screenshots")!;
    expect(financeRecordNavActive(scan, "/screenshots/create")).toBe(true);
    expect(financeRecordNavActive(scan, "/screenshots/create/extra")).toBe(true);
    expect(financeRecordNavActive(scan, "/finances/unpaid-students")).toBe(false);
  });
});

describe("financeRecordSubRouteLabel", () => {
  it("returns a title-cased tail for nested routes", () => {
    expect(financeRecordSubRouteLabel("/finances/student-payments/upload")).toBe(
      "Upload",
    );
  });
});

describe("visibleFinanceRecordEntries", () => {
  it("hides student-only entries for admin viewers", () => {
    const ids = visibleFinanceRecordEntries(adminUser, adminTenant, canAnyAdmin).map(
      (entry) => entry.id,
    );
    expect(ids).not.toContain("make_payment");
    expect(ids).not.toContain("payment_history");
    expect(ids).toContain("student_payments");
    expect(ids).not.toContain("payment_plans");
    expect(ids).not.toContain("discounts");
  });

  it("shows configuration entries for payment.configure holders", () => {
    const ids = visibleFinanceRecordEntries(configureUser, adminTenant, canAnyConfigure).map(
      (entry) => entry.id,
    );
    expect(ids).toContain("payment_plans");
    expect(ids).toContain("discounts");
    expect(ids).toContain("payment_methods");
    expect(ids).toContain("payment_infos");
  });

  it("shows scan screenshots only for admin_upload strategy", () => {
    const withAdminUpload = visibleFinanceRecordEntries(
      configureUser,
      adminTenant,
      canAnyConfigure,
    ).map((entry) => entry.id);
    expect(withAdminUpload).toContain("scan_screenshots");

    const withoutAdminUpload = visibleFinanceRecordEntries(
      configureUser,
      {
        ...adminTenant,
        transaction_screenshot_strategy: TransactionScreenshotStrategy.user_upload,
      } as organizationType,
      canAnyConfigure,
    ).map((entry) => entry.id);
    expect(withoutAdminUpload).not.toContain("scan_screenshots");
  });

  it("shows student payment entries for student viewers", () => {
    const ids = visibleFinanceRecordEntries(studentUser, adminTenant, canAnyStudent).map(
      (entry) => entry.id,
    );
    expect(ids).toContain("make_payment");
    expect(ids).toContain("payment_history");
  });
});

describe("visibleFinanceRecordNavSections", () => {
  it("returns configuration group between payments and analytics", () => {
    const { groups } = visibleFinanceRecordNavSections(
      configureUser,
      adminTenant,
      canAnyConfigure,
    );
    expect(groups.map((group) => group.id)).toEqual([
      "payments",
      "configuration",
      "analytics",
      "operations",
    ]);
    expect(groups.find((group) => group.id === "configuration")?.entries.map((e) => e.id)).toEqual([
      "payment_plans",
      "discounts",
      "payment_methods",
      "payment_infos",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/config/__tests__/finance-record-nav.test.ts`

Expected: FAIL — missing entry ids (`payment_plans`, etc.) and/or `configuration` group.

- [ ] **Step 3: Implement nav config changes**

In `src/config/finance-record-nav.ts`:

1. Extend `FinanceRecordNavId` with five new ids.
2. Extend `FinanceRecordNavGroupId` with `"configuration"`.
3. Update `FINANCE_RECORD_NAV_GROUPS`:

```ts
export const FINANCE_RECORD_NAV_GROUPS: FinanceRecordNavGroup[] = [
  { id: "payments", label: "Payments" },
  { id: "configuration", label: "Configuration" },
  { id: "analytics", label: "Analytics" },
  { id: "operations", label: "Operations" },
];
```

4. Insert entries after `unpaid_students` and before `cash_flow`:

```ts
  {
    id: "scan_screenshots",
    label: "Scan Transaction Screenshots",
    href: "/screenshots/create",
    group: "payments",
    requiredPermissions: ["payment.record"],
    canShow: (tenant) =>
      tenant.transaction_screenshot_strategy ===
      TransactionScreenshotStrategy.admin_upload,
  },
  {
    id: "payment_plans",
    label: "Payment Plans",
    href: "/payment-plans",
    group: "configuration",
    requiredPermissions: ["payment.configure"],
  },
  {
    id: "discounts",
    label: "Discounts",
    href: "/discounts",
    group: "configuration",
    requiredPermissions: ["payment.configure"],
  },
  {
    id: "payment_methods",
    label: "Payment Methods",
    href: "/payment-methods",
    group: "configuration",
    requiredPermissions: ["payment.configure"],
  },
  {
    id: "payment_infos",
    label: "Payment Info",
    href: "/payment-infos",
    group: "configuration",
    requiredPermissions: ["payment.configure"],
  },
```

5. Update `financeRecordNavActive`:

```ts
export function financeRecordNavActive(
  entry: FinanceRecordNavEntry,
  pathname: string,
): boolean {
  if (entry.href === "/finances") {
    return pathname === "/finances";
  }
  if (entry.id === "scan_screenshots") {
    return pathname === "/screenshots/create" || pathname.startsWith("/screenshots/");
  }
  return pathname === entry.href || pathname.startsWith(`${entry.href}/`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/config/__tests__/finance-record-nav.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/config/finance-record-nav.ts src/config/__tests__/finance-record-nav.test.ts
git commit -m "feat(finance): add configuration group and missing rail nav entries"
```

---

### Task 2: Expand `isFinanceRecordRoute`

**Files:**
- Modify: `src/lib/is-finance-record-route.ts`
- Create: `src/lib/is-finance-record-route.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function isFinanceRecordRoute(pathname: string): boolean;
  ```

- [ ] **Step 1: Write failing test**

Create `src/lib/is-finance-record-route.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isFinanceRecordRoute } from "./is-finance-record-route";

describe("isFinanceRecordRoute", () => {
  it("matches finances workspace routes", () => {
    expect(isFinanceRecordRoute("/finances")).toBe(true);
    expect(isFinanceRecordRoute("/finances/student-payments")).toBe(true);
    expect(isFinanceRecordRoute("/payment-plans")).toBe(true);
    expect(isFinanceRecordRoute("/payment-plans/create")).toBe(true);
    expect(isFinanceRecordRoute("/discounts/abc/edit")).toBe(true);
    expect(isFinanceRecordRoute("/payment-methods")).toBe(true);
    expect(isFinanceRecordRoute("/payment-infos")).toBe(true);
    expect(isFinanceRecordRoute("/screenshots/create")).toBe(true);
  });

  it("rejects unrelated routes", () => {
    expect(isFinanceRecordRoute("/courses")).toBe(false);
    expect(isFinanceRecordRoute("/users")).toBe(false);
    expect(isFinanceRecordRoute("/financesomething")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/lib/is-finance-record-route.test.ts`

Expected: FAIL on `/payment-plans`, `/discounts`, etc.

- [ ] **Step 3: Implement expanded route helper**

Replace `src/lib/is-finance-record-route.ts`:

```ts
const FINANCE_RECORD_ROUTE_PREFIXES = [
  "/finances",
  "/payment-plans",
  "/discounts",
  "/payment-methods",
  "/payment-infos",
  "/screenshots",
] as const;

/** True for finance workspace routes (overview, operations, and payment config). */
export function isFinanceRecordRoute(pathname: string): boolean {
  return FINANCE_RECORD_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/lib/is-finance-record-route.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/is-finance-record-route.ts src/lib/is-finance-record-route.test.ts
git commit -m "feat(finance): expand finance record route detection for config pages"
```

---

### Task 3: Extract `FinanceRecordRailProvider` and refactor finances layout

**Files:**
- Create: `src/components/finances/record/finance-record-rail-provider.tsx`
- Modify: `src/app/(internal)/finances/layout.tsx`

**Interfaces:**
- Produces:
  ```tsx
  export function FinanceRecordRailProvider({ children }: { children: ReactNode }): JSX.Element;
  ```

- Consumes: `FinanceSectionRail`, `FinanceMobileSections`, `useContextRail`, hooks from Task 1 (no signature changes).

- [ ] **Step 1: Create provider component**

Create `src/components/finances/record/finance-record-rail-provider.tsx`:

```tsx
"use client";

import { FinanceMobileSections } from "@/components/finances/record/finance-mobile-sections";
import { FinanceSectionRail } from "@/components/finances/record/finance-section-rail";
import { useContextRail } from "@/components/shell/use-context-rail";
import { FINANCE_CONTEXT_PARENT } from "@/config/finance-record-nav";
import { pageContentInsetClassName } from "@/components/layout/page-container";
import { usePermissions } from "@/hooks/usePermissions";
import { useTenant } from "@/hooks/useTenant";
import { useUser } from "@/hooks/useUser";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function FinanceRecordRailProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user } = useUser();
  const { tenant } = useTenant();
  const { canAny } = usePermissions();

  useContextRail(
    FinanceSectionRail,
    () =>
      tenant
        ? {
            pathname,
            user,
            tenant,
            canAny,
          }
        : null,
    FINANCE_CONTEXT_PARENT,
  );

  return (
    <>
      {tenant ? (
        <div className={cn(pageContentInsetClassName(), "pt-4 md:hidden")}>
          <FinanceMobileSections user={user} tenant={tenant} canAny={canAny} />
        </div>
      ) : null}
      {children}
    </>
  );
}
```

- [ ] **Step 2: Refactor finances layout**

Replace `src/app/(internal)/finances/layout.tsx`:

```tsx
"use client";

import { FinanceRecordRailProvider } from "@/components/finances/record/finance-record-rail-provider";
import { FinanceLayoutHeader } from "@/components/finances/record/use-finance-record-page-header";
import type { ReactNode } from "react";

export default function FinancesLayout({ children }: { children: ReactNode }) {
  return (
    <FinanceRecordRailProvider>
      <FinanceLayoutHeader />
      {children}
    </FinanceRecordRailProvider>
  );
}
```

- [ ] **Step 3: Run nav tests (regression check)**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/config/__tests__/finance-record-nav.test.ts src/lib/is-finance-record-route.test.ts`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/finances/record/finance-record-rail-provider.tsx src/app/(internal)/finances/layout.tsx
git commit -m "refactor(finance): extract shared finance record rail provider"
```

---

### Task 4: Mount rail provider on config and screenshot routes

**Files:**
- Create: `src/app/(internal)/payment-plans/layout.tsx`
- Create: `src/app/(internal)/discounts/layout.tsx`
- Create: `src/app/(internal)/payment-methods/layout.tsx`
- Create: `src/app/(internal)/payment-infos/layout.tsx`
- Create: `src/app/(internal)/screenshots/layout.tsx`

**Interfaces:**
- Consumes: `FinanceRecordRailProvider` from Task 3.

- [ ] **Step 1: Add thin layouts (identical pattern for each segment)**

Create each file with this content (only the default export name differs — keep filename matching folder):

`src/app/(internal)/payment-plans/layout.tsx`:

```tsx
"use client";

import { FinanceRecordRailProvider } from "@/components/finances/record/finance-record-rail-provider";
import type { ReactNode } from "react";

export default function PaymentPlansLayout({ children }: { children: ReactNode }) {
  return <FinanceRecordRailProvider>{children}</FinanceRecordRailProvider>;
}
```

`src/app/(internal)/discounts/layout.tsx`:

```tsx
"use client";

import { FinanceRecordRailProvider } from "@/components/finances/record/finance-record-rail-provider";
import type { ReactNode } from "react";

export default function DiscountsLayout({ children }: { children: ReactNode }) {
  return <FinanceRecordRailProvider>{children}</FinanceRecordRailProvider>;
}
```

`src/app/(internal)/payment-methods/layout.tsx`:

```tsx
"use client";

import { FinanceRecordRailProvider } from "@/components/finances/record/finance-record-rail-provider";
import type { ReactNode } from "react";

export default function PaymentMethodsLayout({ children }: { children: ReactNode }) {
  return <FinanceRecordRailProvider>{children}</FinanceRecordRailProvider>;
}
```

`src/app/(internal)/payment-infos/layout.tsx`:

```tsx
"use client";

import { FinanceRecordRailProvider } from "@/components/finances/record/finance-record-rail-provider";
import type { ReactNode } from "react";

export default function PaymentInfosLayout({ children }: { children: ReactNode }) {
  return <FinanceRecordRailProvider>{children}</FinanceRecordRailProvider>;
}
```

`src/app/(internal)/screenshots/layout.tsx`:

```tsx
"use client";

import { FinanceRecordRailProvider } from "@/components/finances/record/finance-record-rail-provider";
import type { ReactNode } from "react";

export default function ScreenshotsLayout({ children }: { children: ReactNode }) {
  return <FinanceRecordRailProvider>{children}</FinanceRecordRailProvider>;
}
```

- [ ] **Step 2: Run full unit test suite for touched modules**

Run: `cd schedjuice-reimagined-fe && npm run test:unit -- src/config/__tests__/finance-record-nav.test.ts src/lib/is-finance-record-route.test.ts`

Expected: PASS

- [ ] **Step 3: Manual smoke (dev server)**

1. Open `/finances` — rail shows **Configuration** with four items; **Scan Transaction Screenshots** under Payments (when tenant uses `admin_upload`).
2. Navigate to `/discounts` — rail persists; Discounts is active; `← Overview` returns to `/finances`.
3. Navigate `/finances` → `/payment-plans/create` — rail persists throughout.
4. Resize to mobile — horizontal section picker includes Configuration entries.

- [ ] **Step 4: Commit**

```bash
git add src/app/(internal)/payment-plans/layout.tsx \
  src/app/(internal)/discounts/layout.tsx \
  src/app/(internal)/payment-methods/layout.tsx \
  src/app/(internal)/payment-infos/layout.tsx \
  src/app/(internal)/screenshots/layout.tsx
git commit -m "feat(finance): show internal rail on payment config and screenshot routes"
```

---

## Spec self-review (plan vs spec)

| Spec requirement | Task |
| --- | --- |
| Five missing nav entries with mirrored permissions | Task 1 |
| Configuration group + Scan in Payments | Task 1 |
| Rail persists on config/screenshot routes | Tasks 3–4 |
| No URL / main sidebar / middleware changes | Global constraints |
| `isFinanceRecordRoute` expansion | Task 2 |
| Active state on nested config routes | Task 1 (`financeRecordNavActive`) |
| Tests for visibility, groups, active state, route helper | Tasks 1–2 |
| Config pages keep own headers | Task 4 (no `FinanceLayoutHeader`) |

No placeholders. All file paths and code blocks are complete.

---

## Manual verification checklist

- [ ] `/finances` rail lists Configuration group in correct order
- [ ] User without `payment.configure` does not see Configuration entries
- [ ] Scan Screenshots hidden unless `admin_upload` strategy
- [ ] Rail visible on `/discounts`, `/payment-plans`, `/payment-methods`, `/payment-infos`, `/screenshots/create`
- [ ] No double rail or layout flash when switching between `/finances` and `/discounts`
- [ ] Mobile section picker includes new entries
