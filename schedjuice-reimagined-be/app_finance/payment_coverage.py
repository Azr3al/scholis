"""Calendar-month visibility for UserPayment (explicit covered months + implicit issued_at)."""

from __future__ import annotations

from calendar import monthrange
from datetime import date, datetime

from django.db.models import Exists, OuterRef, Q, QuerySet
from django.utils import timezone as dj_timezone
from rest_framework.exceptions import ValidationError

from app_finance.models import UserPayment, UserPaymentCoveredMonth

MonthTuple = tuple[int, int]


def month_visibility_q(year: int, month: int) -> Q:
    """Which payments apply to calendar month (year, month)."""
    has_any = Exists(
        UserPaymentCoveredMonth.objects.filter(user_payment_id=OuterRef("pk"))
    )
    covers = Exists(
        UserPaymentCoveredMonth.objects.filter(
            user_payment_id=OuterRef("pk"),
            year=year,
            month_index=month,
        )
    )
    return covers | (~has_any & Q(issued_at__year=year, issued_at__month=month))


def apply_month_scope(qs: QuerySet, year: int, month: int) -> QuerySet:
    return qs.filter(month_visibility_q(year, month)).distinct()


def first_month_instant(year: int, month: int):
    """Timezone-aware first instant of calendar month (current Django TZ)."""
    tz = dj_timezone.get_current_timezone()
    naive = datetime(year, month, 1, 0, 0, 0)
    return dj_timezone.make_aware(naive, tz)


def normalize_month_entries(months: list[dict]) -> list[tuple[int, int]]:
    """Unique (year, month_index), sorted chronologically."""
    seen: set[tuple[int, int]] = set()
    out: list[tuple[int, int]] = []
    for m in months:
        y = int(m["year"])
        mi = int(m["month_index"])
        if not (1 <= mi <= 12):
            raise ValueError("month_index must be 1–12")
        if y < 1900 or y > 2100:
            raise ValueError("year out of range")
        key = (y, mi)
        if key not in seen:
            seen.add(key)
            out.append(key)
    out.sort(key=lambda t: (t[0], t[1]))
    return out


def sync_user_payment_covered_months(up: UserPayment, months: list[dict] | None) -> None:
    """
    Replace coverage rows. Empty list or None => implicit-only (issued_at); delete all junction rows.
    Otherwise bulk-create rows and set issued_at to first covered month.
    """
    UserPaymentCoveredMonth.objects.filter(user_payment=up).delete()
    if not months:
        return
    tuples_sorted = normalize_month_entries(months)
    first_y, first_m = tuples_sorted[0]
    UserPaymentCoveredMonth.objects.bulk_create(
        [
            UserPaymentCoveredMonth(
                user_payment=up,
                year=y,
                month_index=m,
            )
            for y, m in tuples_sorted
        ]
    )
    up.issued_at = first_month_instant(first_y, first_m)
    up.save(update_fields=["issued_at"])


def compare_month(a: MonthTuple, b: MonthTuple) -> int:
    """Return negative if a < b, zero if equal, positive if a > b."""
    ay, am = a
    by, bm = b
    if ay != by:
        return ay - by
    return am - bm


def next_calendar_month(year: int, month: int) -> MonthTuple:
    if month >= 12:
        return year + 1, 1
    return year, month + 1


def calendar_months_between_dates(start: date, end: date) -> list[MonthTuple]:
    """Inclusive calendar months between two dates."""
    a = start if start <= end else end
    b = end if start <= end else start
    out: list[MonthTuple] = []
    y, m = a.year, a.month
    end_y, end_m = b.year, b.month
    while y < end_y or (y == end_y and m <= end_m):
        out.append((y, m))
        y, m = next_calendar_month(y, m)
    return out


def calendar_months_for_course(course) -> list[MonthTuple]:
    """Course calendar months from start_date through end_date (inclusive)."""
    if not course or not course.start_date:
        return []
    start = course.start_date
    end = course.end_date or course.start_date
    return calendar_months_between_dates(start, end)


def last_calendar_day(year: int, month: int) -> date:
    return date(year, month, monthrange(year, month)[1])


def calendar_month_overlaps_course(course, year: int, month: int) -> bool:
    """True when calendar month overlaps course start/end (inclusive)."""
    if not course or not course.start_date or not course.end_date:
        return True
    first_day = date(year, month, 1)
    last_day = last_calendar_day(year, month)
    return course.start_date <= last_day and course.end_date >= first_day


def resolve_suggested_payment_month(
    course,
    *,
    today: date | None = None,
) -> MonthTuple | None:
    if not course or not course.start_date or not course.end_date:
        return None
    today = today or dj_timezone.localdate()
    start = course.start_date
    end = course.end_date
    if today < start:
        return (start.year, start.month)
    if today > end:
        return (end.year, end.month)
    return (today.year, today.month)


def month_tuples_from_payment(up: UserPayment) -> list[MonthTuple]:
    """Explicit covered months, or implicit month from issued_at."""
    cms = list(up.covered_months.all())
    if cms:
        tuples = [(cm.year, cm.month_index) for cm in cms]
        tuples.sort(key=lambda t: (t[0], t[1]))
        return tuples
    if up.issued_at:
        return [(up.issued_at.year, up.issued_at.month)]
    return []


def furthest_covered_month_from_payments(
    payments: QuerySet[UserPayment] | list[UserPayment],
) -> MonthTuple | None:
    """Latest calendar month covered by any payment in the iterable."""
    furthest: MonthTuple | None = None
    for up in payments:
        for y, m in month_tuples_from_payment(up):
            if furthest is None or compare_month((y, m), furthest) > 0:
                furthest = (y, m)
    return furthest


def format_month_label(year: int, month: int) -> str:
    return date(year, month, 1).strftime("%B %Y")


def compute_incremental_installment_months(
    *,
    user_id: int,
    course_id: int,
    target_year: int,
    target_month: int,
    exclude_payment_id: int | None = None,
) -> list[dict]:
    """
    Months unlocked by a new installment: from (current furthest + 1) through target N,
    bounded by the course calendar. Raises ValidationError when target adds no new months.
    """
    from app_course.models import Course

    course = Course.objects.filter(id=course_id).first()
    if course is None:
        raise ValidationError({"course": "Course not found."})

    course_months = calendar_months_for_course(course)
    if not course_months:
        raise ValidationError(
            {"installment_through_month": "Course has no start/end dates."}
        )

    course_set = set(course_months)
    target = (int(target_year), int(target_month))
    if target not in course_set:
        raise ValidationError(
            {
                "installment_through_month": (
                    "Target month must fall within the course schedule."
                )
            }
        )

    # Clamp target to course end (already validated as in course_set).
    clamped_target = target

    qs = UserPayment.objects.filter(user_id=user_id, course_id=course_id).prefetch_related(
        "covered_months"
    )
    if exclude_payment_id is not None:
        qs = qs.exclude(id=exclude_payment_id)

    furthest = furthest_covered_month_from_payments(qs)

    if furthest is None:
        incremental = [m for m in course_months if compare_month(m, clamped_target) <= 0]
    else:
        if compare_month(clamped_target, furthest) <= 0:
            raise ValidationError(
                {
                    "installment_through_month": (
                        f"Student is already covered through "
                        f"{format_month_label(furthest[0], furthest[1])}."
                    )
                }
            )
        incremental = []
        for m in course_months:
            if compare_month(m, furthest) <= 0:
                continue
            if compare_month(m, clamped_target) <= 0:
                incremental.append(m)
            else:
                break

    if not incremental:
        raise ValidationError(
            {
                "installment_through_month": (
                    "Installment must cover at least one new month."
                )
            }
        )

    return [{"year": y, "month_index": m} for y, m in incremental]
