"""Suggest which tenant payment method a payment screenshot was sent to."""

from __future__ import annotations

import re

from app_finance.models import PaymentBank, PaymentMethod

_NON_ALNUM = re.compile(r"[^0-9a-z]+")
_DIGIT_RUN = re.compile(r"\d+")
_NON_DIGIT = re.compile(r"\D+")
_MIN_NAME_LENGTH = 4

DETECTED_BANK_TO_PAYMENT_BANK = {
    "KPAY": PaymentBank.KPAY,
    "CB": PaymentBank.CB,
    "KBZ": PaymentBank.KBZ,
    "AYA": PaymentBank.AYA,
}


def normalize_for_match(value: str | None) -> str:
    """Lowercase and drop every non-alphanumeric character (space/case insensitive)."""
    if not value:
        return ""
    return _NON_ALNUM.sub("", value.lower())


def _name_matches(candidates, normalized_text: str) -> list:
    matches = []
    for method in candidates:
        normalized_name = normalize_for_match(method.name)
        if len(normalized_name) < _MIN_NAME_LENGTH:
            continue
        if normalized_name in normalized_text:
            matches.append(method)
    return matches


def _last4_matches(candidates, digit_runs: list[str]) -> list:
    matches = []
    for method in candidates:
        digits = _NON_DIGIT.sub("", method.bank_account_number or "")
        if len(digits) < 4:
            continue
        last4 = digits[-4:]
        if any(run.endswith(last4) for run in digit_runs):
            matches.append(method)
    return matches


def suggest_payment_method(bank: str | None, ocr_text: str | None) -> int | None:
    """Return a payment method id only when the match is unambiguous."""
    payment_bank = DETECTED_BANK_TO_PAYMENT_BANK.get((bank or "").strip().upper())
    if payment_bank is None:
        return None

    candidates = list(PaymentMethod.objects.filter(payment_bank=payment_bank))
    if not candidates:
        return None
    if len(candidates) == 1:
        return candidates[0].id

    name_matches = _name_matches(candidates, normalize_for_match(ocr_text))
    if len(name_matches) == 1:
        return name_matches[0].id

    number_matches = _last4_matches(candidates, _DIGIT_RUN.findall(ocr_text or ""))
    if len(number_matches) == 1:
        return number_matches[0].id

    return None
