"""Build authenticated session payloads after Google login."""

from __future__ import annotations

from app_auth.refresh_sessions import create_refresh_session
from app_auth.serializers import UserSerializer, create_user_login_log, enrich_user_payload_for_auth
from app_auth.models import User
from app_organization.models import Organization


def build_google_login_session_payload(
    user: User,
    request,
    org: Organization,
    *,
    remembered: bool,
) -> dict:
    session_data = create_refresh_session(user, request, remembered=remembered)
    tenant_schema = org.schema_name
    user_data = UserSerializer(user, expand=["visibility"]).data
    payload = dict(session_data)
    payload["schema_name"] = tenant_schema
    payload["user"] = enrich_user_payload_for_auth(user, user_data, tenant_schema)
    create_user_login_log(user)
    return payload
