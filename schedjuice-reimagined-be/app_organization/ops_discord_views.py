from __future__ import annotations

from django.utils import timezone
from rest_framework.request import Request
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_organization.models import PlatformOpsSettings
from app_rbac.views import RBACView
from app_utils.ops_discord_helpers import (
    discord_webhook_status,
    resolve_discord_webhook_url,
    send_discord_webhook_message,
    validate_discord_webhook_url,
)


class OpsDiscordSettingsView(RBACView):
    http_method_names = ["get", "put"]
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"GET": "debug.access", "PUT": "debug.access"}

    def get(self, request: Request):
        return self.send_response(False, "success", discord_webhook_status())

    def put(self, request: Request):
        url = (request.data or {}).get("webhook_url", "")
        if url is None:
            return self.bad_request("webhook_url is required")
        url = str(url).strip()
        try:
            validate_discord_webhook_url(url)
        except ValueError as e:
            return self.bad_request(str(e))

        with schema_context(get_public_schema_name()):
            obj = PlatformOpsSettings.get_singleton()
            if url:
                obj.set_discord_webhook_url(url)
            else:
                obj.discord_webhook_url_ct = ""
                obj.discord_webhook_updated_at = timezone.now()
            obj.save()

        return self.send_response(False, "success", discord_webhook_status())


class OpsDiscordTestView(RBACView):
    http_method_names = ["post"]
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"POST": "debug.access"}

    def post(self, request: Request):
        msg = (request.data or {}).get(
            "message",
            "[Schedjuice] Discord ops test — cron health monitoring",
        )
        url = resolve_discord_webhook_url()
        if not url:
            return self.bad_request("Discord webhook is not configured")
        try:
            send_discord_webhook_message(url, str(msg))
        except Exception as e:
            return self.send_response(
                True,
                "send_failed",
                {"sent": False, "error": str(e)[:500]},
                status=502,
            )
        return self.send_response(False, "success", {"sent": True})
