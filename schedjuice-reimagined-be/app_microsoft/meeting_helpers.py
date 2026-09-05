"""
Helpers for creating and managing Microsoft Teams meetings for courses.
"""

import json
import logging

from rest_framework.exceptions import ValidationError

from app_course.models import Course, UserCourse
from app_course.teams_organizer import get_course_teams_organizer_user
from app_microsoft.graph_wrapper.base import (
    graph_user_id_for_delegated_staffy_token,
    staffy_delegated_graph_principal,
)
from app_microsoft.graph_wrapper.meeting import MSMeeting
from app_organization.models import Organization
from utilitas.async_tasks import django_q_task, tenant_async

logger = logging.getLogger(__name__)


def graph_organizer_user_id_for_course(
    course: Course, tenant: Organization
) -> str | None:
    """
    Azure AD object id for Graph /users/{id}/... (meetings, OneDrive, attendance, etc.).

    Order: persisted ``microsoft_meeting_organizer_id`` (canonical Graph owner), then the
    course primary teacher with ``microsoft_id`` (same rule as ``get_course_teams_organizer_user``).

    Returns None if neither is available — callers must return 400, skip the job, or fail explicitly.
    The ``tenant`` argument is kept for call-site consistency; resolution is course-scoped only.
    """
    _ = tenant
    stored = (course.microsoft_meeting_organizer_id or "").strip()
    if stored:
        return stored
    u = get_course_teams_organizer_user(course)
    if u and u.microsoft_id:
        raw = u.microsoft_id
        ms = raw.strip() if isinstance(raw, str) else str(raw).strip()
        return ms or None
    return None


def _course_teachers_email_and_microsoft_id(course: Course) -> list[dict[str, object | None]]:
    """
    All active course teachers: Schedjuice user id, email, and Entra object id (if linked).
    Used when GET onlineMeeting fails to debug organizer vs roster mismatch.
    """
    rows: list[dict[str, object | None]] = []
    for uc in (
        UserCourse.objects.filter(
            course=course,
            assigned_as=UserCourse.AssignedAs.TEACHER,
        )
        .select_related("user", "assigned_as_role")
        .order_by("id")
    ):
        u = uc.user
        if u is None:
            continue
        role_name = None
        if uc.assigned_as_role_id and uc.assigned_as_role is not None:
            role_name = str(uc.assigned_as_role.seniority)
        email = (getattr(u, "email", None) or "") or None
        if email:
            email = email.strip() or None
        mid = u.microsoft_id
        if mid is not None and str(mid).strip() != "":
            ms = str(mid).strip()
        else:
            ms = None
        rows.append(
            {
                "user_id": u.pk,
                "email": email,
                "microsoft_id": ms,
                "role_seniority": role_name,
            }
        )
    return rows


def meeting_organizer_mismatch_debug_for_fetch(
    course: Course,
    tenant: Organization,
    *,
    graph_user_id_used: str,
    use_staffy_organizer: bool,
) -> dict:
    """
    JSON-safe context when GET /users/{id}/onlineMeetings/{id} failed (wrong /users/ path, etc.):
    every teacher's email + microsoft_id, course organizer fields, org default owner id,
    and the delegated (staffy) Graph principal.
    """
    resolved = graph_organizer_user_id_for_course(course, tenant)
    gu = (graph_user_id_used or "").strip()
    rslv = (resolved or "").strip() if resolved else None
    stored = (course.microsoft_meeting_organizer_id or "").strip() or None
    default_owner = (getattr(tenant, "default_owner_id", None) or "").strip() or None
    return {
        "graph_user_id_used_for_get": gu or None,
        "use_staffy_organizer": use_staffy_organizer,
        "graph_token_principal": staffy_delegated_graph_principal(tenant),
        "organization_default_owner_microsoft_id": default_owner,
        "meeting_organizer": {
            "course_microsoft_meeting_organizer_id": stored,
            "resolved_organizer_microsoft_id": rslv,
        },
        "mismatch_hint": _organizer_mismatch_compare_hint(
            gu, rslv, use_staffy_organizer, tenant
        ),
        "course_teachers": _course_teachers_email_and_microsoft_id(course),
    }


def _organizer_mismatch_compare_hint(
    graph_user_id_for_get: str,
    resolved_organizer_id: str | None,
    use_staffy_organizer: bool,
    tenant: Organization,
) -> str | None:
    """One-line summary when the GET /users/ id is unlikely to be the real meeting owner."""
    g = (graph_user_id_for_get or "").strip()
    r = (resolved_organizer_id or "").strip() if resolved_organizer_id else None
    staffy_oid = (graph_user_id_for_delegated_staffy_token(tenant) or "").strip()
    if use_staffy_organizer:
        if g and staffy_oid and g.casefold() == staffy_oid.casefold():
            return (
                "GET is forced to staffy’s id. If Graph still fails, the online meeting is likely owned by "
                "a teacher; omit use_staffy_organizer (default path uses the course’s resolved organizer id)."
            )
        return None
    if r and g and g.casefold() != r.casefold():
        return (
            "The id used for GET /users/…/onlineMeetings/… differs from resolved_organizer (unexpected after "
            "per-course resolution); check org default owner fallback and course data."
        )
    if not r:
        return (
            "No resolved organizer: set course.microsoft_meeting_organizer_id or link a main teacher with microsoft_id; "
            "or set organization default owner as fallback for GET."
        )
    return None


def _safe_graph_response_body(res) -> dict | list | str | None:
    """Parse Graph error JSON or return truncated text for debug payloads."""
    if res is None:
        return None
    try:
        return res.json()
    except Exception:
        text = getattr(res, "text", None) or ""
        return text[:1200] if text else None


def teams_meeting_graph_error_debug_payload(
    course: Course,
    tenant: Organization,
    *,
    graph_user_id_used: str | None = None,
    use_staffy_organizer: bool = False,
    graph_status_code: int | None = None,
    graph_operation: str | None = None,
    is_participant_update: bool | None = None,
) -> dict:
    """
    JSON-serializable context for staff debugging (Graph 403, wrong organizer, etc.).
    Safe for API responses on authenticated staff endpoints — no tokens or secrets.
    """
    teacher = get_course_teams_organizer_user(course)
    primary = None
    if teacher:
        primary = {
            "user_id": teacher.pk,
            "microsoft_id": teacher.microsoft_id or None,
        }
    resolved = graph_organizer_user_id_for_course(course, tenant)
    payload: dict = {
        "course_id": course.id,
        "tenant_schema": getattr(tenant, "schema_name", None),
        "microsoft_meeting_id": course.microsoft_meeting_id or None,
        "microsoft_meeting_organizer_id": course.microsoft_meeting_organizer_id or None,
        "meeting_scheduled_at": (
            course.meeting_scheduled_at.isoformat()
            if course.meeting_scheduled_at
            else None
        ),
        "microsoft_calendar_event_id": course.microsoft_calendar_event_id or None,
        "resolved_graph_organizer_user_id": resolved,
        "graph_user_id_used_for_request": graph_user_id_used,
        "use_staffy_organizer": use_staffy_organizer,
        "primary_teacher": primary,
        "graph_http_status": graph_status_code,
        "graph_operation": graph_operation,
    }
    if is_participant_update is not None:
        payload["policy_update_participants_only"] = is_participant_update
    return payload


def _raise_teams_graph_validation_error(
    course: Course,
    tenant: Organization,
    *,
    organizer_id_used: str,
    res,
    operation: str,
) -> None:
    """Raise ValidationError with a short message plus teams_meeting_debug for HTTP clients."""
    debug = teams_meeting_graph_error_debug_payload(
        course,
        tenant,
        graph_user_id_used=organizer_id_used,
        graph_status_code=res.status_code,
        graph_operation=operation,
    )
    debug["graph_error_body"] = _safe_graph_response_body(res)
    user_msg = None
    body = debug.get("graph_error_body")
    if isinstance(body, dict):
        err = body.get("error")
        if isinstance(err, dict) and err.get("message"):
            user_msg = str(err["message"])
    if not user_msg:
        user_msg = f"Microsoft Graph request failed ({res.status_code})."
    raise ValidationError(
        {
            "MS_MEETING_ERROR": user_msg,
            "teams_meeting_debug": debug,
        }
    )


def schedule_update_course_meeting_attendees(course, tenant):
    """
    Schedule async update of meeting attendees (e.g. when new teacher added).
    Updates the course's MS meeting so the new teacher gets co-organizer role.

    Runs both participant and policy PATCHes (is_participant_update=None) because
    Graph resets lobbyBypassSettings / allowBreakoutRooms / allowedPresenters to
    tenant defaults when only participants.attendees is PATCHed.
    """
    if not tenant.is_microsoft_on:
        return
    if not course.microsoft_meeting_id:
        return
    from app_tasks.update_meeting_policies_helpers import (
        update_meeting_policies_for_course_async,
    )

    update_meeting_policies_for_course_async.delay(course.id, tenant.schema_name)


def _post_meeting_to_channel(meeting, course, join_url, subject):
    """Post meeting link to the General channel (default, visible channel). Save channel ID to course."""
    general_channel_id = meeting.get_general_channel_id(course.microsoft_group_id)
    if not general_channel_id:
        raise ValueError("Could not find General channel for this team.")
    content = (
        f'<h2>📅 {subject}</h2>'
        f'<p><a href="{join_url}">Join Microsoft Teams Meeting</a></p>'
        f'<p>--------------------------------</p>'
        f'<p>Automatically generated by SuConnect</p>'
    )
    res = meeting.post_channel_message(
        team_id=course.microsoft_group_id,
        channel_id=general_channel_id,
        content=content,
    )
    if res.status_code in range(199, 300):
        course.microsoft_channel_id = general_channel_id
        course.save()
    return res


def update_course_meeting_policies(
    course, tenant, is_participant_update=None, *, use_staffy_organizer=False
):
    """
    Update an existing meeting via PATCH.  Does not create a new meeting.

    is_participant_update controls what is sent in the payload:
      True  – only participants (teachers as co-organizers)
      False – only policy settings (lobby, breakout rooms, presenters)
      None  – run both updates as two separate PATCH calls (participants then policies)

    use_staffy_organizer: If True, Graph ``user_id`` is the delegated staffy principal
    (``STAFFY_AZURE_OBJECT_ID``) instead of ``graph_organizer_user_id_for_course``. Use when
    the meeting was created under staffy but roster points at a different organizer.

    Returns (success: bool, reason: str | None, meeting_json: dict | None). After a successful PATCH,
    meeting_json is the full online meeting from a follow-up GET. None if the GET failed (PATCH still
    applied) or the call failed. If ``is_participant_update`` is None, meeting_json is from after the
    policy PATCH.
    """
    if not course.microsoft_meeting_id:
        return False, "course has no microsoft_meeting_id", None
    effective_staffy = use_staffy_organizer
    organizer_id = (
        graph_user_id_for_delegated_staffy_token(tenant)
        if effective_staffy
        else graph_organizer_user_id_for_course(course, tenant)
    )
    if not organizer_id:
        return (
            False,
            "no Graph meeting organizer: set microsoft_meeting_organizer_id on the course or "
            "assign a primary teacher with a Microsoft-linked account",
            None,
        )
    if tenant.app_id and organizer_id == tenant.app_id:
        reason = (
            "organizer id equals app_id — it must be a user's "
            "Azure AD object ID (Entra > Users > Object ID), not the Application (client) ID"
        )
        logger.warning(reason)
        return False, reason, None

    if is_participant_update is None:
        logger.warning(
            "update_course_meeting_policies called with is_participant_update=None for course_id=%s; "
            "running split participant and policy PATCH calls",
            course.id,
        )
        participants_success, participants_reason, _m1 = update_course_meeting_policies(
            course, tenant, is_participant_update=True, use_staffy_organizer=use_staffy_organizer
        )
        policies_success, policies_reason, m2 = update_course_meeting_policies(
            course, tenant, is_participant_update=False, use_staffy_organizer=use_staffy_organizer
        )
        if participants_success and policies_success:
            return True, None, m2

        reasons = []
        if not participants_success:
            reasons.append(f"participants: {participants_reason}")
        if not policies_success:
            reasons.append(f"policies: {policies_reason}")
        return False, "; ".join(reasons), None

    include_participants = is_participant_update is True
    include_policies = is_participant_update is False

    attendees = None
    if include_participants:
        attendees = []
        for uc in UserCourse.objects.filter(
            course=course,
            assigned_as=UserCourse.AssignedAs.TEACHER,
        ).select_related("user"):
            u = uc.user
            if u.microsoft_id and u.microsoft_id != organizer_id and u.email:
                attendees.append({"microsoft_id": u.microsoft_id, "upn": u.email})
        if not attendees:
            attendees = None

    meeting = MSMeeting(tenant, use_app_auth=True)
    res = meeting.update_online_meeting(
        user_id=organizer_id,
        meeting_id=course.microsoft_meeting_id,
        lobby_bypass_scope="invited" if include_policies else None,
        allow_breakout_rooms=True if include_policies else None,
        attendees=attendees,
        allowed_presenters="organizerAndCoOrganizers" if include_policies else None,
    )
    if (
        include_policies
        and res.status_code == 400
        and "onlineMeetingUserRequest" in (res.text or "")
    ):
        # Some tenants reject organizerAndCoOrganizers, but still accept lobby/breakout updates.
        logger.warning(
            "allowedPresenters=organizerAndCoOrganizers rejected for course_id=%s; retrying policy PATCH without allowedPresenters",
            course.id,
        )
        res = meeting.update_online_meeting(
            user_id=organizer_id,
            meeting_id=course.microsoft_meeting_id,
            lobby_bypass_scope="invited",
            allow_breakout_rooms=True,
            attendees=None,
            allowed_presenters=None,
        )
    if res.status_code not in range(199, 300):
        reason = f"Graph API {res.status_code}: {res.text[:500] if res.text else '(empty)'}"
        debug = teams_meeting_graph_error_debug_payload(
            course,
            tenant,
            graph_user_id_used=organizer_id,
            use_staffy_organizer=effective_staffy,
            graph_status_code=res.status_code,
            graph_operation="update_online_meeting",
            is_participant_update=include_participants,
        )
        debug["graph_error_body"] = _safe_graph_response_body(res)
        logger.warning(
            "update_course_meeting_policies failed: status=%s body=%s teams_meeting_debug=%s",
            res.status_code,
            res.text[:500] if res.text else "(empty)",
            json.dumps(debug, default=str),
        )
        return False, reason, None
    refreshed, get_err = meeting.get_online_meeting_or_error(organizer_id, course.microsoft_meeting_id)
    if not refreshed:
        logger.warning(
            "update_course_meeting_policies: PATCH ok but re-fetch online meeting failed: %s",
            get_err,
        )
    return True, None, refreshed


def post_meeting_link_to_channel(course, tenant):
    """
    Programmatically post the meeting link to a course's Teams General channel.
    Requires: course.microsoft_group_id, course.meeting_link
    """
    if not course.microsoft_group_id:
        raise ValueError("Course must have Microsoft Teams group configured.")
    if not course.meeting_link:
        raise ValueError("Course must have a meeting link. Create the meeting first.")
    subject = f"{course.title} - {course.code or ''}".strip()
    meeting = MSMeeting(tenant)
    return _post_meeting_to_channel(meeting, course, course.meeting_link, subject)


@django_q_task
@tenant_async(entity=Course)
def post_meeting_link_to_channel_async(course, tenant):
    """Async wrapper for post_meeting_link_to_channel."""
    try:
        res = post_meeting_link_to_channel(course, tenant)
        if res.status_code in range(199, 300):
            logger.info(
                "Meeting link posted to channel for course %s (id=%s)",
                course.title,
                course.id,
            )
        else:
            logger.error(
                "Failed to post meeting link for course %s: %s - %s",
                course.id,
                res.status_code,
                res.text,
            )
    except Exception as e:
        logger.exception(
            "Error posting meeting link to channel for course %s: %s",
            course.id,
            e,
        )


