from django.db import connection
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from app_chat.course_chat_list_cache import invalidate_course_chat_list_cache
from app_chat.models import ChatMessage, ChatThreadKind


@receiver(post_save, sender=ChatMessage)
def _invalidate_course_chat_list_cache_on_save(sender, instance, **kwargs):
    if instance.thread.kind != ChatThreadKind.COURSE:
        return
    invalidate_course_chat_list_cache(connection.schema_name, instance.thread.course_id)


@receiver(post_delete, sender=ChatMessage)
def _invalidate_course_chat_list_cache_on_delete(sender, instance, **kwargs):
    if instance.thread.kind != ChatThreadKind.COURSE:
        return
    invalidate_course_chat_list_cache(connection.schema_name, instance.thread.course_id)
