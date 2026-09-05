from django.core.management.base import BaseCommand
from django.db import transaction
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_auth.user_code import (
    AUTO_GENERATED_CODE_RE,
    format_user_code,
    reconcile_counters_from_existing_codes,
    type_digit_for_roles,
    year_for_user,
)
from app_organization.models import Organization

BULK_BATCH_SIZE = 500


class Command(BaseCommand):
    help = "Backfill User.code for users with null code using year-scoped sequential IDs."

    def add_arguments(self, parser):
        parser.add_argument("--schema_name", type=str, default=None)
        parser.add_argument("--dry_run", action="store_true")
        parser.add_argument("--limit", type=int, default=None)

    def handle(self, *args, **options):
        schema_name = options["schema_name"]
        dry_run = options["dry_run"]
        limit = options["limit"]

        with schema_context(get_public_schema_name()):
            if schema_name:
                orgs = list(Organization.objects.filter(schema_name=schema_name))
            else:
                orgs = list(
                    Organization.objects.exclude(schema_name=get_public_schema_name())
                )

        if not orgs:
            self.stdout.write(self.style.WARNING("No tenant schemas to process."))
            return

        for org in orgs:
            self.stdout.write(f"Schema {org.schema_name}...")
            with schema_context(org.schema_name):
                qs = User.objects.filter(code__isnull=True).order_by("created_at", "id")
                if limit is not None:
                    qs = qs[:limit]
                users = list(qs)
                if not users:
                    self.stdout.write("  nothing to backfill")
                    continue

                running: dict[tuple[str, int], int] = {}
                for code in User.objects.exclude(code__isnull=True).values_list(
                    "code", flat=True
                ):
                    if not code or not AUTO_GENERATED_CODE_RE.fullmatch(code):
                        continue
                    key = (code[0], int(code[1:5]))
                    seq = int(code[5:])
                    running[key] = max(running.get(key, 0), seq)

                assignments: list[tuple[User, str]] = []

                for user in users:
                    type_digit = type_digit_for_roles(list(user.roles or []))
                    year = year_for_user(user)
                    key = (type_digit, year)
                    seq = running.get(key, 0) + 1
                    if seq > 9999:
                        self.stderr.write(
                            f"  skip user {user.id}: sequence overflow for {key}"
                        )
                        continue
                    running[key] = seq
                    code = format_user_code(
                        type_digit=type_digit, year=year, sequence=seq
                    )
                    assignments.append((user, code))

                if dry_run:
                    sample = ", ".join(
                        f"{u.email} -> {c}" for u, c in assignments[:5]
                    )
                    self.stdout.write(
                        f"  would assign {len(assignments)} code(s)"
                        + (f" (sample: {sample})" if sample else "")
                    )
                    continue

                with transaction.atomic():
                    for i in range(0, len(assignments), BULK_BATCH_SIZE):
                        batch = assignments[i : i + BULK_BATCH_SIZE]
                        for user, code in batch:
                            user.code = code
                        User.objects.bulk_update(
                            [u for u, _ in batch],
                            ["code", "updated_at"],
                            batch_size=BULK_BATCH_SIZE,
                        )
                    reconcile_counters_from_existing_codes()

                self.stdout.write(
                    self.style.SUCCESS(f"  assigned {len(assignments)} code(s)")
                )
