from django.core.management.base import BaseCommand

from app_custom_fields.constants import ENTITY_TYPE_USER
from app_custom_fields.seeding import ensure_builtin_field_rows, ensure_builtin_groups


class Command(BaseCommand):
    help = "Create missing built-in field policy rows in the current schema."

    def handle(self, *args, **options):
        created = ensure_builtin_field_rows(ENTITY_TYPE_USER)
        ensure_builtin_groups(ENTITY_TYPE_USER)
        self.stdout.write(self.style.SUCCESS(f"Created {created} built-in field row(s)."))
