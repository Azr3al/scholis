"""
JWT + tenant auth middleware for WebSocket connections.
Expects query string: ?token=<jwt_access_token>&tenant=<schema_name>
"""
import urllib.parse

from channels.db import database_sync_to_async
from django.conf import settings
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed, InvalidToken

from schedjuice_backend.jwt_authentication import assert_token_matches_tenant_schema
from app_organization.tenant_resolution_cache import load_with_cache, schema_cache_key
from tenant_schemas.utils import get_public_schema_name, get_tenant_model, schema_context


def _parse_query_params(query_string):
    """Parse query string into dict."""
    if not query_string:
        return {}
    return dict(urllib.parse.parse_qsl(query_string.decode() if isinstance(query_string, bytes) else query_string))


def _get_user_from_token(token, schema_name):
    """Validate JWT and return User. Returns None if invalid. Must run in schema_context."""
    if not token or not schema_name or schema_name == "public":
        return None
    try:
        with schema_context(schema_name):
            jwt_auth = JWTAuthentication()
            validated_token = jwt_auth.get_validated_token(token)
            assert_token_matches_tenant_schema(validated_token, schema_name)
            return jwt_auth.get_user(validated_token)
    except (InvalidToken, AuthenticationFailed, Exception):
        return None


def _get_tenant_schema(tenant_param):
    """Resolve tenant schema name. Returns None if invalid. Must run in public schema."""
    if not tenant_param:
        return None
    if tenant_param == "public":
        return "public"
    try:
        with schema_context(get_public_schema_name()):
            Tenant = get_tenant_model()
            timeout = getattr(settings, "TENANT_RESOLUTION_CACHE_TIMEOUT", 60)
            tenant = load_with_cache(
                Tenant,
                schema_cache_key(tenant_param),
                lambda: Tenant.objects.get(schema_name=tenant_param),
                timeout=timeout,
            )
            return tenant.schema_name
    except Tenant.DoesNotExist:
        return None


@database_sync_to_async
def _get_user_and_tenant_async(token, tenant_param):
    """Run sync auth in async context."""
    schema = _get_tenant_schema(tenant_param)
    user = _get_user_from_token(token, schema) if schema else None
    return user, schema


class JWTTokenAuthMiddleware:
    """
    Custom middleware that authenticates WebSocket connections via JWT in query string.
    Sets scope["user"] and scope["tenant_schema"].
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "websocket":
            await self.app(scope, receive, send)
            return

        params = _parse_query_params(scope.get("query_string", b""))
        token = params.get("token") or params.get("access")
        tenant_param = params.get("tenant")

        user, tenant_schema = await _get_user_and_tenant_async(token, tenant_param)

        scope["user"] = user if user else AnonymousUser()
        scope["tenant_schema"] = tenant_schema

        await self.app(scope, receive, send)


def JWTTokenAuthMiddlewareStack(app):
    """Stack that applies JWT auth before passing to inner app."""
    return JWTTokenAuthMiddleware(app)
