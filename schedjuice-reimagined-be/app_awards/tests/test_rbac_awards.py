import unittest
from datetime import date, timedelta
from uuid import uuid4

from django.core.management import call_command
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from tenant_schemas.utils import schema_context

from app_auth.models import User
from app_awards.document import EMPTY_AWARD_DOCUMENT
from app_awards.models import AwardGrant, AwardTemplate, AwardTitle
from app_awards.services import grant_award
from app_course.models import Category, Course, Program, UserCourse
from app_rbac.cache import bump_matrix_generation
from app_rbac.models import Role, RolePermission
from app_rbac.seeding import seed_rbac


def _jwt_token_user(email: str):
    return type(
        "TokenUser",
        (),
        {"id": email, "is_authenticated": True},
    )()


def _database_reachable() -> bool:
    try:
        connection.ensure_connection()
        return True
    except Exception:
        return False


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class AwardCatalogApiTests(TestCase):
    schema_name = "xschedjuice"
    api_prefix = "/api/v1"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        today = timezone.localdate()
        with schema_context(self.schema_name):
            seed_rbac()
            self.admin = User.objects.create_user(
                email=f"aw-admin-{suffix}@example.com",
                password="x",
                name="Admin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )
            self.teacher = User.objects.create_user(
                email=f"aw-tch-{suffix}@example.com",
                password="x",
                name="Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.student = User.objects.create_user(
                email=f"aw-stu-{suffix}@example.com",
                password="x",
                name="Student",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            self.cat = Category.objects.create(name=f"Cat {suffix}")
            self.prog = Program.objects.create(
                name=f"P {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title=f"C {suffix}",
                category=self.cat,
                program=self.prog,
                start_date=today,
                end_date=today + timedelta(days=60),
            )
            UserCourse.objects.create(
                user=self.student,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            self.suffix = suffix

    def _client(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def test_teacher_cannot_create_org_title(self):
        with schema_context(self.schema_name):
            resp = self._client(self.teacher).post(
                f"{self.api_prefix}/award-titles",
                {"name": f"Top 1 {self.suffix}"},
                format="json",
            )
        self.assertEqual(resp.status_code, 403, resp.content)

    def test_admin_create_pins(self):
        with schema_context(self.schema_name):
            resp = self._client(self.admin).post(
                f"{self.api_prefix}/award-titles",
                {"name": f"Top 1 {self.suffix}"},
                format="json",
            )
        self.assertEqual(resp.status_code, 201, resp.content)
        body = resp.json()["data"]
        self.assertTrue(body["is_pinned"])
        self.assertEqual(body["origin"], AwardTitle.Origin.ADMIN)
        self.assertIsNone(body.get("course"))

    def test_admin_create_with_jwt_token_user(self):
        token_user = _jwt_token_user(self.admin.email)
        with schema_context(self.schema_name):
            resp = self._client(token_user).post(
                f"{self.api_prefix}/award-titles",
                {"name": f"Top 1 jwt {self.suffix}"},
                format="json",
            )
            self.assertEqual(resp.status_code, 201, resp.content)
            title = AwardTitle.objects.get(pk=resp.json()["data"]["id"])
            self.assertEqual(title.created_by_id, self.admin.id)

    def test_retire_leaves_grants_hides_from_active_list(self):
        with schema_context(self.schema_name):
            title = AwardTitle.objects.create(
                name=f"Top 1 {self.suffix}",
                family=AwardTitle.Family.ACADEMIC_EXCELLENCE,
                origin=AwardTitle.Origin.ADMIN,
                is_pinned=True,
            )
            grant_award(
                course=self.course,
                title=title,
                user=self.student,
                period_kind="overall",
                granted_by=self.admin,
            )
            retire = self._client(self.admin).post(
                f"{self.api_prefix}/award-titles/{title.id}/retire",
                {},
                format="json",
            )
            self.assertEqual(retire.status_code, 200, retire.content)
            listed = self._client(self.admin).get(
                f"{self.api_prefix}/award-titles?size=-1"
            )
            self.assertEqual(listed.status_code, 200, listed.content)
            ids = {row["id"] for row in listed.json()["data"]}
            self.assertNotIn(title.id, ids)
            title.refresh_from_db()
            self.assertIsNotNone(title.retired_at)
            self.assertEqual(title.grants.count(), 1)


@unittest.skipUnless(_database_reachable(), "PostgreSQL not available")
@override_settings(RBAC_ENFORCE="enforce")
class AwardBoardApiTests(TestCase):
    schema_name = "xschedjuice"
    api_prefix = "/api/v1"

    @classmethod
    def setUpTestData(cls):
        call_command("migrate_schemas", shared=True, verbosity=0)
        call_command("migrate_schemas", verbosity=0)
        call_command("load-data", schema=cls.schema_name, verbosity=0)

    def setUp(self):
        suffix = uuid4().hex[:6]
        today = timezone.localdate()
        with schema_context(self.schema_name):
            seed_rbac()
            self.admin = User.objects.create_user(
                email=f"aw-admin-{suffix}@example.com",
                password="x",
                name="Admin",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.ADMIN],
            )
            self.teacher = User.objects.create_user(
                email=f"aw-tch-{suffix}@example.com",
                password="x",
                name="Teacher",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.TEACHER],
            )
            self.student = User.objects.create_user(
                email=f"aw-stu-{suffix}@example.com",
                password="x",
                name="Student",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            self.cat = Category.objects.create(name=f"Cat {suffix}")
            self.prog = Program.objects.create(
                name=f"P {suffix}",
                course_creation_method=Program.CourseCreationMethod.MANUAL,
                subject_strategy=Program.SubjectStrategy.NONE,
            )
            self.course = Course.objects.create(
                title=f"C {suffix}",
                category=self.cat,
                program=self.prog,
                start_date=today,
                end_date=today + timedelta(days=60),
            )
            UserCourse.objects.create(
                user=self.student,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            self.top1 = AwardTitle.objects.create(
                name=f"Top 1 {suffix}",
                family=AwardTitle.Family.ACADEMIC_EXCELLENCE,
                origin=AwardTitle.Origin.ADMIN,
                is_pinned=True,
            )
            self.top2 = AwardTitle.objects.create(
                name=f"Top 2 {suffix}",
                family=AwardTitle.Family.ACADEMIC_EXCELLENCE,
                origin=AwardTitle.Origin.ADMIN,
                is_pinned=True,
            )
            self.suffix = suffix
            self.today = today

    def _client(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        client.credentials(HTTP_TENANT=self.schema_name)
        return client

    def _grant_url(self):
        return f"{self.api_prefix}/courses/{self.course.id}/award-grants"

    def _board_url(self, **params):
        qs = "&".join(f"{k}={v}" for k, v in params.items())
        return f"{self.api_prefix}/courses/{self.course.id}/awards?{qs}"

    def test_teacher_can_grant(self):
        with schema_context(self.schema_name):
            resp = self._client(self.teacher).post(
                self._grant_url(),
                {
                    "title_id": self.top1.id,
                    "user": self.student.id,
                    "period_kind": "overall",
                },
                format="json",
            )
        self.assertEqual(resp.status_code, 201, resp.content)
        self.assertTrue(resp.json()["data"]["id"])

    def test_teacher_can_grant_with_jwt_token_user(self):
        token_user = _jwt_token_user(self.teacher.email)
        with schema_context(self.schema_name):
            resp = self._client(token_user).post(
                self._grant_url(),
                {
                    "title_id": self.top1.id,
                    "user": self.student.id,
                    "period_kind": "overall",
                },
                format="json",
            )
            self.assertEqual(resp.status_code, 201, resp.content)
            grant = AwardGrant.objects.get(pk=resp.json()["data"]["id"])
            self.assertEqual(grant.granted_by_id, self.teacher.id)

    def test_student_forbidden_on_board_and_grant(self):
        with schema_context(self.schema_name):
            client = self._client(self.student)
            board = client.get(self._board_url(period_kind="overall"))
            grant = client.post(
                self._grant_url(),
                {
                    "title_id": self.top1.id,
                    "user": self.student.id,
                    "period_kind": "overall",
                },
                format="json",
            )
        self.assertEqual(board.status_code, 403, board.content)
        self.assertEqual(grant.status_code, 403, grant.content)

    def test_teacher_without_grade_perms_forbidden(self):
        with schema_context(self.schema_name):
            teacher_role = Role.objects.filter(slug="teacher", is_system=True).first()
            RolePermission.objects.filter(
                role=teacher_role,
                permission_code__in=["assignment.grade", "grade.manage"],
            ).delete()
            bump_matrix_generation(self.schema_name)
            resp = self._client(self.teacher).post(
                self._grant_url(),
                {
                    "title_id": self.top1.id,
                    "user": self.student.id,
                    "period_kind": "overall",
                },
                format="json",
            )
        self.assertEqual(resp.status_code, 403, resp.content)

    def test_family_clash_includes_family_in_details(self):
        with schema_context(self.schema_name):
            client = self._client(self.teacher)
            first = client.post(
                self._grant_url(),
                {
                    "title_id": self.top1.id,
                    "user": self.student.id,
                    "period_kind": "overall",
                },
                format="json",
            )
            self.assertEqual(first.status_code, 201, first.content)
            clash = client.post(
                self._grant_url(),
                {
                    "title_id": self.top2.id,
                    "user": self.student.id,
                    "period_kind": "overall",
                },
                format="json",
            )
        self.assertEqual(clash.status_code, 400, clash.content)
        self.assertIn("family", clash.json().get("details", {}))

    def test_retired_title_cannot_be_granted(self):
        with schema_context(self.schema_name):
            self.top1.retired_at = timezone.now()
            self.top1.save(update_fields=["retired_at"])
            resp = self._client(self.teacher).post(
                self._grant_url(),
                {
                    "title_id": self.top1.id,
                    "user": self.student.id,
                    "period_kind": "overall",
                },
                format="json",
            )
        self.assertEqual(resp.status_code, 400, resp.content)

    def test_month_and_overall_grants_both_allowed(self):
        with schema_context(self.schema_name):
            client = self._client(self.teacher)
            month = client.post(
                self._grant_url(),
                {
                    "title_id": self.top1.id,
                    "user": self.student.id,
                    "period_kind": "month",
                    "year": self.today.year,
                    "month": self.today.month,
                },
                format="json",
            )
            overall = client.post(
                self._grant_url(),
                {
                    "title_id": self.top1.id,
                    "user": self.student.id,
                    "period_kind": "overall",
                },
                format="json",
            )
        self.assertEqual(month.status_code, 201, month.content)
        self.assertEqual(overall.status_code, 201, overall.content)

    def test_board_includes_student_chip(self):
        with schema_context(self.schema_name):
            grant_award(
                course=self.course,
                title=self.top1,
                user=self.student,
                period_kind="overall",
                granted_by=self.teacher,
            )
            resp = self._client(self.teacher).get(
                self._board_url(period_kind="overall")
            )
        self.assertEqual(resp.status_code, 200, resp.content)
        students = resp.json()["data"]["students"]
        row = next(s for s in students if s["id"] == self.student.id)
        self.assertEqual(row["name"], "Student")
        self.assertEqual(row["grants"][0]["title"]["id"], self.top1.id)

    def test_top10_excludes_pinned(self):
        with schema_context(self.schema_name):
            popular = AwardTitle.objects.create(
                name=f"Popular {self.suffix}",
                origin=AwardTitle.Origin.PROMOTED,
                is_pinned=False,
            )
            AwardGrant.objects.create(
                course=self.course,
                title=popular,
                user=self.student,
                period_kind=AwardGrant.PeriodKind.OVERALL,
                granted_by=self.teacher,
            )
            resp = self._client(self.teacher).get(
                self._board_url(period_kind="overall")
            )
        self.assertEqual(resp.status_code, 200, resp.content)
        picker = resp.json()["data"]["picker"]
        pinned_ids = {row["id"] for row in picker["pinned"]}
        top10_ids = {row["id"] for row in picker["top10"]}
        self.assertIn(self.top1.id, pinned_ids)
        self.assertNotIn(self.top1.id, top10_ids)
        self.assertIn(popular.id, top10_ids)
        self.assertNotIn(popular.id, pinned_ids)

    def test_teacher_can_promote_local(self):
        with schema_context(self.schema_name):
            local = AwardTitle.objects.create(
                name=f"Star {self.suffix}",
                origin=AwardTitle.Origin.LOCAL,
                course=self.course,
            )
            grant_award(
                course=self.course,
                title=local,
                user=self.student,
                period_kind="overall",
                granted_by=self.teacher,
            )
            resp = self._client(self.teacher).post(
                f"{self.api_prefix}/courses/{self.course.id}/award-titles/{local.id}/promote",
                {},
                format="json",
            )
        self.assertEqual(resp.status_code, 201, resp.content)
        body = resp.json()["data"]
        self.assertFalse(body["is_pinned"])
        self.assertEqual(body["origin"], AwardTitle.Origin.PROMOTED)
        self.assertIsNone(body.get("course"))

    def _display_url(self, title_id):
        return (
            f"{self.api_prefix}/courses/{self.course.id}"
            f"/award-titles/{title_id}/display-template"
        )

    def test_board_grant_includes_oldest_display_template(self):
        with schema_context(self.schema_name):
            AwardTemplate.objects.create(
                title=self.top1, name="B", document=dict(EMPTY_AWARD_DOCUMENT)
            )
            older = AwardTemplate.objects.create(
                title=self.top1, name="A", document=dict(EMPTY_AWARD_DOCUMENT)
            )
            AwardTemplate.objects.filter(pk=older.pk).update(
                created_at=timezone.now() - timedelta(days=1)
            )
            grant_award(
                course=self.course,
                title=self.top1,
                user=self.student,
                period_kind="overall",
                granted_by=self.teacher,
            )
            resp = self._client(self.teacher).get(
                self._board_url(period_kind="overall")
            )
        self.assertEqual(resp.status_code, 200, resp.content)
        row = next(
            s for s in resp.json()["data"]["students"] if s["id"] == self.student.id
        )
        tmpl = row["grants"][0]["title"]["display_template"]
        self.assertEqual(tmpl["id"], older.id)
        self.assertTrue(
            any(
                t["id"] == self.top1.id and t["has_display_template"]
                for t in resp.json()["data"]["picker"]["pinned"]
            )
        )

    def test_teacher_display_template_ok_catalog_templates_forbidden(self):
        with schema_context(self.schema_name):
            AwardTemplate.objects.create(
                title=self.top1, name="A", document=dict(EMPTY_AWARD_DOCUMENT)
            )
            client = self._client(self.teacher)
            ok = client.get(self._display_url(self.top1.id))
            denied = client.get(
                f"{self.api_prefix}/award-titles/{self.top1.id}/templates"
            )
        self.assertEqual(ok.status_code, 200, ok.content)
        self.assertEqual(ok.json()["data"]["name"], "A")
        self.assertEqual(denied.status_code, 403, denied.content)

    def test_student_forbidden_on_display_template(self):
        with schema_context(self.schema_name):
            resp = self._client(self.student).get(self._display_url(self.top1.id))
        self.assertEqual(resp.status_code, 403, resp.content)

    def test_display_template_404_for_other_course_local(self):
        with schema_context(self.schema_name):
            other = Course.objects.create(
                title=f"Other {self.suffix}",
                category=self.cat,
                program=self.prog,
                start_date=self.today,
                end_date=self.today + timedelta(days=10),
            )
            local = AwardTitle.objects.create(
                name=f"Local {self.suffix}",
                origin=AwardTitle.Origin.LOCAL,
                course=other,
            )
            resp = self._client(self.teacher).get(self._display_url(local.id))
        self.assertEqual(resp.status_code, 404, resp.content)

    def _batch_url(self):
        return f"{self.api_prefix}/courses/{self.course.id}/award-grants/batch"

    def test_teacher_batch_two_students(self):
        with schema_context(self.schema_name):
            other = User.objects.create_user(
                email=f"aw-stu2-{self.suffix}@example.com",
                password="x",
                name="Student2",
                phone_number="-",
                date_of_birth=date(1990, 1, 1),
                roles=[User.UserRole.STUDENT],
            )
            UserCourse.objects.create(
                user=other,
                course=self.course,
                assigned_as=UserCourse.AssignedAs.STUDENT,
            )
            resp = self._client(self.teacher).post(
                self._batch_url(),
                {
                    "title_id": self.top1.id,
                    "user_ids": [self.student.id, other.id],
                    "period_kind": "overall",
                },
                format="json",
            )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(len(resp.json()["data"]["granted"]), 2)

    def test_student_forbidden_on_batch(self):
        with schema_context(self.schema_name):
            resp = self._client(self.student).post(
                self._batch_url(),
                {
                    "title_id": self.top1.id,
                    "user_ids": [self.student.id],
                    "period_kind": "overall",
                },
                format="json",
            )
        self.assertEqual(resp.status_code, 403, resp.content)

    def test_batch_empty_user_ids_400(self):
        with schema_context(self.schema_name):
            resp = self._client(self.teacher).post(
                self._batch_url(),
                {"title_id": self.top1.id, "user_ids": [], "period_kind": "overall"},
                format="json",
            )
        self.assertEqual(resp.status_code, 400, resp.content)
        self.assertIn("user_ids", resp.json().get("details", {}))

    def test_batch_unresolvable_title_400(self):
        with schema_context(self.schema_name):
            resp = self._client(self.teacher).post(
                self._batch_url(),
                {
                    "title_id": 99999999,
                    "user_ids": [self.student.id],
                    "period_kind": "overall",
                },
                format="json",
            )
        self.assertEqual(resp.status_code, 400, resp.content)

    def test_no_grade_forbidden_on_batch(self):
        with schema_context(self.schema_name):
            teacher_role = Role.objects.filter(slug="teacher", is_system=True).first()
            RolePermission.objects.filter(
                role=teacher_role,
                permission_code__in=["assignment.grade", "grade.manage"],
            ).delete()
            bump_matrix_generation(self.schema_name)
            resp = self._client(self.teacher).post(
                self._batch_url(),
                {
                    "title_id": self.top1.id,
                    "user_ids": [self.student.id],
                    "period_kind": "overall",
                },
                format="json",
            )
        self.assertEqual(resp.status_code, 403, resp.content)
