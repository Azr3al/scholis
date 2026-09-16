"""
Django management command to list ProcessedTeamsRecording records for a tenant.
Useful for inspecting stored recording metadata (read-only; Teams download sync is deprecated).

Usage:
  python manage.py list-processed-recordings --schema-name xteachersu
  python manage.py list-processed-recordings --schema-name xteachersu --limit 10
  python manage.py list-processed-recordings --schema-name xteachersu --pending-delete
"""

from django.core.management import BaseCommand
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_course.models import ProcessedTeamsRecording
from app_organization.models import Organization


class Command(BaseCommand):
    help = "List ProcessedTeamsRecording records for a tenant"

    def add_arguments(self, parser):
        parser.add_argument(
            "--schema-name",
            type=str,
            required=True,
            help="Tenant schema name (e.g. xteachersu)",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=20,
            help="Max records to show (default: 20)",
        )
        parser.add_argument(
            "--pending-delete",
            action="store_true",
            help="Only show recordings with file_path set but onedrive_deleted=False",
        )

    def handle(self, *args, **options):
        schema_name = options["schema_name"]
        limit = options["limit"]
        pending_delete = options.get("pending_delete", False)

        with schema_context(get_public_schema_name()):
            org = Organization.objects.filter(schema_name=schema_name).first()
            if not org:
                self.stdout.write(
                    self.style.ERROR(f"Organization with schema '{schema_name}' not found.")
                )
                return

        with schema_context(schema_name):
            total = ProcessedTeamsRecording.objects.count()
            with_file = ProcessedTeamsRecording.objects.filter(
                file_path__isnull=False
            ).exclude(file_path="").count()
            deleted_count = ProcessedTeamsRecording.objects.filter(
                onedrive_deleted=True
            ).count()
            pending_count = (
                ProcessedTeamsRecording.objects.filter(
                    file_path__isnull=False, onedrive_deleted=False
                ).exclude(file_path="").count()
            )

            self.stdout.write(f"ProcessedTeamsRecording count: {total}")
            self.stdout.write(f"  with file_path: {with_file}")
            self.stdout.write(
                self.style.SUCCESS(f"  onedrive_deleted=True: {deleted_count}")
            )
            if pending_count > 0:
                self.stdout.write(
                    self.style.WARNING(
                        f"  pending deletion (file_path set, onedrive_deleted=False): {pending_count}"
                    )
                )
            else:
                self.stdout.write(f"  pending deletion: 0")

            if total == 0:
                self.stdout.write("  (no records)")
                return

            qs = ProcessedTeamsRecording.objects.select_related("course")
            if pending_delete:
                qs = qs.filter(
                    file_path__isnull=False, onedrive_deleted=False
                ).exclude(file_path="")
            recs = qs.order_by("-created_at")[:limit]

            label = "pending-delete" if pending_delete else "most recent"
            self.stdout.write(f"\n{label.capitalize()} {len(recs)} record(s):")
            for r in recs:
                course_title = (r.course.title or "?")[:40] if r.course else "?"
                deleted_str = "yes" if r.onedrive_deleted else "NO"
                self.stdout.write(
                    f"  id={r.id} course={r.course_id} ({course_title}) "
                    f"file_path={r.file_path or '-'} "
                    f"onedrive_deleted={deleted_str} "
                    f"created_at={r.created_at}"
                )
