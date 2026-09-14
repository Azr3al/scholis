import logging
import re

from tenant_schemas.utils import schema_context

from app_finance.models import PaymentBank
from app_finance.ocr_client import OcrError, image_to_text_v2

logger = logging.getLogger(__name__)


def extract_text_ocr(user_payment, schema):
    with schema_context(schema):
        try:
            x = image_to_text_v2(user_payment.screenshot.url)
        except OcrError as exc:
            logger.exception(
                "OCR request failed for UserPayment %s: %s",
                user_payment.id,
                exc,
            )
            return

        parsed_results = x.get("ParsedResults") or []
        if not parsed_results:
            logger.warning(
                "OCR returned no ParsedResults for UserPayment %s",
                user_payment.id,
            )
            return

        parsed_text = parsed_results[0].get("ParsedText")
        if parsed_text:
            user_payment.text_ocr_data = parsed_text
        user_payment.save()



def normalize_number(num_str: str) -> float:
    num_str = num_str.strip().replace(" ", "").replace("\n", "")

    # Handle repeated separators (OCR)
    if num_str.count('.') > 1 and ',' not in num_str:
        parts = num_str.split('.')
        num_str = ''.join(parts[:-1]) + '.' + parts[-1]

    elif num_str.count(',') > 1 and '.' not in num_str:
        parts = num_str.split(',')
        num_str = ''.join(parts[:-1]) + '.' + parts[-1]

    elif ',' in num_str and '.' in num_str:
        if num_str.rfind('.') > num_str.rfind(','):
            num_str = num_str.replace(',', '')
        else:
            num_str = num_str.replace('.', '').replace(',', '.')

    else:
        if num_str.count(',') == 1 and len(num_str.split(',')[-1]) == 2:
            num_str = num_str.replace(',', '.')
        else:
            num_str = num_str.replace(',', '')

    return float(num_str)


def extract_kpay_amount(text: str) -> float | None:
    line_pattern = re.compile(r'^.*(?:0\.00 |Ks)$', re.MULTILINE)
    number_pattern = re.compile(r'[\d.,]+')

    match = line_pattern.search(text)
    if not match:
        return None

    line = match.group()
    num_match = number_pattern.search(line)

    if not num_match:
        return None

    return normalize_number(num_match.group())


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


def extract_cb_amount(text: str) -> float | None:
    """
    Extracts monetary amount from receipt text and normalizes it.
    Supports:
    - 175,000.00
    - 175.000,00
    - 175000
    - 175 000.00 (OCR cases)
    """

    # Match number near currency or standalone amount
    pattern = re.compile(
        r'(\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{2})?)'
    )

    matches = pattern.findall(text)

    if not matches:
        return None

    # Heuristic: pick the largest number (usually the amount)
    cleaned = [m.replace(" ", "") for m in matches]
    numeric_values = [(m, normalize_number(m)) for m in cleaned]
    return max(numeric_values, key=lambda x: x[1])[1]


def extract_cb(parsed_text: str) -> dict:
    transaction_id = extract_cb_transaction_id(parsed_text)
    amount = extract_cb_labeled_amount(parsed_text)
    if amount is None and parsed_text:
        amount = extract_cb_amount(parsed_text)
    return {
        "transaction_id": transaction_id,
        "amount": [amount] if amount is not None else [],
    }


def extract_aya_from_account(ocr_text: str) -> str | None:
    """
    Extracts the 11-digit 'From' account number from OCR text
    using multiple fallback regex patterns.
    """

    patterns = [
        # Case 1: "From Account <number>"
        r"From\s*Account[\s\S]{0,50}?(?<!\d)(\d{11})(?!\d)",
        # Case 2:
        # From
        # NAME
        # 12345678901
        r"From\s*\n[^\d\n]+\n(?<!\d)(\d{11})(?!\d)",
    ]

    for pattern in patterns:
        match = re.search(pattern, ocr_text)
        if match:
            return match.group(1)

    return None


# KBZ receipts carry a 15-digit reference number (not a transaction id).
KBZ_REFERENCE_PATTERN = re.compile(r"(?<!\d)\d{15}(?!\d)")

# Separated ("165,000.00"), unseparated but plausible as money ("165000.00",
# capped at 9 digits so a 12-15 digit reference number cannot match), or a
# small amount with decimals only ("200.00").
_AMOUNT_DIGITS = (
    r"\d{1,3}(?:[.,\s]\d{3})+(?:[.,]\d{2})?"
    r"|\d{4,9}(?:[.,]\d{2})?"
    r"|\d{1,3}[.,]\d{2}"
)

# "MMK 165,000.00" / "MMK 967,750.00" — currency before the digits (KBZ).
KBZ_AMOUNT_PATTERN = re.compile(
    rf"\bMMK\s*(?<!\d)({_AMOUNT_DIGITS})(?!\d)", re.IGNORECASE
)

# "165,000.00 MMK" / "97,500.00\nMMK" — currency after the digits (AYA).
AYA_AMOUNT_PATTERN = re.compile(
    rf"(?<![\d.,])({_AMOUNT_DIGITS})\s*MMK\b", re.IGNORECASE
)


def _largest_amount(pattern: re.Pattern, text: str) -> float | None:
    if not text:
        return None
    values = []
    for raw in pattern.findall(text):
        try:
            values.append(normalize_number(raw))
        except ValueError:
            continue
    return max(values) if values else None


def extract_aya_amount(ocr_text: str) -> float | None:
    """AYA receipts: MMK follows the digits, and the fee line is the smaller value."""
    return _largest_amount(AYA_AMOUNT_PATTERN, ocr_text)


def contains_kbz_keywords(text: str) -> bool:
    """
    Returns True if `text` contains any of:
    'transaction', 'reference', 'accepted', 'number'
    (case-insensitive)
    """
    pattern = re.compile(r'\b(transaction|reference|accepted|number)\b', re.IGNORECASE)
    return bool(pattern.search(text))


def extract_kbz_amount(text: str) -> float | None:
    """KBZ iBanking/mobile receipts: MMK precedes the digits."""
    return _largest_amount(KBZ_AMOUNT_PATTERN, text)


def looks_like_kbz(text: str) -> bool:
    return bool(text) and bool(KBZ_REFERENCE_PATTERN.search(text))


def extract_kbz_reference_number(parsed_text: str) -> str | None:
    if not parsed_text:
        return None
    labeled = re.search(
        r"reference\s+number\s+(?<!\d)(\d{15})(?!\d)",
        parsed_text,
        re.IGNORECASE,
    )
    if labeled:
        return labeled.group(1)
    match = KBZ_REFERENCE_PATTERN.search(parsed_text)
    return match.group(0) if match else None


def extract_kbz(parsed_text: str) -> dict:
    amount = extract_kbz_amount(parsed_text)
    transaction_id = extract_kbz_reference_number(parsed_text)
    return {
        "transaction_id": transaction_id,
        "amount": [amount] if amount is not None else [],
    }


def extract_aya(parsed_text: str) -> dict:
    amount = extract_aya_amount(parsed_text)
    return {"transaction_id": None, "amount": [amount] if amount is not None else []}


NOTE_LABELS_BY_BANK = {
    "KPAY": ("Notes", "မှတ်ချက်"),
    "KBZ": ("Purpose of Transaction",),
    "CB": ("Reason", "အကြောင်းအရာ"),
    "AYA": ("Description", "မှတ်ချက်"),
}

ALL_NOTE_LABELS = tuple(
    dict.fromkeys(label for labels in NOTE_LABELS_BY_BANK.values() for label in labels)
)

_KPAY_NOTE_FALLBACK = re.compile(
    r"[A-Za-z][A-Za-z .'-]{2,}(?:\s+ko)?\s+(?:PET|KET|FLYERS)\b",
    re.IGNORECASE,
)


def _ocr_line_texts(ocr_lines: list | None) -> list[str]:
    texts: list[str] = []
    for row in ocr_lines or []:
        if isinstance(row, dict):
            raw = row.get("LineText") or ""
        else:
            raw = str(row)
        text = raw.strip()
        if text:
            texts.append(text)
    return texts


def _value_after_label_in_line(line: str, label: str) -> str | None:
    if label.isascii():
        idx = line.lower().find(label.lower())
    else:
        idx = line.find(label)
    if idx < 0:
        return None
    rest = line[idx + len(label) :].strip().lstrip(":").strip()
    return rest or None


def _line_after_label(parsed_text: str, labels: tuple[str, ...]) -> str | None:
    if not parsed_text:
        return None
    for label in labels:
        match = re.search(
            rf"{re.escape(label)}\s*:?\s*(?:\n\s*)?(.+)",
            parsed_text,
            re.IGNORECASE,
        )
        if match:
            value = match.group(1).strip().splitlines()[0].strip()
            if value and value.lower() not in {l.lower() for l in labels if l.isascii()}:
                return value
    return None


def _line_after_label_in_lines(
    ocr_lines: list | None,
    labels: tuple[str, ...],
) -> str | None:
    texts = _ocr_line_texts(ocr_lines)
    for index, line in enumerate(texts):
        for label in labels:
            rest = _value_after_label_in_line(line, label)
            if rest:
                return rest.splitlines()[0].strip()
            is_label_line = (
                line.lower() == label.lower()
                if label.isascii()
                else line == label
            )
            if is_label_line and index + 1 < len(texts):
                return texts[index + 1]
    return None


def _kpay_note_fallback(parsed_text: str, ocr_lines: list | None) -> str | None:
    texts = _ocr_line_texts(ocr_lines)
    if not texts and parsed_text:
        texts = [line.strip() for line in parsed_text.splitlines() if line.strip()]
    for line in reversed(texts):
        if re.search(r"\d{20}", line) or "******" in line:
            continue
        if re.match(r"^(daw|u)\s", line, re.IGNORECASE):
            continue
        if _KPAY_NOTE_FALLBACK.search(line):
            return line
    return None


def extract_payment_notes_text(
    bank: str,
    parsed_text: str,
    *,
    ocr_lines: list | None = None,
) -> str | None:
    bank_key = (bank or "").upper()
    labels = NOTE_LABELS_BY_BANK.get(bank_key) or ALL_NOTE_LABELS
    found = _line_after_label(parsed_text or "", labels)
    if found:
        return found
    found = _line_after_label_in_lines(ocr_lines, labels)
    if found:
        return found
    if labels is not ALL_NOTE_LABELS:
        found = _line_after_label(parsed_text or "", ALL_NOTE_LABELS)
        if found:
            return found
        found = _line_after_label_in_lines(ocr_lines, ALL_NOTE_LABELS)
        if found:
            return found
    if bank_key == "KPAY":
        return _kpay_note_fallback(parsed_text or "", ocr_lines)
    return None


def extract_metadata_using_regex(up, schema):
    with schema_context(schema):
        kpay_matches = re.findall(r"\b\d{20}\b", up.text_ocr_data)
        if len(kpay_matches) > 0:
            amount = extract_kpay_amount(up.text_ocr_data)
            print(up.id, kpay_matches[0], amount, PaymentBank.KPAY)
            return
        cb_transaction_id = extract_cb_transaction_id(up.text_ocr_data)
        if cb_transaction_id:
            amount = extract_cb_amount(up.text_ocr_data)
            print(up.id, cb_transaction_id, amount, up.payment_method.name, PaymentBank.CB)
            return

        aya_from_account = extract_aya_from_account(up.text_ocr_data)
        if aya_from_account:
            amount = extract_aya_amount(up.text_ocr_data)
            print(up.id, aya_from_account, amount, up.payment_method.name, PaymentBank.AYA)
            return
        kbz_keyword = contains_kbz_keywords(up.text_ocr_data)
        if kbz_keyword:
            amount = extract_kbz_amount(up.text_ocr_data)
            print(up.id, amount, up.payment_method.name, PaymentBank.KBZ)

