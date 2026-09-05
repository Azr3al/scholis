"""
Recompute Course.student_count, main_teacher_count, assistant_teacher_count.

Full refresh SQL matches app_tasks.management.commands.process-courses.
Scoped refresh uses correlated subqueries so courses with empty rosters get zeros.
"""
from __future__ import annotations

import logging
from collections.abc import Iterable
from typing import Optional

from django.db import connection, transaction
from tenant_schemas.utils import get_public_schema_name, schema_context

from utilitas.async_tasks import django_q_task

logger = logging.getLogger(__name__)

REFRESH_COURSE_MEMBER_COUNTS_TASK = (
    "app_course.course_member_counts.refresh_course_member_counts_async"
)

_FULL_REFRESH_SQL = """
UPDATE app_course_course c
SET student_count      = COALESCE(s.student_count, 0),
    main_teacher_count = COALESCE(mt.main_teacher_count, 0),
    assistant_teacher_count = COALESCE(ast.at_count, 0)
FROM (SELECT course_id, COUNT(*) AS student_count
      FROM app_course_usercourse
      WHERE assigned_as = 'student'
        AND left_at IS NULL
      GROUP BY course_id) s
         FULL JOIN
     (SELECT course_id, COUNT(*) AS main_teacher_count
      FROM app_course_usercourse uc
               LEFT JOIN app_course_assignedasrole r ON r.id = uc.assigned_as_role_id
      WHERE r.seniority = 'MAIN_TEACHER' AND r.is_substitute = FALSE
        AND uc.left_at IS NULL
      GROUP BY uc.course_id) mt
     ON s.course_id = mt.course_id
         FULL JOIN (SELECT course_id, COUNT(*) AS at_count
                    FROM app_course_usercourse uc
                             LEFT JOIN app_course_assignedasrole r ON r.id = uc.assigned_as_role_id
                    WHERE r.seniority = 'ASSISTANT_TEACHER' AND r.is_substitute = FALSE
                      AND uc.left_at IS NULL
                    GROUP BY uc.course_id) ast
                   ON mt.course_id = ast.course_id
WHERE c.id = COALESCE(s.course_id, mt.course_id, ast.course_id);
"""

_SCOPED_REFRESH_SQL = """
UPDATE app_course_course c
SET student_count = (
    SELECT COUNT(*) FROM app_course_usercourse uc
    WHERE uc.course_id = c.id
      AND uc.assigned_as = 'student'
      AND uc.left_at IS NULL
),
main_teacher_count = (
    SELECT COUNT(*) FROM app_course_usercourse uc
    LEFT JOIN app_course_assignedasrole r ON r.id = uc.assigned_as_role_id
    WHERE uc.course_id = c.id AND r.seniority = 'MAIN_TEACHER' AND r.is_substitute = FALSE
      AND uc.left_at IS NULL
),
assistant_teacher_count = (
    SELECT COUNT(*) FROM app_course_usercourse uc
    LEFT JOIN app_course_assignedasrole r ON r.id = uc.assigned_as_role_id
    WHERE uc.course_id = c.id AND r.seniority = 'ASSISTANT_TEACHER' AND r.is_substitute = FALSE
      AND uc.left_at IS NULL
)
WHERE c.id = ANY(%s);
"""


def refresh_course_member_counts_in_current_schema(
    course_ids: Optional[list[int]],
) -> None:
    """
    Run count refresh using the current DB search path (tenant schema).

    Pass course_ids=None for the same full recompute as process-courses step 5.
    Pass a non-empty list to update only those courses (including zeros).
    """
    with connection.cursor() as cursor:
        if course_ids is None:
            cursor.execute(_FULL_REFRESH_SQL)
            return
        deduped = sorted({int(x) for x in course_ids})
        if not deduped:
            return
        cursor.execute(_SCOPED_REFRESH_SQL, [deduped])


@django_q_task
def refresh_course_member_counts_async(schema_name: str, course_ids: list[int]) -> None:
    """django-q entrypoint: tenant schema + scoped refresh."""
    if not course_ids:
        return
    try:
        with schema_context(schema_name):
            refresh_course_member_counts_in_current_schema(list({int(x) for x in course_ids}))
    except Exception:
        logger.exception(
            "refresh_course_member_counts_async failed schema=%s course_ids=%s",
            schema_name,
            course_ids,
        )


def schema_name_from_drf_context(context: dict) -> str:
    """Prefer request.tenant.schema_name when the serializer runs in a tenant HTTP request."""
    request = context.get("request")
    if request and getattr(request, "tenant", None):
        return request.tenant.schema_name
    return connection.schema_name


def refresh_course_member_counts_now(course_ids: Iterable[int]) -> None:
    """
    Synchronous scoped SQL refresh using the current DB schema (tenant HTTP requests).

    Use this after roster mutations so counts are correct without django-q workers.
    """
    ids = sorted({int(x) for x in course_ids if x is not None})
    if not ids:
        return
    refresh_course_member_counts_in_current_schema(ids)


def queue_refresh_course_member_counts(
    schema_name: str, course_ids: Iterable[int]
) -> None:
    """Dedupe IDs, skip public schema, schedule django-q task after commit."""
    ids = sorted({int(x) for x in course_ids if x is not None})
    if not ids:
        return
    if schema_name == get_public_schema_name():
        return
    sid = schema_name
    to_pass = list(ids)

    def _enqueue() -> None:
        refresh_course_member_counts_async.delay(sid, to_pass)

    transaction.on_commit(_enqueue)
