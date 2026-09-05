from __future__ import annotations

from collections.abc import Callable, Iterable

from app_utils.push_helpers import enqueue_push_for_user_ids
from app_chat.models import ChatReadState, ChatThreadParticipant


def _chat_body_preview(content: dict | None) -> str:
    c = content or {}
    text = (c.get("text") or "").strip()
    if text:
        return text[:120]
    attachments = c.get("attachments") or []
    if attachments:
        if len(attachments) == 1 and isinstance(attachments[0], dict):
            mime = (attachments[0].get("mime_type") or "").strip().lower()
            if mime.startswith("audio/"):
                return "Sent a voice message."
        return "Sent an attachment."
    return "You received a new message."


def _sender_display_name(user) -> str:
    if user is None:
        return ""
    return (getattr(user, "name", "") or "").strip()


def _filter_unread_recipient_ids(
    message_id: int,
    candidate_ids: Iterable[int],
    read_states: dict[int, int],
) -> list[int]:
    target_ids = []
    for uid in candidate_ids:
        last_read_id = read_states.get(uid, 0) or 0
        if last_read_id >= message_id:
            continue
        target_ids.append(uid)
    return target_ids


def queue_chat_message_pushes(
    message,
    *,
    sender_id: int,
    resolve_candidate_ids: Callable[[], list[int]],
    resolve_read_states: Callable[[list[int]], dict[int, int]],
    resolve_title: Callable[[], str],
    push_data: dict[str, str],
) -> None:
    """Queue push notifications for chat messages not yet read by recipients."""
    candidate_ids = [uid for uid in resolve_candidate_ids() if uid != sender_id]
    if not candidate_ids:
        return
    read_states = resolve_read_states(candidate_ids)
    target_ids = _filter_unread_recipient_ids(message.id, candidate_ids, read_states)
    if not target_ids:
        return
    sender_name = _sender_display_name(getattr(message, "user", None))
    body = _chat_body_preview(
        message.content if isinstance(message.content, dict) else None
    )
    data = {**push_data, "message_id": str(message.id), "sender_name": sender_name}
    enqueue_push_for_user_ids(target_ids, title=resolve_title(), body=body, data=data)


def queue_course_chat_message_pushes(message) -> None:
    from app_chat.student_teacher_group_chat import (
        course_wide_chat_enabled_for_current_tenant,
    )

    if not course_wide_chat_enabled_for_current_tenant():
        return

    thread = message.thread
    course_id = thread.course_id

    def resolve_candidate_ids() -> list[int]:
        return list(thread.course.user_courses.values_list("user_id", flat=True))

    def resolve_read_states(candidate_ids: list[int]) -> dict[int, int]:
        return {
            s.user_id: s.last_read_message_id
            for s in ChatReadState.objects.filter(
                thread_id=thread.id, user_id__in=candidate_ids
            )
        }

    def resolve_title() -> str:
        course = getattr(thread, "course", None)
        return (getattr(course, "title", "") or "").strip() or "Course chat"

    queue_chat_message_pushes(
        message,
        sender_id=message.user_id,
        resolve_candidate_ids=resolve_candidate_ids,
        resolve_read_states=resolve_read_states,
        resolve_title=resolve_title,
        push_data={
            "type": "course_chat",
            "course_id": str(course_id),
            "thread_id": str(thread.id),
        },
    )


def queue_dm_message_pushes(message) -> None:
    thread = message.thread

    def resolve_candidate_ids() -> list[int]:
        return list(
            ChatThreadParticipant.objects.filter(thread_id=thread.id).values_list(
                "user_id", flat=True
            )
        )

    def resolve_read_states(candidate_ids: list[int]) -> dict[int, int]:
        return {
            s.user_id: s.last_read_message_id or 0
            for s in ChatReadState.objects.filter(
                thread_id=thread.id, user_id__in=candidate_ids
            )
        }

    def resolve_title() -> str:
        sender_name = _sender_display_name(getattr(message, "user", None))
        return sender_name or "Direct message"

    queue_chat_message_pushes(
        message,
        sender_id=message.user_id,
        resolve_candidate_ids=resolve_candidate_ids,
        resolve_read_states=resolve_read_states,
        resolve_title=resolve_title,
        push_data={"type": "dm", "thread_id": str(thread.id)},
    )


def queue_group_message_pushes(message) -> None:
    thread = message.thread

    def resolve_candidate_ids() -> list[int]:
        return list(
            ChatThreadParticipant.objects.filter(thread_id=thread.id).values_list(
                "user_id", flat=True
            )
        )

    def resolve_read_states(candidate_ids: list[int]) -> dict[int, int]:
        return {
            s.user_id: s.last_read_message_id or 0
            for s in ChatReadState.objects.filter(
                thread_id=thread.id, user_id__in=candidate_ids
            )
        }

    def resolve_title() -> str:
        course = getattr(thread, "course", None)
        return (getattr(course, "title", "") or "").strip() or "Class chat"

    queue_chat_message_pushes(
        message,
        sender_id=message.user_id,
        resolve_candidate_ids=resolve_candidate_ids,
        resolve_read_states=resolve_read_states,
        resolve_title=resolve_title,
        push_data={
            "type": "group",
            "thread_id": str(thread.id),
            "course_id": str(thread.course_id or ""),
        },
    )
