"""Quiz V3 authorization helpers (single source of truth for who can manage quizzes)."""

from django.core.cache import cache
from django.db import connection
from django.db.models import Q

from app_auth.models import User
from app_course.models import UserCourse
from app_quiz_v3 import models

UC_TEACHER_CACHE_TTL = 120


def _teacher_course_cache_key(user_id: int, course_id: int) -> str:
    schema = getattr(connection, "schema_name", None) or "public"
    return f"{schema}:quiz_v3:uc_teacher:{user_id}:{course_id}"


def invalidate_teacher_course_cache(user_id: int, course_id: int) -> None:
    cache.delete(_teacher_course_cache_key(user_id, course_id))


def user_is_active_student_in_course(user_id: int, course_id: int) -> bool:
    return UserCourse.objects.filter(
        user_id=user_id,
        course_id=course_id,
        assigned_as=UserCourse.AssignedAs.STUDENT,
    ).exists()


def user_is_teacher_for_course(user_id: int, course_id: int) -> bool:
    key = _teacher_course_cache_key(user_id, course_id)

    def compute() -> bool:
        return UserCourse.objects.filter(
            user_id=user_id,
            course_id=course_id,
            assigned_as=UserCourse.AssignedAs.TEACHER,
        ).exists()

    return cache.get_or_set(key, compute, UC_TEACHER_CACHE_TTL)


def can_manage_quiz_v3(user: User, quiz: models.Quiz) -> bool:
    """
    Staff who may edit quiz content, questions, and view attempts.

    - Org admins (admin / manager / superadmin)
    - The user who created the quiz
    - Teachers assigned to the quiz's course (not students enrolled in the course)
    """
    if user.is_admin():
        return True
    if quiz.created_by_id == user.id:
        return True
    if quiz.course_id:
        return user_is_teacher_for_course(user.id, quiz.course_id)
    return False


def get_visible_quiz_ids(user: User):
    """
    Quiz IDs the user may see in list/search for authoring.

    Admins see all. Others see quizzes they created or quizzes tied to a course
    where they are assigned as a teacher (not merely enrolled as a student).
    """
    if user.is_admin():
        return None
    teacher_course_ids = UserCourse.objects.filter(
        user_id=user.id,
        assigned_as=UserCourse.AssignedAs.TEACHER,
    ).values_list("course_id", flat=True)
    return models.Quiz.objects.filter(
        Q(created_by_id=user.id) | Q(course_id__in=teacher_course_ids)
    ).values_list("id", flat=True)


def get_quiz_for_management(user: User, quiz_id: int) -> tuple[models.Quiz | None, str | None]:
    """
    Load quiz and check management permission.

    Returns (quiz, None) on success, or (None, "not_found"|"forbidden").
    """
    quiz = models.Quiz.objects.filter(id=quiz_id).select_related("created_by").first()
    if quiz is None:
        return None, "not_found"
    if not can_manage_quiz_v3(user, quiz):
        return None, "forbidden"
    return quiz, None


def take_flow_forbidden_detail(
    user: User,
    quiz: models.Quiz,
    *,
    in_progress: models.QuizAttempt | None,
) -> str | None:
    """
    Enforce course + active student enrollment + archive (no new attempts).

    ``in_progress`` is this user's open ``QuizAttempt`` for this quiz, if any.
    Callers should load it first so archived quizzes still allow resume.
    """
    if quiz.status != models.Quiz.QuizStatus.OPEN:
        return None
    if not quiz.course_id:
        return "This quiz is not available."
    if not user_is_active_student_in_course(user.id, quiz.course_id):
        return "You are not enrolled in this course as an active student."
    if quiz.archived_at and in_progress is None:
        return "This quiz is no longer accepting new attempts."
    return None


def quiz_management_error_response(view, error: str):
    """Build the appropriate error response for get_quiz_for_management."""
    if error == "not_found":
        return view.send_response(True, "not_found", {}, status=404)
    if error == "forbidden":
        return view.send_response(
            True,
            "forbidden",
            {"details": "Forbidden"},
            status=403,
        )
    raise ValueError(f"unknown error: {error}")
