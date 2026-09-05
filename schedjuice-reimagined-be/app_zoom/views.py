"""Zoom OAuth + connected account administration (public-schema ``ZoomAccount``)."""

from __future__ import annotations

import enum
import logging
from datetime import timedelta
from typing import Any
from urllib.parse import urlencode

from django.conf import settings
from django.db import connection
from django.http import HttpResponse, HttpResponseRedirect
from django.utils import timezone
from rest_framework.request import Request
from rest_framework.views import APIView
from schedjuice_backend.jwt_authentication import TenantBoundJWTStatelessAuthentication
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_organization.models import Organization, ZoomAccount
from app_rbac.views import RBACPermission, RBACView
from app_zoom import serializers as zoom_serializers
from app_zoom.client import fetch_zoom_oauth_user_profile, get_zoom_user, list_account_users
from app_zoom.oauth import (
    OAuthStateError,
    ZoomOAuthError,
    build_authorize_url,
    build_state_token,
    exchange_code,
    parse_state_token,
)
from utilitas.views import Request as SJRequest

logger = logging.getLogger(__name__)


class OAuthPurpose(str, enum.Enum):
    CONNECT = "connect"
    RECONNECT = "reconnect"
    CONNECT_PERSONAL = "connect_personal"
    RECONNECT_PERSONAL = "reconnect_personal"


def _public_org_for_schema(schema_name: str) -> Organization | None:
    with schema_context(get_public_schema_name()):
        return Organization.objects.filter(schema_name=schema_name).first()


def _current_tenant_organization() -> Organization | None:
    schema = getattr(connection, "schema_name", None) or ""
    public = get_public_schema_name()
    if not schema or schema == public:
        return None
    return _public_org_for_schema(schema)



def _authorize_url_for_org(
    org: Organization,
    *,
    purpose: OAuthPurpose,
    zoom_account_pk: int | None = None,
) -> str:
    payload: dict[str, Any] = {
        "schema_name": org.schema_name,
        "purpose": purpose.value,
        "organization_id": org.id,
    }
    if purpose == OAuthPurpose.RECONNECT:
        if zoom_account_pk is None:
            raise ValueError("reconnect requires zoom_account_pk")
        payload["zoom_account_pk"] = zoom_account_pk
    state = build_state_token(payload)
    try:
        return build_authorize_url(state)
    except ZoomOAuthError as e:
        raise RuntimeError(str(e)) from e


class ZoomOAuthStartView(RBACView):
    """GET: return ``authorize_url`` to begin connecting a new Zoom account."""

    name = "Zoom OAuth start"
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"GET": "zoom.configure"}

    def get(self, request: SJRequest, *args, **kwargs):
        org = _current_tenant_organization()
        if not org:
            return self.send_response(
                True,
                "bad_request",
                {"details": "Tenant context is required for Zoom OAuth."},
                status=400,
            )
        try:
            url = _authorize_url_for_org(org, purpose=OAuthPurpose.CONNECT)
        except RuntimeError as e:
            return self.send_response(
                True,
                "bad_request",
                {"details": str(e)},
                status=400,
            )
        return self.send_response(False, "ok", {"authorize_url": url}, status=200)


def _authorize_url_for_personal(
    *,
    tenant_user_id: int,
    org: Organization,
    purpose: OAuthPurpose,
) -> str:
    if purpose not in (
        OAuthPurpose.CONNECT_PERSONAL,
        OAuthPurpose.RECONNECT_PERSONAL,
    ):
        raise ValueError("invalid purpose for personal oauth")
    payload: dict[str, Any] = {
        "schema_name": org.schema_name,
        "purpose": purpose.value,
        "organization_id": org.id,
        "schedjuice_user_id": tenant_user_id,
        "post_oauth": "personal_profile",
    }
    state = build_state_token(payload)
    try:
        return build_authorize_url(state)
    except ZoomOAuthError as e:
        raise RuntimeError(str(e)) from e


def _oauth_redirect(
    org: Organization | None,
    *,
    ok: bool,
    message: str = "",
    post_oauth: str | None = None,
) -> HttpResponse:
    base = (getattr(settings, "FRONTEND_BASE_URL", "") or "").strip().rstrip("/")
    params: dict[str, str] = {}
    if post_oauth == "personal_profile":
        params["zoom_oauth_personal"] = "success" if ok else "error"
        if message:
            params["zoom_oauth_personal_message"] = message[:500]
    else:
        params["zoom_oauth"] = "success" if ok else "error"
        if message:
            params["zoom_oauth_message"] = message[:500]
    query = urlencode(params)
    if base:
        if post_oauth == "personal_profile":
            url = f"{base}/organizations/profile/edit?{query}"
        elif org is not None:
            url = f"{base}/organizations/{org.id}/edit?{query}"
        else:
            url = f"{base}/?{query}"
        return HttpResponseRedirect(url)
    body = (
        f"Zoom OAuth {'succeeded' if ok else 'failed'}"
        + (f": {message}" if message else "")
        + ". Configure FRONTEND_BASE_URL to redirect to the app."
    )
    return HttpResponse(body, status=200 if ok else 400, content_type="text/plain")


def _display_name_from_zoom_user(row: dict[str, Any]) -> str:
    first = str(row.get("first_name") or "").strip()
    last = str(row.get("last_name") or "").strip()
    combined = f"{first} {last}".strip()
    if combined:
        return combined
    return str(row.get("display_name") or "").strip()


def _apply_encrypted_zoom_token_bundle(receiver: Any, bundle: dict[str, Any]) -> None:
    new_access = bundle.get("access_token") or ""
    new_refresh = bundle.get("refresh_token")
    expires_in = int(bundle.get("expires_in") or 3600)
    now = timezone.now()
    exp = now + timedelta(seconds=max(60, expires_in - 60))
    if not new_access:
        raise RuntimeError("Zoom token response missing access_token.")
    kwargs: dict[str, Any] = {"access_token": new_access, "expires_at": exp}
    if isinstance(new_refresh, str) and new_refresh.strip():
        kwargs["refresh_token"] = new_refresh.strip()
    receiver.set_tokens(**kwargs)


def _apply_token_bundle(za: ZoomAccount, bundle: dict[str, Any]) -> None:
    _apply_encrypted_zoom_token_bundle(za, bundle)


class ZoomOAuthCallbackView(APIView):
    """Zoom redirects here with ``code`` and ``state`` (no JWT)."""

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
                None,
                ok=False,
                message="Invalid OAuth state purpose.",
            )

        org = _public_org_for_schema(schema_name)
        if not org:
            return _oauth_redirect(
                None,
                ok=False,
                message="Unknown tenant in OAuth state.",
            )

        if int(state.get("organization_id") or 0) != org.id:
            return _oauth_redirect(
                org,
                ok=False,
                message="OAuth state does not match organization.",
            )

        post_oauth = str(state.get("post_oauth") or "").strip() or None

        try:
            bundle = exchange_code(code)
        except ZoomOAuthError as e:
            logger.warning("Zoom code exchange failed: %s", e)
            return _oauth_redirect(
                org,
                ok=False,
                message=str(e),
                post_oauth=post_oauth,
            )

        try:
            access = bundle["access_token"]
        except KeyError:
            return _oauth_redirect(
                org,
                ok=False,
                message="Zoom token response missing access_token.",
                post_oauth=post_oauth,
            )

        try:
            profile = fetch_zoom_oauth_user_profile(access)
        except RuntimeError as e:
            logger.warning("Zoom profile fetch failed: %s", e)
            return _oauth_redirect(
                org,
                ok=False,
                message=str(e),
                post_oauth=post_oauth,
            )

        acct_external_id = profile.get("account_id") or ""
        if not acct_external_id:
            return _oauth_redirect(
                org,
                ok=False,
                message="Zoom did not return an account id for this user.",
                post_oauth=post_oauth,
            )

        now = timezone.now()
        purpose_personal = purpose in (
            OAuthPurpose.CONNECT_PERSONAL,
            OAuthPurpose.RECONNECT_PERSONAL,
        )

        if purpose_personal:
            from app_auth.models import User as TenantUser
            from app_auth.models_user_zoom_oauth import UserZoomOAuth

            sj_uid = int(state.get("schedjuice_user_id") or 0)
            if sj_uid <= 0:
                return _oauth_redirect(
                    org,
                    ok=False,
                    message="OAuth state is missing the Schedjuice user id.",
                    post_oauth=post_oauth,
                )
            with schema_context(schema_name):
                tuser = TenantUser.objects.filter(id=sj_uid).first()
                if not tuser:
                    return _oauth_redirect(
                        org,
                        ok=False,
                        message="User not found in this school.",
                        post_oauth=post_oauth,
                    )
                uzo, _ = UserZoomOAuth.objects.get_or_create(
                    user=tuser,
                    defaults={"status": UserZoomOAuth.Status.ACTIVE},
                )
                _apply_encrypted_zoom_token_bundle(uzo, bundle)
                uzo.zoom_user_id = profile.get("authorized_by_zoom_user_id") or ""
                uzo.zoom_account_id = acct_external_id
                uzo.authorized_email = profile.get("authorized_by_email") or ""
                uzo.authorized_display_name = (
                    profile.get("authorized_display_name") or ""
                )
                uzo.status = UserZoomOAuth.Status.ACTIVE
                uzo.last_error = ""
                uzo.save(
                    update_fields=[
                        "zoom_user_id",
                        "zoom_account_id",
                        "authorized_email",
                        "authorized_display_name",
                        "status",
                        "last_error",
                        "updated_at",
                    ]
                )

            return _oauth_redirect(org, ok=True, post_oauth=post_oauth)

        with schema_context(get_public_schema_name()):
            if purpose == OAuthPurpose.RECONNECT:
                pk = int(state.get("zoom_account_pk") or 0)
                za = ZoomAccount.objects.filter(
                    id=pk, organization=org
                ).first()
                if not za:
                    return _oauth_redirect(
                        org,
                        ok=False,
                        message="Zoom account not found for reconnect.",
                    )
                if za.account_id != acct_external_id:
                    return _oauth_redirect(
                        org,
                        ok=False,
                        message="Reconnect was started for a different Zoom account "
                        "than the one that signed in.",
                    )
            else:
                za, _created = ZoomAccount.objects.get_or_create(
                    organization=org,
                    account_id=acct_external_id,
                    defaults={"status": ZoomAccount.Status.ACTIVE},
                )

            _apply_token_bundle(za, bundle)
            za.account_name = profile.get("account_name") or za.account_name
            za.authorized_by_zoom_user_id = profile.get(
                "authorized_by_zoom_user_id"
            ) or ""
            za.authorized_by_email = profile.get("authorized_by_email") or ""
            za.status = ZoomAccount.Status.ACTIVE
            za.last_error = ""
            za.last_validated_at = now
            za.save(
                update_fields=[
                    "account_name",
                    "authorized_by_zoom_user_id",
                    "authorized_by_email",
                    "status",
                    "last_error",
                    "last_validated_at",
                    "updated_at",
                ]
            )

        return _oauth_redirect(org, ok=True)


class ZoomAccountListView(RBACView):
    """GET: list connected Zoom accounts for the current tenant."""

    name = "Zoom accounts list"
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"GET": "zoom.configure"}

    def get(self, request: SJRequest, *args, **kwargs):
        org = _current_tenant_organization()
        if not org:
            return self.send_response(
                True,
                "bad_request",
                {"details": "Tenant context is required."},
                status=400,
            )
        with schema_context(get_public_schema_name()):
            qs = ZoomAccount.objects.filter(organization=org).order_by("id")
            data = zoom_serializers.ZoomAccountSerializer(qs, many=True).data
        return self.send_response(False, "ok", {"data": data}, status=200)


class ZoomAccountReconnectView(RBACView):
    """POST: return OAuth ``authorize_url`` to refresh tokens for an existing row."""

    name = "Zoom account reconnect"
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"POST": "zoom.configure"}

    def post(self, request: SJRequest, zoom_account_pk: int, *args, **kwargs):
        org = _current_tenant_organization()
        if not org:
            return self.send_response(
                True,
                "bad_request",
                {"details": "Tenant context is required."},
                status=400,
            )
        with schema_context(get_public_schema_name()):
            za = ZoomAccount.objects.filter(
                id=zoom_account_pk, organization=org
            ).first()
        if not za:
            return self.send_response(
                True,
                "not_found",
                {"details": "Zoom account not found."},
                status=404,
            )
        try:
            url = _authorize_url_for_org(
                org,
                purpose=OAuthPurpose.RECONNECT,
                zoom_account_pk=za.id,
            )
        except RuntimeError as e:
            return self.send_response(
                True,
                "bad_request",
                {"details": str(e)},
                status=400,
            )
        return self.send_response(False, "ok", {"authorize_url": url}, status=200)


class ZoomAccountDisconnectView(RBACView):
    """POST: revoke stored tokens and mark the row disconnected."""

    name = "Zoom account disconnect"
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"POST": "zoom.configure"}

    def post(self, request: SJRequest, zoom_account_pk: int, *args, **kwargs):
        org = _current_tenant_organization()
        if not org:
            return self.send_response(
                True,
                "bad_request",
                {"details": "Tenant context is required."},
                status=400,
            )
        with schema_context(get_public_schema_name()):
            za = ZoomAccount.objects.filter(
                id=zoom_account_pk, organization=org
            ).first()
            if not za:
                return self.send_response(
                    True,
                    "not_found",
                    {"details": "Zoom account not found."},
                    status=404,
                )
            za.access_token_ct = ""
            za.refresh_token_ct = ""
            za.expires_at = None
            za.status = ZoomAccount.Status.DISCONNECTED
            za.last_error = ""
            za.save(
                update_fields=[
                    "access_token_ct",
                    "refresh_token_ct",
                    "expires_at",
                    "status",
                    "last_error",
                    "updated_at",
                ]
            )
            payload = zoom_serializers.ZoomAccountSerializer(za).data
        return self.send_response(False, "ok", {"data": payload}, status=200)


class ZoomAccountUsersView(RBACView):
    """GET: proxy Zoom user list for the default-host picker."""

    name = "Zoom account users"
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"GET": "zoom.configure"}

    def get(self, request: SJRequest, zoom_account_pk: int, *args, **kwargs):
        org = _current_tenant_organization()
        if not org:
            return self.send_response(
                True,
                "bad_request",
                {"details": "Tenant context is required."},
                status=400,
            )
        with schema_context(get_public_schema_name()):
            za = ZoomAccount.objects.filter(
                id=zoom_account_pk, organization=org
            ).first()
        if not za:
            return self.send_response(
                True,
                "not_found",
                {"details": "Zoom account not found."},
                status=404,
            )
        if za.status != ZoomAccount.Status.ACTIVE:
            return self.send_response(
                True,
                "bad_request",
                {"details": "Reconnect this Zoom account before listing users."},
                status=400,
            )
        try:
            users = list_account_users(za)
        except ZoomOAuthError as e:
            return self.send_response(
                True,
                "bad_request",
                {"details": str(e)},
                status=400,
            )
        slim = [
            {
                "id": str(u.get("id") or ""),
                "email": str(u.get("email") or ""),
                "first_name": str(u.get("first_name") or ""),
                "last_name": str(u.get("last_name") or ""),
                "display_name": _display_name_from_zoom_user(u),
            }
            for u in users
            if u.get("id")
        ]
        return self.send_response(False, "ok", {"data": slim}, status=200)


class ZoomAccountSetHostView(RBACView):
    """POST: set default Zoom host for scheduling + attendance."""

    name = "Zoom account set default host"
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    required_permissions = {"POST": "zoom.configure"}

    def post(self, request: SJRequest, zoom_account_pk: int, *args, **kwargs):
        org = _current_tenant_organization()
        if not org:
            return self.send_response(
                True,
                "bad_request",
                {"details": "Tenant context is required."},
                status=400,
            )
        ser = zoom_serializers.SetZoomDefaultHostSerializer(data=request.data)
        if not ser.is_valid():
            return self.send_response(
                True,
                "bad_request",
                {"details": ser.errors},
                status=400,
            )
        host_id = str(ser.validated_data["default_host_zoom_user_id"]).strip()
        with schema_context(get_public_schema_name()):
            za = ZoomAccount.objects.filter(
                id=zoom_account_pk, organization=org
            ).first()
            if not za:
                return self.send_response(
                    True,
                    "not_found",
                    {"details": "Zoom account not found."},
                    status=404,
                )
            if za.status != ZoomAccount.Status.ACTIVE:
                return self.send_response(
                    True,
                    "bad_request",
                    {"details": "Reconnect this Zoom account before setting host."},
                    status=400,
                )

            detail = get_zoom_user(za, host_id)
            if detail is None:
                return self.send_response(
                    True,
                    "bad_request",
                    {
                        "details": "That Zoom user was not found in this account.",
                    },
                    status=400,
                )

            email = str(detail.get("email") or "").strip()
            za.default_host_zoom_user_id = host_id
            za.default_host_email = email
            za.default_host_name = _display_name_from_zoom_user(detail)
            za.last_validated_at = timezone.now()
            za.save(
                update_fields=[
                    "default_host_zoom_user_id",
                    "default_host_email",
                    "default_host_name",
                    "last_validated_at",
                    "updated_at",
                ]
            )
            payload = zoom_serializers.ZoomAccountSerializer(za).data
        return self.send_response(False, "ok", {"data": payload}, status=200)


class ZoomOAuthPersonalStartView(RBACView):
    """GET ``authorize_url`` for a teacher's personal Zoom (tenant ``UserZoomOAuth``)."""

    name = "Zoom OAuth personal start"
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    rbac_decision = "authenticated_only"

    def get(self, request: SJRequest, *args, **kwargs):
        from app_auth.models import User

        org = _current_tenant_organization()
        if not org:
            return self.send_response(
                True,
                "bad_request",
                {"details": "Tenant context is required for Zoom OAuth."},
                status=400,
            )
        user = User.get_user_from_request(request)
        if not user:
            return self.send_response(
                True,
                "bad_request",
                {"details": "User not found."},
                status=400,
            )
        if user.is_student():
            return self.send_response(
                True,
                "forbidden",
                {"details": "Students cannot connect personal Zoom accounts."},
                status=403,
            )
        try:
            url = _authorize_url_for_personal(
                tenant_user_id=user.id,
                org=org,
                purpose=OAuthPurpose.CONNECT_PERSONAL,
            )
        except RuntimeError as e:
            return self.send_response(
                True,
                "bad_request",
                {"details": str(e)},
                status=400,
            )
        return self.send_response(False, "ok", {"authorize_url": url}, status=200)


class ZoomOAuthPersonalReconnectView(RBACView):
    """POST: OAuth URL to refresh personal Zoom tokens."""

    name = "Zoom OAuth personal reconnect"
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    rbac_decision = "authenticated_only"

    def post(self, request: SJRequest, *args, **kwargs):
        from app_auth.models import User
        from app_auth.models_user_zoom_oauth import UserZoomOAuth

        org = _current_tenant_organization()
        if not org:
            return self.send_response(
                True,
                "bad_request",
                {"details": "Tenant context is required."},
                status=400,
            )
        user = User.get_user_from_request(request)
        if not user:
            return self.send_response(
                True,
                "bad_request",
                {"details": "User not found."},
                status=400,
            )
        if user.is_student():
            return self.send_response(
                True,
                "forbidden",
                {"details": "Students cannot connect personal Zoom accounts."},
                status=403,
            )
        if not UserZoomOAuth.objects.filter(user_id=user.id).exists():
            return self.send_response(
                True,
                "not_found",
                {"details": "No personal Zoom connection to reconnect."},
                status=404,
            )
        try:
            url = _authorize_url_for_personal(
                tenant_user_id=user.id,
                org=org,
                purpose=OAuthPurpose.RECONNECT_PERSONAL,
            )
        except RuntimeError as e:
            return self.send_response(
                True,
                "bad_request",
                {"details": str(e)},
                status=400,
            )
        return self.send_response(False, "ok", {"authorize_url": url}, status=200)


class ZoomOAuthPersonalDisconnectView(RBACView):
    """POST: clear personal Zoom OAuth tokens."""

    name = "Zoom OAuth personal disconnect"
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    rbac_decision = "authenticated_only"

    def post(self, request: SJRequest, *args, **kwargs):
        from app_auth.models import User
        from app_auth.models_user_zoom_oauth import UserZoomOAuth

        org = _current_tenant_organization()
        if not org:
            return self.send_response(
                True,
                "bad_request",
                {"details": "Tenant context is required."},
                status=400,
            )
        user = User.get_user_from_request(request)
        if not user:
            return self.send_response(
                True,
                "bad_request",
                {"details": "User not found."},
                status=400,
            )
        if user.is_student():
            return self.send_response(
                True,
                "forbidden",
                {"details": "Students cannot connect personal Zoom accounts."},
                status=403,
            )
        uzo = UserZoomOAuth.objects.filter(user_id=user.id).first()
        if not uzo:
            return self.send_response(
                True,
                "not_found",
                {"details": "No personal Zoom connection."},
                status=404,
            )
        uzo.access_token_ct = ""
        uzo.refresh_token_ct = ""
        uzo.expires_at = None
        uzo.status = UserZoomOAuth.Status.DISCONNECTED
        uzo.last_error = ""
        uzo.save(
            update_fields=[
                "access_token_ct",
                "refresh_token_ct",
                "expires_at",
                "status",
                "last_error",
                "updated_at",
            ]
        )
        return self.send_response(
            False,
            "ok",
            {
                "data": {
                    "status": uzo.status,
                    "connected": False,
                }
            },
            status=200,
        )


class ZoomOAuthPersonalStatusView(RBACView):
    """GET: whether the current user has an active personal Zoom OAuth row."""

    name = "Zoom OAuth personal status"
    authentication_classes = [TenantBoundJWTStatelessAuthentication]
    rbac_decision = "authenticated_only"

    def get(self, request: SJRequest, *args, **kwargs):
        from app_auth.models import User
        from app_auth.models_user_zoom_oauth import UserZoomOAuth

        user = User.get_user_from_request(request)
        if not user:
            return self.send_response(
                True,
                "bad_request",
                {"details": "User not found."},
                status=400,
            )
        if user.is_student():
            return self.send_response(
                True,
                "forbidden",
                {"details": "Students cannot connect personal Zoom accounts."},
                status=403,
            )
        uzo = UserZoomOAuth.objects.filter(user_id=user.id).first()
        if not uzo:
            return self.send_response(
                False,
                "ok",
                {
                    "data": {
                        "connected": False,
                        "status": None,
                        "authorized_email": "",
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
                    "connected": uzo.status == UserZoomOAuth.Status.ACTIVE,
                    "status": uzo.status,
                    "authorized_email": uzo.authorized_email,
                    "authorized_display_name": uzo.authorized_display_name,
                }
            },
            status=200,
        )
