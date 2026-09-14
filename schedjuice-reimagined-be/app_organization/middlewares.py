from django.conf import settings
from decouple import config
from tenant_schemas.middleware import BaseTenantMiddleware

from app_organization.tenant_resolution_cache import (
    PUBLIC_CACHE_KEY,
    domain_cache_key,
    load_with_cache,
    normalize_domain_for_tenant_lookup,
    schema_cache_key,
)


class XHeaderTenantMiddleware(BaseTenantMiddleware):
    """
    Determines tenant from (in order):

    1) ``X-Tenant`` or ``Tenant`` request header (exact schema name).
    2) ``X-DTS-Schema`` header (local tests / legacy).
    3) ``Origin`` header (browser; hostname matched to ``Organization.domain_url``).
    4) ``/media/<domain>/…`` path extraction.
    5) ``DEV_TENANT_DOMAIN`` env (pins lookup on staging; no ``IS_DEV`` required).
       ``IS_DEV`` alone falls back to ``DEV_TENANT_DOMAIN`` or ``schedjuice.thiha.net``.
    6) PostgreSQL ``public`` Organization row (fallback when nothing else matches).
    """

    def get_tenant(self, model, hostname, request):
        timeout = getattr(settings, "TENANT_RESOLUTION_CACHE_TIMEOUT", 60)

        schema_header = (
            (request.META.get("HTTP_X_TENANT") or "").strip()
            or (request.META.get("HTTP_TENANT") or "").strip()
            or (request.META.get("HTTP_X_DTS_SCHEMA") or "").strip()
        )
        if schema_header:
            schema_name = schema_header
            if schema_name == "public":
                return load_with_cache(
                    model,
                    PUBLIC_CACHE_KEY,
                    lambda: model.objects.get(is_public=True),
                    timeout=timeout,
                )
            return load_with_cache(
                model,
                schema_cache_key(schema_name),
                lambda: model.objects.get(schema_name=schema_name),
                timeout=timeout,
            )

        domain_name = request.META.get("HTTP_ORIGIN")

        if request.META["PATH_INFO"].startswith("/media/"):
            domain_name = request.META["PATH_INFO"].split("/")[2].replace("/", "")

        dev_tenant_domain = (config("DEV_TENANT_DOMAIN", "") or "").strip()
        if dev_tenant_domain:
            domain_name = dev_tenant_domain
        elif config("IS_DEV", False, cast=bool):
            domain_name = config("DEV_TENANT_DOMAIN", "schedjuice.thiha.net")
        if domain_name:
            if domain_name == "public":
                return load_with_cache(
                    model,
                    PUBLIC_CACHE_KEY,
                    lambda: model.objects.get(is_public=True),
                    timeout=timeout,
                )
            normalized = normalize_domain_for_tenant_lookup(domain_name)
            cache_key = domain_cache_key(normalized)
            return load_with_cache(
                model,
                cache_key,
                lambda: model.objects.get(domain_url=normalized),
                timeout=timeout,
            )

        return load_with_cache(
            model,
            PUBLIC_CACHE_KEY,
            lambda: model.objects.get(is_public=True),
            timeout=timeout,
        )
