from __future__ import annotations

from rest_framework.views import Request

from app_ai.permissions import (
    require_ai_memory_manage,
    require_ai_memory_manage_all,
    require_ai_memory_view,
    require_ai_usage_view,
)
from app_ai.reporting import build_user_usage_detail, parse_year_month
from app_ai.serializers import UserAIPreferencesSerializer
from app_ai.user_preferences import (
    get_preferences_for_user,
    preferences_to_dict,
    upsert_preferences,
)
from app_auth.models import User
from app_course.course_scoping import acting_user
from app_rbac.views import RBACView
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication


class UserAIUsageView(RBACView):
    name = "User AI usage"
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    rbac_decision = "authenticated_only"

    def get(self, request: Request, user_id: int):
        actor = acting_user(request)
        if actor is None:
            return self.unauthorized(message="authentication_required")

        subject = User.objects.filter(pk=user_id).first()
        if subject is None:
            return self.not_found("User not found.")

        if not require_ai_usage_view(actor, user_id):
            return self.forbidden("You cannot view this user's AI usage.")

        parsed = parse_year_month(
            request.query_params.get("year"),
            request.query_params.get("month"),
        )
        if parsed is None:
            return self.bad_request("Invalid year or month")
        year, month = parsed

        tenant = getattr(request, "tenant", None)
        if tenant is None:
            return self.bad_request("Tenant required")

        payload = build_user_usage_detail(tenant, user_id, year, month)
        return self.ok(payload)


class UserAIPreferencesView(RBACView):
    name = "User AI preferences"
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    rbac_decision = "authenticated_only"

    def get(self, request: Request, user_id: int):
        actor = acting_user(request)
        if actor is None:
            return self.unauthorized(message="authentication_required")

        subject = User.objects.filter(pk=user_id).first()
        if subject is None:
            return self.not_found("User not found.")

        if not require_ai_memory_view(actor, user_id) and not require_ai_usage_view(
            actor, user_id
        ):
            return self.forbidden("You cannot view this user's AI memory.")

        tenant = getattr(request, "tenant", None)
        prefs = get_preferences_for_user(subject)
        return self.ok(
            preferences_to_dict(prefs, user_id=user_id, tenant=tenant)
        )

    def patch(self, request: Request, user_id: int):
        actor = acting_user(request)
        if actor is None:
            return self.unauthorized(message="authentication_required")

        subject = User.objects.filter(pk=user_id).first()
        if subject is None:
            return self.not_found("User not found.")

        if not require_ai_memory_manage(actor, user_id):
            return self.forbidden("You cannot edit this user's AI memory.")

        if "monthly_usd_limit" in request.data:
            if actor.id == user_id:
                return self.forbidden("You cannot change your own AI limit.")
            if not require_ai_memory_manage_all(actor):
                return self.forbidden("Only administrators can set AI limits.")

        ser = UserAIPreferencesSerializer(data=request.data, partial=True)
        if not ser.is_valid():
            return self.bad_request(details=ser.errors)

        try:
            prefs = upsert_preferences(subject, **ser.validated_data)
        except ValueError as exc:
            return self.bad_request(details=str(exc))

        tenant = getattr(request, "tenant", None)
        return self.ok(
            preferences_to_dict(prefs, user_id=user_id, tenant=tenant)
        )
