"""Auto-provisioned student + MT/AT teacher group chat threads (tenant-gated)."""
from __future__ import annotations

from django.db.models import Exists, OuterRef

from app_auth.models import User
from app_chat.models import ChatThread, ChatThreadKind, ChatThreadParticipant
from app_course.course_status import compute_effective_status, effective_status_q
from app_course.models import Course, UserCourse
from app_course.teaching_assignment import teaching_seniority_filter_kwargs

STUDENT_TEACHER_GROUP_KEY_PREFIX = "student_teachers:"


def student_teacher_group_chat_enabled(tenant) -> bool:
    return bool(getattr(tenant, "is_student_teacher_group_chat_enabled", False))


def course_wide_chat_enabled(tenant) -> bool:
    """Whole-roster course chat is off when student–teacher group chat is on."""
    return not student_teacher_group_chat_enabled(tenant)


def course_wide_chat_enabled_for_current_tenant() -> bool:
    from django.db import connection

    from app_organization.models import Organization
    from tenant_schemas.utils import get_public_schema_name, schema_context

    schema = getattr(connection, "schema_name", None) or ""
    if not schema or schema == get_public_schema_name():
        return True
    with schema_context(get_public_schema_name()):
        org = (
            Organization.objects.filter(schema_name=schema)
            .only("is_student_teacher_group_chat_enabled")
            .first()
        )
    if org is None:
        return True
    return course_wide_chat_enabled(org)


def build_student_teacher_group_key(student_id: int, course_id: int) -> str:
    return f"{STUDENT_TEACHER_GROUP_KEY_PREFIX}{int(student_id)}:{int(course_id)}"


def is_student_teacher_group_thread(thread: ChatThread) -> bool:
    key = thread.group_key or ""
    return (
        thread.kind == ChatThreadKind.GROUP
        and key.startswith(STUDENT_TEACHER_GROUP_KEY_PREFIX)
    )


def teaching_teacher_user_ids_for_course(course_id: int) -> set[int]:
    return set(
        UserCourse.objects.filter(
            course_id=course_id,
            **teaching_seniority_filter_kwargs(),
        ).values_list("user_id", flat=True)
    )


def _anchor_student_enrolled(thread: ChatThread) -> bool:
    if not thread.anchor_user_id or not thread.course_id:
        return False
    return UserCourse.objects.filter(
        user_id=thread.anchor_user_id,
        course_id=thread.course_id,
        assigned_as=UserCourse.AssignedAs.STUDENT,
    ).exists()


def is_group_thread_listable(thread: ChatThread) -> bool:
    if not is_student_teacher_group_thread(thread) or not thread.course_id:
        return False
    if not _anchor_student_enrolled(thread):
        return False
    course = getattr(thread, "course", None)
    if course is None:
        course = Course.objects.filter(pk=thread.course_id).first()
    if course is None:
        return False
    return compute_effective_status(course) == Course.CourseStatus.ACTIVE


def _desired_participant_ids(student_id: int, course_id: int) -> set[int]:
    if not UserCourse.objects.filter(
        user_id=student_id,
        course_id=course_id,
        assigned_as=UserCourse.AssignedAs.STUDENT,
    ).exists():
        return teaching_teacher_user_ids_for_course(course_id)
    return {student_id} | teaching_teacher_user_ids_for_course(course_id)


def _sync_participants(thread: ChatThread, desired_user_ids: set[int]) -> None:
    existing_ids = set(
        ChatThreadParticipant.objects.filter(thread=thread).values_list(
            "user_id", flat=True
        )
    )
    to_add = desired_user_ids - existing_ids
    to_remove = existing_ids - desired_user_ids
    if to_remove:
        ChatThreadParticipant.objects.filter(
            thread=thread, user_id__in=to_remove
        ).delete()
    if to_add:
        ChatThreadParticipant.objects.bulk_create(
            [
                ChatThreadParticipant(thread=thread, user_id=uid)
                for uid in sorted(to_add)
            ],
            ignore_conflicts=True,
        )


def sync_student_teacher_group_thread(
    student_id: int, course_id: int, tenant
) -> ChatThread | None:
    """Create or update one student×course group thread and its participants."""
    if not student_teacher_group_chat_enabled(tenant):
        return None

    group_key = build_student_teacher_group_key(student_id, course_id)
    thread, _created = ChatThread.objects.get_or_create(
        kind=ChatThreadKind.GROUP,
        group_key=group_key,
        defaults={
            "course_id": course_id,
            "anchor_user_id": student_id,
        },
    )
    update_fields: list[str] = []
    if thread.course_id != course_id:
        thread.course_id = course_id
        update_fields.append("course_id")
    if thread.anchor_user_id != student_id:
        thread.anchor_user_id = student_id
        update_fields.append("anchor_user_id")
    if update_fields:
        thread.save(update_fields=update_fields + ["updated_at"])

    desired = _desired_participant_ids(student_id, course_id)
    _sync_participants(thread, desired)
    return thread


def sync_all_student_threads_for_course(course_id: int, tenant) -> int:
    if not student_teacher_group_chat_enabled(tenant):
        return 0
    count = 0
    student_ids = UserCourse.objects.filter(
        course_id=course_id,
        assigned_as=UserCourse.AssignedAs.STUDENT,
    ).values_list("user_id", flat=True)
    for student_id in student_ids:
        if sync_student_teacher_group_thread(student_id, course_id, tenant):
            count += 1
    return count


def sync_group_chat_for_user_course(user_course: UserCourse, tenant) -> None:
    if not student_teacher_group_chat_enabled(tenant):
        return
    if user_course.assigned_as == UserCourse.AssignedAs.STUDENT:
        sync_student_teacher_group_thread(
            user_course.user_id, user_course.course_id, tenant
        )
    elif user_course.assigned_as == UserCourse.AssignedAs.TEACHER:
        sync_all_student_threads_for_course(user_course.course_id, tenant)


def list_student_teacher_group_threads_for_user(user: User) -> list[ChatThread]:
    """Group threads visible in chat list: active course, enrolled anchor student."""
    from django.db.models import Subquery

    from app_chat.models import ChatMessage
    from app_chat.services import bulk_thread_unread_counts

    active_courses = Course.objects.filter(
        effective_status_q(Course.CourseStatus.ACTIVE)
    )
    open_anchor_enrollment = UserCourse.objects.filter(
        user_id=OuterRef("anchor_user_id"),
        course_id=OuterRef("course_id"),
        assigned_as=UserCourse.AssignedAs.STUDENT,
    )
    latest_msg_subq = (
        ChatMessage.objects.filter(thread_id=OuterRef("pk"))
        .order_by("-created_at", "-id")
        .values("id")[:1]
    )

    qs = (
        ChatThread.objects.filter(
            kind=ChatThreadKind.GROUP,
            participants__user=user,
            group_key__startswith=STUDENT_TEACHER_GROUP_KEY_PREFIX,
            course_id__in=active_courses.values("id"),
        )
        .filter(Exists(open_anchor_enrollment))
        .prefetch_related("participants__user", "course", "anchor_user")
        .annotate(latest_message_id=Subquery(latest_msg_subq))
        .order_by("-updated_at")
        .distinct()
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
        t._latest_message = (
            latest_map.get(t.latest_message_id) if t.latest_message_id else None
        )
    return threads


def group_thread_display_title(thread: ChatThread, viewer: User) -> str:
    course_title = ""
    if thread.course_id:
        course = getattr(thread, "course", None)
        if course is not None:
            course_title = (getattr(course, "title", "") or "").strip()
    if thread.anchor_user_id == viewer.id:
        return course_title or "Class chat"
    student = getattr(thread, "anchor_user", None)
    student_name = (getattr(student, "name", "") or "").strip() if student else ""
    if student_name and course_title:
        return f"{student_name} · {course_title}"
    return student_name or course_title or "Class chat"
