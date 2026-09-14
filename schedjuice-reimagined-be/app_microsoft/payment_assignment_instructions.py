"""Build HTML instructions for new MS Teams payment assignments."""

from __future__ import annotations

from html import escape
from itertools import groupby
from typing import Iterable

from app_finance.models import PaymentBank, PaymentMethod

PAYMENT_ASSIGNMENT_INTRO = (
    "Please upload your payment screenshot for this month. "
    "This assignment is for students to submit proof of payment."
)

_BANK_ORDER = {value: index for index, value in enumerate(PaymentBank.values)}


def _active_methods(methods: Iterable | None):
    if methods is None:
        methods = PaymentMethod.objects.filter(is_retired=False)
    return [method for method in methods if not getattr(method, "is_retired", False)]


def _sort_key(method) -> tuple[int, str]:
    bank = getattr(method, "payment_bank", "") or ""
    name = (getattr(method, "name", "") or "").lower()
    return (_BANK_ORDER.get(bank, len(_BANK_ORDER)), name)


def build_payment_assignment_instructions(methods: Iterable | None = None) -> str:
    """Return HTML instructions grouped by bank. Escapes user-supplied names/numbers."""
    parts = [f"<p>{escape(PAYMENT_ASSIGNMENT_INTRO)}</p>"]
    active = sorted(_active_methods(methods), key=_sort_key)
    if not active:
        return "".join(parts)

    parts.append("<p>Pay using one of these accounts:</p>")
    for bank, group in groupby(active, key=lambda method: method.payment_bank):
        parts.append(f"<h3>{escape(str(bank))}</h3>")
        for method in group:
            name = escape(str(method.name or ""))
            number = str(getattr(method, "bank_account_number", None) or "").strip()
            if number:
                parts.append(f"<p><strong>{name}</strong><br>{escape(number)}</p>")
            else:
                parts.append(f"<p><strong>{name}</strong></p>")
    return "".join(parts)
