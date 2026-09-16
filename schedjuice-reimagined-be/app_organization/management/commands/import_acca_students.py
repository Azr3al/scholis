"""
Import ACCA-style student spreadsheet rows into a tenant schema.

Creates users (fixed password, no invite email via serializer), ACCA courses by subject
token, student enrollments, and duplicated UserPayment rows per course when payment
columns are present.

Date of birth column must be DD/MM/YYYY (day first).

Usage:
  ./env/bin/python manage.py import_acca_students --schema-name=<tenant> --csv=/path/file.csv --dry-run
  ./env/bin/python manage.py import_acca_students --schema-name=<tenant> --csv=/path/file.csv

With `--dry-run`: no writes (still reads DB for duplicate-email checks).
Without `--dry-run`: persists rows (creates category/definitions if needed).
"""

from __future__ import annotations

import csv
from datetime import datetime as dt_datetime
from decimal import Decimal
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.management import BaseCommand
from django.core.management.base import CommandError
from django.core.validators import validate_email
from django.utils import timezone as dj_timezone
from djmoney.money import Money
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_course.models import Category, Course, Subject, UserCourse
from app_custom_fields.constants import ENTITY_TYPE_USER
from app_custom_fields.models import FieldDefinition
from app_custom_fields.validation import validate_user_custom_data_for_write
from app_finance.models import PaymentMethod, UserPayment
from app_organization.acca_spreadsheet_import import (
    COURSE_END,
    COURSE_START,
    DEFAULT_CATEGORY_NAME,
    IMPORT_CUSTOM_FIELD_KEYS,
    IMPORT_PASSWORD,
    infer_payment_bank,
    map_csv_row,
    normalize_email,
    normalize_gender,
    normalize_phone,
    parse_money_usd,
    parse_dmy_date,
    split_enroll_subjects,
)
from app_organization.models import Organization

UserModel = get_user_model()

# Historical import anchor for spreadsheet-loaded payments (2 July 2026).
USER_PAYMENT_IMPORT_ISSUED_AT = dj_timezone.make_aware(dt_datetime(2026, 7, 2, 12, 0, 0))


def _transaction_id_for_import(note: str | None, user_id: int, course_id: int) -> str:
    raw = (note or "").strip()
    if raw:
        return raw[:100]
    return f"ACCA-{user_id}-{course_id}"


def _date_on_screenshot_for_import(
    transfer_date_raw: str | None,
    issued_at: dt_datetime,
) -> str:
    td = parse_dmy_date((transfer_date_raw or "").strip() or None)
    if td is not None:
        return td.strftime("%d/%m/%Y")
    return issued_at.date().strftime("%d/%m/%Y")


def _is_blank(value: str | None) -> bool:
    return value is None or str(value).strip() == ""


def _payment_intent(row: dict[str, str]) -> bool:
    return not (
        _is_blank(row.get("transfer_bank"))
        and _is_blank(row.get("transaction_note"))
        and _is_blank(row.get("transfer_amount"))
    )


def _load_csv_rows_and_distinct_counts(
    csv_path: Path,
) -> tuple[list[dict[str, str | None]], set[str], set[str]]:
    """
    Read CSV into rows plus distinct course tokens (comma-split, trimmed) and
    distinct payment method names (same normalization as import / PaymentMethod.name).
    """
    distinct_course_tokens: set[str] = set()
    distinct_payment_method_names: set[str] = set()
    with csv_path.open(encoding="utf-8-sig", newline="") as f:
        raw_rows = list(csv.DictReader(f))
    for raw in raw_rows:
        row = map_csv_row(raw)
        for tok in split_enroll_subjects(row.get("enroll_subject")):
            distinct_course_tokens.add(tok)
        if _payment_intent(row):
            bank_text = (row.get("transfer_bank") or "").strip()
            distinct_payment_method_names.add(bank_text[:255] if bank_text else "Unknown")
    return raw_rows, distinct_course_tokens, distinct_payment_method_names


def _ensure_user_custom_field_definitions() -> None:
    for field_key, label, sort_order in IMPORT_CUSTOM_FIELD_KEYS:
        FieldDefinition.objects.get_or_create(
            entity_type=ENTITY_TYPE_USER,
            field_key=field_key,
            defaults={
                "field_label": label,
                "field_type": FieldDefinition.FieldType.TEXT,
                "is_required": False,
                "sort_order": sort_order,
                "description": "",
                "is_active": True,
            },
        )


def _build_custom_data(row: dict[str, str]) -> dict:
    data = {}
    if not _is_blank(row.get("occupation")):
        data["occupation"] = row["occupation"].strip()
    if not _is_blank(row.get("company_name")):
        data["company_name"] = row["company_name"].strip()
    if not _is_blank(row.get("viber_phone")):
        data["viber_phone"] = row["viber_phone"].strip()
    if not _is_blank(row.get("telegram_number")):
        data["telegram_number"] = row["telegram_number"].strip()
    return validate_user_custom_data_for_write(
        incoming=data,
        existing={},
        partial=False,
    )


class Command(BaseCommand):
    help = "Import ACCA-style student CSV into a tenant (omit --dry-run to write)."

    def add_arguments(self, parser):
        parser.add_argument("--schema-name", type=str, required=True, help="Tenant schema_name")
        parser.add_argument("--csv", type=str, required=True, help="Path to UTF-8 CSV with headers")
        parser.add_argument(
            "--category-name",
            type=str,
            default=DEFAULT_CATEGORY_NAME,
            help=f"Course category name (default {DEFAULT_CATEGORY_NAME!r})",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Parse and report only; do not write to the database",
        )

    def handle(self, *args, **options):
        schema_name: str = options["schema_name"]
        csv_path = Path(options["csv"]).expanduser().resolve()
        category_name: str = options["category_name"]
        dry_run: bool = options["dry_run"]
        commit: bool = not dry_run

        if not csv_path.is_file():
            raise CommandError(f"CSV not found: {csv_path}")

        with schema_context(get_public_schema_name()):
            if not Organization.objects.filter(schema_name=schema_name).exists():
                raise CommandError(f"No organization for schema_name={schema_name!r}")

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    "DRY RUN — no database writes "
                    "(counts below are planned creates/reuses, same keys as a real run)."
                )
            )

        raw_rows, distinct_course_tokens, distinct_payment_method_names = (
            _load_csv_rows_and_distinct_counts(csv_path)
        )
        self.stdout.write(
            self.style.NOTICE(
                f"After CSV parse: {len(distinct_course_tokens)} distinct course token(s), "
                f"{len(distinct_payment_method_names)} distinct payment method name(s)."
            )
        )

        stats = {
            "rows_read": 0,
            "users_created": 0,
            "rows_skipped": 0,
            "courses_created": 0,
            "courses_reused": 0,
            "user_courses_created": 0,
            "payments_created": 0,
            "payment_methods_created": 0,
        }

        with schema_context(schema_name):
            if commit:
                category, _ = Category.objects.get_or_create(
                    name=category_name,
                    defaults={
                        "description": "",
                        "sort_order": 0,
                    },
                )
                _ensure_user_custom_field_definitions()
            else:
                category = Category.objects.filter(name=category_name).first()
                if category is None:
                    raise CommandError(
                        f"Dry-run requires category {category_name!r} to exist already "
                        f"(create manually or run once without --dry-run)."
                    )

            if commit:
                dry_run_course_titles: set[str] | None = None
                dry_run_pm_names: set[str] | None = None
            else:
                # Simulate DB state during dry-run so create/reuse counts match a real run.
                dry_run_course_titles = set(Course.objects.values_list("title", flat=True))
                dry_run_pm_names = set(PaymentMethod.objects.values_list("name", flat=True))

            seen_emails: set[str] = set()

            for raw in raw_rows:
                stats["rows_read"] += 1
                row = map_csv_row(raw)
                reason = self._process_row(
                    row=row,
                    category=category,
                    seen_emails=seen_emails,
                    commit=commit,
                    stats=stats,
                    dry_run_course_titles=dry_run_course_titles,
                    dry_run_pm_names=dry_run_pm_names,
                )
                if reason:
                    self.stdout.write(
                        self.style.NOTICE(f"row {stats['rows_read']}: SKIP — {reason}")
                    )
                    stats["rows_skipped"] += 1

        self.stdout.write(self.style.SUCCESS(str(stats)))

    def _process_row(
        self,
        *,
        row: dict[str, str],
        category: Category,
        seen_emails: set[str],
        commit: bool,
        stats: dict,
        dry_run_course_titles: set[str] | None = None,
        dry_run_pm_names: set[str] | None = None,
    ) -> str | None:
        """Return skip reason or None if processed."""
        email_raw = row.get("email", "").strip()
        if _is_blank(email_raw):
            return "missing email"
        try:
            validate_email(email_raw)
        except ValidationError:
            return "invalid email"

        email_norm = normalize_email(email_raw)
        if email_norm in seen_emails:
            return "duplicate email in file (first wins)"
        seen_emails.add(email_norm)

        if UserModel.objects.filter(email__iexact=email_norm).exists():
            return "user already exists"

        name = row.get("name", "").strip()
        if _is_blank(name):
            return "missing name"

        dob = parse_dmy_date(row.get("date_of_birth"))
        if dob is None:
            return "missing or invalid date_of_birth"

        subjects = split_enroll_subjects(row.get("enroll_subject"))
        pay_intent = _payment_intent(row)

        if pay_intent and not subjects:
            return "payment columns present but enroll subject empty"

        amount_raw = row.get("transfer_amount", "").strip()
        amount: Decimal | None = None
        if pay_intent:
            if _is_blank(amount_raw):
                return "payment intent but transfer amount empty"
            amount = parse_money_usd(amount_raw)
            if amount is None:
                return "unparseable transfer amount"

        if commit:
            custom_data = _build_custom_data(row)
            user = UserModel.objects.create_user(
                email=email_norm,
                password=IMPORT_PASSWORD,
                name=name,
                phone_number=normalize_phone(row.get("mobile")) or "-",
                communication_email=email_norm,
                roles=[UserModel.UserRole.STUDENT],
                date_of_birth=dob,
                gender=normalize_gender(row.get("gender")),
                nrc_passport=(row.get("nrc_passport") or "").strip() or None,
                delivery_address=(row.get("delivery_address") or "").strip() or None,
                custom_data=custom_data,
                is_active=True,
                is_staff=False,
            )
            stats["users_created"] += 1
        else:
            user = None
            # Dry-run: same counters mean "would create" (matches courses_* behavior).
            stats["users_created"] += 1

        for token in subjects:
            if commit:
                course, created_course = Course.objects.get_or_create(
                    title=token,
                    defaults={
                        "category": category,
                        "start_date": COURSE_START,
                        "end_date": COURSE_END,
                        "code": None,
                    },
                )
                subject_obj, _ = Subject.objects.get_or_create(name=token)
                if course.subject_id != subject_obj.id:
                    course.subject = subject_obj
                    course.save(update_fields=["subject"])
                if created_course:
                    stats["courses_created"] += 1
                else:
                    stats["courses_reused"] += 1
                uc, uc_created = UserCourse.objects.get_or_create(
                    user=user,
                    course=course,
                    defaults={
                        "assigned_as": UserCourse.AssignedAs.STUDENT,
                    },
                )
                if uc_created:
                    stats["user_courses_created"] += 1
            else:
                assert dry_run_course_titles is not None
                if token in dry_run_course_titles:
                    stats["courses_reused"] += 1
                else:
                    stats["courses_created"] += 1
                    dry_run_course_titles.add(token)
                stats["user_courses_created"] += 1

            if pay_intent:
                bank_text = (row.get("transfer_bank") or "").strip()
                pm_name = bank_text[:255] if bank_text else "Unknown"
                if commit and user is not None:
                    pm_defaults = {
                        "description": None,
                        "payment_bank": infer_payment_bank(bank_text),
                    }
                    pm, pm_created = PaymentMethod.objects.get_or_create(
                        name=pm_name,
                        defaults=pm_defaults,
                    )
                    if pm_created:
                        stats["payment_methods_created"] += 1

                    note = (row.get("transaction_note") or "").strip()
                    issued_at = USER_PAYMENT_IMPORT_ISSUED_AT
                    UserPayment.objects.create(
                        user=user,
                        course=course,
                        payment_method=pm,
                        description=note[:2000] if note else None,
                        transaction_id=_transaction_id_for_import(note, user.id, course.id),
                        date_on_screenshot=_date_on_screenshot_for_import(
                            row.get("transfer_date"),
                            issued_at,
                        ),
                        parsed_amount=Money(amount, "USD"),
                        status=UserPayment.Status.VERIFIED,
                        issued_at=issued_at,
                    )
                    stats["payments_created"] += 1
                elif not commit:
                    assert dry_run_pm_names is not None
                    stats["payments_created"] += 1
                    if pm_name not in dry_run_pm_names:
                        stats["payment_methods_created"] += 1
                        dry_run_pm_names.add(pm_name)

        return None
