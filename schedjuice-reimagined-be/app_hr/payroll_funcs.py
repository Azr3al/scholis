from decimal import Decimal
from typing import Any, Optional

from app_auth.models import User
from app_attendance.models import UserEvent
from app_course.models import Course
from dateutil import tz, relativedelta
from datetime import datetime, timedelta


def round_to_closest_half_hour(dt: datetime) -> datetime:
    if not dt:
        return None
    minute = dt.minute
    if minute == 0 or minute == 30:
        return dt.replace(second=0, microsecond=0)
    elif minute < 15:
        return dt.replace(minute=0, second=0, microsecond=0)
    elif 15 <= minute < 45:
        return dt.replace(minute=30, second=0, microsecond=0)
    else:  # minute >= 45
        dt += timedelta(hours=1)
        return dt.replace(minute=0, second=0, microsecond=0)


def get_diff_in_hours(start: datetime, end: datetime) -> float:
    diff = end - start
    return round(diff.total_seconds() / 3600, 2)


def get_utc_month_range_from_local(month, year, timezone_code):
    timezone = tz.gettz(timezone_code)
    start_date_local = datetime(year, month, 1, tzinfo=timezone)
    next_month_start_local = start_date_local + relativedelta.relativedelta(months=1)
    return start_date_local.astimezone(tz.UTC), next_month_start_local.astimezone(tz.UTC)


# Default aggregate when a course has no qualifying sessions/teachers (immutable values only).
EMPTY_CASH_FLOW_AGGREGATE: dict[str, Any] = {
    "total_income": "0.00",
    "total_expense": "0.00",
    "total_profit": "0.00",
    "regular_hours": 0.0,
    "extra_hours": 0.0,
    "total_teacher_payroll": "0.00",
    "currency": "USD",
}


def _money_to_decimal(per_hour_price) -> Optional[Decimal]:
    if per_hour_price is None:
        return None
    return Decimal(str(per_hour_price.amount))


def _effective_trphillips_hourly_rate(ue: UserEvent) -> float:
    """Base hourly rate plus student bonus for this session's frozen snapshots."""
    rate = float(ue.hourly_rate_at_calculation)
    sc = ue.student_count_in_course_at_calculation
    sbr = ue.student_bonus_rate_at_calculation
    if sc is not None and sc > 1 and sbr:
        rate = rate + (float(sbr) * (sc - 1))
    return rate


def session_billable_window(ue: UserEvent) -> Optional[tuple[datetime, datetime]]:
    """
    Billable from/to for a qualifying UserEvent.
    Prefer frozen event bounds (exact); else rounded check-in/out.
    Returns None if duration would be <= 0.
    """
    frozen_from = getattr(ue, "event_time_from_at_calculation", None)
    frozen_to = getattr(ue, "event_time_to_at_calculation", None)
    if frozen_from is not None and frozen_to is not None and frozen_to > frozen_from:
        return frozen_from, frozen_to

    cin = round_to_closest_half_hour(ue.checkin_time)
    cout = round_to_closest_half_hour(ue.checkout_time)
    if not cin or not cout:
        return None
    if cout <= cin:
        return None
    return cin, cout


def session_billable_hours(ue: UserEvent) -> float:
    window = session_billable_window(ue)
    if window is None:
        return 0.0
    return get_diff_in_hours(window[0], window[1])


def get_tr_payments_trphillips(
    teacher: User,
    month: int,
    year: int,
    timezone_code: str,
    course_id: Optional[int] = None,
):
    """
    For naive payroll calculation, we can just query all UserEvents for the teacher in the month,
    and sum up hours and earnings. But, tr.phillips style depends on aggregate data.
    Teachers will get per hour pay for regular sessions.
    After regular sessions, teachers can get "extra" sessions.
    (there are a limit to how many extra sessions can be paid per month)
    The sessions are calculated per class. Meaning, the regular and extra sessions do not go over to other classes.

    If reg + extra < 16 -> will get reg pay
    If reg + extra > 16 and reg < 16 -> will get ((reg + extra) - 16) + reg pay
    If reg + extra > 16 and reg >= 16 -> will get reg + extra pay

    rate = 1,000
    E.g. 1: reg=10, extra=3 -> 10 * rate = 10,000
    E.g.2: reg=13, extra=5 -> ((13+5)-16) + 13 = 15 * rate = 15,000
    E.g.3: reg=17, extra=1 -> (17 + 1) * rate = 18 * rate = 18,000

    When sessions in the same course differ in frozen student_count / rates, ``rate`` is
    a hours-weighted average of each session's effective hourly rate (base + bonus).
    """
    start_date, end_date = get_utc_month_range_from_local(
        month,
        year,
        timezone_code,
    )
    ue_filter = dict(
        user_id=teacher.id,
        event__date__gte=start_date,
        event__date__lte=end_date,
        checkin_time__isnull=False,
        checkout_time__isnull=False,
        hourly_rate_at_calculation__isnull=False,
    )
    if course_id is not None:
        ue_filter["event__course_id"] = course_id
    user_events: list[UserEvent] = (
        UserEvent.objects.filter(**ue_filter)
        .order_by("event__date")
        .prefetch_related("event", "user", "event__course", "event__course__payment_plan")
        .all()
    )
    ues = []
    # Per-class totals: regular/extra hours; weighted_rate_hours sums hours * effective_rate per session
    by_course = {}  # course_id -> {"regular_hours", "extra_hours", "weighted_rate_hours"}

    for ue in user_events:
        window = session_billable_window(ue)
        if window is None:
            continue
        cin, cout = window
        hours = get_diff_in_hours(cin, cout)
        if hours <= 0:
            continue
        cid = ue.event.course.id
        rate = float(ue.hourly_rate_at_calculation)
        eff_rate = _effective_trphillips_hourly_rate(ue)

        if cid not in by_course:
            by_course[cid] = {
                "regular_hours": 0,
                "extra_hours": 0,
                "weighted_rate_hours": 0.0,
            }
        by_course[cid]["weighted_rate_hours"] += hours * eff_rate
        if ue.is_extra_class:
            by_course[cid]["extra_hours"] += hours
        else:
            by_course[cid]["regular_hours"] += hours

        x = {
            "course_id": cid,
            "event_id": ue.event.id,
            "date": ue.event.date,
            "user": ue.user.name,
            "course": ue.event.course.title,
            "checkin_time": cin,
            "checkout_time": cout,
            "hours": hours,
            "hourly_rate": rate,
            "student_bonus_rate": (ue.student_bonus_rate_at_calculation),
            "student_count": ue.student_count_in_course_at_calculation,
            "per_hour_price_at_calculation": getattr(
                ue, "per_hour_price_at_calculation", None
            ),

            "is_extra": ue.is_extra_class
        }
        ues.append(x)

    total_earnings = 0.0
    total_regular_hours = 0.0
    total_extra_hours = 0.0
    total_regular_earnings = 0.0
    total_extra_earnings = 0.0
    by_course_payroll: dict[int, dict[str, float]] = {}

    for cid, course_totals in by_course.items():
        reg = course_totals["regular_hours"]
        extra = course_totals["extra_hours"]
        total_h = reg + extra
        if total_h > 0:
            rate = course_totals["weighted_rate_hours"] / total_h
        else:
            rate = 0.0

        total_regular_hours += reg
        total_extra_hours += extra

        if reg + extra <= 16:
            course_earnings = reg * rate
        elif reg < 16:
            course_earnings = ((reg + extra) - 16 + reg) * rate
        else:
            course_earnings = (reg + extra) * rate

        if total_h > 0:
            total_regular_earnings += course_earnings * (reg / total_h)
            total_extra_earnings += course_earnings * (extra / total_h)

        total_earnings += course_earnings
        by_course_payroll[cid] = {
            "earnings": course_earnings,
            "total_hours": reg + extra,
        }

    return {
        "data": ues,
        "aggregate": {
            "regular_hours": total_regular_hours,
            "extra_hours": total_extra_hours,
            "regular_earnings": total_regular_earnings,
            "extra_earnings": total_extra_earnings,
            "session_count": len(ues),
            "total_earnings": total_earnings,
            "by_course": by_course_payroll,
        },
    }


def get_session_based_payments(
    teacher: User,
    month: int,
    year: int,
    timezone_code: str,
    course_id: Optional[int] = None,
):
    """
    Session-based payroll: total = per_session_rate * session_count.

    A session is a UserEvent with both checkin and checkout set in the month.
    """
    start_date, end_date = get_utc_month_range_from_local(
        month,
        year,
        timezone_code,
    )
    ue_filter = dict(
        user_id=teacher.id,
        event__date__gte=start_date,
        event__date__lte=end_date,
        checkin_time__isnull=False,
        checkout_time__isnull=False,
    )
    if course_id is not None:
        ue_filter["event__course_id"] = course_id
    user_events: list[UserEvent] = (
        UserEvent.objects.filter(**ue_filter)
        .order_by("event__date")
        .prefetch_related("event", "user", "event__course")
        .all()
    )

    per_session_rate = teacher.per_session_rate or Decimal("0")
    rows: list[dict[str, Any]] = []
    for ue in user_events:
        rows.append(
            {
                "course_id": ue.event.course.id,
                "event_id": ue.event.id,
                "date": ue.event.date,
                "user": ue.user.name,
                "course": ue.event.course.title,
                "checkin_time": ue.checkin_time,
                "checkout_time": ue.checkout_time,
                "per_session_rate": float(per_session_rate),
            }
        )

    session_count = len(rows)
    total_earnings = float(per_session_rate * session_count)

    return {
        "data": rows,
        "aggregate": {
            "session_count": session_count,
            "per_session_rate": float(per_session_rate),
            "total_earnings": total_earnings,
        },
    }


def get_cash_flow_trphillips(
    user: User,
    month: int,
    year: int,
    timezone_code: str,
    course_id: Optional[int] = None,
) -> dict[str, Any]:
    """
    Per-teacher, per-session cash flow for tr.phillips (internal helper).

    The HTTP endpoint only takes a course; ``get_cash_flow_trphillips_for_course`` loads
    each teacher who has sessions in that course and calls this once per teacher, then merges.

    Income from PaymentPlan.per_hour_price. Expense per row is a **proportional allocation**
    of that teacher's **per-course** tr.phillips payroll (reg/extra rules applied on course
    totals), not an independent payroll line per session—use aggregates for payroll truth.

    Only fully checked-in and checked-out sessions with positive billable duration
    (frozen event bounds when present, else half-hour-rounded check-in/out) are included.
    """
    result = get_tr_payments_trphillips(user, month, year, timezone_code, course_id=course_id)
    data = result["data"]
    by_course_payroll: dict[int, dict[str, float]] = result["aggregate"]["by_course"]

    course_ids = {row["course_id"] for row in data}
    per_hour_by_course: dict[int, Optional[Decimal]] = {}
    if course_ids:
        for c in Course.objects.filter(id__in=course_ids).select_related("payment_plan"):
            pp = c.payment_plan
            per_hour_by_course[c.id] = _money_to_decimal(pp.per_hour_price) if pp else None

    rows: list[dict[str, Any]] = []
    total_income = Decimal("0")
    total_expense = Decimal("0")

    for row in data:
        cid = row["course_id"]
        ph_raw = row.get("per_hour_price_at_calculation")
        if ph_raw is not None:
            ph = Decimal(str(ph_raw))
        else:
            ph = per_hour_by_course.get(cid)
        student_count = row["student_count"] if row["student_count"] is not None else 0
        hours = float(row["hours"])
        if ph is not None:
            income = (ph * Decimal(student_count) * Decimal(str(hours))).quantize(Decimal("0.01"))
        else:
            income = Decimal("0")

        cp = by_course_payroll.get(cid, {"earnings": 0.0, "total_hours": 0.0})
        th = float(cp["total_hours"])
        if th > 0:
            expense = (Decimal(str(cp["earnings"])) * Decimal(str(hours)) / Decimal(str(th))).quantize(
                Decimal("0.01")
            )
        else:
            expense = Decimal("0")

        profit = (income - expense).quantize(Decimal("0.01"))
        total_income += income
        total_expense += expense

        rows.append(
            {
                "course_id": cid,
                "event_id": row["event_id"],
                "date": row["date"],
                "course_title": row["course"],
                "student_count": student_count,
                "hours": hours,
                "income": str(income),
                "expense": str(expense),
                "profit": str(profit),
                "currency": "USD",
            }
        )

    total_profit = (total_income - total_expense).quantize(Decimal("0.01"))
    return {
        "rows": rows,
        "aggregate": {
            "total_income": str(total_income.quantize(Decimal("0.01"))),
            "total_expense": str(total_expense.quantize(Decimal("0.01"))),
            "total_profit": str(total_profit),
            "regular_hours": result["aggregate"]["regular_hours"],
            "extra_hours": result["aggregate"]["extra_hours"],
            "total_teacher_payroll": str(Decimal(str(result["aggregate"]["total_earnings"])).quantize(Decimal("0.01"))),
            "currency": "USD",
        },
    }


def get_cash_flow_trphillips_for_course(
    course_id: int,
    month: int,
    year: int,
    timezone_code: str,
) -> dict[str, Any]:
    """
    Cash flow for a single course across all teachers with sessions in the month.
    Delegates to get_cash_flow_trphillips per teacher and merges rows and aggregates.
    """
    start_date, end_date = get_utc_month_range_from_local(month, year, timezone_code)
    teacher_ids = list(
        UserEvent.objects.filter(
            event__course_id=course_id,
            event__date__gte=start_date,
            event__date__lte=end_date,
            checkin_time__isnull=False,
            checkout_time__isnull=False,
            hourly_rate_at_calculation__isnull=False,
        )
        .values_list("user_id", flat=True)
        .distinct()
    )
    if not teacher_ids:
        return {"rows": [], "aggregate": {**EMPTY_CASH_FLOW_AGGREGATE}}

    all_rows: list[dict[str, Any]] = []
    total_income = Decimal("0")
    total_expense = Decimal("0")
    total_profit = Decimal("0")
    regular_hours = 0.0
    extra_hours = 0.0
    total_teacher_payroll = Decimal("0")

    for tid in teacher_ids:
        user = User.objects.filter(id=tid).first()
        if not user:
            continue
        result = get_cash_flow_trphillips(user, month, year, timezone_code, course_id=course_id)
        all_rows.extend(result["rows"])
        agg = result["aggregate"]
        total_income += Decimal(str(agg["total_income"]))
        total_expense += Decimal(str(agg["total_expense"]))
        total_profit += Decimal(str(agg["total_profit"]))
        regular_hours += float(agg["regular_hours"])
        extra_hours += float(agg["extra_hours"])
        total_teacher_payroll += Decimal(str(agg["total_teacher_payroll"]))

    all_rows.sort(key=lambda r: r["date"])
    return {
        "rows": all_rows,
        "aggregate": {
            "total_income": str(total_income.quantize(Decimal("0.01"))),
            "total_expense": str(total_expense.quantize(Decimal("0.01"))),
            "total_profit": str(total_profit.quantize(Decimal("0.01"))),
            "regular_hours": regular_hours,
            "extra_hours": extra_hours,
            "total_teacher_payroll": str(total_teacher_payroll.quantize(Decimal("0.01"))),
            "currency": "USD",
        },
    }


def get_school_overview_trphillips(
    month: int,
    year: int,
    timezone_code: str,
) -> dict[str, Any]:
    """
    Per-course cash flow aggregates for the month (all courses with at least one qualifying
    UserEvent). Delegates to get_cash_flow_trphillips_for_course per course and sums grand totals.
    """
    start_date, end_date = get_utc_month_range_from_local(month, year, timezone_code)
    course_ids = list(
        UserEvent.objects.filter(
            event__date__gte=start_date,
            event__date__lte=end_date,
            checkin_time__isnull=False,
            checkout_time__isnull=False,
            hourly_rate_at_calculation__isnull=False,
        )
        .values_list("event__course_id", flat=True)
        .distinct()
    )
    empty_grand = {
        "total_income": "0.00",
        "total_expense": "0.00",
        "total_profit": "0.00",
    }
    if not course_ids:
        return {"courses": [], "grand_aggregate": empty_grand}

    titles = {c.id: c.title for c in Course.objects.filter(id__in=course_ids).only("id", "title")}
    courses_out: list[dict[str, Any]] = []
    total_income = Decimal("0")
    total_expense = Decimal("0")
    total_profit = Decimal("0")

    for cid in sorted(course_ids, key=lambda x: (titles.get(x) or "", x)):
        result = get_cash_flow_trphillips_for_course(cid, month, year, timezone_code)
        agg = result["aggregate"]
        title = titles.get(cid) or ""
        if not title and result["rows"]:
            title = str(result["rows"][0].get("course_title") or "")
        courses_out.append(
            {
                "course_id": cid,
                "course_title": title,
                "total_income": agg["total_income"],
                "total_expense": agg["total_expense"],
                "total_profit": agg["total_profit"],
            }
        )
        total_income += Decimal(str(agg["total_income"]))
        total_expense += Decimal(str(agg["total_expense"]))
        total_profit += Decimal(str(agg["total_profit"]))

    from app_hr.school_overview_query import enrich_school_overview_courses

    return {
        "courses": enrich_school_overview_courses(courses_out),
        "grand_aggregate": {
            "total_income": str(total_income.quantize(Decimal("0.01"))),
            "total_expense": str(total_expense.quantize(Decimal("0.01"))),
            "total_profit": str(total_profit.quantize(Decimal("0.01"))),
        },
    }
