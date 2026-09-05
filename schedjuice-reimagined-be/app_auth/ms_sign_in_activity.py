"""Batch Microsoft sign-in activity for user insights."""
from __future__ import annotations

import logging

from app_microsoft.graph_wrapper.user import MSUser

logger = logging.getLogger(__name__)

MAX_BATCH = 50


def fetch_sign_in_activity_for_users(tenant, users_by_id: dict[int, object]) -> dict[str, dict]:
    if not getattr(tenant, "is_microsoft_on", False):
        return {}

    out: dict[str, dict] = {}
    ms = MSUser(tenant)
    for uid, user in list(users_by_id.items())[:MAX_BATCH]:
        key = str(uid)
        microsoft_id = getattr(user, "microsoft_id", None)
        if not microsoft_id:
            out[key] = {"last_sign_in": None, "error": "not_linked"}
            continue
        try:
            response = ms.get_sign_in_activity(microsoft_id)
            if response.status_code != 200:
                out[key] = {"last_sign_in": None, "error": "graph_error"}
                continue
            payload = response.json()
            activity = payload.get("signInActivity") or {}
            out[key] = {"last_sign_in": activity.get("lastSignInDateTime")}
        except Exception:
            logger.exception("MS sign-in activity fetch failed user_id=%s", uid)
            out[key] = {"last_sign_in": None, "error": "graph_error"}
    return out
