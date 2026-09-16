import logging
import time
from typing import Callable

import msal
import requests
from rest_framework.exceptions import ValidationError
from decouple import config

# Legacy env fallbacks when Organization.delegated_account_* fields are blank.
STAFFY_ID = config("STAFFY_AZURE_OBJECT_ID", default="f4f28526-7323-4ef3-8b68-978c3851bc4e")
STAFFY_DELEGATED_UPN = config("STAFFY_DELEGATED_UPN", default="staffy@teachersucenter.com")


def _delegated_account_upn(tenant) -> str:
    upn = (getattr(tenant, "delegated_account_upn", None) or "").strip()
    return upn or STAFFY_DELEGATED_UPN


def _delegated_account_object_id(tenant) -> str:
    object_id = (getattr(tenant, "delegated_account_object_id", None) or "").strip()
    return object_id or STAFFY_ID


def graph_user_id_for_delegated_staffy_token(tenant) -> str:
    """Entra object id of the delegated token principal for this tenant."""
    return _delegated_account_object_id(tenant)


def staffy_delegated_graph_principal(tenant) -> dict[str, str | None]:
    """
    The identity the delegated Graph token represents (Object ID + sign-in UPN).
    Shown in debug when GET /users/{id}/ fails due to wrong organizer.
    """
    return {
        "email": _delegated_account_upn(tenant),
        "microsoft_object_id": _delegated_account_object_id(tenant),
    }


# Application permissions (client credentials) must include at least:
# OnlineMeetings.ReadWrite.All, Calendars.ReadWrite, OnlineMeetingRecording.Read.All,
# OnlineMeetingArtifact.Read.All, Files.ReadWrite.All (optional, for OneDrive delete),
# plus Teams Application Access Policy for target users. Delegated SCOPES below are for staffy flows.
SCOPES = [
    "Directory.AccessAsUser.All",
    "User.ReadWrite.All",
    "Directory.ReadWrite.All",
    "Group.ReadWrite.All",
    "Mail.ReadWrite",
    "Mail.Send",
    "MailboxSettings.ReadWrite",
    "TeamMember.ReadWrite.All",
    "TeamMember.ReadWriteNonOwnerRole.All",
    "OnlineMeetings.ReadWrite",
    "OnlineMeetingArtifact.Read.All",
    "OnlineMeetingRecording.Read.All",  # List recordings (delegated)
    "ChannelMessage.Send",
    "Channel.ReadBasic.All",
    "EduAssignments.ReadWriteBasic",
    "Files.Read.All",
    "Files.ReadWrite.All",  # Required to delete original recording from OneDrive
]


def get_msal_app(tenant, cache=None):
    if not tenant.private_key:
        raise ValidationError(
            {
                "error_type": "MS_CONFIG_ERROR",
                "details": (
                    "Microsoft integration is enabled but no certificate (private key) "
                    "is configured for this organization. Upload it in the organization "
                    "settings before using Microsoft features."
                ),
            }
        )
    try:
        tenant.private_key.open("r")
        try:
            private_key = tenant.private_key.read()
        finally:
            tenant.private_key.close()
    except (FileNotFoundError, OSError) as exc:
        raise ValidationError(
            {
                "error_type": "MS_CONFIG_ERROR",
                "details": (
                    "Microsoft integration certificate could not be read for this "
                    "organization. The certificate file is missing from storage; "
                    "re-upload it in the organization settings."
                ),
            }
        ) from exc

    app = msal.ConfidentialClientApplication(
        tenant.app_id,
        authority=tenant.authority,
        client_credential={
            "thumbprint": tenant.thumbprint,
            "private_key": private_key,
        },
        token_cache=cache,
    )
    return app


POSTER_SCOPES = ["ChannelMessage.Send", "Channel.ReadBasic.All"]
SERVICE_ACCOUNT_SCOPES = list(SCOPES)


def _bearer_headers(access_token: str) -> dict:
    return {
        "Authorization": "Bearer " + access_token,
        "Content-Type": "application/json",
    }


# Default (connect, read) timeouts so hung Graph calls do not block Django workers indefinitely.
# Long read timeout is for django-q provisioning. In-request Graph must use the short pair.
DEFAULT_GRAPH_TIMEOUT = (30, 180)
IN_REQUEST_GRAPH_TIMEOUT = (5, 10)

TRANSIENT_HTTP_STATUS_CODES = frozenset({429, 500, 502, 503, 504})
GRAPH_REQUEST_MAX_ATTEMPTS = 3
GRAPH_RETRY_BASE_DELAY_SEC = 1.0
GRAPH_RETRY_MAX_DELAY_SEC = 30.0
TOKEN_ACQUIRE_MAX_ATTEMPTS = 3

logger = logging.getLogger(__name__)


def _retry_after_seconds(response: requests.Response | None) -> float | None:
    if response is None:
        return None
    raw = response.headers.get("Retry-After")
    if not raw:
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def _is_transient_graph_response(response: requests.Response) -> bool:
    return response.status_code in TRANSIENT_HTTP_STATUS_CODES


def request_with_retry(
    request_fn: Callable[[], requests.Response],
    *,
    refresh_token: Callable[[], None] | None = None,
    max_attempts: int = GRAPH_REQUEST_MAX_ATTEMPTS,
) -> requests.Response:
    """
    Execute a Graph HTTP call with bounded retries for transient failures.
    On 401, optionally refresh the token once before retrying.
    """
    last_response: requests.Response | None = None
    token_refreshed = False

    for attempt in range(max_attempts):
        try:
            response = request_fn()
            last_response = response
        except (requests.Timeout, requests.ConnectionError) as exc:
            if attempt >= max_attempts - 1:
                raise
            delay = min(
                GRAPH_RETRY_BASE_DELAY_SEC * (2**attempt),
                GRAPH_RETRY_MAX_DELAY_SEC,
            )
            logger.warning(
                "Graph request network error (attempt %s/%s): %s; retrying in %.1fs",
                attempt + 1,
                max_attempts,
                exc,
                delay,
            )
            time.sleep(delay)
            continue

        if response.status_code == 401 and refresh_token and not token_refreshed:
            token_refreshed = True
            refresh_token()
            continue

        if _is_transient_graph_response(response) and attempt < max_attempts - 1:
            delay = _retry_after_seconds(response) or min(
                GRAPH_RETRY_BASE_DELAY_SEC * (2**attempt),
                GRAPH_RETRY_MAX_DELAY_SEC,
            )
            logger.warning(
                "Graph request transient HTTP %s (attempt %s/%s); retrying in %.1fs",
                response.status_code,
                attempt + 1,
                max_attempts,
                delay,
            )
            time.sleep(delay)
            continue

        return response

    if last_response is not None:
        return last_response
    raise RuntimeError("Graph request failed without a response")


class BaseMSRequest:
    """
    The base class for preparing requests to be made to the MS graph API.
    Subclasses tailored for Users and Groups will be inherited from this class.
    Basically, I am building my own wrapper.
    """

    URL = "https://graph.microsoft.com/v1.0/"
    BETA_URL = "https://graph.microsoft.com/beta/"
    PASSWORD_METHOD_ID = "28c10230-6103-485e-b985-444c60001490"

    headers = {}

    @staticmethod
    def get_token(
        tenant,
        use_app_auth: bool = True,
        credential=None,
        scopes=None,
    ) -> str:
        """
        Resolve a Graph access token.

        - credential set: per-user or org service-account OAuth cache
        - use_app_auth True: client credentials (default for directory/Teams ops)
        - use_app_auth False: org delegated service account (channel posts, education, etc.)
        """
        if credential is not None:
            from app_microsoft.oauth import get_valid_access_token

            scope_list = scopes or POSTER_SCOPES
            return get_valid_access_token(tenant, credential, scope_list)

        if not use_app_auth:
            from app_microsoft.delegated_auth import get_org_service_account
            from app_microsoft.oauth import get_valid_access_token

            svc = get_org_service_account(tenant)
            if svc is None:
                raise ValueError(
                    "Microsoft service account is not connected for this organization. "
                    "Reconnect it in Organization settings."
                )
            return get_valid_access_token(tenant, svc, SERVICE_ACCOUNT_SCOPES)

        x = get_msal_app(tenant)
        res = x.acquire_token_silent(SCOPES, account=None)
        if not res:
            res = x.acquire_token_for_client(
                scopes=["https://graph.microsoft.com/.default"]
            )

        if "access_token" not in res:
            raise ValueError(
                f"MSAL auth failed: {res.get('error', 'unknown')} - "
                f"{res.get('error_description', res)}"
            )
        access_token = res["access_token"]
        BaseMSRequest.token = access_token
        BaseMSRequest.headers = _bearer_headers(access_token)
        return access_token

    def _apply_access_token(self, access_token: str) -> None:
        self.token = access_token
        self.headers = _bearer_headers(access_token)

    def __init__(self, tenant, *, use_app_auth: bool = True):
        self.tenant = tenant
        self.credential = None
        self.use_app_auth = use_app_auth
        self._apply_access_token(self.get_token(tenant, use_app_auth=use_app_auth))

    def _refresh_token(self):
        credential = getattr(self, "credential", None)
        use_app_auth = getattr(self, "use_app_auth", True)
        scopes = getattr(self, "scopes", None)
        token = self.get_token(
            self.tenant,
            use_app_auth=use_app_auth,
            credential=credential,
            scopes=scopes,
        )
        self._apply_access_token(token)

    def _request_with_retry(self, method: str, *args, **kwargs):
        def call():
            return getattr(requests, method)(*args, **kwargs, headers=self.headers)

        return request_with_retry(call, refresh_token=self._refresh_token)

    def get(self, *args, **kwargs):
        if not kwargs.get("stream"):
            kwargs.setdefault("timeout", DEFAULT_GRAPH_TIMEOUT)
        return self._request_with_retry("get", *args, **kwargs)

    def post(self, *args, **kwargs):
        if not kwargs.get("stream"):
            kwargs.setdefault("timeout", DEFAULT_GRAPH_TIMEOUT)
        return self._request_with_retry("post", *args, **kwargs)

    def patch(self, *args, **kwargs):
        kwargs.setdefault("timeout", DEFAULT_GRAPH_TIMEOUT)
        return self._request_with_retry("patch", *args, **kwargs)

    def delete(self, *args, **kwargs):
        kwargs.setdefault("timeout", DEFAULT_GRAPH_TIMEOUT)
        return self._request_with_retry("delete", *args, **kwargs)
