"""Resolve Zoom OAuth credential + scheduling host id for course Zoom actions."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Union

from tenant_schemas.utils import get_public_schema_name, schema_context

from app_course.models import Course
from app_organization.models import ZoomAccount

if TYPE_CHECKING:
    from app_auth.models_user_zoom_oauth import UserZoomOAuth

Credential = Union[ZoomAccount, "UserZoomOAuth"]


@dataclass(frozen=True)
class ResolvedZoomContext:
    credential: Credential
    host_zoom_user_id: str


def resolve_course_zoom_account(course: Course, tenant) -> ZoomAccount | None:
    if not (course.zoom_account_id or "").strip():
        return None
    with schema_context(get_public_schema_name()):
        return ZoomAccount.objects.filter(
            organization_id=tenant.id,
            account_id=course.zoom_account_id.strip(),
            status=ZoomAccount.Status.ACTIVE,
        ).first()


def resolve_zoom_course_context(
    *, course: Course, actor, tenant
) -> tuple[ResolvedZoomContext | None, str | None, int | None]:
    """
    Returns (context, None, None) on success, or (None, message, http_status) on failure.
    """
    from app_auth.models_user_zoom_oauth import UserZoomOAuth

    if course.zoom_meeting_source == Course.ZoomMeetingSource.PERSONAL:
        if course.zoom_personal_user_id is None:
            return (
                None,
                "This class uses personal Zoom but no teacher is bound yet.",
                400,
            )
        if course.zoom_personal_user_id != actor.id:
            return (
                None,
                "This class uses a teacher's personal Zoom. Only that teacher can manage this meeting.",
                403,
            )
        uzo = getattr(actor, "zoom_oauth", None)
        if uzo is None:
            return (
                None,
                "Connect your Zoom account from your profile settings first.",
                400,
            )
        if uzo.status != UserZoomOAuth.Status.ACTIVE:
            return (
                None,
                "Your Zoom connection needs to be reconnected. Open profile settings.",
                400,
            )
        host_id = (uzo.zoom_user_id or "").strip()
        if not host_id:
            return (
                None,
                "Personal Zoom is missing host information. Reconnect Zoom from your profile.",
                400,
            )
        return ResolvedZoomContext(credential=uzo, host_zoom_user_id=host_id), None, None

    za = resolve_course_zoom_account(course, tenant)
    if za is None:
        return (
            None,
            "Choose a connected Zoom account on the course before using Zoom actions.",
            400,
        )
    if not za.has_default_host():
        return (
            None,
            "Set a default host for this Zoom account in organization settings.",
            400,
        )
    host_id = (za.default_host_zoom_user_id or "").strip()
    return ResolvedZoomContext(credential=za, host_zoom_user_id=host_id), None, None
