import unittest
from datetime import date
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_course.models import Category, Course, Program, ProgramLevel, UserCourse
from app_custom_fields.models import FieldDefinition
from app_organization.models import Organization
from app_rbac.seeding import seed_rbac

def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False

@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class StudentDataSheetTests(TestCase):
    schema_name = "xschedjuice"
    api_prefix = "/api/v1"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            seed_rbac()
            self.manager = User.objects.create_user(
                email=f"sds-m-{suffix}@example.com",
                password="x",
                name="Mgr",
                phone_number="1",
                date_of_birth=date(1990, 1, 1),
                communication_email=f"sds-m-{suffix}@example.com",
                code=f"sds-m-{suffix}",
                roles=[User.UserRole.MANAGER],
            )
            self.student = User.objects.create_user(
                email=f"sds-s-{suffix}@example.com",
                password="x",
                name="Su Su",
                phone_number="0911",
                date_of_birth=date(2000, 1, 1),
                communication_email=f"sds-s-{suffix}@example.com",
                code=f"sds-s-{suffix}",
                roles=[User.UserRole.STUDENT],
                city="Yangon",
            )
            self.cat = Category.objects.create(name=f"FCE-{suffix}", sort_order=1)
            self.program = Program.objects.create(name=f"P-sds-{suffix}")
            self.active = Course.objects.create(
                title=f"Active Course-{suffix}",
                start_date=date(2026, 1, 1),
                end_date=date(2030, 1, 1),
                status=Course.CourseStatus.ACTIVE,
                category=self.cat,
                program=self.program,
            )
            self.ended = Course.objects.create(
                title=f"Ended Course-{suffix}",
                start_date=date(2020, 1, 1),
                end_date=date(2020, 6, 1),
                status=Course.CourseStatus.ENDED,
                category=self.cat,
                program=self.program,
            )
            UserCourse.objects.create(
                user=self.student,
                course=self.active,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            UserCourse.objects.create(
                user=self.student,
                course=self.ended,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )

    def _client(self, user):
        c = APIClient()
        c.force_authenticate(user=user)
        c.credentials(HTTP_TENANT=self.schema_name)
        return c

    def test_count_organization_matches_sheet_row_count(self):
        from app_ai.tools.count_organization import run_count_organization

        resp = self._client(self.manager).get(
            f"{self.api_prefix}/reports/student-data-sheet"
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        sheet_count = len(resp.json()["data"])

        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            admin = User.objects.create_user(
                email=f"sds-admin-{suffix}@example.com",
                password="x",
                name="Admin",
                phone_number="1",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )
            result = run_count_organization({"entity": "students"}, admin)

        self.assertEqual(result["count"], sheet_count)
        self.assertEqual(
            result["filters_applied"]["enrollment_scope"],
            "actively_enrolled",
        )

    def test_student_row_includes_id_card_fields(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        with schema_context(self.schema_name):
            self.student.blood_type = User.BloodType.O_POS
            self.student.id_photo = SimpleUploadedFile(
                "id.jpg", b"fakejpeg", content_type="image/jpeg"
            )
            self.student.save()

        resp = self._client(self.manager).get(
            f"{self.api_prefix}/reports/student-data-sheet"
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        row = next(r for r in resp.json()["data"] if r["code"] == self.student.code)
        self.assertEqual(row["blood_type"], "O+")
        self.assertIsNotNone(row["id_verify_token"])
        self.assertTrue(row["id_verify_code"].startswith("v_"))
        self.assertEqual(len(row["id_verify_code"]), 10)
        self.assertTrue(row["has_id_photo"])
        self.assertNotIn("id_photo_url", row)

    def test_student_row_includes_id_card_class_fields(self):
        from app_course.models import ProgramLevel

        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            level = ProgramLevel.objects.create(
                program=self.program,
                name="Grade 7",
                sort_order=1,
            )
            self.active.level = level
            self.active.save(update_fields=["level"])

        resp = self._client(self.manager).get(
            f"{self.api_prefix}/reports/student-data-sheet"
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        row = next(r for r in resp.json()["data"] if r["code"] == self.student.code)
        self.assertIsNone(row["id_card_class_name"])
        self.assertEqual(row["id_card_class_display"], "Grade 7")

    def test_student_row_includes_id_card_expiry_display(self):
        from tenant_schemas.utils import get_public_schema_name

        with schema_context(get_public_schema_name()):
            Organization.objects.filter(schema_name=self.schema_name).update(
                is_course_id_card_expiry_enabled=True
            )
        with schema_context(self.schema_name):
            self.active.id_card_expiry_date = date(2026, 12, 31)
            self.active.save(update_fields=["id_card_expiry_date"])

        resp = self._client(self.manager).get(
            f"{self.api_prefix}/reports/student-data-sheet"
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        row = next(r for r in resp.json()["data"] if r["code"] == self.student.code)
        self.assertEqual(row["id_card_expiry_display"], "2026-12-31")

    def test_includes_enrollment_when_legacy_status_stale_but_effectively_active(
        self,
    ):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            stale_status_course = Course.objects.create(
                title=f"Stale Legacy Active-{suffix}",
                start_date=date(2026, 1, 1),
                end_date=date(2030, 1, 1),
                status=Course.CourseStatus.ENDED,
                category=self.cat,
                program=self.program,
            )
            stale_student = User.objects.create_user(
                email=f"sds-stale-{suffix}@example.com",
                password="x",
                name="Stale Status Student",
                phone_number="0900",
                date_of_birth=date(2000, 1, 1),
                communication_email=f"sds-stale-{suffix}@example.com",
                code=f"sds-stale-{suffix}",
                roles=[User.UserRole.STUDENT],
            )
            UserCourse.objects.create(
                user=stale_student,
                course=stale_status_course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )

        resp = self._client(self.manager).get(
            f"{self.api_prefix}/reports/student-data-sheet"
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        row = next(
            r for r in resp.json()["data"] if r["code"] == stale_student.code
        )
        titles = [c["title"] for c in row["courses"]]
        self.assertIn(stale_status_course.title, titles)
        course_ids = [c["id"] for c in row["courses"]]
        self.assertIn(stale_status_course.id, course_ids)

    def test_excludes_students_without_active_enrollments(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            no_enrollment = User.objects.create_user(
                email=f"sds-none-{suffix}@example.com",
                password="x",
                name="No Courses",
                phone_number="0999",
                date_of_birth=date(2000, 1, 1),
                communication_email=f"sds-none-{suffix}@example.com",
                code=f"sds-none-{suffix}",
                roles=[User.UserRole.STUDENT],
            )

        resp = self._client(self.manager).get(
            f"{self.api_prefix}/reports/student-data-sheet"
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        codes = [r["code"] for r in resp.json()["data"]]
        self.assertIn(self.student.code, codes)
        self.assertNotIn(no_enrollment.code, codes)

    def test_excludes_students_with_only_ended_courses(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            alumni_like = User.objects.create_user(
                email=f"sds-ended-{suffix}@example.com",
                password="x",
                name="Ended Only",
                phone_number="0888",
                date_of_birth=date(2000, 1, 1),
                communication_email=f"sds-ended-{suffix}@example.com",
                code=f"sds-ended-{suffix}",
                roles=[User.UserRole.STUDENT],
            )
            UserCourse.objects.create(
                user=alumni_like,
                course=self.ended,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )

        resp = self._client(self.manager).get(
            f"{self.api_prefix}/reports/student-data-sheet"
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        codes = [r["code"] for r in resp.json()["data"]]
        self.assertIn(self.student.code, codes)
        self.assertNotIn(alumni_like.code, codes)

    def test_includes_custom_data_and_missing_builtins(self):
        uid = uuid4().hex[:6]
        with schema_context(self.schema_name):
            call_command("sync_builtin_fields", verbosity=0)
            FieldDefinition.objects.create(
                source="custom",
                entity_type="app_auth.User",
                field_key=f"occupation_{uid}",
                field_label="Occupation",
                field_type=FieldDefinition.FieldType.TEXT,
                required_at="never",
                roles=["student"],
                filled_by="both",
            )
            self.student.delivery_address = "123 Main St"
            self.student.custom_data = {f"occupation_{uid}": "Engineer"}
            self.student.save(
                update_fields=["delivery_address", "custom_data"]
            )

        resp = self._client(self.manager).get(
            f"{self.api_prefix}/reports/student-data-sheet"
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        row = next(r for r in resp.json()["data"] if r["code"] == self.student.code)
        self.assertEqual(row["delivery_address"], "123 Main St")
        self.assertEqual(row["custom_data"][f"occupation_{uid}"], "Engineer")

    def test_constant_query_count(self):
        from django.test.utils import CaptureQueriesContext

        suffix = uuid4().hex[:6]
        field_key = f"occupation_{suffix}"

        with schema_context(self.schema_name):
            call_command("sync_builtin_fields", verbosity=0)
            FieldDefinition.objects.create(
                source="custom",
                entity_type="app_auth.User",
                field_key=field_key,
                field_label="Occupation",
                field_type=FieldDefinition.FieldType.TEXT,
                required_at="never",
                roles=["student"],
                filled_by="both",
            )
            perf_level = ProgramLevel.objects.create(
                program=self.program,
                name=f"Perf Level-{suffix}",
                sort_order=1,
            )
            self.active.level = perf_level
            self.active.save(update_fields=["level"])
            extra_courses = []
            for i in range(2):
                extra_courses.append(
                    Course.objects.create(
                        title=f"Perf Course {i}-{suffix}",
                        start_date=date(2026, 1, 1),
                        end_date=date(2030, 1, 1),
                        status=Course.CourseStatus.ACTIVE,
                        category=self.cat,
                        program=self.program,
                        level=perf_level,
                    )
                )

        def make_enrolled_students(n: int, offset: int = 0):
            with schema_context(self.schema_name):
                for i in range(n):
                    idx = offset + i
                    student = User.objects.create_user(
                        email=f"sds-perf-{suffix}-{idx}@example.com",
                        password="x",
                        name=f"Perf {idx}",
                        phone_number=f"09{idx:04d}",
                        date_of_birth=date(2000, 1, 1),
                        communication_email=f"sds-perf-{suffix}-{idx}@example.com",
                        code=f"sds-perf-{suffix}-{idx}",
                        roles=[User.UserRole.STUDENT],
                    )
                    UserCourse.objects.create(
                        user=student,
                        course=self.active,
                        assigned_as=UserCourse.AssignedAs.STUDENT,
                    )
                    if idx % 3 == 0:
                        for course in extra_courses:
                            UserCourse.objects.create(
                                user=student,
                                course=course,
                                assigned_as=UserCourse.AssignedAs.STUDENT,
                            )
                    if idx % 2 == 0:
                        student.custom_data = {field_key: f"Job {idx}"}
                        student.save(update_fields=["custom_data"])

        with schema_context(self.schema_name):
            make_enrolled_students(5)
        client = self._client(self.manager)
        # Warm up caches (RBAC, custom-field definition keys) so counts are stable.
        client.get(f"{self.api_prefix}/reports/student-data-sheet")
        with CaptureQueriesContext(connection) as ctx_small:
            resp_small = client.get(
                f"{self.api_prefix}/reports/student-data-sheet"
            )
        self.assertEqual(resp_small.status_code, 200, resp_small.content)
        small_rows = len(resp_small.json()["data"])
        self.assertGreaterEqual(small_rows, 6)

        with schema_context(self.schema_name):
            make_enrolled_students(15, offset=5)
        with CaptureQueriesContext(connection) as ctx_large:
            resp_large = client.get(
                f"{self.api_prefix}/reports/student-data-sheet"
            )
        self.assertEqual(resp_large.status_code, 200, resp_large.content)
        large_rows = len(resp_large.json()["data"])
        self.assertGreater(large_rows, small_rows)

        self.assertEqual(
            len(ctx_small.captured_queries), len(ctx_large.captured_queries)
        )
        self.assertLessEqual(len(ctx_small.captured_queries), 12)

    def test_returns_stable_course_filter_options(self):
        resp = self._client(self.manager).get(
            f"{self.api_prefix}/reports/student-data-sheet"
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        body = resp.json()
        self.assertIn("courses", body)
        course_ids = {c["id"] for c in body["courses"]}
        self.assertIn(self.active.id, course_ids)

        filtered = self._client(self.manager).get(
            f"{self.api_prefix}/reports/student-data-sheet?q=nonexistent-xyz-{uuid4().hex[:8]}"
        )
        self.assertEqual(filtered.status_code, 200, filtered.content)
        filtered_body = filtered.json()
        self.assertEqual(filtered_body["courses"], body["courses"])

    def test_course_id_filter(self):
        resp = self._client(self.manager).get(
            f"{self.api_prefix}/reports/student-data-sheet?course_id={self.active.id}"
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        rows = resp.json()["data"]
        self.assertTrue(all(self.active.id in [c["id"] for c in r["courses"]] for r in rows))
        self.assertTrue(any(r["code"] == self.student.code for r in rows))

    def test_search_accent_insensitive(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            accent_student = User.objects.create_user(
                email=f"sds-accent-{suffix}@example.com",
                password="x",
                name="José García",
                phone_number="0901",
                date_of_birth=date(2000, 1, 1),
                communication_email=f"sds-accent-{suffix}@example.com",
                code=f"sds-accent-{suffix}",
                roles=[User.UserRole.STUDENT],
            )
            UserCourse.objects.create(
                user=accent_student,
                course=self.active,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )

        resp = self._client(self.manager).get(
            f"{self.api_prefix}/reports/student-data-sheet?q=jose"
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        codes = [r["code"] for r in resp.json()["data"]]
        self.assertIn(accent_student.code, codes)

    def test_search_phone_digits(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            phone_student = User.objects.create_user(
                email=f"sds-phone-{suffix}@example.com",
                password="x",
                name="Phone Search",
                phone_number="+95 9 8765 4321",
                date_of_birth=date(2000, 1, 1),
                communication_email=f"sds-phone-{suffix}@example.com",
                code=f"sds-phone-{suffix}",
                roles=[User.UserRole.STUDENT],
            )
            UserCourse.objects.create(
                user=phone_student,
                course=self.active,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )

        resp = self._client(self.manager).get(
            f"{self.api_prefix}/reports/student-data-sheet?q=959876543"
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        codes = [r["code"] for r in resp.json()["data"]]
        self.assertIn(phone_student.code, codes)

    @override_settings(
        USER_SEARCH_FALLBACK_MIN_RESULTS=10,
        USER_SEARCH_TRIGRAM_THRESHOLD=0.1,
    )
    def test_search_trigram_typo_fallback(self):
        suffix = uuid4().hex[:6]
        with schema_context(self.schema_name):
            typo_student = User.objects.create_user(
                email=f"sds-typo-{suffix}@example.com",
                password="x",
                name="Jmes Thiha",
                phone_number="0902",
                date_of_birth=date(2000, 1, 1),
                communication_email=f"sds-typo-{suffix}@example.com",
                code=f"sds-typo-{suffix}",
                roles=[User.UserRole.STUDENT],
            )
            UserCourse.objects.create(
                user=typo_student,
                course=self.active,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )

        resp = self._client(self.manager).get(
            f"{self.api_prefix}/reports/student-data-sheet?q=james"
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        codes = [r["code"] for r in resp.json()["data"]]
        self.assertIn(typo_student.code, codes)
