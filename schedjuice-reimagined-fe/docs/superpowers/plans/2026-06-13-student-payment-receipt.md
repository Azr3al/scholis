# Student Payment Receipt Download Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a client-side PDF receipt download for verified payments on the Student Payments report, available to admin and finance users.

**Architecture:** Pure helpers map `StudentPaymentAdminReportRow` + tenant branding into a receipt payload. `@react-pdf/renderer` renders a single-page PDF in the browser; `UserPaymentActionCell` exposes a Download receipt button gated by status and role.

**Tech Stack:** Next.js 15, React 19, `@react-pdf/renderer`, Vitest, existing `formatMoney` / `formatDate` / payment-coverage helpers.

**Important repo rule:** Do not create branches, worktrees, or git commits unless the user explicitly asks. Treat each task checkpoint as a diff/review, not a commit.

---

## File Structure

- Create `src/helpers/payment-receipt.ts` — payload types, billing period formatter, filename builder, async download entrypoint
- Create `src/helpers/payment-receipt.test.ts` — Vitest for pure helpers
- Modify `src/helpers/authorization.ts` — add `canDownloadPaymentReceipt`
- Create `src/components/finances/payment-receipt-pdf.tsx` — PDF document component (`"use client"`)
- Modify `src/components/datatable/user-payment-action-cell.tsx` — Download receipt button
- Modify `src/components/finances/student-payments-report.tsx` — pass receipt props to action cell
- Modify `package.json` — add `@react-pdf/renderer`

---

### Task 1: Permission helper

**Files:**
- Modify: `src/helpers/authorization.ts`
- Test: `src/helpers/payment-receipt.test.ts` (permission section added in Task 2)

- [ ] **Step 1: Add `canDownloadPaymentReceipt` to authorization**

In `src/helpers/authorization.ts`, after `hasAdminCredentials`:

```ts
export const canDownloadPaymentReceipt = (user: accountType) => {
  if (!user) return false;
  return (
    hasAdminCredentials(user) ||
    (user.roles?.includes(role.finance) ?? false)
  );
};
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run lint`  
Expected: no new errors.

---

### Task 2: Pure receipt helpers (TDD)

**Files:**
- Create: `src/helpers/payment-receipt.ts`
- Create: `src/helpers/payment-receipt.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/helpers/payment-receipt.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { canDownloadPaymentReceipt } from "@/helpers/authorization";
import {
  buildPaymentReceiptFilename,
  formatPaymentReceiptBillingPeriod,
  type PaymentReceiptRowInput,
} from "@/helpers/payment-receipt";
import { role, type accountType } from "@/types/user";

function userWithRoles(roles: role[]): accountType {
  return { id: 1, roles } as accountType;
}

describe("canDownloadPaymentReceipt", () => {
  it("allows admin and finance", () => {
    expect(canDownloadPaymentReceipt(userWithRoles([role.admin]))).toBe(true);
    expect(canDownloadPaymentReceipt(userWithRoles([role.finance]))).toBe(true);
  });

  it("denies teacher and student", () => {
    expect(canDownloadPaymentReceipt(userWithRoles([role.teacher]))).toBe(false);
    expect(canDownloadPaymentReceipt(userWithRoles([role.student]))).toBe(false);
  });
});

describe("buildPaymentReceiptFilename", () => {
  it("uses transaction id when present", () => {
    expect(
      buildPaymentReceiptFilename({ id: 42, transaction_id: "FT123ABC" }),
    ).toBe("receipt-FT123ABC.pdf");
  });

  it("falls back to payment id", () => {
    expect(
      buildPaymentReceiptFilename({ id: 42, transaction_id: null }),
    ).toBe("receipt-payment-42.pdf");
  });
});

describe("formatPaymentReceiptBillingPeriod", () => {
  const base: PaymentReceiptRowInput = {
    billing_start_date: null,
    billing_end_date: null,
    issued_at: null,
    covered_months: [],
  };

  it("lists covered months when explicit rows exist", () => {
    expect(
      formatPaymentReceiptBillingPeriod({
        ...base,
        covered_months: [
          { year: 2026, month_index: 1 },
          { year: 2026, month_index: 2 },
        ],
      }),
    ).toBe("January 2026, February 2026");
  });

  it("uses billing date range when set", () => {
    const result = formatPaymentReceiptBillingPeriod({
      ...base,
      billing_start_date: "2026-01-01T00:00:00.000Z",
      billing_end_date: "2026-01-31T23:59:59.000Z",
    });
    expect(result).toMatch(/2026/);
    expect(result).toContain("–");
  });

  it("falls back to issued_at", () => {
    const result = formatPaymentReceiptBillingPeriod({
      ...base,
      issued_at: "2026-03-15T12:00:00.000Z",
    });
    expect(result).toMatch(/2026/);
  });

  it("returns em dash when no dates", () => {
    expect(formatPaymentReceiptBillingPeriod(base)).toBe("—");
  });
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `npm run test:unit -- src/helpers/payment-receipt.test.ts`  
Expected: FAIL — module `@/helpers/payment-receipt` not found.

- [ ] **Step 3: Implement helpers**

Create `src/helpers/payment-receipt.ts`:

```ts
import { formatDate } from "@/helpers/date";
import { formatMoney } from "@/helpers/money";
import {
  describeInstallmentCoverageDisplay,
  formatMonthLong,
} from "@/helpers/payment-coverage-months";
import type { organizationType } from "@/types/organization";

export type PaymentReceiptRowInput = {
  id: number | string;
  user?: { name?: string | null } | null;
  course?: { title?: string | null } | null;
  transaction_id?: string | null;
  parsed_amount?: string | null;
  payment_method?: { name?: string | null } | null;
  billing_start_date?: string | null;
  billing_end_date?: string | null;
  issued_at?: string | null;
  covered_months?: { year: number; month_index: number }[];
  is_installment?: boolean;
  installment_cumulative_percent?: string | null;
  installment_covered_through?: { year: number; month_index: number } | null;
  remarks?: string | null;
};

export type PaymentReceiptPayload = {
  orgName: string;
  orgLogoUrl: string | null;
  receiptNumber: string;
  receiptDate: string;
  studentName: string;
  courseTitle: string;
  amount: string;
  transactionId: string;
  paymentMethod: string;
  billingPeriod: string;
  installmentNote: string | null;
  remarks: string | null;
  generatedAt: string;
};

export function buildPaymentReceiptFilename(row: {
  id: number | string;
  transaction_id?: string | null;
}): string {
  const tid = row.transaction_id?.trim();
  if (tid) return `receipt-${tid}.pdf`;
  return `receipt-payment-${row.id}.pdf`;
}

export function formatPaymentReceiptBillingPeriod(
  row: PaymentReceiptRowInput,
): string {
  if (row.covered_months && row.covered_months.length > 0) {
    return row.covered_months
      .map((m) => formatMonthLong(m.year, m.month_index))
      .join(", ");
  }
  if (row.billing_start_date && row.billing_end_date) {
    return `${formatDate(row.billing_start_date)} – ${formatDate(row.billing_end_date)}`;
  }
  if (row.issued_at) {
    return formatDate(row.issued_at);
  }
  return "—";
}

export function buildPaymentReceiptPayload(
  row: PaymentReceiptRowInput,
  tenant: Pick<organizationType, "name" | "logo">,
  currencySymbol: string,
): PaymentReceiptPayload {
  const generatedAt = new Date().toLocaleString();
  const receiptDate = row.issued_at
    ? formatDate(row.issued_at)
    : formatDate(new Date().toISOString());

  const installmentNote = row.is_installment
    ? describeInstallmentCoverageDisplay({
        installment_cumulative_percent: row.installment_cumulative_percent,
        installment_covered_through: row.installment_covered_through,
      })
    : null;

  return {
    orgName: tenant.name,
    orgLogoUrl: tenant.logo ?? null,
    receiptNumber: String(row.id),
    receiptDate,
    studentName: row.user?.name?.trim() || "—",
    courseTitle: row.course?.title?.trim() || "—",
    amount: row.parsed_amount
      ? formatMoney(row.parsed_amount, currencySymbol)
      : "—",
    transactionId: row.transaction_id?.trim() || "—",
    paymentMethod: row.payment_method?.name?.trim() || "—",
    billingPeriod: formatPaymentReceiptBillingPeriod(row),
    installmentNote,
    remarks: row.remarks?.trim() || null,
    generatedAt,
  };
}

export async function downloadPaymentReceipt(
  row: PaymentReceiptRowInput,
  tenant: Pick<organizationType, "name" | "logo">,
  currencySymbol: string,
): Promise<void> {
  const { pdf } = await import("@react-pdf/renderer");
  const { PaymentReceiptPdfDocument } = await import(
    "@/components/finances/payment-receipt-pdf"
  );
  const { downloadFile } = await import("@/helpers/file");

  const payload = buildPaymentReceiptPayload(row, tenant, currencySymbol);
  const blob = await pdf(
    PaymentReceiptPdfDocument({ payload }),
  ).toBlob();
  const url = URL.createObjectURL(blob);
  try {
    downloadFile(url, buildPaymentReceiptFilename(row));
  } finally {
    URL.revokeObjectURL(url);
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npm run test:unit -- src/helpers/payment-receipt.test.ts`  
Expected: PASS for permission, filename, and billing period tests (PDF import not exercised yet).

---

### Task 3: PDF document component

**Files:**
- Create: `src/components/finances/payment-receipt-pdf.tsx`
- Modify: `package.json`

- [ ] **Step 1: Install dependency**

Run:

```bash
cd schedjuice-reimagined-fe && npm install @react-pdf/renderer
```

- [ ] **Step 2: Create PDF document**

Create `src/components/finances/payment-receipt-pdf.tsx`:

```tsx
"use client";

import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { PaymentReceiptPayload } from "@/helpers/payment-receipt";

const styles = StyleSheet.create({
  page: {
    padding: 48,
    fontSize: 11,
    fontFamily: "Helvetica",
    color: "#111827",
  },
  header: {
    marginBottom: 24,
  },
  logo: {
    width: 80,
    height: 40,
    objectFit: "contain",
    marginBottom: 8,
  },
  orgName: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 12,
    marginBottom: 16,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  metaLabel: {
    color: "#6B7280",
  },
  section: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: 16,
  },
  row: {
    flexDirection: "row",
    marginBottom: 8,
  },
  label: {
    width: 130,
    color: "#6B7280",
  },
  value: {
    flex: 1,
    fontWeight: "bold",
  },
  footer: {
    position: "absolute",
    bottom: 48,
    left: 48,
    right: 48,
    fontSize: 9,
    color: "#6B7280",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: 12,
  },
});

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

export function PaymentReceiptPdfDocument({
  payload,
}: {
  payload: PaymentReceiptPayload;
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {payload.orgLogoUrl ? (
            // eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf Image has no alt
            <Image src={payload.orgLogoUrl} style={styles.logo} />
          ) : null}
          <Text style={styles.orgName}>{payload.orgName}</Text>
          <Text style={styles.title}>Payment Receipt</Text>
          <View style={styles.metaRow}>
            <Text>
              <Text style={styles.metaLabel}>Receipt # </Text>
              {payload.receiptNumber}
            </Text>
            <Text>
              <Text style={styles.metaLabel}>Date </Text>
              {payload.receiptDate}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <DetailRow label="Student" value={payload.studentName} />
          <DetailRow label="Course" value={payload.courseTitle} />
          <DetailRow label="Amount" value={payload.amount} />
          <DetailRow label="Transaction ID" value={payload.transactionId} />
          <DetailRow label="Payment method" value={payload.paymentMethod} />
          <DetailRow label="Status" value="Verified" />
          <DetailRow label="Billing period" value={payload.billingPeriod} />
          {payload.installmentNote ? (
            <DetailRow label="Installment" value={payload.installmentNote} />
          ) : null}
          {payload.remarks ? (
            <DetailRow label="Remarks" value={payload.remarks} />
          ) : null}
        </View>

        <View style={styles.footer}>
          <Text>
            This receipt confirms a verified payment recorded in {payload.orgName}.
          </Text>
          <Text>Generated at {payload.generatedAt}</Text>
        </View>
      </Page>
    </Document>
  );
}
```

- [ ] **Step 3: Lint**

Run: `npm run lint`  
Expected: no new errors.

---

### Task 4: Wire Download button in action cell

**Files:**
- Modify: `src/components/datatable/user-payment-action-cell.tsx`

- [ ] **Step 1: Extend props and add button**

Update `UserPaymentActionCell` interface and component:

```tsx
interface UserPaymentActionCellProps {
  userPaymentId: string;
  onView: () => void;
  onDuplicateSearch: () => void;
  status: UserPaymentStatus;
  canDownloadReceipt?: boolean;
  onDownloadReceipt?: () => void | Promise<void>;
  isDownloadingReceipt?: boolean;
}
```

Inside the return, after the View button:

```tsx
{canDownloadReceipt && onDownloadReceipt ? (
  <Button
    className="shrink-0"
    type="button"
    variant="outline"
    size="sm"
    isLoading={isDownloadingReceipt}
    disabled={isDownloadingReceipt}
    onClick={() => void onDownloadReceipt()}
  >
    Download receipt
  </Button>
) : null}
```

- [ ] **Step 2: Lint**

Run: `npm run lint`  
Expected: no new errors.

---

### Task 5: Connect Student Payments report

**Files:**
- Modify: `src/components/finances/student-payments-report.tsx`

- [ ] **Step 1: Import helpers**

Add imports:

```tsx
import { canDownloadPaymentReceipt } from "@/helpers/authorization";
import { downloadPaymentReceipt } from "@/helpers/payment-receipt";
```

- [ ] **Step 2: Add download state in `StudentPaymentsReport`**

Near other `useState` hooks:

```tsx
const [downloadingReceiptId, setDownloadingReceiptId] = useState<
  number | string | null
>(null);
```

- [ ] **Step 3: Add handler**

Inside `StudentPaymentsReport`:

```tsx
const handleDownloadReceipt = async (row: StudentPaymentAdminReportRow) => {
  if (!tenant) return;
  setDownloadingReceiptId(row.id);
  try {
    await downloadPaymentReceipt(row, tenant, currencySymbol);
  } catch {
    toast({
      variant: "destructive",
      title: "Could not generate receipt",
      description: "Please try again.",
    });
  } finally {
    setDownloadingReceiptId(null);
  }
};
```

- [ ] **Step 4: Pass props to `UserPaymentActionCell`**

In the Screenshot column cell where `UserPaymentActionCell` is rendered:

```tsx
<UserPaymentActionCell
  status={row.original.status}
  onView={() => setViewImageUrl(row.original.screenshot)}
  onDuplicateSearch={() => { /* existing */ }}
  userPaymentId={String(row.original.id)}
  canDownloadReceipt={
    row.original.status === UserPaymentStatus.verified &&
    !!user &&
    canDownloadPaymentReceipt(user)
  }
  onDownloadReceipt={() => handleDownloadReceipt(row.original)}
  isDownloadingReceipt={downloadingReceiptId === row.original.id}
/>
```

- [ ] **Step 5: Lint and unit tests**

Run:

```bash
npm run lint
npm run test:unit -- src/helpers/payment-receipt.test.ts
```

Expected: PASS.

---

### Task 6: Manual verification

- [ ] **Step 1: Start dev server and smoke-test**

Run: `npm run dev`

Manual checklist:

1. Log in as admin → open `/finances/student-payments` → find a **verified** row → click **Download receipt** → PDF downloads with correct fields.
2. Non-verified row → no Download receipt button.
3. Log in as finance-only user (if available) → button visible on verified rows.
4. Log in as teacher → button not visible.
5. Open `/courses/{id}/student-payments` → same behavior on verified row.

- [ ] **Step 2: Production build check**

Run: `npm run build`  
Expected: build succeeds (dynamic import avoids SSR issues with `@react-pdf/renderer`).

---

## Plan self-review

| Spec requirement | Task |
|---|---|
| Verified-only button | Task 5 Step 4 |
| Admin + finance permission | Tasks 1, 5 |
| Client-side PDF | Tasks 2, 3 |
| Receipt field content | Task 3 |
| Billing period rules | Task 2 |
| Error toast | Task 5 Step 3 |
| All StudentPaymentsReport surfaces | Task 5 (shared component) |
| Out of scope items | Not included |

No placeholders remain. Type names (`PaymentReceiptRowInput`, `PaymentReceiptPayload`) are consistent across tasks.

---

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-06-13-student-payment-receipt.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — implement tasks in this session with checkpoints

Which approach would you like?
