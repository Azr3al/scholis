"""
Django management command to backfill UserCourse.hourly_rate from User.course_rates.

Loops through all UserCourse where assigned_as='teacher' and hourly_rate is null.
If the user's course_rates has a rate for the course's category, sets hourly_rate to that value.
"""

from django.core.management import BaseCommand
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_course.models import UserCourse
from app_course.rate_utils import get_rate_from_user_course_rates
from app_organization.models import Organization


class Command(BaseCommand):
    help = (
        "Backfill UserCourse.hourly_rate from User.course_rates for teacher assignments "
        "where hourly_rate is null and the course's category exists in the user's course_rates."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be updated without writing to the database.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN - no changes will be saved"))

        total_updated = 0

        with schema_context(get_public_schema_name()):
            organizations = list(Organization.objects.all())

        for org in organizations:
            schema_name = getattr(org, "schema_name", None)
            if not schema_name:
                self.stdout.write(
                    self.style.WARNING(f"Skipping org (no schema_name): {org}")
                )
                continue

            with schema_context(schema_name):
                qs = UserCourse.objects.filter(
                    assigned_as=UserCourse.AssignedAs.TEACHER,
                    hourly_rate__isnull=True,
                ).select_related("user", "course")

                to_update = []
                for uc in qs:
                    rate = get_rate_from_user_course_rates(uc.user, uc.course)
                    if rate is not None:
                        uc.hourly_rate = rate
                        to_update.append(uc)

                if to_update:
                    if not dry_run:
                        UserCourse.objects.bulk_update(to_update, ["hourly_rate"])
                    count = len(to_update)
                    total_updated += count
                    self.stdout.write(
                        f"  [{schema_name}] Updated {count} UserCourse record(s)"
                    )

        self.stdout.write(
            self.style.SUCCESS(
                f"Backfill complete. Total records updated: {total_updated}"
            )
        )
