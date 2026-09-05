"""User ids busy due to collision-counted teaching assignments (UserEvent overlap)."""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from typing import Any, Literal

from django.db import connection

from app_attendance.models import UserEvent
from app_course.course_status import effective_status_in_sql
from app_course.models import AssignedAsRole, Course, Event, UserCourse
from schedjuice_backend.iana_timezone_aliases import normalize_iana_tz_for_postgres

BusyReason = Literal["substitution_reserve", "schedule_conflict"]


@dataclass(frozen=True)
class BusyUserCollision:
    user_id: int
    reason: BusyReason


def _sql_table_names() -> dict[str, str]:
    return {
        "ue": UserEvent._meta.db_table,
        "e": Event._meta.db_table,
        "uc": UserCourse._meta.db_table,
        "ar": AssignedAsRole._meta.db_table,
        "c": Course._meta.db_table,
    }


def _collision_counted_joins(*, table_alias: str = "e") -> str:
    t = _sql_table_names()
    return f"""
        INNER JOIN {t["uc"]} AS uc
            ON uc.user_id = ue.user_id AND uc.course_id = {table_alias}.course_id
        INNER JOIN {t["ar"]} AS ar ON uc.assigned_as_role_id = ar.id"""


def _collision_counted_filters() -> str:
    return """
          AND ue.is_deleted = FALSE
          AND uc.assigned_as = 'teacher'
          AND ar.is_collision_enabled = TRUE
          AND ar.seniority IN ('MAIN_TEACHER', 'ASSISTANT_TEACHER')"""


def _active_course_sql(alias: str = "c") -> str:
    ended = effective_status_in_sql(alias, [Course.CourseStatus.ENDED])
    return f"NOT ({ended})"


def _course_active_join(alias: str = "c", event_alias: str = "e") -> str:
    t = _sql_table_names()
    return f"""
        INNER JOIN {t["c"]} AS {alias}
            ON {alias}.id = {event_alias}.course_id
           AND {_active_course_sql(alias)}
    """


def fetch_busy_collisions_for_course_sessions(
    *,
    course_id: int,
    tenant_tz: str,
) -> list[BusyUserCollision]:
    """
    Per-user collision info for teachers overlapping any session on *course_id*
    (excluding assignments on that same course). Ended courses are ignored.
    """
    pg_tz = normalize_iana_tz_for_postgres(tenant_tz)
    t = _sql_table_names()
    sql = f"""
        SELECT ue.user_id,
               BOOL_OR(NOT e.is_substitution_reserve) AS has_non_reserve_overlap
        FROM {t["e"]} AS target
        INNER JOIN {t["ue"]} AS ue ON ue.is_deleted = FALSE
        INNER JOIN {t["e"]} AS e ON ue.event_id = e.id
        {_collision_counted_joins(table_alias="e")}
        {_course_active_join(alias="c", event_alias="e")}
        WHERE target.course_id = %s
          AND e.course_id <> %s
          {_collision_counted_filters()}
          AND (target.date AT TIME ZONE %s)::date = (e.date AT TIME ZONE %s)::date
          AND e.time_from < target.time_to
          AND e.time_to > target.time_from
        GROUP BY ue.user_id
    """
    params: list[Any] = [course_id, course_id, pg_tz, pg_tz]

    with connection.cursor() as cursor:
        cursor.execute(sql, params)
        rows = cursor.fetchall()

    collisions: list[BusyUserCollision] = []
    for user_id, has_non_reserve in rows:
        reason: BusyReason = (
            "schedule_conflict" if has_non_reserve else "substitution_reserve"
        )
        collisions.append(BusyUserCollision(user_id=user_id, reason=reason))
    return collisions


def fetch_busy_user_ids_for_course_sessions(
    *,
    course_id: int,
    tenant_tz: str,
) -> list[int]:
    """Distinct user ids busy on overlapping sessions (legacy list API)."""
    return [
        row.user_id
        for row in fetch_busy_collisions_for_course_sessions(
            course_id=course_id,
            tenant_tz=tenant_tz,
        )
    ]


def fetch_busy_user_ids_for_timeslot(
    *,
    tenant_tz: str,
    candidate_dates: list[dt.date],
    slot_time_from: dt.time,
    slot_time_to: dt.time,
) -> list[int]:
    """
    Distinct user ids with at least one collision-counted overlapping UserEvent
    on any candidate date during [slot_time_from, slot_time_to).
    """
    if not candidate_dates:
        return []

    pg_tz = normalize_iana_tz_for_postgres(tenant_tz)
    t = _sql_table_names()
    placeholders = ",".join(["%s"] * len(candidate_dates))
    sql = f"""
        SELECT DISTINCT ue.user_id
        FROM {t["ue"]} AS ue
        INNER JOIN {t["e"]} AS e ON ue.event_id = e.id
        {_collision_counted_joins(table_alias="e")}
        {_course_active_join(alias="c", event_alias="e")}
        WHERE (e.date AT TIME ZONE %s)::date IN ({placeholders})
          {_collision_counted_filters()}
          AND e.time_from < %s::time
          AND e.time_to > %s::time
    """
    params: list[Any] = [pg_tz] + list(candidate_dates) + [slot_time_to, slot_time_from]

    with connection.cursor() as cursor:
        cursor.execute(sql, params)
        return [row[0] for row in cursor.fetchall()]


def collision_check_disabled_for_role(role_id: int | None) -> bool:
    """True when the given course role should skip collision / free-busy checks."""
    if role_id is None:
        return False
    return AssignedAsRole.objects.filter(
        id=role_id,
        is_collision_enabled=False,
    ).exists()
