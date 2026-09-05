from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError

from app_documents.document import (
    EMPTY_DOCUMENT,
    new_empty_document,
    next_untitled_name,
    validate_document,
)


class NextUntitledNameTests(SimpleTestCase):
    def test_untitled_then_numbered(self):
        self.assertEqual(next_untitled_name([]), "Untitled")
        self.assertEqual(next_untitled_name(["Untitled"]), "Untitled 2")


class NewEmptyDocumentTests(SimpleTestCase):
    def test_one_empty_text_block_with_unique_ids(self):
        a = new_empty_document()
        b = new_empty_document()
        self.assertEqual(len(a["blocks"]), 1)
        block = a["blocks"][0]
        self.assertEqual(block["type"], "text")
        self.assertEqual(block["text"], "")
        self.assertEqual(block["align"], "left")
        self.assertEqual(block["fontFamily"], "Noto Sans")
        self.assertEqual(block["fontSize"], 12)
        self.assertEqual(block["color"], "#111111")
        self.assertFalse(block["bold"])
        self.assertFalse(block["italic"])
        self.assertNotEqual(block["id"], b["blocks"][0]["id"])
        validate_document(a)


class ValidateDocumentTests(SimpleTestCase):
    def test_rejects_unknown_token(self):
        doc = dict(EMPTY_DOCUMENT)
        doc["blocks"] = [
            {"id": "t1", "type": "text", "text": "Hi {{not_a_key}}", "align": "left"}
        ]
        with self.assertRaises(ValidationError) as ctx:
            validate_document(doc)
        self.assertIn("blocks", ctx.exception.detail)

    def test_rejects_unknown_block_type(self):
        doc = dict(EMPTY_DOCUMENT)
        doc["blocks"] = [{"id": "x", "type": "video"}]
        with self.assertRaises(ValidationError):
            validate_document(doc)

    def test_rejects_nested_columns(self):
        doc = dict(EMPTY_DOCUMENT)
        inner = {"id": "c2", "type": "columns", "columns": [[], []]}
        doc["blocks"] = [{"id": "c1", "type": "columns", "columns": [[inner], []]}]
        with self.assertRaises(ValidationError):
            validate_document(doc)

    def test_rejects_table_inside_column(self):
        doc = dict(EMPTY_DOCUMENT)
        table = {
            "id": "g",
            "type": "grades_table",
            "columns": [{"key": "mark", "label": "Mark"}],
        }
        doc["blocks"] = [{"id": "c1", "type": "columns", "columns": [[table], []]}]
        with self.assertRaises(ValidationError):
            validate_document(doc)

    def test_save_allows_empty_image_url(self):
        doc = dict(EMPTY_DOCUMENT)
        doc["blocks"] = [
            {"id": "i", "type": "image", "url": None, "width": 40, "align": "left"}
        ]
        validate_document(doc)

    def test_publish_rejects_empty_image_url(self):
        doc = dict(EMPTY_DOCUMENT)
        doc["blocks"] = [
            {"id": "i", "type": "image", "url": None, "width": 40, "align": "left"}
        ]
        with self.assertRaises(ValidationError):
            validate_document(doc, for_publish=True)

    def test_publish_rejects_empty_grades_columns(self):
        doc = dict(EMPTY_DOCUMENT)
        doc["blocks"] = [{"id": "g", "type": "grades_table", "columns": []}]
        with self.assertRaises(ValidationError):
            validate_document(doc, for_publish=True)

    def test_rejects_output_data_url(self):
        doc = dict(EMPTY_DOCUMENT)
        doc["blocks"] = [
            {
                "id": "i",
                "type": "image",
                "url": "data:image/png;base64,xx",
                "width": 40,
                "align": "left",
            }
        ]
        with self.assertRaises(ValidationError):
            validate_document(doc)
