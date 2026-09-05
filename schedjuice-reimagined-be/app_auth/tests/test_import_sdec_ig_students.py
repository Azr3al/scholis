import csv
import tempfile
import unittest
import uuid
from datetime import date
from pathlib import Path

from django.core.management import call_command
from django.db import connection
from django.test import TransactionTestCase
from openpyxl import Workbook
from tenant_schemas.utils import schema_context

from app_auth.management.commands.import_sdec_ig_students import (
    _extract_rows_from_workbook,
    _load_object_id_map,
)
from app_auth.models import User
from app_auth.tests.import_test_helpers import TEST_SCHEMA, ensure_import_test_tenant
from app_course.models import UserCourse


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


def _write_object_id_csv(path: Path, rows: list[tuple[str, str, str]]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(
            f, fieldnames=["id", "displayName", "userPrincipalName"]
        )
        writer.writeheader()
        for obj_id, display_name, upn in rows:
            writer.writerow(
                {
                    "id": obj_id,
                    "displayName": display_name,
                    "userPrincipalName": upn,
                }
            )


def _write_ig_workbook(path: Path, rows: list[tuple[int, str, str]]) -> None:
    wb = Workbook()
    ws = wb.active
    ws.title = "Sheet1"
    ws.append(["SDEC International School ", None, None])
    ws.append(["2026 - 2027 (Academic Year)", None, None])
    ws.append(["Student's List", None, None])
    ws.append(["IGCSE B-19", None, None])
    ws.append([None, None, None])
    ws.append(["No", "Student Name", "Username"])
    for row in rows:
        ws.append(list(row))
    wb.save(path)


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class ImportSdecIgStudentsParsingTest(unittest.TestCase):
    def test_extract_rows_from_workbook_finds_header_and_rows(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "batch.xlsx"
            _write_ig_workbook(
                path,
                [
                    (1, "April Linn", "aprillinn@sdecedu.com"),
                    (2, "Hein Wai Yan Tun", "HeinWaiYanTun@sdecedu.com"),
                ],
            )
            rows = _extract_rows_from_workbook(path)
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0].student_name, "April Linn")
        self.assertEqual(rows[0].username, "aprillinn@sdecedu.com")

    def test_load_object_id_map_normalizes_upn(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "object-id.csv"
            _write_object_id_csv(
                path,
                [("ms-001", "April Linn", "AprilLinn@sdecedu.com")],
            )
            mapping = _load_object_id_map(path)
        self.assertEqual(mapping["aprillinn@sdecedu.com"], "ms-001")


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
class ImportSdecIgStudentsCommandTest(TransactionTestCase):
    schema_name = TEST_SCHEMA

    @classmethod
    def setUpClass(cls):
        ensure_import_test_tenant()
        super().setUpClass()

    def setUp(self):
        ensure_import_test_tenant()
        connection.set_schema_to_public()

    def tearDown(self):
        connection.set_schema_to_public()

    def _run_import(
        self,
        *,
        workbook_rows: list[tuple[int, str, str]],
        object_id_rows: list[tuple[str, str, str]],
        dry_run: bool = False,
        extra_existing_user: User | None = None,
    ) -> Path:
        uid = uuid.uuid4().hex[:8]
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            xlsx_path = tmp_path / f"batch-{uid}.xlsx"
            object_id_path = tmp_path / "object-id.csv"
            skip_report_path = tmp_path / "skips.csv"

            _write_ig_workbook(xlsx_path, workbook_rows)
            _write_object_id_csv(object_id_path, object_id_rows)

            if extra_existing_user is not None:
                with schema_context(self.schema_name):
                    extra_existing_user.save()

            args = [
                "import_sdec_ig_students",
                f"--schema-name={self.schema_name}",
                f"--xlsx={xlsx_path}",
                f"--object-id-csv={object_id_path}",
                f"--skip-report-csv={skip_report_path}",
            ]
            if dry_run:
                args.append("--dry-run")
            call_command(*args, verbosity=0)

            if skip_report_path.exists():
                content = skip_report_path.read_text(encoding="utf-8-sig")
            else:
                content = ""
            self._last_skip_report = content
            return tmp_path

    def test_dry_run_does_not_create_users(self):
        uid = uuid.uuid4().hex[:8]
        email = f"ig-new-{uid}@sdecedu.com"
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            xlsx_path = tmp_path / "batch.xlsx"
            object_id_path = tmp_path / "object-id.csv"
            skip_report_path = tmp_path / "skips.csv"
            _write_ig_workbook(xlsx_path, [(1, "New Student", email)])
            _write_object_id_csv(
                object_id_path, [(f"ms-{uid}", "New Student", email)]
            )

            with schema_context(self.schema_name):
                before = User.objects.filter(email=email.lower()).count()

            call_command(
                "import_sdec_ig_students",
                f"--schema-name={self.schema_name}",
                f"--xlsx={xlsx_path}",
                f"--object-id-csv={object_id_path}",
                f"--skip-report-csv={skip_report_path}",
                "--dry-run",
                verbosity=0,
            )

            with schema_context(self.schema_name):
                after = User.objects.filter(email=email.lower()).count()
        self.assertEqual(before, 0)
        self.assertEqual(after, 0)

    def test_creates_student_with_microsoft_id_and_no_enrollment(self):
        uid = uuid.uuid4().hex[:8]
        email = f"ig-create-{uid}@sdecedu.com"
        ms_id = f"ms-create-{uid}"

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            xlsx_path = tmp_path / "batch.xlsx"
            object_id_path = tmp_path / "object-id.csv"
            skip_report_path = tmp_path / "skips.csv"
            _write_ig_workbook(xlsx_path, [(1, "Create Me", email)])
            _write_object_id_csv(object_id_path, [(ms_id, "Create Me", email)])

            call_command(
                "import_sdec_ig_students",
                f"--schema-name={self.schema_name}",
                f"--xlsx={xlsx_path}",
                f"--object-id-csv={object_id_path}",
                f"--skip-report-csv={skip_report_path}",
                verbosity=0,
            )

            with schema_context(self.schema_name):
                user = User.objects.get(email=email.lower())
                self.assertEqual(user.name, "Create Me")
                self.assertEqual(user.microsoft_id, ms_id)
                self.assertEqual(user.roles, [User.UserRole.STUDENT])
                self.assertTrue(user.is_password_change_required)
                self.assertFalse(user.is_staff)
                self.assertFalse(
                    UserCourse.objects.filter(user=user).exists()
                )

    def test_backfills_microsoft_id_for_existing_user(self):
        uid = uuid.uuid4().hex[:8]
        email = f"ig-backfill-{uid}@sdecedu.com"
        ms_id = f"ms-backfill-{uid}"

        with schema_context(self.schema_name):
            existing = User.objects.create_user(
                email=email,
                password="x",
                name="Existing Student",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            self.assertIsNone(existing.microsoft_id)

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            xlsx_path = tmp_path / "batch.xlsx"
            object_id_path = tmp_path / "object-id.csv"
            skip_report_path = tmp_path / "skips.csv"
            _write_ig_workbook(xlsx_path, [(1, "Existing Student", email)])
            _write_object_id_csv(
                object_id_path, [(ms_id, "Existing Student", email)]
            )

            call_command(
                "import_sdec_ig_students",
                f"--schema-name={self.schema_name}",
                f"--xlsx={xlsx_path}",
                f"--object-id-csv={object_id_path}",
                f"--skip-report-csv={skip_report_path}",
                verbosity=0,
            )

            with schema_context(self.schema_name):
                existing.refresh_from_db()
                self.assertEqual(existing.microsoft_id, ms_id)
                self.assertEqual(
                    User.objects.filter(email=email.lower()).count(), 1
                )

    def test_skips_duplicate_username_in_files(self):
        uid = uuid.uuid4().hex[:8]
        email = f"ig-dup-{uid}@sdecedu.com"
        ms_id = f"ms-dup-{uid}"

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            xlsx_a = tmp_path / "batch-a.xlsx"
            xlsx_b = tmp_path / "batch-b.xlsx"
            object_id_path = tmp_path / "object-id.csv"
            skip_report_path = tmp_path / "skips.csv"
            _write_ig_workbook(xlsx_a, [(1, "First Name", email)])
            _write_ig_workbook(xlsx_b, [(1, "Second Name", email)])
            _write_object_id_csv(object_id_path, [(ms_id, "First Name", email)])

            call_command(
                "import_sdec_ig_students",
                f"--schema-name={self.schema_name}",
                f"--xlsx={xlsx_a}",
                f"--xlsx={xlsx_b}",
                f"--object-id-csv={object_id_path}",
                f"--skip-report-csv={skip_report_path}",
                verbosity=0,
            )

            report = skip_report_path.read_text(encoding="utf-8-sig")
            with schema_context(self.schema_name):
                user = User.objects.get(email=email.lower())

        self.assertIn("duplicate username in import files", report)
        self.assertEqual(user.name, "First Name")

    def test_skips_missing_object_id(self):
        uid = uuid.uuid4().hex[:8]
        email = f"ig-missing-ms-{uid}@sdecedu.com"

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            xlsx_path = tmp_path / "batch.xlsx"
            object_id_path = tmp_path / "object-id.csv"
            skip_report_path = tmp_path / "skips.csv"
            _write_ig_workbook(xlsx_path, [(1, "No MS Match", email)])
            _write_object_id_csv(object_id_path, [])

            call_command(
                "import_sdec_ig_students",
                f"--schema-name={self.schema_name}",
                f"--xlsx={xlsx_path}",
                f"--object-id-csv={object_id_path}",
                f"--skip-report-csv={skip_report_path}",
                verbosity=0,
            )

            report = skip_report_path.read_text(encoding="utf-8-sig")
            with schema_context(self.schema_name):
                exists = User.objects.filter(email=email.lower()).exists()

        self.assertIn("no object id for username", report)
        self.assertFalse(exists)

    def test_skips_microsoft_id_conflict(self):
        uid = uuid.uuid4().hex[:8]
        email_a = f"ig-owner-{uid}@sdecedu.com"
        email_b = f"ig-conflict-{uid}@sdecedu.com"
        ms_id = f"ms-conflict-{uid}"

        with schema_context(self.schema_name):
            User.objects.create_user(
                email=email_a,
                password="x",
                name="Owner",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
                microsoft_id=ms_id,
            )

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            xlsx_path = tmp_path / "batch.xlsx"
            object_id_path = tmp_path / "object-id.csv"
            skip_report_path = tmp_path / "skips.csv"
            _write_ig_workbook(xlsx_path, [(1, "Conflict Student", email_b)])
            _write_object_id_csv(
                object_id_path, [(ms_id, "Conflict Student", email_b)]
            )

            call_command(
                "import_sdec_ig_students",
                f"--schema-name={self.schema_name}",
                f"--xlsx={xlsx_path}",
                f"--object-id-csv={object_id_path}",
                f"--skip-report-csv={skip_report_path}",
                verbosity=0,
            )

            report = skip_report_path.read_text(encoding="utf-8-sig")
            with schema_context(self.schema_name):
                exists = User.objects.filter(email=email_b.lower()).exists()

        self.assertIn("microsoft id already linked", report)
        self.assertFalse(exists)

    def test_idempotent_second_run_reuses_users(self):
        uid = uuid.uuid4().hex[:8]
        email = f"ig-idempotent-{uid}@sdecedu.com"
        ms_id = f"ms-idempotent-{uid}"

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            xlsx_path = tmp_path / "batch.xlsx"
            object_id_path = tmp_path / "object-id.csv"
            skip_report_path = tmp_path / "skips.csv"
            _write_ig_workbook(xlsx_path, [(1, "Repeat Me", email)])
            _write_object_id_csv(object_id_path, [(ms_id, "Repeat Me", email)])

            for _ in range(2):
                call_command(
                    "import_sdec_ig_students",
                    f"--schema-name={self.schema_name}",
                    f"--xlsx={xlsx_path}",
                    f"--object-id-csv={object_id_path}",
                    f"--skip-report-csv={skip_report_path}",
                    verbosity=0,
                )

            with schema_context(self.schema_name):
                count = User.objects.filter(email=email.lower()).count()
                user = User.objects.get(email=email.lower())

        self.assertEqual(count, 1)
        self.assertEqual(user.microsoft_id, ms_id)
