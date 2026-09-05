import json
import logging
import random
import time
from collections.abc import Callable
from urllib.parse import urlencode

import requests

from app_microsoft.graph_wrapper.base import BaseMSRequest, DEFAULT_GRAPH_TIMEOUT
from app_microsoft.graph_wrapper.retry import graph_call_with_retry

logger = logging.getLogger(__name__)

# ISO 3166-1 alpha-2; required by Graph before assignLicense.
DEFAULT_USAGE_LOCATION = "SG"


class MSUser(BaseMSRequest):
    def _graph_call_with_retry(
        self, log_label: str, run: Callable[[], requests.Response]
    ) -> requests.Response:
        return graph_call_with_retry(log_label, run)

    def find_by_upn(self, principal_name: str):
        """GET a user by userPrincipalName (used for linking existing accounts)."""
        return super().get(f"{self.URL}users/{principal_name}")

    def search(self, query: str, top: int = 10):
        """Fuzzy user lookup via Graph $filter startswith on name/mail/UPN."""
        query = (query or "").strip()
        if not query:
            empty = requests.Response()
            empty.status_code = 200
            empty._content = b'{"value":[]}'
            return empty

        escaped = query.replace("'", "''")
        filter_expr = (
            f"startswith(displayName,'{escaped}') or "
            f"startswith(mail,'{escaped}') or "
            f"startswith(userPrincipalName,'{escaped}')"
        )
        params = urlencode(
            {
                "$filter": filter_expr,
                "$select": "id,displayName,userPrincipalName,mail",
                "$top": str(top),
                "$count": "true",
            }
        )
        headers = {**self.headers, "ConsistencyLevel": "eventual"}
        return requests.get(
            f"{self.URL}users?{params}",
            headers=headers,
            timeout=DEFAULT_GRAPH_TIMEOUT,
        )

    def _generate_password(self):
        password = ""
        for i in range(3):
            x1 = random.choice("abcdefghijklmnopqrstuvwxyz")
            x2 = random.choice("abcdefghijklmnopqrstuvwxyz".upper())
            x3 = random.choice("0987654321")
            x4 = random.choice("!@#$%^")
            password = password + x1 + x2 + x3 + x4
        return password

    def get(self, user_id: str):
        return super().get(f"{self.URL}users/{user_id}")

    def get_sign_in_activity(self, user_id: str):
        return self._graph_call_with_retry(
            "get signInActivity",
            lambda: super().get(
                f"{self.URL}users/{user_id}?$select=signInActivity"
            ),
        )

    def create(self, display_name: str, principal_name: str, password: str):
        user_payload = {
            "accountEnabled": True,
            "displayName": display_name,
            "userPrincipalName": principal_name,
            "mailNickname": principal_name.split("@")[0],
            "usageLocation": DEFAULT_USAGE_LOCATION,
            "passwordProfile": {
                "forceChangePasswordNextSignIn": True,
                "password": password,
            },
        }
        return self._graph_call_with_retry(
            "create user",
            lambda: self.post(f"{self.URL}users", json.dumps(user_payload)),
        )

    def update_name(self, user_id: str, new_name: str):
        return self._graph_call_with_retry(
            "update displayName",
            lambda: self.patch(
                f"{self.URL}users/{user_id}",
                json.dumps({"displayName": new_name}),
            ),
        )

    def enable_mail(self, user_id: str, email: str):
        # usageLocation is set on create; PATCH only mail to avoid redundant writes.
        payload = {"mail": email}
        return self._graph_call_with_retry(
            "enable mail",
            lambda: self.patch(
                f"{self.URL}users/{user_id}", json.dumps(payload)
            ),
        )

    def _ensure_usage_location(self, user_id: str):
        return self.patch(
            f"{self.URL}users/{user_id}",
            json.dumps({"usageLocation": DEFAULT_USAGE_LOCATION}),
        )

    def assign_license(self, user_id: str, license_id, ensure_usage_location: bool = True):
        if ensure_usage_location:
            ensure_res = self._graph_call_with_retry(
                "PATCH usageLocation",
                lambda: self._ensure_usage_location(user_id),
            )
            if ensure_res.status_code not in range(199, 300):
                logger.warning(
                    "MS Graph PATCH usageLocation failed before assignLicense: %s %s",
                    ensure_res.status_code,
                    (ensure_res.text or "")[:500],
                )
                return ensure_res
        payload = {
            "addLicenses": [{"skuId": license_id}],
            "removeLicenses": [],
        }
        return self._graph_call_with_retry(
            "assignLicense",
            lambda: self.post(
                f"{self.URL}users/{user_id}/assignLicense", json.dumps(payload)
            ),
        )

    # Backoff schedule for polling a queued (202) reset operation. Async ops
    # normally settle in seconds, but throttled tenants can take much longer;
    # the job runner has plenty of task-time budget to wait it out.
    OPERATION_POLL_SCHEDULE_SECONDS = (1.0, 1.0, 2.0, 3.0, 5.0, 8.0)

    def _await_reset_operation(
        self, response
    ) -> tuple[int, str | None, str | None]:
        """Poll the async operation status Graph returns with 202 Accepted.

        A 202 means the password reset was queued, not applied; the operation
        can still fail afterwards (e.g. banned password). Follow the
        Location header until a terminal state so callers see the real result.
        Returns ``(status, reason, operation_url)``; on timeout the URL is
        returned so callers can re-check the operation later.
        """
        location = (response.headers or {}).get("Location")
        if not location:
            return 400, "Graph queued the reset without an operation status URL.", None
        for delay in self.OPERATION_POLL_SCHEDULE_SECONDS:
            time.sleep(delay)
            status_code, reason = self.check_reset_operation(location)
            if status_code == 504:
                continue
            return status_code, reason, None
        return (
            504,
            "Password reset operation did not complete in time; it may still "
            "apply — verify the account before retrying.",
            location,
        )

    def check_reset_operation(self, operation_url: str) -> tuple[int, str | None]:
        """Resolve a queued reset's operation status once.

        Returns ``(204, None)`` for succeeded, ``(400, reason)`` for failed,
        ``(504, reason)`` while still pending or unreadable.
        """
        status_response = self.get(operation_url)
        if status_response.status_code != 200:
            return 504, "Operation status unavailable."
        try:
            operation = status_response.json()
        except ValueError:
            return 504, "Operation status unreadable."
        state = str(operation.get("status") or "").lower()
        if state == "succeeded":
            return 204, None
        if state in ("failed", "canceled"):
            detail = operation.get("error", {}) or {}
            reason = detail.get("message") or operation.get("status") or state
            return 400, f"Operation {reason}"
        return 504, "Operation still pending."

    def reset_password(self, user_id: str, tenant, *, password: str | None = None):
        new_password = password or self._generate_password()
        payload = {
            "newPassword": new_password,
        }
        self.use_app_auth = False
        self._apply_access_token(self.get_token(tenant, use_app_auth=False))

        response = self.post(
            f"{self.URL}users/{user_id}/authentication/methods/{self.PASSWORD_METHOD_ID}/resetPassword",
            json.dumps(payload),
        )
        status_code = response.status_code
        reason = None
        operation_url = None
        if status_code == 202:
            status_code, reason, operation_url = self._await_reset_operation(response)
        result = {
            "new_password": new_password,
            "status": status_code,
            "reason": reason,
        }
        if operation_url:
            result["operation_url"] = operation_url
        return result

    def delete(self, user_id: str):
        return super(MSUser, self).delete(f"{self.URL}users/{user_id}")

    def delete_with_retry(self, user_id: str) -> requests.Response:
        return self._graph_call_with_retry(
            "delete user",
            lambda: self.delete(user_id),
        )
