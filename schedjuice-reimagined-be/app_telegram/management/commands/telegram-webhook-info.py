"""Show the locally-stored webhook config vs. what Telegram has registered.

Useful for diagnosing webhook 404s: compares the routing key / URL this app
expects against the URL Telegram is actually calling, and surfaces Telegram's
last delivery error.
"""
import logging

from django.core.management import BaseCommand
from django.db import connection
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_organization.models import Organization
from app_telegram.client import TelegramApiError, TelegramClient
from app_telegram.config import _build_webhook_url

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Show stored vs. Telegram-registered webhook info for the current tenant."

    def handle(self, *args, **options):
        schema = connection.schema_name
        with schema_context(get_public_schema_name()):
            org = Organization.objects.filter(schema_name=schema).first()
        if org is None:
            self.stdout.write(self.style.ERROR(f"No organization for schema {schema!r}."))
            return
        if not org.telegram_routing_key:
            self.stdout.write("Telegram webhook not configured for this tenant.")
            return

        expected_url = _build_webhook_url(org)
        self.stdout.write(f"is_telegram_on:   {org.is_telegram_on}")
        self.stdout.write(f"routing_key:      {org.telegram_routing_key}")
        self.stdout.write(f"expected url:     {expected_url}")

        try:
            info = TelegramClient(org).get_webhook_info()
        except TelegramApiError as exc:
            self.stdout.write(self.style.ERROR(f"getWebhookInfo failed: {exc}"))
            return

        telegram_url = info.get("url") or ""
        self.stdout.write(f"telegram url:     {telegram_url or '(none)'}")
        self.stdout.write(f"pending updates:  {info.get('pending_update_count')}")
        if info.get("last_error_message"):
            self.stdout.write(
                self.style.WARNING(
                    f"last error:       {info.get('last_error_message')} "
                    f"(at {info.get('last_error_date')})"
                )
            )

        if telegram_url == expected_url:
            self.stdout.write(self.style.SUCCESS("Telegram URL matches stored config."))
        else:
            self.stdout.write(
                self.style.ERROR("Telegram URL does NOT match stored config.")
            )
