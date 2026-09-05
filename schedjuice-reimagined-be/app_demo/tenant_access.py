from __future__ import annotations

from tenant_schemas.utils import get_public_schema_name, schema_context

from app_organization.models import Organization


def brief_slug_from_schema(schema_name: str) -> str | None:
    if not schema_name.startswith("xdemo_"):
        return None
    return schema_name.removeprefix("xdemo_").replace("_", "-")


def is_demo_tenant_schema(schema_name: str) -> bool:
    if not brief_slug_from_schema(schema_name):
        return False
    with schema_context(get_public_schema_name()):
        org = Organization.objects.filter(schema_name=schema_name).first()
        return org is not None and org.is_demo
