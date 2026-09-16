from __future__ import annotations

from django.conf import settings
from django.db import connection
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import BasePermission

from app_auth.models import User
from app_demo.tenant_access import is_demo_tenant_schema
from app_organization.permissions import RequiresPlatformAdminTenant
from app_rbac.resolution import effective_permissions, roles_for_user


class DemoGuidePermission(BasePermission):
    """Allow debug.access holders or school admins on a demo tenant."""

    def has_permission(self, request, view):
        if not request.user or not getattr(request.user, "is_authenticated", False):
            return False

        if "debug.access" in effective_permissions(request.user):
            return True

        roles = getattr(request.user, "roles", []) or []
        if "admin" not in roles:
            raise PermissionDenied("You don't have permission to perform this action.")

        schema_name = getattr(connection, "schema_name", None)
        if not schema_name or not is_demo_tenant_schema(schema_name):
            raise PermissionDenied("You don't have permission to perform this action.")

        return True


class RequiresDemoProvisionAccess(BasePermission):
    """DEBUG-only demo provisioning for superadmin on platform admin tenant."""

    message = "Demo provisioning is only available in dev/staging for superadmins."

    def has_permission(self, request, view):
        if not settings.DEBUG:
            raise PermissionDenied(
                "Demo provisioning from the UI is disabled in production."
            )
        if "debug.access" not in effective_permissions(request.user):
            return False
        if User.UserRole.SUPERADMIN not in roles_for_user(request.user):
            return False
        return RequiresPlatformAdminTenant().has_permission(request, view)
