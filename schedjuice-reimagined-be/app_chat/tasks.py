"""Async jobs for student–teacher group chat provisioning."""
from __future__ import annotations

from tenant_schemas.utils import get_public_schema_name, schema_context

from app_course.models import UserCourse
from app_chat.student_teacher_group_chat import (
    student_teacher_group_chat_enabled,
    sync_all_student_threads_for_course,
    sync_student_teacher_group_thread,
)
from app_organization.models import Organization
from utilitas.async_tasks import django_q_task, tenant_async


def _run_group_chat_sync(
    tenant,
    *,
    user_id: int,
    course_id: int,
    assigned_as: str,
) -> None:
    if not student_teacher_group_chat_enabled(tenant):
        return
    if assigned_as == UserCourse.AssignedAs.STUDENT:
        sync_student_teacher_group_thread(user_id, course_id, tenant)
    elif assigned_as == UserCourse.AssignedAs.TEACHER:
        sync_all_student_threads_for_course(course_id, tenant)


@django_q_task
@tenant_async(entity=UserCourse)
def sync_group_chat_on_user_course_change(user_course, tenant, **kwargs):
    _run_group_chat_sync(
        tenant,
        user_id=user_course.user_id,
        course_id=user_course.course_id,
        assigned_as=user_course.assigned_as,
    )


@django_q_task
def sync_group_chat_after_user_course_delete(
    user_id: int,
    course_id: int,
    assigned_as: str,
    schema_name: str,
) -> None:
    with schema_context(get_public_schema_name()):
        tenant = Organization.objects.filter(schema_name=schema_name).first()
    if tenant is None:
        return
    with schema_context(schema_name):
        _run_group_chat_sync(
            tenant,
            user_id=user_id,
            course_id=course_id,
            assigned_as=assigned_as,
        )
