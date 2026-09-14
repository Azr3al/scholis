from __future__ import annotations

from django.db import connection
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.home_facts_services import build_home_facts
from app_auth.models import User
from app_organization.models import Organization
from app_rbac.views import RBACPermission, RBACView
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication


def _organization_for_current_schema() -> Organization | None:
    schema_name = connection.schema_name
    with schema_context(get_public_schema_name()):
        return Organization.objects.filter(schema_name=schema_name).first()


class HomeFactsView(RBACView):
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    permission_classes = [IsAuthenticated, RBACPermission]
    required_permissions = {"GET": ["user.view_all", "course.view_all"]}

    def get(self, request):
        user = User.objects.filter(email=request.user.id).first()
        if not user:
            return self.send_response(
                True,
                "not_found",
                {"details": "User not found."},
                status=404,
            )
        organization = _organization_for_current_schema()
        data = build_home_facts(user, organization, now=timezone.now())
        return self.ok(data)
