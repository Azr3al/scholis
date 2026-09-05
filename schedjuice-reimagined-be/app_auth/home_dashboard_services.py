from __future__ import annotations

from calendar import monthrange
from datetime import datetime, time
from decimal import Decimal
from typing import Any
from zoneinfo import ZoneInfo

from django.db import connection
from django.utils import timezone
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_attendance.models import UserEvent
from app_auth.models import User
from app_course.models import (
    Assignment,
    CourseJoinRequest,
    Event,
    Submission,
    UserCourse,
)
from app_course.rate_utils import is_session_based_payroll
from app_course.teaching_assignment import teaching_seniority_filter_kwargs
from app_finance.payment_scoping import has_unpaid_read_breadth
from app_finance.unpaid_helpers import unpaid_course_summary_rows
from app_hr.payroll_funcs import (
    get_session_based_payments,
    get_tr_payments_trphillips,
)
from app_organization.models import Organization
from app_quiz_v3.models import Quiz, QuizAttempt
from app_rbac.resolution import effective_permissions
from app_utility_notifications.event_buckets import EventBucket, classify_event
from app_utility_notifications.tenant_time import (
    event_instant_in_timezone,
    get_tenant_day_boundaries,
    get_tenant_today_ymd,
)


def resolve_home_variant(user: User) -> str:
    held = set(effective_permissions(user))
    if has_unpaid_read_breadth(held):
        return "finance"
    if UserCourse.objects.filter(
        user_id=user.id, **teaching_seniority_filter_kwargs()
    ).exists():
        return "teacher"
    if User.UserRole.STUDENT in (user.roles or []):
        return "student"
    return "staff"


def _organization_for_current_schema() -> Organization | None:
    schema_name = connection.schema_name
    with schema_context(get_public_schema_name()):
        return Organization.objects.filter(schema_name=schema_name).first()


def _safe_timezone_name(organization: Organization | None) -> str:
    return getattr(organization, "timezone", None) or "UTC"


def _month_params(year: int, month: int, timezone_name: str) -> dict[str, str]:
    try:
        tz = ZoneInfo(
            "Asia/Yangon" if timezone_name == "Asia/Rangoon" else timezone_name
        )
    except Exception:
        tz = ZoneInfo("UTC")
    last_day = monthrange(year, month)[1]
    start = datetime.combine(
        datetime(year, month, 1).date(),
        time.min,
        tzinfo=tz,
    )
    end = datetime.combine(
        datetime(year, month, last_day).date(),
        time.max,
        tzinfo=tz,
    )
    return {
        "issued_at__gte": start.isoformat(),
        "issued_at__lte": end.isoformat(),
    }


def _money_string(value: Any) -> str:
    return format(Decimal(str(value)), "f")


def _earnings_summary(
    user: User,
    organization: Organization | None,
    *,
    year: int,
    month: int,
    held_permissions: set[str],
) -> dict[str, Any]:
    currency = getattr(organization, "currency_iso4217", None) or "USD"
    summary = {
        "kind": "earnings",
        "year": year,
        "month": month,
        "currency": currency,
        "amount": None,
        "earnings_available": False,
    }
    if (
        organization is None
        or not organization.is_payroll_calculation_enabled
        or "payroll.view" not in held_permissions
    ):
        return summary

    payroll_builder = (
        get_session_based_payments
        if is_session_based_payroll(organization)
        else get_tr_payments_trphillips
    )
    payroll = payroll_builder(
        user,
        month,
        year,
        _safe_timezone_name(organization),
    )
    summary["amount"] = _money_string(payroll["aggregate"]["total_earnings"])
    summary["earnings_available"] = True
    return summary


def _course_ids_for_variant(user: User, variant: str) -> list[int]:
    memberships = UserCourse.objects.filter(user_id=user.id)
    if variant == "teacher":
        memberships = memberships.filter(**teaching_seniority_filter_kwargs())
    elif variant == "student":
        memberships = memberships.filter(assigned_as=UserCourse.AssignedAs.STUDENT)
    else:
        return list(
            UserEvent.objects.filter(user_id=user.id)
            .values_list("event__course_id", flat=True)
            .distinct()
        )
    return list(memberships.values_list("course_id", flat=True))


def _today_events(
    user: User,
    variant: str,
    *,
    now: datetime,
    timezone_name: str,
) -> list[Event]:
    course_ids = _course_ids_for_variant(user, variant)
    if not course_ids:
        return []
    today = get_tenant_today_ymd(timezone_name, now)
    start, end = get_tenant_day_boundaries(now, timezone_name, today)
    return list(
        Event.objects.filter(
            course_id__in=course_ids,
            date__gte=start,
            date__lte=end,
        )
        .select_related("course")
        .order_by("date", "time_from", "id")
    )


def _schedule_today(
    user: User,
    variant: str,
    *,
    now: datetime,
    timezone_name: str,
) -> dict[str, Any]:
    rows = []
    for event in _today_events(
        user,
        variant,
        now=now,
        timezone_name=timezone_name,
    ):
        start = event_instant_in_timezone(
            event.date,
            event.time_from.strftime("%H:%M:%S"),
            timezone_name,
        )
        end = event_instant_in_timezone(
            event.date,
            event.time_to.strftime("%H:%M:%S"),
            timezone_name,
        )
        bucket = classify_event(event, now, timezone_name)
        state = {
            EventBucket.IN_PROGRESS: "current",
            EventBucket.UPCOMING: "upcoming",
            EventBucket.COMPLETED: "completed",
        }.get(bucket, "upcoming")
        rows.append(
            {
                "id": str(event.id),
                "start_time": start.isoformat() if start else event.date.isoformat(),
                "end_time": end.isoformat() if end else event.date.isoformat(),
                "title": event.title or event.course.title,
                "room": None,
                "state": state,
                "course_id": event.course_id,
                "event_id": event.id,
            }
        )
    return {
        "items": rows,
        "completed_count": sum(row["state"] == "completed" for row in rows),
        "total_count": len(rows),
    }


def _next_future_event_item(
    user: User,
    variant: str,
    *,
    now: datetime,
    timezone_name: str,
) -> dict[str, Any] | None:
    course_ids = _course_ids_for_variant(user, variant)
    if not course_ids:
        return None
    today = get_tenant_today_ymd(timezone_name, now)
    _, today_end = get_tenant_day_boundaries(now, timezone_name, today)
    event = (
        Event.objects.filter(
            course_id__in=course_ids,
            date__gt=today_end,
        )
        .select_related("course")
        .order_by("date", "time_from", "id")
        .first()
    )
    if event is None:
        return None
    start = event_instant_in_timezone(
        event.date,
        event.time_from.strftime("%H:%M:%S"),
        timezone_name,
    )
    end = event_instant_in_timezone(
        event.date,
        event.time_to.strftime("%H:%M:%S"),
        timezone_name,
    )
    return {
        "id": str(event.id),
        "start_time": start.isoformat() if start else event.date.isoformat(),
        "end_time": end.isoformat() if end else event.date.isoformat(),
        "title": event.title or event.course.title,
        "room": None,
        "state": "upcoming",
        "course_id": event.course_id,
        "event_id": event.id,
    }


def _action(
    label_key: str,
    deeplink: str | None,
    params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "label_key": label_key,
        "deeplink": deeplink,
        "params": params or {},
    }


def _next_class_hero(
    schedule: dict[str, Any],
    *,
    fallback_item: dict[str, Any] | None = None,
) -> dict[str, Any]:
    next_item = next(
        (
            item
            for item in schedule["items"]
            if item["state"] in {"current", "upcoming"}
        ),
        fallback_item,
    )
    if next_item is None:
        return {
            "kind": "next_class",
            "eyebrow": "Today",
            "title": "No more classes today",
            "subtitle": None,
            "primary_action": _action(
                "home.view_schedule",
                "/shortcuts/todays-classes",
            ),
            "secondary_action": _action(
                "home.view_courses",
                "/class",
            ),
        }
    params = {
        "course_id": next_item["course_id"],
        "event_id": next_item["event_id"],
        "time_from": next_item["start_time"],
        "time_to": next_item["end_time"],
    }
    return {
        "kind": "next_class",
        "eyebrow": "Current class" if next_item["state"] == "current" else "Next class",
        "title": next_item["title"],
        "subtitle": next_item["start_time"],
        "primary_action": _action(
            "home.check_in",
            "/shortcuts/todays-classes",
            params,
        ),
        "secondary_action": _action(
            "home.view_course",
            "/class/course",
            {"course_id": next_item["course_id"]},
        ),
    }


def _student_assessments(user: User, *, now: datetime) -> list[dict[str, Any]]:
    course_ids = list(
        UserCourse.objects.filter(
            user_id=user.id,
            assigned_as=UserCourse.AssignedAs.STUDENT,
        ).values_list("course_id", flat=True)
    )
    if not course_ids:
        return []
    submitted_assignment_ids = Submission.objects.filter(
        created_by_id=user.id
    ).values_list("assignment_id", flat=True)
    rows = [
        {
            "id": assignment.id,
            "type": "student_due_assignment",
            "title": assignment.title,
            "subtitle": assignment.course.title,
            "course_id": assignment.course_id,
            "due_at": assignment.due_datetime,
            "deeplink": f"/class/course/assignment/{assignment.id}",
        }
        for assignment in Assignment.objects.filter(
            course_id__in=course_ids,
            due_datetime__gte=now,
        )
        .exclude(id__in=submitted_assignment_ids)
        .select_related("course")
        .order_by("due_datetime")[:50]
    ]
    attempted_quiz_ids = QuizAttempt.objects.filter(
        user_id=user.id,
        submitted_at__isnull=False,
    ).values_list("quiz_id", flat=True)
    rows.extend(
        {
            "id": quiz.id,
            "type": "student_due_quiz",
            "title": quiz.title,
            "subtitle": quiz.course.title if quiz.course else None,
            "course_id": quiz.course_id,
            "due_at": quiz.expiry_date,
            "deeplink": f"/quiz/{quiz.code}",
        }
        for quiz in Quiz.objects.filter(
            course_id__in=course_ids,
            status=Quiz.QuizStatus.OPEN,
            expiry_date__gte=now,
        )
        .exclude(id__in=attempted_quiz_ids)
        .select_related("course")
        .order_by("expiry_date")[:50]
    )
    rows.sort(key=lambda row: (row["due_at"], row["type"], row["id"]))
    return rows


def _student_summary(user: User, *, now: datetime) -> dict[str, Any]:
    course_ids = list(
        UserCourse.objects.filter(
            user_id=user.id,
            assigned_as=UserCourse.AssignedAs.STUDENT,
        ).values_list("course_id", flat=True)
    )
    week_end = now + timezone.timedelta(days=7)
    assignment_ids = list(
        Assignment.objects.filter(
            course_id__in=course_ids,
            due_datetime__gte=now,
            due_datetime__lt=week_end,
        ).values_list("id", flat=True)
    )
    done_count = (
        Submission.objects.filter(
            created_by_id=user.id,
            assignment_id__in=assignment_ids,
        )
        .values("assignment_id")
        .distinct()
        .count()
    )
    return {
        "kind": "assignments_week",
        "done_count": done_count,
        "total_count": len(assignment_ids),
    }


def _student_hero(assessments: list[dict[str, Any]]) -> dict[str, Any]:
    if not assessments:
        return {
            "kind": "due_assessment",
            "eyebrow": "Assessments",
            "title": "You are all caught up",
            "subtitle": None,
            "primary_action": _action("home.view_assessments", "/class"),
            "secondary_action": _action("home.view_schedule", "/home"),
        }
    item = assessments[0]
    return {
        "kind": "due_assessment",
        "eyebrow": "Due next",
        "title": item["title"],
        "subtitle": item["due_at"].isoformat(),
        "primary_action": _action(
            "home.open_assessment",
            item["deeplink"],
            {
                "assessment_id": item["id"],
                "course_id": item["course_id"],
            },
        ),
        "secondary_action": _action("home.view_assessments", "/class"),
    }


def _todo_item(
    *,
    item_id: str,
    item_type: str,
    title: str,
    subtitle: str | None,
    urgency: str,
    deeplink: str,
    params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "id": item_id,
        "type": item_type,
        "title": title,
        "subtitle": subtitle,
        "urgency": urgency,
        "deeplink": deeplink,
        "params": params or {},
    }


def _student_todos(
    assessments: list[dict[str, Any]],
    *,
    now: datetime,
) -> list[dict[str, Any]]:
    rows = []
    for item in assessments[:10]:
        remaining = item["due_at"] - now
        urgency = "critical" if remaining <= timezone.timedelta(days=1) else "soon"
        rows.append(
            _todo_item(
                item_id=f"{item['type']}:{item['id']}",
                item_type=item["type"],
                title=item["title"],
                subtitle=item["subtitle"],
                urgency=urgency,
                deeplink=item["deeplink"],
                params={
                    "assessment_id": item["id"],
                    "course_id": item["course_id"],
                },
            )
        )
    return rows


def _teacher_todos(user: User) -> list[dict[str, Any]]:
    course_ids = _course_ids_for_variant(user, "teacher")
    submissions = (
        Submission.objects.filter(
            assignment__course_id__in=course_ids,
            is_graded=False,
        )
        .select_related("assignment", "assignment__course")
        .order_by("created_at", "id")[:10]
    )
    return [
        _todo_item(
            item_id=f"teacher_ungraded_assignment:{submission.id}",
            item_type="teacher_ungraded_assignment",
            title=submission.assignment.title,
            subtitle=submission.assignment.course.title,
            urgency="soon",
            deeplink=f"/class/course/assignment/{submission.assignment_id}",
            params={
                "assessment_id": submission.assignment_id,
                "course_id": submission.assignment.course_id,
            },
        )
        for submission in submissions
    ]


def _finance_rows(
    *,
    year: int,
    month: int,
    timezone_name: str,
) -> list[dict[str, Any]]:
    return unpaid_course_summary_rows(
        _month_params(year, month, timezone_name),
    )


def _finance_hero(unpaid_rows: list[dict[str, Any]]) -> dict[str, Any]:
    unpaid_count = sum(row["unpaid_count"] for row in unpaid_rows)
    course_count = sum(row["unpaid_count"] > 0 for row in unpaid_rows)
    return {
        "kind": "overdue_accounts",
        "eyebrow": "Payments",
        "title": f"{unpaid_count} unpaid account{'s' if unpaid_count != 1 else ''}",
        "subtitle": f"Across {course_count} course{'s' if course_count != 1 else ''}",
        "primary_action": _action(
            "home.review_unpaid_courses",
            "/shortcuts/unpaid-course-counts",
        ),
        "secondary_action": _action(
            "home.review_on_desktop",
            None,
        ),
    }


def _todos_footer_label(variant: str, count: int) -> str:
    if count == 0:
        return ""
    if variant == "student":
        noun = "assignment" if count == 1 else "assignments"
        return f"{count} {noun} due this week"
    if count == 1:
        return "1 task needs your attention"
    return f"{count} tasks need your attention"


def _build_todos(variant: str, items: list[dict[str, Any]]) -> dict[str, Any]:
    count = len(items)
    return {
        "items": items,
        "badge_count": count,
        "footer_label": _todos_footer_label(variant, count),
    }


def _finance_todos(
    unpaid_rows: list[dict[str, Any]],
    *,
    held_permissions: set[str],
) -> list[dict[str, Any]]:
    rows = []
    if "course.manage_members" in held_permissions:
        pending_count = CourseJoinRequest.objects.filter(
            status=CourseJoinRequest.Status.PENDING
        ).count()
        if pending_count:
            rows.append(
                _todo_item(
                    item_id="finance_join_requests:pending",
                    item_type="finance_join_requests",
                    title=f"{pending_count} pending join request"
                    f"{'s' if pending_count != 1 else ''}",
                    subtitle=None,
                    urgency="soon",
                    deeplink="/class",
                )
            )
    unpaid_count = sum(row["unpaid_count"] for row in unpaid_rows)
    if unpaid_count:
        rows.append(
            _todo_item(
                item_id="finance_unpaid_courses:current_month",
                item_type="finance_unpaid_courses",
                title=f"{unpaid_count} unpaid account"
                f"{'s' if unpaid_count != 1 else ''}",
                subtitle=None,
                urgency="critical",
                deeplink="/shortcuts/unpaid-course-counts",
            )
        )
    return rows


def build_home_dashboard(
    user: User,
    *,
    year: int | None,
    month: int | None,
) -> dict[str, Any]:
    now = timezone.now()
    organization = _organization_for_current_schema()
    timezone_name = _safe_timezone_name(organization)
    local_now = now.astimezone(
        ZoneInfo("Asia/Yangon" if timezone_name == "Asia/Rangoon" else timezone_name)
    )
    selected_year = year or local_now.year
    selected_month = month or local_now.month
    variant = resolve_home_variant(user)
    held_permissions = set(effective_permissions(user))
    schedule = _schedule_today(
        user,
        variant,
        now=now,
        timezone_name=timezone_name,
    )

    summary: dict[str, Any] | None = None
    hero = _next_class_hero(schedule)
    todo_items: list[dict[str, Any]] = []

    if variant == "finance":
        unpaid_rows = _finance_rows(
            year=selected_year,
            month=selected_month,
            timezone_name=timezone_name,
        )
        summary = _earnings_summary(
            user,
            organization,
            year=selected_year,
            month=selected_month,
            held_permissions=held_permissions,
        )
        hero = _finance_hero(unpaid_rows)
        todo_items = _finance_todos(
            unpaid_rows,
            held_permissions=held_permissions,
        )
    elif variant == "teacher":
        if not any(
            item["state"] in {"current", "upcoming"} for item in schedule["items"]
        ):
            hero = _next_class_hero(
                schedule,
                fallback_item=_next_future_event_item(
                    user,
                    variant,
                    now=now,
                    timezone_name=timezone_name,
                ),
            )
        summary = _earnings_summary(
            user,
            organization,
            year=selected_year,
            month=selected_month,
            held_permissions=held_permissions,
        )
        todo_items = _teacher_todos(user)
    elif variant == "student":
        assessments = _student_assessments(user, now=now)
        summary = _student_summary(user, now=now)
        hero = _student_hero(assessments)
        todo_items = _student_todos(assessments, now=now)

    return {
        "home_variant": variant,
        "summary": summary,
        "hero": hero,
        "schedule_today": schedule,
        "todos": _build_todos(variant, todo_items),
        "announcements": {"badge_count": 0},
    }
