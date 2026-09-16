"""Connect UserCourse changes to Telegram roster jobs."""

from __future__ import annotations

from django.db import connection
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from app_course.models import UserCourse
from app_telegram.tasks import dm_invite_link_to_teacher, remove_telegram_member


@receiver(post_save, sender=UserCourse)
def _on_user_course_saved(sender, instance: UserCourse, created, **kwargs):
    if instance.assigned_as != UserCourse.AssignedAs.TEACHER:
        return
    schema_name = connection.schema_name
    if created:
        dm_invite_link_to_teacher.delay(instance.id, schema_name)


@receiver(post_delete, sender=UserCourse)
def _on_user_course_deleted(sender, instance: UserCourse, **kwargs):
    if instance.assigned_as != UserCourse.AssignedAs.TEACHER:
        return
    if instance.user.telegram_user_id:
        remove_telegram_member.delay(
            instance.course_id,
            connection.schema_name,
            telegram_user_id=instance.user.telegram_user_id,
        )
