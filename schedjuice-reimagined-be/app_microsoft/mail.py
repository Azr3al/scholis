import base64
import logging

from app_attachment.models import Attachment

from app_microsoft.email_templates import build_subject, render_email, tenant_label
from app_microsoft.graph_wrapper.base import BaseMSRequest
from app_microsoft.resend_transport import send_via_resend

logger = logging.getLogger(__name__)


def file_attachment(attachment: Attachment, is_inline):
    try:
        data_body = {
            "@odata.type": "#microsoft.graph.fileAttachment",
            "contentBytes": base64.b64encode(attachment.data.file.read()).decode("utf-8"),
            "name": attachment.filename,
            "isInline": is_inline,
        }
        return data_body
    except FileNotFoundError:
        raise Exception("File not Found")


def getRecipients(recipients: list[str]):
    return [{"emailAddress": {"address": recipient.strip()}} for recipient in recipients]


def getAttachments(attachments):
    return [file_attachment(attachment, False) for attachment in attachments]


def send_mail(tenant, subject, body, to: str, cc=None, bcc=None, attachments=None):
    logger.info(f"Sending email for {tenant.schema_name}")
    if attachments is None:
        attachments = []
    data = {
        "message": {
            "subject": subject,
            "body": {"contentType": "HTML", "content": body},
            "toRecipients": getRecipients([to]),
        }
    }

    if tenant.is_microsoft_on:
        res = BaseMSRequest(tenant)
        if cc is not None:
            data["message"]["ccRecipients"] = getRecipients(cc)

        if bcc is not None:
            data["message"]["bccRecipients"] = getRecipients(bcc)
        if attachments is not None:
            data["message"]["attachments"] = getAttachments(attachments)
        r = res.post(
            f"https://graph.microsoft.com/v1.0/users/{tenant.default_owner_id}/sendMail",
            json=data,
        )
        logger.info(f"Email response: {r.status_code}")

        return r.status_code

    return send_via_resend(
        subject=subject,
        html=body,
        to=to,
        cc=cc,
        bcc=bcc,
        attachments=attachments,
    )


def send_user_create_email(to, user_email, password, name, tenant):
    logger.info(f"Preparing user create email for {tenant.schema_name}")
    org_name = tenant_label(tenant) or "your organization"
    login_url = f"https://{tenant.domain_url}"
    subject = build_subject(tenant, "Your account")
    body = render_email(
        tenant=tenant,
        recipient_name=name,
        heading=f"Your account at {org_name}",
        intro_html=(
            "A user account has been created for you. Sign in with the credentials below, "
            "then change your password after your first login."
        ),
        detail_rows=[
            ("Login email", user_email),
            ("Temporary password", password),
        ],
        cta_label="Sign in",
        cta_url=login_url,
        preheader=f"Your {org_name} account is ready.",
    )
    return send_mail(tenant, subject, body, to)


def send_user_welcome_email_resend(to, user_email, name, tenant):
    logger.info(f"Preparing welcome email resend for {tenant.schema_name}")
    org_name = tenant_label(tenant) or "your organization"
    login_url = f"https://{tenant.domain_url}"
    subject = build_subject(tenant, "Your account")
    body = render_email(
        tenant=tenant,
        recipient_name=name,
        heading=f"Welcome back to {org_name}",
        intro_html=(
            "This is a re-sent welcome email. Your account is ready — "
            "please log in with your existing credentials."
        ),
        detail_rows=[("Login email", user_email)],
        cta_label="Sign in",
        cta_url=login_url,
        outro_html=(
            "If you have forgotten your password, use the password reset option on the login page."
        ),
        preheader=f"Your {org_name} account is ready.",
    )
    return send_mail(tenant, subject, body, to)


def send_generic_mail(to, subject_label, content, tenant, name="User"):
    logger.info(f"Preparing generic email for {tenant.schema_name}")
    org_name = tenant_label(tenant) or "your organization"
    subject = build_subject(tenant, subject_label)
    body = render_email(
        tenant=tenant,
        recipient_name=name,
        heading=f"A message from {org_name}",
        intro_html=content,
        preheader=f"Notification from {org_name}.",
    )
    return send_mail(tenant, subject, body, to)
