# Admissions attending payment card and People names — Design Spec

> Officers looking up a student in Admissions should see the latest payment as Finance recorded it (status, uploader, remarks, explicit covered months), not a verified-only row labeled “Automatic.” The People table should show legal name and alt name together.

**Status:** Design approved (decisions locked), ready for implementation plan.
**Authority:** [`schedjuice-reimagined-fe/DESIGN.md`](../../../schedjuice-reimagined-fe/DESIGN.md). Amends Admissions workspace (`2026-08-17-admissions-workspace-design.md` decisions 12 and 15, attending payload, attending copy).
**Date:** 2026-08-19
**Repos:** `schedjuice-reimagined-fe`, `schedjuice-reimagined-be`

---

## 1. Problem

The attending class card was built as “last verified payment.” Period often shows **—** because the UI only formats explicit `covered_months` and those rows are empty. **Verified by: Automatic** is the fallback when `verified_by` is null, which reads as if the system verified the payment. Finance admin remarks never appear. The People Name column prefers `alternative_name` and hides the legal name.

Officers need the latest payment of any status, honest status/uploader, remarks when present, covered months only when they exist, and both names in the list.

---

## 2. Goals & non-goals

### Goals

1. Each attending class shows the **latest** `UserPayment` part for that user+course, **any status**.
2. Period shows **explicit covered months** only (existing receipt formatter). Empty → **—**.
3. Show finance **Remarks** as **Notes**, omitted when empty.
4. Replace **Verified by** with **Status** (Finance enum as-is) and **Uploaded by** (`created_by`).
5. Date is `payment_date`.
6. People Name cell: legal `name`, plus muted `alternative_name` on a second line when it is non-blank and different.

### Non-goals

- Person panel header name (email / phone / Active unchanged).
- Implicit covered months from `issued_at` or billing-date fallbacks.
- Finance verify, upload, edit, or widening Finance APIs.
- Changing People search, sorts, or the attending class set (active / paused / planned students only).
- Status chips, collapsed status buckets, or new copy for Finance enums.

---

## 3. Locked decisions

| # | Topic | Choice |
| --- | --- | --- |
| 1 | Which payment | Latest part for user+course, any status, ordered by `-id`. |
| 2 | Period | Explicit `UserPaymentCoveredMonth` rows only. Else **—**. |
| 3 | Notes | Payment `remarks`. Omit the row when null/blank. |
| 4 | Verified by | Removed. No “Automatic.” |
| 5 | Status | Raw `UserPayment.status` (same strings as Student Payments). Ink text, no chip. |
| 6 | Uploaded by | `created_by` `{ id, name }`. Null → **—**. |
| 7 | Date | `payment_date`. Null → **—**. |
| 8 | Amount / receipt / screenshot | Unchanged (`actual_amount`, `PaymentReceipt.number`, existing screenshot URL rule). |
| 9 | Empty class | **No payment** (was “No verified payment”). |
| 10 | Name cell | One column. Line 1: `name`. Line 2: muted alt if non-blank and ≠ `name`. |
| 11 | Approach | Amend `GET .../attending` in place. Rename `last_verified_payment` → `latest_payment`. Drop `verified_at` / `verified_by`. |

---

## 4. User experience

### 4.1 Attending card

One card per attending class. Course title unchanged.

```
FCE Reading and Writing
Date          Jul 7th 2026
Amount        150000.0000
Receipt       —
Period        July 2026
Notes         Paid in two transfers
Status        pending_verification
Uploaded by   Aye Aye
Screenshot    View screenshot
```

- **Period:** `formatPaymentReceiptBillingPeriod({ covered_months })` only. Do not pass billing dates or `issued_at`.
- **Notes:** Render only when `remarks` is non-blank after trim. Label **Notes**.
- **Status:** enum value as stored (`pending_verification`, `verified`, `amount_mismatch`, …).
- **Uploaded by:** `created_by.name`, else **—**.
- Screenshot: existing read-only viewer. No upload.
- `latest_payment` null: **No payment**. Class title still listed.

### 4.2 People table Name

Same Name column, still the row select control.

```
Maung Maung
aung aung
```

No second line when alt is empty, whitespace-only, or equal to `name` (trim, case-sensitive equality is enough). Search/sort unchanged.

---

## 5. Architecture

### 5.1 Endpoint

`GET /api/v1/admissions/people/:id/attending` remains the only payment read. Still `admissions.view`. People search already returns `name` and `alternative_name`; no search contract change.

Selection: newest `UserPayment` with `user_id` + `course_id`, no status filter, `order_by("-id")`. Prefetch `receipt`, `created_by`, `covered_months`, `group` / `group__parts` (screenshot sibling rule unchanged). Multi-course groups still contribute only the part for this class.

### 5.2 Payload

Replace `last_verified_payment` with:

```
latest_payment: null | {
  payment_date,
  amount,                 // actual_amount, existing money JSON
  receipt_number,         // PaymentReceipt.number; not payment PK
  covered_months,         // [{ year, month_index }, ...]; [] if none
  status,                 // UserPayment.status
  created_by: null | { id, name },
  remarks,                // string or null
  screenshot              // URL or null
}
```

Do not emit `verified_at` or `verified_by`. Do not invent covered months from `issued_at`.

### 5.3 Frontend

- `use-admissions-attending.ts`: type + field rename.
- `person-attending-panel.tsx`: card fields as in §4.1.
- `admissions-people-page.tsx`: Name cell as in §4.2.

---

## 6. Error handling & empty states

| State | Behavior |
| --- | --- |
| No payments on the class | **No payment** |
| Empty `covered_months` | Period **—** |
| Empty `remarks` | Notes row not rendered |
| `created_by` null | Uploaded by **—** |
| `payment_date` null | Date **—** |
| Attending 404 / load error | Unchanged (**Person not found** / **Could not load classes.**) |
| Extra serializer fields | Ignored; frozen allowlist |

No new permissions. Screenshot writes stay on Finance.

---

## 7. Testing

High-value only. No “renders People” smoke.

**Backend**

- Latest any-status wins by `-id` (pending newer than verified is the card payment).
- Class with no payments → `latest_payment` is `null`.
- `status` and `created_by` serialize; `created_by` null stays `null`.
- `covered_months` is the junction list; no rows → `[]`.
- `remarks` is the string or `null`.
- `receipt_number` is the receipt entity number, not payment PK.
- Keep planned included, ended excluded, admissions-only 200, teacher 403, unknown person 404.
- Replace `test_unverified_ignored_latest_verified_wins` and `test_verified_by_null_serializes_null`.

**Frontend**

- Card has no “Automatic”; shows Status and Uploaded by.
- Notes absent when remarks empty; present when set.
- Period **—** when `covered_months` is empty.
- **No payment** when `latest_payment` is null.
- Name cell: legal + muted alt; no second line when alt blank or equal to name.

---

## 8. Out of scope follow-ups

- Two-line name in the person panel header.
- Backfilling implicit covered months onto junction rows.
- Listing more than one payment per class.
