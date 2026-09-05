from django.utils import timezone

from app_course.models import UserCourse


def close_teacher_user_course(user_course: UserCourse, *, at=None) -> UserCourse:
    if user_course.assigned_as != UserCourse.AssignedAs.TEACHER:
        raise ValueError("close_teacher_user_course only accepts teacher rows")
    if user_course.left_at is not None:
        return user_course
    user_course.left_at = at or timezone.now()
    user_course.save(update_fields=["left_at"])
    return user_course
