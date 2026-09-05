"""Soft-delete custom-field attachments that are no longer referenced."""

from __future__ import annotations

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from app_attachment.models import Attachment
from app_auth.models import User
from app_course.models import Course
from app_custom_fields.attachment_rules import CUSTOM_FIELD_ATTACHMENT_TABLE
from app_custom_fields.models import CustomFieldAttachment, FieldDefinition


def _referenced_attachment_ids(entity_type: str, model, attachment_keys: frozenset[str]) -> set[int]:
    if not attachment_keys:
        return set()
    referenced: set[int] = set()
    for cd in model.objects.exclude(custom_data={}).values_list("custom_data", flat=True).iterator():
        if not isinstance(cd, dict):
            continue
        for key in attachment_keys:
            for item in cd.get(key) or []:
                if isinstance(item, dict) and item.get("id") is not None:
                    try:
                        referenced.add(int(item["id"]))
                    except (TypeError, ValueError):
                        continue
    return referenced


def sweep_orphan_custom_field_attachments(*, older_than_hours: int = 24, dry_run: bool = False) -> int:
    cutoff = timezone.now() - timedelta(hours=older_than_hours)
    deleted = 0

    for entity_type, model in (
        (User._meta.label, User),
        (Course._meta.label, Course),
    ):
        attachment_keys = frozenset(
            FieldDefinition.objects.filter(
                entity_type=entity_type,
                field_type=FieldDefinition.FieldType.ATTACHMENT,
                is_active=True,
            ).values_list("field_key", flat=True)
        )
        referenced = _referenced_attachment_ids(entity_type, model, attachment_keys)

        qs = (
            CustomFieldAttachment.objects.select_related("attachment")
            .filter(
                entity_type=entity_type,
                attachment__table_name=CUSTOM_FIELD_ATTACHMENT_TABLE,
                attachment__is_deleted=False,
                attachment__created_at__lt=cutoff,
            )
            .exclude(attachment_id__in=referenced)
        )
        for link in qs.iterator():
            if dry_run:
                deleted += 1
                continue
            Attachment.objects.filter(pk=link.attachment_id).update(is_deleted=True)
            deleted += 1
    return deleted


class Command(BaseCommand):
    help = (
        "Soft-delete custom-field attachments older than N hours that are not "
        "referenced in any entity custom_data."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Count orphans without deleting.",
        )
        parser.add_argument(
            "--older-than-hours",
            type=int,
            default=24,
            help="Only consider attachments created before this many hours ago.",
        )

    def handle(self, *args, **options):
        count = sweep_orphan_custom_field_attachments(
            older_than_hours=options["older_than_hours"],
            dry_run=options["dry_run"],
        )
        verb = "Would delete" if options["dry_run"] else "Deleted"
        self.stdout.write(self.style.SUCCESS(f"{verb} {count} orphan attachment(s)."))
