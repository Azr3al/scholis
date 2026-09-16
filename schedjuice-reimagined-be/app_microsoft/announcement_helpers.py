"""
Helpers for sending announcements to Microsoft Teams channels.
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timezone as dt_timezone
from enum import Enum
from typing import Optional
from zoneinfo import ZoneInfo

from django.db.models import QuerySet

from app_announcement.models import Announcement, MicrosoftTeamsStatus, PostType
from app_course.course_month_type import (
    MONTH_TYPE_FM,
    MONTH_TYPE_HM,
    filter_queryset_by_month_type,
)
from app_course.models import Course
from app_microsoft.delegated_auth import (
    build_meeting_for_poster,
    resolve_poster,
)
from app_microsoft.graph_wrapper.base import TRANSIENT_HTTP_STATUS_CODES
from app_microsoft.graph_wrapper.meeting import MSMeeting
from app_microsoft.teams_image_content import (
    announcement_has_raster_images,
    build_image_message_batches,
    is_raster_image_filename,
)
from app_microsoft.teams_inline_html import (
    InlineTeamsBudgetError,
    announcement_has_inline_raster_images,
    build_teams_inline_body_html,
    collect_inline_hosted_bytes,
    validate_inline_teams_budget,
)
from app_organization.models import Organization
from utilitas.async_tasks import django_q_task, tenant_async

logger = logging.getLogger(__name__)

MONTH_TYPE_ALL = "ALL"
TEAMS_TRACKING_FIELDS = (
    "microsoft_teams_message_id",
    "microsoft_teams_message_ids",
    "microsoft_teams_team_id",
    "microsoft_teams_channel_id",
    "microsoft_teams_posted_as",
    "microsoft_teams_posted_by",
)
TEAMS_STATUS_FIELDS = (
    "microsoft_teams_status",
    "microsoft_teams_error",
    "microsoft_teams_synced_at",
)
MAX_TASK_ATTEMPTS = 3


class TeamsSendOutcome(str, Enum):
    SUCCESS = "success"
    PERMANENT_FAILURE = "permanent_failure"
    TRANSIENT_FAILURE = "transient_failure"
    SKIPPED = "skipped"


@dataclass(frozen=True)
class TeamsSendResult:
    outcome: TeamsSendOutcome
    detail: str | None = None

    @classmethod
    def success(cls) -> "TeamsSendResult":
        return cls(TeamsSendOutcome.SUCCESS)

    @classmethod
    def permanent(cls, detail: str | None = None) -> "TeamsSendResult":
        return cls(TeamsSendOutcome.PERMANENT_FAILURE, detail)

    @classmethod
    def transient(cls, detail: str | None = None) -> "TeamsSendResult":
        return cls(TeamsSendOutcome.TRANSIENT_FAILURE, detail)

    @classmethod
    def skipped(cls, detail: str | None = None) -> "TeamsSendResult":
        return cls(TeamsSendOutcome.SKIPPED, detail)


def tenant_teams_sync_enabled(tenant: Organization) -> bool:
    return bool(
        tenant
        and getattr(tenant, "is_microsoft_on", False)
        and getattr(tenant, "is_teams_creation_enabled", True)
    )


def filter_courses_by_course_filters(
    queryset: QuerySet[Course],
    course_filters: Optional[dict],
) -> QuerySet[Course]:
    """
    Filter courses by course_filters.
    course_filters: { category_ids?: number[], month_type: "HM" | "FM" | "ALL" }
    """
    if not course_filters:
        return queryset

    category_ids = course_filters.get("category_ids")
    month_type = course_filters.get("month_type", MONTH_TYPE_ALL)

    if category_ids is not None and len(category_ids) > 0:
        queryset = queryset.filter(category_id__in=category_ids)

    if month_type != MONTH_TYPE_ALL and month_type in (MONTH_TYPE_FM, MONTH_TYPE_HM):
        queryset = filter_queryset_by_month_type(queryset, month_type)

    return queryset


def get_courses_for_announcement(announcement: Announcement) -> QuerySet[Course]:
    """
    Get courses that should receive this announcement based on course_filters.
    If announcement has a specific course, only that course is considered (if it matches filters).
    Otherwise, all courses matching filters.
    """
    course_filters = announcement.course_filters or {"month_type": MONTH_TYPE_ALL}

    if announcement.course_id:
        queryset = Course.objects.filter(id=announcement.course_id)
    else:
        queryset = Course.objects.all()

    # Only include courses with MS Teams
    queryset = queryset.filter(
        microsoft_group_id__isnull=False
    ).exclude(microsoft_group_id="")

    return filter_courses_by_course_filters(queryset, course_filters)


def _build_announcement_text_content(announcement: Announcement) -> str:
    """Build HTML body for Teams without inline raster images."""
    content = announcement.html_data or announcement.data or ""
    attachments = list(announcement.attachments.all())
    non_image_atts = [
        a for a in attachments if not is_raster_image_filename(a.filename)
    ]

    if non_image_atts:
        attachment_lines = []
        for att in non_image_atts:
            try:
                url = att.file.url
                attachment_lines.append(
                    f'<li><a href="{url}">{att.filename}</a></li>'
                )
            except (ValueError, AttributeError):
                attachment_lines.append(f"<li>{att.filename}</li>")
        if attachment_lines:
            content += (
                "<p><strong>Attachments:</strong></p><ul>"
                + "".join(attachment_lines)
                + "</ul>"
            )

    return content or "<p>No content</p>"


_TZ_NAME_ALIASES = {
    "Asia/Rangoon": "Asia/Yangon",
}


def _format_teams_sent_at(tenant: Organization | None) -> str:
    from django.utils import timezone as dj_timezone

    now = dj_timezone.now()
    tz_name = _TZ_NAME_ALIASES.get(
        getattr(tenant, "timezone", None) or "",
        getattr(tenant, "timezone", None) or "UTC",
    )
    try:
        local = now.astimezone(ZoneInfo(tz_name))
    except Exception:
        local = now.astimezone(dt_timezone.utc)
    return local.strftime("%Y-%m-%d %H:%M:%S")


def _teams_footer(tenant: Organization | None = None) -> str:
    sent_at = _format_teams_sent_at(tenant)
    return f"<p><em>automatically sent at {sent_at}</em></p>"


def _teams_heading(announcement: Announcement) -> str:
    if announcement.post_type == PostType.DAILY_LESSON:
        if announcement.finished_unit is None:
            return "<h2>Daily lesson</h2>"
        return f"<h2>Unit {announcement.finished_unit} covered today</h2>"
    title = announcement.title or "Announcement"
    return f"<h2>{title}</h2>"


def _teams_continuation_heading(announcement: Announcement) -> str:
    if announcement.post_type == PostType.DAILY_LESSON:
        if announcement.finished_unit is None:
            return "<h2>Daily lesson (continued)</h2>"
        return (
            f"<h2>Unit {announcement.finished_unit} covered today (continued)</h2>"
        )
    title = announcement.title or "Announcement"
    return f"<h2>{title} (continued)</h2>"


def _build_teams_text_html(
    announcement: Announcement,
    tenant: Organization | None = None,
) -> str:
    content = _build_announcement_text_content(announcement)
    return f"{_teams_heading(announcement)}{content}{_teams_footer(tenant)}"


def _build_teams_message_batches(
    announcement: Announcement,
    tenant: Organization | None = None,
) -> list[tuple[str, list]]:
    if announcement_has_inline_raster_images(announcement):
        entries = collect_inline_hosted_bytes(announcement)
        err = validate_inline_teams_budget(entries)
        if err:
            raise InlineTeamsBudgetError(err)
        html, hosted = build_teams_inline_body_html(
            announcement,
            heading=_teams_heading(announcement),
            footer=_teams_footer(tenant),
        )
        return [(html, hosted)]

    attachments = list(announcement.attachments.all())
    image_atts = [a for a in attachments if is_raster_image_filename(a.filename)]
    image_batches = build_image_message_batches(image_atts)

    if not image_batches:
        return [(_build_teams_text_html(announcement, tenant), [])]

    text_html = _build_teams_text_html(announcement, tenant)
    batches: list[tuple[str, list]] = []

    for index, (img_html_parts, hosted) in enumerate(image_batches):
        if index == 0:
            html = f"{text_html}{''.join(img_html_parts)}"
        else:
            html = (
                f"{_teams_continuation_heading(announcement)}"
                f"{''.join(img_html_parts)}"
                f"{_teams_footer(tenant)}"
            )
        batches.append((html, hosted))

    return batches


def _build_teams_html(
    announcement: Announcement,
    tenant: Organization | None = None,
) -> tuple[str, list]:
    """Backward-compatible single-message view (first batch only)."""
    batches = _build_teams_message_batches(announcement, tenant)
    return batches[0]


def _is_success_response(res) -> bool:
    return res is not None and res.status_code in range(199, 300)


def _graph_failure_detail(res) -> str:
    if res is None:
        return "No response from Microsoft Graph"
    status = getattr(res, "status_code", None)
    text = (getattr(res, "text", None) or "").strip()
    if len(text) > 500:
        text = text[:500] + "…"
    return f"HTTP {status}: {text or 'request failed'}"


def _response_outcome(res) -> TeamsSendOutcome:
    if _is_success_response(res):
        return TeamsSendOutcome.SUCCESS
    status = getattr(res, "status_code", None)
    if status in TRANSIENT_HTTP_STATUS_CODES:
        return TeamsSendOutcome.TRANSIENT_FAILURE
    return TeamsSendOutcome.PERMANENT_FAILURE


def mark_teams_sync_pending(announcement: Announcement) -> None:
    announcement.microsoft_teams_status = MicrosoftTeamsStatus.PENDING
    announcement.microsoft_teams_error = None
    announcement.save(update_fields=list(TEAMS_STATUS_FIELDS))


def mark_teams_sync_sent(announcement: Announcement) -> None:
    announcement.microsoft_teams_status = MicrosoftTeamsStatus.SENT
    announcement.microsoft_teams_error = None
    announcement.microsoft_teams_synced_at = datetime.now(dt_timezone.utc)
    announcement.save(update_fields=list(TEAMS_STATUS_FIELDS))


def mark_teams_sync_failed(announcement: Announcement, error: str) -> None:
    announcement.microsoft_teams_status = MicrosoftTeamsStatus.FAILED
    announcement.microsoft_teams_error = (error or "Failed to send to Teams")[:2000]
    announcement.save(update_fields=["microsoft_teams_status", "microsoft_teams_error"])


def schedule_announcement_teams_sync(
    announcement: Announcement,
    tenant: Organization,
    *,
    force_service_account: bool = False,
) -> None:
    if not tenant or not announcement.send_to_microsoft:
        return
    mark_teams_sync_pending(announcement)
    send_announcement_to_teams_async.delay(
        announcement.id,
        tenant.schema_name,
        0,
        force_service_account,
    )


def _resolve_course_channel(meeting: MSMeeting, course: Course) -> str | None:
    channel_id = course.microsoft_channel_id
    if not channel_id:
        channel_id = meeting.get_general_channel_id(course.microsoft_group_id)
        if channel_id:
            course.microsoft_channel_id = channel_id
            course.save(update_fields=["microsoft_channel_id"])
    return channel_id


def _resolve_announcement_channel(
    meeting: MSMeeting,
    announcement: Announcement,
    course: Course,
) -> str | None:
    override = (getattr(announcement, "microsoft_channel_id", None) or "").strip()
    if override:
        return override
    return _resolve_course_channel(meeting, course)


def _store_teams_message_ids(
    announcement: Announcement,
    *,
    team_id: str,
    channel_id: str,
    message_ids: list[str],
    poster,
) -> None:
    announcement.microsoft_teams_message_ids = message_ids
    announcement.microsoft_teams_message_id = message_ids[0] if message_ids else None
    announcement.microsoft_teams_team_id = team_id
    announcement.microsoft_teams_channel_id = channel_id
    announcement.microsoft_teams_posted_as = poster.kind
    announcement.microsoft_teams_posted_by_id = poster.user_id
    announcement.microsoft_teams_status = MicrosoftTeamsStatus.SENT
    announcement.microsoft_teams_error = None
    announcement.microsoft_teams_synced_at = datetime.now(dt_timezone.utc)
    announcement.save(
        update_fields=list(TEAMS_TRACKING_FIELDS) + list(TEAMS_STATUS_FIELDS)
    )


def _get_stored_teams_message_ids(announcement: Announcement) -> list[str]:
    stored = list(getattr(announcement, "microsoft_teams_message_ids", None) or [])
    primary = (announcement.microsoft_teams_message_id or "").strip()
    if primary and primary not in stored:
        return [primary, *stored]
    if stored:
        return stored
    if primary:
        return [primary]
    return []


def _soft_delete_teams_messages(
    meeting: MSMeeting,
    team_id: str,
    channel_id: str,
    message_ids: list[str],
) -> None:
    for message_id in message_ids:
        delete_res = meeting.soft_delete_channel_message(
            team_id, channel_id, message_id
        )
        if not _is_success_response(delete_res):
            logger.warning(
                "Could not soft-delete Teams message %s: %s",
                message_id,
                getattr(delete_res, "status_code", None),
            )


def _extract_message_id(res) -> str | None:
    if not _is_success_response(res):
        return None
    try:
        return res.json().get("id")
    except (AttributeError, ValueError, TypeError):
        return None


def _post_batches_and_store(
    meeting: MSMeeting,
    announcement: Announcement,
    *,
    team_id: str,
    channel_id: str,
    batches: list[tuple[str, list]],
    poster,
) -> tuple[list[str], TeamsSendResult]:
    new_ids: list[str] = []

    for html, hosted in batches:
        res = meeting.post_channel_message(
            team_id=team_id,
            channel_id=channel_id,
            content=html,
            content_type="html",
            hosted_contents=hosted or None,
        )
        message_id = _extract_message_id(res)
        if message_id:
            new_ids.append(message_id)
            continue

        detail = _graph_failure_detail(res)
        logger.warning(
            "Failed to post announcement %s batch to Teams after %s success(es): %s",
            announcement.id,
            len(new_ids),
            detail,
        )
        if new_ids:
            _soft_delete_teams_messages(meeting, team_id, channel_id, new_ids)
        return [], TeamsSendResult(_response_outcome(res), detail)

    _store_teams_message_ids(
        announcement,
        team_id=team_id,
        channel_id=channel_id,
        message_ids=new_ids,
        poster=poster,
    )
    logger.info(
        "Posted announcement %s to Teams team=%s channel=%s messages=%s",
        announcement.id,
        team_id,
        channel_id,
        new_ids,
    )
    return new_ids, TeamsSendResult.success()


def _post_channel_message_and_store(
    meeting: MSMeeting,
    announcement: Announcement,
    *,
    team_id: str,
    channel_id: str,
    html: str,
    hosted_contents: list | None = None,
    poster=None,
) -> TeamsSendResult:
    batches = [(html, hosted_contents or [])]
    _new_ids, result = _post_batches_and_store(
        meeting,
        announcement,
        team_id=team_id,
        channel_id=channel_id,
        batches=batches,
        poster=poster,
    )
    return result


def sync_course_announcement_to_teams(
    announcement: Announcement,
    tenant: Organization,
    course: Course,
    meeting: MSMeeting,
    poster,
) -> TeamsSendResult:
    """Create or update a single course feed post in the course Team channel."""
    team_id = course.microsoft_group_id
    if not team_id:
        logger.warning(
            "Announcement %s: course %s has no microsoft_group_id",
            announcement.id,
            course.id,
        )
        return TeamsSendResult.permanent(
            f"Course {course.id} has no microsoft_group_id"
        )

    channel_id = _resolve_announcement_channel(meeting, announcement, course)
    if not channel_id:
        logger.warning(
            "Announcement %s: could not resolve channel for course %s",
            announcement.id,
            course.id,
        )
        return TeamsSendResult.permanent(
            f"Could not resolve Teams channel for course {course.id}"
        )

    try:
        batches = _build_teams_message_batches(announcement, tenant)
    except InlineTeamsBudgetError as exc:
        return TeamsSendResult.permanent(str(exc))

    has_images = announcement_has_raster_images(announcement)
    stored_ids = _get_stored_teams_message_ids(announcement)
    stored_team_id = announcement.microsoft_teams_team_id
    stored_channel_id = announcement.microsoft_teams_channel_id

    can_patch = (
        stored_ids
        and stored_team_id
        and stored_channel_id
        and not has_images
        and len(batches) == 1
        and poster.matches_stored(announcement)
    )

    if can_patch:
        html, _hosted = batches[0]
        patch_res = meeting.patch_channel_message(
            team_id=stored_team_id,
            channel_id=stored_channel_id,
            message_id=stored_ids[0],
            content=html,
            content_type="html",
        )
        if _is_success_response(patch_res):
            mark_teams_sync_sent(announcement)
            logger.info(
                "Updated Teams message %s for announcement %s",
                stored_ids[0],
                announcement.id,
            )
            return TeamsSendResult.success()

        logger.warning(
            "PATCH failed for announcement %s message %s (%s); posting replacement",
            announcement.id,
            stored_ids[0],
            getattr(patch_res, "status_code", None),
        )

    if stored_ids and stored_team_id and stored_channel_id:
        old_team_id = stored_team_id
        old_channel_id = stored_channel_id
        old_message_ids = stored_ids
        identity_matches = poster.matches_stored(announcement)

        _new_ids, result = _post_batches_and_store(
            meeting,
            announcement,
            team_id=team_id,
            channel_id=channel_id,
            batches=batches,
            poster=poster,
        )
        if result.outcome == TeamsSendOutcome.SUCCESS and identity_matches:
            _soft_delete_teams_messages(
                meeting, old_team_id, old_channel_id, old_message_ids
            )
        elif result.outcome == TeamsSendOutcome.SUCCESS and not identity_matches:
            logger.warning(
                "Announcement %s: posted replacement Teams message; "
                "skipped soft-delete of %s old message(s) (posting identity changed)",
                announcement.id,
                len(old_message_ids),
            )
        return result

    _new_ids, result = _post_batches_and_store(
        meeting,
        announcement,
        team_id=team_id,
        channel_id=channel_id,
        batches=batches,
        poster=poster,
    )
    return result


def send_announcement_to_teams(
    announcement: Announcement,
    tenant: Organization,
    *,
    force_service_account: bool = False,
) -> TeamsSendResult:
    """
    Send an announcement to matching courses' MS Teams channels.
    Course-scoped posts use create/update lifecycle; org-wide posts broadcast to many courses.
    """
    logger.info(
        "send_announcement_to_teams: announcement_id=%s, tenant=%s, is_microsoft_on=%s, send_to_microsoft=%s",
        announcement.id,
        tenant.schema_name,
        tenant.is_microsoft_on,
        announcement.send_to_microsoft,
    )
    if not tenant.is_microsoft_on:
        logger.warning(
            "Announcement %s: skipping Teams send - tenant %s has is_microsoft_on=False",
            announcement.id,
            tenant.schema_name,
        )
        return TeamsSendResult.permanent("Tenant Microsoft integration is off")
    if not announcement.send_to_microsoft:
        logger.warning(
            "Announcement %s: skipping Teams send - send_to_microsoft=False",
            announcement.id,
        )
        return TeamsSendResult.skipped()

    courses = get_courses_for_announcement(announcement)
    course_count = courses.count()
    if course_count == 0:
        total_with_teams = Course.objects.filter(
            microsoft_group_id__isnull=False
        ).exclude(microsoft_group_id="").count()
        logger.warning(
            "Announcement %s: no courses match filters. course_filters=%s, total_courses_with_teams=%s",
            announcement.id,
            announcement.course_filters,
            total_with_teams,
        )
        return TeamsSendResult.permanent(
            "No courses with Teams match filters"
        )

    poster, poster_err = resolve_poster(
        announcement, tenant, force_service_account=force_service_account
    )
    if poster is None:
        return TeamsSendResult.permanent(poster_err)

    try:
        meeting = build_meeting_for_poster(tenant, poster)
    except ValueError as e:
        logger.warning(
            "Announcement %s: MS Graph auth failed for tenant %s: %s",
            announcement.id,
            tenant.schema_name,
            e,
        )
        return TeamsSendResult.permanent(str(e))
    except Exception as e:
        from app_microsoft.oauth import MicrosoftOAuthError

        if isinstance(e, MicrosoftOAuthError):
            return TeamsSendResult.permanent(str(e))
        raise

    if announcement.course_id:
        if not tenant_teams_sync_enabled(tenant):
            logger.warning(
                "Announcement %s: skipping Teams send - tenant Teams sync disabled",
                announcement.id,
            )
            return TeamsSendResult.permanent("Tenant Teams sync is disabled")
        course = courses.first()
        if not course:
            return TeamsSendResult.permanent("Course not found")
        return sync_course_announcement_to_teams(
            announcement, tenant, course, meeting, poster
        )

    logger.info(
        "Announcement %s: posting to %s course(s). course_ids=%s",
        announcement.id,
        course_count,
        list(courses.values_list("id", flat=True)),
    )
    try:
        batches = _build_teams_message_batches(announcement, tenant)
    except InlineTeamsBudgetError as exc:
        return TeamsSendResult.permanent(str(exc))

    any_success = False
    any_transient = False
    any_permanent = False
    last_detail: str | None = None

    for course in courses:
        try:
            channel_id = _resolve_course_channel(meeting, course)
            if not channel_id:
                logger.warning(f"Could not get channel for course {course.id}")
                any_permanent = True
                last_detail = f"Could not resolve Teams channel for course {course.id}"
                continue

            course_had_failure = False
            for html, hosted in batches:
                res = meeting.post_channel_message(
                    team_id=course.microsoft_group_id,
                    channel_id=channel_id,
                    content=html,
                    content_type="html",
                    hosted_contents=hosted or None,
                )
                if _is_success_response(res):
                    any_success = True
                    continue

                course_had_failure = True
                outcome = _response_outcome(res)
                last_detail = _graph_failure_detail(res)
                if outcome == TeamsSendOutcome.TRANSIENT_FAILURE:
                    any_transient = True
                else:
                    any_permanent = True
                logger.warning(
                    "Failed to post announcement to course %s: %s",
                    course.id,
                    last_detail,
                )
                break

            if not course_had_failure:
                logger.info(
                    "Posted announcement %s to course %s Teams (%s message(s))",
                    announcement.id,
                    course.id,
                    len(batches),
                )
        except Exception as e:
            any_permanent = True
            last_detail = f"{type(e).__name__}: {e}"
            logger.exception(f"Error posting announcement to course {course.id}: {e}")

    if any_success:
        announcement.microsoft_teams_posted_as = poster.kind
        announcement.microsoft_teams_posted_by_id = poster.user_id
        announcement.save(
            update_fields=[
                "microsoft_teams_posted_as",
                "microsoft_teams_posted_by",
                "updated_at",
            ]
        )
        mark_teams_sync_sent(announcement)
        return TeamsSendResult.success()
    if any_transient:
        return TeamsSendResult.transient(last_detail)
    if any_permanent:
        return TeamsSendResult.permanent(last_detail)
    return TeamsSendResult.skipped()


def _failure_message_for_result(result: TeamsSendResult, *, attempt: int) -> str:
    detail = (result.detail or "").strip()
    if result.outcome == TeamsSendOutcome.TRANSIENT_FAILURE:
        prefix = f"Microsoft Teams delivery failed after {attempt + 1} attempt(s)"
        message = f"{prefix}: {detail}" if detail else prefix
    elif result.outcome == TeamsSendOutcome.PERMANENT_FAILURE:
        prefix = "Could not send to Microsoft Teams"
        message = f"{prefix}: {detail}" if detail else prefix
    else:
        message = detail or "Teams sync skipped"
    return message[:2000]


def resend_announcement_to_teams_sync(
    announcement: Announcement,
    tenant: Organization,
    *,
    force_service_account: bool = False,
) -> TeamsSendResult:
    """Synchronous Teams resend (no django-q retries)."""
    mark_teams_sync_pending(announcement)
    try:
        result = send_announcement_to_teams(
            announcement,
            tenant,
            force_service_account=force_service_account,
        )
    except ValueError as exc:
        result = TeamsSendResult.permanent(str(exc))
    except Exception as exc:
        result = TeamsSendResult.transient(f"{type(exc).__name__}: {exc}")

    if result.outcome != TeamsSendOutcome.SUCCESS:
        mark_teams_sync_failed(
            announcement,
            _failure_message_for_result(result, attempt=0),
        )
    return result


@django_q_task
@tenant_async(entity=Announcement)
def send_announcement_to_teams_async(
    announcement, tenant, attempt=0, force_service_account=False
):
    """Async wrapper for send_announcement_to_teams."""
    logger.info(
        "send_announcement_to_teams_async: announcement_id=%s, schema_name=%s, "
        "attempt=%s, force_service_account=%s",
        announcement.id,
        tenant.schema_name,
        attempt,
        force_service_account,
    )
    try:
        result = send_announcement_to_teams(
            announcement,
            tenant,
            force_service_account=force_service_account,
        )
    except ValueError as e:
        logger.warning(
            "send_announcement_to_teams_async: MS Graph auth failed for announcement_id=%s, schema=%s: %s",
            announcement.id,
            tenant.schema_name,
            e,
        )
        result = TeamsSendResult.permanent(str(e))
    except Exception as e:
        logger.exception(
            "send_announcement_to_teams_async: failed for announcement_id=%s, schema=%s: %s",
            announcement.id,
            tenant.schema_name,
            e,
        )
        result = TeamsSendResult.transient(f"{type(e).__name__}: {e}")

    if result.outcome == TeamsSendOutcome.SUCCESS:
        return
    if result.outcome == TeamsSendOutcome.SKIPPED:
        return

    if (
        result.outcome == TeamsSendOutcome.TRANSIENT_FAILURE
        and attempt + 1 < MAX_TASK_ATTEMPTS
    ):
        logger.warning(
            "Re-enqueueing Teams sync for announcement %s (attempt %s/%s)",
            announcement.id,
            attempt + 2,
            MAX_TASK_ATTEMPTS,
        )
        send_announcement_to_teams_async.delay(
            announcement.id,
            tenant.schema_name,
            attempt + 1,
            force_service_account,
        )
        return

    mark_teams_sync_failed(
        announcement,
        _failure_message_for_result(result, attempt=attempt),
    )
