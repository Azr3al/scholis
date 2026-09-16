"""Resolve an explicit organization for platform-admin tool APIs."""

from rest_framework.exceptions import ValidationError
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_organization.models import Organization


def resolve_target_organization(request) -> Organization:
    """Return the Organization identified by ``organization_id``.

    Accepts ``organization_id`` from query params (GET) or request body (POST).
    Rejects missing/invalid ids. Includes the admin organization when requested.
    """
    params = getattr(request, "query_params", None)
    if params is not None:
        raw = params.get("organization_id")
    else:
        raw = request.GET.get("organization_id")

    if raw is None and hasattr(request, "data"):
        raw = (request.data or {}).get("organization_id")

    if raw is None or raw == "":
        raise ValidationError({"organization_id": "This field is required."})

    try:
        org_id = int(raw)
    except (TypeError, ValueError) as exc:
        raise ValidationError({"organization_id": "Must be an integer."}) from exc

    with schema_context(get_public_schema_name()):
        org = Organization.objects.filter(id=org_id).first()

    if org is None:
        raise ValidationError({"organization_id": "Organization not found."})
    return org
