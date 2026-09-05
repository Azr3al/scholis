"""
Import SDEC staff from Microsoft user-list CSV into a tenant schema.

Resolves microsoft_id from a separate object-id CSV (userPrincipalName -> id).
Skips rows when email already exists in the tenant (no updates).

Usage:
  ./env/bin/python manage.py import_sdec_staff \\
    --user-list-csv=/path/sdec-staff-user-list.csv \\
    --object-id-csv=/path/sdec-staff-object-id-list.csv \\
    --dry-run

  ./env/bin/python manage.py import_sdec_staff \\
    --schema-name=xsdecschedjuicecom \\
    --user-list-csv=/path/sdec-staff-user-list.csv \\
    --object-id-csv=/path/sdec-staff-object-id-list.csv
"""

from __future__ import annotations

import csv
from datetime import date
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.management import BaseCommand
from django.core.management.base import CommandError
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_organization.acca_spreadsheet_import import IMPORT_PASSWORD, normalize_email
from app_organization.models import Organization

UserModel = get_user_model()

DEFAULT_SCHEMA_NAME = "xsdecschedjuicecom"
IMPORT_DATE_OF_BIRTH = date(1900, 1, 1)
PLACEHOLDER_PHONE = "-"

COL_UPN = "User principal name"
COL_DISPLAY_NAME = "Display name"
COL_OBJECT_ID = "Object id"


def _is_blank(value: str | None) -> bool:
    return value is None or str(value).strip() == ""


def _load_object_id_map(object_id_csv: Path) -> dict[str, str]:
    """Map lowercased userPrincipalName -> Microsoft object id."""
    mapping: dict[str, str] = {}
    with object_id_csv.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            upn = (row.get("userPrincipalName") or "").strip()
            obj_id = (row.get("id") or "").strip()
            if _is_blank(upn) or _is_blank(obj_id):
                continue
            mapping[normalize_email(upn)] = obj_id
    return mapping


def _load_user_list_rows(user_list_csv: Path) -> list[dict[str, str]]:
    with user_list_csv.open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


class Command(BaseCommand):
    help = (
        "Import SDEC staff CSV into a tenant (omit --dry-run to write). "
        "Resolves microsoft_id from object-id CSV by userPrincipalName."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--schema-name",
            type=str,
            default=DEFAULT_SCHEMA_NAME,
            help=f"Tenant schema_name (default {DEFAULT_SCHEMA_NAME!r})",
        )
        parser.add_argument(
            "--user-list-csv",
            type=str,
            required=True,
            help="Path to sdec-staff-user-list.csv (UTF-8)",
        )
        parser.add_argument(
            "--object-id-csv",
            type=str,
            required=True,
            help="Path to sdec-staff-object-id-list.csv (UTF-8)",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Parse and report only; do not write to the database",
        )

    def handle(self, *args, **options):
        schema_name: str = options["schema_name"]
        user_list_path = Path(options["user_list_csv"]).expanduser().resolve()
        object_id_path = Path(options["object_id_csv"]).expanduser().resolve()
        dry_run: bool = options["dry_run"]
        commit: bool = not dry_run

        if not user_list_path.is_file():
            raise CommandError(f"User list CSV not found: {user_list_path}")
        if not object_id_path.is_file():
            raise CommandError(f"Object id CSV not found: {object_id_path}")

        with schema_context(get_public_schema_name()):
            if not Organization.objects.filter(schema_name=schema_name).exists():
                raise CommandError(f"No organization for schema_name={schema_name!r}")

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    "DRY RUN — no database writes "
                    "(counts below are planned creates; existing-email checks still query DB)."
                )
            )

        object_id_map = _load_object_id_map(object_id_path)
        raw_rows = _load_user_list_rows(user_list_path)

        stats = {
            "rows_read": 0,
            "users_created": 0,
            "rows_skipped": 0,
            "skipped_existing": 0,
            "skipped_no_object_id": 0,
            "skipped_duplicate_in_file": 0,
            "skipped_missing_upn": 0,
            "skipped_missing_display_name": 0,
            "object_id_mismatches": 0,
        }

        seen_emails: set[str] = set()
        pending_creates: list[dict[str, str]] = []

        for raw in raw_rows:
            stats["rows_read"] += 1
            row_num = stats["rows_read"]

            upn_raw = (raw.get(COL_UPN) or "").strip()
            if _is_blank(upn_raw):
                self.stdout.write(
                    self.style.NOTICE(f"row {row_num}: SKIP — missing {COL_UPN!r}")
                )
                stats["rows_skipped"] += 1
                stats["skipped_missing_upn"] += 1
                continue

            display_name = (raw.get(COL_DISPLAY_NAME) or "").strip()
            if _is_blank(display_name):
                self.stdout.write(
                    self.style.NOTICE(f"row {row_num}: SKIP — missing {COL_DISPLAY_NAME!r}")
                )
                stats["rows_skipped"] += 1
                stats["skipped_missing_display_name"] += 1
                continue

            email_norm = normalize_email(upn_raw)
            if email_norm in seen_emails:
                self.stdout.write(
                    self.style.NOTICE(
                        f"row {row_num}: SKIP — duplicate email in file (first wins): {email_norm}"
                    )
                )
                stats["rows_skipped"] += 1
                stats["skipped_duplicate_in_file"] += 1
                continue
            seen_emails.add(email_norm)

            microsoft_id = object_id_map.get(email_norm)
            if microsoft_id is None:
                self.stdout.write(
                    self.style.NOTICE(
                        f"row {row_num}: SKIP — no object id for UPN {upn_raw!r}"
                    )
                )
                stats["rows_skipped"] += 1
                stats["skipped_no_object_id"] += 1
                continue

            csv_object_id = (raw.get(COL_OBJECT_ID) or "").strip()
            if csv_object_id and csv_object_id.lower() != microsoft_id.lower():
                self.stdout.write(
                    self.style.WARNING(
                        f"row {row_num}: object id mismatch for {email_norm} — "
                        f"user-list={csv_object_id!r}, object-id-list={microsoft_id!r} "
                        f"(using object-id-list)"
                    )
                )
                stats["object_id_mismatches"] += 1

            pending_creates.append(
                {
                    "email": email_norm,
                    "name": display_name,
                    "microsoft_id": microsoft_id,
                }
            )

        with schema_context(schema_name):
            for item in pending_creates:
                if UserModel.objects.filter(email__iexact=item["email"]).exists():
                    self.stdout.write(
                        self.style.NOTICE(
                            f"SKIP — user already exists: {item['email']}"
                        )
                    )
                    stats["rows_skipped"] += 1
                    stats["skipped_existing"] += 1
                    continue

                if commit:
                    UserModel.objects.create_user(
                        email=item["email"],
                        password=IMPORT_PASSWORD,
                        name=item["name"],
                        phone_number=PLACEHOLDER_PHONE,
                        communication_email=item["email"],
                        roles=[UserModel.UserRole.TEACHER],
                        date_of_birth=IMPORT_DATE_OF_BIRTH,
                        microsoft_id=item["microsoft_id"],
                        is_active=True,
                        is_staff=True,
                        is_password_change_required=True,
                    )
                stats["users_created"] += 1

        self.stdout.write(self.style.SUCCESS(str(stats)))
