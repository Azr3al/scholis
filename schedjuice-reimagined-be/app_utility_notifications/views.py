from __future__ import annotations

from django.db import connection
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.authentication import JWTStatelessUserAuthentication
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_organization.models import Organization
from app_rbac.views import RBACPermission, RBACView
from app_utility_notifications.utility_notification_helpers import (
    utility_notifications_for_user,
)

DEFAULT_LIMIT = 50
MAX_LIMIT = 50


def _tenant_timezone_for_request() -> str:
    schema = connection.schema_name
    with schema_context(get_public_schema_name()):
        org = Organization.objects.filter(schema_name=schema).first()
    if not org:
        return "UTC"
    return (org.timezone or "UTC").strip() or "UTC"


def _parse_limit(raw: str | None) -> int:
    if raw is None:
        return DEFAULT_LIMIT
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return DEFAULT_LIMIT
    if value < 1:
        return DEFAULT_LIMIT
    return min(value, MAX_LIMIT)


class UtilityNotificationsForMeView(RBACView):
    authentication_classes = [JWTStatelessUserAuthentication]
    permission_classes = [IsAuthenticated, RBACPermission]
    rbac_decision = "authenticated_only"

    def get(self, request):
        user = User.objects.filter(email=request.user.id).first()
        if not user:
            return self.send_response(
                True, "not_found", {"details": "User not found."}, status=404
            )
        tenant_tz = _tenant_timezone_for_request()
        limit = _parse_limit(request.GET.get("limit"))
        items = utility_notifications_for_user(
            user, now=timezone.now(), tenant_tz=tenant_tz
        )
        return self.send_response(False, "success", {"data": {"items": items[:limit]}})
