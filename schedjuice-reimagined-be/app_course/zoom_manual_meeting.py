"""Validate a manual Zoom meeting id against connected ``ZoomAccount`` rows (public schema)."""

from __future__ import annotations

from tenant_schemas.utils import get_public_schema_name, schema_context

from app_course.models import Course
from app_organization.models import ZoomAccount
from app_zoom.client import get_meeting
from rest_framework import serializers


def resolve_manual_zoom_meeting_for_tenant(
    tenant,
    zoom_meeting_id: str,
    *,
    zoom_account_id: str | None = None,
    zoom_meeting_source: str | None = None,
    personal_oauth=None,
) -> dict:
    """
    Resolve a Zoom meeting to a single connected account.

    Returns keys to merge into course ``validated_data`` / attrs:
    ``zoom_account_id``, ``zoom_meeting_uuid``, ``zoom_meeting_host_id``.
    """
    incoming_meeting_id = (zoom_meeting_id or "").strip()
    if not incoming_meeting_id:
        raise serializers.ValidationError(
            {"zoom_meeting_id": "Zoom meeting id is required."}
        )

    if zoom_meeting_source == Course.ZoomMeetingSource.PERSONAL:
        if personal_oauth is None:
            raise serializers.ValidationError(
                {
                    "zoom_meeting_id": (
                        "Personal Zoom is not connected for the bound teacher yet."
                    )
                }
            )
        meeting = get_meeting(personal_oauth, incoming_meeting_id)
        if not meeting:
            raise serializers.ValidationError(
                {
                    "zoom_meeting_id": (
                        "This Zoom meeting was not found for the teacher's Zoom account."
                    )
                }
            )
        ext_acct = (getattr(personal_oauth, "zoom_account_id", None) or "").strip()
        return {
            "zoom_account_id": ext_acct or None,
            "zoom_meeting_uuid": str(meeting.get("uuid") or ""),
            "zoom_meeting_host_id": str(meeting.get("host_id") or ""),
        }

    incoming_account_id = (zoom_account_id or "").strip()
    with schema_context(get_public_schema_name()):
        candidates_qs = ZoomAccount.objects.filter(
            organization_id=tenant.id,
            status=ZoomAccount.Status.ACTIVE,
        )
        if incoming_account_id:
            candidates_qs = candidates_qs.filter(account_id=incoming_account_id)
        candidates = list(candidates_qs)

    if not candidates:
        raise serializers.ValidationError(
            {
                "zoom_meeting_id": (
                    "No active Zoom account is connected for this school yet."
                )
            }
        )

    matches: list[tuple[ZoomAccount, dict]] = []
    for za in candidates:
        meeting = get_meeting(za, incoming_meeting_id)
        if meeting:
            matches.append((za, meeting))

    if not matches:
        raise serializers.ValidationError(
            {
                "zoom_meeting_id": (
                    "This Zoom meeting was not found in any connected Zoom account."
                )
            }
        )

    if len(matches) > 1:
        raise serializers.ValidationError(
            {
                "zoom_account_id": (
                    "This meeting exists in more than one connected Zoom account; "
                    "choose one."
                )
            }
        )

    za, meeting = matches[0]
    return {
        "zoom_account_id": za.account_id,
        "zoom_meeting_uuid": str(meeting.get("uuid") or ""),
        "zoom_meeting_host_id": str(meeting.get("host_id") or ""),
    }
