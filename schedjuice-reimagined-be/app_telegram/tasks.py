"""Async (django-q) Telegram jobs."""
from __future__ import annotations

import logging

from app_ai.exceptions import AIPromptBlocked, AIQuotaExceeded, AIRateLimited, AIUserQuotaExceeded
from app_ai.response_format import cleanup_ai_response_text
from app_ai.service import AIService
from app_auth.models import User
from app_course.models import Course, UserCourse
from app_telegram.client import TelegramClient
from app_telegram.formatting import markdown_to_telegram_html
from app_telegram.models import TelegramAIExchange
from utilitas.async_tasks import django_q_task, tenant_async

logger = logging.getLogger(__name__)

_QUOTA_MESSAGE = (
    "The school's monthly AI limit has been reached. Please contact an administrator."
)
_UNAVAILABLE_MESSAGE = (
    "The assistant isn't available right now. Please try again later."
)
_ERROR_MESSAGE = "Sorry, something went wrong handling your request."
_DISABLED_MESSAGE = "AI assistant is disabled for your school."


def _format_budget_footer(snap: dict) -> str:
    pct = snap["used_pct"]
    if pct >= 1.0 or pct < 0.8:
        return ""
    return (
        f"You've used {int(pct * 100)}% of your monthly AI allowance "
        f"(${snap['monthly_usd_limit']})."
    )


def _deliver_reply(
    client,
    chat_id,
    text,
    *,
    ack_message_id=None,
    reply_to_message_id=None,
    format_markdown=False,
    reply_markup=None,
):
    if format_markdown:
        text = markdown_to_telegram_html(text)
    parse_mode = "HTML" if format_markdown else None
    if ack_message_id is not None:
        try:
            return client.edit_message_text(
                chat_id,
                ack_message_id,
                text,
                parse_mode=parse_mode,
                reply_markup=reply_markup,
            )
        except Exception:
            logger.warning(
                "telegram: edit ack message failed, falling back to send",
                exc_info=True,
            )
    return client.send_message(
        chat_id,
        text,
        parse_mode=parse_mode,
        reply_to_message_id=reply_to_message_id,
        reply_markup=reply_markup,
    )


@django_q_task
@tenant_async(entity=User)
def run_ai_query(
    user,
    tenant,
    *,
    chat_id: int,
    prompt: str,
    history: list | None = None,
    user_message_id: int | None = None,
    ack_message_id: int | None = None,
    channel_key: str | None = None,
):
    """Run an OpenAI query for a linked Telegram user and reply with the answer."""
    client = TelegramClient(tenant)
    resolved_channel_key = channel_key or f"telegram:{chat_id}"
    reply_kw = {
        "ack_message_id": ack_message_id,
        "reply_to_message_id": user_message_id if ack_message_id is None else None,
    }

    if not tenant.is_ai_enabled:
        _deliver_reply(client, chat_id, _DISABLED_MESSAGE, **reply_kw)
        return

    try:
        from app_ai.confirmation import get_active_write_confirmation
        from app_ai.interaction import resolve_interaction_message
        from app_telegram.confirm_ui import build_roster_confirm_keyboard

        result = AIService().run(
            prompt,
            user,
            feature="telegram_query",
            history=history or [],
            channel_key=resolved_channel_key,
        )
        interaction_text = resolve_interaction_message(
            user=user,
            channel_key=resolved_channel_key,
        )
        reply_text = cleanup_ai_response_text(
            interaction_text or result.text or "I couldn't find an answer."
        )
        from app_ai.quota import user_budget_snapshot

        footer = _format_budget_footer(user_budget_snapshot(tenant, user.id))
        if footer:
            reply_text = f"{reply_text}\n\n{footer}"

        pending = get_active_write_confirmation(
            user=user,
            channel_key=resolved_channel_key,
        )
        reply_markup = None
        if pending is not None:
            reply_markup = build_roster_confirm_keyboard(pending.id)

        sent = _deliver_reply(
            client,
            chat_id,
            reply_text,
            format_markdown=interaction_text is None,
            reply_markup=reply_markup,
            **reply_kw,
        )
        bot_message_id = ack_message_id
        if bot_message_id is None and isinstance(sent, dict):
            bot_message_id = sent.get("message_id")

        if pending is not None:
            pending.telegram_chat_id = chat_id
            pending.telegram_message_id = bot_message_id
            pending.save(update_fields=["telegram_chat_id", "telegram_message_id"])

        if user_message_id is not None:
            TelegramAIExchange.objects.create(
                user=user,
                chat_id=chat_id,
                user_message_id=user_message_id,
                bot_message_id=bot_message_id,
                user_text=prompt,
                bot_text=reply_text,
            )
    except AIUserQuotaExceeded as exc:
        _deliver_reply(client, chat_id, str(exc), **reply_kw)
    except AIQuotaExceeded:
        _deliver_reply(client, chat_id, _QUOTA_MESSAGE, **reply_kw)
    except AIPromptBlocked as exc:
        _deliver_reply(client, chat_id, exc.message, **reply_kw)
    except AIRateLimited as exc:
        _deliver_reply(client, chat_id, exc.message, **reply_kw)
    except RuntimeError:
        _deliver_reply(client, chat_id, _UNAVAILABLE_MESSAGE, **reply_kw)
    except Exception:
        logger.exception("telegram: AI query failed")
        _deliver_reply(client, chat_id, _ERROR_MESSAGE, **reply_kw)


@django_q_task
@tenant_async(entity=UserCourse)
def dm_invite_link_to_teacher(user_course, tenant):
    """DM the course invite link to a newly-assigned teacher."""
    if not (tenant.is_telegram_on and tenant.is_telegram_roster_sync_enabled):
        return
    if user_course.assigned_as != UserCourse.AssignedAs.TEACHER:
        return
    course = user_course.course
    teacher = user_course.user
    if not course.telegram_invite_link or not teacher.telegram_chat_id:
        logger.info("telegram: skip invite DM (no link or teacher not linked)")
        return
    TelegramClient(tenant).send_message(
        teacher.telegram_chat_id,
        f"You've been added to <b>{course.title}</b>.\n"
        f"Tap to join the group: {course.telegram_invite_link}",
    )


@django_q_task
@tenant_async(entity=Course)
def remove_telegram_member(course, tenant, *, telegram_user_id: int):
    """Kick a teacher from a course's Telegram group."""
    if not (tenant.is_telegram_on and tenant.is_telegram_roster_sync_enabled):
        return
    if not course.telegram_chat_id:
        return
    TelegramClient(tenant).kick_member(course.telegram_chat_id, telegram_user_id)


@django_q_task
@tenant_async(entity=Course)
def send_telegram_group_message(course, tenant, *, text: str):
    if not (tenant.is_telegram_on and course.telegram_chat_id):
        return
    TelegramClient(tenant).send_message(course.telegram_chat_id, text)
