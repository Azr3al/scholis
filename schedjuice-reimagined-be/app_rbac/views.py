# app_rbac/views.py
from __future__ import annotations
from django.db import connection
from rest_framework.permissions import BasePermission
from rest_framework.exceptions import PermissionDenied
from utilitas.views import BaseDetailsView, BaseListView, BaseSearchView, BaseView
from utilitas.serializers import BaseModelSerializer
from app_rbac.resolution import effective_permissions
from app_rbac import enforcement
from app_rbac.models import Role

_SENTINEL_DENY = object()


class _RBACStubSerializer(BaseModelSerializer):
    """Placeholder so RBAC*View mixin bases pass utilitas class validation at import."""

    class Meta:
        model = Role
        fields = ("id", "slug")


def required_codes_for(view, method: str):
    """Return list[str] of codes, [] for explicit opt-out, or RBACView.DENY when undeclared."""
    decision = getattr(view, "rbac_decision", None)
    if decision in ("public", "authenticated_only"):
        return []
    spec = getattr(view, "required_permissions", {}) or {}
    if method in spec:
        codes = spec[method]
        return [codes] if isinstance(codes, str) else list(codes)
    return RBACView.DENY


class RBACPermission(BasePermission):
    def has_permission(self, request, view):
        codes = required_codes_for(view, request.method)
        if codes == []:                       # explicit opt-out
            return True
        held = effective_permissions(request.user)
        if codes is RBACView.DENY:            # undeclared → fail closed
            missing = ["<undeclared>"]
            ok = False
        else:
            missing = [c for c in codes if c not in held]
            ok = not missing
        if ok:
            return True
        # not ok → record, and block only in enforce mode
        enforcement.record_denial(
            schema=getattr(connection, "schema_name", "public"),
            view_name=type(view).__name__,
            path_pattern=getattr(request.resolver_match, "route", request.path) if request.resolver_match else request.path,
            method=request.method,
            missing=missing,
            roles=getattr(request.user, "roles", []) or [],
            legacy_allowed=True,  # log_only relies on legacy classes still attached; see note
            sample={"user_id": getattr(request.user, "id", None), "full_path": request.get_full_path()},
        )
        if enforcement.should_block(missing):
            raise PermissionDenied("You don't have permission to perform this action.")
        return True   # log_only: allow through


class RBACView(BaseView):
    DENY = _SENTINEL_DENY
    required_permissions: dict = {}
    rbac_decision: str | None = None
    permission_classes = [RBACPermission]


class RBACListView(RBACView, BaseListView):
    model = Role
    serializer = _RBACStubSerializer


class RBACDetailsView(RBACView, BaseDetailsView):
    model = Role
    serializer = _RBACStubSerializer


class RBACSearchView(RBACView, BaseSearchView):
    model = Role
    serializer = _RBACStubSerializer
