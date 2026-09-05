"""Course assessments (assignments + quiz v3) and user assessment summaries."""

from __future__ import annotations

import uuid
from urllib.parse import urlencode

from django.core.paginator import EmptyPage, PageNotAnInteger, Paginator
from django.db import transaction
from django.db.models import Count
from django.utils import timezone
from rest_framework.request import Request
from rest_framework import status

from app_auth.models import User
from app_course import models, serializers
from app_course.submission_tracker_services import (
    build_submission_tracker_detail,
    build_submission_tracker_rows,
    paginate_submission_tracker_rows,
    parse_submission_tracker_filters,
)
from app_quiz_v3 import models as quiz_models
from app_quiz_v3 import serializers as quiz_serializers
from app_quiz_v3.perms import get_visible_quiz_ids, user_is_teacher_for_course
from app_quiz_v3.rich_content import remap_quiz_fill_blank_ids
from app_quiz_v3.take_helpers import quiz_in_take_window
from app_rbac.views import RBACPermission, RBACView
from utilitas.views import BaseView


def _user_has_course_access(user: User, course_id: int) -> bool:
    if user.is_admin():
        return True
    return models.UserCourse.objects.filter(user_id=user.id, course_id=course_id).exists()


def _user_can_import_quiz_to_course(user: User, course_id: int) -> bool:
    if user.is_admin():
        return True
    return user_is_teacher_for_course(user.id, course_id)


def _user_may_read_source_quiz_for_duplicate(user: User, source: quiz_models.Quiz) -> bool:
    if user.is_admin():
        return True
    if source.created_by_id == user.id:
        return True
    visible = get_visible_quiz_ids(user)
    if visible is None:
        return True
    return source.id in visible


def _teacher_course_ids_for_user(user_id: int) -> list[int]:
    return list(
        models.UserCourse.objects.filter(
            user_id=user_id,
            assigned_as=models.UserCourse.AssignedAs.TEACHER,
        ).values_list("course_id", flat=True)
    )


def _parse_list_pagination(request: Request) -> tuple[int, int]:
    try:
        page = int(request.query_params.get("page", 1))
    except ValueError:
        page = 1
    try:
        size = int(request.query_params.get("size", 6))
    except ValueError:
        size = 6
    if size < 1:
        size = 6
    if size > 100:
        size = 100
    return page, size


def _assignment_rows_for_courses(view: BaseView, course_ids: list[int]) -> list[dict]:
    if not course_ids:
        return []
    a_qs = (
        models.Assignment.objects.filter(course_id__in=course_ids)
        .prefetch_related("submissions")
        .order_by("-created_at", "-id")
    )
    assignment_ser = view.get_serializer(
        a_qs,
        many=True,
        fields=[],
        expand=["submissions"],
        context={"model": models.Assignment},
    )
    rows = []
    for row in assignment_ser.data:
        d = dict(row)
        d["kind"] = "assignment"
        rows.append(d)
    return rows


def _quiz_rows_for_courses(
    view: BaseView,
    user: User,
    course_ids: list[int],
    *,
    is_teacher: bool,
) -> list[dict]:
    if not course_ids:
        return []
    quiz_qs = (
        quiz_models.Quiz.objects.filter(course_id__in=course_ids)
        .order_by("-created_at", "-id")
    )
    if not is_teacher:
        quiz_qs = quiz_qs.filter(status=quiz_models.Quiz.QuizStatus.OPEN)
        quiz_list = [q for q in quiz_qs if quiz_in_take_window(q)]
    else:
        quiz_list = list(quiz_qs)

    quiz_ser = quiz_serializers.QuizSerializer(
        quiz_list,
        many=True,
        expand=[],
        context={**view.get_serializer_context(), "model": quiz_models.Quiz},
    )
    quiz_rows = []
    completed_by_quiz: dict[int, int] = {}
    in_progress_quiz_ids: set[int] = set()
    released_by_quiz: dict[int, int] = {}
    if not is_teacher and quiz_list:
        quiz_ids = [q.id for q in quiz_list]
        completed_by_quiz = {
            row["quiz_id"]: row["c"]
            for row in quiz_models.QuizAttempt.objects.filter(
                user_id=user.id,
                quiz_id__in=quiz_ids,
                submitted_at__isnull=False,
            )
            .values("quiz_id")
            .annotate(c=Count("id"))
        }
        in_progress_quiz_ids = set(
            quiz_models.QuizAttempt.objects.filter(
                user_id=user.id,
                quiz_id__in=quiz_ids,
                submitted_at__isnull=True,
            ).values_list("quiz_id", flat=True)
        )
        released_by_quiz = {
            r.quiz_id: r.attempt_id
            for r in quiz_models.QuizResult.objects.filter(
                user_id=user.id, quiz_id__in=quiz_ids
            )
        }

    for row in quiz_ser.data:
        d = dict(row)
        d["kind"] = "quiz"
        if not is_teacher:
            qid = d["id"]
            completed = int(completed_by_quiz.get(qid, 0))
            max_attempts = int(d.get("max_retakes") or 0)
            in_progress = qid in in_progress_quiz_ids
            may_take = in_progress or completed < max_attempts
            d["learner_quiz"] = {
                "completed_attempts": completed,
                "max_attempts": max_attempts,
                "has_in_progress_attempt": in_progress,
                "may_submit_new_attempt": may_take,
                "has_released_result": qid in released_by_quiz,
                "released_attempt_id": released_by_quiz.get(qid),
                "attempts_exhausted_message": (
                    None
                    if may_take
                    else "You have used all allowed attempts for this quiz."
                ),
            }
        else:
            d["learner_quiz"] = None
        quiz_rows.append(d)
    return quiz_rows


def _merge_assessment_rows(assignment_rows: list[dict], quiz_rows: list[dict]) -> list[dict]:
    merged = assignment_rows + quiz_rows
    merged.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    return merged


def _build_course_assessment_rows(
    view: BaseView,
    user: User,
    course_id: int,
    *,
    is_teacher: bool,
) -> list[dict]:
    assignment_rows = _assignment_rows_for_courses(view, [course_id])
    quiz_rows = _quiz_rows_for_courses(view, user, [course_id], is_teacher=is_teacher)
    return _merge_assessment_rows(assignment_rows, quiz_rows)


def _paginated_list_response(request: Request, items: list, page: int, page_size: int):
    paginator = Paginator(items, page_size)
    if paginator.count == 0:
        return {
            "links": {"next": None, "previous": None},
            "count": 0,
            "count_per_page": 0,
            "total_pages": 0,
            "data": [],
        }
    try:
        page_obj = paginator.page(page)
    except PageNotAnInteger:
        page_obj = paginator.page(1)
    except EmptyPage:
        page_obj = paginator.page(paginator.num_pages)

    base_path = request.build_absolute_uri(request.path)
    q = request.query_params.copy()

    def _link(pnum: int | None):
        if pnum is None or pnum < 1 or pnum > paginator.num_pages:
            return None
        q["page"] = str(pnum)
        q["size"] = str(page_size)
        return f"{base_path}?{urlencode(sorted(q.items()))}"

    return {
        "links": {
            "next": _link(page_obj.number + 1) if page_obj.has_next() else None,
            "previous": _link(page_obj.number - 1) if page_obj.has_previous() else None,
        },
        "count": paginator.count,
        "count_per_page": len(page_obj.object_list),
        "total_pages": paginator.num_pages,
        "data": list(page_obj.object_list),
    }


@transaction.atomic
def _duplicate_quiz_to_course(
    *,
    source: quiz_models.Quiz,
    course: models.Course,
    created_by: User,
) -> quiz_models.Quiz:
    new_quiz = quiz_models.Quiz.objects.create(
        title=source.title,
        status=quiz_models.Quiz.QuizStatus.DRAFT,
        code=uuid.uuid4(),
        version=1,
        can_show_answers_afterwards=source.can_show_answers_afterwards,
        max_retakes=source.max_retakes,
        allowed_minutes=source.allowed_minutes,
        activation_date=None,
        expiry_date=None,
        category=source.category,
        course=course,
        created_by=created_by,
        source_quiz=source,
    )
    for q in (
        source.questions.all()
        .order_by("display_order", "id")
        .prefetch_related(
            "options",
            "fill_blank_slots__acceptable_answers",
        )
    ):
        nq = quiz_models.Question.objects.create(
            quiz=new_quiz,
            question_type=q.question_type,
            body=q.body,
            body_plaintext=q.body_plaintext,
            points=q.points,
            display_order=q.display_order,
            is_partial_scoring_enabled=q.is_partial_scoring_enabled,
            is_case_sensitive=getattr(q, "is_case_sensitive", False),
        )
        if q.question_type == quiz_models.Question.QuestionType.FILL_IN_BLANK:
            uuid_map: dict[str, str] = {}
            for slot in q.fill_blank_slots.all().order_by("display_order", "id"):
                new_u = str(uuid.uuid4())
                uuid_map[str(slot.blank_uuid)] = new_u
                ns = quiz_models.QuestionFillBlankSlot.objects.create(
                    question=nq,
                    blank_uuid=new_u,
                    points=slot.points,
                    display_order=slot.display_order,
                )
                for ans in slot.acceptable_answers.all().order_by("display_order", "id"):
                    quiz_models.QuestionFillBlankAcceptableAnswer.objects.create(
                        slot=ns,
                        body=ans.body,
                        display_order=ans.display_order,
                    )
            nq.body = remap_quiz_fill_blank_ids(q.body, uuid_map)
            nq.save(update_fields=["body", "updated_at"])
        else:
            for opt in q.options.all():
                quiz_models.QuestionOption.objects.create(
                    question=nq,
                    body=opt.body,
                    is_correct=opt.is_correct,
                    display_order=opt.display_order,
                )
    return new_quiz


class CourseAssessmentsListView(RBACView):
    """Merged assignments + quizzes for a course, sorted by created_at descending."""

    name = "Course assessments list"
    authentication_classes = BaseView.authentication_classes
    permission_classes = [RBACPermission]
    rbac_decision = "authenticated_only"
    model = models.Assignment
    serializer = serializers.AssignmentSerializer

    def get(self, request: Request, course_id: int):
        user = User.get_user_from_request(request)
        if not models.Course.objects.filter(id=course_id).exists():
            return self.send_response(
                True,
                "not_found",
                {"details": "Course not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not _user_has_course_access(user, course_id):
            return self.send_response(
                True,
                "forbidden",
                {"details": "You do not have access to this course."},
                status=status.HTTP_403_FORBIDDEN,
            )

        is_teacher = user.is_admin() or user_is_teacher_for_course(user.id, course_id)
        page, size = _parse_list_pagination(request)
        merged = _build_course_assessment_rows(self, user, course_id, is_teacher=is_teacher)
        payload = _paginated_list_response(request, merged, page, size)
        return self.send_response(False, "success", payload, status=status.HTTP_200_OK)


class UserTeachingAssessmentsView(RBACView):
    """Assignments + quizzes across courses where the user is assigned as teacher."""

    name = "User teaching assessments"
    authentication_classes = BaseView.authentication_classes
    permission_classes = [RBACPermission]
    rbac_decision = "authenticated_only"
    model = models.Assignment
    serializer = serializers.AssignmentSerializer

    def get(self, request: Request, user_id: int):
        viewer = User.get_user_from_request(request)
        if not User.objects.filter(id=user_id).exists():
            return self.send_response(
                True,
                "not_found",
                {"details": "User not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if viewer.id != user_id and not viewer.is_admin():
            return self.send_response(
                True,
                "forbidden",
                {"details": "Forbidden."},
                status=status.HTTP_403_FORBIDDEN,
            )

        teacher_course_ids = _teacher_course_ids_for_user(user_id)
        page, size = _parse_list_pagination(request)
        assignment_rows = _assignment_rows_for_courses(self, teacher_course_ids)
        quiz_rows = _quiz_rows_for_courses(
            self,
            viewer,
            teacher_course_ids,
            is_teacher=True,
        )
        merged = _merge_assessment_rows(assignment_rows, quiz_rows)
        payload = _paginated_list_response(request, merged, page, size)
        return self.send_response(False, "success", payload, status=status.HTTP_200_OK)


class QuizDuplicateToCourseView(RBACView):
    """Deep-copy a quiz (and questions/options) into a course."""

    name = "Quiz duplicate to course"
    authentication_classes = BaseView.authentication_classes
    permission_classes = [RBACPermission]
    required_permissions = {"POST": "quiz.author"}

    def post(self, request: Request, course_id: int):
        user = User.get_user_from_request(request)
        course = models.Course.objects.filter(id=course_id).first()
        if not course:
            return self.send_response(
                True,
                "not_found",
                {"details": "Course not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not _user_can_import_quiz_to_course(user, course_id):
            return self.send_response(
                True,
                "forbidden",
                {"details": "Only course teachers or admins can import quizzes."},
                status=status.HTTP_403_FORBIDDEN,
            )

        source_id = request.data.get("source_quiz_id")
        try:
            source_id = int(source_id)
        except (TypeError, ValueError):
            return self.send_response(
                True,
                "bad_request",
                {"details": "source_quiz_id is required and must be an integer."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        source = quiz_models.Quiz.objects.filter(id=source_id).first()
        if not source:
            return self.send_response(
                True,
                "not_found",
                {"details": "Source quiz not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not _user_may_read_source_quiz_for_duplicate(user, source):
            return self.send_response(
                True,
                "forbidden",
                {"details": "You cannot import this quiz."},
                status=status.HTTP_403_FORBIDDEN,
            )

        new_quiz = _duplicate_quiz_to_course(source=source, course=course, created_by=user)
        out = quiz_serializers.QuizSerializer(
            new_quiz,
            expand=[],
            context={**self.get_serializer_context(), "model": quiz_models.Quiz},
        )
        return self.send_response(
            False,
            "success",
            {"data": {**dict(out.data), "kind": "quiz"}},
            status=status.HTTP_201_CREATED,
        )


class UserAssessmentsSummaryView(RBACView):
    """Upcoming assignments + past assignments/quizzes with scores for a user profile."""

    name = "User assessments summary"
    authentication_classes = BaseView.authentication_classes
    permission_classes = [RBACPermission]
    rbac_decision = "authenticated_only"

    def get(self, request: Request, user_id: int):
        viewer = User.get_user_from_request(request)
        subject = User.objects.filter(id=user_id).first()
        if not subject:
            return self.send_response(
                True,
                "not_found",
                {"details": "User not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if viewer.id != user_id and viewer.is_student():
            return self.send_response(
                True,
                "forbidden",
                {"details": "Forbidden."},
                status=status.HTTP_403_FORBIDDEN,
            )

        now = timezone.now()
        student_course_ids = list(
            models.UserCourse.objects.filter(
                user_id=user_id,
                assigned_as=models.UserCourse.AssignedAs.STUDENT,
            ).values_list("course_id", flat=True)
        )

        submitted_assignment_ids = set(
            models.Submission.objects.filter(created_by_id=user_id).values_list(
                "assignment_id", flat=True
            )
        )

        upcoming_assignments = []
        if student_course_ids:
            for a in (
                models.Assignment.objects.filter(
                    course_id__in=student_course_ids,
                    due_datetime__gte=now,
                )
                .exclude(id__in=submitted_assignment_ids)
                .select_related("course")
                .order_by("due_datetime")[:200]
            ):
                upcoming_assignments.append(
                    {
                        "kind": "assignment",
                        "id": a.id,
                        "title": a.title,
                        "due_datetime": a.due_datetime.isoformat() if a.due_datetime else None,
                        "course_id": a.course_id,
                        "course_title": a.course.title if a.course else None,
                    }
                )

        past_items: list[dict] = []

        essay_quiz_ids = set(
            quiz_models.Question.objects.filter(
                question_type=quiz_models.Question.QuestionType.ESSAY,
            )
            .values_list("quiz_id", flat=True)
            .distinct()
        )
        released_attempt_by_quiz = {
            r.quiz_id: r.attempt_id
            for r in quiz_models.QuizResult.objects.filter(user_id=user_id)
        }

        mask_unreleased_for_viewer = viewer.is_student()

        latest_submission_by_assignment: dict[int, models.Submission] = {}
        for sub in (
            models.Submission.objects.filter(created_by_id=user_id)
            .select_related("assignment", "assignment__course")
            .order_by("assignment_id", "-attempt_count", "-updated_at")
        ):
            if sub.assignment_id not in latest_submission_by_assignment:
                latest_submission_by_assignment[sub.assignment_id] = sub

        for sub in latest_submission_by_assignment.values():
            a = sub.assignment
            released = sub.are_results_released
            if released:
                user_score = sub.user_score
                feedback = sub.feedback
            elif mask_unreleased_for_viewer:
                user_score = None
                feedback = None
            else:
                user_score = sub.user_score
                feedback = sub.feedback

            past_items.append(
                {
                    "kind": "assignment_submission",
                    "id": sub.id,
                    "assignment_id": a.id,
                    "title": a.title,
                    "course_id": a.course_id,
                    "course_title": a.course.title if a.course else None,
                    "user_score": user_score,
                    "feedback": feedback if released else None,
                    "is_graded": sub.is_graded,
                    "are_results_released": released,
                    "updated_at": sub.updated_at.isoformat() if sub.updated_at else None,
                }
            )

        for att in (
            quiz_models.QuizAttempt.objects.filter(user_id=user_id, submitted_at__isnull=False)
            .select_related("quiz", "quiz__course")
            .order_by("-submitted_at")[:500]
        ):
            q = att.quiz
            if q.id in essay_quiz_ids and released_attempt_by_quiz.get(q.id) != att.id:
                continue
            past_items.append(
                {
                    "kind": "quiz_attempt",
                    "attempt_id": att.id,
                    "quiz_id": q.id,
                    "quiz_code": str(q.code),
                    "title": q.title,
                    "course_id": q.course_id,
                    "course_title": q.course.title if q.course else None,
                    "score": str(att.score),
                    "max_score": att.max_score,
                    "submitted_at": att.submitted_at.isoformat() if att.submitted_at else None,
                }
            )

        past_items.sort(key=lambda x: x.get("submitted_at") or x.get("updated_at") or "", reverse=True)

        return self.send_response(
            False,
            "success",
            {
                "data": {
                    "upcoming_assignments": upcoming_assignments,
                    "past": past_items,
                }
            },
            status=status.HTTP_200_OK,
        )


class SubmissionTrackerSearchView(RBACView):
    """Staff: org-wide missed assessment counts per student/course pair."""

    name = "Submission tracker search"
    authentication_classes = BaseView.authentication_classes
    permission_classes = [RBACPermission]
    required_permissions = {"POST": "submission.track"}

    def post(self, request: Request):
        body = request.data if isinstance(request.data, dict) else {}
        filters = parse_submission_tracker_filters(body, request.query_params)
        summary, rows = build_submission_tracker_rows(filters)
        page_rows, count = paginate_submission_tracker_rows(
            rows, filters.page, filters.size
        )

        return self.send_response(
            False,
            "success",
            {
                "data": {
                    "summary": summary,
                    "results": page_rows,
                },
                "page": filters.page,
                "size": filters.size,
                "count": count,
            },
            status=status.HTTP_200_OK,
        )


class SubmissionTrackerDetailView(RBACView):
    """Staff: missed assessment list for one student + course in a date range."""

    name = "Submission tracker detail"
    authentication_classes = BaseView.authentication_classes
    permission_classes = [RBACPermission]
    required_permissions = {"POST": "submission.track"}

    def post(self, request: Request):
        body = request.data if isinstance(request.data, dict) else {}
        try:
            student_id = int(body.get("student_id") or request.query_params.get("student_id"))
            course_id = int(body.get("course_id") or request.query_params.get("course_id"))
        except (TypeError, ValueError):
            return self.send_response(
                True,
                "bad_request",
                {"details": "student_id and course_id are required integers."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        filters = parse_submission_tracker_filters(body, request.query_params)
        items = build_submission_tracker_detail(
            student_id, course_id, filters.date_from, filters.date_to
        )

        return self.send_response(
            False,
            "success",
            {"data": {"items": items}},
            status=status.HTTP_200_OK,
        )
