from __future__ import annotations

from datetime import date
from typing import Iterable, Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.utils import timezone as django_tz

from app_attendance.models import UserEvent
from app_attendance.removed_students import get_removed_course_student_ids
from app_auth.models import User
from app_course.models import Course, Event, UserCourse


def _tenant_timezone(tenant):
    tz_name = getattr(tenant, "timezone", None) or "UTC"
    try:
        return ZoneInfo(tz_name)
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


def _tenant_local_date(dt, tenant) -> date:
    tz = _tenant_timezone(tenant)
    aware = dt if django_tz.is_aware(dt) else django_tz.make_aware(dt, django_tz.utc)
    return aware.astimezone(tz).date()


def resolve_preferred_event_id(
    events: Iterable,
    tenant,
    *,
    today: Optional[date] = None,
) -> Optional[int]:
    events_list = list(events)
    if not events_list:
        return None

    if today is None:
        today = django_tz.now().astimezone(_tenant_timezone(tenant)).date()

    def local_d(ev):
        return _tenant_local_date(ev.date, tenant)

    for ev in events_list:
        if local_d(ev) == today:
            return ev.id

    past = [ev for ev in events_list if local_d(ev) <= today]
    if past:
        return past[-1].id

    return events_list[-1].id


def build_marking_roster(
    event_id: int,
    *,
    include_removed: bool = False,
    tenant=None,
) -> list[dict]:
    event = Event.objects.filter(id=event_id).only("id", "course_id").first()
    if event is None:
        raise Event.DoesNotExist(event_id)

    student_user_ids = {
        uc.user_id
        for uc in UserCourse.objects.filter(
            course_id=event.course_id,
            assigned_as=UserCourse.AssignedAs.STUDENT,
        ).only("user_id")
    }
    removed_user_ids: set[int] = set()
    if include_removed:
        removed_user_ids = get_removed_course_student_ids(event.course_id)

    qs = UserEvent.objects.filter(
        event_id=event_id,
        user_id__in=student_user_ids,
        user__roles__contained_by=[User.UserRole.STUDENT],
    ).select_related("user")
    existing_user_ids = set(qs.values_list("user_id", flat=True))
    missing = student_user_ids - existing_user_ids

    if missing:
        UserEvent.objects.bulk_create(
            [UserEvent(user_id=uid, event_id=event_id) for uid in missing],
            ignore_conflicts=True,
        )
        if tenant is not None:
            from app_attendance.leave_request_approval import (
                maybe_apply_approved_leave_for_user_event,
            )

            for ue in UserEvent.objects.filter(
                event_id=event_id,
                user_id__in=missing,
            ):
                maybe_apply_approved_leave_for_user_event(ue, tenant)
        qs = UserEvent.objects.filter(
            event_id=event_id,
            user_id__in=student_user_ids,
            user__roles__contained_by=[User.UserRole.STUDENT],
        ).select_related("user")

    removed_qs = UserEvent.objects.filter(
        event_id=event_id,
        user_id__in=removed_user_ids,
        user__roles__contained_by=[User.UserRole.STUDENT],
    ).select_related("user")

    from app_attendance.serializers import MarkingRosterRowSerializer

    rows = []
    for ue in qs.order_by("user__name"):
        data = MarkingRosterRowSerializer(ue).data
        data["event_id"] = event_id
        data["is_removed"] = False
        rows.append(data)
    for ue in removed_qs.order_by("user__name"):
        data = MarkingRosterRowSerializer(ue).data
        data["event_id"] = event_id
        data["is_removed"] = True
        rows.append(data)
    return rows


def build_attendance_marking_bootstrap(
    course_id: int,
    tenant,
    event_id: Optional[int] = None,
    *,
    include_removed: bool = False,
) -> dict:
    course = (
        Course.objects.filter(id=course_id)
        .only("id", "title", "start_date", "end_date")
        .first()
    )
    if course is None:
        raise Course.DoesNotExist(course_id)

    events = list(
        Event.objects.filter(course_id=course_id, is_substitution_reserve=False)
        .only("id", "date", "time_from", "time_to", "title")
        .order_by("date", "time_from")
    )
    event_ids = {e.id for e in events}
    preferred_event_id = resolve_preferred_event_id(events, tenant)
    active_event_id = event_id if event_id in event_ids else preferred_event_id
    today = django_tz.now().astimezone(_tenant_timezone(tenant)).date()
    tenant_tz = _tenant_timezone(tenant)

    roster = (
        build_marking_roster(
            active_event_id,
            include_removed=include_removed,
            tenant=tenant,
        )
        if active_event_id is not None
        else []
    )

    return {
        "course": {
            "id": course.id,
            "title": course.title,
            "start_date": course.start_date,
            "end_date": course.end_date,
        },
        "events": [
            {
                "id": e.id,
                "date": e.date,
                "date_ymd": _tenant_local_date(e.date, tenant).isoformat(),
                "time_from": e.time_from,
                "time_to": e.time_to,
                "title": e.title,
            }
            for e in events
        ],
        "preferred_event_id": preferred_event_id,
        "active_event_id": active_event_id,
        "tenant_timezone": tenant_tz.key,
        "today_ymd": today.isoformat(),
        "roster": roster,
    }
