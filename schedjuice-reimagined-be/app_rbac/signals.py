# app_rbac/signals.py
from django.db.models.signals import post_save, post_delete
from django.db import connection
from app_rbac.models import Role, RolePermission
from app_rbac.cache import bump_matrix_generation
from app_rbac.realtime import broadcast_rbac_updated_to_tenant


def _schema_name() -> str:
    return getattr(connection, "schema_name", None) or "public"


def _bump_and_broadcast(*args, **kwargs):
    schema = _schema_name()
    bump_matrix_generation(schema)
    broadcast_rbac_updated_to_tenant(schema)


for _model in (Role, RolePermission):
    post_save.connect(
        _bump_and_broadcast,
        sender=_model,
        dispatch_uid=f"rbac_bump_save_{_model.__name__}",
    )
    post_delete.connect(
        _bump_and_broadcast,
        sender=_model,
        dispatch_uid=f"rbac_bump_del_{_model.__name__}",
    )
