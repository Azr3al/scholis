from __future__ import annotations

import logging

from django.conf import settings
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework.response import Response
from rest_framework.views import APIView

from app_utils.eas_webhook import (
    claim_eas_webhook_delivery,
    format_build_discord_embed,
    format_submit_discord_embed,
    notify_eas_discord,
    parse_webhook_json,
    release_eas_webhook_delivery,
    should_notify_build,
    should_notify_submit,
    verify_expo_signature,
)

logger = logging.getLogger(__name__)


def _webhook_secret() -> str:
    return (getattr(settings, "EAS_WEBHOOK_SECRET", None) or "").strip()


def _handle_eas_webhook(
    request,
    *,
    event_label: str,
    should_notify,
    format_embed,
) -> Response:
    secret = _webhook_secret()
    if not secret:
        logger.warning("EAS %s webhook rejected: EAS_WEBHOOK_SECRET unset", event_label)
        return Response({"message": "Webhook not configured"}, status=503)

    raw_body = request.body
    signature = request.headers.get("expo-signature")
    if not verify_expo_signature(raw_body, signature, secret):
        logger.warning("EAS %s webhook rejected: invalid signature", event_label)
        return Response({"message": "Unauthorized"}, status=401)

    try:
        payload = parse_webhook_json(raw_body)
    except (UnicodeDecodeError, ValueError) as exc:
        logger.warning("EAS %s webhook rejected: invalid JSON (%s)", event_label, exc)
        return Response({"message": "Invalid payload"}, status=400)

    if not should_notify(payload):
        logger.info(
            "EAS %s webhook ignored (filtered): profile=%s",
            event_label,
            (payload.get("metadata") or {}).get("buildProfile"),
        )
        return Response({"ok": True}, status=200)

    if not claim_eas_webhook_delivery(event_label, payload):
        logger.info(
            "EAS %s webhook duplicate ignored: id=%s status=%s",
            event_label,
            payload.get("id"),
            payload.get("status"),
        )
        return Response({"ok": True}, status=200)

    try:
        notify_eas_discord([format_embed(payload)])
    except Exception:
        release_eas_webhook_delivery(event_label, payload)
        logger.exception("EAS %s webhook: Discord notify failed", event_label)
        return Response({"message": "Discord delivery failed"}, status=502)

    return Response({"ok": True}, status=200)


@method_decorator(csrf_exempt, name="dispatch")
class EasBuildWebhookView(APIView):
    authentication_classes: list = []
    permission_classes: list = []

    def post(self, request):
        return _handle_eas_webhook(
            request,
            event_label="BUILD",
            should_notify=should_notify_build,
            format_embed=format_build_discord_embed,
        )


@method_decorator(csrf_exempt, name="dispatch")
class EasSubmitWebhookView(APIView):
    authentication_classes: list = []
    permission_classes: list = []

    def post(self, request):
        return _handle_eas_webhook(
            request,
            event_label="SUBMIT",
            should_notify=should_notify_submit,
            format_embed=format_submit_discord_embed,
        )
