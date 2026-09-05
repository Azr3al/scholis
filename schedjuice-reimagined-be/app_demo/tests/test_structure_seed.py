from uuid import uuid4

from django.test import TestCase
from tenant_schemas.utils import schema_context

from app_course.models import Category
from app_demo.structure_seed import seed_structure


class StructureSeedTests(TestCase):
    def test_minimal_academic_structure_creates_categories(self):
        suffix = uuid4().hex[:8]
        schema_name = "xschedjuice"

        cat_one = f"Math-{suffix}"
        cat_two = f"English-{suffix}"
        result = seed_structure(
            schema_name=schema_name,
            academic_structure={
                "categories": [
                    {"name": cat_one, "sort_order": 1},
                    {"name": cat_two, "sort_order": 2},
                ]
            },
            terminology={},
        )

        with schema_context(schema_name):
            created_names = set(
                Category.objects.filter(name__in=[cat_one, cat_two]).values_list(
                    "name", flat=True
                )
            )

        self.assertEqual(created_names, {cat_one, cat_two})
        self.assertEqual(set(result["category_by_name"].keys()), {cat_one, cat_two})
        self.assertIsInstance(result["program_id"], int)
