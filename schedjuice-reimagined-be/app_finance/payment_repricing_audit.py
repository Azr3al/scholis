"""
Read-only diff of stored vs recomputed UserPayment amounts.

Payments created before coverage-driven pricing stored a single billing
period's figures even when they covered several months, and whole-term plans
had their discounts divided by period count. This module reports the gap; it
never writes.

Spec: docs/superpowers/specs/2026-07-26-coverage-driven-payment-pricing-design.md
"""

from __future__ import annotations

import csv
from collections import Counter
from dataclasses import dataclass
from decimal import Decimal
from typing import Iterable, Iterator, TextIO, Type

from app_course.models import UserCourse
from app_finance.discount_engine import compute_invoiced_amount
from app_finance.discount_eligibility import active_course_counts_for_users
from app_finance.models import UserPayment
from app_finance.payment_coverage import month_tuples_from_payment
from app_finance.payment_discount_apply import resolve_student_enrollments_bulk

STATUS_MATCH = "match"
STATUS_MISPRICED = "mispriced"
STATUS_SKIPPED_OVERRIDDEN = "skipped_overridden"
STATUS_SKIPPED_OUT_OF_RANGE = "skipped_out_of_range"
STATUS_SKIPPED_NO_PLAN = "skipped_no_plan"

CSV_COLUMNS = [
    "schema_name",
    "payment_id",
    "user_id",
    "user_name",
    "course_id",
    "course_title",
    "covered_month_count",
    "stored_invoiced",
    "computed_invoiced",
    "delta",
    "status",
    "notes",
]

DEFAULT_REPRICING_CHUNK_SIZE = 2000


@dataclass(frozen=True)
class PaymentRepricingRow:
    schema_name: str
    payment_id: int
    user_id: int | None
    user_name: str
    course_id: int | None
    course_title: str
    covered_month_count: int
    stored_invoiced: Decimal | None
    computed_invoiced: Decimal | None
    delta: Decimal | None
    status: str
    notes: str


@dataclass(frozen=True)
class RepricingAuditContext:
    enrollment_map: dict[tuple[int, int], UserCourse]
    active_course_counts: dict[int, int]


def _amount(value) -> Decimal | None:
    return None if value is None else Decimal(str(value.amount))


def _repricing_payment_queryset(user_payment_model: Type = UserPayment):
    return user_payment_model.objects.select_related(
        "user", "course", "course__payment_plan"
    ).prefetch_related("covered_months")


def _load_payment_chunk(
    *,
    last_id: int,
    chunk_size: int,
    user_payment_model: Type = UserPayment,
) -> list[UserPayment]:
    return list(
        _repricing_payment_queryset(user_payment_model)
        .filter(id__gt=last_id)
        .order_by("id")[:chunk_size]
    )


def build_repricing_audit_context(
    payments: Iterable[UserPayment],
    *,
    active_course_counts: dict[int, int] | None = None,
) -> RepricingAuditContext:
    """Prefetch enrollments and active-course counts for a payment batch."""
    pairs: set[tuple[int, int]] = set()
    user_ids: set[int] = set()
    for payment in payments:
        if payment.is_amount_overridden or payment.user_id is None:
            continue
        user_ids.add(payment.user_id)
        if payment.course_id is not None:
            pairs.add((payment.user_id, payment.course_id))

    counts = active_course_counts if active_course_counts is not None else {}
    missing_user_ids = user_ids - counts.keys()
    if missing_user_ids:
        counts.update(active_course_counts_for_users(missing_user_ids))

    return RepricingAuditContext(
        enrollment_map=resolve_student_enrollments_bulk(pairs),
        active_course_counts=counts,
    )


def build_repricing_row(
    schema_name: str,
    payment: UserPayment,
    *,
    ctx: RepricingAuditContext,
) -> PaymentRepricingRow:
    stored = _amount(payment.invoiced_amount)
    months = month_tuples_from_payment(payment)
    base = dict(
        schema_name=schema_name,
        payment_id=payment.id,
        user_id=payment.user_id,
        user_name=getattr(payment.user, "name", "") or "",
        course_id=payment.course_id,
        course_title=getattr(payment.course, "title", "") or "",
        covered_month_count=len(months),
        stored_invoiced=stored,
        computed_invoiced=None,
        delta=None,
    )

    if payment.is_amount_overridden:
        return PaymentRepricingRow(
            **base,
            status=STATUS_SKIPPED_OVERRIDDEN,
            notes="Admin override; amount left untouched.",
        )

    if payment.user_id is None or payment.course_id is None:
        return PaymentRepricingRow(
            **base, status=STATUS_SKIPPED_NO_PLAN, notes="Payment has no user/course."
        )

    user_course = ctx.enrollment_map.get((payment.user_id, payment.course_id))
    if user_course is None or not user_course.course.payment_plan_id:
        return PaymentRepricingRow(
            **base, status=STATUS_SKIPPED_NO_PLAN, notes="No enrollment or payment plan."
        )

    try:
        result = compute_invoiced_amount(
            user_course=user_course,
            payment_plan=user_course.course.payment_plan,
            covered_months=months or None,
            org=None,
            user_active_course_count=ctx.active_course_counts.get(payment.user_id, 0),
        )
    except ValueError as exc:
        if str(exc) == "covered_month_outside_course":
            return PaymentRepricingRow(
                **base,
                status=STATUS_SKIPPED_OUT_OF_RANGE,
                notes="Covered month outside the course calendar; needs human review.",
            )
        raise

    computed = Decimal(str(result.invoiced_amount.amount))
    base["computed_invoiced"] = computed
    base["delta"] = None if stored is None else computed - stored
    status = STATUS_MATCH if stored == computed else STATUS_MISPRICED
    return PaymentRepricingRow(**base, status=status, notes="")


def iter_payment_repricing_rows(
    schema_name: str,
    *,
    chunk_size: int = DEFAULT_REPRICING_CHUNK_SIZE,
    user_payment_model: Type = UserPayment,
) -> Iterator[PaymentRepricingRow]:
    """Yield repricing rows in keyset chunks to bound memory use."""
    active_course_counts: dict[int, int] = {}
    last_id = 0
    while True:
        payments = _load_payment_chunk(
            last_id=last_id,
            chunk_size=chunk_size,
            user_payment_model=user_payment_model,
        )
        if not payments:
            break
        ctx = build_repricing_audit_context(
            payments,
            active_course_counts=active_course_counts,
        )
        for payment in payments:
            yield build_repricing_row(schema_name, payment, ctx=ctx)
        last_id = payments[-1].id
        if len(payments) < chunk_size:
            break


def audit_payment_repricing(
    schema_name: str,
    *,
    chunk_size: int = DEFAULT_REPRICING_CHUNK_SIZE,
    user_payment_model: Type = UserPayment,
) -> list[PaymentRepricingRow]:
    """Every payment in the current schema, with its recomputed amount."""
    return list(
        iter_payment_repricing_rows(
            schema_name,
            chunk_size=chunk_size,
            user_payment_model=user_payment_model,
        )
    )


def summarize_rows(rows: Iterable[PaymentRepricingRow]) -> Counter:
    return Counter(row.status for row in rows)


def write_audit_csv(rows: Iterable[PaymentRepricingRow], handle: TextIO) -> None:
    writer = csv.DictWriter(handle, fieldnames=CSV_COLUMNS)
    writer.writeheader()
    for row in rows:
        writer.writerow({column: getattr(row, column) for column in CSV_COLUMNS})
