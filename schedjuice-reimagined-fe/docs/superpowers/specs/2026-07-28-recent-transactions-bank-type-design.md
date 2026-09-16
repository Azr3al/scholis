# Recent Transactions — Bank Type Filter & Column

**Date:** 2026-07-28  
**Status:** Approved for planning  
**Surface:** `/finances/recent-transactions` — ResourceTable and Glide (`StudentPaymentsGrid` `variant="recent-transactions"`)  
**Approach:** Shared filter builder + thin toolbar component (Approach 2)

## Summary

Add a **multi-select bank type filter** and a read-only **Bank** column to the recent-transactions page. Bank type comes from the related payment method (`payment_method.payment_bank`). Both filter and column are shown only for tenants whose `transaction_screenshot_strategy` is **not** `user_upload` (same visibility gate as the existing Payment Account column).

## Confirmed decisions

| Topic | Decision |
|-------|----------|
| Filter cardinality | Multi-select (e.g. CB + KPay at once) |
| Filter operator | `in` with comma-separated values (`"CB,KPAY"`) |
| Column visibility | Non–`user_upload` tenants only |
| Filter visibility | Same as column — non–`user_upload` only |
| Scope | Bank type only — no other filters/columns in this change |
| Column placement | After **Payment Account**, before **Date on Screenshot** |
| Column header | `Bank` (matches `/payment-methods`) |
| Display labels | Raw `PaymentBank` enum strings (`KBZ`, `KPAY`, `CB`, …) |
| Backend | No API, model, or migration changes |

## Goals / non-goals

**Goals**

- Let finance filter recent transactions by one or more payment banks.
- Show bank type alongside payment account name for non–`user_upload` tenants.
- Keep filter param logic in one shared builder used by both table views.

**Non-goals**

- Bank filter/column for `user_upload` tenants
- Replacing or removing the Payment Account column
- URL persistence of bank filter (matches existing recent-transactions filter behavior)
- Syncing filter state when toggling ResourceTable ↔ Glide (existing local-state behavior)
- New backend endpoints or stored fields on `UserPayment`
- Sorting by bank type

## Architecture

```
RecentTransactionsPage (ResourceTable)          StudentPaymentsGrid (Glide)
        │                                                  │
        ├─ PaymentBankMultiSelectFilter                    ├─ PaymentBankMultiSelectFilter
        │     (MultiSelectPopOver + PaymentBank options)   │     (same component)
        │                                                  │
        └─ buildRecentTxnFilterParams({ paymentBanks }) ◄──┘
                    │
                    ▼
        POST user-payments/search
        filter_params: [{
          field_name: "payment_method__payment_bank",
          operator: "in",
          value: "CB,KPAY"
        }]
                    │
                    ▼
        UserPayment.payment_method.payment_bank → column "Bank"
```

### Lofi — filter toolbar (non–`user_upload`)

```
[ Transaction ID ] [ Date ] [ Course ▾ ] [ Status ▾ ] [ Bank (2) ▾ ]
[ Search ] [ Clear ]
```

`Bank (2)` opens multi-select popover with all `PaymentBank` values and a “Select all” row (existing `MultiSelectPopOver` behavior).

### Lofi — column order (non–`user_upload`)

```
| Student | Course | … | Payment Account | Bank | Date on Screenshot | … |
| Ada     | Math 1 | … | CB Main         | CB   | 2026-07-15         | … |
| Bob     | Eng 2  | … | KPay Wallet     | KPAY | 2026-07-14         | … |
| Carol   | Sci 3  | … | —               | —    | 2026-07-13         | … |  ← no payment method
```

## Components & files

| File | Change |
|------|--------|
| `schedjuice-reimagined-fe/src/lib/finances/build-recent-txn-filter-params.ts` | **New** — extract `buildRecentTxnFilterParams` from grid; add optional `paymentBanks?: PaymentBank[]` |
| `schedjuice-reimagined-fe/src/lib/finances/build-recent-txn-filter-params.test.ts` | **New** — unit tests for bank `in` filter emission |
| `schedjuice-reimagined-fe/src/components/finances/payment-bank-multi-select-filter.tsx` | **New** — toolbar wrapper around `MultiSelectPopOver` with static `PaymentBank` options |
| `schedjuice-reimagined-fe/src/app/(internal)/finances/recent-transactions/page.tsx` | Bank filter state, wire filter UI, extend inline `filterParams` memo, add Bank column, request `payment_method.payment_bank` |
| `schedjuice-reimagined-fe/src/lib/finances/recent-transactions-column-meta.ts` | Add `payment_method__payment_bank` layout meta after `payment_method__name` |
| `schedjuice-reimagined-fe/src/components/finances/student-payments-grid.tsx` | Import shared builder; bank filter state for recent variant; Bank column + cell renderer; request `payment_method.payment_bank` |

## Filter behavior

**State:** `selectedBanks: PaymentBank[]` (empty = no filter).

**API param** (when `selectedBanks.length > 0`):

```json
{
  "field_name": "payment_method__payment_bank",
  "operator": "in",
  "value": "CB,KPAY"
}
```

**Options:** All values from `PaymentBank` enum in `types/finance.ts`: `KBZ`, `KPAY`, `UAB`, `CB`, `AYA`, `YOMA`, `CASH`, `MOB`.

**Clear:** Reset `selectedBanks` to `[]` along with other filters.

**Membership-scoped users** (`isPaymentMembershipScoped`): Selected banks count toward the “at least one filter required” gate (same as transaction ID, date, course, status).

**Visibility gate:**

```ts
tenant.transaction_screenshot_strategy !== TransactionScreenshotStrategy.user_upload
```

## Column behavior

**Accessor:** `row.payment_method?.payment_bank ?? "—"`

**Editable:** No — read-only text column.

**Glide:** Add `{ id: "payment_method__payment_bank", title: "Bank", width: 100 }` after `payment_method__name`; render plain text in cell handler.

**ResourceTable:** `column.text` with same accessor; layout meta `contentRole: "prose"`, `minWidth: "5rem"`.

## Data fetching

Add `payment_method.payment_bank` to `fields` on both list queries. `expand: ["payment_method", …]` is already present — no expand change required.

## Edge cases

| Case | Behavior |
|------|----------|
| No payment method on row | Column shows `—`; row excluded when any bank filter is active |
| `user_upload` tenant | No bank filter UI, no Bank column (unchanged layout) |
| All banks selected | Equivalent to no filter — **do not** emit `in` param (avoid redundant full-list filter) |
| Empty selection | No bank filter param |

## Testing

High-value only:

- **FE unit:** `buildRecentTxnFilterParams` — emits `payment_method__payment_bank` + `in` when banks passed; omits when empty; comma-joins multiple values.
- **FE unit (optional):** `recentTransactionsColumnLayout` — `payment_method__payment_bank` follows `payment_method__name` when `userUploadStrategy: false`; absent when `true`.

No happy-path “filter renders” smoke tests. No backend changes unless an existing search test file already covers nested `in` filters and needs one case added.

## Out of scope

- Bank type on `user_upload` tenants
- Payment account name filter
- URL/query-param persistence for bank selection
- Shared filter toolbar refactor across all recent-transactions views
- Custom display names for banks (e.g. “KPay” vs `KPAY`)
