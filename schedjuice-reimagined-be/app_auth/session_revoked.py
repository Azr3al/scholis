"""Session revocation error shape for refresh and auth failures."""

from __future__ import annotations

from rest_framework.exceptions import AuthenticationFailed

REVOKED_REASON_SESSION_ROTATED = "session_rotated"
REVOKED_REASON_DEVICE_DISPLACED = "device_displaced"
REVOKED_REASON_ADMIN_REVOKED = "admin_revoked"
REVOKED_REASON_USER_LOGOUT = "user_logout"
REVOKED_REASON_PASSWORD_RESET = "password_reset"
REVOKED_REASON_LOGOUT_ALL = "logout_all"
REVOKED_REASON_UNKNOWN = "unknown"

SESSION_REVOKED_DETAIL = "Session has been revoked."
SESSION_REVOKED_CODE = "session_revoked"


class SessionRevokedAuthenticationFailed(AuthenticationFailed):
    """Raised when a refresh session was revoked (logout, displacement, admin, etc.)."""

    default_detail = SESSION_REVOKED_DETAIL
    default_code = SESSION_REVOKED_CODE

    def __init__(self, reason: str | None = None):
        self.reason = reason or REVOKED_REASON_UNKNOWN
        super().__init__(detail=SESSION_REVOKED_DETAIL, code=SESSION_REVOKED_CODE)
