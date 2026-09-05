from __future__ import annotations

from rest_framework.request import Request
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication

from app_ai.reporting import (
    build_failures_list,
    build_platform_summary,
    build_requests_list,
    build_ai_usage_analytics,
    parse_year_month,
    DEFAULT_REQUESTS_FEATURE,
    serialize_request_log_failure_item,
)
from app_ai.failure_resolution import FailureResolutionError, resolve_request_log_failure
from app_ai.models import AIRequestLog
from app_organization.permissions import RequiresPlatformAdminTenant
from app_rbac.views import RBACPermission, RBACView


class PlatformAIUsageSummaryView(RBACView):
    http_method_names = ["get"]
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [RBACPermission, RequiresPlatformAdminTenant]
    required_permissions = {"GET": "ai.usage.view"}

    def get(self, request: Request):
        parsed = parse_year_month(
            request.query_params.get("year"),
            request.query_params.get("month"),
        )
        if parsed is None:
            return self.bad_request("Invalid year or month")
        year, month = parsed
        payload = build_platform_summary(year, month)
        return self.send_response(False, "success", payload, status=200)


class PlatformAIUsageFailuresView(RBACView):
    http_method_names = ["get"]
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [RBACPermission, RequiresPlatformAdminTenant]
    required_permissions = {"GET": "ai.usage.view"}

    def get(self, request: Request):
        parsed = parse_year_month(
            request.query_params.get("year"),
            request.query_params.get("month"),
        )
        if parsed is None:
            return self.bad_request("Invalid year or month")
        year, month = parsed
        try:
            page = max(int(request.query_params.get("page", 1)), 1)
            page_size = int(request.query_params.get("page_size", 25))
        except ValueError:
            return self.bad_request("Invalid page or page_size")
        outcome = request.query_params.get("outcome") or "tool_limit_exceeded"
        feature = request.query_params.get("feature") or "telegram_query"
        likely_cause = (request.query_params.get("likely_cause") or "").strip() or None
        capability_gap = (request.query_params.get("capability_gap") or "").strip() or None
        resolution = (request.query_params.get("resolution") or "open").strip()
        sort = request.query_params.get("sort") or "-created_at"
        try:
            payload = build_failures_list(
                year=year,
                month=month,
                outcome=outcome,
                feature=feature,
                tenant_id=None,
                page=page,
                page_size=page_size,
                likely_cause=likely_cause,
                capability_gap=capability_gap,
                resolution=resolution,
                sort=sort,
            )
        except ValueError as exc:
            return self.bad_request(str(exc))
        return self.send_response(False, "success", payload, status=200)


class PlatformAIUsageFailureResolveView(RBACView):
    http_method_names = ["patch"]
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [RBACPermission, RequiresPlatformAdminTenant]
    required_permissions = {"PATCH": "ai.usage.view"}

    def patch(self, request: Request, request_log_id: int):
        from tenant_schemas.utils import get_public_schema_name, schema_context

        with schema_context(get_public_schema_name()):
            row = (
                AIRequestLog.objects.filter(id=request_log_id)
                .select_related("tenant")
                .first()
            )
        if row is None:
            return self.not_found(
                f"AIRequestLog with id {request_log_id} does not exist."
            )

        resolved = request.data.get("resolved")
        if not isinstance(resolved, bool):
            return self.bad_request("resolved must be a boolean")

        try:
            row = resolve_request_log_failure(
                row,
                resolved=resolved,
                user_id=request.user.id,
            )
        except FailureResolutionError as exc:
            return self.bad_request(str(exc))

        return self.send_response(
            False,
            "success",
            serialize_request_log_failure_item(row),
            status=200,
        )


class PlatformAIUsageRequestsView(RBACView):
    http_method_names = ["get"]
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [RBACPermission, RequiresPlatformAdminTenant]
    required_permissions = {"GET": "ai.usage.view"}

    def get(self, request: Request):
        parsed = parse_year_month(
            request.query_params.get("year"),
            request.query_params.get("month"),
        )
        if parsed is None:
            return self.bad_request("Invalid year or month")
        year, month = parsed
        try:
            page = max(int(request.query_params.get("page", 1)), 1)
            page_size = int(request.query_params.get("page_size", 25))
        except ValueError:
            return self.bad_request("Invalid page or page_size")
        outcome = request.query_params.get("outcome") or "all"
        feature = request.query_params.get("feature") or "telegram_query"
        sort = request.query_params.get("sort") or "-created_at"
        try:
            payload = build_requests_list(
                year=year,
                month=month,
                outcome=outcome,
                feature=feature,
                tenant_id=None,
                page=page,
                page_size=page_size,
                sort=sort,
            )
        except ValueError as exc:
            return self.bad_request(str(exc))
        return self.send_response(False, "success", payload, status=200)


class PlatformAIUsageAnalyticsView(RBACView):
    http_method_names = ["get"]
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [RBACPermission, RequiresPlatformAdminTenant]
    required_permissions = {"GET": "ai.usage.view"}

    def get(self, request: Request):
        parsed = parse_year_month(
            request.query_params.get("year"),
            request.query_params.get("month"),
        )
        if parsed is None:
            return self.bad_request("Invalid year or month")
        year, month = parsed
        feature = request.query_params.get("feature") or DEFAULT_REQUESTS_FEATURE
        tenant_raw = (request.query_params.get("tenant_id") or "").strip()
        tenant_id = None
        if tenant_raw:
            try:
                tenant_id = int(tenant_raw)
            except ValueError:
                return self.bad_request("Invalid tenant_id")
        try:
            payload = build_ai_usage_analytics(
                year=year,
                month=month,
                feature=feature,
                tenant_id=tenant_id,
            )
        except ValueError as exc:
            return self.bad_request(str(exc))
        return self.send_response(False, "success", payload, status=200)
