"""Register the Telegram webhook for the current tenant (idempotent)."""
import logging

from django.core.management import BaseCommand
from django.db import connection
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_organization.models import Organization
from app_telegram.config import _build_webhook_url, _register_webhook

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Register the Telegram webhook for the current tenant."

    def handle(self, *args, **options):
        schema = connection.schema_name
        with schema_context(get_public_schema_name()):
            org = Organization.objects.filter(schema_name=schema).first()
        if org is None or not org.is_telegram_on or not org.telegram_routing_key:
            self.stdout.write("Telegram not enabled for this tenant; skipping.")
            return
        _register_webhook(org)
        self.stdout.write(self.style.SUCCESS(f"Webhook set: {_build_webhook_url(org)}"))
