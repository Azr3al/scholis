from __future__ import annotations

from rest_framework.permissions import IsAuthenticated

from app_ai.reporting import parse_year_month
from app_auth.home_dashboard_services import build_home_dashboard
from app_auth.models import User
from app_rbac.views import RBACPermission, RBACView
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication


class HomeDashboardView(RBACView):
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [IsAuthenticated, RBACPermission]
    rbac_decision = "authenticated_only"

    def get(self, request):
        user = User.objects.filter(email=request.user.id).first()
        if not user:
            return self.send_response(
                True,
                "not_found",
                {"details": "User not found."},
                status=404,
            )
        year_param = request.query_params.get("year")
        month_param = request.query_params.get("month")
        if year_param is None and month_param is None:
            year = None
            month = None
        else:
            parsed = parse_year_month(year_param, month_param)
            if parsed is None:
                return self.bad_request("Invalid year or month")
            year, month = parsed
        data = build_home_dashboard(
            user,
            year=year,
            month=month,
        )
        return self.ok(data)
