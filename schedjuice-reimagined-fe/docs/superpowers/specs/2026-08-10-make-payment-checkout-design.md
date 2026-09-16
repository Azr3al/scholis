# Student Make-Payment Checkout — Design Spec

**Date:** 2026-08-10  
**Status:** Approved for planning  
**Surface:** `/finances/make-payment` (student self-pay)  
**Related:** `schedjuice-reimagined-fe/DESIGN.md`; `docs/superpowers/specs/2026-07-10-multipart-student-payments-ocr-design.md`; BE `docs/PAYMENT_VERIFICATION_FLOW.md`

## Summary

Redesign the student **make-payment** page as a familiar **two-step checkout**: Step 1 shop (browse pending invoices, add to cart), Step 2 checkout (read-only payment instructions, upload one or more transfer screenshots, submit). Students may pay however they want — one transfer for many courses or several transfers — and **checkout is never blocked** by OCR amount, partial-payment inference, or mismatch with cart total. Admins verify every submission.

OCR runs **silently** on upload (same sync endpoint as admin upload) and is included in the submit payload for backend processing; **students never see** extracted fields, loading states, or warnings.

## Confirmed decisions

| Topic | Decision |
|-------|----------|
| Layout | Two-step flow (shop → checkout), not a three-step wizard |
| Payment methods | **Reference only** — show school bank accounts; no method picker |
| Multi-course | Cart supports multiple pending invoices; submit in one checkout |
| Multi-screenshot | Progressive “add another screenshot” on checkout |
| Transfer pattern | Student chooses (one or many transfers); system **infers** allocations best-effort |
| Amount gating | **Never block submit** — OCR/partial/mismatch hints are admin-only |
| OCR visibility | Hidden from student UI; still sent on submit when available |
| Deep link | `?courseId=` auto-adds matching pending invoice to cart; **stay on Step 1** |
| Backend approach | **Extend `POST /make-payment`** (Approach A); do not route students through admin `scan-transaction-screenshots` |
| Design system | Follow `DESIGN.md` — typography-first rows, semantic tokens, motion recipes; retire legacy card grid on this page |

## Goals / non-goals

**Goals**

- E-commerce-style cart UX (“add to cart”, running total, proceed to checkout).
- Multi-course and multi-screenshot checkout aligned with existing `UserPaymentGroup` kinds (`multi_course`, `split_screenshots`).
- Silent sync OCR on each screenshot; include metadata on submit.
- Mobile-friendly sticky cart summary; bilingual-friendly labels.
- Deep links from locked course / invoice widgets pre-fill cart.

**Non-goals**

- Student-facing payment method selection.
- Blocking or warning UI based on OCR amount vs cart total.
- Combined group receipt PDF.
- Changes to admin upload UI or CSV verification format.
- Replacing `/finances/payment-history` or home widgets (only link updates with `?courseId=` where useful).

## Architecture

```
Step 1 Shop                          Step 2 Checkout
────────────                         ───────────────
GET pending user-payments     →      Payment methods (read-only, copy)
  (status=pending_payment)           File upload × N (+ hidden OCR each)
Cart state (sessionStorage)            POST /make-payment (extended payload)
Deep link ?courseId= pre-add
```

```
Per screenshot (on file select, hidden):
  POST /ocr-payment-screenshot  (payment_kind=student)
       → store ocr_event_id, txn, amount, bank, suggested_method in state

On submit:
  POST /make-payment
    ├─ legacy: id + screenshot                    (1 course, 1 file)
    └─ checkout: payment_ids + screenshots + allocations (+ OCR fields)
         ├─ 1 course, 1 screenshot  → update existing UserPayment
         ├─ N courses, M screenshots → UserPaymentGroup (multi_course and/or split_screenshots)
         └─ status → awaiting_extraction; async extract_receiver_ss_text_data per part
```

### Backend approach comparison (chosen: A)

| Approach | Verdict |
|----------|---------|
| **A. Extend `POST /make-payment`** | **Chosen** — student-scoped, backward-compatible, reuses group + OCR infrastructure |
| B. Student flag on `scan-transaction-screenshots` | Rejected — admin create semantics; permission/field leakage risk |
| C. FE loops single `make-payment` per course | Rejected — breaks multi-course group and shared-screenshot model |

## UX — Step 1: Shop

### Layout (lofi)

```
┌─ Pay for courses (serif H1) ────────────────────────────────────┐
│  Hand accent: "Pick what you're paying for today"               │
│                                                                  │
│  Pending invoices (typography-first list, stagger on load)      │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Course title · code                                        │ │
│  │ Billing period (text-sm muted)                             │ │
│  │ Amount (font-mono, right)          [Add to cart] / [Remove]│ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─ Cart bar (sticky bottom mobile / sticky aside desktop) ───┐ │
│  │ 2 courses · Total 150,000 MMK          [Proceed to checkout]│ │
│  └────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### Rules

- Source rows: `user-payments` where `status = pending_payment` and `user_id = self`.
- Cart is a set of `UserPayment` ids; total = sum of `invoiced_amount`.
- `Proceed to checkout` disabled when cart empty.
- Cart persisted in `sessionStorage` (key scoped by user id) for refresh resilience.
- Empty state: `<EmptyCopy />` — no outstanding invoices; recovery link to home or courses.
- Motion: `staggerList` on invoice list; `listItemPresence` on add/remove; step change uses `crossfade`.

### Deep link

- `?courseId=<id>`: if a pending payment exists for that course, add its `UserPayment` id to cart on mount.
- Always land on **Step 1** (student may add more courses).
- Invalid / non-pending course: ignore param; no error toast.

## UX — Step 2: Checkout

### Layout (lofi)

```
┌─ [← Back to shop] ──────────────────────────────────────────────┐
│  Cart recap (compact list + total; link back to edit)             │
│                                                                  │
│  ─── Transfer to one of these accounts ───                       │
│  KBZ · account …        [Copy]                                   │
│  CB · account …         [Copy]                                   │
│  (typography rows — not selectable cards)                        │
│                                                                  │
│  ─── Upload transfer proof ───                                   │
│  [ Drag-and-drop zone ]                                          │
│  [thumb] [thumb] …                                               │
│  [+ Add another screenshot]                                      │
│  Quiet tip (hand accent optional): include transaction ID in shot  │
│                                                                  │
│  [Submit payment]   (requires ≥1 screenshot; never OCR-gated)  │
└──────────────────────────────────────────────────────────────────┘
```

### Rules

- Payment methods: fetch existing `payment-methods` list; display name, bank, description; **copy-to-clipboard** for account numbers where present.
- No payment-method form field; OCR `suggested_payment_method_id` stored server-side only.
- Screenshots: reuse `FileDragAndDrop` + thumbnail strip patterns from admin upload; `isMultiple` via progressive add.
- Submit enabled when cart non-empty and ≥1 screenshot; **not** disabled for OCR loading failure (allow submit if OCR still in flight — attach whatever OCR completed; missing OCR fields OK).
- Success: toast (warm student voice), clear cart + sessionStorage, offer link to payment history.
- Errors: validation only for missing screenshot, empty cart, forbidden payment ids — not amount.

### DESIGN.md compliance

| Anti-pattern on current page | Replacement |
|------------------------------|-------------|
| `CoursePricingCard` 2-col grid + `border-success` | Invoice row component, semantic tokens |
| `PaymentMethodCard` shadow cards | Typography rows + copy action |
| `text-green-600` raw utility | `text-accent` / `font-mono` for amounts |
| Single-page everything | Two-step with `crossfade` |
| Help dialog only instructions | Inline tips on checkout + optional help link |

## Hidden OCR

Reuse `runPaymentScreenshotOcr` from `src/lib/finances/ocr-payment-screenshot.ts` with `paymentKind: PaymentScreenshotKind.Student`.

| Student sees | System does |
|--------------|-------------|
| Thumbnail + remove | Sync OCR per file |
| Nothing on OCR failure | Submit without OCR fields; backend `awaiting_extraction` |
| Nothing on duplicate warning | Pass `duplicate_of_payment_id` if returned — admin handles |
| Nothing on amount | Include `parsed_amount` in FormData when present |

Do **not** surface `OCR_FIELD_EXTRACTING_MESSAGE`, transaction ID fields, or amount inputs.

## Allocation inference (server-side)

When the client does not send explicit allocations (expected for student checkout), the server infers:

1. **One screenshot, N cart payments:** allocate OCR `parsed_amount` across payments **proportionally** by `invoiced_amount`. If OCR amount missing, allocate full `invoiced_amount` per payment (admin reconciles).
2. **M screenshots, N payments:** greedily match screenshot amounts to payment amounts where within tolerance; remainder proportional. Unmatched → proportional fallback.
3. **Never reject** checkout when sums disagree — set `amount_mismatch` only when verification runs, not at submit.

Explicit allocations may be added to the API later for power users; v1 student FE sends inference-friendly payload only.

## Backend — extend `POST /make-payment`

### Legacy (unchanged)

```
id=<user_payment_id>
screenshot=<file>
[+ ocr_event_id, transaction_id, parsed_amount, date_on_screenshot, ...]
```

Updates one `pending_payment` row via `StudentPaymentSubmitSerializer`; status → `awaiting_extraction`.

### Checkout (new)

Multipart form fields (names illustrative; implementation may align with admin `screenshot_N_*` / `alloc_N_*` conventions):

```
checkout=1
payment_ids_count=N
payment_id_0=101
...
screenshots_count=M
screenshot_0_screenshot=<file>
screenshot_0_parsed_amount=...
screenshot_0_transaction_id=...
screenshot_0_ocr_event_id=...
...
allocations_count=K   (optional; omit for server inference)
alloc_0_screenshot_index=0
alloc_0_payment_id=101
alloc_0_amount=50000
```

### Validation

- Actor must own all `payment_id`s (or `payment.make` without read breadth only own rows).
- Each payment `status = pending_payment`; reject `verified` (existing rule).
- Reject duplicate payment ids in one checkout.
- Strip privileged fields (existing security tests must extend to new shape).

### Group creation (existing pending rows)

New helper (e.g. `submit_student_checkout` in `app_finance/`) — **does not** use admin `create_multi_course_payment_group` create-from-scratch path; instead:

| Cart shape | Screenshots | Group kind |
|------------|-------------|------------|
| 1 payment | 1 | No group — direct update |
| 1 payment | 2+ | `split_screenshots` — attach parts to group linked to existing row(s) |
| 2+ payments | 1+ | `multi_course` — link existing pending rows; shared screenshot indices per admin model |

Implementation detail for plan phase: how to map one pending row into multi-part split (may create sibling part rows or restructure group FKs) must preserve one logical checkout per submission and per-part verification.

After save: `mark_receiver_side_screenshots_matched` when `transaction_id` set; `extract_receiver_ss_text_data.delay` per part.

## Frontend modules

| Unit | Responsibility |
|------|----------------|
| `make-payment/page.tsx` | Step orchestration, data fetching, submit |
| `make-payment-cart-context` or hook | Cart ids, sessionStorage, total |
| `pending-invoice-row.tsx` | Single invoice row + add/remove |
| `checkout-cart-recap.tsx` | Compact recap on Step 2 |
| `payment-method-instructions.tsx` | Read-only methods + copy |
| `checkout-screenshot-upload.tsx` | Multi-file + hidden OCR state |
| `buildStudentCheckoutFormData` | FormData builder (extend `payment-group-utils` or sibling) |

Reuse: `useFinancePageHeader`, `formatMoney`, `runPaymentScreenshotOcr`, motion from `src/lib/sj/motion.ts`.

## Additional improvements (in scope)

| Item | Notes |
|------|-------|
| Copy account number | Primary action on each method row |
| Post-submit link | Payment history |
| Update deep links | `invoice-indicator`, `courses/[id]/locked`, `outstanding-balance-widget` → `?courseId=` |
| Bilingual labels | EN primary; MY secondary on key CTAs where product already does dual copy |
| Skeleton layout | Reserve height for list + cart bar (no layout shift) |

## Testing anchors

**Frontend (Vitest)**

- Cart add/remove/total; proceed disabled when empty.
- `?courseId=` pre-adds pending payment; stays step 1.
- Step navigation + sessionStorage restore.
- Submit FormData shape for 1×1, N×1, 1×M (mocked).
- OCR failure still calls submit.

**Backend (Django)**

- Legacy single-id POST unchanged.
- Multi-payment checkout creates `multi_course` group; RBAC denies other user's ids.
- Verified payment rejected.
- Privileged fields ignored (extend `test_user_payment_security`).
- Submit succeeds when OCR amount ≠ sum invoiced (no 400).

## Open questions (deferred to implementation plan)

- Exact field names for checkout multipart (mirror admin vs `payment_id_*` prefix).
- Single pending payment split into `split_screenshots` parts — row split vs group-only linkage.
- Whether to show a single combined “processing” illustration on success (copy/design polish).
