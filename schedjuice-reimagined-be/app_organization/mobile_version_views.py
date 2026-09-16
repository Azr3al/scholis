from __future__ import annotations

from rest_framework.request import Request
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_organization.mobile_version_policy import (
    evaluate_version_status,
    serialize_policy,
)
from app_organization.models import MobileAppVersionPolicy
from app_rbac.views import RBACPermission, RBACView

_VALID_VARIANTS = {choice.value for choice in MobileAppVersionPolicy.AppVariant}
_VALID_PLATFORMS = {choice.value for choice in MobileAppVersionPolicy.Platform}


def _none_payload() -> dict:
    return {
        "status": "none",
        "latest_version": None,
        "store_url": "",
        "message": "",
    }


class MobileAppVersionCheckView(RBACView):
    """Public native app version check (no auth)."""

    http_method_names = ["get"]
    authentication_classes = []
    permission_classes = [RBACPermission]
    rbac_decision = "public"

    def get(self, request: Request):
        variant = (request.query_params.get("variant") or "").strip()
        platform = (request.query_params.get("platform") or "").strip()
        version = (request.query_params.get("version") or "").strip()
        build = (request.query_params.get("build") or "").strip()

        if variant not in _VALID_VARIANTS or platform not in _VALID_PLATFORMS:
            return self.ok(_none_payload())

        with schema_context(get_public_schema_name()):
            policy = MobileAppVersionPolicy.objects.filter(
                variant=variant,
                platform=platform,
            ).first()

        status = evaluate_version_status(policy, version)
        if status == "none" or policy is None:
            return self.ok(_none_payload())

        return self.ok(
            {
                "status": status,
                "latest_version": policy.latest_version,
                "store_url": policy.store_url,
                "message": policy.message,
                "build": build or None,
            }
        )


class MobileAppVersionPolicyManagementView(RBACView):
    http_method_names = ["get", "put"]
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"GET": "debug.access", "PUT": "debug.access"}

    def get(self, request: Request):
        with schema_context(get_public_schema_name()):
            policies = list(
                MobileAppVersionPolicy.objects.all().order_by("variant", "platform")
            )
        return self.ok({"policies": [serialize_policy(policy) for policy in policies]})

    def put(self, request: Request):
        data = request.data or {}
        variant = (data.get("variant") or "").strip()
        platform = (data.get("platform") or "").strip()

        if variant not in _VALID_VARIANTS or platform not in _VALID_PLATFORMS:
            return self.bad_request("variant and platform are required and must be valid")

        minimum_version = (data.get("minimum_version") or "").strip()
        latest_version = (data.get("latest_version") or "").strip()
        if not minimum_version or not latest_version:
            return self.bad_request("minimum_version and latest_version are required")

        recommended_version = (data.get("recommended_version") or "").strip()
        store_url = (data.get("store_url") or "").strip()
        message = (data.get("message") or "").strip()
        is_enabled = data.get("is_enabled", True)
        if isinstance(is_enabled, str):
            is_enabled = is_enabled.strip().lower() in ("true", "1", "yes")

        with schema_context(get_public_schema_name()):
            policy, _created = MobileAppVersionPolicy.objects.update_or_create(
                variant=variant,
                platform=platform,
                defaults={
                    "minimum_version": minimum_version,
                    "recommended_version": recommended_version,
                    "latest_version": latest_version,
                    "store_url": store_url,
                    "message": message,
                    "is_enabled": bool(is_enabled),
                },
            )

        return self.ok(serialize_policy(policy))
