# Client Payment Receipt Device Consistency

**Date:** 2026-07-21  
**Status:** Approved (design)  
**Scope:** `schedjuice-reimagined-fe` only  
**Related:** [2026-07-21-student-payment-receipt-enhancements-design.md](./2026-07-21-student-payment-receipt-enhancements-design.md), [2026-06-13-student-payment-receipt-design.md](./2026-06-13-student-payment-receipt-design.md)

## Problem

Student payment receipts are generated client-side with `@react-pdf/renderer`. That raises a fair question: can PDF dimensions and behavior differ by device (phone vs desktop, Safari vs Chrome)?

**Page size / layout:** With the current stack, **no meaningful dimension drift**. Receipts use `Page size="A4"` and Helvetica; layout runs through Yoga/PDFKit, not the browser CSS viewport. Phone vs desktop should not produce a smaller or differently sized page for the same payload.

**What can still vary today:**

| Area | Current risk |
|---|---|
| Clock / date strings | `generatedAt` uses `new Date().toLocaleString()` (browser locale + timezone) |
| `receiptDate` fallback | Uses `formatDate` without tenant timezone |
| Logo | Failed/slow remote logo can break or skew generation |
| Download UX | Shared `downloadFile` uses `<a download target="_blank">`, which is flaky on some mobile browsers |

## Decisions (locked)

| Question | Decision |
|---|---|
| Architecture | **Approach 1** — harden client generation (keep `@react-pdf/renderer`; no server PDF) |
| Date language | Fixed English date tokens (`date-fns` / English patterns) |
| Timezone | Tenant `organization.timezone`; missing → `"UTC"` |
| Hardening scope | Timezone formatting + logo resilience + download UX |
| Surfaces | Receipt helpers + shared `downloadFile` (ID cards inherit download only) |
| Logo failure UX | Silent fallback to text-only header; no logo-only toast |
| Out of scope | Server PDF, ID-card timezone/logo, org language locale, A4/Helvetica changes, bit-identical PDF guarantees |

## Architecture

```
tenant { name, logo, timezone }
        │
        ▼
buildPaymentReceiptPayload / buildGroupPaymentReceiptPayload
  • generatedAt / receiptDate → en-US patterns in tenant TZ
  • orgLogoUrl from tenant.logo
        │
        ▼
downloadPaymentReceipt / downloadGroupPaymentReceipt
  • resolveLogoForPdf(url) → url | null
  • pdf().toBlob()
  • downloadFile(objectUrl, filename)   ← hardened shared helper
```

No new backend endpoints. Page size remains A4.

### Call sites

Grid, ResourceTable, and Payment History already pass `tenant` into download helpers. Expand the tenant pick type from `name | logo` to include `timezone` and pass `tenant.timezone` through.

## Date / time formatting

| Field | Rule |
|---|---|
| `generatedAt` | `formatInTimeZone(now, tz, "MMM d, yyyy, h:mm a zzz")` |
| `receiptDate` | Date-only in tenant TZ: `formatInTimeZone(..., "MMM d, yyyy")`. Source is `issued_at` when present, else `now`. |
| Language | English only — not browser locale |
| Missing timezone | `"UTC"` |
| Billing period / month names | Unchanged (`formatMonthLong`; not clock-TZ dependent) |
| Money | Unchanged (`formatMoney` + currency symbol) |

Implementation: small pure helper in the receipt module (wraps `date-fns-tz`). Unit-test with a fixed instant under `Asia/Rangoon` vs `UTC`.

## Logo resilience (receipts only)

Before `pdf().toBlob()`:

1. Empty / missing logo URL → `orgLogoUrl: null` (text-only header).
2. Otherwise probe with an `Image()` load and a short timeout (confirms the URL is usable as an image, not just reachable).
3. On failure, CORS error, or timeout → set `orgLogoUrl: null` and still generate the PDF (org name remains).
4. Do not toast for logo-only failure; keep existing destructive toast only when PDF generation or download fails.

## Shared `downloadFile`

Keep signature `(url: string, filename: string)` so ID cards, CSV export, and other callers keep working without API churn.

- Create anchor, set `download` + `href`, append to `body`, `.click()`, remove.
- Drop `target="_blank"` when using `download` (reduces Safari/iOS “open tab instead of save” quirks).
- Callers that create object URLs continue to own revoke timing (receipts already revoke in `finally` after click).
- No new options bag in this pass.

## Errors

| Case | Behavior |
|---|---|
| `pdf().toBlob` / download failure | Existing destructive toast (*Could not generate receipt…*) |
| Logo probe failure | Silent; text-only header |
| Invalid / missing timezone | `"UTC"`; no throw |
| `downloadFile` itself | Best-effort; no new user-facing errors from the helper |

## Testing

- Unit: `generatedAt` / `receiptDate` with fixed `Date` + `Asia/Rangoon` vs `UTC` (assert independence from browser TZ).
- Unit: logo resolver returns `null` for empty URL / failed load; returns URL when probe succeeds.
- Unit: existing receipt payload tests updated to pass `timezone`.
- Manual smoke: desktop Chrome + one mobile Safari download.
- No visual PDF snapshot tests required.

## Out of scope

- Server-side PDF generation
- ID card timezone or logo probing
- Tenant language / locale settings beyond timezone
- Changing A4 page size or Helvetica
- Guaranteeing bit-identical PDF bytes across devices (layout engine is already device-stable; this pass hardens clocks, logo, and download)
