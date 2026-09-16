from rest_framework import permissions

from app_auth.models import User


def get_user(obj_id: str):
    return User.objects.filter(email=obj_id).first()


class BasePermission(permissions.BasePermission):
    pass


def HasUserRole(role) -> type[BasePermission]:
    """Factory for role-gated permission classes."""
    role_value = role.value if hasattr(role, "value") else role

    class _RolePermission(BasePermission):
        def has_permission(self, request, view):
            user = get_user(request.user.id)
            return user is not None and role_value in user.roles

    _RolePermission.__name__ = f"Is{role_value.title().replace('_', '')}"
    _RolePermission.__qualname__ = _RolePermission.__name__
    return _RolePermission


IsSuperAdmin = HasUserRole(User.UserRole.SUPERADMIN)
IsAdmin = HasUserRole(User.UserRole.ADMIN)
IsHR = HasUserRole(User.UserRole.HR)
IsManager = HasUserRole(User.UserRole.MANAGER)
IsFinance = HasUserRole(User.UserRole.FINANCE)
IsStudent = HasUserRole(User.UserRole.STUDENT)


class IsMemberOfOrganization(BasePermission):
    """
    Determines whether a User belongs to an Organization.
    """

    def has_object_permission(self, request, view, obj):
        user = get_user(request.user.id)
        if not user:
            return False
        tenant = getattr(request, "tenant", None)
        if tenant is None:
            return False
        obj_schema = getattr(obj, "schema_name", None)
        if not obj_schema:
            return False
        return tenant.schema_name == obj_schema


class IsReadOnly(BasePermission):
    def has_permission(self, request, view):
        return request.method == "GET"
