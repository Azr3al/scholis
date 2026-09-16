"""
Deprecated: use sync-meeting-attendance. Delegates to sync-meeting-attendance for backward compatibility.
"""

from django.core.management import BaseCommand, call_command


class Command(BaseCommand):
    help = "Deprecated alias for sync-meeting-attendance (Teams + Zoom)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--course-id",
            type=int,
            help="Sync a single course (requires --schema-name)",
        )
        parser.add_argument(
            "--schema-name",
            type=str,
            help="Schema/tenant name (required with --course-id)",
        )
        parser.add_argument(
            "--sync",
            action="store_true",
            help="Run synchronously (no async queue)",
        )
        parser.add_argument(
            "--reprocess",
            action="store_true",
            help="Clear processed report markers and re-fetch",
        )
        parser.add_argument(
            "--channel-meeting",
            action="store_true",
            help="Teams channel meeting mode (see sync-meeting-attendance).",
        )

    def handle(self, *args, **options):
        self.stdout.write(
            self.style.WARNING(
                "sync-teams-attendance is deprecated; use sync-meeting-attendance."
            )
        )
        kwargs = {
            "sync": options.get("sync", False),
            "reprocess": options.get("reprocess", False),
            "channel_meeting": options.get("channel_meeting", False),
        }
        if options.get("course_id") is not None:
            kwargs["course_id"] = options["course_id"]
        if options.get("schema_name") is not None:
            kwargs["schema_name"] = options["schema_name"]
        call_command("sync-meeting-attendance", **kwargs)
