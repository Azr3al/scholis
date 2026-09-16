"""Read-only audit helpers for legacy UserCourse.is_fully_paid before field removal."""

from __future__ import annotations

import csv
from collections import Counter
from dataclasses import dataclass
from datetime import date
from typing import Any, Iterable, TextIO

from django.db.models import Prefetch

from app_course.models import UserCourse
from app_finance.models import UserPayment, UserPaymentCoveredMonth
from app_finance.payment_coverage import (
    MonthTuple,
    calendar_months_for_course,
    compare_month,
    format_month_label,
    furthest_covered_month_from_payments,
)

RISK_OK = "ok"
RISK_REVIEW = "review"
RISK_AT_RISK = "at_risk"


def legacy_is_fully_paid_field_exists() -> bool:
    return "is_fully_paid" in UserCourse._meta.fields_map


CSV_COLUMNS = [
    "schema_name",
    "user_course_id",
    "user_id",
    "user_name",
    "user_email",
    "course_id",
    "course_title",
    "course_start_date",
    "course_end_date",
    "is_removed",
    "payment_count",
    "has_qualifying_payment",
    "paid_until_year",
    "paid_until_month",
    "paid_until_label",
    "risk",
    "notes",
]


@dataclass(frozen=True)
class LegacyFullyPaidAuditRow:
    schema_name: str
    user_course_id: int
    user_id: int
    user_name: str
    user_email: str
    course_id: int
    course_title: str
    course_start_date: date | None
    course_end_date: date | None
    is_removed: bool
    payment_count: int
    has_qualifying_payment: bool
    paid_until: MonthTuple | None
    risk: str
    notes: str

    @property
    def paid_until_year(self) -> int | None:
        return self.paid_until[0] if self.paid_until else None

    @property
    def paid_until_month(self) -> int | None:
        return self.paid_until[1] if self.paid_until else None

    @property
    def paid_until_label(self) -> str:
        if not self.paid_until:
            return ""
        y, m = self.paid_until
        return format_month_label(y, m)

    def as_csv_dict(self) -> dict[str, Any]:
        return {
            "schema_name": self.schema_name,
            "user_course_id": self.user_course_id,
            "user_id": self.user_id,
            "user_name": self.user_name,
            "user_email": self.user_email,
            "course_id": self.course_id,
            "course_title": self.course_title,
            "course_start_date": (
                self.course_start_date.isoformat() if self.course_start_date else ""
            ),
            "course_end_date": (
                self.course_end_date.isoformat() if self.course_end_date else ""
            ),
            "is_removed": self.is_removed,
            "payment_count": self.payment_count,
            "has_qualifying_payment": self.has_qualifying_payment,
            "paid_until_year": self.paid_until_year if self.paid_until_year else "",
            "paid_until_month": self.paid_until_month if self.paid_until_month else "",
            "paid_until_label": self.paid_until_label,
            "risk": self.risk,
            "notes": self.notes,
        }


def course_end_month(course) -> MonthTuple | None:
    months = calendar_months_for_course(course)
    return months[-1] if months else None


def payments_have_qualifying(payments: Iterable[UserPayment]) -> bool:
    """Match UserCourseSerializer rule: screenshot present or status verified."""
    st = UserPayment.Status
    for payment in payments:
        if payment.screenshot or payment.status == st.VERIFIED:
            return True
    return False


def classify_legacy_fully_paid_risk(
    *,
    payment_count: int,
    has_qualifying_payment: bool,
    paid_until: MonthTuple | None,
    course_end: MonthTuple | None,
) -> tuple[str, str]:
    """Return (risk, notes) for a legacy is_fully_paid enrollment."""
    if payment_count == 0:
        return RISK_AT_RISK, "No UserPayment rows; flag was the only exemption."

    if not has_qualifying_payment:
        return (
            RISK_AT_RISK,
            "Payments exist but none have a screenshot or verified status.",
        )

    if paid_until is None:
        return (
            RISK_REVIEW,
            "Qualifying payments exist but no calendar month could be derived.",
        )

    if course_end is None:
        return RISK_OK, "Paid until derived; course has no schedule dates to compare."

    if compare_month(paid_until, course_end) >= 0:
        return (
            RISK_OK,
            f"Coverage through {format_month_label(*paid_until)} meets course end.",
        )

    return (
        RISK_REVIEW,
        (
            f"Paid until {format_month_label(*paid_until)} is before course end "
            f"{format_month_label(*course_end)}."
        ),
    )


def build_audit_row(
    *,
    schema_name: str,
    user_course: UserCourse,
    payments: list[UserPayment],
) -> LegacyFullyPaidAuditRow:
    payment_count = len(payments)
    has_qualifying = payments_have_qualifying(payments)
    paid_until = furthest_covered_month_from_payments(payments) if payments else None
    end_month = course_end_month(user_course.course)
    risk, notes = classify_legacy_fully_paid_risk(
        payment_count=payment_count,
        has_qualifying_payment=has_qualifying,
        paid_until=paid_until,
        course_end=end_month,
    )
    user = user_course.user
    course = user_course.course
    return LegacyFullyPaidAuditRow(
        schema_name=schema_name,
        user_course_id=user_course.id,
        user_id=user.id,
        user_name=user.name or "",
        user_email=user.email or "",
        course_id=course.id,
        course_title=course.title or "",
        course_start_date=course.start_date,
        course_end_date=course.end_date,
        is_removed=False,
        payment_count=payment_count,
        has_qualifying_payment=has_qualifying,
        paid_until=paid_until,
        risk=risk,
        notes=notes,
    )


def _payments_by_pair(
    user_ids: list[int],
    course_ids: list[int],
) -> dict[tuple[int, int], list[UserPayment]]:
    if not user_ids or not course_ids:
        return {}
    qs = (
        UserPayment.objects.filter(
            user_id__in=user_ids,
            course_id__in=course_ids,
        )
        .prefetch_related(
            Prefetch(
                "covered_months",
                queryset=UserPaymentCoveredMonth.objects.only(
                    "year", "month_index", "user_payment_id"
                ),
            )
        )
    )
    out: dict[tuple[int, int], list[UserPayment]] = {}
    for payment in qs:
        key = (payment.user_id, payment.course_id)
        out.setdefault(key, []).append(payment)
    return out


def audit_legacy_fully_paid_enrollments(
    schema_name: str,
    *,
    include_dropped: bool = False,
) -> list[LegacyFullyPaidAuditRow]:
    if not legacy_is_fully_paid_field_exists():
        return []

    qs = UserCourse.objects.filter(
        is_fully_paid=True,
        assigned_as=UserCourse.AssignedAs.STUDENT,
    ).select_related("user", "course")
    enrollments = list(qs.order_by("course__title", "user__name", "id"))
    if not enrollments:
        return []

    user_ids = list({uc.user_id for uc in enrollments})
    course_ids = list({uc.course_id for uc in enrollments})
    payments_map = _payments_by_pair(user_ids, course_ids)

    rows: list[LegacyFullyPaidAuditRow] = []
    for uc in enrollments:
        payments = payments_map.get((uc.user_id, uc.course_id), [])
        rows.append(
            build_audit_row(
                schema_name=schema_name,
                user_course=uc,
                payments=payments,
            )
        )
    return rows


def summarize_audit_rows(rows: Iterable[LegacyFullyPaidAuditRow]) -> Counter[str]:
    counts: Counter[str] = Counter()
    for row in rows:
        counts[row.risk] += 1
    return counts


def write_audit_csv(rows: Iterable[LegacyFullyPaidAuditRow], stream: TextIO) -> None:
    writer = csv.DictWriter(stream, fieldnames=CSV_COLUMNS)
    writer.writeheader()
    for row in rows:
        writer.writerow(row.as_csv_dict())
