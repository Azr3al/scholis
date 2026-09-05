"""Backfill UserPaymentCoveredMonth rows for legacy is_fully_paid at_risk enrollments."""

from __future__ import annotations

import csv
from collections import Counter
from dataclasses import dataclass
from typing import Any, Iterable, TextIO

from django.db import transaction

from app_course.models import UserCourse
from app_finance.legacy_fully_paid_audit import (
    RISK_AT_RISK,
    _payments_by_pair,
    audit_legacy_fully_paid_enrollments,
    build_audit_row,
)
from app_finance.models import UserPayment, UserPaymentCoveredMonth
from app_finance.payment_coverage import (
    MonthTuple,
    calendar_months_for_course,
    first_month_instant,
    format_month_label,
)

ACTION_FIXED = "fixed"
ACTION_SKIPPED_NO_PAYMENT = "skipped_no_payment"
ACTION_SKIPPED_NO_COURSE_DATES = "skipped_no_course_dates"

BACKFILL_CSV_COLUMNS = [
    "schema_name",
    "user_course_id",
    "user_id",
    "user_name",
    "course_id",
    "course_title",
    "action",
    "target_payment_id",
    "months_added",
    "first_month",
    "last_month",
    "notes",
]


@dataclass(frozen=True)
class LegacyFullyPaidBackfillResult:
    schema_name: str
    user_course_id: int
    user_id: int
    user_name: str
    course_id: int
    course_title: str
    action: str
    target_payment_id: int | None
    months_added: int
    first_month: MonthTuple | None
    last_month: MonthTuple | None
    notes: str

    def as_csv_dict(self) -> dict[str, Any]:
        first_label = (
            format_month_label(*self.first_month) if self.first_month else ""
        )
        last_label = (
            format_month_label(*self.last_month) if self.last_month else ""
        )
        return {
            "schema_name": self.schema_name,
            "user_course_id": self.user_course_id,
            "user_id": self.user_id,
            "user_name": self.user_name,
            "course_id": self.course_id,
            "course_title": self.course_title,
            "action": self.action,
            "target_payment_id": self.target_payment_id or "",
            "months_added": self.months_added,
            "first_month": first_label,
            "last_month": last_label,
            "notes": self.notes,
        }


def select_target_payment(payments: list[UserPayment]) -> UserPayment | None:
    """Prefer a payment that already has covered_months; else earliest created."""
    if not payments:
        return None
    with_coverage = [p for p in payments if p.covered_months.exists()]
    pool = with_coverage if with_coverage else payments
    return min(pool, key=lambda p: (p.created_at, p.id))


def backfill_full_course_coverage(
    payment: UserPayment,
    course,
    *,
    dry_run: bool = False,
) -> tuple[int, MonthTuple | None, MonthTuple | None]:
    """
    Ensure explicit UserPaymentCoveredMonth rows exist for every course calendar month.

    Returns (months_added, first_month, last_month).
    """
    months = calendar_months_for_course(course)
    if not months:
        return 0, None, None

    existing = {
        (cm.year, cm.month_index)
        for cm in payment.covered_months.all()
    }
    to_add = [(y, m) for y, m in months if (y, m) not in existing]

    if not dry_run and to_add:
        UserPaymentCoveredMonth.objects.bulk_create(
            [
                UserPaymentCoveredMonth(
                    user_payment=payment,
                    year=y,
                    month_index=m,
                )
                for y, m in to_add
            ],
            ignore_conflicts=True,
        )
        first_y, first_m = months[0]
        payment.issued_at = first_month_instant(first_y, first_m)
        payment.save(update_fields=["issued_at"])

    return len(to_add), months[0], months[-1]


def backfill_at_risk_enrollment(
    *,
    schema_name: str,
    user_course: UserCourse,
    payments: list[UserPayment],
    dry_run: bool = False,
) -> LegacyFullyPaidBackfillResult | None:
    """
    Backfill one enrollment if audit classifies it as at_risk.

    Returns None when the enrollment is ok/review (no action).
    """
    audit_row = build_audit_row(
        schema_name=schema_name,
        user_course=user_course,
        payments=payments,
    )
    if audit_row.risk != RISK_AT_RISK:
        return None

    base = dict(
        schema_name=schema_name,
        user_course_id=user_course.id,
        user_id=user_course.user_id,
        user_name=user_course.user.name or "",
        course_id=user_course.course_id,
        course_title=user_course.course.title or "",
    )

    if audit_row.payment_count == 0:
        return LegacyFullyPaidBackfillResult(
            **base,
            action=ACTION_SKIPPED_NO_PAYMENT,
            target_payment_id=None,
            months_added=0,
            first_month=None,
            last_month=None,
            notes="No UserPayment rows; add a real payment manually.",
        )

    course_months = calendar_months_for_course(user_course.course)
    if not course_months:
        return LegacyFullyPaidBackfillResult(
            **base,
            action=ACTION_SKIPPED_NO_COURSE_DATES,
            target_payment_id=None,
            months_added=0,
            first_month=None,
            last_month=None,
            notes="Course has no start/end dates; cannot derive calendar months.",
        )

    target = select_target_payment(payments)
    if target is None:
        return LegacyFullyPaidBackfillResult(
            **base,
            action=ACTION_SKIPPED_NO_PAYMENT,
            target_payment_id=None,
            months_added=0,
            first_month=None,
            last_month=None,
            notes="No target payment found.",
        )

    months_added, first_month, last_month = backfill_full_course_coverage(
        target,
        user_course.course,
        dry_run=dry_run,
    )
    return LegacyFullyPaidBackfillResult(
        **base,
        action=ACTION_FIXED,
        target_payment_id=target.id,
        months_added=months_added,
        first_month=first_month,
        last_month=last_month,
        notes=(
            f"Added {months_added} covered month row(s) on payment {target.id}."
            if months_added
            else f"Payment {target.id} already had full course coverage."
        ),
    )


def backfill_legacy_fully_paid_coverage(
    schema_name: str,
    *,
    include_dropped: bool = False,
    dry_run: bool = False,
) -> list[LegacyFullyPaidBackfillResult]:
    """Process all at_risk legacy is_fully_paid enrollments in one tenant schema."""
    audit_rows = audit_legacy_fully_paid_enrollments(
        schema_name,
        include_dropped=include_dropped,
    )
    at_risk_ids = {row.user_course_id for row in audit_rows if row.risk == RISK_AT_RISK}
    if not at_risk_ids:
        return []

    enrollments = list(
        UserCourse.objects.filter(id__in=at_risk_ids)
        .select_related("user", "course")
        .order_by("course__title", "user__name", "id")
    )
    user_ids = list({uc.user_id for uc in enrollments})
    course_ids = list({uc.course_id for uc in enrollments})
    payments_map = _payments_by_pair(user_ids, course_ids)

    results: list[LegacyFullyPaidBackfillResult] = []
    for uc in enrollments:
        payments = payments_map.get((uc.user_id, uc.course_id), [])
        if dry_run:
            result = backfill_at_risk_enrollment(
                schema_name=schema_name,
                user_course=uc,
                payments=payments,
                dry_run=True,
            )
        else:
            with transaction.atomic():
                result = backfill_at_risk_enrollment(
                    schema_name=schema_name,
                    user_course=uc,
                    payments=payments,
                    dry_run=False,
                )
        if result is not None:
            results.append(result)
    return results


def summarize_backfill_results(
    rows: Iterable[LegacyFullyPaidBackfillResult],
) -> Counter[str]:
    counts: Counter[str] = Counter()
    for row in rows:
        counts[row.action] += 1
    return counts


def write_backfill_csv(
    rows: Iterable[LegacyFullyPaidBackfillResult],
    stream: TextIO,
) -> None:
    writer = csv.DictWriter(stream, fieldnames=BACKFILL_CSV_COLUMNS)
    writer.writeheader()
    for row in rows:
        writer.writerow(row.as_csv_dict())
