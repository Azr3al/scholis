from datetime import date
from types import SimpleNamespace

from django.db.utils import ProgrammingError
from django.test import TestCase
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_auth.models import User
from app_product_docs.models import DocArticle, DocAudience, DocCategory, DocStatus
from app_product_docs.services import audiences_for_user, filter_articles_for_reader


class AudienceFilterTests(TestCase):
    admin_schema = "xschedjuice"

    @classmethod
    def setUpTestData(cls):
        with schema_context(get_public_schema_name()):
            cls.category = DocCategory.objects.create(slug="finance", title="Finance")
            cls.admin_article = DocArticle.objects.create(
                slug="admin-only",
                title="Admin only",
                category=cls.category,
                audiences=[DocAudience.ADMIN],
                status=DocStatus.PUBLISHED,
            )
            cls.all_article = DocArticle.objects.create(
                slug="everyone",
                title="Everyone",
                category=cls.category,
                audiences=[DocAudience.ALL],
                status=DocStatus.PUBLISHED,
            )
            DocArticle.objects.create(
                slug="draft",
                title="Draft",
                category=cls.category,
                audiences=[DocAudience.ALL],
                status=DocStatus.DRAFT,
            )

    def _student(self):
        with schema_context(self.admin_schema):
            return User.objects.create_user(
                email=f"stu-{date.today().isoformat()}@test.com",
                password="x",
                name="Student",
                phone_number="-",
                date_of_birth=date(2000, 1, 1),
                roles=[User.UserRole.STUDENT],
            )

    def test_filter_accepts_precomputed_audiences(self):
        student = self._student()
        with schema_context(self.admin_schema):
            audiences = audiences_for_user(student)
        with schema_context(get_public_schema_name()):
            qs = filter_articles_for_reader(DocArticle.objects.all(), audiences)
            slugs = set(qs.values_list("slug", flat=True))
        self.assertEqual(slugs, {"everyone"})

    def test_jwt_user_audiences_resolved_in_tenant_schema(self):
        student = self._student()
        jwt_user = SimpleNamespace(is_authenticated=True, id=student.email)
        with schema_context(self.admin_schema):
            audiences = audiences_for_user(jwt_user)
        self.assertIn(DocAudience.STUDENT, audiences)
        with schema_context(get_public_schema_name()):
            qs = filter_articles_for_reader(DocArticle.objects.all(), audiences)
            slugs = set(qs.values_list("slug", flat=True))
        self.assertEqual(slugs, {"everyone"})

    def test_jwt_user_audiences_lookup_fails_in_public_schema(self):
        """Role lookup in public schema errors — views must resolve audiences in tenant schema first."""
        student = self._student()
        jwt_user = SimpleNamespace(is_authenticated=True, id=student.email)
        with schema_context(get_public_schema_name()):
            with self.assertRaises(ProgrammingError):
                audiences_for_user(jwt_user)
