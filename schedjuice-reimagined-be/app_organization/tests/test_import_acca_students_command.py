import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import Course, UserCourse
from app_finance.models import UserPayment


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(
    os.environ.get("SCHEDJUICE_RUN_IMPORT_ACCA_INTEGRATION") == "1"
    and _database_reachable(),
    "Heavy test (migrate_schemas + load-tenants + load-data); "
    "set SCHEDJUICE_RUN_IMPORT_ACCA_INTEGRATION=1 and DATABASE_URL to run.",
)
class ImportAccaStudentsCommandTest(TestCase):
    schema_name = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        from django.core.management import call_command as cc

        cc("migrate_schemas", shared=True, verbosity=0)
        with patch("builtins.input", return_value="yes"):
            cc("load-tenants", verbosity=0)
        cc("migrate_schemas", verbosity=0)
        cc("load-data", schema=cls.schema_name, verbosity=0)

    def test_import_one_row_writes_when_not_dry_run(self):
        uid = uuid4().hex[:12]
        email = f"acca_import_{uid}@test.example"
        csv_body = (
            "Email Address,Student Name,NRC/Passport,Date of Birth,Occupation,Company Name,"
            "Gender,Mobile Phone Number,Viber Phone Number,Telegram Number,Delivery Address,"
            "Enroll Subject,Transfer Bank,Transaction Note,Transfer Amount\r\n"
            f"{email},Test Importer,12/DGT(N),12/6/2000,Auditor,Acme Co,"
            "Female,9799001269,09001,09002,No.171 Tapyay,"
            'BT,"KBZ Bank: 2009600",SBL note,210000\r\n'
        )
        with tempfile.NamedTemporaryFile(
            mode="w",
            suffix=".csv",
            delete=False,
            encoding="utf-8",
            newline="",
        ) as tmp:
            tmp.write(csv_body)
            tmp_path = Path(tmp.name)

        try:
            call_command(
                "import_acca_students",
                schema_name=self.schema_name,
                csv=str(tmp_path),
                verbosity=0,
            )
        finally:
            tmp_path.unlink(missing_ok=True)

        with schema_context(self.schema_name):
            user = User.objects.get(email=email.lower())
            self.assertEqual(user.nrc_passport, "12/DGT(N)")
            self.assertEqual(user.delivery_address, "No.171 Tapyay")
            course = Course.objects.get(title="BT")
            self.assertTrue(UserCourse.objects.filter(user=user, course=course).exists())
            payment = UserPayment.objects.get(user=user, course=course)
            self.assertEqual(payment.status, UserPayment.Status.VERIFIED)
            self.assertEqual(payment.transaction_id, "SBL note")
            self.assertEqual(payment.date_on_screenshot, "02/07/2026")
