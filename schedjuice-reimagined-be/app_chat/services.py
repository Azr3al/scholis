from __future__ import annotations

from typing import Any

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Exists, OuterRef, Subquery

from app_attachment.models import Attachment
from app_auth.models import User
from app_chat.contracts import (
    MAX_CHAT_ATTACHMENT_SIZE_BYTES,
    normalize_extension,
)
from app_chat.models import ChatMessage, ChatReadState, ChatThread, ChatThreadKind, ChatThreadParticipant
from app_course.models import UserCourse


def is_course_member(user: User, course_id: int) -> bool:
    return UserCourse.objects.filter(
        course_id=course_id, user=user
    ).exists()


def is_course_teacher(user: User, course_id: int) -> bool:
    return UserCourse.objects.filter(
        course_id=course_id,
        user=user,
        assigned_as=UserCourse.AssignedAs.TEACHER,
    ).exists()


def can_moderate_chat(user: User, course_id: int) -> bool:
    return bool(user.is_admin() or is_course_teacher(user, course_id))


def non_dropped_member_count(course_id: int) -> int:
    return UserCourse.objects.filter(course_id=course_id).count()


def mention_user_ids_from_content_mentions(mentions) -> list[int]:
    """Normalize mention payloads (dicts with user_id or bare ints) to a list of ids."""
    if not mentions:
        return []
    out: list[int] = []
    for item in mentions:
        if isinstance(item, dict):
            uid = item.get("user_id")
            if uid is not None:
                out.append(int(uid))
        elif isinstance(item, int):
            out.append(item)
    return out


def validate_mention_user_ids(course_id: int, user_ids: list[int]) -> None:
    allowed = set(
        UserCourse.objects.filter(
            course_id=course_id
        ).values_list("user_id", flat=True)
    )
    bad = [uid for uid in user_ids if uid not in allowed]
    if bad:
        raise ValidationError({"mentions": f"Invalid user ids for this course: {bad}"})


def normalize_dm_pair_key(user_a_id: int, user_b_id: int) -> str:
    if user_a_id == user_b_id:
        raise ValidationError({"participant_user_id": "Cannot create DM with yourself."})
    lo, hi = sorted((int(user_a_id), int(user_b_id)))
    return f"{lo}:{hi}"


def students_dm_admins_only_enabled(tenant) -> bool:
    return bool(getattr(tenant, "is_students_dm_admins_only_enabled", False))


def student_dm_contact_user_id(tenant) -> int | None:
    """Dedicated admin User.id students may DM when admins-only mode is on."""
    if tenant is None:
        return None
    raw = getattr(tenant, "student_dm_contact_user_id", None)
    if raw is None:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def validate_student_dm_contact_user(user_id: int, schema_name: str) -> User:
    """Ensure user exists in tenant schema and has admin/manager/superadmin role."""
    from tenant_schemas.utils import schema_context

    with schema_context(schema_name):
        user = User.objects.filter(pk=int(user_id)).first()
    if user is None:
        raise ValidationError(
            {"student_dm_contact_user_id": "User not found in this school."}
        )
    if not user.is_admin():
        raise ValidationError(
            {
                "student_dm_contact_user_id": (
                    "Student DM contact must be a school admin, manager, or superadmin."
                )
            }
        )
    return user


def students_dm_admins_only_for_current_tenant() -> bool:
    from django.db import connection

    from app_organization.models import Organization
    from tenant_schemas.utils import get_public_schema_name, schema_context

    schema = getattr(connection, "schema_name", None) or ""
    if not schema or schema == get_public_schema_name():
        return False
    with schema_context(get_public_schema_name()):
        org = (
            Organization.objects.filter(schema_name=schema)
            .only("is_students_dm_admins_only_enabled")
            .first()
        )
    if org is None:
        return False
    return students_dm_admins_only_enabled(org)


def tenant_for_schema_name(schema_name: str | None):
    from app_organization.models import Organization
    from tenant_schemas.utils import get_public_schema_name, schema_context

    if not schema_name or schema_name == get_public_schema_name():
        return None
    with schema_context(get_public_schema_name()):
        return Organization.objects.filter(schema_name=schema_name).first()


def can_create_dm_thread(
    requester: User, participant: User, tenant=None
) -> bool:
    """Tenant DM policy: block pure-student <-> pure-student; optional admins-only."""
    if requester.id == participant.id:
        return False
    if requester.is_student() and participant.is_student():
        return False
    if tenant and students_dm_admins_only_enabled(tenant):
        if requester.is_student():
            contact_id = student_dm_contact_user_id(tenant)
            if contact_id is None:
                return False
            if participant.id != contact_id or not participant.is_admin():
                return False
    return True


def dm_participants(thread: ChatThread) -> list[User]:
    """The two (or more, for a future group kind) users on a thread."""
    return [p.user for p in ChatThreadParticipant.objects.filter(thread=thread).select_related("user")]


def can_send_dm_in_thread(user: User, thread: ChatThread, tenant=None) -> bool:
    """True if ``user`` may send in this DM thread (sender-aware policy)."""
    others = [u for u in dm_participants(thread) if u.id != user.id]
    if len(others) != 1:
        return False
    return can_create_dm_thread(user, others[0], tenant=tenant)


def dm_thread_pair_policy_allows(thread: ChatThread, tenant=None) -> bool:
    """True if messaging is allowed for this thread's user pair (both directions)."""
    users = dm_participants(thread)
    if len(users) != 2:
        return False
    return can_create_dm_thread(users[0], users[1], tenant=tenant)


def get_or_create_course_chat_thread(course_id: int) -> ChatThread:
    thread, _created = ChatThread.objects.get_or_create(
        kind=ChatThreadKind.COURSE, course_id=course_id
    )
    return thread


def get_or_create_dm_thread(user: User, participant_user_id: int, tenant=None):
    participant = User.objects.filter(pk=participant_user_id).first()
    if participant is None:
        raise ValidationError({"participant_user_id": "User not found."})
    if not can_create_dm_thread(user, participant, tenant=tenant):
        raise ValidationError(
            {
                "participant_user_id": "Direct messages are not allowed with this user.",
            }
        )
    pair_key = normalize_dm_pair_key(user.id, participant_user_id)
    thread, created = ChatThread.objects.get_or_create(
        kind=ChatThreadKind.DM, dm_pair_key=pair_key
    )
    if created:
        ChatThreadParticipant.objects.bulk_create(
            [
                ChatThreadParticipant(thread=thread, user_id=user.id),
                ChatThreadParticipant(thread=thread, user_id=participant_user_id),
            ]
        )
    return thread, created


def user_is_dm_participant(user: User, thread: ChatThread) -> bool:
    return ChatThreadParticipant.objects.filter(thread=thread, user=user).exists()


def can_access_thread(user: User, thread: ChatThread) -> bool:
    """Single dispatch point for 'may this user read/act on this thread'.

    Course threads: membership is UserCourse-derived. DM/group threads:
    membership is the explicit ChatThreadParticipant table.
    """
    if thread.kind == ChatThreadKind.COURSE:
        from app_chat.student_teacher_group_chat import (
            course_wide_chat_enabled_for_current_tenant,
        )

        if not course_wide_chat_enabled_for_current_tenant():
            return False
        return is_course_member(user, thread.course_id)
    if thread.kind == ChatThreadKind.GROUP:
        from app_chat.student_teacher_group_chat import (
            is_group_thread_listable,
            is_student_teacher_group_thread,
        )

        if not is_student_teacher_group_thread(thread):
            return False
        if not user_is_dm_participant(user, thread):
            return False
        return is_group_thread_listable(thread)
    return user_is_dm_participant(user, thread)


def list_dm_threads_for_user(user: User) -> list[ChatThread]:
    """Non-empty DM threads for ``user``, newest-activity first.

    Each returned ``ChatThread`` is annotated with ``latest_message_id`` (int or
    None) and ``_dm_unread_count`` (int), and carries a resolved ``_latest_message``
    (``ChatMessage`` or None) for serializers that want to avoid a second query.
    Used by the generic ``GET /chat/threads?kind=dm`` view.
    """
    latest_subq = (
        ChatMessage.objects.filter(thread_id=OuterRef("pk"))
        .order_by("-created_at", "-id")
        .values("id")[:1]
    )
    has_messages = ChatMessage.objects.filter(thread_id=OuterRef("pk"))
    qs = (
        ChatThread.objects.filter(kind=ChatThreadKind.DM, participants__user=user)
        .filter(Exists(has_messages))
        .prefetch_related("participants__user")
        .annotate(latest_message_id=Subquery(latest_subq))
        .order_by("-updated_at")
    )
    threads = list(qs)
    latest_ids = [t.latest_message_id for t in threads if t.latest_message_id]
    latest_map = {}
    if latest_ids:
        for m in ChatMessage.objects.filter(pk__in=latest_ids).select_related("user"):
            latest_map[m.id] = m
    counts = bulk_thread_unread_counts([t.id for t in threads], user.id)
    for t in threads:
        t._dm_unread_count = counts.get(t.id, 0)
        t._latest_message = latest_map.get(t.latest_message_id) if t.latest_message_id else None
    return threads


def bulk_thread_unread_counts(thread_ids: list[int], reader_user_id: int) -> dict[int, int]:
    """Unread count per thread: messages from others after reader's last_read_message_id.

    Kind-agnostic — used for DM thread lists and the course chat last-messages
    batch preview (`CourseChatLastMessagesBatchView`).
    """
    if not thread_ids:
        return {}
    states = {
        s.thread_id: s.last_read_message_id or 0
        for s in ChatReadState.objects.filter(
            thread_id__in=thread_ids, user_id=reader_user_id
        )
    }
    counts = dict.fromkeys(thread_ids, 0)
    rows = ChatMessage.objects.filter(thread_id__in=thread_ids).exclude(
        user_id=reader_user_id
    ).values_list("thread_id", "id")
    for tid, mid in rows:
        cursor = states.get(tid, 0)
        if mid > cursor:
            counts[tid] += 1
    return counts


def validate_chat_content_payload(content: Any) -> dict[str, Any]:
    if not isinstance(content, dict):
        raise ValidationError({"content": "content must be an object"})
    text = content.get("text")
    attachments = content.get("attachments", [])
    mentions = content.get("mentions", [])
    if text is None:
        text = ""
    if not isinstance(text, str):
        raise ValidationError({"text": "content.text must be a string"})
    if not isinstance(attachments, list):
        raise ValidationError({"attachments": "content.attachments must be a list"})
    if not isinstance(mentions, list):
        raise ValidationError({"mentions": "content.mentions must be a list"})
    if not text.strip() and len(attachments) == 0:
        raise ValidationError(
            {"content": "A message must include text or at least one attachment."}
        )
    return {
        "text": text,
        "attachments": attachments,
        "mentions": mentions,
    }


def validate_chat_attachment_refs(user: User, attachments: list[dict[str, Any]]) -> None:
    if not attachments:
        return
    attachment_ids = []
    for item in attachments:
        if not isinstance(item, dict):
            raise ValidationError({"attachments": "Each attachment must be an object."})
        attachment_id = item.get("attachment_id")
        if attachment_id is None:
            raise ValidationError({"attachments": "attachment_id is required."})
        attachment_ids.append(int(attachment_id))

    rows = {
        a.id: a
        for a in Attachment.objects.filter(
            id__in=attachment_ids,
            is_deleted=False,
        )
    }
    missing = [aid for aid in attachment_ids if aid not in rows]
    if missing:
        raise ValidationError({"attachments": f"Invalid attachment ids: {missing}"})

    for aid in attachment_ids:
        row = rows[aid]
        if row.size and row.size > MAX_CHAT_ATTACHMENT_SIZE_BYTES:
            raise ValidationError(
                {"attachments": f"Attachment {aid} exceeds 15 MB size limit."}
            )
        ext = normalize_extension(row.filename or "")
        if not ext:
            raise ValidationError({"attachments": f"Attachment {aid} has no extension."})


def _create_participant_thread_message(
    thread: ChatThread,
    user: User,
    content: Any,
    reply_to_id=None,
    *,
    queue_pushes,
    policy_allows=None,
) -> tuple[ChatMessage | None, str | None]:
    if not user_is_dm_participant(user, thread):
        return None, "forbidden"
    if policy_allows is not None and not policy_allows(thread, user):
        return None, "dm_policy_blocked"

    reply_to = None
    if reply_to_id is not None:
        try:
            rid = int(reply_to_id)
        except (TypeError, ValueError):
            return None, "reply_to_invalid"
        parent = ChatMessage.objects.filter(pk=rid, thread_id=thread.id).first()
        if parent is None:
            return None, "reply_not_found"
        reply_to = parent

    try:
        normalized = validate_chat_content_payload(content)
        validate_chat_attachment_refs(user, normalized.get("attachments", []))
    except ValidationError:
        return None, "content_invalid"

    row = ChatMessage.objects.create(
        thread=thread, user=user, content=normalized, reply_to=reply_to
    )
    row = ChatMessage.objects.select_related(
        "thread", "user", "reply_to", "reply_to__user"
    ).get(pk=row.pk)
    queue_pushes(row)
    return row, None


def create_dm_message(
    thread_id: int,
    user: User,
    content: Any,
    reply_to_id=None,
    tenant=None,
) -> tuple[ChatMessage | None, str | None]:
    """
    Create a DM row after membership, policy, content, and optional reply validation.
    Returns (message, error_code).
    """
    from app_chat.notifications import queue_dm_message_pushes

    thread = ChatThread.objects.filter(pk=thread_id, kind=ChatThreadKind.DM).first()
    if thread is None:
        return None, "thread_not_found"

    def policy_allows(thread: ChatThread, sender: User) -> bool:
        return can_send_dm_in_thread(sender, thread, tenant=tenant)

    return _create_participant_thread_message(
        thread,
        user,
        content,
        reply_to_id,
        queue_pushes=queue_dm_message_pushes,
        policy_allows=policy_allows,
    )


def create_group_message(
    thread_id: int,
    user: User,
    content: Any,
    reply_to_id=None,
) -> tuple[ChatMessage | None, str | None]:
    """Create a group thread message. Returns (message, error_code)."""
    from app_chat.notifications import queue_group_message_pushes
    from app_chat.student_teacher_group_chat import is_student_teacher_group_thread

    thread = ChatThread.objects.filter(pk=thread_id, kind=ChatThreadKind.GROUP).first()
    if thread is None or not is_student_teacher_group_thread(thread):
        return None, "thread_not_found"
    if not can_access_thread(user, thread):
        return None, "forbidden"
    return _create_participant_thread_message(
        thread,
        user,
        content,
        reply_to_id,
        queue_pushes=queue_group_message_pushes,
    )


def start_dm_conversation(
    user: User,
    participant_user_id: int,
    content: Any,
    reply_to_id=None,
    tenant=None,
) -> tuple[ChatThread, ChatMessage, bool]:
    """
    Atomically get-or-create a DM thread and post the first message.
    If message creation fails and the thread was newly created, delete the thread.
    """
    _DM_MESSAGE_ERRORS: dict[str, ValidationError] = {
        "forbidden": ValidationError({"details": "Forbidden"}),
        "dm_policy_blocked": ValidationError(
            {
                "participant_user_id": (
                    "Direct messages are not allowed with this user."
                ),
            }
        ),
        "content_invalid": ValidationError(
            {"content": "A message must include text or at least one attachment."}
        ),
        "reply_to_invalid": ValidationError({"reply_to_id": "Invalid reply target."}),
        "reply_not_found": ValidationError({"reply_to_id": "Reply target not found."}),
    }

    with transaction.atomic():
        thread, created = get_or_create_dm_thread(
            user, participant_user_id, tenant=tenant
        )
        row, err = create_dm_message(
            thread.id, user, content, reply_to_id=reply_to_id, tenant=tenant
        )
        if err:
            if created:
                thread.delete()
            raise _DM_MESSAGE_ERRORS.get(
                err, ValidationError({"details": err})
            )
        return thread, row, created
