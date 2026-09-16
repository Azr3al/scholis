# app_rbac/seeding.py
from django.db import connection
from app_rbac.models import Role, RolePermission
from app_rbac.cache import bump_matrix_generation
from app_rbac import defaults


def seed_rbac():
    for slug, meta in defaults.SYSTEM_ROLES.items():
        Role.objects.update_or_create(
            slug=slug,
            defaults={
                "display_name": meta["display_name"],
                "is_system": True,
                "is_assignable": meta.get("is_assignable", True),
            },
        )
    for slug, codes in defaults.DEFAULT_MATRIX.items():
        role = Role.objects.get(slug=slug)
        existing = set(RolePermission.objects.filter(role=role).values_list("permission_code", flat=True))
        to_add = set(codes) - existing
        RolePermission.objects.bulk_create(
            [RolePermission(role=role, permission_code=c) for c in to_add]
        )
    bump_matrix_generation(getattr(connection, "schema_name", None) or "public")
