"""
Helpers for the "available teachers" shortcuts tool: staff filter params and
timeslot busy-user SQL (raw queries for performance).
"""

from __future__ import annotations

import calendar
import datetime as dt
from typing import Any, Literal

DayParity = Literal["all", "even", "odd"]

from app_auth.models import User
from app_course.collision_availability import fetch_busy_user_ids_for_timeslot

# System staff roles for overlap/contained_by filters in search and AI tools.
STAFF_ROLES_FOR_SHORTCUTS: tuple[str, ...] = (
    User.UserRole.SUPERADMIN,
    User.UserRole.ADMIN,
    User.UserRole.MANAGER,
    User.UserRole.TEACHER,
    User.UserRole.FINANCE,
    User.UserRole.HR,
)


def filter_active_staff_users(qs):
    """
    Active, non-resigned users with at least one system staff role.
    Uses roles overlap (User Hub staff tab semantics) so custom RBAC slugs
    such as telegram-beta-tester do not exclude otherwise-staff accounts.
    """
    return qs.filter(
        is_active=True,
        resigned_at__isnull=True,
        roles__overlap=[*STAFF_ROLES_FOR_SHORTCUTS],
    )


def filter_active_teachers(qs):
    """Active users who have the teacher system role (may hold other roles too)."""
    return qs.filter(
        is_active=True,
        resigned_at__isnull=True,
        roles__overlap=[User.UserRole.TEACHER],
    )


def get_staff_user_filter_params() -> list[dict[str, Any]]:
    """
    Filter params for generic list/search APIs: `roles` contained_by allowlist.
    Value uses the same PostgreSQL array literal shape as the frontend `{a,b}`.
    """
    inner = ",".join(STAFF_ROLES_FOR_SHORTCUTS)
    return [
        {
            "field_name": "roles",
            "operator": "contained_by",
            "value": f"{{{inner}}}",
        }
    ]


def user_can_access_admin_shortcuts(user: User) -> bool:
    """Same gate as user-schedule shortcut page (superadmin / admin / manager)."""
    return (
        User.UserRole.SUPERADMIN in user.roles
        or User.UserRole.ADMIN in user.roles
        or User.UserRole.MANAGER in user.roles
    )


def parse_iso_weekdays_param(raw: str) -> set[int]:
    """
    Parse comma-separated ISO weekdays (Monday=1 … Sunday=7).
    """
    if not raw or not raw.strip():
        return set()
    out: set[int] = set()
    for part in raw.split(","):
        p = part.strip()
        if not p:
            continue
        n = int(p)
        if n < 1 or n > 7:
            raise ValueError(f"Invalid weekday: {p} (expected 1–7)")
        out.add(n)
    return out


def iter_dates_in_month_matching_weekdays(
    year: int,
    month: int,
    iso_weekdays: set[int],
) -> list[dt.date]:
    """Return calendar dates in [year, month] whose ISO weekday is in iso_weekdays."""
    _, last = calendar.monthrange(year, month)
    out: list[dt.date] = []
    for d in range(1, last + 1):
        day = dt.date(year, month, d)
        if day.isoweekday() in iso_weekdays:
            out.append(day)
    return out


def parse_day_parity_param(raw: str) -> DayParity:
    """Parse day_parity query param: all (default), even, or odd calendar days."""
    s = (raw or "").strip().lower()
    if not s or s == "all":
        return "all"
    if s in ("even", "odd"):
        return s
    raise ValueError(f"Invalid day_parity: {raw} (expected all, even, or odd)")


def filter_dates_by_day_parity(
    dates: list[dt.date],
    parity: DayParity,
) -> list[dt.date]:
    """Narrow dates to even or odd calendar day-of-month; no-op for all."""
    if parity == "all":
        return dates
    if parity == "odd":
        return [d for d in dates if d.day % 2 == 1]
    return [d for d in dates if d.day % 2 == 0]


def parse_time_hhmm(s: str) -> dt.time:
    """Parse HH:MM (24h)."""
    s = (s or "").strip()
    if len(s) != 5 or s[2] != ":":
        raise ValueError("time must be HH:MM")
    t = dt.datetime.strptime(s, "%H:%M").time()
    return t


def validate_thirty_minute_time(t: dt.time) -> None:
    if t.second != 0 or t.microsecond != 0:
        raise ValueError("time must have zero seconds")
    if t.minute not in (0, 30):
        raise ValueError("time must be on a 30-minute boundary")


__all__ = [
    "DayParity",
    "STAFF_ROLES_FOR_SHORTCUTS",
    "fetch_busy_user_ids_for_timeslot",
    "filter_active_staff_users",
    "filter_active_teachers",
    "filter_dates_by_day_parity",
    "get_staff_user_filter_params",
    "iter_dates_in_month_matching_weekdays",
    "parse_day_parity_param",
    "parse_iso_weekdays_param",
    "parse_time_hhmm",
    "user_can_access_admin_shortcuts",
    "validate_thirty_minute_time",
]
