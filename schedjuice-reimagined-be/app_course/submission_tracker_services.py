"""
Assignment submission tracker: missed assessments per student/course (assignments + quiz v3).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Set, Tuple

from django.utils import timezone

from app_course.models import Assignment, Course, Submission, UserCourse
from app_quiz_v3.models import Quiz, QuizAttempt

AT_RISK_THRESHOLD = 3


@dataclass
class SubmissionTrackerFilters:
    date_from: date
    date_to: date
    course_id: Optional[int] = None
    student_id: Optional[int] = None
    active_courses_only: bool = False
    min_missed_count: int = AT_RISK_THRESHOLD
    show_all: bool = False
    sort: str = "missed_count_desc"
    page: int = 1
    size: int = 25


def parse_submission_tracker_filters(body: dict, query_params) -> SubmissionTrackerFilters:
    today = timezone.localdate()
    default_from = today - timedelta(days=30)
    date_from = _parse_date(body.get("date_from") or query_params.get("date_from")) or default_from
    date_to = _parse_date(body.get("date_to") or query_params.get("date_to")) or today
    if date_from > date_to:
        date_from, date_to = date_to, date_from

    page = max(1, int(query_params.get("page") or body.get("page") or 1))
    size = int(query_params.get("size") or body.get("size") or 25)
    if size == 0:
        size = 25
    if size < 0:
        size = 10_000

    min_missed = int(
        body.get("min_missed_count")
        or query_params.get("min_missed_count")
        or AT_RISK_THRESHOLD
    )

    return SubmissionTrackerFilters(
        date_from=date_from,
        date_to=date_to,
        course_id=_parse_int(body.get("course_id") or query_params.get("course_id")),
        student_id=_parse_int(body.get("student_id") or query_params.get("student_id")),
        active_courses_only=bool(
            body.get("active_courses_only") or query_params.get("active_courses_only")
        ),
        min_missed_count=max(0, min_missed),
        show_all=bool(body.get("show_all") or query_params.get("show_all")),
        sort=str(body.get("sort") or query_params.get("sort") or "missed_count_desc"),
        page=page,
        size=size,
    )


def _parse_date(value) -> Optional[date]:
    if not value:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    s = str(value).strip()[:10]
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except ValueError:
        return None


def _parse_int(value) -> Optional[int]:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _deadline_range(filters: SubmissionTrackerFilters) -> Tuple[datetime, datetime]:
    start_dt = timezone.make_aware(datetime.combine(filters.date_from, datetime.min.time()))
    end_dt = timezone.make_aware(datetime.combine(filters.date_to, datetime.max.time()))
    return start_dt, end_dt


def _eligible_enrollments(
    filters: SubmissionTrackerFilters,
) -> List[Tuple[int, int, User, Course]]:
    uc_qs = UserCourse.objects.filter(
        assigned_as=UserCourse.AssignedAs.STUDENT,
    ).select_related("user", "course")

    if filters.course_id is not None:
        uc_qs = uc_qs.filter(course_id=filters.course_id)
    if filters.student_id is not None:
        uc_qs = uc_qs.filter(user_id=filters.student_id)
    if filters.active_courses_only:
        uc_qs = uc_qs.filter(course__status=Course.CourseStatus.ACTIVE)

    pairs: List[Tuple[int, int, User, Course]] = []
    for uc in uc_qs:
        pairs.append((uc.user_id, uc.course_id, uc.user, uc.course))
    return pairs


def _assignments_in_range(
    course_ids: Set[int],
    start_dt: datetime,
    end_dt: datetime,
    now: datetime,
) -> Dict[int, List[Assignment]]:
    if not course_ids:
        return {}
    qs = Assignment.objects.filter(
        course_id__in=course_ids,
        due_datetime__gte=start_dt,
        due_datetime__lte=end_dt,
        due_datetime__lt=now,
    ).only("id", "title", "course_id", "due_datetime")
    by_course: Dict[int, List[Assignment]] = {}
    for a in qs:
        by_course.setdefault(a.course_id, []).append(a)
    return by_course


def _quizzes_in_range(
    course_ids: Set[int],
    start_dt: datetime,
    end_dt: datetime,
    now: datetime,
) -> Dict[int, List[Quiz]]:
    if not course_ids:
        return {}
    qs = Quiz.objects.filter(
        course_id__in=course_ids,
        expiry_date__isnull=False,
        expiry_date__gte=start_dt,
        expiry_date__lte=end_dt,
        expiry_date__lt=now,
    ).exclude(status=Quiz.QuizStatus.DRAFT).only(
        "id", "title", "course_id", "expiry_date"
    )
    by_course: Dict[int, List[Quiz]] = {}
    for q in qs:
        if q.course_id is None:
            continue
        by_course.setdefault(q.course_id, []).append(q)
    return by_course


def _submitted_assignment_ids_by_user(
    assignment_ids: Set[int],
) -> Dict[int, Set[int]]:
    if not assignment_ids:
        return {}
    result: Dict[int, Set[int]] = {}
    for row in Submission.objects.filter(assignment_id__in=assignment_ids).values(
        "created_by_id", "assignment_id"
    ):
        result.setdefault(row["created_by_id"], set()).add(row["assignment_id"])
    return result


def _submitted_quiz_ids_by_user(quiz_ids: Set[int]) -> Dict[int, Set[int]]:
    if not quiz_ids:
        return {}
    result: Dict[int, Set[int]] = {}
    for row in QuizAttempt.objects.filter(
        quiz_id__in=quiz_ids,
        submitted_at__isnull=False,
    ).values("user_id", "quiz_id"):
        result.setdefault(row["user_id"], set()).add(row["quiz_id"])
    return result


def _count_missed_for_pair(
    user_id: int,
    course_id: int,
    assignments_by_course: Dict[int, List[Assignment]],
    quizzes_by_course: Dict[int, List[Quiz]],
    submitted_assignments: Dict[int, Set[int]],
    submitted_quizzes: Dict[int, Set[int]],
) -> Tuple[int, int, int]:
    user_assignments = submitted_assignments.get(user_id, set())
    user_quizzes = submitted_quizzes.get(user_id, set())

    missed_assignments = 0
    for a in assignments_by_course.get(course_id, []):
        if a.id not in user_assignments:
            missed_assignments += 1

    missed_quizzes = 0
    for q in quizzes_by_course.get(course_id, []):
        if q.id not in user_quizzes:
            missed_quizzes += 1

    total = missed_assignments + missed_quizzes
    return total, missed_assignments, missed_quizzes


def _sort_rows(rows: List[Dict[str, Any]], sort: str) -> List[Dict[str, Any]]:
    if sort == "missed_count_asc":
        return sorted(
            rows,
            key=lambda r: (r["missed_count"], r["student_name"].lower(), r["course_title"].lower()),
        )
    if sort == "student_name":
        return sorted(
            rows,
            key=lambda r: (r["student_name"].lower(), -r["missed_count"]),
        )
    if sort == "course_title":
        return sorted(
            rows,
            key=lambda r: (r["course_title"].lower(), -r["missed_count"]),
        )
    return sorted(
        rows,
        key=lambda r: (-r["missed_count"], r["student_name"].lower(), r["course_title"].lower()),
    )


def _build_summary(all_rows: List[Dict[str, Any]]) -> Dict[str, int]:
    at_risk_rows = [r for r in all_rows if r["is_at_risk"]]
    return {
        "at_risk_pairs": len(at_risk_rows),
        "students_flagged": len({r["student_id"] for r in at_risk_rows}),
        "courses_affected": len({r["course_id"] for r in at_risk_rows}),
    }


def build_submission_tracker_rows(
    filters: SubmissionTrackerFilters,
) -> Tuple[Dict[str, int], List[Dict[str, Any]]]:
    start_dt, end_dt = _deadline_range(filters)
    now = timezone.now()

    enrollments = _eligible_enrollments(filters)
    if not enrollments:
        empty_summary = {"at_risk_pairs": 0, "students_flagged": 0, "courses_affected": 0}
        return empty_summary, []

    course_ids = {course_id for _, course_id, _, _ in enrollments}
    assignments_by_course = _assignments_in_range(course_ids, start_dt, end_dt, now)
    quizzes_by_course = _quizzes_in_range(course_ids, start_dt, end_dt, now)

    all_assignment_ids = {
        a.id for items in assignments_by_course.values() for a in items
    }
    all_quiz_ids = {q.id for items in quizzes_by_course.values() for q in items}

    submitted_assignments = _submitted_assignment_ids_by_user(all_assignment_ids)
    submitted_quizzes = _submitted_quiz_ids_by_user(all_quiz_ids)

    rows: List[Dict[str, Any]] = []
    for user_id, course_id, user, course in enrollments:
        missed_count, missed_a, missed_q = _count_missed_for_pair(
            user_id,
            course_id,
            assignments_by_course,
            quizzes_by_course,
            submitted_assignments,
            submitted_quizzes,
        )
        if missed_count == 0:
            continue

        rows.append(
            {
                "student_id": user_id,
                "student_name": user.name or "",
                "student_email": user.email or "",
                "course_id": course_id,
                "course_title": course.title or "",
                "course_status": course.status,
                "missed_count": missed_count,
                "missed_assignments_count": missed_a,
                "missed_quizzes_count": missed_q,
                "is_at_risk": missed_count >= AT_RISK_THRESHOLD,
            }
        )

    summary = _build_summary(rows)

    if not filters.show_all:
        rows = [r for r in rows if r["missed_count"] >= filters.min_missed_count]

    rows = _sort_rows(rows, filters.sort)
    return summary, rows


def build_submission_tracker_detail(
    student_id: int,
    course_id: int,
    date_from: date,
    date_to: date,
) -> List[Dict[str, Any]]:
    filters = SubmissionTrackerFilters(date_from=date_from, date_to=date_to)
    start_dt, end_dt = _deadline_range(filters)
    now = timezone.now()

    enrolled = UserCourse.objects.filter(
        user_id=student_id,
        course_id=course_id,
        assigned_as=UserCourse.AssignedAs.STUDENT,
    ).exists()
    if not enrolled:
        return []

    assignments = list(
        Assignment.objects.filter(
            course_id=course_id,
            due_datetime__gte=start_dt,
            due_datetime__lte=end_dt,
            due_datetime__lt=now,
        ).only("id", "title", "due_datetime")
    )
    quizzes = list(
        Quiz.objects.filter(
            course_id=course_id,
            expiry_date__isnull=False,
            expiry_date__gte=start_dt,
            expiry_date__lte=end_dt,
            expiry_date__lt=now,
        )
        .exclude(status=Quiz.QuizStatus.DRAFT)
        .only("id", "title", "expiry_date")
    )

    submitted_assignment_ids = set(
        Submission.objects.filter(
            created_by_id=student_id,
            assignment_id__in=[a.id for a in assignments],
        ).values_list("assignment_id", flat=True)
    )
    submitted_quiz_ids = set(
        QuizAttempt.objects.filter(
            user_id=student_id,
            quiz_id__in=[q.id for q in quizzes],
            submitted_at__isnull=False,
        ).values_list("quiz_id", flat=True)
    )

    items: List[Dict[str, Any]] = []
    for a in assignments:
        if a.id in submitted_assignment_ids:
            continue
        items.append(
            {
                "kind": "assignment",
                "assessment_id": a.id,
                "title": a.title,
                "deadline": a.due_datetime.isoformat() if a.due_datetime else None,
            }
        )
    for q in quizzes:
        if q.id in submitted_quiz_ids:
            continue
        items.append(
            {
                "kind": "quiz",
                "assessment_id": q.id,
                "title": q.title,
                "deadline": q.expiry_date.isoformat() if q.expiry_date else None,
            }
        )

    items.sort(key=lambda x: x.get("deadline") or "", reverse=True)
    return items


def paginate_submission_tracker_rows(
    rows: List[Dict[str, Any]], page: int, size: int
) -> Tuple[List[Dict[str, Any]], int]:
    count = len(rows)
    if size < 0:
        return rows, count
    start = (page - 1) * size
    end = start + size
    return rows[start:end], count
