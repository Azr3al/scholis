"""
Django management command to delete payment assignments for courses whose
category.is_payment_assignment_eligible is False. Cleans up accidentally-created assignments.
"""

import logging

from django.core.management import BaseCommand
from django_q.tasks import async_task
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_microsoft.payment_assignment_helpers import delete_ineligible_payment_assignments

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


class Command(BaseCommand):
    help = "Delete payment assignments for courses in ineligible categories"

    def add_arguments(self, parser):
        parser.add_argument(
            "--schema",
            type=str,
            help="Process only this tenant schema (default: all Microsoft-enabled orgs)",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="List ineligible assignments without deleting",
        )
        parser.add_argument(
            "--sync",
            action="store_true",
            help="Run synchronously (no async queue). Default: async.",
        )

    def handle(self, *args, **options):
        schema_name = options.get("schema")
        dry_run = options.get("dry_run", False)

        if dry_run:
            logger.info("Running [cleanup-ineligible-payment-assignments] (dry-run)")

            with schema_context(get_public_schema_name()):
                from app_course.models import PaymentAssignment
                from app_organization.models import Organization

                if schema_name:
                    orgs = list(
                        Organization.objects.filter(
                            schema_name=schema_name, is_microsoft_on=True
                        )
                    )
                else:
                    orgs = list(Organization.objects.filter(is_microsoft_on=True))

            total = 0
            for org in orgs:
                sn = getattr(org, "schema_name", None)
                if not sn:
                    continue
                with schema_context(sn):
                    ineligible = PaymentAssignment.objects.filter(
                        course__category__is_payment_assignment_eligible=False
                    ).select_related("course", "course__category")
                    for pa in ineligible:
                        total += 1
                        self.stdout.write(
                            f"  Would delete: Course {pa.course.id} ({pa.course.title}), "
                            f"category '{pa.course.category.name}', {pa.year}-{pa.month_index}"
                        )
            self.stdout.write(
                self.style.WARNING(f"Dry-run: {total} assignment(s) would be deleted")
            )
            return

        run_sync = options.get("sync", False)

        if run_sync:
            logger.info("Running [cleanup-ineligible-payment-assignments] (sync)")

            result = delete_ineligible_payment_assignments(schema_name=schema_name)

            for detail in result["details"]:
                if "FAILED" in detail:
                    self.stderr.write(self.style.ERROR(f"  {detail}"))
                else:
                    self.stdout.write(f"  {detail}")

            self.stdout.write(
                self.style.SUCCESS(
                    f"Deleted {result['deleted']} assignment(s), {result['failed']} failed"
                )
            )
        else:
            logger.info("Running [cleanup-ineligible-payment-assignments] (async)")
            async_task(
                "app_microsoft.payment_assignment_helpers.delete_ineligible_payment_assignments",
                schema_name,
            )
            self.stdout.write(
                self.style.SUCCESS(
                    "Cleanup task queued. Check django-q for results."
                )
            )
