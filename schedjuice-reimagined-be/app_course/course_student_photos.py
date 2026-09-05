from __future__ import annotations

from app_auth.models import User
from app_course.models import Course, UserCourse


def user_is_enrolled_student(course: Course, user: User) -> bool:
    return UserCourse.objects.filter(
        course=course,
        user=user,
        assigned_as=UserCourse.AssignedAs.STUDENT,
    ).exists()


def user_is_course_staff(actor: User, course: Course) -> bool:
    """Mirror FE canEditCourse / BE user_can_edit_course_status semantics."""
    if actor.is_admin():
        return True
    if course.created_by_id == actor.id:
        return True
    return UserCourse.objects.filter(
        course=course,
        user=actor,
        assigned_as=UserCourse.AssignedAs.TEACHER,
    ).exists()


def course_staff_can_upload_student_image(
    actor: User, course: Course, target_user: User
) -> bool:
    if actor.is_student():
        return False
    if not user_is_enrolled_student(course, target_user):
        return False
    return user_is_course_staff(actor, course)
