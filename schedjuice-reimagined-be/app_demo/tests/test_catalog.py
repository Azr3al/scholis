from pathlib import Path

from django.test import SimpleTestCase

from app_demo import catalog


class CatalogPathSafetyTests(SimpleTestCase):
    def setUp(self):
        self.root = Path(__file__).resolve().parents[2] / "demo-artifacts"

    def test_safe_path_rejects_traversal(self):
        with self.assertRaises(ValueError):
            catalog.safe_artifact_path("../etc/passwd", root=self.root)

class CatalogScanTests(SimpleTestCase):
    def setUp(self):
        self.root = Path(__file__).resolve().parents[2] / "demo-artifacts"

    def test_generated_script_missing(self):
        script = catalog.read_generated_script("nonexistent-slug-xyz", root=self.root)
        self.assertEqual(script, {"available": False})

