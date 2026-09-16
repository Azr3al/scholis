from django.core.management.base import BaseCommand
from django.db.models import Q
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.id_photo_thumbs import sync_id_photo_thumb
from app_auth.models import User
from app_organization.models import Organization


class Command(BaseCommand):
    help = "Generate id_photo_thumb for users with id_photo but no thumb."

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
                qs = (
                    User.objects.filter(id_photo__isnull=False)
                    .exclude(id_photo="")
                    .filter(Q(id_photo_thumb="") | Q(id_photo_thumb__isnull=True))
                )
                if limit is not None:
                    qs = qs[:limit]
                users = list(qs)
                count = len(users)
                if dry_run:
                    self.stdout.write(f"  would process {count} user(s)")
                    continue
                ok = 0
                for user in users:
                    try:
                        sync_id_photo_thumb(user)
                        ok += 1
                    except Exception as exc:
                        self.stderr.write(f"  user {user.id}: {exc}")
                self.stdout.write(self.style.SUCCESS(f"  processed {ok}/{count}"))
