"""
JWT authentication with tenant/schema binding.

Stateless JWTs identify users only by USER_ID_FIELD (email). Without a tenant claim,
a valid access token issued in tenant A combined with middleware that resolves tenant B
(or the public/org schema) yields the wrong row for that email—or a different person's
same email—while still passing IsAuthenticated checks.

Tokens issued after login include jwt_token_helpers.JWT_TENANT_SCHEMA_CLAIM matching the
tenant at login time; we require it to equal request.tenant.schema_name on each request.
"""

from __future__ import annotations

from rest_framework_simplejwt.authentication import JWTStatelessUserAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed

from app_auth.jwt_token_helpers import JWT_TENANT_SCHEMA_CLAIM


def assert_token_matches_tenant_schema(validated_token, tenant_schema: str | None) -> None:
    """Reject tokens whose tenant claim does not match the request/connect tenant."""
    if not tenant_schema:
        raise AuthenticationFailed("Token tenant does not match request tenant.")
    try:
        token_schema = validated_token[JWT_TENANT_SCHEMA_CLAIM]
    except KeyError as exc:
        raise AuthenticationFailed(
            "Token is missing tenant scope; please sign in again."
        ) from exc
    if token_schema != tenant_schema:
        raise AuthenticationFailed("Token tenant does not match request tenant.")


class TenantBoundJWTStatelessAuthentication(JWTStatelessUserAuthentication):
    """
    Same as JWTStatelessUserAuthentication, but rejects tokens whose tenant claim
    doesn't match django-tenant's request.tenant.
    """

    def authenticate(self, request):
        result = super().authenticate(request)
        if result is None:
            return None
        validated_token = result[1]
        tenant_obj = getattr(request, "tenant", None)
        tenant_schema = tenant_obj.schema_name if tenant_obj is not None else None
        assert_token_matches_tenant_schema(validated_token, tenant_schema)
        return result
