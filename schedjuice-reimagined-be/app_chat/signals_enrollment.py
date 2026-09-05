"""Provision student–teacher group chats when enrollments change."""
from __future__ import annotations

from django.db import connection
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver
from tenant_schemas.utils import get_public_schema_name

from app_chat.tasks import (
    sync_group_chat_after_user_course_delete,
    sync_group_chat_on_user_course_change,
)
from app_course.models import UserCourse


@receiver(post_save, sender=UserCourse)
def _on_user_course_saved_for_group_chat(sender, instance: UserCourse, **kwargs):
    if connection.schema_name == get_public_schema_name():
        return
    sync_group_chat_on_user_course_change.delay(instance.id, connection.schema_name)


@receiver(post_delete, sender=UserCourse)
def _on_user_course_deleted_for_group_chat(sender, instance: UserCourse, **kwargs):
    if connection.schema_name == get_public_schema_name():
        return
    sync_group_chat_after_user_course_delete.delay(
        instance.user_id,
        instance.course_id,
        instance.assigned_as,
        connection.schema_name,
    )
