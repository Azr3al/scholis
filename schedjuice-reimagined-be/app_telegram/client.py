"""Thin Telegram Bot API wrapper built from a per-org bot token."""
from __future__ import annotations

import logging
from typing import Any

import requests

logger = logging.getLogger(__name__)

BASE = "https://api.telegram.org"
TIMEOUT = 15


class TelegramApiError(RuntimeError):
    def __init__(self, method: str, description: str, error_code: int | None = None):
        self.method = method
        self.description = description
        self.error_code = error_code
        super().__init__(f"{method} failed: {description} (code={error_code})")


class TelegramClient:
    def __init__(self, tenant):
        self.tenant = tenant
        self._token = tenant.get_telegram_bot_token()
        if not self._token:
            raise TelegramApiError("__init__", "Organization has no Telegram bot token")

    def _call(self, method: str, payload: dict[str, Any] | None = None) -> Any:
        url = f"{BASE}/bot{self._token}/{method}"
        resp = requests.post(url, json=payload or {}, timeout=TIMEOUT)
        try:
            body = resp.json()
        except ValueError:
            raise TelegramApiError(method, f"non-JSON response ({resp.status_code})")
        if not body.get("ok"):
            raise TelegramApiError(
                method, body.get("description", "unknown error"), body.get("error_code")
            )
        return body.get("result")

    def get_me(self) -> dict:
        return self._call("getMe")

    def set_webhook(self, url: str, secret_token: str, allowed_updates: list[str]) -> Any:
        return self._call(
            "setWebhook",
            {
                "url": url,
                "secret_token": secret_token,
                "allowed_updates": allowed_updates,
                "drop_pending_updates": True,
            },
        )

    def delete_webhook(self) -> Any:
        return self._call("deleteWebhook", {"drop_pending_updates": True})

    def get_webhook_info(self) -> dict:
        return self._call("getWebhookInfo")

    def set_my_commands(self, commands: list[dict]) -> Any:
        return self._call("setMyCommands", {"commands": commands})

    def send_message(
        self,
        chat_id: int,
        text: str,
        parse_mode: str | None = "HTML",
        *,
        reply_to_message_id: int | None = None,
        reply_markup: dict | None = None,
    ) -> dict:
        payload: dict[str, Any] = {
            "chat_id": chat_id,
            "text": text,
            "disable_web_page_preview": True,
        }
        if parse_mode:
            payload["parse_mode"] = parse_mode
        if reply_to_message_id is not None:
            payload["reply_to_message_id"] = reply_to_message_id
        if reply_markup is not None:
            payload["reply_markup"] = reply_markup
        try:
            return self._call("sendMessage", payload)
        except TelegramApiError as exc:
            if parse_mode and "can't parse entities" in exc.description.lower():
                logger.warning(
                    "telegram: HTML parse failed, retrying as plain text",
                    extra={"chat_id": chat_id},
                )
                plain_payload = {k: v for k, v in payload.items() if k != "parse_mode"}
                return self._call("sendMessage", plain_payload)
            raise

    def edit_message_text(
        self,
        chat_id: int,
        message_id: int,
        text: str,
        parse_mode: str | None = "HTML",
        *,
        reply_markup: dict | None = None,
    ) -> dict:
        payload: dict[str, Any] = {
            "chat_id": chat_id,
            "message_id": message_id,
            "text": text,
            "disable_web_page_preview": True,
        }
        if parse_mode:
            payload["parse_mode"] = parse_mode
        if reply_markup is not None:
            payload["reply_markup"] = reply_markup
        try:
            return self._call("editMessageText", payload)
        except TelegramApiError as exc:
            if parse_mode and "can't parse entities" in exc.description.lower():
                logger.warning(
                    "telegram: HTML parse failed on edit, retrying as plain text",
                    extra={"chat_id": chat_id, "message_id": message_id},
                )
                plain_payload = {k: v for k, v in payload.items() if k != "parse_mode"}
                return self._call("editMessageText", plain_payload)
            raise

    def set_message_reaction(
        self, chat_id: int, message_id: int, emoji: str, *, is_big: bool = False
    ) -> Any:
        payload = {
            "chat_id": chat_id,
            "message_id": message_id,
            "reaction": [{"type": "emoji", "emoji": emoji}],
            "is_big": is_big,
        }
        try:
            return self._call("setMessageReaction", payload)
        except TelegramApiError as exc:
            if emoji != "👀":
                logger.warning(
                    "telegram: reaction %r failed (%s), retrying with 👀",
                    emoji,
                    exc.description,
                )
                payload["reaction"] = [{"type": "emoji", "emoji": "👀"}]
                return self._call("setMessageReaction", payload)
            raise

    def get_chat(self, chat_id: int) -> dict:
        return self._call("getChat", {"chat_id": chat_id})

    def create_chat_invite_link(self, chat_id: int, name: str = "") -> dict:
        return self._call(
            "createChatInviteLink",
            {"chat_id": chat_id, "name": name[:32], "creates_join_request": True},
        )

    def approve_chat_join_request(self, chat_id: int, user_id: int) -> Any:
        return self._call(
            "approveChatJoinRequest", {"chat_id": chat_id, "user_id": user_id}
        )

    def decline_chat_join_request(self, chat_id: int, user_id: int) -> Any:
        return self._call(
            "declineChatJoinRequest", {"chat_id": chat_id, "user_id": user_id}
        )

    def kick_member(self, chat_id: int, user_id: int) -> Any:
        self._call("banChatMember", {"chat_id": chat_id, "user_id": user_id})
        return self._call(
            "unbanChatMember",
            {"chat_id": chat_id, "user_id": user_id, "only_if_banned": True},
        )

    def leave_chat(self, chat_id: int) -> Any:
        return self._call("leaveChat", {"chat_id": chat_id})

    def answer_callback_query(
        self,
        callback_query_id: str,
        *,
        text: str | None = None,
        show_alert: bool = False,
    ) -> Any:
        payload: dict[str, Any] = {"callback_query_id": callback_query_id}
        if text:
            payload["text"] = text
        if show_alert:
            payload["show_alert"] = True
        return self._call("answerCallbackQuery", payload)
