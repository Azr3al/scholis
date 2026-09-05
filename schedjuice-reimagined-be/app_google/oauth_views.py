"""Google OAuth redirect views (login + profile link)."""

from __future__ import annotations

import logging
from typing import Any
from urllib.parse import urlencode

from django.http import HttpResponse, HttpResponseRedirect
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_google.google_auth import GoogleTokenVerificationError
from app_google.handoff import GoogleHandoffError, consume_handoff_code, create_handoff_code
from app_google.calendar_linking import GoogleCalendarLinkError, link_google_calendar
from app_google.linking import GoogleLinkError, link_google_account
from app_google.login_user import verify_token_and_resolve_user
from app_google.oauth import (
    GoogleOAuthError,
    GoogleOAuthPurpose,
    OAuthReturnOriginError,
    OAuthStateError,
    build_authorize_url,
    build_calendar_link_authorize_url,
    build_state_token,
    exchange_code,
    parse_return_path,
    parse_state_token,
    resolve_org_from_return_origin,
    validate_return_origin_for_org,
)
from app_google.session import build_google_login_session_payload
from app_organization.models import Organization
from app_rbac.views import RBACPermission, RBACView
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication
from utilitas.views import Request as SJRequest

logger = logging.getLogger(__name__)


def _public_org_for_schema(schema_name: str) -> Organization | None:
    with schema_context(get_public_schema_name()):
        return Organization.objects.filter(schema_name=schema_name).first()


def _current_tenant_organization() -> Organization | None:
    from django.db import connection

    schema = getattr(connection, "schema_name", None) or ""
    public = get_public_schema_name()
    if not schema or schema == public:
        return None
    return _public_org_for_schema(schema)


def _tenant_user_id(request: SJRequest) -> int | None:
    user = getattr(request, "user", None)
    if user is None:
        return None
    if isinstance(user, User):
        return user.id
    return User.objects.filter(email=user.id).values_list("id", flat=True).first()


def _tenant_user(request: SJRequest) -> User | None:
    user = getattr(request, "user", None)
    if user is None:
        return None
    if isinstance(user, User):
        return user
    if not getattr(user, "id", None):
        return None
    return User.objects.filter(email=user.id).first()


def _google_redirect(
    return_origin: str,
    return_path: str,
    *,
    params: dict[str, str],
) -> HttpResponseRedirect:
    query = urlencode({key: value for key, value in params.items() if value})
    base = return_origin.rstrip("/")
    path = return_path if return_path.startswith("/") else f"/{return_path}"
    url = f"{base}{path}?{query}" if query else f"{base}{path}"
    return HttpResponseRedirect(url)


def _login_error_redirect(
    return_origin: str,
    return_path: str,
    message: str,
    details: str = "",
) -> HttpResponseRedirect:
    return _google_redirect(
        return_origin,
        return_path,
        params={
            "google_oauth": "error",
            "google_oauth_message": message,
            "google_oauth_details": details[:500],
        },
    )


def _link_result_redirect(
    return_origin: str,
    return_path: str,
    *,
    ok: bool,
    message: str = "",
) -> HttpResponseRedirect:
    return _google_redirect(
        return_origin,
        return_path,
        params={
            "google_oauth": "success" if ok else "error",
            "google_oauth_message": message[:500] if message else "",
        },
    )


def _validation_error_fields(exc: ValidationError) -> tuple[str, str]:
    detail = exc.detail
    if isinstance(detail, dict):
        message = detail.get("message", "")
        if isinstance(message, list):
            message = message[0] if message else ""
        details = detail.get("details", "")
        if isinstance(details, list):
            details = details[0] if details else ""
        return str(message), str(details)
    return "google_auth_invalid", str(detail)


def _remember_from_request(request) -> bool:
    raw = request.GET.get("remember")
    if raw is None:
        return False
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}


class GoogleOAuthLoginStartView(APIView):
    """GET: redirect browser to Google for tenant login."""

    authentication_classes: list = []
    permission_classes = [RBACPermission]
    rbac_decision = "public"

    def get(self, request):
        return_origin_raw = request.GET.get("return_origin", "")
        return_path_raw = request.GET.get("return_path")
        try:
            org = resolve_org_from_return_origin(return_origin_raw)
            return_origin = validate_return_origin_for_org(return_origin_raw, org)
            return_path = parse_return_path(return_path_raw, default="/login")
        except OAuthReturnOriginError as exc:
            return Response({"message": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        from app_google.login_user import assert_google_login_enabled

        try:
            assert_google_login_enabled(org)
        except ValidationError as exc:
            message, details = _validation_error_fields(exc)
            return _login_error_redirect(return_origin_raw, "/login", message, details)

        payload = {
            "purpose": GoogleOAuthPurpose.LOGIN.value,
            "schema_name": org.schema_name,
            "organization_id": org.id,
            "return_origin": return_origin,
            "return_path": return_path,
            "remember": _remember_from_request(request),
        }
        try:
            authorize_url = build_authorize_url(build_state_token(payload))
        except GoogleOAuthError as exc:
            return Response({"message": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return HttpResponseRedirect(authorize_url)


class GoogleOAuthLinkStartView(RBACView):
    """GET: return authorize_url to link Google on the current user's profile."""

    name = "Google OAuth link start"
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    rbac_decision = "authenticated_only"

    def get(self, request: SJRequest, *args, **kwargs):
        org = _current_tenant_organization()
        if not org:
            return self.send_response(
                True,
                "bad_request",
                {"details": "Tenant context is required."},
                status=400,
            )
        user_id = _tenant_user_id(request)
        if not user_id:
            return self.send_response(
                True,
                "bad_request",
                {"details": "User context is required."},
                status=400,
            )
        return_origin_raw = request.GET.get("return_origin", "")
        return_path_raw = request.GET.get("return_path")
        try:
            return_origin = validate_return_origin_for_org(return_origin_raw, org)
            return_path = parse_return_path(return_path_raw, default="/organizations/profile")
        except OAuthReturnOriginError as exc:
            return self.send_response(True, "bad_request", {"details": str(exc)}, status=400)

        from app_google.linking import assert_google_enabled, assert_google_oauth_configured

        try:
            assert_google_enabled(org)
            assert_google_oauth_configured()
        except GoogleLinkError as exc:
            return self.send_response(True, "bad_request", {"details": str(exc)}, status=400)

        payload = {
            "purpose": GoogleOAuthPurpose.LINK.value,
            "schema_name": org.schema_name,
            "organization_id": org.id,
            "return_origin": return_origin,
            "return_path": return_path,
            "schedjuice_user_id": user_id,
        }
        try:
            authorize_url = build_authorize_url(build_state_token(payload))
        except GoogleOAuthError as exc:
            return self.send_response(True, "bad_request", {"details": str(exc)}, status=400)

        return self.send_response(False, "ok", {"authorize_url": authorize_url}, status=200)


class GoogleOAuthCalendarLinkStartView(RBACView):
    """GET: return authorize_url to connect Google Calendar for consultations."""

    name = "Google OAuth calendar link start"
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    rbac_decision = "authenticated_only"

    def get(self, request: SJRequest, *args, **kwargs):
        org = _current_tenant_organization()
        if not org:
            return self.send_response(
                True,
                "bad_request",
                {"details": "Tenant context is required."},
                status=400,
            )
        user_id = _tenant_user_id(request)
        if not user_id:
            return self.send_response(
                True,
                "bad_request",
                {"details": "User context is required."},
                status=400,
            )
        return_origin_raw = request.GET.get("return_origin", "")
        return_path_raw = request.GET.get("return_path")
        try:
            return_origin = validate_return_origin_for_org(return_origin_raw, org)
            return_path = parse_return_path(return_path_raw, default="/organizations/profile")
        except OAuthReturnOriginError as exc:
            return self.send_response(True, "bad_request", {"details": str(exc)}, status=400)

        from app_google.linking import assert_google_enabled, assert_google_oauth_configured

        try:
            assert_google_enabled(org)
            assert_google_oauth_configured()
        except GoogleLinkError as exc:
            return self.send_response(True, "bad_request", {"details": str(exc)}, status=400)

        payload = {
            "purpose": GoogleOAuthPurpose.CALENDAR_LINK.value,
            "schema_name": org.schema_name,
            "organization_id": org.id,
            "return_origin": return_origin,
            "return_path": return_path,
            "schedjuice_user_id": user_id,
        }
        try:
            authorize_url = build_calendar_link_authorize_url(build_state_token(payload))
        except GoogleOAuthError as exc:
            return self.send_response(True, "bad_request", {"details": str(exc)}, status=400)

        return self.send_response(False, "ok", {"authorize_url": authorize_url}, status=200)


class GoogleOAuthCallbackView(APIView):
    """Google redirects here with code and state (no JWT)."""

    authentication_classes: list = []
    permission_classes = [RBACPermission]
    rbac_decision = "public"

    def get(self, request) -> HttpResponse:
        fallback_origin = "http://localhost:3000"
        fallback_path = "/login"

        err = request.GET.get("error")
        if err:
            desc = request.GET.get("error_description") or err
            return _login_error_redirect(fallback_origin, fallback_path, "google_auth_invalid", desc)

        code = request.GET.get("code")
        state_raw = request.GET.get("state")
        if not code or not state_raw:
            return _login_error_redirect(
                fallback_origin,
                fallback_path,
                "google_auth_invalid",
                "Missing authorization code or state.",
            )

        try:
            state = parse_state_token(state_raw)
        except OAuthStateError as exc:
            return _login_error_redirect(
                fallback_origin, fallback_path, "google_auth_invalid", str(exc)
            )

        return_origin = str(state.get("return_origin") or fallback_origin)
        return_path = str(state.get("return_path") or fallback_path)
        schema_name = str(state.get("schema_name") or "").strip()
        purpose_raw = str(state.get("purpose") or "").strip()

        try:
            purpose = GoogleOAuthPurpose(purpose_raw)
        except ValueError:
            return _login_error_redirect(
                return_origin,
                return_path,
                "google_auth_invalid",
                "Invalid OAuth state purpose.",
            )

        org = _public_org_for_schema(schema_name)
        if not org or int(state.get("organization_id") or 0) != org.id:
            return _login_error_redirect(
                return_origin,
                return_path,
                "google_auth_invalid",
                "Unknown tenant in OAuth state.",
            )

        try:
            if purpose is GoogleOAuthPurpose.CALENDAR_LINK:
                token_data = exchange_code(code, require_id_token=False)
            else:
                token_data = exchange_code(code)
            id_token = token_data.get("id_token")
        except GoogleOAuthError as exc:
            logger.warning("Google OAuth code exchange failed: %s", exc)
            if purpose in (GoogleOAuthPurpose.LINK, GoogleOAuthPurpose.CALENDAR_LINK):
                return _link_result_redirect(
                    return_origin, return_path, ok=False, message=str(exc)
                )
            return _login_error_redirect(
                return_origin, return_path, "google_auth_invalid", str(exc)
            )

        if purpose is GoogleOAuthPurpose.LOGIN:
            if not id_token:
                return _login_error_redirect(
                    return_origin,
                    return_path,
                    "google_auth_invalid",
                    "Missing id_token from Google.",
                )
            return self._complete_login(request, org, state, return_origin, return_path, id_token)
        if purpose is GoogleOAuthPurpose.CALENDAR_LINK:
            return self._complete_calendar_link(org, state, return_origin, return_path, token_data)
        if not id_token:
            return _link_result_redirect(
                return_origin,
                return_path,
                ok=False,
                message="Missing id_token from Google.",
            )
        return self._complete_link(org, state, return_origin, return_path, id_token)

    def _complete_login(
        self,
        request,
        org: Organization,
        state: dict[str, Any],
        return_origin: str,
        return_path: str,
        id_token: str,
    ) -> HttpResponse:
        remembered = bool(state.get("remember"))
        try:
            with schema_context(org.schema_name):
                user = verify_token_and_resolve_user(org, id_token)
                session_payload = build_google_login_session_payload(
                    user,
                    request,
                    org,
                    remembered=remembered,
                )
        except ValidationError as exc:
            message, details = _validation_error_fields(exc)
            return _login_error_redirect(return_origin, return_path, message, details)

        handoff_code = create_handoff_code(session_payload)
        return _google_redirect(
            return_origin,
            return_path,
            params={"google_handoff": handoff_code},
        )

    def _complete_link(
        self,
        org: Organization,
        state: dict[str, Any],
        return_origin: str,
        return_path: str,
        id_token: str,
    ) -> HttpResponse:
        user_id = int(state.get("schedjuice_user_id") or 0)
        if not user_id:
            return _link_result_redirect(
                return_origin,
                return_path,
                ok=False,
                message="User context missing from OAuth state.",
            )
        try:
            with schema_context(org.schema_name):
                user = User.objects.filter(id=user_id).first()
                if user is None:
                    raise GoogleLinkError("User not found.")
                link_google_account(user, id_token, org=org)
        except GoogleLinkError as exc:
            return _link_result_redirect(
                return_origin, return_path, ok=False, message=str(exc)
            )
        except GoogleTokenVerificationError as exc:
            return _link_result_redirect(
                return_origin, return_path, ok=False, message=str(exc)
            )

        return _link_result_redirect(return_origin, return_path, ok=True)

    def _complete_calendar_link(
        self,
        org: Organization,
        state: dict[str, Any],
        return_origin: str,
        return_path: str,
        token_data: dict[str, Any],
    ) -> HttpResponse:
        user_id = int(state.get("schedjuice_user_id") or 0)
        if not user_id:
            return _link_result_redirect(
                return_origin,
                return_path,
                ok=False,
                message="User context missing from OAuth state.",
            )
        try:
            with schema_context(org.schema_name):
                user = User.objects.filter(id=user_id).first()
                if user is None:
                    raise GoogleCalendarLinkError("User not found.")
                link_google_calendar(user, token_data, org=org)
        except GoogleCalendarLinkError as exc:
            return _link_result_redirect(
                return_origin, return_path, ok=False, message=str(exc)
            )

        return _link_result_redirect(return_origin, return_path, ok=True)


class GoogleOAuthHandoffExchangeView(APIView):
    """POST: exchange one-time handoff code for login session payload."""

    authentication_classes: list = []
    permission_classes = [RBACPermission]
    rbac_decision = "public"

    def post(self, request):
        code = (request.data or {}).get("code") or (request.data or {}).get(
            "google_handoff"
        )
        try:
            payload = consume_handoff_code(str(code or ""))
        except GoogleHandoffError as exc:
            return Response(
                {
                    "is_error": True,
                    "message": "google_auth_invalid",
                    "details": str(exc),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(payload, status=status.HTTP_200_OK)
