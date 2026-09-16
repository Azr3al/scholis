# Fee lifecycle Sankey — design

Date: 2026-09-13
Status: approved (revised same day — drop Expected; match homepage pie payment set)

## Problem

The finance workspace shows *where money is* (stat cards, daily collections line, status pie) but not *where money went*. Staff cannot see, in one view, how much of billed fees was given away as discounts, how much is stuck in the verification pipeline versus genuinely unpaid, and how much came back out as refunds.

A Sankey diagram answers this: one balanced flow from billed fees to retained cash, with every leak visible. Band click-through is deferred (see Out of scope).

## Key constraint: no status history

`UserPayment.status` (`app_finance/models.py:297`) is **overwritten in place**. There is no `django-simple-history`, no `StatusHistory` table, and no transition log. `OcrExtractionEvent` (`app_ai/models.py:212`) is the only append-only trail and covers OCR attempts only.

Therefore this feature is a **money-flow snapshot**, not a transition-history diagram. Band widths are currency amounts derived from columns that exist today. A true "how many fees moved from A to B over time" diagram would require building an audit table first and waiting for data to accumulate; that is explicitly out of scope.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Weighting | Currency amounts | Money flow is the question being asked; counts appear in tooltips |
| Period basis | Homepage pie queryset (`verified_at`, else `issued_at`) | Same rows as Cash received / pie so pre-payments appear; coverage months hide early payers |
| Expected / not-yet-billed | **Omitted** | Estimate is a different kind of money (`PaymentPlan.price` × unpaid enrollments) and dwarfs recorded bands on a proportional chart |
| Payment methods | Optional fan-out on **Retained**, off by default | A dimension of arrived cash, not a lifecycle stage. Must fan from Retained, not Collected: Collected already flows entirely into Retained + Refunded, so extra links off Collected would make its outflow exceed its value. |
| Placement | Section on `/finances`, between stat cards and charts | Reuses existing filters; no new page or route |
| Permission | `payment.view_all` OR `analytics.view` | School-wide totals; a scoped partial Sankey would mislead |
| Rendering | `d3-sankey` for layout, own SVG | Recharts 2.15 has no Sankey; ~10KB, full control over hatching and semantic colors |
| Backend | New `POST finance/fee-lifecycle` | Independent permission gate; heavier query must not delay existing cards |
| Naming conflict | Relabel, don't realign | Zero change to numbers finance staff already rely on |

### Period basis: same rows as the pie

This chart sits on `/finances` under the same Program / Intake / period filters as Cash received and the status pie. Selecting an intake means **this cohort's courses**, not "calendar months inside a window clamped to today."

Reuse `homepage_services._pie_payments_qs` with the same start-date rule as the homepage:

| Filter | Start datetime | End datetime |
|---|---|---|
| `intake_range` (single intake) | **None** (open start) | End of `min(intake.end_date, today)` |
| Month presets / custom / all time | Start of resolved bounds | End of resolved bounds |

Row rule (copied from the pie, not invented):

- If `verified_at` is set: include when it falls in `(start, end]` (`start` unbounded for intake).
- Else: include when `issued_at` falls in that window.

Coverage rows (`UserPaymentCoveredMonth`) do **not** select rows for this chart. A September pre-payment for an October–March course is in September (and in any rolling window that includes September, and on the intake view). That is true for intake-based programs and for manual / ad-hoc schedules.

`resolve_period_bounds` still supplies `meta.period_label` / `date_from` / `date_to`. For a future intake those dates collapse to today; the **payment query** must not use that collapsed window as a coverage filter, or billed is empty while Cash received is not.

Do not change existing homepage aggregations. The Unpaid card remains coverage-based and can disagree with this chart; the Sankey must agree with Cash received / the pie, not with Unpaid.

### Why not Expected revenue

Expected was `billed + PaymentPlan` estimate for enrollments with no covering payment. The estimate is not ledger money, and at this school it is routinely larger than billed (including treating unattributed payers as unpaid). A proportional Sankey then collapses the recorded lifecycle to hairlines.

Coverage is a separate question ("are we billing everyone?") and does not belong on this flow. No coverage KPI on this section.

### The naming conflict

The existing "Collected" stat card counts cash by `verified_at` (`app_finance/homepage_services.py:232-243`). The Sankey's "Collected" band is the verified slice of the **same pie queryset**, using `invoiced_amount` rather than `actual_amount`. Card vs band can still differ by over/under-payment variance; they no longer differ by period join.

Stat card stays **"Cash received"**. Section title **"Fee lifecycle"**. Subtitle states that payment dates match Cash received and the pie.

## The graph

```
  BILLED          NET INVOICED       SETTLEMENT         OUTCOME
  ┌────────┐
  │ Billed │═══▶ Discounts given
  │        │      ┌──────────┐
  │        │══════│   Net    │═══▶ Collected ═╦═▶ Retained
  └────────┘      │ invoiced │                ╚═▶ Refunded
                  │          │──▶ In verification
                  │          │──▶ Awaiting payment
                  └──────────┘──▶ Stuck
```

Root node is **Billed**. There is no Expected / Not yet billed hop.

### Link derivation

All queries scoped to the selected program's courses and the pie payment set above.

| Link | Amount |
|---|---|
| Billed → Discounts given | `SUM(UserPayment.discount_amount)` |
| Billed → Net invoiced | `SUM(UserPayment.invoiced_amount)` |
| Net invoiced → Collected | `SUM(invoiced_amount)` where `status = verified` |
| Net invoiced → In verification | `pending_verification`, `awaiting_extraction`, `awaiting_metadata_extraction` |
| Net invoiced → Awaiting payment | `pending_payment` |
| Net invoiced → Stuck | `amount_mismatch`, `duplicated`, `cannot_extract` |
| Collected → Refunded | `SUM(PaymentAdjustment.amount)` where `kind = refund` |
| Collected → Retained | Collected − Refunded |

The Billed split is exact by construction: `discount_engine` enforces `base_amount - discount_amount == invoiced_amount`. All eight `UserPayment.Status` values are assigned to exactly one settlement band, so the Net invoiced split is exhaustive and non-overlapping.

### Amount basis: `invoiced_amount`, not `actual_amount`

Band widths use `invoiced_amount`. The homepage uses `actual_amount` with a `parsed_amount` fallback (`homepage_services._amount_from_row`), which is truer to the bank but breaks the balance: an overpayment would make Collected exceed Net invoiced and render a link wider than its source.

Cash reality surfaces in the tooltip instead: `Collected 610,000 · cash received 612,400 (+2,400 variance)`. `meta.cash_received` carries the `actual_amount` sum for this purpose.

### Refunds

Only `PaymentAdjustment.Kind.REFUND` reduces Retained. `RE_TRANSFER` is money re-sent, not returned, and counting it would double-subtract. Refunds are attributed to the cohort of the payment they belong to, not to `occurred_at`, keeping the cohort basis consistent.

Only adjustments whose parent `UserPayment` falls in the Collected band count — a refund against a non-verified payment would otherwise draw a link out of a node that never received it.

The refunded total is clamped to the Collected total. `PaymentAdjustment.amount` is not constrained against `invoiced_amount`, so an over-refund could otherwise render Refunded wider than its source. When clamping occurs, the tooltip reports the true refunded figure alongside the clamped band, and the response sets `meta.refund_clamped = true`.

### Unattributed band

A payment with **both** `verified_at IS NULL` and `issued_at IS NULL` cannot enter the pie queryset under any period. Coverage rows do not rescue it.

This state is reachable today: the admin-upload parser returns `None` for a missing datetime without recording a validation error (`app_finance/views.py:1699-1707`), unlike `_parse_decimal_field` which does mark amounts required.

Rendering: a detached warning under the diagram showing amount and payment count. Computed across the program's courses **irrespective of period**. Cleanup worklist, not part of the flow arithmetic.

## Backend

Endpoint `POST finance/fee-lifecycle`, registered in `app_finance/urls.py`. Permission: `payment.view_all` OR `analytics.view`.

Aggregation lives in `app_finance/fee_lifecycle_services.py`, not in `homepage_services.py`. Reuse `_pie_payments_qs` / `resolve_period_bounds`; do not call `aggregate_not_yet_billed` (deleted). Do not use `month_visibility_q` to select Sankey rows.

**Course scope is program/intake only — do not call `scope_courses_for_user`.** Homepage uses that helper because teachers can open it. This endpoint is school-wide (`payment.view_all` OR `analytics.view`); applying membership scoping would silently shrink totals for a custom role that has analytics but not `course.view_all`. Filter `Course.objects.filter(program_id=..., intake_id=...)` with no user scoping.

### Request

Mirrors `FinanceHomepageRequest` plus a breakdown selector:

```json
{
  "program_id": 3,
  "intake_id": null,
  "period": "last_3_months",
  "date_from": null,
  "date_to": null,
  "breakdown": "none"
}
```

`breakdown` is one of `none` | `payment_method` | `bank`. `period` reuses the existing `FinanceHomepagePeriod` values.

### Response

A node/link graph, so the frontend hands it to `d3-sankey` without reshaping. Amounts are decimal strings, matching the existing `UsdDecimalString` convention.

```json
{
  "nodes": [
    { "key": "billed", "label": "Billed", "amount": "1000000.00", "is_estimated": false }
  ],
  "links": [
    { "source": "billed", "target": "net_invoiced", "amount": "820000.00",
      "payment_count": 412, "student_count": 388, "is_estimated": false }
  ],
  "unattributed": { "amount": "4200.00", "payment_count": 12 },
  "meta": {
    "period_label": "Last 3 months",
    "date_from": "2026-06-01",
    "date_to": "2026-08-31",
    "cash_received": "612400.00",
    "refund_clamped": false
  }
}
```

`expected` and `not_yet_billed` are never sent. `is_estimated` remains on the contract but is always `false`.

When `breakdown` is not `none`, additional nodes are appended **fanning out from `retained` only**. No other band subdivides. Widths are that payment's retained share (`invoiced_amount` minus per-payment clamped refund). `pending_payment` rows have no method, so the dimension is populated on the retained side by construction.

Zero-value nodes and links are omitted from the response rather than sent as zeros.

## Frontend

| File | Change | Responsibility |
|---|---|---|
| `src/components/charts/sankey-diagram.tsx` | existing | Generic renderer. Nodes/links/formatters in, SVG out via `d3-sankey`. No finance concepts. Hatch support stays for generic reuse. |
| `src/components/finances/fee-lifecycle-section.tsx` | edit | Payload → chart props, breakdown toggle, tooltips; no Expected colors; subtitle matches pie dates |
| `src/hooks/finances/use-fee-lifecycle.ts` | existing | react-query, mirrors `use-finance-homepage.ts` |
| `src/types/finance/fee-lifecycle.ts` | existing | Request/response types |
| `src/components/finances/finance-homepage-content.tsx` | existing | Section between stat cards and charts |
| `src/components/finances/finance-homepage-stat-cards.tsx` | existing | `grid-cols-2 lg:grid-cols-4`; "Cash received" |

Band fills use semantic tokens (emerald / amber / blue / muted / red), not `--chart-1..5`.

The section renders `null` when permission is absent, with the query `enabled: false`, so no request is issued for a chart the user cannot see.

### Interaction

Hover shows amount, share of source, payment count, student count.

**Click-through is deferred to a follow-up plan.** Bands are not clickable in v1.

### Colors

| Band | Color |
|---|---|
| Retained, Collected | emerald (positive) |
| Discounts given | amber |
| In verification | blue (in-progress, not a failure) |
| Awaiting payment | muted foreground (neutral — not yet due) |
| Stuck, Refunded | red (actionable problem) |
| Billed, Net invoiced | foreground |
| Unattributed footer | amber warning text |

### Responsive

Below `lg` the diagram is placed in a horizontal scroll container with a min-width rather than compressed. A Sankey squeezed to phone width is unreadable.

### Empty and error states

- No program selected: reuse the page's existing empty state
- All-zero period: message, not a degenerate chart
- Zero-value nodes: omitted, not drawn as slivers
- Query error: inline error inside the section; the rest of the page keeps working

## Testing

Per the high-value-tests rule: no happy-path smoke, assert behavior and invariants.

### Backend

- 403 for a teacher holding only `payment.record`
- 403 for a student
- 400 on missing `program_id`; 400 on invalid `period`
- **Balance invariant**: outgoing links sum exactly to node value at Billed and at Net invoiced
- **Pie date basis**: payment with coverage rows for March but `verified_at` / `issued_at` in April lands in April, not March
- **Intake pre-registration**: future intake includes a verified payment dated before `intake.start_date` (same as Cash received)
- Payload never contains `expected` or `not_yet_billed`
- **Unattributed**: `verified_at IS NULL` and `issued_at IS NULL` appears in the unattributed band, never silently dropped
- `re_transfer` does not reduce Retained; `refund` does
- Refund against a non-verified payment does not draw a link out of Collected
- Over-refund is clamped to Collected and sets `meta.refund_clamped`
- Overpayment (`actual_amount` > `invoiced_amount`) does not make Collected exceed Net invoiced; variance appears in `meta.cash_received`
- Status exhaustiveness: every `UserPayment.Status` value maps to exactly one settlement band
- Empty program returns zeros without error

Run with `./scripts/run_backend_tests.sh` against the Docker test DB, always `--keepdb`.

### Frontend

- Subtitle does not claim billing-coverage dating
- Breakdown toggle subdivides only Retained; other bands unchanged
- Section absent and no fetch issued when permission missing
- All-zero payload renders the empty state, not an SVG with zero-height links
- Semantically opposite bands (Collected, Stuck) never resolve to the same fill color

## Out of scope

- Status transition history (needs a new audit table first)
- Waivers, write-offs, account credits — no such models exist
- `StaffPayment` payroll and `PlatformInvoice` SaaS billing — separate money flows
- Changing existing homepage aggregations or the `verified_at` basis of the stat cards
- Re-adding Expected / not-yet-billed (coverage KPI is a different view)
- A standalone `/finances/fee-lifecycle` route
- Band click-through, and the `nuqs` filter conversion of `/finances/recent-transactions` it depends on (follow-up plan)
