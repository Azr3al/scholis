"""
Set User.last_login from LOGIN audit logs (max created_at per user), taking max with existing last_login.
Run per tenant; idempotent. Deploy after SIMPLE_JWT UPDATE_LAST_LOGIN is True.
"""

from django.core.management.base import BaseCommand, CommandError
from django.db.models import Max
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_organization.models import Organization
from app_reports.models import Log


class Command(BaseCommand):
    help = (
        "Backfill User.last_login from Log rows (category=LOGIN, entity=user). "
        "Uses max(existing last_login, latest log time) per user."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--schema-name",
            type=str,
            help="Only this tenant schema; default is all organizations.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Print counts only; do not update users.",
        )

    def handle(self, *args, **options):
        schema_filter = options.get("schema_name")
        dry_run = options["dry_run"]

        qs = Organization.objects.all().order_by("schema_name")
        if schema_filter:
            qs = qs.filter(schema_name=schema_filter)
            if not qs.exists():
                raise CommandError(f"No organization with schema_name={schema_filter!r}")

        grand = 0
        for org in qs:
            with schema_context(org.schema_name):
                aggregates = (
                    Log.objects.filter(
                        category="LOGIN",
                        entity="user",
                        entity_id__isnull=False,
                    )
                    .values("entity_id")
                    .annotate(latest_login=Max("created_at"))
                )
                updated_here = 0
                skipped_missing_user = 0
                for row in aggregates:
                    uid = row["entity_id"]
                    latest = row["latest_login"]
                    user = User.objects.filter(pk=uid).first()
                    if not user:
                        skipped_missing_user += 1
                        continue
                    cur = user.last_login
                    if cur is not None and cur >= latest:
                        continue
                    updated_here += 1
                    if not dry_run:
                        User.objects.filter(pk=uid).update(last_login=latest)
                grand += updated_here
                self.stdout.write(
                    f"{org.schema_name}: would update / updated {updated_here} user(s)"
                    + (
                        f"; skipped {skipped_missing_user} orphan log user id(s)"
                        if skipped_missing_user
                        else ""
                    )
                )
        if dry_run:
            self.stdout.write(self.style.WARNING(f"[dry-run] total rows to update: {grand}"))
        else:
            self.stdout.write(self.style.SUCCESS(f"Done. Total user rows updated: {grand}"))
