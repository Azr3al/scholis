"""Frontend URL builders for AI tool payloads and responses."""
from __future__ import annotations

from typing import Any

from django.db import connection
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_organization.models import Organization


def get_current_org() -> Organization | None:
    schema = getattr(connection, "schema_name", None) or ""
    if not schema or schema == get_public_schema_name():
        return None
    cache = getattr(connection, "_ai_current_org_cache", None)
    if isinstance(cache, dict) and schema in cache:
        return cache[schema]
    with schema_context(get_public_schema_name()):
        org = Organization.objects.filter(schema_name=schema).first()
    if cache is None:
        cache = {}
        connection._ai_current_org_cache = cache
    cache[schema] = org
    return org


def build_frontend_url(org: Organization, path: str) -> str:
    domain = (org.domain_url or "").strip().rstrip("/")
    if not domain:
        return ""
    if not path.startswith("/"):
        path = f"/{path}"
    return f"https://{domain}{path}"


def user_profile_url(org: Organization, user_id: int) -> str:
    return build_frontend_url(org, f"/users/{user_id}")


def course_url(org: Organization, course_id: int) -> str:
    return build_frontend_url(org, f"/courses/{course_id}")


def course_member_edit_url(org: Organization, course_id: int) -> str:
    return build_frontend_url(org, f"/courses/{course_id}/edit?tab=edit-members")


def compact_user_for_ai(user: User, *, org: Organization | None = None) -> dict[str, Any]:
    row = {
        "id": user.id,
        "name": user.name,
        "primary_email": (user.email or "").strip(),
    }
    return with_user_link(row, org=org)


def with_user_link(row: dict[str, Any], *, org: Organization | None = None) -> dict[str, Any]:
    org = org or get_current_org()
    if org is None:
        return row
    url = user_profile_url(org, int(row["id"]))
    if not url:
        return row
    return {**row, "profile_url": url}


def with_course_link(row: dict[str, Any], *, org: Organization | None = None) -> dict[str, Any]:
    org = org or get_current_org()
    if org is None:
        return row
    course_id = row.get("course_id", row.get("id"))
    if course_id is None:
        return row
    url = course_url(org, int(course_id))
    if not url:
        return row
    return {**row, "url": url}
