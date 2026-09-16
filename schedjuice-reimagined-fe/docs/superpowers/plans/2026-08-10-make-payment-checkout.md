# Student Make-Payment Checkout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `/finances/make-payment` as a two-step cart checkout with multi-course + multi-screenshot submit, silent OCR, and an extended `POST /make-payment` that never blocks on amount mismatch.

**Architecture:** Frontend owns cart state (sessionStorage) and a two-step shop/checkout UI aligned with `DESIGN.md`. Backend adds `student_checkout.py` with allocation inference and group attachment for **existing** `pending_payment` rows; `StudentMakePaymentView` dispatches legacy single-id POST vs new checkout multipart. Reuse admin field prefixes (`screenshot_N_*`) and sync OCR client helpers.

**Tech Stack:** Django/DRF, django-tenants, Next.js App Router, React Query, Vitest, Motion (`motion/react`), Base UI primitives, existing `runPaymentScreenshotOcr`.

**Spec:** `docs/superpowers/specs/2026-08-10-make-payment-checkout-design.md`

## Global Constraints

- Follow `schedjuice-reimagined-fe/DESIGN.md`: semantic tokens only, typography-first rows, no shadcn, `crossfade` / `staggerList` / `listItemPresence` motion, student voice may use exclamation marks sparingly.
- **Never block student submit** on OCR amount, partial payment inference, or cart total mismatch.
- **Never show OCR fields** to students (no txn id, amount, bank, duplicate warnings in UI).
- Payment methods are **read-only reference** — no method picker.
- Deep link `?courseId=` auto-adds pending invoice to cart; **always Step 1**.
- Backend tests: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh <target>` (always `--keepdb`).
- Frontend tests: `cd schedjuice-reimagined-fe && pnpm test <path>`.
- Do **not** commit unless the user explicitly asks.
- Legacy `POST /make-payment` with `id` + `screenshot` must remain backward compatible.

---

## File Structure

### Backend (`schedjuice-reimagined-be`)

| File | Responsibility |
| --- | --- |
| `app_finance/student_checkout_allocation.py` | Pure allocation inference from payments + screenshot OCR amounts |
| `app_finance/student_checkout.py` | `submit_student_checkout()` — update pending rows, create groups |
| `app_finance/views.py` | Extend `StudentMakePaymentView.post` to parse checkout multipart |
| `app_finance/serializers.py` | Extend `StudentPaymentSubmitSerializer` for optional OCR fields on legacy path |
| `app_finance/tests/test_student_checkout_allocation.py` | Inference unit tests |
| `app_finance/tests/test_student_checkout.py` | Integration tests for checkout POST |
| `app_finance/tests/test_user_payment_security.py` | Extend privileged-field + cross-user tests for checkout shape |
| `docs/PAYMENT_VERIFICATION_FLOW.md` | Document student checkout endpoint shape |

### Frontend (`schedjuice-reimagined-fe`)

| File | Responsibility |
| --- | --- |
| `src/lib/finances/student-checkout-form-data.ts` | `buildStudentCheckoutFormData()` |
| `src/lib/finances/student-checkout-form-data.test.ts` | FormData contract tests |
| `src/hooks/finances/use-make-payment-cart.ts` | Cart ids, total, sessionStorage, deep-link prefill |
| `src/hooks/finances/use-make-payment-cart.test.ts` | Cart + storage tests |
| `src/components/finances/make-payment/pending-invoice-row.tsx` | Invoice row + add/remove |
| `src/components/finances/make-payment/checkout-cart-recap.tsx` | Step 2 compact recap |
| `src/components/finances/make-payment/payment-method-instructions.tsx` | Read-only methods + copy |
| `src/components/finances/make-payment/checkout-screenshot-upload.tsx` | Multi-screenshot + hidden OCR |
| `src/app/(internal)/finances/make-payment/page.tsx` | Two-step orchestration (replace current page) |
| `src/components/course/invoice-indicator.tsx` | Add `?courseId=` to link |
| `src/app/(internal)/courses/[id]/locked/page.tsx` | Add `?courseId=` to link |

---

## Locked API contract

### Legacy (unchanged)

```
POST /make-payment
id=<user_payment_id>
screenshot=<file>
ocr_event_id=...          (optional)
transaction_id=...        (optional)
parsed_amount=...         (optional)
date_on_screenshot=...    (optional)
```

### Checkout (new)

```
POST /make-payment
checkout=1
payment_ids_count=2
payment_id_0=101
payment_id_1=102
screenshots_count=1
screenshot_0_screenshot=<file>
screenshot_0_parsed_amount=150000
screenshot_0_transaction_id=TXN123
screenshot_0_ocr_event_id=evt-abc
screenshot_0_date_on_screenshot=2026-08-10
screenshot_0_suggested_payment_method_id=3   (optional, from OCR)
```

No `allocations_count` from FE in v1 — server runs inference.

### Group rules (existing pending rows)

| Payments | Screenshots | Action |
| --- | --- | --- |
| 1 | 1 | Legacy update via serializer |
| 2+ | 1+ | `UserPaymentGroup` `multi_course`; update each pending row |
| 1 | 2+ | `UserPaymentGroup` `split_screenshots`; first row = existing pending; create sibling part rows for extra screenshots |

---

### Task 1: Allocation inference (backend)

**Files:**
- Create: `schedjuice-reimagined-be/app_finance/student_checkout_allocation.py`
- Create: `schedjuice-reimagined-be/app_finance/tests/test_student_checkout_allocation.py`

**Interfaces:**
- Consumes: nothing
- Produces:
  ```python
  def infer_checkout_allocations(
      *,
      payments: list[dict],  # {"id": int, "invoiced_amount": Decimal}
      screenshots: list[dict],  # {"index": int, "parsed_amount": Decimal | None}
  ) -> list[dict]:  # {"screenshot_index": int, "payment_id": int, "amount": Decimal}
  ```

- [ ] **Step 1: Write failing tests**

```python
# app_finance/tests/test_student_checkout_allocation.py
from decimal import Decimal
from django.test import SimpleTestCase
from app_finance.student_checkout_allocation import infer_checkout_allocations


class InferCheckoutAllocationsTests(SimpleTestCase):
    def test_one_screenshot_two_payments_proportional(self):
        payments = [
            {"id": 1, "invoiced_amount": Decimal("60000")},
            {"id": 2, "invoiced_amount": Decimal("40000")},
        ]
        screenshots = [{"index": 0, "parsed_amount": Decimal("100000")}]
        allocs = infer_checkout_allocations(payments=payments, screenshots=screenshots)
        by_pid = {a["payment_id"]: a["amount"] for a in allocs}
        self.assertEqual(by_pid[1], Decimal("60000"))
        self.assertEqual(by_pid[2], Decimal("40000"))

    def test_missing_ocr_amount_uses_invoiced_amounts(self):
        payments = [
            {"id": 1, "invoiced_amount": Decimal("50000")},
            {"id": 2, "invoiced_amount": Decimal("50000")},
        ]
        screenshots = [{"index": 0, "parsed_amount": None}]
        allocs = infer_checkout_allocations(payments=payments, screenshots=screenshots)
        self.assertEqual(len(allocs), 2)
        self.assertEqual(sum(a["amount"] for a in allocs), Decimal("100000"))

    def test_two_screenshots_greedy_match(self):
        payments = [
            {"id": 1, "invoiced_amount": Decimal("30000")},
            {"id": 2, "invoiced_amount": Decimal("70000")},
        ]
        screenshots = [
            {"index": 0, "parsed_amount": Decimal("30000")},
            {"index": 1, "parsed_amount": Decimal("70000")},
        ]
        allocs = infer_checkout_allocations(payments=payments, screenshots=screenshots)
        self.assertEqual(
            {(a["screenshot_index"], a["payment_id"]) for a in allocs},
            {(0, 1), (1, 2)},
        )
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_finance.tests.test_student_checkout_allocation`

Expected: `ModuleNotFoundError` or `ImportError`

- [ ] **Step 3: Implement inference**

```python
# app_finance/student_checkout_allocation.py
from decimal import Decimal, ROUND_HALF_UP
from typing import Any


def _quantize(amount: Decimal) -> Decimal:
    return amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def infer_checkout_allocations(
    *,
    payments: list[dict[str, Any]],
    screenshots: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if not payments or not screenshots:
        return []

    # Single screenshot → proportional split by invoiced_amount
    if len(screenshots) == 1:
        total_invoiced = sum(p["invoiced_amount"] for p in payments)
        ocr_total = screenshots[0].get("parsed_amount")
        target = ocr_total if ocr_total is not None else total_invoiced
        if total_invoiced <= 0:
            share = _quantize(target / len(payments))
            return [
                {
                    "screenshot_index": 0,
                    "payment_id": p["id"],
                    "amount": share,
                }
                for p in payments
            ]
        allocs = []
        running = Decimal("0")
        for i, p in enumerate(payments):
            if i == len(payments) - 1:
                amount = _quantize(target - running)
            else:
                amount = _quantize(target * (p["invoiced_amount"] / total_invoiced))
                running += amount
            allocs.append(
                {
                    "screenshot_index": 0,
                    "payment_id": p["id"],
                    "amount": amount,
                }
            )
        return allocs

    # Multiple screenshots → greedy match by amount, then proportional fallback
    remaining = {p["id"]: p["invoiced_amount"] for p in payments}
    allocs: list[dict[str, Any]] = []
    tolerance = Decimal("1")

    for shot in screenshots:
        idx = shot["index"]
        amt = shot.get("parsed_amount")
        if amt is None:
            continue
        match_pid = None
        for pid, invoiced in remaining.items():
            if abs(invoiced - amt) <= tolerance:
                match_pid = pid
                break
        if match_pid is not None:
            allocs.append(
                {"screenshot_index": idx, "payment_id": match_pid, "amount": amt}
            )
            del remaining[match_pid]

    if remaining:
        fallback_payments = [p for p in payments if p["id"] in remaining]
        fallback_shots = [
            s for s in screenshots if s["index"] not in {a["screenshot_index"] for a in allocs}
        ]
        if fallback_shots:
            nested = infer_checkout_allocations(
                payments=fallback_payments,
                screenshots=fallback_shots,
            )
            allocs.extend(nested)
        else:
            # Unmatched payments: attach to last screenshot at invoiced amount
            last_idx = screenshots[-1]["index"]
            for p in fallback_payments:
                allocs.append(
                    {
                        "screenshot_index": last_idx,
                        "payment_id": p["id"],
                        "amount": p["invoiced_amount"],
                    }
                )
    return allocs
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_finance.tests.test_student_checkout_allocation`

- [ ] **Step 5: Commit** (only if user asked)

---

### Task 2: `submit_student_checkout` service (backend)

**Files:**
- Create: `schedjuice-reimagined-be/app_finance/student_checkout.py`
- Create: `schedjuice-reimagined-be/app_finance/tests/test_student_checkout.py`
- Modify: `schedjuice-reimagined-be/app_finance/serializers.py` (optional OCR fields on legacy serializer)

**Interfaces:**
- Consumes: `infer_checkout_allocations` from Task 1
- Produces:
  ```python
  def submit_student_checkout(
      *,
      actor,
      tenant_schema: str,
      payment_ids: list[int],
      screenshots: list[dict],
  ) -> list[UserPayment]:  # updated/created parts
  ```

- [ ] **Step 1: Write failing integration test (multi-course)**

Use `BillingTenantAwareBaseTest`. Create two `UserPayment` rows for student with `status=pending_payment`, distinct courses, `invoiced_amount` set. POST checkout multipart with `checkout=1`, two `payment_id_*`, one `screenshot_0_*`.

Assert:
- `200`
- Both payments have `group_id` set, `group.group_kind == multi_course`
- `status == awaiting_extraction`
- Screenshot file saved on at least one part

- [ ] **Step 2: Run test — expect FAIL**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_finance.tests.test_student_checkout`

- [ ] **Step 3: Implement `submit_student_checkout`**

Key logic in `student_checkout.py`:

1. Load payments `id__in=payment_ids`, `select_for_update()`, verify same user, all `pending_payment`, no duplicates in list.
2. Build allocation list via `infer_checkout_allocations`.
3. If `len(payment_ids)==1 and len(screenshots)==1`: delegate to existing serializer update path (set screenshot, OCR fields, `awaiting_extraction`).
4. If `len(payment_ids) >= 2`: create `UserPaymentGroup(user=..., group_kind=MULTI_COURSE)`, store screenshots once in `stored_screenshots` dict by index (copy pattern from `create_multi_course_payment_group`).
5. For each allocation: find payment row; `update()` with `group`, `screenshot`, `parsed_amount=allocation.amount`, `transaction_id`, `payment_method_id` from OCR suggestion if valid, `status=awaiting_extraction`.
6. For `len(payment_ids)==1 and len(screenshots)>=2`: create `SPLIT_SCREENSHOTS` group; update first payment for alloc 0; for additional screenshots create sibling `UserPayment` rows copying `user`, `course`, billing fields from first row (no duplicate invoiced_amount mutation on siblings — siblings carry `parsed_amount` only).
7. Queue `extract_receiver_ss_text_data.delay` per touched row; call `mark_receiver_side_screenshots_matched` when `transaction_id` present.

Extend `StudentPaymentSubmitSerializer.Meta.fields` to optionally accept read-only OCR fields on legacy path:

```python
fields = (
    "screenshot",
    "transaction_id",
    "parsed_amount",
    "date_on_screenshot",
    "payment_method",
)
# update(): only set attrs present in validated_data; ignore status etc.
```

- [ ] **Step 4: Add test — submit succeeds when OCR amount ≠ invoiced sum**

POST checkout with `parsed_amount` deliberately lower than sum of `invoiced_amount`; assert `200`, not `400`.

- [ ] **Step 5: Add test — cannot checkout another user's payment**

Expect `403` (extend pattern from `test_user_payment_security.py`).

- [ ] **Step 6: Run full test module — expect PASS**

Run: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh app_finance.tests.test_student_checkout app_finance.tests.test_user_payment_security`

- [ ] **Step 7: Commit** (only if user asked)

---

### Task 3: Wire `StudentMakePaymentView` (backend)

**Files:**
- Modify: `schedjuice-reimagined-be/app_finance/views.py` (`StudentMakePaymentView.post`)
- Modify: `schedjuice-reimagined-be/docs/PAYMENT_VERIFICATION_FLOW.md`

**Interfaces:**
- Consumes: `submit_student_checkout` from Task 2
- Produces: HTTP responses unchanged shape (`send_response` with serializer data)

- [ ] **Step 1: Add parser helper on view (or module-level)**

```python
def _parse_student_checkout_request(request) -> tuple[list[int], list[dict], dict]:
    errors = {}
    try:
        count = int(request.data.get("payment_ids_count"))
    except (TypeError, ValueError):
        return [], [], {"payment_ids_count": "Must be an integer."}
    payment_ids = []
    for i in range(count):
        raw = request.data.get(f"payment_id_{i}")
        try:
            payment_ids.append(int(raw))
        except (TypeError, ValueError):
            errors[f"payment_id_{i}"] = "Must be an integer."
    # screenshots: mirror AdminUploadScreenshotView._parse_screenshots but
    # payment_method optional; read screenshot_{i}_ocr_event_id,
    # screenshot_{i}_suggested_payment_method_id
    ...
    return payment_ids, screenshots, errors
```

- [ ] **Step 2: Branch in `post()`**

```python
if request.data.get("checkout") in ("1", "true", True):
    payment_ids, screenshots, errors = _parse_student_checkout_request(request)
    if errors:
        return self.send_response(True, "validation_error", {"errors": errors}, status=400)
    if not screenshots:
        return self.send_response(True, "validation_error", {"errors": {"screenshot": "Required."}}, status=400)
    saved = submit_student_checkout(
        actor=acting_user(request),
        tenant_schema=request.tenant.schema_name,
        payment_ids=payment_ids,
        screenshots=screenshots,
    )
    ...
# else: existing id + screenshot path
```

- [ ] **Step 3: Document in `PAYMENT_VERIFICATION_FLOW.md`**

Add section "Student checkout (`POST /make-payment` with `checkout=1`)" with field list and group behavior.

- [ ] **Step 4: Run backend tests from Tasks 1–2**

- [ ] **Step 5: Commit** (only if user asked)

---

### Task 4: `buildStudentCheckoutFormData` (frontend)

**Files:**
- Create: `schedjuice-reimagined-fe/src/lib/finances/student-checkout-form-data.ts`
- Create: `schedjuice-reimagined-fe/src/lib/finances/student-checkout-form-data.test.ts`

**Interfaces:**
- Consumes: `PaymentPartFormInput` shape from `payment-group-utils.ts` (reuse type or import)
- Produces:
  ```typescript
  export function buildStudentCheckoutFormData(args: {
    paymentIds: number[];
    screenshots: PaymentPartFormInput[];
  }): FormData;
  ```

- [ ] **Step 1: Write failing tests**

```typescript
// student-checkout-form-data.test.ts
import { describe, expect, it } from "vitest";
import { buildStudentCheckoutFormData } from "./student-checkout-form-data";

describe("buildStudentCheckoutFormData", () => {
  const file = new File(["x"], "proof.png", { type: "image/png" });

  it("uses legacy keys for single payment and single screenshot", () => {
    const fd = buildStudentCheckoutFormData({
      paymentIds: [101],
      screenshots: [
        {
          file,
          parsedAmount: "50000",
          paymentMethodId: "",
          transactionId: "TXN-1",
          ocrEventId: "evt-1",
        },
      ],
    });
    expect(fd.get("checkout")).toBeNull();
    expect(fd.get("id")).toBe("101");
    expect(fd.get("screenshot")).toBe(file);
    expect(fd.get("ocr_event_id")).toBe("evt-1");
  });

  it("uses checkout keys for multiple payments", () => {
    const fd = buildStudentCheckoutFormData({
      paymentIds: [101, 102],
      screenshots: [{ file, parsedAmount: "100000", paymentMethodId: "" }],
    });
    expect(fd.get("checkout")).toBe("1");
    expect(fd.get("payment_ids_count")).toBe("2");
    expect(fd.get("payment_id_0")).toBe("101");
    expect(fd.get("payment_id_1")).toBe("102");
    expect(fd.get("screenshots_count")).toBe("1");
    expect(fd.get("screenshot_0_screenshot")).toBe(file);
  });

  it("omits payment_method when empty", () => {
    const fd = buildStudentCheckoutFormData({
      paymentIds: [101, 102],
      screenshots: [{ file, parsedAmount: "", paymentMethodId: "" }],
    });
    expect(fd.get("screenshot_0_payment_method")).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd schedjuice-reimagined-fe && pnpm test src/lib/finances/student-checkout-form-data.test.ts`

- [ ] **Step 3: Implement**

```typescript
import type { PaymentPartFormInput } from "./payment-group-utils";

export function buildStudentCheckoutFormData(args: {
  paymentIds: number[];
  screenshots: PaymentPartFormInput[];
}): FormData {
  const fd = new FormData();
  const { paymentIds, screenshots } = args;

  if (paymentIds.length === 1 && screenshots.length === 1) {
    const s = screenshots[0];
    fd.append("id", String(paymentIds[0]));
    if (s.file) fd.append("screenshot", s.file);
    if (s.parsedAmount) fd.append("parsed_amount", s.parsedAmount);
    if (s.transactionId) fd.append("transaction_id", s.transactionId);
    if (s.dateOnScreenshot) fd.append("date_on_screenshot", s.dateOnScreenshot);
    if (s.ocrEventId) fd.append("ocr_event_id", s.ocrEventId);
    return fd;
  }

  fd.append("checkout", "1");
  fd.append("payment_ids_count", String(paymentIds.length));
  paymentIds.forEach((id, i) => fd.append(`payment_id_${i}`, String(id)));

  fd.append("screenshots_count", String(screenshots.length));
  screenshots.forEach((s, i) => {
    const prefix = `screenshot_${i}_`;
    if (s.file) fd.append(`${prefix}screenshot`, s.file);
    if (s.parsedAmount) fd.append(`${prefix}parsed_amount`, s.parsedAmount);
    if (s.transactionId) fd.append(`${prefix}transaction_id`, s.transactionId);
    if (s.dateOnScreenshot) fd.append(`${prefix}date_on_screenshot`, s.dateOnScreenshot);
    if (s.ocrEventId) fd.append(`${prefix}ocr_event_id`, s.ocrEventId);
    // suggested method from OCR — optional separate field if OCR returns it
  });
  return fd;
}
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit** (only if user asked)

---

### Task 5: `useMakePaymentCart` hook (frontend)

**Files:**
- Create: `schedjuice-reimagined-fe/src/hooks/finances/use-make-payment-cart.ts`
- Create: `schedjuice-reimagined-fe/src/hooks/finances/use-make-payment-cart.test.ts`

**Interfaces:**
- Consumes: pending payment rows from page query (`{ id, invoiced_amount, course }[]`)
- Produces:
  ```typescript
  export function useMakePaymentCart(args: {
    userId: string;
    pendingPayments: PendingPaymentRow[];
    courseIdParam?: string | null;
  }): {
    cartIds: Set<number>;
    toggle: (id: number) => void;
    add: (id: number) => void;
    remove: (id: number) => void;
    total: number;
    isInCart: (id: number) => boolean;
    clear: () => void;
  };
  ```

- [ ] **Step 1: Write failing tests**

Test: add/remove updates total; sessionStorage round-trip (`sj:make-payment-cart:<userId>`); `courseIdParam` pre-adds matching pending row on mount.

- [ ] **Step 2: Run — expect FAIL**

Run: `cd schedjuice-reimagined-fe && pnpm test src/hooks/finances/use-make-payment-cart.test.ts`

- [ ] **Step 3: Implement hook**

Use `useState` + `useEffect` to hydrate from `sessionStorage`; `useEffect` for deep-link prefill (once, when pending payments load).

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit** (only if user asked)

---

### Task 6: Make-payment UI components (frontend)

**Files:**
- Create: `schedjuice-reimagined-fe/src/components/finances/make-payment/pending-invoice-row.tsx`
- Create: `schedjuice-reimagined-fe/src/components/finances/make-payment/checkout-cart-recap.tsx`
- Create: `schedjuice-reimagined-fe/src/components/finances/make-payment/payment-method-instructions.tsx`
- Create: `schedjuice-reimagined-fe/src/components/finances/make-payment/checkout-screenshot-upload.tsx`

**Interfaces:**
- `CheckoutScreenshotUpload` produces:
  ```typescript
  export type CheckoutScreenshot = {
    key: string;
    files: extendedFileType[];
    ocrEventId?: string;
    transactionId?: string;
    parsedAmount?: string;
    dateOnScreenshot?: string;
    suggestedPaymentMethodId?: string;
  };
  export function CheckoutScreenshotUpload(props: {
    screenshots: CheckoutScreenshot[];
    onChange: (next: CheckoutScreenshot[]) => void;
    disabled?: boolean;
  }): JSX.Element;
  ```
  On file add: call `runPaymentScreenshotOcr({ file, paymentKind: PaymentScreenshotKind.Student })` silently; merge result into state; **never render OCR UI**.

- [ ] **Step 1: `pending-invoice-row.tsx`**

Typography row: course title (Burmese-safe), code in `text-status-blue`, billing period `text-text-muted`, amount `font-mono text-accent`. Button text: "Add to cart" / "Remove" (secondary/ghost). No card shadow border stack.

- [ ] **Step 2: `payment-method-instructions.tsx`**

Map methods to rows; `navigator.clipboard.writeText` on Copy with toast "Copied". Use `RoughDivider` between section title and rows.

- [ ] **Step 3: `checkout-screenshot-upload.tsx`**

Progressive blocks: first `FileDragAndDrop`; "+ Add another screenshot" adds row; `PaymentScreenshotPreview` for thumbs; `listItemPresence` on add/remove.

- [ ] **Step 4: `checkout-cart-recap.tsx`**

Compact list of cart items + mono total; "Edit cart" calls `onBackToShop`.

- [ ] **Step 5: Manual smoke** — no unit test required for presentational components unless logic-heavy.

- [ ] **Step 6: Commit** (only if user asked)

---

### Task 7: Rewrite make-payment page (frontend)

**Files:**
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/finances/make-payment/page.tsx`
- Remove usage of: `CoursePricingCard`, legacy `PaymentMethodCard` on this page

**Interfaces:**
- Consumes: Tasks 4–6 hooks/components
- Produces: working two-step page at `/finances/make-payment`

- [ ] **Step 1: Step state**

```typescript
type CheckoutStep = "shop" | "checkout";
const [step, setStep] = useState<CheckoutStep>("shop");
const [courseIdParam] = useQueryState("courseId", parseAsString);
```

- [ ] **Step 2: Shop step layout**

- Page title serif `text-3xl`: "Pay for courses"
- Hand accent line (3–5 words max)
- `AnimatePresence` + `motion.div` with `crossfade` keyed by `step`
- Invoice list with `staggerList` / `staggerItem`
- Sticky cart bar: `fixed bottom-0 inset-x-0` mobile / `sticky` desktop column — show count + `formatMoney(total)` + Proceed button
- Skeleton reserves `min-h` for list + bar (no layout shift)

- [ ] **Step 3: Checkout step layout**

- Back button (text only) → `setStep("shop")`
- `CheckoutCartRecap`, `PaymentMethodInstructions`, `CheckoutScreenshotUpload`
- Submit: `buildStudentCheckoutFormData` → `makePostRequest("make-payment", fd, {}, { "Content-Type": "multipart/form-data" })`
- Submit disabled only when `cart empty || screenshots.length===0 || isPending`
- Success: `clear()` cart, toast description warm ("Submitted — we'll review your payment soon."), `setStep("shop")`

- [ ] **Step 4: Remove HelpDialog-only instructions**

Replace with inline tip on checkout step; keep optional `?` help if product wants — not required.

- [ ] **Step 5: Run FE tests from Tasks 4–5**

Run: `cd schedjuice-reimagined-fe && pnpm test src/lib/finances/student-checkout-form-data.test.ts src/hooks/finances/use-make-payment-cart.test.ts`

- [ ] **Step 6: Manual QA checklist**

- 390×844: sticky cart bar not obscured by shell nav
- Deep link `?courseId=` pre-fills cart on Step 1
- Two courses + one screenshot submits without amount error
- OCR failure still allows submit

- [ ] **Step 7: Commit** (only if user asked)

---

### Task 8: Deep-link updates (frontend)

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/course/invoice-indicator.tsx`
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/courses/[id]/locked/page.tsx`

- [ ] **Step 1: Update hrefs**

```tsx
href={`/finances/make-payment?courseId=${course.id}`}
```

Use existing course id variable in each file.

- [ ] **Step 2: Smoke test navigation from locked course page**

- [ ] **Step 3: Commit** (only if user asked)

---

## Spec self-review

| Spec requirement | Task |
| --- | --- |
| Two-step shop/checkout | Task 7 |
| Add to cart UX | Tasks 5, 6, 7 |
| Multi-course submit | Tasks 1–3, 4, 7 |
| Multi-screenshot | Tasks 2, 6, 7 |
| Hidden OCR | Task 6 |
| Never block on amount | Tasks 2, 7 |
| Payment methods read-only | Task 6 |
| `?courseId=` deep link | Tasks 5, 7, 8 |
| Extend `POST /make-payment` | Tasks 2–3 |
| DESIGN.md compliance | Tasks 6–7 |
| Copy account number | Task 6 |
| Post-submit payment history link | Task 7 (success toast + Link) |
| Testing anchors | Tasks 1–5 |

**Resolved open questions:**
- Field names: `payment_id_{i}`, `screenshot_{i}_*` (admin-aligned); legacy `id` for 1×1.
- Split screenshots: sibling `UserPayment` rows under `split_screenshots` group (Task 2).
- Success UI: toast + optional link (no new illustration in v1).

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-10-make-payment-checkout.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — execute tasks in this session with checkpoints

Which approach?
