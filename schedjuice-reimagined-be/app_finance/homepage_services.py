"""Finance homepage dashboard aggregates (program-scoped, bulk queries only)."""

from __future__ import annotations

import calendar
import datetime
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from typing import Literal

from django.db.models import Q
from django.utils import timezone

from app_auth.models import User
from app_course.course_scoping import scope_courses_for_user
from app_course.models import Course, Intake, Program, UserCourse
from app_finance.discount_engine import compute_course_term_total
from app_finance.models import UserPayment
from app_finance.payment_discount_apply import resolve_student_enrollments_bulk
from app_finance.unpaid_helpers import paid_user_ids_by_course
from app_reports.analytics_services import (
    _as_org_day_bounds,
    _date_series,
    _tz_for_tenant,
)

PeriodKind = Literal[
    "single_month",
    "last_3_months",
    "last_6_months",
    "last_12_months",
    "all_time",
    "custom",
    "intake_range",
]
PieGroupBy = Literal["payment_status", "bank_type", "payment_method", "course"]

VALID_PERIODS: frozenset[str] = frozenset(
    {
        "single_month",
        "last_3_months",
        "last_6_months",
        "last_12_months",
        "all_time",
        "custom",
        "intake_range",
    }
)
VALID_PIE_GROUP_BY: frozenset[str] = frozenset(
    {"payment_status", "bank_type", "payment_method", "course"}
)


@dataclass(frozen=True)
class PeriodBounds:
    date_from: datetime.date
    date_to: datetime.date
    anchor_year: int
    anchor_month: int
    label: str


@dataclass(frozen=True)
class GhostBounds:
    date_from: datetime.date
    date_to: datetime.date
    anchor_year: int
    anchor_month: int
    label: str
    align_by_day_index: bool


def resolve_scope_course_ids(
    *, program_id: int, intake_id: int | None, user: User
) -> list[int]:
    qs = Course.objects.filter(program_id=program_id)
    if intake_id is not None:
        qs = qs.filter(intake_id=intake_id)
    qs = scope_courses_for_user(user, qs)
    return list(qs.values_list("id", flat=True))


def _today_for_org(org) -> datetime.date:
    tz = _tz_for_tenant(org)
    return timezone.now().astimezone(tz).date()


def _month_end(year: int, month: int) -> datetime.date:
    last_day = calendar.monthrange(year, month)[1]
    return datetime.date(year, month, last_day)


def _shift_months(d: datetime.date, months: int) -> datetime.date:
    month_index = d.year * 12 + (d.month - 1) + months
    year = month_index // 12
    month = month_index % 12 + 1
    day = min(d.day, calendar.monthrange(year, month)[1])
    return datetime.date(year, month, day)


def resolve_period_bounds(
    *,
    period: PeriodKind,
    date_from: datetime.date | None,
    date_to: datetime.date | None,
    intake: Intake | None,
    org,
    course_ids: list[int],
) -> PeriodBounds:
    today = _today_for_org(org)

    if intake is not None and period == "intake_range":
        end = min(intake.end_date, today)
        start = min(intake.start_date, end)
        anchor = end
        return PeriodBounds(
            date_from=start,
            date_to=end,
            anchor_year=anchor.year,
            anchor_month=anchor.month,
            label=intake.name,
        )

    if period == "custom":
        if date_from is None or date_to is None:
            raise ValueError("date_from and date_to are required for custom period")
        start, end = min(date_from, date_to), max(date_from, date_to)
    elif period == "single_month":
        ref = date_from or today
        start = datetime.date(ref.year, ref.month, 1)
        end = min(_month_end(ref.year, ref.month), today)
    elif period == "last_3_months":
        end = date_to or today
        start = _shift_months(end, -2)
        start = datetime.date(start.year, start.month, 1)
    elif period == "last_6_months":
        end = date_to or today
        start = _shift_months(end, -5)
        start = datetime.date(start.year, start.month, 1)
    elif period == "last_12_months":
        end = date_to or today
        start = _shift_months(end, -11)
        start = datetime.date(start.year, start.month, 1)
    elif period == "all_time":
        end = date_to or today
        if course_ids:
            earliest = (
                Course.objects.filter(id__in=course_ids)
                .order_by("start_date")
                .values_list("start_date", flat=True)
                .first()
            )
            start = earliest or end
        else:
            start = end
    else:
        raise ValueError(f"Unsupported period: {period}")

    anchor = end
    label = _period_label(period, start, end)
    return PeriodBounds(
        date_from=start,
        date_to=end,
        anchor_year=anchor.year,
        anchor_month=anchor.month,
        label=label,
    )


def _period_label(period: str, start: datetime.date, end: datetime.date) -> str:
    labels = {
        "single_month": start.strftime("%b %Y"),
        "last_3_months": "Last 3 months",
        "last_6_months": "Last 6 months",
        "last_12_months": "Last 12 months",
        "all_time": "All time",
        "custom": f"{start.isoformat()} – {end.isoformat()}",
    }
    return labels.get(period, f"{start.isoformat()} – {end.isoformat()}")


def resolve_ghost_bounds(
    *,
    current: PeriodBounds,
    program_id: int,
    intake: Intake | None,
    period: PeriodKind,
) -> GhostBounds | None:
    if intake is not None and period == "intake_range":
        prev = (
            Intake.objects.filter(program_id=program_id, start_date__lt=intake.start_date)
            .order_by("-start_date")
            .first()
        )
        if prev is None:
            return None
        return GhostBounds(
            date_from=prev.start_date,
            date_to=prev.end_date,
            anchor_year=prev.end_date.year,
            anchor_month=prev.end_date.month,
            label=prev.name,
            align_by_day_index=True,
        )

    span_days = (current.date_to - current.date_from).days + 1
    ghost_end = current.date_from - datetime.timedelta(days=1)
    ghost_start = ghost_end - datetime.timedelta(days=span_days - 1)
    if ghost_start > ghost_end:
        return None

    if period == "single_month":
        ghost_anchor = _shift_months(
            datetime.date(current.anchor_year, current.anchor_month, 1), -1
        )
        anchor_year, anchor_month = ghost_anchor.year, ghost_anchor.month
        label = ghost_anchor.strftime("%b %Y")
    else:
        anchor_year, anchor_month = ghost_end.year, ghost_end.month
        label = f"{ghost_start.isoformat()} – {ghost_end.isoformat()}"

    return GhostBounds(
        date_from=ghost_start,
        date_to=ghost_end,
        anchor_year=anchor_year,
        anchor_month=anchor_month,
        label=label,
        align_by_day_index=False,
    )


def _verified_payments_qs(*, course_ids: list[int], start_dt, end_dt):
    if not course_ids:
        return UserPayment.objects.none()
    filters: dict = {
        "course_id__in": course_ids,
        "status": UserPayment.Status.VERIFIED,
        "verified_at__isnull": False,
        "verified_at__lte": end_dt,
    }
    if start_dt is not None:
        filters["verified_at__gte"] = start_dt
    return UserPayment.objects.filter(**filters)


def _pie_payments_qs(*, course_ids: list[int], start_dt, end_dt):
    if not course_ids:
        return UserPayment.objects.none()
    verified_q = Q(verified_at__lte=end_dt)
    if start_dt is not None:
        verified_q = Q(verified_at__gte=start_dt, verified_at__lte=end_dt)
    issued_q = Q(verified_at__isnull=True, issued_at__lte=end_dt)
    if start_dt is not None:
        issued_q = Q(
            verified_at__isnull=True,
            issued_at__gte=start_dt,
            issued_at__lte=end_dt,
        )
    return UserPayment.objects.filter(
        course_id__in=course_ids,
        course_id__isnull=False,
    ).filter(verified_q | issued_q)


def aggregate_collected_summary(
    *, course_ids: list[int], start_dt, end_dt
) -> tuple[Decimal, int]:
    qs = _verified_payments_qs(
        course_ids=course_ids, start_dt=start_dt, end_dt=end_dt
    )
    total = Decimal("0")
    count = 0
    for row in qs.values("actual_amount", "parsed_amount"):
        amt = _amount_from_row(row)
        if amt is None:
            continue
        total += amt
        count += 1
    return total, count


def aggregate_daily_series(
    *, course_ids: list[int], start_dt, end_dt, org
) -> list[dict[str, str]]:
    tz = _tz_for_tenant(org)
    start_d = start_dt.astimezone(tz).date() if start_dt is not None else None
    end_d = end_dt.astimezone(tz).date()
    buckets: dict[datetime.date, Decimal] = {}

    qs = _verified_payments_qs(
        course_ids=course_ids, start_dt=start_dt, end_dt=end_dt
    )
    for row in qs.values("verified_at", "actual_amount", "parsed_amount"):
        verified_at = row.get("verified_at")
        if verified_at is None:
            continue
        amt = _amount_from_row(row)
        if amt is None:
            continue
        day = verified_at.astimezone(tz).date()
        buckets[day] = buckets.get(day, Decimal("0")) + amt

    if buckets:
        series_start = min(buckets.keys())
        series_end = end_d
    elif start_d is not None:
        series_start = start_d
        series_end = end_d
    else:
        series_start = end_d
        series_end = end_d

    return [
        {
            "date": d.isoformat(),
            "amount": _money_str(buckets.get(d, Decimal("0"))),
        }
        for d in _date_series(series_start, series_end)
    ]


def _ghost_series_aligned(
    *,
    current_series: list[dict[str, str]],
    ghost_buckets: dict[datetime.date, Decimal],
    ghost_start: datetime.date,
) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    for idx, point in enumerate(current_series):
        ghost_day = ghost_start + datetime.timedelta(days=idx)
        amount = ghost_buckets.get(ghost_day, Decimal("0"))
        out.append({"date": point["date"], "amount": _money_str(amount)})
    return out


def aggregate_daily_series_ghost(
    *,
    course_ids: list[int],
    ghost: GhostBounds,
    org,
    current_series: list[dict[str, str]],
) -> list[dict[str, str]]:
    tz = _tz_for_tenant(org)
    start_dt, end_dt = _as_org_day_bounds(ghost.date_from, ghost.date_to, tz)
    buckets: dict[datetime.date, Decimal] = {}
    qs = _verified_payments_qs(
        course_ids=course_ids, start_dt=start_dt, end_dt=end_dt
    )
    for row in qs.values("verified_at", "actual_amount", "parsed_amount"):
        verified_at = row.get("verified_at")
        if verified_at is None:
            continue
        amt = _amount_from_row(row)
        if amt is None:
            continue
        day = verified_at.astimezone(tz).date()
        buckets[day] = buckets.get(day, Decimal("0")) + amt

    if ghost.align_by_day_index:
        return _ghost_series_aligned(
            current_series=current_series,
            ghost_buckets=buckets,
            ghost_start=ghost.date_from,
        )

    start_d = ghost.date_from
    end_d = ghost.date_to
    return [
        {
            "date": d.isoformat(),
            "amount": _money_str(buckets.get(d, Decimal("0"))),
        }
        for d in _date_series(start_d, end_d)
    ]


def _anchor_month_payment_params(
    *, anchor_year: int, anchor_month: int, org
) -> dict[str, str]:
    tz = _tz_for_tenant(org)
    start_d = datetime.date(anchor_year, anchor_month, 1)
    end_d = _month_end(anchor_year, anchor_month)
    start_dt, end_dt = _as_org_day_bounds(start_d, end_d, tz)
    return {
        "issued_at__gte": start_dt.isoformat(),
        "issued_at__lte": end_dt.isoformat(),
    }


def aggregate_unpaid_summary(
    *,
    course_ids: list[int],
    anchor_year: int,
    anchor_month: int,
    org,
) -> tuple[Decimal, int]:
    if not course_ids:
        return Decimal("0"), 0

    payment_params = _anchor_month_payment_params(
        anchor_year=anchor_year, anchor_month=anchor_month, org=org
    )
    paid_by_course = paid_user_ids_by_course(payment_params, course_ids)
    rows = UserCourse.objects.filter(
        course_id__in=course_ids,
        assigned_as=UserCourse.AssignedAs.STUDENT,
    ).values_list("course_id", "user_id")

    unpaid_pairs: set[tuple[int, int]] = set()
    unpaid_student_ids: set[int] = set()
    for cid, uid in rows:
        if uid in paid_by_course.get(cid, ()):
            continue
        unpaid_pairs.add((uid, cid))
        unpaid_student_ids.add(uid)

    if not unpaid_pairs:
        return Decimal("0"), 0

    enrollments = resolve_student_enrollments_bulk(unpaid_pairs)
    total = Decimal("0")
    for (_uid, _cid), uc in enrollments.items():
        plan = uc.course.payment_plan
        if plan is None:
            continue
        term = compute_course_term_total(user_course=uc, payment_plan=plan)
        total += Decimal(str(term.amount))

    return total, len(unpaid_student_ids)


def _money_str(value: Decimal) -> str:
    return str(value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _amount_from_row(row) -> Decimal | None:
    actual = row.get("actual_amount")
    if actual is not None:
        return Decimal(str(actual))
    parsed = row.get("parsed_amount")
    if parsed is not None:
        return Decimal(str(parsed))
    return None


def _payment_amount_for_row(row: dict) -> Decimal | None:
    status = row.get("status")
    if status == UserPayment.Status.VERIFIED:
        return _amount_from_row(row)
    parsed = row.get("parsed_amount")
    if parsed is not None:
        return Decimal(str(parsed))
    return None


def aggregate_pie_slices(
    *,
    course_ids: list[int],
    start_dt,
    end_dt,
    pie_group_by: PieGroupBy,
) -> list[dict]:
    qs = _pie_payments_qs(course_ids=course_ids, start_dt=start_dt, end_dt=end_dt)
    buckets: dict[str, dict] = {}

    if pie_group_by == "payment_status":
        for row in qs.values("status", "actual_amount", "parsed_amount", "verified_at"):
            amt = _payment_amount_for_row(row)
            if amt is None or amt == 0:
                continue
            key = row["status"]
            label = str(key).replace("_", " ").title()
            entry = buckets.setdefault(
                key, {"key": key, "label": label, "amount": Decimal("0"), "count": 0}
            )
            entry["amount"] += amt
            entry["count"] += 1
    elif pie_group_by == "bank_type":
        for row in qs.values(
            "payment_method__payment_bank", "actual_amount", "parsed_amount", "status", "verified_at"
        ):
            amt = _payment_amount_for_row(row)
            if amt is None or amt == 0:
                continue
            bank = row.get("payment_method__payment_bank")
            key = bank or "unknown"
            label = bank if bank else "Unknown"
            entry = buckets.setdefault(
                key, {"key": key, "label": label, "amount": Decimal("0"), "count": 0}
            )
            entry["amount"] += amt
            entry["count"] += 1
    elif pie_group_by == "payment_method":
        for row in qs.values(
            "payment_method_id",
            "payment_method__name",
            "actual_amount",
            "parsed_amount",
            "status",
            "verified_at",
        ):
            amt = _payment_amount_for_row(row)
            if amt is None or amt == 0:
                continue
            pm_id = row.get("payment_method_id")
            key = str(pm_id) if pm_id is not None else "none"
            label = row.get("payment_method__name") or "No method"
            entry = buckets.setdefault(
                key, {"key": key, "label": label, "amount": Decimal("0"), "count": 0}
            )
            entry["amount"] += amt
            entry["count"] += 1
    elif pie_group_by == "course":
        for row in qs.values(
            "course_id", "course__title", "actual_amount", "parsed_amount", "status", "verified_at"
        ):
            amt = _payment_amount_for_row(row)
            if amt is None or amt == 0:
                continue
            cid = row.get("course_id")
            key = str(cid) if cid is not None else "none"
            label = row.get("course__title") or "No course"
            entry = buckets.setdefault(
                key, {"key": key, "label": label, "amount": Decimal("0"), "count": 0}
            )
            entry["amount"] += amt
            entry["count"] += 1

    slices = sorted(buckets.values(), key=lambda s: s["amount"], reverse=True)
    return [
        {
            "key": s["key"],
            "label": s["label"],
            "amount": _money_str(Decimal(str(s["amount"]))),
            "count": s["count"],
        }
        for s in slices
    ]


def _pct_change(current: Decimal | int, previous: Decimal | int) -> float | None:
    prev = Decimal(str(previous))
    if prev == 0:
        return None
    cur = Decimal(str(current))
    return float(((cur - prev) / prev) * Decimal("100"))


def _empty_payload(*, program: Program | None, period_label: str) -> dict:
    return {
        "summary": {
            "collected_amount": "0.00",
            "collected_count": 0,
            "unpaid_amount": "0.00",
            "unpaid_count": 0,
            "comparison": None,
        },
        "line_chart": {"current": [], "ghost": [], "ghost_label": None},
        "pie_chart": {"slices": []},
        "meta": {
            "program": _program_meta(program) if program else None,
            "period_label": period_label,
            "date_from": None,
            "date_to": None,
            "anchor_month": None,
        },
    }


def _program_meta(program: Program) -> dict:
    return {
        "id": program.id,
        "name": program.name,
        "course_creation_method": program.course_creation_method,
    }


def build_finance_homepage_payload(
    *,
    program_id: int,
    intake_id: int | None,
    period: PeriodKind,
    date_from: datetime.date | None,
    date_to: datetime.date | None,
    pie_group_by: PieGroupBy,
    user: User,
    org,
) -> dict:
    program = Program.objects.filter(id=program_id).first()
    if program is None:
        raise ValueError("Program not found")

    intake = None
    if intake_id is not None:
        intake = Intake.objects.filter(id=intake_id, program_id=program_id).first()
        if intake is None:
            raise ValueError("Intake not found for program")

    course_ids = resolve_scope_course_ids(
        program_id=program_id, intake_id=intake_id, user=user
    )
    if not course_ids:
        return _empty_payload(program=program, period_label="No courses")

    current_bounds = resolve_period_bounds(
        period=period,
        date_from=date_from,
        date_to=date_to,
        intake=intake,
        org=org,
        course_ids=course_ids,
    )
    tz = _tz_for_tenant(org)
    cur_start_dt, cur_end_dt = _as_org_day_bounds(
        current_bounds.date_from, current_bounds.date_to, tz
    )
    is_intake_range = intake is not None and period == "intake_range"
    collection_start_dt = None if is_intake_range else cur_start_dt

    collected_amount, collected_count = aggregate_collected_summary(
        course_ids=course_ids,
        start_dt=collection_start_dt,
        end_dt=cur_end_dt,
    )
    unpaid_amount, unpaid_count = aggregate_unpaid_summary(
        course_ids=course_ids,
        anchor_year=current_bounds.anchor_year,
        anchor_month=current_bounds.anchor_month,
        org=org,
    )
    current_line = aggregate_daily_series(
        course_ids=course_ids,
        start_dt=collection_start_dt,
        end_dt=cur_end_dt,
        org=org,
    )
    pie_slices = aggregate_pie_slices(
        course_ids=course_ids,
        start_dt=collection_start_dt,
        end_dt=cur_end_dt,
        pie_group_by=pie_group_by,
    )

    ghost_bounds = resolve_ghost_bounds(
        current=current_bounds,
        program_id=program_id,
        intake=intake,
        period=period,
    )
    comparison = None
    ghost_line: list[dict[str, str]] = []
    ghost_label = None

    if ghost_bounds is not None:
        ghost_start_dt, ghost_end_dt = _as_org_day_bounds(
            ghost_bounds.date_from, ghost_bounds.date_to, tz
        )
        prev_collected_amount, prev_collected_count = aggregate_collected_summary(
            course_ids=course_ids, start_dt=ghost_start_dt, end_dt=ghost_end_dt
        )
        prev_unpaid_amount, prev_unpaid_count = aggregate_unpaid_summary(
            course_ids=course_ids,
            anchor_year=ghost_bounds.anchor_year,
            anchor_month=ghost_bounds.anchor_month,
            org=org,
        )
        ghost_line = aggregate_daily_series_ghost(
            course_ids=course_ids,
            ghost=ghost_bounds,
            org=org,
            current_series=current_line,
        )
        ghost_label = ghost_bounds.label
        comparison = {
            "collected_amount_pct": _pct_change(collected_amount, prev_collected_amount),
            "collected_count_pct": _pct_change(collected_count, prev_collected_count),
            "unpaid_amount_pct": _pct_change(unpaid_amount, prev_unpaid_amount),
            "unpaid_count_pct": _pct_change(unpaid_count, prev_unpaid_count),
        }

    return {
        "summary": {
            "collected_amount": _money_str(collected_amount),
            "collected_count": collected_count,
            "unpaid_amount": _money_str(unpaid_amount),
            "unpaid_count": unpaid_count,
            "comparison": comparison,
        },
        "line_chart": {
            "current": current_line,
            "ghost": ghost_line,
            "ghost_label": ghost_label,
        },
        "pie_chart": {"slices": pie_slices},
        "meta": {
            "program": _program_meta(program),
            "period_label": current_bounds.label,
            "date_from": current_bounds.date_from.isoformat(),
            "date_to": current_bounds.date_to.isoformat(),
            "anchor_month": {
                "year": current_bounds.anchor_year,
                "month": current_bounds.anchor_month,
            },
        },
    }
