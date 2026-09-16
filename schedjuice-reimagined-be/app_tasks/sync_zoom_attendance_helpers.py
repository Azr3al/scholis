"""
Sync Zoom meeting participants (Reports and/or Past Meeting APIs) into UserAttendance.
Teachers are matched by User.zoom_user_identifier against Zoom participant user_email / user_id / id.
"""

from __future__ import annotations

import logging
from datetime import datetime

import pytz
from django.db import transaction
from django.utils import timezone
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_course.models import (
    Course,
    ProcessedVideoAttendanceReport,
    UserAttendance,
    UserCourse,
    VideoAttendanceSource,
)
from app_course.rate_utils import get_hourly_rate_for_teacher_course
from app_organization.models import Organization, ZoomAccount
from app_zoom.client import (
    get_meeting,
    list_past_meeting_instances,
    list_past_meeting_participants,
    list_report_meeting_participants,
    zoom_participants_fingerprint,
)
from utilitas.async_tasks import django_q_task, tenant_async

logger = logging.getLogger(__name__)


def _norm_zoom_key(value: str | None) -> str:
    return (value or "").strip().lower()


def _participant_zoom_keys(participant: dict) -> list[str]:
    """Normalized keys from Zoom report participant row (email, user_id, id)."""
    keys: list[str] = []
    email = (participant.get("user_email") or "").strip()
    if email:
        keys.append(_norm_zoom_key(email))
    for fld in ("user_id", "id"):
        v = participant.get(fld)
        if v is None:
            continue
        s = str(v).strip()
        if s:
            keys.append(_norm_zoom_key(s))
    seen: set[str] = set()
    out: list[str] = []
    for k in keys:
        if k and k not in seen:
            seen.add(k)
            out.append(k)
    return out


def _teachers_by_zoom_identifier(teacher_users) -> dict[str, object]:
    """
    Map normalized lookup keys -> User (teachers on this course).

    Keys: ``zoom_user_identifier`` when set, plus ``email`` and ``communication_email``
    (normalized) so Zoom participant ``user_email`` matches without a separate Zoom id field.
    """
    m: dict[str, object] = {}
    for u in teacher_users:
        keys: list[str] = []
        z = _norm_zoom_key(getattr(u, "zoom_user_identifier", None))
        if z:
            keys.append(z)
        for attr in ("email", "communication_email"):
            raw = getattr(u, attr, None)
            k = _norm_zoom_key(raw if isinstance(raw, str) else None)
            if k:
                keys.append(k)
        seen: set[str] = set()
        for k in keys:
            if k and k not in seen:
                seen.add(k)
                m[k] = u
    return m


def _instance_uuids_newest_first(instances: list[dict]) -> list[str]:
    """Ordered unique instance UUIDs (newest ``start_time`` first)."""
    rows: list[tuple[str, str]] = []
    for inst in instances:
        u = (inst.get("uuid") or "").strip()
        if not u:
            continue
        rows.append((str(inst.get("start_time") or ""), u))
    rows.sort(key=lambda x: x[0], reverse=True)
    seen: set[str] = set()
    out: list[str] = []
    for _, u in rows:
        if u not in seen:
            seen.add(u)
            out.append(u)
    return out


def _parse_zoom_datetime(dt_str):
    """Parse Zoom ISO datetime; truncate fractional seconds to 6 digits for fromisoformat."""
    if not dt_str:
        return None
    try:
        s = dt_str.replace("Z", "+00:00")
        if "." in s:
            dot_idx = s.index(".")
            rest = s[dot_idx + 1 :]
            digit_end = 0
            while digit_end < len(rest) and rest[digit_end].isdigit():
                digit_end += 1
            if digit_end > 6:
                s = s[: dot_idx + 1 + 6] + rest[digit_end:]
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = timezone.make_aware(dt)
        return dt
    except (ValueError, TypeError):
        return None


def _course_zoom_account(course: Course, tenant: Organization) -> ZoomAccount | None:
    aid = (course.zoom_account_id or "").strip()
    if not aid:
        return None
    with schema_context(get_public_schema_name()):
        za = (
            ZoomAccount.objects.filter(
                organization=tenant,
                account_id=aid,
                status=ZoomAccount.Status.ACTIVE,
            )
            .first()
        )
    return za


@django_q_task
@tenant_async(entity=Course)
def sync_zoom_attendance_for_course_async(course, tenant):
    try:
        count = sync_zoom_attendance_for_course(course, tenant)
        if count > 0:
            logger.info(
                "Course %s (%s): %s Zoom attendance record(s)",
                course.id,
                course.title,
                count,
            )
    except Exception as e:
        logger.exception("Error syncing Zoom attendance for course %s: %s", course.id, e)


def course_eligible_for_zoom_attendance_sync(course: Course, tenant: Organization) -> bool:
    """True when this course row may be passed to ``sync_zoom_attendance_for_course``."""
    if tenant.video_conferencing_platform != Organization.VideoConferencingPlatform.ZOOM:
        return False
    zmid = (course.zoom_meeting_id or "").strip()
    if not zmid:
        return False
    if course.zoom_meeting_source == Course.ZoomMeetingSource.PERSONAL:
        if course.zoom_personal_user_id is None:
            return False
        from app_auth.models_user_zoom_oauth import UserZoomOAuth

        uzo = UserZoomOAuth.objects.filter(
            user_id=course.zoom_personal_user_id,
        ).first()
        return bool(
            uzo and uzo.status == UserZoomOAuth.Status.ACTIVE
        )
    return bool((course.zoom_account_id or "").strip()) and tenant.has_active_zoom_account()


def sync_zoom_attendance_for_course(course: Course, tenant: Organization) -> int:
    if not course_eligible_for_zoom_attendance_sync(course, tenant):
        logger.debug(
            "Course %s: skip Zoom — not eligible for OAuth attendance sync",
            course.id,
        )
        return 0
    zmid = (course.zoom_meeting_id or "").strip()

    if course.zoom_meeting_source == Course.ZoomMeetingSource.PERSONAL:
        from app_auth.models_user_zoom_oauth import UserZoomOAuth

        uzo = UserZoomOAuth.objects.filter(
            user_id=course.zoom_personal_user_id,
        ).first()
        if not uzo or uzo.status != UserZoomOAuth.Status.ACTIVE:
            logger.debug(
                "Course %s: skip Zoom — personal teacher has no active Zoom OAuth",
                course.id,
            )
            return 0
        cred = uzo
    else:
        za = _course_zoom_account(course, tenant)
        if za is None:
            logger.debug(
                "Course %s: skip Zoom — set course.zoom_account_id to a connected Zoom account",
                course.id,
            )
            return 0
        cred = za

    if course.zoom_meeting_source == Course.ZoomMeetingSource.PERSONAL:
        # User-managed OAuth: prefer Meeting APIs (past instances + participants).
        # Requires ``meeting:read:list_past_instances`` plus
        # ``meeting:read:list_past_participants`` on the Marketplace app — without
        # list_past_instances, only a single cached UUID may work (second sessions
        # need per-occurrence instance UUIDs). Report API is attempted last for
        # tokens that have Report scopes (e.g. some school-admin flows).
        instances = list_past_meeting_instances(cred, zmid)
        uuid_candidates: list[str] = _instance_uuids_newest_first(instances)

        meeting_row = get_meeting(cred, zmid) or {}
        gm_uuid = (str(meeting_row.get("uuid") or "")).strip()
        if gm_uuid and gm_uuid not in uuid_candidates:
            uuid_candidates.append(gm_uuid)

        u_store = (course.zoom_meeting_uuid or "").strip()
        if u_store and u_store not in uuid_candidates:
            uuid_candidates.append(u_store)

        if not uuid_candidates:
            logger.info(
                "Course %s: personal Zoom — no meeting UUID candidates. "
                "If the Zoom app lacks meeting:read:list_past_instances, add it "
                "in Marketplace and reconnect personal Zoom.",
                course.id,
            )

        participants: list[dict] = []
        fingerprint_key = zmid

        processed_qs = ProcessedVideoAttendanceReport.objects.filter(
            course=course,
            platform=VideoAttendanceSource.ZOOM,
        )
        for cand in uuid_candidates:
            parts, _pmeta = list_past_meeting_participants(cred, cand)
            if not parts:
                continue
            fk = f"{zmid}:{cand}"
            fp = zoom_participants_fingerprint(fk, parts)
            if processed_qs.filter(external_report_id=fp).exists():
                continue
            participants = parts
            fingerprint_key = fk
            break

        if not participants:
            parts_rep, _rmeta = list_report_meeting_participants(cred, zmid)
            if parts_rep:
                fk = zmid
                fp = zoom_participants_fingerprint(fk, parts_rep)
                if not processed_qs.filter(external_report_id=fp).exists():
                    participants = parts_rep
                    fingerprint_key = fk

    else:
        participants, _rmeta = list_report_meeting_participants(cred, zmid)
        fingerprint_key = zmid

    if not participants:
        logger.info("Course %s: Zoom participants list empty", course.id)
        return 0

    fingerprint = zoom_participants_fingerprint(fingerprint_key, participants)
    already = ProcessedVideoAttendanceReport.objects.filter(
        course=course,
        platform=VideoAttendanceSource.ZOOM,
        external_report_id=fingerprint,
    ).exists()
    if already:
        return 0

    teacher_ucs = list(
        UserCourse.objects.filter(
            course=course,
            assigned_as=UserCourse.AssignedAs.TEACHER,
        ).select_related("user")
    )
    teacher_users = [uc.user for uc in teacher_ucs]
    teacher_user_ids = {u.id for u in teacher_users}
    if not teacher_users:
        logger.debug("Course %s: no teachers assigned", course.id)
        return 0

    user_by_zoom = _teachers_by_zoom_identifier(teacher_users)
    if not user_by_zoom:
        logger.info(
            "Course %s (%s): no teacher match keys (set zoom_user_identifier or ensure teacher email matches Zoom user_email)",
            course.id,
            course.title,
        )
        return 0

    existing_keys = set(
        UserAttendance.objects.filter(
            course=course,
            user_id__in=teacher_user_ids,
        ).values_list("user_id", "join_datetime", "leave_datetime")
    )

    to_create: list[UserAttendance] = []
    tz = pytz.timezone(tenant.timezone or "UTC")

    for p in participants:
        user = None
        for k in _participant_zoom_keys(p):
            user = user_by_zoom.get(k)
            if user is not None:
                break
        if user is None:
            continue

        join_dt = _parse_zoom_datetime(p.get("join_time"))
        leave_dt = _parse_zoom_datetime(p.get("leave_time"))
        if not join_dt or not leave_dt:
            continue

        try:
            duration = int(p.get("duration") or 0)
        except (TypeError, ValueError):
            duration = 0

        key = (user.id, join_dt, leave_dt)
        if key in existing_keys:
            continue
        existing_keys.add(key)

        attendance_date = join_dt.astimezone(tz).date()
        att = UserAttendance(
            user=user,
            course=course,
            source=VideoAttendanceSource.ZOOM,
            join_datetime=join_dt,
            leave_datetime=leave_dt,
            duration_seconds=max(0, duration),
            attendance_date=attendance_date,
        )
        rate = get_hourly_rate_for_teacher_course(user, course, tenant)
        if rate is not None:
            att.hourly_rate_at_creation = rate
        to_create.append(att)

    if not to_create:
        logger.info(
            "Course %s (%s): Zoom report had %s participant row(s) but none matched teacher User.zoom_user_identifier",
            course.id,
            course.title,
            len(participants),
        )
        return 0

    with transaction.atomic():
        UserAttendance.objects.bulk_create(to_create)
        ProcessedVideoAttendanceReport.objects.create(
            course=course,
            platform=VideoAttendanceSource.ZOOM,
            external_report_id=fingerprint,
        )
    return len(to_create)
