"""
Aggregations for the Shortcuts / Analytics dashboard (on-the-fly SQL, tenant schema).
"""
from __future__ import annotations

import datetime
from collections import defaultdict
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.db.models import Count
from django.db.models.functions import TruncDate

from app_course.models import AssignedAsRole, Course, CourseMembershipEvent, UserCourse
from app_course.course_status import apply_effective_status_filter
from app_finance.models import UserPayment

_TZ_NAME_FOR_POSTGRES = {
    "Asia/Rangoon": "Asia/Yangon",
}


def _tz_for_tenant(organization) -> ZoneInfo:
    raw = getattr(organization, "timezone", None) or "UTC"
    name = _TZ_NAME_FOR_POSTGRES.get(str(raw), str(raw))
    try:
        return ZoneInfo(name)
    except Exception:
        return ZoneInfo("UTC")


def tenant_timezone_for_response(organization) -> str:
    """Public string for API payloads (e.g. series metadata)."""
    return str(_tz_for_tenant(organization))


def _as_org_day_bounds(
    start_d: datetime.date, end_d: datetime.date, tz: ZoneInfo
) -> tuple[datetime.datetime, datetime.datetime]:
    start_dt = datetime.datetime.combine(start_d, datetime.time.min, tzinfo=tz)
    end_dt = datetime.datetime.combine(end_d, datetime.time.max, tzinfo=tz)
    return start_dt, end_dt


def _date_series(start_d: datetime.date, end_d: datetime.date) -> list[datetime.date]:
    out = []
    cur = start_d
    one = datetime.timedelta(days=1)
    while cur <= end_d:
        out.append(cur)
        cur += one
    return out


def _map_counts_by_key(rows) -> dict:
    m = {}
    for r in rows:
        k = r.get("d") or r.get("day")
        if k is not None and hasattr(k, "date"):
            k = k.date()
        m[k] = int(r.get("c") or 0)
    return m


def build_time_series(
    start_d: datetime.date,
    end_d: datetime.date,
    org,
) -> list[dict]:
    tz = _tz_for_tenant(org)
    start_dt, end_dt = _as_org_day_bounds(start_d, end_d, tz)

    starts = (
        Course.objects.filter(start_date__gte=start_d, start_date__lte=end_d)
        .values("start_date")
        .annotate(c=Count("id"))
    )
    starts_map = {r["start_date"]: int(r["c"]) for r in starts}
    ends = (
        Course.objects.filter(end_date__gte=start_d, end_date__lte=end_d)
        .values("end_date")
        .annotate(c=Count("id"))
    )
    ends_map = {r["end_date"]: int(r["c"]) for r in ends}

    trunc = TruncDate("verified_at", tzinfo=tz)
    payment_rows = (
        UserPayment.objects.filter(
            status=UserPayment.Status.VERIFIED,
            verified_at__isnull=False,
            verified_at__gte=start_dt,
            verified_at__lte=end_dt,
        )
        .annotate(d=trunc)
        .values("d")
        .annotate(c=Count("id"))
    )
    pay_map = _map_counts_by_key(payment_rows)

    enroll_trunc = TruncDate("occurred_at", tzinfo=tz)
    enroll_rows = (
        CourseMembershipEvent.objects.filter(
            event_type=CourseMembershipEvent.EventType.JOINED,
            occurred_at__gte=start_dt,
            occurred_at__lte=end_dt,
        )
        .annotate(d=enroll_trunc)
        .values("d")
        .annotate(c=Count("id"))
    )
    enroll_map = _map_counts_by_key(enroll_rows)

    remove_trunc = TruncDate("occurred_at", tzinfo=tz)
    remove_rows = (
        CourseMembershipEvent.objects.filter(
            event_type=CourseMembershipEvent.EventType.REMOVED,
            occurred_at__gte=start_dt,
            occurred_at__lte=end_dt,
        )
        .annotate(d=remove_trunc)
        .values("d")
        .annotate(c=Count("id"))
    )
    remove_map = _map_counts_by_key(remove_rows)

    series = []
    for d in _date_series(start_d, end_d):
        series.append(
            {
                "date": d.isoformat(),
                "course_starts": int(starts_map.get(d, 0)),
                "course_ends": int(ends_map.get(d, 0)),
                "verified_payments": int(pay_map.get(d, 0)),
                "student_enrollments": int(enroll_map.get(d, 0)),
                "removals": int(remove_map.get(d, 0)),
            }
        )
    return series


def is_hm_course_start_day(day: int) -> bool:
    from app_course.course_month_type import is_hm_start_day

    return is_hm_start_day(day)


def build_active_breakdown(_org) -> dict:
    by_cat: dict[int, dict] = {}

    def ensure(cid: int, name: str) -> None:
        if cid not in by_cat:
            by_cat[cid] = {
                "category_id": cid,
                "category_name": name,
                "active_courses": 0,
                "active_courses_fm": 0,
                "active_courses_hm": 0,
                "active_student_seats": 0,
                "active_student_seats_fm": 0,
                "active_student_seats_hm": 0,
            }

    active_courses = apply_effective_status_filter(
        Course.objects.all(),
        [Course.CourseStatus.ACTIVE],
    )
    for c in (
        active_courses.select_related("category").iterator(chunk_size=500)
    ):
        if not c.category:
            continue
        cid, name = c.category_id, c.category.name
        ensure(cid, name)
        is_hm = is_hm_course_start_day(c.start_date.day)
        b = by_cat[cid]
        b["active_courses"] += 1
        if is_hm:
            b["active_courses_hm"] += 1
        else:
            b["active_courses_fm"] += 1

    for uc in (
        UserCourse.objects.filter(
            course__status=st,
            assigned_as=UserCourse.AssignedAs.STUDENT,
        )
        .select_related("course", "course__category")
        .iterator(chunk_size=500)
    ):
        c = uc.course
        if not c.category:
            continue
        cid, name = c.category_id, c.category.name
        ensure(cid, name)
        is_hm = is_hm_course_start_day(c.start_date.day)
        b = by_cat[cid]
        b["active_student_seats"] += 1
        if is_hm:
            b["active_student_seats_hm"] += 1
        else:
            b["active_student_seats_fm"] += 1

    categories = sorted(by_cat.values(), key=lambda x: (x["category_name"] or ""))
    return {
        "categories": categories,
        "totals": {
            "active_courses_fm": sum(c["active_courses_fm"] for c in categories),
            "active_courses_hm": sum(c["active_courses_hm"] for c in categories),
            "active_student_seats_fm": sum(c["active_student_seats_fm"] for c in categories),
            "active_student_seats_hm": sum(c["active_student_seats_hm"] for c in categories),
        },
    }


def _payment_revenue_amount(p: UserPayment) -> Decimal | None:
    if p.actual_amount is not None:
        a = p.actual_amount.amount
        if a is not None:
            return Decimal(a)
    if p.parsed_amount is not None:
        a = p.parsed_amount.amount
        if a is not None:
            return Decimal(a)
    return None


def _bucket_key_week(dt: datetime.datetime, tz: ZoneInfo) -> tuple[int, int]:
    d = dt.astimezone(tz).date()
    y, w, _ = d.isocalendar()
    return (y, w)


def _bucket_key_month(dt: datetime.datetime, tz: ZoneInfo) -> tuple[int, int]:
    d = dt.astimezone(tz)
    return (d.year, d.month)


def build_revenue_series(
    start_d: datetime.date,
    end_d: datetime.date,
    org,
    interval: str,
) -> list[dict]:
    tz = _tz_for_tenant(org)
    start_dt, end_dt = _as_org_day_bounds(start_d, end_d, tz)
    key_fn = _bucket_key_month if interval == "month" else _bucket_key_week
    bucket_totals: dict[tuple, Decimal] = defaultdict(lambda: Decimal("0"))
    for p in (
        UserPayment.objects.filter(
            status=UserPayment.Status.VERIFIED,
            verified_at__isnull=False,
            verified_at__gte=start_dt,
            verified_at__lte=end_dt,
        )
        .only(
            "id",
            "verified_at",
            "actual_amount",
            "actual_amount_currency",
            "parsed_amount",
            "parsed_amount_currency",
        )
        .iterator(chunk_size=1000)
    ):
        amt = _payment_revenue_amount(p)
        if amt is None:
            continue
        k = key_fn(p.verified_at, tz)
        bucket_totals[k] += amt
    if not bucket_totals:
        return []
    keys_sorted = sorted(bucket_totals.keys())
    out: list[dict] = []
    prev_total: Decimal | None = None
    for k in keys_sorted:
        total = bucket_totals[k]
        y, v = k[0], k[1]
        if interval == "month":
            label = f"{y}-{v:02d}"
            period = {"year": y, "month": v, "label": label}
        else:
            label = f"{y}-W{v:02d}"
            period = {"year": y, "iso_week": v, "label": label}
        if prev_total is None:
            delta = None
        else:
            delta = str(total - prev_total)
        out.append(
            {
                "period": period,
                "total": str(total),
                "revenue_delta": delta,
            }
        )
        prev_total = total
    return out


def build_teaching_load(_org) -> dict:
    active_courses = apply_effective_status_filter(
        Course.objects.all(),
        [Course.CourseStatus.ACTIVE],
    )
    qs = UserCourse.objects.filter(
        course_id__in=active_courses.values("id"),
        assigned_as=UserCourse.AssignedAs.TEACHER,
        assigned_as_role__isnull=False,
        assigned_as_role__seniority__isnull=False,
    ).exclude(assigned_as_role__seniority=AssignedAsRole.Seniority.OTHER)
    by_cat: dict[int, dict] = {}
    all_users: set = set()
    per_cat_users: dict[int, set] = defaultdict(set)
    for uc in qs.select_related("course", "course__category").iterator(chunk_size=500):
        c = uc.course
        if not c.category:
            continue
        cid, name = c.category_id, c.category.name
        if cid not in by_cat:
            by_cat[cid] = {
                "category_id": cid,
                "category_name": name,
                "teacher_assignments": 0,
            }
        by_cat[cid]["teacher_assignments"] += 1
        all_users.add(uc.user_id)
        per_cat_users[cid].add(uc.user_id)
    for cid, b in by_cat.items():
        b["distinct_teachers"] = len(per_cat_users.get(cid, ()))
    categories = sorted(by_cat.values(), key=lambda x: (x["category_name"] or ""))
    return {
        "categories": categories,
        "distinct_teachers_all_categories": len(all_users),
    }
