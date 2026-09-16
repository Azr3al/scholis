"""
Backfill Microsoft Teams posts for course announcements that were never sent.

Default is dry-run: reports eligible rows without enqueueing sends.
"""

from __future__ import annotations

import logging

from django.core.management import BaseCommand
from django.db.models import Q
from tenant_schemas.utils import schema_context

from app_announcement.models import Announcement, MicrosoftTeamsStatus
from app_course.models import Course
from app_microsoft.delegated_auth import org_service_account_is_active
from app_microsoft.announcement_helpers import schedule_announcement_teams_sync
from app_organization.models import Organization

logger = logging.getLogger(__name__)


def eligible_unsent_queryset(*, course_id: int | None = None, since: str | None = None):
    course_ids_with_team = Course.objects.filter(
        microsoft_group_id__isnull=False,
    ).exclude(microsoft_group_id="").values_list("id", flat=True)

    qs = Announcement.objects.filter(
        send_to_microsoft=True,
        course_id__isnull=False,
        course_id__in=course_ids_with_team,
    ).filter(
        Q(microsoft_teams_message_id__isnull=True)
        | Q(microsoft_teams_message_id="")
    ).exclude(
        microsoft_teams_status=MicrosoftTeamsStatus.SENT,
    )

    if course_id is not None:
        qs = qs.filter(course_id=course_id)
    if since:
        qs = qs.filter(created_at__date__gte=since)
    return qs.order_by("id")


class Command(BaseCommand):
    help = (
        "Enqueue Teams delivery for course announcements that were marked "
        "send_to_microsoft but never recorded a Teams message id."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--schema-name",
            type=str,
            help="Limit to one tenant schema",
        )
        parser.add_argument(
            "--course",
            type=int,
            help="Only announcements for this course id",
        )
        parser.add_argument(
            "--since",
            type=str,
            help="Only announcements created on or after YYYY-MM-DD",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=100,
            help="Maximum announcements to enqueue per tenant (default 100)",
        )
        parser.add_argument(
            "--commit",
            action="store_true",
            help="Actually enqueue Teams sync tasks (default is dry-run)",
        )

    def handle(self, *args, **options):
        schema_filter = options.get("schema_name")
        course_id = options.get("course")
        since = options.get("since")
        limit = options.get("limit") or 100
        commit = options.get("commit")

        orgs = Organization.objects.filter(is_microsoft_on=True)
        if schema_filter:
            orgs = orgs.filter(schema_name=schema_filter)

        total_eligible = 0
        total_enqueued = 0

        for org in orgs:
            with schema_context(org.schema_name):
                qs = eligible_unsent_queryset(course_id=course_id, since=since)
                count = qs.count()
                total_eligible += count
                self.stdout.write(
                    f"{org.schema_name}: {count} eligible unsent announcement(s)"
                )
                if not commit or count == 0:
                    continue

                if not org_service_account_is_active(org):
                    self.stderr.write(
                        self.style.ERROR(
                            f"{org.schema_name}: Microsoft service account is not "
                            "connected or needs reconnect. Connect it in Organization "
                            "settings before running backfill with --commit."
                        )
                    )
                    continue

                for announcement in qs[:limit]:
                    try:
                        schedule_announcement_teams_sync(
                            announcement,
                            org,
                            force_service_account=True,
                        )
                        total_enqueued += 1
                        self.stdout.write(
                            self.style.SUCCESS(
                                f"  enqueued announcement id={announcement.id} "
                                f"course={announcement.course_id}"
                            )
                        )
                    except Exception as exc:
                        logger.exception(
                            "backfill_teams_announcements failed for id=%s",
                            announcement.id,
                        )
                        self.stderr.write(
                            self.style.ERROR(
                                f"  failed announcement id={announcement.id}: {exc}"
                            )
                        )

        if commit:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Enqueued {total_enqueued} of {total_eligible} eligible announcement(s)."
                )
            )
        else:
            self.stdout.write(
                "Dry-run only. Re-run with --commit to enqueue Teams sync tasks. "
                "Resends appear in Teams with the current timestamp; posts that "
                "already landed without a recorded message id may duplicate."
            )
