"""Microsoft OAuth views for per-teacher and org service-account delegated Graph access."""

from __future__ import annotations

import enum
import logging
from typing import Any
from urllib.parse import urlencode

from django.conf import settings
from django.db import connection
from django.http import HttpResponse, HttpResponseRedirect
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_auth.models_user_microsoft_oauth import UserMicrosoftOAuth
from app_organization.models import MicrosoftDelegatedAccount, Organization
from app_organization.permissions import RequiresPlatformAdminTenant
from app_organization.target_tenant import resolve_target_organization
from app_rbac.views import RBACPermission, RBACView
from app_microsoft.oauth import (
    MicrosoftOAuthError,
    OAuthReturnPathError,
    OAuthStateError,
    PKCE_VERIFIER_STATE_KEY,
    apply_connection_from_result,
    build_authorize_url,
    build_state_token,
    exchange_code,
    generate_pkce_pair,
    parse_state_token,
    scopes_for_purpose,
    validate_return_path,
)
from utilitas.views import Request as SJRequest

logger = logging.getLogger(__name__)


class OAuthPurpose(str, enum.Enum):
    CONNECT_PERSONAL = "connect_personal"
    RECONNECT_PERSONAL = "reconnect_personal"
    CONNECT_SERVICE = "connect_service"
    RECONNECT_SERVICE = "reconnect_service"


def _public_org_for_schema(schema_name: str) -> Organization | None:
    with schema_context(get_public_schema_name()):
        return Organization.objects.filter(schema_name=schema_name).first()


def _current_tenant_organization() -> Organization | None:
    schema = getattr(connection, "schema_name", None) or ""
    public = get_public_schema_name()
    if not schema or schema == public:
        return None
    return _public_org_for_schema(schema)


def _resolve_service_account_org(
    request: SJRequest, view
) -> tuple[Organization | None, Response | None]:
    """Org service-account views: session tenant org by default.

    Platform superadmins may target any organization explicitly via an
    ``organization_id`` query/body param (cross-org connect from internal
    tools); everyone else is bound to their own tenant.
    """
    raw = request.GET.get("organization_id")
    if raw is None and hasattr(request, "data"):
        raw = (request.data or {}).get("organization_id")
    if raw in (None, ""):
        return _current_tenant_organization(), None
    if not RequiresPlatformAdminTenant().has_permission(request, view):
        return None, Response(
            {
                "isError": True,
                "message": "forbidden",
                "details": "Only platform superadmins may target another organization.",
            },
            status=403,
        )
    return resolve_target_organization(request), None


def _tenant_user_id(request: SJRequest) -> int | None:
    user = getattr(request, "user", None)
    if user is None:
        return None
    if isinstance(user, User):
        return user.id
    return User.objects.filter(email=user.id).values_list("id", flat=True).first()


def _oauth_redirect(
    org: Organization | None,
    *,
    ok: bool,
    message: str = "",
    post_oauth: str | None = None,
    return_path: str | None = None,
) -> HttpResponse:
    base = (getattr(settings, "FRONTEND_BASE_URL", "") or "").strip().rstrip("/")
    params: dict[str, str] = {}
    if post_oauth == "personal_profile":
        params["microsoft_oauth_personal"] = "success" if ok else "error"
        if message:
            params["microsoft_oauth_personal_message"] = message[:500]
    elif post_oauth == "service_account":
        params["microsoft_oauth_service"] = "success" if ok else "error"
        if message:
            params["microsoft_oauth_service_message"] = message[:500]
    else:
        params["microsoft_oauth"] = "success" if ok else "error"
        if message:
            params["microsoft_oauth_message"] = message[:500]
    query = urlencode(params)
    if base:
        safe_return_path = validate_return_path(return_path)
        if post_oauth in ("personal_profile", "service_account") and safe_return_path:
            url = f"{base}{safe_return_path}?{query}"
        elif post_oauth == "personal_profile":
            params["section"] = "video"
            query = urlencode(params)
            url = f"{base}/organizations/profile?{query}"
        elif post_oauth == "service_account":
            params["section"] = "video"
            query = urlencode(params)
            url = f"{base}/organizations/profile?{query}"
        else:
            url = f"{base}/organizations/profile?{query}"
        return HttpResponseRedirect(url)
    body = (
        f"Microsoft OAuth {'succeeded' if ok else 'failed'}"
        + (f": {message}" if message else "")
        + ". Configure FRONTEND_BASE_URL to redirect to the app."
    )
    return HttpResponse(body, status=200 if ok else 400, content_type="text/plain")


def _tenant_user(request: SJRequest) -> User | None:
    user = getattr(request, "user", None)
    if user is None:
        return None
    if isinstance(user, User):
        return user
    if not getattr(user, "id", None):
        return None
    return User.objects.filter(email=user.id).first()


def _return_path_from_request(request: SJRequest) -> str | None:
    raw = request.GET.get("return_path")
    if raw is None and hasattr(request, "data"):
        data = request.data
        if isinstance(data, dict):
            raw = data.get("return_path")
    if raw is None or str(raw).strip() == "":
        return None
    try:
        return validate_return_path(str(raw))
    except OAuthReturnPathError as e:
        raise ValueError(str(e)) from e


def _build_authorize_for_payload(payload: dict[str, Any], org: Organization) -> str:
    purpose = str(payload.get("purpose") or "")
    scopes = scopes_for_purpose(purpose)
    code_verifier, code_challenge = generate_pkce_pair()
    state = build_state_token({**payload, PKCE_VERIFIER_STATE_KEY: code_verifier})
    try:
        return build_authorize_url(org, state, scopes, code_challenge=code_challenge)
    except MicrosoftOAuthError as e:
        raise RuntimeError(str(e)) from e


class MicrosoftOAuthPersonalStartView(RBACView):
    """GET: return authorize_url to connect the current user's Microsoft account."""

    name = "Microsoft OAuth personal start"
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    rbac_decision = "authenticated_only"

    def get(self, request: SJRequest, *args, **kwargs):
        org = _current_tenant_organization()
        if not org:
            return self.send_response(
                True, "bad_request", {"details": "Tenant context is required."}, status=400
            )
        tenant_user = _tenant_user(request)
        if tenant_user and tenant_user.is_student():
            return self.send_response(
                True, "forbidden", {"details": "Students cannot connect Microsoft."}, status=403
            )
        user_id = _tenant_user_id(request)
        if not user_id:
            return self.send_response(
                True, "bad_request", {"details": "User context is required."}, status=400
            )
        try:
            return_path = _return_path_from_request(request)
        except ValueError as e:
            return self.send_response(True, "bad_request", {"details": str(e)}, status=400)
        payload = {
            "schema_name": org.schema_name,
            "purpose": OAuthPurpose.CONNECT_PERSONAL.value,
            "organization_id": org.id,
            "schedjuice_user_id": user_id,
            "post_oauth": "personal_profile",
        }
        if return_path:
            payload["return_path"] = return_path
        try:
            url = _build_authorize_for_payload(payload, org)
        except RuntimeError as e:
            return self.send_response(True, "bad_request", {"details": str(e)}, status=400)
        return self.send_response(False, "ok", {"authorize_url": url}, status=200)


class MicrosoftOAuthPersonalReconnectView(RBACView):
    """POST: return authorize_url to reconnect personal Microsoft OAuth."""

    name = "Microsoft OAuth personal reconnect"
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    rbac_decision = "authenticated_only"

    def post(self, request: SJRequest, *args, **kwargs):
        org = _current_tenant_organization()
        user_id = _tenant_user_id(request)
        if not org or not user_id:
            return self.send_response(
                True, "bad_request", {"details": "Tenant and user context required."},
                status=400,
            )
        if not UserMicrosoftOAuth.objects.filter(user_id=user_id).exists():
            return self.send_response(
                True, "not_found", {"details": "No Microsoft connection for this user."},
                status=404,
            )
        try:
            return_path = _return_path_from_request(request)
        except ValueError as e:
            return self.send_response(True, "bad_request", {"details": str(e)}, status=400)
        payload = {
            "schema_name": org.schema_name,
            "purpose": OAuthPurpose.RECONNECT_PERSONAL.value,
            "organization_id": org.id,
            "schedjuice_user_id": user_id,
            "post_oauth": "personal_profile",
        }
        if return_path:
            payload["return_path"] = return_path
        try:
            url = _build_authorize_for_payload(payload, org)
        except RuntimeError as e:
            return self.send_response(True, "bad_request", {"details": str(e)}, status=400)
        return self.send_response(False, "ok", {"authorize_url": url}, status=200)


class MicrosoftOAuthPersonalDisconnectView(RBACView):
    """POST: disconnect personal Microsoft OAuth."""

    name = "Microsoft OAuth personal disconnect"
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    rbac_decision = "authenticated_only"

    def post(self, request: SJRequest, *args, **kwargs):
        user_id = _tenant_user_id(request)
        if not user_id:
            return self.send_response(
                True, "bad_request", {"details": "User context is required."}, status=400
            )
        row = UserMicrosoftOAuth.objects.filter(user_id=user_id).first()
        if row is None:
            return self.send_response(
                True, "not_found", {"details": "No Microsoft connection for this user."},
                status=404,
            )
        row.msal_cache_ct = ""
        row.expires_at = None
        row.status = UserMicrosoftOAuth.Status.DISCONNECTED
        row.last_error = ""
        row.save(
            update_fields=[
                "msal_cache_ct",
                "expires_at",
                "status",
                "last_error",
                "updated_at",
            ]
        )
        return self.send_response(
            False,
            "ok",
            {"data": {"status": "disconnected", "connected": False}},
            status=200,
        )


class MicrosoftOAuthPersonalStatusView(RBACView):
    """GET: personal Microsoft OAuth connection status."""

    name = "Microsoft OAuth personal status"
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    rbac_decision = "authenticated_only"

    def get(self, request: SJRequest, *args, **kwargs):
        user_id = _tenant_user_id(request)
        if not user_id:
            return self.send_response(
                True, "bad_request", {"details": "User context is required."}, status=400
            )
        row = UserMicrosoftOAuth.objects.filter(user_id=user_id).first()
        if row is None:
            return self.send_response(
                False,
                "ok",
                {
                    "data": {
                        "connected": False,
                        "status": None,
                        "authorized_upn": "",
                        "authorized_display_name": "",
                    }
                },
                status=200,
            )
        return self.send_response(
            False,
            "ok",
            {
                "data": {
                    "connected": row.status == UserMicrosoftOAuth.Status.ACTIVE,
                    "status": row.status,
                    "authorized_upn": row.authorized_upn,
                    "authorized_display_name": row.authorized_display_name,
                }
            },
            status=200,
        )


class MicrosoftOAuthServiceAccountStartView(RBACView):
    """GET: return authorize_url to connect the org Microsoft service account."""

    name = "Microsoft OAuth service account start"
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"GET": "organization.manage"}

    def get(self, request: SJRequest, *args, **kwargs):
        org, err = _resolve_service_account_org(request, self)
        if err is not None:
            return err
        if not org:
            return self.send_response(
                True, "bad_request", {"details": "Tenant context is required."}, status=400
            )
        if not getattr(org, "is_microsoft_on", False):
            return self.send_response(
                True,
                "bad_request",
                {"details": "Microsoft integration is not enabled for this organization."},
                status=400,
            )
        try:
            return_path = _return_path_from_request(request)
        except ValueError as e:
            return self.send_response(True, "bad_request", {"details": str(e)}, status=400)
        payload = {
            "schema_name": org.schema_name,
            "purpose": OAuthPurpose.CONNECT_SERVICE.value,
            "organization_id": org.id,
            "post_oauth": "service_account",
        }
        if return_path:
            payload["return_path"] = return_path
        try:
            url = _build_authorize_for_payload(payload, org)
        except RuntimeError as e:
            return self.send_response(True, "bad_request", {"details": str(e)}, status=400)
        return self.send_response(False, "ok", {"authorize_url": url}, status=200)


class MicrosoftOAuthServiceAccountReconnectView(RBACView):
    """POST: reconnect org Microsoft service account."""

    name = "Microsoft OAuth service account reconnect"
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"POST": "organization.manage"}

    def post(self, request: SJRequest, *args, **kwargs):
        org, err = _resolve_service_account_org(request, self)
        if err is not None:
            return err
        if not org:
            return self.send_response(
                True, "bad_request", {"details": "Tenant context is required."}, status=400
            )
        if not getattr(org, "is_microsoft_on", False):
            return self.send_response(
                True,
                "bad_request",
                {"details": "Microsoft integration is not enabled for this organization."},
                status=400,
            )
        with schema_context(get_public_schema_name()):
            exists = MicrosoftDelegatedAccount.objects.filter(
                organization_id=org.id
            ).exists()
        if not exists:
            return self.send_response(
                True, "not_found", {"details": "Service account not connected yet."},
                status=404,
            )
        try:
            return_path = _return_path_from_request(request)
        except ValueError as e:
            return self.send_response(True, "bad_request", {"details": str(e)}, status=400)
        payload = {
            "schema_name": org.schema_name,
            "purpose": OAuthPurpose.RECONNECT_SERVICE.value,
            "organization_id": org.id,
            "post_oauth": "service_account",
        }
        if return_path:
            payload["return_path"] = return_path
        try:
            url = _build_authorize_for_payload(payload, org)
        except RuntimeError as e:
            return self.send_response(True, "bad_request", {"details": str(e)}, status=400)
        return self.send_response(False, "ok", {"authorize_url": url}, status=200)


class MicrosoftOAuthServiceAccountDisconnectView(RBACView):
    """POST: disconnect org Microsoft service account."""

    name = "Microsoft OAuth service account disconnect"
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"POST": "organization.manage"}

    def post(self, request: SJRequest, *args, **kwargs):
        org, err = _resolve_service_account_org(request, self)
        if err is not None:
            return err
        if not org:
            return self.send_response(
                True, "bad_request", {"details": "Tenant context is required."}, status=400
            )
        with schema_context(get_public_schema_name()):
            row = MicrosoftDelegatedAccount.objects.filter(organization_id=org.id).first()
            if row is None:
                return self.send_response(
                    True, "not_found", {"details": "Service account not connected."},
                    status=404,
                )
            row.msal_cache_ct = ""
            row.expires_at = None
            row.status = MicrosoftDelegatedAccount.Status.DISCONNECTED
            row.last_error = ""
            row.save(
                update_fields=[
                    "msal_cache_ct",
                    "expires_at",
                    "status",
                    "last_error",
                    "updated_at",
                ]
            )
        return self.send_response(
            False,
            "ok",
            {"data": {"status": "disconnected", "connected": False}},
            status=200,
        )


class MicrosoftOAuthServiceAccountStatusView(RBACView):
    """GET: org Microsoft service account connection status."""

    name = "Microsoft OAuth service account status"
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"GET": "organization.manage"}

    def get(self, request: SJRequest, *args, **kwargs):
        org, err = _resolve_service_account_org(request, self)
        if err is not None:
            return err
        if not org:
            return self.send_response(
                True, "bad_request", {"details": "Tenant context is required."}, status=400
            )
        with schema_context(get_public_schema_name()):
            row = MicrosoftDelegatedAccount.objects.filter(organization_id=org.id).first()
        if row is None:
            return self.send_response(
                False,
                "ok",
                {
                    "data": {
                        "connected": False,
                        "status": None,
                        "authorized_upn": "",
                    }
                },
                status=200,
            )
        return self.send_response(
            False,
            "ok",
            {
                "data": {
                    "connected": row.status == MicrosoftDelegatedAccount.Status.ACTIVE,
                    "status": row.status,
                    "authorized_upn": row.authorized_upn,
                }
            },
            status=200,
        )


class MicrosoftOAuthCallbackView(APIView):
    """Microsoft redirects here with code and state (no JWT)."""

    permission_classes = [RBACPermission]
    rbac_decision = "public"
    authentication_classes: list = []

    def get(self, request: Request) -> HttpResponse:
        err = request.GET.get("error")
        if err:
            desc = request.GET.get("error_description") or err
            return _oauth_redirect(None, ok=False, message=desc)

        code = request.GET.get("code")
        state_raw = request.GET.get("state")
        if not code or not state_raw:
            return _oauth_redirect(
                None,
                ok=False,
                message="Missing authorization code or state.",
            )
        try:
            state = parse_state_token(state_raw)
        except OAuthStateError as e:
            return _oauth_redirect(None, ok=False, message=str(e))

        schema_name = str(state.get("schema_name") or "").strip()
        purpose_raw = str(state.get("purpose") or "").strip()
        try:
            purpose = OAuthPurpose(purpose_raw)
        except ValueError:
            return _oauth_redirect(
                None, ok=False, message="Invalid OAuth state purpose."
            )

        org = _public_org_for_schema(schema_name)
        if not org:
            return _oauth_redirect(None, ok=False, message="Unknown tenant in OAuth state.")

        if int(state.get("organization_id") or 0) != org.id:
            return _oauth_redirect(
                org, ok=False, message="OAuth state does not match organization."
            )

        post_oauth = str(state.get("post_oauth") or "").strip() or None
        return_path = str(state.get("return_path") or "").strip() or None
        code_verifier = str(state.get(PKCE_VERIFIER_STATE_KEY) or "").strip()
        if not code_verifier:
            return _oauth_redirect(
                org,
                ok=False,
                message="OAuth PKCE verifier missing; restart the connection.",
                post_oauth=post_oauth,
                return_path=return_path,
            )
        scopes = scopes_for_purpose(purpose_raw)

        try:
            result, cache_blob = exchange_code(
                org, code, scopes, code_verifier=code_verifier
            )
        except MicrosoftOAuthError as e:
            logger.warning("Microsoft OAuth token exchange failed: %s", e)
            return _oauth_redirect(
                org,
                ok=False,
                message=str(e),
                post_oauth=post_oauth,
                return_path=return_path,
            )

        if purpose in (OAuthPurpose.CONNECT_PERSONAL, OAuthPurpose.RECONNECT_PERSONAL):
            user_id = int(state.get("schedjuice_user_id") or 0)
            if not user_id:
                return _oauth_redirect(
                    org,
                    ok=False,
                    message="Missing user in OAuth state.",
                    post_oauth=post_oauth,
                    return_path=return_path,
                )
            with schema_context(schema_name):
                cred, _ = UserMicrosoftOAuth.objects.get_or_create(user_id=user_id)
                apply_connection_from_result(cred, result, cache_blob)
        else:
            with schema_context(get_public_schema_name()):
                cred, _ = MicrosoftDelegatedAccount.objects.get_or_create(
                    organization=org
                )
                apply_connection_from_result(cred, result, cache_blob)

        return _oauth_redirect(
            org,
            ok=True,
            post_oauth=post_oauth,
            return_path=return_path,
        )
