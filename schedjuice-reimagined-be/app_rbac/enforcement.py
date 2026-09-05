# app_rbac/enforcement.py
from __future__ import annotations
import logging
from django.conf import settings
from django.db.models import F

logger = logging.getLogger("rbac.shadow")


def mode() -> str:
    return getattr(settings, "RBAC_ENFORCE", "log_only")


def should_block(missing) -> bool:
    return mode() == "enforce" and bool(missing)


def record_denial(*, schema, view_name, path_pattern, method, missing, roles, legacy_allowed, sample):
    """Record a would-be denial (log_only). Never raises."""
    try:
        from app_rbac_audit.models import ShadowDenial
        sig = ",".join(sorted(roles or []))
        codes = sorted(missing)
        obj, created = ShadowDenial.objects.get_or_create(
            schema_name=schema, view_name=view_name, method=method,
            role_signature=sig, missing_codes=codes,
            defaults={"path_pattern": path_pattern, "legacy_allowed": legacy_allowed, "sample": sample},
        )
        if not created:
            ShadowDenial.objects.filter(pk=obj.pk).update(hit_count=F("hit_count") + 1)
        logger.info("rbac_shadow_denial view=%s method=%s roles=%s missing=%s", view_name, method, sig, codes)
    except Exception:
        logger.exception("rbac: record_denial failed view=%s", view_name)
