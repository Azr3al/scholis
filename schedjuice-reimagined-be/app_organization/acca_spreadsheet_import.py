"""
Helpers for `import_acca_students` management command.

Maps spreadsheet-style CSV headers (see canonical_field_map) to normalized row keys.
Date-of-birth values use DD/MM/YYYY (see ``parse_dmy_date``).
"""

from __future__ import annotations

import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from app_finance.models import PaymentBank

IMPORT_CUSTOM_FIELD_KEYS = (
    ("occupation", "Occupation", 10),
    ("company_name", "Company name", 20),
    ("viber_phone", "Viber phone", 30),
    ("telegram_number", "Telegram number", 40),
)
DEFAULT_CATEGORY_NAME = "ACCA"
COURSE_START = date(2025, 7, 1)
COURSE_END = date(2026, 12, 31)
IMPORT_PASSWORD = "Password123$"


def normalize_email(value: str | None) -> str:
    return (value or "").strip().lower()


def normalize_header_key(header: str | None) -> str:
    return re.sub(r"\s+", " ", (header or "").strip().lower())


def canonical_field_map() -> dict[str, str]:
    """CSV header (normalized) -> internal row key."""
    return {
        "email address": "email",
        "email": "email",
        "student name": "name",
        "name": "name",
        "nrc/passport": "nrc_passport",
        "nrc": "nrc_passport",
        "passport": "nrc_passport",
        "date of birth": "date_of_birth",
        "dob": "date_of_birth",
        "occupation": "occupation",
        "company name": "company_name",
        "company": "company_name",
        "gender": "gender",
        "mobile phone number": "mobile",
        "mobile": "mobile",
        "phone": "mobile",
        "viber phone number": "viber_phone",
        "viber": "viber_phone",
        "telegram number": "telegram_number",
        "telegram": "telegram_number",
        "delivery address": "delivery_address",
        "address": "delivery_address",
        "enroll subject": "enroll_subject",
        "enroll": "enroll_subject",
        "transfer bank": "transfer_bank",
        "transfer bank name": "transfer_bank",
        "bank": "transfer_bank",
        "transaction note": "transaction_note",
        "transaction numer (or) description name": "transaction_note",
        "note": "transaction_note",
        "transfer amount": "transfer_amount",
        "transfer amount (ks)": "transfer_amount",
        "amount": "transfer_amount",
        "transfer date": "transfer_date",
        "date of transfer": "transfer_date",
        "payment date": "transfer_date",
        # Google Form export for NRC column title
        "nrc/ passport no.": "nrc_passport",
        "nrc/ passport no": "nrc_passport",
    }


def map_csv_row(raw_row: dict[str, str]) -> dict[str, str]:
    """Map a csv.DictReader row using header aliases."""
    lut = canonical_field_map()
    out: dict[str, str] = {}
    for key, val in raw_row.items():
        nk = normalize_header_key(key)
        if nk in lut:
            out[lut[nk]] = (val or "").strip()
    return out


def parse_dmy_date(raw: str | None) -> date | None:
    """Parse date-of-birth cells as DD/MM/YYYY (day first)."""
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    try:
        return datetime.strptime(s, "%d/%m/%Y").date()
    except ValueError:
        return None


def parse_money_usd(raw: str | float | int | Decimal | None) -> Decimal | None:
    if raw is None:
        return None
    if isinstance(raw, Decimal):
        return raw
    if isinstance(raw, (int, float)):
        return Decimal(str(raw))
    s = str(raw).strip().replace(",", "")
    if not s:
        return None
    try:
        return Decimal(s)
    except InvalidOperation:
        return None


def split_enroll_subjects(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [p.strip() for p in str(raw).split(",") if p.strip()]


def normalize_gender(raw: str | None) -> str | None:
    if not raw:
        return None
    s = str(raw).strip().upper()
    synonyms = {
        "FEMALE": "FEMALE",
        "MALE": "MALE",
        "F": "FEMALE",
        "M": "MALE",
    }
    if s in synonyms:
        return synonyms[s]
    if s in {"MALE", "FEMALE", "NON_BINARY", "OTHER"}:
        return s
    return None


def infer_payment_bank(transfer_text: str | None) -> str:
    t = (transfer_text or "").upper()
    compact = t.replace(" ", "")
    pb = PaymentBank
    if "UAB" in t:
        return pb.UAB
    if "KPAY" in compact or "KPAY" in t.replace("_", ""):
        return pb.KPAY
    if "K PAY" in t or "K-PAY" in t:
        return pb.KPAY
    if "KBZ" in t:
        return pb.KBZ
    if re.search(r"\bCB\b", t):
        return pb.CB
    if "AYA" in t:
        return pb.AYA
    if "YOMA" in t:
        return pb.YOMA
    return pb.CASH


def normalize_phone(value: str | None, max_length: int = 512) -> str:
    """Fit phone values into User.phone_number max length."""
    if not value:
        return ""
    s = str(value).strip()
    return s[:max_length]
