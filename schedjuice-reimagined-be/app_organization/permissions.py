from rest_framework.permissions import BasePermission

from app_auth.models import User
from app_rbac.resolution import roles_for_user


class RequiresPlatformAdminTenant(BasePermission):
    """Platform org management: superadmin role on an admin tenant only."""

    def has_permission(self, request, view):
        tenant = getattr(request, "tenant", None)
        if not tenant or not getattr(tenant, "is_admin", False):
            return False
        roles = roles_for_user(request.user)
        return User.UserRole.SUPERADMIN in roles


class RequiresSuperadminAiUsageOrgAccess(BasePermission):
    """Superadmin on admin tenant (any org), or superadmin on own tenant only."""

    def has_permission(self, request, view):
        tenant = getattr(request, "tenant", None)
        if not tenant:
            return False
        roles = roles_for_user(request.user)
        if User.UserRole.SUPERADMIN not in roles:
            return False
        if getattr(tenant, "is_admin", False):
            return True
        obj_id = view.kwargs.get("obj_id")
        return obj_id is not None and int(obj_id) == tenant.id


class RequiresOrgTargetAccess(BasePermission):
    """Platform superadmin on admin tenant (any org), or caller on own tenant only."""

    def has_permission(self, request, view):
        tenant = getattr(request, "tenant", None)
        if not tenant:
            return False
        roles = roles_for_user(request.user)
        obj_id = view.kwargs.get("obj_id")
        if obj_id is None:
            return False
        if getattr(tenant, "is_admin", False) and User.UserRole.SUPERADMIN in roles:
            return True
        return int(obj_id) == tenant.id
