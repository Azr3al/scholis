# app_rbac/resolution.py
from __future__ import annotations
import hashlib
from django.core.cache import cache
from django.db import connection
from app_rbac import catalog
from app_rbac.cache import matrix_generation

_PERMSET_TTL = 3600
SUPERADMIN = "superadmin"


def _current_schema() -> str:
    return getattr(connection, "schema_name", None) or "public"


def _db_codes_for_roles(roles: list[str]) -> set[str]:
    """Union of RolePermission codes for the given role slugs (current tenant schema)."""
    from app_rbac.models import RolePermission
    return set(
        RolePermission.objects.filter(role__slug__in=roles)
        .values_list("permission_code", flat=True)
    )


def resolve_for_roles(roles, schema: str | None = None) -> frozenset[str]:
    roles = list(roles or [])
    if SUPERADMIN in roles:
        return catalog.ALL_CODES
    schema = schema or _current_schema()
    gen = matrix_generation(schema)
    role_key = hashlib.sha256(",".join(sorted(roles)).encode()).hexdigest()[:16]
    key = f"rbac:permset:v1:{schema}:g{gen}:{role_key}"

    def compute():
        codes = _db_codes_for_roles(roles)
        # defense in depth: only superadmin (handled above) may hold platform-internal codes
        return sorted(codes - catalog.PLATFORM_INTERNAL_CODES)

    try:
        return frozenset(cache.get_or_set(key, compute, _PERMSET_TTL))
    except Exception:
        return frozenset(compute())  # never fail on cache errors


def _roles_for_user(user) -> list[str]:
    roles = getattr(user, "roles", None) or []
    if roles:
        return list(roles)
    # JWTStatelessUserAuthentication sets user.id to email without roles.
    user_id = getattr(user, "id", None)
    if isinstance(user_id, str) and "@" in user_id:
        from app_auth.models import User

        db_user = User.objects.filter(email=user_id).only("roles").first()
        if db_user and db_user.roles:
            return list(db_user.roles)
    return []


def roles_for_user(user) -> list[str]:
    """Resolve role slugs for JWT stateless users (email id) and ORM User rows."""
    return _roles_for_user(user)


def effective_permissions(user) -> frozenset[str]:
    if user is None or not getattr(user, "is_authenticated", False):
        return frozenset()
    # Memoized on the (per-request) user object: the RBAC permission class and
    # the view body both resolve permissions, and each resolve costs a cache
    # round-trip plus deserialization.
    cached = getattr(user, "_effective_permissions_cache", None)
    if cached is not None:
        return cached
    result = resolve_for_roles(_roles_for_user(user))
    try:
        user._effective_permissions_cache = result
    except AttributeError:
        pass  # some user objects (e.g. SimpleLazyObject edge cases) may refuse attrs
    return result
