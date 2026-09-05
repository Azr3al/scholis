"""Welcome emails for users created via the import wizard."""

from django_q.tasks import async_task

from app_auth.models import User
from app_auth.welcome_email_helpers import should_send_welcome_email
from app_organization.acca_spreadsheet_import import IMPORT_PASSWORD


def send_import_welcome_emails(tenant, user_ids: list[int]) -> None:
    """Queue credential emails for newly imported users (async via django-q)."""
    if not user_ids:
        return

    for user in User.objects.filter(id__in=user_ids):
        if user.is_waiting_for_activation:
            continue
        if not should_send_welcome_email(user, tenant):
            continue
        to = user.communication_email or user.email
        if not to:
            continue
        async_task(
            "app_microsoft.mail.send_user_create_email",
            to,
            user.email,
            IMPORT_PASSWORD,
            user.name,
            tenant,
        )
