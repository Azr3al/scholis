"""Shared logic for unpaid-student reports (per-course list and course summary).

A student is considered to **have a payment on file** for a course in the report's
calendar month iff there exists a `UserPayment` where:

- `course_id` matches the course (admin-uploaded payments without a course are ignored),
- the payment "covers" that calendar month per `app_finance.payment_coverage`:
  - if any `UserPaymentCoveredMonth` rows exist, only those (year, month) pairs apply,
  - otherwise the month is taken from `issued_at`.

The payment's `status` is intentionally **not** filtered: any row at any verification
stage (pending, awaiting extraction, verified, etc.) is enough to remove the student
from the unpaid list.
"""

from __future__ import annotations

import operator
from collections import Counter
from datetime import date, datetime
from functools import reduce
from typing import Any, Callable, Sequence

from django.db.models import Prefetch, Q
from django.utils import timezone

from app_course.course_month_type import (
    MONTH_TYPE_FM,
    MONTH_TYPE_HM,
    filter_queryset_by_month_type,
)
from app_course.course_search_queryset import normalize_user_course_sorts
from app_course.models import Course, UserCourse
from app_finance import models
from app_finance.enrollment_anchor import enrollment_applies_to_report_month
from app_finance.payment_coverage import (
    MonthTuple,
    apply_month_scope,
    furthest_covered_month_from_payments,
)

_VALID_MONTH_TYPES = frozenset({MONTH_TYPE_FM, MONTH_TYPE_HM})


def payment_filter_params_for_unpaid(filter_params: dict[str, Any]) -> dict[str, Any]:
    """Copy of filter params for UserPayment, with course_id removed (matches UnpaidUserPaymentView)."""
    p = {**filter_params}
    p.pop("course_id__exact", None)
    return p


def _year_month_from_payment_params(
    payment_params: dict[str, Any],
) -> tuple[int, int] | None:
    """Derive (year, month) from issued_at__gte; returns None if absent/unparseable."""
    gte = payment_params.get("issued_at__gte")
    if not gte:
        return None
    try:
        dt = parse_iso_to_aware_dt(str(gte))
    except (TypeError, ValueError):
        return None
    return (dt.year, dt.month)


def _payment_qs_for_month(payment_params: dict[str, Any]):
    """UserPayment queryset (any status) restricted to rows that apply to the report's month.

    Returns `None` if the month cannot be derived (caller should treat as "no payments").
    """
    ym = _year_month_from_payment_params(payment_params)
    if ym is None:
        return None
    qs = models.UserPayment.objects.filter(course_id__isnull=False)
    return apply_month_scope(qs, ym[0], ym[1])


def paid_user_ids(payment_params: dict[str, Any], course_id: int | str) -> list[int]:
    """User IDs with any UserPayment row for `course_id` in the report month (covered-months aware)."""
    qs = _payment_qs_for_month(payment_params)
    if qs is None or course_id in (None, ""):
        return []
    return list(
        qs.filter(course_id=course_id).values_list("user_id", flat=True)
    )


def paid_user_ids_by_course(
    payment_params: dict[str, Any],
    course_ids: list[int],
) -> dict[int, set[int]]:
    """Map `course_id -> {user_ids with any payment row for that course in the report month}`.

    Single DB query so the multi-course summary doesn't fan out per course.
    """
    if not course_ids:
        return {}
    qs = _payment_qs_for_month(payment_params)
    if qs is None:
        return {}
    out: dict[int, set[int]] = {}
    rows = qs.filter(course_id__in=course_ids).values_list("course_id", "user_id")
    for cid, uid in rows:
        if cid is None or uid is None:
            continue
        out.setdefault(cid, set()).add(uid)
    return out


def paid_until_by_user_course(
    course_ids: Sequence[int],
    user_ids: list[int],
) -> dict[tuple[int, int], MonthTuple | None]:
    """Map (course_id, user_id) -> furthest calendar month covered by any payment there.

    One query for every course in the report, so multi-course reports don't fan out.
    """
    course_ids = list(course_ids)
    if not course_ids or not user_ids:
        return {}
    payments = models.UserPayment.objects.filter(
        course_id__in=course_ids,
        user_id__in=user_ids,
    ).prefetch_related(
        Prefetch(
            "covered_months",
            queryset=models.UserPaymentCoveredMonth.objects.only(
                "year", "month_index", "user_payment_id"
            ),
        )
    )
    by_pair: dict[tuple[int, int], list[models.UserPayment]] = {}
    for payment in payments:
        by_pair.setdefault((payment.course_id, payment.user_id), []).append(payment)
    return {
        pair: furthest_covered_month_from_payments(pair_payments)
        for pair, pair_payments in by_pair.items()
    }


def paid_until_by_user_for_course(
    course_id: int,
    user_ids: list[int],
) -> dict[int, MonthTuple | None]:
    """Map user_id -> furthest calendar month covered by any payment on this course."""
    if not user_ids:
        return {}
    by_pair = paid_until_by_user_course([course_id], user_ids)
    return {uid: by_pair.get((int(course_id), uid)) for uid in user_ids}


def unpaid_user_courses_queryset(
    course_ids: Sequence[int],
    payment_params: dict[str, Any],
    sorts: list[str],
):
    """
    Students across `course_ids` who are not dropped out and have no UserPayment row
    for the course they are enrolled in covering the report month (covered-months
    aware), regardless of payment status.

    A student unpaid on one course but paid on another stays listed for the unpaid one.
    """
    course_ids = list(course_ids)
    order_fields = normalize_user_course_sorts(sorts)
    qs = (
        UserCourse.objects.filter(
            user__roles=["student"],
            course_id__in=course_ids,
        )
        .select_related("user", "course")
        .order_by(*order_fields)
    )
    paid_by_course = paid_user_ids_by_course(payment_params, course_ids)
    paid_clauses = [
        Q(course_id=cid, user_id__in=user_ids)
        for cid, user_ids in paid_by_course.items()
        if user_ids
    ]
    if paid_clauses:
        qs = qs.exclude(reduce(operator.or_, paid_clauses))
    ym = _year_month_from_payment_params(payment_params)
    if ym is not None:
        report_year, report_month = ym
        qs = qs.filter(
            Q(billing_cycle_anchor_date__isnull=True)
            | Q(billing_cycle_anchor_date__year__lt=report_year)
            | Q(
                billing_cycle_anchor_date__year=report_year,
                billing_cycle_anchor_date__month__lte=report_month,
            )
        )
    return qs


def unpaid_student_user_courses_queryset(
    course_id: int,
    payment_params: dict[str, Any],
    sorts: list[str],
):
    """
    Students in the course who are not dropped out and have no UserPayment row for this
    course in the report month (covered-months aware), regardless of payment status.
    """
    return unpaid_user_courses_queryset([course_id], payment_params, sorts)


def sort_unpaid_user_courses_by_paid_until(
    user_courses: list[UserCourse],
    paid_until_map: dict[Any, MonthTuple | None],
    key: Callable[[UserCourse], Any] = lambda uc: uc.user_id,
) -> list[UserCourse]:
    """Never-paid first (null paid_until), then alphabetical by student name.

    `key` maps a row to its lookup in `paid_until_map`, so multi-course reports can key
    by (course_id, user_id) while single-course callers keep keying by user_id.
    """

    def sort_key(uc: UserCourse) -> tuple[int, str]:
        paid_until = paid_until_map.get(key(uc))
        group = 0 if paid_until is None else 1
        name = (uc.user.name or "").lower()
        return (group, name)

    return sorted(user_courses, key=sort_key)


def parse_iso_to_aware_dt(value: str) -> datetime:
    """Parse ISO datetime string; assume UTC if naive."""
    s = value.replace("Z", "+00:00")
    dt = datetime.fromisoformat(s)
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone=timezone.utc)
    return dt


def date_bounds_from_issued_at_params(payment_params: dict[str, Any]) -> tuple[date, date]:
    """Derive inclusive calendar bounds from issued_at__gte / issued_at__lte."""
    gte = payment_params.get("issued_at__gte")
    lte = payment_params.get("issued_at__lte")
    if not gte or not lte:
        raise ValueError("issued_at__gte and issued_at__lte are required")
    d0 = parse_iso_to_aware_dt(str(gte)).date()
    d1 = parse_iso_to_aware_dt(str(lte)).date()
    return (min(d0, d1), max(d0, d1))


def course_ids_overlapping_range(
    first_day: date,
    last_day: date,
    course_month_type: str | None = None,
) -> list[int]:
    qs = Course.objects.filter(start_date__lte=last_day, end_date__gte=first_day)
    if course_month_type in _VALID_MONTH_TYPES:
        qs = filter_queryset_by_month_type(qs, course_month_type)
    return list(qs.values_list("id", flat=True))


def unpaid_counts_by_course(
    course_ids: list[int],
    payment_params: dict[str, Any],
) -> dict[int, int]:
    """
    For each course_id, count UserCourse rows (non-dropped students, excluding users
    with any UserPayment row for **that** course in the report month). Courses with
    zero unpaid are omitted from the dict.
    """
    if not course_ids:
        return {}
    paid_by_course = paid_user_ids_by_course(payment_params, course_ids)
    ym = _year_month_from_payment_params(payment_params)
    rows = UserCourse.objects.filter(
        course_id__in=course_ids,
        user__roles=["student"],
    ).values_list("course_id", "user_id", "billing_cycle_anchor_date")
    counts: Counter[int] = Counter()
    for cid, uid, anchor in rows:
        if uid in paid_by_course.get(cid, ()):
            continue
        if ym is not None:
            report_year, report_month = ym
            if not enrollment_applies_to_report_month(
                billing_cycle_anchor_date=anchor,
                report_year=report_year,
                report_month=report_month,
            ):
                continue
        counts[cid] += 1
    return dict(counts)


def unpaid_course_summary_rows(
    payment_params: dict[str, Any],
    course_month_type: str | None = None,
) -> list[dict[str, Any]]:
    """
    One row per course overlapping the month implied by issued_at filters, with unpaid_count.
    If course_month_type is FM or HM, only courses whose start_date matches that type
    (same rule as frontend getCourseMonthType) are included.
    """
    first_day, last_day = date_bounds_from_issued_at_params(payment_params)
    course_ids = course_ids_overlapping_range(first_day, last_day, course_month_type)
    counts = unpaid_counts_by_course(course_ids, payment_params)
    courses = (
        Course.objects.filter(id__in=course_ids)
        .select_related("category")
        .order_by("title")
    )
    data: list[dict[str, Any]] = []
    for c in courses:
        cat = c.category
        cat_name = getattr(cat, "name", None) or "Uncategorized"
        cat_id = cat.id if cat is not None else None
        cat_sort_order = getattr(cat, "sort_order", 0) if cat is not None else 0
        data.append(
            {
                "course_id": c.id,
                "title": c.title,
                "category_id": cat_id,
                "category_name": cat_name,
                "category_sort_order": cat_sort_order,
                "unpaid_count": counts.get(c.id, 0),
            }
        )
    return data
