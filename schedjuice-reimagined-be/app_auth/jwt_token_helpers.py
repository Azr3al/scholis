"""
Helpers for JWTs scoped to exactly one Postgres tenant schema.

Access tokens MUST carry TENANT_SCHEMA_CLAIM; authentication rejects mismatches against
django-tenant's request.tenant (see schedjuice_backend.jwt_authentication).
"""

from __future__ import annotations

from rest_framework_simplejwt.tokens import RefreshToken

from app_auth.models import User


# Claim name duplicated in jwt_authentication (DRF JWT); keep literal stable for clients.
JWT_TENANT_SCHEMA_CLAIM = "tenant_schema"


def issue_refresh_pair_for_tenant(user: User, tenant_schema: str) -> tuple[str, str]:
    """
    Build (refresh_token_str, access_token_str) bound to tenant_schema.

    Both tokens include JWT_TENANT_SCHEMA_CLAIM.
    """
    refresh = RefreshToken.for_user(user)
    refresh[JWT_TENANT_SCHEMA_CLAIM] = tenant_schema
    access = refresh.access_token
    access[JWT_TENANT_SCHEMA_CLAIM] = tenant_schema
    return str(refresh), str(access)


def reissue_tokens_with_tenant_claim(
    existing_refresh_token: str, tenant_schema: str
) -> tuple[str, str]:
    """
    Decode/modify refresh from TokenObtainPairSerializer output and propagate claim to access.
    """
    refresh = RefreshToken(existing_refresh_token)
    refresh[JWT_TENANT_SCHEMA_CLAIM] = tenant_schema
    access = refresh.access_token
    access[JWT_TENANT_SCHEMA_CLAIM] = tenant_schema
    return str(refresh), str(access)
