"""Shared HTTP reaction-toggle handling for course chat and DM."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response

from app_auth.models import User
from app_chat.reaction_helpers import toggle_chat_reaction
from utilitas.views import BaseView


def handle_chat_reaction_toggle_post(
    request: Request,
    *,
    message: Any,
    toggle_kwargs: dict[str, Any],
    broadcast: Callable[[list], None],
) -> Response:
    """Validate emoji body, toggle reaction, broadcast, return API response."""
    user = User.get_user_from_request(request)
    if not user:
        return BaseView.send_response(
            True, "unauthorized", {"details": "Authentication required"}, status=401
        )

    body = request.data if isinstance(request.data, dict) else {}
    emoji = body.get("emoji")
    if not isinstance(emoji, str) or not emoji.strip():
        return BaseView.send_response(
            True,
            "bad_request",
            {"details": "Body must include string 'emoji'"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        reactions = toggle_chat_reaction(user, emoji=emoji.strip(), **toggle_kwargs)
    except DjangoValidationError as e:
        details = e.message_dict if hasattr(e, "message_dict") else str(e)
        if isinstance(details, dict) and details.get("details"):
            return BaseView.send_response(
                True, "forbidden", {"details": details["details"]}, status=403
            )
        return BaseView.send_response(
            True,
            "bad_request",
            {"details": details},
            status=status.HTTP_400_BAD_REQUEST,
        )

    broadcast(reactions)
    return BaseView.send_response(
        False,
        "success",
        {"data": {"message_id": message.id, "reactions": reactions}},
        status=status.HTTP_200_OK,
    )
