# CB Payment Screenshot OCR — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-extract CB Bank (CBPay) transaction ID and amount from payment screenshots with full KPay parity (sync preview, async create, retry), using OCR-text auto-detection with no frontend changes.

**Architecture:** Add shared `detect_and_extract(ocr_response)` in `app_finance/services.py` that tries KPay first (20-digit txn via existing line-based `extract_kpay`), then CB (`FT[A-Z0-9]{8,12}` + label-first amount on `ParsedText`). Refactor `preview_kpay_screenshot` and `extract_receiver_ss_text_data` to call the detector. Keep `/ocr-payment-screenshot` URL and response shape unchanged; preserve existing `payment_kind` staff/student duplicate lookup.

**Tech Stack:** Django, OCR.space client (`app_finance/ocr_client.py`), django-q async tasks, pytest-style Django `TestCase`.

**Spec:** `docs/superpowers/specs/2026-07-23-cb-payment-ocr-design.md`

## Global Constraints

- Bank routing: auto-detect from OCR text (no `payment_method` param)
- Detection order: KPay first (20-digit txn ID), then CB (`FT…`)
- Scope: preview + async create + retry-extraction
- CB txn ID: starts with `FT`; nominal length 12; regex allows **10–14** total chars (`\bFT[A-Z0-9]{8,12}\b`)
- CB amount: label `Amount` first; fallback to largest-number heuristic
- `date_on_screenshot`: skip for now (`null`)
- API URL: keep `POST /ocr-payment-screenshot` unchanged
- Backend tests: `cd schedjuice-reimagined-be && ./scripts/run_backend_tests.sh <target>` (always `--keepdb --noinput`)
- Do **not** commit unless the user explicitly asks

---

## File Structure

| File | Responsibility |
| --- | --- |
| `app_finance/ocr.py` | CB txn regex tightening, label-first amount helper, `extract_cb()` returning KPay-compatible shape |
| `app_finance/services.py` | `detect_and_extract()`, refactor preview + async extraction |
| `app_finance/views.py` | No URL change; optional rename import only |
| `app_finance/tests/test_cb_payment_ocr.py` | High-value unit tests (fixtures, no live OCR) |
| `app_finance/tests/test_payment_group.py` | Extend existing preview integration test for CB mock path |
| `docs/PAYMENT_VERIFICATION_FLOW.md` | Document CB auto-detect |

---

## Shared fixtures (reuse in tests)

Add to `app_finance/tests/test_cb_payment_ocr.py`:

```python
CB_RECEIPT_TEXT_1 = """
E-Receipt
Transfer Complete!
Amount
165,000.00 MMK
Fee
41 MMK
Transaction Date
Jul 07, 2026 | 20:58
Transaction ID
FT26189161K4
Reason
Salary
""".strip()

CB_RECEIPT_TEXT_2 = """
E-Receipt
Transfer Complete!
Amount 165,000.00 MMK
Fee 41 MMK
Transaction ID FT26131M13HZ
""".strip()

CB_RECEIPT_INLINE_AMOUNT = """
Transfer Complete!
Amount              165,000.00 MMK
Fee                 41 MMK
Transaction ID      FT26189161K4
""".strip()

KPAY_OCR_RESPONSE = {
    "ParsedResults": [
        {
            "ParsedText": "12345678901234567890\n50,000.00 ks",
            "TextOverlay": {
                "Lines": [
                    {"LineText": "12345678901234567890"},
                    {"LineText": "50,000.00 ks"},
                ]
            },
        }
    ]
}

CB_OCR_RESPONSE = {
    "ParsedResults": [
        {
            "ParsedText": CB_RECEIPT_INLINE_AMOUNT,
            "TextOverlay": {"Lines": []},
        }
    ]
}
```

---

### Task 1: CB extractors in `ocr.py`

**Files:**
- Modify: `schedjuice-reimagined-be/app_finance/ocr.py`
- Create: `schedjuice-reimagined-be/app_finance/tests/test_cb_payment_ocr.py`

**Interfaces:**
- Produces:
  - `CB_TXN_ID_PATTERN = re.compile(r"\bFT[A-Z0-9]{8,12}\b")`
  - `extract_cb_transaction_id(text: str) -> str | None`
  - `extract_cb_labeled_amount(text: str) -> float | None`
  - `extract_cb(parsed_text: str) -> dict` → `{"transaction_id": str|None, "amount": list[float]}`

- [ ] **Step 1: Write failing tests**

Create `app_finance/tests/test_cb_payment_ocr.py`:

```python
from django.test import SimpleTestCase

from app_finance.ocr import (
    extract_cb,
    extract_cb_labeled_amount,
    extract_cb_transaction_id,
)
from app_finance.tests.test_cb_payment_ocr_fixtures import (
    CB_RECEIPT_INLINE_AMOUNT,
    CB_RECEIPT_TEXT_1,
    CB_RECEIPT_TEXT_2,
)


class CbOcrExtractorTests(SimpleTestCase):
    def test_extract_cb_transaction_id_sample_receipts(self):
        self.assertEqual(
            extract_cb_transaction_id(CB_RECEIPT_TEXT_1),
            "FT26189161K4",
        )
        self.assertEqual(
            extract_cb_transaction_id(CB_RECEIPT_TEXT_2),
            "FT26131M13HZ",
        )

    def test_extract_cb_transaction_id_accepts_11_char_buffer(self):
        text = "Transaction ID FT26189161K"
        self.assertEqual(extract_cb_transaction_id(text), "FT26189161K")

    def test_extract_cb_labeled_amount_prefers_amount_not_fee(self):
        self.assertEqual(
            extract_cb_labeled_amount(CB_RECEIPT_INLINE_AMOUNT),
            165000.0,
        )

    def test_extract_cb_returns_txn_and_amount(self):
        result = extract_cb(CB_RECEIPT_INLINE_AMOUNT)
        self.assertEqual(result["transaction_id"], "FT26189161K4")
        self.assertEqual(result["amount"], [165000.0])

    def test_extract_cb_fallback_largest_number_when_label_missing(self):
        text = """
Transfer Complete!
165,000.00 MMK
Fee 41 MMK
Transaction ID FT26189161K4
""".strip()
        result = extract_cb(text)
        self.assertEqual(result["amount"], [165000.0])
```

Also create `app_finance/tests/test_cb_payment_ocr_fixtures.py` with the shared fixture strings from this plan.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_finance.tests.test_cb_payment_ocr
```

Expected: FAIL (`extract_cb` not defined or wrong txn regex)

- [ ] **Step 3: Implement CB extractors**

In `app_finance/ocr.py`, replace `extract_cb_transaction_id` and add helpers:

```python
CB_TXN_ID_PATTERN = re.compile(r"\bFT[A-Z0-9]{8,12}\b")


def extract_cb_transaction_id(text: str) -> str | None:
    if not text:
        return None
    labeled = re.search(
        r"Transaction\s*ID[^\n]*\n?\s*(FT[A-Z0-9]{8,12})\b",
        text,
        re.IGNORECASE,
    )
    if labeled:
        return labeled.group(1)
    match = CB_TXN_ID_PATTERN.search(text)
    return match.group(0) if match else None


def extract_cb_labeled_amount(text: str) -> float | None:
    if not text:
        return None
    patterns = [
        r"Amount\s*\n\s*([\d.,\s]+)",
        r"Amount\s+([\d.,\s]+)\s*MMK?",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return normalize_number(match.group(1))
    return None


def extract_cb(parsed_text: str) -> dict:
    transaction_id = extract_cb_transaction_id(parsed_text)
    amount = extract_cb_labeled_amount(parsed_text)
    if amount is None and parsed_text:
        amount = extract_cb_amount(parsed_text)
    return {
        "transaction_id": transaction_id,
        "amount": [amount] if amount is not None else [],
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
./scripts/run_backend_tests.sh app_finance.tests.test_cb_payment_ocr
```

Expected: PASS

---

### Task 2: `detect_and_extract()` shared detector

**Files:**
- Modify: `schedjuice-reimagined-be/app_finance/services.py`
- Modify: `schedjuice-reimagined-be/app_finance/tests/test_cb_payment_ocr.py`

**Interfaces:**
- Consumes: `extract_kpay(lines)`, `extract_cb(parsed_text)` from Task 1
- Produces:
  - `detect_and_extract(raw_ocr_response: dict) -> dict | None`
    - Returns `None` when `ParsedResults` missing/empty
    - On success: `{"bank": "KPAY"|"CB", "transaction_id": str, "amount": list[float], "json_ocr_data": dict}`
    - On no match: `{"bank": None, "transaction_id": None, "amount": [], "json_ocr_data": dict}`

- [ ] **Step 1: Write failing tests**

Append to `test_cb_payment_ocr.py`:

```python
from app_finance.services import detect_and_extract
from app_finance.tests.test_cb_payment_ocr_fixtures import (
    CB_OCR_RESPONSE,
    KPAY_OCR_RESPONSE,
)


class DetectAndExtractTests(SimpleTestCase):
    def test_detect_kpay_from_lines(self):
        result = detect_and_extract(KPAY_OCR_RESPONSE)
        self.assertEqual(result["bank"], "KPAY")
        self.assertEqual(result["transaction_id"], "12345678901234567890")
        self.assertEqual(result["amount"], [50000.0])

    def test_detect_cb_from_parsed_text(self):
        result = detect_and_extract(CB_OCR_RESPONSE)
        self.assertEqual(result["bank"], "CB")
        self.assertEqual(result["transaction_id"], "FT26189161K4")
        self.assertEqual(result["amount"], [165000.0])

    def test_kpay_wins_when_both_patterns_present(self):
        mixed = {
            "ParsedResults": [
                {
                    "ParsedText": "12345678901234567890 FT26189161K4",
                    "TextOverlay": {
                        "Lines": [
                            {"LineText": "12345678901234567890"},
                            {"LineText": "50,000.00 ks"},
                        ]
                    },
                }
            ]
        }
        result = detect_and_extract(mixed)
        self.assertEqual(result["bank"], "KPAY")

    def test_unrecognized_returns_empty_amount(self):
        result = detect_and_extract(
            {"ParsedResults": [{"ParsedText": "Transfer Complete!", "TextOverlay": {"Lines": []}}]}
        )
        self.assertIsNone(result["bank"])
        self.assertEqual(result["amount"], [])
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
./scripts/run_backend_tests.sh app_finance.tests.test_cb_payment_ocr.DetectAndExtractTests
```

Expected: FAIL (`detect_and_extract` not defined)

- [ ] **Step 3: Implement detector**

In `app_finance/services.py`, import `extract_cb` from `app_finance.ocr` and add:

```python
def detect_and_extract(raw_ocr_response: dict) -> dict | None:
    parsed_results = raw_ocr_response.get("ParsedResults") or []
    if not parsed_results:
        return None

    first = parsed_results[0]
    lines = (first.get("TextOverlay") or {}).get("Lines") or []
    parsed_text = first.get("ParsedText") or ""

    if lines:
        kpay_data = extract_kpay(lines)
        if kpay_data["transaction_id"] and kpay_data["amount"]:
            return {
                "bank": "KPAY",
                "transaction_id": kpay_data["transaction_id"],
                "amount": kpay_data["amount"],
                "json_ocr_data": kpay_data,
            }

    if re.search(r"\b\d{20}\b", parsed_text):
        kpay_data = extract_kpay(
            [{"LineText": line} for line in parsed_text.splitlines()]
        )
        if kpay_data["transaction_id"] and kpay_data["amount"]:
            return {
                "bank": "KPAY",
                "transaction_id": kpay_data["transaction_id"],
                "amount": kpay_data["amount"],
                "json_ocr_data": kpay_data,
            }

    cb_data = extract_cb(parsed_text)
    if cb_data["transaction_id"] and cb_data["amount"]:
        return {
            "bank": "CB",
            "transaction_id": cb_data["transaction_id"],
            "amount": cb_data["amount"],
            "json_ocr_data": cb_data,
        }

    return {
        "bank": None,
        "transaction_id": None,
        "amount": [],
        "json_ocr_data": {"parsed_text": parsed_text, "lines": lines},
    }
```

- [ ] **Step 4: Run tests**

Run:

```bash
./scripts/run_backend_tests.sh app_finance.tests.test_cb_payment_ocr
```

Expected: PASS

---

### Task 3: Refactor sync preview (`preview_kpay_screenshot`)

**Files:**
- Modify: `schedjuice-reimagined-be/app_finance/services.py`
- Modify: `schedjuice-reimagined-be/app_finance/tests/test_cb_payment_ocr.py`

**Interfaces:**
- Consumes: `detect_and_extract`, existing duplicate lookup by `payment_kind`
- Produces: `preview_kpay_screenshot(...)` unchanged signature; internally uses detector

- [ ] **Step 1: Write failing preview test**

Append to `test_cb_payment_ocr.py`:

```python
from unittest.mock import patch

from app_finance.services import preview_kpay_screenshot


class PreviewPaymentScreenshotTests(SimpleTestCase):
    @patch("app_finance.services.image_file_to_text")
    def test_preview_cb_screenshot(self, mock_ocr):
        mock_ocr.return_value = CB_OCR_RESPONSE
        result = preview_kpay_screenshot(b"fake", filename="cb.jpg")
        self.assertTrue(result["ok"])
        self.assertEqual(result["transaction_id"], "FT26189161K4")
        self.assertEqual(result["parsed_amount"], 165000.0)
        self.assertIsNone(result["date_on_screenshot"])
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
./scripts/run_backend_tests.sh app_finance.tests.test_cb_payment_ocr.PreviewPaymentScreenshotTests
```

Expected: FAIL (`ok` is False)

- [ ] **Step 3: Refactor preview helper**

Replace KPay-only body of `preview_kpay_screenshot` with:

```python
raw_texts = image_file_to_text(file_obj, filename=filename)
detected = detect_and_extract(raw_texts)
if detected is None:
    raise ValueError("OCR returned no ParsedResults")

transaction_id = detected["transaction_id"]
amounts = detected["amount"]
# duplicate lookup unchanged (StaffPayment vs UserPayment by payment_kind)
return {
    "ok": bool(transaction_id and amounts),
    "transaction_id": transaction_id,
    "parsed_amount": amounts[0] if amounts else None,
    "date_on_screenshot": None,
    "duplicate_of_payment_id": duplicate.id if duplicate else None,
    "json_ocr_data": detected["json_ocr_data"],
    **(
        {}
        if transaction_id and amounts
        else {"error": "Could not extract payment details."}
    ),
}
```

Keep existing `except OcrError` / generic `except` blocks and `payment_kind` duplicate logic intact.

- [ ] **Step 4: Run preview-related tests**

Run:

```bash
./scripts/run_backend_tests.sh app_finance.tests.test_cb_payment_ocr.PreviewPaymentScreenshotTests
./scripts/run_backend_tests.sh app_finance.tests.test_payment_group.OcrPaymentScreenshotViewTests.test_staff_duplicate_lookup_uses_staff_payment
```

Expected: PASS (KPay staff duplicate regression still green)

---

### Task 4: Refactor async extraction (`extract_receiver_ss_text_data`)

**Files:**
- Modify: `schedjuice-reimagined-be/app_finance/services.py`
- Modify: `schedjuice-reimagined-be/app_finance/tests/test_cb_payment_ocr.py`

**Interfaces:**
- Consumes: `detect_and_extract`, existing status transitions + `mark_receiver_side_screenshots_matched`

- [ ] **Step 1: Write failing async test**

Append integration-style test (mock OCR URL fetch):

```python
import unittest
from datetime import date
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone
from djmoney.money import Money
from tenant_schemas.utils import schema_context

from app_finance.models import PaymentBank, PaymentMethod, UserPayment
from app_finance.services import extract_receiver_ss_text_data
from app_auth.models import User
from app_course.models import Course
from app_rbac.seeding import seed_rbac


def _database_reachable() -> bool:
    try:
        from django.db import connection

        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class ExtractReceiverSsTextDataCbTests(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    @patch("app_finance.services.image_to_text")
    def test_cb_screenshot_sets_pending_verification(self, mock_ocr):
        mock_ocr.return_value = CB_OCR_RESPONSE
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            seed_rbac()
            finance = User.objects.create_user(
                email=f"fin-cb-{suffix}@example.com",
                password="x",
                name="Finance CB",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.FINANCE],
            )
            student = User.objects.create_user(
                email=f"stu-cb-{suffix}@example.com",
                password="x",
                name="Student CB",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            course = Course.objects.create(
                title=f"CB Course {suffix}",
                code=f"CB-{suffix}",
                created_by=finance,
            )
            method = PaymentMethod.objects.create(
                name=f"CB {suffix}",
                payment_bank=PaymentBank.CB,
            )
            up = UserPayment.objects.create(
                user=student,
                course=course,
                payment_method=method,
                screenshot="payments/test-cb.jpg",
                status=UserPayment.Status.AWAITING_EXTRACTION,
            )
            payment_id = up.id

        extract_receiver_ss_text_data(payment_id, self.schema_name)

        with schema_context(self.schema_name):
            up.refresh_from_db()
            self.assertEqual(up.transaction_id, "FT26189161K4")
            self.assertEqual(up.parsed_amount, Money(165000, "USD"))
            self.assertEqual(up.status, UserPayment.Status.PENDING_VERIFICATION)
```

Adjust imports/helpers to match existing test patterns in `test_payment_group.py` if names differ.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
./scripts/run_backend_tests.sh app_finance.tests.test_cb_payment_ocr.ExtractReceiverSsTextDataCbTests
```

Expected: FAIL (status stays `AWAITING_EXTRACTION` or `CANNOT_EXTRACT`)

- [ ] **Step 3: Refactor async task**

In `extract_receiver_ss_text_data`, replace KPay-only block with:

```python
raw_texts = image_to_text(ss_obj.screenshot.url)
detected = detect_and_extract(raw_texts)
if detected is None or not detected.get("transaction_id") or not detected.get("amount"):
    ss_obj.status = UserPayment.Status.CANNOT_EXTRACT
    if raw_texts is not None:
        ss_obj.json_ocr_data = raw_texts
    ss_obj.save()
    return

text_data = detected["json_ocr_data"]
transaction_id = detected["transaction_id"]
# existing duplicate + pending_verification branches unchanged, using text_data["amount"][0]
```

Remove comment `# available for kpay only for now`.

- [ ] **Step 4: Run async test + payment group regressions**

Run:

```bash
./scripts/run_backend_tests.sh app_finance.tests.test_cb_payment_ocr.ExtractReceiverSsTextDataCbTests
./scripts/run_backend_tests.sh app_finance.tests.test_payment_group
```

Expected: PASS

---

### Task 5: Docs update

**Files:**
- Modify: `schedjuice-reimagined-be/docs/PAYMENT_VERIFICATION_FLOW.md`

- [ ] **Step 1: Update OCR preview section**

Under `POST /ocr-payment-screenshot`, replace “Runs sync KPay OCR” with:

> Runs sync OCR with auto-detection: KPay (20-digit transaction ID) first, then CB Bank (`FT…` transaction ID). Does not create or update a payment row.

Under async extraction notes, add:

> `extract_receiver_ss_text_data` uses the same auto-detection path as preview (KPay then CB).

- [ ] **Step 2: Sanity read**

Confirm no references still claim “KPay only” for preview/async.

---

## Verification checklist (run before calling done)

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_finance.tests.test_cb_payment_ocr
./scripts/run_backend_tests.sh app_finance.tests.test_payment_group.OcrPaymentScreenshotViewTests
```

Manual smoke (optional, requires OCR API key):

1. Upload CB E-Receipt on `/finances/student-payments/upload`
2. Confirm transaction ID + amount auto-fill
3. Upload KPay screenshot — confirm no regression

---

## Spec self-review (plan vs spec)

| Spec requirement | Plan task |
| --- | --- |
| Auto-detect, KPay then CB | Task 2 |
| CB txn regex 10–14 chars | Task 1 |
| Label amount + fallback | Task 1 |
| Full preview + async + retry parity | Tasks 3–4 |
| No FE changes | No FE tasks |
| `date_on_screenshot` null | Tasks 3–4 preserve null |
| High-value tests | Tasks 1–4 |
| Docs | Task 5 |

No placeholders. Type shapes consistent: `extract_cb` and `extract_kpay` both expose `amount: list[float]` consumed by preview/async.
