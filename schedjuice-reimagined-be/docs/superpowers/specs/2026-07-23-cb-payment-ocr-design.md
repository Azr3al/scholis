# CB Payment Screenshot OCR — Design Spec

**Date:** 2026-07-23  
**Status:** Approved for planning  
**Surface:** Admin student-payments upload, async payment create, retry extraction  
**Related:** `docs/superpowers/specs/2026-07-10-multipart-student-payments-ocr-design.md`; `docs/PAYMENT_VERIFICATION_FLOW.md`; `finace_automation.md`

## Summary

Extend the existing payment-screenshot OCR pipeline so **CB Bank (CBPay) E-Receipts** auto-extract `transaction_id` and `parsed_amount`, with **full parity to KPay**: sync upload preview, async create fallback, and retry extraction. Bank type is **auto-detected from OCR text** — no frontend changes.

## Confirmed decisions

| Topic | Decision |
|-------|----------|
| Bank routing | Auto-detect from OCR text (no `payment_method` param) |
| Detection order | KPay first (20-digit txn ID), then CB (`FT…`) |
| Scope | Preview + async create + retry-extraction |
| CB txn ID | Starts with `FT`; nominal length 12; regex allows **10–14** total chars for OCR noise |
| CB amount | Label `Amount` first; fallback to largest-number heuristic |
| `date_on_screenshot` | Skip for now (`null`, same as KPay preview today) |
| API URL | Keep `POST /ocr-payment-screenshot` unchanged |
| Approach | Centralized detector + bank-specific extractors (recommended) |

## Goals / non-goals

**Goals**

- CB E-Receipt screenshots (CBPay watermarked, “Transfer Complete!” layout) extract txn ID and amount on upload.
- Same response contract as KPay preview (`transaction_id`, `parsed_amount`, `duplicate_of_payment_id`, `ok`).
- Async `extract_receiver_ss_text_data` and retry-extraction work for CB without new endpoints.
- KPay behavior unchanged (regression-safe).

**Non-goals**

- AYA / KBZ OCR in this change
- `date_on_screenshot` parsing from CB receipts
- Frontend payment-method hinting or new OCR endpoints
- Receiver-side CB history OCR / verification (txn ID match on uploaded part is unchanged)
- Deep-learning bank classification

## Sample CB receipt (reference)

CBPay E-Receipt layout (from production samples):

```
E-Receipt
Transfer Complete!

Transfer from …
Transfer to …

Transaction Detail
Amount              165,000.00 MMK
Fee                 41 MMK
Schedule Date       Jul 08, 2026
Transaction Date    Jul 07, 2026 | 20:58
Transaction ID      FT26189161K4
Reason              Salary
```

Example txn IDs: `FT26189161K4`, `FT26131M13HZ` (12 chars).

## Architecture

```
Screenshot file
    │
    ▼
OCR.space (existing ocr_client)
    │  ParsedText + TextOverlay Lines
    ▼
detect_and_extract(ocr_response)          ← new shared entry point
    │
    ├─ 20-digit txn in text/lines? ──► extract_kpay(lines)     [existing]
    │
    ├─ FT[A-Z0-9]{8,12} in text?   ──► extract_cb(parsed_text) [improved]
    │
    └─ neither ──► ok: false

Used by:
  • preview_payment_screenshot()     (sync, no persist)
  • extract_receiver_ss_text_data()  (async, on create / retry)
```

### Why centralized detection

- One OCR call, one detection path, one test surface.
- Preview and async create cannot drift (today async is KPay-only while preview is too).
- Retry-extraction already delegates to `extract_receiver_ss_text_data` — no endpoint work.

## Extraction rules

### KPay (unchanged)

- Trigger: `\b\d{20}\b` in OCR output.
- Parser: existing `extract_kpay(TextOverlay Lines)` — txn ID line + amount lines ending in `Ks`.

### CB (new / improved)

**Transaction ID**

```python
CB_TXN_ID_PATTERN = re.compile(r"\bFT[A-Z0-9]{8,12}\b")
```

- Total match length: 10–14 characters (`FT` + 8–12 alphanumerics).
- If multiple matches, prefer the match on a line containing `Transaction ID` (case-insensitive); else first match in document order.

**Amount**

1. **Label-first** (new primary path), patterns on `ParsedText`:

   ```python
   r"Amount\s*\n\s*([\d.,\s]+)"           # label on own line
   r"Amount\s+([\d.,\s]+)\s*MMK?"          # inline
   ```

   Normalize captured group via existing `normalize_number()`.

2. **Fallback**: existing `extract_cb_amount()` largest-number heuristic when label patterns miss.

**Success**

- `ok: true` iff both `transaction_id` and at least one parsed amount are present.
- `parsed_amount`: first amount value (float), same as KPay preview.

**Failure**

- Unrecognized bank, missing txn, or missing amount → `ok: false`, `error: "Could not extract payment details."`
- OCR provider failure → `ok: false`, provider message in `error` (existing behavior).

### Detection priority

1. KPay (20-digit) — checked first to avoid accidental CB false positives.
2. CB (`FT…`) — only when KPay pattern absent.

No simultaneous match expected in practice.

## Service layer changes

### New / refactored functions (`app_finance/services.py` + `app_finance/ocr.py`)

| Function | Role |
|----------|------|
| `detect_and_extract(raw_ocr_response) -> dict` | Shared detection + bank extractors; returns `{bank, transaction_id, amount, json_ocr_data}` |
| `extract_cb(parsed_text) -> dict` | CB-specific txn + amount extraction |
| `preview_payment_screenshot(file_obj, …)` | Generic sync preview; replaces KPay-only logic |
| `preview_kpay_screenshot(…)` | Thin alias → `preview_payment_screenshot` (optional backward compat) |

`extract_receiver_ss_text_data` refactored to:

1. OCR screenshot (existing `image_to_text`).
2. Call `detect_and_extract`.
3. Apply same status transitions as today (`PENDING_VERIFICATION`, `DUPLICATED`, `CANNOT_EXTRACT`, receiver-side match).

Bank type stored implicitly via extracted txn ID shape; no new model fields.

## API (unchanged surface)

### `POST /api/v1/ocr-payment-screenshot`

- Auth: `payment.record`
- Body: `screenshot` file only (no bank param)
- Response: unchanged shape; now succeeds for CB when auto-detect finds CB patterns
- `date_on_screenshot`: always `null` for this change
- Duplicate warning: unchanged (`duplicate_of_payment_id` when txn exists)

### Create / retry (unchanged URLs)

- `POST /scan-transaction-screenshots` — skips async OCR when preview prefilled (existing)
- `POST /user-payments/<id>/retry-extraction` — re-enqueues `extract_receiver_ss_text_data`

## Error handling & edge cases

| Case | Behavior |
|------|----------|
| Low-quality OCR squashes txn ID to 10–13 chars | Still matches `{8,12}` suffix buffer |
| Fee line `41 MMK` | Label-first amount avoids picking fee |
| Account numbers with digits | Label-first avoids; fallback may misfire — acceptable as last resort |
| CB screenshot uploaded, OCR finds no `FT` | `ok: false`; manual entry |
| KPay screenshot | Unchanged; 20-digit path wins |
| Duplicate txn ID | `DUPLICATED` status + receiver match (existing) |

## Testing

High-value unit tests in `app_finance/tests/` (no live OCR API):

**Fixtures**

- Inline `ParsedText` strings derived from the two CB E-Receipt samples (`FT26189161K4`, `FT26131M13HZ`, amount `165,000.00 MMK`).
- Minimal KPay line JSON for regression.

**Cases**

1. CB sample → txn + amount `165000`, `bank=CB`
2. KPay 20-digit text → KPay path still selected when both patterns could not coexist
3. CB txn at 11 chars (`FT` + 9) → matches buffer
4. CB text with `Amount` label removed → fallback returns main amount not fee
5. Text with neither pattern → `ok: false`
6. `detect_and_extract` wired through preview helper response shape
7. Async path: mock OCR + assert `PENDING_VERIFICATION` with CB txn (integration-style, mocked OCR)

## Key files

| File | Change |
|------|--------|
| `app_finance/ocr.py` | Tighten `extract_cb_transaction_id`; add label-first amount; `extract_cb()` wrapper |
| `app_finance/services.py` | `detect_and_extract`, refactor preview + async task |
| `app_finance/views.py` | Point OCR view at generic preview (if renamed) |
| `app_finance/tests/test_cb_payment_ocr.py` | New high-value tests |
| `docs/PAYMENT_VERIFICATION_FLOW.md` | Note CB auto-detect on preview/async |

## Rollout

- Backend-only deploy; no FE release required.
- Existing KPay uploads unaffected.
- CB uploads on admin student-payments form should auto-fill txn + amount when OCR quality is sufficient.
