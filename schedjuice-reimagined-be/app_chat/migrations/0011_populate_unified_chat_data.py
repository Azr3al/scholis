"""Populate unified ChatThread/ChatMessage/ChatReadState/ChatMessageReaction from legacy tables."""

from django.db import migrations


def populate_unified_chat_data(apps, schema_editor):
    ChatThread = apps.get_model("app_chat", "ChatThread")
    ChatThreadParticipant = apps.get_model("app_chat", "ChatThreadParticipant")
    ChatMessage = apps.get_model("app_chat", "ChatMessage")
    ChatReadState = apps.get_model("app_chat", "ChatReadState")
    ChatMessageReaction = apps.get_model("app_chat", "ChatMessageReaction")
    CourseChatMessage = apps.get_model("app_chat", "CourseChatMessage")
    CourseChatReadState = apps.get_model("app_chat", "CourseChatReadState")
    DirectMessageThread = apps.get_model("app_chat", "DirectMessageThread")
    DirectMessage = apps.get_model("app_chat", "DirectMessage")
    DirectMessageReadState = apps.get_model("app_chat", "DirectMessageReadState")

    COURSE = "course"
    DM = "dm"

    # --- 1. Threads ---------------------------------------------------
    course_ids_with_activity = set(
        CourseChatMessage.objects.values_list("course_id", flat=True).distinct()
    ) | set(
        CourseChatReadState.objects.values_list("course_id", flat=True).distinct()
    )
    course_thread_id_by_course_id: dict[int, int] = {}
    for course_id in course_ids_with_activity:
        thread = ChatThread.objects.create(kind=COURSE, course_id=course_id)
        course_thread_id_by_course_id[course_id] = thread.id

    dm_thread_id_by_old_thread_id: dict[int, int] = {}
    for old_thread in DirectMessageThread.objects.all():
        lo, hi = sorted((old_thread.user_low_id, old_thread.user_high_id))
        new_thread = ChatThread.objects.create(kind=DM, dm_pair_key=f"{lo}:{hi}")
        dm_thread_id_by_old_thread_id[old_thread.id] = new_thread.id
        ChatThreadParticipant.objects.bulk_create(
            [
                ChatThreadParticipant(thread_id=new_thread.id, user_id=lo),
                ChatThreadParticipant(thread_id=new_thread.id, user_id=hi),
            ]
        )

    # --- 2. Messages (pass 1: create rows, reply_to deferred) ----------
    course_message_id_map: dict[int, int] = {}
    for old in CourseChatMessage.objects.all().order_by("id"):
        new = ChatMessage.objects.create(
            thread_id=course_thread_id_by_course_id[old.course_id],
            user_id=old.user_id,
            content=old.content,
            edited_at=old.edited_at,
            deleted_at=old.deleted_at,
            deleted_by_id=old.deleted_by_id,
        )
        ChatMessage.objects.filter(pk=new.pk).update(created_at=old.created_at, updated_at=old.updated_at)
        course_message_id_map[old.id] = new.id

    dm_message_id_map: dict[int, int] = {}
    for old in DirectMessage.objects.all().order_by("id"):
        new = ChatMessage.objects.create(
            thread_id=dm_thread_id_by_old_thread_id[old.thread_id],
            user_id=old.user_id,
            content=old.content,
            edited_at=old.edited_at,
            deleted_at=old.deleted_at,
            deleted_by_id=old.deleted_by_id,
        )
        ChatMessage.objects.filter(pk=new.pk).update(created_at=old.created_at, updated_at=old.updated_at)
        dm_message_id_map[old.id] = new.id

    # --- 3. Messages (pass 2: backfill reply_to) -----------------------
    for old in CourseChatMessage.objects.filter(reply_to__isnull=False):
        new_parent_id = course_message_id_map.get(old.reply_to_id)
        if new_parent_id is not None:
            ChatMessage.objects.filter(pk=course_message_id_map[old.id]).update(reply_to_id=new_parent_id)

    for old in DirectMessage.objects.filter(reply_to__isnull=False):
        new_parent_id = dm_message_id_map.get(old.reply_to_id)
        if new_parent_id is not None:
            ChatMessage.objects.filter(pk=dm_message_id_map[old.id]).update(reply_to_id=new_parent_id)

    # --- 4. Read states --------------------------------------------------
    for old in CourseChatReadState.objects.all():
        thread_id = course_thread_id_by_course_id.get(old.course_id)
        if thread_id is None:
            continue
        remapped_message_id = course_message_id_map.get(old.last_read_message_id)
        ChatReadState.objects.create(
            user_id=old.user_id,
            thread_id=thread_id,
            last_read_message_id=remapped_message_id,
        )

    for old in DirectMessageReadState.objects.all():
        thread_id = dm_thread_id_by_old_thread_id.get(old.thread_id)
        if thread_id is None:
            continue
        remapped_message_id = (
            dm_message_id_map.get(old.last_read_message_id)
            if old.last_read_message_id is not None
            else None
        )
        ChatReadState.objects.create(
            user_id=old.user_id,
            thread_id=thread_id,
            last_read_message_id=remapped_message_id,
            last_read_at=old.last_read_at,
        )

    # --- 5. Reactions: backfill the new `message` FK --------------------
    for reaction in ChatMessageReaction.objects.filter(course_chat_message__isnull=False):
        new_message_id = course_message_id_map.get(reaction.course_chat_message_id)
        if new_message_id is not None:
            ChatMessageReaction.objects.filter(pk=reaction.pk).update(message_id=new_message_id)

    for reaction in ChatMessageReaction.objects.filter(direct_message__isnull=False):
        new_message_id = dm_message_id_map.get(reaction.direct_message_id)
        if new_message_id is not None:
            ChatMessageReaction.objects.filter(pk=reaction.pk).update(message_id=new_message_id)


def reverse_noop(apps, schema_editor):
    """
    Not reversible: this migration remaps IDs from two independent legacy tables
    into one. Roll back by restoring from a pre-migration backup instead.
    """
    raise migrations.RunPython.DoesNotSupportReverse()


class Migration(migrations.Migration):
    dependencies = [
        ("app_chat", "0010_add_unified_chat_models"),
    ]

    operations = [
        migrations.RunPython(populate_unified_chat_data, reverse_noop),
    ]
