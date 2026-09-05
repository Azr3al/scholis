from django.core.management.base import BaseCommand
from tenant_schemas.utils import schema_context
from app_auth.models import User
from django.db import connection


class Command(BaseCommand):
    help = "Delete a user from a specific schema safely (bypassing broken cascades)"

    def add_arguments(self, parser):
        parser.add_argument("email", type=str)
        parser.add_argument("schema", type=str)

    def handle(self, *args, **options):
        email = options["email"]
        schema = options["schema"]

        with schema_context(schema):
            user = User.objects.filter(email__iexact=email).first()

            if not user:
                self.stdout.write(self.style.WARNING(f"User not found in {schema}"))
                return

            self.stdout.write(f"Deleting: ID={user.id}, email={user.email}")

            try:
                # Try normal delete first
                user.delete()
                self.stdout.write(self.style.SUCCESS("Deleted via ORM"))
            except Exception as e:
                self.stdout.write(self.style.WARNING(f"ORM delete failed: {e}"))
                self.stdout.write("Falling back to raw SQL delete...")

                # Fallback: raw delete (bypass cascades)
                with connection.cursor() as cursor:
                    cursor.execute(
                        "DELETE FROM app_auth_user WHERE id = %s",
                        [user.id],
                    )

                self.stdout.write(self.style.SUCCESS("Deleted via raw SQL"))