"""Google Calendar push notification webhook."""

from __future__ import annotations

import logging

from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework.response import Response
from rest_framework.views import APIView

from app_google.calendar_channel import get_push_channel_by_channel_id, maybe_renew_calendar_watch
from app_google.calendar_sync import sync_calendar_changes_for_channel

logger = logging.getLogger(__name__)

_SYNC_STATES = {"sync"}
_CHANGE_STATES = {"exists", "not_exists"}


@method_decorator(csrf_exempt, name="dispatch")
class GoogleCalendarWebhookView(APIView):
    authentication_classes: list = []
    permission_classes: list = []

    def post(self, request):
        channel_id = (request.headers.get("X-Goog-Channel-ID") or "").strip()
        resource_id = (request.headers.get("X-Goog-Resource-ID") or "").strip()
        resource_state = (request.headers.get("X-Goog-Resource-State") or "").strip().lower()

        if not channel_id:
            logger.warning("Google Calendar webhook rejected: missing channel id")
            return Response({"message": "Missing channel id"}, status=400)

        channel = get_push_channel_by_channel_id(channel_id)
        if channel is None:
            logger.warning("Google Calendar webhook rejected: unknown channel_id=%s", channel_id)
            return Response({"message": "Unknown channel"}, status=404)

        if resource_id and channel.resource_id != resource_id:
            logger.warning(
                "Google Calendar webhook rejected: resource mismatch channel=%s",
                channel_id,
            )
            return Response({"message": "Resource mismatch"}, status=403)

        if resource_state in _SYNC_STATES:
            maybe_renew_calendar_watch(channel)
            return Response({"ok": True}, status=200)

        if resource_state in _CHANGE_STATES:
            sync_calendar_changes_for_channel.delay(channel_id)
            maybe_renew_calendar_watch(channel)
            return Response({"ok": True}, status=200)

        logger.info(
            "Google Calendar webhook ignored state=%s channel=%s",
            resource_state,
            channel_id,
        )
        return Response({"ok": True}, status=200)
