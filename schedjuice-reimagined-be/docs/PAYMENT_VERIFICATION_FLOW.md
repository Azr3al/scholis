# Payment Verification Flow

Concise reference for payment verification: sender screenshots (UserPayment) ↔ receiver CSV (ReceiverSideScreenshot) matching.

---

## Base URL & Auth

- **Base path**: `api/v1/`
- **Tenant header**: `X-Tenant` or `Tenant` with schema name
- **Auth**: JWT Bearer token

---

## Models

### UserPaymentGroup (multi-part)

Logical payment when a student pays in 2+ parts. Created only when `parts_count ≥ 2`; single-part uploads keep `UserPayment.group = null`.

| Field | Type | Notes |
|-------|------|-------|
| `id` | int | PK |
| `user`, `course`, `created_by` | FK | Shared across parts |
| `issued_at`, `billing_start_date`, `billing_end_date` | datetime, nullable | Plan / coverage authority |
| `is_installment`, `installment_percent` | bool / decimal | Installment metadata |

### UserPayment (sender-side)

| Field | Type | Notes |
|-------|------|-------|
| `id` | int | PK |
| `transaction_id` | string, nullable | From OCR on screenshot |
| `status` | enum | `pending_payment`, `awaiting_extraction`, `pending_verification`, `verified`, `amount_mismatch`, `duplicated`, `cannot_extract` |
| `parsed_amount` | Money, nullable | OCR-extracted amount |
| `actual_amount` | Money, nullable | From verification CSV |
| `screenshot` | Image, nullable | Sender upload (or from Teams submission sync) |
| `microsoft_submission_id` | string, nullable, unique | MS Teams submission ID when synced from payment assignment |
| `user`, `course`, `payment_method` | FK | Expandable |
| `group` | FK → UserPaymentGroup, nullable | Set when part of a multi-part payment; null for standalone |
| `receiver_side_screenshot` | OneToOne (reverse) | Populated when matched |

### ReceiverSideScreenshot (receiver-side)

| Field | Type | Notes |
|-------|------|-------|
| `id` | int | PK |
| `transaction_id` | string | From CSV |
| `is_matched` | bool | True if linked to UserPayment |
| `user_payment` | OneToOne → UserPayment, nullable | Populated when matched |

---

## Flow Overview

1. **Sender uploads screenshot** → `POST /scan-transaction-screenshots` (single part) or multi-part with `parts_count` → UserPayment(s) created; async OCR if needed.
2. **Optional sync OCR preview** → `POST /ocr-payment-screenshot` runs OCR on one screenshot without persisting (used before submit on upload UI).
3. **Admin uploads receiver CSV** → Frontend parses CSV → POST to `/verify-screenshots` with JSON array.
4. **Verify** → Creates ReceiverSideScreenshot per row; matches by `transaction_id` per UserPayment part (unchanged); updates each part’s `actual_amount` and `status`. Multi-part groups are not matched as a unit.
5. **Reverse match** → When OCR sets `transaction_id` on UserPayment, any existing ReceiverSideScreenshot with that ID is marked matched and linked. When matched, `UserPayment.status` is set to `verified`.
6. **On UserPayment update** → `UserPaymentDetailsView.put` and `StudentMakePaymentView.post` call `mark_receiver_side_screenshots_matched` after save when `transaction_id` is set. If a match is found, `UserPayment.status` is set to `verified`.
7. **Admin report** → One row per standalone payment or per `UserPaymentGroup` (parts nested under group rows).

---

## API Endpoints

### Verify Screenshots (bulk)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/verify-screenshots` | Submit parsed CSV data; creates ReceiverSideScreenshots; matches and updates UserPayments |

**Request body** (array of objects):
```json
[
  {"transaction_id": "12345678901234567890", "date": "2025-02-01T00:00:00Z", "amount": 150000},
  {"transaction_id": "09876543210987654321", "date": "2025-02-02T00:00:00Z", "amount": 200000}
]
```

**Response**: `{"isError": false, "message": "verification completed", ...}` (201)

---

### ReceiverSideScreenshot CRUD

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/receiver-side-screenshots` | List (paginated) |
| POST | `/receiver-side-screenshots` | Create one |
| POST | `/receiver-side-screenshots?bulk=true` | Bulk create (`objects` array in body) |
| GET | `/receiver-side-screenshots/<id>` | Get one |
| PUT | `/receiver-side-screenshots/<id>` | Update |
| DELETE | `/receiver-side-screenshots/<id>` | Delete |
| POST | `/receiver-side-screenshots/search` | Search with filters |

**Create body**:
```json
{
  "transaction_id": "12345678901234567890",
  "is_matched": false,
  "user_payment": null
}
```

**Search body**:
```json
{
  "filter_params": [
    {"field_name": "transaction_id", "operator": "exact", "value": "123..."},
    {"field_name": "is_matched", "operator": "exact", "value": "false"}
  ]
}
```

**Expand**: `user_payment` (e.g. `expand=WyJ1c2VyX3BheW1lbnQiXQ==` for `["user_payment"]`)

---

### OCR preview (sync, no persist)

| Method | Endpoint | Permission |
|--------|----------|------------|
| POST | `/ocr-payment-screenshot` | `payment.record` |

Multipart body with `screenshot` file. Runs sync OCR with auto-detection: KPay (20-digit transaction ID) first, then CB Bank (`FT…` transaction ID). **Does not** create or update a UserPayment.

**Response** (`data`): `transaction_id`, `parsed_amount`, `date_on_screenshot`, `duplicate_of_payment_id`, `json_ocr_data`, `ok`. Returns 422 when OCR cannot extract required fields.

---

### Student checkout (`POST /make-payment` with `checkout=1`)

| Method | Endpoint | Permission |
|--------|----------|------------|
| POST | `/make-payment` | `payment.make` |

**Legacy single invoice** (unchanged): `id`, `screenshot`, optional OCR fields (`ocr_event_id`, `transaction_id`, `parsed_amount`, `date_on_screenshot`).

**Multi-invoice checkout** (`checkout=1`):

```
checkout=1
payment_ids_count=N
payment_id_0=...
screenshots_count=M
screenshot_0_screenshot=<file>
screenshot_0_parsed_amount=...   (optional, from hidden student OCR)
screenshot_0_transaction_id=...
screenshot_0_ocr_event_id=...
```

Server infers screenshot→invoice allocations when the client omits `allocations_count`. Never rejects checkout when OCR amount ≠ cart total. Creates `UserPaymentGroup` (`multi_course` or `split_screenshots`) when needed.

---

### Scan transaction screenshots (create)

| Method | Endpoint | Permission |
|--------|----------|------------|
| POST | `/scan-transaction-screenshots` | `payment.record` |

**Single part** (default): same as before — one UserPayment, `group_id: null` in response; async OCR if screenshot present and fields not prefilled. `extract_receiver_ss_text_data` uses the same auto-detection path as preview (KPay then CB).

**Multi-part** (`parts_count ≥ 2`): multipart body with shared `user`, `course`, plan/coverage fields plus indexed part fields:

```
parts_count=2
part_0_screenshot, part_0_parsed_amount, part_0_payment_method, part_0_transaction_id?, part_0_date_on_screenshot?
part_1_screenshot, part_1_parsed_amount, part_1_payment_method, ...
```

Creates one `UserPaymentGroup` and N `UserPayment` parts (`group` FK set). Response: `group_id`, `part_ids`. Validation is atomic (duplicate `transaction_id` across parts or missing required fields → 400, nothing created).

---

### UserPayment (relevant)

| Method | Endpoint |
|--------|----------|
| POST | `/user-payments/<id>/retry-extraction` | Re-queue OCR for `cannot_extract` rows (manager+; requires screenshot) |
| GET | `/user-payments/<id>` | Get one |
| POST | `/user-payments/search` | Search |
| POST | `/user-payments/admin-report` | Admin report (requires `course_id__exact` in filter_params) |

**Admin report rows** include `kind`:

- `"payment"` — standalone `UserPayment` (`group_id` null)
- `"group"` — one row per `UserPaymentGroup`; `id` is `group-{id}`, `parts` array holds nested per-part rows (each `kind: "payment"`), rolled-up `status` and summed `parsed_amount`

Verification CSV flow is unchanged: each part is matched independently by its own `transaction_id`.

---

## Response Format

```json
{
  "isError": false,
  "message": "success",
  "data": [...],
  "links": {"next": "...", "previous": "..."},
  "count": 42,
  "count_per_page": 10,
  "total_pages": 5
}
```

---

## Key Files

| File | Purpose |
|------|---------|
| `app_finance/models.py` | UserPaymentGroup, UserPayment, ReceiverSideScreenshot |
| `app_finance/views.py` | VerifyScreenshotsView, ReceiverSideScreenshot CRUD, AdminUploadScreenshotView, OcrPaymentScreenshotView, RetryUserPaymentExtractionView |
| `app_finance/payment_group.py` | create_user_payment_group_with_parts, admin report group projection |
| `app_finance/services.py` | preview_kpay_screenshot, extract_receiver_ss_text_data, mark_receiver_side_screenshots_matched |
| `app_finance/serializers.py` | VerifyScreenshotSerializer, ReceiverSideScreenshotSerializer |
