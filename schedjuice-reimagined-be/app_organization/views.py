from rest_framework.exceptions import MethodNotAllowed
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication
from tenant_schemas.middleware import get_public_schema_name
from tenant_schemas.utils import schema_context
from django.conf import settings
from django.core.cache import cache

from app_auth import serializers as auth_serializers
from app_auth.models import User
from app_auth.serializers import UserSerializer
from app_organization import models, serializers
from app_organization.throttling import OrganizationPublicAnonThrottle
from app_organization.permissions import (
    RequiresOrgTargetAccess,
    RequiresPlatformAdminTenant,
    RequiresSuperadminAiUsageOrgAccess,
)
from utilitas.queryset_mixins import OptimizedSearchMixin
from app_rbac.views import (
    RBACDetailsView,
    RBACListView,
    RBACPermission,
    RBACSearchView,
    RBACView,
)
from utilitas.views import Request
from app_ai.reporting import (
    build_failures_list,
    build_org_detail,
    build_org_users_payload,
    build_requests_list,
    build_ai_usage_analytics,
    parse_year_month,
    DEFAULT_REQUESTS_FEATURE,
    DEFAULT_TOP_SPENDERS_LIMIT,
    serialize_request_log_failure_item,
)
from app_ai.failure_resolution import FailureResolutionError, resolve_request_log_failure
from app_ai.models import AIRequestLog
from app_finance.billing_api import build_monthly_billing_payload, parse_billing_date_param
from app_organization.helpers import (
    authenticate_with_multiple_tenants,
    find_tenants_of_user,
)
from app_organization.platform_invoice import (
    PlatformInvoiceValidationError,
    create_platform_invoice,
)


class OrganizationListView(RBACListView):
    name = "Organization list view"
    model = models.Organization
    serializer = serializers.OrganizationSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [RBACPermission, RequiresPlatformAdminTenant]
    required_permissions = {"GET": "org.manage_all", "POST": "org.manage_all"}

    def post(self, request: Request):
        org = self.get_serializer(data=request.data)
        if org.is_valid():
            with schema_context(get_public_schema_name()):
                org.save()
                return self.send_response(
                    False, "created", {"data": org.data}, status=201
                )
        return self.send_response(
            True, "bad_request", {"details": org.errors}, status=400
        )


class OrganizationDetailsView(RBACDetailsView):
    name = "Organization details view"
    model = models.Organization
    serializer = serializers.OrganizationSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {
        "GET": "org.configure",
        "PUT": "org.configure",
        "PATCH": "org.configure",
    }

    def get(self, request, obj_id):
        obj = self.get_object(obj_id)
        if obj is None:
            return self.send_not_found(obj_id)
        return super().get(request, obj_id)

    def put(self, request: Request, obj_id: int):
        obj = self.get_object(obj_id)
        if obj is None:
            return self.send_not_found(obj_id)
        serialized_data = self.get_serializer(obj, data=request.data, partial=True)
        serialized_data.is_valid(raise_exception=True)
        with schema_context(get_public_schema_name()):
            serialized_data.save()
            return self.send_response(
                False, "updated", {"data": serialized_data.data}, status=200
            )


class OrganizationAISettingsView(RBACDetailsView):
    name = "Organization AI settings"
    model = models.Organization
    serializer = serializers.OrganizationAISettingsSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {
        "GET": "org.configure",
        "PATCH": "org.configure",
    }

    def get_object(self, obj_id: int, prefetch_fields=None):
        with schema_context(get_public_schema_name()):
            return super().get_object(obj_id, prefetch_fields)

    def get(self, request, obj_id):
        obj = self.get_object(obj_id)
        if obj is None:
            return self.send_not_found(obj_id)
        ser = self.get_serializer(obj)
        return self.ok(ser.data)

    def patch(self, request: Request, obj_id: int):
        obj = self.get_object(obj_id)
        if obj is None:
            return self.send_not_found(obj_id)
        if "ai_enabled_packs" in request.data:
            from app_organization.permissions import RequiresPlatformAdminTenant

            if not RequiresPlatformAdminTenant().has_permission(request, self):
                return self.send_response(
                    True,
                    "forbidden",
                    {"details": "Pack assignment requires platform admin."},
                    status=403,
                )
        ser = self.get_serializer(obj, data=request.data, partial=True)
        if not ser.is_valid():
            return self.send_response(
                True, "bad_request", {"details": ser.errors}, status=400
            )
        with schema_context(get_public_schema_name()):
            ser.save()
        return self.send_response(False, "updated", {"data": ser.data}, status=200)


class OrganizationAIUsageView(RBACDetailsView):
    name = "Organization AI usage"
    model = models.Organization
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [RBACPermission, RequiresSuperadminAiUsageOrgAccess]
    required_permissions = {"GET": "ai.usage.view"}

    def get_object(self, obj_id: int, prefetch_fields=None):
        with schema_context(get_public_schema_name()):
            return super().get_object(obj_id, prefetch_fields)

    def get(self, request: Request, obj_id):
        obj = self.get_object(obj_id)
        if obj is None:
            return self.send_not_found(obj_id)
        parsed = parse_year_month(
            request.query_params.get("year"),
            request.query_params.get("month"),
        )
        if parsed is None:
            return self.bad_request("Invalid year or month")
        year, month = parsed
        payload = build_org_detail(obj, year, month)
        return self.send_response(False, "success", payload, status=200)


class OrganizationAIUsageUsersView(RBACDetailsView):
    name = "Organization AI usage users"
    model = models.Organization
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [RBACPermission, RequiresSuperadminAiUsageOrgAccess]
    required_permissions = {"GET": "ai.usage.view"}

    def get_object(self, obj_id: int, prefetch_fields=None):
        with schema_context(get_public_schema_name()):
            return super().get_object(obj_id, prefetch_fields)

    def get(self, request: Request, obj_id):
        obj = self.get_object(obj_id)
        if obj is None:
            return self.send_not_found(obj_id)
        parsed = parse_year_month(
            request.query_params.get("year"),
            request.query_params.get("month"),
        )
        if parsed is None:
            return self.bad_request("Invalid year or month")
        year, month = parsed
        limit_raw = request.query_params.get("limit")
        limit = DEFAULT_TOP_SPENDERS_LIMIT
        if limit_raw is not None:
            try:
                limit = max(1, min(int(limit_raw), 200))
            except ValueError:
                return self.bad_request("Invalid limit")
        payload = build_org_users_payload(obj, year, month, limit=limit)
        return self.send_response(False, "success", payload, status=200)


class OrganizationBillingView(RBACDetailsView):
    name = "Organization billing"
    model = models.Organization
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [RBACPermission, RequiresPlatformAdminTenant]
    required_permissions = {"GET": "billing.manage"}

    def get_object(self, obj_id: int, prefetch_fields=None):
        with schema_context(get_public_schema_name()):
            return super().get_object(obj_id, prefetch_fields)

    def get(self, request: Request, obj_id):
        obj = self.get_object(obj_id)
        if obj is None:
            return self.send_not_found(obj_id)
        date_str = request.query_params.get("date")
        parsed_date, error = parse_billing_date_param(date_str)
        if error:
            return self.send_response(
                True,
                "bad_request",
                {"details": error},
                status=400,
            )
        payload = build_monthly_billing_payload(
            obj.schema_name,
            parsed_date,
            date_str,
            request,
        )
        return self.send_response(False, "success", payload, status=200)


class OrganizationPlatformBillingConfigView(RBACDetailsView):
    name = "Organization platform billing config"
    model = models.Organization
    serializer = serializers.OrganizationPlatformBillingConfigSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [RBACPermission, RequiresPlatformAdminTenant]
    required_permissions = {"GET": "billing.manage", "PATCH": "billing.manage"}

    def get_object(self, obj_id: int, prefetch_fields=None):
        with schema_context(get_public_schema_name()):
            return super().get_object(obj_id, prefetch_fields)

    def get(self, request: Request, obj_id):
        obj = self.get_object(obj_id)
        if obj is None:
            return self.send_not_found(obj_id)
        ser = self.get_serializer(obj)
        return self.send_response(False, "success", {"data": ser.data}, status=200)

    def patch(self, request: Request, obj_id):
        obj = self.get_object(obj_id)
        if obj is None:
            return self.send_not_found(obj_id)
        ser = self.get_serializer(obj, data=request.data, partial=True)
        if not ser.is_valid():
            return self.send_response(
                True,
                "bad_request",
                {"details": ser.errors},
                status=400,
            )
        with schema_context(get_public_schema_name()):
            ser.save()
        return self.send_response(False, "updated", {"data": ser.data}, status=200)


class OrganizationPlatformInvoiceListCreateView(RBACDetailsView):
    name = "Organization platform invoices"
    model = models.Organization
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [RBACPermission, RequiresPlatformAdminTenant]
    required_permissions = {"GET": "billing.manage", "POST": "billing.manage"}

    def get_object(self, obj_id: int, prefetch_fields=None):
        with schema_context(get_public_schema_name()):
            return super().get_object(obj_id, prefetch_fields)

    def get(self, request: Request, obj_id):
        obj = self.get_object(obj_id)
        if obj is None:
            return self.send_not_found(obj_id)
        with schema_context(get_public_schema_name()):
            invoices = (
                models.PlatformInvoice.objects.filter(organization=obj)
                .select_related("organization")
                .order_by("-generated_at", "-id")
            )
            data = serializers.PlatformInvoiceSerializer(
                invoices,
                many=True,
                context={"request": request, "model": models.PlatformInvoice},
            ).data
        return self.send_response(False, "success", {"data": data}, status=200)

    def post(self, request: Request, obj_id):
        obj = self.get_object(obj_id)
        if obj is None:
            return self.send_not_found(obj_id)
        parsed = parse_year_month(
            request.data.get("year"),
            request.data.get("month"),
        )
        if parsed is None:
            return self.bad_request("Invalid year or month")
        year, month = parsed
        actor = User.objects.filter(email=request.user.id).first()
        try:
            invoice, created = create_platform_invoice(
                obj,
                year,
                month,
                generated_by=actor,
                generated_by_email=str(request.user.id),
                request=request,
            )
        except PlatformInvoiceValidationError as exc:
            return self.send_response(
                True,
                "bad_request",
                {"details": str(exc)},
                status=400,
            )
        with schema_context(get_public_schema_name()):
            invoice = (
                models.PlatformInvoice.objects.select_related("organization")
                .filter(pk=invoice.pk)
                .first()
            )
        data = serializers.PlatformInvoiceSerializer(
            invoice,
            context={"request": request, "model": models.PlatformInvoice},
        ).data
        return self.send_response(
            False,
            "created" if created else "updated",
            {"data": data},
            status=201 if created else 200,
        )


class PlatformInvoiceDetailView(RBACView):
    name = "Platform invoice detail"
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [RBACPermission, RequiresPlatformAdminTenant]
    required_permissions = {"GET": "billing.manage"}

    def get(self, request: Request, invoice_id: int):
        with schema_context(get_public_schema_name()):
            invoice = (
                models.PlatformInvoice.objects.select_related("organization")
                .filter(pk=invoice_id)
                .first()
            )
        if invoice is None:
            return self.send_not_found(invoice_id)
        data = serializers.PlatformInvoiceSerializer(
            invoice,
            context={"request": request, "model": models.PlatformInvoice},
        ).data
        return self.send_response(False, "success", {"data": data}, status=200)


class OrganizationAIUsageFailuresView(RBACDetailsView):
    name = "Organization AI usage failures"
    model = models.Organization
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [RBACPermission, RequiresSuperadminAiUsageOrgAccess]
    required_permissions = {"GET": "ai.usage.view"}

    def get_object(self, obj_id: int, prefetch_fields=None):
        with schema_context(get_public_schema_name()):
            return super().get_object(obj_id, prefetch_fields)

    def get(self, request: Request, obj_id):
        obj = self.get_object(obj_id)
        if obj is None:
            return self.send_not_found(obj_id)
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
                tenant_id=obj.id,
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


class OrganizationAIUsageFailureResolveView(RBACView):
    name = "Organization AI usage failure resolve"
    http_method_names = ["patch"]
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [RBACPermission, RequiresSuperadminAiUsageOrgAccess]
    required_permissions = {"PATCH": "ai.usage.view"}

    def patch(self, request: Request, obj_id: int, request_log_id: int):
        with schema_context(get_public_schema_name()):
            org = models.Organization.objects.filter(id=obj_id).first()
            if org is None:
                return self.not_found(f"Organization with id {obj_id} does not exist.")
            row = (
                AIRequestLog.objects.filter(id=request_log_id, tenant_id=org.id)
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


class OrganizationAIUsageRequestsView(RBACDetailsView):
    name = "Organization AI usage requests"
    model = models.Organization
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [RBACPermission, RequiresSuperadminAiUsageOrgAccess]
    required_permissions = {"GET": "ai.usage.view"}

    def get_object(self, obj_id: int, prefetch_fields=None):
        with schema_context(get_public_schema_name()):
            return super().get_object(obj_id, prefetch_fields)

    def get(self, request: Request, obj_id):
        obj = self.get_object(obj_id)
        if obj is None:
            return self.send_not_found(obj_id)
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
                tenant_id=obj.id,
                page=page,
                page_size=page_size,
                sort=sort,
            )
        except ValueError as exc:
            return self.bad_request(str(exc))
        return self.send_response(False, "success", payload, status=200)


class OrganizationAIUsageAnalyticsView(RBACDetailsView):
    name = "Organization AI usage analytics"
    model = models.Organization
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [RBACPermission, RequiresSuperadminAiUsageOrgAccess]
    required_permissions = {"GET": "ai.usage.view"}

    def get_object(self, obj_id: int, prefetch_fields=None):
        with schema_context(get_public_schema_name()):
            return super().get_object(obj_id, prefetch_fields)

    def get(self, request: Request, obj_id):
        obj = self.get_object(obj_id)
        if obj is None:
            return self.send_not_found(obj_id)
        parsed = parse_year_month(
            request.query_params.get("year"),
            request.query_params.get("month"),
        )
        if parsed is None:
            return self.bad_request("Invalid year or month")
        year, month = parsed
        feature = request.query_params.get("feature") or DEFAULT_REQUESTS_FEATURE
        try:
            payload = build_ai_usage_analytics(
                year=year,
                month=month,
                feature=feature,
                tenant_id=obj.id,
            )
        except ValueError as exc:
            return self.bad_request(str(exc))
        return self.send_response(False, "success", payload, status=200)


class OrganizationSearchView(RBACSearchView):
    name = "Organization search view"
    model = models.Organization
    serializer = serializers.OrganizationSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [RBACPermission, RequiresPlatformAdminTenant]
    required_permissions = {"GET": "org.manage_all", "POST": "org.manage_all"}

    def augment_search_queryset(self, queryset, expand, is_csv):
        queryset = super().augment_search_queryset(queryset, expand, is_csv)
        from utilitas.search import get_search_q
        from app_organization.organization_search import apply_organization_search_q

        q = get_search_q(self.request)
        if q:
            queryset = apply_organization_search_q(queryset, q)
        return queryset

class OrganizationPublicView(RBACView):
    """
    Public data for an organization
    """

    name = "Organization tenant view"
    model = models.Organization
    serializer = serializers.OrganizationSerializer
    authentication_classes = []
    rbac_decision = "public"
    throttle_classes = [OrganizationPublicAnonThrottle]

    def get(self, request: Request):
        timeout = int(getattr(settings, "TENANT_RESOLUTION_CACHE_TIMEOUT", 60))
        cache_key = f"org:public:{request.tenant.pk}"
        payload = cache.get(cache_key)
        if payload is None:
            with schema_context(get_public_schema_name()):
                org = (
                    models.Organization.objects.select_related(
                        "active_student_id_card_template",
                        "active_staff_id_card_template",
                    )
                    .filter(pk=request.tenant.pk)
                    .first()
                )
            serialized = serializers.OrganizationTenantPublicSerializer(
                org or request.tenant,
                context={"request": request, "model": self.model},
            )
            payload = {
                **serialized.data,
                "schema_name": request.tenant.schema_name,
            }
            cache.set(cache_key, payload, timeout=timeout)
        response = self.send_response(False, "ok", {"data": payload})
        response["Cache-Control"] = f"public, s-maxage={timeout}"
        return response


class OrganizationAdminSearchView(RBACSearchView):
    """
    See admin users of the organization
    """

    name = "Organization admin view"
    model = models.Organization
    serializer = serializers.OrganizationSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [RBACPermission, RequiresPlatformAdminTenant]
    required_permissions = {"GET": "org.manage_all", "POST": "org.manage_all"}

    def post(self, request: Request, obj_id: int):
        obj = self.model.objects.filter(id=obj_id).first()
        if obj is None:
            return self.send_response(
                True,
                "not_found",
                {"details": f"{str(self.model)} with id {obj_id} does not exist."},
                status=404,
            )
        with schema_context(obj.schema_name):
            users = User.objects.active().values_list("id").filter(
                roles__contained_by=[User.UserRole.SUPERADMIN]
            )
            self.model = User
            self.serializer = UserSerializer
            return super().post(request, users)


class OrganizationUserSearchView(OptimizedSearchMixin, RBACSearchView):
    """
    Search users in the target organization's tenant schema.
    """

    name = "Organization user search view"
    model = User
    serializer = auth_serializers.UserSearchSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [RBACPermission, RequiresOrgTargetAccess]
    required_permissions = {"POST": "org.configure"}

    def get_serializer_class(self):
        if self.get_expand_param(self.request):
            return UserSerializer
        return auth_serializers.UserSearchSerializer

    def augment_search_queryset(self, queryset, expand, is_csv):
        queryset = super().augment_search_queryset(queryset, expand, is_csv)
        from app_auth.user_search import apply_user_search_q_with_meta, get_search_q

        q = get_search_q(self.request)
        if q:
            queryset, self._search_used_fallback = apply_user_search_q_with_meta(
                queryset, q
            )
        else:
            self._search_used_fallback = False
        return queryset

    def post(self, request: Request, obj_id: int):
        with schema_context(get_public_schema_name()):
            org = models.Organization.objects.filter(id=obj_id).first()
        if org is None:
            return self.send_response(
                True,
                "not_found",
                {
                    "details": (
                        f"{str(models.Organization)} with id {obj_id} does not exist."
                    )
                },
                status=404,
            )
        with schema_context(org.schema_name):
            self._search_used_fallback = False
            return super().post(request)


class OrganizationAdminListView(RBACListView):
    """
    List of admin users of the organization
    """

    name = "Organization admin list view"
    model = User
    serializer = UserSerializer
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [RBACPermission, RequiresPlatformAdminTenant]
    required_permissions = {"POST": "org.manage_all"}

    def get(self):
        raise MethodNotAllowed("GET")

    def post(self, request: Request, obj_id: int):
        obj = models.Organization.objects.filter(id=obj_id).first()
        if obj is None:
            return self.send_response(
                True,
                "not_found",
                {"details": f"{str(self.model)} with id {obj_id} does not exist."},
                status=404,
            )
        with schema_context(obj.schema_name):
            return super().post(request)


class UserTenantView(RBACView):
    """
    View to get tenants of the user
    """
    authentication_classes = []
    rbac_decision = "public"

    def post(self, request: Request):
        email = request.data.get("email")
        password = request.data.get("password")
        if not email or not password:
            return self.send_response(
                True, "bad_request", {"details": "Email or password is required"}, status=400
            )
        tenants = find_tenants_of_user(email)
        data = [
            {
                "id": tenant.organization_id,
                "name": tenant.organization_name,
                "schema_name": tenant.schema_name,
            } for tenant in tenants
        ]
        if not authenticate_with_multiple_tenants(email, [i["schema_name"] for i in data], password):
            return self.send_response(
                True, "not_found", {"details": "No such user"}, status=404
            )
        return self.send_response(
            False, "ok", {"data": data}, status=200
        )
