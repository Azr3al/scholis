"""
Set is_active=False for non-student-only users whose email is not in a whitelist CSV.
Runs per tenant schema; use --schema-name to limit to one organization.
"""

from pathlib import Path

from django.core.management import BaseCommand
from django.core.management.base import CommandError
from django.db.models.functions import Lower
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_organization.models import Organization


def _default_csv_path() -> Path:
    # schedjuice-reimagined-be/app_auth/management/commands/ -> project root (4 levels)
    return Path(__file__).resolve().parent.parent.parent.parent / "whitelist-emails.csv"


def _load_whitelist(path: Path) -> set[str]:
    if not path.is_file():
        raise CommandError(f"Whitelist file not found: {path}")
    emails: set[str] = set()
    with path.open(encoding="utf-8") as f:
        for line in f:
            s = line.strip()
            if not s:
                continue
            emails.add(s.lower())
    if not emails:
        raise CommandError(
            "Whitelist is empty after skipping blank lines; refusing to deactivate users."
        )
    return emails


class Command(BaseCommand):
    help = (
        "Deactivate (is_active=False) non-student-only users whose email is not in the CSV."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--csv",
            type=Path,
            default=_default_csv_path(),
            help=f"Path to whitelist (one email per line). Default: {_default_csv_path()}",
        )
        parser.add_argument(
            "--schema-name",
            type=str,
            help="Only this tenant schema; default is all organizations.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Print counts and sample emails without updating.",
        )
        parser.add_argument(
            "--include-superusers",
            action="store_true",
            help="Also deactivate superusers (default: skip users with is_superuser=True).",
        )

    def handle(self, *args, **options):
        csv_path: Path = options["csv"]
        schema_filter = options.get("schema_name")
        dry_run = options["dry_run"]
        include_superusers = options["include_superusers"]

        whitelist = _load_whitelist(csv_path.resolve())
        self.stdout.write(f"Loaded {len(whitelist)} email(s) from {csv_path}")

        qs = Organization.objects.all().order_by("schema_name")
        if schema_filter:
            qs = qs.filter(schema_name=schema_filter)
            if not qs.exists():
                raise CommandError(f"No organization with schema_name={schema_filter!r}")

        total_updated = 0
        for org in qs:
            with schema_context(org.schema_name):
                base = (
                    User.objects.filter(is_active=True)
                    .exclude(roles=[User.UserRole.STUDENT])
                )
                if not include_superusers:
                    base = base.exclude(is_superuser=True)
                target = base.annotate(email_lower=Lower("email")).exclude(
                    email_lower__in=whitelist
                )
                count = target.count()
                sample = list(
                    target.order_by("email").values_list("email", flat=True)[:10]
                )
                if dry_run:
                    self.stdout.write(
                        f"[dry-run] {org.schema_name}: would deactivate {count} user(s)"
                    )
                    if sample:
                        self.stdout.write(f"  sample: {', '.join(sample)}")
                else:
                    ids = list(target.values_list("pk", flat=True))
                    n = User.objects.filter(pk__in=ids).update(is_active=False)
                    total_updated += n
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"{org.schema_name}: deactivated {n} user(s)"
                        )
                    )
                    if sample:
                        self.stdout.write(f"  sample: {', '.join(sample)}")

        if not dry_run:
            self.stdout.write(
                self.style.SUCCESS(f"Done. Total deactivated: {total_updated}")
            )
