from __future__ import annotations

import base64
import logging

import requests
from django.conf import settings

from app_attachment.models import Attachment

logger = logging.getLogger(__name__)

RESEND_API_URL = "https://api.resend.com/emails"


def _attachment_filename(attachment: Attachment) -> str:
    return attachment.filename or getattr(attachment.data, "name", "attachment")


def _encode_attachments(attachments) -> list[dict[str, str]]:
    encoded: list[dict[str, str]] = []
    for attachment in attachments or []:
        attachment.data.seek(0)
        encoded.append(
            {
                "filename": _attachment_filename(attachment),
                "content": base64.b64encode(attachment.data.read()).decode("utf-8"),
            }
        )
    return encoded


def send_via_resend(
    *,
    subject: str,
    html: str,
    to: str,
    cc=None,
    bcc=None,
    attachments=None,
) -> int:
    api_key = (getattr(settings, "RESEND_API_KEY", None) or "").strip()
    if not api_key:
        logger.error("RESEND_API_KEY is not configured; skipping email send")
        return 500

    from_email = (getattr(settings, "RESEND_FROM_EMAIL", None) or "").strip()
    from_name = (getattr(settings, "RESEND_FROM_NAME", None) or "Schedjuice").strip()
    reply_to = (getattr(settings, "RESEND_REPLY_TO", None) or "").strip()
    timeout = getattr(settings, "RESEND_TIMEOUT", 15)

    payload: dict = {
        "from": f"{from_name} <{from_email}>",
        "to": [to.strip()],
        "subject": subject,
        "html": html,
    }
    if cc:
        payload["cc"] = [addr.strip() for addr in cc]
    if bcc:
        payload["bcc"] = [addr.strip() for addr in bcc]
    if reply_to:
        payload["reply_to"] = reply_to

    encoded_attachments = _encode_attachments(attachments)
    if encoded_attachments:
        payload["attachments"] = encoded_attachments

    try:
        response = requests.post(
            RESEND_API_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=timeout,
        )
    except requests.RequestException:
        logger.exception("Resend request failed for recipient=%s", to)
        return 502

    if response.status_code >= 400:
        logger.error(
            "Resend send failed status=%s recipient=%s body=%s",
            response.status_code,
            to,
            response.text,
        )
    return response.status_code
