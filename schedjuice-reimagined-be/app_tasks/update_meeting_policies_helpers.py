"""
Helpers for updating meeting policies. Used by django-q async_task.
"""

import json
import logging

from app_course.models import Course
from app_microsoft.meeting_helpers import update_course_meeting_policies
from utilitas.async_tasks import django_q_task, tenant_async

logger = logging.getLogger(__name__)


@django_q_task
@tenant_async(entity=Course)
def update_meeting_policies_for_course_async(
    course,
    tenant,
    is_participant_update=None,
    use_staffy_organizer=False,
):
    """Async wrapper for update_course_meeting_policies."""
    if not course.microsoft_meeting_id:
        logger.debug(
            "update_meeting_policies_for_course_async: course %s has no meeting",
            course.id,
        )
        return
    try:
        success, reason, meeting_json = update_course_meeting_policies(
            course,
            tenant,
            is_participant_update=is_participant_update,
            use_staffy_organizer=use_staffy_organizer,
        )
        if success:
            extra = (
                f" online_meeting={json.dumps(meeting_json, default=str)[:3000]}"
                if meeting_json
                else " (re-fetch after PATCH had no body)"
            )
            logger.info(
                "Updated meeting policies for course %s (%s)%s",
                course.id,
                course.title,
                extra,
            )
        else:
            logger.warning(
                "Failed to update meeting policies for course %s (%s): %s",
                course.id,
                course.title,
                reason,
            )
    except Exception as e:
        logger.exception("Error updating meeting policies for course %s: %s", course.id, e)
