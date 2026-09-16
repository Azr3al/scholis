# Student Payment Receipt Download

**Date:** 2026-06-13  
**Status:** Approved (design) — implementation plan written  
**Scope:** `schedjuice-reimagined-fe` — Student Payments report (`StudentPaymentsReport`)

## Problem

Finance staff use the Student Payments page to review and verify student bank transfers. Once a payment is **verified**, they sometimes need to issue an official receipt to the student or parent. Today the page only supports **viewing the uploaded bank screenshot** — there is no way to download a formatted receipt document with payment details.

## Decisions (locked during brainstorming)

| Question | Decision |
|---|---|
| Receipt type | **Generated document** with structured payment details (not the bank screenshot) |
| Availability | **Verified payments only** |
| Who can download | **Admin and finance** — not teachers |
| Where | **Student Payments** surfaces that render `StudentPaymentsReport` |
| Output format | **PDF** downloaded client-side |
| Backend | **None in v1** — data already on admin-report rows |

## Architecture

Client-side PDF generation using `@react-pdf/renderer`. Row data from `StudentPaymentAdminReportRow` plus org branding from `useTenant()` is mapped into a single-page A4 PDF and downloaded via the existing `downloadFile()` helper.

```
StudentPaymentsReport (Screenshot column)
  └─ UserPaymentActionCell
       └─ downloadPaymentReceipt()
            ├─ buildPaymentReceiptPayload(row, tenant, currencySymbol)
            ├─ PaymentReceiptPdfDocument (@react-pdf/renderer)
            └─ pdf().toBlob() → downloadFile()
```

**Permission gate** (new helper):

```ts
canDownloadPaymentReceipt(user) =>
  hasAdminCredentials(user) || user.roles includes role.finance
```

Note: The existing Screenshot column uses `hasAdminCredentials` only (superadmin, admin, manager) and **excludes finance-only users**. Receipt download intentionally includes the **finance** role per product decision.

## UX

### Button placement

Add **Download receipt** in the Screenshot column action cluster (alongside View / Delete / See duplicates), inside or adjacent to `UserPaymentActionCell`.

### Visibility

- Render only when `row.status === UserPaymentStatus.verified`
- Render only when `canDownloadPaymentReceipt(user)`
- Hidden for synthetic rows (same guard as other row actions)
- Applies on:
  - `/finances/student-payments`
  - `/courses/[id]/student-payments`
  - `/finances/student-payments/transaction-lookup`

### Interaction

1. User clicks **Download receipt**
2. Button shows loading state while PDF blob is generated
3. Browser downloads `receipt-{transactionId}.pdf` when transaction ID exists, else `receipt-payment-{id}.pdf`
4. On failure: destructive toast — *"Could not generate receipt. Please try again."*

No disabled button with tooltip for non-verified rows — button is simply not shown.

## Receipt content

Single-page A4 PDF. Clean, printable layout. **Does not embed the bank screenshot.**

### Header

- Organization logo (`tenant.logo`) when available; omit if missing or fails to load
- Organization name (`tenant.name`)
- Title: **Payment Receipt**
- Receipt #: payment ID (`row.id`)
- Receipt date: `issued_at` formatted; fallback to generation date if missing

### Payment details

| Label | Source |
|---|---|
| Student | `row.user.name` |
| Course | `row.course.title` |
| Amount | `parsed_amount` via `formatMoney` + tenant currency symbol |
| Transaction ID | `row.transaction_id` |
| Payment method | `row.payment_method.name` |
| Status | **Verified** (fixed) |
| Billing period | See formatting rules below |
| Installment | `describeInstallmentCoverageDisplay(...)` when `row.is_installment` |
| Remarks | `row.remarks` when present |

### Billing period formatting

Mirror the Student Payments table:

1. If `covered_months` is non-empty: comma-separated month labels via `formatMonthLong(year, month_index)`
2. Else if both `billing_start_date` and `billing_end_date`: `{formatDate(start)} – {formatDate(end)}`
3. Else if `issued_at`: `formatDate(issued_at)`
4. Else: `—`

### Footer

- *"This receipt confirms a verified payment recorded in {org name}."*
- Generated at: local timestamp when PDF is created

## Components & files

| File | Responsibility |
|---|---|
| `src/helpers/payment-receipt.ts` | Payload mapping, filename, billing period text, download orchestration |
| `src/helpers/payment-receipt.test.ts` | Unit tests for pure helpers |
| `src/helpers/authorization.ts` | Add `canDownloadPaymentReceipt` |
| `src/components/finances/payment-receipt-pdf.tsx` | `@react-pdf/renderer` document (client component) |
| `src/components/datatable/user-payment-action-cell.tsx` | Download button + loading |
| `src/components/finances/student-payments-report.tsx` | Pass receipt context into action cell |
| `package.json` | Add `@react-pdf/renderer` |

## Error handling

| Case | Behavior |
|---|---|
| Missing student/course name | Show `—` for that field; still generate PDF |
| Missing amount / transaction ID | Show `—`; still generate PDF |
| Logo fetch/CORS failure | Omit logo; still generate PDF |
| PDF render throws | Toast error; reset button loading state |

## Testing

**Unit (Vitest):**

- `canDownloadPaymentReceipt` for admin, finance, teacher, student
- `buildPaymentReceiptFilename` with and without transaction ID
- `formatPaymentReceiptBillingPeriod` for covered months, date range, issued_at fallback

**Manual QA:**

- Verified row → download works; PDF fields match table
- Non-verified row → no button
- Finance-only user → can download
- Teacher → cannot see button
- Course-scoped student-payments page → same behavior

## Out of scope (v1)

- Student self-service on Payment History
- Bulk / batch receipt download
- Backend PDF endpoint or stored receipt records
- Email / send receipt
- Per-org receipt templates
- Downloading the raw bank screenshot (separate feature)
