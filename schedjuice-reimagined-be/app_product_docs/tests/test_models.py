from django.db import IntegrityError
from django.test import TestCase
from tenant_schemas.utils import get_public_schema_name, schema_context

from app_product_docs.models import DocArticle, DocAudience, DocCategory, DocStatus


class DocArticleModelTests(TestCase):
    def test_slug_unique_in_public_schema(self):
        with schema_context(get_public_schema_name()):
            cat = DocCategory.objects.create(slug="getting-started", title="Getting started")
            DocArticle.objects.create(
                slug="welcome",
                title="Welcome",
                category=cat,
                audiences=[DocAudience.ALL],
                status=DocStatus.PUBLISHED,
            )
            with self.assertRaises(IntegrityError):
                DocArticle.objects.create(
                    slug="welcome",
                    title="Duplicate",
                    category=cat,
                    audiences=[DocAudience.ADMIN],
                )
