from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.db import connection
from django.db.models import Count, Min, Prefetch

from app_finance.models import PaymentReceipt, UserPayment
from app_reports.analytics_services import _as_org_day_bounds, _tz_for_tenant

EC_COLUMNS: list[tuple[str, str, float]] = [
    ("date", "Date", 12),
    ("voucher_no", "Voucher No", 12),
    ("sub", "Sub", 30),
    ("series", "Series", 20),
    ("name", "Name", 25),
    ("discount_type", "Discount Type", 25),
    ("cash_received", "Cash Received", 15),
    ("bank_ac", "Bank /AC", 20),
    ("transaction_id", "Transaction ID", 25),
    ("authorized_person", "Authorized Person", 30),
]

def ec_columns_meta() -> list[dict]:
    return [{"key": key, "title": title, "width": width} for key, title, width in EC_COLUMNS]


def _join_lines(lines: list[str]) -> str:
    if not lines or all(not line for line in lines):
        return ""
    return "\n".join(lines)


def _part_paid_amount(part: UserPayment) -> Decimal:
    for field in ("actual_amount", "parsed_amount", "invoiced_amount"):
        money = getattr(part, field, None)
        if money is not None:
            return money.amount
    return Decimal("0")


def _course_subjects(course) -> str:
    course_subjects = list(course.course_subjects.all())
    if course_subjects:
        return ", ".join(cs.subject.name for cs in course_subjects)
    subject = getattr(course, "subject", None)
    if subject is not None and subject.name:
        return subject.name
    return course.title or ""


def _course_series(course) -> str:
    intake = getattr(course, "intake", None)
    if intake is not None and intake.name:
        return intake.name
    return ""


def _ordered_course_blocks(parts: list[UserPayment]) -> list[tuple[int, list[UserPayment]]]:
    by_course: dict[int, list[UserPayment]] = defaultdict(list)
    order: list[int] = []
    for part in sorted(parts, key=lambda row: row.id):
        course_id = part.course_id
        if course_id not in by_course:
            order.append(course_id)
        by_course[course_id].append(part)
    return [(course_id, by_course[course_id]) for course_id in order]


def _dedupe_preserve(values: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for value in values:
        if not value or value in seen:
            continue
        seen.add(value)
        out.append(value)
    return out


def _block_discount_labels(block_parts: list[UserPayment]) -> str:
    labels: list[str] = []
    for part in block_parts:
        for line in part.payment_discounts.all():
            label = (line.label or "").strip()
            if label:
                labels.append(label)
    return ", ".join(_dedupe_preserve(labels))


def _block_payment_methods(block_parts: list[UserPayment]) -> str:
    names = []
    for part in block_parts:
        method = getattr(part, "payment_method", None)
        if method is not None and method.name:
            names.append(method.name)
    return ", ".join(_dedupe_preserve(names))


def _block_transaction_ids(block_parts: list[UserPayment]) -> str:
    ids = []
    for part in block_parts:
        txn = (part.transaction_id or "").strip()
        if txn:
            ids.append(txn)
    return ", ".join(_dedupe_preserve(ids))


def _series_cell(blocks: list[tuple[int, list[UserPayment]]]) -> str:
    per_course = [_course_series(block_parts[0].course) for _, block_parts in blocks]
    non_empty = [value for value in per_course if value]
    unique = _dedupe_preserve(non_empty)
    if len(unique) == 1:
        return unique[0]
    return _join_lines(per_course)


def _format_amount(amount: Decimal) -> str:
    text = format(amount, "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text or "0"


def _format_amount_comma(amount: Decimal) -> str:
    text = _format_amount(amount)
    if "." in text:
        whole, frac = text.split(".", 1)
        return f"{int(whole):,}.{frac}"
    return f"{int(text):,}"


def _earliest_payment_datetime(parts: list[UserPayment]) -> datetime | None:
    dates = [part.payment_date for part in parts if part.payment_date is not None]
    return min(dates) if dates else None


def _payment_date_in_tz(dt: datetime, tz: ZoneInfo) -> date:
    return dt.astimezone(tz).date()


def _display_date(receipt: PaymentReceipt, parts: list[UserPayment], tz: ZoneInfo) -> str:
    earliest = _earliest_payment_datetime(parts)
    if earliest is not None:
        return _payment_date_in_tz(earliest, tz).isoformat()
    if receipt.receipt_date is not None:
        return _payment_date_in_tz(receipt.receipt_date, tz).isoformat()
    return ""


def _authorized_person(receipt: PaymentReceipt) -> str:
    user = receipt.authorized_by
    if user is None:
        return ""
    name = (user.name or "").strip()
    email = (user.email or "").strip()
    if name and email:
        return f"{name} ({email})"
    return name or email


def _project_receipt_row(
    receipt: PaymentReceipt,
    parts: list[UserPayment],
    tz: ZoneInfo,
) -> dict:
    blocks = _ordered_course_blocks(parts)
    first_part = min(parts, key=lambda row: row.id)
    cash_total = sum(_part_paid_amount(part) for part in parts)

    student = first_part.user if first_part.user_id else None
    authorizer = receipt.authorized_by

    return {
        "date": _display_date(receipt, parts, tz),
        "voucher_no": receipt.number,
        "sub": _join_lines([_course_subjects(block_parts[0].course) for _, block_parts in blocks]),
        "series": _series_cell(blocks),
        "name": student.name if student is not None else "",
        "discount_type": _join_lines(
            [_block_discount_labels(block_parts) for _, block_parts in blocks]
        ),
        "cash_received": _format_amount(cash_total),
        "bank_ac": _join_lines(
            [_block_payment_methods(block_parts) for _, block_parts in blocks]
        ),
        "transaction_id": _join_lines(
            [_block_transaction_ids(block_parts) for _, block_parts in blocks]
        ),
        "authorized_person": _authorized_person(receipt),
        "student_user_id": first_part.user_id,
        "student_email": (student.email or "") if student is not None else "",
        "authorized_by_user_id": receipt.authorized_by_id,
        "authorized_by_name": (authorizer.name or "").strip() if authorizer is not None else "",
        "authorized_by_email": (authorizer.email or "").strip() if authorizer is not None else "",
    }


def _payment_prefetch() -> Prefetch:
    return Prefetch(
        "payments",
        queryset=UserPayment.objects.select_related(
            "user",
            "course",
            "course__intake",
            "course__subject",
            "payment_method",
        ).prefetch_related(
            "course__course_subjects__subject",
            "payment_discounts",
        ),
    )


def _complete_receipts(receipts: list[PaymentReceipt]) -> list[tuple[PaymentReceipt, list[UserPayment]]]:
    group_ids = {
        part.group_id
        for receipt in receipts
        for part in receipt.payments.all()
        if part.group_id is not None
    }
    group_totals: dict[int, int] = {}
    if group_ids:
        group_totals = {
            row["group_id"]: row["total"]
            for row in UserPayment.objects.filter(group_id__in=group_ids)
            .values("group_id")
            .annotate(total=Count("id"))
        }

    complete: list[tuple[PaymentReceipt, list[UserPayment]]] = []
    for receipt in receipts:
        parts = list(receipt.payments.all())
        if not parts:
            continue
        group_ids_on_receipt = {part.group_id for part in parts if part.group_id is not None}
        if len(group_ids_on_receipt) > 1:
            continue
        if not group_ids_on_receipt:
            complete.append((receipt, parts))
            continue
        group_id = next(iter(group_ids_on_receipt))
        if len(parts) != group_totals.get(group_id, 0):
            continue
        complete.append((receipt, parts))
    return complete


def excellent_choice_cash_total(rows: list[dict]) -> Decimal:
    total = Decimal("0")
    for row in rows:
        raw = row.get("cash_received", "")
        if raw:
            total += Decimal(str(raw))
    return total


def excellent_choice_summary_row(rows: list[dict]) -> dict:
    total = excellent_choice_cash_total(rows)
    return {
        "date": "SUM",
        "voucher_no": _format_amount_comma(total),
        "sub": "",
        "series": "",
        "name": "",
        "discount_type": "",
        "cash_received": "",
        "bank_ac": "",
        "transaction_id": "",
        "authorized_person": "",
    }


def excellent_choice_rows(date_from: date, date_to: date, org=None) -> list[dict]:
    if org is None:
        org = getattr(connection, "tenant", None)
    tz = _tz_for_tenant(org)
    start_dt, end_dt = _as_org_day_bounds(date_from, date_to, tz)

    receipts = list(
        PaymentReceipt.objects.filter(is_void=False)
        .annotate(earliest_payment_date=Min("payments__payment_date"))
        .filter(
            earliest_payment_date__gte=start_dt,
            earliest_payment_date__lte=end_dt,
        )
        .select_related("authorized_by")
        .prefetch_related(_payment_prefetch())
        .order_by("-earliest_payment_date", "-number")
    )
    return [
        _project_receipt_row(receipt, parts, tz)
        for receipt, parts in _complete_receipts(receipts)
    ]
