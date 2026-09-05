# Multi-Part Student Payments + Sync OCR Preview — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins record one logical student payment with 1+ screenshots (each a verifiable part with its own method/amount/txn), keep single-part first-class, and fill OCR fields synchronously on the upload form.

**Architecture:** Add nullable `UserPayment.group` → new `UserPaymentGroup` (created only when parts ≥ 2). Group owns plan/coverage; parts remain full `UserPayment` rows for OCR/CSV verify. New sync `POST /ocr-payment-screenshot` previews OCR without persisting. Extend `POST /scan-transaction-screenshots` for indexed multi-part multipart bodies. Admin report projects one row per group. Upload page progressively adds parts and runs sync OCR per screenshot.

**Tech Stack:** Django/DRF, django-tenants, django-q (existing async OCR kept for legacy callers), Next.js App Router, React Query, Vitest, existing `payment.record` RBAC.

**Spec:** `docs/superpowers/specs/2026-07-10-multipart-student-payments-ocr-design.md`

**Conventions:**
- Backend tests: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh <target>` (always `--keepdb`)
- Frontend tests: `cd schedjuice-reimagined-fe && pnpm test <path>`
- Do **not** commit unless the user explicitly asks
- Single-part create must remain backward compatible with today’s flat FormData

---

## File Structure

### Backend (`schedjuice-reimagined-be`)

| File | Responsibility |
| --- | --- |
| `app_finance/models.py` | `UserPaymentGroup`; `UserPayment.group` FK |
| `app_finance/migrations/0062_user_payment_group.py` | Schema |
| `app_finance/payment_group.py` | Status rollup, group create helper, overlap peer key |
| `app_finance/ocr_client.py` | `image_file_to_text(file)` for uploaded bytes (no URL) |
| `app_finance/services.py` | `preview_kpay_screenshot(file)` sync extract + optional duplicate hint |
| `app_finance/serializers.py` | Group serializer; multi-part parse helpers if needed |
| `app_finance/views.py` | `OcrPaymentScreenshotView`; extend `AdminUploadScreenshotView`; admin-report group projection; `UserPaymentGroupDetailsView` |
| `app_finance/urls.py` | New routes |
| `app_finance/tests/test_payment_group.py` | Rollup + create + report + OCR preview |
| `docs/PAYMENT_VERIFICATION_FLOW.md` | Document preview + multi-part |

### Frontend (`schedjuice-reimagined-fe`)

| File | Responsibility |
| --- | --- |
| `src/components/finances/student-payments-report.tsx` | Row type: `kind`, `group_id`, `part_count`, `parts` |
| `src/lib/finances/payment-group-utils.ts` | Rollup helpers mirrored for UI if needed; FormData builders |
| `src/lib/finances/payment-group-utils.test.ts` | Unit tests |
| `src/lib/data-sheets/payment-row-utils.ts` | Group-aware edit locks |
| `src/app/(internal)/finances/student-payments/upload/page.tsx` | Progressive parts + sync OCR |
| `src/components/finances/student-payments-grid.tsx` | One-row groups; wire Upload nav |
| `src/components/finances/payments-grid/payment-grid-cells.tsx` | File-count / multi-method display tweaks |
| `src/components/finances/student-payments-drawer.tsx` | Nested parts under group cards |
| `src/hooks/finances/use-student-payments-detail.ts` | Tolerate group rows |

---

## Task 1: `UserPaymentGroup` model + migration

**Files:**
- Modify: `schedjuice-reimagined-be/app_finance/models.py`
- Create: `schedjuice-reimagined-be/app_finance/migrations/0062_user_payment_group.py`

- [ ] **Step 1: Add models**

In `models.py`, insert **before** `UserPayment` (so FK forward-ref is clean), or after `PaymentMethod` and use string FK. Prefer placing `UserPaymentGroup` immediately above `UserPayment`:

```python
class UserPaymentGroup(BaseModel):
    """Logical multi-part payment (2+ UserPayment parts). Single payments stay group=null."""

    issued_at = models.DateTimeField(null=True)
    billing_start_date = models.DateTimeField(null=True)
    billing_end_date = models.DateTimeField(null=True)
    is_installment = models.BooleanField(default=False)
    installment_percent = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True,
    )
    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="user_payment_groups", null=True,
    )
    course = models.ForeignKey(
        "app_course.Course", on_delete=models.CASCADE,
        related_name="user_payment_groups", null=True,
    )
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, related_name="created_user_payment_groups",
        null=True,
    )
```

On `UserPayment`, add:

```python
group = models.ForeignKey(
    "UserPaymentGroup",
    on_delete=models.CASCADE,
    related_name="parts",
    null=True,
    blank=True,
)
```

Also add optional group-level covered months **or** reuse payment-level months copied onto each part (see Task 3). For v1: **do not** add `UserPaymentGroupCoveredMonth` — copy coverage onto each part via existing `sync_user_payment_covered_months` so `apply_month_scope` keeps working. Group still stores installment flags + billing dates as the edit authority.

- [ ] **Step 2: Make migration**

```bash
cd schedjuice-reimagined-be
./env/bin/python manage.py makemigrations app_finance --name user_payment_group
```

Expected: `0062_user_payment_group.py` (or next number if 0062 already exists — use whatever makemigrations emits).

- [ ] **Step 3: Apply locally (dev DB)**

```bash
./env/bin/python manage.py migrate app_finance
```

Expected: OK.

---

## Task 2: Status rollup helper (TDD)

**Files:**
- Create: `schedjuice-reimagined-be/app_finance/payment_group.py`
- Create: `schedjuice-reimagined-be/app_finance/tests/test_payment_group.py`

- [ ] **Step 1: Write failing unit tests**

```python
from django.test import SimpleTestCase
from app_finance.models import UserPayment
from app_finance.payment_group import rollup_payment_group_status


class RollupPaymentGroupStatusTests(SimpleTestCase):
    def test_all_verified(self):
        self.assertEqual(
            rollup_payment_group_status([
                UserPayment.Status.VERIFIED,
                UserPayment.Status.VERIFIED,
            ]),
            UserPayment.Status.VERIFIED,
        )

    def test_duplicated_wins(self):
        self.assertEqual(
            rollup_payment_group_status([
                UserPayment.Status.VERIFIED,
                UserPayment.Status.DUPLICATED,
                UserPayment.Status.PENDING_VERIFICATION,
            ]),
            UserPayment.Status.DUPLICATED,
        )

    def test_priority_order(self):
        self.assertEqual(
            rollup_payment_group_status([
                UserPayment.Status.PENDING_PAYMENT,
                UserPayment.Status.CANNOT_EXTRACT,
            ]),
            UserPayment.Status.CANNOT_EXTRACT,
        )

    def test_empty_defaults_pending_payment(self):
        self.assertEqual(
            rollup_payment_group_status([]),
            UserPayment.Status.PENDING_PAYMENT,
        )
```

- [ ] **Step 2: Run to verify fail**

```bash
./scripts/run_backend_tests.sh app_finance.tests.test_payment_group.RollupPaymentGroupStatusTests
```

Expected: FAIL (import / missing function).

- [ ] **Step 3: Implement**

```python
# app_finance/payment_group.py
from __future__ import annotations

from app_finance.models import UserPayment

_STATUS_PRIORITY = [
    UserPayment.Status.DUPLICATED,
    UserPayment.Status.AMOUNT_MISMATCH,
    UserPayment.Status.CANNOT_EXTRACT,
    UserPayment.Status.AWAITING_EXTRACTION,
    UserPayment.Status.AWAITING_METADATA_EXTRACTION,
    UserPayment.Status.PENDING_VERIFICATION,
    UserPayment.Status.PENDING_PAYMENT,
]


def rollup_payment_group_status(statuses: list[str]) -> str:
    if not statuses:
        return UserPayment.Status.PENDING_PAYMENT
    if all(s == UserPayment.Status.VERIFIED for s in statuses):
        return UserPayment.Status.VERIFIED
    for candidate in _STATUS_PRIORITY:
        if candidate in statuses:
            return candidate
    return statuses[0]
```

- [ ] **Step 4: Re-run tests**

```bash
./scripts/run_backend_tests.sh app_finance.tests.test_payment_group.RollupPaymentGroupStatusTests
```

Expected: PASS.

---

## Task 3: Sync OCR preview service + endpoint (TDD)

**Files:**
- Modify: `schedjuice-reimagined-be/app_finance/ocr_client.py`
- Modify: `schedjuice-reimagined-be/app_finance/services.py`
- Modify: `schedjuice-reimagined-be/app_finance/views.py`
- Modify: `schedjuice-reimagined-be/app_finance/urls.py`
- Modify: `schedjuice-reimagined-be/app_finance/tests/test_payment_group.py`

### Why file OCR

`image_to_text` today only accepts a **URL**. Preview must not create a `UserPayment`, so add file upload to OCR.space.

- [ ] **Step 1: Add `image_file_to_text`**

In `ocr_client.py`, add a sibling that posts multipart file (OCR.space `file` field) with the same failover loop. Extract shared validation; keep `image_to_text(url)` unchanged.

```python
def image_file_to_text(file_obj, filename: str = "screenshot.jpg") -> dict:
    """OCR from an uploaded file-like object (no persisted URL)."""
    # Read bytes once; each failover attempt needs a fresh BytesIO / file tuple
    raw = file_obj.read()
    if hasattr(file_obj, "seek"):
        file_obj.seek(0)
    return _post_file_with_failover(raw, filename)
```

Implement `_post_file_with_failover` mirroring `_post_with_failover` but:

```python
requests.post(
    endpoint,
    files={"file": (filename, io.BytesIO(raw), "image/jpeg")},
    data={
        "isOverlayRequired": True,
        "detectOrientation": True,
        "OCREngine": 2,
    },
    headers={"apikey": api_key},
    timeout=timeout,
)
```

- [ ] **Step 2: Add `preview_kpay_screenshot` in `services.py`**

```python
def preview_kpay_screenshot(file_obj, filename: str = "screenshot.jpg") -> dict:
    """
    Sync OCR preview. Returns:
      {ok, transaction_id, parsed_amount, date_on_screenshot, duplicate_of_payment_id?}
    Does not create/update UserPayment.
    """
    try:
        raw = image_file_to_text(file_obj, filename=filename)
        lines = raw["ParsedResults"][0]["TextOverlay"]["Lines"]
        text_data = extract_kpay(lines)
    except OcrError as exc:
        return {"ok": False, "error": str(exc)}
    except Exception as exc:
        logger.exception("preview OCR failed: %s", exc)
        return {"ok": False, "error": "could_not_extract"}

    txn = text_data.get("transaction_id")
    amount = text_data["amount"][0] if text_data.get("amount") else None
    if not txn and amount is None:
        return {"ok": False, "error": "could_not_extract"}

    duplicate_id = None
    if txn:
        existing = UserPayment.objects.filter(transaction_id=txn).values_list("id", flat=True).first()
        if existing:
            duplicate_id = existing

    return {
        "ok": True,
        "transaction_id": txn,
        "parsed_amount": amount,
        "date_on_screenshot": None,  # fill if extract_kpay later gains date; keep key stable
        "duplicate_of_payment_id": duplicate_id,
        "json_ocr_data": text_data,
    }
```

Note: call sites that need tenant schema must wrap DB duplicate lookup in the view’s tenant context (already true for API views).

- [ ] **Step 3: Failing API test (mock OCR)**

```python
from unittest.mock import patch
from django.core.files.uploadedfile import SimpleUploadedFile
# use existing tenant test base from test_rbac_finance / test_user_payment_security

class OcrPaymentScreenshotViewTests(...):
    @patch("app_finance.views.preview_kpay_screenshot")
    def test_preview_returns_fields(self, mock_preview):
        mock_preview.return_value = {
            "ok": True,
            "transaction_id": "12345678901234567890",
            "parsed_amount": 50000,
            "date_on_screenshot": None,
            "duplicate_of_payment_id": None,
            "json_ocr_data": {},
        }
        img = SimpleUploadedFile("a.jpg", b"fake", content_type="image/jpeg")
        resp = self._client(self.admin).post(
            "/api/v1/ocr-payment-screenshot",
            {"screenshot": img},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()["data"]
        self.assertEqual(data["transaction_id"], "12345678901234567890")
        self.assertEqual(UserPayment.objects.count(), 0)  # no persist

    def test_preview_requires_payment_record(self):
        # teacher without permission or anonymous → 403
        ...
```

- [ ] **Step 4: Implement view + URL**

```python
# views.py
class OcrPaymentScreenshotView(RBACView):
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"POST": "payment.record"}

    def post(self, request: Request):
        f = request.FILES.get("screenshot")
        if not f:
            return self.send_response(True, "screenshot required", {}, status=400)
        result = preview_kpay_screenshot(f, filename=getattr(f, "name", "screenshot.jpg"))
        if not result.get("ok"):
            return self.send_response(
                True,
                result.get("error") or "could_not_extract",
                {"data": result},
                status=422,
            )
        return self.send_response(False, "ok", {"data": result})
```

```python
# urls.py
path("ocr-payment-screenshot", views.OcrPaymentScreenshotView.as_view(), name="ocr-payment-screenshot"),
```

Match existing `send_response` signature used elsewhere in `views.py` (adjust status kw if the helper differs — follow local pattern).

- [ ] **Step 5: Run tests**

```bash
./scripts/run_backend_tests.sh app_finance.tests.test_payment_group
```

Expected: PASS for preview tests.

---

## Task 4: Multi-part create on `scan-transaction-screenshots` (TDD)

**Files:**
- Modify: `schedjuice-reimagined-be/app_finance/views.py` (`AdminUploadScreenshotView`)
- Modify: `schedjuice-reimagined-be/app_finance/payment_group.py` (create helper)
- Modify: `schedjuice-reimagined-be/app_finance/tests/test_payment_group.py`

### Multipart field convention

Keep legacy flat body for 1 part.

For N parts (N ≥ 1), prefer explicit indexed fields when `parts_count` is present:

```
user, course, issued_at, billing_start_date, billing_end_date,
covered_months? | is_installment + installment_*,
parts_count=2,
part_0_screenshot, part_0_parsed_amount, part_0_payment_method, part_0_transaction_id?, part_0_date_on_screenshot?,
part_1_screenshot, part_1_parsed_amount, part_1_payment_method, ...
```

- [ ] **Step 1: Failing tests**

```python
class MultiPartPaymentCreateTests(...):
    @patch("app_finance.views.extract_receiver_ss_text_data.delay")
    def test_single_part_still_group_null(self, mock_ocr):
        # existing flat multipart payload → 1 UserPayment, group_id is None
        ...

    @patch("app_finance.views.extract_receiver_ss_text_data.delay")
    def test_two_parts_create_group(self, mock_ocr):
        # parts_count=2 with two screenshots + amounts + methods
        # assert UserPaymentGroup.objects.count()==1
        # assert group.parts.count()==2
        # assert sum(p.parsed_amount.amount for p in parts) == expected
        # mock_ocr not called when transaction_id+parsed_amount prefilled on both

    def test_rejects_duplicate_txn_within_submit(self):
        # same transaction_id on part_0 and part_1 → 400

    def test_all_or_nothing_on_invalid_part(self):
        # part_1 missing amount → 400 and zero payments/groups created
```

- [ ] **Step 2: Implement `create_user_payment_group_with_parts` in `payment_group.py`**

```python
from django.db import transaction
from app_finance.models import UserPayment, UserPaymentGroup
from app_finance.payment_coverage import sync_user_payment_covered_months
from app_finance.services import mark_receiver_side_screenshots_matched

@transaction.atomic
def create_user_payment_group_with_parts(
    *,
    actor,
    user,
    course,
    plan_fields: dict,          # issued_at, billing_*, is_installment, installment_percent
    coverage: list[dict] | None,
    parts: list[dict],          # each: screenshot, parsed_amount, payment_method, transaction_id?, ...
) -> UserPaymentGroup:
    if len(parts) < 2:
        raise ValueError("group requires >= 2 parts")
    txns = [p.get("transaction_id") for p in parts if p.get("transaction_id")]
    if len(txns) != len(set(txns)):
        raise ValueError("duplicate transaction_id within parts")

    group = UserPaymentGroup.objects.create(
        user=user, course=course, created_by=actor, **plan_fields,
    )
    for p in parts:
        up = UserPayment.objects.create(
            group=group,
            user=user,
            course=course,
            created_by=actor,
            screenshot=p["screenshot"],
            parsed_amount=p["parsed_amount"],
            payment_method=p["payment_method"],
            transaction_id=p.get("transaction_id"),
            date_on_screenshot=p.get("date_on_screenshot"),
            description=p.get("description"),
            remarks=p.get("remarks"),
            issued_at=plan_fields.get("issued_at"),
            billing_start_date=plan_fields.get("billing_start_date"),
            billing_end_date=plan_fields.get("billing_end_date"),
            is_installment=plan_fields.get("is_installment", False),
            installment_percent=plan_fields.get("installment_percent"),
            status=_initial_status_for_part(p),
        )
        if coverage is not None:
            sync_user_payment_covered_months(up, coverage)
        if up.transaction_id:
            mark_receiver_side_screenshots_matched(up.transaction_id, up)
    return group


def _initial_status_for_part(p: dict) -> str:
    if p.get("transaction_id") and UserPayment.objects.filter(
        transaction_id=p["transaction_id"]
    ).exists():
        return UserPayment.Status.DUPLICATED
    if p.get("transaction_id") and p.get("parsed_amount") is not None:
        return UserPayment.Status.PENDING_VERIFICATION
    if p.get("screenshot") and not p.get("transaction_id"):
        return UserPayment.Status.AWAITING_EXTRACTION
    return UserPayment.Status.PENDING_PAYMENT
```

Fix duplicate check: when creating part 2, part 1 may already exist in the same transaction — check within `parts` first (already done), then against DB excluding in-progress IDs as needed.

- [ ] **Step 3: Extend `AdminUploadScreenshotView.post`**

Pseudo-flow:

```python
def post(self, request):
    parts_count = request.data.get("parts_count")
    if parts_count is not None and int(parts_count) >= 2:
        return self._post_multipart_group(request, int(parts_count))
    # existing single-path serializer flow...
    saved = ss.save()
    prefilled = bool(saved.transaction_id and saved.parsed_amount is not None)
    if saved.screenshot and not prefilled:
        extract_receiver_ss_text_data.delay(saved.id, request.tenant.schema_name)
    elif saved.transaction_id:
        mark_receiver_side_screenshots_matched(saved.transaction_id, saved)
    return self.send_response(False, "success", {"data": {"id": saved.id, "group_id": None, ...}})
```

Also fix the existing bug: use `saved.id` not `ss.data["id"]` when queueing OCR.

Return real validation errors (stop swallowing `ss.errors` with only `print`) for the new multi-part path; for legacy single path, prefer returning errors too if safe for existing clients — at minimum multi-part must return 400 with message.

- [ ] **Step 4: Run tests**

```bash
./scripts/run_backend_tests.sh app_finance.tests.test_payment_group app_finance.tests.test_rbac_finance
```

Expected: PASS (RBAC upload tests still green).

---

## Task 5: Admin report group projection + overlap (TDD)

**Files:**
- Modify: `schedjuice-reimagined-be/app_finance/views.py` (`UserPaymentAdminReportView`)
- Modify: `schedjuice-reimagined-be/app_finance/payment_group.py`
- Modify: `schedjuice-reimagined-be/app_finance/tests/test_payment_group.py`

- [ ] **Step 1: Failing test**

Create a group with 2 parts in-month; call `POST /user-payments/admin-report` with month filter; assert:

- Exactly **one** non-synthetic row for that student–course (not two)
- `kind == "group"`
- `parsed_amount` == sum of parts
- `part_count == 2`
- `status` == rollup
- `month_overlap_duplicate_coverage` is False when only this group exists
- Two **standalone** payments same student–course still set overlap True (regression)

- [ ] **Step 2: Implement projection**

After building payment rows (or while iterating):

1. Prefetch `group` on payments (`select_related("group")`).
2. Partition rows: `group_id -> [payments]`.
3. For each group with ≥1 part in the result set, emit **one** projected dict:

```python
{
  "id": f"group-{group.id}",          # stable string id for grid keys
  "kind": "group",
  "group_id": group.id,
  "part_count": len(parts),
  "parts": [_admin_report_row(p) | {"kind": "payment"} for p in parts],
  "user": ...,
  "course": ...,
  "parsed_amount": sum(...),
  "status": rollup_payment_group_status([...]),
  "payment_method": _method_summary(parts),  # single {id,name} or {id: null, name: "Multiple"}
  "transaction_id": None,  # or f"{n} transactions"
  "screenshot": None,
  "covered_months": from first part / group plan,
  "is_installment": group.is_installment,
  "installment_percent": ...,
  # billing dates from group
}
```

4. Standalone payments (`group_id is None`): `kind: "payment"` as today with numeric `id`.
5. Overlap peer key: use `(user_id, course_id)` but count **logical** units — one per group + one per standalone payment (not per part). Implement `logical_payment_peer_key(row)`.

- [ ] **Step 3: Run tests**

```bash
./scripts/run_backend_tests.sh app_finance.tests.test_payment_group
```

Expected: PASS.

---

## Task 6: Group details endpoint + coverage lock

**Files:**
- Modify: `schedjuice-reimagined-be/app_finance/views.py`
- Modify: `schedjuice-reimagined-be/app_finance/urls.py`
- Modify: `schedjuice-reimagined-be/app_finance/serializers.py` (optional thin serializer)
- Modify: `schedjuice-reimagined-be/app_finance/tests/test_payment_group.py`

- [ ] **Step 1: `GET /api/v1/user-payment-groups/<id>`**

Returns group fields + nested parts (same shape as admin-report part rows). Permission: `payment.view` / `payment.view_all` consistent with payment details (follow `UserPaymentDetailsView` scoping).

- [ ] **Step 2: Coverage edit lock**

When updating coverage for a payment that has `group_id`, or when adding a group coverage update path: if **any** part status is `verified`, reject plan/coverage changes with 400.

For v1, if coverage edit UI only hits `PUT user-payments/<part_id>`, detect `instance.group_id` and apply update to **all parts in the group** + group billing fields, or reject with message to use group endpoint. Prefer: **reject per-part coverage edits when `group_id` set**; expose `PUT user-payment-groups/<id>` for coverage/plan only.

Minimal v1 acceptable shortcut: lock coverage dialog for `kind==="group"` rows in the FE until group PUT exists — but still add GET for drawer. Prefer implementing PUT in this task if small.

- [ ] **Step 3: Tests for GET + verified lock**

```bash
./scripts/run_backend_tests.sh app_finance.tests.test_payment_group
```

---

## Task 7: Update payment verification docs

**Files:**
- Modify: `schedjuice-reimagined-be/docs/PAYMENT_VERIFICATION_FLOW.md`

- [ ] **Step 1: Document**

Add short sections:

- Sync preview `POST /ocr-payment-screenshot`
- Multi-part create + `UserPaymentGroup`
- Verify still per-part `transaction_id`
- Admin report `kind: group | payment`

---

## Task 8: Frontend types + FormData/OCR helpers (TDD)

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/finances/student-payments-report.tsx`
- Create: `schedjuice-reimagined-fe/src/lib/finances/payment-group-utils.ts`
- Create: `schedjuice-reimagined-fe/src/lib/finances/payment-group-utils.test.ts`
- Modify: `schedjuice-reimagined-fe/src/lib/data-sheets/payment-row-utils.ts`
- Modify: `schedjuice-reimagined-fe/src/lib/data-sheets/payment-row-utils.test.ts`

- [ ] **Step 1: Extend `StudentPaymentAdminReportRow`**

```typescript
export type StudentPaymentAdminReportRow = {
  id: number | string;
  kind?: "payment" | "group";
  group_id?: number | null;
  part_count?: number;
  parts?: StudentPaymentAdminReportRow[];
  // ...existing fields
};
```

- [ ] **Step 2: Helpers + tests**

```typescript
// payment-group-utils.ts
export function sumPartAmounts(parts: { amount: number | null }[]): number {
  return parts.reduce((s, p) => s + (p.amount ?? 0), 0);
}

export function buildMultiPartPaymentFormData(args: {
  userId: number;
  courseId: number;
  planFields: Record<string, string>; // already-stringified issued_at, covered_months, etc.
  parts: Array<{
    file: File;
    parsedAmount: string;
    paymentMethodId: string;
    transactionId?: string;
    dateOnScreenshot?: string;
  }>;
}): FormData {
  const fd = new FormData();
  fd.append("user", String(args.userId));
  fd.append("course", String(args.courseId));
  for (const [k, v] of Object.entries(args.planFields)) {
    if (v !== undefined && v !== "") fd.append(k, v);
  }
  if (args.parts.length === 1) {
    const p = args.parts[0];
    fd.append("screenshot", p.file);
    fd.append("parsed_amount", p.parsedAmount);
    fd.append("payment_method", p.paymentMethodId);
    if (p.transactionId) fd.append("transaction_id", p.transactionId);
    if (p.dateOnScreenshot) fd.append("date_on_screenshot", p.dateOnScreenshot);
    return fd;
  }
  fd.append("parts_count", String(args.parts.length));
  args.parts.forEach((p, i) => {
    fd.append(`part_${i}_screenshot`, p.file);
    fd.append(`part_${i}_parsed_amount`, p.parsedAmount);
    fd.append(`part_${i}_payment_method`, p.paymentMethodId);
    if (p.transactionId) fd.append(`part_${i}_transaction_id`, p.transactionId);
    if (p.dateOnScreenshot) fd.append(`part_${i}_date_on_screenshot`, p.dateOnScreenshot);
  });
  return fd;
}

export function hasDuplicateTransactionIds(ids: Array<string | undefined>): boolean {
  const present = ids.map((x) => x?.trim()).filter(Boolean) as string[];
  return new Set(present).size !== present.length;
}
```

Vitest: single vs multi FormData keys; duplicate txn detection.

- [ ] **Step 3: Group-aware row utils**

- `isSyntheticPaymentRow`: unchanged (`"new"` in id)
- `isPaymentFieldEditable`: if `kind === "group"`, disable inline amount/txn edits (edit via drawer/parts) OR allow only non-part fields — **disable part-owned fields on group rows**
- Add `isGroupPaymentRow(row) => row.kind === "group" || String(row.id).startsWith("group-")`

- [ ] **Step 4: Run FE tests**

```bash
cd schedjuice-reimagined-fe
pnpm test src/lib/finances/payment-group-utils.test.ts src/lib/data-sheets/payment-row-utils.test.ts
```

Expected: PASS.

---

## Task 9: Upload page — sync OCR + progressive multi-part

**Files:**
- Modify: `schedjuice-reimagined-fe/src/app/(internal)/finances/student-payments/upload/page.tsx`

- [ ] **Step 1: Part state model**

Replace single `files` / amount / method / txn with:

```typescript
type UploadPart = {
  key: string;
  files: extendedFileType[];
  parsedAmount: string;
  paymentMethodId: string;
  transactionId: string;
  dateOnScreenshot: string;
  ocrStatus: "idle" | "loading" | "success" | "error";
  ocrError?: string;
  duplicateWarningId?: number | null;
};
```

Default: one part. Plan radios unchanged.

- [ ] **Step 2: Sync OCR on screenshot select**

When `part.files[0]` changes to a local file:

```typescript
const fd = new FormData();
fd.append("screenshot", file);
const res = await makePostRequest(
  "ocr-payment-screenshot",
  fd,
  {},
  { "Content-Type": "multipart/form-data" },
);
// on success: set amount, transactionId, dateOnScreenshot; ocrStatus=success
// on 422/error: ocrStatus=error; keep fields editable
```

Use an incrementing request id per part so stale responses are ignored.

While `ocrStatus === "loading"`, show loading on Amount / Transaction ID / Date fields; disable submit if any part is loading.

- [ ] **Step 3: Progressive UI**

- One part: no “Part 1” label (current look + OCR loading).
- Button **Add another screenshot** appends a part with `paymentMethodId` copied from part 0.
- When `parts.length > 1`, show Part N labels + **Total (sum)** live.
- Allow remove when `parts.length > 1`.
- Validate: each part has file, amount > 0, method; no duplicate txns client-side.

- [ ] **Step 4: Submit**

Use `buildMultiPartPaymentFormData`. Update success toast to: “Payment saved.” (OCR already done when preview succeeded).

- [ ] **Step 5: Manual smoke**

Run FE dev server; upload 1 screenshot → fields fill; add second → method prefilled; submit → land on grid with one row.

---

## Task 10: Grid one-row groups + Upload navigation

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/finances/student-payments-grid.tsx`
- Modify: `schedjuice-reimagined-fe/src/components/finances/payments-grid/payment-grid-cells.tsx`

- [ ] **Step 1: Wire `upload_screenshot`**

In `runAction`:

```typescript
case "upload_screenshot": {
  const qs = new URLSearchParams({
    courseId: String(row.course?.id ?? ""),
    userId: String(row.user?.id ?? ""),
    date: /* current report month ISO date already in page state */,
  });
  router.push(`/finances/student-payments/upload?${qs}`);
  break;
}
```

Pass `date` from the grid’s selected month (same query param the upload page already reads).

- [ ] **Step 2: Render group rows**

- Amount: `parsed_amount` (already summed by API)
- Status: rolled-up status string
- Method: `payment_method.name` (“Multiple” when API says so)
- Transaction: if `kind==="group"`, show `${part_count} transactions` (read-only)
- Screenshot/actions: show part count; viewing screenshot opens first part or expands drawer
- Disable inline create-style edits on group-owned fields via `isPaymentFieldEditable`

- [ ] **Step 3: Overlap chip**

Trust API `month_overlap_duplicate_coverage` (already group-aware after Task 5).

---

## Task 11: Drawer nested parts

**Files:**
- Modify: `schedjuice-reimagined-fe/src/components/finances/student-payments-drawer.tsx`
- Modify: `schedjuice-reimagined-fe/src/hooks/finances/use-student-payments-detail.ts`
- Modify: `schedjuice-reimagined-fe/src/lib/finances/student-payments-detail-utils.ts` (+ tests if summarize breaks)

- [ ] **Step 1: When row.kind === "group"**

Render a parent card (total, rollup status, course) and nested part rows (thumb, amount, method, txn, status).

- [ ] **Step 2: Summaries**

`summarizeStudentPayments` should count a group as **one** payment for “payment count”, but sum verified amounts across verified **parts** (or only count group when rollup is verified — match product: prefer sum of verified part amounts; count logical payments = groups + standalones).

Update `student-payments-detail-utils.test.ts` accordingly.

```bash
pnpm test src/lib/finances/student-payments-detail-utils.test.ts
```

---

## Task 12: End-to-end verification

- [ ] **Step 1: Backend suite for finance touchpoints**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_finance.tests.test_payment_group app_finance.tests.test_rbac_finance app_finance.tests.test_user_payment_security
```

Expected: PASS.

- [ ] **Step 2: Frontend unit tests**

```bash
cd schedjuice-reimagined-fe
pnpm test src/lib/finances/payment-group-utils.test.ts src/lib/data-sheets/payment-row-utils.test.ts src/lib/finances/student-payments-detail-utils.test.ts
```

Expected: PASS.

- [ ] **Step 3: Manual checklist**

1. Single upload (no “Add another”) — creates `group=null`; grid one row  
2. Two screenshots different methods — one grid row; drawer shows 2 parts  
3. OCR fills txn+amount on drop; failure allows manual entry  
4. CSV verify one txn → that part verified; group status not fully verified until both done  
5. Overlap chip does not appear for parts of the same group alone  

---

## Spec coverage checklist

| Spec requirement | Task |
| --- | --- |
| `UserPaymentGroup` + parts FK | 1, 4 |
| Single-part `group=null` first-class | 4 |
| Per-part amount; total = sum | 4, 8, 9 |
| Per-part method; prefills from part 1 | 9 |
| Per-part verify; group verified iff all | 2, 5, CSV unchanged |
| Admin upload only | 4, 9 (no make-payment changes) |
| Progressive upload UX | 9 |
| Sync OCR preview, no poll | 3, 9 |
| Skip re-OCR when prefilled | 4 |
| Grid one row + rollup | 5, 10 |
| Coverage on group; lock if any verified | 6, 10 |
| Receipts stay per-part | (no code; out of scope) |
| Wire Upload action | 10 |

---

## Placeholder / consistency self-review

- Field naming locked: `parts_count`, `part_{i}_screenshot`, `part_{i}_parsed_amount`, `part_{i}_payment_method`, `part_{i}_transaction_id`, `part_{i}_date_on_screenshot`
- Report ids: standalone numeric; groups `group-{id}` string with `group_id` number
- `rollup_payment_group_status` priority matches spec (+ `awaiting_metadata_extraction` for existing enum)
- No async preview / student multi-part / combined receipt in tasks
