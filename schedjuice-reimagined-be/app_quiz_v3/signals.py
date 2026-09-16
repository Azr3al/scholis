from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from app_course.models import UserCourse
from app_quiz_v3.perms import invalidate_teacher_course_cache


@receiver(post_save, sender=UserCourse)
def invalidate_quiz_teacher_cache_on_usercourse_save(
    sender,
    instance: UserCourse,
    **kwargs,
):
    invalidate_teacher_course_cache(instance.user_id, instance.course_id)


@receiver(post_delete, sender=UserCourse)
def invalidate_quiz_teacher_cache_on_usercourse_delete(
    sender,
    instance: UserCourse,
    **kwargs,
):
    invalidate_teacher_course_cache(instance.user_id, instance.course_id)
